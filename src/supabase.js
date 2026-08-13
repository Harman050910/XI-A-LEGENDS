import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing. Copy .env.local.example to .env.local and fill in your keys.')
}

export const supabase = createClient(url, anonKey)

export const SUPABASE_URL = url
