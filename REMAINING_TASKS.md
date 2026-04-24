# Pitchly — Remaining Tasks

This document tracks what's done, what's in progress, and what's deferred.

---

## ✅ Completed (Production Ready)

### Core Pipeline
- [x] Chrome Extension (MV3) — 7 source files built and bundled
- [x] Cloudflare Worker — `CallSessionAgent` Durable Object deployed
- [x] Audio Capture — Three-tier fallback + AudioWorklet dual-stream
- [x] AI Stack — Deepgram Nova-3 STT + Flux end-of-turn + Gemini 3 Flash Preview
- [x] Real-time HUD — Glassmorphism UI with streaming deltas

### Week 2: Talk Ratio + Sentiment
- [x] Dual-stream audio refactor (tab → STT, mic → RMS only)
- [x] Talk ratio bar with color coding (green/yellow/red)
- [x] Contextual nudges ("Listen more!", "Ask a discovery question")
- [x] Real-time sentiment dot (🟢🟡🔴) via keyword EMA + decay
- [x] Sentiment nudges ("Sentiment dropped — acknowledge their concern")

### Week 3: D1 + Snapshot Generation
- [x] D1 database `pitchly-db` created and schema applied
- [x] Calls, transcript_segments, objections tables with indexes
- [x] Post-call Gemini analysis (sentiment arc + follow-up draft)
- [x] D1 persistence at call end (parameterized queries)
- [x] Snapshot preview HUD panel with stats, objections, summary, copy-to-clipboard
- [x] Extension popup settings (worker URL, email, manager email, webhook)
- [x] Settings transmission via WebSocket
- [x] Webhook POST support (Zapier/Make compatible)
- [x] Resend email integration with styled HTML templates
- [x] Worker deployed to production: `pitchly-worker.kumarbharath63.workers.dev`
- [x] Extension rebuilt with deployed worker URL

### Prompts & Quality
- [x] Upgraded objection classification prompt with chain-of-thought reasoning
- [x] 8 few-shot examples for edge cases
- [x] Confidence calibration rubric (0.75-1.00)
- [x] Anti-hallucination guardrails (no invented types, no script modification)
- [x] Post-call sentiment analysis with phase-based segmentation
- [x] Follow-up draft prompt with 80-150 word limit and specific next steps
- [x] `TEST_SCENARIOS.md` — 6 benchmark scripts + stress tests + scoring rubric

### Security
- [x] Parameterized D1 queries (SQL injection prevention)
- [x] `escapeHtml()` for all email template user content
- [x] Email validation regex before Resend API calls
- [x] Webhook URL validation (http(s) prefix, length limit)
- [x] `durationMs` validation (≥ 0)
- [x] `exactOptionalPropertyTypes` enforced across both packages

---

## 🔥 Priority: Blocking for Beta Launch

- [ ] **End-to-End Live Test** — Run Scenario A from `TEST_SCENARIOS.md` on real Google Meet
- [ ] **Verify D1 Persistence** — Query remote DB after a test call
- [ ] **Verify Email Delivery** — If Resend configured, check inbox for snapshot
- [ ] **Verify Webhook** — If Zapier/Make URL configured, check payload received

---

## 📅 Deferred: Post-Beta / Phase 3

| Feature | Why Deferred | Trigger |
|---|---|---|
| Auth + Billing (Clerk/Stripe) | First 10 beta users don't need auth | 10th paying user |
| Dashboard UI | D1 schema ready, UI comes after data | Phase 3 PRD |
| Editable Knowledge Base | Hardcoded 10 objections sufficient for MVP | First enterprise deal |
| Native CRM Integration (HubSpot/Salesforce) | Webhook handles 80% of use cases | Enterprise demand |
| Speaker Diarization ML | Dual-stream volume heuristic works | Accuracy complaints |
| True VAD / Silence Gating | Sends ~48-80 KB/s continuously | Bandwidth/cost issues |
| Audio Buffering for STT | Deepgram called every 256ms — poor accuracy/cost | Cost threshold hit |
| CORS Tightening | `*` acceptable for beta | Public launch |
| Team Analytics / Leaderboard | Manager dashboard feature | Phase 3 |

---

## 🧪 Testing Artifacts

- `TEST_SCENARIOS.md` — 6 persona-based sales scripts
  - Scenario A: The Skeptic (hard)
  - Scenario B: Budget Guardian (medium)
  - Scenario C: The Enthusiast (easy)
  - Scenario D: The Ghost (hard)
  - Scenario E: The Committee (medium)
  - Scenario F: ROI Calculator (hard)
- Sentiment Stress Test — rapid mood swings
- Talk Ratio Stress Test — monologue vs silence phases
- Benchmark scoring rubric (weighted 80% pass threshold)

---

*Updated: April 2026*
