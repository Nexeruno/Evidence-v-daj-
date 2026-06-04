export interface User {
  uid: string
  email: string
  displayName?: string
  role: 'admin' | 'analyst' | 'viewer'
  createdAt: number
  lastActivity?: number
  isActive: boolean
}

export interface Role {
  id: string
  name: 'admin' | 'analyst' | 'viewer'
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
    id: 'admin',
    name: 'admin',
    description: 'Full access to all features and admin controls',
    isSystemRole: true,
    createdAt: 0,
    updatedAt: 0,
    permissions: [
      { resource: 'dashboard', action: 'read' },
      { resource: 'ml_dashboard', action: 'read' },
      { resource: 'ml_runs', action: 'read' },
      { resource: 'ml_predictions', action: 'read' },
      { resource: 'ml_control', action: 'read' },
      { resource: 'ml_control', action: 'write' },
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'write' },
      { resource: 'users', action: 'delete' },
      { resource: 'roles', action: 'read' },
      { resource: 'roles', action: 'write' },
      { resource: 'audit_trail', action: 'read' },
      { resource: 'settings', action: 'read' },
      { resource: 'settings', action: 'write' },
    ],
  },
  analyst: {
    id: 'analyst',
    name: 'analyst',
    description: 'Access to dashboards and ML analytics',
    isSystemRole: true,
    createdAt: 0,
    updatedAt: 0,
    permissions: [
      { resource: 'dashboard', action: 'read' },
      { resource: 'ml_dashboard', action: 'read' },
      { resource: 'ml_runs', action: 'read' },
      { resource: 'ml_predictions', action: 'read' },
      { resource: 'audit_trail', action: 'read' },
    ],
  },
  viewer: {
    id: 'viewer',
    name: 'viewer',
    description: 'Read-only access to dashboards',
    isSystemRole: true,
    createdAt: 0,
    updatedAt: 0,
    permissions: [
      { resource: 'dashboard', action: 'read' },
      { resource: 'ml_dashboard', action: 'read' },
    ],
  },
}
