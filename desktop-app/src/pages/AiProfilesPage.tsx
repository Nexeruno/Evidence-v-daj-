import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import type { AiProfile } from '@/types/aiProfile'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTs(ts: any): string {
  if (!ts) return '—'
  try {
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString()
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString()
    if (ts._seconds) return new Date(ts._seconds * 1000).toLocaleString()
    const d = new Date(ts)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString()
  } catch { return '—' }
}

function fmtCurrency(n: number): string {
  return isNaN(n) ? '—' : `${Math.round(n).toLocaleString()} Kč`
}

function fmtPct(n: number): string {
  return isNaN(n) ? '—' : `${(n * 100).toFixed(1)}%`
}

function fmtFactor(n: number): string {
  return isNaN(n) ? '—' : `${n.toFixed(2)}x`
}

function ConfidenceBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
    : score >= 50 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
    : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
  const label = score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Low'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {label} ({score}%)
    </span>
  )
}

function StaleBadge({ profileStale, hasProfile }: { profileStale?: boolean; hasProfile: boolean }) {
  if (!hasProfile) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
        Missing
      </span>
    )
  }
  if (profileStale) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
        🟡 Stale
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
      ✓ Fresh
    </span>
  )
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-light-bg dark:bg-dark-bg rounded p-3">
      <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-light-text dark:text-dark-text">{value}</p>
    </div>
  )
}

// ─── Interface for user list entry ───────────────────────────────────────────

interface UserEntry {
  uid: string
  email?: string
  displayName?: string
  role?: string
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AiProfilesPage() {
  const { user, getIdToken } = useAuth()
  const { role: userRole } = useUserRole(user)

  const [users, setUsers] = useState<UserEntry[]>([])
  const [profiles, setProfiles] = useState<Record<string, AiProfile>>({})
  const [selectedProfile, setSelectedProfile] = useState<{ user: UserEntry; profile: AiProfile } | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generatingUser, setGeneratingUser] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [rawFeaturesOpen, setRawFeaturesOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const isAdmin = userRole === 'admin' || userRole === 'ml_admin'

  // ── Load users via adminGetAuditTrail-style: use callCloudFunction ──────────
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      // Use existing adminGetPredictionSettings to verify connection, then
      // load users list from Cloud Function
      const result = await window.ipcApi.callCloudFunction('adminGetAllUsers', token, { limit: 100 })

      if (result?.ok && result.users) {
        setUsers(result.users as UserEntry[])
        // Load existing profiles for each user
        loadProfilesForUsers(result.users as UserEntry[], token)
      } else {
        // Fallback: use a direct Firestore read via health check path
        setUsers([])
        setStatusMsg({ text: 'Could not load users: ' + (result?.error || 'Unknown error'), ok: false })
      }
    } catch (err) {
      setStatusMsg({ text: `Failed to load users: ${err instanceof Error ? err.message : String(err)}`, ok: false })
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [getIdToken])

  const loadProfilesForUsers = async (userList: UserEntry[], token: string) => {
    if (!window.ipcApi) return
    const loaded: Record<string, AiProfile> = {}
    // Load profiles in parallel batches
    await Promise.allSettled(userList.map(async (u) => {
      try {
        const result = await window.ipcApi!.callCloudFunction('adminGetAiProfile', token, { userId: u.uid })
        console.log(`[AI_PROFILES] adminGetAiProfile for ${u.uid}:`, result?.profile?.profileStale, result?.profile?.staleReason)
        if (result?.ok && result.profile) {
          loaded[u.uid] = result.profile as AiProfile
        }
      } catch (err) {
        console.error(`[AI_PROFILES] Failed to load profile for ${u.uid}:`, err)
      }
    }))
    console.log('[AI_PROFILES] Loaded profiles:', Object.keys(loaded).length, 'with stale counts:', {
      fresh: Object.values(loaded).filter(p => p.profileStale === false).length,
      stale: Object.values(loaded).filter(p => p.profileStale === true).length,
    })
    setProfiles(loaded)
  }

  useEffect(() => {
    if (isAdmin) loadUsers()
  }, [isAdmin, loadUsers])

  // ── Generate single profile ───────────────────────────────────────────────
  const handleGenerateProfile = async (u: UserEntry) => {
    setGeneratingUser(u.uid)
    setStatusMsg(null)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const result = await window.ipcApi.generateAiProfile(token, u.uid)
      console.log(`[AI_PROFILES] generateAiProfile for ${u.uid}:`, result?.profile?.profileStale, result?.profile?.staleReason)
      if (result?.ok && result.profile) {
        setProfiles((prev) => ({ ...prev, [u.uid]: result.profile as AiProfile }))
        setStatusMsg({ text: `✅ Profile generated for ${u.email || u.uid}`, ok: true })
      } else {
        throw new Error(result?.error || 'Generate failed')
      }
    } catch (err) {
      setStatusMsg({ text: `❌ ${err instanceof Error ? err.message : String(err)}`, ok: false })
    } finally {
      setGeneratingUser(null)
    }
  }

  // ── Generate all profiles ─────────────────────────────────────────────────
  const handleGenerateAll = async () => {
    setGeneratingAll(true)
    setStatusMsg(null)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const result = await window.ipcApi.generateAllAiProfiles(token)
      if (result?.ok) {
        setStatusMsg({ text: `✅ Generated ${result.generated} profiles (${result.failed} failed). Refreshing...`, ok: true })
        // Reload profiles after generation
        const token2 = await getIdToken()
        await loadProfilesForUsers(users, token2)
      } else {
        throw new Error(result?.error || 'Generate all failed')
      }
    } catch (err) {
      setStatusMsg({ text: `❌ ${err instanceof Error ? err.message : String(err)}`, ok: false })
    } finally {
      setGeneratingAll(false)
    }
  }

  // ── Filtered users ────────────────────────────────────────────────────────
  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      u.uid.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
    )
  })

  // ─── Access guard ─────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-xl font-bold text-red-600 dark:text-red-400">Access Denied</p>
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-2">
            AI Profiles is only available to admin / ml_admin.
          </p>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* A. Header */}
      <div>
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">AI Profiles</h1>
        <div className="mt-2 space-y-1">
          <p className="text-xs text-blue-600 dark:text-blue-400">
            🧠 Per-user AI profile / feature layer — prepares data for future personalized ML.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Current L2 prediction engine is still simplified baseline. Profiles do not yet affect live predictions.
          </p>
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          statusMsg.ok
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* B. Toolbar */}
      <div className="card rounded-lg p-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleGenerateAll}
          disabled={generatingAll || loadingUsers || users.length === 0}
          className="px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {generatingAll ? '⏳ Generating all...' : '🔄 Generate All Profiles'}
        </button>
        <button
          onClick={loadUsers}
          disabled={loadingUsers}
          className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm hover:bg-slate-300 disabled:opacity-50"
        >
          {loadingUsers ? '⏳ Loading...' : '↺ Refresh'}
        </button>
        <input
          type="text"
          placeholder="Search by name, email, UID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text ml-auto w-64"
        />
        <span className="text-xs text-light-textMuted dark:text-dark-textMuted">
          {users.length} users · {Object.keys(profiles).length} profiles
        </span>
      </div>

      {/* C. Debug Info */}
      {(() => {
        const sampleProfile = Object.values(profiles)[0]
        return (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-xs text-slate-700 dark:text-slate-300 font-mono overflow-auto max-h-32">
            <p>Loaded profiles: {Object.keys(profiles).length} / {users.length}</p>
            {sampleProfile && (
              <>
                <p>Sample profile.profileStale: {String(sampleProfile.profileStale)}</p>
                <p>Sample profile.staleReason: {JSON.stringify(sampleProfile.staleReason)}</p>
              </>
            )}
            {!sampleProfile && <p>No profiles loaded yet. Check Cloud Function.</p>}
          </div>
        )
      })()}

      {/* D. Status Summary */}
      {(() => {
        const fresh = Object.values(profiles).filter(p => p && p.profileStale === false).length
        const stale = Object.values(profiles).filter(p => p && p.profileStale === true).length
        const missing = users.length - Object.keys(profiles).length

        return (
          <div className="grid grid-cols-3 gap-4">
            <div className="card rounded-lg p-4 border-l-4 border-green-500">
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase font-semibold">Fresh Profiles</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">✓ {fresh}</p>
            </div>
            <div className="card rounded-lg p-4 border-l-4 border-amber-500">
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase font-semibold">Stale Profiles</p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">🟡 {stale}</p>
            </div>
            <div className="card rounded-lg p-4 border-l-4 border-gray-500">
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase font-semibold">Missing Profiles</p>
              <p className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-1">⚪ {missing}</p>
            </div>
          </div>
        )
      })()}

      {/* D. Profiles list */}
      <div className="card rounded-lg p-6">
        {loadingUsers ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted text-center py-8">Loading users...</p>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-light-textMuted dark:text-dark-textMuted">
              {users.length === 0 ? 'No users found. Make sure adminGetAllUsers Cloud Function is deployed.' : 'No users match your search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const profile = profiles[u.uid]
              const hasProfile = !!profile
              const isGenerating = generatingUser === u.uid
              return (
                <div
                  key={u.uid}
                  className="flex items-start gap-4 p-4 bg-light-border dark:bg-dark-border/40 rounded-lg border border-light-border dark:border-dark-border"
                >
                  {/* Left: user + profile info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-base text-light-text dark:text-dark-text">
                        {u.displayName || u.email || u.uid}
                      </p>
                      {hasProfile ? (
                        <>
                          <ConfidenceBadge score={profile.confidenceScore} />
                          <StaleBadge profileStale={profile.profileStale} hasProfile={true} />
                        </>
                      ) : (
                        <StaleBadge profileStale={false} hasProfile={false} />
                      )}
                    </div>
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted font-mono">{u.uid}</p>
                    {u.email && u.displayName && (
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted">{u.email}</p>
                    )}
                    {hasProfile && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-light-textMuted dark:text-dark-textMuted">
                        <span>Avg expense: <strong className="text-light-text dark:text-dark-text">{fmtCurrency(profile.avgMonthlyExpense)}/m</strong></span>
                        <span>Avg income: <strong className="text-light-text dark:text-dark-text">{fmtCurrency(profile.avgMonthlyIncome)}/m</strong></span>
                        <span>Coverage: <strong className="text-light-text dark:text-dark-text">{profile.dataCoverageMonths}m</strong></span>
                        <span>Generated: <strong className="text-light-text dark:text-dark-text">{formatTs(profile.generatedAt)}</strong></span>
                      </div>
                    )}
                    {hasProfile && profile.topExpenseCategories?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {profile.topExpenseCategories.map((cat) => (
                          <span key={cat} className="px-2 py-0.5 rounded-full text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                    {hasProfile && profile.humanReadableExplanation && (
                      <p className="text-xs italic text-light-textMuted dark:text-dark-textMuted truncate max-w-xl">
                        "{profile.humanReadableExplanation}"
                      </p>
                    )}
                    {!hasProfile && (
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted italic">No AI profile generated yet.</p>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {hasProfile && (
                      <button
                        onClick={() => setSelectedProfile({ user: u, profile })}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-600 dark:bg-green-700 text-white hover:bg-green-700"
                      >
                        View Detail
                      </button>
                    )}
                    <button
                      onClick={() => handleGenerateProfile(u)}
                      disabled={isGenerating || generatingAll}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isGenerating ? '⏳' : hasProfile ? '↺ Regenerate' : '⚙️ Generate'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* D. Detail Modal */}
      {selectedProfile && (() => {
        const { user: u, profile: p } = selectedProfile
        return (
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-light-card dark:bg-dark-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-light-border dark:border-dark-border">
              {/* Header */}
              <div className="sticky top-0 bg-light-border dark:bg-dark-border px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-light-text dark:text-dark-text">
                    AI Profile: {u.displayName || u.email || u.uid}
                  </h3>
                  <p className="text-xs font-mono text-light-textMuted dark:text-dark-textMuted">{u.uid}</p>
                </div>
                <button onClick={() => { setSelectedProfile(null); setRawFeaturesOpen(false) }}
                  className="text-2xl text-light-textMuted hover:text-light-text dark:hover:text-dark-text">✕</button>
              </div>

              <div className="p-6 space-y-6">

                {/* Explanation */}
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-300 italic">"{p.humanReadableExplanation || '—'}"</p>
                </div>

                {/* Profile Status (Fresh/Stale) */}
                {(() => {
                  const isStale = p.profileStale;
                  const staleReasons = p.staleReason || [];
                  const bgClass = isStale
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                    : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800';
                  const textClass = isStale
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-green-700 dark:text-green-300';
                  const badgeClass = isStale
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';

                  return (
                    <div className={`border rounded-lg p-4 ${bgClass}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
                          {isStale ? '🟡 Stale' : '✓ Fresh'}
                        </span>
                        <p className={`text-sm font-semibold ${textClass}`}>
                          {isStale ? 'Profile needs regeneration' : 'Profile is up-to-date'}
                        </p>
                      </div>
                      {isStale && staleReasons.length > 0 && (
                        <div className={`text-xs ${textClass} space-y-1 mt-2`}>
                          <p className="font-semibold">Why this profile is stale:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {staleReasons.map((reason) => (
                              <li key={reason}>
                                {reason === 'new_transactions_since_profile_generation' && 'New transactions added since profile was generated'}
                                {reason === 'new_feedback_since_profile_generation' && 'New feedback submitted since profile was generated'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {p.lastTransactionAt && (
                        <p className={`text-xs ${textClass} mt-2`}>
                          Last transaction: <strong>{formatTs(p.lastTransactionAt)}</strong>
                        </p>
                      )}
                      {p.lastFeedbackAt && (
                        <p className={`text-xs ${textClass}`}>
                          Last feedback: <strong>{formatTs(p.lastFeedbackAt)}</strong>
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Profile metadata */}
                <div>
                  <h4 className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Profile Metadata</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCell label="Confidence" value={<ConfidenceBadge score={p.confidenceScore} /> as any} />
                    <StatCell label="Version" value={p.profileVersion} />
                    <StatCell label="Coverage" value={`${p.dataCoverageMonths} months`} />
                    <StatCell label="Generated" value={formatTs(p.generatedAt)} />
                    <StatCell label="Transactions" value={p.transactionCount} />
                    <StatCell label="Expense records" value={p.expenseCount} />
                    <StatCell label="Income records" value={p.incomeCount} />
                    <StatCell label="Feedback count" value={p.feedbackCount ?? p.features?.feedbackCount ?? '—'} />
                  </div>
                </div>

                {/* Monthly summary */}
                <div>
                  <h4 className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Monthly Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCell label="Avg expense 3m" value={fmtCurrency(p.features?.avgExpense3m ?? 0)} />
                    <StatCell label="Avg expense 6m" value={fmtCurrency(p.features?.avgExpense6m ?? 0)} />
                    <StatCell label="Avg expense 12m" value={fmtCurrency(p.avgMonthlyExpense)} />
                    <StatCell label="Avg income 3m" value={fmtCurrency(p.features?.avgIncome3m ?? 0)} />
                    <StatCell label="Avg income 6m" value={fmtCurrency(p.features?.avgIncome6m ?? 0)} />
                    <StatCell label="Avg income 12m" value={fmtCurrency(p.avgMonthlyIncome)} />
                    <StatCell label="Median expense" value={fmtCurrency(p.medianMonthlyExpense)} />
                    <StatCell label="Median income" value={fmtCurrency(p.medianMonthlyIncome)} />
                  </div>
                </div>

                {/* Category analysis */}
                <div>
                  <h4 className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Category Analysis</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted mb-1">Top Expense Categories</p>
                      <div className="flex flex-wrap gap-2">
                        {(p.topExpenseCategories || []).map((cat) => (
                          <span key={cat} className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    {p.features?.categoryTotals12m && Object.keys(p.features.categoryTotals12m).length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs mt-2">
                          <thead className="bg-light-border dark:bg-dark-border">
                            <tr>
                              <th className="px-3 py-2 text-left">Category</th>
                              <th className="px-3 py-2 text-right">Total 12m</th>
                              <th className="px-3 py-2 text-right">Avg/month</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(p.features.categoryTotals12m)
                              .sort((a, b) => b[1] - a[1])
                              .map(([cat, total]) => (
                                <tr key={cat} className="border-b border-light-border dark:border-dark-border">
                                  <td className="px-3 py-2 text-light-text dark:text-dark-text">{cat}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-light-text dark:text-dark-text">{fmtCurrency(total)}</td>
                                  <td className="px-3 py-2 text-right text-light-textMuted dark:text-dark-textMuted">
                                    {fmtCurrency(p.features.categoryAverages12m?.[cat] ?? total / 12)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Behavior signals */}
                <div>
                  <h4 className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Behavior & Pattern Signals</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCell label="Expense trend MoM" value={fmtPct(p.features?.monthOverMonthExpenseTrend ?? 0)} />
                    <StatCell label="Income trend MoM" value={fmtPct(p.features?.monthOverMonthIncomeTrend ?? 0)} />
                    <StatCell label="Expense volatility" value={fmtPct(p.expenseVolatility)} />
                    <StatCell label="Income regularity" value={fmtPct(p.incomeRegularity)} />
                    <StatCell label="Savings trend" value={fmtPct(p.savingsTrend)} />
                    <StatCell label="Dominant pattern" value={p.dominantSpendingPattern || '—'} />
                    <StatCell label="Seasonality" value={p.seasonalitySignals || '—'} />
                  </div>
                </div>

                {/* Feedback calibration */}
                <div>
                  <h4 className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Feedback Calibration</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCell label="Adjusted bias" value={fmtPct(p.feedbackAdjustedBias)} />
                    <StatCell label="Manual factor" value={fmtFactor(p.features?.avgManualCorrectionFactor ?? 1)} />
                    <StatCell label="Auto factor" value={fmtFactor(p.features?.avgAutoCorrectionFactor ?? 1)} />
                    <StatCell label="Final factor" value={fmtFactor(p.features?.avgFinalCorrectionFactor ?? 1)} />
                  </div>
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-2">
                    Final factor = weighted average: 2× manual + 1× auto. A factor of 1.05x means the model has been adjusted to predict 5% higher than the baseline.
                  </p>
                </div>

                {/* Raw features */}
                <div>
                  <button
                    onClick={() => setRawFeaturesOpen((o) => !o)}
                    className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {rawFeaturesOpen ? '▼' : '▶'} Raw Feature Values
                  </button>
                  {rawFeaturesOpen && (
                    <pre className="mt-2 text-xs bg-slate-900 dark:bg-slate-950 text-slate-100 p-4 rounded-lg overflow-auto max-h-64">
                      {JSON.stringify(p.features ?? {}, null, 2)}
                    </pre>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-light-border dark:bg-dark-border px-6 py-3 flex gap-2">
                <button
                  onClick={() => handleGenerateProfile(u)}
                  disabled={generatingUser === u.uid}
                  className="px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {generatingUser === u.uid ? '⏳ Regenerating...' : '↺ Regenerate Profile'}
                </button>
                <button
                  onClick={() => { setSelectedProfile(null); setRawFeaturesOpen(false) }}
                  className="flex-1 px-4 py-2 rounded-lg bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text font-semibold text-sm hover:bg-light-border dark:hover:bg-dark-border"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Info card */}
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">About AI Profiles</p>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>Per-user feature layer: 18 features extracted from transactions + feedback history</li>
          <li>Stored at <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">users/{'{uid}'}/aiProfile/summary</code></li>
          <li>Confidence score reflects data quality and feedback volume (60 base + 10 per feedback record)</li>
          <li>Correction factors show how manual/auto feedback has adjusted L2 baseline</li>
          <li><strong>Not yet used in live L2 predictions</strong> — L2 still uses simplified baseline</li>
          <li>Will power real personalized ML model when Python pipeline is integrated</li>
        </ul>
      </div>
    </div>
  )
}
