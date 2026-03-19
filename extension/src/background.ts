// background.ts — MV3 Service Worker
// Handles: three-tier audio capture, keepalive alarm, popup messaging

import type { CaptureMode, ExtMessage } from './types'

// ─── Keepalive: prevent MV3 service worker from sleeping mid-call ──────────
chrome.alarms.create('pitchly-keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pitchly-keepalive') {
    // noop — just keeps the service worker awake
  }
})

// ─── Session State ──────────────────────────────────────────────────────────
let activeStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let currentMode: CaptureMode | null = null

// ─── Message Router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: ExtMessage, _sender, sendResponse) => {
    ;(async () => {
      if (message.type === 'START_SESSION') {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'No active tab' })
          return
        }
        const result = await startCapture(tab.id)
        sendResponse({ ok: true, mode: result.mode })
      } else if (message.type === 'STOP_SESSION') {
        stopCapture()
        sendResponse({ ok: true })
      } else if (message.type === 'GET_STATUS') {
        sendResponse({
          ok: true,
          listening: activeStream !== null,
          mode: currentMode,
        })
      }
    })()
    return true // keep message channel open for async sendResponse
  }
)

// ─── Audio Capture: Three-Tier Fallback ─────────────────────────────────────
async function startCapture(
  tabId: number
): Promise<{ mode: CaptureMode }> {
  stopCapture() // clean up any previous session

  // Tier 1: Tab audio + mic mixed (browser meetings — best quality)
  try {
    const tabStream = await captureTab()
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    activeStream = mixStreams(tabStream, micStream)
    currentMode = 'mixed'
    console.log('[Pitchly] Audio mode: mixed (tab + mic)')
    notifyContentScript(tabId, { type: 'AUDIO_MODE', mode: 'mixed' })
    return { mode: 'mixed' }
  } catch (_e) {
    console.warn('[Pitchly] Tier 1 failed, trying tab-only...')
  }

  // Tier 2: Tab audio only (mic permission denied)
  try {
    activeStream = await captureTab()
    currentMode = 'tab'
    console.log('[Pitchly] Audio mode: tab only')
    notifyContentScript(tabId, { type: 'AUDIO_MODE', mode: 'tab' })
    return { mode: 'tab' }
  } catch (_e) {
    console.warn('[Pitchly] Tier 2 failed, falling back to mic-only...')
  }

  // Tier 3: Mic only (Zoom Desktop App / Teams Desktop)
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  activeStream = micStream
  currentMode = 'mic-only'
  console.log('[Pitchly] Audio mode: mic-only (Zoom Desktop detected)')
  notifyContentScript(tabId, { type: 'AUDIO_MODE', mode: 'mic-only' })
  return { mode: 'mic-only' }
}

function stopCapture(): void {
  activeStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop())
  audioContext?.close()
  activeStream = null
  audioContext = null
  currentMode = null
}

// chrome.tabCapture.capture() automatically targets the current tab — no tabId needed
function captureTab(): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture(
      { audio: true, video: false },
      (stream) => {
        if (stream) resolve(stream)
        else reject(new Error(chrome.runtime.lastError?.message ?? 'tabCapture failed'))
      }
    )
  })
}

function mixStreams(tab: MediaStream, mic: MediaStream): MediaStream {
  const ctx = new AudioContext({ sampleRate: 16000 })
  audioContext = ctx
  const dest = ctx.createMediaStreamDestination()
  ctx.createMediaStreamSource(tab).connect(dest)
  ctx.createMediaStreamSource(mic).connect(dest)
  return dest.stream
}

// ─── Notify the content script running in the active tab ───────────────────
function notifyContentScript(tabId: number, message: ExtMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Content script may not be injected yet — safe to ignore
  })
}


