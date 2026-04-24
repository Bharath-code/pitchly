// types.ts — Shared types used across the extension

export type CaptureMode = 'mixed' | 'tab' | 'mic-only'

export type ObjectionType =
  | 'price'
  | 'timing'
  | 'authority'
  | 'competitor'
  | 'no_need'
  | 'trust'
  | 'roi'
  | 'complexity'
  | 'priority'
  | 'ghost'

export interface ObjectionCard {
  objection: ObjectionType
  response: string
  confidence: number
}

// Messages between background ↔ content ↔ popup
export type ExtMessage =
  | { type: 'START_SESSION'; tabStreamId?: string }
  | { type: 'STOP_SESSION' }
  | { type: 'GET_STATUS' }
  | { type: 'GET_STREAM' }
  | { type: 'AUDIO_MODE'; mode: CaptureMode }
  | { type: 'SESSION_STOPPED' }

// Messages from Extension → Worker (via WebSocket)
export type ClientMessage =
  | { type: 'audio_chunk'; data: number[] }
  | { type: 'talk_ratio'; you: number; them: number }
  | { type: 'call_ended'; durationMs: number }

// Messages from Cloudflare Worker → Extensions (via WebSocket)
export type AgentMessage =
  | { type: 'stream_delta'; delta: string }
  | { type: 'objection_start'; objection: ObjectionType }
  | { type: 'objection_card'; card: ObjectionCard }
  | { type: 'no_objection' }
  | { type: 'talk_ratio'; you: number; them: number }
  | { type: 'error'; message: string }
