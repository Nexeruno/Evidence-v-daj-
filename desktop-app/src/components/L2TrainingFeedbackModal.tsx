import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useMlPipelineControl } from '@/hooks/useMlPipelineControl'

interface L2TrainingFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  prediction: {
    id?: string
    userId: string
    month: string
    totalPredictedExpense: number
    trainingDataUsed?: boolean
    trainingDataCount?: number
    manualCorrectionFactor?: number
  }
}

export function L2TrainingFeedbackModal({ isOpen, onClose, onSuccess, prediction }: L2TrainingFeedbackModalProps) {
  const { getIdToken } = useAuth()
  const { createL2TrainingFeedback } = useMlPipelineControl()

  const [actualTotal, setActualTotal] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      if (!actualTotal || isNaN(Number(actualTotal))) {
        setError('Please enter a valid actual total')
        return
      }

      const token = await getIdToken()
      const result = await createL2TrainingFeedback(token, {
        userId: prediction.userId,
        predictionId: prediction.id,
        month: prediction.month,
        predictedTotal: prediction.totalPredictedExpense,
        actualTotal: Number(actualTotal),
        note: note || undefined,
      })

      if (result?.ok) {
        setSuccessMsg(`✅ Feedback created! Error: ${(Number(actualTotal) - prediction.totalPredictedExpense).toFixed(0)} Kč`)
        setTimeout(() => {
          onSuccess()
          setActualTotal('')
          setNote('')
          onClose()
        }, 1500)
      } else {
        setError(result?.error || 'Failed to create feedback')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
      <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md w-full mx-4 border border-light-border dark:border-dark-border">
        <h2 className="text-xl font-bold text-light-text dark:text-dark-text mb-1">L2 Shadow Training Feedback</h2>
        <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-6">
          Add manual feedback to calibrate the shadow model for user {prediction.userId}
        </p>

        {/* Current training data info */}
        {prediction.trainingDataUsed && (
          <div className="mb-6 p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Current training data:</p>
            <p className="text-xs text-blue-600 dark:text-blue-200">
              {prediction.trainingDataCount} records, correction factor: {prediction.manualCorrectionFactor?.toFixed(2)}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Month */}
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">
              Month
            </label>
            <input
              type="text"
              value={prediction.month}
              disabled
              className="w-full px-3 py-2 rounded-lg bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text disabled:opacity-60 text-sm"
            />
          </div>

          {/* Predicted Total */}
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">
              Predicted Total (Kč)
            </label>
            <input
              type="number"
              value={prediction.totalPredictedExpense}
              disabled
              className="w-full px-3 py-2 rounded-lg bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text disabled:opacity-60 text-sm"
            />
          </div>

          {/* Actual Total */}
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">
              Actual Total (Kč) *
            </label>
            <input
              type="number"
              value={actualTotal}
              onChange={(e) => setActualTotal(e.target.value)}
              placeholder="e.g., 14500"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text disabled:opacity-60 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {actualTotal && (
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">
                Error: {(Number(actualTotal) - prediction.totalPredictedExpense).toFixed(0)} Kč ({
                  (((Number(actualTotal) - prediction.totalPredictedExpense) / prediction.totalPredictedExpense) * 100).toFixed(1)
                }%)
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Lower expenses on food this month"
              disabled={loading}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text disabled:opacity-60 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
              <p className="text-xs text-red-700 dark:text-red-300">❌ {error}</p>
            </div>
          )}

          {/* Success */}
          {successMsg && (
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700">
              <p className="text-xs text-green-700 dark:text-green-300">{successMsg}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !actualTotal}
              className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold transition-colors"
            >
              {loading ? '⏳ Saving...' : '💾 Save Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
