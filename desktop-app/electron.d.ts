export {};

declare global {
  interface Window {
    ipcApi?: {
      runLevel2Pipeline: (idToken: string) => Promise<{
        ok?: boolean;
        success?: boolean;
        status?: string;
        message?: string;
        runId?: string;
        pipelineId?: string;
        usersProcessed?: number;
        predictionsCreated?: number;
      }>;

      getPipelineStatus: () => Promise<{
        ok?: boolean;
        status?: string;
        message?: string;
        lastRun?: number | null;
        isRunning?: boolean;
      }>;

      clearLocalCache: () => Promise<{
        ok?: boolean;
        success?: boolean;
        message?: string;
      }>;

      callCloudFunction: (
        functionName: string,
        idToken: string,
        data?: unknown
      ) => Promise<any>;
    };
  }
}
