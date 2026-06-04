import { useState } from 'react'
import { useMlRuns } from '@/hooks/useFirestore'

export function MlRunsPage() {
  const [level, setLevel] = useState<'all' | 1 | 2>('all')
  const [status, setStatus] = useState<'all' | 'pending' | 'completed' | 'failed'>('all')
  const { data: allRuns, loading, error } = useMlRuns(50)

  const filteredRuns = allRuns.filter((run: any) => {
    const levelMatch = level === 'all' || run.level === level
    const statusMatch = status === 'all' || run.status === status
    return levelMatch && statusMatch
  })

  const getStatusClasses = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      case 'failed': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      default: return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Runs History</h1>

      {/* Filters */}
      <div className="card rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as any)}
              className="select-field rounded-lg"
            >
              <option value="all">All Levels</option>
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="select-field rounded-lg"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Runs Table */}
      <div className="card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {error ? (
            <div className="px-6 py-8 text-center">
              <div className="text-red-600 dark:text-red-400 font-semibold mb-2">⚠️ Error loading runs</div>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{error.message}</p>
            </div>
          ) : loading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : filteredRuns.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No runs match the filter</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Timestamp</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Level</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Accuracy</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Time (ms)</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Dataset Size</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run: any) => (
                  <tr key={run.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text whitespace-nowrap">
                      {new Date(run.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={run.level === 1 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-blue-600 dark:text-blue-400 font-semibold'}>
                        L{run.level}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusClasses(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.accuracy ? `${(run.accuracy * 100).toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">{run.processingTime || '-'}</td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">{run.datasetSize || '-'}</td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted text-xs max-w-xs truncate" title={run.notes}>
                      {run.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Completed Runs</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {filteredRuns.filter((r: any) => r.status === 'completed').length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Failed Runs</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
            {filteredRuns.filter((r: any) => r.status === 'failed').length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Avg Accuracy (L1)</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">
            {filteredRuns.filter((r: any) => r.level === 1 && r.accuracy).length === 0 ? '-' :
              `${(filteredRuns.filter((r: any) => r.level === 1 && r.accuracy).reduce((sum: number, r: any) => sum + r.accuracy, 0) / filteredRuns.filter((r: any) => r.level === 1 && r.accuracy).length * 100).toFixed(1)}%`}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Avg Accuracy (L2)</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">
            {filteredRuns.filter((r: any) => r.level === 2 && r.accuracy).length === 0 ? '-' :
              `${(filteredRuns.filter((r: any) => r.level === 2 && r.accuracy).reduce((sum: number, r: any) => sum + r.accuracy, 0) / filteredRuns.filter((r: any) => r.level === 2 && r.accuracy).length * 100).toFixed(1)}%`}
          </p>
        </div>
      </div>
    </div>
  )
}
