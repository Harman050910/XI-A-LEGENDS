const TOKEN_KEY = 'gnmps_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, { ...options, headers })
  let data = null
  try {
    data = await res.json()
  } catch (e) {
    data = {}
  }
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong')
  }
  return data
}

export const api = {
  register: (formData) => request('/api/auth/register', { method: 'POST', body: formData }),
  login: (student_id, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ student_id, password }) }),
  me: () => request('/api/users/me'),
  updateMe: (formData) => request('/api/users/me', { method: 'PUT', body: formData }),

  homework: () => request('/api/homework'),
  createHomework: (formData) => request('/api/homework', { method: 'POST', body: formData }),
  deleteHomework: (id) => request(`/api/homework/${id}`, { method: 'DELETE' }),

  doubts: () => request('/api/doubts'),
  createDoubt: (title, content) =>
    request('/api/doubts', { method: 'POST', body: JSON.stringify({ title, content }) }),
  doubt: (id) => request(`/api/doubts/${id}`),
  comment: (id, content) =>
    request(`/api/doubts/${id}/discussions`, { method: 'POST', body: JSON.stringify({ content }) }),
  vote: (id, value) =>
    request(`/api/doubts/${id}/vote`, { method: 'POST', body: JSON.stringify({ value }) }),
  toggleSaved: (doubt_id) =>
    request('/api/saved', { method: 'POST', body: JSON.stringify({ doubt_id }) }),
  saved: () => request('/api/saved')
}

export function downloadHomework(id, originalName) {
  const token = getToken()
  fetch(`/api/homework/${id}/download`, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Download failed')
      return res.blob()
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = originalName || 'homework'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })
    .catch(() => alert('Could not download the file'))
}
