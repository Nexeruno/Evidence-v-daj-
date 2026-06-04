import { useState } from 'react'
import { useMlMetrics } from '@/hooks/useFirestore'
import { useAuth } from '@/auth/AuthProvider'
import { useMlPipelineControl } from '@/hooks/useMlPipelineControl'

export function MlControlPage() {
  const metrics = useMlMetrics()
  const { getIdToken } = useAuth()
  const { runLevel2Pipeline, activateLevel2, rollbackToLevel1, loading: pipelineLoading } = useMlPipelineControl()

  const [runningLevel2, setRunningLevel2] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false)

  const handleRunLevel2 = async () => {
    if (!window.ipcApi) {
      setStatusMessage('❌ This action is available only in AURIX Core desktop mode.')
      return
    }

    try {
      setRunningLevel2(true)
      setStatusMessage('Running Level 2 pipeline...')
      const token = await getIdToken()
      const result = await runLevel2Pipeline(token)
      if (result?.success === false || result?.ok === false) {
        setStatusMessage(`⚠️ ${result.message || 'Pipeline not ready yet'}`)
      } else {
        setStatusMessage(`✅ Pipeline completed: ${result?.message || 'Success'}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Pipeline failed: ${msg}`)
    } finally {
      setRunningLevel2(false)
    }
  }

  const handleActivateLevel2 = async () => {
    try {
      setStatusMessage('Activating Level 2 model...')
      const token = await getIdToken()
      const result = await activateLevel2(token)
      if (result?.ok === true || result?.success === true) {
        setStatusMessage(`✅ Level 2 model activated: ${result.message || 'Success'}`)
        setActivateModalOpen(false)
      } else {
        setStatusMessage(`❌ ${result?.message || 'Activation failed'}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      if (msg.includes('not available')) {
        setStatusMessage('❌ Backend function not deployed yet. Contact admin.')
      } else {
        setStatusMessage(`❌ Activation failed: ${msg}`)
      }
    }
  }

  const handleRollback = async () => {
    try {
      setStatusMessage('Rolling back to Level 1...')
      const token = await getIdToken()
      const result = await rollbackToLevel1(token)
      if (result?.ok === true || result?.success === true) {
        setStatusMessage(`✅ Rolled back to Level 1: ${result.message || 'Success'}`)
        setRollbackModalOpen(false)
      } else {
        setStatusMessage(`❌ ${result?.message || 'Rollback failed'}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      if (msg.includes('not available')) {
        setStatusMessage('❌ Backend function not deployed yet. Contact admin.')
      } else {
        setStatusMessage(`❌ Rollback failed: ${msg}`)
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Model Control</h1>

      {/* Current Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Level 1 (Production)</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">✅ Active</p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-2">Baseline predictions</p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Level 2 Status</p>
          <p className={`text-3xl font-bold mt-2 ${
            metrics?.level2Status === 'active' ? 'text-green-600 dark:text-green-400' :
            metrics?.level2Status === 'shadow' ? 'text-blue-600 dark:text-blue-400' :
            'text-orange-600 dark:text-orange-400'
          }`}>
            {metrics?.level2Status === 'active' ? '✅ Active' :
             metrics?.level2Status === 'shadow' ? '🔄 Shadow' :
             '↩️ Rollback'}
          </p>
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-2">
            {metrics?.level2Status === 'shadow' ? 'Testing mode - not in production' : 'Active model'}
          </p>
        </div>
      </div>

      {/* Level 2 Pipeline Control */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Level 2 Pipeline Execution</h2>
        <p className="text-light-textMuted dark:text-dark-textMuted mb-6">Run local ML pipeline with current admin credentials (token passed via stdin)</p>

        <button
          onClick={handleRunLevel2}
          disabled={runningLevel2 || pipelineLoading || !window.ipcApi}
          title={!window.ipcApi ? 'Available only in AURIX Core desktop mode' : ''}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors duration-200 ${
            runningLevel2 || pipelineLoading || !window.ipcApi
              ? 'bg-gray-400 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-800'
          }`}
        >
          {runningLevel2 ? '⏳ Running...' : '▶️ Run Level 2 Pipeline'}
        </button>

        {statusMessage && (
          <div className={`mt-4 p-4 rounded-lg text-sm ${
            statusMessage.includes('✅') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}>
            {statusMessage}
          </div>
        )}
      </div>

      {/* Shadow Mode Toggle */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Shadow Mode</h2>
        <p className="text-light-textMuted dark:text-dark-textMuted mb-6">Toggle Level 2 between shadow (testing) and active (production)</p>

        {metrics?.level2Status === 'shadow' ? (
          <div className="space-y-4">
            <p className="text-blue-600 dark:text-blue-400 font-semibold">Currently in Shadow Mode</p>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 2 predictions are parallel to Level 1 but not served to users</p>
            <button
              onClick={() => setActivateModalOpen(true)}
              className="px-6 py-3 bg-green-600 dark:bg-green-700 text-white rounded-lg font-semibold hover:bg-green-700 dark:hover:bg-green-800 transition-colors duration-200"
            >
              🚀 Activate Level 2 (Move to Production)
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-green-600 dark:text-green-400 font-semibold">Currently Active</p>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">Level 2 is serving production predictions</p>
            <button
              onClick={() => setRollbackModalOpen(true)}
              className="px-6 py-3 bg-orange-600 dark:bg-orange-700 text-white rounded-lg font-semibold hover:bg-orange-700 dark:hover:bg-orange-800 transition-colors duration-200"
            >
              ↩️ Rollback to Level 1
            </button>
          </div>
        )}
      </div>

      {/* Model Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card rounded-lg p-6">
          <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Level 2 Accuracy</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-2">
            {metrics?.shadowAccuracy ? `${(metrics.shadowAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Level 2 Runs</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-2">{metrics?.totalRunsLevel2 || 0}</p>
        </div>
        <div className="card rounded-lg p-6">
          <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Level 1 Accuracy</p>
          <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-2">~94.2%</p>
        </div>
      </div>

      {/* Activation Confirmation Modal */}
      {activateModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">🚀 Activate Level 2?</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-6">
              This will move Level 2 from shadow mode to production. All users will receive Level 2 predictions.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setActivateModalOpen(false)}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleActivateLevel2}
                className="flex-1 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 font-semibold transition-colors duration-200"
              >
                Yes, Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback Confirmation Modal */}
      {rollbackModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">↩️ Rollback to Level 1?</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-6">
              This will revert to Level 1 predictions. Use this only if Level 2 is causing issues.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setRollbackModalOpen(false)}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                className="flex-1 px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-700 dark:hover:bg-orange-800 font-semibold transition-colors duration-200"
              >
                Yes, Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
