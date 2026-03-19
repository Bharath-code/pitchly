# Pitchly — Developer README

A Chrome Extension + Cloudflare Worker that detects sales objections in real-time and streams coaching cards onto the rep's screen during live calls.

## Architecture

```
Chrome Extension (MV3)          Cloudflare Worker (Durable Object)
──────────────────────          ──────────────────────────────────
popup.ts        ◄──────────────── status messages
background.ts   ───────────────►
content.ts      ◄── WebSocket ─► CallSessionAgent
hud.ts          ◄── events ─────   ├─ Deepgram Nova-3 (STT)
                                   ├─ Flux smart-turn-v2 (EOT)
                                   └─ Gemini 2.5 Flash (classify)
```

## Quick Start

### 1. Install dependencies

```bash
# Extension
cd extension && npm install

# Worker
cd ../worker && npm install
```

### 2. Configure secrets

```bash
cd worker

# Local dev — create .dev.vars (gitignored)
echo 'GOOGLE_GENERATIVE_AI_API_KEY=AIza...' > .dev.vars

# Production
npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```

Get your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 3. Build the extension

```bash
cd extension && npm run build
# → dist/ built files ready
```

### 4. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Pitchly icon appears in toolbar

### 5. Run worker locally

```bash
cd worker && npm run dev
# → http://localhost:8787
```

### 6. Connect extension to local worker

Click the Pitchly extension icon → set **Worker URL** to `localhost:8787`

### 7. Deploy to Cloudflare

```bash
cd worker && npm run deploy
# → https://pitchly-worker.YOURNAME.workers.dev
```

Update the **Worker URL** in the popup to your deployed URL.

## Project Structure

```
pitchly/
├── extension/
│   ├── manifest.json          # MV3 config
│   ├── popup.html             # Extension popup
│   ├── popup.css              # Popup styles
│   ├── build.mjs              # esbuild bundler
│   └── src/
│       ├── types.ts           # Shared TypeScript types
│       ├── background.ts      # Service worker + audio capture
│       ├── audio-processor.ts # AudioWorklet (audio thread)
│       ├── content.ts         # Tab script + WebSocket
│       ├── hud.ts             # Floating card UI
│       ├── hud.css            # HUD styles
│       └── popup.ts           # Popup logic
└── worker/
    ├── wrangler.toml          # Cloudflare config
    └── src/
        ├── index.ts           # CallSessionAgent
        ├── schema.ts          # Zod objection schema
        └── prompts.ts         # System prompt + KB
```

## Swapping AI Models

Edit `worker/wrangler.toml`:

```toml
[vars]
AI_MODEL = "gemini-2.5-flash"           # Free — MVP
# AI_MODEL = "claude-haiku-4-20250514"  # Switch when first revenue
```

Zero code changes required. Add the appropriate secret:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

## Supported Platforms

| Platform | Method | Audio Quality |
|---|---|---|
| Google Meet | Tab + Mic | Excellent |
| Zoom Web Client | Tab + Mic | Excellent |
| Zoom Desktop App | Mic only | Partial |

## Objection Types

`price` · `timing` · `authority` · `competitor` · `no_need` · `trust` · `roi` · `complexity` · `priority` · `ghost`
