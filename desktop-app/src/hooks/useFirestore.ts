import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot, DocumentData, doc } from 'firebase/firestore'
import { db } from '@/config/firebase'

interface UseFirestoreOptions {
  enabled?: boolean
}

export function useFirestore<T extends DocumentData>(
  collectionName: string,
  constraints?: Array<any>,
  options?: UseFirestoreOptions
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (options?.enabled === false) {
      setLoading(false)
      return
    }

    let isMounted = true
    let timeoutId: any

    try {
      const q = constraints && constraints.length > 0
        ? query(collection(db, collectionName), ...constraints)
        : query(collection(db, collectionName))

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!isMounted) return

        const items = snapshot.docs.map(doc => {
          const data = doc.data() as unknown as T
          return {
            id: doc.id,
            ...data,
          } as T
        })
        setData(items)
        setLoading(false)
        clearTimeout(timeoutId)
      }, (err: any) => {
        if (!isMounted) return
        setError(err instanceof Error ? err : new Error('Failed to fetch data'))
        setLoading(false)
      })

      // Timeout after 10 seconds to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (isMounted && loading) {
          setLoading(false)
          setError(new Error('Loading timeout - collection may be empty or Firestore unavailable'))
        }
      }, 10000)

      return () => {
        isMounted = false
        clearTimeout(timeoutId)
        unsubscribe()
      }
    } catch (err) {
      if (!isMounted) return
      setError(err instanceof Error ? err : new Error('Failed to fetch data'))
      setLoading(false)
    }
  }, [collectionName, constraints, options?.enabled])

  return { data, loading, error }
}

export function useMlRuns(limitCount?: number) {
  const constraints = limitCount ? [orderBy('startedAt', 'desc'), limit(limitCount)] : [orderBy('startedAt', 'desc')]
  return useFirestore('mlRuns', constraints)
}

export function useAllUsers() {
  return useFirestore('users', [])
}

export interface PredictionSettings {
  id?: string
  activePredictionLevel: number
  level2Enabled: boolean
  level2ShadowMode: boolean
  fallbackEnabled: boolean
  createdAt?: any
  updatedAt?: any
  updatedBy?: string
}

export function useAppConfig() {
  const [data, setData] = useState<PredictionSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isMounted = true
    let timeoutId: any

    try {
      const docRef = doc(db, 'appConfig', 'predictionSettings')
      const unsubscribe = onSnapshot(docRef, (snapshot) => {
        if (!isMounted) return

        if (snapshot.exists()) {
          setData({ id: snapshot.id, ...snapshot.data() } as PredictionSettings)
        } else {
          setData(null)
        }
        setLoading(false)
        clearTimeout(timeoutId)
      }, (err: any) => {
        if (!isMounted) return
        setError(err instanceof Error ? err : new Error('Failed to fetch appConfig'))
        setLoading(false)
      })

      timeoutId = setTimeout(() => {
        if (isMounted && loading) {
          setLoading(false)
          setError(new Error('Loading timeout'))
        }
      }, 10000)

      return () => {
        isMounted = false
        clearTimeout(timeoutId)
        unsubscribe()
      }
    } catch (err) {
      if (!isMounted) return
      setError(err instanceof Error ? err : new Error('Failed to fetch appConfig'))
      setLoading(false)
    }
  }, [])

  return { data, loading, error }
}

export interface MlRun {
  id?: string
  startedAt?: any
  finishedAt?: any
  pipelineLevel?: number
  mode?: string
  status?: string
  durationMs?: number
  predictionsCreated?: number
  usersProcessed?: number
  averageConfidence?: number
  fallbackCount?: number
  errorCount?: number
  message?: string
}
