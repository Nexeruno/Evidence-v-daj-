import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePredictionSettings } from '@/hooks/useMlPipelineControl'
import { useMlRuns } from '@/hooks/useFirestore'
import { SYMBOLS } from '@/utils/symbols'

export function MlDashboardPage() {
  const location = useLocation()
  const { settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = usePredictionSettings()
  const { data: recentRuns, loading: runsLoading, error: runsError } = useMlRuns(10)
  useEffect(() => {
    if (location.pathname === '/ml/dashboard') {
      reloadSettings()
    }
  }, [location.pathname, reloadSettings])

  // ── Derived state — identical logic to MlControlPage ─────────────────────
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

  const productionModel = isL2Active ? 'Level 2' : 'Level 1'

  const stateDescription =
    settingsLoading ? 'Loading configuration...' :
    settingsError   ? 'Prediction settings could not be loaded.' :
    isL2Active      ? 'Level 2 AI model is active. Level 1 remains available as fallback.' :
    isL2Shadow      ? 'Level 1 is active. Level 2 is running in shadow mode and does not affect users.' :
                      'Level 1 baseline model is active. Level 2 is inactive.'

  const shadowAccuracyText = (() => {
    if (settingsLoading) return 'Loading...'
    if (settingsError)   return 'Prediction settings could not be loaded.'
    if (isL2Active)      return 'Level 2 is active. Shadow accuracy is no longer the primary metric.'
    if (isL2Shadow) {
      const l2Runs = recentRuns.filter((r: any) => r.pipelineLevel === 2 && r.averageConfidence)
      if (!l2Runs.length) return 'Not enough evaluation data yet.'
      const avg = l2Runs.reduce((s: number, r: any) => s + (r.averageConfidence ?? 0), 0) / l2Runs.length
      return `Avg L2 Confidence: ${avg.toFixed(1)}%`
    }
    return 'Shadow confidence unavailable because Level 2 is inactive.'
  })()

  const STATUS_BADGE: Record<string, string> = {
    Active:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    Fallback: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    Shadow:   'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    Inactive: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  }

  const getRunStatusClasses = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      case 'failed':    return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      default:          return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML System Overview</h1>

      {/* Settings load error */}
      {settingsError && !settingsLoading && (
        <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm">
          {SYMBOLS.WARNING} Prediction settings could not be loaded: {settingsError}
        </div>
      )}

      {/* State summary bar */}
      <div className="card rounded-lg p-4 border border-light-border dark:border-dark-border">
        <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{stateDescription}</p>
        <div className="flex flex-wrap gap-4 mt-2 items-center">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-light-textMuted dark:text-dark-textMuted">Shadow Mode:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              shadowModeOn
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}>
              {settingsLoading ? '…' : shadowModeOn ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-light-textMuted dark:text-dark-textMuted">Production model:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              isL2Active
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {settingsLoading ? '…' : productionModel}
            </span>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Level 1 */}
        <div className={`card rounded-lg p-5 border-2 ${l1Status === 'Active' ? 'border-green-500 dark:border-green-600' : l1Status === 'Fallback' ? 'border-orange-400 dark:border-orange-500' : 'border-transparent'}`}>
          <p className="text-xs font-semibold text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide">Level 1</p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Baseline model</p>
          <div className="mt-3">
            {settingsLoading
              ? <span className="text-light-textMuted dark:text-dark-textMuted text-sm">…</span>
              : <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${STATUS_BADGE[l1Status] ?? STATUS_BADGE.Inactive}`}>{l1Status}</span>
            }
          </div>
        </div>

        {/* Level 2 */}
        <div className={`card rounded-lg p-5 border-2 ${l2Status === 'Active' ? 'border-green-500 dark:border-green-600' : l2Status === 'Shadow' ? 'border-blue-400 dark:border-blue-500' : 'border-transparent'}`}>
          <p className="text-xs font-semibold text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide">Level 2</p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">AI / ML model</p>
          <div className="mt-3">
            {settingsLoading
              ? <span className="text-light-textMuted dark:text-dark-textMuted text-sm">…</span>
              : <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${STATUS_BADGE[l2Status] ?? STATUS_BADGE.Inactive}`}>{l2Status}</span>
            }
          </div>
        </div>

        {/* Shadow Mode */}
        <div className="card rounded-lg p-5">
          <p className="text-xs font-semibold text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide">Shadow Mode</p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">L2 parallel testing</p>
          <div className="mt-3">
            {settingsLoading
              ? <span className="text-light-textMuted dark:text-dark-textMuted text-sm">…</span>
              : <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${shadowModeOn ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                  {shadowModeOn ? 'ON' : 'OFF'}
                </span>
            }
          </div>
        </div>

        {/* Shadow Accuracy */}
        <div className="card rounded-lg p-5">
          <p className="text-xs font-semibold text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide">Shadow Accuracy</p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">L2 vs L1 comparison</p>
          <p className="mt-3 text-sm text-light-text dark:text-dark-text leading-snug">{shadowAccuracyText}</p>
        </div>
      </div>

      {/* Run stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card rounded-lg p-5">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold">Recent Runs (L1)</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">
            {runsLoading ? '…' : recentRuns.filter((r: any) => r.pipelineLevel === 1).length}
          </p>
        </div>
        <div className="card rounded-lg p-5">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold">Recent Runs (L2)</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">
            {runsLoading ? '…' : recentRuns.filter((r: any) => r.pipelineLevel === 2).length}
          </p>
        </div>
        <div className="card rounded-lg p-5">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold">Active Configuration</p>
          <p className="text-sm mt-2 text-light-text dark:text-dark-text">
            {settingsLoading ? 'Loading…' : !settings ? SYMBOLS.DASH : `Level ${settings.activePredictionLevel} · L2 ${settings.level2Enabled ? (settings.level2ShadowMode ? 'Shadow' : 'Enabled') : 'Disabled'}`}
          </p>
        </div>
      </div>

      {/* Recent Runs table */}
      <div className="card rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Recent ML Runs</h2>
        </div>
        <div className="overflow-x-auto">
          {runsError ? (
            <div className="px-6 py-8 text-center">
              <p className="font-semibold text-red-600 dark:text-red-400 mb-1">{SYMBOLS.WARNING} Error loading runs</p>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{runsError.message}</p>
            </div>
          ) : runsLoading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : recentRuns.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No ML runs recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  {['Started', 'Level', 'Status', 'Confidence / Predictions', 'Duration'].map(h => (
                    <th key={h} className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {recentRuns.map((run: any) => (
                  <tr key={run.id} className="hover:bg-light-bg dark:hover:bg-dark-bg transition-colors">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text text-xs">
                      {run.startedAt
                        ? new Date(run.startedAt.seconds ? run.startedAt.seconds * 1000 : run.startedAt).toLocaleString()
                        : SYMBOLS.DASH}
                    </td>
                    <td className={`px-6 py-4 font-semibold ${run.pipelineLevel === 1 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      L{run.pipelineLevel ?? SYMBOLS.DASH}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getRunStatusClasses(run.status)}`}>
                        {run.status ?? SYMBOLS.DASH}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.averageConfidence ? `${run.averageConfidence.toFixed(1)}%` : run.predictionsCreated != null ? `${run.predictionsCreated} pred.` : SYMBOLS.DASH}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : SYMBOLS.DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  )
}
