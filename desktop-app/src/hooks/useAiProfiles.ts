import { useState, useCallback } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import type { AiProfile } from '@/types/aiProfile'

export function useAiProfiles() {
  const { getIdToken } = useAuth()
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateProfile = useCallback(
    async (userId: string) => {
      setLoading(true)
      try {
        const token = await getIdToken()
        if (!window.ipcApi) throw new Error('IPC API not available')
        const result = await window.ipcApi.generateAiProfile(token, userId)
        if (result?.ok === true) {
          setError(null)
          return result.profile
        } else {
          throw new Error(result?.error || 'Failed to generate profile')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [getIdToken]
  )

  const generateAllProfiles = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const result = await window.ipcApi.generateAllAiProfiles(token)
      if (result?.ok === true) {
        setError(null)
        return result
      } else {
        throw new Error(result?.error || 'Failed to generate profiles')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [getIdToken])

  return {
    profiles,
    setProfiles,
    loading,
    error,
    generateProfile,
    generateAllProfiles,
  }
}
