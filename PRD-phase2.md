# Pitchly — Phase 2 PRD: "From Cue Card to Co-Pilot"

**Status:** Approved  
**Target:** Individual sales reps + team managers (no auth)  
**Timeline:** 4 weeks  
**Success Metric:** A rep finishes a call and receives an email snapshot they forward to their manager.

---

## 1. Overview

### 1.1 Problem
Reps forget 90% of what happens on a call. Objection cards help in the moment, but once the call ends, the insight evaporates. Managers have zero visibility. CRMs remain empty.

### 1.2 Solution
Real-time talk ratio + sentiment alerts during the call, followed by an auto-generated post-call snapshot emailed to the rep (and optionally their manager).

### 1.3 Non-Goals
- No auth system (Clerk) — collect email via popup
- No dashboard UI — build D1 schema only, dashboard comes Phase 3
- No native CRM integrations — generic webhook only
- No speaker diarization ML — use dual-stream volume heuristic instead

---

## 2. User Stories

### Rep Persona: "Sarah"
> "I just got off a 45-minute demo. I think it went well? But I already forgot what objections they raised. And my manager is asking for a deal update."

**Scenarios:**
- During call: Sarah sees a yellow sentiment badge and realizes the prospect cooled when she mentioned pricing. She pivots to ROI.
- After call: Sarah gets an email: "3 objections, talk ratio 58/42, sentiment dipped at 12min." She forwards it to her manager and copies the follow-up draft.

### Manager Persona: "Mike"
> "I have 6 reps. I can't join every call. I need to know which deals are at risk without asking."

**Scenarios:**
- Mike is CC'd on Sarah's snapshot email. He sees she struggled with the authority objection. He Slacks her a coaching tip.

---

## 3. Architecture Changes

### 3.1 High-Level Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Extension  │────▶│    Worker    │────▶│  Cloudflare  │
│  (dual      │ WS  │  (CallSession│     │     D1       │
│   stream)   │     │    Agent)    │     │              │
└─────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Resend     │
                     │   (Email)    │
                     └──────────────┘
```

### 3.2 Dual-Stream Audio Refactor (P0)

**Current:** Mic + Tab mixed into mono → Worklet → single PCM stream  
**New:** Two separate MediaStreamSources feeding the same AudioWorklet, but tagged:

```typescript
// audio-processor.ts
interface AudioChunk {
  source: 'mic' | 'tab';
  samples: Float32Array;
}
```

The Worklet accumulates 4096-sample chunks per source and posts them as `{ mic: Float32Array, tab: Float32Array }`.

**Extension `content.ts` sends:**
```json
{
  "type": "audio_chunk",
  "mic": [0.0, 0.01, -0.02, ...],
  "tab": [0.0, 0.0, 0.0, ...]
}
```

**Worker receives and routes:**
- `tab` stream → Deepgram Nova-3 (prospect voice only, cleaner STT)
- `mic` stream → RMS volume tracking only (no STT needed for rep)
- Both streams → Talk ratio calculation

**Why this matters:**
- Eliminates self-transcription (rep's voice not sent to Deepgram)
- Accurate talk ratio from volume levels
- Sets foundation for future true diarization

---

## 4. Feature Specifications

### 4.1 Talk Ratio Meter (P1)

**Real-time HUD component:**

```
[ 🎤 You: 58% ] [ 🗣️ Them: 42% ] ⚠️ Listen more!
```

**Logic:**
- Every 5 seconds, calculate RMS energy for last 5s of mic vs tab
- If `mic_ratio > 65%` for >10s consecutive, show "⚠️ Listen more!" nudge
- If `mic_ratio < 30%`, show "🎯 Ask a discovery question" nudge

**Worker Calculation:**
```typescript
function calculateTalkRatio(micChunks: Float32Array[], tabChunks: Float32Array[]): Ratio {
  const micEnergy = rms(flatten(micChunks));
  const tabEnergy = rms(flatten(tabChunks));
  const total = micEnergy + tabEnergy;
  return {
    you: Math.round((micEnergy / total) * 100),
    them: Math.round((tabEnergy / total) * 100)
  };
}
```

**UI Spec:**
- Thin progress bar at top of HUD
- Color: Green (balanced), Yellow (you >60%), Red (you >75%)
- Nudge text fades in/out, non-intrusive

---

### 4.2 Sentiment Thermometer (P2)

**Real-time HUD component:**

```
Sentiment: 🟢 Strong  |  🟡 Cooling  |  🔴 At Risk
```

**Two-tier system:**

**Tier 1 — Real-time (lightweight, rule-based):**
- Scan last 3 utterances for keyword matches
- "love", "perfect", "let's do it" → Green (+1)
- "maybe", "not sure", "expensive", "complicated" → Yellow (0)
- "no", "cancel", "not interested", "remove", "unsubscribe" → Red (-1)
- Smooth with exponential moving average (EMA)

**Tier 2 — Post-call (Gemini analysis):**
- After call ends, send full transcript to Gemini
- Prompt: `Analyze sentiment arc. Identify moments where sentiment shifted and why.`
- Stored in D1 for snapshot email

**Real-time UI:**
- Small dot indicator next to talk ratio bar
- On Red sentiment: HUD shows "⚠️ Sentiment dropped — acknowledge their concern"
- Updates every 5 seconds

---

### 4.3 D1 Persistence Layer (P3)

**Database Schema:**

```sql
-- Calls table
CREATE TABLE calls (
  id TEXT PRIMARY KEY,
  session_name TEXT NOT NULL,
  rep_email TEXT,
  manager_email TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  talk_ratio_you INTEGER,
  talk_ratio_them INTEGER,
  final_sentiment TEXT,
  summary TEXT,
  follow_up_draft TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Transcript segments
CREATE TABLE transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT,
  speaker TEXT CHECK(speaker IN ('rep', 'prospect')),
  text TEXT,
  sentiment TEXT,
  timestamp INTEGER,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

-- Objections
CREATE TABLE objections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT,
  type TEXT,
  confidence REAL,
  response TEXT,
  handled_well BOOLEAN,
  timestamp INTEGER,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);
```

**Zod Types:**
```typescript
const CallSchema = z.object({
  id: z.string(),
  sessionName: z.string(),
  repEmail: z.string().email().optional(),
  managerEmail: z.string().email().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  talkRatioYou: z.number().int().min(0).max(100).optional(),
  talkRatioThem: z.number().int().min(0).max(100).optional(),
  finalSentiment: z.enum(['strong', 'neutral', 'at_risk']).optional(),
  summary: z.string().optional(),
  followUpDraft: z.string().optional()
});
```

---

### 4.4 Post-Call Snapshot Email (P4)

**Trigger:** Extension sends `call_ended` WebSocket message → Worker finalizes call in D1 → triggers Resend API.

**Resend Integration:**
- API key stored in `wrangler secret put RESEND_API_KEY`
- From: `snapshots@pitchly.ai` (verify domain or use Resend default)

**Email Template (HTML):**

```html
Subject: Call Summary — {{objectionCount}} objections, sentiment: {{sentiment}}

<h2>Your call just ended</h2>

<div class="stats">
  <div>⏱️ Duration: {{duration}}</div>
  <div>🎤 You spoke: {{talkRatioYou}}%</div>
  <div>🗣️ Prospect spoke: {{talkRatioThem}}%</div>
  <div>📊 Sentiment: {{sentimentEmoji}} {{sentiment}}</div>
</div>

<h3>Objections Handled</h3>
<ul>
  {{#objections}}
  <li>
    {{type}} — {{#handledWell}}✅{{/handledWell}}{{^handledWell}}⚠️{{/handledWell}}
    (confidence: {{confidence}}%)
    {{^handledWell}}<br><small>Tip: {{tip}}</small>{{/handledWell}}
  </li>
  {{/objections}}
</ul>

<h3>💡 Suggested Follow-Up</h3>
<blockquote>{{followUpDraft}}</blockquote>

<div class="actions">
  <a href="{{webhookUrl}}" class="btn">Log to CRM</a>
</div>

<footer>
  {{#managerEmail}}Manager ({{managerEmail}}) was CC'd.{{/managerEmail}}
</footer>
```

**Extension Settings (Popup):**
```typescript
interface PopupSettings {
  workerHost: string;
  repEmail: string;
  managerEmail?: string;
  webhookUrl?: string;
}
```

Stored in `chrome.storage.local`.

---

### 4.5 Generic Webhook + Manager CC (P5)

**Webhook:**
- If `webhookUrl` is set in popup settings, worker POSTs snapshot JSON to that URL after call ends.
- Format: Same JSON structure as email template variables.
- Reps can paste Zapier/Make webhook URL to auto-forward to HubSpot/Slack/Notion.

**Manager CC:**
- If `managerEmail` set, Resend sends CC.
- No auth needed. Rep configures their own manager.

---

## 5. New Extension UI

### 5.1 Popup Settings

```
┌─────────────────────────┐
│  ⚡ Pitchly              │
│                         │
│  [Start Listening]      │
│                         │
│  Worker URL: [______]   │
│  Your Email: [______]   │
│  Manager Email: [______]│
│  Webhook URL: [______]  │
│                         │
│  [Save Settings]        │
└─────────────────────────┘
```

### 5.2 HUD Layout (During Call)

```
┌──────────────────────────┐
│ 🎤 45% │ 🗣️ 55%   🟢     │  <- Talk ratio + sentiment
├──────────────────────────┤
│                          │
│  [Objection Card Area]   │
│                          │
│  "Too expensive?"        │
│  → Try ROI pivot...      │
│                          │
└──────────────────────────┘
```

---

## 6. Worker Prompts

### 6.1 Sentiment Analysis (Post-Call)

```typescript
const SENTIMENT_SYSTEM_PROMPT = `You are a sales call analyst.
Analyze the following transcript and provide:
1. Overall sentiment: 'strong', 'neutral', or 'at_risk'
2. Sentiment arc: identify 2-3 key moments where sentiment shifted
3. Root cause for each shift
4. One actionable tip for the rep

Transcript format: [timestamp] Speaker: Text

Return JSON:
{
  "overallSentiment": "strong|neutral|at_risk",
  "shifts": [
    { "time": "4:32", "from": "strong", "to": "neutral", "cause": "pricing mentioned", "tip": "Anchor to value before mentioning price" }
  ]
}`;
```

### 6.2 Follow-Up Draft Generator

```typescript
const FOLLOW_UP_PROMPT = `Write a concise follow-up email based on this call summary.
Tone: professional but warm.
Include: Thank you, recap key points, address any unresolved objections, propose next step.

Call Summary:
- Objections: {{objections}}
- Sentiment: {{sentiment}}
- Key topics: {{topics}}

Return plain text email body only.`;
```

---

## 7. Implementation Timeline

| Week | Focus | Deliverable |
|---|---|---|
| **Week 1** | Dual-stream refactor | Mic/tab separated, cleaner STT, talk ratio calculation working |
| **Week 2** | Talk ratio + sentiment HUD | Live HUD shows ratio bar + sentiment dot |
| **Week 3** | D1 + snapshot generation | Calls persisted, post-call summary generated by Gemini |
| **Week 4** | Resend email + webhook | Snapshot emails sent, webhook POST working, end-to-end test |

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| End-to-end call test (real Google Meet) | 5 calls without crashes |
| Talk ratio accuracy | Within 10% of manual count |
| Email delivery rate | >95% |
| Time from call end to email | <30 seconds |
| Rep forwards snapshot to manager | 3/5 beta reps do this voluntarily |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Dual-stream refactor breaks existing pipeline | Keep feature branch, test thoroughly before merge |
| Resend free tier limits (100 emails/day) | Monitor, upgrade to paid if needed ($20/mo) |
| D1 latency slows real-time features | Only write to D1 at call end, not during |
| Sentiment keywords too naive | Add post-call Gemini override for summary accuracy |

---

## 10. Open Questions

1. **Resend domain:** Do you own `pitchly.ai`? If not, use Resend's default sender.
2. **Beta users:** Do you have 3-5 reps ready to test? Need them for Week 4 validation.
3. **Zapier template:** Should we provide a pre-built Zapier template for HubSpot?
