'use client'

import { useEffect, useMemo, useState } from 'react'
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
        () => {
          window.location.reload()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, supabase])

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
                      onClick={() => setSelected(order)}
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
