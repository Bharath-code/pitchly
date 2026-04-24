// schema.ts — Zod schemas for structured AI output + snapshot
import { z } from 'zod'

export const OBJECTION_TYPES = [
  'price',
  'timing',
  'authority',
  'competitor',
  'no_need',
  'trust',
  'roi',
  'complexity',
  'priority',
  'ghost',
] as const

export type ObjectionType = (typeof OBJECTION_TYPES)[number]

export const ObjectionSchema = z.object({
  objection: z.enum(OBJECTION_TYPES).nullable().describe(
    'The type of sales objection detected, or null if no objection'
  ),
  response: z.string().nullable().describe(
    'The coaching response script to display to the sales rep'
  ),
  confidence: z.number().min(0).max(1).nullable().describe(
    'Confidence score 0-1. Must be >= 0.75 to trigger a card'
  ),
})

export type ObjectionResult = z.infer<typeof ObjectionSchema>

// ── Post-Call Snapshot Schemas ───────────────────────────────────────────────

export const SentimentShiftSchema = z.object({
  time: z.string().describe('Timestamp or relative time of shift'),
  from: z.enum(['strong', 'neutral', 'at_risk']),
  to: z.enum(['strong', 'neutral', 'at_risk']),
  cause: z.string().describe('What caused the sentiment shift'),
  tip: z.string().describe('Actionable coaching tip for the rep'),
})

export const PostCallAnalysisSchema = z.object({
  overallSentiment: z.enum(['strong', 'neutral', 'at_risk']).describe('Final call sentiment'),
  shifts: z.array(SentimentShiftSchema).max(5).describe('Key sentiment shift moments'),
  summary: z.string().max(500).describe('2-3 sentence call summary'),
  followUpDraft: z.string().max(1200).describe('Professional follow-up email draft'),
})

export type PostCallAnalysis = z.infer<typeof PostCallAnalysisSchema>
