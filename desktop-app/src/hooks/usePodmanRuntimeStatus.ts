import { useState, useEffect, useCallback } from 'react'

/**
 * Podman Runtime Status Hook
 *
 * FÁZA 6.3A: Track Podman multi-service runtime state
 * - Podman runtime connected/disconnected status
 * - Last runtime check time
 * - Connection readiness verdict
 */

export interface PodmanRuntimeWarning {
  type: 'runtime_unavailable' | 'fallback_active' | 'config_mismatch'
  severity: 'warning' | 'critical'
  message: string
  timestamp?: Date
}

export interface PodmanRuntimeDetails {
  endpoint?: string
  mode?: 'ready' | 'degraded' | 'unavailable'
  lastHandshakeTime?: Date
  lastHandshakeStatus?: 'success' | 'failed'
}

export interface PodmanRuntimeStatus {
  connected: boolean
  lastCheckTime?: Date
  lastCheckStatus?: 'pending' | 'success' | 'failed'
  connectionReadiness?: 'ready' | 'degraded' | 'unavailable'
  mlRuntimeReachable?: boolean
  mlRuntimeHealthy?: boolean
  runtimeAvailable?: boolean
  requestPathHealthy?: boolean
  warnings?: PodmanRuntimeWarning[]
  details?: PodmanRuntimeDetails
  lastError?: string
}

// Canonical runtime endpoint (Podman multi-service network)
const RUNTIME_ENDPOINT = 'http://ml-runtime:5000'

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
    warnings: [],
    details: undefined,
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

      // Handle non-200 responses gracefully
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Extract ML Runtime status from dependencies
      const mlRuntimeDep = data.dependencies?.mlRuntime
      const isReachable = mlRuntimeDep?.reachable ?? false
      const isHealthy = mlRuntimeDep?.status === 'healthy'
      const readiness = data.status ?? 'unavailable'

      // Container health: runtime available + request path healthy
      const runtimeAvailable = isReachable && response.ok
      const requestPathHealthy = isHealthy && isReachable

      // Extract runtime details
      const endpoint = mlRuntimeDep?.url ?? RUNTIME_ENDPOINT
      const mode = readiness
      const lastHandshakeTime = mlRuntimeDep?.lastCheck ? new Date(mlRuntimeDep.lastCheck) : undefined
      const lastHandshakeStatus = isHealthy ? 'success' : 'failed'

      // Detect warning states
      const warnings: PodmanRuntimeWarning[] = []

      // 1. Runtime Unavailable
      if (!isReachable) {
        warnings.push({
          type: 'runtime_unavailable',
          severity: 'critical',
          message: 'ML Runtime is not reachable. Check if Podman container is running.',
          timestamp: new Date(),
        })
      }

      // 2. Fallback Active (degraded state)
      if (readiness === 'degraded') {
        warnings.push({
          type: 'fallback_active',
          severity: 'warning',
          message: 'System is in degraded mode. Fallback responses active.',
          timestamp: new Date(),
        })
      }

      // 3. Config Mismatch (response OK but not ready)
      if (response.ok && readiness !== 'ready' && readiness !== 'degraded') {
        warnings.push({
          type: 'config_mismatch',
          severity: 'warning',
          message: 'Configuration mismatch detected. Check environment variables and settings.',
          timestamp: new Date(),
        })
      }

      setStatus({
        connected: response.ok && isReachable,
        lastCheckTime: new Date(),
        lastCheckStatus: response.ok ? 'success' : 'failed',
        connectionReadiness: readiness,
        mlRuntimeReachable: isReachable,
        mlRuntimeHealthy: isHealthy,
        runtimeAvailable,
        requestPathHealthy,
        warnings,
        details: {
          endpoint,
          mode: mode as 'ready' | 'degraded' | 'unavailable',
          lastHandshakeTime,
          lastHandshakeStatus,
        },
        lastError: undefined,
      })
    } catch (error) {
      // Determine readable error reason
      const errorReason = (() => {
        if (!(error instanceof Error)) return 'Backend unavailable'
        const msg = error.message.toLowerCase()
        if (msg.includes('econnrefused') || msg.includes('refused'))
          return 'Backend not running on http://localhost:3000'
        if (msg.includes('enotfound') || msg.includes('notfound'))
          return 'Cannot reach backend server'
        if (msg.includes('timeout'))
          return 'Backend response timeout'
        return 'Backend unavailable'
      })()

      // Log only once at debug level (no console spam)
      if (process.env.NODE_ENV === 'development') {
        console.debug('[Podman Status] Dependency check failed:', errorReason)
      }

      const warnings: PodmanRuntimeWarning[] = [
        {
          type: 'runtime_unavailable',
          severity: 'critical',
          message: `Runtime unavailable: ${errorReason}`,
          timestamp: new Date(),
        },
      ]

      setStatus({
        connected: false,
        lastCheckTime: new Date(),
        lastCheckStatus: 'failed',
        connectionReadiness: 'unavailable',
        mlRuntimeReachable: false,
        mlRuntimeHealthy: false,
        runtimeAvailable: false,
        requestPathHealthy: false,
        warnings,
        details: {
          endpoint: RUNTIME_ENDPOINT,
          mode: 'unavailable',
          lastHandshakeStatus: 'failed',
        },
        lastError: errorReason,
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
