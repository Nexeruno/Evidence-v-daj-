export interface PipelineResult {
  success?: boolean
  ok?: boolean
  message?: string
  status?: string
  accuracy?: number
  processingTime?: number
  runId?: string
  pipelineId?: string
  usersProcessed?: number
  predictionsCreated?: number
  summary?: {
    usersProcessed?: number
    predictionsCreated?: number
    fallbackUsed?: number
    errorCount?: number
    durationMs?: number
    modelType?: string
    isRealMlModel?: boolean
    modelImplementation?: string
    usedDataSources?: Record<string, boolean>
    months?: number
  }
}

export interface PipelineStatus {
  ok?: boolean
  status?: string
  message?: string
  lastRun?: number | null
  isRunning?: boolean
}

export interface IpcApi {
  runLevel2Pipeline: (idToken: string) => Promise<PipelineResult>
  getPipelineStatus: () => Promise<PipelineStatus>
  callCloudFunction: (functionName: string, idToken: string, data: any) => Promise<any>
  clearLocalCache: () => Promise<void>
  generateAiProfile: (idToken: string, userId: string) => Promise<any>
  generateAllAiProfiles: (idToken: string) => Promise<any>
}

declare global {
  interface Window {
    ipcApi?: IpcApi
  }
}
