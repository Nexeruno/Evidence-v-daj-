import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Moon, Sun } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useUserRole } from '../hooks/useUserRole'
import { useTheme } from '../providers/ThemeProvider'
import toast from 'react-hot-toast'

export function Topbar() {
  const { user, signOut } = useAuth()
  const { role: userRole } = useUserRole(user)
  const { isDark, toggleDarkMode } = useTheme()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
      toast.success('Signed out successfully')
    } catch (err) {
      toast.error('Sign out failed')
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'text-red-600'
      case 'analyst':
        return 'text-blue-600'
      case 'viewer':
        return 'text-gray-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <header className="bg-light-card dark:bg-dark-card border-b border-light-border dark:border-dark-border px-6 py-4 flex items-center justify-between">
      {/* Left: Title */}
      <div>
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Control Center</h2>
      </div>

      {/* Right: Dark Mode Toggle + User Menu */}
      <div className="flex items-center gap-2">
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg hover:bg-light-bg dark:hover:bg-dark-bg transition-colors duration-200 text-light-textMuted dark:text-dark-textMuted"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-light-bg dark:hover:bg-dark-bg transition-colors duration-200"
          >
          <div className="w-8 h-8 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-semibold">
            {user?.email?.[0].toUpperCase()}
          </div>
          <div className="text-sm">
            <p className="font-semibold text-light-text dark:text-dark-text">{user?.email}</p>
            <p className={`text-xs font-semibold ${getRoleColor(userRole)}`}>
              {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
            </p>
          </div>
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-light-card dark:bg-dark-card rounded-lg shadow-lg border border-light-border dark:border-dark-border py-2 z-10">
            <div className="px-4 py-2 border-b border-light-border dark:border-dark-border">
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Role</p>
              <p className={`text-sm font-semibold ${getRoleColor(userRole)}`}>
                {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors duration-200"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  )
}
