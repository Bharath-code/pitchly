// index.ts — Cloudflare Worker: CallSessionAgent
// Extends Cloudflare Agents SDK Agent class (Durable Object based)

import { Agent, routeAgentRequest } from 'agents'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateObject } from 'ai'
import { z } from 'zod'
import { ObjectionSchema, PostCallAnalysisSchema } from './schema'
import { OBJECTION_PROMPT, POST_CALL_SENTIMENT_PROMPT, FOLLOW_UP_PROMPT } from './prompts'
import type { PostCallAnalysis } from './schema'

// ─── Environment Types ──────────────────────────────────────────────────────
type Env = {
  // Secrets (set via wrangler secret put)
  GOOGLE_GENERATIVE_AI_API_KEY: string
  RESEND_API_KEY?: string

  // Vars (from wrangler.toml [vars])
  AI_MODEL: string  // e.g. "gemini-2.5-flash"

  // Workers AI binding
  AI: Ai

  // D1 Database binding
  DB: D1Database

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
const SENTIMENT_POSITIVE = ['love', 'perfect', 'great', 'excellent', 'amazing', 'happy', 'excited', 'awesome', 'fantastic', 'wonderful', 'ideal', 'yes', 'definitely', 'absolutely', 'sold', 'let\'s do it', 'let\'s go', 'sign me up']
const SENTIMENT_NEUTRAL  = ['maybe', 'not sure', 'expensive', 'complicated', 'think about it', 'consider', 'perhaps', 'possibly', 'compare', 'review', 'discuss']
const SENTIMENT_NEGATIVE = ['no', 'cancel', 'not interested', 'remove', 'unsubscribe', 'stop', 'don\'t want', 'too much', 'not going to', 'won\'t', 'never', 'bad', 'terrible', 'awful', 'hate', 'disappointed', 'frustrated', 'waste']

const SENTIMENT_ALPHA = 0.3
const SENTIMENT_DECAY_MS = 10_000

function keywordMatch(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

// ─── Input validation helpers ───────────────────────────────────────────────
function isValidEmail(email: string | undefined): email is string {
  if (!email || typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function sanitizeString(input: string | undefined, maxLen = 500): string | undefined {
  if (!input || typeof input !== 'string') return undefined
  const trimmed = input.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.slice(0, maxLen)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── CallSessionAgent ─────────────────────────────────────────────────────────
export class CallSessionAgent extends Agent<Env> {
  // Buffer of transcript fragments until end-of-turn detected
  private utteranceBuffer: string[] = []
  // Prevent concurrent classifications
  private classifying = false

  // Talk ratio history for this session
  private talkRatios: Array<{ you: number; them: number; timestamp: number }> = []

  // Real-time sentiment state (Tier 1: keyword EMA)
  private sentimentEMA = 0
  private lastSentimentAt = 0

  // Transcript segments accumulated during call (persisted at end)
  private transcriptSegments: Array<{
    speaker: 'rep' | 'prospect'
    text: string
    timestamp: number
    sentiment?: 'strong' | 'neutral' | 'at_risk'
  }> = []

  // Objections detected during call
  private objectionsDetected: Array<{
    type: string
    confidence: number
    response: string
    timestamp: number
  }> = []

  // Session metadata
  private callId = ''
  private repEmail: string | undefined = undefined
  private managerEmail: string | undefined = undefined
  private webhookUrl: string | undefined = undefined
  private callStartedAt = 0

  // Called when a new WebSocket connection opens
  async onConnect(connection: {
    id: string
    send: (data: string) => void
  }): Promise<void> {
    console.log(`[CallSessionAgent] Connection opened: ${connection.id}`)
    this.resetSession()
    this.callId = crypto.randomUUID()
    this.callStartedAt = Date.now()
    connection.send(JSON.stringify({ type: 'ready', connectionId: connection.id }))
  }

  private resetSession(): void {
    this.talkRatios = []
    this.utteranceBuffer = []
    this.classifying = false
    this.sentimentEMA = 0
    this.lastSentimentAt = 0
    this.transcriptSegments = []
    this.objectionsDetected = []
    this.callId = ''
    this.repEmail = undefined
    this.managerEmail = undefined
    this.webhookUrl = undefined
    this.callStartedAt = 0
  }

  // Called for each WebSocket message from the extension
  async onMessage(
    connection: { id: string; send: (data: string) => void },
    message: string
  ): Promise<void> {
    let parsed: Record<string, unknown>

    try {
      parsed = JSON.parse(message) as Record<string, unknown>
    } catch {
      console.warn(`[CallSessionAgent] Non-JSON message from ${connection.id}`)
      return
    }

    const msgType = String(parsed.type || '')

    if (msgType === 'audio_chunk' && Array.isArray(parsed.data)) {
      await this.processAudioChunk(connection, parsed.data as number[])
    } else if (msgType === 'talk_ratio' && typeof parsed.you === 'number' && typeof parsed.them === 'number') {
      const you = Math.max(0, Math.min(100, parsed.you))
      const them = Math.max(0, Math.min(100, parsed.them))
      this.talkRatios.push({ you, them, timestamp: Date.now() })

      let nudge: string | undefined
      if (you > 75) nudge = '⚠️ Listen more!'
      else if (you < 30) nudge = '🎯 Ask a discovery question'

      const sentiment = this.getSentimentState()
      const sentimentNudge = sentiment === 'at_risk' ? '⚠️ Sentiment dropped — acknowledge their concern' : undefined

      connection.send(JSON.stringify({ type: 'talk_ratio', you, them, nudge, sentiment, sentimentNudge }))
    } else if (msgType === 'call_ended' && typeof parsed.durationMs === 'number' && parsed.durationMs >= 0) {
      // Capture optional metadata sent by extension
      if (isValidEmail(parsed.repEmail as string)) this.repEmail = (parsed.repEmail as string).trim()
      if (isValidEmail(parsed.managerEmail as string)) this.managerEmail = (parsed.managerEmail as string).trim()
      const wh = sanitizeString(parsed.webhookUrl as string, 2048)
      if (wh && (wh.startsWith('https://') || wh.startsWith('http://'))) this.webhookUrl = wh

      await this.handleCallEnded(connection, parsed.durationMs as number)
    } else if (msgType === 'session_settings') {
      // Early settings transmission (e.g. right after WS open)
      if (isValidEmail(parsed.repEmail as string)) this.repEmail = (parsed.repEmail as string).trim()
      if (isValidEmail(parsed.managerEmail as string)) this.managerEmail = (parsed.managerEmail as string).trim()
      const wh = sanitizeString(parsed.webhookUrl as string, 2048)
      if (wh && (wh.startsWith('https://') || wh.startsWith('http://'))) this.webhookUrl = wh
    }
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
  }

  // ─── Sentiment Analysis (Tier 1: keyword + EMA with decay) ─────────────────
  private updateSentiment(transcript: string): void {
    const lower = transcript.toLowerCase()
    let score: number | null = null

    if (SENTIMENT_NEGATIVE.some(k => keywordMatch(lower, k))) score = -1
    else if (SENTIMENT_POSITIVE.some(k => keywordMatch(lower, k))) score = 1
    else if (SENTIMENT_NEUTRAL.some(k => keywordMatch(lower, k))) score = 0

    if (score === null) return

    this.sentimentEMA = SENTIMENT_ALPHA * score + (1 - SENTIMENT_ALPHA) * this.sentimentEMA
    this.lastSentimentAt = Date.now()
  }

  private getSentimentState(): 'strong' | 'neutral' | 'at_risk' {
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

    const count = this.talkRatios.length
    const avgYou = count > 0 ? Math.round(this.talkRatios.reduce((s, r) => s + r.you, 0) / count) : 50
    const avgThem = count > 0 ? Math.round(this.talkRatios.reduce((s, r) => s + r.them, 0) / count) : 50

    // Build transcript text for post-call analysis
    const transcriptText = this.transcriptSegments
      .map((seg) => {
        const relMin = Math.floor((seg.timestamp - this.callStartedAt) / 60000)
        const relSec = Math.floor(((seg.timestamp - this.callStartedAt) % 60000) / 1000)
        const time = `${relMin}:${relSec.toString().padStart(2, '0')}`
        return `[${time}] ${seg.speaker === 'rep' ? 'Rep' : 'Prospect'}: ${seg.text}`
      })
      .join('\n')

    let analysis: PostCallAnalysis | undefined
    try {
      analysis = await this.runPostCallAnalysis(transcriptText)
    } catch (err) {
      console.error('[CallSessionAgent] Post-call analysis failed:', err)
    }

    // Persist to D1
    let dbOk = false
    try {
      await this.persistCall({
        id: this.callId,
        sessionName: this.name,
        repEmail: this.repEmail,
        managerEmail: this.managerEmail,
        startedAt: Math.floor(this.callStartedAt / 1000),
        endedAt: Math.floor(Date.now() / 1000),
        durationMs,
        talkRatioYou: avgYou,
        talkRatioThem: avgThem,
        finalSentiment: analysis?.overallSentiment ?? this.getSentimentState(),
        summary: analysis?.summary,
        followUpDraft: analysis?.followUpDraft,
      })
      dbOk = true
    } catch (err) {
      console.error('[CallSessionAgent] D1 persistence failed:', err)
    }

    // Send snapshot preview to extension
    const snapshot = {
      type: 'snapshot_preview',
      callId: this.callId,
      durationMs,
      talkRatioYou: avgYou,
      talkRatioThem: avgThem,
      finalSentiment: analysis?.overallSentiment ?? this.getSentimentState(),
      summary: analysis?.summary,
      followUpDraft: analysis?.followUpDraft,
      objections: this.objectionsDetected,
      dbPersisted: dbOk,
    }

    try {
      connection.send(JSON.stringify(snapshot))
    } catch {
      // Connection may have closed
    }

    // Webhook (fire-and-forget)
    if (this.webhookUrl) {
      this.sendWebhook(snapshot).catch(() => {})
    }

    // Email (fire-and-forget)
    if (this.repEmail && this.env.RESEND_API_KEY) {
      this.sendSnapshotEmail({
        to: this.repEmail,
        cc: this.managerEmail,
        snapshot,
      }).catch(() => {})
    }

    try {
      connection.send(JSON.stringify({ type: 'call_ended_ack', durationMs }))
    } catch {
      // Ignore
    }
  }

  // ─── Post-Call Gemini Analysis ─────────────────────────────────────────────
  private async runPostCallAnalysis(transcript: string): Promise<PostCallAnalysis> {
    if (!transcript || transcript.trim().length < 10) {
      return {
        overallSentiment: this.getSentimentState(),
        shifts: [],
        summary: 'Transcript too short to analyze.',
        followUpDraft: 'Thanks for the conversation. Let me know if you have any follow-up questions.',
      }
    }

    const google = createGoogleGenerativeAI({
      apiKey: this.env.GOOGLE_GENERATIVE_AI_API_KEY,
    })
    const model = google(this.env.AI_MODEL)

    const prompt = `Transcript:\n${transcript.slice(0, 8000)}`

    const { object } = await generateObject({
      model,
      schema: PostCallAnalysisSchema,
      system: POST_CALL_SENTIMENT_PROMPT,
      prompt,
      temperature: 0.3,
      maxTokens: 1200,
    })

    // Generate follow-up draft if not provided or too short
    if (!object.followUpDraft || object.followUpDraft.length < 50) {
      try {
        const followUpResult = await generateObject({
          model,
          schema: z.object({ email: z.string() }),
          system: FOLLOW_UP_PROMPT,
          prompt: `Call Summary:\n- Objections: ${this.objectionsDetected.map(o => o.type).join(', ') || 'none'}\n- Sentiment: ${object.overallSentiment}\n- Summary: ${object.summary}\n\nWrite a follow-up email.`,
          temperature: 0.4,
          maxTokens: 800,
        })
        object.followUpDraft = followUpResult.object.email
      } catch {
        object.followUpDraft = 'Thanks for your time today. Let me know if you have any questions and I\'ll follow up with next steps shortly.'
      }
    }

    return object
  }

  // ─── D1 Persistence ────────────────────────────────────────────────────────
  private async persistCall(call: {
    id: string
    sessionName: string
    repEmail: string | undefined
    managerEmail: string | undefined
    startedAt: number
    endedAt: number
    durationMs: number
    talkRatioYou: number
    talkRatioThem: number
    finalSentiment: string
    summary: string | undefined
    followUpDraft: string | undefined
  }): Promise<void> {
    const db = this.env.DB

    // Insert call record (parameterized to prevent injection)
    await db.prepare(
      `INSERT INTO calls (
        id, session_name, rep_email, manager_email,
        started_at, ended_at, duration_ms,
        talk_ratio_you, talk_ratio_them,
        final_sentiment, summary, follow_up_draft
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      call.id,
      call.sessionName,
      call.repEmail ?? null,
      call.managerEmail ?? null,
      call.startedAt,
      call.endedAt,
      call.durationMs,
      call.talkRatioYou,
      call.talkRatioThem,
      call.finalSentiment,
      call.summary ?? null,
      call.followUpDraft ?? null
    ).run()

    // Insert transcript segments
    if (this.transcriptSegments.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO transcript_segments (call_id, speaker, text, sentiment, timestamp)
         VALUES (?, ?, ?, ?, ?)`
      )
      for (const seg of this.transcriptSegments) {
        await stmt.bind(
          call.id,
          seg.speaker,
          seg.text,
          seg.sentiment ?? null,
          Math.floor(seg.timestamp / 1000)
        ).run()
      }
    }

    // Insert objections
    if (this.objectionsDetected.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO objections (call_id, type, confidence, response, timestamp)
         VALUES (?, ?, ?, ?, ?)`
      )
      for (const obj of this.objectionsDetected) {
        await stmt.bind(
          call.id,
          obj.type,
          obj.confidence,
          obj.response,
          Math.floor(obj.timestamp / 1000)
        ).run()
      }
    }
  }

  // ─── Webhook POST ──────────────────────────────────────────────────────────
  private async sendWebhook(payload: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) return
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      console.warn('[CallSessionAgent] Webhook failed:', err)
    }
  }

  // ─── Resend Email ──────────────────────────────────────────────────────────
  private async sendSnapshotEmail(opts: {
    to: string
    cc: string | undefined
    snapshot: Record<string, unknown>
  }): Promise<void> {
    const apiKey = this.env.RESEND_API_KEY
    if (!apiKey) return

    const snap = opts.snapshot
    const sentiment = String(snap.finalSentiment ?? 'neutral')
    const sentimentEmoji = sentiment === 'strong' ? '🟢' : sentiment === 'at_risk' ? '🔴' : '🟡'
    const objections = Array.isArray(snap.objections) ? snap.objections as Array<{ type: string; confidence: number; handledWell?: boolean }> : []
    const durationMin = Math.floor((Number(snap.durationMs ?? 0)) / 60000)
    const durationSec = Math.floor((Number(snap.durationMs ?? 0) % 60000) / 1000)

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:Inter,system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:24px auto;background:#12121f;border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.15);">
    <div style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:28px 24px;text-align:center;">
      <h1 style="margin:0;font-size:20px;color:#fff;font-weight:700;letter-spacing:-0.02em;">Pitchly</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Your call just ended</p>
    </div>
    <div style="padding:24px;">
      <div style="display:grid;gap:10px;margin-bottom:24px;">
        <div style="background:rgba(255,255,255,0.04);padding:12px 14px;border-radius:10px;font-size:13px;">
          <span style="color:#94a3b8;">⏱️ Duration</span>
          <span style="float:right;font-weight:600;">${durationMin}m ${durationSec}s</span>
        </div>
        <div style="background:rgba(255,255,255,0.04);padding:12px 14px;border-radius:10px;font-size:13px;">
          <span style="color:#94a3b8;">🎤 You spoke</span>
          <span style="float:right;font-weight:600;">${snap.talkRatioYou}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.04);padding:12px 14px;border-radius:10px;font-size:13px;">
          <span style="color:#94a3b8;">🗣️ Prospect spoke</span>
          <span style="float:right;font-weight:600;">${snap.talkRatioThem}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.04);padding:12px 14px;border-radius:10px;font-size:13px;">
          <span style="color:#94a3b8;">📊 Sentiment</span>
          <span style="float:right;font-weight:600;">${sentimentEmoji} ${sentiment}</span>
        </div>
      </div>

      <h3 style="font-size:14px;font-weight:600;color:#fff;margin:0 0 10px;">Objections Handled (${objections.length})</h3>
      ${objections.length === 0 ? '<p style="color:#64748b;font-size:13px;margin:0 0 16px;">No objections detected this call.</p>' :
        `<ul style="margin:0 0 20px;padding:0;list-style:none;">
          ${objections.map(o => `
            <li style="background:rgba(255,255,255,0.04);padding:10px 12px;border-radius:8px;margin-bottom:6px;font-size:13px;">
              <span style="text-transform:capitalize;font-weight:600;">${escapeHtml(String(o.type).replace(/_/g, ' '))}</span>
              <span style="color:#64748b;float:right;">${Math.round((Number(o.confidence) || 0) * 100)}%</span>
            </li>
          `).join('')}
        </ul>`
      }

      <h3 style="font-size:14px;font-weight:600;color:#fff;margin:0 0 10px;">💡 Suggested Follow-Up</h3>
      <div style="background:rgba(139,92,246,0.06);border-left:3px solid #7c3aed;padding:14px;border-radius:0 10px 10px 0;font-size:13px;line-height:1.6;color:#cbd5e1;margin-bottom:20px;">
        ${escapeHtml(String(snap.followUpDraft ?? 'No follow-up draft generated.')).replace(/\n/g, '<br>')}
      </div>

      ${opts.cc ? `<p style="color:#64748b;font-size:12px;margin:16px 0 0;">Manager (${escapeHtml(opts.cc)}) was CC'd.</p>` : ''}
    </div>
  </div>
</body>
</html>
    `.trim()

    const body: Record<string, unknown> = {
      from: 'Pitchly <snapshots@pitchly.ai>',
      to: [opts.to],
      subject: `Call Summary — ${objections.length} objections, sentiment: ${escapeHtml(sentiment)}`,
      html,
    }
    if (opts.cc) body.cc = [opts.cc]

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  // ─── Audio Processing Pipeline ─────────────────────────────────────────────
  private async processAudioChunk(
    connection: { id: string; send: (data: string) => void },
    audioData: number[]
  ): Promise<void> {
    const pcm = new Uint8Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      let v = audioData[i]!
      if (!Number.isFinite(v)) v = 0
      v = Math.max(-1, Math.min(1, v))
      pcm[i] = Math.round((v + 1) * 127.5)
    }

    // Step 1: Transcribe via Deepgram Nova-3 (Workers AI)
    const transcript = await this.transcribe(pcm)
    if (!transcript || transcript.trim().length === 0) return

    // Step 1b: Real-time sentiment update from transcript keywords
    this.updateSentiment(transcript)

    // Step 1c: Buffer transcript segment (prospect voice only in dual-stream)
    this.transcriptSegments.push({
      speaker: 'prospect',
      text: transcript.trim(),
      timestamp: Date.now(),
      sentiment: this.getSentimentState(),
    })

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
      const result = await (this.env.AI as unknown as { run: (model: string, input: { audio: Uint8Array }) => Promise<{ text?: string } | null> }).run('@cf/deepgram/nova-3', {
        audio,
      })
      return result?.text ?? null
    } catch (err) {
      console.error('[CallSessionAgent] Transcription error:', err)
      return null
    }
  }

  // ─── End-of-turn detection via Flux (Workers AI) ───────────────────────────
  private async isEndOfTurn(audio: Uint8Array): Promise<boolean> {
    try {
      const result = await (this.env.AI as unknown as { run: (model: string, input: { audio: Uint8Array }) => Promise<{ is_complete?: boolean; probability?: number } | null> }).run('@cf/pipecat-ai/smart-turn-v2', {
        audio,
      })
      return result?.is_complete === true && (result.probability ?? 0) > 0.80
    } catch (err) {
      console.warn('[CallSessionAgent] End-of-turn detection error:', err)
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

      // Phase 1: Stream text tokens to HUD immediately
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

        if (!objectionTypeDetected) {
          const match = fullText.match(/"objection"\s*:\s*"([^"]+)"/)
          if (match) {
            objectionTypeDetected = match[1]!
            connection.send(
              JSON.stringify({ type: 'objection_start', objection: objectionTypeDetected })
            )
          }
        }

        const responseMatch = fullText.match(/"response"\s*:\s*"([^"]*$)/)
        if (responseMatch) {
          connection.send(JSON.stringify({ type: 'stream_delta', delta }))
        }
      }

      // Phase 2: Parse structured result and validate confidence
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
        // Track for post-call summary
        this.objectionsDetected.push({
          type: object.objection,
          confidence: object.confidence ?? 0,
          response: object.response ?? '',
          timestamp: Date.now(),
        })
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
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) {
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
