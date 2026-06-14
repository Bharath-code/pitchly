// analytics.ts — D1 queries for cross-call analytics
// Used by the /api/analytics/* endpoints served by the worker

import type { D1Database } from '@cloudflare/workers-types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalCalls: number
  totalObjections: number
  avgTalkRatio: number
  avgConfidence: number
  // Card feedback: overall % of rated cards marked helpful, and how many were rated
  helpfulRate: number | null
  feedbackCount: number
  sentimentDistribution: Record<string, number>
  // helpfulRate is null when a type has no feedback yet
  objectionsByType: Array<{ type: string; count: number; avgConfidence: number; helpfulRate: number | null; feedbackCount: number }>
}

export interface ObjectionDistribution {
  type: string
  count: number
  avgConfidence: number
}

export interface ObjectionsOverTime {
  date: string
  count: number
}

export interface RecentCall {
  id: string
  sessionName: string
  repEmail: string | null
  startedAt: number
  durationMs: number
  talkRatioYou: number | null
  talkRatioThem: number | null
  finalSentiment: string | null
  objectionCount: number
}

export interface CallDetail {
  id: string
  sessionName: string
  repEmail: string | null
  managerEmail: string | null
  startedAt: number
  endedAt: number
  durationMs: number
  talkRatioYou: number | null
  talkRatioThem: number | null
  finalSentiment: string | null
  summary: string | null
  followUpDraft: string | null
  objections: Array<{
    id: number
    type: string
    confidence: number
    response: string
    timestamp: number
  }>
  transcriptSegments: Array<{
    id: number
    speaker: string
    text: string
    sentiment: string | null
    timestamp: number
  }>
}

// ─── Query Functions ─────────────────────────────────────────────────────────

export async function getSummary(db: D1Database): Promise<AnalyticsSummary> {
  const [totalCallsResult, totalObjectionsResult, talkRatioResult, sentimentResult, objectionDistResult, overallConfResult, feedbackResult] =
    await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM calls').first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) as count FROM objections').first<{ count: number }>(),
      db.prepare('SELECT ROUND(AVG(talk_ratio_you), 0) as avg FROM calls WHERE talk_ratio_you IS NOT NULL').first<{ avg: number | null }>(),
      db.prepare(`
        SELECT final_sentiment, COUNT(*) as count
        FROM calls
        WHERE final_sentiment IS NOT NULL
        GROUP BY final_sentiment
      `).all<{ final_sentiment: string; count: number }>(),
      db.prepare(`
        SELECT type,
               COUNT(*) as count,
               ROUND(AVG(confidence) * 100, 0) as avg_confidence,
               COUNT(helpful) as feedback_count,
               SUM(CASE WHEN helpful = 1 THEN 1 ELSE 0 END) as helpful_count
        FROM objections
        GROUP BY type
        ORDER BY count DESC
      `).all<{ type: string; count: number; avg_confidence: number; feedback_count: number; helpful_count: number }>(),
      db.prepare('SELECT ROUND(AVG(confidence) * 100, 0) as avg FROM objections').first<{ avg: number | null }>(),
      db.prepare(`
        SELECT COUNT(helpful) as feedback_count,
               SUM(CASE WHEN helpful = 1 THEN 1 ELSE 0 END) as helpful_count
        FROM objections
      `).first<{ feedback_count: number; helpful_count: number }>(),
    ])

  // Build sentiment distribution map
  const sentimentDistribution: Record<string, number> = {
    strong: 0,
    neutral: 0,
    at_risk: 0,
  }
  for (const row of sentimentResult.results || []) {
    sentimentDistribution[row.final_sentiment] = row.count
  }

  const fbCount = feedbackResult?.feedback_count ?? 0
  const helpfulRate = fbCount > 0 ? Math.round(((feedbackResult?.helpful_count ?? 0) / fbCount) * 100) : null

  return {
    totalCalls: totalCallsResult?.count ?? 0,
    totalObjections: totalObjectionsResult?.count ?? 0,
    avgTalkRatio: talkRatioResult?.avg ?? 50,
    avgConfidence: overallConfResult?.avg ?? 0,
    helpfulRate,
    feedbackCount: fbCount,
    sentimentDistribution,
    objectionsByType: (objectionDistResult.results || []).map((r) => ({
      type: r.type,
      count: r.count,
      avgConfidence: r.avg_confidence,
      feedbackCount: r.feedback_count,
      helpfulRate: r.feedback_count > 0 ? Math.round((r.helpful_count / r.feedback_count) * 100) : null,
    })),
  }
}

export async function getObjectionDistribution(db: D1Database): Promise<ObjectionDistribution[]> {
  const result = await db.prepare(`
    SELECT type, COUNT(*) as count, ROUND(AVG(confidence) * 100, 0) as avg_confidence
    FROM objections
    GROUP BY type
    ORDER BY count DESC
  `).all<{ type: string; count: number; avg_confidence: number }>()

  return (result.results || []).map((r) => ({
    type: r.type,
    count: r.count,
    avgConfidence: r.avg_confidence,
  }))
}

export async function getObjectionsOverTime(db: D1Database, days = 30): Promise<ObjectionsOverTime[]> {
  days = Math.max(1, Math.min(365, days))
  // Group objections by date across all types
  const result = await db.prepare(`
    SELECT date(timestamp, 'unixepoch') as date, COUNT(*) as count
    FROM objections
    WHERE timestamp >= strftime('%s', date('now', '-${days} days'))
    GROUP BY date
    ORDER BY date ASC
  `).all<{ date: string; count: number }>()

  return (result.results || []).map((r) => ({
    date: r.date,
    count: r.count,
  }))
}

export async function getObjectionsOverTimeByType(
  db: D1Database,
  days = 30
): Promise<Array<{ date: string; type: string; count: number }>> {
  days = Math.max(1, Math.min(365, days))
  const result = await db.prepare(`
    SELECT date(timestamp, 'unixepoch') as date, type, COUNT(*) as count
    FROM objections
    WHERE timestamp >= strftime('%s', date('now', '-${days} days'))
    GROUP BY date, type
    ORDER BY date ASC, type ASC
  `).all<{ date: string; type: string; count: number }>()

  return (result.results || []).map((r) => ({
    date: r.date,
    type: r.type,
    count: r.count,
  }))
}

export async function getRecentCalls(db: D1Database, limit = 20): Promise<RecentCall[]> {
  const result = await db.prepare(`
    SELECT
      c.id,
      c.session_name,
      c.rep_email,
      c.started_at,
      c.duration_ms,
      c.talk_ratio_you,
      c.talk_ratio_them,
      c.final_sentiment,
      (SELECT COUNT(*) FROM objections o WHERE o.call_id = c.id) as objection_count
    FROM calls c
    ORDER BY c.started_at DESC
    LIMIT ?
  `).bind(limit).all<{
    id: string
    session_name: string
    rep_email: string | null
    started_at: number
    duration_ms: number
    talk_ratio_you: number | null
    talk_ratio_them: number | null
    final_sentiment: string | null
    objection_count: number
  }>()

  return (result.results || []).map((r) => ({
    id: r.id,
    sessionName: r.session_name,
    repEmail: r.rep_email,
    startedAt: r.started_at,
    durationMs: r.duration_ms,
    talkRatioYou: r.talk_ratio_you,
    talkRatioThem: r.talk_ratio_them,
    finalSentiment: r.final_sentiment,
    objectionCount: r.objection_count,
  }))
}

export async function getCallDetail(db: D1Database, callId: string): Promise<CallDetail | null> {
  // Get the call
  const call = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(callId).first<{
    id: string
    session_name: string
    rep_email: string | null
    manager_email: string | null
    started_at: number
    ended_at: number
    duration_ms: number
    talk_ratio_you: number | null
    talk_ratio_them: number | null
    final_sentiment: string | null
    summary: string | null
    follow_up_draft: string | null
  }>()

  if (!call) return null

  // Get objections for this call
  const objections = await db.prepare(`
    SELECT id, type, confidence, response, timestamp
    FROM objections
    WHERE call_id = ?
    ORDER BY timestamp ASC
  `).bind(callId).all<{
    id: number
    type: string
    confidence: number
    response: string
    timestamp: number
  }>()

  // Get transcript segments
  const segments = await db.prepare(`
    SELECT id, speaker, text, sentiment, timestamp
    FROM transcript_segments
    WHERE call_id = ?
    ORDER BY timestamp ASC
  `).bind(callId).all<{
    id: number
    speaker: string
    text: string
    sentiment: string | null
    timestamp: number
  }>()

  return {
    id: call.id,
    sessionName: call.session_name,
    repEmail: call.rep_email,
    managerEmail: call.manager_email,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    durationMs: call.duration_ms,
    talkRatioYou: call.talk_ratio_you,
    talkRatioThem: call.talk_ratio_them,
    finalSentiment: call.final_sentiment,
    summary: call.summary,
    followUpDraft: call.follow_up_draft,
    objections: (objections.results || []).map((o) => ({
      id: o.id,
      type: o.type,
      confidence: o.confidence,
      response: o.response,
      timestamp: o.timestamp,
    })),
    transcriptSegments: (segments.results || []).map((s) => ({
      id: s.id,
      speaker: s.speaker,
      text: s.text,
      sentiment: s.sentiment,
      timestamp: s.timestamp,
    })),
  }
}
