// content.ts — Injected into Google Meet and Zoom tabs
// Responsibilities: HUD init, AgentClient WebSocket, audio streaming

import { initHUD, startStreamingCard, appendHUDText, finalizeHUDCard, dismissHUDCard, showNotice } from './hud'
import type { AgentMessage, ExtMessage } from './types'

// ─── Config ─────────────────────────────────────────────────────────────────
// Replace with your deployed worker URL (or keep localhost for dev)
const WORKER_HOST = 'pitchly-worker.YOURNAME.workers.dev'

// ─── State ───────────────────────────────────────────────────────────────────
let ws: WebSocket | null = null
let audioCtx: AudioContext | null = null
let isConnected = false

// ─── Boot ────────────────────────────────────────────────────────────────────
initHUD()

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message: ExtMessage) => {
  if (message.type === 'START_SESSION') {
    startSession()
  } else if (message.type === 'STOP_SESSION') {
    stopSession()
  } else if (message.type === 'AUDIO_MODE') {
    if (message.mode === 'mic-only') {
      showNotice('Mic-only mode — join Zoom via browser for best results')
    }
  }
})

// ─── Session Lifecycle ───────────────────────────────────────────────────────
async function startSession(): Promise<void> {
  if (isConnected) return

  try {
    // Connect to Cloudflare Agents SDK via WebSocket
    const sessionName = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const wsUrl = `wss://${WORKER_HOST}/agents/call-session-agent/${sessionName}`
    ws = new WebSocket(wsUrl)

    ws.addEventListener('open', () => {
      isConnected = true
      console.log('[Pitchly] WebSocket connected')
    })

    ws.addEventListener('message', handleAgentMessage)

    ws.addEventListener('close', (e) => {
      isConnected = false
      console.log(`[Pitchly] WebSocket closed: ${e.code} ${e.reason}`)
    })

    ws.addEventListener('error', (e) => {
      console.error('[Pitchly] WebSocket error:', e)
    })

    // Start audio streaming once WS is open
    ws.addEventListener('open', async () => {
      await startAudioStreaming()
    }, { once: true })

  } catch (err) {
    console.error('[Pitchly] Failed to start session:', err)
  }
}

function stopSession(): void {
  ws?.close(1000, 'User stopped session')
  ws = null
  audioCtx?.close()
  audioCtx = null
  isConnected = false
  dismissHUDCard()
}

// ─── Message Handler ─────────────────────────────────────────────────────────
function handleAgentMessage(event: MessageEvent<string>): void {
  let msg: AgentMessage

  try {
    msg = JSON.parse(event.data) as AgentMessage
  } catch {
    console.warn('[Pitchly] Non-JSON message from agent:', event.data)
    return
  }

  switch (msg.type) {
    case 'objection_start':
      // Show the card label immediately — text will stream in next
      startStreamingCard(msg.objection)
      break

    case 'stream_delta':
      // Token-by-token: append to card text
      appendHUDText(msg.delta)
      break

    case 'objection_card':
      // Final structured result — lock in card state
      finalizeHUDCard(msg.card)
      break

    case 'no_objection':
      // No actionable objection detected — keep card hidden
      dismissHUDCard()
      break

    case 'error':
      console.error('[Pitchly] Agent error:', msg.message)
      break
  }
}

// ─── Audio Streaming via AudioWorklet ────────────────────────────────────────
async function startAudioStreaming(): Promise<void> {
  try {
    // Request mic capture (background already has tabCapture stream)
    // The extension offloads actual tab capture to background; here we get mic
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    audioCtx = new AudioContext({ sampleRate: 16000 })

    // Load the AudioWorklet processor (compiled to dist/audio-processor.js)
    const processorUrl = chrome.runtime.getURL('dist/audio-processor.js')
    await audioCtx.audioWorklet.addModule(processorUrl)

    const source = audioCtx.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')

    // Receive PCM chunks from audio thread
    workletNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
      if (ws?.readyState === WebSocket.OPEN) {
        const pcm = e.data.pcm
        // Convert Float32Array to regular array for JSON — worker expects number[]
        ws.send(
          JSON.stringify({
            type: 'audio_chunk',
            data: Array.from(pcm),
          })
        )
      }
    }

    source.connect(workletNode)
    // Don't connect to destination — we don't want to play the captured audio back
    console.log('[Pitchly] Audio streaming started (AudioWorklet)')

  } catch (err) {
    console.error('[Pitchly] Audio streaming failed:', err)
  }
}
