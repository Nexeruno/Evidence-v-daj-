import { useMlMetrics, useActiveSessions } from '@/hooks/useFirestore'

export function DashboardPage() {
  const metrics = useMlMetrics()
  const { data: activeSessions, loading: sessionsLoading } = useActiveSessions()

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">System Overview</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Total Users</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">
            {metrics?.totalUsers || 0}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Active Sessions</p>
          <p className="text-3xl font-bold mt-2 text-light-text dark:text-dark-text">
            {sessionsLoading ? '...' : activeSessions.length}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Last ML Run</p>
          <p className="text-sm mt-2 text-light-textMuted dark:text-dark-textMuted">
            {metrics?.lastRunTime ? formatTime(metrics.lastRunTime) : 'Never'}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 1 Status</p>
          <p className="text-3xl font-bold mt-2">
            <span className={metrics?.level1Status === 'active' ? 'text-green-600' : 'text-red-600'}>
              {metrics?.level1Status === 'active' ? '✅' : '⚠️'}
            </span>
          </p>
        </div>
      </div>

      {/* ML Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 1 Runs</p>
          <p className="text-2xl font-bold mt-2 text-light-text dark:text-dark-text">
            {metrics?.totalRunsLevel1 || 0}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 2 Runs</p>
          <p className="text-2xl font-bold mt-2 text-light-text dark:text-dark-text">
            {metrics?.totalRunsLevel2 || 0}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Shadow Accuracy</p>
          <p className="text-2xl font-bold mt-2 text-blue-500 dark:text-blue-400">
            {metrics?.shadowAccuracy ? `${(metrics.shadowAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Active Sessions List */}
      <div className="card rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Active Sessions</h2>
        </div>
        <div className="overflow-x-auto">
          {sessionsLoading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : activeSessions.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No active sessions</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">User</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Last Activity</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Predictions</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.slice(0, 10).map((session: any) => (
                  <tr key={session.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">{session.userName || 'Unknown'}</td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted">{formatTime(session.lastActivity)}</td>
                    <td className="px-6 py-4 font-semibold text-light-text dark:text-dark-text">{session.predictions || 0}</td>
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
