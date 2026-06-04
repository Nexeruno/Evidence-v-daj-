import { useState } from 'react'
import { useFirestore } from '@/hooks/useFirestore'
import { orderBy, limit, where } from 'firebase/firestore'

export function MlPredictionsPage() {
  const [selectedLevel, setSelectedLevel] = useState<1 | 2>(1)
  const [pageSize] = useState(20)

  const constraints = [where('level', '==', selectedLevel), orderBy('timestamp', 'desc'), limit(pageSize)]
  const { data: predictions, loading } = useFirestore('mlPredictions', constraints)

  const getStatusClasses = (status: string) => {
    switch(status) {
      case 'success': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      case 'error': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Predictions</h1>

      {/* Filter */}
      <div className="card rounded-lg p-6">
        <div className="max-w-xs">
          <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Level</label>
          <div className="flex gap-2">
            {[1, 2].map(level => (
              <button
                key={level}
                onClick={() => setSelectedLevel(level as 1 | 2)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors duration-200 ${
                  selectedLevel === level
                    ? level === 1 ? 'bg-green-600 dark:bg-green-700 text-white' : 'bg-blue-600 dark:bg-blue-700 text-white'
                    : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:opacity-80'
                }`}
              >
                Level {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Predictions Table */}
      <div className="card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : predictions.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No predictions yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Timestamp</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">User</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Input</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Prediction</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Confidence</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Status</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred: any) => (
                  <tr key={pred.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text whitespace-nowrap text-xs">
                      {new Date(pred.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">{pred.userId || '-'}</td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted text-xs max-w-sm truncate" title={pred.input}>
                      {pred.input || '-'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text font-semibold">{pred.prediction || '-'}</td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {pred.confidence ? `${(pred.confidence * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusClasses(pred.status)}`}>
                        {pred.status || 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Total Predictions</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">{predictions.length}</p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Successful</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {predictions.filter((p: any) => p.status === 'success').length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Avg Confidence</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">
            {predictions.filter((p: any) => p.confidence).length === 0 ? '-' :
              `${(predictions.filter((p: any) => p.confidence).reduce((sum: number, p: any) => sum + p.confidence, 0) / predictions.filter((p: any) => p.confidence).length * 100).toFixed(1)}%`}
          </p>
        </div>
      </div>
    </div>
  )
}
