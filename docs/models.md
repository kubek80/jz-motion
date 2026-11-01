# Models

Everything a model does in jz-motion goes through one path: the app builds a request (the rules from [style.md](style.md), [format.md](format.md) and the library, plus the task), the local server forwards it, and the reply is checked; if it breaks the rules, the problems go back to the model to fix (twice at most). So any model that can follow instructions works, and a smaller one mostly needs the repair loop a little more.

## Choosing where models come from

**⚙ Settings → Models and API keys** (on the home screen and in the editor). Each entry is a provider, a model and (for APIs) a key. Ticked entries are offered in model pickers; the comparison view uses all ticked ones.

| Provider | What you need | Notes |
|---|---|---|
| **Claude Code (my subscription)** | Claude Code installed and logged in on this computer | No API key. The local server runs `claude -p` (tools off, settings and plugins off) with your own login, so requests count against your Claude plan. Models: `sonnet`, `opus`, `haiku` or a full model id. Works only where `npm run dev` runs, for you: it is for personal, local use, not for serving others. If Settings finds Claude Code, it offers a one-click **Add Sonnet and Haiku**. Set `JZM_CLAUDE_PATH` if `claude` isn't on the PATH. |
| **OpenRouter** | An OpenRouter key | One key for Claude, GPT, Gemini, Qwen, DeepSeek and more. Model ids look like `anthropic/claude-sonnet-…`. Shows the cost of each request. |
| **Any OpenAI-compatible endpoint** | Its base URL (and key) | OpenAI, a RunPod / vLLM server, Ollama or LM Studio on your machine, … |
| **Local mock** | `npm run mock-llm` | A fake model for trying the flows without any key. |

Keys are kept in this browser (local storage) and sent only to that provider, through your local server.

## Which model for which job

**Settings → Model for each way of starting** sets the default for starting from a topic, a script or a recording. Everywhere else (chat, scene ask bar, New with AI) has its own picker and remembers your last choice.

A reasonable split, cheapest that works:

| Job | Model |
|---|---|
| Write a whole presentation from a topic, script or recording | A strong model (Sonnet or better) |
| Change a scene, split a beat, tidy speaker notes | Haiku |
| Icons, clipart, 3D models | Haiku first; the rules and checks keep it on style. Switch model mid-conversation if a drawing needs more care. |

Reusing the library costs nothing, so every item you keep makes later presentations cheaper.

## Speech to text (recordings)

Making a presentation from a recording needs transcription with timestamps: **Settings → Transcription**, any OpenAI-compatible `/audio/transcriptions` service (OpenAI Whisper, Groq, a local Whisper server). Claude Code can't transcribe audio. Recording narration in the **Timing** window doesn't need transcription: you place the beats yourself while reading.

## Working without the app

In this repository, Claude Code itself can write presentations and library items directly as files, using the skills in `.claude/skills/` (see [CLAUDE.md](../CLAUDE.md)). That uses your subscription through Claude Code's normal interface, with `npm run check` and `npm run snapshot` to verify the result.
