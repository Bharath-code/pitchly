// content.ts — Injected into Google Meet and Zoom tabs
// Responsibilities: HUD init, AgentClient WebSocket, audio streaming (dual-stream)

import { initHUD, startStreamingCard, appendHUDText, finalizeHUDCard, dismissHUDCard, showNotice, showCallHUD, hideCallHUD, updateTalkRatio, updateSentiment, updateNudge, showSnapshotPreview, setFeedbackHandler } from './hud'
import type { AgentMessage, ExtMessage, PopupSettings, Speaker } from './types'

// ─── State ───────────────────────────────────────────────────────────────────
let ws: WebSocket | null = null
let audioCtx: AudioContext | null = null
let isConnected = false
let isStarting = false           // Guards against concurrent startSession calls
let activeStreams: MediaStream[] = [] // Tracked for cleanup on stop
let callStartTime = 0

// Diagnostics
let sessionStartTime = 0
let messagesSent = 0
let messagesReceived = 0
let audioChunksSent = 0

// Talk ratio accumulators
let micEnergySum = 0
let micSampleCount = 0
let tabEnergySum = 0
let tabSampleCount = 0
let talkRatioInterval: ReturnType<typeof setInterval> | null = null

// Cached settings for this session
let sessionSettings: PopupSettings = {
  workerHost: undefined,
  repEmail: undefined,
  managerEmail: undefined,
  webhookUrl: undefined,
}

// ─── Boot ────────────────────────────────────────────────────────────────────
initHUD()

// Wire up feedback handler — sends objection feedback via WebSocket
setFeedbackHandler((helpful: boolean, objectionType: string) => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'objection_feedback',
      helpful,
      objectionType,
    }))
  }
})

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
    // Load settings from storage
    const storage = await chrome.storage.local.get(['workerHost', 'repEmail', 'managerEmail', 'webhookUrl'])
    sessionSettings = {
      workerHost: storage.workerHost as string | undefined,
      repEmail: storage.repEmail as string | undefined,
      managerEmail: storage.managerEmail as string | undefined,
      webhookUrl: storage.webhookUrl as string | undefined,
    }

    const workerHost = sessionSettings.workerHost || 'localhost:8787'
    const isLocal = workerHost.includes('localhost') || workerHost.includes('127.0.0.1')
    const protocol = isLocal ? 'ws' : 'wss'

    const sessionName = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const wsUrl = `${protocol}://${workerHost}/agents/call-session-agent/${sessionName}`
    ws = new WebSocket(wsUrl)

    ws.addEventListener('open', () => {
      isConnected = true
      isStarting = false
      callStartTime = Date.now()
      sessionStartTime = Date.now()
      messagesReceived = 0
      messagesSent = 0
      audioChunksSent = 0
      showCallHUD()
      console.log(`[Pitchly] WebSocket connected to ${workerHost} at ${new Date().toISOString()}`)

      // Send settings immediately so worker has them even if call_ended misses
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'session_settings',
          repEmail: sessionSettings.repEmail,
          managerEmail: sessionSettings.managerEmail,
          webhookUrl: sessionSettings.webhookUrl,
        }))
      }
    })

    ws.addEventListener('message', handleAgentMessage)

    ws.addEventListener('close', (e) => {
      isConnected = false
      isStarting = false
      const duration = sessionStartTime > 0 ? ` (session: ${Math.round((Date.now() - sessionStartTime) / 1000)}s)` : ''
      const stats = ` | sent: ${messagesSent} audio: ${audioChunksSent} recv: ${messagesReceived}`
      console.log(`[Pitchly] WebSocket closed: code=${e.code} reason=${e.reason}${duration}${stats}`)
      if (e.code !== 1000) {
        console.warn(`[Pitchly] Unexpected close code ${e.code} — may indicate network or worker error`)
      }
      if (activeStreams.length > 0) {
        cleanupAudio()
        hideCallHUD()
      }
    })

    ws.addEventListener('error', (e) => {
      console.error('[Pitchly] WebSocket error — check worker status and network connectivity:', e)
      isStarting = false
      showNotice('Connection error — check worker URL and network')
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
  const sessionDuration = callStartTime > 0 ? Math.round((Date.now() - callStartTime) / 1000) : 0
  console.log(`[Pitchly] Stopping session after ${sessionDuration}s. Sent: ${messagesSent} audio chunks: ${audioChunksSent} recv: ${messagesReceived}`)

  // Send call_ended before cleanup so worker can finalize
  if (ws?.readyState === WebSocket.OPEN && callStartTime > 0) {
    const durationMs = Date.now() - callStartTime
    console.log('[Pitchly] Sending call_ended to worker')
    ws.send(JSON.stringify({
      type: 'call_ended',
      durationMs,
      repEmail: sessionSettings.repEmail,
      managerEmail: sessionSettings.managerEmail,
      webhookUrl: sessionSettings.webhookUrl,
    }))
  } else {
    console.warn('[Pitchly] Cannot send call_ended — WebSocket not open or no call active')
  }

  cleanupAudio()

  ws?.close(1000, 'User stopped session')
  ws = null
  isConnected = false
  isStarting = false
  callStartTime = 0
  sessionStartTime = 0
  hideCallHUD()
}

// Stop all media tracks and close audio context
function cleanupAudio(): void {
  if (talkRatioInterval) {
    clearInterval(talkRatioInterval)
    talkRatioInterval = null
  }

  activeStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => track.stop())
  })
  activeStreams = []

  audioCtx?.close().catch(() => {})
  audioCtx = null

  // Reset accumulators
  micEnergySum = 0
  micSampleCount = 0
  tabEnergySum = 0
  tabSampleCount = 0
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

  messagesReceived++

  switch (msg.type) {
    case 'objection_start':
      console.log(`[Pitchly] Objection detected: ${msg.objection}`)
      startStreamingCard(msg.objection)
      break

    case 'stream_delta':
      appendHUDText(msg.delta)
      break

    case 'objection_card':
      console.log(`[Pitchly] Card finalized: ${msg.card.objection} (${Math.round(msg.card.confidence * 100)}%)`)
      finalizeHUDCard(msg.card)
      break

    case 'no_objection':
      console.log('[Pitchly] No objection detected — dismissing card')
      dismissHUDCard()
      break

    case 'talk_ratio':
      updateTalkRatio(msg.you, msg.them)
      updateNudge(msg.nudge, msg.sentimentNudge)
      if (msg.sentiment) updateSentiment(msg.sentiment)
      break

    case 'snapshot_preview':
      console.log(`[Pitchly] Snapshot received: ${msg.objections.length} objections, DB persisted: ${msg.dbPersisted}`)
      showSnapshotPreview(msg)
      break

    case 'error':
      console.error('[Pitchly] Agent error:', msg.message)
      showNotice(`Error: ${msg.message}`)
      break

    case 'call_ended_ack':
      console.log('[Pitchly] Worker acknowledged call end')
      break

    default:
      console.warn('[Pitchly] Unknown agent message type:', (msg as AgentMessage).type)
  }
}

// ─── Audio Streaming via AudioWorklet (Dual-Stream) ──────────────────────────
async function startAudioStreaming(tabStreamId?: string): Promise<void> {
  try {
    audioCtx = new AudioContext({ sampleRate: 16000 })

    // Load the AudioWorklet processor
    const processorUrl = chrome.runtime.getURL('audio-processor.js')
    await audioCtx.audioWorklet.addModule(processorUrl)

    let hasTab = !!tabStreamId

    // ── STT Node: sends prospect audio to worker for transcription + objection detection ──
    // In mixed mode this carries tab audio (remote participants = prospect).
    // In mic-only fallback it carries mic audio, still labeled 'prospect' so
    // objection detection runs (degraded — rep/prospect are not separable here).
    const sttNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')

    sttNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
      sendAudioChunk(e.data.pcm, 'prospect')
    }

    // ── RMS Nodes: local volume analysis for talk ratio (mixed mode only) ──
    let micRmsNode: AudioWorkletNode | null = null
    let tabRmsNode: AudioWorkletNode | null = null

    if (hasTab) {
      micRmsNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')
      micRmsNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
        const rms = calculateRMS(e.data.pcm)
        micEnergySum += rms * rms * e.data.pcm.length
        micSampleCount += e.data.pcm.length
        // Mic = the rep. Transcribe for the post-call transcript (no objection
        // detection runs on this side — see worker processAudioChunk).
        sendAudioChunk(e.data.pcm, 'rep')
      }

      tabRmsNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')
      tabRmsNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
        const rms = calculateRMS(e.data.pcm)
        tabEnergySum += rms * rms * e.data.pcm.length
        tabSampleCount += e.data.pcm.length
      }
    }

    // Capture tab audio if stream ID was provided (browser meetings)
    if (hasTab) {
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
        tabSource.connect(sttNode)
        tabSource.connect(tabRmsNode!)
        console.log('[Pitchly] Tab audio capture active')
      } catch (err) {
        console.warn('[Pitchly] Tab audio capture failed, using mic only:', err)
        hasTab = false
      }
    }

    // Always capture mic audio
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

    if (hasTab) {
      // Mixed mode: mic goes to RMS node only (not sent to worker)
      micSource.connect(micRmsNode!)
    } else {
      // Mic-only mode: mic is the only audio, send to worker for STT
      micSource.connect(sttNode)
    }

    // Start periodic talk ratio calculation (every 5s)
    if (hasTab) {
      talkRatioInterval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        if (micSampleCount === 0 && tabSampleCount === 0) return

        const micRMS = micSampleCount > 0 ? Math.sqrt(micEnergySum / micSampleCount) : 0
        const tabRMS = tabSampleCount > 0 ? Math.sqrt(tabEnergySum / tabSampleCount) : 0
        const total = micRMS + tabRMS

        let you = 50
        let them = 50
        if (total > 0) {
          you = Math.round((micRMS / total) * 100)
          them = Math.round((tabRMS / total) * 100)
        }

        messagesSent++
        ws.send(JSON.stringify({ type: 'talk_ratio', you, them }))

        // Reset accumulators
        micEnergySum = 0
        micSampleCount = 0
        tabEnergySum = 0
        tabSampleCount = 0
      }, 5000)
    }

    console.log('[Pitchly] Audio streaming started (dual-stream, mode:', hasTab ? 'mixed' : 'mic-only', ')')

  } catch (err) {
    console.error('[Pitchly] Audio streaming failed:', err)
    cleanupAudio()
    showNotice('Audio capture failed — check microphone permissions')
  }
}

// ─── Audio Chunk Sender ──────────────────────────────────────────────────────
function sendAudioChunk(pcm: Float32Array, speaker: Speaker): void {
  if (ws?.readyState !== WebSocket.OPEN) {
    if (audioChunksSent > 0 && audioChunksSent % 50 === 0) {
      console.warn(`[Pitchly] Audio chunk dropped — WebSocket not open (state: ${ws?.readyState})`)
    }
    return
  }
  audioChunksSent++
  messagesSent++
  ws.send(JSON.stringify({ type: 'audio_chunk', data: encodeFloat32Base64(pcm), speaker }))
}

// Encode Float32 PCM samples to base64 (lossless, ~3.4x smaller than number[] JSON)
function encodeFloat32Base64(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  const CHUNK = 0x8000 // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// ─── RMS Calculation ─────────────────────────────────────────────────────────
function calculateRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    sum += s * s
  }
  return Math.sqrt(sum / samples.length)
}
