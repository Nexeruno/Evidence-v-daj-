export interface MlRun {
  id: string
  timestamp: number
  level: 1 | 2
  status: 'pending' | 'completed' | 'failed'
  accuracy?: number
  processingTime?: number
  datasetSize?: number
  notes?: string
}

export interface MlModel {
  id: string
  name: string
  version: string
  status: 'active' | 'shadow' | 'rollback'
  lastUpdated: number
  accuracy: number
  trainedOnCount: number
}

export interface MlMetrics {
  totalUsers: number
  activeSessions: number
  lastRunTime: number | null
  totalRunsLevel1: number
  totalRunsLevel2: number
  shadowAccuracy: number | null
  level1Status: 'active' | 'inactive'
  level2Status: 'shadow' | 'active' | 'rollback'
}

export interface UserSession {
  userId: string
  userName: string
  lastActivity: number
  predictions: number
}
