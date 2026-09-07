import { createClient } from '@supabase/supabase-js'
import OrderClient from './OrderClient'

export const dynamic = 'force-dynamic'

async function getBlackBull() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('get_public_business', {
    p_slug: 'black-bull',
  })

  if (error) throw error
  return data
}

export default async function Home() {
  const data = await getBlackBull()
  return <OrderClient data={data} />
}
