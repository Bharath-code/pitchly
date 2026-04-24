// popup.ts — Extension popup logic
// Shows: Start/Stop button, connection status, audio mode, email settings

import type { CaptureMode, ExtMessage, PopupSettings } from './types'

const DEFAULT_HOST = 'pitchly-worker.kumarbharath63.workers.dev'

// ─── Storage keys ────────────────────────────────────────────────────────────
const STORAGE_KEYS: (keyof PopupSettings | 'isListening' | 'audioMode')[] = [
  'workerHost',
  'repEmail',
  'managerEmail',
  'webhookUrl',
  'isListening',
  'audioMode',
]

// ─── Icons ───────────────────────────────────────────────────────────────────
const ICON_PLAY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
const ICON_STOP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`
const ICON_SPINNER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

// ─── DOM Refs ────────────────────────────────────────────────────────────────
const startStopBtn = document.getElementById('start-stop-btn') as HTMLButtonElement
const btnText = document.getElementById('btn-text') as HTMLSpanElement
const btnIcon = document.getElementById('btn-icon') as HTMLSpanElement
const statusBadge = document.getElementById('status-badge') as HTMLSpanElement
const audioModeBadge = document.getElementById('audio-mode-badge') as HTMLSpanElement
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement

const inputs = {
  workerHost: document.getElementById('worker-host') as HTMLInputElement,
  repEmail: document.getElementById('rep-email') as HTMLInputElement,
  managerEmail: document.getElementById('manager-email') as HTMLInputElement,
  webhookUrl: document.getElementById('webhook-url') as HTMLInputElement,
}

// ─── Load persisted state ────────────────────────────────────────────────────
async function loadState(): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEYS)

  const isListening = data.isListening as boolean ?? false
  const audioMode = data.audioMode as CaptureMode | undefined

  renderState(isListening, audioMode)

  inputs.workerHost.value = data.workerHost as string ?? DEFAULT_HOST
  inputs.repEmail.value = data.repEmail as string ?? ''
  inputs.managerEmail.value = data.managerEmail as string ?? ''
  inputs.webhookUrl.value = data.webhookUrl as string ?? ''
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

// ─── Save Settings ───────────────────────────────────────────────────────────
async function saveSettings(): Promise<void> {
  const settings: PopupSettings = {
    workerHost: inputs.workerHost.value.trim() || DEFAULT_HOST,
    repEmail: inputs.repEmail.value.trim() || undefined,
    managerEmail: inputs.managerEmail.value.trim() || undefined,
    webhookUrl: inputs.webhookUrl.value.trim() || undefined,
  }

  await chrome.storage.local.set(settings)

  // Visual feedback
  const originalText = saveSettingsBtn.textContent
  saveSettingsBtn.innerHTML = `${ICON_CHECK} Saved`
  saveSettingsBtn.classList.add('saved')

  setTimeout(() => {
    saveSettingsBtn.textContent = originalText
    saveSettingsBtn.classList.remove('saved')
  }, 1500)
}

saveSettingsBtn.addEventListener('click', saveSettings)

// ─── Auto-save on input blur ─────────────────────────────────────────────────
Object.values(inputs).forEach((input) => {
  input.addEventListener('blur', () => {
    saveSettings().catch(() => {})
  })
})

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

    // Ensure settings are saved before starting
    await saveSettings()

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_SESSION',
        tabStreamId: undefined,
      } satisfies ExtMessage) as { ok: boolean; mode: CaptureMode | undefined; error: string | undefined }

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
