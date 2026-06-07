import { useState, useMemo } from 'react'
import { SYMBOLS } from '@/utils/symbols'
import { useRuntimeStatus } from '@/hooks/useRuntimeStatus'
import { useSuccessfulRuns, formatRunTimestamp, formatRunStatus } from '@/hooks/useSuccessfulRuns'
import { useFailedRuns, formatRunTimestamp as formatTimestamp, formatFailedStatus } from '@/hooks/useFailedRuns'
import { useConfidenceData, getConfidenceColor, getConfidenceIcon, getConfidenceLabel } from '@/hooks/useConfidenceData'
import { useLearningHealth, formatActionType, formatActionTime, getLearningStatusIcon, getLearningStatusLabel, getLearningStatusColor, getTrainSamplesIcon, getTrainSamplesColor, getActionStatusIcon } from '@/hooks/useLearningHealth'
import { useSystemWarnings, getWarningIcon, getWarningLabel, getSeverityColor, getSeverityBadge, countBySeverity } from '@/hooks/useSystemWarnings'
import { RunDetailModal, type RunDetail } from '@/components/RunDetailModal'
import { useMlRuns } from '@/hooks/useFirestore'

/**
 * AI Observability Console
 *
 * FÁZE 4.6A: Skeleton page with placeholder sections
 * FÁZE 4.6B: Connected to runtime status
 * - AI Status (system status overview) - NOW REAL
 * - Success Runs (successful predictions) - PLACEHOLDER
 * - Failed Runs (failed predictions) - PLACEHOLDER
 * - Debug Console (debugging interface) - PLACEHOLDER
 */

export function AiObservabilityPage() {
  const [activeTab, setActiveTab] = useState<'status' | 'success' | 'failed' | 'debug'>('status')
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [runStatusFilter, setRunStatusFilter] = useState<'all' | 'success' | 'failed'>('all')

  const { status: runtimeStatus, loading: runtimeLoading, checkNow: recheck } = useRuntimeStatus()
  const { runs: successfulRuns, loading: runsLoading, error: runsError } = useSuccessfulRuns(10)
  const { runs: failedRuns, loading: failedLoading, error: failedError } = useFailedRuns(10)
  const { data: confidenceData, loading: confidenceLoading } = useConfidenceData()
  const { data: learningHealthData, loading: learningLoading } = useLearningHealth()
  const { warnings, loading: warningsLoading, totalCount: warningsTotalCount } = useSystemWarnings()
  const { data: mlRuns } = useMlRuns(5)

  // FÁZE 5.4C: Get latest evaluation verdict
  const latestEvaluation = useMemo(() => {
    if (!mlRuns || mlRuns.length === 0) return null
    const runsWithEval = mlRuns.filter((r: any) => r.evaluation?.status === 'evaluated')
    if (runsWithEval.length === 0) return null
    return runsWithEval[0].evaluation
  }, [mlRuns])

  // Filter runs based on selected filter
  const allRuns = [...successfulRuns, ...failedRuns].sort((a, b) => {
    const timeA = a.startedAt?.toDate ? a.startedAt.toDate() : new Date(a.startedAt)
    const timeB = b.startedAt?.toDate ? b.startedAt.toDate() : new Date(b.startedAt)
    return timeB.getTime() - timeA.getTime()
  })

  const filteredRuns =
    runStatusFilter === 'all'
      ? allRuns
      : runStatusFilter === 'success'
        ? successfulRuns
        : failedRuns

  const openRunDetail = (run: any, type: 'success' | 'failed') => {
    const runDetail: RunDetail = {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      errorCount: run.errorCount,
      lastError: run.lastError,
      validationStatus:
        type === 'success'
          ? 'valid'
          : run.errorCount && run.errorCount > 1
            ? 'invalid'
            : 'warning',
      requestSummary:
        type === 'success'
          ? `Pipeline: L${run.pipelineLevel || 1}\nUsers Processed: ${run.usersProcessed || 0}\nStream: Active`
          : `Pipeline: L${run.pipelineLevel || 1}\nError Count: ${run.errorCount || 1}\nStatus: Failed`,
      responseSummary:
        type === 'success'
          ? `Predictions Created: ${run.predictionsCreated || 0}\nDuration: ${Math.round((run.durationMs || 0) / 1000)}s\nSuccess Rate: 100%`
          : `Last Error: ${run.lastError ? run.lastError.substring(0, 100) : 'Unknown'}\nRetry Attempts: 0\nRequires Investigation: Yes`,
    }
    setSelectedRun(runDetail)
    setIsModalOpen(true)
  }

  // Calculate summary metrics
  const totalRuns = successfulRuns.length + failedRuns.length
  const successCount = successfulRuns.length
  const failedCount = failedRuns.length
  const warningsCount = warningsTotalCount || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">
          {SYMBOLS.CHART} AI Observability Console
        </h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          FÁZE 4.7E Summary
        </div>
      </div>

      {/* Observability Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Runs */}
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide">Total Runs</p>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">{totalRuns}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Recent predictions</p>
        </div>

        {/* Success Count */}
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide">Success</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{successCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {totalRuns > 0 ? `${Math.round((successCount / totalRuns) * 100)}% success rate` : 'No data'}
          </p>
        </div>

        {/* Failed Count */}
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide">Failed</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{failedCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {totalRuns > 0 ? `${Math.round((failedCount / totalRuns) * 100)}% error rate` : 'No data'}
          </p>
        </div>

        {/* Warnings Count */}
        <div
          className={`p-4 rounded-lg border ${
            warningsCount > 0
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
          }`}
        >
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide">Warnings</p>
          <p
            className={`text-3xl font-bold mt-2 ${
              warningsCount > 0
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {warningsCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {warningsCount > 0 ? 'Issues detected' : 'All clear'}
          </p>
        </div>

        {/* FÁZE 5.4C: Evaluation Verdict Card */}
        <div
          className={`p-4 rounded-lg border ${
            !latestEvaluation
              ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
              : latestEvaluation.verdict === 'usable'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : latestEvaluation.verdict === 'partially_usable'
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}
        >
          <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide">Evaluation</p>
          <p
            className={`text-2xl font-bold mt-2 ${
              !latestEvaluation
                ? 'text-gray-600 dark:text-gray-400'
                : latestEvaluation.verdict === 'usable'
                  ? 'text-green-600 dark:text-green-400'
                  : latestEvaluation.verdict === 'partially_usable'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-red-600 dark:text-red-400'
            }`}
          >
            {!latestEvaluation ? 'No data' : latestEvaluation.verdict?.replace(/_/g, ' ') || 'unknown'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {!latestEvaluation
              ? 'No evaluation yet'
              : latestEvaluation.verdict === 'usable'
                ? `✅ Dataset ready (${latestEvaluation.validRows}/${latestEvaluation.totalRows})`
                : latestEvaluation.verdict === 'partially_usable'
                  ? `⚠️ Use with caution (${latestEvaluation.validRows}/${latestEvaluation.totalRows})`
                  : `❌ Fix data first (${latestEvaluation.validRows}/${latestEvaluation.totalRows})`}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" role="tablist">
          {[
            { id: 'status', label: `${SYMBOLS.CHECK} AI Status`, icon: '📊' },
            { id: 'success', label: `${SYMBOLS.CHECK} Success Runs`, icon: '✅' },
            { id: 'failed', label: `${SYMBOLS.WARNING} Failed Runs`, icon: '❌' },
            { id: 'debug', label: `${SYMBOLS.GEAR} Debug Console`, icon: '🔧' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* 1. AI Status Tab */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-light-text dark:text-dark-text">
              System Status
            </h2>

            {/* Runtime Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Runtime Availability */}
              <div
                className={`p-4 rounded-lg border ${
                  runtimeStatus.available
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                <p className="text-sm text-gray-600 dark:text-gray-400">Python Runtime</p>
                <p className="text-2xl font-bold mt-2">
                  {runtimeLoading ? (
                    <span className="text-yellow-600 dark:text-yellow-400">Checking...</span>
                  ) : runtimeStatus.available ? (
                    <span className="text-green-600 dark:text-green-400">🟢 Available</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">🔴 Unavailable</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  {runtimeStatus.lastCheckTime
                    ? `Checked: ${runtimeStatus.lastCheckTime.toLocaleTimeString()}`
                    : 'Never checked'}
                </p>
              </div>

              {/* Last Request Status */}
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-gray-600 dark:text-gray-400">Last Request</p>
                <p className="text-2xl font-bold mt-2">
                  {runtimeLoading ? (
                    <span className="text-yellow-600 dark:text-yellow-400">Pending</span>
                  ) : runtimeStatus.lastRequestStatus === 'success' ? (
                    <span className="text-green-600 dark:text-green-400">✅ Success</span>
                  ) : runtimeStatus.lastRequestStatus === 'failed' ? (
                    <span className="text-red-600 dark:text-red-400">❌ Failed</span>
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400">—</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  {runtimeStatus.lastError ? `Error: ${runtimeStatus.lastError}` : 'No errors'}
                </p>
              </div>

              {/* Response Validity */}
              <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-gray-600 dark:text-gray-400">Last Response</p>
                <p className="text-2xl font-bold mt-2">
                  {runtimeStatus.lastResponseValid === true ? (
                    <span className="text-green-600 dark:text-green-400">✅ Valid</span>
                  ) : runtimeStatus.lastResponseValid === false ? (
                    <span className="text-red-600 dark:text-red-400">❌ Invalid</span>
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400">—</span>
                  )}
                </p>
                <button
                  onClick={recheck}
                  disabled={runtimeLoading}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 disabled:opacity-50"
                >
                  {runtimeLoading ? 'Checking...' : 'Check now'}
                </button>
              </div>

              {/* Confidence Panel */}
              {confidenceData && (
                <div
                  className={`p-4 rounded-lg border ${getConfidenceColor(confidenceData.score).bg} ${getConfidenceColor(confidenceData.score).border}`}
                >
                  <p className="text-sm text-gray-600 dark:text-gray-400">AI Confidence</p>
                  <p className="text-2xl font-bold mt-2">
                    <span className={getConfidenceColor(confidenceData.score).text}>
                      {getConfidenceIcon(confidenceData.score)} {confidenceData.score}%
                    </span>
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Source: <span className="font-medium">{confidenceData.source.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 leading-tight">
                    {confidenceData.explanation}
                  </p>
                </div>
              )}
              {!confidenceData && !confidenceLoading && (
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                  <p className="text-sm text-gray-600 dark:text-gray-400">AI Confidence</p>
                  <p className="text-2xl font-bold mt-2 text-gray-600 dark:text-gray-400">—</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">No data available</p>
                </div>
              )}
              {confidenceLoading && (
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-gray-600 dark:text-gray-400">AI Confidence</p>
                  <p className="text-2xl font-bold mt-2 text-blue-600 dark:text-blue-400">Loading...</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Fetching confidence data</p>
                </div>
              )}
            </div>

            {/* Status Summary */}
            <div
              className={`p-4 rounded-lg border ${
                runtimeStatus.available
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              }`}
            >
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {runtimeStatus.available
                  ? `✅ Python runtime is available and responding correctly`
                  : `⚠️ Python runtime is not available. Check if it's running on localhost:5000`}
              </p>
            </div>

            {/* Learning Health Panel */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">
                Learning Health
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Learning Status */}
                {learningHealthData && (
                  <div
                    className={`p-4 rounded-lg border ${getLearningStatusColor(learningHealthData.active).bg} ${getLearningStatusColor(learningHealthData.active).border}`}
                  >
                    <p className="text-sm text-gray-600 dark:text-gray-400">Learning Status</p>
                    <p className="text-2xl font-bold mt-2">
                      <span className={getLearningStatusColor(learningHealthData.active).text}>
                        {getLearningStatusIcon(learningHealthData.active)}{' '}
                        {getLearningStatusLabel(learningHealthData.active)}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {learningHealthData.active ? 'Training in progress' : 'No active training'}
                    </p>
                  </div>
                )}
                {!learningHealthData && !learningLoading && (
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Learning Status</p>
                    <p className="text-2xl font-bold mt-2 text-gray-600 dark:text-gray-400">—</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">No data</p>
                  </div>
                )}
                {learningLoading && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Learning Status</p>
                    <p className="text-2xl font-bold mt-2 text-blue-600 dark:text-blue-400">Loading...</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Fetching data</p>
                  </div>
                )}

                {/* Train-Ready Samples */}
                {learningHealthData && (
                  <div
                    className={`p-4 rounded-lg border ${getTrainSamplesColor(learningHealthData.trainReadySamples.available).bg} ${getTrainSamplesColor(learningHealthData.trainReadySamples.available).border}`}
                  >
                    <p className="text-sm text-gray-600 dark:text-gray-400">Training Samples</p>
                    <p className="text-2xl font-bold mt-2">
                      <span className={getTrainSamplesColor(learningHealthData.trainReadySamples.available).text}>
                        {getTrainSamplesIcon(learningHealthData.trainReadySamples.available)}{' '}
                        {learningHealthData.trainReadySamples.count}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {learningHealthData.trainReadySamples.available ? 'Ready for training' : 'Not enough samples'}
                    </p>
                  </div>
                )}
                {!learningHealthData && !learningLoading && (
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Training Samples</p>
                    <p className="text-2xl font-bold mt-2 text-gray-600 dark:text-gray-400">—</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">No data</p>
                  </div>
                )}
                {learningLoading && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Training Samples</p>
                    <p className="text-2xl font-bold mt-2 text-blue-600 dark:text-blue-400">Loading...</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Fetching data</p>
                  </div>
                )}

                {/* Last Learning Action */}
                {learningHealthData && (
                  <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Last Action</p>
                    <p className="text-sm font-medium mt-2 text-gray-800 dark:text-gray-200">
                      {getActionStatusIcon(learningHealthData.lastAction.status)} {formatActionType(learningHealthData.lastAction.type)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {formatActionTime(learningHealthData.lastAction.timestamp)}
                    </p>
                  </div>
                )}
                {!learningHealthData && !learningLoading && (
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Last Action</p>
                    <p className="text-sm font-medium mt-2 text-gray-600 dark:text-gray-400">—</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">No data</p>
                  </div>
                )}
                {learningLoading && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Last Action</p>
                    <p className="text-sm font-medium mt-2 text-blue-600 dark:text-blue-400">Loading...</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Fetching data</p>
                  </div>
                )}
              </div>
            </div>

            {/* System Warnings Panel */}
            {!warningsLoading && warnings.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                    System Warnings
                  </h3>
                  <span className="text-sm font-medium px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    {warningsTotalCount} warning{warningsTotalCount !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-2">
                  {warnings.map((warning) => {
                    const severityColor = getSeverityColor(warning.severity)
                    return (
                      <div
                        key={warning.id}
                        className={`p-4 rounded-lg border ${severityColor.bg} ${severityColor.border}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl mt-0.5">{getWarningIcon(warning.type)}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold ${severityColor.text}`}>
                                {getWarningLabel(warning.type)}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${severityColor.text}`}>
                                {severityColor.icon} {getSeverityBadge(warning.severity)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                              {warning.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    {SYMBOLS.INFO} Warnings are informational. Monitor these issues but auto-fixes are not available yet.
                  </p>
                </div>
              </div>
            )}

            {!warningsLoading && warnings.length === 0 && (
              <div className="mt-8">
                <div className="p-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
                  <p className="text-green-700 dark:text-green-400 font-medium">
                    ✅ No warnings - system is healthy
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                    All monitored systems are operating normally
                  </p>
                </div>
              </div>
            )}

            {warningsLoading && (
              <div className="mt-8">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-blue-700 dark:text-blue-400 text-sm">
                    Loading warnings...
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Success Runs Tab */}
        {activeTab === 'success' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-light-text dark:text-dark-text">
                Recent Predictions
              </h2>
              {runsLoading && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
              )}
            </div>

            {/* Run Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Filter:</span>
              <div className="flex gap-2">
                {[
                  { value: 'all' as const, label: 'All Runs', icon: '📊' },
                  { value: 'success' as const, label: 'Success Only', icon: '✅' },
                  { value: 'failed' as const, label: 'Failed Only', icon: '❌' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setRunStatusFilter(filter.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      runStatusFilter === filter.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {filter.icon} {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error State */}
            {runsError && (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-800 dark:text-red-300 text-sm">
                  {SYMBOLS.WARNING} Failed to load runs: {runsError.message}
                </p>
              </div>
            )}

            {/* Loading State */}
            {(runsLoading || failedLoading) && !filteredRuns.length && (
              <div className="p-8 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 text-center">
                <p className="text-gray-600 dark:text-gray-400">Loading predictions...</p>
              </div>
            )}

            {/* Empty State */}
            {!(runsLoading || failedLoading) && !filteredRuns.length && !runsError && !failedError && (
              <div className="p-8 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                  {runStatusFilter === 'all'
                    ? 'No predictions available'
                    : runStatusFilter === 'success'
                      ? 'No successful predictions yet'
                      : 'No failed predictions'}
                </p>
              </div>
            )}

            {/* Error State */}
            {(runsError || failedError) && (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-800 dark:text-red-300 text-sm">
                  {SYMBOLS.WARNING} Failed to load predictions: {runsError?.message || failedError?.message}
                </p>
              </div>
            )}

            {/* Filtered Runs Table */}
            {filteredRuns.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                        {runStatusFilter === 'failed' ? 'Error Summary' : 'Summary'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((run) => {
                      const isSuccess = 'summary' in run
                      const statusInfo = isSuccess
                        ? formatRunStatus(run.status)
                        : formatFailedStatus(run.status)
                      return (
                        <tr
                          key={run.id}
                          className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                          onClick={() => openRunDetail(run, isSuccess ? 'success' : 'failed')}
                        >
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatRunTimestamp(run.startedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusInfo.color}`}
                            >
                              {statusInfo.text}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-md truncate">
                            {isSuccess ? (run.summary || '—') : (run.errorSummary || '—')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-blue-800 dark:text-blue-300 text-xs">
                {SYMBOLS.INFO} Showing{' '}
                {runStatusFilter === 'all'
                  ? 'all'
                  : runStatusFilter === 'success'
                    ? 'successful'
                    : 'failed'}{' '}
                predictions from Firebase
              </p>
            </div>
          </div>
        )}

        {/* 3. Failed Runs Tab */}
        {activeTab === 'failed' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-light-text dark:text-dark-text">
                Recent Predictions
              </h2>
              {failedLoading && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
              )}
            </div>

            {/* Run Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Filter:</span>
              <div className="flex gap-2">
                {[
                  { value: 'all' as const, label: 'All Runs', icon: '📊' },
                  { value: 'success' as const, label: 'Success Only', icon: '✅' },
                  { value: 'failed' as const, label: 'Failed Only', icon: '❌' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setRunStatusFilter(filter.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      runStatusFilter === filter.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {filter.icon} {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error State */}
            {failedError && (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-800 dark:text-red-300 text-sm">
                  {SYMBOLS.WARNING} Failed to load predictions: {failedError.message}
                </p>
              </div>
            )}

            {/* Loading State */}
            {(runsLoading || failedLoading) && !filteredRuns.length && (
              <div className="p-8 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 text-center">
                <p className="text-gray-600 dark:text-gray-400">Loading predictions...</p>
              </div>
            )}

            {/* Empty State */}
            {!(runsLoading || failedLoading) && !filteredRuns.length && !runsError && !failedError && (
              <div
                className={`p-8 rounded-lg text-center ${
                  runStatusFilter === 'all' && failedRuns.length === 0
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700'
                }`}
              >
                <p
                  className={`${
                    runStatusFilter === 'all' && failedRuns.length === 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {runStatusFilter === 'all' && failedRuns.length === 0
                    ? `${SYMBOLS.CHECK} No failed runs - everything is working great!`
                    : 'No predictions with this filter'}
                </p>
              </div>
            )}

            {/* Filtered Runs Table */}
            {filteredRuns.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                        {runStatusFilter === 'failed' ? 'Error Summary' : 'Summary'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((run) => {
                      const isSuccess = 'summary' in run
                      const statusInfo = isSuccess
                        ? formatRunStatus(run.status)
                        : formatFailedStatus(run.status)
                      return (
                        <tr
                          key={run.id}
                          className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                          onClick={() => openRunDetail(run, isSuccess ? 'success' : 'failed')}
                        >
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatRunTimestamp(run.startedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusInfo.color}`}
                            >
                              {statusInfo.text}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-md truncate">
                            {isSuccess ? (run.summary || '—') : (run.errorSummary || '—')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-blue-800 dark:text-blue-300 text-xs">
                {SYMBOLS.INFO} Showing{' '}
                {runStatusFilter === 'all'
                  ? 'all'
                  : runStatusFilter === 'success'
                    ? 'successful'
                    : 'failed'}{' '}
                predictions from Firebase
              </p>
            </div>
          </div>
        )}

        {/* 4. Debug Console Tab */}
        {activeTab === 'debug' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-light-text dark:text-dark-text">
              Debug Console
            </h2>

            {/* Placeholder Console */}
            <div className="p-4 rounded-lg bg-black dark:bg-gray-950 border border-gray-700 dark:border-gray-800 font-mono text-sm text-green-400 space-y-2 h-96 overflow-y-auto">
              <div>[PLACEHOLDER] Console initialized</div>
              <div>[PLACEHOLDER] Version: 4.6A (skeleton)</div>
              <div>[PLACEHOLDER] Status: Ready</div>
              <div>[PLACEHOLDER] --- </div>
              <div className="text-yellow-400">[PLACEHOLDER] Debug information will appear here</div>
              <div className="text-gray-500">[PLACEHOLDER] Real-time logs coming in future phases</div>
            </div>

            {/* Placeholder Section */}
            <div className="p-6 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <p className="text-purple-800 dark:text-purple-300 text-sm font-medium">
                {SYMBOLS.GEAR} Debug Console is a skeleton placeholder
              </p>
              <p className="text-purple-700 dark:text-purple-400 text-xs mt-2">
                Real-time debug logs and system information will be displayed in the console above in later phases.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {SYMBOLS.INFO} <strong>FÁZE 4.6E Status:</strong> Click on any run to view detailed information.
        </p>
      </div>

      {/* Run Detail Modal */}
      <RunDetailModal
        run={selectedRun}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}
