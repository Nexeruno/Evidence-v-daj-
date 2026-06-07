import { useState, useEffect, useCallback } from 'react'

/**
 * Runtime Status Hook
 *
 * FÁZE 4.6B: Track basic Python ML runtime status
 * - Runtime availability (health check)
 * - Last request status
 * - Last response validity
 */

export interface RuntimeStatus {
  available: boolean
  lastCheckTime?: Date
  lastRequestStatus?: 'pending' | 'success' | 'failed'
  lastResponseValid?: boolean
  lastError?: string
}

// Canonical Python runtime endpoint for local dev mode.
// The Python Flask server (ml-runtime/app.py) listens on this address.
// Browser fetches this directly — no proxy layer exists in local dev.
export const RUNTIME_URL = 'http://localhost:5000'

const HEALTH_ENDPOINT = `${RUNTIME_URL}/health`
const CHECK_INTERVAL = 5000 // Check every 5 seconds

export function useRuntimeStatus() {
  const [status, setStatus] = useState<RuntimeStatus>({
    available: false,
    lastCheckTime: undefined,
    lastRequestStatus: undefined,
    lastResponseValid: undefined,
    lastError: undefined,
  })

  const [loading, setLoading] = useState(true)

  const checkRuntimeHealth = useCallback(async () => {
    try {
      setStatus((prev) => ({ ...prev, lastRequestStatus: 'pending' }))

      const response = await fetch(HEALTH_ENDPOINT, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Python runtime returns { status: 'healthy', service: 'ml-runtime', ... }
      const isValid = data.status === 'healthy' && data.service === 'ml-runtime'

      setStatus({
        available: isValid,
        lastCheckTime: new Date(),
        lastRequestStatus: isValid ? 'success' : 'failed',
        lastResponseValid: isValid,
        lastError: isValid ? undefined : `Unexpected response: status=${data.status}`,
      })
    } catch (error) {
      const errorReason = (() => {
        if (!(error instanceof Error)) return 'Runtime unavailable'
        const msg = error.message.toLowerCase()
        if (msg.includes('econnrefused') || msg.includes('refused') || msg.includes('failed to fetch'))
          return `Python runtime not running on ${RUNTIME_URL}`
        if (msg.includes('enotfound')) return 'Cannot resolve runtime host'
        if (msg.includes('timeout') || msg.includes('timed out')) return 'Runtime health check timed out'
        return 'Runtime unavailable'
      })()

      if (process.env.NODE_ENV === 'development') {
        console.debug('[RuntimeStatus] Health check failed:', errorReason)
      }

      setStatus({
        available: false,
        lastCheckTime: new Date(),
        lastRequestStatus: 'failed',
        lastResponseValid: false,
        lastError: errorReason,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkRuntimeHealth()
  }, [checkRuntimeHealth])

  useEffect(() => {
    const interval = setInterval(checkRuntimeHealth, CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [checkRuntimeHealth])

  return { status, loading, checkNow: checkRuntimeHealth }
}
