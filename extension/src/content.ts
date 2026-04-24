// content.ts — Injected into Google Meet and Zoom tabs
// Responsibilities: HUD init, AgentClient WebSocket, audio streaming (dual-stream)

import { initHUD, startStreamingCard, appendHUDText, finalizeHUDCard, dismissHUDCard, showNotice, showCallHUD, hideCallHUD, updateTalkRatio, updateSentiment, updateNudge, showSnapshotPreview } from './hud'
import type { AgentMessage, ExtMessage, PopupSettings } from './types'

// ─── State ───────────────────────────────────────────────────────────────────
let ws: WebSocket | null = null
let audioCtx: AudioContext | null = null
let isConnected = false
let isStarting = false           // Guards against concurrent startSession calls
let activeStreams: MediaStream[] = [] // Tracked for cleanup on stop
let callStartTime = 0

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
      showCallHUD()
      console.log('[Pitchly] WebSocket connected')

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
      console.log(`[Pitchly] WebSocket closed: ${e.code} ${e.reason}`)
      if (activeStreams.length > 0) {
        cleanupAudio()
        hideCallHUD()
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
  // Send call_ended before cleanup so worker can finalize
  if (ws?.readyState === WebSocket.OPEN && callStartTime > 0) {
    const durationMs = Date.now() - callStartTime
    ws.send(JSON.stringify({
      type: 'call_ended',
      durationMs,
      repEmail: sessionSettings.repEmail,
      managerEmail: sessionSettings.managerEmail,
      webhookUrl: sessionSettings.webhookUrl,
    }))
  }

  cleanupAudio()

  ws?.close(1000, 'User stopped session')
  ws = null
  isConnected = false
  isStarting = false
  callStartTime = 0
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

    case 'talk_ratio':
      updateTalkRatio(msg.you, msg.them)
      updateNudge(msg.nudge, msg.sentimentNudge)
      if (msg.sentiment) updateSentiment(msg.sentiment)
      break

    case 'snapshot_preview':
      showSnapshotPreview(msg)
      break

    case 'error':
      console.error('[Pitchly] Agent error:', msg.message)
      break

    case 'call_ended_ack':
      // Silently ignore — worker acknowledged call end
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

    // ── STT Node: sends audio to worker for Deepgram transcription ──
    const sttNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')

    sttNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
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

    // ── RMS Nodes: local volume analysis for talk ratio (mixed mode only) ──
    let micRmsNode: AudioWorkletNode | null = null
    let tabRmsNode: AudioWorkletNode | null = null

    if (hasTab) {
      micRmsNode = new AudioWorkletNode(audioCtx, 'pitchly-processor')
      micRmsNode.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
        const rms = calculateRMS(e.data.pcm)
        micEnergySum += rms * rms * e.data.pcm.length
        micSampleCount += e.data.pcm.length
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
