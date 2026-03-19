// schema.ts — Zod schema for structured AI output
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
