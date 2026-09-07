'use client'

import { FormEvent, useState } from 'react'
import { createBrowserSupabaseClient } from '../../../lib/supabase/browser'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMessage('')

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setErrorMessage('Email o contraseña incorrectos.')
      setLoading(false)
      return
    }

    window.location.href = '/admin'
  }

  return (
    <main className="panelLoginPage">
      <form className="panelLoginCard" onSubmit={submit}>
        <span className="badge">ADMINISTRACIÓN SAAS</span>
        <h1>Panel del proveedor</h1>
        <p>Acceso privado</p>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <label>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        <button className="panelPrimaryButton" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        {errorMessage ? <div className="panelError">{errorMessage}</div> : null}
      </form>
    </main>
  )
}
