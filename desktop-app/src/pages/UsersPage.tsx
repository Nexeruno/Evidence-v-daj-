import { useState, useMemo, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useFirestore } from '@/hooks/useFirestore'
import { useAuth } from '@/auth/AuthProvider'
import { User, UserRole, isUserBlocked, ROLE_DESCRIPTIONS, ALL_ROLES, ROLE_COLORS } from '@/types/users'
import toast from 'react-hot-toast'

// ── Module-level helpers (never change identity) ──────────────────────────────

function callCF(fnName: string, token: string, data: Record<string, any>) {
  if (!window.ipcApi) throw new Error('IPC API not available — is this running in Electron?')
  return window.ipcApi.callCloudFunction(fnName, token, data)
}

function fmtDate(val: any): string {
  if (!val) return '—'
  if (val?.seconds) return new Date(val.seconds * 1000).toLocaleDateString()
  if (typeof val === 'number') return new Date(val).toLocaleDateString()
  return String(val).slice(0, 10)
}

function getUid(u: User): string {
  return u.uid || (u as any).id || ''
}

function normalizeUser(u: User): User {
  const uid = getUid(u)
  return uid === u.uid ? u : { ...u, uid }
}

function getUserStatus(u: User): { label: string; css: string } {
  if (u.deleted)        return { label: 'Deleted', css: 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400' }
  if (isUserBlocked(u)) return { label: 'Blocked',  css: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' }
  if (u.isActive)       return { label: 'Active',   css: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' }
  return                       { label: 'Unknown',  css: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400' }
}

const BTN_COLORS: Record<string, string> = {
  blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  green:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  red:    'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  gray:   'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
}

// ActionBtn at module level — stable identity, never remounts on parent re-render
function ActionBtn({ label, onClick, color = 'gray', disabled = false, loading = false }: {
  label: string
  onClick: (e: React.MouseEvent) => void
  color?: string
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(e) }}
      disabled={disabled || loading}
      className={`px-2 py-1 text-xs rounded font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 ${BTN_COLORS[color] ?? BTN_COLORS.gray}`}
    >
      {loading ? '…' : label}
    </button>
  )
}

// ── Error Boundary ────────────────────────────────────────────────────────────

class UserPageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError(): { hasError: boolean } { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[UsersPage error]', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center space-y-4">
          <p className="text-red-600 dark:text-red-400 font-semibold">Users page crashed. Open developer console for details.</p>
          <button type="button" onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
            Reload Users
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalKind = 'view' | 'role' | 'block' | 'unblock' | 'delete' | 'reset' | null

interface ModalState {
  kind: ModalKind
  user: User | null
  // role modal
  pendingRole?: UserRole
  // UI state inside modals
  error: string
  detailTab: 'info' | 'predictions' | 'transactions'
  detailPreds: any[]
  detailTxns: { income: any[]; expense: any[] } | null
  detailLoading: boolean
}

const EMPTY_MODAL: ModalState = {
  kind: null, user: null, pendingRole: undefined, error: '',
  detailTab: 'info', detailPreds: [], detailTxns: null, detailLoading: false,
}

// ── Component ─────────────────────────────────────────────────────────────────

function UsersPageInner() {
  const { data: remoteUsers, loading: usersLoading, error: usersError } = useFirestore<User>('users', [orderBy('createdAt', 'desc')])
  const { user: currentUser, getIdToken } = useAuth()

  const [localUsers, setLocalUsers] = useState<User[]>([])
  useEffect(() => { setLocalUsers(remoteUsers.map(normalizeUser)) }, [remoteUsers])

  // Single modal state — one source of truth for which user and which action
  const [modal, setModal] = useState<ModalState>(EMPTY_MODAL)

  // Per-user action loading: { uid, action }
  const [acting, setActing] = useState<{ uid: string; action: string } | null>(null)

  // Search / filter
  const [search, setSearch]           = useState('')
  const [filterRole, setFilterRole]   = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Add user modal (separate, simpler state)
  const [addOpen, setAddOpen]   = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName]   = useState('')
  const [newRole, setNewRole]   = useState<UserRole>('viewer')
  const [sendLater, setSendLater] = useState(false)
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => localUsers.filter(u => {
    if (u.deleted) return false
    const q = search.toLowerCase()
    const matchSearch = !q || u.email.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) || u.uid.toLowerCase().includes(q)
    const matchRole   = filterRole === 'all' || u.role === filterRole
    const blocked     = isUserBlocked(u)
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && !blocked) || (filterStatus === 'blocked' && blocked)
    return matchSearch && matchRole && matchStatus
  }), [localUsers, search, filterRole, filterStatus])

  // ── Optimistic patch ──────────────────────────────────────────────────────
  const patchUser = useCallback((uid: string, patch: Partial<User>) => {
    setLocalUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...patch } : u))
  }, [])

  // ── Open modal — single entry point, always takes the fresh user object ───
  const openModal = useCallback((kind: ModalKind, user: User) => {
    const n = normalizeUser(user)
    console.log('[USERS_CLICK_DEBUG]', { kind, uid: n.uid, email: n.email })
    setModal({
      ...EMPTY_MODAL,
      kind,
      user: n,
      pendingRole: kind === 'role' ? n.role : undefined,
    })
  }, [])

  const closeModal = useCallback(() => setModal(EMPTY_MODAL), [])

  const patchModal = useCallback((patch: Partial<ModalState>) => {
    setModal(prev => ({ ...prev, ...patch }))
  }, [])

  // ── Generic action runner ─────────────────────────────────────────────────
  const runAction = useCallback(async (
    uid: string,
    action: string,
    fn: (token: string) => Promise<any>
  ): Promise<boolean> => {
    if (!uid) {
      console.error('[USERS_ACTION_DEBUG]', { action, error: 'uid empty' })
      patchModal({ error: 'User UID is missing. Cannot perform this action.' })
      return false
    }
    setActing({ uid, action })
    try {
      const token = await getIdToken()
      const result = await fn(token)
      console.log('[USERS_ACTION_DEBUG]', { action, targetUid: uid, resultOk: result?.ok, resultError: result?.error ?? null })
      if (result?.notApplicable) {
        toast(result.message || 'Not applicable', { icon: 'ℹ️' })
        return false
      }
      if (result?.ok !== true) {
        const errMsg = result?.error?.includes('404') || result?.error?.includes('not deployed')
          ? 'Backend function not deployed yet.'
          : result?.error || 'Operation failed'
        throw new Error(errMsg)
      }
      if (result.updatedFields) patchUser(uid, result.updatedFields)
      return true
    } finally {
      setActing(null)
    }
  }, [getIdToken, patchModal, patchUser])

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    const { kind, user } = modal
    if (!user || !kind || kind === 'view' || kind === 'role') return
    const uid = getUid(user)
    if (!uid) { patchModal({ error: 'User UID missing.' }); return }
    patchModal({ error: '' })

    const MAP: Record<string, { fn: string; msg: string; patch?: Partial<User> }> = {
      block:   { fn: 'adminBlockUser',         msg: 'User blocked',             patch: { isActive: false, blocked: true,  disabled: true,  status: 'blocked' } as any },
      unblock: { fn: 'adminUnblockUser',       msg: 'User unblocked',           patch: { isActive: true,  blocked: false, disabled: false, status: 'active'  } as any },
      delete:  { fn: 'adminDeleteUser',        msg: 'User deleted',             patch: { deleted: true, isActive: false } },
      reset:   { fn: 'adminResetUserPassword', msg: 'Password reset email sent' },
    }
    const { fn, msg, patch } = MAP[kind]
    console.log('[USERS_CONFIRM_DEBUG]', { action: kind, uid, email: user.email })
    try {
      const ok = await runAction(uid, kind, token => callCF(fn, token, { targetUid: uid }))
      if (!ok) { closeModal(); return }
      if (patch) patchUser(uid, patch)
      toast.success(msg)
      closeModal()
    } catch (err) {
      patchModal({ error: err instanceof Error ? err.message : 'Operation failed' })
      toast.error(err instanceof Error ? err.message : 'Operation failed')
    }
  }, [modal, runAction, patchUser, patchModal, closeModal])

  const handleRoleSave = useCallback(async () => {
    const { user, pendingRole } = modal
    if (!user || !pendingRole) return
    const uid = getUid(user)
    patchModal({ error: '' })
    console.log('[USERS_CONFIRM_DEBUG]', { action: 'role', uid, email: user.email, newRole: pendingRole })
    try {
      const ok = await runAction(uid, 'role', token =>
        callCF('adminUpdateUserRole', token, { targetUid: uid, newRole: pendingRole })
      )
      if (!ok) return
      patchUser(uid, { role: pendingRole })
      toast.success(`Role changed to ${pendingRole}`)
      closeModal()
    } catch (err) {
      patchModal({ error: err instanceof Error ? err.message : 'Role update failed' })
      toast.error(err instanceof Error ? err.message : 'Role update failed')
    }
  }, [modal, runAction, patchUser, patchModal, closeModal])

  const handleAddUser = useCallback(async () => {
    if (!newEmail || !newName) { toast.error('Fill in email and display name'); return }
    setAddError(''); setAddLoading(true)
    try {
      const token = await getIdToken()
      const result = await callCF('adminCreateUser', token, { email: newEmail, displayName: newName, role: newRole, sendInviteLater: sendLater })
      if (result?.ok !== true) throw new Error(result?.error || 'Failed to create user')
      toast.success(`User ${newEmail} created`)
      if (result.message && !sendLater) alert(result.message)
      setNewEmail(''); setNewName(''); setNewRole('viewer'); setSendLater(false); setAddOpen(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create user')
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setAddLoading(false)
    }
  }, [newEmail, newName, newRole, sendLater, getIdToken])

  // ── Detail tab loaders ────────────────────────────────────────────────────

  const loadPredictions = useCallback(async (uid: string) => {
    patchModal({ detailLoading: true, detailPreds: [] })
    let cancelled = false
    try {
      const snap = await getDocs(query(collection(db, `users/${uid}/mlPredictions`), orderBy('createdAt', 'desc')))
      if (!cancelled) patchModal({ detailPreds: snap.docs.slice(0, 20).map(d => ({ id: d.id, ...d.data() })), detailLoading: false })
    } catch {
      if (!cancelled) patchModal({ detailPreds: [], detailLoading: false })
    }
    return () => { cancelled = true }
  }, [patchModal])

  const loadTransactions = useCallback(async (uid: string) => {
    patchModal({ detailLoading: true, detailTxns: null })
    let cancelled = false
    try {
      const [inc, exp] = await Promise.all([
        getDocs(query(collection(db, `users/${uid}/prijmy`), orderBy('datum', 'desc'))),
        getDocs(query(collection(db, `users/${uid}/vydaje`), orderBy('datum', 'desc'))),
      ])
      if (!cancelled) patchModal({
        detailTxns: {
          income:  inc.docs.slice(0, 10).map(d => ({ id: d.id, ...d.data() })),
          expense: exp.docs.slice(0, 10).map(d => ({ id: d.id, ...d.data() })),
        },
        detailLoading: false,
      })
    } catch {
      if (!cancelled) patchModal({ detailTxns: { income: [], expense: [] }, detailLoading: false })
    }
    return () => { cancelled = true }
  }, [patchModal])

  const switchDetailTab = useCallback((tab: 'info' | 'predictions' | 'transactions', uid: string) => {
    patchModal({ detailTab: tab })
    if (tab === 'predictions') loadPredictions(uid)
    if (tab === 'transactions') loadTransactions(uid)
  }, [patchModal, loadPredictions, loadTransactions])

  // ── Per-user acting helpers ───────────────────────────────────────────────
  const isActingFor = (uid: string, action?: string) => {
    if (!acting || !uid) return false
    return acting.uid === uid && (!action || acting.action === action)
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  const { kind: modalKind, user: modalUser } = modal

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Users Management</h1>
        <button type="button" onClick={() => { setAddError(''); setAddOpen(true) }}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm transition-colors">
          + Add User
        </button>
      </div>

      {/* Search + filters */}
      <div className="card rounded-lg p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-light-textMuted dark:text-dark-textMuted mb-1">Search</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Email, name, UID…" className="input-field rounded-lg w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-light-textMuted dark:text-dark-textMuted mb-1">Role</label>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="select-field rounded-lg text-sm">
            <option value="all">All roles</option>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-light-textMuted dark:text-dark-textMuted mb-1">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select-field rounded-lg text-sm">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        {(search || filterRole !== 'all' || filterStatus !== 'all') && (
          <button type="button" onClick={() => { setSearch(''); setFilterRole('all'); setFilterStatus('all') }}
            className="px-3 py-1.5 text-xs text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total',   value: localUsers.filter(u => !u.deleted).length,                      color: 'text-light-text dark:text-dark-text' },
          { label: 'Active',  value: localUsers.filter(u => !u.deleted && !isUserBlocked(u)).length, color: 'text-green-600 dark:text-green-400' },
          { label: 'Blocked', value: localUsers.filter(u => !u.deleted && isUserBlocked(u)).length,  color: 'text-yellow-600 dark:text-yellow-400' },
          { label: 'Admins',  value: localUsers.filter(u => !u.deleted && u.role === 'admin').length, color: 'text-red-600 dark:text-red-400' },
        ].map(s => (
          <div key={s.label} className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card rounded-lg overflow-hidden">
        {usersError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 dark:text-red-400 font-semibold">⚠️ Error loading users</p>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">{usersError.message}</p>
          </div>
        ) : usersLoading ? (
          <div className="p-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-light-textMuted dark:text-dark-textMuted">No users match the current filter</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  {['Email', 'Name', 'Role', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-light-text dark:text-dark-text text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {filtered.map(u => {
                  const uid     = getUid(u)
                  const blocked = isUserBlocked(u)
                  const isSelf  = uid === (currentUser?.uid || '')
                  const status  = getUserStatus(u)
                  const rowBusy = acting?.uid === uid

                  return (
                    <tr key={uid} className={`transition-colors ${rowBusy ? 'opacity-60 bg-light-bg dark:bg-dark-bg' : 'hover:bg-light-bg dark:hover:bg-dark-bg'}`}>
                      <td className="px-4 py-3 font-medium text-light-text dark:text-dark-text">
                        <span title={uid}>{u.email}</span>
                      </td>
                      <td className="px-4 py-3 text-light-textMuted dark:text-dark-textMuted">{u.displayName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${status.css}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-light-textMuted dark:text-dark-textMuted">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <ActionBtn label="View"    color="gray"   disabled={rowBusy}                         onClick={() => openModal('view', u)} />
                          <ActionBtn label="Role"    color="blue"   disabled={rowBusy}                         onClick={() => openModal('role', u)} />
                          {!isSelf && (blocked
                            ? <ActionBtn label="Unblock" color="green"  loading={isActingFor(uid,'unblock')} disabled={rowBusy && !isActingFor(uid,'unblock')} onClick={() => openModal('unblock', u)} />
                            : <ActionBtn label="Block"   color="yellow" loading={isActingFor(uid,'block')}   disabled={rowBusy && !isActingFor(uid,'block')}   onClick={() => openModal('block',   u)} />
                          )}
                          {!isSelf && <ActionBtn label="Reset pw" color="orange" disabled={rowBusy} onClick={() => openModal('reset', u)} />}
                          {!isSelf && <ActionBtn label="Delete"   color="red"    disabled={rowBusy} onClick={() => openModal('delete', u)} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── View Detail Modal ─────────────────────────────────────────────── */}
      {modalKind === 'view' && modalUser && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-light-card dark:bg-dark-card rounded-lg w-full max-w-2xl border border-light-border dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-light-border dark:border-dark-border">
              <div>
                <h3 className="text-xl font-bold text-light-text dark:text-dark-text">User Detail</h3>
                <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-0.5">{modalUser.email}</p>
              </div>
              <button type="button" onClick={closeModal} className="text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text text-xl leading-none">✕</button>
            </div>
            <div className="flex border-b border-light-border dark:border-dark-border px-6">
              {(['info', 'predictions', 'transactions'] as const).map(tab => (
                <button key={tab} type="button"
                  onClick={() => switchDetailTab(tab, getUid(modalUser))}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors capitalize ${
                    modal.detailTab === tab ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text'
                  }`}>{tab}</button>
              ))}
            </div>
            <div className="overflow-y-auto p-6 flex-1">
              {modal.detailTab === 'info' && (() => {
                const live = localUsers.find(u => getUid(u) === getUid(modalUser)) || modalUser
                const st = getUserStatus(live)
                return (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {([
                      ['UID', live.uid], ['Email', live.email], ['Name', live.displayName || '—'],
                      ['Role', live.role], ['Status', st.label], ['Created', fmtDate(live.createdAt)],
                      ['Last active', fmtDate(live.lastActivity)], ['Blocked', live.blocked ? 'Yes' : 'No'],
                      ['Deleted', live.deleted ? 'Yes' : 'No'],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="space-y-0.5">
                        <dt className="text-xs font-semibold text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide">{k}</dt>
                        <dd className="text-light-text dark:text-dark-text font-mono text-xs break-all">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )
              })()}
              {modal.detailTab === 'predictions' && (
                modal.detailLoading ? <p className="text-light-textMuted dark:text-dark-textMuted">Loading...</p> :
                !modal.detailPreds.length ? <p className="text-light-textMuted dark:text-dark-textMuted">No predictions found.</p> :
                <div className="space-y-2 text-sm">
                  {modal.detailPreds.map(p => (
                    <div key={p.id} className="p-3 rounded bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border">
                      <div className="font-semibold text-light-text dark:text-dark-text">{p.category || p.type || p.id}</div>
                      <div className="text-xs text-light-textMuted dark:text-dark-textMuted">{fmtDate(p.createdAt)} · confidence: {p.confidence ?? '—'}</div>
                    </div>
                  ))}
                </div>
              )}
              {modal.detailTab === 'transactions' && (() => {
                if (modal.detailLoading) return <p className="text-light-textMuted dark:text-dark-textMuted">Loading...</p>
                if (!modal.detailTxns) return <p className="text-light-textMuted dark:text-dark-textMuted">Not loaded.</p>
                return (
                  <div className="space-y-4 text-sm">
                    {(['income', 'expense'] as const).map(kind => (
                      <div key={kind}>
                        <p className="font-semibold text-light-text dark:text-dark-text mb-2 capitalize">{kind} ({modal.detailTxns![kind].length})</p>
                        {!modal.detailTxns![kind].length ? <p className="text-light-textMuted dark:text-dark-textMuted">No records.</p> :
                          modal.detailTxns![kind].map(t => (
                            <div key={t.id} className="flex justify-between p-2 rounded bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border mb-1">
                              <span className="text-light-text dark:text-dark-text">{t.popis || t.id}</span>
                              <span className={kind === 'income' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                {t.castka ? `${kind === 'income' ? '+' : '-'}${t.castka}` : '—'}
                              </span>
                            </div>
                          ))
                        }
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Role Modal ────────────────────────────────────────────────────── */}
      {modalKind === 'role' && modalUser && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-light-card dark:bg-dark-card rounded-lg w-full max-w-md border border-light-border dark:border-dark-border">
            <div className="p-6 border-b border-light-border dark:border-dark-border">
              <h3 className="text-xl font-bold text-light-text dark:text-dark-text">Change Role</h3>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
                {modalUser.displayName || modalUser.email} — current: <strong>{modalUser.role}</strong>
              </p>
            </div>
            <div className="p-6 space-y-2">
              {ALL_ROLES.map(role => (
                <button key={role} type="button" onClick={() => patchModal({ pendingRole: role })}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    modal.pendingRole === role ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-light-border dark:border-dark-border hover:border-blue-400'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                    {role === modalUser.role && <span className="text-xs text-light-textMuted dark:text-dark-textMuted">current</span>}
                  </div>
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-1">{ROLE_DESCRIPTIONS[role]}</p>
                </button>
              ))}
            </div>
            {modal.error && <div className="mx-6 mb-2 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{modal.error}</div>}
            {modal.pendingRole && modal.pendingRole !== modalUser.role && !modal.error && (
              <p className="px-6 pb-2 text-sm text-light-text dark:text-dark-text">
                Change from <strong>{modalUser.role}</strong> → <strong>{modal.pendingRole}</strong>?
              </p>
            )}
            <div className="flex gap-3 p-6 pt-2">
              <button type="button" onClick={closeModal}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg font-semibold transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleRoleSave}
                disabled={isActingFor(getUid(modalUser), 'role') || !modal.pendingRole || modal.pendingRole === modalUser.role}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {isActingFor(getUid(modalUser), 'role') ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal (block / unblock / delete / reset) ─────────────── */}
      {(modalKind === 'block' || modalKind === 'unblock' || modalKind === 'delete' || modalKind === 'reset') && modalUser && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-light-card dark:bg-dark-card rounded-lg w-full max-w-md border border-light-border dark:border-dark-border p-6">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-2">
              {modalKind === 'block'   && 'Block user?'}
              {modalKind === 'unblock' && 'Unblock user?'}
              {modalKind === 'delete'  && 'Delete user?'}
              {modalKind === 'reset'   && 'Reset password?'}
            </h3>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-1">{modalUser.displayName || modalUser.email}</p>
            <p className="text-xs font-mono text-light-textMuted dark:text-dark-textMuted mb-4">{getUid(modalUser)}</p>
            {modalKind === 'delete' && (
              <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm mb-4">
                This will disable the account and mark it as deleted. Cannot be easily reversed.
              </div>
            )}
            {modalKind === 'block'   && <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-4">The user will not be able to sign in.</p>}
            {modalKind === 'unblock' && <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-4">The user will be able to sign in again.</p>}
            {modalKind === 'reset'   && <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-4">A password reset email will be sent to <strong>{modalUser.email}</strong>.</p>}
            {modal.error && <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm mb-4">{modal.error}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={closeModal}
                disabled={isActingFor(getUid(modalUser), modalKind)}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg font-semibold transition-colors disabled:opacity-40">
                Cancel
              </button>
              <button type="button" onClick={handleConfirm}
                disabled={isActingFor(getUid(modalUser), modalKind)}
                className={`flex-1 px-4 py-2 rounded-lg text-white font-semibold transition-colors disabled:opacity-40 ${
                  modalKind === 'delete' ? 'bg-red-600 hover:bg-red-700' :
                  modalKind === 'block'  ? 'bg-yellow-600 hover:bg-yellow-700' :
                  'bg-blue-600 hover:bg-blue-700'
                }`}>
                {isActingFor(getUid(modalUser), modalKind)
                  ? `${modalKind === 'block' ? 'Blocking' : modalKind === 'unblock' ? 'Unblocking' : modalKind === 'delete' ? 'Deleting' : 'Sending'}…`
                  : modalKind === 'delete' ? 'Delete user' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add User Modal ────────────────────────────────────────────────── */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-light-card dark:bg-dark-card rounded-lg w-full max-w-md border border-light-border dark:border-dark-border p-6">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">Add New User</h3>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">Email *</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" className="input-field rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">Display Name *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" className="input-field rounded-lg w-full" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">Role *</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="select-field rounded-lg w-full">
                  {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-light-text dark:text-dark-text cursor-pointer">
                <input type="checkbox" checked={sendLater} onChange={e => setSendLater(e.target.checked)} className="w-4 h-4" />
                Send invite later (no temporary password)
              </label>
            </div>
            {addError && <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{addError}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setAddOpen(false)}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg font-semibold transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleAddUser} disabled={addLoading}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors disabled:opacity-50">
                {addLoading ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ActionBtn needs uid for disabled check — pass via wrapper
// The actual ActionBtn component is at module level (no props.uid needed there)
// We re-export with the wrapper
export function UsersPage() {
  return (
    <UserPageErrorBoundary>
      <UsersPageInner />
    </UserPageErrorBoundary>
  )
}
