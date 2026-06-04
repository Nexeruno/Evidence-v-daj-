import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Zap,
  Activity,
  TrendingUp,
  Sliders,
  Users,
  Lock,
  FileText,
  Settings,
  Database,
  BookOpen,
} from 'lucide-react'

const menuItems = [
  // Fáze 1
  { label: 'Dashboard', path: '/', icon: BarChart3 },
  // Fáze 2
  { label: 'ML Dashboard', path: '/ml/dashboard', icon: Zap },
  { label: 'ML Runs', path: '/ml/runs', icon: Activity },
  { label: 'ML Predictions', path: '/ml/predictions', icon: TrendingUp },
  // Fáze 3
  { label: 'Model Control', path: '/ml/control', icon: Sliders },
  // Fáze 4
  { label: 'Users', path: '/users', icon: Users },
  { label: 'Roles', path: '/roles', icon: Lock },
  { label: 'Audit Trail', path: '/audit-trail', icon: FileText },
  // Fáze 5
  { label: 'Training', path: '/training', icon: BookOpen },
  { label: 'Training Data', path: '/ml/training-data', icon: Database },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-64 bg-light-card dark:bg-dark-card border-r border-light-border dark:border-dark-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center gap-2">
          <div className="text-2xl">🔐</div>
          <div>
            <h1 className="text-xl font-bold text-light-text dark:text-dark-text">AURIX Core</h1>
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted">v0.1.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text'
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-light-border dark:border-dark-border text-xs space-y-2 text-light-textMuted dark:text-dark-textMuted">
        <p className="font-semibold text-light-text dark:text-dark-text">AURIX Control Center</p>
        <p>Connected to Evidence výdajů</p>
        <p>Admin access required</p>
      </div>
    </aside>
  )
}
