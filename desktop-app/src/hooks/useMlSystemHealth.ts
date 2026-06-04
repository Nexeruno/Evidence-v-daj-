import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'

export interface MlSystemHealth {
  health: {
    firebaseProjectId: string
    predictionSettingsExists: boolean
    l2ShadowEnabled: boolean
    l2Enabled: boolean
    activePredictionLevel: number
  }
  pipelineStatus: any
  recentRuns: any[]
  recentErrors: any[]
  feedbackStats: {
    totalManualFeedback: number
    totalAutoFeedback: number
    latestManualFeedback: any
  }
  timestamp: any
}

export function useMlSystemHealth() {
  const { getIdToken } = useAuth()
  const [health, setHealth] = useState<MlSystemHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHealth = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getIdToken()
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction(
        'adminGetMlSystemHealth',
        token,
        {}
      )

      if (result?.ok === true) {
        setHealth(result)
      } else {
        setError(result?.error || 'Failed to load ML system health')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health')
    } finally {
      setLoading(false)
    }
  }, [getIdToken])

  useEffect(() => {
    loadHealth()
    const interval = setInterval(loadHealth, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [loadHealth])

  return { health, loading, error, reload: loadHealth }
}
