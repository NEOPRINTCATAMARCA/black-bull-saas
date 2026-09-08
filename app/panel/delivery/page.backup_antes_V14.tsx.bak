'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '../../../lib/supabase/browser'

type Zone = {
  id: string
  name: string
  delivery_fee: number | string
  estimated_minutes: number | string
  is_active: boolean
}

function money(value: number | string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export default function DeliveryZonesPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [businessId, setBusinessId] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [newFee, setNewFee] = useState('')
  const [newMinutes, setNewMinutes] = useState('20')

  async function loadZones() {
    setLoading(true)
    setMessage('')

    const { data: profileRows, error: profileError } = await supabase.rpc(
      'get_my_panel_profile'
    )

    const profile = Array.isArray(profileRows) ? profileRows[0] : null

    if (profileError || !profile?.business_id) {
      setMessage('No se pudo identificar el comercio.')
      setLoading(false)
      return
    }

    setBusinessId(profile.business_id)

    const { data, error } = await supabase
      .from('delivery_zones')
      .select('id, name, delivery_fee, estimated_minutes, is_active')
      .eq('business_id', profile.business_id)
      .order('delivery_fee')
      .order('name')

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setZones((data || []) as Zone[])
    setLoading(false)
  }

  useEffect(() => {
    loadZones()
  }, [])

  function patchZone(id: string, patch: Partial<Zone>) {
    setZones(prev =>
      prev.map(zone => (zone.id === id ? { ...zone, ...patch } : zone))
    )
  }

  async function saveZone(zone: Zone) {
    setMessage('')

    const fee = Number(zone.delivery_fee)
    const minutes = Number(zone.estimated_minutes)

    if (!zone.name.trim()) {
      setMessage('La zona necesita un nombre.')
      return
    }

    if (!Number.isFinite(fee) || fee < 0) {
      setMessage('Ingresá un costo de envío válido.')
      return
    }

    if (!Number.isFinite(minutes) || minutes < 0) {
      setMessage('Ingresá un tiempo estimado válido.')
      return
    }

    const { error } = await supabase
      .from('delivery_zones')
      .update({
        name: zone.name.trim(),
        delivery_fee: fee,
        estimated_minutes: Math.round(minutes),
        is_active: zone.is_active,
      })
      .eq('id', zone.id)
      .eq('business_id', businessId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Guardado: ${zone.name}`)
    await loadZones()
  }

  async function addZone() {
    setMessage('')

    const fee = Number(newFee)
    const minutes = Number(newMinutes)

    if (!newName.trim()) {
      setMessage('Escribí el nombre de la zona.')
      return
    }

    if (!Number.isFinite(fee) || fee < 0) {
      setMessage('Ingresá un costo de envío válido.')
      return
    }

    if (!Number.isFinite(minutes) || minutes < 0) {
      setMessage('Ingresá un tiempo estimado válido.')
      return
    }

    const { error } = await supabase.from('delivery_zones').insert({
      business_id: businessId,
      name: newName.trim(),
      delivery_fee: fee,
      estimated_minutes: Math.round(minutes),
      is_active: true,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setNewName('')
    setNewFee('')
    setNewMinutes('20')
    setMessage('Zona agregada.')
    await loadZones()
  }

  return (
    <main style={{ maxWidth: 1050, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>BLACK BULL</div>
          <h1 style={{ margin: 0, fontSize: 40 }}>Zonas y costos de delivery</h1>
          <p style={{ color: '#666', marginBottom: 0 }}>
            Estos valores los administra el dueño/encargado.
          </p>
        </div>

        <a
          href="/panel"
          style={{
            padding: '12px 18px',
            border: '1px solid #ddd',
            borderRadius: 12,
            textDecoration: 'none',
            color: '#111',
            fontWeight: 700,
          }}
        >
          ← Volver a pedidos
        </a>
      </div>

      {message ? (
        <div
          style={{
            padding: 12,
            border: '1px solid #ddd',
            borderRadius: 10,
            marginBottom: 18,
            background: '#fff',
          }}
        >
          {message}
        </div>
      ) : null}

      <section
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 18,
          marginBottom: 22,
          boxShadow: '0 6px 24px rgba(0,0,0,.06)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Agregar zona</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label>
            Nombre
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ej: Zona Centro"
              style={{ width: '100%', padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Costo
            <input
              value={newFee}
              onChange={e => setNewFee(e.target.value)}
              inputMode="decimal"
              placeholder="2500"
              style={{ width: '100%', padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Minutos
            <input
              value={newMinutes}
              onChange={e => setNewMinutes(e.target.value)}
              inputMode="numeric"
              placeholder="20"
              style={{ width: '100%', padding: 10, marginTop: 5 }}
            />
          </label>

          <button
            type="button"
            onClick={addZone}
            style={{
              padding: '11px 18px',
              border: 0,
              borderRadius: 10,
              background: '#111',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Agregar
          </button>
        </div>
      </section>

      {loading ? <p>Cargando zonas...</p> : null}

      {!loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {zones.map(zone => (
            <section
              key={zone.id}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 16,
                boxShadow: '0 6px 20px rgba(0,0,0,.05)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr auto auto',
                  gap: 10,
                  alignItems: 'end',
                }}
              >
                <label>
                  Zona
                  <input
                    value={zone.name}
                    onChange={e =>
                      patchZone(zone.id, { name: e.target.value })
                    }
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  Costo
                  <input
                    value={String(zone.delivery_fee)}
                    onChange={e =>
                      patchZone(zone.id, {
                        delivery_fee: e.target.value,
                      })
                    }
                    inputMode="decimal"
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label>
                  Minutos
                  <input
                    value={String(zone.estimated_minutes)}
                    onChange={e =>
                      patchZone(zone.id, {
                        estimated_minutes: e.target.value,
                      })
                    }
                    inputMode="numeric"
                    style={{ width: '100%', padding: 10, marginTop: 5 }}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    paddingBottom: 10,
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={zone.is_active}
                    onChange={e =>
                      patchZone(zone.id, { is_active: e.target.checked })
                    }
                  />
                  {zone.is_active ? 'ACTIVA' : 'INACTIVA'}
                </label>

                <button
                  type="button"
                  onClick={() => saveZone(zone)}
                  style={{
                    padding: '11px 16px',
                    border: 0,
                    borderRadius: 10,
                    background: '#111',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Guardar
                </button>
              </div>

              <div style={{ marginTop: 10, color: '#666' }}>
                Vista actual: <b>{zone.name}</b> · {money(zone.delivery_fee)} ·{' '}
                {zone.estimated_minutes || 0} min
              </div>
            </section>
          ))}

          {zones.length === 0 ? (
            <p style={{ color: '#666' }}>No hay zonas cargadas.</p>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
