import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.join(__dirname, 'data')
export const UPLOAD_DIR = path.join(__dirname, 'uploads')
export const HW_DIR = path.join(UPLOAD_DIR, 'hw')
export const PFP_DIR = path.join(UPLOAD_DIR, 'pfp')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(HW_DIR, { recursive: true })
fs.mkdirSync(PFP_DIR, { recursive: true })

class Store {
  constructor(fileName) {
    this.file = path.join(DATA_DIR, fileName)
    this.items = []
    this.nextId = 1
    this.load()
  }

  load() {
    if (fs.existsSync(this.file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'))
        this.items = raw.items || []
        this.nextId = raw.nextId || 1
      } catch (e) {
        this.items = []
        this.nextId = 1
      }
    }
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify({ items: this.items, nextId: this.nextId }, null, 2))
  }

  insert(item) {
    item.id = this.nextId++
    item.created_at = new Date().toISOString()
    this.items.push(item)
    this.save()
    return item
  }

  all() {
    return this.items
  }

  find(pred) {
    return this.items.find(pred)
  }

  filter(pred) {
    return this.items.filter(pred)
  }

  update(id, patch) {
    const item = this.items.find((x) => x.id === id)
    if (!item) return null
    Object.assign(item, patch)
    this.save()
    return item
  }

  remove(id) {
    const before = this.items.length
    this.items = this.items.filter((x) => x.id !== id)
    if (this.items.length !== before) {
      this.save()
      return true
    }
    return false
  }
}

export const users = new Store('users.json')
export const homework = new Store('homework.json')
export const doubts = new Store('doubts.json')
export const discussions = new Store('discussions.json')
export const saved = new Store('saved.json')
export const votes = new Store('votes.json')
