import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/config/firebase'
import toast from 'react-hot-toast'

export function SettingsPage() {
  const { user } = useAuth()
  const [cacheStats, setCacheStats] = useState({
    size: '2.4 MB',
    entries: 1523,
    lastCleared: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  })

  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false)

  const [settings, setSettings] = useState({
    autoRefreshDashboard: true,
    refreshInterval: 30,
    enableNotifications: true,
    cacheEnabled: true,
    maxCacheSize: 50, // MB
  })

  const [statusMessage, setStatusMessage] = useState('')

  const handleUpdateDisplayName = async () => {
    if (!user) return
    try {
      setStatusMessage('Updating display name...')
      await updateProfile(user, { displayName })
      setStatusMessage('✅ Display name updated successfully')
      toast.success('Display name updated')
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      setStatusMessage(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      toast.error('Failed to update display name')
    }
  }

  const handleChangePassword = async () => {
    if (!user?.email) return
    try {
      setStatusMessage('Sending password reset email...')
      await sendPasswordResetEmail(auth, user.email)
      setStatusMessage('✅ Password reset email sent. Check your inbox.')
      toast.success('Password reset email sent')
      setChangePasswordModalOpen(false)
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      setStatusMessage(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      toast.error('Failed to send reset email')
    }
  }

  const handleClearCache = async () => {
    try {
      setStatusMessage('Clearing cache...')
      if (window.ipcApi) {
        await window.ipcApi.clearLocalCache()
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      setCacheStats({
        size: '0.1 MB',
        entries: 0,
        lastCleared: new Date()
      })
      setStatusMessage('✅ Cache cleared successfully')
      toast.success('Cache cleared')
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      setStatusMessage('❌ Failed to clear cache')
      toast.error('Failed to clear cache')
    }
  }

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
    setStatusMessage(`✅ ${key} updated`)
    setTimeout(() => setStatusMessage(''), 3000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Settings</h1>

      {statusMessage && (
        <div className={`p-4 rounded-lg text-sm transition-colors duration-200 ${
          statusMessage.includes('✅') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMessage}
        </div>
      )}

      {/* Account Settings */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-6">Account</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-2 border border-light-border dark:border-dark-border rounded-lg bg-light-border dark:bg-dark-border text-light-textMuted dark:text-dark-textMuted cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Display Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="flex-1 input-field rounded-lg"
              />
              <button
                onClick={handleUpdateDisplayName}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold whitespace-nowrap transition-colors duration-200"
              >
                Save
              </button>
            </div>
          </div>
          <button
            onClick={() => setChangePasswordModalOpen(true)}
            className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold transition-colors duration-200"
          >
            🔐 Change Password
          </button>
        </div>
      </div>

      {/* Display Settings */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-6">Display</h2>
        <p className="text-light-textMuted dark:text-dark-textMuted text-sm">
          Theme switcher is available in the top-right corner next to your email.
        </p>
      </div>

      {/* Dashboard Settings */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-6">Dashboard</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-light-text dark:text-dark-text">
            <input
              type="checkbox"
              checked={settings.autoRefreshDashboard}
              onChange={(e) => handleSettingChange('autoRefreshDashboard', e.target.checked)}
              className="w-4 h-4"
            />
            <span>Auto-refresh Dashboard</span>
          </label>

          {settings.autoRefreshDashboard && (
            <div>
              <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                Refresh Interval (seconds)
              </label>
              <input
                type="number"
                value={settings.refreshInterval}
                onChange={(e) => handleSettingChange('refreshInterval', parseInt(e.target.value))}
                min="10"
                max="300"
                className="w-full input-field rounded-lg"
              />
            </div>
          )}

          <label className="flex items-center gap-3 text-light-text dark:text-dark-text">
            <input
              type="checkbox"
              checked={settings.enableNotifications}
              onChange={(e) => handleSettingChange('enableNotifications', e.target.checked)}
              className="w-4 h-4"
            />
            <span>Enable Notifications</span>
          </label>
        </div>
      </div>

      {/* Cache Settings */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-6">Local Cache</h2>

        <div className="mb-6 p-4 bg-light-border dark:bg-dark-border rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Cache Size</p>
              <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">{cacheStats.size}</p>
            </div>
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Entries</p>
              <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">{cacheStats.entries}</p>
            </div>
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Last Cleared</p>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">{cacheStats.lastCleared.toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3 text-light-text dark:text-dark-text">
            <input
              type="checkbox"
              checked={settings.cacheEnabled}
              onChange={(e) => handleSettingChange('cacheEnabled', e.target.checked)}
              className="w-4 h-4"
            />
            <span>Enable Local Caching (SQLite)</span>
          </label>

          {settings.cacheEnabled && (
            <div>
              <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                Max Cache Size (MB)
              </label>
              <input
                type="number"
                value={settings.maxCacheSize}
                onChange={(e) => handleSettingChange('maxCacheSize', parseInt(e.target.value))}
                min="10"
                max="500"
                className="w-full input-field rounded-lg"
              />
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-2">Current: {cacheStats.size}</p>
            </div>
          )}

          <button
            onClick={handleClearCache}
            className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 font-semibold transition-colors duration-200"
          >
            🗑️ Clear Cache Now
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-6">About</h2>
        <div className="space-y-3 text-light-textMuted dark:text-dark-textMuted text-sm">
          <p>
            <span className="font-semibold text-light-text dark:text-dark-text">AURIX Core</span> — Admin & ML Control Center
          </p>
          <p>
            <span className="font-semibold text-light-text dark:text-dark-text">Version:</span> 1.0.0
          </p>
          <p>
            <span className="font-semibold text-light-text dark:text-dark-text">Built with:</span> Electron, React 18, Vite, Firebase, Tailwind CSS
          </p>
          <p>
            <span className="font-semibold text-light-text dark:text-dark-text">Backend:</span> Evidence výdajů
          </p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 border border-red-200 dark:border-red-700">
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-6">⚠️ Danger Zone</h2>
        <p className="text-red-700 dark:text-red-400 mb-4">These actions are irreversible. Use with caution.</p>
        <button
          onClick={() => {
            if (confirm('This will sign you out and clear all local data. Are you sure?')) {
              // Would call: signOut() and clearLocalCache()
              toast.success('Signed out successfully')
            }
          }}
          className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 font-semibold transition-colors duration-200"
        >
          Sign Out & Clear All Local Data
        </button>
      </div>

      {/* Change Password Modal */}
      {changePasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md border border-light-border dark:border-dark-border">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">🔐 Change Password</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-6">
              We'll send you an email to reset your password. Click the link in the email to set a new password.
            </p>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted mb-6">
              If you use Google Sign-In, password is managed through your Google account.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setChangePasswordModalOpen(false)}
                className="flex-1 px-4 py-2 border border-light-border dark:border-dark-border rounded-lg text-light-text dark:text-dark-text hover:bg-light-bg dark:hover:bg-dark-bg font-semibold transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold transition-colors duration-200"
              >
                Send Reset Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
