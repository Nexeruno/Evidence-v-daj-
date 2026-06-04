import { useMlMetrics, useMlRuns } from '@/hooks/useFirestore'

export function MlDashboardPage() {
  const metrics = useMlMetrics()
  const { data: recentRuns, loading: runsLoading, error: runsError } = useMlRuns(10)

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'text-green-600'
      case 'shadow': return 'text-blue-600'
      case 'rollback': return 'text-orange-600'
      default: return 'text-light-textMuted dark:text-dark-textMuted'
    }
  }

  const getRunStatusClasses = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      case 'failed': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      default: return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    }
  }

  const statusEmoji = {
    'active': '✅',
    'shadow': '🔄',
    'rollback': '↩️'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML System Overview</h1>

      {/* ML Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 1 Status</p>
          <p className="text-2xl font-bold mt-2 text-green-600">✅ Active</p>
          <p className="text-xs mt-2 text-light-textMuted dark:text-dark-textMuted">Baseline predictions</p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 2 Status</p>
          <p className={`text-2xl font-bold mt-2 ${getStatusColor(metrics?.level2Status as string)}`}>
            {statusEmoji[metrics?.level2Status as keyof typeof statusEmoji] || '⚠️'} {metrics?.level2Status || 'Unknown'}
          </p>
          <p className="text-xs mt-2 text-light-textMuted dark:text-dark-textMuted">ML model</p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Shadow Accuracy</p>
          <p className="text-2xl font-bold mt-2 text-blue-500 dark:text-blue-400">
            {metrics?.shadowAccuracy ? `${(metrics.shadowAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* ML Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Total Level 1 Runs</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">{metrics?.totalRunsLevel1 || 0}</p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Total Level 2 Runs</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">{metrics?.totalRunsLevel2 || 0}</p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Training Size</p>
          <p className="text-sm mt-2 text-light-textMuted dark:text-dark-textMuted">See Training Data page</p>
        </div>
      </div>

      {/* Recent Runs */}
      <div className="card rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Recent ML Runs</h2>
        </div>
        <div className="overflow-x-auto">
          {runsError ? (
            <div className="px-6 py-8 text-center">
              <div className="font-semibold mb-2 text-red-600 dark:text-red-400">⚠️ Error loading runs</div>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{runsError.message}</p>
            </div>
          ) : runsLoading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : recentRuns.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No runs yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Timestamp</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Level</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Accuracy</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Time (ms)</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run: any) => (
                  <tr key={run.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {new Date(run.timestamp).toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 ${run.level === 1 ? 'text-green-600' : 'text-blue-600'}`}>
                      L{run.level}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getRunStatusClasses(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.accuracy ? `${(run.accuracy * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">{run.processingTime || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ML Controls - TODO: Fáze 3 */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-light-text dark:text-dark-text">ML Pipeline Control</h2>
        <p className="mb-4 text-light-textMuted dark:text-dark-textMuted">🔧 Coming in Fáze 3: Run Level 2, toggle shadow mode, model rollback</p>
      </div>
    </div>
  )
}
