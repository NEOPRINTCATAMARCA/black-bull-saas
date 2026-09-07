'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserSupabaseClient } from '../../lib/supabase/browser'

type OrderItem = {
  id: string
  product_name_snapshot: string
  quantity: number
  unit_price_snapshot: number | string
  item_subtotal: number | string
  notes?: string | null
}

type Order = {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  fulfillment_type: 'pickup' | 'delivery'
  address?: string | null
  delivery_zone_id?: string | null
  subtotal: number | string
  delivery_fee: number | string
  total: number | string
  payment_method: string
  payment_status: string
  order_status: string
  courier_id?: string | null
  estimated_minutes?: number | null
  is_delayed: boolean
  notes?: string | null
  created_at: string
  order_items?: OrderItem[]
}

type DeliveryZone = {
  id: string
  name: string
  delivery_fee: number | string
  estimated_minutes?: number | null
}

type Courier = {
  id: string
  name: string
  phone?: string | null
  is_active: boolean
}

const columns = [
  { key: 'new', label: 'NUEVOS' },
  { key: 'preparing', label: 'EN PREPARACIÓN' },
  { key: 'ready', label: 'LISTOS' },
  { key: 'on_the_way', label: 'EN CAMINO' },
  { key: 'delivered', label: 'ENTREGADOS' },
]

function money(value: number | string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function time(value: string) {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PanelClient({
  initialOrders,
  couriers,
  deliveryZones,
  businessId,
  userName,
}: {
  initialOrders: Order[]
  couriers: Courier[]
  deliveryZones: DeliveryZone[]
  businessId: string
  userName: string
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [selected, setSelected] = useState<Order | null>(null)
  const [message, setMessage] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const alertAudioRef = useRef<HTMLAudioElement | null>(null)
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false)
  const [editableZones, setEditableZones] = useState<DeliveryZone[]>(deliveryZones)
  const [zoneEditorMessage, setZoneEditorMessage] = useState('')
  const [paymentSettingsOpen, setPaymentSettingsOpen] = useState(false)
  const [paymentSettingsMessage, setPaymentSettingsMessage] = useState('')
  const [paymentSettings, setPaymentSettings] = useState({
    cash_enabled: true,
    transfer_enabled: true,
    wallet_enabled: true,
    card_enabled: false,
    transfer_alias: '',
    transfer_holder: '',
  })
  const [selectedPayment, setSelectedPayment] = useState<{
    id: string
    status: string
    receipt_url?: string | null
  } | null>(null)
  const [receiptSignedUrl, setReceiptSignedUrl] = useState('')
  const [paymentActionMessage, setPaymentActionMessage] = useState('')
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false)
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false)
  const [dailySummaryMessage, setDailySummaryMessage] = useState('')
  const [dailySummary, setDailySummary] = useState({
    orders: 0,
    total: 0,
    delivery: 0,
    cash: 0,
    transfer: 0,
    wallet: 0,
    card: 0,
  })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMessage, setHistoryMessage] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyOrders, setHistoryOrders] = useState<Order[]>([])

  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${businessId}`,
        },
        payload => {
          if (payload.eventType === 'INSERT' && soundEnabled) {
            const audio = alertAudioRef.current
            if (audio) {
              audio.currentTime = 0
              audio.play().catch(() => {})
            }
          }

          window.setTimeout(() => {
            window.location.reload()
          }, payload.eventType === 'INSERT' ? 1400 : 150)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, soundEnabled, supabase])

  async function enableSound() {
    setMessage('')

    try {
      if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio('/black_bull_alerta_mensaje.mp3')
        alertAudioRef.current.preload = 'auto'
        alertAudioRef.current.volume = 1
      }

      alertAudioRef.current.currentTime = 0
      await alertAudioRef.current.play()
      setSoundEnabled(true)
    } catch {
      setMessage('Chrome bloqueó el sonido. Volvé a tocar Activar sonido.')
    }
  }

  async function setStatus(orderId: string, order_status: string) {
    setMessage('')

    const { error } = await supabase
      .from('orders')
      .update({ order_status, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (error) {
      setMessage(error.message)
      return
    }

    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, order_status } : o))
    )

    if (selected?.id === orderId) {
      setSelected({ ...selected, order_status })
    }
  }

  async function assignCourier(orderId: string, courierId: string) {
    setMessage('')

    const { error } = await supabase
      .from('orders')
      .update({ courier_id: courierId || null })
      .eq('id', orderId)

    if (error) {
      setMessage(error.message)
      return
    }

    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, courier_id: courierId || null } : o))
    )
  }

  async function assignDeliveryZone(orderId: string, deliveryZoneId: string) {
    if (!deliveryZoneId) return

    setMessage('')

    const { data, error } = await supabase.rpc('assign_delivery_zone_v1', {
      p_order_id: orderId,
      p_delivery_zone_id: deliveryZoneId,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    const updated = data || {}

    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? {
              ...o,
              delivery_zone_id: deliveryZoneId,
              delivery_fee: Number(updated.delivery_fee || 0),
              total: Number(updated.total || o.subtotal),
              estimated_minutes: Number(updated.estimated_minutes || o.estimated_minutes || 0),
            }
          : o
      )
    )

    if (selected?.id === orderId) {
      setSelected({
        ...selected,
        delivery_zone_id: deliveryZoneId,
        delivery_fee: Number(updated.delivery_fee || 0),
        total: Number(updated.total || selected.subtotal),
        estimated_minutes: Number(updated.estimated_minutes || selected.estimated_minutes || 0),
      })
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/panel/login'
  }

  const visibleOrders = orders.filter(o => o.order_status !== 'cancelled')

  async function openZoneEditor() {
    setZoneEditorMessage('')

    const { data, error } = await supabase
      .from('delivery_zones')
      .select('id, name, delivery_fee, estimated_minutes')
      .eq('business_id', businessId)
      .order('delivery_fee')
      .order('name')

    if (error) {
      setZoneEditorMessage(error.message)
      setEditableZones(deliveryZones)
    } else {
      setEditableZones((data || []) as DeliveryZone[])
    }

    setZoneEditorOpen(true)
  }

  function patchEditableZone(id: string, patch: Partial<DeliveryZone>) {
    setEditableZones(prev =>
      prev.map(zone => (zone.id === id ? { ...zone, ...patch } : zone))
    )
  }

  async function saveEditableZone(zone: DeliveryZone) {
    setZoneEditorMessage('')

    const fee = Number(zone.delivery_fee)
    const minutes = Number(zone.estimated_minutes || 0)

    if (!zone.name.trim()) {
      setZoneEditorMessage('La zona necesita un nombre.')
      return
    }

    if (!Number.isFinite(fee) || fee < 0) {
      setZoneEditorMessage('Costo inválido.')
      return
    }

    if (!Number.isFinite(minutes) || minutes < 0) {
      setZoneEditorMessage('Minutos inválidos.')
      return
    }

    const { error } = await supabase
      .from('delivery_zones')
      .update({
        name: zone.name.trim(),
        delivery_fee: fee,
        estimated_minutes: Math.round(minutes),
      })
      .eq('id', zone.id)
      .eq('business_id', businessId)

    if (error) {
      setZoneEditorMessage(error.message)
      return
    }

    setZoneEditorMessage(`Guardado: ${zone.name}`)
  }


  async function openOrderHistory() {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryMessage('')

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      setHistoryMessage(error.message)
      setHistoryLoading(false)
      return
    }

    setHistoryOrders((data || []) as Order[])
    setHistoryLoading(false)
  }

  function filteredHistoryOrders() {
    const q = historySearch.trim().toLowerCase()
    if (!q) return historyOrders

    return historyOrders.filter(order => {
      const fields = [
        String(order.order_number || ''),
        order.customer_name || '',
        order.customer_phone || '',
        order.fulfillment_type || '',
        order.payment_method || '',
        order.order_status || '',
      ]

      return fields.some(field => String(field).toLowerCase().includes(q))
    })
  }

  async function openDailySummary() {
    setDailySummaryOpen(true)
    setDailySummaryLoading(true)
    setDailySummaryMessage('')

    const now = new Date()
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    )

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, total, delivery_fee, payment_method, payment_status, order_status, created_at'
      )
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      setDailySummaryMessage(error.message)
      setDailySummaryLoading(false)
      return
    }

    const valid = (data || []).filter(
      order => order.order_status !== 'cancelled'
    )

    const summary = valid.reduce(
      (acc, order) => {
        const total = Number(order.total || 0)
        const deliveryFee = Number(order.delivery_fee || 0)

        acc.orders += 1
        acc.total += total
        acc.delivery += deliveryFee

        if (order.payment_method === 'efectivo') acc.cash += total
        if (order.payment_method === 'transferencia') acc.transfer += total
        if (order.payment_method === 'billetera') acc.wallet += total
        if (order.payment_method === 'tarjeta') acc.card += total

        return acc
      },
      {
        orders: 0,
        total: 0,
        delivery: 0,
        cash: 0,
        transfer: 0,
        wallet: 0,
        card: 0,
      }
    )

    setDailySummary(summary)
    setDailySummaryLoading(false)
  }

  function printKitchenTicket(order: Order) {
    const popup = window.open('', '_blank', 'width=420,height=720')

    if (!popup) {
      setMessage('Chrome bloqueó la ventana de impresión.')
      return
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')

    const itemsHtml = (order.order_items || [])
      .map(
        item => `
          <div class="item">
            <div class="itemName">
              <b>${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name_snapshot)}</b>
            </div>
            ${
              item.notes
                ? `<div class="itemNotes">OBS: ${escapeHtml(item.notes)}</div>`
                : ''
            }
          </div>
        `
      )
      .join('')

    const modeHtml =
      order.fulfillment_type === 'delivery'
        ? `
            <div><b>DELIVERY</b></div>
            <div>${escapeHtml(order.address || 'Dirección pendiente')}</div>
          `
        : `<div><b>RETIRO EN EL LOCAL</b></div>`

    const generalNotes = order.notes
      ? `<div class="generalNotes"><b>OBSERVACIONES:</b><br>${escapeHtml(
          order.notes
        )}</div>`
      : ''

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Pedido #${escapeHtml(order.order_number)}</title>
          <style>
            @page { margin: 8mm; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              width: 72mm;
              margin: 0 auto;
              font-size: 14px;
            }
            h1 {
              font-size: 22px;
              text-align: center;
              margin: 0 0 8px;
            }
            .orderNo {
              font-size: 28px;
              font-weight: 900;
              text-align: center;
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
              padding: 8px 0;
              margin-bottom: 10px;
            }
            .meta {
              line-height: 1.45;
              margin-bottom: 10px;
            }
            .items {
              border-top: 2px dashed #000;
              border-bottom: 2px dashed #000;
              padding: 6px 0;
            }
            .item {
              padding: 7px 0;
              border-bottom: 1px dotted #777;
            }
            .item:last-child {
              border-bottom: 0;
            }
            .itemName {
              font-size: 17px;
            }
            .itemNotes,
            .generalNotes {
              margin-top: 5px;
              font-size: 15px;
              font-weight: 700;
            }
            .generalNotes {
              border: 2px solid #000;
              padding: 8px;
              margin-top: 10px;
            }
            .footer {
              text-align: center;
              margin-top: 12px;
              font-size: 12px;
            }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>BLACK BULL</h1>
          <div class="orderNo">PEDIDO #${escapeHtml(order.order_number)}</div>

          <div class="meta">
            <div><b>${escapeHtml(order.customer_name || 'SIN NOMBRE')}</b></div>
            <div>Tel: ${escapeHtml(order.customer_phone || '-')}</div>
            <div>${escapeHtml(
              new Date(order.created_at).toLocaleString('es-AR')
            )}</div>
            ${modeHtml}
          </div>

          <div class="items">
            ${itemsHtml || '<div>Sin productos</div>'}
          </div>

          ${generalNotes}

          <div class="footer">Ticket de cocina</div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `

    popup.document.open()
    popup.document.write(html)
    popup.document.close()
  }

  async function openOrderDetail(order: Order) {
    setSelected(order)
    setSelectedPayment(null)
    setReceiptSignedUrl('')
    setPaymentActionMessage('')

    if (order.payment_method !== 'transferencia') return

    const { data: paymentRow, error } = await supabase
      .from('payments')
      .select('id, status, receipt_url')
      .eq('order_id', order.id)
      .maybeSingle()

    if (error || !paymentRow) return

    setSelectedPayment(paymentRow)

    if (paymentRow.receipt_url) {
      const { data: signed } = await supabase.storage
        .from('payment-receipts')
        .createSignedUrl(paymentRow.receipt_url, 600)

      if (signed?.signedUrl) {
        setReceiptSignedUrl(signed.signedUrl)
      }
    }
  }

  async function decidePayment(orderId: string, nextStatus: 'confirmed' | 'rejected') {
    setPaymentActionMessage('')

    const { data: response, error } = await supabase.rpc(
      'confirm_order_payment_v1',
      {
        p_order_id: orderId,
        p_status: nextStatus,
      }
    )

    if (error) {
      setPaymentActionMessage(error.message)
      return
    }

    if (!response?.ok) {
      setPaymentActionMessage(response?.message || 'No se pudo actualizar el pago.')
      return
    }

    const orderPaymentStatus =
      nextStatus === 'confirmed' ? 'confirmed' : 'rejected'

    setOrders(prev =>
      prev.map(order =>
        order.id === orderId
          ? { ...order, payment_status: orderPaymentStatus }
          : order
      )
    )

    if (selected?.id === orderId) {
      setSelected({ ...selected, payment_status: orderPaymentStatus })
    }

    if (selectedPayment) {
      setSelectedPayment({ ...selectedPayment, status: nextStatus })
    }

    setPaymentActionMessage(
      nextStatus === 'confirmed' ? 'Pago confirmado.' : 'Pago rechazado.'
    )
  }

  async function openPaymentSettings() {
    setPaymentSettingsMessage('')

    const { data, error } = await supabase
      .from('business_settings')
      .select(
        'cash_enabled, transfer_enabled, wallet_enabled, card_enabled, transfer_alias, transfer_holder'
      )
      .eq('business_id', businessId)
      .single()

    if (error) {
      setPaymentSettingsMessage(error.message)
    } else if (data) {
      setPaymentSettings({
        cash_enabled: !!data.cash_enabled,
        transfer_enabled: !!data.transfer_enabled,
        wallet_enabled: !!data.wallet_enabled,
        card_enabled: !!data.card_enabled,
        transfer_alias: data.transfer_alias || '',
        transfer_holder: data.transfer_holder || '',
      })
    }

    setPaymentSettingsOpen(true)
  }

  async function savePaymentSettings() {
    setPaymentSettingsMessage('')

    const { error } = await supabase
      .from('business_settings')
      .update({
        cash_enabled: paymentSettings.cash_enabled,
        transfer_enabled: paymentSettings.transfer_enabled,
        wallet_enabled: paymentSettings.wallet_enabled,
        card_enabled: paymentSettings.card_enabled,
        transfer_alias: paymentSettings.transfer_alias.trim() || null,
        transfer_holder: paymentSettings.transfer_holder.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)

    if (error) {
      setPaymentSettingsMessage(error.message)
      return
    }

    setPaymentSettingsMessage('Métodos de pago guardados.')
  }


  return (
    <main className="ownerPanelPage">
      <header className="ownerTopbar">
        <div>
          <span className="badge">BLACK BULL</span>
          <h1>Pedidos</h1>
          <p>Hola, {userName}</p>
        </div>

        <button className="panelSecondaryButton" onClick={logout}>
          Cerrar sesión
        </button>
      </header>

      {message ? <div className="panelError">{message}</div> : null}

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <a
          href="/panel/productos"
          className="panelSecondaryButton"
          style={{ textDecoration: 'none' }}
        >
          🍔 Productos y precios
        </a>

        <button
          type="button"
          className="panelSecondaryButton"
          onClick={openZoneEditor}
        >
          🚚 Zonas de delivery
        </button>

        <button
          type="button"
          className="panelSecondaryButton"
          onClick={openPaymentSettings}
        >
          💳 Métodos de pago
        </button>

        <button
          type="button"
          className="panelSecondaryButton"
          onClick={openDailySummary}
        >
          📊 Resumen diario / caja
        </button>

        <button
          type="button"
          className="panelSecondaryButton"
          onClick={openOrderHistory}
        >
          🔎 Historial de pedidos
        </button>

        <button
          type="button"
          className="panelSecondaryButton"
          onClick={enableSound}
        >
          {soundEnabled ? '🔊 Sonido activado' : '🔔 Activar sonido'}
        </button>
      </div>

      <div style={{ display: 'none' }}>
        <button
          type="button"
          className="panelSecondaryButton"
          onClick={enableSound}
        >
          {soundEnabled ? '🔊 Sonido activado' : '🔔 Activar sonido'}
        </button>
      </div>

      <section className="kanban">
        {columns.map(column => {
          const columnOrders = visibleOrders.filter(o => {
            if (column.key === 'new') {
              return o.order_status === 'new' || o.order_status === 'accepted'
            }
            return o.order_status === column.key
          })

          return (
            <div className="kanbanColumn" key={column.key}>
              <div className="kanbanHeader">
                <b>{column.label}</b>
                <span>{columnOrders.length}</span>
              </div>

              <div className="kanbanList">
                {columnOrders.map(order => (
                  <article className="orderCard" key={order.id}>
                    <button
                      className="orderCardMain"
                      onClick={() => openOrderDetail(order)}
                    >
                      <div className="orderCardTitle">
                        <b>#{order.order_number}</b>
                        <span>{time(order.created_at)}</span>
                      </div>

                      <strong>{order.customer_name}</strong>
                      <small>
                        {order.fulfillment_type === 'delivery'
                          ? 'DELIVERY'
                          : 'RETIRO'}
                      </small>

                      <div className="orderCardBottom">
                        <b>{money(order.total)}</b>
                        <span>{order.payment_method}</span>
                      </div>

                      {order.fulfillment_type === 'delivery' && !order.delivery_zone_id ? (
                        <small><b>ENVÍO PENDIENTE</b></small>
                      ) : null}
                    </button>

                    {column.key === 'new' ? (
                      <button
                        className="statusButton"
                        onClick={() => setStatus(order.id, 'preparing')}
                      >
                        Preparar
                      </button>
                    ) : null}

                    {column.key === 'preparing' ? (
                      <button
                        className="statusButton"
                        onClick={() => setStatus(order.id, 'ready')}
                      >
                        Marcar listo
                      </button>
                    ) : null}

                    {column.key === 'ready' &&
                    order.fulfillment_type === 'pickup' ? (
                      <button
                        className="statusButton"
                        onClick={() => setStatus(order.id, 'delivered')}
                      >
                        Entregado
                      </button>
                    ) : null}

                    {column.key === 'ready' &&
                    order.fulfillment_type === 'delivery' ? (
                      <>
                        <select
                          className="courierSelect"
                          value={order.courier_id || ''}
                          onChange={e => assignCourier(order.id, e.target.value)}
                        >
                          <option value="">Asignar cadete</option>
                          {couriers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        <button
                          className="statusButton"
                          disabled={!order.courier_id}
                          onClick={() => setStatus(order.id, 'on_the_way')}
                        >
                          En camino
                        </button>
                      </>
                    ) : null}

                    {column.key === 'on_the_way' ? (
                      <button
                        className="statusButton"
                        onClick={() => setStatus(order.id, 'delivered')}
                      >
                        Entregado
                      </button>
                    ) : null}
                  </article>
                ))}

                {columnOrders.length === 0 ? (
                  <div className="emptyColumn">Sin pedidos</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </section>

      {historyOpen ? (
        <div
          className="orderModalBackdrop"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="orderModal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 820 }}
          >
            <button
              className="modalClose"
              onClick={() => setHistoryOpen(false)}
            >
              ×
            </button>

            <h2>Historial de pedidos</h2>

            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Buscar por N° de pedido, cliente, teléfono, estado o pago"
              style={{
                width: '100%',
                padding: 11,
                margin: '8px 0 14px',
                border: '1px solid #ddd',
                borderRadius: 10,
              }}
            />

            {historyMessage ? <p>{historyMessage}</p> : null}

            {historyLoading ? (
              <p>Cargando historial...</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {filteredHistoryOrders().map(order => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => {
                      setHistoryOpen(false)
                      openOrderDetail(order)
                    }}
                    style={{
                      textAlign: 'left',
                      border: '1px solid #e5e5e5',
                      borderRadius: 12,
                      padding: 12,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>#{order.order_number}</strong>
                      <span>
                        {new Date(order.created_at).toLocaleString('es-AR')}
                      </span>
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <b>{order.customer_name || 'Sin nombre'}</b>
                      {' · '}
                      {order.customer_phone || 'Sin teléfono'}
                    </div>

                    <div style={{ marginTop: 4 }}>
                      {order.fulfillment_type === 'delivery'
                        ? 'DELIVERY'
                        : 'RETIRO'}
                      {' · '}
                      {order.payment_method}
                      {' · '}
                      {order.order_status}
                    </div>

                    <div style={{ marginTop: 6, fontWeight: 800 }}>
                      {money(Number(order.total || 0))}
                    </div>
                  </button>
                ))}

                {filteredHistoryOrders().length === 0 ? (
                  <p>No se encontraron pedidos.</p>
                ) : null}
              </div>
            )}

            <button
              type="button"
              className="panelPrimaryButton"
              style={{ marginTop: 14 }}
              onClick={openOrderHistory}
            >
              Actualizar historial
            </button>
          </div>
        </div>
      ) : null}

      {dailySummaryOpen ? (
        <div
          className="orderModalBackdrop"
          onClick={() => setDailySummaryOpen(false)}
        >
          <div className="orderModal" onClick={e => e.stopPropagation()}>
            <button
              className="modalClose"
              onClick={() => setDailySummaryOpen(false)}
            >
              ×
            </button>

            <h2>Resumen diario / caja</h2>
            <p>
              {new Date().toLocaleDateString('es-AR', {
                weekday: 'long',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </p>

            {dailySummaryMessage ? <p>{dailySummaryMessage}</p> : null}

            {dailySummaryLoading ? (
              <p>Cargando resumen...</p>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <div className="modalItem">
                    <small>Pedidos de hoy</small>
                    <h3>{dailySummary.orders}</h3>
                  </div>

                  <div className="modalItem">
                    <small>Total vendido</small>
                    <h3>{money(dailySummary.total)}</h3>
                  </div>

                  <div className="modalItem">
                    <small>Efectivo</small>
                    <h3>{money(dailySummary.cash)}</h3>
                  </div>

                  <div className="modalItem">
                    <small>Transferencias</small>
                    <h3>{money(dailySummary.transfer)}</h3>
                  </div>

                  <div className="modalItem">
                    <small>Mercado Pago / billetera</small>
                    <h3>{money(dailySummary.wallet)}</h3>
                  </div>

                  <div className="modalItem">
                    <small>Tarjeta</small>
                    <h3>{money(dailySummary.card)}</h3>
                  </div>

                  <div className="modalItem">
                    <small>Delivery cobrado</small>
                    <h3>{money(dailySummary.delivery)}</h3>
                  </div>
                </div>

                <p style={{ marginTop: 14, color: '#666' }}>
                  No se cuentan pedidos cancelados.
                </p>

                <button
                  type="button"
                  className="panelPrimaryButton"
                  onClick={openDailySummary}
                >
                  Actualizar resumen
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {paymentSettingsOpen ? (
        <div
          className="orderModalBackdrop"
          onClick={() => setPaymentSettingsOpen(false)}
        >
          <div className="orderModal" onClick={e => e.stopPropagation()}>
            <button
              className="modalClose"
              onClick={() => setPaymentSettingsOpen(false)}
            >
              ×
            </button>

            <h2>Métodos de pago</h2>

            {paymentSettingsMessage ? <p>{paymentSettingsMessage}</p> : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 12,
                  border: '1px solid #eee',
                  borderRadius: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={paymentSettings.cash_enabled}
                  onChange={e =>
                    setPaymentSettings(prev => ({
                      ...prev,
                      cash_enabled: e.target.checked,
                    }))
                  }
                />
                Efectivo
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 12,
                  border: '1px solid #eee',
                  borderRadius: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={paymentSettings.transfer_enabled}
                  onChange={e =>
                    setPaymentSettings(prev => ({
                      ...prev,
                      transfer_enabled: e.target.checked,
                    }))
                  }
                />
                Transferencia
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 12,
                  border: '1px solid #eee',
                  borderRadius: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={paymentSettings.wallet_enabled}
                  onChange={e =>
                    setPaymentSettings(prev => ({
                      ...prev,
                      wallet_enabled: e.target.checked,
                    }))
                  }
                />
                Mercado Pago / billetera
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 12,
                  border: '1px solid #eee',
                  borderRadius: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={paymentSettings.card_enabled}
                  onChange={e =>
                    setPaymentSettings(prev => ({
                      ...prev,
                      card_enabled: e.target.checked,
                    }))
                  }
                />
                Tarjeta
              </label>
            </div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label>
                Alias de transferencia
                <input
                  value={paymentSettings.transfer_alias}
                  onChange={e =>
                    setPaymentSettings(prev => ({
                      ...prev,
                      transfer_alias: e.target.value,
                    }))
                  }
                  placeholder="Ej: BLACKBULL.PEDIDOS"
                  style={{ width: '100%', padding: 10, marginTop: 5 }}
                />
              </label>

              <label>
                Titular
                <input
                  value={paymentSettings.transfer_holder}
                  onChange={e =>
                    setPaymentSettings(prev => ({
                      ...prev,
                      transfer_holder: e.target.value,
                    }))
                  }
                  placeholder="Nombre del titular"
                  style={{ width: '100%', padding: 10, marginTop: 5 }}
                />
              </label>
            </div>

            <button
              type="button"
              className="panelPrimaryButton"
              onClick={savePaymentSettings}
            >
              Guardar métodos de pago
            </button>
          </div>
        </div>
      ) : null}

      {zoneEditorOpen ? (
        <div
          className="orderModalBackdrop"
          onClick={() => setZoneEditorOpen(false)}
        >
          <div className="orderModal" onClick={e => e.stopPropagation()}>
            <button
              className="modalClose"
              onClick={() => setZoneEditorOpen(false)}
            >
              ×
            </button>

            <h2>Zonas de delivery</h2>

            {zoneEditorMessage ? <p>{zoneEditorMessage}</p> : null}

            <div className="modalItems">
              {editableZones.map(zone => (
                <div
                  key={zone.id}
                  className="modalItem"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr auto',
                    gap: 10,
                    alignItems: 'end',
                  }}
                >
                  <label>
                    Zona
                    <input
                      value={zone.name}
                      onChange={e =>
                        patchEditableZone(zone.id, { name: e.target.value })
                      }
                      style={{ width: '100%', padding: 9, marginTop: 4 }}
                    />
                  </label>

                  <label>
                    Costo
                    <input
                      value={String(zone.delivery_fee)}
                      inputMode="decimal"
                      onChange={e =>
                        patchEditableZone(zone.id, {
                          delivery_fee: e.target.value,
                        })
                      }
                      style={{ width: '100%', padding: 9, marginTop: 4 }}
                    />
                  </label>

                  <label>
                    Minutos
                    <input
                      value={String(zone.estimated_minutes || '')}
                      inputMode="numeric"
                      onChange={e =>
                        patchEditableZone(zone.id, {
                          estimated_minutes: Number(e.target.value),
                        })
                      }
                      style={{ width: '100%', padding: 9, marginTop: 4 }}
                    />
                  </label>

                  <button
                    type="button"
                    className="panelPrimaryButton"
                    onClick={() => saveEditableZone(zone)}
                  >
                    Guardar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="orderModalBackdrop" onClick={() => setSelected(null)}>
          <div className="orderModal" onClick={e => e.stopPropagation()}>
            <button
              className="modalClose"
              onClick={() => setSelected(null)}
            >
              ×
            </button>

            <h2>Pedido #{selected.order_number}</h2>

            <button
              type="button"
              className="panelPrimaryButton"
              onClick={() => printKitchenTicket(selected)}
              style={{ marginBottom: 12 }}
            >
              🧾 Imprimir ticket cocina
            </button>

            <p>
              <b>{selected.customer_name}</b> · {selected.customer_phone}
            </p>

            <p>
              {selected.fulfillment_type === 'delivery'
                ? `Delivery · ${selected.address || ''}`
                : 'Retiro en el local'}
            </p>

            {selected.fulfillment_type === 'delivery' ? (
              <div className="modalItems">
                <div className="modalItem">
                  <span>Zona / costo de envío</span>
                  <select
                    className="courierSelect"
                    value={selected.delivery_zone_id || ''}
                    onChange={e => assignDeliveryZone(selected.id, e.target.value)}
                  >
                    <option value="">Asignar zona</option>
                    {deliveryZones.map(zone => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} · {money(zone.delivery_fee)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modalItem">
                  <span>Envío</span>
                  <b>{selected.delivery_zone_id ? money(selected.delivery_fee) : 'Pendiente'}</b>
                </div>
              </div>
            ) : null}

            <div className="modalItems">
              {(selected.order_items || []).map(item => (
                <div key={item.id} className="modalItem">
                  <span>
                    {item.quantity} × {item.product_name_snapshot}
                    {item.notes ? <small>{item.notes}</small> : null}
                  </span>
                  <b>{money(item.item_subtotal)}</b>
                </div>
              ))}
            </div>

            <div className="modalTotal">
              <span>Total</span>
              <b>{money(selected.total)}</b>
            </div>

            <p>
              Pago: <b>{selected.payment_method}</b> ·{' '}
              {selected.payment_status}
            </p>

            {selected.payment_method === 'transferencia' ? (
              <div
                style={{
                  border: '1px solid #eee',
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 12,
                }}
              >
                <b>Comprobante de transferencia</b>

                {receiptSignedUrl ? (
                  <p>
                    <a
                      href={receiptSignedUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 800 }}
                    >
                      📎 Ver comprobante
                    </a>
                  </p>
                ) : (
                  <p style={{ color: '#666' }}>
                    El cliente todavía no adjuntó comprobante.
                  </p>
                )}

                {selected.payment_status === 'to_verify' ? (
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginTop: 10,
                    }}
                  >
                    <button
                      type="button"
                      className="panelPrimaryButton"
                      onClick={() => decidePayment(selected.id, 'confirmed')}
                    >
                      ✅ Confirmar pago
                    </button>

                    <button
                      type="button"
                      className="panelSecondaryButton"
                      onClick={() => decidePayment(selected.id, 'rejected')}
                    >
                      ❌ Rechazar
                    </button>
                  </div>
                ) : null}

                {paymentActionMessage ? <p>{paymentActionMessage}</p> : null}
              </div>
            ) : null}

            {selected.notes ? (
              <p>
                Observaciones: <b>{selected.notes}</b>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
