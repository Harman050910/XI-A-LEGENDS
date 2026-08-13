import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { supabase, THREE_DAYS, ensureBuckets, cleanOldHomework } from './supabase.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET || 'gnmps-xi-a-legends-secret-key'

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// never let the process crash - turn async errors into JSON responses
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// if a request ever throws, send a JSON error instead of leaving it hanging
app.use((req, res, next) => {
  const handler = () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Request timed out. Please try again.' })
    }
  }
  res.on('finish', () => clearTimeout(res._gnmpsTimer))
  res._gnmpsTimer = setTimeout(handler, 30000)
  next()
})

// ---------------------------------------------------------------- helpers

function publicUser(u) {
  return { id: u.id, student_id: u.student_id, name: u.name, pfp: u.pfp || null }
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, please login again' })
  }
}

function safeExt(originalname) {
  return path.extname(originalname || '').toLowerCase().slice(0, 10)
}

function rand() {
  return Math.round(Math.random() * 1e6)
}

// file uploads (kept in memory, then pushed to Supabase Storage)
const pfpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

const hwUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
})

// build the full doubt object (with author, discussions, votes, saved flag)
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

// ---------------------------------------------------------------- auth

app.post('/api/auth/register', pfpUpload.single('pfp'), async (req, res) => {
  const { student_id, name, password } = req.body
  if (!student_id || !name || !password) {
    return res.status(400).json({ error: 'Student ID, name and password are required' })
  }
  const sid = String(student_id).trim().toLowerCase()
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('student_id', sid)
    .maybeSingle()
  if (existing) return res.status(400).json({ error: 'This Student ID is already registered' })

  let pfp = null
  if (req.file) {
    const fname = `pfp-${Date.now()}-${rand()}${safeExt(req.file.originalname)}`
    const { error } = await supabase.storage
      .from('pfp')
      .upload(fname, req.file.buffer, { contentType: req.file.mimetype })
    if (error) return res.status(500).json({ error: 'Could not upload profile picture' })
    pfp = `/uploads/pfp/${fname}`
  }

  const { data: user, error } = await supabase
    .from('profiles')
    .insert({
      student_id: sid,
      name: String(name).trim(),
      password: bcrypt.hashSync(String(password), 10),
      pfp
    })
    .select()
    .single()
  if (error) return res.status(500).json({ error: 'Could not create account' })

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: publicUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const { student_id, password } = req.body
  if (!student_id || !password) {
    return res.status(400).json({ error: 'Enter your Student ID and password' })
  }
  const { data: user } = await supabase
    .from('profiles')
    .select()
    .eq('student_id', String(student_id).trim().toLowerCase())
    .maybeSingle()
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: 'Wrong Student ID or password' })
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: publicUser(user) })
})

app.get('/api/users/me', auth, async (req, res) => {
  const { data: user } = await supabase
    .from('profiles')
    .select()
    .eq('id', req.user.id)
    .maybeSingle()
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: publicUser(user) })
})

app.put('/api/users/me', auth, pfpUpload.single('pfp'), async (req, res) => {
  const { data: user } = await supabase
    .from('profiles')
    .select()
    .eq('id', req.user.id)
    .maybeSingle()
  if (!user) return res.status(404).json({ error: 'User not found' })

  const updates = {}
  const { name, password, old_password } = req.body
  if (name && String(name).trim()) updates.name = String(name).trim()
  if (password) {
    if (old_password && !bcrypt.compareSync(String(old_password), user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' })
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' })
    }
    updates.password = bcrypt.hashSync(String(password), 10)
  }
  if (req.file) {
    if (user.pfp) {
      await supabase.storage.from('pfp').remove([path.basename(user.pfp)])
    }
    const fname = `pfp-${Date.now()}-${rand()}${safeExt(req.file.originalname)}`
    const { error } = await supabase.storage
      .from('pfp')
      .upload(fname, req.file.buffer, { contentType: req.file.mimetype })
    if (error) return res.status(500).json({ error: 'Could not upload profile picture' })
    updates.pfp = `/uploads/pfp/${fname}`
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: 'Could not update profile' })
  res.json({ user: publicUser(updated) })
})

app.get('/api/users/:id', async (req, res) => {
  const { data: user } = await supabase
    .from('profiles')
    .select()
    .eq('id', Number(req.params.id))
    .maybeSingle()
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: publicUser(user) })
})

// ---------------------------------------------------------------- homework

app.get('/api/homework', auth, async (req, res) => {
  await cleanOldHomework()
  const cutoff = new Date(Date.now() - THREE_DAYS).toISOString()
  const { data, error } = await supabase
    .from('homework')
    .select('id, title, description, subject, type, file_path, original_name, author_id, created_at, author:profiles!author_id(name, pfp)')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'Could not load homework' })
  const items = (data || []).map(({ file_path, author, ...rest }) => ({
    ...rest,
    file: file_path,
    author_name: author?.name || 'Unknown',
    author_pfp: author?.pfp || null
  }))
  res.json({ homework: items })
})

app.post('/api/homework', auth, hwUpload.single('file'), async (req, res) => {
  const { title, description, subject, type } = req.body
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }
  let file_path = null
  let original_name = null
  if (req.file) {
    const fname = `hw-${Date.now()}-${rand()}${safeExt(req.file.originalname)}`
    const { error } = await supabase.storage
      .from('hw')
      .upload(fname, req.file.buffer, { contentType: req.file.mimetype })
    if (error) return res.status(500).json({ error: 'Could not upload file' })
    file_path = fname
    original_name = req.file.originalname
  }
  const { data: hw, error } = await supabase
    .from('homework')
    .insert({
      title: String(title).trim(),
      description: String(description || '').trim(),
      subject: String(subject || 'General').trim(),
      type: type === 'ask' ? 'ask' : 'share',
      file_path,
      original_name,
      author_id: req.user.id
    })
    .select('id, title, description, subject, type, file_path, original_name, author_id, created_at, author:profiles!author_id(name, pfp)')
    .single()
  if (error) return res.status(500).json({ error: 'Could not post homework' })
  const { file_path: fp, author, ...rest } = hw
  res.json({
    homework: { ...rest, file: fp, author_name: author?.name || 'Unknown', author_pfp: author?.pfp || null }
  })
})

app.get('/api/homework/:id/download', auth, async (req, res) => {
  await cleanOldHomework()
  const { data: hw } = await supabase
    .from('homework')
    .select('file_path, original_name')
    .eq('id', Number(req.params.id))
    .maybeSingle()
  if (!hw || !hw.file_path) return res.status(404).json({ error: 'File not found' })
  const { data, error } = await supabase.storage.from('hw').download(hw.file_path)
  if (error || !data) return res.status(404).json({ error: 'File not found' })
  const buf = Buffer.from(await data.arrayBuffer())
  res.setHeader('Content-Type', data.type || 'application/octet-stream')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(hw.original_name || hw.file_path)}`
  )
  res.send(buf)
})

app.delete('/api/homework/:id', auth, async (req, res) => {
  const { data: hw } = await supabase
    .from('homework')
    .select('id, file_path, author_id')
    .eq('id', Number(req.params.id))
    .maybeSingle()
  if (!hw) return res.status(404).json({ error: 'Homework not found' })
  if (hw.author_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the author can delete this' })
  }
  if (hw.file_path) await supabase.storage.from('hw').remove([hw.file_path])
  await supabase.from('homework').delete().eq('id', hw.id)
  res.json({ ok: true })
})

// ---------------------------------------------------------------- doubts + discussions

app.get('/api/doubts', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'Could not load doubts' })
  res.json({ doubts: await composeDoubts(data || [], req.user.id) })
})

app.post('/api/doubts', auth, async (req, res) => {
  const { title, content } = req.body
  if (!title || !String(title).trim() || !content || !String(content).trim()) {
    return res.status(400).json({ error: 'Title and content are required' })
  }
  const { data: created, error } = await supabase
    .from('doubts')
    .insert({ title: String(title).trim(), content: String(content).trim(), author_id: req.user.id })
    .select()
    .single()
  if (error) return res.status(500).json({ error: 'Could not post doubt' })
  const { data: full } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .eq('id', created.id)
    .single()
  const [meta] = await composeDoubts([full], req.user.id)
  res.json({ doubt: meta })
})

app.get('/api/doubts/:id', auth, async (req, res) => {
  const { data: full } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .eq('id', Number(req.params.id))
    .maybeSingle()
  if (!full) return res.status(404).json({ error: 'Doubt not found' })
  const [meta] = await composeDoubts([full], req.user.id)
  res.json({ doubt: meta })
})

app.post('/api/doubts/:id/discussions', auth, async (req, res) => {
  const { content } = req.body
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: 'Comment cannot be empty' })
  }
  const { data: c, error } = await supabase
    .from('discussions')
    .insert({ doubt_id: Number(req.params.id), author_id: req.user.id, content: String(content).trim() })
    .select()
    .single()
  if (error) return res.status(404).json({ error: 'Doubt not found' })
  const { data: u } = await supabase
    .from('profiles')
    .select('name, pfp')
    .eq('id', req.user.id)
    .maybeSingle()
  res.json({ discussion: { ...c, author_name: u?.name || 'Unknown', author_pfp: u?.pfp || null } })
})

app.post('/api/doubts/:id/vote', auth, async (req, res) => {
  const id = Number(req.params.id)
  const value = Number(req.body.value) === -1 ? -1 : 1
  const { data: existing } = await supabase
    .from('votes')
    .select('value')
    .eq('doubt_id', id)
    .eq('user_id', req.user.id)
    .maybeSingle()
  if (existing) {
    if (existing.value === value) {
      await supabase.from('votes').delete().eq('doubt_id', id).eq('user_id', req.user.id)
    } else {
      await supabase.from('votes').update({ value }).eq('doubt_id', id).eq('user_id', req.user.id)
    }
  } else {
    await supabase.from('votes').insert({ doubt_id: id, user_id: req.user.id, value })
  }
  const { data: full } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .eq('id', id)
    .maybeSingle()
  if (!full) return res.status(404).json({ error: 'Doubt not found' })
  const [meta] = await composeDoubts([full], req.user.id)
  res.json({ doubt: meta })
})

// ---------------------------------------------------------------- saved

app.post('/api/saved', auth, async (req, res) => {
  const id = Number(req.body.doubt_id)
  const { data: d } = await supabase.from('doubts').select('id').eq('id', id).maybeSingle()
  if (!d) return res.status(404).json({ error: 'Doubt not found' })
  const { data: existing } = await supabase
    .from('saved_discussions')
    .select('doubt_id')
    .eq('doubt_id', id)
    .eq('user_id', req.user.id)
    .maybeSingle()
  if (existing) {
    await supabase.from('saved_discussions').delete().eq('doubt_id', id).eq('user_id', req.user.id)
  } else {
    await supabase.from('saved_discussions').insert({ doubt_id: id, user_id: req.user.id })
  }
  const { data: full } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .eq('id', id)
    .maybeSingle()
  const [meta] = await composeDoubts([full], req.user.id)
  res.json({ doubt: meta, saved: !existing })
})

app.get('/api/saved', auth, async (req, res) => {
  const { data: rows } = await supabase
    .from('saved_discussions')
    .select('doubt_id, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
  if (!rows || !rows.length) return res.json({ saved: [] })
  const ids = rows.map((r) => r.doubt_id)
  const { data: doubtRows } = await supabase
    .from('doubts')
    .select('id, title, content, author_id, created_at, author:profiles!author_id(name, pfp)')
    .in('id', ids)
  const orderMap = {}
  rows.forEach((r, i) => { orderMap[r.doubt_id] = i })
  const ordered = (doubtRows || []).sort((a, b) => orderMap[a.id] - orderMap[b.id])
  res.json({ saved: await composeDoubts(ordered, req.user.id) })
})

// ---------------------------------------------------------------- uploads proxy

app.get('/uploads/:bucket/:file', async (req, res) => {
  const { bucket, file } = req.params
  const { data, error } = await supabase.storage.from(bucket).download(file)
  if (error || !data) return res.status(404).json({ error: 'File not found' })
  res.setHeader('Content-Type', data.type || 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(Buffer.from(await data.arrayBuffer()))
})

// ---------------------------------------------------------------- serve built app

const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// error handler - always respond with JSON, never let the server crash
app.use((err, req, res, next) => {
  if (err) {
    const status = err.status || err.statusCode || 400
    return res.status(status).json({ error: err.message || 'Request could not be processed' })
  }
  next()
})

app.listen(PORT, async () => {
  await ensureBuckets()
  await cleanOldHomework()
  console.log(`GNMPS server running at http://localhost:${PORT} (Supabase connected)`)
})
