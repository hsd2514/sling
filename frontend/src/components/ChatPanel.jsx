import { useState, useRef, useEffect } from 'react'
import { sendMessage } from '../api/chat'

export default function ChatPanel({ sessionId }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Ask about binding sites, residues, or compound fit. I\'ll reason over this exact protein session.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const history = messages.filter((m) => m.role !== 'system')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)
    try {
      const { data } = await sendMessage(sessionId, text, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not reach AI service. Check backend logs and Gemini key.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--field)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--ink-soft)' }}>
          Gemini Scientist
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[88%] rounded-2xl px-3 py-2 leading-relaxed"
              style={
                m.role === 'user'
                  ? { background: 'var(--accent)', color: 'white' }
                  : { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)' }
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)', background: 'white' }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--line)' }}>
        <input
          className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', background: 'white', color: 'var(--ink)' }}
          placeholder="Ask about this protein session..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--accent)', color: 'white', opacity: loading ? 0.6 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
