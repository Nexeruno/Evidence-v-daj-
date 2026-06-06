import { useMlRuns, useAllUsers, useAppConfig } from '@/hooks/useFirestore'

function formatTs(ts: any): string {
  if (!ts) return 'Never'
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return 'Never'
    const diff = Date.now() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  } catch {
    return 'Never'
  }
}

export function DashboardPage() {
  const { data: users, loading: usersLoading } = useAllUsers()
  const { data: runs, loading: runsLoading } = useMlRuns(50)
  const { data: configData, loading: configLoading } = useAppConfig()

  const loading = usersLoading || runsLoading || configLoading

  // Derive stats from real mlRuns documents
  const l1Runs = runs.filter((r: any) => r.pipelineLevel === 1)
  const l2Runs = runs.filter((r: any) => r.pipelineLevel === 2)
  const latestRun = runs[0] ?? null

  const avgConfidence = l2Runs.length > 0
    ? l2Runs.reduce((sum: number, r: any) => sum + (r.averageConfidence ?? 0), 0) / l2Runs.length
    : null

  const level1Active =
    !configData ||
    (configData.activePredictionLevel === 1 && !configData.level2Enabled) ||
    (configData.activePredictionLevel === 1 && configData.level2ShadowMode === true)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">System Overview</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Total Users</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">
            {usersLoading ? '…' : users.length}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Last ML Run</p>
          <p className="text-sm mt-2 text-light-textMuted dark:text-dark-textMuted">
            {runsLoading ? '…' : latestRun ? formatTs(latestRun.startedAt) : 'Never'}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 1 Status</p>
          <p className="text-3xl font-bold mt-2">
            {loading ? '…' : (
              <span className={level1Active ? 'text-green-600' : 'text-orange-500'}>
                {level1Active ? '✅' : '⬇️'}
              </span>
            )}
          </p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
            {configLoading ? '' : level1Active ? 'Active' : 'Fallback'}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Active Config</p>
          <p className="text-sm font-semibold mt-2 text-light-text dark:text-dark-text">
            {configLoading ? '…' : !configData ? '—' :
              `L${configData.activePredictionLevel} · L2 ${configData.level2Enabled ? (configData.level2ShadowMode ? 'Shadow' : 'Enabled') : 'Disabled'}`
            }
          </p>
        </div>
      </div>

      {/* ML Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 1 Runs (last 50)</p>
          <p className="text-2xl font-bold mt-2 text-light-text dark:text-dark-text">
            {runsLoading ? '…' : l1Runs.length}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 2 Runs (last 50)</p>
          <p className="text-2xl font-bold mt-2 text-light-text dark:text-dark-text">
            {runsLoading ? '…' : l2Runs.length}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Avg L2 Confidence</p>
          <p className="text-2xl font-bold mt-2 text-blue-500 dark:text-blue-400">
            {runsLoading ? '…' : avgConfidence !== null ? `${avgConfidence.toFixed(1)}%` : 'N/A'}
          </p>
          {!runsLoading && avgConfidence === null && (
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">No L2 shadow runs yet</p>
          )}
        </div>
      </div>

      {/* Recent Runs */}
      <div className="card rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Recent ML Runs</h2>
        </div>
        <div className="overflow-x-auto">
          {runsLoading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No ML runs recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  {['Started', 'Level', 'Status', 'Predictions', 'Duration'].map(h => (
                    <th key={h} className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {runs.slice(0, 10).map((run: any) => (
                  <tr key={run.id} className="hover:bg-light-bg dark:hover:bg-dark-bg transition-colors">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text text-xs">
                      {run.startedAt
                        ? new Date(run.startedAt.seconds ? run.startedAt.seconds * 1000 : run.startedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className={`px-6 py-4 font-semibold ${run.pipelineLevel === 1 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      L{run.pipelineLevel ?? '?'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        run.status === 'success' || run.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : run.status === 'failed'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      }`}>
                        {run.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.predictionsCreated ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
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
