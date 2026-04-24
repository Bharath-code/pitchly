# Pitchly — Sales Call Test Scenarios
## Benchmark Suite for Real-Time Objection Detection & Sentiment Analysis

**Purpose:** Validate that Pitchly correctly identifies objections, tracks sentiment arcs, and generates actionable coaching in real sales conversations.

**How to Use:**
1. Open Google Meet/Zoom with Pitchly running
2. Have one person play the "Rep" (you), one play the "Prospect" (colleague/friend)
3. Follow the script naturally — deviations are encouraged
4. After the call, verify: objections detected, sentiment tracked, follow-up draft quality

---

## Scenario A: The Skeptic (Negative → Neutral → Convert)
**Difficulty:** Hard  
**Duration:** 8-10 minutes  
**Expected Objections:** no_need, trust, price  
**Expected Sentiment Arc:** at_risk → neutral → strong

### Prospect Persona: "David"
- VP Engineering at a 200-person SaaS company
- Direct, no-nonsense, data-driven
- Has been burned by tools before
- Not actively looking — you cold-called him

### Script

**[0:00] Opening**
**Rep:** "David, thanks for taking the call. I know you're busy — I'll keep this tight. We help engineering teams cut their sales cycle by 30% through real-time call coaching. Curious — how does your team currently handle sales calls?"
**David:** *"Honestly? We don't. Reps shadow each other sometimes, but it's ad-hoc. I'm not sure we need another tool right now."*  
→ **Expected:** `no_need` objection detected

**[1:30] Discovery**
**Rep:** "Fair enough. What's your biggest pain point with deal velocity right now?"
**David:** *"Look, our close rate is 12%. That's below industry average. But I don't think a Chrome extension is going to fix systemic issues."*  
→ **Expected:** `trust` objection (skepticism about solution fit)

**[3:00] Pivot to Value**
**Rep:** "Twelve percent — ouch. What if I told you we specifically built this for teams with sub-15% close rates? One of your reps, Sarah, could be on a call right now struggling with a price objection, and she'd get the exact script to handle it in real time."
**David:** *"Hmm. What's the pricing?"*
**Rep:** "$99 per rep per month."
**David:** *"That's steep. We're already paying for Gong and Salesforce. I'm not adding another line item without proof."*  
→ **Expected:** `price` + `trust` objections detected

**[5:00] Social Proof**
**Rep:** "Totally get it. Can I share what happened with a 180-person team in your exact situation? They were at 11% close rate, using Gong for recording but no real-time coaching. In 60 days with Pitchly, they hit 19%. The ROI was 8x in quarter one."
**David:** *"Okay, that's interesting. But how do I know your data is real?"*  
→ **Sentiment:** Still neutral, but warming

**[6:30] Risk Reversal**
**Rep:** "I love that you asked. Here's what I'll do — pilot it with your two lowest-performing reps for 30 days. If close rate doesn't improve by at least 3 percentage points, you pay nothing. Deal?"
**David:** *"Now that's interesting. Three points guaranteed?"
**Rep:** "Guaranteed. I'll put it in writing."
**David:** *"Alright, send me the terms. Let's try it."*  
→ **Sentiment:** Strong — conversion moment

### Success Criteria
- [ ] `no_need` detected in first 2 minutes
- [ ] `trust` detected at least once
- [ ] `price` detected with confidence ≥ 0.80
- [ ] Sentiment starts at_risk, moves to neutral by minute 4, strong by minute 7
- [ ] Talk ratio: Rep should ideally speak 40-45% (discovery-heavy)

---

## Scenario B: The Budget Guardian (Price Objection Masterclass)
**Difficulty:** Medium  
**Duration:** 6-8 minutes  
**Expected Objections:** price, timing, authority  
**Expected Sentiment Arc:** neutral → at_risk → neutral

### Prospect Persona: "Linda"
- CFO at a Series B startup, 80 employees
- Numbers-first, needs CFO approval for anything over $5K
- Quarter just ended, budgets are locked

### Script

**[0:00] Opening**
**Rep:** "Linda, thanks for the time. Quick context — we built Pitchly after seeing reps forget 90% of what happens on calls. I'm curious, what's your current process for coaching reps post-call?"
**Linda:** *"We don't have one. But honestly, we're in budget lock until Q2. Even if I loved this, I couldn't sign today."*  
→ **Expected:** `timing` objection detected immediately

**[1:30] Budget Probe**
**Rep:** "Understood — Q2 starts in 6 weeks. For planning purposes, what budget range are you thinking for sales tooling this year?"
**Linda:** *"We've allocated $30K total for sales enablement. Your pricing would eat half of that for 15 reps. That's a hard sell to the board."*  
→ **Expected:** `price` objection detected

**[3:00] Value Reframe**
**Rep:** "Half the budget — I hear you. What if it paid for itself in 45 days? If each rep closes just one extra deal per quarter because they're handling objections better, what's that worth in revenue?"
**Linda:** *"Our ACV is $24K. One extra deal per rep per quarter... that's significant. But I still need my CEO to sign off."*  
→ **Expected:** `authority` objection detected

**[4:30] Multi-Threading**
**Rep:** "Absolutely. Here's what I suggest — I'll send you a one-page business case with the ROI math. You can forward it to your CEO. In parallel, can we get your two best reps on a 15-minute demo next week? If they love it, the CEO conversation becomes easier."
**Linda:** *"That's actually smart. Okay, send me the doc. But no promises until Q2."*  
→ **Sentiment:** Neutral — opportunity created

### Success Criteria
- [ ] `timing` detected within first 2 minutes
- [ ] `price` detected with specific context (budget, board)
- [ ] `authority` detected — Linda doesn't have final say
- [ ] Rep talk ratio should be 35-40% (heavy listening)
- [ ] Follow-up draft should include ROI calculation and CEO brief

---

## Scenario C: The Enthusiast (Positive Flow)
**Difficulty:** Easy  
**Duration:** 4-5 minutes  
**Expected Objections:** None (or minor `complexity`)  
**Expected Sentiment Arc:** strong throughout

### Prospect Persona: "Alex"
- Head of Sales at a fast-growing startup
- Just raised Series A, hiring 10 reps next quarter
- Actively looking for coaching tools
- Read about Pitchly on LinkedIn

### Script

**[0:00] Opening**
**Rep:** "Alex! Great to finally connect. I saw your Series A announcement — congratulations. How's the hiring pipeline looking?"
**Alex:** *"Thanks! It's wild — we're onboarding 10 reps in 90 days. I'm terrified they'll all develop bad habits with no coaching. Your timing is perfect."*  
→ **Sentiment:** Strong — high intent

**[1:00] Discovery**
**Rep:** "That's exactly why we built this. What does your current onboarding look like?"
**Alex:** *"Shadow calls, recorded Gong reviews, but nothing real-time. Reps freeze when prospects push back."*

**[2:00] Demo Tease**
**Rep:** "Picture this — your new rep is on their first solo call. Prospect says 'too expensive.' Instead of panicking, they see a real-time card: 'I understand budget is tight. What would it need to deliver to justify the cost?' They pivot smoothly."
**Alex:** *"That's exactly what we need. How fast can we get this rolled out?"*  
→ **Expected:** No objection — buying signal

**[3:00] Implementation**
**Rep:** "It's a Chrome extension — reps install it in 30 seconds. No IT involvement. We can have your team live by Friday."
**Alex:** *"Love it. Let's do it. What's the contract look like?"*  
→ **Sentiment:** Strong — closing motion

### Success Criteria
- [ ] No objections detected (or `no_objection` sent)
- [ ] Sentiment stays strong entire call
- [ ] Talk ratio: Prospect (Alex) should dominate — 55-60%
- [ ] Follow-up draft should be brief, confident, next-step focused

---

## Scenario D: The Ghost (Disengagement Recovery)
**Difficulty:** Hard  
**Duration:** 5-6 minutes  
**Expected Objections:** ghost, priority  
**Expected Sentiment Arc:** neutral → at_risk → neutral/strong (if recovered)

### Prospect Persona: "Marcus"
- Director of Revenue Ops
- Was interested 3 weeks ago, went silent
- You're doing a "breakup" call

### Script

**[0:00] Re-engagement**
**Rep:** "Marcus, I know we chatted a few weeks back about Pitchly. I haven't heard back, so I wanted to check in — has this fallen off the priority list, or is there still interest?"
**Marcus:** *"Honestly, things got crazy with our CRM migration. I haven't had a chance to think about it."*  
→ **Sentiment:** Neutral — distracted, not opposed

**[1:30] Priority Probe**
**Rep:** "Totally understand — CRM migrations are brutal. Where does sales coaching sit on your priority list once the migration wraps?"
**Marcus:** *"It's... mid-tier? The migration is Q1, then we're focused on pipeline hygiene. Maybe Q3?"*  
→ **Expected:** `priority` objection detected

**[3:00] Loss Aversion**
**Rep:** "Got it. Can I share what I'm seeing with similar teams? The ones who wait until Q3 to fix coaching usually have reps who've developed 6 months of bad habits by then. It's harder to unwind than to prevent."
**Marcus:** *"That's a fair point. But I genuinely don't have bandwidth to evaluate this until April."*  
→ **Sentiment:** At risk — timing/stalling

**[4:30] Soft Close or Graceful Exit**
**Rep:** "I respect that. Two options: I can send you a 5-minute recorded demo you can watch when you have a moment, or we can park this and I'll check back in April. Which works better?"
**Marcus:** *"Send the demo. If it blows my mind, I'll find time."*  
→ **Expected:** `ghost` objection recovered into opportunity

### Success Criteria
- [ ] `priority` detected — prospect explicitly ranks it low
- [ ] `ghost` detected — prospect went silent, now stalling
- [ ] Sentiment dips to at_risk around minute 3-4
- [ ] Rep talk ratio should be 30-35% (lots of listening, empathetic)
- [ ] Follow-up draft should be low-pressure, value-first

---

## Scenario E: The Committee (Authority Objection)
**Difficulty:** Medium  
**Duration:** 7-9 minutes  
**Expected Objections:** authority, competitor, timing  
**Expected Sentiment Arc:** neutral → at_risk → neutral

### Prospect Persona: "Jennifer"
- Sales Enablement Manager
- Loves the product, but needs CRO + IT + Legal approval
- Currently using Chorus.ai

### Script

**[0:00] Opening**
**Rep:** "Jennifer, thanks for jumping on. I heard you guys are using Chorus for call recording — how's that working for real-time coaching?"
**Jennifer:** *"It's... fine for recording. But we get the insights 24 hours later. By then, the rep has already messed up the next three calls."*  
→ **Sentiment:** Neutral — problem aware

**[1:30] Pain Deepening**
**Rep:** "Ouch. What's your process for getting reps feedback in the moment?"
**Jennifer:** *"We don't have one. That's why I wanted to talk to you. But I need to be transparent — I'm not the decision maker. My CRO makes final calls, and he's pretty loyal to Chorus."*  
→ **Expected:** `authority` + `competitor` objections detected

**[3:00] Competitive Differentiation**
**Rep:** "Fair enough. Does Chorus give your reps real-time objection scripts while they're on the call?"
**Jennifer:** *"No, they don't. But switching tools is a massive undertaking. We'd need IT to review security, Legal to review contracts..."*  
→ **Expected:** `timing` objection detected (implementation complexity)

**[5:00] Coalition Building**
**Rep:** "Makes sense. Here's what I suggest — let me send you a security whitepaper and a side-by-side feature comparison. You can share it with IT and your CRO. In parallel, can we run a 15-minute pilot with just you and one rep? If the rep loves it, you have internal proof."
**Jennifer:** *"That's actually a great approach. My CRO responds to data, not pitches. If we can show him a rep improved in one week, he'd listen."*  
→ **Sentiment:** Neutral — path forward created

### Success Criteria
- [ ] `authority` detected — Jennifer has no budget authority
- [ ] `competitor` detected — Chorus mentioned as incumbent
- [ ] `timing` detected — implementation complexity cited
- [ ] Rep talk ratio: 40-45% (consultative)
- [ ] Follow-up draft should include security whitepaper mention and pilot proposal

---

## Scenario F: The ROI Calculator (Complex Objection)
**Difficulty:** Hard  
**Duration:** 8-10 minutes  
**Expected Objections:** roi, complexity, price  
**Expected Sentiment Arc:** neutral → at_risk → neutral → strong

### Prospect Persona: "Robert"
- COO at a manufacturing company (not tech-savvy)
- Needs to see hard numbers before any decision
- Worried about "another software thing" confusing his sales team

### Script

**[0:00] Opening**
**Rep:** "Robert, appreciate your time. I know you're not in SaaS — you guys make industrial parts. I'm curious, how do your sales reps currently handle customer pushback on pricing?"
**Robert:** *"They... talk to them? I don't know. We don't really track that stuff. We just hired our first real sales team last year."*  
→ **Sentiment:** Neutral — unsophisticated buyer

**[1:30] Problem Awareness**
**Rep:** "Got it. What happens when a prospect says 'your price is higher than the competitor down the street'?"
**Robert:** *"Usually our rep drops the price or gives away free shipping. Margin takes a hit. But I don't know what else to tell them."*  
→ **Expected:** `no_need` variant — Robert doesn't know coaching exists

**[3:00] ROI Introduction**
**Rep:** "What if instead of dropping price, your rep said: 'I understand we're not the cheapest. Can I walk you through why 80% of our customers stay with us after year one?' And what if they got that script automatically, in real time?"
**Robert:** *"That sounds good, but how much does this cost, and what's my actual return? I need numbers, not concepts."*  
→ **Expected:** `roi` + `price` objections detected

**[4:30] ROI Calculation**
**Rep:** "Absolutely. Let's do the math. You said reps discount 10% to close. If your average deal is $50K and they do 4 deals a month, that's $20K in lost margin monthly. Pitchly is $99 per rep. If we prevent just one unnecessary discount per rep per month, you save $50K minus $99. That's a 504x monthly ROI."
**Robert:** *"Wait, really? Show me that again."*  
→ **Sentiment:** Neutral — interest piqued

**[6:00] Complexity Concern**
**Rep:** "Happy to. [Repeats math]. The best part — it's a Chrome extension. Your reps click one button. No training needed."
**Robert:** *"My guys aren't tech people. They sell metal parts. Is this going to confuse them?"*  
→ **Expected:** `complexity` objection detected

**[7:30] Simplicity Proof**
**Rep:** "I love that you asked. Here's a 30-second video of a 58-year-old sales rep using it for the first time. [Share screen]. See? One button, one card. That's it."
**Robert:** *"Okay, that's actually simple. Alright, let's try it with my top two reps. If it works, we'll roll it out."*  
→ **Sentiment:** Strong — trial commitment

### Success Criteria
- [ ] `roi` detected — Robert explicitly asks for numbers
- [ ] `price` detected alongside ROI
- [ ] `complexity` detected — non-tech team concern
- [ ] Talk ratio: Rep 45-50% (lots of explaining/educating)
- [ ] Follow-up draft should include ROI calculation recap

---

## Sentiment Stress Test: Rapid Mood Swings
**Purpose:** Test Tier 1 sentiment EMA accuracy  
**Duration:** 3-4 minutes  

### Script
Have the prospect rapidly alternate between positive and negative statements:

- *"This looks amazing!"* (strong)
- *"Wait, how much does it cost?"* (neutral)
- *"That's way too expensive."* (at_risk)
- *"But I like the concept..."* (neutral)
- *"I'm not sure my team would use it."* (at_risk)
- *"Actually, can we trial it?"* (strong)

**Expected:** Sentiment dot should flip between 🟢 🟡 🔴 in near real-time, not get stuck.

---

## Talk Ratio Stress Test: Monologue vs. Silence
**Purpose:** Test talk ratio calculation accuracy  
**Duration:** 2 minutes each phase

### Phase 1: Rep Monologue
Rep speaks continuously for 2 minutes. Prospect says nothing.
**Expected:** You bar → 90-100%, nudge: "⚠️ Listen more!"

### Phase 2: Prospect Monologue
Prospect speaks continuously for 2 minutes. Rep says nothing.
**Expected:** Them bar → 90-100%, nudge: "🎯 Ask a discovery question"

### Phase 3: Balanced Dialogue
Natural 50/50 conversation.
**Expected:** You ~50%, Them ~50%, bar green.

---

## Benchmark Scoring Rubric

| Criteria | Weight | Pass Threshold |
|----------|--------|----------------|
| Objection detection accuracy | 30% | ≥ 85% of objections detected with correct type |
| Confidence calibration | 20% | ≥ 90% of detected objections have confidence ≥ 0.75 |
| False positive rate | 20% | ≤ 10% no_objection events when objection exists |
| Sentiment tracking | 15% | Sentiment matches manual annotation ≥ 80% of time |
| Talk ratio accuracy | 10% | Within 10% of manual count |
| Post-call summary quality | 5% | Follow-up draft is actionable and contextually relevant |

**Overall Pass:** ≥ 80% weighted score across 3+ scenarios

---

## Testing Checklist

- [ ] Run Scenario A (The Skeptic) — expect 3 objections, sentiment arc
- [ ] Run Scenario B (Budget Guardian) — expect price + timing + authority
- [ ] Run Scenario C (Enthusiast) — expect no objections, strong sentiment
- [ ] Run Scenario D (Ghost) — expect ghost + priority recovery
- [ ] Run Scenario E (Committee) — expect authority + competitor + timing
- [ ] Run Scenario F (ROI Calculator) — expect roi + complexity + price
- [ ] Run Sentiment Stress Test — verify rapid flipping
- [ ] Run Talk Ratio Stress Test — verify monologue detection
- [ ] Check D1 for persisted records after each call
- [ ] Verify email snapshot arrives (if Resend configured)
- [ ] Verify follow-up draft quality

---

## Notes for Testers

1. **Don't read verbatim** — natural conversation is better. Use these as guardrails.
2. **Deviate intentionally** — throw in unexpected objections to test robustness.
3. **Mix scenarios** — real calls blend multiple personas. Combine elements.
4. **Time it** — verify objections appear within 3 seconds of utterance.
5. **Check the HUD** — sentiment dot, talk ratio bar, and nudges should all feel accurate in the moment.

**Goal:** After 5 test calls, you should trust Pitchly enough to use it on a real prospect call.
