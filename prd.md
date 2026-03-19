# SalesCoach AI — MVP PRD v2.0

**Product:** SalesCoach AI Chrome Extension  
**Version:** MVP 2.0  
**Author:** Bharath  
**Date:** March 2026  
**Status:** Ready to Build  
**Changes from v1.0:** AI model agnostic via Vercel AI SDK v6, Cloudflare Agents SDK + Deepgram Nova-3 for STT, Flux end-of-turn detection replaces 8s timer, streaming HUD via WebSocket, three-tier audio capture for desktop Zoom support, Gemini 2.5 Flash as free MVP model

---

## 1. Overview

### 1.1 Problem

Sales reps freeze during live calls when prospects raise objections. In the moment, under pressure, they forget their best responses. There is no tool that gives them real-time guidance exactly when they need it — during the call, not after.

### 1.2 Solution

A Chrome extension that listens to a sales call in real time, detects objections the moment a prospect finishes speaking, and streams a response card onto the screen — without interrupting the call or requiring any manual input from the rep.

### 1.3 MVP Goal

Build the smallest possible working version that demonstrates the core value loop:

> **Prospect finishes saying objection → Deepgram detects end-of-turn → Card streams onto screen → Rep reads response → Deal stays alive**

### 1.4 Success Criteria

- Objection card appears within 3 seconds of the prospect finishing their sentence
- Works on Google Meet, Zoom Web, and Zoom Desktop App (mic fallback)
- Response text streams into the card like a typing effect — not a jarring snap
- Can be demo'd via a Loom recording that makes an SDR say "I need this"
- 10 beta users onboarded within 2 weeks of MVP completion

---

## 2. Scope

### 2.1 IN — Build This for MVP

| Feature | Description |
|---|---|
| Three-tier audio capture | Tab+mic mixed → tab only → mic-only fallback |
| Deepgram Nova-3 on Workers AI | Real-time STT at Cloudflare edge, no external API call |
| Flux end-of-turn detection | Smart pause detection — classify only complete utterances |
| Cloudflare Agents SDK | `CallSessionAgent` extends `Agent`, one instance per call |
| Agent WebSocket | Bidirectional: audio in → objection card out |
| Objection classification | Gemini 2.5 Flash via Vercel AI SDK v6 + Zod schema |
| Model-agnostic AI layer | Swap model via `AI_MODEL` env var, zero code change |
| Confidence threshold | Only push card if confidence ≥ 0.75 |
| Streaming HUD card | Response text streams in token-by-token via WebSocket |
| Auto-dismiss | Card auto-disappears after 15 seconds |
| Manual dismiss | X button to close card immediately |
| Hardcoded KB | 10 objection response scripts in agent system prompt |
| Works on Google Meet | Tab audio capture — full both-sides transcription |
| Works on Zoom Web | Tab audio capture — full both-sides transcription |
| Works on Zoom Desktop | Mic fallback — your side only, with notice shown to user |
| No login required | MVP uses env var API keys, no auth flow |
| Load as unpacked | Distributed as unpacked extension for beta users |
| Loom-recordable demo | Clean streaming card UI suitable for a compelling 3-min demo |

### 2.2 OUT — Not in MVP

| Feature | Why Deferred |
|---|---|
| Auth / login (Clerk) | Not needed until paying users |
| Dashboard UI | Not needed to prove core value |
| Post-call debrief | Phase 2 — Claude Sonnet |
| Call history / transcripts | Phase 2 — Agent built-in SQLite |
| Stripe billing | Not needed for beta |
| Editable KB | Hardcoded KB sufficient for validation |
| CRM integrations | Phase 3 — HubSpot / Salesforce MCP |
| Talk/listen ratio | Analytics feature, Phase 2 |
| Chrome Web Store listing | After beta feedback, before public launch |
| Team / org accounts | Phase 2 — Clerk Organizations |
| Virtual audio device support | Power user feature, post-MVP |
| Recall.ai meeting bot | Enterprise tier, post-revenue |
| Deepgram speaker diarization | Phase 2 — who said what |
| Claude Haiku production model | Switch when first revenue arrives |

---

## 3. User Story

**Primary user:** SDR or Account Executive at a B2B SaaS company

> As a sales rep on a live Zoom or Google Meet call, when a prospect raises an objection I haven't handled well before, I want a response suggestion to stream onto my screen the moment they finish speaking so I can keep the conversation moving without freezing up or losing the deal.

**Usage flow:**

1. Rep installs the extension (load unpacked, 2 minutes)
2. Rep joins a Zoom Web or Google Meet call
3. Rep clicks the extension icon → "Start Listening"
4. Extension captures audio, connects WebSocket to `CallSessionAgent`
5. Prospect says "Honestly, this is just too expensive for us right now"
6. Flux model detects end-of-turn — prospect stopped speaking
7. Agent classifies utterance — Price objection, confidence 0.91
8. Card slides in bottom-right: "Price objection" label appears instantly
9. Response text streams in word by word over ~800ms
10. Rep reads the response, delivers it naturally in their own words
11. Rep clicks X or waits 15 seconds — card dismisses
12. Call continues

---

## 4. Audio Capture Strategy

Because most Zoom users use the desktop app (outside the browser), a single capture method is insufficient. The extension uses a three-tier fallback.

### Tier 1 — Tab + Mic Mixed (Best)
**When:** Google Meet, Zoom Web Client, Teams Web  
**How:** `chrome.tabCapture` + `getUserMedia` mixed via Web Audio API  
**Result:** Full both-sides audio — best transcription accuracy

### Tier 2 — Tab Audio Only
**When:** Browser meeting but mic permission denied  
**How:** `chrome.tabCapture` only  
**Result:** Both sides captured, slightly lower quality

### Tier 3 — Microphone Only (Fallback)
**When:** Zoom Desktop App, Teams Desktop App — outside the browser  
**How:** `getUserMedia` microphone only  
**Result:** Your voice + prospect audio bleeding through speakers  
**Notice shown to user:** "Mic-only mode active — join Zoom via browser for best results"

**Beta user guidance:** Ask users to join Zoom via `zoom.us` in Chrome browser instead of the desktop app. Most SDRs will switch without friction if asked.

```
Platform            Join method         Capture tier   Quality
───────────────────────────────────────────────────────────────
Google Meet         Always browser      Tier 1         Excellent
Zoom Web Client     Browser tab         Tier 1         Excellent
Teams Web           Browser tab         Tier 1         Excellent
Zoom Desktop App    OS native app       Tier 3         Partial
Teams Desktop       OS native app       Tier 3         Partial
```

---

## 5. The 10 Objection Types (MVP KB)

Hardcoded into the `CallSessionAgent` system prompt. No database required for MVP.

| # | Type | Trigger Phrases | Response Script |
|---|---|---|---|
| 1 | **price** | "too expensive", "can't afford", "out of budget", "costs too much" | "I understand budget is tight. What would it need to deliver to justify the cost? Most teams close one extra deal and it pays for a full year." |
| 2 | **timing** | "not right now", "bad timing", "maybe later", "check back in Q3" | "What would need to change for the timing to be right? Is there a specific milestone you're waiting for?" |
| 3 | **authority** | "need to check with my manager", "not my decision", "need approval" | "Of course. If it were just your call, would you move forward? What do you think your manager's main concern will be?" |
| 4 | **competitor** | "we already use X", "looking at Y", "evaluating alternatives" | "That's great context. What's working well with your current tool? What made you open to looking at alternatives?" |
| 5 | **no_need** | "we're doing fine", "don't need this", "already handling it" | "Totally fair. Out of curiosity, how are you currently handling that? I'd love to understand your process better." |
| 6 | **trust** | "how do I know this works", "seen this before", "prove it" | "Fair skepticism. Can I share how a similar team used this in their first 30 days and what they saw?" |
| 7 | **roi** | "how do we measure value", "prove ROI", "what's the return" | "Great question. If close rate improved by 5% in 60 days, what would that mean in revenue for your team?" |
| 8 | **complexity** | "seems complicated", "hard to implement", "takes too long to set up" | "It's a Chrome extension — up and running in under 5 minutes. Nothing to install on your servers. Want me to walk you through it?" |
| 9 | **priority** | "have other things going on", "not a priority right now", "too busy" | "Totally get it. Where does improving close rate sit on the priority list? Even a 1% lift at your deal size is meaningful revenue." |
| 10 | **ghost** | "silence after demo", "no response", "went cold" | "Just checking in — is this still something worth exploring? Completely fine if priorities have shifted, just want to close the loop." |

---

## 6. Technical Specification

### 6.1 Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Chrome Extension | TypeScript + Manifest V3 | Vanilla, no framework overhead |
| Audio capture | Three-tier fallback (Section 4) | Handles desktop Zoom |
| STT | Deepgram Nova-3 via `@cf/deepgram/nova-3` | Workers AI edge, no external API call |
| End-of-turn | Flux `@cf/pipecat-ai/smart-turn-v2` | Smart pause vs dumb 8s timer |
| Session runtime | Cloudflare Agents SDK (`agents` npm) | Stateful agent per call, built on Durable Objects |
| WebSocket | `AgentClient` (auto-reconnect built-in) | Bidirectional, persistent per call |
| AI classification | Vercel AI SDK v6 (`ai` + `@ai-sdk/google`) | Model-agnostic, one env var to swap |
| Structured output | Zod schema + `Output.object()` | Type-safe, replaces manual JSON parsing |
| Model — MVP | `gemini-2.5-flash` | Free tier, stable, ~400ms typical |
| Model — production | `anthropic/claude-haiku-4` | Switch when revenue arrives, one line change |
| HUD streaming | `toTextStreamResponse()` → WebSocket delta | Response types in like ChatGPT |
| Deployment | Cloudflare Workers via `wrangler deploy` | Same platform, zero extra vendors |

### 6.2 File Structure

```
salescoach-mvp/
├── extension/
│   ├── manifest.json          # MV3 config, permissions
│   ├── background.ts          # Service worker, three-tier audio capture
│   ├── content.ts             # Injected into tab, AgentClient WebSocket
│   └── hud.ts                 # Floating streaming card UI
└── worker/
    └── src/
        └── index.ts           # CallSessionAgent + routeAgentRequest
```

### 6.3 `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "SalesCoach AI",
  "version": "0.1.0",
  "permissions": ["tabCapture", "activeTab", "scripting", "storage"],
  "host_permissions": [
    "https://meet.google.com/*",
    "https://*.zoom.us/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://meet.google.com/*", "https://*.zoom.us/*"],
    "js": ["content.js"]
  }],
  "action": { "default_title": "SalesCoach AI" }
}
```

### 6.4 `background.ts` — Three-Tier Audio Capture

```typescript
type CaptureMode = 'mixed' | 'tab' | 'mic-only'

async function initCapture(): Promise<{ stream: MediaStream; mode: CaptureMode }> {

  // Tier 1: Tab + mic mixed — best quality, browser meetings
  try {
    const tabStream = await captureTab()
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return { stream: mixStreams(tabStream, micStream), mode: 'mixed' }
  } catch {}

  // Tier 2: Tab only
  try {
    const tabStream = await captureTab()
    return { stream: tabStream, mode: 'tab' }
  } catch {}

  // Tier 3: Mic only — desktop Zoom / Teams fallback
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  return { stream: micStream, mode: 'mic-only' }
}

function mixStreams(tab: MediaStream, mic: MediaStream): MediaStream {
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  ctx.createMediaStreamSource(tab).connect(dest)
  ctx.createMediaStreamSource(mic).connect(dest)
  return dest.stream
}

function captureTab(): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (stream) resolve(stream)
      else reject(chrome.runtime.lastError)
    })
  })
}
```

### 6.5 `worker/src/index.ts` — CallSessionAgent

```typescript
import { Agent, routeAgentRequest } from 'agents'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, Output } from 'ai'
import { z } from 'zod'

type Env = {
  GOOGLE_GENERATIVE_AI_API_KEY: string
  AI_MODEL: string
  AI: Fetcher                               // Workers AI binding
  CallSessionAgent: DurableObjectNamespace
}

const ObjectionSchema = z.object({
  objection: z.enum([
    'price', 'timing', 'authority', 'competitor', 'no_need',
    'trust', 'roi', 'complexity', 'priority', 'ghost'
  ]).nullable(),
  response: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable()
})

const OBJECTION_PROMPT = `
You are a real-time sales call assistant.
Analyze the transcript utterance. Detect if an objection is present.

Objection types: price, timing, authority, competitor, no_need,
trust, roi, complexity, priority, ghost

KNOWLEDGE BASE:
price      → "I understand budget is tight. What would it need to deliver
              to justify the cost? Most teams close one extra deal and
              it pays for a full year."
timing     → "What would need to change for the timing to be right?
              Is there a specific milestone you're waiting for?"
authority  → "If it were just your call, would you move forward?
              What do you think your manager's main concern will be?"
competitor → "What's working well with your current tool?
              What made you open to looking at alternatives?"
no_need    → "How are you currently handling that?
              I'd love to understand your process better."
trust      → "Can I share how a similar team used this in their first
              30 days and what they saw?"
roi        → "If close rate improved 5% in 60 days, what would that
              mean in revenue for your team?"
complexity → "It's a Chrome extension — up and running in under
              5 minutes. Nothing on your servers."
priority   → "Where does improving close rate sit on the priority
              list right now?"
ghost      → "Is this still worth exploring? Fine if priorities have
              shifted, just want to close the loop."

RULES:
- Only classify if confidence >= 0.75
- Return ONLY valid JSON, no markdown, no extra text
- No objection: {"objection": null, "response": null, "confidence": null}
- Objection: {"objection": "type", "response": "...", "confidence": 0.XX}
`

export class CallSessionAgent extends Agent<Env> {
  utteranceBuffer: string[] = []

  async onMessage(connection: Connection, message: string) {
    const { type, data } = JSON.parse(message)

    if (type === 'audio_chunk') {
      // Step 1: Transcribe via Deepgram Nova-3 on Workers AI edge
      const text = await this.transcribe(data)
      if (!text) return

      // Step 2: Smart end-of-turn detection via Flux model
      const turnDone = await this.isEndOfTurn(data)
      this.utteranceBuffer.push(text)

      if (turnDone && this.utteranceBuffer.length > 0) {
        const utterance = this.utteranceBuffer.join(' ')
        this.utteranceBuffer = []

        // Step 3: Classify + stream card back to HUD
        await this.classifyAndStream(connection, utterance)
      }
    }
  }

  async transcribe(audioData: number[]): Promise<string | null> {
    const result = await this.env.AI.run('@cf/deepgram/nova-3', {
      audio: new Uint8Array(audioData)
    }) as any
    return result?.text ?? null
  }

  async isEndOfTurn(audioData: number[]): Promise<boolean> {
    const result = await this.env.AI.run('@cf/pipecat-ai/smart-turn-v2', {
      audio: new Uint8Array(audioData)
    }) as any
    return result?.is_complete === true && (result?.probability ?? 0) > 0.80
  }

  async classifyAndStream(connection: Connection, utterance: string) {
    const google = createGoogleGenerativeAI({
      apiKey: this.env.GOOGLE_GENERATIVE_AI_API_KEY
    })

    // Model swap = one env var change, zero code changes
    const result = streamText({
      model: google(this.env.AI_MODEL),
      system: OBJECTION_PROMPT,
      prompt: `Utterance: "${utterance}"`,
      temperature: 0.1,
      maxTokens: 200,
      experimental_output: Output.object({ schema: ObjectionSchema })
    })

    // Stream tokens to HUD as they arrive — ChatGPT typing effect
    for await (const delta of result.textStream) {
      connection.send(JSON.stringify({ type: 'stream_delta', delta }))
    }

    const object = await result.experimental_output
    if (object?.objection && (object.confidence ?? 0) >= 0.75) {
      connection.send(JSON.stringify({ type: 'objection_card', card: object }))
    } else {
      connection.send(JSON.stringify({ type: 'no_objection' }))
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ??
      new Response('Not found', { status: 404 })
  }
}
```

### 6.6 `content.ts` — AgentClient + Audio Streaming

```typescript
import { AgentClient } from '@cloudflare/agents/client'

let agent: AgentClient | null = null

async function startSession() {
  agent = new AgentClient({
    agent: 'call-session-agent',
    name: `session-${Date.now()}`,
    host: 'your-worker.workers.dev'
  })

  // Receive objection cards from agent
  agent.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)

    if (msg.type === 'stream_delta') {
      appendHUDText(msg.delta)         // text streams in token by token
    }
    if (msg.type === 'objection_card') {
      finalizeHUDCard(msg.card)        // lock in final card state
    }
    if (msg.type === 'no_objection') {
      dismissHUDCard()                 // no objection detected, hide card
    }
  })

  // Start audio capture with three-tier fallback
  const { stream, mode } = await initCapture()
  if (mode === 'mic-only') {
    showHUDNotice('Mic-only mode — join Zoom via browser for best results')
  }

  streamAudioToAgent(stream)
}

function streamAudioToAgent(stream: MediaStream) {
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)

  source.connect(processor)
  processor.connect(ctx.destination)

  processor.onaudioprocess = (e) => {
    const chunk = Array.from(e.inputBuffer.getChannelData(0))
    agent?.send(JSON.stringify({ type: 'audio_chunk', data: chunk }))
  }
}
```

### 6.7 `hud.ts` — Streaming Card UI

```typescript
let currentCard: HTMLElement | null = null
let dismissTimer: ReturnType<typeof setTimeout> | null = null

export function initHUD() {
  const hud = document.createElement('div')
  hud.id = 'salescoach-hud'
  hud.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    width: 360px; max-width: 90vw;
    background: #1a1a2e; color: #ffffff;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px; padding: 16px;
    font-family: system-ui; font-size: 14px;
    z-index: 999999; display: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  `
  document.body.appendChild(hud)
  currentCard = hud
}

export function startStreamingCard(objectionType: string) {
  if (!currentCard) return
  currentCard.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span style="color:#a78bfa;font-weight:600;text-transform:uppercase;
                   font-size:11px;letter-spacing:0.05em">${objectionType} objection</span>
      <button onclick="document.getElementById('salescoach-hud').style.display='none'"
              style="background:none;border:none;color:#888;
                     cursor:pointer;font-size:18px;line-height:1">×</button>
    </div>
    <div id="sc-response-text" style="line-height:1.6;color:#e2e8f0"></div>
  `
  currentCard.style.display = 'block'
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = setTimeout(() => dismissHUDCard(), 15000)
}

export function appendHUDText(delta: string) {
  const el = document.getElementById('sc-response-text')
  if (el) el.textContent += delta    // streams in like ChatGPT typing effect
}

export function dismissHUDCard() {
  if (currentCard) currentCard.style.display = 'none'
  if (dismissTimer) clearTimeout(dismissTimer)
}
```

### 6.8 Full Data Flow

```
Chrome Extension (Zoom/Meet tab)
        │
        │  Three-tier audio capture
        │  Tier 1: tab+mic mixed (browser meetings)
        │  Tier 3: mic-only fallback (desktop Zoom)
        ▼
content.ts → AgentClient WebSocket
        │
        │  Audio chunks (PCM float32 arrays)
        ▼
CallSessionAgent (Cloudflare Durable Object)
        │
        ├─► @cf/deepgram/nova-3 (Workers AI)
        │     Real-time STT at Cloudflare edge
        │     No external API call
        │     Returns: transcript text
        │
        ├─► @cf/pipecat-ai/smart-turn-v2 (Workers AI)
        │     End-of-turn detection — Flux model
        │     Returns: is_complete + probability
        │     Only classify when probability > 0.80
        │
        └─► Vercel AI SDK v6 (on complete utterance only)
              Model: gemini-2.5-flash (free, MVP)
              Output.object() with Zod schema
              Streams tokens back via WebSocket
                      │
                      ▼
        content.ts receives stream_delta events
                      │
                      ▼
        hud.ts appends text token-by-token
        Card appears instantly, response types in ~800ms
        Auto-dismisses after 15 seconds
```

### 6.9 `wrangler.toml`

```toml
name = "salescoach-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
AI_MODEL = "gemini-2.5-flash"
# AI_MODEL = "gemini-3-flash-preview"     # bleeding edge — switch when stable
# AI_MODEL = "anthropic/claude-haiku-4"   # production — switch when revenue

[[ai]]
binding = "AI"

[durable_objects]
bindings = [{ name = "CallSessionAgent", class_name = "CallSessionAgent" }]

[[migrations]]
tag = "v1"
new_classes = ["CallSessionAgent"]

# Secrets — set via CLI:
# wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```

### 6.10 Model Progression (AI-Agnostic)

The AI layer uses Vercel AI SDK v6 as the model abstraction. Swapping models requires changing one line in `wrangler.toml` — zero code changes in application logic.

```
Phase             Model                          Cost
─────────────────────────────────────────────────────────────────
MVP / Testing     gemini-2.5-flash               FREE (Google AI Studio)
                  via @ai-sdk/google

Beta (10 users)   gemini-2.5-flash               FREE
                  OR gemini-3-flash-preview       FREE (when stable)

First revenue     anthropic/claude-haiku-4       ~$0.003/call
                  one wrangler.toml line change

Scale             anthropic/claude-haiku-4       Still cheap
                  + claude-sonnet (post-call)    Phase 2 debrief
```

### 6.11 Dependencies

```bash
# Worker
bun add agents @cloudflare/agents ai @ai-sdk/google zod

# Extension (TypeScript dev tooling only)
bun add -d typescript @types/chrome
```

### 6.12 Environment Variables

```bash
# wrangler.toml [vars]
AI_MODEL = "gemini-2.5-flash"

# Set via CLI (never committed to git)
wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
# Paste: AIza...

# Future (switching to Claude at revenue)
# wrangler secret put ANTHROPIC_API_KEY
```

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| End-to-end card latency | ≤ 3 seconds from end of prospect utterance |
| STT accuracy | Deepgram Nova-3 — production grade, 300+ edge locations |
| End-of-turn false positives | Flux probability threshold > 0.80 |
| Classification response time | ≤ 1.5 seconds (Gemini 2.5 Flash typical ~400ms) |
| HUD streaming start | ≤ 300ms after classification begins |
| Extension install time | ≤ 2 minutes for beta users |
| CPU/memory overhead | Minimal — must not slow down Zoom or Meet |
| Platforms — full support | Google Meet, Zoom Web Client |
| Platforms — partial support | Zoom Desktop App, Teams Desktop (mic fallback) |
| Browser supported | Chrome only (MV3) |
| False positive rate | Kept low via 0.75 confidence + Flux utterance completion |
| Agent cost when idle | Zero — Durable Object hibernates between calls |

---

## 8. 7-Day Build Plan

| Day | Task | Definition of Done |
|---|---|---|
| **Day 1** | `manifest.json` + `background.ts` | Extension loads in Chrome; three-tier audio capture initialises; capture mode (`mixed` / `mic-only`) logged to console |
| **Day 2** | `worker/src/index.ts` skeleton | `wrangler dev` running locally; WebSocket connection accepted from extension; audio chunk received and logged |
| **Day 3** | Deepgram + Flux in agent | Audio chunk → Nova-3 transcript → Flux end-of-turn → complete utterance logged to console |
| **Day 4** | Classification + streaming | Complete utterance → Gemini 2.5 Flash → Zod object → token stream sent back via WebSocket |
| **Day 5** | `content.ts` + `hud.ts` | Full loop end-to-end: speak → card streams onto Zoom / Meet screen in real time |
| **Day 6** | Real call testing | All 10 objection types trigger correctly; mic fallback tested on Zoom Desktop; latency measured ≤ 3s |
| **Day 7** | Loom demo recording | 3-minute video showing streaming card appearing in real time; Loom link ready to send to 10 LinkedIn prospects |

---

## 9. Beta Distribution Plan

MVP is distributed as an unpacked Chrome extension. No Chrome Web Store submission required.

**Steps to install (for beta users):**
1. Download the extension folder (zip → unzip)
2. Open `chrome://extensions`
3. Enable "Developer mode" toggle (top right)
4. Click "Load unpacked" → select the unzipped extension folder
5. Done — SalesCoach AI icon appears in toolbar

**Beta user onboarding message:**
> For the best experience, join your Zoom calls via the browser at zoom.us instead of the Zoom desktop app, or use Google Meet. If you're on the Zoom desktop app, SalesCoach will still work using your microphone, but you'll only get transcription of your own voice. Most users just switch to Zoom Web and notice no difference.

**Beta target:** 10 SDRs / AEs from LinkedIn outreach  
**Ask:** "Try this on your next 3 calls and tell me what you think"  
**Feedback method:** Loom reply or 15-minute call

---

## 10. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deepgram Nova-3 not yet on Workers AI free tier | Medium | Fall back to Web Speech API for Day 1 testing; swap to Nova-3 once binding available |
| Flux end-of-turn cuts sentence too early | Medium | Tune `probability` threshold upward from 0.80; add 300ms silence buffer before classifying |
| MV3 service worker sleeps mid-call | Medium | Use `chrome.alarms` keepalive ping every 20 seconds to prevent suspension |
| Zoom Desktop App blocks mic capture | Low | Show clear error message + guide user to Zoom Web Client link |
| AgentClient CORS rejected from extension | Low | Set `Access-Control-Allow-Origin: *` in Worker + allowlist `chrome-extension://` origin |
| Gemini Flash latency spike | Low | Gemini 2.5 Flash typical ~400ms; full loop well within 3-second target |
| False positives annoy beta users | Medium | Confidence ≥ 0.75 + Flux utterance completion gate filters most noise; tune based on beta feedback |
| gemini-3-flash-preview instability | Low | Default `AI_MODEL` is stable `gemini-2.5-flash`; preview model is opt-in via env var only |

---

## 11. Definition of MVP Complete

The MVP is complete when all of the following are true:

- [ ] Extension installs in under 2 minutes from a zip file
- [ ] Tier 1 audio capture (tab + mic) works on Google Meet and Zoom Web
- [ ] Tier 3 mic fallback activates automatically on Zoom Desktop with notice shown
- [ ] Speaking "this is too expensive" streams a Price objection card within 3 seconds
- [ ] Response text visibly types into the card token by token (streaming effect)
- [ ] All 10 objection types trigger correctly in a mock call test
- [ ] Card auto-dismisses after 15 seconds
- [ ] X button dismisses card immediately
- [ ] Worker deployed to Cloudflare via `wrangler deploy`
- [ ] Agent hibernates correctly between calls (zero idle cost confirmed)
- [ ] Loom demo recorded showing real-time streaming card appearance
- [ ] Loom link ready to send to 10 LinkedIn prospects

---

## 12. What Comes After MVP

Phase 2 begins only after the **first paying user**. Not before.

### Phase 2 — $79/mo tier

- Post-call debrief — Claude Sonnet generates a full call report, stored in Agent's built-in SQLite
- Auth + billing — Clerk (with Organizations for team plans) + Stripe
- Dashboard — Vite + React on Cloudflare Pages; call history, objection frequency, trends
- Editable KB — users customise their own response scripts via dashboard
- Deepgram speaker diarization — separate rep vs prospect transcript channels
- Model upgrade — switch `AI_MODEL` to `anthropic/claude-haiku-4` in `wrangler.toml`

### Phase 3 — $199/mo autonomous agent tier

- Pre-call research agent — scrape LinkedIn + company news, auto-generate call brief before meeting
- Post-call CRM automation — HubSpot / Salesforce via MCP, auto-write deal notes
- Gmail draft — follow-up email drafted automatically after every call
- GCal scheduling — next steps booked into calendar automatically
- Manager coaching report — weekly team performance summary with coaching suggestions
- Recall.ai integration — optional bot-based capture for enterprise customers who need full server-side recording

---

## 13. Change Log

| Version | Date | Summary |
|---|---|---|
| v1.0 | March 2026 | Initial PRD — Web Speech API, Hono /classify route, 8s chunk timer, Claude Haiku |
| v2.0 | March 2026 | Deepgram Nova-3 + Flux end-of-turn, Cloudflare Agents SDK replaces raw Hono, Vercel AI SDK v6 model-agnostic layer, Gemini 2.5 Flash as free MVP model, three-tier audio capture for desktop Zoom, streaming HUD via WebSocket token deltas |

---

*SalesCoach AI MVP PRD v2.0 — Bharath — March 2026*