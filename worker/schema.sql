-- D1 schema for Pitchly post-call persistence
-- Run: wrangler d1 execute pitchly-db --local --file=./schema.sql
-- Prod: wrangler d1 execute pitchly-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  session_name TEXT NOT NULL,
  rep_email TEXT,
  manager_email TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  talk_ratio_you INTEGER,
  talk_ratio_them INTEGER,
  final_sentiment TEXT CHECK(final_sentiment IN ('strong', 'neutral', 'at_risk')),
  summary TEXT,
  follow_up_draft TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_calls_rep_email ON calls(rep_email);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL,
  speaker TEXT CHECK(speaker IN ('rep', 'prospect')) NOT NULL,
  text TEXT NOT NULL,
  sentiment TEXT CHECK(sentiment IN ('strong', 'neutral', 'at_risk')),
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_call_id ON transcript_segments(call_id);

CREATE TABLE IF NOT EXISTS objections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  response TEXT NOT NULL,
  handled_well BOOLEAN,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_objections_call_id ON objections(call_id);
