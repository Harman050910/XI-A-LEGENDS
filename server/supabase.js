import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.')
  console.error('Create a .env file in the project root — copy .env.example and fill in your keys.')
  console.error('(Keys are found in Supabase Dashboard → Project Settings → API)')
  process.exit(1)
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
})

export const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

export async function ensureBuckets() {
  for (const name of ['pfp', 'hw']) {
    const { error } = await supabase.storage.createBucket(name, { public: true })
    if (error && !String(error.message).toLowerCase().includes('already exists')) {
      console.log(`Storage bucket "${name}" note: ${error.message}`)
    }
  }
}

export async function cleanOldHomework() {
  const cutoff = new Date(Date.now() - THREE_DAYS).toISOString()
  const { data: old } = await supabase
    .from('homework')
    .select('id, file_path')
    .lt('created_at', cutoff)

  if (old && old.length) {
    for (const row of old) {
      if (row.file_path) {
        await supabase.storage.from('hw').remove([row.file_path])
      }
    }
    await supabase.from('homework').delete().in('id', old.map((r) => r.id))
    console.log(`Auto-deleted ${old.length} homework item(s) older than 3 days`)
  }
}
