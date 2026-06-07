import { useState, useEffect, useCallback } from 'react'

/**
 * Podman Runtime Status Hook
 *
 * FÁZA 6.3A: Track Podman multi-service runtime state
 * - Podman runtime connected/disconnected status
 * - Last runtime check time
 * - Connection readiness verdict
 */

export interface PodmanRuntimeStatus {
  connected: boolean
  lastCheckTime?: Date
  lastCheckStatus?: 'pending' | 'success' | 'failed'
  connectionReadiness?: 'ready' | 'degraded' | 'unavailable'
  mlRuntimeReachable?: boolean
  mlRuntimeHealthy?: boolean
  runtimeAvailable?: boolean
  requestPathHealthy?: boolean
  lastError?: string
}

const BACKEND_URL = 'http://localhost:3000'
const DEPENDENCIES_ENDPOINT = `${BACKEND_URL}/status/dependencies`
const CHECK_INTERVAL = 5000 // Check every 5 seconds

export function usePodmanRuntimeStatus() {
  const [status, setStatus] = useState<PodmanRuntimeStatus>({
    connected: false,
    lastCheckTime: undefined,
    lastCheckStatus: undefined,
    connectionReadiness: undefined,
    mlRuntimeReachable: undefined,
    mlRuntimeHealthy: undefined,
    runtimeAvailable: undefined,
    requestPathHealthy: undefined,
    lastError: undefined,
  })

  const [loading, setLoading] = useState(true)

  /**
   * Check Podman runtime dependencies
   */
  const checkPodmanStatus = useCallback(async () => {
    try {
      setStatus((prev) => ({
        ...prev,
        lastCheckStatus: 'pending',
      }))

      const response = await fetch(DEPENDENCIES_ENDPOINT, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      const data = await response.json()

      // Extract ML Runtime status from dependencies
      const mlRuntimeDep = data.dependencies?.mlRuntime
      const isReachable = mlRuntimeDep?.reachable ?? false
      const isHealthy = mlRuntimeDep?.status === 'healthy'
      const readiness = data.status ?? 'unavailable'

      // Container health: runtime available + request path healthy
      const runtimeAvailable = isReachable && response.ok
      const requestPathHealthy = isHealthy && isReachable

      setStatus({
        connected: response.ok && isReachable,
        lastCheckTime: new Date(),
        lastCheckStatus: response.ok ? 'success' : 'failed',
        connectionReadiness: readiness,
        mlRuntimeReachable: isReachable,
        mlRuntimeHealthy: isHealthy,
        runtimeAvailable,
        requestPathHealthy,
        lastError: undefined,
      })
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error'

      setStatus({
        connected: false,
        lastCheckTime: new Date(),
        lastCheckStatus: 'failed',
        connectionReadiness: 'unavailable',
        mlRuntimeReachable: false,
        mlRuntimeHealthy: false,
        runtimeAvailable: false,
        requestPathHealthy: false,
        lastError: errorMsg,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Initial check on mount
   */
  useEffect(() => {
    checkPodmanStatus()
  }, [checkPodmanStatus])

  /**
   * Periodic health checks
   */
  useEffect(() => {
    const interval = setInterval(() => {
      checkPodmanStatus()
    }, CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [checkPodmanStatus])

  return {
    status,
    loading,
    checkNow: checkPodmanStatus,
  }
}
