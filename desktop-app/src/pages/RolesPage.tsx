import { useState } from 'react'
import { DEFAULT_ROLES, Role } from '@/types/users'

const RESOURCES = [
  'dashboard',
  'ml_dashboard',
  'ml_runs',
  'ml_predictions',
  'ml_control',
  'users',
  'roles',
  'audit_trail',
  'settings',
] as const

const ACTIONS = ['read', 'write', 'delete'] as const

export function RolesPage() {
  const [roles] = useState<Record<string, Role>>(DEFAULT_ROLES)
  const [selectedRole, setSelectedRole] = useState<string>('admin')

  const currentRole = roles[selectedRole]

  const hasPermission = (resource: string, action: string) => {
    return currentRole.permissions.some(p => p.resource === resource && p.action === action)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Roles Management</h1>
        <button
          disabled
          title="Custom roles will be added in a future update"
          className="px-4 py-2 bg-light-border dark:bg-dark-border text-light-textMuted dark:text-dark-textMuted rounded-lg font-semibold cursor-not-allowed"
        >
          ➕ Create Custom Role (Coming Soon)
        </button>
      </div>

      {/* Role Selector */}
      <div className="card rounded-lg p-6">
        <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Select Role</h2>
        <div className="flex gap-4">
          {Object.entries(roles).map(([key, role]) => (
            <button
              key={key}
              onClick={() => setSelectedRole(key)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${
                selectedRole === key
                  ? 'bg-blue-600 dark:bg-blue-700 text-white'
                  : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:opacity-80'
              }`}
            >
              {role.name}
              {role.isSystemRole && <span className="ml-2 text-xs">🔒</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Role Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role Info */}
        <div className="card rounded-lg p-6">
          <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Role Info</h3>
          <div className="space-y-4">
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Name</p>
              <p className="text-light-text dark:text-dark-text font-semibold">{currentRole.name}</p>
            </div>
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Description</p>
              <p className="text-light-textMuted dark:text-dark-textMuted">{currentRole.description}</p>
            </div>
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Type</p>
              <p className="text-light-text dark:text-dark-text">
                {currentRole.isSystemRole ? '🔒 System Role' : '✏️ Custom Role'}
              </p>
            </div>
            <div>
              <p className="text-light-textMuted dark:text-dark-textMuted text-sm">Permissions</p>
              <p className="text-light-text dark:text-dark-text font-semibold">{currentRole.permissions.length} total</p>
            </div>
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="lg:col-span-2 card rounded-lg overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Permissions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Resource</th>
                  {ACTIONS.map(action => (
                    <th key={action} className="px-6 py-3 text-center font-semibold text-light-text dark:text-dark-text">
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map(resource => (
                  <tr key={resource} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text font-medium">
                      {resource.replace(/_/g, ' ')}
                    </td>
                    {ACTIONS.map(action => (
                      <td key={action} className="px-6 py-4 text-center">
                        <span className="text-lg">
                          {hasPermission(resource as string, action as string) ? '✅' : '❌'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Role Summary */}
      <div className="card rounded-lg p-6">
        <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-4">Role Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <p className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Read Permissions</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-300 mt-2">
              {currentRole.permissions.filter(p => p.action === 'read').length}
            </p>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
            <p className="text-green-600 dark:text-green-400 text-sm font-semibold">Write Permissions</p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-300 mt-2">
              {currentRole.permissions.filter(p => p.action === 'write').length}
            </p>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
            <p className="text-red-600 dark:text-red-400 text-sm font-semibold">Delete Permissions</p>
            <p className="text-2xl font-bold text-red-900 dark:text-red-300 mt-2">
              {currentRole.permissions.filter(p => p.action === 'delete').length}
            </p>
          </div>
        </div>
      </div>

      {/* Role Assignment Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-700">
        <p className="text-blue-900 dark:text-blue-200">
          <span className="font-semibold">ℹ️ Note:</span> System roles (admin, analyst, viewer) cannot be edited.
          Create custom roles for organization-specific permissions.
        </p>
      </div>
    </div>
  )
}
