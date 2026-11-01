# Models

Everything a model does in jz-motion goes through one path: the app builds a request (the rules from [style.md](style.md), [format.md](format.md) and the library, plus the task), the local server forwards it, and the reply is checked; if it breaks the rules, the problems go back to the model to fix (twice at most). So any model that can follow instructions works, and a smaller one mostly needs the repair loop a little more.

## Choosing where models come from

**⚙ Settings → Models and API keys** (on the home screen and in the editor). Each entry is a provider, a model and (for APIs) a key. Every entry appears in the model menus; ticked ones are the ones the **Compare** view runs.

| Provider | What you need | Notes |
|---|---|---|
| **Claude Code (my subscription)** | Claude Code installed and logged in on this computer | No API key. The local server runs `claude -p` (tools off, settings and plugins off) with your own login, so requests count against your Claude plan. Models: `sonnet`, `opus`, `haiku` or a full model id. Works only where `npm run dev` runs, for you: it is for personal, local use, not for serving others. If Settings finds Claude Code, it offers a one-click **Add Opus, Sonnet and Haiku** (or **+ Claude Opus** if you added the others earlier). Set `JZM_CLAUDE_PATH` if `claude` isn't on the PATH. |
| **OpenRouter** | An OpenRouter key | One key for Claude, GPT, Gemini, Qwen, DeepSeek and more. Model ids look like `anthropic/claude-sonnet-…`. Shows the cost of each request. |
| **Any OpenAI-compatible endpoint** | Its base URL (and key) | OpenAI, a RunPod / vLLM server, Ollama or LM Studio on your machine, … |
| **Local mock** | `npm run mock-llm` | A fake model for trying the flows without any key. |

Keys are kept in this browser (local storage) and sent only to that provider, through your local server.

## Which model for which job

Every model menu knows its job and recommends the smallest model that is enough for it: the menu marks each model (**★ recommended**, *enough*, *works, smaller than ideal*, *may struggle*, *more than needed*) and a line under it says why. Until you choose otherwise, the recommended model is selected; once you pick one for a job, that job remembers it.

| Job | Size | Why |
|---|---|---|
| Icon, 3D model | small (Haiku) | A few strokes or boxes by numbers; the rules and checks keep it on style |
| A change to one scene (the ask bar) | small | A focused edit |
| Clipart | medium (Sonnet) | Many shapes that must look like something; small often manages, medium draws cleaner |
| A new scene, chat about the whole presentation | medium | Has to match and rewrite the rest |
| Presentation from a topic | medium | Plans a whole presentation from one sentence |
| Presentation from a script or a recording | large (Opus) | Structuring a long text or talk into scenes and timed beats benefits most; medium also works |

A model's size is guessed from its name (haiku, mini, flash → small; sonnet, gpt-4.1 → medium; opus, gpt-5, gemini pro → large) and can be set in Settings (Edit → size) for anything else, such as your own fine-tune.

Reusing the library costs nothing, so every item you keep makes later presentations cheaper.

## Speech to text (recordings)

Making a presentation from a recording needs transcription with timestamps: **Settings → Transcription**, any OpenAI-compatible `/audio/transcriptions` service (OpenAI Whisper, Groq, a local Whisper server). Claude Code can't transcribe audio. Recording narration in the **Timing** window doesn't need transcription: you place the beats yourself while reading.

## Working without the app

In this repository, Claude Code itself can write presentations and library items directly as files, using the skills in `.claude/skills/` (see [CLAUDE.md](../CLAUDE.md)). That uses your subscription through Claude Code's normal interface, with `npm run check` and `npm run snapshot` to verify the result.
