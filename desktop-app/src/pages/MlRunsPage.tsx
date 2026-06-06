import { useState } from 'react'
import { useMlRuns } from '@/hooks/useFirestore'

function formatTs(ts: any): string {
  if (!ts) return '—'
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString()
  } catch { return '—' }
}

export function MlRunsPage() {
  const [level, setLevel] = useState<'all' | '1' | '2'>('all')
  const [status, setStatus] = useState<'all' | 'success' | 'partial_success' | 'failed'>('all')
  const { data: allRuns, loading, error } = useMlRuns(50)

  const filteredRuns = allRuns.filter((run: any) => {
    const levelMatch = level === 'all' || String(run.pipelineLevel) === level
    const statusMatch = status === 'all' || run.status === status
    return levelMatch && statusMatch
  })

  const getStatusClasses = (s: string) => {
    if (s === 'success' || s === 'completed')
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    if (s === 'partial_success')
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
    if (s === 'failed')
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
  }

  const l1Runs = filteredRuns.filter((r: any) => r.pipelineLevel === 1)
  const l2Runs = filteredRuns.filter((r: any) => r.pipelineLevel === 2)
  const l2WithConf = l2Runs.filter((r: any) => r.averageConfidence)
  const avgL2Conf = l2WithConf.length > 0
    ? l2WithConf.reduce((s: number, r: any) => s + r.averageConfidence, 0) / l2WithConf.length
    : null

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
              <option value="1">Level 1</option>
              <option value="2">Level 2 (Shadow)</option>
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
              <option value="success">Success</option>
              <option value="partial_success">Partial Success</option>
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
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading…</div>
          ) : filteredRuns.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">
              {allRuns.length === 0 ? 'No ML runs recorded yet. Run the pipeline first.' : 'No runs match the filter.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Started</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Level</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Predictions</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Avg Confidence</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Duration</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run: any) => (
                  <tr key={run.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text whitespace-nowrap text-xs">
                      {formatTs(run.startedAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={run.pipelineLevel === 1
                        ? 'text-green-600 dark:text-green-400 font-semibold'
                        : 'text-blue-600 dark:text-blue-400 font-semibold'}>
                        L{run.pipelineLevel ?? '?'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusClasses(run.status)}`}>
                        {run.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.predictionsCreated ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.averageConfidence != null ? `${run.averageConfidence.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted text-xs">
                      {run.modelType ?? run.mode ?? '—'}
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
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Successful Runs</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {filteredRuns.filter((r: any) => r.status === 'success' || r.status === 'completed').length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Failed Runs</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
            {filteredRuns.filter((r: any) => r.status === 'failed').length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">L1 Runs (filtered)</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">
            {l1Runs.length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Avg L2 Confidence</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">
            {avgL2Conf != null ? `${avgL2Conf.toFixed(1)}%` : '—'}
          </p>
          {l2WithConf.length === 0 && l2Runs.length > 0 && (
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">No confidence data in older runs</p>
          )}
        </div>
      </div>
    </div>
  )
}
