# SalesCoach AI MVP Implementation Plan

## Project Structure
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

## Phase 1: Project Setup & Manifest

### 1.1 Create Project Directories
- Create `extension/` directory- Create `worker/src/` directory

### 1.2 Implement manifest.json
Based on PRD specifications:
- Manifest V3
- Permissions: tabCapture, activeTab, scripting, storage
- Host permissions for Google Meet and Zoom- Background service worker
- Content scripts for Meet and Zoom domains
- Action with default title

## Phase 2: Background Service Worker (Audio Capture)

### 2.1 Three-Tier Audio Capture Logic
Implement `background.ts` with:
- `CaptureMode` type: 'mixed' | 'tab' | 'mic-only'
- `initCapture()` function with fallback logic:
  1. Tier 1: Tab + mic mixed (best quality)
  2. Tier 2: Tab only (mic permission denied)
  3. Tier 3: Mic only (desktop apps fallback)
- Helper functions: `mixStreams()`, `captureTab()`
- Error handling for each tier

### 2.2 Audio Processing Pipeline
- AudioContext for mixing streams
- ScriptProcessorNode for audio chunking
- 4096 buffer size, mono audio
- Send PCM float32 arrays to WebSocket

## Phase 3: Cloudflare Worker (Agent Implementation)

### 3.1 Project Configuration
- `wrangler.toml` with:
  - AI binding for Workers AI
  - Durable Object binding for CallSessionAgent
  - Vars including AI_MODEL
  - Migration v1 for CallSessionAgent

### 3.2 CallSessionAgent Implementation
In `worker/src/index.ts`:
- Import agents, AI SDK, Zod
- Define Env interface with API keys and bindings
- ObjectionSchema Zod schema for structured output
- OBJECTION_PROMPT with knowledge base and rules
- CallSessionAgent class extending Agent<Env>
  - utteranceBuffer for accumulating transcript
  - onMessage handler for audio_chunk messages
  - transcribe() method using Deepgram Nova-3
  - isEndOfTurn() method using Flux smart-turn-v2
  - classifyAndStream() method using Vercel AI SDK v6
    - Gemini 2.5 Flash via @ai-sdk/google
    - Streaming response with experimental_output
    - Token-by-token streaming via WebSocket
    - Confidence threshold check (≥0.75)
- Export default fetch handler with routeAgentRequest

## Phase 4: Extension Content Script

### 4.1 AgentClient Connection
In `content.ts`:
- Import AgentClient from @cloudflare/agents/client
- startSession() function:
  - Create AgentClient instance
  - Set up message event listener
  - Handle three message types:
    * stream_delta: append text to HUD
    * objection_card: finalize HUD card
    * no_objection: dismiss HUD
  - Initiate audio capture with three-tier fallback
  - Show notice for mic-only mode
- streamAudioToAgent() function:
  - AudioContext setup
  - MediaStreamSource and ScriptProcessorNode
  - onaudioprocess handler to send audio chunks

## Phase 5: HUD (Heads-Up Display) Implementation

### 5.1 HUD Initialization
In `hud.ts`:
- initHUD() function:
  - Create div#salescoach-hud
  - Apply best-practice styling from research
  - Set initial display: none
  - Append to document.body
- startStreamingCard(objectionType) function:
  - Set header with objection type label
  - Show close button (×)
  - Reset response text container
  - Show card with display: block
  - Reset dismiss timer
- appendHUDText(delta) function:
  - Append streaming text to response element- dismissHUDCard() function:
  - Hide card
  - Clear dismiss timer

### 5.2 HUD Styling Best Practices
From ui-ux-research.md:
- Position: fixed, bottom: 24px, right: 24px
- Dimensions: width: 360px, max-width: 90vw
- Styling: dark background with backdrop-filter, subtle border
- Border-radius: 12px, padding: 16px
- Typography: system-ui, 14px, proper line-height- Z-index: 999999
- Shadow: 0 8px 32px rgba(0,0,0,0.4)
- Animations: slide-in/fade-in transitions
- Close button styling and hover effects
- Streaming cursor effect (optional)
- Reduced motion media query support

### 5.3 Accessibility Features
- role="status" and aria-live="polite" on HUD container
- Close button with proper aria-label
- Keyboard navigation support (Tab, Enter/Space, Escape)
- Color contrast compliance- Respect system preferences

## Phase 6: Integration & Testing

### 6.1 WebSocket Message Flow
- Extension → Worker: audio_chunk (PCM float32 array)
- Worker → Extension: 
  - stream_delta: {type: 'stream_delta', delta: 'token'}
  - objection_card: {type: 'objection_card', card: {objection, response, confidence}}
  - no_objection: {type: 'no_objection'}

### 6.2 Error Handling & Edge Cases
- WebSocket reconnection logic (built into AgentClient)
- Audio capture failures and fallbacks
- Permission denied handling
- Network interruption recovery
- Memory leak prevention (cleanup intervals/timeouts)

### 6.3 Performance Optimization
- Minimal DOM updates during streaming
- Efficient audio processing (avoid unnecessary copying)
- Proper cleanup of AudioContext and processors
- GPU-accelerated CSS animations
- Debounce rapid updates if needed

## Phase 7: Deployment & Beta Preparation

### 7.1 Local Development Setup
- bun install for dependencies
- wrangler dev for local worker testing
- Chrome extension loading (unpacked)
- Console logging for debugging

### 7.2 Cloudflare Deployment
- wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
- wrangler deploy for production deployment
- Verify worker endpoints are accessible

### 7.3 Beta Distribution Preparation
- Create unpacked extension distribution package
- Document installation steps:
  1. Download and unzip extension folder
  2. Enable Developer mode in chrome://extensions
  3. Click "Load unpacked" and select folder
- Create beta user onboarding message- Prepare Loom demo recording script

## Phase 8: Validation & Testing

### 8.1 Audio Capture Testing
- Test Tier 1 (tab+mic) on Google Meet/Zoom Web
- Test Tier 3 (mic-only) fallback on Zoom Desktop
- Verify notice appears for mic-only mode
- Validate audio quality and latency### 8.2 End-to-End Testing
- Test all 10 objection types trigger correctly
- Measure end-to-end latency (<3 seconds)
- Verify streaming text effect works smoothly- Test auto-dismiss (15s) and manual dismiss (X)
- Confirm card appears in correct position
- Test on various webpage layouts and zoom levels

### 8.3 Performance Validation- Monitor CPU/memory usage during calls
- Verify no significant impact on Zoom/Meet performance- Test extended call durations (30+ minutes)
- Verify agent hibernation between calls (zero idle cost)

## Success Criteria
- [ ] Extension installs in under 2 minutes from zip file
- [ ] Tier 1 audio capture works on Google Meet and Zoom Web
- [ ] Tier 3 mic fallback activates on Zoom Desktop with notice
- [ ] Speaking "this is too expensive" streams Price objection card within 3 seconds- [ ] Response text visibly types into card token by token
- [ ] All 10 objection types trigger correctly in mock call test
- [ ] Card auto-dismisses after 15 seconds
- [ ] X button dismisses card immediately
- [ ] Worker deployed to Cloudflare via wrangler deploy
- [ ] Agent hibernates correctly between calls (zero idle cost)
- [ ] Loom demo recorded showing real-time streaming card appearance
- [ ] Loom link ready to send to 10 LinkedIn prospects

## Dependencies
### Worker Dependencies
- bun add agents @cloudflare/agents ai @ai-sdk/google zod

### Extension Dependencies (Dev Only)
- bun add -d typescript @types/chrome

## Environment Variables
- GOOGLE_GENERATIVE_AI_API_KEY (set via wrangler secret put)
- AI_MODEL = "gemini-2.5-flash" (in wrangler.toml [vars])

This implementation plan provides a detailed roadmap for building the SalesCoach AI MVP Chrome extension following the PRD specifications and best practices researched. Each phase builds upon the previous one, ensuring a solid foundation for the real-time objection handling system.