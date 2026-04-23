// popup.ts — Extension popup logic
// Shows: Start/Stop button, connection status, audio mode

import type { CaptureMode, ExtMessage } from './types'

const WORKER_HOST_KEY = 'workerHost'
const DEFAULT_HOST = 'pitchly-worker.YOURNAME.workers.dev'

// ─── Icons ───────────────────────────────────────────────────────────────────
const ICON_PLAY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
const ICON_STOP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`
const ICON_SPINNER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`

// ─── DOM Refs ────────────────────────────────────────────────────────────────
const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement
const btnText = document.getElementById('btn-text') as HTMLSpanElement
const btnIcon = document.getElementById('btn-icon') as HTMLSpanElement
const statusBadge = document.getElementById('status-badge') as HTMLSpanElement
const audioModeBadge = document.getElementById('audio-mode-badge') as HTMLSpanElement
const workerHostInput = document.getElementById('worker-host') as HTMLInputElement

// ─── Load persisted state ────────────────────────────────────────────────────
async function loadState(): Promise<void> {
  const data = await chrome.storage.local.get(['isListening', 'audioMode', WORKER_HOST_KEY])

  const isListening = data.isListening as boolean ?? false
  const audioMode = data.audioMode as CaptureMode | undefined

  renderState(isListening, audioMode)
  workerHostInput.value = data[WORKER_HOST_KEY] as string ?? DEFAULT_HOST
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderState(listening: boolean, mode?: CaptureMode): void {
  if (listening) {
    btnText.textContent = 'Stop Listening'
    btnIcon.innerHTML = ICON_STOP
    startStopBtn.classList.add('active')
    setStatus('Listening', 'listening')
  } else {
    btnText.textContent = 'Start Listening'
    btnIcon.innerHTML = ICON_PLAY
    startStopBtn.classList.remove('active')
    setStatus('Idle', 'idle')
  }

  if (mode) {
    audioModeBadge.textContent = modeLabel(mode)
    audioModeBadge.className = `mode-badge mode-${mode}`
    audioModeBadge.style.display = 'inline-flex'
  } else {
    audioModeBadge.style.display = 'none'
  }
}

function setStatus(text: string, state: 'idle' | 'listening' | 'connecting' | 'error'): void {
  statusBadge.textContent = text
  statusBadge.className = `status-badge status-${state}`
}

function modeLabel(mode: CaptureMode): string {
  switch (mode) {
    case 'mixed': return 'Tab + Mic'
    case 'tab': return 'Tab Only'
    case 'mic-only': return 'Mic Only'
  }
}

// ─── Button Action ────────────────────────────────────────────────────────────
startStopBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('isListening')
  const isListening = data.isListening as boolean ?? false

  if (isListening) {
    // Stop
    setStatus('Stopping…', 'connecting')
    btnIcon.innerHTML = ICON_SPINNER
    startStopBtn.disabled = true

    await chrome.runtime.sendMessage({ type: 'STOP_SESSION' } satisfies ExtMessage)
    await chrome.storage.local.set({ isListening: false, audioMode: null })
    renderState(false)
    startStopBtn.disabled = false
  } else {
    // Start
    setStatus('Connecting…', 'connecting')
    btnIcon.innerHTML = ICON_SPINNER
    startStopBtn.disabled = true

    // Save worker host if changed
    const host = workerHostInput.value.trim()
    await chrome.storage.local.set({ [WORKER_HOST_KEY]: host })

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_SESSION',
      } satisfies ExtMessage) as { ok: boolean; mode?: CaptureMode; error?: string }

      if (response.ok) {
        await chrome.storage.local.set({ isListening: true, audioMode: response.mode })
        renderState(true, response.mode)
      } else {
        setStatus('Error', 'error')
        btnText.textContent = 'Start Listening'
        btnIcon.innerHTML = ICON_PLAY
        console.error('[Pitchly] Start failed:', response.error)
      }
    } catch (err) {
      setStatus('Error', 'error')
      btnText.textContent = 'Start Listening'
      btnIcon.innerHTML = ICON_PLAY
      console.error('[Pitchly] Could not start session:', err)
    } finally {
      startStopBtn.disabled = false
    }
  }
})

// ─── Listen for status updates from background ────────────────────────────────
chrome.runtime.onMessage.addListener((message: ExtMessage) => {
  if (message.type === 'AUDIO_MODE') {
    audioModeBadge.textContent = modeLabel(message.mode)
    audioModeBadge.className = `mode-badge mode-${message.mode}`
    audioModeBadge.style.display = 'inline-flex'
    chrome.storage.local.set({ audioMode: message.mode })
  }
})

// ─── Boot ────────────────────────────────────────────────────────────────────
loadState()
