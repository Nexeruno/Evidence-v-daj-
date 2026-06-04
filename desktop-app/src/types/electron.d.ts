// Type definitions for Electron
declare namespace NodeJS {
  interface Process {
    electronBinding: any
  }
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_PRELOAD_URL: string | undefined
