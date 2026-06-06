import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { db } from '@/config/firebase'
import {
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore'
import { useAdminUserSelector, userLabel } from '@/hooks/useAdminUserSelector'

interface RawTransaction {
  id: string
  userId: string
  type: 'vydaj' | 'prijem'
  datum: string
  castka: number
  kategorie?: string
  nazev?: string
  popis?: string
  sourcePath: string
  createdAt?: any
  mlEligible: boolean
  validationIssues: string[]
}

interface TrainingDataRecord {
  id: string
  type: 'l2_manual_feedback' | 'l2_auto_feedback'
  userId: string
  predictionId?: string
  month: string
  predictedTotal: number
  actualTotal: number
  errorAmount: number
  errorPercent: number
  source: string
  status: string
  createdAt?: any
  excludedFromLearning?: boolean
  excludedAt?: any
  excludedBy?: string
  exclusionReason?: string
}

interface L2Prediction {
  id: string
  userId: string
  month: string
  pipelineLevel: number
  shadowMode: boolean
  active: boolean
  totalPredictedExpense: number
  trainingDataUsed: boolean
  trainingDataCount?: number
  manualFeedbackCount?: number
  autoFeedbackCount?: number
  finalCorrectionFactor?: number
  isRealMlModel: boolean
  modelVersion?: string
}

export function TrainingDataPage() {
  const { user, getIdToken } = useAuth()
  const { role: userRole, loading: roleLoading } = useUserRole(user)
  const isAdmin = userRole && ['admin', 'ml_admin'].includes(userRole)
  const { users, usersLoading, selectedUserId, selectedUser, selectUser } = useAdminUserSelector()

  // Effective uid: admin uses selector, regular user uses their own
  const effectiveUid = isAdmin ? selectedUserId : (user?.uid || '')

  const [rawTransactions, setRawTransactions] = useState<RawTransaction[]>([])
  const [trainingData, setTrainingData] = useState<TrainingDataRecord[]>([])
  const [l2Predictions, setL2Predictions] = useState<L2Prediction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [predictionsError, setPredictionsError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<TrainingDataRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [excludeConfirm, setExcludeConfirm] = useState<TrainingDataRecord | null>(null)
  const [excludeReason, setExcludeReason] = useState('')
  const [excluding, setExcluding] = useState(false)
  const [approveConfirm, setApproveConfirm] = useState<TrainingDataRecord | null>(null)
  const [approving, setApproving] = useState(false)

  // Filter states for Raw Transactions
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'vydaj' | 'prijem'>('all')
  const [validOnlyFilter, setValidOnlyFilter] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusMessage] = useState<string>('')

  // Reload when selected user changes
  useEffect(() => {
    // Wait for role to load before checking permissions
    if (roleLoading) return

    if (!user || !isAdmin) {
      setError('Only admin/ml_admin can view training data')
      return
    }

    setError(null)
    // effectiveUid can be '' (All Users) or specific uid (Single User) - both are valid
    // effectiveUid is '' for admin in All Users mode
    // effectiveUid is current user uid for non-admin
    // So we just load data whenever we're admin and user is set
    loadData()
  }, [user, userRole, effectiveUid, roleLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setPredictionsError(null)

    const uid = effectiveUid

    // ── 1. Raw transactions (vydaje + prijmy) ───────────────────────────────
    try {
      const transactions: RawTransaction[] = []
      // uid='' means all users
      let userIds: string[]
      if (uid) {
        userIds = [uid]
      } else {
        const usersSnap = await getDocs(collection(db, 'users'))
        userIds = usersSnap.docs.map(d => d.id)
      }

      for (const uid of userIds) {
        try {
          const vydajeSnap = await getDocs(collection(db, 'users', uid, 'vydaje'))
          vydajeSnap.docs.forEach(doc => {
            const data = doc.data()
            transactions.push({
              id: doc.id, userId: uid, type: 'vydaj',
              datum: data.datum || '', castka: Number(data.castka) || 0,
              kategorie: data.kategorie, nazev: data.nazev, popis: data.popis,
              sourcePath: `users/${uid}/vydaje/${doc.id}`,
              createdAt: data.createdAt,
              mlEligible: validateTransaction(data),
              validationIssues: getValidationIssues(data),
            })
          })
        } catch { /* skip user on error */ }

        try {
          const prijmySnap = await getDocs(collection(db, 'users', uid, 'prijmy'))
          prijmySnap.docs.forEach(doc => {
            const data = doc.data()
            transactions.push({
              id: doc.id, userId: uid, type: 'prijem',
              datum: data.datum || '', castka: Number(data.castka) || 0,
              kategorie: data.kategorie, nazev: data.nazev, popis: data.popis,
              sourcePath: `users/${uid}/prijmy/${doc.id}`,
              createdAt: data.createdAt,
              mlEligible: validateTransaction(data),
              validationIssues: getValidationIssues(data),
            })
          })
        } catch { /* skip user on error */ }
      }
      setRawTransactions(transactions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    }

    // ── 2. Training feedback (trainingData collection) ──────────────────────
    try {
      const feedbackQuery = uid
        ? query(collection(db, 'trainingData'), where('userId', '==', uid), where('type', 'in', ['l2_manual_feedback', 'l2_auto_feedback']))
        : query(collection(db, 'trainingData'), where('type', 'in', ['l2_manual_feedback', 'l2_auto_feedback']))
      const trainingSnap = await getDocs(feedbackQuery)
      const feedbackRecords: TrainingDataRecord[] = trainingSnap.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          type: data.type,
          userId: data.userId || '—',
          predictionId: data.predictionId,
          month: data.month || '—',
          predictedTotal: Number(data.predictedTotal) || 0,
          actualTotal: Number(data.actualTotal) || 0,
          errorAmount: Number(data.errorAmount) || 0,
          errorPercent: Number(data.errorPercent) || 0,
          source: data.source || '—',
          status: data.status || '—',
          createdAt: data.createdAt,
        }
      })
      setTrainingData(feedbackRecords)
    } catch (err) {
      // non-fatal: show empty feedback section
      console.warn('Failed to load training feedback:', err)
    }

    // ── 3. L2 shadow predictions via Cloud Function (Admin SDK bypasses Firestore rules) ─
    try {
      if (!window.ipcApi) throw new Error('IPC API not available')
      const token = await getIdToken()
      const result = await window.ipcApi.callCloudFunction(
        'adminGetMlPredictions',
        token,
        { uid: uid || undefined, pipelineLevel: 2, limit: 50 }
      )
      if (result?.ok) {
        const predictions: L2Prediction[] = (result.data ?? []).map((data: any) => ({
          id: data.id || '',
          userId: data.userId || '—',
          month: data.month || '—',
          pipelineLevel: data.pipelineLevel,
          shadowMode: data.shadowMode,
          active: data.active,
          totalPredictedExpense: Number(data.totalPredictedExpense) || 0,
          trainingDataUsed: data.trainingDataUsed || false,
          trainingDataCount: data.trainingDataCount,
          manualFeedbackCount: data.manualFeedbackCount,
          autoFeedbackCount: data.autoFeedbackCount,
          finalCorrectionFactor: data.finalCorrectionFactor,
          isRealMlModel: data.isRealMlModel || false,
          modelVersion: data.modelVersion,
        }))
        setL2Predictions(predictions)
      } else {
        setPredictionsError(result?.error || 'Failed to load predictions')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load predictions'
      setPredictionsError(msg)
    }

    setLoading(false)
  }

  const handleDeleteTrainingRecord = async (record: TrainingDataRecord) => {
    setDeleting(true)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      const result = await window.ipcApi.callCloudFunction(
        'adminDeleteTrainingDataRecord',
        token,
        { recordId: record.id }
      )

      if (result?.ok) {
        // Remove from UI immediately
        setTrainingData(trainingData.filter(td => td.id !== record.id))
        setDeleteConfirm(null)
      } else {
        alert(`Error: ${result?.error || 'Failed to delete record'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to delete'}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleExcludeTrainingRecord = async (record: TrainingDataRecord) => {
    setExcluding(true)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      const result = await window.ipcApi.callCloudFunction(
        'adminExcludeTrainingRecordFromLearning',
        token,
        { recordId: record.id, reason: excludeReason }
      )

      if (result?.ok) {
        // Update UI - mark as excluded
        setTrainingData(trainingData.map(td =>
          td.id === record.id
            ? { ...td, excludedFromLearning: true, excludedAt: new Date(), excludedBy: 'current_user', exclusionReason: excludeReason }
            : td
        ))
        setExcludeConfirm(null)
        setExcludeReason('')
      } else {
        alert(`Error: ${result?.error || 'Failed to exclude record'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to exclude'}`)
    } finally {
      setExcluding(false)
    }
  }

  const handleApproveTrainingRecord = async (record: TrainingDataRecord) => {
    setApproving(true)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      const result = await window.ipcApi.callCloudFunction(
        'adminApproveTrainingData',
        token,
        { id: record.id, approved: true }
      )

      if (result?.ok) {
        // Update UI - mark as approved
        setTrainingData(trainingData.map(td =>
          td.id === record.id
            ? { ...td, status: 'approved' }
            : td
        ))
        setApproveConfirm(null)
      } else {
        alert(`Error: ${result?.error || 'Failed to approve record'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to approve'}`)
    } finally {
      setApproving(false)
    }
  }

  const validateTransaction = (data: any): boolean => {
    if (!data.datum || !data.castka) return false
    if (Number(data.castka) <= 0) return false
    return true
  }

  const getValidationIssues = (data: any): string[] => {
    const issues: string[] = []
    if (!data.datum) issues.push('Missing datum')
    if (!data.castka) issues.push('Missing castka')
    if (Number(data.castka) <= 0) issues.push('Invalid amount (≤ 0)')
    if (!data.kategorie) issues.push('Missing kategorie')
    return issues
  }

  const filteredTransactions = rawTransactions
    .filter(t => transactionTypeFilter === 'all' || t.type === transactionTypeFilter)
    .filter(t => !validOnlyFilter || t.mlEligible)
    .filter(t => selectedMonth === '' || t.datum.startsWith(selectedMonth))
    .filter(t => searchText === '' || t.nazev?.includes(searchText) || t.popis?.includes(searchText) || t.userId.includes(searchText))

  // Calculate stats
  const stats = {
    totalUsers: new Set(rawTransactions.map(t => t.userId)).size,
    totalVydaje: rawTransactions.filter(t => t.type === 'vydaj').length,
    totalPrijmy: rawTransactions.filter(t => t.type === 'prijem').length,
    sumVydaje: rawTransactions.filter(t => t.type === 'vydaj').reduce((sum, t) => sum + t.castka, 0),
    sumPrijmy: rawTransactions.filter(t => t.type === 'prijem').reduce((sum, t) => sum + t.castka, 0),
    validRecords: rawTransactions.filter(t => t.mlEligible).length,
    invalidRecords: rawTransactions.filter(t => !t.mlEligible).length,
  }

  // Wait for role to load
  if (roleLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Training Data</h1>
        <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          Loading...
        </div>
      </div>
    )
  }

  // Check permissions after role has loaded
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Training Data</h1>
        <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          ❌ Only admin/ml_admin can view training data
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Training Data</h1>
        <p className="text-sm text-light-textMuted dark:text-dark-textMuted mt-1">
          📊 Raw learning data (transactions), training feedback, and L2 shadow predictions
        </p>
      </div>

      {/* User selector */}
      <div className="card rounded-lg p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <label className="text-sm font-semibold text-light-text dark:text-dark-text whitespace-nowrap">
            Viewing user:
          </label>
          {usersLoading ? (
            <span className="text-sm text-light-textMuted dark:text-dark-textMuted">Loading users…</span>
          ) : (
            <select
              value={selectedUserId}
              onChange={e => selectUser(e.target.value)}
              className="flex-1 px-3 py-2 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg text-sm text-light-text dark:text-dark-text"
            >
              <option value="">— All Users —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName ? `${u.displayName} — ${u.email || u.id}` : (u.email || u.id)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-3 py-1.5 text-sm text-blue-700 dark:text-blue-300">
          Viewing data for: <strong>{effectiveUid ? userLabel(selectedUser) : 'All Users'}</strong>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-lg text-sm ${
          statusMessage.includes('✅') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMessage}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          ❌ {error}
        </div>
      )}

      {/* Data Source Info */}
      <div className="card rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          📡 <strong>Data Sources:</strong> Reading from Firestore project <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">evidence-vydaju</code>
          <br/>
          Same project as web app. Raw data: <code>users/{'{uid}'}/vydaje</code> & <code>users/{'{uid}'}/prijmy</code> collections.
          <br/>
          📌 <strong>Note:</strong> L2 is simplified baseline with manual/auto calibration. Not actual Python ML model yet.
        </p>
      </div>

      {/* Statistics Dashboard */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Users</p>
            <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">{stats.totalUsers}</p>
          </div>
          <div className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Vydaje</p>
            <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">{stats.totalVydaje}</p>
          </div>
          <div className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Prijmy</p>
            <p className="text-2xl font-bold text-light-text dark:text-dark-text mt-1">{stats.totalPrijmy}</p>
          </div>
          <div className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Sum Vydaje</p>
            <p className="text-xl font-bold text-orange-600 mt-1">{(stats.sumVydaje / 1000).toFixed(1)}K Kč</p>
          </div>
          <div className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Valid for ML</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.validRecords}</p>
          </div>
          <div className="card rounded-lg p-4">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase">Issues</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.invalidRecords}</p>
          </div>
        </div>
      )}

      {/* ─ Raw Learning Data ─ */}
      <div className="card rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-light-text dark:text-dark-text">1️⃣ Raw Learning Data (Transactions)</h2>

        {/* Filters */}
        <div className="space-y-3 pb-4 border-b border-light-border dark:border-dark-border">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setTransactionTypeFilter('all')}
              className={`px-3 py-1 rounded text-sm ${transactionTypeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-light-border dark:bg-dark-border'}`}
            >
              All
            </button>
            <button
              onClick={() => setTransactionTypeFilter('vydaj')}
              className={`px-3 py-1 rounded text-sm ${transactionTypeFilter === 'vydaj' ? 'bg-orange-600 text-white' : 'bg-light-border dark:bg-dark-border'}`}
            >
              Vydaje
            </button>
            <button
              onClick={() => setTransactionTypeFilter('prijem')}
              className={`px-3 py-1 rounded text-sm ${transactionTypeFilter === 'prijem' ? 'bg-green-600 text-white' : 'bg-light-border dark:bg-dark-border'}`}
            >
              Prijmy
            </button>
            <button
              onClick={() => setValidOnlyFilter(!validOnlyFilter)}
              className={`px-3 py-1 rounded text-sm ${validOnlyFilter ? 'bg-blue-600 text-white' : 'bg-light-border dark:bg-dark-border'}`}
            >
              ✅ Valid only
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Search by name, note, or userId..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="px-3 py-1 rounded text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border flex-1 min-w-[200px]"
            />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1 rounded text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-light-textMuted">Loading transactions...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-light-textMuted">No transactions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Name/Note</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">ML OK</th>
                  <th className="px-3 py-2 text-left">Issues</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map(t => (
                  <tr key={t.id} className="border-b border-light-border dark:border-dark-border hover:bg-light-border dark:hover:bg-dark-border/50">
                    <td className="px-3 py-2 font-semibold">
                      <span className={`px-2 py-0.5 rounded text-xs ${t.type === 'vydaj' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {t.type === 'vydaj' ? '📤' : '📥'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{t.datum}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.userId.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{t.kategorie || '—'}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-light-textMuted dark:text-dark-textMuted">{t.nazev || t.popis || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{t.castka.toLocaleString()} Kč</td>
                    <td className="px-3 py-2 text-center">
                      {t.mlEligible ? '✅' : '❌'}
                    </td>
                    <td className="px-3 py-2 text-xs text-red-600">
                      {t.validationIssues.length > 0 ? t.validationIssues.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─ Training Feedback ─ */}
      <div className="card rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-light-text dark:text-dark-text">2️⃣ Training Feedback (Manual + Auto)</h2>
        <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
          L2 model learning from feedback. Manual (weight 2x) and Auto (weight 1x) for calibration.
        </p>

        {loading ? (
          <div className="text-center py-8 text-light-textMuted">Loading feedback...</div>
        ) : trainingData.length === 0 ? (
          <div className="text-center py-8 text-light-textMuted">
            <p>No training feedback yet.</p>
            <p className="text-xs mt-1">Add manual feedback via ML Predictions → Add Feedback, or run auto-feedback generation in ML Model Control.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-light-border dark:bg-dark-border">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-right">Predicted</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Error %</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trainingData.map(td => (
                  <tr key={td.id} className="border-b border-light-border dark:border-dark-border hover:bg-light-border dark:hover:bg-dark-border/50">
                    <td className="px-3 py-2 font-semibold">
                      <span className={`px-2 py-0.5 rounded text-xs ${td.type === 'l2_manual_feedback' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {td.type === 'l2_manual_feedback' ? '👤 Manual' : '🤖 Auto'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{td.month}</td>
                    <td className="px-3 py-2 font-mono text-xs">{td.userId.slice(0, 8)}...</td>
                    <td className="px-3 py-2 text-right">{td.predictedTotal.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{td.actualTotal.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold">{td.errorPercent.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-xs text-light-textMuted dark:text-dark-textMuted">{td.source}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {td.excludedFromLearning ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 font-semibold">
                            ⚠️ Excluded
                          </span>
                        ) : td.status === 'approved' ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">
                            ✓ Approved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">
                            ⏳ Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {!td.excludedFromLearning && td.status !== 'approved' && (
                          <button
                            onClick={() => setApproveConfirm(td)}
                            className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                            title="Approve record for learning"
                          >
                            Approve
                          </button>
                        )}
                        {!td.excludedFromLearning && (
                          <button
                            onClick={() => setExcludeConfirm(td)}
                            className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
                            title="Exclude from learning (soft cleanup)"
                          >
                            Exclude
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(td)}
                          className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                          title="Permanently delete"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─ L2 Shadow Predictions ─ */}
      <div className="card rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-light-text dark:text-dark-text">3️⃣ L2 Shadow Predictions (Used for Learning)</h2>
        <p className="text-xs text-light-textMuted dark:text-dark-textMuted">
          Simplified baseline predictions with manual/auto calibration. Not actual Python ML model.
        </p>

        {loading ? (
          <div className="text-center py-8 text-light-textMuted">Loading predictions...</div>
        ) : predictionsError ? (
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm">
            ⚠️ {predictionsError}
          </div>
        ) : l2Predictions.length === 0 ? (
          <div className="text-center py-8 text-light-textMuted">
            <p>No L2 shadow predictions yet.</p>
            <p className="text-xs mt-1">Run the L2 Shadow Pipeline in ML Model Control to generate predictions.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {l2Predictions.map(pred => (
              <div key={pred.id} className="border border-light-border dark:border-dark-border rounded-lg p-3 bg-light-bg dark:bg-dark-bg/50">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="font-semibold text-light-text dark:text-dark-text">{pred.month}</p>
                    <p className="text-xs text-light-textMuted dark:text-dark-textMuted">User: {pred.userId.slice(0, 12)}...</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-light-text dark:text-dark-text">{pred.totalPredictedExpense.toLocaleString()} Kč</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Simplified Baseline</p>
                  </div>
                </div>
                {pred.trainingDataUsed && (
                  <div className="grid grid-cols-4 gap-2 text-xs bg-green-50 dark:bg-green-950/30 p-2 rounded">
                    <div>
                      <p className="text-light-textMuted dark:text-dark-textMuted">Total FB</p>
                      <p className="font-semibold text-light-text dark:text-dark-text">{pred.trainingDataCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-light-textMuted dark:text-dark-textMuted">Manual FB</p>
                      <p className="font-semibold text-light-text dark:text-dark-text">{pred.manualFeedbackCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-light-textMuted dark:text-dark-textMuted">Auto FB</p>
                      <p className="font-semibold text-light-text dark:text-dark-text">{pred.autoFeedbackCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-light-textMuted dark:text-dark-textMuted">Factor</p>
                      <p className="font-semibold text-light-text dark:text-dark-text">{(pred.finalCorrectionFactor || 1.0).toFixed(2)}x</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approve confirmation modal */}
      {approveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-light-bg dark:bg-dark-bg rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-light-text dark:text-dark-text">Approve Training Record?</h3>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 space-y-2 text-sm">
              <p className="text-light-text dark:text-dark-text">
                <strong>Type:</strong> {approveConfirm.type === 'l2_manual_feedback' ? '👤 Manual Feedback' : '🤖 Auto Feedback'}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>Month:</strong> {approveConfirm.month}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>User:</strong> {approveConfirm.userId.slice(0, 12)}...
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>Error:</strong> {approveConfirm.errorPercent.toFixed(1)}%
              </p>
              <p className="text-green-700 dark:text-green-300 mt-3 text-xs">
                This record will be used for AI learning and correction factor calculation.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setApproveConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                disabled={approving}
              >
                Cancel
              </button>
              <button
                onClick={() => handleApproveTrainingRecord(approveConfirm)}
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={approving}
              >
                {approving ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exclude confirmation modal */}
      {excludeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-light-bg dark:bg-dark-bg rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-light-text dark:text-dark-text">Exclude from Learning?</h3>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 space-y-2 text-sm">
              <p className="text-light-text dark:text-dark-text">
                <strong>Type:</strong> {excludeConfirm.type === 'l2_manual_feedback' ? '👤 Manual Feedback' : '🤖 Auto Feedback'}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>Month:</strong> {excludeConfirm.month}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>User:</strong> {excludeConfirm.userId.slice(0, 12)}...
              </p>
              <p className="text-yellow-700 dark:text-yellow-300 mt-3 text-xs">
                This record will stay in the database, but will no longer be used for AI learning.
              </p>
              <div className="mt-3">
                <label className="text-xs text-light-text dark:text-dark-text font-semibold">Optional reason:</label>
                <input
                  type="text"
                  value={excludeReason}
                  onChange={(e) => setExcludeReason(e.target.value)}
                  placeholder="e.g., data anomaly, user error"
                  className="w-full mt-1 px-2 py-1 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg text-sm text-light-text dark:text-dark-text"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setExcludeConfirm(null)
                  setExcludeReason('')
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                disabled={excluding}
              >
                Cancel
              </button>
              <button
                onClick={() => handleExcludeTrainingRecord(excludeConfirm)}
                className="flex-1 px-4 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 transition-colors disabled:opacity-50"
                disabled={excluding}
              >
                {excluding ? 'Excluding...' : 'Exclude'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-light-bg dark:bg-dark-bg rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-light-text dark:text-dark-text">Delete Feedback Record?</h3>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 space-y-2 text-sm">
              <p className="text-light-text dark:text-dark-text">
                <strong>Type:</strong> {deleteConfirm.type === 'l2_manual_feedback' ? '👤 Manual Feedback' : '🤖 Auto Feedback'}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>Month:</strong> {deleteConfirm.month}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>User:</strong> {deleteConfirm.userId.slice(0, 12)}...
              </p>
              <p className="text-red-700 dark:text-red-300 mt-3 text-xs">
                This will permanently remove it from the database.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTrainingRecord(deleteConfirm)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
