import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { L2TrainingFeedbackModal } from '@/components/L2TrainingFeedbackModal'
import { useAdminUserSelector, userLabel } from '@/hooks/useAdminUserSelector'

function fmtTs(ts: any): string {
  if (!ts) return '—'
  try {
    if (ts.seconds != null) return new Date(ts.seconds * 1000).toLocaleString()
    if (ts._seconds != null) return new Date(ts._seconds * 1000).toLocaleString()
    return new Date(ts).toLocaleString()
  } catch (e) { return '—' }
}

interface L2ShadowPrediction {
  id?: string
  userId: string
  month: string
  totalPredictedExpense: number
  categories?: Record<string, number>
  pipelineLevel: number
  shadowMode: boolean
  trainingDataUsed?: boolean
  trainingDataCount?: number
  manualCorrectionFactor?: number
  autoCorrectionFactor?: number
  finalCorrectionFactor?: number
  confidence?: string
  confidenceScore?: number
  confidenceBreakdown?: string[]
  createdAt?: any
  isRealMlModel?: boolean
  aiProfileUsed?: boolean
  aiProfileVersion?: string
  aiProfileStatus?: 'fresh' | 'stale' | 'missing'
  aiProfileStale?: boolean
  personalizedAdjustmentFactor?: number
  personalizedConfidenceAdjustment?: number
  appliedProfileAdjustments?: string[]
  personalizedExplanation?: string
  predictionWarnings?: string[]
  basePredictionAmount?: number
  trainingDataCorrectionFactor?: number
  aiProfileAdjustmentFactor?: number
  finalPredictedAmount?: number
  explanationBreakdown?: string[]
  categoryAdjustmentSignals?: {
    volatility?: Record<string, number>
    trend?: Record<string, number>
    stableCategories?: string[]
    volatileCategories?: string[]
  } | null
  topCategoriesAffectingPrediction?: string[]
}

interface AggregateMetrics {
  totalUsers: number
  usersWithPredictions: number
  totalPredictions: number
  totalPredictedExpense: number
  averageConfidence: number
  fallbackPredictions: number
  staleProfiles: number
  missingProfiles: number
  personalizedPredictions: number
  trainingDataUsed: number
  pipelineLevel: number | null
}

export function MlPredictionsPage() {
  const { user, getIdToken } = useAuth()
  const { role: userRole } = useUserRole(user)
  const isAdmin = userRole && ['admin', 'ml_admin'].includes(userRole)
  const { users, usersLoading, selectedUserId, selectedUser, selectUser } = useAdminUserSelector()

  const [selectedLevel, setSelectedLevel] = useState<1 | 2>(2)
  const [predictions, setPredictions] = useState<L2ShadowPrediction[]>([])
  const [aggregateMetrics, setAggregateMetrics] = useState<AggregateMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [selectedPredictionForFeedback, setSelectedPredictionForFeedback] = useState<L2ShadowPrediction | null>(null)

  // '' = All Users (admin only); specific uid = single user
  const effectiveUserId = isAdmin ? selectedUserId : (user?.uid || '')

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        if (!window.ipcApi) {
          setError('IPC API not available')
          return
        }
        const token = await getIdToken()

        // All Users mode - fetch aggregate metrics instead of predictions
        if (!effectiveUserId) {
          const metricsResult = await window.ipcApi.callCloudFunction(
            'adminGetAggregateMetrics',
            token,
            { pipelineLevel: selectedLevel }
          )
          if (metricsResult?.ok === true) {
            setAggregateMetrics(metricsResult.data as AggregateMetrics)
            setPredictions([]) // No individual predictions in aggregate mode
          } else {
            setError(metricsResult?.error || 'Failed to load aggregate metrics')
            setAggregateMetrics(null)
            setPredictions([])
          }
        } else {
          // Single user mode - fetch individual predictions
          const body: Record<string, unknown> = { pipelineLevel: selectedLevel, limit: 20 }
          body.uid = effectiveUserId
          const result = await window.ipcApi.callCloudFunction(
            'adminGetMlPredictions',
            token,
            body
          )
          if (result?.ok === true) {
            setPredictions((result.data ?? []) as L2ShadowPrediction[])
            setAggregateMetrics(null)
          } else {
            setError(result?.error || 'Failed to load predictions')
            setPredictions([])
            setAggregateMetrics(null)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
        setPredictions([])
        setAggregateMetrics(null)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedLevel, effectiveUserId, getIdToken])

  const handleOpenFeedbackModal = (pred: L2ShadowPrediction) => {
    setSelectedPredictionForFeedback(pred)
    setFeedbackModalOpen(true)
  }

  const handleFeedbackSuccess = () => {
    setFeedbackModalOpen(false)
  }

  const renderL2Card = (pred: L2ShadowPrediction) => {
    const expense = pred.totalPredictedExpense ?? null
    const baseAmt = pred.basePredictionAmount ?? null
    const finalAmt = pred.finalPredictedAmount ?? null
    const confScore = pred.confidenceScore ?? null
    const adjFactor = pred.personalizedAdjustmentFactor ?? null
    const trainingCount = pred.trainingDataCount ?? null
    const corrFactor = pred.manualCorrectionFactor ?? null
    const finalCorrFactor = pred.finalCorrectionFactor ?? null
    const hasRealExpense = expense != null && expense > 0
    const correctedAmount = expense != null && finalCorrFactor != null && finalCorrFactor !== 1.0
      ? Math.round(expense * finalCorrFactor)
      : null

    return (
      <div key={`${pred.id ?? pred.userId}-${pred.month}`} className="border border-light-border dark:border-dark-border rounded-lg p-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3 pb-2 border-b border-light-border dark:border-dark-border">
          <div>
            <p className="text-xs font-mono text-light-textMuted dark:text-dark-textMuted">{pred.userId || '—'}</p>
            <p className="text-sm font-semibold text-light-text dark:text-dark-text">{pred.month || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted">{fmtTs(pred.createdAt)}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              L{pred.pipelineLevel ?? '?'} {pred.shadowMode ? '(shadow)' : ''}
            </span>
          </div>
        </div>

        {!hasRealExpense && (
          <div className="mb-3 px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
            ⚠️ Predicted amount is 0 — no active L1 prediction available when this L2 run executed. Run L1 pipeline first.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: core values */}
          <div className="space-y-2">
            <div>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Predicted Total</p>
              <p className={`text-lg font-bold ${hasRealExpense ? 'text-light-text dark:text-dark-text' : 'text-gray-400 dark:text-gray-600'}`}>
                {expense != null ? `${expense.toLocaleString()} Kč` : 'Missing'}
              </p>
              {correctedAmount != null && (
                <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">
                  📊 Corrected: {correctedAmount.toLocaleString()} Kč {finalCorrFactor ? `(${finalCorrFactor.toFixed(2)}x)` : ''}
                </p>
              )}
            </div>

            {baseAmt != null && finalAmt != null && (
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded p-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-light-textMuted">Base (L1):</span>
                  <span className="font-semibold">{baseAmt > 0 ? `${baseAmt.toLocaleString()} Kč` : '0 Kč (no L1)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-light-textMuted">Final (L2):</span>
                  <span className="font-semibold">{finalAmt > 0 ? `${finalAmt.toLocaleString()} Kč` : '0 Kč'}</span>
                </div>
              </div>
            )}

            {pred.categories && Object.keys(pred.categories).length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">📊 Expense Breakdown by Category</p>
                <div className="space-y-1">
                  {Object.entries(pred.categories)
                    .filter(([, amount]) => amount > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => (
                      <div key={category} className="flex justify-between text-xs">
                        <span className="text-blue-600 dark:text-blue-300">{category}:</span>
                        <span className="font-semibold text-blue-700 dark:text-blue-200">{(amount as number).toLocaleString()} Kč</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {confScore != null && (
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Confidence</p>
                <p className={`text-sm font-semibold ${confScore >= 70 ? 'text-green-600 dark:text-green-400' : confScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500'}`}>
                  {confScore}% <span className="font-normal text-xs">({pred.confidence || '—'})</span>
                </p>
              </div>
            )}
          </div>

          {/* Right: metadata */}
          <div className="space-y-2">
            {pred.trainingDataUsed ? (
              <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded p-2">
                <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">✅ Training Data Used</p>
                <p className="text-xs text-green-600 dark:text-green-200">
                  {trainingCount != null ? `${trainingCount} records` : 'records: ?'}
                  {corrFactor != null ? `, factor: ${corrFactor.toFixed(2)}x` : ''}
                </p>
              </div>
            ) : (
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted">No training data used</p>
            )}

            {pred.aiProfileUsed && (
              <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded p-2">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">🧠 AI Profile Applied</p>
                <p className="text-xs text-purple-600 dark:text-purple-200">
                  Adjustment: {adjFactor != null ? `${adjFactor.toFixed(2)}x` : '—'}
                  {(pred.personalizedConfidenceAdjustment ?? 0) !== 0
                    ? ` (conf ${(pred.personalizedConfidenceAdjustment ?? 0) > 0 ? '+' : ''}${pred.personalizedConfidenceAdjustment}%)`
                    : ''}
                </p>
                {pred.personalizedExplanation && (
                  <p className="text-xs text-purple-600 dark:text-purple-200 italic mt-1">{pred.personalizedExplanation}</p>
                )}
              </div>
            )}

            {pred.aiProfileStatus && (
              <div className={`rounded p-2 text-xs ${
                pred.aiProfileStatus === 'stale' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                : pred.aiProfileStatus === 'missing' ? 'bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-800'
                : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              }`}>
                {pred.aiProfileStatus === 'fresh' && <p className="text-green-700 dark:text-green-300">✓ AI profile fresh at prediction time</p>}
                {pred.aiProfileStatus === 'stale' && <p className="text-amber-700 dark:text-amber-300">⚠️ AI profile was stale — confidence reduced by 5%</p>}
                {pred.aiProfileStatus === 'missing' && <p className="text-gray-700 dark:text-gray-300">⚪ No AI profile — no personalization applied</p>}
              </div>
            )}

            {pred.explanationBreakdown && pred.explanationBreakdown.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">📊 Prediction breakdown</p>
                {pred.explanationBreakdown.map((line, idx) => (
                  <p key={idx} className="text-xs text-blue-600 dark:text-blue-200">{line}</p>
                ))}
              </div>
            )}

            {pred.confidenceBreakdown && pred.confidenceBreakdown.length > 0 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-2">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">🎯 Confidence breakdown</p>
                {pred.confidenceBreakdown.map((line, idx) => (
                  <p key={idx} className="text-xs text-orange-600 dark:text-orange-200">{line}</p>
                ))}
              </div>
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
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Predictions</h1>

      {/* User selector (admin only) */}
      {isAdmin && (
        <div className="card rounded-lg p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[260px]">
            <label className="text-sm font-semibold text-light-text dark:text-dark-text whitespace-nowrap">
              Viewing user:
            </label>
            {usersLoading ? (
              <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Loading users…</span>
            ) : (
              <select
                value={selectedUserId}
                onChange={e => selectUser(e.target.value)}
                className="flex-1 px-3 py-2 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg text-sm text-light-text dark:text-dark-text"
              >
                <option value="">— All Users —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ? `${u.displayName} — ${u.email || u.id}` : (u.email || u.id)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {selectedUser && (
            <div className="text-xs text-light-textMuted dark:text-dark-textMuted">
              uid: <code className="font-mono">{selectedUser.id}</code>
              {selectedUser.role && <span className="ml-2 px-1.5 py-0.5 rounded bg-light-border dark:bg-dark-border">{selectedUser.role}</span>}
            </div>
          )}
        </div>
      )}

      {/* Scope banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
        Viewing: <strong>{isAdmin
          ? (effectiveUserId ? userLabel(selectedUser) : 'All Users (Aggregate)')
          : (user?.displayName || user?.email || user?.uid || '—')}</strong>
      </div>

      {/* All Users Aggregate summary */}
      {isAdmin && !effectiveUserId && aggregateMetrics && (
        <div className="card rounded-lg p-5 border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 space-y-3">
          <h2 className="text-sm font-bold text-indigo-700 dark:text-indigo-300">📊 All Users — Aggregate Summary ({aggregateMetrics.totalPredictions} predictions)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Total Users</p>
              <p className="text-xl font-bold text-light-text dark:text-dark-text mt-1">{aggregateMetrics.totalUsers}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Users with predictions</p>
              <p className="text-xl font-bold text-light-text dark:text-dark-text mt-1">{aggregateMetrics.usersWithPredictions}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Avg Confidence</p>
              <p className="text-xl font-bold text-light-text dark:text-dark-text mt-1">{aggregateMetrics.averageConfidence > 0 ? `${aggregateMetrics.averageConfidence}%` : '—'}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">With Training Data</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{aggregateMetrics.trainingDataUsed} / {aggregateMetrics.totalPredictions}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Personalized Predictions</p>
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{aggregateMetrics.personalizedPredictions} / {aggregateMetrics.totalPredictions}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Stale AI Profiles</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{aggregateMetrics.staleProfiles}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Missing AI Profiles</p>
              <p className="text-xl font-bold text-gray-500 mt-1">{aggregateMetrics.missingProfiles}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Fallback Predictions</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">{aggregateMetrics.fallbackPredictions}</p>
            </div>
            <div className="bg-white dark:bg-dark-bg rounded p-3">
              <p className="text-xs text-light-textMuted uppercase">Total Predicted (sum)</p>
              <p className="text-xl font-bold text-light-text dark:text-dark-text mt-1">{aggregateMetrics.totalPredictedExpense > 0 ? `${(aggregateMetrics.totalPredictedExpense / 1000).toFixed(0)}K Kč` : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Level filter */}
      <div className="card rounded-lg p-4">
        <div className="flex gap-2 items-center">
          <span className="text-sm font-semibold text-light-text dark:text-dark-text mr-2">Level:</span>
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
              {predictions.map((pred) => renderL2Card(pred))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Created</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">User</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Month</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Predicted Expense</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Confidence</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Model</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred: any) => (
                  <tr key={pred.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text whitespace-nowrap text-xs">
                      {pred.createdAt?.seconds
                        ? new Date(pred.createdAt.seconds * 1000).toLocaleString()
                        : pred.createdAt ? new Date(pred.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text text-xs">{pred.userId || '—'}</td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">{pred.month || '—'}</td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text font-semibold">
                      {pred.totalPredictedExpense != null ? `${pred.totalPredictedExpense.toLocaleString()} Kč` : '—'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {pred.confidenceScore != null ? `${pred.confidenceScore}%` : pred.confidence || '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-light-textMuted dark:text-dark-textMuted">
                      {pred.modelType || (pred.isRealMlModel ? 'ML' : 'Baseline')}
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
            <p className="text-light-textMuted dark:text-dark-textMuted text-xs">With Training Data</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
              {predictions.filter((p: any) => p.trainingDataUsed).length}
            </p>
          </div>
          <div className="card rounded-lg p-4">
            <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Avg Confidence Score</p>
            <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">
              {(() => {
                const withScore = predictions.filter((p: any) => p.confidenceScore != null)
                if (!withScore.length) return '—'
                const avg = withScore.reduce((s: number, p: any) => s + p.confidenceScore, 0) / withScore.length
                return `${avg.toFixed(1)}%`
              })()}
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
