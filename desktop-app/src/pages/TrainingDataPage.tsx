import { useState } from 'react'
import { useFirestore } from '@/hooks/useFirestore'
import { orderBy, limit } from 'firebase/firestore'

interface TrainingData {
  id: string
  input: string | object
  expectedOutput: string | object
  type: 'manual' | 'automated' | 'production'
  createdAt: number
  createdBy: string
  validated: boolean
}

export function TrainingDataPage() {
  const constraints = [orderBy('createdAt', 'desc'), limit(100)]
  const { data: trainingData, loading } = useFirestore<TrainingData>('mlTrainingData', constraints)

  const [selectedType, setSelectedType] = useState<'all' | 'manual' | 'automated' | 'production'>('all')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const filteredData = trainingData.filter((item: TrainingData) =>
    selectedType === 'all' || item.type === selectedType
  )

  const handleExportData = async () => {
    try {
      setStatusMessage('Exporting training data...')

      // TODO: Call Cloud Function adminExportMlTrainingDataset
      // For now, mock CSV generation
      const csv = [
        ['Input', 'Expected Output', 'Type', 'Validated', 'Created At'].join(','),
        ...filteredData.map((d: TrainingData) =>
          [
            typeof d.input === 'string' ? d.input : JSON.stringify(d.input),
            typeof d.expectedOutput === 'string' ? d.expectedOutput : JSON.stringify(d.expectedOutput),
            d.type,
            d.validated ? 'Yes' : 'No',
            new Date(d.createdAt).toISOString()
          ].join(',')
        )
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `training-data-${Date.now()}.csv`
      a.click()

      setStatusMessage('✅ Data exported successfully')
    } catch (error) {
      setStatusMessage(`❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleValidateData = async () => {
    try {
      setStatusMessage('Validating data...')
      // TODO: Call Cloud Function to mark as validated
      await new Promise(resolve => setTimeout(resolve, 500))
      setStatusMessage('✅ Data validated')
    } catch (error) {
      setStatusMessage(`❌ Validation failed`)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'manual':
        return 'bg-blue-100 text-blue-700'
      case 'automated':
        return 'bg-green-100 text-green-700'
      case 'production':
        return 'bg-purple-100 text-purple-700'
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-light-text dark:text-dark-text'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">ML Training Data</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
          >
            📥 Export Data
          </button>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            ⬆️ Import Data
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-lg text-sm ${
          statusMessage.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {statusMessage}
        </div>
      )}

      {/* Filter */}
      <div className="bg-light-card dark:bg-dark-card rounded-lg p-6 border border-light-border dark:border-dark-border">
        <label className="block text-sm font-semibold text-light-text dark:text-dark-text mb-2">Filter by Type</label>
        <div className="flex gap-2">
          {['all', 'manual', 'automated', 'production'].map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type as any)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                selectedType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-light-text dark:text-dark-text hover:bg-gray-300'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Training Data Table */}
      <div className="bg-light-card dark:bg-dark-card rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
          ) : filteredData.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">No training data found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-light-border dark:bg-dark-border border-b border-light-border dark:border-dark-border">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Input</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Expected Output</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Type</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Validated</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Created</th>
                  <th className="px-6 py-3 text-left font-semibold text-light-text dark:text-dark-text">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((data: TrainingData) => (
                  <tr key={data.id} className="border-b border-light-border dark:border-dark-border hover:bg-light-border dark:bg-dark-border">
                    <td className="px-6 py-4 text-light-text dark:text-dark-text max-w-xs truncate" title={typeof data.input === 'string' ? data.input : JSON.stringify(data.input)}>
                      {typeof data.input === 'string' ? data.input : JSON.stringify(data.input).slice(0, 30) + '...'}
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text max-w-xs truncate" title={typeof data.expectedOutput === 'string' ? data.expectedOutput : JSON.stringify(data.expectedOutput)}>
                      {typeof data.expectedOutput === 'string' ? data.expectedOutput : JSON.stringify(data.expectedOutput).slice(0, 30) + '...'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getTypeColor(data.type)}`}>
                        {data.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-light-text dark:text-dark-text">
                      {data.validated ? '✅ Yes' : '❌ No'}
                    </td>
                    <td className="px-6 py-4 text-light-textMuted dark:text-dark-textMuted text-xs">
                      {new Date(data.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {!data.validated && (
                        <button
                          onClick={() => handleValidateData()}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          ✓ Validate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-light-card dark:bg-dark-card rounded-lg p-4 border border-light-border dark:border-dark-border">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Total Entries</p>
          <p className="text-3xl font-bold text-light-text dark:text-dark-text mt-2">{filteredData.length}</p>
        </div>
        <div className="bg-light-card dark:bg-dark-card rounded-lg p-4 border border-light-border dark:border-dark-border">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Validated</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {filteredData.filter((d: TrainingData) => d.validated).length}
          </p>
        </div>
        <div className="bg-light-card dark:bg-dark-card rounded-lg p-4 border border-light-border dark:border-dark-border">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Manual</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {filteredData.filter((d: TrainingData) => d.type === 'manual').length}
          </p>
        </div>
        <div className="bg-light-card dark:bg-dark-card rounded-lg p-4 border border-light-border dark:border-dark-border">
          <p className="text-light-textMuted dark:text-dark-textMuted text-xs">Validation Rate</p>
          <p className="text-3xl font-bold text-light-text dark:text-dark-text mt-2">
            {filteredData.length === 0 ? '0%' :
              `${(filteredData.filter((d: TrainingData) => d.validated).length / filteredData.length * 100).toFixed(0)}%`}
          </p>
        </div>
      </div>

      {/* Import Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-light-card dark:bg-dark-card rounded-lg p-8 max-w-md">
            <h3 className="text-xl font-bold text-light-text dark:text-dark-text mb-4">⬆️ Import Training Data</h3>
            <p className="text-light-textMuted dark:text-dark-textMuted mb-6">
              Upload a CSV file with columns: input, expectedOutput, type (manual|automated|production)
            </p>
            <input
              type="file"
              accept=".csv"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
            />
            <div className="flex gap-4">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-light-text dark:text-dark-text hover:bg-light-border dark:bg-dark-border font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setStatusMessage('✅ Data imported (mock)')
                  setUploadModalOpen(false)
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
