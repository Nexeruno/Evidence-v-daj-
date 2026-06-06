import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import type { PipelineResult } from '@/types/ipc'

export interface PredictionSettings {
  activePredictionLevel: 1 | 2
  level2Enabled: boolean
  level2ShadowMode: boolean
  fallbackEnabled: boolean
  updatedAt?: any
  updatedBy?: string
}

const DEFAULT_PREDICTION_SETTINGS: PredictionSettings = {
  activePredictionLevel: 1,
  level2Enabled: false,
  level2ShadowMode: false,
  fallbackEnabled: true,
}

export function usePredictionSettings() {
  const { getIdToken } = useAuth()
  const [settings, setSettings] = useState<PredictionSettings>(DEFAULT_PREDICTION_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usedFallback, setUsedFallback] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    setUsedFallback(false)

    try {
      const token = await getIdToken()
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction(
        'adminGetPredictionSettings',
        token,
        {}
      )

      if (result?.ok === true && result.data) {
        setSettings(result.data as PredictionSettings)
        setLoading(false)
      } else {
        const errMsg = result?.error || 'Failed to load prediction settings'
        setError(errMsg)
        setSettings(DEFAULT_PREDICTION_SETTINGS)
        setUsedFallback(true)
        setLoading(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setSettings(DEFAULT_PREDICTION_SETTINGS)
      setUsedFallback(true)
      setLoading(false)
    }
  }, [getIdToken])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return { settings, loading, error, usedFallback, reload: loadSettings }
}

export function useMlPipelineControl() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const runLevel2Pipeline = useCallback(async (idToken: string): Promise<PipelineResult> => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available - running in web mode?')
      }

      const result = await window.ipcApi.runLevel2Pipeline(idToken)
      if (!result.success) {
        throw new Error(result.message)
      }

      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const getPipelineStatus = useCallback(async () => {
    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      return await window.ipcApi.getPipelineStatus()
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    }
  }, [])

  const clearLocalCache = useCallback(async () => {
    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      await window.ipcApi.clearLocalCache()
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    }
  }, [])


  const getPredictionSettings = useCallback(async (idToken: string) => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      return await window.ipcApi.callCloudFunction(
        'adminGetPredictionSettings',
        idToken,
        {}
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const updatePredictionSettings = useCallback(async (idToken: string, settings: any) => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      return await window.ipcApi.callCloudFunction(
        'adminUpdatePredictionSettings',
        idToken,
        settings
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const runLevel1Pipeline = useCallback(async (idToken: string) => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      const result = await window.ipcApi.callCloudFunction(
        'testMlPipeline',
        idToken,
        {}
      )
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const runLevel2ShadowPipeline = useCallback(async (idToken: string) => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      const result = await window.ipcApi.runLevel2Pipeline(idToken)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const createL2TrainingFeedback = useCallback(
    async (
      idToken: string,
      data: {
        userId: string
        predictionId?: string
        month: string
        predictedTotal: number
        actualTotal: number
        correctedCategories?: Record<string, number>
        note?: string
      }
    ) => {
      setLoading(true)
      setError(null)

      try {
        if (!window.ipcApi) {
          throw new Error('IPC API not available')
        }
        return await window.ipcApi.callCloudFunction(
          'adminCreateL2TrainingFeedback',
          idToken,
          data
        )
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const generateL2AutoFeedback = useCallback(
    async (idToken: string, month: string) => {
      setLoading(true)
      setError(null)

      try {
        if (!window.ipcApi) {
          throw new Error('IPC API not available')
        }
        return await window.ipcApi.callCloudFunction(
          'adminGenerateL2AutoFeedback',
          idToken,
          { month }
        )
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return {
    runLevel1Pipeline,
    runLevel2Pipeline,
    runLevel2ShadowPipeline,
    createL2TrainingFeedback,
    generateL2AutoFeedback,
    getPipelineStatus,
    clearLocalCache,
    getPredictionSettings,
    updatePredictionSettings,
    loading,
    error,
  }
}
