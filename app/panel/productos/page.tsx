'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '../../../lib/supabase/browser'

type Category = {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

type Product = {
  id: string
  category_id: string | null
  name: string
  price: number | string
  is_available: boolean
  is_sold_out: boolean
  is_active: boolean
  sort_order: number
}

function money(value: number | string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export default function ProductsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [businessId, setBusinessId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')

  async function loadAll() {
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

    const [{ data: cats, error: catsError }, { data: prods, error: prodsError }] =
      await Promise.all([
        supabase
          .from('categories')
          .select('id, name, sort_order, is_active')
          .eq('business_id', profile.business_id)
          .order('sort_order')
          .order('name'),
        supabase
          .from('products')
          .select(
            'id, category_id, name, price, is_available, is_sold_out, is_active, sort_order'
          )
          .eq('business_id', profile.business_id)
          .order('sort_order')
          .order('name'),
      ])

    if (catsError || prodsError) {
      setMessage(catsError?.message || prodsError?.message || 'Error leyendo datos.')
      setLoading(false)
      return
    }

    setCategories((cats || []) as Category[])
    setProducts((prods || []) as Product[])

    if (!newCategoryId && cats?.length) {
      setNewCategoryId(cats[0].id)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function saveProduct(product: Product) {
    setMessage('')

    const { error } = await supabase
      .from('products')
      .update({
        name: product.name.trim(),
        price: Number(product.price),
        category_id: product.category_id,
        is_available: product.is_available,
        is_sold_out: product.is_sold_out,
        is_active: product.is_active,
      })
      .eq('id', product.id)
      .eq('business_id', businessId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Guardado: ${product.name}`)
  }

  async function addProduct() {
    setMessage('')

    if (!newName.trim()) {
      setMessage('Escribí el nombre del producto.')
      return
    }

    if (!newCategoryId) {
      setMessage('Elegí una categoría.')
      return
    }

    const price = Number(newPrice)

    if (!Number.isFinite(price) || price < 0) {
      setMessage('Ingresá un precio válido.')
      return
    }

    const { error } = await supabase.from('products').insert({
      business_id: businessId,
      category_id: newCategoryId,
      name: newName.trim(),
      price,
      is_available: true,
      is_sold_out: false,
      is_active: true,
      sort_order: 999,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setNewName('')
    setNewPrice('')
    setMessage('Producto agregado.')
    await loadAll()
  }

  function patchProduct(id: string, patch: Partial<Product>) {
    setProducts(prev =>
      prev.map(product =>
        product.id === id ? { ...product, ...patch } : product
      )
    )
  }

  const grouped = categories.map(category => ({
    category,
    products: products.filter(p => p.category_id === category.id),
  }))

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
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
          <h1 style={{ margin: 0, fontSize: 40 }}>Productos y precios</h1>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/panel/horarios"
            style={{
              padding: '12px 18px',
              border: '1px solid #ddd',
              borderRadius: 12,
              textDecoration: 'none',
              color: '#111',
              fontWeight: 700,
            }}
          >
            🕒 Horarios
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

      <section
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 18,
          marginBottom: 24,
          boxShadow: '0 6px 24px rgba(0,0,0,.06)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Agregar producto</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1.4fr auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label>
            Nombre
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ej: Coca Cola 1,5 L"
              style={{ width: '100%', padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Precio
            <input
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              inputMode="decimal"
              placeholder="3500"
              style={{ width: '100%', padding: 10, marginTop: 5 }}
            />
          </label>

          <label>
            Categoría
            <select
              value={newCategoryId}
              onChange={e => setNewCategoryId(e.target.value)}
              style={{ width: '100%', padding: 10, marginTop: 5 }}
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={addProduct}
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

      {loading ? <p>Cargando productos...</p> : null}

      {!loading &&
        grouped.map(({ category, products: categoryProducts }) => (
          <section
            key={category.id}
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 18,
              marginBottom: 18,
              boxShadow: '0 6px 24px rgba(0,0,0,.05)',
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {category.name} <small>({categoryProducts.length})</small>
            </h2>

            {categoryProducts.length === 0 ? (
              <p style={{ color: '#666' }}>Sin productos.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {categoryProducts.map(product => (
                  <div
                    key={product.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1.2fr auto auto auto',
                      gap: 10,
                      alignItems: 'center',
                      borderTop: '1px solid #eee',
                      paddingTop: 10,
                    }}
                  >
                    <input
                      value={product.name}
                      onChange={e =>
                        patchProduct(product.id, { name: e.target.value })
                      }
                      style={{ padding: 9 }}
                    />

                    <input
                      value={String(product.price)}
                      inputMode="decimal"
                      onChange={e =>
                        patchProduct(product.id, { price: e.target.value })
                      }
                      style={{ padding: 9 }}
                    />

                    <select
                      value={product.category_id || ''}
                      onChange={e =>
                        patchProduct(product.id, {
                          category_id: e.target.value || null,
                        })
                      }
                      style={{ padding: 9 }}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>

                    <label style={{ whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={!product.is_sold_out}
                        onChange={e =>
                          patchProduct(product.id, {
                            is_sold_out: !e.target.checked,
                            is_available: e.target.checked,
                          })
                        }
                      />{' '}
                      {product.is_sold_out ? 'AGOTADO' : 'DISPONIBLE'}
                    </label>

                    <label style={{ whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={product.is_active}
                        onChange={e =>
                          patchProduct(product.id, {
                            is_active: e.target.checked,
                          })
                        }
                      />{' '}
                      Activo
                    </label>

                    <button
                      type="button"
                      onClick={() => saveProduct(product)}
                      style={{
                        padding: '9px 14px',
                        border: 0,
                        borderRadius: 9,
                        background: '#111',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Guardar
                    </button>

                    <small style={{ gridColumn: '1 / -1', color: '#777' }}>
                      Precio actual: {money(product.price)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
    </main>
  )
}
