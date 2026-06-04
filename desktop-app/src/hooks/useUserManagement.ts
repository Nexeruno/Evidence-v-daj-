import { useState, useCallback } from 'react'
import type { IpcApi } from '@/types/ipc'

interface UserManagementResult {
  success: boolean
  message: string
  userId?: string
  oldRole?: string
  newRole?: string
}

declare global {
  interface Window {
    ipcApi?: IpcApi
  }
}

export function useUserManagement() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const updateUserRole = useCallback(async (
    idToken: string,
    userId: string,
    newRole: 'admin' | 'analyst' | 'viewer'
  ): Promise<UserManagementResult> => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction(
        'adminUpdateUserRole',
        idToken,
        { userId, newRole }
      )

      if (!result.success) {
        throw new Error(result.message || 'Failed to update user role')
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

  const createUser = useCallback(async (
    idToken: string,
    email: string,
    displayName: string,
    role: 'admin' | 'analyst' | 'viewer' = 'viewer'
  ): Promise<UserManagementResult> => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction(
        'adminCreateUser',
        idToken,
        { email, displayName, role }
      )

      if (!result.success) {
        throw new Error(result.message || 'Failed to create user')
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

  const deleteUser = useCallback(async (
    idToken: string,
    userId: string
  ): Promise<UserManagementResult> => {
    setLoading(true)
    setError(null)

    try {
      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction(
        'adminDeleteUser',
        idToken,
        { userId }
      )

      if (!result.success) {
        throw new Error(result.message || 'Failed to delete user')
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

  return {
    updateUserRole,
    createUser,
    deleteUser,
    loading,
    error,
  }
}
