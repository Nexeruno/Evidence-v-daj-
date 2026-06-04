import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useUserRole } from '@/hooks/useUserRole'
import { db } from '@/config/firebase'
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs
} from 'firebase/firestore'

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
  const { user } = useAuth()
  const { role: userRole } = useUserRole(user)

  const [rawTransactions, setRawTransactions] = useState<RawTransaction[]>([])
  const [trainingData, setTrainingData] = useState<TrainingDataRecord[]>([])
  const [l2Predictions, setL2Predictions] = useState<L2Prediction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter states for Raw Transactions
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'vydaj' | 'prijem'>('all')
  const [validOnlyFilter, setValidOnlyFilter] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusMessage] = useState<string>('')

  // Load raw transactions and training data
  useEffect(() => {
    if (!user || !['admin', 'ml_admin'].includes(userRole)) {
      setError('Only admin/ml_admin can view training data')
      return
    }

    loadData()
  }, [user, userRole])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load raw transactions (vydaje + prijmy)
      const transactions: RawTransaction[] = []

      // Get all users
      const usersSnap = await getDocs(collection(db, 'users'))
      const userIds = usersSnap.docs.map(doc => doc.id)

      // Load vydaje and prijmy for each user
      for (const uid of userIds) {
        // Vydaje
        const vydajeSnap = await getDocs(collection(db, 'users', uid, 'vydaje'))
        vydajeSnap.docs.forEach(doc => {
          const data = doc.data()
          transactions.push({
            id: doc.id,
            userId: uid,
            type: 'vydaj',
            datum: data.datum || '',
            castka: Number(data.castka) || 0,
            kategorie: data.kategorie,
            nazev: data.nazev,
            popis: data.popis,
            sourcePath: `users/${uid}/vydaje/${doc.id}`,
            createdAt: data.createdAt,
            mlEligible: validateTransaction(data),
            validationIssues: getValidationIssues(data),
          })
        })

        // Prijmy
        const prijmySnap = await getDocs(collection(db, 'users', uid, 'prijmy'))
        prijmySnap.docs.forEach(doc => {
          const data = doc.data()
          transactions.push({
            id: doc.id,
            userId: uid,
            type: 'prijem',
            datum: data.datum || '',
            castka: Number(data.castka) || 0,
            kategorie: data.kategorie,
            nazev: data.nazev,
            popis: data.popis,
            sourcePath: `users/${uid}/prijmy/${doc.id}`,
            createdAt: data.createdAt,
            mlEligible: validateTransaction(data),
            validationIssues: getValidationIssues(data),
          })
        })
      }

      // Load training data (l2 feedback)
      const trainingSnap = await getDocs(
        query(
          collection(db, 'trainingData'),
          where('type', 'in', ['l2_manual_feedback', 'l2_auto_feedback'])
        )
      )
      const feedbackRecords: TrainingDataRecord[] = trainingSnap.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          type: data.type,
          userId: data.userId,
          predictionId: data.predictionId,
          month: data.month,
          predictedTotal: data.predictedTotal,
          actualTotal: data.actualTotal,
          errorAmount: data.errorAmount,
          errorPercent: data.errorPercent,
          source: data.source,
          status: data.status,
          createdAt: data.createdAt,
        }
      })

      // Load L2 shadow predictions
      const predictionsSnap = await getDocs(
        query(
          collectionGroup(db, 'mlPredictions'),
          where('pipelineLevel', '==', 2),
          where('shadowMode', '==', true)
        )
      )
      const predictions: L2Prediction[] = predictionsSnap.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          userId: doc.ref.parent.parent!.id,
          month: data.month,
          pipelineLevel: data.pipelineLevel,
          shadowMode: data.shadowMode,
          active: data.active,
          totalPredictedExpense: data.totalPredictedExpense,
          trainingDataUsed: data.trainingDataUsed || false,
          trainingDataCount: data.trainingDataCount,
          manualFeedbackCount: data.manualFeedbackCount,
          autoFeedbackCount: data.autoFeedbackCount,
          finalCorrectionFactor: data.finalCorrectionFactor,
          isRealMlModel: data.isRealMlModel || false,
          modelVersion: data.modelVersion,
        }
      })

      setRawTransactions(transactions)
      setTrainingData(feedbackRecords)
      setL2Predictions(predictions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
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

  if (!['admin', 'ml_admin'].includes(userRole)) {
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
          <div className="text-center py-8 text-light-textMuted">No training feedback yet</div>
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
                      <span className={`px-2 py-0.5 rounded text-xs ${td.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                        {td.status}
                      </span>
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
        ) : l2Predictions.length === 0 ? (
          <div className="text-center py-8 text-light-textMuted">No L2 shadow predictions yet</div>
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
    </div>
  )
}
