import { supabase } from './supabase.js'

const EMAIL_DOMAIN = 'gnmps.in'
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

function emailFor(studentId) {
  return `${String(studentId).trim().toLowerCase()}@${EMAIL_DOMAIN}`
}

function studentIdFromEmail(email) {
  return email.split('@')[0]
}

async function getCurrentProfile() {
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id
  if (!uid) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, student_id, name, pfp, auth_id')
    .eq('auth_id', uid)
    .maybeSingle()
  return profile
}

function publicUser(p) {
  return { id: p.id, student_id: p.student_id, name: p.name, pfp: p.pfp || null }
}

async function uploadPfp(file) {
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase()
  const name = `pfp-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`
  const { error } = await supabase.storage.from('pfp').upload(name, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false
  })
  if (error) throw new Error('Could not upload profile picture')
  return supabase.storage.from('pfp').getPublicUrl(name).data.publicUrl
}

async function uploadHwFile(file) {
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase()
  const name = `hw-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`
  const { error } = await supabase.storage.from('hw').upload(name, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  })
  if (error) throw new Error('Could not upload file')
  return name
}

async function composeDoubts(rows, userId) {
  if (!rows || !rows.length) return []
  const ids = rows.map((d) => d.id)
  const [discRes, voteRes, savedRes] = await Promise.all([
    supabase
      .from('discussions')
      .select('id, doubt_id, content, created_at, author:profiles!author_id(name, pfp)')
      .in('doubt_id', ids)
      .order('created_at', { ascending: true }),
    supabase.from('votes').select('doubt_id, user_id, value').in('doubt_id', ids),
    supabase.from('saved_discussions').select('doubt_id').in('doubt_id', ids).eq('user_id', userId)
  ])
  const discs = discRes.data || []
  const votesArr = voteRes.data || []
  const savedSet = new Set((savedRes.data || []).map((s) => s.doubt_id))
  const byDoubt = {}
  for (const d of discs) {
    ;(byDoubt[d.doubt_id] = byDoubt[d.doubt_id] || []).push({
      id: d.id,
      content: d.content,
      created_at: d.created_at,
      author_name: d.author?.name || 'Unknown',
      author_pfp: d.author?.pfp || null
    })
  }
  return rows.filter(Boolean).map(({ author, ...d }) => {
    const dv = votesArr.filter((v) => v.doubt_id === d.id)
    const my = dv.find((v) => v.user_id === userId)
    return {
      ...d,
      author_name: author?.name || 'Unknown',
      author_pfp: author?.pfp || null,
      discussions: byDoubt[d.id] || [],
      upvotes: dv.filter((v) => v.value > 0).length,
      downvotes: dv.filter((v) => v.value < 0).length,
      my_vote: my ? my.value : 0,
      saved: savedSet.has(d.id)
    }
  })
}

async function doubtRow(id) {
  const { data } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .eq('id', Number(id))
    .maybeSingle()
  return data
}

const doubtsQuery = () =>
  supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')

export const api = {
  // ---------------------------------------------------------------- auth

  register: async (formData) => {
    const student_id = String(formData.get('student_id')).trim()
    const name = String(formData.get('name')).trim()
    const password = String(formData.get('password'))
    const pfpFile = formData.get('pfp')
    const email = emailFor(student_id)

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('student_id', student_id.toLowerCase())
      .maybeSingle()
    if (existing) throw new Error('This Student ID is already registered')

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { student_id: student_id.toLowerCase(), name } }
    })
    if (authError) throw new Error(authError.message)
    const authUser = authData.user
    if (!authUser) {
      throw new Error(
        'Signup needs "Confirm email" turned OFF in Supabase (Authentication → Providers → Email). Please do that, then try again.'
      )
    }

    let pfp = null
    if (pfpFile && pfpFile.size) pfp = await uploadPfp(pfpFile)

    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .insert({
        auth_id: authUser.id,
        student_id: studentIdFromEmail(authUser.email || email),
        name,
        pfp
      })
      .select()
      .single()
    if (profError) throw new Error('Could not create account')

    return { user: publicUser(profile) }
  },

  login: async (student_id, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailFor(student_id),
      password
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('invalid login credentials')) throw new Error('Wrong Student ID or password')
      if (msg.includes('confirm') || msg.includes('not verified')) {
        throw new Error('Email confirmation is ON. Turn it OFF in Supabase (Authentication → Providers → Email).')
      }
      throw new Error(error.message)
    }
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Profile not found')
    return { user: publicUser(profile) }
  },

  me: async () => {
    const profile = await getCurrentProfile()
    return { user: profile ? publicUser(profile) : null }
  },

  updateMe: async (formData) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    const name = formData.get('name')
    const oldPassword = formData.get('old_password')
    const password = formData.get('password')
    const pfpFile = formData.get('pfp')

    if (password) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: `${profile.student_id}@${EMAIL_DOMAIN}`,
        password: oldPassword
      })
      if (reauthError) throw new Error('Current password is incorrect')
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) throw new Error(pwError.message)
    }

    const updates = {}
    if (name && String(name).trim()) updates.name = String(name).trim()
    if (pfpFile && pfpFile.size) updates.pfp = await uploadPfp(pfpFile)

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('auth_id', profile.auth_id)
      .select()
      .single()
    if (error) throw new Error('Could not update profile')
    return { user: publicUser(updated) }
  },

  // ---------------------------------------------------------------- homework

  homework: async () => {
    const { data } = await supabase
      .from('homework')
      .select('id, title, description, subject, type, file_path, original_name, author_id, created_at, author:profiles!author_id(name, pfp)')
      .gte('created_at', new Date(Date.now() - THREE_DAYS).toISOString())
      .order('created_at', { ascending: false })
    const items = (data || []).map(({ file_path, author, ...rest }) => ({
      ...rest,
      file: file_path,
      author_name: author?.name || 'Unknown',
      author_pfp: author?.pfp || null
    }))
    return { homework: items }
  },

  createHomework: async (formData) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    const title = String(formData.get('title') || '').trim()
    if (!title) throw new Error('Title is required')
    const file = formData.get('file')
    let file_path = null
    let original_name = null
    if (file && file.size) {
      file_path = await uploadHwFile(file)
      original_name = file.name
    }
    const { data: hw, error } = await supabase
      .from('homework')
      .insert({
        title,
        description: String(formData.get('description') || '').trim(),
        subject: String(formData.get('subject') || 'General').trim(),
        type: formData.get('type') === 'ask' ? 'ask' : 'share',
        file_path,
        original_name,
        author_id: profile.id
      })
      .select('id, title, description, subject, type, file_path, original_name, author_id, created_at, author:profiles!author_id(name, pfp)')
      .single()
    if (error) throw new Error('Could not post homework')
    const { file_path: fp, author, ...rest } = hw
    return {
      homework: { ...rest, file: fp, author_name: author?.name || 'Unknown', author_pfp: author?.pfp || null }
    }
  },

  deleteHomework: async (id) => {
    const { data: hw } = await supabase.from('homework').select('file_path').eq('id', Number(id)).maybeSingle()
    if (hw && hw.file_path) {
      await supabase.storage.from('hw').remove([hw.file_path])
    }
    const { error } = await supabase.from('homework').delete().eq('id', Number(id))
    if (error) throw new Error(error.message)
  },

  updateHomework: async (id, formData) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    const title = String(formData.get('title') || '').trim()
    if (!title) throw new Error('Title is required')
    const updates = {
      title,
      description: String(formData.get('description') || '').trim(),
      subject: String(formData.get('subject') || 'General').trim(),
      type: formData.get('type') === 'ask' ? 'ask' : 'share'
    }
    const file = formData.get('file')
    if (file && file.size) {
      const { data: old } = await supabase.from('homework').select('file_path').eq('id', Number(id)).maybeSingle()
      if (old && old.file_path) await supabase.storage.from('hw').remove([old.file_path])
      updates.file_path = await uploadHwFile(file)
      updates.original_name = file.name
    }
    const { data: hw, error } = await supabase
      .from('homework')
      .update(updates)
      .eq('id', Number(id))
      .select('id, title, description, subject, type, file_path, original_name, author_id, created_at, author:profiles!author_id(name, pfp)')
      .single()
    if (error) throw new Error('Could not update homework')
    const { file_path: fp, author, ...rest } = hw
    return {
      homework: { ...rest, file: fp, author_name: author?.name || 'Unknown', author_pfp: author?.pfp || null }
    }
  },

  // ---------------------------------------------------------------- doubts + discussions

  doubts: async () => {
    const profile = await getCurrentProfile()
    const { data } = await doubtsQuery().order('created_at', { ascending: false })
    return { doubts: await composeDoubts(data || [], profile?.id) }
  },

  createDoubt: async (title, content) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    if (!String(title).trim() || !String(content).trim()) throw new Error('Title and content are required')
    const { data: created, error } = await supabase
      .from('doubts')
      .insert({ title: String(title).trim(), content: String(content).trim(), author_id: profile.id })
      .select()
      .single()
    if (error) throw new Error('Could not post doubt')
    const full = await doubtRow(created.id)
    const [meta] = await composeDoubts([full], profile.id)
    return { doubt: meta }
  },

  updateDoubt: async (id, title, content) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    if (!String(title).trim() || !String(content).trim()) throw new Error('Title and content are required')
    const { error } = await supabase
      .from('doubts')
      .update({ title: String(title).trim(), content: String(content).trim() })
      .eq('id', Number(id))
    if (error) throw new Error('Could not update doubt')
    const full = await doubtRow(id)
    const [meta] = await composeDoubts([full], profile.id)
    return { doubt: meta }
  },

  deleteDoubt: async (id) => {
    const { error } = await supabase.from('doubts').delete().eq('id', Number(id))
    if (error) throw new Error(error.message)
  },

  doubt: async (id) => {
    const profile = await getCurrentProfile()
    const full = await doubtRow(id)
    if (!full) throw new Error('Doubt not found')
    const [meta] = await composeDoubts([full], profile?.id)
    return { doubt: meta }
  },

  comment: async (id, content) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    const { data: c, error } = await supabase
      .from('discussions')
      .insert({ doubt_id: Number(id), author_id: profile.id, content: String(content).trim() })
      .select()
      .single()
    if (error) throw new Error('Doubt not found')
    const { data: u } = await supabase.from('profiles').select('name, pfp').eq('id', profile.id).maybeSingle()
    return { discussion: { ...c, author_name: u?.name || 'Unknown', author_pfp: u?.pfp || null } }
  },

  vote: async (id, value) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    const doubt_id = Number(id)
    const v = Number(value) === -1 ? -1 : 1
    const { data: existing } = await supabase
      .from('votes')
      .select('value')
      .eq('doubt_id', doubt_id)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (existing) {
      if (existing.value === v) {
        await supabase.from('votes').delete().eq('doubt_id', doubt_id).eq('user_id', profile.id)
      } else {
        await supabase.from('votes').update({ value: v }).eq('doubt_id', doubt_id).eq('user_id', profile.id)
      }
    } else {
      await supabase.from('votes').insert({ doubt_id, user_id: profile.id, value: v })
    }
    const full = await doubtRow(doubt_id)
    if (!full) throw new Error('Doubt not found')
    const [meta] = await composeDoubts([full], profile.id)
    return { doubt: meta }
  },

  // ---------------------------------------------------------------- saved

  toggleSaved: async (doubt_id) => {
    const profile = await getCurrentProfile()
    if (!profile) throw new Error('Not logged in')
    const id = Number(doubt_id)
    const { data: existing } = await supabase
      .from('saved_discussions')
      .select('doubt_id')
      .eq('doubt_id', id)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (existing) {
      await supabase.from('saved_discussions').delete().eq('doubt_id', id).eq('user_id', profile.id)
    } else {
      await supabase.from('saved_discussions').insert({ doubt_id: id, user_id: profile.id })
    }
    const full = await doubtRow(id)
    const [meta] = await composeDoubts([full], profile.id)
    return { doubt: meta, saved: !existing }
  },

  saved: async () => {
    const profile = await getCurrentProfile()
    if (!profile) return { saved: [] }
    const { data: rows } = await supabase
      .from('saved_discussions')
      .select('doubt_id, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    if (!rows || !rows.length) return { saved: [] }
    const ids = rows.map((r) => r.doubt_id)
    const { data: doubtRows } = await doubtsQuery().in('id', ids)
    const orderMap = {}
    rows.forEach((r, i) => { orderMap[r.doubt_id] = i })
    const ordered = (doubtRows || []).sort((a, b) => orderMap[a.id] - orderMap[b.id])
    return { saved: await composeDoubts(ordered, profile.id) }
  }
}

export async function downloadHomework(id, originalName) {
  const { data: hw } = await supabase.from('homework').select('file_path, original_name').eq('id', Number(id)).maybeSingle()
  if (!hw || !hw.file_path) {
    alert('File not found')
    return
  }
  const { data } = supabase.storage.from('hw').getPublicUrl(hw.file_path)
  try {
    const res = await fetch(data.publicUrl)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = originalName || hw.original_name || 'homework'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('Could not download the file')
  }
}
