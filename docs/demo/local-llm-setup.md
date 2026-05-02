# Local LLM — setup & demo walkthrough

~10 min (5 if Ollama is already installed). Routes the four LLM tasks (auto-extract, proposals, upscale, summaries) to a local OpenAI-compatible endpoint instead of the cloud.

## Pre-requisites

- V014 applied.
- An LLM runtime that exposes an OpenAI-compatible `/v1/chat/completions` endpoint. The walkthrough below uses **Ollama**; LM Studio and llama.cpp `--api` work the same way.

## 1. Install the runtime (Ollama)

### macOS / Linux

```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model. Qwen2.5 14B is a good default on a 16GB+ GPU; 7B for lighter
# hardware; 32B if you have 24GB+ VRAM.
ollama pull qwen2.5:14b
```

### Windows

Download the installer at <https://ollama.com/download/windows> and run it. Then:

```powershell
ollama pull qwen2.5:14b
```

## 2. Open the endpoint to the browser (CORS)

By default Ollama only accepts requests from `localhost`. World Builder calls it directly from your browser, which counts as a cross-origin request. Set `OLLAMA_ORIGINS=*` before running `ollama serve`:

### macOS / Linux

```bash
OLLAMA_ORIGINS=* ollama serve
```

(If Ollama is started as a system service, edit the service unit / launchd plist to set the env var.)

### Windows

```powershell
$env:OLLAMA_ORIGINS = "*"
ollama serve
```

Or set it in System Properties → Environment Variables and restart the Ollama service.

> **Why `*`?** The local endpoint exposes your machine's models — there's no secret to protect (no API key). `*` lets the browser at `localhost:5173` (or your deployed app domain) talk to `localhost:11434`. If you prefer to tighten, list specific origins instead.

LM Studio: equivalent setting is "Allow CORS" in the Local Server tab (defaults to permissive).

## 3. Configure World Builder

Open any world → top-right ⚙ → **Settings**.

Scroll to the **Local LLM** section.

1. Check **Enable local LLM**.
2. **Endpoint URL**: `http://localhost:11434/v1` (the default placeholder; click out to commit if you change it).
3. **Per-task models**: type the model tag for each task. With Ollama: `qwen2.5:14b` for all four is a fine starting point. As you tune, you might split:
   - `extract` and `proposals` need solid JSON → bigger / better-instructed model
   - `upscale` is token-heavy prose → bigger reasoning model is worth it
   - `summaries` is short and tolerant → smallest model is fine

Saved badge appears next to the section title on every change. Toggle off to kill-switch back to cloud without losing the per-task config.

## 4. Verify routing — pick the cheapest task to test first

Open a note and type ~80+ characters that contain a few capitalized names (e.g. *"Iria walked into the Old Fortress."*). Wait the auto-extract debounce (default 5s).

- Detected entities should appear in the side panel like before.
- Open **Monitoring** (footer panel, last 20 runs) or `/runs` page → the new run row should show:
  - **kind**: `auto_extract`
  - **provider**: `local`
  - **model**: the tag you set (e.g. `qwen2.5:14b`)

If it ran cloud instead (`provider: openai`), check that the toggle is on AND the per-task model field is non-empty.

## 5. Try the heavier tasks

- **Upscale** a chapter version with a short prompt → should land a new version, run logged with `provider=local`.
- **Propose canon** on a chapter → events should come back with valid JSON. Local models < 7B may struggle on the JSON schema; if you see a parse error, the modal will offer a **"Try with cloud"** button. Click it once to bypass local and use cloud for that single retry.
- **Summarize** S/M/L → should produce text and write to `chapters.summary_*`.

## 6. Failure modes you might hit (and what they look like)

| Symptom | Cause | Fix |
|---|---|---|
| `local endpoint unreachable: Failed to fetch` | Ollama isn't running, or wrong port | `ollama serve`, check port 11434 |
| `local endpoint returned 404` | Model name not pulled locally | `ollama pull <model>` |
| `local endpoint returned 403` or browser console CORS errors | `OLLAMA_ORIGINS` not set | Set env var, restart serve |
| `extract: response was not valid JSON` | Model too small for strict JSON | Pick a bigger model (14B+) for extract/proposals; or click "Try with cloud" |
| Endpoint URL field looks empty after blur | You typed only whitespace → reset to null | Re-enter or rely on the default placeholder |

The transport retries once on transient errors (network blip, 5xx) before surfacing. JSON-schema failures don't auto-retry — the user-facing **"Try with cloud"** button is the recovery path.

## 7. Mix cloud and local per task

The toggle is binary, but the per-task fields are independent. Common mixes:

- **All local** for daily writing — zero cost.
- **Auto-extract + summaries local, proposals + upscale cloud** — keep frontier-quality on the canon-shaping tasks, save cost on grunt.
- **All cloud** (toggle off) — same as before V014.

Tier mapping (cloud) and per-task model (local) are independent settings. Switching the toggle never resets either side.

## 8. Where to look in the code

- Transport layer: [src/lib/llm/transport.ts](../../src/lib/llm/transport.ts)
- Routing decision: [src/lib/llm/routing.ts](../../src/lib/llm/routing.ts)
- Per-task entry points: `src/lib/llm/{extract,proposeCanon,upscale,summaries}.ts` — each exposes `get<Task>er(settings, opts)`.
- Settings UI: [src/features/settings/SettingsScreen.tsx](../../src/features/settings/SettingsScreen.tsx) — `settings-local-llm` section.
- Migration: [supabase/migrations/V014__slice_local_llm.sql](../../supabase/migrations/V014__slice_local_llm.sql).
