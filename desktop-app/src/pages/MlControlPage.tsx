import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { useMlSystemHealth, type MlRun, type MlDebugLog } from '@/hooks/useMlSystemHealth'
import { useMlPipelineControl, usePredictionSettings, type PredictionSettings } from '@/hooks/useMlPipelineControl'

// ─── Helper components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active:          'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    Shadow:          'bg-blue-100  dark:bg-blue-900/40  text-blue-700  dark:text-blue-300',
    Fallback:        'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    Inactive:        'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
    success:         'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    completed:       'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    partial_success: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    running:         'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
    failed:          'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    idle:            'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
    unknown:         'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  }
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold ${map[status] ?? map.unknown}`}>
      {status.replace('_', ' ').toUpperCase()}
    </span>
  )
}

function SectionCard({ title, children, borderColor = '' }: { title: string; children: React.ReactNode; borderColor?: string }) {
  return (
    <div className={`card rounded-lg p-6 space-y-4 ${borderColor ? `border-2 ${borderColor}` : ''}`}>
      <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">{title}</h2>
      {children}
    </div>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-light-border dark:bg-dark-border rounded p-3">
      <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-light-text dark:text-dark-text mt-0.5">{value}</p>
      {sub && <p className="text-xs text-light-textMuted dark:text-dark-textMuted">{sub}</p>}
    </div>
  )
}

function formatTs(ts: any): string {
  if (ts === null || ts === undefined) return '—'
  try {
    let d: Date
    if (typeof ts.toDate === 'function') {
      // Firestore Timestamp object
      d = ts.toDate()
    } else if (typeof ts === 'object' && ('seconds' in ts || '_seconds' in ts)) {
      // Plain { seconds, nanoseconds } or { _seconds, _nanoseconds }
      const sec = ts.seconds ?? ts._seconds
      d = new Date(sec * 1000)
    } else if (ts instanceof Date) {
      d = ts
    } else if (typeof ts === 'string' || typeof ts === 'number') {
      d = new Date(ts)
    } else {
      return '—'
    }
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString()
  } catch {
    return '—'
  }
}

function formatMs(ms?: number): string {
  if (!ms) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function LogLevelBadge({ level }: { level: string }) {
  const c = level === 'error' ? 'bg-red-100 text-red-700'
    : level === 'warning' ? 'bg-yellow-100 text-yellow-700'
    : 'bg-slate-100 text-slate-600'
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${c}`}>{level}</span>
}

function ExpandableJson({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  if (!data || Object.keys(data).length === 0) return <span className="text-xs text-light-textMuted">—</span>
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 underline">{open ? 'collapse' : 'expand'}</button>
      {open && (
        <pre className="mt-1 text-xs bg-slate-900 text-slate-100 p-2 rounded overflow-auto max-h-40">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MlControlPage() {
  const { user, getIdToken } = useAuth()
  const { role: userRole } = useUserRole(user)
  const { updatePredictionSettings, runLevel2ShadowPipeline, generateL2AutoFeedback } = useMlPipelineControl()
  const { settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = usePredictionSettings()
  const { health, loading: healthLoading, error: healthError, lastLoaded, reload: reloadHealth } = useMlSystemHealth()

  const [statusMessage, setStatusMessage]   = useState('')
  const [statusType, setStatusType]         = useState<'success' | 'error'>('success')
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [actionLoading, setActionLoading]   = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [autoFeedbackMonth, setAutoFeedbackMonth] = useState('')
  const [autoFeedbackLoading, setAutoFeedbackLoading] = useState(false)
  const [debugLogFilter, setDebugLogFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all')

  // ── Prediction mode helpers ──────────────────────────────────────────────
  const isL2Active =
    settings.activePredictionLevel === 2 &&
    settings.level2Enabled === true &&
    settings.level2ShadowMode === false

  const isL2Shadow =
    settings.activePredictionLevel === 1 &&
    settings.level2Enabled === true &&
    settings.level2ShadowMode === true

  const l1Status: 'Active' | 'Fallback' = isL2Active ? 'Fallback' : 'Active'
  const l2Status: 'Active' | 'Shadow' | 'Inactive' =
    isL2Active ? 'Active' : isL2Shadow ? 'Shadow' : 'Inactive'

  const busy = actionLoading || settingsLoading || pipelineRunning || autoFeedbackLoading
  const isAdmin = userRole && ['admin', 'ml_admin'].includes(userRole)

  // ── Settings payloads ────────────────────────────────────────────────────
  const P_L1_ACTIVE = { activePredictionLevel: 1 as const, level2Enabled: false, level2ShadowMode: false, fallbackEnabled: true }
  const P_L2_SHADOW = { activePredictionLevel: 1 as const, level2Enabled: true,  level2ShadowMode: true,  fallbackEnabled: true }
  const P_L2_ACTIVE = { activePredictionLevel: 2 as const, level2Enabled: true,  level2ShadowMode: false, fallbackEnabled: true }

  // ── applySettings ────────────────────────────────────────────────────────
  const applySettings = async (next: Omit<PredictionSettings, 'updatedAt' | 'updatedBy'>, label: string) => {
    setActionLoading(true)
    setStatusMessage(`${label}...`)
    setStatusType('success')
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const result = await updatePredictionSettings(token, next)
      if (result?.ok !== true) throw new Error(result?.error || 'Update failed')
      setStatusMessage(`✅ ${label} successful`)
      setStatusType('success')
      setActivateModalOpen(false)
      await reloadSettings()
      await reloadHealth()
    } catch (err) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusType('error')
    } finally {
      setActionLoading(false)
    }
  }

  // ── runShadowPipeline ────────────────────────────────────────────────────
  const runShadowPipeline = async () => {
    setPipelineRunning(true)
    setStatusMessage('Starting Level 2 Shadow pipeline...')
    setStatusType('success')
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const result = await runLevel2ShadowPipeline(token)
      if (!result?.success) throw new Error(result?.message || 'Shadow pipeline failed')
      const s = result?.summary
      setStatusMessage(
        `✅ Shadow pipeline: ${s?.usersProcessed ?? 0} users, ${s?.predictionsCreated ?? 0} predictions` +
        (s?.errorCount ? ` (${s.errorCount} errors → partial_success)` : '')
      )
      setStatusType('success')
      setTimeout(() => reloadHealth(), 2000)
    } catch (err) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusType('error')
    } finally {
      setPipelineRunning(false)
    }
  }

  // ── generateAutoFeedback ─────────────────────────────────────────────────
  const handleGenerateAutoFeedback = async () => {
    if (!autoFeedbackMonth.match(/^\d{4}-\d{2}$/)) {
      setStatusMessage('❌ Please enter month as YYYY-MM')
      setStatusType('error')
      return
    }
    setAutoFeedbackLoading(true)
    setStatusMessage(`Generating auto feedback for ${autoFeedbackMonth}...`)
    setStatusType('success')
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const result = await generateL2AutoFeedback(token, autoFeedbackMonth)
      if (result?.ok !== true) throw new Error(result?.error || 'Failed')
      const s = result?.summary
      setStatusMessage(`✅ Auto feedback: ${s?.feedbackCreated ?? 0} created, ${s?.feedbackSkipped ?? 0} skipped`)
      setStatusType('success')
      setAutoFeedbackMonth('')
      setTimeout(() => reloadHealth(), 2000)
    } catch (err) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusType('error')
    } finally {
      setAutoFeedbackLoading(false)
    }
  }

  // ── Btn helper ───────────────────────────────────────────────────────────
  const Btn = ({ onClick, label, variant = 'primary', disabled = false }: {
    onClick: () => void; label: string
    variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'
    disabled?: boolean
  }) => {
    const base = 'px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
    const colors: Record<string, string> = {
      primary:   'bg-green-600 dark:bg-green-700 text-white hover:bg-green-700',
      secondary: 'bg-blue-600  dark:bg-blue-700  text-white hover:bg-blue-700',
      danger:    'bg-red-600   dark:bg-red-700   text-white hover:bg-red-700',
      warning:   'bg-yellow-600 dark:bg-yellow-700 text-white hover:bg-yellow-700',
      ghost:     'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300',
    }
    return (
      <button onClick={onClick} disabled={disabled || busy} className={`${base} ${colors[variant]}`}>
        {busy && !disabled ? '…' : label}
      </button>
    )
  }

  // ─── Pipeline status helpers ─────────────────────────────────────────────
  const ps = health?.pipelineStatus
  const psBorderColor =
    ps?.status === 'running'         ? 'border-yellow-500 dark:border-yellow-600' :
    ps?.status === 'completed'       ? 'border-green-500 dark:border-green-600'   :
    ps?.status === 'partial_success' ? 'border-orange-500 dark:border-orange-600' :
    ps?.status === 'failed'          ? 'border-red-500 dark:border-red-600'       :
    'border-slate-300 dark:border-slate-700'

  // ─── Filtered debug logs ─────────────────────────────────────────────────
  const allLogs: MlDebugLog[] = health?.recentDebugLogs ?? []
  const filteredLogs = debugLogFilter === 'all' ? allLogs : allLogs.filter(l => l.level === debugLogFilter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Model Control</h1>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          ⚠️ Current L2: <strong>simplified baseline with manual/auto calibration</strong> — Real Python ML model is not active yet.
        </p>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className={`p-4 rounded-lg text-sm whitespace-pre-line ${
          statusType === 'success'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMessage}
        </div>
      )}

      {settingsError && (
        <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm flex gap-3 items-center">
          ⚠️ Settings error: {settingsError}
          <button onClick={reloadSettings} className="underline shrink-0">Retry</button>
        </div>
      )}

      {/* ─── A. Prediction Mode ──────────────────────────────────────────────── */}
      <SectionCard title="A. Prediction Mode">
        {settingsLoading ? (
          <p className="text-sm text-light-textMuted">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Active Level" value={`L${settings.activePredictionLevel}`} />
              <StatBox label="L2 Enabled" value={settings.level2Enabled ? '✅ Yes' : '❌ No'} />
              <StatBox label="Shadow Mode" value={settings.level2ShadowMode ? '🔵 ON' : '⚫ OFF'} />
              <StatBox label="Fallback" value={settings.fallbackEnabled ? '✅ ON' : '❌ OFF'} />
            </div>
            <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-light-border dark:border-dark-border">
              <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Production Model:</span>
              <StatusBadge status={l1Status === 'Active' ? 'Active' : 'Fallback'} />
              <span className="text-sm text-light-textMuted dark:text-dark-textMuted ml-4">L2 Status:</span>
              <StatusBadge status={l2Status} />
            </div>
            {/* Controls */}
            <div className="flex flex-wrap gap-2 pt-2">
              {!isL2Shadow && !isL2Active && (
                <Btn onClick={() => applySettings(P_L2_SHADOW, 'Enable Level 2 Shadow')} label="Enable L2 Shadow" variant="secondary" />
              )}
              {isL2Shadow && (
                <>
                  <Btn onClick={() => setActivateModalOpen(true)} label="Activate L2" variant="primary" />
                  <Btn onClick={() => applySettings(P_L1_ACTIVE, 'Disable L2 Shadow')} label="Disable L2 Shadow" variant="ghost" />
                </>
              )}
              {isL2Active && (
                <>
                  <Btn onClick={() => applySettings(P_L1_ACTIVE, 'Rollback to L1')} label="Rollback to L1" variant="warning" />
                  <Btn onClick={() => applySettings(P_L2_SHADOW, 'Switch to Shadow')} label="Switch to Shadow" variant="ghost" />
                </>
              )}
            </div>
          </>
        )}
      </SectionCard>

      {/* ─── B. L2 Pipeline Live Status ─────────────────────────────────────── */}
      <SectionCard title="B. L2 Pipeline Live Status" borderColor={psBorderColor}>
        {healthError ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">❌ {healthError}</p>
            {healthError.includes('not deployed') && (
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                Deploy Cloud Functions: <code className="bg-light-border dark:bg-dark-border px-1 rounded">firebase deploy --only functions:adminGetMlSystemHealth</code>
              </p>
            )}
            <button onClick={reloadHealth} className="px-3 py-1 rounded text-sm bg-blue-600 text-white">Retry</button>
          </div>
        ) : healthLoading && !health ? (
          <p className="text-sm text-light-textMuted">Loading pipeline status...</p>
        ) : !ps ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">No pipeline run yet. Run Shadow Pipeline to start.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={ps.status} />
              <span className="text-xs text-light-textMuted dark:text-dark-textMuted font-mono">{ps.stage}</span>
            </div>

            {/* Progress bar */}
            {ps.progress && ps.progress.usersTotal > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-light-textMuted">Progress</span>
                  <span className="font-semibold text-light-text dark:text-dark-text">
                    {ps.progress.usersProcessed}/{ps.progress.usersTotal} users
                    ({Math.round((ps.progress.usersProcessed / ps.progress.usersTotal) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-light-border dark:bg-dark-border rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      ps.status === 'running'         ? 'bg-yellow-500' :
                      ps.status === 'completed'       ? 'bg-green-500'  :
                      ps.status === 'partial_success' ? 'bg-orange-500' :
                      ps.status === 'failed'          ? 'bg-red-500'    : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, (ps.progress.usersProcessed / ps.progress.usersTotal) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Predictions" value={ps.progress?.predictionsCreated ?? '—'} />
              <StatBox label="Errors" value={ps.progress?.errorCount ?? '—'} />
              <StatBox label="Manual FB" value={ps.progress?.manualFeedbackRecordsUsed ?? '—'} />
              <StatBox label="Auto FB"   value={ps.progress?.autoFeedbackRecordsUsed   ?? '—'} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div><span className="text-light-textMuted">Started:</span> <span className="ml-1 font-semibold">{formatTs(ps.startedAt)}</span></div>
              <div><span className="text-light-textMuted">Updated:</span> <span className="ml-1 font-semibold">{formatTs(ps.updatedAt)}</span></div>
              <div><span className="text-light-textMuted">Duration:</span> <span className="ml-1 font-semibold">{formatMs(ps.durationMs)}</span></div>
            </div>

            {ps.lastError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-700 rounded p-3 text-xs text-red-700 dark:text-red-300">
                <strong>Last Error:</strong> {typeof ps.lastError === 'string' ? ps.lastError : JSON.stringify(ps.lastError)}
              </div>
            )}
          </div>
        )}
        <div className="pt-2 border-t border-light-border dark:border-dark-border">
          <button onClick={reloadHealth} className="px-3 py-1.5 rounded text-sm bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 font-semibold">
            🔄 Refresh Status {lastLoaded && <span className="opacity-60 ml-1 text-xs">({lastLoaded.toLocaleTimeString()})</span>}
          </button>
        </div>
      </SectionCard>

      {/* ─── C. Pipeline Controls ────────────────────────────────────────────── */}
      {isL2Shadow && (
        <SectionCard title="C. Pipeline Controls">
          <div className="flex flex-wrap gap-3">
            <Btn
              onClick={runShadowPipeline}
              label={pipelineRunning ? '⏳ Running...' : '▶️ Run Shadow Pipeline'}
              variant="secondary"
              disabled={pipelineRunning}
            />
            <Btn onClick={reloadHealth} label="🔄 Refresh Status" variant="ghost" disabled={healthLoading} />
          </div>

          {isAdmin && (
            <div className="pt-4 border-t border-light-border dark:border-dark-border space-y-3">
              <p className="text-sm font-semibold text-light-text dark:text-dark-text">Auto Feedback Generation</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-light-textMuted dark:text-dark-textMuted mb-1">Month (YYYY-MM)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-06"
                    value={autoFeedbackMonth}
                    onChange={e => setAutoFeedbackMonth(e.target.value)}
                    disabled={autoFeedbackLoading}
                    className="px-3 py-2 rounded text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border disabled:opacity-60"
                  />
                </div>
                <Btn
                  onClick={handleGenerateAutoFeedback}
                  label={autoFeedbackLoading ? '⏳ Generating...' : '🤖 Generate Auto Feedback'}
                  variant="secondary"
                  disabled={autoFeedbackLoading || !autoFeedbackMonth}
                />
              </div>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                Compares L2 shadow predictions with actual expenses for the given month. Creates l2_auto_feedback records (weight 1x).
              </p>
            </div>
          )}
        </SectionCard>
      )}

      {/* ─── D. Last L2 Run ──────────────────────────────────────────────────── */}
      <SectionCard title="D. Last L2 Run">
        {!health?.lastL2Run ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">No L2 runs recorded yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={health.lastL2Run.status} />
              <span className="text-xs text-light-textMuted">{formatTs(health.lastL2Run.startedAt)}</span>
              <span className="text-xs text-light-textMuted">{formatMs(health.lastL2Run.durationMs)}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Users Processed" value={health.lastL2Run.usersProcessed} />
              <StatBox label="Users Skipped"   value={health.lastL2Run.usersSkipped ?? '—'} />
              <StatBox label="Predictions"     value={health.lastL2Run.predictionsCreated} />
              <StatBox label="Errors"          value={health.lastL2Run.errorCount} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Manual FB Used"  value={health.lastL2Run.manualFeedbackRecordsUsed ?? '—'} />
              <StatBox label="Auto FB Used"    value={health.lastL2Run.autoFeedbackRecordsUsed ?? '—'} />
              <StatBox label="Users w/ FB"     value={health.lastL2Run.usersWithTrainingData ?? '—'} />
              <StatBox label="Avg Correction"  value={health.lastL2Run.averageFinalCorrectionFactor ? `${health.lastL2Run.averageFinalCorrectionFactor}x` : '—'} />
            </div>
            {health.lastL2Run.errorsPreview && health.lastL2Run.errorsPreview.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">Errors Preview:</p>
                {health.lastL2Run.errorsPreview.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">
                    {e.userId?.slice(0, 8)}… [{e.stage}] {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ─── E. Feedback Learning Summary ───────────────────────────────────── */}
      <SectionCard title="E. Feedback Learning Summary">
        {!health?.feedbackSummary ? (
          <p className="text-sm text-light-textMuted">No feedback data (health check unavailable).</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Manual Feedback" value={health.feedbackSummary.manualFeedbackCount}
                sub="weight 2x (admin-curated)" />
              <StatBox label="Auto Feedback"   value={health.feedbackSummary.autoFeedbackCount}
                sub="weight 1x (from actuals)" />
              <StatBox label="Latest Manual"
                value={health.feedbackSummary.latestManualFeedbackAt ? formatTs(health.feedbackSummary.latestManualFeedbackAt).split(',')[0] : '—'} />
              <StatBox label="Latest Auto"
                value={health.feedbackSummary.latestAutoFeedbackAt ? formatTs(health.feedbackSummary.latestAutoFeedbackAt).split(',')[0] : '—'} />
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-xs text-blue-700 dark:text-blue-300">
              <strong>Learning formula:</strong>{' '}
              finalCorrectionFactor = (manualFactor×2 + autoFactor×1) / totalWeight, clamped [0.7, 1.3]
            </div>
          </div>
        )}
      </SectionCard>

      {/* ─── F. Recent Runs ──────────────────────────────────────────────────── */}
      <SectionCard title="F. Recent Pipeline Runs">
        {!health?.recentRuns || health.recentRuns.length === 0 ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">No runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2 text-right">Users</th>
                  <th className="px-3 py-2 text-right">Predictions</th>
                  <th className="px-3 py-2 text-right">Errors</th>
                  <th className="px-3 py-2 text-right">Avg Factor</th>
                </tr>
              </thead>
              <tbody>
                {(health.recentRuns as MlRun[]).map((run, i) => (
                  <tr key={run.id ?? i} className="border-b border-light-border dark:border-dark-border">
                    <td className="px-3 py-2"><StatusBadge status={run.status} /></td>
                    <td className="px-3 py-2">{formatTs(run.startedAt)}</td>
                    <td className="px-3 py-2 text-right">{formatMs(run.durationMs)}</td>
                    <td className="px-3 py-2 text-right">{run.usersProcessed}</td>
                    <td className="px-3 py-2 text-right">{run.predictionsCreated}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${run.errorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {run.errorCount}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {run.averageFinalCorrectionFactor ? `${run.averageFinalCorrectionFactor}x` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ─── G. ML Debug Console ────────────────────────────────────────────── */}
      <SectionCard title="G. ML Debug Console">
        <div className="flex flex-wrap gap-2 pb-3 border-b border-light-border dark:border-dark-border">
          {(['all', 'info', 'warning', 'error'] as const).map(f => (
            <button
              key={f}
              onClick={() => setDebugLogFilter(f)}
              className={`px-3 py-1 rounded text-xs font-semibold ${debugLogFilter === f
                ? 'bg-blue-600 text-white' : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text'}`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
          <span className="text-xs text-light-textMuted self-center ml-auto">{filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}</span>
        </div>

        {healthError ? (
          <p className="text-sm text-red-600 dark:text-red-400">❌ {healthError}</p>
        ) : allLogs.length === 0 ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">No debug logs yet. Logs will appear here when the pipeline runs.</p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">No {debugLogFilter} logs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Level</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Stage</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Message</th>
                  <th className="px-3 py-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log: MlDebugLog, i) => (
                  <tr key={log.id ?? i} className="border-b border-light-border dark:border-dark-border hover:bg-light-border dark:hover:bg-dark-border/50">
                    <td className="px-3 py-2 whitespace-nowrap">{formatTs(log.createdAt)}</td>
                    <td className="px-3 py-2"><LogLevelBadge level={log.level} /></td>
                    <td className="px-3 py-2 font-mono text-light-textMuted">{log.source}</td>
                    <td className="px-3 py-2 font-mono text-light-textMuted">{log.stage}</td>
                    <td className="px-3 py-2 font-mono">{log.userId ? log.userId.slice(0, 8) + '…' : '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={log.message}>{log.message}</td>
                    <td className="px-3 py-2">
                      <ExpandableJson data={log.details ?? {}} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={reloadHealth} className="w-full px-3 py-2 rounded text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 font-semibold mt-2">
          🔄 Refresh Logs
        </button>
      </SectionCard>

      {/* ─── System Health (compact) ─────────────────────────────────────────── */}
      <SectionCard title="System Health">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatBox label="Firebase Project"    value={health?.firebaseProjectId ?? 'unknown'} />
          <StatBox label="CF Reachable"        value={healthError ? '❌ No' : health ? '✅ Yes' : '…'} />
          <StatBox label="Firestore Readable"  value={health?.firestoreReadable ? '✅ Yes' : healthError ? '❌ Error' : '—'} />
          <StatBox label="Firestore Writable"  value={health?.firestoreWritable ? '✅ Yes' : healthError ? '❌ Error' : '—'} />
          <StatBox label="Settings Loaded"     value={health?.predictionSettingsExists ? '✅ Yes' : health ? '❌ Missing' : '—'} />
          <StatBox label="Recent Errors"       value={health?.recentErrorCount ?? '—'} />
        </div>
        {healthError && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-700 rounded p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
            <p className="font-semibold">Health check failed:</p>
            <p>{healthError}</p>
            {healthError.includes('not deployed') && (
              <p className="mt-1 text-red-600">→ Deploy Cloud Function: <code>firebase deploy --only functions:adminGetMlSystemHealth</code></p>
            )}
          </div>
        )}
      </SectionCard>

      {/* ─── Activate L2 Modal ──────────────────────────────────────────────── */}
      {activateModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md w-full mx-4 border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-2">Activate Level 2?</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-4">
              Level 2 will move from shadow to production. All users will receive L2 predictions.
              L1 remains as fallback.
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-sm mb-6">
              ⚠️ Current L2 is a simplified baseline, not a real Python ML model.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setActivateModalOpen(false)} className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text font-semibold">
                Cancel
              </button>
              <button onClick={() => applySettings(P_L2_ACTIVE, 'Activate Level 2')} disabled={busy}
                className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold">
                {busy ? '…' : 'Yes, Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
