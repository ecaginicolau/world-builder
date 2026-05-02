-- Slice 1 (post-v1) — Local LLM provider
--
-- Extends `user_settings` with the toggle, endpoint URL, and per-task model
-- name fields needed to route LLM calls to a browser-direct OpenAI-compatible
-- endpoint (Ollama / LM Studio / etc.) instead of the cloud `llm-call` edge
-- function.
--
-- `runs.provider` and `runs.model` already exist (see V002). The local path
-- populates them with `'local'` and the chosen model name (e.g. `qwen2.5:14b`).
-- No new column on `runs`.
--
-- Migration is idempotent: safe to re-apply.

-- ─── user_settings extensions ─────────────────────────────────────────────

alter table public.user_settings
  add column if not exists local_llm_enabled boolean not null default false,
  add column if not exists local_llm_endpoint text,
  add column if not exists extract_local_model text,
  add column if not exists proposals_local_model text,
  add column if not exists upscale_local_model text,
  add column if not exists summaries_local_model text;

-- No CHECK constraint on the model name fields: any string the runtime
-- accepts (e.g. `qwen2.5:14b`, `llama3.1:70b-instruct-q4_K_M`) is valid.
-- Validation happens at call-time when the local endpoint is hit.

-- No new RLS policy needed — the existing user_settings policies already
-- cover these columns (owner-scoped select/insert/update on the row).
