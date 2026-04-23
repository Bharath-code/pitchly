// background.ts — MV3 Service Worker
// Handles: popup messaging, tab stream ID acquisition, keepalive alarm

import type { CaptureMode, ExtMessage } from './types'

// ─── Keepalive: prevent MV3 service worker from sleeping mid-call ──────────
chrome.alarms.create('pitchly-keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pitchly-keepalive') {
    // noop — just keeps the service worker awake
  }
})

// ─── Session State ──────────────────────────────────────────────────────────
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
        // Forward START_SESSION to content script so it opens the WebSocket
        notifyContentScript(tab.id, {
          type: 'START_SESSION',
          tabStreamId: result.tabStreamId,
        })
        sendResponse({ ok: true, mode: result.mode })
      } else if (message.type === 'STOP_SESSION') {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
        if (tab?.id) {
          notifyContentScript(tab.id, { type: 'STOP_SESSION' })
        }
        stopCapture()
        sendResponse({ ok: true })
      } else if (message.type === 'GET_STATUS') {
        sendResponse({
          ok: true,
          listening: currentMode !== null,
          mode: currentMode,
        })
      }
    })()
    return true // keep message channel open for async sendResponse
  }
)

// ─── Audio Capture Setup: Get tab stream ID for content script ──────────────
async function startCapture(
  tabId: number
): Promise<{ mode: CaptureMode; tabStreamId?: string }> {
  stopCapture() // clean up any previous session

  // Try to get a tab stream ID so content script can capture meeting audio
  try {
    const tabStreamId = await getTabStreamId(tabId)
    currentMode = 'mixed'
    console.log('[Pitchly] Tab stream acquired — mixed mode')
    notifyContentScript(tabId, { type: 'AUDIO_MODE', mode: 'mixed' })
    return { mode: 'mixed', tabStreamId }
  } catch (_e) {
    console.warn('[Pitchly] Tab capture unavailable, falling back to mic-only...')
  }

  // Fallback: mic only (Zoom Desktop App / no tab audio permission)
  currentMode = 'mic-only'
  console.log('[Pitchly] Audio mode: mic-only')
  notifyContentScript(tabId, { type: 'AUDIO_MODE', mode: 'mic-only' })
  return { mode: 'mic-only' }
}

function stopCapture(): void {
  currentMode = null
}

// Get a stream ID the content script can use to capture tab audio
function getTabStreamId(consumerTabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { consumerTabId },
      (streamId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (!streamId) {
          reject(new Error('No stream ID returned'))
        } else {
          resolve(streamId)
        }
      }
    )
  })
}

// ─── Notify the content script running in the active tab ───────────────────
function notifyContentScript(tabId: number, message: ExtMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Content script may not be injected yet — safe to ignore
  })
}
