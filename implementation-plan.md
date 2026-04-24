# Pitchly MVP Implementation Plan

## Project Structure
```
salesCoach/
├── extension/
│   ├── manifest.json          # MV3 config, permissions
│   ├── background.ts          # Service worker, three-tier audio capture
│   ├── content.ts             # Injected into tab, WebSocket, audio streaming
│   ├── popup.ts               # Extension popup UI with settings
│   ├── popup.html             # Popup markup
│   ├── popup.css              # Popup styles
│   ├── hud.ts                 # Floating HUD: call-meta, objection cards, snapshot
│   ├── types.ts               # Shared TypeScript types
│   ├── audio-processor.ts     # AudioWorkletProcessor (IIFE build)
│   ├── hud.css                # External HUD stylesheet
│   └── build.mjs              # esbuild bundler
├── worker/
│   ├── src/
│   │   ├── index.ts           # CallSessionAgent DO: STT, classification, persistence
│   │   ├── schema.ts          # Zod schemas: ObjectionSchema, PostCallAnalysisSchema
│   │   └── prompts.ts         # Upgraded prompts with chain-of-thought + few-shot
│   ├── wrangler.toml          # Worker config: D1, DO, AI binding
│   └── schema.sql             # D1 database schema
├── TEST_SCENARIOS.md          # 6 benchmark sales scripts + stress tests
├── PRD-phase2.md              # Phase 2 specification
├── REMAINING_TASKS.md         # Deferred features tracker
└── AGENTS.md                  # Agent operational notes
```

## Phase 1: Project Setup & Manifest ✅

- [x] Create `extension/` and `worker/src/` directories
- [x] Implement `manifest.json` (MV3, tabCapture, activeTab, scripting, storage)
- [x] Content scripts for Meet and Zoom domains
- [x] Background service worker config

## Phase 2: Background Service Worker (Audio Capture) ✅

- [x] Three-tier audio capture with fallback logic
  - Tier 1: Tab + mic mixed (best quality)
  - Tier 2: Tab only (mic permission denied)
  - Tier 3: Mic only (desktop apps fallback)
- [x] `CaptureMode` type and `startCapture()` / `stopCapture()` functions
- [x] `getTabStreamId()` via `chrome.tabCapture.getMediaStreamId()`
- [x] Keepalive alarm to prevent MV3 service worker sleep

## Phase 3: Cloudflare Worker (Agent Implementation) ✅

- [x] `wrangler.toml` with AI binding, D1 database, Durable Object
- [x] `CallSessionAgent` class extending `Agent<Env>`
- [x] `ObjectionSchema` Zod schema for structured output
- [x] `PostCallAnalysisSchema` Zod schema for post-call sentiment
- [x] Upgraded `OBJECTION_PROMPT` with chain-of-thought + 8 few-shot examples
- [x] `POST_CALL_SENTIMENT_PROMPT` with phase-based analysis
- [x] `FOLLOW_UP_PROMPT` with 80-150 word limit
- [x] `transcribe()` - Deepgram Nova-3 via Workers AI
- [x] `isEndOfTurn()` - Flux smart-turn-v2 via Workers AI
- [x] `classifyAndStream()` - Gemini via Vercel AI SDK v6
- [x] `handleCallEnded()` - post-call analysis, D1 persistence, email, webhook
- [x] `persistCall()` - parameterized D1 inserts
- [x] `sendSnapshotEmail()` - Resend HTML email with escaped content
- [x] `sendWebhook()` - fire-and-forget POST to configured URL
- [x] Input validation: email regex, URL prefix check, length limits
- [x] Security: escapeHtml, parameterized SQL, duration validation

## Phase 4: Extension Content Script ✅

- [x] `startSession()` - WebSocket connection to worker
- [x] `stopSession()` - cleanup, send `call_ended` with settings
- [x] `handleAgentMessage()` - route all agent message types
- [x] `startAudioStreaming()` - AudioContext + AudioWorklet setup
- [x] Dual-stream: tab -> STT node, mic -> RMS node (mixed mode)
- [x] Mic-only fallback: mic -> STT node
- [x] Talk ratio calculation every 5s from RMS accumulators
- [x] Settings loaded from `chrome.storage.local` and sent via WS

## Phase 5: HUD (Heads-Up Display) Implementation ✅

- [x] `initHUD()` - create DOM, inject styles, event listeners
- [x] Persistent `sc-call-meta` during call:
  - Talk ratio bar with color states
  - Sentiment dot (green/yellow/red)
  - Contextual nudge text
- [x] `sc-objection-area` for streaming objection cards:
  - Type badge with colors
  - Token-by-token streaming text
  - Confidence percentage
  - Progress bar + auto-dismiss (15s)
  - Hover pause, manual dismiss (X), Escape key
- [x] `sc-snapshot` post-call panel:
  - Stats grid (duration, talk ratio, sentiment)
  - Objections list with badges
  - Call summary
  - Follow-up draft with Copy button
  - Persistence status indicator
- [x] Glassmorphism styling, dark/light mode support
- [x] Accessibility: roles, aria-live, keyboard navigation, reduced motion

## Phase 6: Popup UI ✅

- [x] `popup.html` - Start/Stop button, status badge, audio mode
- [x] Settings section: Worker URL, Your Email, Manager Email, Webhook URL
- [x] `popup.ts` - load/save settings, auto-save on blur, visual feedback
- [x] `popup.css` - premium dark theme with violet accent
- [x] State sync with background worker

## Phase 7: D1 Database ✅

- [x] `schema.sql` - calls, transcript_segments, objections tables
- [x] Indexes: `idx_calls_rep_email`, `idx_calls_started_at`, `idx_segments_call_id`, `idx_objections_call_id`
- [x] Remote database created: `pitchly-db` (APAC)
- [x] Schema applied to production database
- [x] All inserts parameterized via `.prepare().bind()`

## Phase 8: Deployment & Production ✅

- [x] `wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY`
- [x] Worker deployed: `pitchly-worker.kumarbharath63.workers.dev`
- [x] Extension rebuilt with deployed worker URL
- [x] Extension builds clean: 4 bundles (background, content, popup, audio-processor)
- [x] Both packages type-check clean (`tsc --noEmit`)
- [x] Model: `gemini-3-flash-preview`

## Phase 9: Validation & Testing 🔄

### 9.1 Test Scenarios
- [ ] Run Scenario A (The Skeptic) - 3 objections, sentiment arc
- [ ] Run Scenario B (Budget Guardian) - price + timing + authority
- [ ] Run Scenario C (Enthusiast) - no objections, strong sentiment
- [ ] Run Scenario D (Ghost) - ghost + priority recovery
- [ ] Run Scenario E (Committee) - authority + competitor + timing
- [ ] Run Scenario F (ROI Calculator) - roi + complexity + price
- [ ] Sentiment Stress Test - verify rapid flipping
- [ ] Talk Ratio Stress Test - verify monologue detection

### 9.2 Technical Validation
- [ ] Verify D1 records after test call
- [ ] Verify email snapshot arrives (if Resend configured)
- [ ] Verify webhook payload received (if URL configured)
- [ ] Measure end-to-end latency (< 3 seconds)
- [ ] Test 30+ minute call duration
- [ ] Verify agent hibernation between calls

### 9.3 Success Criteria
- [ ] Extension installs in under 2 minutes from zip file
- [ ] Tier 1 audio capture works on Google Meet and Zoom Web
- [ ] Tier 3 mic fallback activates on Zoom Desktop with notice
- [ ] Speaking a price objection streams Price card within 3 seconds
- [ ] Response text visibly types into card token by token
- [ ] All 10 objection types trigger correctly in mock call test
- [ ] Card auto-dismisses after 15 seconds
- [ ] X button dismisses card immediately
- [ ] Worker deployed to Cloudflare via wrangler deploy
- [ ] Agent hibernates correctly between calls (zero idle cost)
- [ ] Post-call snapshot appears in HUD within 5 seconds of stop
- [ ] Follow-up draft is contextually relevant and actionable

## Dependencies

### Worker Dependencies
- agents, @cloudflare/agents, ai, @ai-sdk/google, zod

### Extension Dependencies (Dev Only)
- typescript, @types/chrome

### Environment Variables
- `GOOGLE_GENERATIVE_AI_API_KEY` (set via wrangler secret put)
- `RESEND_API_KEY` (optional, for post-call email)
- `AI_MODEL` in wrangler.toml [vars] - currently `gemini-3-flash-preview`

## Notes

- No tests exist in this repo; verify manually by loading the extension and running test scenarios
- See `TEST_SCENARIOS.md` for structured benchmark scripts
- See `AGENTS.md` for operational notes and quick commands
