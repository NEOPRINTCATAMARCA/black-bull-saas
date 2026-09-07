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
    cash_enabled?: boolean
    transfer_enabled?: boolean
    wallet_enabled?: boolean
    card_enabled?: boolean
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

type TrackingData = {
  order_id: string
  order_number: number
  order_status: string
  fulfillment_type: 'pickup' | 'delivery'
  subtotal: number
  delivery_fee: number
  total: number
  estimated_minutes: number
  payment_status?: string | null
}

type PublicBranding = {
  logo_url: string
  primary_color: string
  accent_color: string
  background_color: string
}

type PublicPromotion = {
  id: string
  name: string
  description?: string | null
  promo_price?: number | string | null
  starts_at?: string | null
  ends_at?: string | null
}

type PublicPaymentSettings = {
  cash_enabled: boolean
  transfer_enabled: boolean
  wallet_enabled: boolean
  card_enabled: boolean
  transfer_alias: string
  transfer_holder: string
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
  const [errorMessage, setErrorMessage] = useState('')
  const [tracking, setTracking] = useState<TrackingData | null>(null)
  const [trackingPhone, setTrackingPhone] = useState('')
  const [publicPaymentSettings, setPublicPaymentSettings] =
    useState<PublicPaymentSettings>({
      cash_enabled: data.settings.cash_enabled !== false,
      transfer_enabled: data.settings.transfer_enabled !== false,
      wallet_enabled: data.settings.wallet_enabled !== false,
      card_enabled: data.settings.card_enabled === true,
      transfer_alias: '',
      transfer_holder: '',
    })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptMessage, setReceiptMessage] = useState('')
  const [storeStatus, setStoreStatus] = useState<'open' | 'paused' | 'closed'>('open')
  const [publicPromotions, setPublicPromotions] = useState<PublicPromotion[]>([])
  const [publicBranding, setPublicBranding] = useState<PublicBranding>({
    logo_url: '',
    primary_color: '#111111',
    accent_color: '#f2b705',
    background_color: '#f5f5f5',
  })

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

  function statusLabel(status: string, fulfillment: 'pickup' | 'delivery') {
    if (status === 'new' || status === 'accepted') return 'PEDIDO RECIBIDO'
    if (status === 'preparing') return 'EN PREPARACIÓN'
    if (status === 'ready') {
      return fulfillment === 'pickup' ? 'LISTO PARA RETIRAR' : 'LISTO'
    }
    if (status === 'on_the_way') return 'EN CAMINO'
    if (status === 'delivered') return 'ENTREGADO'
    if (status === 'cancelled') return 'CANCELADO'
    return 'PEDIDO RECIBIDO'
  }

  function statusIndex(status: string, fulfillment: 'pickup' | 'delivery') {
    const normalized = status === 'accepted' ? 'new' : status
    const pickupSteps = ['new', 'preparing', 'ready', 'delivered']
    const deliverySteps = ['new', 'preparing', 'ready', 'on_the_way', 'delivered']
    const steps = fulfillment === 'pickup' ? pickupSteps : deliverySteps
    const index = steps.indexOf(normalized)
    return index < 0 ? 0 : index
  }

  async function refreshTracking(
    orderId: string,
    customerPhone: string,
    silent = false
  ) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!url || !key) return

      const supabase = createClient(url, key)

      const { data: response, error } = await supabase.rpc(
        'get_public_order_tracking_v1',
        {
          p_slug: data.business.slug,
          p_order_id: orderId,
          p_customer_phone: customerPhone,
        }
      )

      if (error) {
        if (!silent) setErrorMessage(error.message)
        return
      }

      if (response?.ok) {
        setTracking(response as TrackingData)
      }
    } catch (err: any) {
      if (!silent) {
        setErrorMessage(err?.message || 'No se pudo actualizar el seguimiento')
      }
    }
  }

  useEffect(() => {
    async function loadBranding() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!url || !key) return

        const supabase = createClient(url, key)

        const { data: response } = await supabase.rpc(
          'get_public_branding_v1',
          { p_slug: data.business.slug }
        )

        if (response?.ok) {
          setPublicBranding({
            logo_url: response.logo_url || '',
            primary_color: response.primary_color || '#111111',
            accent_color: response.accent_color || '#f2b705',
            background_color: response.background_color || '#f5f5f5',
          })
        }
      } catch {
        // Mantiene la identidad visual por defecto.
      }
    }

    loadBranding()
  }, [data.business.slug])

  useEffect(() => {
    async function loadPromotions() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!url || !key) return

        const supabase = createClient(url, key)

        const { data: response } = await supabase.rpc(
          'get_public_promotions_v1',
          { p_slug: data.business.slug }
        )

        if (response?.ok) {
          setPublicPromotions(response.promotions || [])
        }
      } catch {
        // Si falla, el menú sigue funcionando normalmente.
      }
    }

    loadPromotions()
  }, [data.business.slug])

  useEffect(() => {
    let cancelled = false

    async function loadStoreStatus() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!url || !key) return

        const supabase = createClient(url, key)

        const { data: response } = await supabase.rpc(
          'get_public_store_status_v1',
          { p_slug: data.business.slug }
        )

        if (
          !cancelled &&
          response?.ok &&
          ['open', 'paused', 'closed'].includes(response.status)
        ) {
          setStoreStatus(response.status)
        }
      } catch {
        // Mantiene el último estado conocido.
      }
    }

    loadStoreStatus()
    const timer = window.setInterval(loadStoreStatus, 10000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [data.business.slug])

  useEffect(() => {
    async function loadPaymentSettings() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!url || !key) return

        const supabase = createClient(url, key)

        const { data: response } = await supabase.rpc(
          'get_public_payment_settings_v1',
          { p_slug: data.business.slug }
        )

        if (response?.ok) {
          const next: PublicPaymentSettings = {
            cash_enabled: response.cash_enabled !== false,
            transfer_enabled: response.transfer_enabled !== false,
            wallet_enabled: response.wallet_enabled !== false,
            card_enabled: response.card_enabled === true,
            transfer_alias: response.transfer_alias || '',
            transfer_holder: response.transfer_holder || '',
          }

          setPublicPaymentSettings(next)

          const enabledValues = [
            next.cash_enabled ? 'efectivo' : null,
            next.transfer_enabled ? 'transferencia' : null,
            next.wallet_enabled ? 'billetera' : null,
            next.card_enabled ? 'tarjeta' : null,
          ].filter(Boolean) as string[]

          if (!enabledValues.includes(payment) && enabledValues.length > 0) {
            setPayment(enabledValues[0])
          }
        }
      } catch {
        // Si falla esta lectura, quedan los métodos públicos ya cargados.
      }
    }

    loadPaymentSettings()
  }, [data.business.slug])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `black-bull-last-order-${data.business.slug}`
      )

      if (!raw) return

      const saved = JSON.parse(raw)

      if (saved?.order_id && saved?.phone) {
        setTrackingPhone(saved.phone)
        refreshTracking(saved.order_id, saved.phone, true)
      }
    } catch {
      // Si el navegador no tiene un pedido guardado, no hacemos nada.
    }
  }, [data.business.slug])

  useEffect(() => {
    if (!tracking?.order_id || !trackingPhone) return

    const timer = window.setInterval(() => {
      refreshTracking(tracking.order_id, trackingPhone, true)
    }, 4000)

    return () => window.clearInterval(timer)
  }, [tracking?.order_id, trackingPhone])

  function clearTracking() {
    window.localStorage.removeItem(
      `black-bull-last-order-${data.business.slug}`
    )
    setTracking(null)
    setTrackingPhone('')
    setResult(null)
  }

  async function uploadPaymentReceipt() {
    if (!result?.order_id || !receiptFile || receiptUploading) return

    if (payment !== 'transferencia') return

    if (receiptFile.size > 8 * 1024 * 1024) {
      setReceiptMessage('El comprobante no puede superar 8 MB.')
      return
    }

    setReceiptUploading(true)
    setReceiptMessage('')

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!url || !key) throw new Error('Falta conexión con Supabase')

      const supabase = createClient(url, key)

      const originalExt =
        receiptFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
        'jpg'

      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(originalExt)
        ? originalExt
        : 'jpg'

      const objectPath = `${result.order_id}/${crypto.randomUUID()}.${safeExt}`

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(objectPath, receiptFile, {
          cacheControl: '3600',
          contentType: receiptFile.type || undefined,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: attachResponse, error: attachError } = await supabase.rpc(
        'attach_public_payment_receipt_v1',
        {
          p_slug: data.business.slug,
          p_order_id: result.order_id,
          p_customer_phone: phone.trim(),
          p_receipt_path: objectPath,
        }
      )

      if (attachError) throw attachError

      if (!attachResponse?.ok) {
        throw new Error(attachResponse?.message || 'No se pudo vincular el comprobante')
      }

      setReceiptMessage('Comprobante enviado. Pago a verificar.')
      setReceiptFile(null)

      if (tracking) {
        setTracking({ ...tracking, payment_status: 'to_verify' })
      }

      await refreshTracking(result.order_id, phone.trim(), true)
    } catch (err: any) {
      setReceiptMessage(err?.message || 'No se pudo enviar el comprobante')
    } finally {
      setReceiptUploading(false)
    }
  }

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
      setCart([])
      setEmpMix({})
      setReceiptFile(null)
      setReceiptMessage('')

      const customerPhone = phone.trim()
      setTrackingPhone(customerPhone)

      if (response?.order_id) {
        window.localStorage.setItem(
          `black-bull-last-order-${data.business.slug}`,
          JSON.stringify({
            order_id: response.order_id,
            order_number: response.order_number,
            phone: customerPhone,
          })
        )

        await refreshTracking(response.order_id, customerPhone, true)
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'No se pudo guardar el pedido')
    } finally {
      setSending(false)
    }
  }

  const isEmpanadas =
    selectedCategory?.name.toUpperCase() === 'EMPANADAS'

  return (
    <main
      className="menuPage"
      style={{ background: publicBranding.background_color }}
    >
      <style>{`
        .categoryBtn.active,
        .segmented button.active,
        .addButton,
        .confirmButton,
        .confirmMix {
          background: ${publicBranding.primary_color} !important;
        }
        .badge {
          background: ${publicBranding.accent_color} !important;
          color: #111 !important;
        }
        @media (max-width: 820px) {
          .hero > div {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 560px) {
          .hero {
            padding: 20px !important;
          }
          .hero > div > div:first-child {
            flex-direction: column;
            align-items: flex-start !important;
          }
        }
      `}</style>

      <section
        className="hero card"
        style={{
          borderTop: `6px solid ${publicBranding.primary_color}`,
          padding: '28px 30px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(260px, .65fr)',
            gap: 28,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            {publicBranding.logo_url ? (
              <div
                style={{
                  width: 132,
                  height: 132,
                  flex: '0 0 132px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: publicBranding.background_color,
                  display: 'grid',
                  placeItems: 'center',
                  border: '1px solid rgba(0,0,0,.08)',
                }}
              >
                <img
                  src={publicBranding.logo_url}
                  alt={`Logo ${data.business.name}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            ) : null}

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  color: '#666',
                }}
              >
                Lomos · pedidos online
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(36px, 5vw, 58px)',
                  lineHeight: 1,
                  letterSpacing: '-.03em',
                }}
              >
                {data.business.name}
              </h1>

              <p
                style={{
                  margin: '12px 0 0',
                  maxWidth: 620,
                  fontSize: 17,
                  lineHeight: 1.5,
                  color: '#444',
                }}
              >
                {data.settings.chatbot_greeting}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 10,
              justifySelf: 'stretch',
            }}
          >
            <div
              style={{
                border: '1px solid rgba(0,0,0,.08)',
                borderRadius: 14,
                padding: '12px 14px',
                background: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: '#777',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  fontWeight: 800,
                }}
              >
                Estado
              </div>
              <div style={{ marginTop: 4, fontWeight: 900, fontSize: 17 }}>
                {storeStatus === 'open'
                  ? '🟢 Abierto'
                  : storeStatus === 'paused'
                  ? '⏸ Pedidos pausados'
                  : '🔴 Cerrado'}
              </div>
            </div>

            <div
              style={{
                border: '1px solid rgba(0,0,0,.08)',
                borderRadius: 14,
                padding: '12px 14px',
                background: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: '#777',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  fontWeight: 800,
                }}
              >
                Modalidad
              </div>
              <div style={{ marginTop: 4, fontWeight: 900, fontSize: 17 }}>
                Retiro · Delivery
              </div>
            </div>

            {publicPromotions.length > 0 ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: '12px 14px',
                  background: publicBranding.accent_color,
                  color: '#111',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    fontWeight: 900,
                  }}
                >
                  Promo destacada
                </div>
                <div style={{ marginTop: 4, fontWeight: 900, fontSize: 17 }}>
                  {publicPromotions[0].name}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {publicPromotions.length > 0 ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>🎯 Promociones</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {publicPromotions.map(promo => (
              <div
                key={promo.id}
                style={{
                  border: '1px solid #e5e5e5',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <b>{promo.name}</b>

                {promo.description ? <p>{promo.description}</p> : null}

                {promo.promo_price !== null &&
                promo.promo_price !== undefined ? (
                  <strong>{money(promo.promo_price)}</strong>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
              {publicPaymentSettings.cash_enabled ? (
                <option value="efectivo">Efectivo</option>
              ) : null}
              {publicPaymentSettings.transfer_enabled ? (
                <option value="transferencia">Transferencia</option>
              ) : null}
              {publicPaymentSettings.wallet_enabled ? (
                <option value="billetera">Mercado Pago / billetera</option>
              ) : null}
              {publicPaymentSettings.card_enabled ? (
                <option value="tarjeta">Tarjeta</option>
              ) : null}
            </select>

            {payment === 'transferencia' ? (
              <div className="successBox" style={{ marginTop: 10 }}>
                <b>Pago por transferencia</b>
                {publicPaymentSettings.transfer_alias ? (
                  <p>
                    Alias: <strong>{publicPaymentSettings.transfer_alias}</strong>
                  </p>
                ) : null}
                {publicPaymentSettings.transfer_holder ? (
                  <p>
                    Titular: <strong>{publicPaymentSettings.transfer_holder}</strong>
                  </p>
                ) : null}
                <p>
                  Confirmá el pedido y después adjuntá el comprobante para verificar el pago.
                </p>
              </div>
            ) : null}

            {storeStatus !== 'open' ? (
              <div className="successBox" style={{ marginTop: 10 }}>
                <b>
                  {storeStatus === 'paused'
                    ? '⏸ Pedidos pausados'
                    : '🔴 Local cerrado'}
                </b>
                <p>
                  {storeStatus === 'paused'
                    ? 'BLACK BULL pausó temporalmente la recepción de pedidos.'
                    : 'BLACK BULL no está recibiendo pedidos en este momento.'}
                </p>
              </div>
            ) : null}

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
            disabled={!canConfirm || sending || storeStatus !== 'open'}
            onClick={confirmOrder}
          >
            {sending
              ? 'Guardando pedido...'
              : storeStatus === 'paused'
              ? 'Pedidos pausados'
              : storeStatus === 'closed'
              ? 'Local cerrado'
              : 'Confirmar pedido'}
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
                <p>El costo de envío se confirmará desde BLACK BULL.</p>
              ) : (
                <p>Total confirmado: {money(result.total)}</p>
              )}
              <p>
                Tiempo estimado inicial: aproximadamente {result.estimated_minutes} min.
              </p>
            </div>
          ) : null}

          {result && payment === 'transferencia' ? (
            <div className="successBox">
              <b>📎 Enviar comprobante</b>
              <p>
                Una vez realizada la transferencia, adjuntá el comprobante para que BLACK BULL pueda verificar tu pago.
              </p>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              />

              {receiptFile ? (
                <p>
                  Archivo: <strong>{receiptFile.name}</strong>
                </p>
              ) : null}

              <button
                className="confirmButton"
                type="button"
                disabled={!receiptFile || receiptUploading}
                onClick={uploadPaymentReceipt}
              >
                {receiptUploading ? 'Enviando comprobante...' : '📎 Adjuntar comprobante'}
              </button>

              {receiptMessage ? <p>{receiptMessage}</p> : null}
            </div>
          ) : null}

          {tracking ? (
            <div className="successBox">
              <b>Seguimiento del pedido #{tracking.order_number}</b>

              <p>
                Estado actual:{' '}
                <strong>
                  {statusLabel(
                    tracking.order_status,
                    tracking.fulfillment_type
                  )}
                </strong>
              </p>

              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {(tracking.fulfillment_type === 'delivery'
                  ? [
                      ['new', 'RECIBIDO'],
                      ['preparing', 'EN PREPARACIÓN'],
                      ['ready', 'LISTO'],
                      ['on_the_way', 'EN CAMINO'],
                      ['delivered', 'ENTREGADO'],
                    ]
                  : [
                      ['new', 'RECIBIDO'],
                      ['preparing', 'EN PREPARACIÓN'],
                      ['ready', 'LISTO PARA RETIRAR'],
                      ['delivered', 'ENTREGADO'],
                    ]
                ).map(([status, label], index) => {
                  const current = statusIndex(
                    tracking.order_status,
                    tracking.fulfillment_type
                  )
                  const done = index <= current

                  return (
                    <div
                      key={status}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        opacity: done ? 1 : 0.45,
                      }}
                    >
                      <span>{done ? '●' : '○'}</span>
                      <span>{label}</span>
                    </div>
                  )
                })}
              </div>

              {tracking.fulfillment_type === 'delivery' ? (
                tracking.delivery_fee > 0 ? (
                  <p style={{ marginTop: 12 }}>
                    Envío: <b>{money(tracking.delivery_fee)}</b> · Total:{' '}
                    <b>{money(tracking.total)}</b>
                  </p>
                ) : (
                  <p style={{ marginTop: 12 }}>
                    Envío: pendiente de confirmación por BLACK BULL.
                  </p>
                )
              ) : (
                <p style={{ marginTop: 12 }}>
                  Total: <b>{money(tracking.total)}</b>
                </p>
              )}

              {tracking.order_status === 'cancelled' ? (
                <p><b>El pedido fue cancelado.</b></p>
              ) : null}

              <button
                className="confirmButton"
                type="button"
                onClick={() =>
                  refreshTracking(
                    tracking.order_id,
                    trackingPhone,
                    false
                  )
                }
              >
                Actualizar estado
              </button>

              <button
                type="button"
                onClick={clearTracking}
                style={{
                  width: '100%',
                  marginTop: 8,
                  padding: 10,
                  cursor: 'pointer',
                }}
              >
                Cerrar seguimiento
              </button>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}
