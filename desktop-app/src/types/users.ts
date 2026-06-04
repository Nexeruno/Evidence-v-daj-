export type UserRole = 'viewer' | 'analyst' | 'admin' | 'ml_admin' | 'developer'

export interface User {
  id?: string
  uid: string
  email: string
  displayName?: string
  role: UserRole
  createdAt: any
  updatedAt?: any
  lastActivity?: any
  isActive: boolean
  blocked?: boolean
  disabled?: boolean
  deleted?: boolean
  blockedAt?: any
  blockedBy?: string
  deletedAt?: any
  deletedBy?: string
}

export function isUserBlocked(user: User): boolean {
  return user.blocked === true || user.isActive === false || user.disabled === true
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  viewer:    'Vidí vlastní přehled a zapisuje vlastní příjmy/výdaje.',
  analyst:   'Vidí analytická data, reporty a ML predikce v read-only režimu.',
  admin:     'Spravuje uživatele, role, audit a systémové nastavení.',
  ml_admin:  'Spravuje ML modely, training data, shadow mode a aktivaci Level 2.',
  developer: 'Vidí technické logy, diagnostiku a vývojové informace.',
}

export const ALL_ROLES: UserRole[] = ['viewer', 'analyst', 'admin', 'ml_admin', 'developer']

export const ROLE_COLORS: Record<string, string> = {
  admin:     'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  ml_admin:  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  developer: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  analyst:   'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
  viewer:    'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
}

export interface Role {
  id: string
  name: UserRole
  description: string
  permissions: Permission[]
  createdAt: number
  updatedAt: number
  isSystemRole: boolean
}

export interface Permission {
  resource: 'dashboard' | 'ml_dashboard' | 'ml_runs' | 'ml_predictions' | 'ml_control' | 'users' | 'roles' | 'audit_trail' | 'settings'
  action: 'read' | 'write' | 'delete'
}

export interface AuditLog {
  id: string
  timestamp: number
  adminId: string
  adminEmail: string
  action: string
  resourceType: 'user' | 'role' | 'model' | 'pipeline'
  resourceId: string
  details: Record<string, any>
  status: 'success' | 'failure'
  errorMessage?: string
}

export const DEFAULT_ROLES: Record<string, Role> = {
  admin: {
    id: 'admin', name: 'admin', description: 'Full access to all features and admin controls',
    isSystemRole: true, createdAt: 0, updatedAt: 0,
    permissions: [
      { resource: 'dashboard', action: 'read' }, { resource: 'ml_dashboard', action: 'read' },
      { resource: 'ml_runs', action: 'read' }, { resource: 'ml_predictions', action: 'read' },
      { resource: 'ml_control', action: 'read' }, { resource: 'ml_control', action: 'write' },
      { resource: 'users', action: 'read' }, { resource: 'users', action: 'write' },
      { resource: 'users', action: 'delete' }, { resource: 'roles', action: 'read' },
      { resource: 'roles', action: 'write' }, { resource: 'audit_trail', action: 'read' },
      { resource: 'settings', action: 'read' }, { resource: 'settings', action: 'write' },
    ],
  },
  analyst: {
    id: 'analyst', name: 'analyst', description: 'Access to dashboards and ML analytics',
    isSystemRole: true, createdAt: 0, updatedAt: 0,
    permissions: [
      { resource: 'dashboard', action: 'read' }, { resource: 'ml_dashboard', action: 'read' },
      { resource: 'ml_runs', action: 'read' }, { resource: 'ml_predictions', action: 'read' },
      { resource: 'audit_trail', action: 'read' },
    ],
  },
  viewer: {
    id: 'viewer', name: 'viewer', description: 'Read-only access to dashboards',
    isSystemRole: true, createdAt: 0, updatedAt: 0,
    permissions: [
      { resource: 'dashboard', action: 'read' }, { resource: 'ml_dashboard', action: 'read' },
    ],
  },
}
