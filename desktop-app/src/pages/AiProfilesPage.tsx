import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { useAiProfiles } from '@/hooks/useAiProfiles'
import type { AiProfile } from '@/types/aiProfile'

export function AiProfilesPage() {
  const { user } = useAuth()
  const { role: userRole } = useUserRole(user)
  const { generateProfile, generateAllProfiles, loading } = useAiProfiles()

  const [users, setUsers] = useState<{ uid: string; displayName: string; email: string }[]>([])
  const [profiles, setProfiles] = useState<Record<string, AiProfile>>({})
  const [selectedProfile, setSelectedProfile] = useState<AiProfile | null>(null)
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [generatingUser, setGeneratingUser] = useState<string | null>(null)

  const isAdmin = userRole && ['admin', 'ml_admin'].includes(userRole)

  // Load users (placeholder - would fetch from Cloud Function or Firestore)
  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    // Placeholder - in production would call Cloud Function to get users
    setUsers([
      { uid: 'user1', displayName: 'John Doe', email: 'john@example.com' },
      { uid: 'user2', displayName: 'Jane Smith', email: 'jane@example.com' },
    ])
  }

  const handleGenerateProfile = async (userId: string) => {
    setGeneratingUser(userId)
    try {
      const profile = await generateProfile(userId)
      setProfiles((prev) => ({ ...prev, [userId]: profile }))
      setStatusMessage(`✅ Profile generated for user ${userId}`)
    } catch (err) {
      setStatusMessage(`❌ Failed to generate profile: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setGeneratingUser(null)
    }
  }

  const handleGenerateAll = async () => {
    setLoadingProfiles(true)
    try {
      const result = await generateAllProfiles()
      setStatusMessage(`✅ Generated ${result.generated} profiles (${result.failed} failed)`)
    } catch (err) {
      setStatusMessage(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoadingProfiles(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="text-light-textMuted mt-2">Only admin/ml_admin can view AI Profiles.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Personal AI Profiles</h1>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
          🧠 Per-user feature layers for future ML personalization. Current L2 predictions use simplified baseline.
        </p>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-lg text-sm ${
          statusMessage.startsWith('✅')
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMessage}
        </div>
      )}

      {/* Actions */}
      <div className="card rounded-lg p-6 space-y-3">
        <div>
          <p className="text-sm font-semibold text-light-text dark:text-dark-text mb-3">Batch Operations</p>
          <button
            onClick={handleGenerateAll}
            disabled={loadingProfiles}
            className="px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 disabled:opacity-50 font-semibold text-sm"
          >
            {loadingProfiles ? '⏳ Generating all profiles...' : '🔄 Generate All AI Profiles'}
          </button>
        </div>
        <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
          Generates AI profiles for all users. Extracts features from transactions, calculates statistics, and stores summaries.
        </p>
      </div>

      {/* Users & Profiles */}
      <div className="card rounded-lg p-6">
        <h2 className="text-xl font-semibold text-light-text dark:text-dark-text mb-4">Users & Profiles</h2>
        <div className="space-y-2">
          {users.length === 0 ? (
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">No users loaded.</p>
          ) : (
            users.map((u) => (
              <div
                key={u.uid}
                className="flex items-center justify-between p-3 bg-light-border dark:bg-dark-border/40 rounded-lg border border-light-border dark:border-dark-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-light-text dark:text-dark-text">{u.displayName}</p>
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted">{u.email}</p>
                  {profiles[u.uid] && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      ✓ Profile: {profiles[u.uid]?.confidenceScore}% confidence
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  {profiles[u.uid] ? (
                    <button
                      onClick={() => setSelectedProfile(profiles[u.uid])}
                      className="px-3 py-1 rounded text-xs font-semibold bg-green-600 dark:bg-green-700 text-white hover:bg-green-700"
                    >
                      View
                    </button>
                  ) : null}
                  <button
                    onClick={() => handleGenerateProfile(u.uid)}
                    disabled={generatingUser === u.uid || loading}
                    className="px-3 py-1 rounded text-xs font-semibold bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {generatingUser === u.uid ? '⏳' : '⚙️ Generate'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-light-card dark:bg-dark-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-light-border dark:border-dark-border">
            <div className="sticky top-0 bg-light-border dark:bg-dark-border px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-light-text dark:text-dark-text">
                {selectedProfile.topExpenseCategories[0] || 'User'} Profile
              </h3>
              <button
                onClick={() => setSelectedProfile(null)}
                className="text-2xl text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Summary */}
              <div>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Summary</p>
                <p className="text-sm text-light-text dark:text-dark-text italic">
                  "{selectedProfile.humanReadableExplanation}"
                </p>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-light-bg dark:bg-dark-bg p-3 rounded">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Confidence</p>
                  <p className="text-lg font-bold text-light-text dark:text-dark-text">{selectedProfile.confidenceScore}%</p>
                </div>
                <div className="bg-light-bg dark:bg-dark-bg p-3 rounded">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Avg Monthly Expense</p>
                  <p className="text-lg font-bold text-light-text dark:text-dark-text">{selectedProfile.avgMonthlyExpense.toLocaleString()} Kč</p>
                </div>
                <div className="bg-light-bg dark:bg-dark-bg p-3 rounded">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Avg Monthly Income</p>
                  <p className="text-lg font-bold text-light-text dark:text-dark-text">{selectedProfile.avgMonthlyIncome.toLocaleString()} Kč</p>
                </div>
                <div className="bg-light-bg dark:bg-dark-bg p-3 rounded">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Expense Volatility</p>
                  <p className="text-lg font-bold text-light-text dark:text-dark-text">{(selectedProfile.expenseVolatility * 100).toFixed(1)}%</p>
                </div>
                <div className="bg-light-bg dark:bg-dark-bg p-3 rounded">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Income Regularity</p>
                  <p className="text-lg font-bold text-light-text dark:text-dark-text">{(selectedProfile.incomeRegularity * 100).toFixed(1)}%</p>
                </div>
                <div className="bg-light-bg dark:bg-dark-bg p-3 rounded">
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Feedback Count</p>
                  <p className="text-lg font-bold text-light-text dark:text-dark-text">{selectedProfile.feedbackCount}</p>
                </div>
              </div>

              {/* Top Categories */}
              <div>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Top Expense Categories</p>
                <div className="flex flex-wrap gap-2">
                  {selectedProfile.topExpenseCategories.map((cat) => (
                    <span
                      key={cat}
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text mb-2">Feature Values</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-light-bg dark:bg-dark-bg p-2 rounded">
                    <p className="text-light-textMuted">Manual Factor</p>
                    <p className="font-mono font-semibold text-light-text dark:text-dark-text">
                      {selectedProfile.features.avgManualCorrectionFactor.toFixed(2)}x
                    </p>
                  </div>
                  <div className="bg-light-bg dark:bg-dark-bg p-2 rounded">
                    <p className="text-light-textMuted">Auto Factor</p>
                    <p className="font-mono font-semibold text-light-text dark:text-dark-text">
                      {selectedProfile.features.avgAutoCorrectionFactor.toFixed(2)}x
                    </p>
                  </div>
                  <div className="bg-light-bg dark:bg-dark-bg p-2 rounded">
                    <p className="text-light-textMuted">Final Factor</p>
                    <p className="font-mono font-semibold text-light-text dark:text-dark-text">
                      {selectedProfile.features.avgFinalCorrectionFactor.toFixed(2)}x
                    </p>
                  </div>
                  <div className="bg-light-bg dark:bg-dark-bg p-2 rounded">
                    <p className="text-light-textMuted">Volatility</p>
                    <p className="font-mono font-semibold text-light-text dark:text-dark-text">
                      {(selectedProfile.features.volatilityScore * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Generated at */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-xs text-blue-700 dark:text-blue-300">
                <p>
                  <strong>Generated:</strong> {new Date(selectedProfile.generatedAt).toLocaleString()}
                </p>
                <p className="mt-1">
                  <strong>Profile Version:</strong> {selectedProfile.profileVersion}
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-light-border dark:bg-dark-border px-6 py-3">
              <button
                onClick={() => setSelectedProfile(null)}
                className="w-full px-4 py-2 rounded-lg bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800 space-y-2">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>📋 About AI Profiles:</strong>
        </p>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>Per-user feature layer extracted from transaction history and feedback</li>
          <li>Currently prepares data for future ML personalization models</li>
          <li>Confidence score reflects data quality and feedback volume</li>
          <li>Correction factors show how feedback has adjusted L2 predictions</li>
          <li>This is not active in L2 predictions yet (L2 uses simplified baseline)</li>
        </ul>
      </div>
    </div>
  )
}
