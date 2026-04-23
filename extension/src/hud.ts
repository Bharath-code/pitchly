// hud.ts — Floating heads-up display for streaming objection cards
// Pure DOM manipulation — no framework, no dependencies

import type { ObjectionCard, ObjectionType } from './types'

// ─── State ───────────────────────────────────────────────────────────────────
let hudEl: HTMLDivElement | null = null
let responseEl: HTMLDivElement | null = null
let dismissTimer: ReturnType<typeof setTimeout> | null = null
let rafQueue: string[] = []
let rafPending = false
let isStreaming = false

const AUTO_DISMISS_MS = 15_000

// ─── Objection type colors ───────────────────────────────────────────────────
const OBJECTION_COLORS: Record<ObjectionType, { bg: string; text: string; border: string; glow: string }> = {
  price:      { bg: 'rgba(239, 68, 68, 0.12)',  text: '#f87171', border: 'rgba(239, 68, 68, 0.25)',  glow: 'rgba(239, 68, 68, 0.15)' },
  timing:     { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)',  glow: 'rgba(245, 158, 11, 0.15)' },
  authority:  { bg: 'rgba(139, 92, 246, 0.12)',  text: '#a78bfa', border: 'rgba(139, 92, 246, 0.25)',  glow: 'rgba(139, 92, 246, 0.15)' },
  competitor: { bg: 'rgba(59, 130, 246, 0.12)',  text: '#60a5fa', border: 'rgba(59, 130, 246, 0.25)',  glow: 'rgba(59, 130, 246, 0.15)' },
  no_need:    { bg: 'rgba(107, 114, 128, 0.12)', text: '#9ca3af', border: 'rgba(107, 114, 128, 0.25)', glow: 'rgba(107, 114, 128, 0.15)' },
  trust:      { bg: 'rgba(16, 185, 129, 0.12)',  text: '#34d399', border: 'rgba(16, 185, 129, 0.25)',  glow: 'rgba(16, 185, 129, 0.15)' },
  roi:        { bg: 'rgba(14, 165, 233, 0.12)',  text: '#38bdf8', border: 'rgba(14, 165, 233, 0.25)',  glow: 'rgba(14, 165, 233, 0.15)' },
  complexity: { bg: 'rgba(168, 85, 247, 0.12)',  text: '#c084fc', border: 'rgba(168, 85, 247, 0.25)',  glow: 'rgba(168, 85, 247, 0.15)' },
  priority:   { bg: 'rgba(236, 72, 153, 0.12)',  text: '#f472b6', border: 'rgba(236, 72, 153, 0.25)',  glow: 'rgba(236, 72, 153, 0.15)' },
  ghost:      { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)', glow: 'rgba(148, 163, 184, 0.15)' },
}

// ─── Init ────────────────────────────────────────────────────────────────────
export function initHUD(): void {
  if (document.getElementById('pitchly-hud')) return

  injectStyles()

  const hud = document.createElement('div')
  hud.id = 'pitchly-hud'
  hud.setAttribute('role', 'status')
  hud.setAttribute('aria-live', 'polite')
  hud.setAttribute('aria-atomic', 'false')

  hud.innerHTML = `
    <div class="sc-card">
      <div class="sc-header">
        <div class="sc-header-left">
          <span class="sc-objection-badge" id="sc-objection-badge"></span>
        </div>
        <div class="sc-header-right">
          <span class="sc-confidence" id="sc-confidence"></span>
          <button class="sc-close" id="sc-close-btn" aria-label="Dismiss suggestion">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="sc-response" id="sc-response-text"></div>
      <div class="sc-progress" id="sc-progress">
        <div class="sc-progress-bar" id="sc-progress-bar"></div>
      </div>
    </div>
  `

  document.body.appendChild(hud)
  hudEl = hud
  responseEl = document.getElementById('sc-response-text') as HTMLDivElement

  document.getElementById('sc-close-btn')!.addEventListener('click', dismissHUDCard)

  hud.addEventListener('mouseenter', pauseDismissTimer)
  hud.addEventListener('mouseleave', () => {
    if (hudEl?.classList.contains('sc-visible')) resumeDismissTimer()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hudEl?.classList.contains('sc-visible')) {
      dismissHUDCard()
    }
  })

  hud.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      document.getElementById('sc-close-btn')?.focus()
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.id === 'sc-close-btn') {
      dismissHUDCard()
    }
  })
}

// ─── Show a new streaming card ────────────────────────────────────────────────
export function startStreamingCard(objectionType: ObjectionType): void {
  if (!hudEl || !responseEl) return

  isStreaming = true
  rafQueue = []
  rafPending = false

  const colors = OBJECTION_COLORS[objectionType]
  const badge = document.getElementById('sc-objection-badge')
  if (badge) {
    badge.textContent = objectionType.replace(/_/g, ' ')
    badge.style.background = colors.bg
    badge.style.color = colors.text
    badge.style.borderColor = colors.border
  }

  const conf = document.getElementById('sc-confidence')
  if (conf) conf.textContent = ''

  responseEl.textContent = ''
  responseEl.classList.add('sc-streaming')

  startProgressBar()

  // Reset and show with staggered entrance
  hudEl.classList.remove('sc-visible')
  const card = hudEl.querySelector('.sc-card') as HTMLElement
  if (card) {
    card.style.borderColor = colors.border
    card.style.boxShadow = `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${colors.border}, 0 0 20px ${colors.glow}`
  }

  requestAnimationFrame(() => {
    hudEl!.classList.add('sc-visible')
  })

  clearDismissTimer()
}

// ─── Append streaming text (token-by-token) ───────────────────────────────────
export function appendHUDText(delta: string): void {
  rafQueue.push(delta)
  if (!rafPending) {
    rafPending = true
    requestAnimationFrame(flushRafQueue)
  }
}

function flushRafQueue(): void {
  if (!responseEl) { rafPending = false; return }
  const text = rafQueue.join('')
  rafQueue = []
  rafPending = false
  responseEl.textContent += text
}

// ─── Lock in final card state ─────────────────────────────────────────────────
export function finalizeHUDCard(card: ObjectionCard): void {
  isStreaming = false

  if (rafQueue.length > 0 && responseEl) {
    responseEl.textContent += rafQueue.join('')
    rafQueue = []
  }

  responseEl?.classList.remove('sc-streaming')

  const conf = document.getElementById('sc-confidence')
  if (conf) {
    const pct = Math.round(card.confidence * 100)
    conf.textContent = `${pct}%`
    conf.title = `AI confidence: ${pct}%`
  }

  stopProgressBar()
  startDismissTimer()
}

// ─── Dismiss card ─────────────────────────────────────────────────────────────
export function dismissHUDCard(): void {
  hudEl?.classList.remove('sc-visible')
  clearDismissTimer()
  stopProgressBar()
  isStreaming = false
  rafQueue = []
}

// ─── Notice banner ────────────────────────────────────────────────────────────
export function showNotice(message: string): void {
  if (!hudEl) return

  const notice = document.createElement('div')
  notice.className = 'sc-notice'
  notice.textContent = message
  notice.id = 'sc-notice'

  const existing = document.getElementById('sc-notice')
  if (existing) existing.remove()

  hudEl.insertAdjacentElement('beforeend', notice)
  hudEl.classList.add('sc-visible')

  setTimeout(() => {
    notice.remove()
    if (!isStreaming) dismissHUDCard()
  }, 8000)
}

// ─── Timer helpers ────────────────────────────────────────────────────────────
function startDismissTimer(): void {
  clearDismissTimer()
  dismissTimer = setTimeout(dismissHUDCard, AUTO_DISMISS_MS)
}

function pauseDismissTimer(): void {
  clearDismissTimer()
}

function resumeDismissTimer(): void {
  dismissTimer = setTimeout(dismissHUDCard, AUTO_DISMISS_MS / 2)
}

function clearDismissTimer(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function startProgressBar(): void {
  const bar = document.getElementById('sc-progress-bar')
  if (!bar) return
  bar.style.transition = 'none'
  bar.style.width = '100%'
  requestAnimationFrame(() => {
    bar.style.transition = `width ${AUTO_DISMISS_MS}ms linear`
    bar.style.width = '0%'
  })
}

function stopProgressBar(): void {
  const bar = document.getElementById('sc-progress-bar')
  if (bar) bar.style.width = '0%'
}

// ─── CSS injection ────────────────────────────────────────────────────────────
function injectStyles(): void {
  const linkId = 'salescoach-styles'
  if (document.getElementById(linkId)) return

  try {
    const link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    link.href = chrome.runtime.getURL('hud.css')
    document.head.appendChild(link)
  } catch {
    injectInlineStyles()
  }
}

function injectInlineStyles(): void {
  const style = document.createElement('style')
  style.textContent = getInlineCSS()
  document.head.appendChild(style)
}

function getInlineCSS(): string {
  return `
    #pitchly-hud {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      transform: translateY(0);
      opacity: 0;
      pointer-events: none;
      transition: opacity 300ms cubic-bezier(0.2, 0, 0, 1);
    }
    #pitchly-hud.sc-visible {
      opacity: 1;
      pointer-events: all;
    }
    .sc-card {
      width: 380px;
      max-width: min(92vw, 420px);
      background: rgba(13, 13, 28, 0.95);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 16px;
      padding: 16px 18px 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.08);
      transform: translateY(12px) scale(0.97);
      opacity: 0;
      transition: transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  opacity 250ms cubic-bezier(0.2, 0, 0, 1);
    }
    #pitchly-hud.sc-visible .sc-card {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    .sc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 12px;
    }
    .sc-header-left {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .sc-header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .sc-objection-badge {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.1em;
      padding: 4px 10px;
      border-radius: 100px;
      border: 1px solid transparent;
      white-space: nowrap;
      transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
    }
    .sc-confidence {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    .sc-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      color: #64748b;
      cursor: pointer;
      border-radius: 8px;
      transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 100ms ease;
      padding: 0;
      flex-shrink: 0;
    }
    .sc-close:hover {
      color: #e2e8f0;
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.12);
    }
    .sc-close:active {
      transform: scale(0.92);
    }
    .sc-close:focus-visible {
      outline: 2px solid #a78bfa;
      outline-offset: 2px;
    }
    .sc-response {
      line-height: 1.65;
      color: #cbd5e1;
      min-height: 24px;
      word-break: break-word;
      font-size: 13.5px;
    }
    .sc-response.sc-streaming::after {
      content: '▋';
      color: #a78bfa;
      animation: sc-blink 0.9s infinite;
      margin-left: 2px;
    }
    @keyframes sc-blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    .sc-progress {
      margin-top: 12px;
      height: 2px;
      background: rgba(255,255,255,0.05);
      border-radius: 2px;
      overflow: hidden;
    }
    .sc-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #7c3aed, #a78bfa);
      border-radius: 2px;
      width: 100%;
    }
    .sc-notice {
      font-size: 12px;
      color: #fbbf24;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    @media (prefers-reduced-motion: reduce) {
      #pitchly-hud, .sc-card, .sc-close {
        transition: none;
      }
      .sc-response.sc-streaming::after {
        animation: none;
      }
    }
    @media (prefers-color-scheme: light) {
      .sc-card {
        background: rgba(255, 255, 255, 0.96);
        color: #1e293b;
        border-color: rgba(139, 92, 246, 0.2);
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(139,92,246,0.08);
      }
      .sc-response { color: #334155; }
      .sc-close { color: #94a3b8; background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.08); }
      .sc-close:hover { background: rgba(0,0,0,0.06); color: #1e293b; }
      .sc-confidence { color: #94a3b8; }
    }
  `
}
