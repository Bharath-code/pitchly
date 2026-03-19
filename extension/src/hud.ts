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

// ─── Init ────────────────────────────────────────────────────────────────────
export function initHUD(): void {
  if (document.getElementById('pitchly-hud')) return // already initialised

  // Inject stylesheet
  injectStyles()

  // Build DOM
  const hud = document.createElement('div')
  hud.id = 'pitchly-hud'
  hud.setAttribute('role', 'status')
  hud.setAttribute('aria-live', 'polite')
  hud.setAttribute('aria-atomic', 'false')

  hud.innerHTML = `
    <div class="sc-header">
      <span class="sc-objection-badge" id="sc-objection-badge"></span>
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
  `

  document.body.appendChild(hud)
  hudEl = hud
  responseEl = document.getElementById('sc-response-text') as HTMLDivElement

  // Close button
  document.getElementById('sc-close-btn')!.addEventListener('click', dismissHUDCard)

  // Hover → pause auto-dismiss timer
  hud.addEventListener('mouseenter', pauseDismissTimer)
  hud.addEventListener('mouseleave', () => {
    if (hudEl?.classList.contains('sc-visible')) resumeDismissTimer()
  })

  // Escape key → dismiss
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hudEl?.classList.contains('sc-visible')) {
      dismissHUDCard()
    }
  })

  // Tab → close button (focus trapping for keyboard nav)
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

  // Set objection label immediately
  const badge = document.getElementById('sc-objection-badge')
  if (badge) {
    badge.textContent = objectionType.replace(/_/g, ' ') + ' objection'
    badge.className = `sc-objection-badge sc-badge-${objectionType}`
  }

  // Clear confidence
  const conf = document.getElementById('sc-confidence')
  if (conf) conf.textContent = ''

  // Clear response text
  responseEl.textContent = ''
  responseEl.classList.add('sc-streaming')

  // Show progress bar
  startProgressBar()

  // Show card with transition
  hudEl.classList.remove('sc-visible') // reset in case already visible
  requestAnimationFrame(() => {
    hudEl!.classList.add('sc-visible')
  })

  // Reset dismiss timer
  clearDismissTimer()
}

// ─── Append streaming text (token-by-token) ───────────────────────────────────
export function appendHUDText(delta: string): void {
  // Batch DOM updates via requestAnimationFrame
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

  // Flush any remaining buffered text
  if (rafQueue.length > 0 && responseEl) {
    responseEl.textContent += rafQueue.join('')
    rafQueue = []
  }

  // Remove streaming cursor
  responseEl?.classList.remove('sc-streaming')

  // Show confidence badge
  const conf = document.getElementById('sc-confidence')
  if (conf) {
    const pct = Math.round(card.confidence * 100)
    conf.textContent = `${pct}%`
    conf.title = `AI confidence: ${pct}%`
  }

  // Start auto-dismiss timer
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
  notice.textContent = '⚠️ ' + message
  notice.id = 'sc-notice'

  const existing = document.getElementById('sc-notice')
  if (existing) existing.remove()

  hudEl.insertAdjacentElement('beforeend', notice)
  hudEl.classList.add('sc-visible')

  // Auto-hide notice after 8s
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
  // Restart with reduced time after hover
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

  // Try to load external CSS from extension (good for caching)
  try {
    const link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    link.href = chrome.runtime.getURL('dist/hud.css')
    document.head.appendChild(link)
  } catch {
    // Fallback: inject minimal inline styles if chrome.runtime unavailable
    injectInlineStyles()
  }
}

function injectInlineStyles(): void {
  const style = document.createElement('style')
  style.textContent = getInlineCSS()
  document.head.appendChild(style)
}

// Inline CSS fallback (also served via hud.css — this is the canonical source)
function getInlineCSS(): string {
  return `
    #pitchly-hud {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 360px;
      max-width: min(90vw, 360px);
      background: rgba(13, 13, 28, 0.92);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid rgba(139, 92, 246, 0.25);
      border-radius: 14px;
      padding: 14px 16px 10px;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #e2e8f0;
      z-index: 2147483647;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1);
      transform: translateY(16px) scale(0.97);
      opacity: 0;
      pointer-events: none;
      transition: transform 200ms cubic-bezier(0.34,1.56,0.64,1),
                  opacity 150ms ease;
    }
    #pitchly-hud.sc-visible {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: all;
    }
    .sc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      gap: 8px;
    }
    .sc-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .sc-objection-badge {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.08em;
      background: rgba(139, 92, 246, 0.15);
      color: #a78bfa;
      padding: 3px 9px;
      border-radius: 100px;
      border: 1px solid rgba(139, 92, 246, 0.3);
      white-space: nowrap;
    }
    .sc-confidence {
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
    }
    .sc-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      color: #475569;
      cursor: pointer;
      border-radius: 6px;
      transition: color 150ms ease, background 150ms ease;
      padding: 0;
    }
    .sc-close:hover {
      color: #e2e8f0;
      background: rgba(255,255,255,0.08);
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
    }
    .sc-response.sc-streaming::after {
      content: '▋';
      color: #a78bfa;
      animation: sc-blink 0.9s infinite;
      margin-left: 1px;
    }
    @keyframes sc-blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    .sc-progress {
      margin-top: 10px;
      height: 2px;
      background: rgba(255,255,255,0.06);
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
      color: #f59e0b;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    @media (prefers-reduced-motion: reduce) {
      #pitchly-hud {
        transition: none;
      }
      .sc-response.sc-streaming::after {
        animation: none;
      }
    }
    @media (prefers-color-scheme: light) {
      #pitchly-hud {
        background: rgba(255, 255, 255, 0.95);
        color: #1e293b;
        border-color: rgba(139, 92, 246, 0.3);
      }
      .sc-response { color: #334155; }
      .sc-close { color: #94a3b8; }
      .sc-close:hover { background: rgba(0,0,0,0.06); color: #1e293b; }
    }
  `
}
