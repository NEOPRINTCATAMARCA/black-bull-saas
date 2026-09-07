'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '../../../lib/supabase/browser'

type Slot = {
  opens_at: string
  closes_at: string
}

type DayState = {
  weekday: number
  name: string
  closed: boolean
  slots: Slot[]
}

const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
]

function normalizeTime(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 5)
}

export default function HorariosPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [businessId, setBusinessId] = useState('')
  const [days, setDays] = useState<DayState[]>(
    DAY_NAMES.map((name, weekday) => ({
      weekday,
      name,
      closed: false,
      slots: [
        { opens_at: '12:00', closes_at: '15:00' },
        { opens_at: '21:00', closes_at: '02:00' },
      ],
    }))
  )
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingDay, setSavingDay] = useState<number | null>(null)

  async function loadHours() {
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
      .from('business_hours')
      .select('weekday, is_closed, opens_at, closes_at')
      .eq('business_id', profile.business_id)
      .order('weekday')
      .order('opens_at')

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    const rows = data || []

    setDays(
      DAY_NAMES.map((name, weekday) => {
        const dayRows = rows.filter(row => row.weekday === weekday)

        if (dayRows.length === 0) {
          return {
            weekday,
            name,
            closed: false,
            slots: [
              { opens_at: '12:00', closes_at: '15:00' },
              { opens_at: '21:00', closes_at: '02:00' },
            ],
          }
        }

        const closed = dayRows.some(row => row.is_closed)

        const slots = dayRows
          .filter(row => !row.is_closed)
          .map(row => ({
            opens_at: normalizeTime(row.opens_at),
            closes_at: normalizeTime(row.closes_at),
          }))

        return {
          weekday,
          name,
          closed,
          slots:
            slots.length > 0
              ? slots.slice(0, 2)
              : [
                  { opens_at: '12:00', closes_at: '15:00' },
                  { opens_at: '21:00', closes_at: '02:00' },
                ],
        }
      })
    )

    setLoading(false)
  }

  useEffect(() => {
    loadHours()
  }, [])

  function patchDay(
    weekday: number,
    updater: (day: DayState) => DayState
  ) {
    setDays(prev =>
      prev.map(day => (day.weekday === weekday ? updater(day) : day))
    )
  }

  function setSlot(
    weekday: number,
    index: number,
    field: keyof Slot,
    value: string
  ) {
    patchDay(weekday, day => {
      const slots = [...day.slots]
      while (slots.length <= index) {
        slots.push({ opens_at: '', closes_at: '' })
      }
      slots[index] = { ...slots[index], [field]: value }
      return { ...day, slots }
    })
  }

  async function saveDay(day: DayState) {
    setSavingDay(day.weekday)
    setMessage('')

    const { error: deleteError } = await supabase
      .from('business_hours')
      .delete()
      .eq('business_id', businessId)
      .eq('weekday', day.weekday)

    if (deleteError) {
      setMessage(deleteError.message)
      setSavingDay(null)
      return
    }

    if (day.closed) {
      const { error } = await supabase.from('business_hours').insert({
        business_id: businessId,
        weekday: day.weekday,
        is_closed: true,
        opens_at: null,
        closes_at: null,
      })

      if (error) {
        setMessage(error.message)
        setSavingDay(null)
        return
      }
    } else {
      const validSlots = day.slots
        .filter(slot => slot.opens_at && slot.closes_at)
        .slice(0, 2)

      if (validSlots.length === 0) {
        setMessage(`Ingresá al menos un horario para ${day.name}.`)
        setSavingDay(null)
        return
      }

      const rows = validSlots.map(slot => ({
        business_id: businessId,
        weekday: day.weekday,
        is_closed: false,
        opens_at: slot.opens_at,
        closes_at: slot.closes_at,
      }))

      const { error } = await supabase.from('business_hours').insert(rows)

      if (error) {
        setMessage(error.message)
        setSavingDay(null)
        return
      }
    }

    setMessage(`Horario guardado: ${day.name}`)
    setSavingDay(null)
    await loadHours()
  }

  return (
    <main style={{ maxWidth: 1050, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>BLACK BULL</div>
          <h1 style={{ margin: 0, fontSize: 40 }}>Horarios del negocio</h1>
          <p style={{ color: '#666', marginBottom: 0 }}>
            Podés usar hasta dos turnos por día.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/panel/productos"
            style={{
              padding: '12px 18px',
              border: '1px solid #ddd',
              borderRadius: 12,
              textDecoration: 'none',
              color: '#111',
              fontWeight: 700,
            }}
          >
            🍔 Productos
          </a>

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

      {loading ? <p>Cargando horarios...</p> : null}

      {!loading ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {days.map(day => (
            <section
              key={day.weekday}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: 18,
                boxShadow: '0 6px 24px rgba(0,0,0,.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 14,
                }}
              >
                <h2 style={{ margin: 0 }}>{day.name}</h2>

                <label style={{ fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={day.closed}
                    onChange={e =>
                      patchDay(day.weekday, current => ({
                        ...current,
                        closed: e.target.checked,
                      }))
                    }
                  />{' '}
                  Cerrado
                </label>
              </div>

              {!day.closed ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  {[0, 1].map(index => {
                    const slot = day.slots[index] || {
                      opens_at: '',
                      closes_at: '',
                    }

                    return (
                      <div
                        key={index}
                        style={{
                          border: '1px solid #eee',
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <b>Turno {index + 1}</b>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 10,
                            marginTop: 10,
                          }}
                        >
                          <label>
                            Abre
                            <input
                              type="time"
                              value={slot.opens_at}
                              onChange={e =>
                                setSlot(
                                  day.weekday,
                                  index,
                                  'opens_at',
                                  e.target.value
                                )
                              }
                              style={{
                                width: '100%',
                                padding: 10,
                                marginTop: 5,
                              }}
                            />
                          </label>

                          <label>
                            Cierra
                            <input
                              type="time"
                              value={slot.closes_at}
                              onChange={e =>
                                setSlot(
                                  day.weekday,
                                  index,
                                  'closes_at',
                                  e.target.value
                                )
                              }
                              style={{
                                width: '100%',
                                padding: 10,
                                marginTop: 5,
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ color: '#666' }}>
                  Ese día el negocio aparecerá como cerrado.
                </p>
              )}

              <button
                type="button"
                onClick={() => saveDay(day)}
                disabled={savingDay === day.weekday}
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
                {savingDay === day.weekday ? 'Guardando...' : 'Guardar día'}
              </button>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  )
}
