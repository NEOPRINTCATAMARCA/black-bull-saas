import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../../lib/supabase/server'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  return <AdminClient />
}
