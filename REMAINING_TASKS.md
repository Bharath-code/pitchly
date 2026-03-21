# SalesCoach AI — Remaining Tasks

This document outlines the remaining work needed to complete the SalesCoach AI MVP, categorized by priority and value.

---

## 🎯 Status: MVP Core Built
The end-to-end pipeline is implemented and type-checks clean:
- **Chrome Extension (MV3):** All 7 source files built and bundled.
- **Cloudflare Worker:** `CallSessionAgent` (Durable Object) built.
- **Audio Capture:** Three-tier fallback + AudioWorklet implemented.
- **AI Stack:** Deepgram Nova-3 STT + Flux end-of-turn + Gemini 2.5 Flash via Vercel AI SDK v6.
- **HUD:** Glassmorphism UI with real-time streaming deltas.

---

## 🚀 Priority 1: Blocking (Must do to go live)
*Required before any real user can use the product.*

- [ ] **Deploy the Worker**
  - Run `wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY`
  - Run `cd worker && npm run deploy`
- [ ] **Configure Worker URL**
  - Update the extension popup or source to point to the production `*.workers.dev` URL.
- [ ] **End-to-End Live Test**
  - Speak a "price objection" on a real Google Meet/Zoom call and verify the card appears within 3 seconds.

---

## 🔥 Priority 2: High Value, Low Effort
*Improves demo quality and initial user activation.*

- [ ] **UX: Snappier "Analyzing" State**
  - Modify `hud.ts` to show an "Analyzing..." label as soon as `stream_delta` events begin, rather than waiting for the final `objection_card` event.
- [ ] **Record the Loom Demo**
  - Per PRD, the final deliverable is a 3-minute video showing the streaming card in real-time.
- [ ] **Verify Mic-Only Mode**
  - Stress test the `showHUDNotice()` UI for Zoom Desktop users (Tier 3 fallback).
- [ ] **Validate Hover-Pause Logic**
  - Confirm the 15s auto-dismiss timer correctly pauses when the user hovers over the card.

---

## 📅 Deferred: Phase 2 & 3
*To be built only after the first paying user (as per PRD).*

| Feature | Phase | Why Deferred |
|---|---|---|
| Post-call debrief | Phase 2 | Use Claude Sonnet for deep analysis after revenue. |
| Auth + Billing | Phase 2 | Not needed for the first 10 beta users. |
| Dashboard UI | Phase 2 | Focus on the core call experience first. |
| Editable KB | Phase 2 | Hardcoded 10 objections sufficient for MVP. |
| CRM Integration | Phase 3 | Enterprise feature (HubSpot/Salesforce). |

---
*Updated: March 2026*
