// index.ts — Cloudflare Worker: CallSessionAgent
// Extends Cloudflare Agents SDK Agent class (Durable Object based)

import { Agent, routeAgentRequest } from 'agents'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateObject } from 'ai'
import { ObjectionSchema } from './schema'
import { OBJECTION_PROMPT } from './prompts'

// ─── Environment Types ──────────────────────────────────────────────────────
type Env = {
  // Secrets (set via wrangler secret put)
  GOOGLE_GENERATIVE_AI_API_KEY: string

  // Vars (from wrangler.toml [vars])
  AI_MODEL: string  // e.g. "gemini-2.5-flash"

  // Workers AI binding
  AI: Ai

  // Durable Object namespace
  CallSessionAgent: DurableObjectNamespace
}

// ─── CORS headers for Chrome Extension origin ────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',  // Tightened post-MVP to chrome-extension://
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
}

// ─── Confidence threshold — only push card if >= this ────────────────────────
const CONFIDENCE_THRESHOLD = 0.75

// ─── Sentiment keyword lexicon (Tier 1: rule-based) ──────────────────────────
// Word-boundary matching prevents "no" from matching "know" or "nothing"
const SENTIMENT_POSITIVE = ['love', 'perfect', 'great', 'excellent', 'amazing', 'happy', 'excited', 'awesome', 'fantastic', 'wonderful', 'ideal', 'yes', 'definitely', 'absolutely', 'sold', 'let\'s do it', 'let\'s go', 'sign me up']
const SENTIMENT_NEUTRAL  = ['maybe', 'not sure', 'expensive', 'complicated', 'think about it', 'consider', 'perhaps', 'possibly', 'compare', 'review', 'discuss']
const SENTIMENT_NEGATIVE = ['no', 'cancel', 'not interested', 'remove', 'unsubscribe', 'stop', 'don\'t want', 'too much', 'not going to', 'won\'t', 'never', 'bad', 'terrible', 'awful', 'hate', 'disappointed', 'frustrated', 'waste']

const SENTIMENT_ALPHA = 0.3 // EMA smoothing factor
const SENTIMENT_DECAY_MS = 10_000 // Decay toward neutral after 10s of silence

function keywordMatch(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

// ─── CallSessionAgent ─────────────────────────────────────────────────────────
export class CallSessionAgent extends Agent<Env> {
  // Buffer of transcript fragments until end-of-turn detected
  private utteranceBuffer: string[] = []
  // Prevent concurrent classifications (one objection check at a time)
  private classifying = false

  // Talk ratio history for this session
  private talkRatios: Array<{ you: number; them: number; timestamp: number }> = []

  // Real-time sentiment state (Tier 1: keyword EMA)
  private sentimentEMA = 0
  private lastSentimentAt = 0

  // Called when a new WebSocket connection opens
  async onConnect(connection: {
    id: string
    send: (data: string) => void
  }): Promise<void> {
    console.log(`[CallSessionAgent] Connection opened: ${connection.id}`)
    // Reset per-session state
    this.talkRatios = []
    this.utteranceBuffer = []
    this.classifying = false
    this.sentimentEMA = 0
    this.lastSentimentAt = 0
    // Send a ready signal so the extension knows WS is live
    connection.send(JSON.stringify({ type: 'ready', connectionId: connection.id }))
  }

  // Called for each WebSocket message from the extension
  async onMessage(
    connection: { id: string; send: (data: string) => void },
    message: string
  ): Promise<void> {
    let parsed: { type: string; data?: number[]; you?: number; them?: number; durationMs?: number }

    try {
      parsed = JSON.parse(message) as typeof parsed
    } catch {
      console.warn(`[CallSessionAgent] Non-JSON message from ${connection.id}`)
      return
    }

    if (parsed.type === 'audio_chunk' && parsed.data) {
      await this.processAudioChunk(connection, parsed.data)
    } else if (parsed.type === 'talk_ratio' && typeof parsed.you === 'number' && typeof parsed.them === 'number') {
      // Validate range
      const you = Math.max(0, Math.min(100, parsed.you))
      const them = Math.max(0, Math.min(100, parsed.them))
      this.talkRatios.push({ you, them, timestamp: Date.now() })

      // Talk-ratio nudge
      let nudge: string | undefined
      if (you > 75) nudge = '⚠️ Listen more!'
      else if (you < 30) nudge = '🎯 Ask a discovery question'

      // Sentiment state + nudge
      const sentiment = this.getSentimentState()
      const sentimentNudge = sentiment === 'at_risk' ? '⚠️ Sentiment dropped — acknowledge their concern' : undefined

      connection.send(JSON.stringify({ type: 'talk_ratio', you, them, nudge, sentiment, sentimentNudge }))
    } else if (parsed.type === 'call_ended' && typeof parsed.durationMs === 'number') {
      await this.handleCallEnded(connection, parsed.durationMs)
    }
    // Ignore unknown message types gracefully
  }

  // Called when a WebSocket closes
  async onClose(
    connection: { id: string },
    _code: number,
    _reason: string
  ): Promise<void> {
    console.log(`[CallSessionAgent] Connection closed: ${connection.id}`)
    this.utteranceBuffer = []
    this.classifying = false
    // Note: talkRatios is NOT reset here so handleCallEnded
    // (which may be async) can access it even if the connection closes first.
    // It is reset in onConnect for the next session.
  }

  // ─── Sentiment Analysis (Tier 1: keyword + EMA with decay) ─────────────────
  private updateSentiment(transcript: string): void {
    const lower = transcript.toLowerCase()
    let score: number | null = null

    // Check negative first (sales-critical: catch objections early)
    if (SENTIMENT_NEGATIVE.some(k => keywordMatch(lower, k))) score = -1
    else if (SENTIMENT_POSITIVE.some(k => keywordMatch(lower, k))) score = 1
    else if (SENTIMENT_NEUTRAL.some(k => keywordMatch(lower, k))) score = 0

    if (score === null) return // no keyword match — EMA stays, decay handled in getSentimentState

    this.sentimentEMA = SENTIMENT_ALPHA * score + (1 - SENTIMENT_ALPHA) * this.sentimentEMA
    this.lastSentimentAt = Date.now()
  }

  private getSentimentState(): 'strong' | 'neutral' | 'at_risk' {
    // Decay EMA toward neutral when no keyword has matched recently
    const elapsed = Date.now() - this.lastSentimentAt
    if (elapsed > SENTIMENT_DECAY_MS) {
      const decayFactor = Math.min(1, (elapsed - SENTIMENT_DECAY_MS) / SENTIMENT_DECAY_MS)
      this.sentimentEMA = this.sentimentEMA * (1 - decayFactor)
      if (Math.abs(this.sentimentEMA) < 0.05) this.sentimentEMA = 0
    }

    if (this.sentimentEMA >= 0.3) return 'strong'
    if (this.sentimentEMA <= -0.3) return 'at_risk'
    return 'neutral'
  }

  // ─── Call Ended Handler ────────────────────────────────────────────────────
  private async handleCallEnded(
    connection: { id: string; send: (data: string) => void },
    durationMs: number
  ): Promise<void> {
    console.log(`[CallSessionAgent] Call ended. Duration: ${Math.round(durationMs / 1000)}s`)

    // TODO(Week 3): Persist to D1, generate snapshot, send email
    // For now just log the accumulated talk ratios
    const count = this.talkRatios.length
    if (count > 0) {
      const avgYou = Math.round(this.talkRatios.reduce((s, r) => s + r.you, 0) / count)
      const avgThem = Math.round(this.talkRatios.reduce((s, r) => s + r.them, 0) / count)
      console.log(`[CallSessionAgent] Avg talk ratio — You: ${avgYou}% Them: ${avgThem}%`)
    }

    // Acknowledge to extension (best-effort; connection may already be closing)
    try {
      connection.send(JSON.stringify({ type: 'call_ended_ack', durationMs }))
    } catch {
      // Connection may have closed — safe to ignore
    }
  }

  // ─── Audio Processing Pipeline ─────────────────────────────────────────────
  private async processAudioChunk(
    connection: { id: string; send: (data: string) => void },
    audioData: number[]
  ): Promise<void> {
    const pcm = new Uint8Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      let v = audioData[i]!
      // Guard against NaN / Infinity from corrupt audio chunks
      if (!Number.isFinite(v)) v = 0
      // Clamp to float32 audio range before converting to uint8
      v = Math.max(-1, Math.min(1, v))
      // Convert float32 [-1,1] → uint8 [0,255] for Workers AI
      pcm[i] = Math.round((v + 1) * 127.5)
    }

    // Step 1: Transcribe via Deepgram Nova-3 (Workers AI)
    const transcript = await this.transcribe(pcm)
    if (!transcript || transcript.trim().length === 0) return

    // Step 1b: Real-time sentiment update from transcript keywords
    this.updateSentiment(transcript)

    // Step 2: Detect end-of-turn via Flux smart-turn-v2
    const turnComplete = await this.isEndOfTurn(pcm)
    this.utteranceBuffer.push(transcript)

    if (turnComplete && this.utteranceBuffer.length > 0 && !this.classifying) {
      const utterance = this.utteranceBuffer.join(' ').trim()
      this.utteranceBuffer = []

      // Step 3: Classify and stream response
      await this.classifyAndStream(connection, utterance)
    }
  }

  // ─── STT via Deepgram Nova-3 (Workers AI) ──────────────────────────────────
  private async transcribe(audio: Uint8Array): Promise<string | null> {
    try {
      // Workers AI audio models accept Uint8Array — cast to bypass imprecise SDK types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.env.AI as any).run('@cf/deepgram/nova-3', {
        audio,
      }) as { text?: string } | null

      return result?.text ?? null
    } catch (err) {
      console.error('[CallSessionAgent] Transcription error:', err)
      return null
    }
  }

  // ─── End-of-turn detection via Flux (Workers AI) ───────────────────────────
  private async isEndOfTurn(audio: Uint8Array): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.env.AI as any).run('@cf/pipecat-ai/smart-turn-v2', {
        audio,
      }) as { is_complete?: boolean; probability?: number } | null

      // Only classify when Flux is confident (>80%) the utterance is complete
      return result?.is_complete === true && (result.probability ?? 0) > 0.80
    } catch (err) {
      console.warn('[CallSessionAgent] End-of-turn detection error:', err)
      // If Flux fails, fall back to trusting the transcript
      return false
    }
  }

  // ─── Classify utterance + stream response card ─────────────────────────────
  private async classifyAndStream(
    connection: { id: string; send: (data: string) => void },
    utterance: string
  ): Promise<void> {
    if (this.classifying) return
    this.classifying = true

    try {
      const google = createGoogleGenerativeAI({
        apiKey: this.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })
      const model = google(this.env.AI_MODEL)

      const prompt = `Utterance: "${utterance}"`

      // ── Phase 1: Stream text tokens to HUD immediately (typing effect) ──────
      // We stream the raw text first so the card starts populating instantly
      const streamResult = streamText({
        model,
        system: OBJECTION_PROMPT,
        prompt,
        temperature: 0.1,
        maxTokens: 300,
      })

      let fullText = ''
      let objectionTypeDetected: string | null = null

      for await (const delta of streamResult.textStream) {
        fullText += delta

        // Try to extract objection type from partial JSON as it streams
        // so we can show the badge label immediately
        if (!objectionTypeDetected) {
          const match = fullText.match(/"objection"\s*:\s*"([^"]+)"/)
          if (match) {
            objectionTypeDetected = match[1]!
            connection.send(
              JSON.stringify({ type: 'objection_start', objection: objectionTypeDetected })
            )
          }
        }

        // Stream response text tokens
        // Only send text after we see the response field starting
        const responseMatch = fullText.match(/"response"\s*:\s*"([^"]*$)/)
        if (responseMatch) {
          connection.send(JSON.stringify({ type: 'stream_delta', delta }))
        }
      }

      // ── Phase 2: Parse structured result and validate confidence ─────────────
      const { object } = await generateObject({
        model,
        schema: ObjectionSchema,
        system: OBJECTION_PROMPT,
        prompt,
        temperature: 0.1,
        maxTokens: 300,
      })

      if (object.objection && (object.confidence ?? 0) >= CONFIDENCE_THRESHOLD) {
        connection.send(JSON.stringify({ type: 'objection_card', card: object }))
        console.log(
          `[CallSessionAgent] Objection: ${object.objection} (${Math.round((object.confidence ?? 0) * 100)}%)`
        )
      } else {
        connection.send(JSON.stringify({ type: 'no_objection' }))
      }
    } catch (err) {
      console.error('[CallSessionAgent] Classification error:', err)
      connection.send(
        JSON.stringify({ type: 'error', message: 'Classification failed' })
      )
    } finally {
      this.classifying = false
    }
  }
}

// ─── Export Default Fetch Handler ────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Route WebSocket upgrades and HTTP requests to the Agent
    // routeAgentRequest handles DO lookup + WebSocket upgrade automatically
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) {
      // Attach CORS headers to all agent responses
      const headers = new Headers(agentResponse.headers)
      Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v))
      return new Response(agentResponse.body, {
        status: agentResponse.status,
        headers,
      })
    }

    return new Response('Pitchly — Worker running', {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
    })
  },
} satisfies ExportedHandler<Env>
