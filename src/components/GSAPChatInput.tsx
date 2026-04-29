'use client'
import React, { useState, useRef, useEffect } from 'react'
import { useMetaballStore } from '@/store/metaballStore'

interface GSAPChatInputProps {
  isOpen: boolean
  onClose: () => void
  selectedBallId: number | null
}

export default function GSAPChatInput({ isOpen, onClose, selectedBallId }: GSAPChatInputProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const split = useMetaballStore(s => s.split)

  // 自动聚焦到输入框
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !selectedBallId || isLoading) return

    setIsLoading(true)
    try {
      // 调用现有的chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: input.trim() }]
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const { text } = await response.json()

      // 生成正反两个子球
      if (text) {
        // 简单地将回复分成正反两部分（实际项目中可能需要更复杂的逻辑）
        const words = text.split(' ')
        const midPoint = Math.floor(words.length / 2)
        const positive = words.slice(0, midPoint).join(' ')
        const negative = words.slice(midPoint).join(' ')

        // 使用现有的split方法生成两个子球
        split(selectedBallId)

        // 更新子球标签（这里需要扩展split方法支持自定义标签）
        // 暂时使用默认标签
      }

      setInput('')
      onClose()
    } catch (error) {
      console.error('Chat submission failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '380px',
          maxWidth: 'calc(100% - 2rem)',
          height: '120px',
          background: 'white',
          borderRadius: '6px',
          padding: '0.25rem',
          boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25em'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What do you want to build?"
              style={{
                width: '100%',
                flex: 1,
                resize: 'none',
                outline: 'none',
                fontSize: '0.875rem',
                fontWeight: 400,
                background: 'transparent',
                borderRadius: '2px',
                padding: '0.5em',
                border: 'none',
                fontFamily: 'inherit'
              }}
            />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: '2rem',
              paddingLeft: '2rem',
              width: '100%'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                    border: 0,
                    borderRadius: '6px',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                  aria-label="Minimize"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 14 10 14 10 20"></polyline>
                    <polyline points="20 10 14 10 14 4"></polyline>
                    <line x1="14" x2="21" y1="10" y2="3"></line>
                    <line x1="3" x2="10" y1="21" y2="14"></line>
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                    border: 0,
                    borderRadius: '6px',
                    background: input.trim() ? '#000' : '#ccc',
                    color: 'white',
                    cursor: input.trim() ? 'pointer' : 'not-allowed'
                  }}
                  aria-label="Submit"
                >
                  {isLoading ? (
                    <div style={{ width: '16px', height: '16px', border: '2px solid transparent', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 10 4 15 9 20"></polyline>
                      <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
