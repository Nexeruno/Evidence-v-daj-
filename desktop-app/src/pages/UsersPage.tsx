import { useState } from 'react'
import { useFirestore } from '@/hooks/useFirestore'
import { useAuth } from '@/auth/AuthProvider'
import { User } from '@/types/users'
import toast from 'react-hot-toast'

export function UsersPage() {
  const { data: users, loading, error } = useFirestore<User>('users')
  const { user: currentUser, getIdToken } = useAuth()

  // Role change state
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<string>('user')
  const [statusMessage, setStatusMessage] = useState('')
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Add user modal state
  const [addUserModalOpen, setAddUserModalOpen] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState<string>('user')
  const [sendInviteLater, setSendInviteLater] = useState(false)

  const validRoles = ['user', 'admin', 'ml_admin', 'developer']

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      case 'ml_admin':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
      case 'developer':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      case 'user':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Role Change Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleRoleChange = (userId: string, role: string) => {
    // Prevent removing own admin role
    if (userId === currentUser?.uid && role !== 'admin') {
      setStatusMessage("❌ Cannot remove your own admin role")
      toast.error('Cannot remove your own admin role')
      return
    }

    // Prevent removing last admin
    const adminCount = users.filter((u: User) => u.role === 'admin').length
    if (adminCount === 1 && role !== 'admin') {
      setStatusMessage("❌ Cannot remove last admin user")
      toast.error('Cannot remove last admin user')
      return
    }

    setEditingUserId(userId)
    setNewRole(role)
    setConfirmModalOpen(true)
  }

  const confirmRoleChange = async () => {
    if (!editingUserId) return

    try {
      setIsProcessing(true)
      setStatusMessage('Updating user role...')

      const token = await getIdToken()

      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction('adminUpdateUserRole', token, {
        userId: editingUserId,
        newRole,
      })

      if (!result.ok) {
        throw new Error(result.error || 'Failed to update role')
      }

      setStatusMessage(`✅ User role updated to ${newRole}`)
      toast.success('User role updated')
      setConfirmModalOpen(false)
      setEditingUserId(null)
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Failed: ${message}`)
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Add User Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleAddUser = async () => {
    if (!newUserEmail || !newUserName) {
      toast.error('Please fill in email and name')
      return
    }

    if (!newUserRole) {
      toast.error('Please select a role')
      return
    }

    try {
      setIsProcessing(true)
      setStatusMessage('Creating user...')

      const token = await getIdToken()

      if (!window.ipcApi) {
        throw new Error('IPC API not available')
      }

      const result = await window.ipcApi.callCloudFunction('adminCreateUser', token, {
        email: newUserEmail,
        displayName: newUserName,
        role: newUserRole,
        sendInviteLater,
      })

      if (!result.ok) {
        throw new Error(result.error || 'Failed to create user')
      }

      setStatusMessage(`✅ User created: ${newUserEmail}`)
      toast.success(`User ${newUserEmail} created successfully`)

      // Show temporary password if one was created
      if (result.message && !sendInviteLater) {
        alert(`User created!\n\n${result.message}`)
      }

      // Reset form
      setNewUserEmail('')
      setNewUserName('')
      setNewUserRole('user')
      setSendInviteLater(false)
      setAddUserModalOpen(false)

      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Failed: ${message}`)
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Users Management</h1>
        <button
          onClick={() => setAddUserModalOpen(true)}
          disabled={isProcessing}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ➕ Add User
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-lg text-sm transition-colors duration-200 ${
            statusMessage.includes('✅')
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Users Table */}
      <div className="card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {error ? (
            <div className="px-6 py-8 text-center">
              <div className="text-red-600 dark:text-red-400 font-semibold mb-2">⚠️ Error loading users</div>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{error.message}</p>
            </div>
          ) : loading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : users.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No users found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Email</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Name</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Role</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Created</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: User) => (
                  <tr key={user.uid} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text font-medium">{user.email}</td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted">{user.displayName || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getRoleColor(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          user.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted text-xs">
                      {new Date(user.createdAt as any).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const newRole = user.role === 'admin' ? 'user' : 'admin'
                            handleRoleChange(user.uid, newRole)
                          }}
                          disabled={isProcessing}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:opacity-80 transition-colors duration-200 disabled:opacity-50"
                        >
                          ✏️ Edit
                        </button>
                        {user.uid !== currentUser?.uid && (
                          <button
                            disabled
                            title="Delete functionality coming soon"
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded cursor-not-allowed"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Total Users</p>
          <p className="text-3xl font-bold text-light-text dark:text-dark-text mt-2">{users.length}</p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Admins</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
            {users.filter((u: User) => u.role === 'admin').length}
          </p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Active Users</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
            {users.filter((u: User) => u.isActive).length}
          </p>
        </div>
      </div>

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md w-full mx-4 border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">➕ Add New User</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">Email *</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  disabled={isProcessing}
                  placeholder="user@example.com"
                  className="input-field rounded-lg w-full disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  disabled={isProcessing}
                  placeholder="John Doe"
                  className="input-field rounded-lg w-full disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-1">Role *</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  disabled={isProcessing}
                  className="select-field rounded-lg w-full disabled:opacity-50"
                >
                  <option value="">Select role</option>
                  {validRoles.map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-light-text dark:text-dark-text">
                <input
                  type="checkbox"
                  checked={sendInviteLater}
                  onChange={(e) => setSendInviteLater(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4"
                />
                <span>Send invite later (no temporary password)</span>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setAddUserModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? '⏳ Creating...' : '✨ Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">Change User Role?</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-6">
              Change role to <span className="font-semibold text-light-text dark:text-dark-text">{newRole}</span>?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRoleChange}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold transition-colors duration-200 disabled:opacity-50"
              >
                {isProcessing ? '⏳ Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
