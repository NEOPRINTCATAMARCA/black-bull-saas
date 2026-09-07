'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '../../lib/supabase/browser'

type Business = {
  business_id: string
  business_name: string
  slug: string
  demo_paused: boolean
}

export default function AdminClient() {
  const supabase = createBrowserSupabaseClient()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [setupCode, setSetupCode] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const { data: adminData } = await supabase.rpc('is_platform_admin_v1')
    const allowed = adminData === true
    setIsAdmin(allowed)

    if (allowed) {
      const { data, error } = await supabase.rpc('get_admin_businesses_v1')
      if (error) setMessage(error.message)
      else setBusinesses(Array.isArray(data) ? data : [])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function claimAdmin() {
    setMessage('')
    const { data, error } = await supabase.rpc('claim_platform_admin_v1', {
      p_setup_code: setupCode,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    if (!data) {
      setMessage('Código incorrecto o el administrador ya fue configurado.')
      return
    }

    setSetupCode('')
    await load()
  }

  async function setPaused(businessId: string, paused: boolean) {
    setMessage('')
    const { data, error } = await supabase.rpc('set_demo_paused_v1', {
      p_business_id: businessId,
      p_paused: paused,
    })

    if (error || !data) {
      setMessage(error?.message || 'No se pudo cambiar el estado.')
      return
    }

    await load()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/admin/login'
  }

  if (loading) {
    return <main style={{padding: 24, fontFamily: 'Arial'}}>Cargando...</main>
  }

  if (!isAdmin) {
    return (
      <main style={{maxWidth: 560, margin: '60px auto', padding: 24, fontFamily: 'Arial'}}>
        <h1>Administración SaaS</h1>
        <p>Configuración inicial del administrador.</p>
        <input
          value={setupCode}
          onChange={e => setSetupCode(e.target.value)}
          placeholder="Código de configuración"
          style={{width:'100%', padding:12, margin:'12px 0', boxSizing:'border-box'}}
        />
        <button onClick={claimAdmin} style={{padding:'12px 18px', cursor:'pointer'}}>
          Habilitar mi cuenta como administrador
        </button>
        {message ? <p>{message}</p> : null}
      </main>
    )
  }

  return (
    <main style={{maxWidth: 900, margin: '40px auto', padding: 24, fontFamily: 'Arial'}}>
      <div style={{display:'flex', justifyContent:'space-between', gap:16, alignItems:'center'}}>
        <div>
          <h1 style={{marginBottom:4}}>Administración SaaS</h1>
          <p style={{marginTop:0}}>Control de muestras de clientes</p>
        </div>
        <button onClick={logout} style={{padding:'10px 14px'}}>Cerrar sesión</button>
      </div>

      {message ? <p>{message}</p> : null}

      <div style={{display:'grid', gap:12, marginTop:24}}>
        {businesses.map(b => (
          <div key={b.business_id} style={{
            border:'1px solid #ddd',
            borderRadius:14,
            padding:18,
            display:'flex',
            justifyContent:'space-between',
            gap:18,
            alignItems:'center'
          }}>
            <div>
              <strong style={{fontSize:18}}>{b.business_name}</strong>
              <div style={{marginTop:6, color:'#555'}}>{b.slug}</div>
              <div style={{marginTop:8, fontWeight:700}}>
                {b.demo_paused ? '⏸ MUESTRA PAUSADA' : '🟢 MUESTRA ACTIVA'}
              </div>
            </div>

            {b.demo_paused ? (
              <button
                onClick={() => setPaused(b.business_id, false)}
                style={{padding:'12px 16px', cursor:'pointer'}}
              >
                ▶ Reactivar muestra
              </button>
            ) : (
              <button
                onClick={() => setPaused(b.business_id, true)}
                style={{padding:'12px 16px', cursor:'pointer'}}
              >
                ⏸ Pausar muestra
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
