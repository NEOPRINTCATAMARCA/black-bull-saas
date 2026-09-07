import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../../lib/supabase/server'
import PanelClient from './PanelClient'

export const dynamic = 'force-dynamic'

export default async function PanelPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/panel/login')

  const { data: profileRows, error: profileError } = await supabase.rpc(
    'get_my_panel_profile'
  )

  const profile = Array.isArray(profileRows) ? profileRows[0] : null

  if (
    profileError ||
    !profile ||
    profile.role !== 'owner_manager' ||
    !profile.business_id
  ) {
    return (
      <main className="panelLoginPage">
        <div className="panelLoginCard">
          <h1>Acceso no habilitado</h1>
          <p>
            La cuenta existe, pero todavía no está vinculada como dueño/encargado
            de este comercio.
          </p>
        </div>
      </main>
    )
  }

  const { data: demoStatusRows } = await supabase.rpc('get_my_demo_status_v1')
  const demoStatus = Array.isArray(demoStatusRows) ? demoStatusRows[0] : demoStatusRows

  if (demoStatus?.paused) {
    return (
      <main className="panelLoginPage">
        <div className="panelLoginCard">
          <h1>Servicio temporalmente no disponible</h1>
          <p>La muestra se encuentra pausada. Contactá al proveedor para reactivarla.</p>
        </div>
      </main>
    )
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      customer_name,
      customer_phone,
      fulfillment_type,
      address,
      subtotal,
      delivery_zone_id,
      delivery_fee,
      total,
      payment_method,
      payment_status,
      order_status,
      courier_id,
      estimated_minutes,
      is_delayed,
      notes,
      created_at,
      order_items (
        id,
        product_name_snapshot,
        quantity,
        unit_price_snapshot,
        item_subtotal,
        notes
      )
    `)
    .eq('business_id', profile.business_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (ordersError) {
    return (
      <main className="panelLoginPage">
        <div className="panelLoginCard">
          <h1>Error leyendo pedidos</h1>
          <p>{ordersError.message}</p>
        </div>
      </main>
    )
  }

  const { data: couriers } = await supabase
    .from('couriers')
    .select('id, name, phone, is_active')
    .eq('business_id', profile.business_id)
    .eq('is_active', true)
    .order('name')

  const { data: deliveryZonesRows } = await supabase.rpc('get_my_delivery_zones')

  const deliveryZones = Array.isArray(deliveryZonesRows) ? deliveryZonesRows : []

  return (
    <PanelClient
      initialOrders={(orders || []) as any}
      couriers={(couriers || []) as any}
      deliveryZones={deliveryZones as any}
      businessId={profile.business_id}
      userName={profile.full_name || 'DUEÑO / ENCARGADO'}
    />
  )
}
