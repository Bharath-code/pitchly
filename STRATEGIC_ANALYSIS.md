# Pitchly — Executive Strategic Analysis

**Date:** June 14, 2026
**Author:** AI Strategic Analysis (Multi-Perspective)
**Project:** Pitchly (formerly SalesCoach AI) — Chrome Extension + Cloudflare Worker

---

## 📌 What This Project Is

Pitchly is a **Chrome Extension + Cloudflare Worker** that listens to live sales calls (Zoom/Google Meet), detects the moment a prospect raises an objection, and streams a coaching response card onto the rep's screen in real time — with zero manual input required. It captures audio via a three-tier fallback system, transcribes using Deepgram Nova-3 at the edge, detects end-of-turn using Flux ML, classifies objections using Gemini 3 Flash, and displays streaming cards with a typing effect.

### Current Feature Set

- **Real-time HUD**: Talk ratio bar, sentiment dot (🟢🟡🔴), contextual nudges ("Listen more!", "Ask a discovery question")
- **Objection detection**: 10 objection types (price, timing, authority, competitor, no_need, trust, roi, complexity, priority, ghost) with confidence scoring
- **Post-call analysis**: D1 database persistence, Gemini sentiment arc analysis, follow-up draft generation
- **Email/webhook output**: Resend email snapshots to rep + manager CC, Zapier-compatible webhook
- **Popup settings**: Worker URL, email, manager email, webhook URL configuration
- **Three-tier audio capture**: Tab+mic mixed → tab only → mic-only fallback (handles desktop Zoom)
- **Streaming card UI**: Glassmorphism card with token-by-token typing effect, progress bar, auto-dismiss

---

## 📊 Overall Scorecard

| Dimension | Score | Critical Next Action |
|-----------|-------|---------------------|
| **Technical (CTO Lens)** | 7/10 | Run end-to-end tests — prove it works |
| **Product-Market Fit** | 3/10 | Talk to 10 SDRs this week |
| **Revenue Readiness** | 2/10 | No pricing, no billing, no validation |
| **Marketing/Distribution** | 2/10 | Send 50 DMs/day for 2 weeks |
| **UX/Delight** | 6/10 | Reduce card size, add onboarding |
| **Competitive Moat** | 2/10 | Build cross-call memory (Vectorize) |
| **Investor Readiness** | 4/10 | Get 3 paid users, then raise |
| **Overall** | **3.7/10** | Ship the product to real humans. Now. |

---

## 👑 CEO Perspective — "Do we have a business?"

### What's Good
- You've identified a real problem. SDRs/AEs freeze during calls. This is a $5B+ TAM (conversation intelligence / deal acceleration).
- The architecture is production-grade and cost-efficient. Cloudflare edge + Gemini Flash = near-zero cost to serve.
- You shipped. Most founders don't. The codebase is clean, typed, and documented.

### What's Missing
- **No product-market fit validation.** You have zero users, zero calls tested end-to-end, zero feedback loops.
- **No revenue model.** No auth, no billing, no pricing page, no free tier limits.
- **No distribution engine.** The idea that 10 LinkedIn DMs will get beta users is optimistic without a warm audience.
- **Strategic identity crisis.** Is this "SalesCoach," "Pitchly," an objection handler, a coaching platform, or deal-saving AI?

### The CEO Question
> *Is this a lifestyle business ($10k MRR from 100 SDR teams) or a VC-backed moonshot ($100M+)?*

The TAM supports VC. The current execution supports lifestyle. Pick one and build accordingly.

---

## 💰 CFO Perspective — "Can we make money?"

### Revenue Model (Potential)

| Tier | Price | Target | Est. MRR |
|------|-------|--------|----------|
| Individual | $29/mo | Solo SDRs | $2,900/100 users |
| Team (Phase 2) | $79/mo | 5-15 rep teams | $7,900/100 teams |
| Enterprise (Phase 3) | $199/mo | Sales orgs | Too early |

### Cost Model
- Gemini 2.5 Flash: ~$0.15/call-hour
- Deepgram Nova-3: Free on Workers AI (today)
- Cloudflare DO: $0.001/session
- D1: $0.89/GB storage
- **Total variable cost: ~$0.20/call-hour**
- At $79/team with 50 calls/month/rep: cost = $10/user, gross margin = 87%

### The Problem
The existing strategic audit already flagged this — "CFOs don't buy vitamins in a downturn." You need proof that Pitchly *saves deals*, not just shows cards.

### CFO Recommendation
Run a 30-day pilot with 3 companies for free. If they renew without being asked to pay ($49/mo), you have pricing power. If they don't, you have a retention problem.

---

## 📣 CMO Perspective — "How do we get 10 customers?"

### Current State
You have zero brand, zero social proof, zero content, zero distribution. The "marketing strategy" is "send Loom to 10 LinkedIn prospects." That's not a strategy — that's a Hail Mary.

### 90-Day Marketing Plan

#### Weeks 1-2: The Product Must Work First
1. ✅ Run all 6 TEST_SCENARIOS end-to-end on real Google Meet
2. ✅ Fix bugs until the extension doesn't crash on a 30-min call
3. ✅ Record a compelling 3-min Loom demo showing real-time objection detection
4. ✅ Have 2 friends do a mock call and get their honest "would you pay for this?" reaction

#### Weeks 3-4: Personal Outreach (10 prospects)

**Target:** SDR Managers and Sales Enablement Managers at B2B SaaS companies (50-200 employees).

**Message template:**
> "Hey [Name], I built a Chrome extension that detects objections live during calls and streams the response onto your screen. I'm looking for 10 SDRs to try it for free on 3 calls and tell me if it's useful. Want to give it a shot?"

**Channels (in order of effectiveness):**
- **LinkedIn DM** to SDR Managers — personalize with their recent post
- **Cold email** to rev-ops@company.com — keep it under 80 words
- **Slack communities** (RevGenius, Pavilion, SDR Growth) — offer value first, don't pitch

#### Weeks 5-8: Content Flywheel (Organic)

1. **"The 10 Most Common Sales Objections (and How to Handle Them in Real Time)"** — LinkedIn article
2. **Loom demo** of Pitchly on a real call — post to LinkedIn, tag the rep (with permission)
3. **Twitter thread**: "As a sales rep, I tested an AI that listens to my calls and whispers responses. Here's what happened."
4. **Product Hunt launch** — target $29/mo individual plan as entry point

#### Weeks 9-12: Convert to Paying

Offer first 10 beta users: "30-day free trial, then $29/mo for individual or $79/mo for your team."
If retention > 60% after 30 days, you have product-market fit. Raise prices.

### CMO Bottom Line
You need to talk to 50 prospects to get 10 beta users. Start today. The code is done enough. Get in front of humans.

---

## 🏗️ CTO Perspective — "Is the architecture production-ready?"

### Strengths
- ✅ Clean TypeScript with strict mode, `exactOptionalPropertyTypes`, no `any` casts
- ✅ Edge-first audio pipeline (tab capture → Worklet → Workers AI → DOM injection) is genuinely hard and well-executed
- ✅ Model-agnostic layer via Vercel AI SDK — swap models via env var
- ✅ Three-tier audio capture fallback handles real-world edge cases
- ✅ WebSocket with proper lifecycle management, keepalive alarms
- ✅ Parameterized D1 queries (no SQL injection)
- ✅ Security hygiene: escapeHtml, email validation, webhook URL validation

### Critical Gaps

| Issue | Severity | Fix |
|-------|----------|-----|
| 🔴 **Never been live-tested** | Critical | Run TEST_SCENARIOS before anything else |
| 🔴 **No error monitoring** | Critical | Add Sentry or CF Workers logging |
| 🔴 **No tests** | High | At minimum, e2e test for the audio pipeline |
| 🟡 **Dual-stream RMS talk ratio heuristic** | Medium | Needs calibration — RMS-based volume detection has known false positives |
| 🟡 **Continuous audio streaming (~48-80 KB/s)** | Medium | Add true VAD / silence gating to reduce bandwidth |
| 🟡 **Deepgram on Workers AI — unknown scalability** | Medium | Benchmark at 10+ concurrent sessions |
| 🟡 **No vector store / cross-call memory** | Medium | Add Cloudflare Vectorize + embeddings |
| 🟢 **DO session limit at CF** | Low | 100+ concurrent before hitting limits |

### CTO Recommendation
Before writing another line of code, run 5 end-to-end test calls. Fix the bugs you find. Add basic error logging. *Then* you can think about features.

---

## 🔧 Staff Engineer Perspective — "Will it hold up?"

### Build System Assessment
The build system is correct (esbuild, IIFE for Worklet, MV3 alarms). The architecture is clean. But:

1. **Zero observability.** If the extension crashes mid-call, the user loses everything with no way to diagnose.
2. **No audio buffering.** Sending PCM to Deepgram every 256ms is wasteful (cost) and inaccurate (context window too small for STT).
3. **Flux end-of-turn at 80% threshold is untuned.** Could result in missed objections or false positives that destroy user trust in the first 2 minutes.
4. **Talk ratio from RMS is a heuristic, not science.** During silence-to-speech transitions, accumulator math breaks.
5. **The `transcribe()` function ignores return null — treats silent transcription as empty string.** Deepgram errors silently swallow audio chunks.

### Staff Eng Fix Priorities (In Order)
1. Add console.log for every WebSocket state change (debuggability)
2. Buffer 512ms of PCM before sending to Deepgram (cost + accuracy)
3. Add VAD (Voice Activity Detection) to skip silent audio chunks (bandwidth)
4. Log all errors from Deepgram, Flux, Gemini to worker console (visibility)
5. When `transcribe()` returns null, don't run end-of-turn detection (obvious bug)

---

## 🤖 AI Product Manager Perspective — "Are we building the right thing?"

### Jobs-to-be-Done Analysis

| Job | Current solution | Gap |
|-----|-----------------|-----|
| "Win this deal" | Scripts | Reps don't need scripts — they need confidence |
| "Know when I'm losing" | Sentiment dot | Keyword-based EMA, not real sentiment |
| "Stop talking so much" | Talk ratio bar | Useful, but doesn't tell them *when* to stop |
| "Remember what happened" | D1 snapshot + email | **Genuinely good — most useful feature** |
| "Impress my manager" | Manager CC on email | **Also good — gives rep visibility credit** |
| "Get better over time" | Nothing | No learning across calls |

### The Real PM Insight
Your post-call snapshot (D1 + email) is actually the most valuable feature because it solves a pain managers feel — not just reps. The real-time card is the hook. The email snapshot is the retention mechanism. Lean *harder* into the post-call experience.

### Missing Features That Would Be 10x

1. **Cross-call objection patterns** — "You've faced 'price' objections 7 times this month. Your best response includes [specific phrase]."
2. **Pre-call brief** — Scrape LinkedIn + company news before the meeting. "Mention their recent Series B. They're hiring VPs."
3. **Manager dashboard** — "Your team faced 23 objections this week. Here's where they need coaching."
4. **Voice whisper** (audio cue in ear via headset) — "Pivot to ROI now" whispered during the call. Invisible to prospect.

---

## 🎨 UI/UX Expert Perspective — "Does it delight?"

### What's Good
- Glassmorphism styling looks premium
- Streaming typing effect creates the "in real time" feel
- Sentiment dot + talk ratio bar give at-a-glance understanding
- Snapshot panel with stats grid is clean and scannable
- Light/dark mode support
- Accessibility: ARIA labels, keyboard navigation (Escape to dismiss), reduced motion support

### What Needs Work

1. **The card blocking the screen is a UX sin.** Bottom-right is standard, but on Zoom with participants, chat, and controls already there, 380px is too big. **Make it 280px or collapsible.**
2. **No onboarding.** First-time user sees nothing. No tooltip, no "try saying 'this is too expensive'" prompt.
3. **No feedback mechanism.** How does a rep say "this card was helpful" or "this was wrong"?
4. **"Mic-only mode" notice is too subtle.** Small yellow text line. Users won't notice. Make it a dismissible banner.
5. **Copy button on snapshot needs better feedback.** "Copied!" disappears too fast. Add a checkmark animation.

### Delight Opportunities

- **Celebration moment after first objection card:** Confetti or subtle "⚡ Nice pivot!" animation. Gamify the coaching experience.
- **Sound effect on card appearance** (optional, user-configurable) — a subtle chime that doesn't get picked up by the mic.
- **Voice mode toggle** — "I'll read this to you" option that whispers via rep's headset.

---

## 🚀 Startup Coach Perspective — "What should we actually do?"

### Current Stage: Trough of Disillusionment
You've built a feature-rich MVP but haven't talked to a single user. The code is elegant. The hard part begins now.

### 4-Week Action Plan

#### Week 1: MAKE IT WORK (no new features)
- Run all 6 TEST_SCENARIOS
- Fix every crash, misclassification, and UX friction
- Record the Loom demo
- Set up basic error logging

#### Week 2: TALK TO 10 SDRs
- Send 50 LinkedIn DMs/day
- Offer free 30-day trial
- Don't pitch — listen. Ask:
  - "What's the hardest part of your current call?"
  - "Have you tried real-time coaching tools before?"
  - "What would make you pay for this?"

#### Week 3: ITERATE ON FEEDBACK
- If 3+ users say the same thing, build it
- If they say "I'd pay for X," charge for X
- Cut features nobody mentions

#### Week 4: FIRST REVENUE OR PIVOT
- Ask 5 beta users to pay $29/mo
- If 3+ pay → you have PMF. Raise prices.
- If 0 pay → pivot. The real-time card isn't the wedge.

---

## 💸 Investor Perspective — "Would I invest?"

### What Investors Would Like
- Clean, modern tech stack (Cloudflare Agents SDK, Vercel AI SDK, TypeScript strict)
- Low burn rate (sub-$100/mo to run)
- Clear problem statement
- Founder who ships

### What Would Spook Them
- **No traction.** Zero users, zero revenue, zero LOIs. In 2026, this is a pass.
- **Crowded space.** Gong ($7B+), Clari ($6B), Fathom ($60M ARR), Dialpad Ai. How do you win against incumbents?
- **No moat.** Your model-agnostic layer means anyone can replicate you with a weekend hackathon. The moat is *data* (cross-call learning) or *distribution* (embedded in CRM). You have neither.
- **Small TAM (as positioned).** If you're "objection card for SDRs," that's a $50M feature, not a $5B company.

### What Would Change Their Mind
- 3 signed LOIs from sales teams at $79/mo
- 30%+ week-over-week organic growth (viral loop within teams)
- Data moat — after 1,000 calls, your coaching accuracy beats raw Gemini

### Investor Verdict
Build to $5k MRR first. Then you raise a seed round ($1-2M) on traction, not vision.

---

## 🎯 The Honest Bottom Line

**Your codebase is solid. Your product vision is half-baked. Your go-to-market is non-existent.**

The thing holding Pitchly back isn't more features. It's **users**. You need to get this in front of actual sales reps within the next 7 days. The 10x features (cross-call memory, pre-call briefs, voice whisper) don't matter if nobody uses the 1x version.

### The Fastest Path to $10k MRR

1. **Week 1:** Make 3 test calls work flawlessly ← **YOU ARE HERE**
2. **Week 2-3:** Get 10 beta users via LinkedIn outreach
3. **Week 4:** Convert to $29/mo individual plan
4. **Month 2:** Add team plan ($79/mo) + manager dashboard
5. **Month 3:** Build cross-call analytics (moat)

### The One Sentence Strategy

> *Ship the post-call email snapshot as the wedge (managers will pay for it), use the real-time cards as the hook to keep reps using it, and build cross-call intelligence as the moat before anyone else does.*

---

## 📋 Priority Actions Summary (Sorted by Impact)

| Rank | Action | Owner | Timeline | Impact |
|------|--------|-------|----------|--------|
| 1 | Run all 6 TEST_SCENARIOS end-to-end | Engineering | 2 days | 🔴 Unlocks everything |
| 2 | Fix bugs found in testing | Engineering | 3 days | 🔴 Product must work |
| 3 | Record Loom demo | Product | 1 day | 🟡 Key marketing asset |
| 4 | Send 50 LinkedIn DMs to SDR Managers | Founder | Ongoing | 🟢 Get first users |
| 5 | Add basic error logging (Sentry) | Engineering | 1 day | 🟡 Must have for beta |
| 6 | Implement $29/mo individual plan (Stripe) | Engineering | 3 days | 🟢 Revenue |
| 7 | Add onboarding tooltip to HUD | Engineering | 1 day | 🟢 UX improvement |
| 8 | Shrink card size to 280px | Engineering | 0.5 day | 🟢 UX improvement |
| 9 | Add cross-call analytics (Vectorize) | Engineering | 1 week | 🟢 Competitive moat |
| 10 | Pre-call brief (LinkedIn scrape + Gemini) | Engineering | 2 weeks | 🔵 Holy sh*t feature |

---

*Generated: June 14, 2026 — Multi-perspective strategic analysis for Pitchly*
