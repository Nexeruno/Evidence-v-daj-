import { useEffect, useState } from 'react'
import { User } from 'firebase/auth'

export function useUserRole(user: User | null) {
  const [role, setRole] = useState<string>('viewer')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setRole('viewer')
      setLoading(false)
      return
    }

    const fetchRole = async () => {
      try {
        const idTokenResult = await user.getIdTokenResult(true)
        const customRole = (idTokenResult.claims as any)?.role
        if (customRole) {
          setRole(customRole)
        } else {
          setRole('viewer')
        }
      } catch (err) {
        console.error('Error fetching user role:', err)
        setRole('viewer')
      } finally {
        setLoading(false)
      }
    }

    fetchRole()
  }, [user])

  return { role, loading }
}
