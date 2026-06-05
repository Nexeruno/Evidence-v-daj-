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
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    loadAuditLogs()
  }, [selectedAdmin, selectedAction])

  const loadAuditLogs = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = await getIdToken()

      if (!window.ipcApi) {
        setError(new Error('IPC API not available'))
        return
      }

      const response = await window.ipcApi.callCloudFunction(
        'adminGetAuditTrail',
        token,
        {
          limit: 100,
          offset: 0,
          adminId: selectedAdmin !== 'all' ? selectedAdmin : undefined,
          action: selectedAction !== 'all' ? selectedAction : undefined,
        }
      )

      if (!response.ok) {
        const errorMsg = response.error || 'Unknown error'

        // Determine specific error type
        if (errorMsg.includes('not a function') || errorMsg.includes('not deployed')) {
          setError(new Error('Audit Trail backend is not deployed yet.'))
        } else if (errorMsg.includes('Forbidden') || errorMsg.includes('permission')) {
          setError(new Error('You do not have permission to view audit logs.'))
        } else {
          setError(new Error('Audit logs could not be loaded.'))
        }
        return
      }

      if (response.items && response.items.length > 0) {
        setAllLogs(response.items as AuditLog[])
      } else {
        setAllLogs([])
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to load audit logs'

      // Check for specific error types
      if (errMsg.includes('not available') || errMsg.includes('IPC')) {
        setError(new Error('Audit Trail backend is not deployed yet.'))
      } else if (errMsg.includes('permission') || errMsg.includes('Forbidden')) {
        setError(new Error('You do not have permission to view audit logs.'))
      } else {
        setError(new Error(errMsg))
      }
      console.error('loadAuditLogs error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = allLogs.filter((log: AuditLog) => {
    const adminMatch = selectedAdmin === 'all' || log.adminId === selectedAdmin
    const actionMatch = selectedAction === 'all' || log.action === selectedAction
    return adminMatch && actionMatch
  })

  const formatTs = (ts: number | any): string => {
    if (!ts) return '—'
    if (typeof ts === 'number') return new Date(ts).toLocaleString()
    if (ts instanceof Date) return ts.toLocaleString()
    return String(ts)
  }

  const actions = Array.from(new Set(allLogs.map((l: AuditLog) => l.action)))

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
              {Array.from(new Set(allLogs.map((l: any) => l.adminId))).map((uid) => (
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

      {/* Audit Log List */}
      <div className="card rounded-lg p-6">
        {error ? (
          <div className="text-center">
            <div className="text-red-600 dark:text-red-400 font-semibold mb-2">⚠️ Error loading audit trail</div>
            <p className="text-sm text-light-textMuted dark:text-dark-textMuted">{error.message}</p>
          </div>
        ) : loading ? (
          <div className="text-center text-light-textMuted dark:text-dark-textMuted">Loading...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center text-light-textMuted dark:text-dark-textMuted">No audit logs found</div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log: any) => (
              <div
                key={log.id}
                className="flex items-center gap-2 p-2 bg-light-border dark:bg-dark-border/40 rounded border border-light-border dark:border-dark-border hover:bg-light-border/80 dark:hover:bg-dark-border/60 transition-colors"
              >
                <p className="text-base text-light-text dark:text-dark-text truncate min-w-0">
                  <strong>Admin:</strong> {log.adminId}
                </p>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shrink-0 whitespace-nowrap">
                  ✅ {log.action}
                </span>
                <span className="text-xs text-light-textMuted dark:text-dark-textMuted shrink-0 whitespace-nowrap">
                  {formatTs(log.timestamp)}
                </span>
                <button
                  onClick={() => setSelectedLog(log)}
                  className="px-3 py-1 rounded text-sm font-semibold bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 shrink-0 whitespace-nowrap ml-auto"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
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
            {Array.from(new Set(allLogs.map((l: AuditLog) => l.adminId))).length}
          </p>
        </div>
      </div>

      {/* Export Info */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-700">
        <p className="text-yellow-800 dark:text-yellow-200">
          <span className="font-semibold">📋 Note:</span> Audit trail is stored for 90 days. Export data regularly for compliance.
        </p>
      </div>

      {/* Audit Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-light-card dark:bg-dark-card rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-light-border dark:border-dark-border">
            <div className="sticky top-0 bg-light-border dark:bg-dark-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  ✅ {selectedLog.action}
                </span>
                <h3 className="text-lg font-bold text-light-text dark:text-dark-text">Audit Log Details</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-light-textMuted dark:text-dark-textMuted hover:text-light-text dark:hover:text-dark-text text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Timestamp */}
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold mb-1">Timestamp</p>
                <p className="text-sm text-light-text dark:text-dark-text font-mono">
                  {formatTs(selectedLog.timestamp)}
                </p>
              </div>

              {/* Admin */}
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold mb-1">Admin User ID</p>
                <p className="text-sm text-light-text dark:text-dark-text font-mono bg-light-bg dark:bg-dark-bg px-3 py-2 rounded break-all">{selectedLog.adminId}</p>
              </div>

              {/* Action */}
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold mb-1">Action</p>
                <p className="text-sm text-light-text dark:text-dark-text font-semibold">{selectedLog.action}</p>
              </div>

              {/* Resource */}
              <div>
                <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold mb-1">Resource</p>
                <p className="text-sm text-light-text dark:text-dark-text">
                  {selectedLog.details && typeof selectedLog.details === 'object'
                    ? Object.entries(selectedLog.details).map(([k, v]) => `${k}: ${v}`).join(' • ')
                    : JSON.stringify(selectedLog.details) || '—'}
                </p>
              </div>

              {/* Details */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wide font-semibold mb-1">Full Details</p>
                  <pre className="text-xs bg-slate-900 dark:bg-slate-950 text-slate-100 p-3 rounded overflow-auto max-h-64">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-light-border dark:bg-dark-border px-6 py-3 flex gap-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
