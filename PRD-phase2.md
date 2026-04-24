# Pitchly — Phase 2 PRD: "From Cue Card to Co-Pilot"

**Status:** Week 3 Complete ✅  
**Target:** Individual sales reps + team managers (no auth)  
**Timeline:** 4 weeks (Week 1-3 done, Week 4: final validation)  
**Success Metric:** A rep finishes a call and receives an email snapshot they forward to their manager.

---

## 1. Overview

### 1.1 Problem
Reps forget 90% of what happens on a call. Objection cards help in the moment, but once the call ends, the insight evaporates. Managers have zero visibility. CRMs remain empty.

### 1.2 Solution
Real-time talk ratio + sentiment alerts during the call, followed by an auto-generated post-call snapshot emailed to the rep (and optionally their manager).

### 1.3 Non-Goals
- No auth system (Clerk) — collect email via popup ✅
- No dashboard UI — build D1 schema only, dashboard comes Phase 3 ✅
- No native CRM integrations — generic webhook only ✅
- No speaker diarization ML — use dual-stream volume heuristic instead ✅

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

### 3.2 Dual-Stream Audio Refactor (P0) ✅

**Implemented:** Tab audio sent to Deepgram for STT. Mic audio measured locally via RMS for talk ratio only. In mic-only fallback, mic goes to STT.

---

## 4. Feature Specifications

### 4.1 Talk Ratio Meter (P1) ✅

- Every 5 seconds, calculates RMS energy for last 5s of mic vs tab
- Nudges: >75% "Listen more!", <30% "Ask a discovery question"
- Bar colors: Green (balanced), Yellow (>60%), Red (>75%)

### 4.2 Sentiment Thermometer (P2) ✅

**Tier 1 — Real-time:** Keyword-based EMA with word-boundary regex and 10s decay. Thresholds: ≥0.3 strong, ≤-0.3 at_risk.

**Tier 2 — Post-call:** Full transcript sent to Gemini for phase-based sentiment arc analysis with evidence-based shift detection.

### 4.3 D1 Persistence Layer (P3) ✅

**Database:** `pitchly-db` (APAC, ID: `7cdea935-99ac-4080-b3d2-5dfd119a6fb4`)

**Schema applied:**
- `calls` — id, session_name, rep_email, manager_email, started_at, ended_at, duration_ms, talk_ratio_you, talk_ratio_them, final_sentiment, summary, follow_up_draft
- `transcript_segments` — call_id, speaker, text, sentiment, timestamp
- `objections` — call_id, type, confidence, response, timestamp

All queries parameterized. All writes happen at call end only.

### 4.4 Post-Call Snapshot Email (P4) ✅

**Trigger:** Extension sends `call_ended` → Worker finalizes call in D1 → triggers Resend API.

**Resend Integration:**
- API key stored via `wrangler secret put RESEND_API_KEY`
- From: `Pitchly <snapshots@pitchly.ai>`
- Styled HTML email with stats, objections, follow-up draft
- Manager CC supported

**Extension Settings (Popup):**
```typescript
interface PopupSettings {
  workerHost: string;
  repEmail: string;
  managerEmail?: string;
  webhookUrl?: string;
}
```
Stored in `chrome.storage.local`. Auto-save on blur + explicit Save button.

### 4.5 Generic Webhook + Manager CC (P5) ✅

- Webhook POSTs snapshot JSON to configured URL after call ends
- Zapier/Make compatible
- Manager CC via Resend if `managerEmail` set

---

## 5. New Extension UI

### 5.1 Popup Settings ✅

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

### 5.2 HUD Layout (During Call) ✅

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

### 5.3 Post-Call Snapshot Panel ✅

Replaces call meta after `call_ended`:
- Duration, talk ratio, final sentiment stats (2x2 grid)
- Objections list with type badges and confidence
- Call summary
- Follow-up draft with **Copy** button
- Persistence status indicator

---

## 6. Worker Prompts

### 6.1 Objection Classification ✅

Upgraded with:
- 5-step chain-of-thought reasoning
- Explicit confidence calibration rubric
- 8 few-shot examples
- 6 anti-hallucination rules
- Exact Knowledge Base script enforcement

See `worker/src/prompts.ts` for full prompt.

### 6.2 Post-Call Sentiment Analysis ✅

Phase-based segmentation with evidence-based shift detection. Actionable tips per shift. No invented quotes.

### 6.3 Follow-Up Draft Generator ✅

80-150 word limit. Specific recap bullets. Direct objection acknowledgment. One clear next step. No generic filler.

---

## 7. Implementation Timeline

| Week | Focus | Deliverable | Status |
|---|---|---|---|
| **Week 1** | Dual-stream refactor | Mic/tab separated, cleaner STT, talk ratio calculation working | ✅ |
| **Week 2** | Talk ratio + sentiment HUD | Live HUD shows ratio bar + sentiment dot | ✅ |
| **Week 3** | D1 + snapshot generation | Calls persisted, post-call summary generated by Gemini, email sent | ✅ |
| **Week 4** | Validation + beta prep | Run test scenarios, verify end-to-end, onboard first beta users | 🔄 |

---

## 8. Success Metrics

| Metric | Target | Status |
|---|---|---|
| End-to-end call test (real Google Meet) | 5 calls without crashes | 🔄 In Progress |
| Talk ratio accuracy | Within 10% of manual count | 🔄 To Validate |
| Email delivery rate | >95% | 🔄 To Validate |
| Time from call end to email | <30 seconds | 🔄 To Validate |
| Rep forwards snapshot to manager | 3/5 beta reps do this voluntarily | 🔄 To Validate |

---

## 9. Risks & Mitigations

| Risk | Mitigation | Status |
|---|---|---|
| Dual-stream refactor breaks existing pipeline | Keep feature branch, test thoroughly before merge | ✅ Resolved |
| Resend free tier limits (100 emails/day) | Monitor, upgrade to paid if needed ($20/mo) | 🔄 Monitoring |
| D1 latency slows real-time features | Only write to D1 at call end, not during | ✅ Resolved |
| Sentiment keywords too naive | Post-call Gemini override for summary accuracy | ✅ Implemented |
| False positives in objection detection | Upgraded prompts with chain-of-thought + few-shot | ✅ Implemented |

---

## 10. Test Scenarios

See `TEST_SCENARIOS.md` for:
- 6 persona-based sales scripts (A-F)
- Sentiment stress test (rapid mood swings)
- Talk ratio stress test (monologue vs silence)
- Benchmark scoring rubric (80% pass threshold)

---

## 11. Deployment Info

- **Worker URL:** `https://pitchly-worker.kumarbharath63.workers.dev`
- **D1 Database:** `pitchly-db` (APAC)
- **Model:** `gemini-3-flash-preview`
- **Extension Default Host:** `pitchly-worker.kumarbharath63.workers.dev`

---

## 12. Open Questions

1. **Beta users:** Do you have 3-5 reps ready to test? Need them for Week 4 validation.
2. **Zapier template:** Should we provide a pre-built Zapier template for HubSpot?
3. **Resend domain:** Do you own `pitchly.ai`? If not, current sender uses Resend default.

(End of file)
