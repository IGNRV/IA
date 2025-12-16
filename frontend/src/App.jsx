import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createSession, deleteSession, getMessages, listSessions, sendMessageStream, updateSession } from './api.js'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'right' : 'left'}`}>
      <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
        <div className="msg-role">{isUser ? 'Tú' : 'IA'}</div>
        <div className="msg-content">{content}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Instrucciones globales (siempre se envían al backend en cada prompt)
  const [defaultInstructions, setDefaultInstructions] = useState('')

  // Modal instrucciones
  const [instrOpen, setInstrOpen] = useState(false)
  const [instrMode, setInstrMode] = useState('default') // 'default' | 'chat'
  const [instrDraft, setInstrDraft] = useState('')
  const [instrDirty, setInstrDirty] = useState(false)

  const bottomRef = useRef(null)

  const activeSession = useMemo(() => {
    return sessions.find((x) => x.id === activeSessionId) || null
  }, [sessions, activeSessionId])

  async function refreshSessions(preferId) {
    const s = await listSessions()
    setSessions(s)

    const desired = preferId || activeSessionId
    if (desired && s.some((x) => x.id === desired)) {
      setActiveSessionId(desired)
      return
    }
    if (s.length) {
      setActiveSessionId(s[0].id)
      return
    }
    setActiveSessionId(null)
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ollama_default_instructions') || ''
      setDefaultInstructions(saved)
    } catch {
      setDefaultInstructions('')
    }
  }, [])

  useEffect(() => {
    refreshSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function load() {
      if (!activeSessionId) {
        setMessages([])
        return
      }
      const msgs = await getMessages(activeSessionId)
      setMessages(msgs)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    load()
  }, [activeSessionId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (instrOpen) setInstrOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [instrOpen])

  function openInstructionsModal(mode) {
    const hasChat = !!activeSessionId
    const nextMode = mode || (hasChat ? 'chat' : 'default')
    setInstrMode(nextMode)

    if (nextMode === 'chat' && hasChat) {
      setInstrDraft((activeSession?.custom_instructions || '').toString())
    } else {
      setInstrDraft((defaultInstructions || '').toString())
    }

    setInstrDirty(false)
    setInstrOpen(true)
  }

  async function onNewChat() {
    setError('')
    try {
      // El chat hereda custom_instructions iniciales (por chat) desde lo global,
      // pero además lo global SIEMPRE se envía en cada prompt.
      const s = await createSession({ title: '', custom_instructions: '' })
      await refreshSessions(s.id)
      setMessages([])
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  async function onDeleteChat(sessionId) {
    if (!sessionId) return
    const s = sessions.find((x) => x.id === sessionId)
    const label = s?.title ? `"${s.title}"` : String(sessionId)
    const ok = window.confirm(`¿Eliminar este chat y todos sus mensajes?\n\n${label}`)
    if (!ok) return

    setError('')
    try {
      await deleteSession(sessionId)
      const deletingActive = sessionId === activeSessionId
      await refreshSessions(deletingActive ? null : activeSessionId)
      if (deletingActive) setMessages([])
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  async function saveInstructions() {
    setError('')
    try {
      if (instrMode === 'chat') {
        if (!activeSessionId) {
          throw new Error('No hay un chat activo para guardar instrucciones por chat.')
        }
        await updateSession(activeSessionId, { custom_instructions: instrDraft || '' })
        await refreshSessions(activeSessionId)
        setInstrDirty(false)
        setInstrOpen(false)
        return
      }

      // default/global
      try {
        localStorage.setItem('ollama_default_instructions', instrDraft || '')
      } catch {
        // ignore
      }
      setDefaultInstructions(instrDraft || '')
      setInstrDirty(false)
      setInstrOpen(false)
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  async function onSend() {
    const text = input.trim()
    if (!text || loading) return

    setError('')
    setLoading(true)
    setInput('')

    try {
      let sid = activeSessionId
      if (!sid) {
        const s = await createSession({ title: '', custom_instructions: '' })
        sid = s.id
        await refreshSessions(sid)
      }

      // agrega mensaje usuario inmediatamente
      const tempUser = { id: `tmp-u-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() }
      const tempAsst = { id: `tmp-a-${Date.now()}`, role: 'assistant', content: '', created_at: new Date().toISOString() }
      setMessages((prev) => [...prev, tempUser, tempAsst])

      // streaming (SIEMPRE envía instrucciones globales guardadas)
      await sendMessageStream(sid, text, (delta) => {
        setMessages((prev) => {
          const copy = [...prev]
          const idx = copy.findIndex((m) => m.id === tempAsst.id)
          if (idx >= 0) copy[idx] = { ...copy[idx], content: copy[idx].content + delta }
          return copy
        })
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, defaultInstructions || '')

      // refresca desde BD (para tener ids reales y título actualizado)
      await refreshSessions(sid)
      const msgs = await getMessages(sid)
      setMessages(msgs)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const activeTitle = useMemo(() => {
    const s = sessions.find((x) => x.id === activeSessionId)
    return s?.title || 'Chat'
  }, [sessions, activeSessionId])

  const effectiveModeLabel = useMemo(() => {
    if (instrMode === 'chat') return 'Instrucciones (este chat)'
    return 'Instrucciones (globales)'
  }, [instrMode])

  const effectiveModeSub = useMemo(() => {
    if (instrMode === 'chat') return 'Se guardan en el chat seleccionado'
    return 'Siempre se aplican a cualquier prompt (todos los chats)'
  }, [instrMode])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">Ollama Local Chat</div>
          <div className="brand-sub">Django + React + Postgres</div>
        </div>

        <button className="btn" onClick={onNewChat}>Nuevo chat</button>

        <div className="sessions">
          {sessions.map((s) => (
            <div key={s.id} className="session-row">
              <button
                className={`session-select ${s.id === activeSessionId ? 'active' : ''}`}
                onClick={() => setActiveSessionId(s.id)}
                title={s.title || s.id}
              >
                <div className="session-title">{s.title || '(sin título)'}</div>
                {s.last_message ? (
                  <div className="session-last">{s.last_message.role}: {s.last_message.content.slice(0, 50)}</div>
                ) : (
                  <div className="session-last">Sin mensajes</div>
                )}
              </button>

              <button
                className="session-del"
                onClick={() => onDeleteChat(s.id)}
                disabled={loading}
                title="Eliminar chat"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="muted">Tip: si no responde, revisa que Ollama esté en http://localhost:11434</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">{activeTitle}</div>
          <div className="topbar-right">
            <button
              className="btn"
              onClick={() => openInstructionsModal()}
              disabled={loading}
              title="Abrir instrucciones personalizadas"
            >
              Instrucciones
            </button>

            {activeSessionId ? (
              <button
                className="btn danger"
                onClick={() => onDeleteChat(activeSessionId)}
                disabled={loading}
                title="Eliminar chat actual"
              >
                Eliminar chat
              </button>
            ) : null}

            <span className={`pill ${loading ? 'pill-live' : ''}`}>{loading ? 'Generando...' : 'Listo'}</span>
          </div>
        </header>

        <section className="chat">
          {messages.map((m) => (
            <div key={m.id}>
              <MessageBubble role={m.role} content={m.content} />
              <div className="msg-time">{formatDate(m.created_at)}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </section>

        <footer className="composer">
          {error ? <div className="error">{error}</div> : null}
          <div className="composer-row">
            <textarea
              className="input"
              placeholder="Escribe tu mensaje..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              rows={2}
              disabled={loading}
            />
            <button className="btn primary" onClick={onSend} disabled={loading || !input.trim()}>
              Enviar
            </button>
          </div>
          <div className="muted">Enter para enviar · Shift+Enter para salto de línea</div>
        </footer>
      </main>

      {instrOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setInstrOpen(false)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Instrucciones personalizadas">
            <div className="modal-header">
              <div>
                <div className="modal-title">{effectiveModeLabel}</div>
                <div className="modal-subtitle">{effectiveModeSub}</div>
              </div>
              <button className="modal-close" onClick={() => setInstrOpen(false)} title="Cerrar">
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-tabs">
                <button
                  className={`tab ${instrMode === 'default' ? 'active' : ''}`}
                  onClick={() => {
                    setInstrMode('default')
                    setInstrDraft((defaultInstructions || '').toString())
                    setInstrDirty(false)
                  }}
                  disabled={loading}
                  title="Instrucciones globales (siempre se aplican)"
                >
                  Global
                </button>

                <button
                  className={`tab ${instrMode === 'chat' ? 'active' : ''}`}
                  onClick={() => {
                    if (!activeSessionId) return
                    setInstrMode('chat')
                    setInstrDraft((activeSession?.custom_instructions || '').toString())
                    setInstrDirty(false)
                  }}
                  disabled={loading || !activeSessionId}
                  title={activeSessionId ? 'Instrucciones solo para este chat' : 'Selecciona un chat primero'}
                >
                  Este chat
                </button>
              </div>

              <textarea
                className="input modal-textarea"
                placeholder="Ej: Responde en español, sé conciso, usa bullets, etc."
                value={instrDraft}
                onChange={(e) => {
                  setInstrDraft(e.target.value)
                  setInstrDirty(true)
                }}
                rows={8}
                disabled={loading}
              />
            </div>

            <div className="modal-footer">
              <div className="modal-hint">
                Se aplican como <b>system prompt</b>. ESC para cerrar.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={() => setInstrOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button className="btn primary" onClick={saveInstructions} disabled={loading || !instrDirty}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}