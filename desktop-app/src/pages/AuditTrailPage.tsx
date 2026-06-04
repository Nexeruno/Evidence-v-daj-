import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { AuditLog } from '@/types/users'

export function AuditTrailPage() {
  const { getIdToken } = useAuth()
  const [selectedAdmin, setSelectedAdmin] = useState<string>('all')
  const [selectedAction, setSelectedAction] = useState<string>('all')
  const [allLogs, setAllLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    loadAuditLogs()
  }, [selectedAdmin, selectedAction])

  const loadAuditLogs = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = await getIdToken()

      if (!window.ipcApi) {
        setError(new Error('Audit Trail backend is not available. Cloud Function adminGetAuditTrail is required.'))
        return
      }

      const response = await window.ipcApi.callCloudFunction(
        'adminGetAuditTrail',
        token,
        {
          limit: 100,
          offset: 0,
          adminUid: selectedAdmin !== 'all' ? selectedAdmin : undefined,
          action: selectedAction !== 'all' ? selectedAction : undefined,
        }
      )

      if (!response.ok) {
        throw new Error(response.error || 'Failed to load audit logs')
      }

      if (response.items) {
        const logsWithDates = response.items.map((item: any) => ({
          ...item,
          timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
        }))
        setAllLogs(logsWithDates)
      } else {
        setAllLogs([])
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to load audit logs'
      setError(new Error(errMsg))
      console.error('loadAuditLogs error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = allLogs.filter((log: any) => {
    const adminMatch = selectedAdmin === 'all' || log.adminUid === selectedAdmin
    const actionMatch = selectedAction === 'all' || log.action === selectedAction
    return adminMatch && actionMatch
  })

  const actions = Array.from(new Set(allLogs.map((l: any) => l.action)))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Audit Trail</h1>

      {/* Filters */}
      <div className="card rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Admin</label>
            <select
              value={selectedAdmin}
              onChange={(e) => setSelectedAdmin(e.target.value)}
              className="select-field rounded-lg"
            >
              <option value="all">All Admins</option>
              {Array.from(new Set(allLogs.map((l: any) => l.adminUid))).map((uid) => (
                <option key={uid} value={uid}>{uid}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Action</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="select-field rounded-lg"
            >
              <option value="all">All Actions</option>
              {actions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {error ? (
            <div className="px-6 py-8 text-center">
              <div className="text-red-600 dark:text-red-400 font-semibold mb-2">⚠️ Error loading audit trail</div>
              <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{error.message}</p>
            </div>
          ) : loading ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="px-6 py-8 text-center text-light-textMuted dark:text-dark-textMuted">No audit logs found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Timestamp</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Admin</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Action</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Resource</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log: any) => (
                  <tr key={log.id} className="table-row">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text whitespace-nowrap text-xs">
                      {log.timestamp instanceof Date ? log.timestamp.toLocaleString() : new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      <div className="text-sm">{log.adminUid}</div>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text font-semibold">{log.action}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-light-textMuted dark:text-dark-textMuted">
                          {JSON.stringify(log.details || {})}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400`}>
                        success
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted text-xs max-w-xs truncate" title={JSON.stringify(log.details)}>
                      ✅ Success
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Total Actions Logged</p>
          <p className="text-3xl font-bold text-light-text dark:text-dark-text mt-2">{filteredLogs.length}</p>
        </div>
        <div className="card rounded-lg p-4">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Unique Admins</p>
          <p className="text-3xl font-bold text-light-text dark:text-dark-text mt-2">
            {Array.from(new Set(allLogs.map((l: any) => l.adminUid))).length}
          </p>
        </div>
      </div>

      {/* Export Info */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-700">
        <p className="text-yellow-800 dark:text-yellow-200">
          <span className="font-semibold">📋 Note:</span> Audit trail is stored for 90 days. Export data regularly for compliance.
        </p>
      </div>
    </div>
  )
}
