// popup.ts — Extension popup logic
// Shows: Start/Stop button, connection status, audio mode

import type { CaptureMode, ExtMessage } from './types'

const WORKER_HOST_KEY = 'workerHost'
const DEFAULT_HOST = 'pitchly-worker.YOURNAME.workers.dev'

// ─── DOM Refs ────────────────────────────────────────────────────────────────
const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement
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
    startStopBtn.textContent = '⏹ Stop Listening'
    startStopBtn.classList.add('active')
    setStatus('Listening', 'listening')
  } else {
    startStopBtn.textContent = '▶ Start Listening'
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
    case 'mixed': return '🎧 Tab + Mic'
    case 'tab': return '🖥 Tab Only'
    case 'mic-only': return '🎤 Mic Only'
  }
}

// ─── Button Action ────────────────────────────────────────────────────────────
startStopBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('isListening')
  const isListening = data.isListening as boolean ?? false

  if (isListening) {
    // Stop
    setStatus('Stopping…', 'connecting')
    await chrome.runtime.sendMessage({ type: 'STOP_SESSION' } satisfies ExtMessage)
    await chrome.storage.local.set({ isListening: false, audioMode: null })
    renderState(false)
  } else {
    // Start
    setStatus('Connecting…', 'connecting')
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
        console.error('[Pitchly] Start failed:', response.error)
      }
    } catch (err) {
      setStatus('Error', 'error')
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
