import { useState, useEffect } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import toast from 'react-hot-toast'

interface TrainingDataItem {
  id: string
  type: string
  input: string
  expectedOutput?: string
  category?: string
  tags?: string[]
  note?: string
  approved?: boolean
  createdAt?: Date
  createdBy?: string
  // L2 feedback fields
  month?: string
  predictedTotal?: number
  actualTotal?: number
  errorPercent?: number
  source?: string
  status?: string
  userId?: string
}

export function TrainingPage() {
  const { getIdToken } = useAuth()
  const [activeTab, setActiveTab] = useState<'income' | 'expense' | 'categorization' | 'qa'>('income')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // Training data list
  const [trainingList, setTrainingList] = useState<TrainingDataItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterApproved, setFilterApproved] = useState<string>('all')

  // Approval panel filter (separate from sidebar filter)
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [approvalActionLoading, setApprovalActionLoading] = useState<string | null>(null)

  // Form states
  const [income, setIncome] = useState({ name: '', category: '', note: '', tags: '' })
  const [expense, setExpense] = useState({ name: '', category: '', note: '', tags: '' })
  const [categorization, setCategorization] = useState({
    pattern: '',
    category: '',
    type: 'expense' as 'income' | 'expense',
    note: '',
    tags: '',
  })
  const [qa, setQa] = useState({ question: '', answer: '', tags: '', note: '' })

  // Load training data list
  useEffect(() => {
    loadTrainingData()
  }, [filterType, filterApproved])

  const loadTrainingData = async () => {
    try {
      setListLoading(true)
      setListError(null)
      const token = await getIdToken()

      if (!window.ipcApi) {
        setListError('Training backend is not deployed yet.')
        return
      }

      const response = await window.ipcApi.callCloudFunction(
        'adminGetTrainingData',
        token,
        {
          type: filterType !== 'all' ? filterType : undefined,
          approved: filterApproved !== 'all' ? filterApproved : undefined,
          limit: 100,
          offset: 0,
        }
      )

      if (!response.ok) {
        const errorMsg = response.error || 'Unknown error'

        // Determine specific error type
        if (errorMsg.includes('not a function') || errorMsg.includes('not deployed')) {
          setListError('Training backend is not deployed yet.')
        } else if (errorMsg.includes('Forbidden') || errorMsg.includes('permission')) {
          setListError('You do not have permission to view training data.')
        } else {
          setListError('Training data could not be loaded.')
        }
        return
      }

      // Backend returns { ok, items, totalCount }
      setTrainingList(
        (response.items ?? []).map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        }))
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load training data'

      // Check for specific error types
      if (message.includes('not available') || message.includes('IPC')) {
        setListError('Training backend is not deployed yet.')
      } else if (message.includes('permission') || message.includes('Forbidden')) {
        setListError('You do not have permission to view training data.')
      } else {
        setListError(message)
      }
      console.error('loadTrainingData error:', error)
    } finally {
      setListLoading(false)
    }
  }

  const handleApproveItem = async (id: string, approve: boolean) => {
    try {
      setApprovalActionLoading(id)
      const token = await getIdToken()
      if (!window.ipcApi) throw new Error('IPC API not available')
      const response = await window.ipcApi.callCloudFunction('adminApproveTrainingData', token, {
        id,
        approved: approve,
      })
      if (!response.ok) throw new Error(response.error || 'Approval failed')
      toast.success(approve ? 'Record approved' : 'Record rejected')
      // Optimistic update – mutate local state immediately
      setTrainingList(prev =>
        prev.map(item =>
          item.id === id
            ? { ...item, approved: approve, status: approve ? 'approved' : 'rejected' }
            : item
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed: ${message}`)
    } finally {
      setApprovalActionLoading(null)
    }
  }

  const callCloudFunction = async (functionName: string, data: any) => {
    try {
      const token = await getIdToken()

      if (!window.ipcApi) {
        throw new Error('IPC API not available in this environment')
      }

      const response = await window.ipcApi.callCloudFunction(functionName, token, data)

      if (!response.ok) {
        throw new Error(response.error || 'Cloud function failed')
      }

      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(message)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Income Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleSaveIncome = async () => {
    if (!income.name || !income.category) {
      toast.error('Please fill in name and category')
      return
    }

    try {
      setLoading(true)
      setStatusMessage('Saving income record...')

      await callCloudFunction('adminCreateTrainingData', {
        type: 'income_name',
        input: income.name,
        expectedOutput: income.category,
        category: income.category,
        tags: income.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
        note: income.note,
      })

      toast.success('Income record saved')
      setStatusMessage('✅ Income record saved successfully')
      setIncome({ name: '', category: '', note: '', tags: '' })
      await loadTrainingData()
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Failed: ${message}`)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Expense Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleSaveExpense = async () => {
    if (!expense.name || !expense.category) {
      toast.error('Please fill in name and category')
      return
    }

    try {
      setLoading(true)
      setStatusMessage('Saving expense record...')

      await callCloudFunction('adminCreateTrainingData', {
        type: 'expense_name',
        input: expense.name,
        expectedOutput: expense.category,
        category: expense.category,
        tags: expense.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
        note: expense.note,
      })

      toast.success('Expense record saved')
      setStatusMessage('✅ Expense record saved successfully')
      setExpense({ name: '', category: '', note: '', tags: '' })
      await loadTrainingData()
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Failed: ${message}`)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Categorization Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleSaveCategorization = async () => {
    if (!categorization.pattern || !categorization.category) {
      toast.error('Please fill in pattern and category')
      return
    }

    try {
      setLoading(true)
      setStatusMessage('Saving categorization rule...')

      await callCloudFunction('adminCreateTrainingData', {
        type: 'category_rule',
        input: categorization.pattern,
        expectedOutput: categorization.category,
        category: categorization.category,
        tags: categorization.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
        note: categorization.note,
      })

      toast.success('Categorization rule saved')
      setStatusMessage('✅ Categorization rule saved successfully')
      setCategorization({ pattern: '', category: '', type: 'expense', note: '', tags: '' })
      await loadTrainingData()
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Failed: ${message}`)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Q&A Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleSaveQA = async () => {
    if (!qa.question || !qa.answer) {
      toast.error('Please fill in question and answer')
      return
    }

    try {
      setLoading(true)
      setStatusMessage('Saving Q&A pair...')

      await callCloudFunction('adminCreateTrainingData', {
        type: 'qa_example',
        input: qa.question,
        expectedOutput: qa.answer,
        category: '',
        tags: qa.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
        note: qa.note,
      })

      toast.success('Q&A pair saved')
      setStatusMessage('✅ Q&A pair saved successfully')
      setQa({ question: '', answer: '', tags: '', note: '' })
      await loadTrainingData()
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatusMessage(`❌ Failed: ${message}`)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">Manual Training</h1>
      <p className="text-light-textMuted dark:text-dark-textMuted">Add manual training data to improve AI/ML models</p>

      {statusMessage && (
        <div
          className={`p-4 rounded-lg text-sm ${
            statusMessage.includes('✅')
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Input Forms */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="bg-light-card dark:bg-dark-card rounded-lg border border-light-border dark:border-dark-border overflow-hidden mb-6">
            <div className="flex border-b border-light-border dark:border-dark-border">
              {(['income', 'expense', 'categorization', 'qa'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  disabled={loading}
                  className={`flex-1 px-6 py-4 text-center font-semibold transition ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text hover:bg-gray-100 dark:bg-gray-700 disabled:opacity-50'
                  }`}
                >
                  {tab === 'income' && '💰 Income'}
                  {tab === 'expense' && '💸 Expense'}
                  {tab === 'categorization' && '🏷️ Categorization'}
                  {tab === 'qa' && '❓ Q&A'}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Income Tab */}
              {activeTab === 'income' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Income Name *
                    </label>
                    <input
                      type="text"
                      value={income.name}
                      onChange={(e) => setIncome({ ...income, name: e.target.value })}
                      placeholder="e.g., Salary, Freelance Project"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Category *
                    </label>
                    <input
                      type="text"
                      value={income.category}
                      onChange={(e) => setIncome({ ...income, category: e.target.value })}
                      placeholder="e.g., Salary, Investment"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Note (optional)
                    </label>
                    <textarea
                      value={income.note}
                      onChange={(e) => setIncome({ ...income, note: e.target.value })}
                      placeholder="Additional context..."
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text h-20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={income.tags}
                      onChange={(e) => setIncome({ ...income, tags: e.target.value })}
                      placeholder="e.g., recurring, monthly, verified"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleSaveIncome}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '⏳ Saving...' : '💾 Save Income Record'}
                  </button>
                </div>
              )}

              {/* Expense Tab */}
              {activeTab === 'expense' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Expense Name *
                    </label>
                    <input
                      type="text"
                      value={expense.name}
                      onChange={(e) => setExpense({ ...expense, name: e.target.value })}
                      placeholder="e.g., Office Rent, Coffee"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Category *
                    </label>
                    <input
                      type="text"
                      value={expense.category}
                      onChange={(e) => setExpense({ ...expense, category: e.target.value })}
                      placeholder="e.g., Rent, Food, Utilities"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Note (optional)
                    </label>
                    <textarea
                      value={expense.note}
                      onChange={(e) => setExpense({ ...expense, note: e.target.value })}
                      placeholder="Additional context..."
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text h-20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={expense.tags}
                      onChange={(e) => setExpense({ ...expense, tags: e.target.value })}
                      placeholder="e.g., recurring, monthly, verified"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleSaveExpense}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '⏳ Saving...' : '💾 Save Expense Record'}
                  </button>
                </div>
              )}

              {/* Categorization Tab */}
              {activeTab === 'categorization' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      When name contains *
                    </label>
                    <input
                      type="text"
                      value={categorization.pattern}
                      onChange={(e) => setCategorization({ ...categorization, pattern: e.target.value })}
                      placeholder="e.g., 'amazon', 'starbucks', 'salary'"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Assign category *
                    </label>
                    <input
                      type="text"
                      value={categorization.category}
                      onChange={(e) =>
                        setCategorization({ ...categorization, category: e.target.value })
                      }
                      placeholder="e.g., Shopping, Coffee, Salary"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Type</label>
                    <select
                      value={categorization.type}
                      onChange={(e) =>
                        setCategorization({
                          ...categorization,
                          type: e.target.value as 'income' | 'expense',
                        })
                      }
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Note (optional)
                    </label>
                    <textarea
                      value={categorization.note}
                      onChange={(e) =>
                        setCategorization({ ...categorization, note: e.target.value })
                      }
                      placeholder="Additional context..."
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text h-20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={categorization.tags}
                      onChange={(e) => setCategorization({ ...categorization, tags: e.target.value })}
                      placeholder="e.g., shopping, frequent, verified"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleSaveCategorization}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '⏳ Saving...' : '💾 Save Categorization Rule'}
                  </button>
                </div>
              )}

              {/* Q&A Tab */}
              {activeTab === 'qa' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Question *
                    </label>
                    <textarea
                      value={qa.question}
                      onChange={(e) => setQa({ ...qa, question: e.target.value })}
                      placeholder="e.g., 'How do I categorize a business meal?'"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text h-24 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Expected Answer / Rule *
                    </label>
                    <textarea
                      value={qa.answer}
                      onChange={(e) => setQa({ ...qa, answer: e.target.value })}
                      placeholder="e.g., 'Business meals should be categorized as Meals & Entertainment'"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text h-24 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={qa.tags}
                      onChange={(e) => setQa({ ...qa, tags: e.target.value })}
                      placeholder="e.g., meals, business, categorization"
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                      Note (optional)
                    </label>
                    <textarea
                      value={qa.note}
                      onChange={(e) => setQa({ ...qa, note: e.target.value })}
                      placeholder="Additional context..."
                      disabled={loading}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text h-20 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleSaveQA}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '⏳ Saving...' : '💾 Save Q&A Pair'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Training Data List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Manual Training Examples */}
          <div className="bg-light-card dark:bg-dark-card rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
            <div className="p-4 border-b border-light-border dark:border-dark-border">
              <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">📝 Manual Training Examples</h2>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-0.5">Records added via this form</p>
              <div className="flex gap-2 mt-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="all">All Types</option>
                  <option value="income_name">Income</option>
                  <option value="expense_name">Expense</option>
                  <option value="category_rule">Categorization</option>
                  <option value="qa_example">Q&amp;A</option>
                </select>
                <select
                  value={filterApproved}
                  onChange={(e) => setFilterApproved(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="all">All</option>
                  <option value="true">Approved</option>
                  <option value="false">Pending</option>
                </select>
              </div>
            </div>

            <div className="overflow-y-auto max-h-64">
              {listLoading ? (
                <div className="p-4 text-center text-gray-500 text-sm">Loading…</div>
              ) : listError ? (
                <div className="p-4 text-center text-red-600 text-sm">
                  <p className="font-semibold">⚠️ Error</p>
                  <p className="text-xs mt-1">{listError}</p>
                </div>
              ) : (() => {
                const manualTypes = ['income_name', 'expense_name', 'category_rule', 'qa_example']
                const manualItems = trainingList.filter(i => manualTypes.includes(i.type))
                if (manualItems.length === 0) {
                  return (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      <p>No manual training records yet.</p>
                      <p className="text-xs mt-1 text-gray-400">Use the form on the left to add examples.</p>
                    </div>
                  )
                }
                return (
                  <div className="divide-y">
                    {manualItems.slice(0, 15).map((item) => (
                      <div key={item.id} className="p-3 hover:bg-light-border/50 dark:hover:bg-dark-border/50 text-xs">
                        <div className="flex items-start gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-white text-xs font-semibold whitespace-nowrap ${
                            item.type === 'income_name' ? 'bg-green-600'
                            : item.type === 'expense_name' ? 'bg-red-600'
                            : item.type === 'category_rule' ? 'bg-blue-600'
                            : 'bg-purple-600'
                          }`}>
                            {item.type === 'income_name' ? '💰' : item.type === 'expense_name' ? '💸' : item.type === 'category_rule' ? '🏷️' : '❓'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-light-text dark:text-dark-text truncate">{item.input || '—'}</p>
                            {item.expectedOutput && (
                              <p className="text-gray-400 truncate">→ {item.expectedOutput}</p>
                            )}
                            <p className={`text-xs mt-0.5 ${(item.approved || item.status === 'approved') ? 'text-green-600' : 'text-yellow-600'}`}>
                              {(item.approved || item.status === 'approved') ? '✅ Approved' : '⏳ Pending approval'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* L2 Feedback Records (manual entries for model learning) */}
          <div className="bg-light-card dark:bg-dark-card rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
            <div className="p-4 border-b border-light-border dark:border-dark-border">
              <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">🎯 L2 Manual Feedback</h2>
              <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-0.5">Manually entered correction records (2× weight)</p>
            </div>
            <div className="overflow-y-auto max-h-48">
              {listLoading ? (
                <div className="p-4 text-center text-gray-500 text-sm">Loading…</div>
              ) : (() => {
                const l2Manual = trainingList.filter(i => i.type === 'l2_manual_feedback')
                if (l2Manual.length === 0) {
                  return (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      <p>No L2 manual feedback yet.</p>
                      <p className="text-xs mt-1 text-gray-400">Add via ML Predictions → Add Feedback.</p>
                    </div>
                  )
                }
                return (
                  <div className="divide-y">
                    {l2Manual.slice(0, 10).map((item) => (
                      <div key={item.id} className="p-3 hover:bg-light-border/50 dark:hover:bg-dark-border/50 text-xs">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-light-text dark:text-dark-text">{item.month || '—'}</p>
                            <p className="text-gray-400 text-xs">{item.userId ? item.userId.slice(0, 10) + '…' : '—'}</p>
                          </div>
                          <div className="text-right">
                            {item.errorPercent != null && (
                              <p className={`font-semibold ${Math.abs(item.errorPercent) > 10 ? 'text-red-600' : 'text-green-600'}`}>
                                {item.errorPercent.toFixed(1)}% err
                              </p>
                            )}
                            <p className={`text-xs mt-0.5 ${item.status === 'approved' ? 'text-green-600' : 'text-yellow-600'}`}>
                              {item.status === 'approved' ? '✅' : '⏳'} {item.status}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Approval Panel ──────────────────────────────────────────────────── */}
      <div className="bg-light-card dark:bg-dark-card rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
        <div className="p-4 border-b border-light-border dark:border-dark-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-light-text dark:text-dark-text">✅ Training Record Review</h2>
            <p className="text-xs text-light-textMuted dark:text-dark-textMuted mt-0.5">
              Approve or reject training records. Admin-created records are auto-approved. L2 feedback may need review.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
              <button
                key={f}
                onClick={() => setApprovalFilter(f)}
                className={`px-3 py-1 rounded text-xs font-semibold ${approvalFilter === f
                  ? f === 'pending' ? 'bg-yellow-500 text-white'
                    : f === 'approved' ? 'bg-green-600 text-white'
                    : f === 'rejected' ? 'bg-red-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-light-border dark:bg-dark-border text-light-text dark:text-dark-text'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && (
                  <span className="ml-1">
                    ({trainingList.filter(i => {
                      const s = i.status || (i.approved ? 'approved' : 'pending')
                      return s === f
                    }).length})
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={loadTrainingData}
              disabled={listLoading}
              className="px-3 py-1 rounded text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold"
            >
              🔄
            </button>
          </div>
        </div>

        {listLoading ? (
          <div className="p-6 text-center text-light-textMuted dark:text-dark-textMuted text-sm">Loading…</div>
        ) : listError ? (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">⚠️ {listError}</div>
        ) : (() => {
          const manualTypes = ['income_name', 'expense_name', 'category_rule', 'qa_example', 'l2_manual_feedback', 'l2_auto_feedback']
          const items = trainingList
            .filter(item => manualTypes.includes(item.type))
            .filter(item => {
              if (approvalFilter === 'all') return true
              const s = item.status || (item.approved ? 'approved' : 'pending')
              return s === approvalFilter
            })

          if (items.length === 0) {
            return (
              <div className="p-6 text-center text-light-textMuted dark:text-dark-textMuted text-sm">
                No records {approvalFilter !== 'all' ? `with status "${approvalFilter}"` : ''}.
              </div>
            )
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-light-border dark:bg-dark-border">
                  <tr>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Input</th>
                    <th className="px-3 py-2 text-left">Expected Output</th>
                    <th className="px-3 py-2 text-left">Note</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const status = item.status || (item.approved ? 'approved' : 'pending')
                    const isPending = status === 'pending'
                    const isActioning = approvalActionLoading === item.id
                    return (
                      <tr key={item.id} className="border-b border-light-border dark:border-dark-border hover:bg-light-bg dark:hover:bg-dark-bg/50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            status === 'approved' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : status === 'rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          }`}>
                            {status === 'approved' ? '✅ Approved' : status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-light-textMuted dark:text-dark-textMuted">
                          {item.type.replace('_', ' ')}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate text-light-text dark:text-dark-text" title={item.input}>
                          {item.input || '—'}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate text-light-textMuted dark:text-dark-textMuted" title={item.expectedOutput}>
                          {item.expectedOutput || '—'}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate text-light-textMuted dark:text-dark-textMuted" title={item.note}>
                          {item.note || '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-light-textMuted dark:text-dark-textMuted">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isPending ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleApproveItem(item.id, true)}
                                disabled={isActioning}
                                className="px-2 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                              >
                                {isActioning ? '…' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleApproveItem(item.id, false)}
                                disabled={isActioning}
                                className="px-2 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                              >
                                {isActioning ? '…' : 'Reject'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-light-textMuted dark:text-dark-textMuted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <p className="text-blue-900">
          <span className="font-semibold">ℹ️ Note:</span> Training data is used to improve AI/ML
          models over time. The more examples you provide, the better the system becomes. All records
          require admin approval before being used in training.
        </p>
      </div>
    </div>
  )
}
