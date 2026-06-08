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
import { SYMBOLS } from '@/utils/symbols'

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

  const getErrorMsg = (text: string) => `${SYMBOLS.ERROR} ${text}`
  const [predictionsError, setPredictionsError] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [excludingId, setExcludingId] = useState<string | null>(null)
  const [excludeConfirm, setExcludeConfirm] = useState<TrainingDataRecord | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Filter states for Raw Transactions
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'vydaj' | 'prijem'>('all')
  const [validOnlyFilter, setValidOnlyFilter] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusMessage] = useState<string>('')

  // Filter state for Training Data
  const [trainingStatusFilter, setTrainingStatusFilter] = useState<'all' | 'pending' | 'approved' | 'excluded'>('all')

  // Reload when selected user changes
  useEffect(() => {
    // Wait for role to load before checking permissions
    if (roleLoading) return

    if (!user || !isAdmin) {
      setError(getErrorMsg('Only admin/ml_admin can view training data'))
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
    // Global training data - same for all users, not per-user
    try {
      const feedbackQuery = query(collection(db, 'trainingData'), where('type', 'in', ['l2_manual_feedback', 'l2_auto_feedback']))
      const trainingSnap = await getDocs(feedbackQuery)
      const feedbackRecords: TrainingDataRecord[] = trainingSnap.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          type: data.type,
          userId: data.userId || SYMBOLS.DASH,
          predictionId: data.predictionId,
          month: data.month || SYMBOLS.DASH,
          predictedTotal: Number(data.predictedTotal) || 0,
          actualTotal: Number(data.actualTotal) || 0,
          errorAmount: Number(data.errorAmount) || 0,
          errorPercent: Number(data.errorPercent) || 0,
          source: data.source || SYMBOLS.DASH,
          status: data.status || 'pending',
          createdAt: data.createdAt,
          excludedFromLearning: data.excludedFromLearning || false,
          excludedAt: data.excludedAt,
          excludedBy: data.excludedBy,
          exclusionReason: data.exclusionReason,
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

  const handleApproveRecord = async (record: TrainingDataRecord) => {
    setApprovingId(record.id)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      const result = await window.ipcApi.callCloudFunction(
        'adminApproveTrainingData',
        token,
        { id: record.id, approved: true }
      )

      if (result?.ok) {
        setSuccessMessage(`${SYMBOLS.SUCCESS} Record approved: ${record.month} (${record.type === 'l2_manual_feedback' ? 'Manual' : 'Auto'})`)
        // Update local state to reflect approved status
        setTrainingData(trainingData.map(td =>
          td.id === record.id ? { ...td, status: 'approved' } : td
        ))
        // Clear success message after 4 seconds
        setTimeout(() => setSuccessMessage(null), 4000)
      } else {
        alert(`Error: ${result?.error || 'Failed to approve record'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to approve'}`)
    } finally {
      setApprovingId(null)
    }
  }

  const handleRestoreRecord = async (record: TrainingDataRecord) => {
    setRestoringId(record.id)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      const result = await window.ipcApi.callCloudFunction(
        'adminRestoreTrainingRecordToLearning',
        token,
        { recordId: record.id }
      )

      if (result?.ok) {
        setSuccessMessage(`${SYMBOLS.SUCCESS} Record restored: ${record.month} (${record.type === 'l2_manual_feedback' ? 'Manual' : 'Auto'})`)
        // Update local state to remove excluded status
        setTrainingData(trainingData.map(td =>
          td.id === record.id
            ? { ...td, excludedFromLearning: false, excludedAt: undefined, excludedBy: undefined, exclusionReason: undefined }
            : td
        ))
        // Clear success message after 4 seconds
        setTimeout(() => setSuccessMessage(null), 4000)
      } else {
        alert(`Error: ${result?.error || 'Failed to restore record'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to restore'}`)
    } finally {
      setRestoringId(null)
    }
  }

  const handleExcludeRecord = (record: TrainingDataRecord) => {
    setExcludeConfirm(record)
  }

  const confirmExcludeRecord = async (record: TrainingDataRecord) => {
    setExcludingId(record.id)
    try {
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')

      const result = await window.ipcApi.callCloudFunction(
        'adminExcludeTrainingRecordFromLearning',
        token,
        { recordId: record.id, reason: 'Excluded from admin UI' }
      )

      if (result?.ok) {
        setSuccessMessage(`${SYMBOLS.SUCCESS} Record excluded: ${record.month} (${record.type === 'l2_manual_feedback' ? 'Manual' : 'Auto'})`)
        // Update local state to mark as excluded
        setTrainingData(trainingData.map(td =>
          td.id === record.id
            ? { ...td, excludedFromLearning: true, excludedAt: new Date(), excludedBy: 'admin', exclusionReason: 'Excluded from admin UI' }
            : td
        ))
        // Clear success message after 4 seconds
        setTimeout(() => setSuccessMessage(null), 4000)
        setExcludeConfirm(null)
      } else {
        alert(`Error: ${result?.error || 'Failed to exclude record'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to exclude'}`)
    } finally {
      setExcludingId(null)
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

  const filteredTrainingData = trainingData.filter(td => {
    if (trainingStatusFilter === 'excluded') {
      return td.excludedFromLearning === true
    } else if (trainingStatusFilter === 'approved') {
      return !td.excludedFromLearning && td.status === 'approved'
    } else if (trainingStatusFilter === 'pending') {
      return !td.excludedFromLearning && td.status !== 'approved'
    }
    return true // 'all'
  })

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
          {SYMBOLS.ERROR} Only admin/ml_admin can view training data
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
          statusMessage.includes(SYMBOLS.SUCCESS) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {statusMessage}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          {SYMBOLS.ERROR} {error}
        </div>
      )}

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
              {SYMBOLS.SUCCESS} Valid only
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
                      {t.mlEligible ? SYMBOLS.SUCCESS : SYMBOLS.ERROR}
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

        {/* Status filter buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTrainingStatusFilter('all')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              trainingStatusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-border/80 dark:hover:bg-dark-border/80'
            }`}
          >
            All ({trainingData.length})
          </button>
          <button
            onClick={() => setTrainingStatusFilter('pending')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              trainingStatusFilter === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-border/80 dark:hover:bg-dark-border/80'
            }`}
          >
            Pending ({trainingData.filter(td => !td.excludedFromLearning && td.status !== 'approved').length})
          </button>
          <button
            onClick={() => setTrainingStatusFilter('approved')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              trainingStatusFilter === 'approved'
                ? 'bg-green-600 text-white'
                : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-border/80 dark:hover:bg-dark-border/80'
            }`}
          >
            Approved ({trainingData.filter(td => !td.excludedFromLearning && td.status === 'approved').length})
          </button>
          <button
            onClick={() => setTrainingStatusFilter('excluded')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              trainingStatusFilter === 'excluded'
                ? 'bg-yellow-600 text-white'
                : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-light-border/80 dark:hover:bg-dark-border/80'
            }`}
          >
            Excluded ({trainingData.filter(td => td.excludedFromLearning === true).length})
          </button>
        </div>

        {/* Summary counts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-light-border/50 dark:bg-dark-border/50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{trainingData.filter(td => !td.excludedFromLearning && td.status !== 'approved').length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wider">Approved</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{trainingData.filter(td => !td.excludedFromLearning && td.status === 'approved').length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wider">Excluded</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{trainingData.filter(td => td.excludedFromLearning === true).length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{trainingData.length}</p>
          </div>
        </div>

        {successMessage && (
          <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm">
            {successMessage}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-light-textMuted">Loading feedback...</div>
        ) : filteredTrainingData.length === 0 ? (
          <div className="text-center py-8 text-light-textMuted">
            <p>{trainingStatusFilter === 'all' ? 'No training feedback yet.' : `No ${trainingStatusFilter} training feedback.`}</p>
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
                  <th className="px-3 py-2 text-left">Approval Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrainingData.map(td => (
                  <tr
                    key={td.id}
                    className={`border-b border-light-border dark:border-dark-border ${
                      td.excludedFromLearning
                        ? 'bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/30'
                        : 'hover:bg-light-border dark:hover:bg-dark-border/50'
                    }`}
                  >
                    <td className="px-3 py-2 font-semibold">
                      <span className={`px-2 py-0.5 rounded text-xs ${td.type === 'l2_manual_feedback' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {td.type === 'l2_manual_feedback' ? `${SYMBOLS.MANUAL} Manual` : `${SYMBOLS.AUTO} Auto`}
                      </span>
                    </td>
                    <td className="px-3 py-2">{td.month}</td>
                    <td className="px-3 py-2 font-mono text-xs">{td.userId.slice(0, 8)}...</td>
                    <td className="px-3 py-2 text-right">{td.predictedTotal != null ? td.predictedTotal.toLocaleString() : SYMBOLS.DASH} {SYMBOLS.CZK}</td>
                    <td className="px-3 py-2 text-right">{td.actualTotal != null ? td.actualTotal.toLocaleString() : SYMBOLS.DASH} {SYMBOLS.CZK}</td>
                    <td className="px-3 py-2 text-right font-semibold">{td.errorPercent != null ? td.errorPercent.toFixed(1) : SYMBOLS.DASH}%</td>
                    <td className="px-3 py-2 text-xs text-light-textMuted dark:text-dark-textMuted">{td.source}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          {td.excludedFromLearning ? (
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-0.5 rounded text-xs bg-yellow-200 text-yellow-800 font-semibold border border-yellow-300">
                                {SYMBOLS.WARNING} Excluded
                              </span>
                              <span className="text-xs text-yellow-700 dark:text-yellow-400 italic">
                                Not used for learning
                              </span>
                            </div>
                          ) : td.status === 'approved' ? (
                            <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">
                              {SYMBOLS.SUCCESS} Approved
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-semibold">
                              {SYMBOLS.PENDING} Pending
                            </span>
                          )}
                          {isAdmin && !td.excludedFromLearning && td.status !== 'approved' && (
                            <button
                              onClick={() => handleApproveRecord(td)}
                              disabled={approvingId === td.id}
                              className="px-2 py-0.5 rounded text-xs bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {approvingId === td.id ? 'Approving...' : 'Approve'}
                            </button>
                          )}
                          {isAdmin && !td.excludedFromLearning && (
                            <button
                              onClick={() => handleExcludeRecord(td)}
                              disabled={excludingId === td.id}
                              className="px-2 py-0.5 rounded text-xs bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {excludingId === td.id ? 'Excluding...' : 'Exclude'}
                            </button>
                          )}
                        </div>
                        {isAdmin && td.excludedFromLearning && (
                          <button
                            onClick={() => handleRestoreRecord(td)}
                            disabled={restoringId === td.id}
                            className="px-2 py-0.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {restoringId === td.id ? 'Restoring...' : 'Restore to learning'}
                          </button>
                        )}
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
            {SYMBOLS.WARNING} {predictionsError}
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

      {/* Exclude confirmation modal */}
      {excludeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-light-bg dark:bg-dark-bg rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-light-text dark:text-dark-text">Exclude from AI Learning?</h3>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 space-y-2 text-sm">
              <p className="text-light-text dark:text-dark-text">
                <strong>Type:</strong> {excludeConfirm.type === 'l2_manual_feedback' ? '👤 Manual Feedback' : '🤖 Auto Feedback'}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>Month:</strong> {excludeConfirm.month}
              </p>
              <p className="text-light-text dark:text-dark-text">
                <strong>Status:</strong> {excludeConfirm.status === 'approved' ? `${SYMBOLS.SUCCESS} Approved` : `${SYMBOLS.PENDING} Pending`}
              </p>
              <p className="text-yellow-700 dark:text-yellow-300 mt-3 text-xs">
                This record will stay in the database, but will no longer be used for AI learning.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setExcludeConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-border dark:hover:bg-dark-border transition-colors"
                disabled={excludingId !== null}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmExcludeRecord(excludeConfirm)}
                className="flex-1 px-4 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 transition-colors disabled:opacity-50"
                disabled={excludingId !== null}
              >
                {excludingId !== null ? 'Excluding...' : 'Exclude'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
