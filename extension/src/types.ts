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

// Popup settings persisted in chrome.storage.local
export interface PopupSettings {
  workerHost: string | undefined
  repEmail: string | undefined
  managerEmail: string | undefined
  webhookUrl: string | undefined
}

// Messages between background ↔ content ↔ popup
export type ExtMessage =
  | { type: 'START_SESSION'; tabStreamId: string | undefined }
  | { type: 'STOP_SESSION' }
  | { type: 'GET_STATUS' }
  | { type: 'GET_STREAM' }
  | { type: 'AUDIO_MODE'; mode: CaptureMode }
  | { type: 'SESSION_STOPPED' }

// Messages from Extension → Worker (via WebSocket)
export type ClientMessage =
  | { type: 'audio_chunk'; data: number[] }
  | { type: 'talk_ratio'; you: number; them: number }
  | { type: 'call_ended'; durationMs: number; repEmail: string | undefined; managerEmail: string | undefined; webhookUrl: string | undefined }
  | { type: 'session_settings'; repEmail: string | undefined; managerEmail: string | undefined; webhookUrl: string | undefined }

export type SentimentState = 'strong' | 'neutral' | 'at_risk'

export type SnapshotObjection = {
  type: string
  confidence: number
  response: string
  timestamp: number
}

export type SnapshotPreview = {
  type: 'snapshot_preview'
  callId: string
  durationMs: number
  talkRatioYou: number
  talkRatioThem: number
  finalSentiment: SentimentState
  summary: string | undefined
  followUpDraft: string | undefined
  objections: SnapshotObjection[]
  dbPersisted: boolean
}

// Messages from Cloudflare Worker → Extensions (via WebSocket)
export type AgentMessage =
  | { type: 'stream_delta'; delta: string }
  | { type: 'objection_start'; objection: ObjectionType }
  | { type: 'objection_card'; card: ObjectionCard }
  | { type: 'no_objection' }
  | { type: 'talk_ratio'; you: number; them: number; nudge: string | undefined; sentiment: SentimentState | undefined; sentimentNudge: string | undefined }
  | { type: 'sentiment'; state: SentimentState; nudge: string | undefined }
  | { type: 'error'; message: string }
  | { type: 'call_ended_ack'; durationMs: number }
  | SnapshotPreview
