import { useEffect, useState } from 'react'

export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms, enabled])
  return now
}
