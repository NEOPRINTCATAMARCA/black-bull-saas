'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'

type Product = {
  id: string
  name: string
  description?: string | null
  price: number | string
  is_available: boolean
  is_sold_out: boolean
}

type Category = {
  id: string
  name: string
  products: Product[]
}

type Zone = {
  id: string
  name: string
  delivery_fee: number | string
  estimated_minutes?: number | null
}

type Data = {
  business: { name: string; slug: string }
  settings: {
    chatbot_greeting?: string | null
    pickup_enabled?: boolean
    delivery_enabled?: boolean
    preparation_minutes?: number
  }
  categories: Category[]
  delivery_zones: Zone[]
}

type CartItem =
  | {
      kind: 'product'
      id: string
      productId: string
      name: string
      price: number
      qty: number
    }
  | {
      kind: 'empanada_mix'
      id: string
      name: string
      price: number
      qty: number
      note: string
      selections: { product_id: string; quantity: number }[]
    }

function money(value: number | string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

export default function OrderClient({ data }: { data: Data }) {
  const firstCategory = data.categories[0]?.id || ''
  const [activeCategory, setActiveCategory] = useState(firstCategory)
  const [cart, setCart] = useState<CartItem[]>([])
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('efectivo')
  const [empMix, setEmpMix] = useState<Record<string, number>>({})
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [tracking, setTracking] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const selectedCategory =
    data.categories.find(c => c.id === activeCategory) || data.categories[0]

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.price * item.qty, 0),
    [cart]
  )

  const deliveryFee = 0
  const total = subtotal

  function addProduct(product: Product) {
    const unitPrice = Number(product.price)

    setCart(prev => {
      const exists = prev.find(
        i => i.kind === 'product' && i.productId === product.id
      )

      if (exists) {
        return prev.map(i =>
          i.kind === 'product' && i.productId === product.id
            ? { ...i, qty: i.qty + 1 }
            : i
        )
      }

      return [
        ...prev,
        {
          kind: 'product',
          id: product.id,
          productId: product.id,
          name: product.name,
          price: unitPrice,
          qty: 1,
        },
      ]
    })
  }

  function changeQty(id: string, delta: number) {
    setCart(prev =>
      prev
        .map(i => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter(i => i.qty > 0)
    )
  }

  function setEmpQty(productId: string, delta: number) {
    setEmpMix(prev => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] || 0) + delta),
    }))
  }

  const empanadaCategory = data.categories.find(
    c => c.name.toUpperCase() === 'EMPANADAS'
  )

  const empCount = Object.values(empMix).reduce((a, b) => a + b, 0)

  const empMixTotal = useMemo(() => {
    if (!empanadaCategory) return 0

    return empanadaCategory.products.reduce((acc, p) => {
      const qty = empMix[p.id] || 0
      const perUnit = Number(p.price) / 6
      return acc + perUnit * qty
    }, 0)
  }, [empMix, empanadaCategory])

  function addEmpanadaMix() {
    if (!empanadaCategory || empCount <= 0) return

    const selections = empanadaCategory.products
      .filter(p => (empMix[p.id] || 0) > 0)
      .map(p => ({
        product_id: p.id,
        quantity: empMix[p.id],
      }))

    const note = empanadaCategory.products
      .filter(p => (empMix[p.id] || 0) > 0)
      .map(p => `${empMix[p.id]} ${p.name}`)
      .join(' + ')

    setCart(prev => [
      ...prev,
      {
        kind: 'empanada_mix',
        id: `mix-${Date.now()}`,
        name: `${empCount} empanada${empCount === 1 ? '' : 's'} surtida${empCount === 1 ? '' : 's'}`,
        price: Math.round(empMixTotal),
        qty: 1,
        note,
        selections,
      },
    ])

    setEmpMix({})
  }

  const canConfirm =
    cart.length > 0 &&
    customerName.trim().length >= 2 &&
    phone.trim().length >= 6 &&
    (mode === 'pickup' || address.trim().length >= 3)

  async function confirmOrder() {
    if (!canConfirm || sending) return

    setSending(true)
    setErrorMessage('')
    setResult(null)

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!url || !key) throw new Error('Falta conexión con Supabase')

      const supabase = createClient(url, key)

      const items = cart.map(item => {
        if (item.kind === 'product') {
          return {
            kind: 'product',
            product_id: item.productId,
            quantity: item.qty,
          }
        }

        return {
          kind: 'empanada_mix',
          selections: item.selections,
        }
      })

      const { data: response, error } = await supabase.rpc(
        'create_public_order_v1',
        {
          p_slug: data.business.slug,
          p_customer_name: customerName.trim(),
          p_customer_phone: phone.trim(),
          p_fulfillment_type: mode,
          p_address: mode === 'delivery' ? address.trim() : null,
          p_delivery_zone_id: null,
          p_payment_method: payment,
          p_notes: notes.trim() || null,
          p_items: items,
        }
      )

      if (error) throw error

      setResult(response)
      setTracking({
        order_id: response.order_id,
        order_number: response.order_number,
        order_status: 'new',
        fulfillment_type: mode,
        delivery_fee: response.delivery_fee,
        total: response.total,
        estimated_minutes: response.estimated_minutes,
      })
      setCart([])
      setEmpMix({})
    } catch (err: any) {
      setErrorMessage(err?.message || 'No se pudo guardar el pedido')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (!tracking?.order_id || !phone.trim()) return

    let cancelled = false

    async function refreshTracking() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!url || !key) return

        const supabase = createClient(url, key)
        const { data: status, error } = await supabase.rpc(
          'get_public_order_tracking_v1',
          {
            p_order_id: tracking.order_id,
            p_customer_phone: phone.trim(),
          }
        )

        if (error || cancelled || !status) return
        setTracking(status)
      } catch {
        // El seguimiento no debe romper el pedido ya confirmado.
      }
    }

    refreshTracking()
    const timer = window.setInterval(refreshTracking, 2500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [tracking?.order_id, phone])

  const trackingSteps = useMemo(() => {
    if (!tracking) return []

    if (tracking.fulfillment_type === 'pickup') {
      return [
        { key: 'new', label: 'PEDIDO RECIBIDO' },
        { key: 'preparing', label: 'EN PREPARACIÓN' },
        { key: 'ready', label: 'LISTO PARA RETIRAR' },
        { key: 'delivered', label: 'ENTREGADO' },
      ]
    }

    return [
      { key: 'new', label: 'PEDIDO RECIBIDO' },
      { key: 'preparing', label: 'EN PREPARACIÓN' },
      { key: 'ready', label: 'LISTO' },
      { key: 'on_the_way', label: 'EN CAMINO' },
      { key: 'delivered', label: 'ENTREGADO' },
    ]
  }, [tracking])

  const normalizedTrackingStatus =
    tracking?.order_status === 'accepted' ? 'new' : tracking?.order_status

  const currentTrackingIndex = Math.max(
    0,
    trackingSteps.findIndex(step => step.key === normalizedTrackingStatus)
  )

  const isEmpanadas =
    selectedCategory?.name.toUpperCase() === 'EMPANADAS'

  return (
    <main className="menuPage">
      <section className="hero card">
        <span className="badge">BLACK BULL · pedidos</span>
        <h1>{data.business.name}</h1>
        <p>{data.settings.chatbot_greeting}</p>
      </section>

      <section className="orderingShell">
        <nav className="categorySidebar card">
          <h2>Categorías</h2>

          <div className="categoryButtons">
            {data.categories.map(category => (
              <button
                key={category.id}
                className={
                  activeCategory === category.id
                    ? 'categoryBtn active'
                    : 'categoryBtn'
                }
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </nav>

        <div className="productsColumn card">
          {selectedCategory ? (
            <>
              <h2 className="sectionTitle">{selectedCategory.name}</h2>

              {isEmpanadas ? (
                <div className="empMixBox">
                  <h3>Armá tus empanadas</h3>
                  <p>
                    Elegí la cantidad que quieras, una por una y mezclando
                    sabores libremente.
                  </p>

                  <div className="empGrid">
                    {selectedCategory.products.map(product => {
                      const disabled =
                        product.is_sold_out || !product.is_available

                      return (
                        <div key={product.id} className="empRow">
                          <div>
                            <b>{product.name}</b>
                            <small>
                              {money(Math.round(Number(product.price) / 6))} c/u
                            </small>
                          </div>

                          <div className="qty">
                            <button
                              disabled={disabled}
                              onClick={() => setEmpQty(product.id, -1)}
                            >
                              -
                            </button>

                            <span>{empMix[product.id] || 0}</span>

                            <button
                              disabled={disabled || empCount >= 50}
                              onClick={() => setEmpQty(product.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="empFooter">
                    <span>
                      Elegidas: <b>{empCount}</b>
                    </span>

                    <span>
                      Total: <b>{money(Math.round(empMixTotal))}</b>
                    </span>
                  </div>

                  <button
                    className="confirmMix"
                    disabled={empCount === 0}
                    onClick={addEmpanadaMix}
                  >
                    Agregar empanadas al carrito
                  </button>
                </div>
              ) : (
                <div className="productGrid">
                  {selectedCategory.products.length === 0 ? (
                    <div className="emptyCategory">
                      <b>Sin productos cargados todavía.</b>
                      <p>
                        El dueño/encargado podrá cargarlos desde su panel.
                      </p>
                    </div>
                  ) : (
                    selectedCategory.products.map(product => {
                      const disabled =
                        product.is_sold_out || !product.is_available

                      return (
                        <article key={product.id} className="productCard">
                          <div>
                            <strong>{product.name}</strong>

                            {product.description ? (
                              <p>{product.description}</p>
                            ) : null}
                          </div>

                          <div className="productBottom">
                            <b>{money(product.price)}</b>

                            <button
                              className="addButton"
                              disabled={disabled}
                              onClick={() => addProduct(product)}
                            >
                              {disabled ? 'Agotado' : 'Agregar'}
                            </button>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        <aside className="card cartPanel">
          <h2>Tu pedido</h2>

          {cart.length === 0 ? (
            <p className="muted">Todavía no agregaste productos.</p>
          ) : (
            <div className="cartList">
              {cart.map(item => (
                <div key={item.id} className="cartRow">
                  <div>
                    <b>{item.name}</b>

                    {item.kind === 'empanada_mix' ? (
                      <small>{item.note}</small>
                    ) : null}

                    <small>{money(item.price)} c/u</small>
                  </div>

                  <div className="qty">
                    <button onClick={() => changeQty(item.id, -1)}>-</button>
                    <span>{item.qty}</span>
                    <button onClick={() => changeQty(item.id, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="formBlock">
            <label>Nombre</label>
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Tu nombre"
            />

            <label>Teléfono</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="383..."
            />

            <label>Modalidad</label>

            <div className="segmented">
              <button
                className={mode === 'pickup' ? 'active' : ''}
                onClick={() => setMode('pickup')}
              >
                Retiro
              </button>

              <button
                className={mode === 'delivery' ? 'active' : ''}
                onClick={() => setMode('delivery')}
              >
                Delivery
              </button>
            </div>

            {mode === 'delivery' && (
              <>
                <label>Dirección de entrega</label>

                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Calle y número"
                />
</>
            )}

            <label>Forma de pago</label>

            <select
              value={payment}
              onChange={e => setPayment(e.target.value)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="billetera">Mercado Pago / billetera</option>
              <option value="tarjeta">Tarjeta</option>
            </select>

            <label>Observaciones</label>

            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Sin cebolla, sin aderezo..."
            />
          </div>

          <div className="totals">
            <div>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>

            <div>
              <span>Envío</span>
              <b>{mode === 'delivery' ? 'A confirmar por BLACK BULL' : money(0)}</b>
            </div>

            <div className="grand">
              <span>{mode === 'delivery' ? 'Subtotal hasta confirmar envío' : 'Total'}</span>
              <b>{money(total)}</b>
            </div>
          </div>

          <button
            className="confirmButton"
            disabled={!canConfirm || sending}
            onClick={confirmOrder}
          >
            {sending ? 'Guardando pedido...' : 'Confirmar pedido'}
          </button>

          {errorMessage ? (
            <div className="errorBox">
              <b>No se pudo guardar.</b>
              <p>{errorMessage}</p>
            </div>
          ) : null}

          {result ? (
            <div className="successBox">
              <b>¡Pedido #{result.order_number} recibido!</b>
              <p>Subtotal confirmado: {money(result.subtotal)}</p>
              {mode === 'delivery' ? (
                <p>Envío: BLACK BULL confirmará la zona y el costo del viaje.</p>
              ) : (
                <p>Total confirmado: {money(result.total)}</p>
              )}
              <p>
                Tiempo estimado inicial: aproximadamente {result.estimated_minutes} min.
              </p>

              {tracking ? (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ marginBottom: 10 }}>Seguimiento del pedido</h3>

                  {tracking.order_status === 'cancelled' ? (
                    <div style={{ fontWeight: 800 }}>PEDIDO CANCELADO</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {trackingSteps.map((step, index) => {
                        const done = index <= currentTrackingIndex
                        const current = index === currentTrackingIndex

                        return (
                          <div
                            key={step.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              fontWeight: current ? 800 : 600,
                              opacity: done ? 1 : 0.45,
                            }}
                          >
                            <span>{done ? '●' : '○'}</span>
                            <span>{step.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {tracking.fulfillment_type === 'delivery' &&
                  Number(tracking.delivery_fee || 0) > 0 ? (
                    <p style={{ marginTop: 12 }}>
                      Envío confirmado: <b>{money(tracking.delivery_fee)}</b> · Total:{' '}
                      <b>{money(tracking.total)}</b>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}
