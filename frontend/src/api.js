const API_BASE =
  (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim()) ||
  '' // usar proxy de Vite (misma origin)

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPost(path, body, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body || {}),
  })
  if (!res.ok) throw new Error(await res.text())
  return res
}

async function apiPatch(path, body, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body || {}),
  })
  if (!res.ok) throw new Error(await res.text())
  return res
}

async function apiDelete(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...(opts.headers || {}) },
  })
  if (!res.ok) throw new Error(await res.text())
  return res
}

export async function listSessions() {
  return apiGet('/api/sessions/')
}

export async function createSession(arg = '') {
  // Compat: antes era createSession(title: string)
  // Ahora soporta createSession({ title, custom_instructions })
  const body =
    typeof arg === 'string'
      ? { title: arg }
      : (arg && typeof arg === 'object' ? arg : {})

  const res = await apiPost('/api/sessions/', body)
  return res.json()
}

export async function updateSession(sessionId, patch) {
  const res = await apiPatch(`/api/sessions/${sessionId}/`, patch || {})
  return res.json()
}

export async function deleteSession(sessionId) {
  await apiDelete(`/api/sessions/${sessionId}/`)
  return true
}

export async function getMessages(sessionId) {
  return apiGet(`/api/sessions/${sessionId}/messages/`)
}

/**
 * Streaming SSE via POST fetch (backend devuelve text/event-stream).
 * Retorna el texto final.
 */
export async function sendMessageStream(sessionId, content, onDelta) {
  const res = await apiPost(`/api/sessions/${sessionId}/chat/?stream=1`, { content })
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let full = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const evt of events) {
      const lines = evt.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const obj = JSON.parse(payload)
          if (obj.error) throw new Error(obj.error)
          if (obj.delta) {
            full += obj.delta
            onDelta?.(obj.delta)
          }
        } catch (e) {
          // si no es JSON, ignorar
        }
      }
    }
  }

  return full
}

export async function sendMessage(sessionId, content) {
  const res = await apiPost(`/api/sessions/${sessionId}/chat/`, { content })
  const data = await res.json()
  return data.assistant || ''
}