import { useState, useCallback } from 'react'
import type { PipelineResult } from '@/types/ipc'

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

  const activateLevel2 = useCallback(async (idToken: string) => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      return await window.ipcApi.callCloudFunction(
        'adminActivateLevel2Model',
        idToken,
        { timestamp: Date.now() }
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const rollbackToLevel1 = useCallback(async (idToken: string) => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }
      return await window.ipcApi.callCloudFunction(
        'adminRollbackToLevel1',
        idToken,
        { timestamp: Date.now(), reason: 'manual_rollback' }
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    runLevel2Pipeline,
    getPipelineStatus,
    clearLocalCache,
    activateLevel2,
    rollbackToLevel1,
    loading,
    error,
  }
}
