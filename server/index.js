import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { users, homework, doubts, discussions, saved, votes, HW_DIR, PFP_DIR } from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5000
const JWT_SECRET = 'gnmps-xi-a-legends-secret-key'

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ---------------------------------------------------------------- helpers

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

function cleanOldHomework() {
  const cutoff = Date.now() - THREE_DAYS
  let changed = false
  for (const hw of homework.all()) {
    if (new Date(hw.created_at).getTime() < cutoff) {
      if (hw.file && fs.existsSync(path.join(HW_DIR, hw.file))) {
        try { fs.unlinkSync(path.join(HW_DIR, hw.file)) } catch (e) {}
      }
      homework.remove(hw.id)
      changed = true
    }
  }
  return changed
}

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

// file uploads
const pfpUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PFP_DIR),
    filename: (req, file, cb) => cb(null, `pfp-${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || '')}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
})

const hwUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, HW_DIR),
    filename: (req, file, cb) => cb(null, `hw-${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || '')}`)
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
})

// ---------------------------------------------------------------- auth

app.post('/api/auth/register', pfpUpload.single('pfp'), async (req, res) => {
  const { student_id, name, password } = req.body
  if (!student_id || !name || !password) {
    return res.status(400).json({ error: 'Student ID, name and password are required' })
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' })
  }
  if (users.find((u) => u.student_id === String(student_id).trim().toLowerCase())) {
    return res.status(400).json({ error: 'This Student ID is already registered' })
  }
  const user = users.insert({
    student_id: String(student_id).trim().toLowerCase(),
    name: String(name).trim(),
    password: bcrypt.hashSync(String(password), 10),
    pfp: req.file ? `/uploads/pfp/${req.file.filename}` : null
  })
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: publicUser(user) })
})

app.post('/api/auth/login', (req, res) => {
  const { student_id, password } = req.body
  if (!student_id || !password) return res.status(400).json({ error: 'Enter your Student ID and password' })
  const user = users.find((u) => u.student_id === String(student_id).trim().toLowerCase())
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: 'Wrong Student ID or password' })
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, user: publicUser(user) })
})

app.get('/api/users/me', auth, (req, res) => {
  const user = users.find((u) => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: publicUser(user) })
})

app.put('/api/users/me', auth, pfpUpload.single('pfp'), (req, res) => {
  const user = users.find((u) => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { name, password, old_password } = req.body
  if (name && String(name).trim()) user.name = String(name).trim()
  if (password) {
    if (old_password && !bcrypt.compareSync(String(old_password), user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' })
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' })
    }
    user.password = bcrypt.hashSync(String(password), 10)
  }
  if (req.file) {
    if (user.pfp && user.pfp.startsWith('/uploads/pfp/')) {
      try { fs.unlinkSync(path.join(PFP_DIR, path.basename(user.pfp))) } catch (e) {}
    }
    user.pfp = `/uploads/pfp/${req.file.filename}`
  }
  users.save()
  res.json({ user: publicUser(user) })
})

app.get('/api/users/:id', (req, res) => {
  const user = users.find((u) => u.id === Number(req.params.id))
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: publicUser(user) })
})

// ---------------------------------------------------------------- homework

app.get('/api/homework', auth, (req, res) => {
  cleanOldHomework()
  const items = homework.all()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((hw) => {
      const author = users.find((u) => u.id === hw.author_id)
      return {
        ...hw,
        author_name: author ? author.name : 'Unknown',
        author_pfp: author ? author.pfp : null
      }
    })
  res.json({ homework: items })
})

app.post('/api/homework', auth, hwUpload.single('file'), (req, res) => {
  const { title, description, subject, type } = req.body
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }
  const hw = homework.insert({
    title: String(title).trim(),
    description: String(description || '').trim(),
    subject: String(subject || 'General').trim(),
    type: type === 'ask' ? 'ask' : 'share',
    file: req.file ? req.file.filename : null,
    original_name: req.file ? req.file.originalname : null,
    author_id: req.user.id
  })
  const author = users.find((u) => u.id === hw.author_id)
  res.json({ homework: { ...hw, author_name: author.name, author_pfp: author.pfp } })
})

app.get('/api/homework/:id/download', auth, (req, res) => {
  cleanOldHomework()
  const hw = homework.find((x) => x.id === Number(req.params.id))
  if (!hw || !hw.file) return res.status(404).json({ error: 'File not found' })
  const filePath = path.join(HW_DIR, hw.file)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })
  res.download(filePath, hw.original_name || hw.file)
})

app.delete('/api/homework/:id', auth, (req, res) => {
  const hw = homework.find((x) => x.id === Number(req.params.id))
  if (!hw) return res.status(404).json({ error: 'Homework not found' })
  if (hw.author_id !== req.user.id) return res.status(403).json({ error: 'Only the author can delete this' })
  if (hw.file && fs.existsSync(path.join(HW_DIR, hw.file))) {
    try { fs.unlinkSync(path.join(HW_DIR, hw.file)) } catch (e) {}
  }
  homework.remove(hw.id)
  res.json({ ok: true })
})

// ---------------------------------------------------------------- doubts + discussions

function doubtWithMeta(d, currentUserId) {
  const author = users.find((u) => u.id === d.author_id)
  const disc = discussions.filter((x) => x.doubt_id === d.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((c) => {
      const u = users.find((x) => x.id === c.author_id)
      return { ...c, author_name: u ? u.name : 'Unknown', author_pfp: u ? u.pfp : null }
    })
  const upvotes = votes.filter((v) => v.doubt_id === d.id && v.value > 0).length
  const downvotes = votes.filter((v) => v.doubt_id === d.id && v.value < 0).length
  const myVote = votes.find((v) => v.doubt_id === d.id && v.user_id === currentUserId)
  const isSaved = !!saved.find((s) => s.doubt_id === d.id && s.user_id === currentUserId)
  return {
    ...d,
    author_name: author ? author.name : 'Unknown',
    author_pfp: author ? author.pfp : null,
    discussions: disc,
    upvotes,
    downvotes,
    my_vote: myVote ? myVote.value : 0,
    saved: isSaved
  }
}

app.get('/api/doubts', auth, (req, res) => {
  const list = doubts.all()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((d) => doubtWithMeta(d, req.user.id))
  res.json({ doubts: list })
})

app.post('/api/doubts', auth, (req, res) => {
  const { title, content } = req.body
  if (!title || !String(title).trim() || !content || !String(content).trim()) {
    return res.status(400).json({ error: 'Title and content are required' })
  }
  const d = doubts.insert({
    title: String(title).trim(),
    content: String(content).trim(),
    author_id: req.user.id
  })
  res.json({ doubt: doubtWithMeta(d, req.user.id) })
})

app.get('/api/doubts/:id', auth, (req, res) => {
  const d = doubts.find((x) => x.id === Number(req.params.id))
  if (!d) return res.status(404).json({ error: 'Doubt not found' })
  res.json({ doubt: doubtWithMeta(d, req.user.id) })
})

app.post('/api/doubts/:id/discussions', auth, (req, res) => {
  const d = doubts.find((x) => x.id === Number(req.params.id))
  if (!d) return res.status(404).json({ error: 'Doubt not found' })
  const { content } = req.body
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'Comment cannot be empty' })
  const c = discussions.insert({
    doubt_id: d.id,
    author_id: req.user.id,
    content: String(content).trim()
  })
  const u = users.find((x) => x.id === c.author_id)
  res.json({ discussion: { ...c, author_name: u.name, author_pfp: u.pfp } })
})

app.post('/api/doubts/:id/vote', auth, (req, res) => {
  const d = doubts.find((x) => x.id === Number(req.params.id))
  if (!d) return res.status(404).json({ error: 'Doubt not found' })
  const value = Number(req.body.value) === -1 ? -1 : 1
  const existing = votes.find((v) => v.doubt_id === d.id && v.user_id === req.user.id)
  if (existing) {
    if (existing.value === value) votes.remove(existing.id)
    else existing.value = value
    votes.save()
  } else {
    votes.insert({ doubt_id: d.id, user_id: req.user.id, value })
  }
  res.json({ doubt: doubtWithMeta(d, req.user.id) })
})

// ---------------------------------------------------------------- saved

app.post('/api/saved', auth, (req, res) => {
  const { doubt_id } = req.body
  const d = doubts.find((x) => x.id === Number(doubt_id))
  if (!d) return res.status(404).json({ error: 'Doubt not found' })
  const existing = saved.find((s) => s.doubt_id === d.id && s.user_id === req.user.id)
  if (existing) {
    saved.remove(existing.id)
  } else {
    saved.insert({ doubt_id: d.id, user_id: req.user.id })
  }
  res.json({ doubt: doubtWithMeta(d, req.user.id), saved: !existing })
})

app.get('/api/saved', auth, (req, res) => {
  const list = saved.filter((s) => s.user_id === req.user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((s) => {
      const d = doubts.find((x) => x.id === s.doubt_id)
      return d ? doubtWithMeta(d, req.user.id) : null
    })
    .filter(Boolean)
  res.json({ saved: list })
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

app.listen(PORT, () => {
  cleanOldHomework()
  console.log(`GNMPS server running at http://localhost:${PORT}`)
})
