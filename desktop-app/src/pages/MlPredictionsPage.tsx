import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { L2TrainingFeedbackModal } from '@/components/L2TrainingFeedbackModal'

interface L2ShadowPrediction {
  id?: string
  userId: string
  month: string
  totalPredictedExpense: number
  pipelineLevel: number
  shadowMode: boolean
  trainingDataUsed?: boolean
  trainingDataCount?: number
  manualCorrectionFactor?: number
  confidence?: string
  confidenceScore?: number
  createdAt?: any
  isRealMlModel?: boolean
}

export function MlPredictionsPage() {
  const { user } = useAuth()
  const { role: userRole } = useUserRole(user)
  const [selectedLevel, setSelectedLevel] = useState<1 | 2>(1)
  const [predictions, setPredictions] = useState<L2ShadowPrediction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [selectedPredictionForFeedback, setSelectedPredictionForFeedback] = useState<L2ShadowPrediction | null>(null)

  // Placeholder: In production, fetch from adminGetMlPredictions Cloud Function
  // For now, show L2 shadow predictions from local state
  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        setLoading(true)
        setError(null)
        // Placeholder Level 2 shadow predictions for demo
        if (selectedLevel === 2) {
          setPredictions([
            {
              userId: 'user-001',
              month: '2026-07',
              totalPredictedExpense: 15500,
              pipelineLevel: 2,
              shadowMode: true,
              trainingDataUsed: false,
              trainingDataCount: 0,
              confidence: 'medium',
              confidenceScore: 70,
              isRealMlModel: false,
            },
            {
              userId: 'user-002',
              month: '2026-07',
              totalPredictedExpense: 12300,
              pipelineLevel: 2,
              shadowMode: true,
              trainingDataUsed: true,
              trainingDataCount: 2,
              manualCorrectionFactor: 0.97,
              confidence: 'medium',
              confidenceScore: 70,
              isRealMlModel: false,
            },
          ])
        } else {
          setPredictions([])
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load predictions'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    fetchPredictions()
  }, [selectedLevel])

  const getStatusClasses = (status: string) => {
    switch(status) {
      case 'success': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      case 'error': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
    }
  }

  const handleOpenFeedbackModal = (pred: L2ShadowPrediction) => {
    setSelectedPredictionForFeedback(pred)
    setFeedbackModalOpen(true)
  }

  const handleFeedbackSuccess = () => {
    // Refresh predictions
    setFeedbackModalOpen(false)
  }

  const isAdmin = userRole && ['admin', 'ml_admin'].includes(userRole)

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
          {error ? (
            <div className="px-6 py-8 text-center text-red-600 dark:text-red-400">⚠️ {error}</div>
          ) : loading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading predictions...</div>
          ) : predictions.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-light-textMuted dark:text-dark-textMuted mb-2">No predictions available yet</p>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Predictions are collected once users make transactions</p>
            </div>
          ) : selectedLevel === 2 ? (
            <div className="space-y-4">
              {predictions.map((pred) => (
                <div key={`${pred.userId}-${pred.month}`} className="border border-light-border dark:border-dark-border rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Prediction info */}
                    <div>
                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase mb-2">User</p>
                      <p className="text-sm font-semibold text-light-text dark:text-dark-text mb-3">{pred.userId}</p>

                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase mb-2">Month</p>
                      <p className="text-sm text-light-text dark:text-dark-text mb-3">{pred.month}</p>

                      <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase mb-2">Predicted Total</p>
                      <p className="text-lg font-bold text-light-text dark:text-dark-text">{pred.totalPredictedExpense.toLocaleString()} Kč</p>
                    </div>

                    {/* Right: Model info & training data */}
                    <div className="border-l border-light-border dark:border-dark-border pl-4 md:border-l-0 md:border-t md:border-t-light-border dark:md:border-t-dark-border md:pt-4 md:pl-0">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-light-textMuted dark:text-dark-textMuted">Model:</span>
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            L2 Shadow Baseline
                          </span>
                          {pred.isRealMlModel === false && (
                            <span className="text-xs text-orange-600 dark:text-orange-400" title="Simplified baseline, not actual Python ML">
                              (simplified)
                            </span>
                          )}
                        </div>

                        {pred.trainingDataUsed ? (
                          <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded p-2">
                            <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">✅ Training Data Used</p>
                            <p className="text-xs text-green-600 dark:text-green-200">
                              {pred.trainingDataCount} records, factor: {pred.manualCorrectionFactor?.toFixed(2)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">No training data yet</p>
                        )}

                        {isAdmin && (
                          <button
                            onClick={() => handleOpenFeedbackModal(pred)}
                            className="w-full px-3 py-2 rounded-lg bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                          >
                            ➕ Add Feedback
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
      {selectedLevel === 1 && (
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
      )}

      {selectedLevel === 2 && (
        <div className="card rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            💡 <strong>L2 Shadow Mode:</strong> These are simplified baseline predictions with optional manual calibration. Not actual Python ML model.
            {isAdmin && ' Admin can add feedback to improve predictions.'}
          </p>
        </div>
      )}

      {/* Training Feedback Modal */}
      {selectedPredictionForFeedback && (
        <L2TrainingFeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => setFeedbackModalOpen(false)}
          onSuccess={handleFeedbackSuccess}
          prediction={selectedPredictionForFeedback}
        />
      )}
    </div>
  )
}
