import { useState, useEffect } from 'react'
import { useAllUsers } from './useFirestore'

const STORAGE_KEY = 'aurix_admin_selected_user'

export interface UserRecord {
  id: string
  uid?: string
  displayName?: string
  email?: string
  role?: string
}

export function useAdminUserSelector() {
  const { data: rawUsers, loading: usersLoading } = useAllUsers()

  const users: UserRecord[] = rawUsers.map((u: any) => ({
    id: u.id,
    uid: u.id,
    displayName: u.displayName || u.name || null,
    email: u.email || null,
    role: u.role || null,
  }))

  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
  })

  // Once users load, ensure selection is valid ('' = All Users is always valid)
  useEffect(() => {
    if (usersLoading || users.length === 0) return
    if (selectedUserId === '') return // 'All Users' is always valid
    const valid = users.find(u => u.id === selectedUserId)
    if (!valid) {
      setSelectedUserId('')
      try { localStorage.setItem(STORAGE_KEY, '') } catch { /* ignore */ }
    }
  }, [usersLoading, users.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectUser = (uid: string) => {
    setSelectedUserId(uid)
    try { localStorage.setItem(STORAGE_KEY, uid) } catch { /* ignore */ }
  }

  const selectedUser = users.find(u => u.id === selectedUserId) ?? null

  return { users, usersLoading, selectedUserId, selectedUser, selectUser }
}

export function userLabel(u: UserRecord | null, allUsersLabel = 'All Users'): string {
  if (!u) return allUsersLabel
  if (u.displayName && u.email) return `${u.displayName} (${u.email})`
  return u.email || u.displayName || u.id
}
