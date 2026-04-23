// content.ts — Injected into Google Meet and Zoom tabs
// Responsibilities: HUD init, AgentClient WebSocket, audio streaming

import { initHUD, startStreamingCard, appendHUDText, finalizeHUDCard, dismissHUDCard, showNotice } from './hud'
import type { AgentMessage, ExtMessage } from './types'

// ─── State ───────────────────────────────────────────────────────────────────
let ws: WebSocket | null = null
let audioCtx: AudioContext | null = null
let isConnected = false
let isStarting = false           // Guards against concurrent startSession calls
let activeStreams: MediaStream[] = [] // Tracked for cleanup on stop

// ─── Boot ────────────────────────────────────────────────────────────────────
initHUD()

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message: ExtMessage) => {
  if (message.type === 'START_SESSION') {
    startSession(message.tabStreamId)
  } else if (message.type === 'STOP_SESSION') {
    stopSession()
  } else if (message.type === 'AUDIO_MODE') {
    if (message.mode === 'mic-only') {
      showNotice('Mic-only mode — join Zoom via browser for best results')
    }
  }
})

// ─── Session Lifecycle ───────────────────────────────────────────────────────
async function startSession(tabStreamId?: string): Promise<void> {
  if (isConnected || isStarting) return
  isStarting = true

  try {
    // Read worker host from storage (set via popup)
    const storage = await chrome.storage.local.get('workerHost')
    const workerHost = (storage.workerHost as string) || 'localhost:8787'
    const isLocal = workerHost.includes('localhost') || workerHost.includes('127.0.0.1')
    const protocol = isLocal ? 'ws' : 'wss'

    const sessionName = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const wsUrl = `${protocol}://${workerHost}/agents/call-session-agent/${sessionName}`
    ws = new WebSocket(wsUrl)

    ws.addEventListener('open', () => {
      isConnected = true
      isStarting = false
      console.log('[Pitchly] WebSocket connected')
    })

    ws.addEventListener('message', handleAgentMessage)

    ws.addEventListener('close', (e) => {
      isConnected = false
      isStarting = false
      console.log(`[Pitchly] WebSocket closed: ${e.code} ${e.reason}`)
      // If streams are still alive, the close was unexpected — clean up
      if (activeStreams.length > 0) {
        cleanupAudio()
        dismissHUDCard()
      }
    })

    ws.addEventListener('error', (e) => {
      console.error('[Pitchly] WebSocket error:', e)
      isStarting = false
    })

    // Start audio streaming once WS is open
    ws.addEventListener('open', async () => {
      await startAudioStreaming(tabStreamId)
    }, { once: true })

  } catch (err) {
    console.error('[Pitchly] Failed to start session:', err)
    isStarting = false
  }
}

function stopSession(): void {
  cleanupAudio()

  ws?.close(1000, 'User stopped session')
  ws = null
  isConnected = false
  isStarting = false
  dismissHUDCard()
}

// Stop all media tracks and close audio context
function cleanupAudio(): void {
  activeStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => track.stop())
  })
  activeStreams = []

  audioCtx?.close().catch(() => {})
  audioCtx = null
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
      startStreamingCard(msg.objection)
      break

    case 'stream_delta':
      appendHUDText(msg.delta)
      break

    case 'objection_card':
      finalizeHUDCard(msg.card)
      break

    case 'no_objection':
      dismissHUDCard()
      break

    case 'error':
      console.error('[Pitchly] Agent error:', msg.message)
      break
  }
}

// ─── Audio Streaming via AudioWorklet ────────────────────────────────────────
async function startAudioStreaming(tabStreamId?: string): Promise<void> {
  try {
    audioCtx = new AudioContext({ sampleRate: 16000 })

    // Load the AudioWorklet processor
    const processorUrl = chrome.runtime.getURL('audio-processor.js')
    await audioCtx.audioWorklet.addModule(processorUrl)

    const workletNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')

    // Receive PCM chunks from audio thread and send to worker
    workletNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
      if (ws?.readyState === WebSocket.OPEN) {
        const pcm = e.data.pcm
        ws.send(
          JSON.stringify({
            type: 'audio_chunk',
            data: Array.from(pcm),
          })
        )
      }
    }

    // Capture tab audio if stream ID was provided (browser meetings)
    if (tabStreamId) {
      try {
        const tabStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: tabStreamId,
            },
          },
        } as unknown as MediaStreamConstraints)
        activeStreams.push(tabStream)
        const tabSource = audioCtx.createMediaStreamSource(tabStream)
        tabSource.connect(workletNode)
        console.log('[Pitchly] Tab audio capture active')
      } catch (err) {
        console.warn('[Pitchly] Tab audio capture failed, using mic only:', err)
      }
    }

    // Always capture mic audio (sales rep's voice + speaker bleed)
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    activeStreams.push(micStream)
    const micSource = audioCtx.createMediaStreamSource(micStream)
    micSource.connect(workletNode)

    console.log('[Pitchly] Audio streaming started (AudioWorklet)')

  } catch (err) {
    console.error('[Pitchly] Audio streaming failed:', err)
    // Clean up any partial streams that may have been acquired
    cleanupAudio()
    showNotice('Audio capture failed — check microphone permissions')
  }
}
