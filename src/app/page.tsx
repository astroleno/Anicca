'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomeRedirect(){
  const router = useRouter()
  useEffect(() => { router.replace('/newframe') }, [router])
  return <main style={{padding:24,color:'#999'}}>Redirecting to /newframe…</main>
}
