import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { useMlSystemHealth } from '@/hooks/useMlSystemHealth'
import { useMlPipelineControl, usePredictionSettings, type PredictionSettings } from '@/hooks/useMlPipelineControl'

export function MlControlPage() {
  const { user, getIdToken } = useAuth()
  const { role: userRole } = useUserRole(user)
  const { updatePredictionSettings, runLevel2ShadowPipeline, generateL2AutoFeedback } = useMlPipelineControl()
  const { settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = usePredictionSettings()
  const { health, loading: healthLoading, error: healthError, reload: reloadHealth } = useMlSystemHealth()

  const [statusMessage, setStatusMessage] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error'>('success')
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [autoFeedbackMonth, setAutoFeedbackMonth] = useState('')
  const [autoFeedbackLoading, setAutoFeedbackLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({})

  const applySettings = async (
    next: Omit<PredictionSettings, 'updatedAt' | 'updatedBy'>,
    label: string
  ) => {
    setActionLoading(true)
    setStatusMessage(`${label}...`)
    setStatusType('success')

    let token = ''
    try {
      token = await getIdToken()
    } catch (err) {
      setStatusMessage(`❌ Auth error: ${err instanceof Error ? err.message : String(err)}`)
      setStatusType('error')
      setActionLoading(false)
      return
    }

    setDebugInfo(prev => ({
      ...prev,
      lastFunction: 'adminUpdatePredictionSettings',
      lastPayload: next,
      hasToken: Boolean(token),
      isElectron: Boolean(window.ipcApi),
    }))

    if (!window.ipcApi) {
      setStatusMessage('❌ IPC API not available — is this running in Electron?')
      setStatusType('error')
      setActionLoading(false)
      return
    }

    try {
      const result = await updatePredictionSettings(token, next)

      setDebugInfo(prev => ({
        ...prev,
        lastUpdateResult: { ok: result?.ok, hasData: Boolean(result?.data), error: result?.error ?? null },
      }))

      if (result?.ok !== true) {
        setStatusMessage(`❌ ${result?.error || 'Backend returned ok:false'}`)
        setStatusType('error')
        setActionLoading(false)
        return
      }

      setStatusMessage(`✅ ${label} successful`)
      setStatusType('success')
      setActivateModalOpen(false)

      await reloadSettings()
    } catch (err) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusType('error')
      setDebugInfo(prev => ({ ...prev, lastError: err instanceof Error ? err.message : String(err) }))
    } finally {
      setActionLoading(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const isL2Active =
    settings.activePredictionLevel === 2 &&
    settings.level2Enabled === true &&
    settings.level2ShadowMode === false

  const isL2Shadow =
    settings.activePredictionLevel === 1 &&
    settings.level2Enabled === true &&
    settings.level2ShadowMode === true

  const shadowModeOn = isL2Shadow

  const l1Status: 'Active' | 'Fallback' = isL2Active ? 'Fallback' : 'Active'
  const l2Status: 'Active' | 'Shadow' | 'Inactive' =
    isL2Active ? 'Active' : isL2Shadow ? 'Shadow' : 'Inactive'

  const busy = actionLoading || settingsLoading || pipelineRunning || autoFeedbackLoading
  const isAdmin = userRole && ['admin', 'ml_admin'].includes(userRole)

  const runShadowPipeline = async () => {
    setPipelineRunning(true)
    setStatusMessage('Starting Level 2 Shadow pipeline...')
    setStatusType('success')

    let token = ''
    try {
      token = await getIdToken()
    } catch (err) {
      setStatusMessage(`❌ Auth error: ${err instanceof Error ? err.message : String(err)}`)
      setStatusType('error')
      setPipelineRunning(false)
      return
    }

    if (!window.ipcApi) {
      setStatusMessage('❌ IPC API not available — is this running in Electron?')
      setStatusType('error')
      setPipelineRunning(false)
      return
    }

    try {
      const result = await runLevel2ShadowPipeline(token)

      setDebugInfo(prev => ({
        ...prev,
        lastPipelineRun: {
          success: result?.success,
          message: result?.message,
          summary: result?.summary,
        },
      }))

      if (!result?.success) {
        setStatusMessage(`❌ ${result?.message || 'Shadow pipeline failed'}`)
        setStatusType('error')
      } else {
        const summary = result?.summary
        const isRealModel = summary?.isRealMlModel === true
        const dataNote = isRealModel
          ? ''
          : '\n⚠️ SIMPLIFIED BASELINE (not actual ML model)'
        const dataSources = summary?.usedDataSources
        const dataSourcesStr = dataSources
          ? `Data: ${[
              dataSources.vydaje ? 'wydaje' : '',
              dataSources.prijmy ? 'prijmy' : '',
              dataSources.trainingData ? 'trainingData' : '',
              dataSources.level1Prediction ? 'L1' : '',
            ].filter(Boolean).join(', ')}`
          : ''
        setStatusMessage(
          `✅ Shadow pipeline completed${dataNote}\n` +
          `Users: ${summary?.usersProcessed ?? 0} | ` +
          `Predictions: ${summary?.predictionsCreated ?? 0} | ` +
          `Fallback: ${summary?.fallbackUsed ?? 0} | ` +
          `Duration: ${((summary?.durationMs ?? 0) / 1000).toFixed(1)}s\n` +
          `Model: ${summary?.modelType ?? 'unknown'} (real ML: ${isRealModel ? 'yes' : 'no'}) | ` +
          `${dataSourcesStr}`
        )
        setStatusType('success')
      }
    } catch (err) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusType('error')
      setDebugInfo(prev => ({ ...prev, lastPipelineError: err instanceof Error ? err.message : String(err) }))
    } finally {
      setPipelineRunning(false)
    }
  }

  const handleGenerateAutoFeedback = async () => {
    if (!autoFeedbackMonth) {
      setStatusMessage('❌ Please enter a month (YYYY-MM format)')
      setStatusType('error')
      return
    }

    setAutoFeedbackLoading(true)
    setStatusMessage(`Generating auto feedback for ${autoFeedbackMonth}...`)
    setStatusType('success')

    let token = ''
    try {
      token = await getIdToken()
    } catch (err) {
      setStatusMessage(`❌ Auth error: ${err instanceof Error ? err.message : String(err)}`)
      setStatusType('error')
      setAutoFeedbackLoading(false)
      return
    }

    if (!window.ipcApi) {
      setStatusMessage('❌ IPC API not available — is this running in Electron?')
      setStatusType('error')
      setAutoFeedbackLoading(false)
      return
    }

    try {
      const result = await generateL2AutoFeedback(token, autoFeedbackMonth)

      setDebugInfo(prev => ({
        ...prev,
        lastAutoFeedbackRun: {
          month: autoFeedbackMonth,
          ok: result?.ok,
          summary: result?.summary,
        },
      }))

      if (result?.ok !== true) {
        setStatusMessage(`❌ ${result?.error || 'Failed to generate auto feedback'}`)
        setStatusType('error')
      } else {
        const summary = result?.summary
        setStatusMessage(
          `✅ Auto feedback generated for ${autoFeedbackMonth}\n` +
          `Created: ${summary?.feedbackCreated ?? 0} | ` +
          `Skipped: ${summary?.feedbackSkipped ?? 0} | ` +
          `Errors: ${summary?.errorCount ?? 0}`
        )
        setStatusType('success')
        setAutoFeedbackMonth('')
      }
    } catch (err) {
      setStatusMessage(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`)
      setStatusType('error')
      setDebugInfo(prev => ({ ...prev, lastAutoFeedbackError: err instanceof Error ? err.message : String(err) }))
    } finally {
      setAutoFeedbackLoading(false)
    }
  }

  // ── Payloads ──────────────────────────────────────────────────────────────
  const P_L1_ACTIVE   = { activePredictionLevel: 1 as const, level2Enabled: false, level2ShadowMode: false, fallbackEnabled: true }
  const P_L2_SHADOW   = { activePredictionLevel: 1 as const, level2Enabled: true,  level2ShadowMode: true,  fallbackEnabled: true }
  const P_L2_ACTIVE   = { activePredictionLevel: 2 as const, level2Enabled: true,  level2ShadowMode: false, fallbackEnabled: true }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const Btn = ({
    onClick, label, variant = 'primary', disabled = false
  }: {
    onClick: () => void
    label: string
    variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'
    disabled?: boolean
  }) => {
    const base = 'px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
    const colors: Record<string, string> = {
      primary:   'bg-green-600 dark:bg-green-700 text-white hover:bg-green-700',
      secondary: 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700',
      danger:    'bg-red-600 dark:bg-red-700 text-white hover:bg-red-700',
      warning:   'bg-yellow-600 dark:bg-yellow-700 text-white hover:bg-yellow-700',
      ghost:     'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600',
    }
    return (
      <button onClick={onClick} disabled={disabled || busy} className={`${base} ${colors[variant]}`}>
        {busy && !disabled ? '…' : label}
      </button>
    )
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      Active:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
      Shadow:   'bg-blue-100  dark:bg-blue-900/40  text-blue-700  dark:text-blue-300',
      Fallback: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
      Inactive: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
    }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-bold ${styles[status] ?? styles.Inactive}`}>
        {status}
      </span>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Model Control</h1>

      {/* Load error */}
      {settingsError && (
        <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
          <span>⚠️ {settingsError}</span>
          <button onClick={reloadSettings} className="underline hover:no-underline shrink-0">Retry</button>
        </div>
      )}

      {/* Status summary */}
      <div className="card rounded-lg p-5 border border-light-border dark:border-dark-border">
        <p className="text-xs font-semibold uppercase tracking-wide text-light-textMuted dark:text-dark-textMuted mb-3">
          Current model status
        </p>
        <div className="flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 1:</span>
            {settingsLoading ? <span className="text-sm text-light-textMuted">…</span> : <StatusBadge status={l1Status} />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 2:</span>
            {settingsLoading ? <span className="text-sm text-light-textMuted">…</span> : <StatusBadge status={l2Status} />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Shadow Mode:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              shadowModeOn
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}>
              {settingsLoading ? '…' : shadowModeOn ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className={`p-4 rounded-lg text-sm ${
          statusType === 'success'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMessage}
        </div>
      )}

      {/* ─── System Health Dashboard ─────────────────────────────────────── */}
      <div className="card rounded-lg p-6 space-y-4 border-2 border-blue-400 dark:border-blue-600">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">📊 ML System Health</h2>

        {healthLoading ? (
          <p className="text-sm text-light-textMuted">Loading system health...</p>
        ) : healthError ? (
          <p className="text-sm text-red-600 dark:text-red-400">⚠️ {healthError}</p>
        ) : health ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-light-border dark:bg-dark-border rounded p-3">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Firebase</p>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text">evidence-vydaju</p>
              </div>
              <div className="bg-light-border dark:bg-dark-border rounded p-3">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">L2 Enabled</p>
                <p className={`text-sm font-semibold ${health.health.l2Enabled ? 'text-green-600' : 'text-red-600'}`}>
                  {health.health.l2Enabled ? '✅ Yes' : '❌ No'}
                </p>
              </div>
              <div className="bg-light-border dark:bg-dark-border rounded p-3">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">L2 Shadow</p>
                <p className={`text-sm font-semibold ${health.health.l2ShadowEnabled ? 'text-blue-600' : 'text-gray-600'}`}>
                  {health.health.l2ShadowEnabled ? '🔵 ON' : '⚫ OFF'}
                </p>
              </div>
              <div className="bg-light-border dark:bg-dark-border rounded p-3">
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Active Level</p>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text">L{health.health.activePredictionLevel}</p>
              </div>
            </div>

            {/* Feedback Stats */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-light-border dark:border-dark-border">
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Manual Feedback</p>
                <p className="text-2xl font-bold text-blue-600">{health.feedbackStats.totalManualFeedback}</p>
              </div>
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Auto Feedback</p>
                <p className="text-2xl font-bold text-purple-600">{health.feedbackStats.totalAutoFeedback}</p>
              </div>
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Total Feedback</p>
                <p className="text-2xl font-bold text-green-600">
                  {health.feedbackStats.totalManualFeedback + health.feedbackStats.totalAutoFeedback}
                </p>
              </div>
            </div>

            {/* Pipeline Status */}
            {health.pipelineStatus && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-3 border border-blue-300 dark:border-blue-700">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Last Pipeline Run</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-light-textMuted dark:text-dark-textMuted">Status:</span>
                    <span className={`ml-2 font-semibold ${
                      health.pipelineStatus.status === 'completed' ? 'text-green-600' :
                      health.pipelineStatus.status === 'running' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {health.pipelineStatus.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-light-textMuted dark:text-dark-textMuted">Stage:</span>
                    <span className="ml-2 font-semibold text-light-text dark:text-dark-text">{health.pipelineStatus.stage}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={reloadHealth}
              className="w-full px-3 py-2 rounded text-sm bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 font-semibold"
            >
              🔄 Refresh Health
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Level 1 Control ─────────────────────────────────────────────── */}
      <div className="card rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Level 1 Control</h2>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
              Level 1 is the stable baseline prediction model.
            </p>
          </div>
          {!settingsLoading && <StatusBadge status={l1Status} />}
        </div>

        {settingsLoading ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Loading...</p>
        ) : l1Status === 'Active' ? (
          <div className="flex items-center gap-3">
            <Btn onClick={() => {}} label="Level 1 Active" variant="ghost" disabled={true} />
            <span className="text-xs text-light-textMuted dark:text-dark-textMuted">No action needed</span>
          </div>
        ) : (
          /* l1Status === 'Fallback' — Level 2 is active, offer rollback */
          <div className="space-y-2">
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">
              Level 1 is on standby. Level 2 is currently serving users.
            </p>
            <Btn
              onClick={() => applySettings(P_L1_ACTIVE, 'Rollback to Level 1')}
              label="Rollback to Level 1"
              variant="warning"
            />
          </div>
        )}
      </div>

      {/* ── Level 2 Control ─────────────────────────────────────────────── */}
      <div className="card rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Level 2 Control</h2>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
              Level 2 is the AI/ML prediction model. It can run in Shadow Mode or Active Mode.
            </p>
          </div>
          {!settingsLoading && <StatusBadge status={l2Status} />}
        </div>

        {settingsLoading ? (
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Loading...</p>
        ) : isL2Active ? (
          /* State C: Level 2 Active */
          <div className="space-y-3">
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">
              Level 2 is serving all users. Shadow Mode is off.
            </p>
            <div className="flex flex-wrap gap-3">
              <Btn
                onClick={() => applySettings(P_L1_ACTIVE, 'Deactivate Level 2')}
                label="Deactivate Level 2"
                variant="danger"
              />
              <Btn
                onClick={() => applySettings(P_L2_SHADOW, 'Switch Level 2 to Shadow Mode')}
                label="Switch to Shadow Mode"
                variant="ghost"
              />
            </div>
          </div>
        ) : isL2Shadow ? (
          /* State B: Level 2 Shadow */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Shadow Mode:</span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">ON</span>
              <span className="text-xs text-light-textMuted dark:text-dark-textMuted">— Level 2 runs in parallel, users still receive Level 1</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Btn
                onClick={runShadowPipeline}
                label={pipelineRunning ? '⏳ Running...' : '▶️ Run Shadow Pipeline'}
                variant="secondary"
                disabled={pipelineRunning || settingsLoading}
              />
              <Btn
                onClick={() => applySettings(P_L1_ACTIVE, 'Disable Level 2 Shadow')}
                label="Disable Level 2 Shadow"
                variant="ghost"
              />
              <Btn
                onClick={() => setActivateModalOpen(true)}
                label="Activate Level 2"
                variant="primary"
              />
              <Btn
                onClick={() => applySettings(P_L1_ACTIVE, 'Disable Level 2')}
                label="Disable Level 2"
                variant="danger"
              />
            </div>
          </div>
        ) : (
          /* State A: Level 2 Inactive */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Shadow Mode:</span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">OFF</span>
            </div>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">
              Level 2 is disabled. Enable Shadow Mode to test it in parallel before activating.
            </p>
            <div className="flex flex-wrap gap-3">
              <Btn
                onClick={() => applySettings(P_L2_SHADOW, 'Enable Level 2 Shadow')}
                label="Enable Level 2 Shadow"
                variant="secondary"
              />
              <Btn
                onClick={() => applySettings(P_L2_ACTIVE, 'Activate Level 2')}
                label="Activate Level 2"
                variant="primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Level 2 Auto Learning Feedback ─────────────────────────────────── */}
      {isL2Shadow && isAdmin && (
        <div className="card rounded-lg p-6 space-y-4 border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
          <div>
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Auto Learning Feedback</h2>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
              Compare L2 shadow predictions against actual monthly expenses to generate automatic training feedback.
              This helps the model learn from real data without manual intervention.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                Month (YYYY-MM)
              </label>
              <input
                type="text"
                placeholder="e.g., 2026-06"
                value={autoFeedbackMonth}
                onChange={(e) => setAutoFeedbackMonth(e.target.value)}
                disabled={autoFeedbackLoading}
                className="w-full px-4 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text disabled:opacity-60 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Btn
              onClick={handleGenerateAutoFeedback}
              label={autoFeedbackLoading ? '⏳ Generating...' : '🤖 Generate Auto Feedback'}
              variant="secondary"
              disabled={autoFeedbackLoading || !autoFeedbackMonth}
            />
          </div>

          <div className="text-xs text-blue-600 dark:text-blue-300">
            💡 Auto feedback will compare predictions from {autoFeedbackMonth} with actual expenses and create training records automatically.
          </div>
        </div>
      )}

      {/* ── Activate Level 2 Modal ── */}
      {activateModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md w-full mx-4 border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-2">Activate Level 2?</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-6">
              Level 2 will move from shadow mode to production. All users will receive Level 2 predictions.
              Level 1 remains available as fallback.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setActivateModalOpen(false)}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => applySettings(P_L2_ACTIVE, 'Activate Level 2')}
                disabled={busy}
                className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors"
              >
                {busy ? '…' : 'Yes, Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Recent Pipeline Runs ──────────────────────────────────────── */}
      {health?.recentRuns && health.recentRuns.length > 0 && (
        <div className="card rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">📋 Recent Pipeline Runs</h2>
          <div className="space-y-2">
            {health.recentRuns.slice(0, 5).map((run, idx) => (
              <div key={idx} className="border border-light-border dark:border-dark-border rounded p-3 bg-light-bg dark:bg-dark-bg/50">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-light-text dark:text-dark-text text-sm">
                    {new Date(run.startedAt?.toDate?.() || run.startedAt).toLocaleString()}
                  </p>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    run.status === 'completed' ? 'bg-green-100 text-green-700' :
                    run.status === 'partial_success' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {run.status}
                  </span>
                </div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
                  Users: {run.summary?.usersProcessed || 0} | Predictions: {run.summary?.predictionsCreated || 0} |
                  Errors: {run.errorCount || 0}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── ML Debug Console / Logs ───────────────────────────────────── */}
      {health?.recentErrors && health.recentErrors.length > 0 && (
        <div className="card rounded-lg p-6 space-y-4 border-2 border-red-300 dark:border-red-700">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">🚨 Recent Errors</h2>
          <div className="space-y-2">
            {health.recentErrors.slice(0, 10).map((error, idx) => (
              <div key={idx} className="border border-red-300 dark:border-red-700 rounded p-3 bg-red-50 dark:bg-red-950/20">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-mono text-xs text-red-700 dark:text-red-300 font-semibold">{error.source} / {error.stage}</p>
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {new Date(error.createdAt?.toDate?.() || error.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mb-1">{error.message}</p>
                {error.userId && (
                  <p className="text-xs text-red-600 dark:text-red-400">User: {error.userId}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── ML Model Information ──────────────────────────────────────── */}
      <div className="card rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <strong>📌 Current L2 Implementation:</strong> Simplified baseline with manual/auto calibration
          <br/>
          <strong>🔧 Model Type:</strong> Not actual Python ML model (supervised learning not active yet)
          <br/>
          <strong>📊 Learning Method:</strong> Correction factor calibration from manual &amp; auto feedback
          <br/>
          <strong>🎯 Future:</strong> Real Python ML model with feature engineering, retraining, personalization
        </p>
      </div>

      {/* ── Debug Box ── */}
      <div className="card rounded-lg p-4 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700">
        <details>
          <summary className="cursor-pointer font-mono text-xs text-slate-700 dark:text-slate-300 select-none">
            🔧 Debug: System State
          </summary>
          <pre className="mt-2 text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-auto max-h-64">
{JSON.stringify({
  predictionSettings: settings,
  mlHealth: {
    l2ShadowEnabled: health?.health.l2ShadowEnabled,
    l2Enabled: health?.health.l2Enabled,
    activePredictionLevel: health?.health.activePredictionLevel,
  },
  pipelineStatus: health?.pipelineStatus,
  feedbackCounts: {
    manual: health?.feedbackStats.totalManualFeedback,
    auto: health?.feedbackStats.totalAutoFeedback,
  },
  derivedState: { l1Status, l2Status, shadowModeOn, isL2Active, isL2Shadow },
  uiState: {
    settingsLoading,
    settingsError,
    healthLoading,
    healthError,
    actionLoading,
    statusMessage,
    statusType,
  },
  hasIpcApi: !!window.ipcApi,
  ...debugInfo,
}, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}
