# OpenAI API Key Permissions

SF Pulse uses OpenAI for two tasks: extracting dietary flags from menu pages, and extracting structured restaurant data from Eater SF articles.

## Creating a Fine-Grained Key

Create the key at: **platform.openai.com → [Your Project] → API Keys → Create new secret key**

Use a **Project API key** (not an Organization key) so permissions are scoped to a single project with no access to other projects.

## Required Permissions

| Capability | Permission | Reason |
|---|---|---|
| Chat Completions | **Write** | Used for both dietary flag extraction and article parsing |
| All other capabilities | **None** | Not used by this app |

## Recommended Model Restriction

Restrict the key to a single model to limit blast radius if the key is leaked:

- **gpt-4o-mini** — the only model this app calls

## Suggested Spending Controls

- Set a monthly spending cap on the project dashboard (e.g. $5/month covers well over 1M menu parses at $0.15/1M input tokens)
- Enable usage alerts at your chosen threshold

## What This Key Is NOT Authorized For

The following capabilities are NOT needed and should remain at **None**:

- Assistants API
- File uploads or retrieval
- Fine-tuning
- Image generation
- Audio transcription
- Embeddings
- Batch API

## Behavior When Key Is Missing

If `OPENAI_API_KEY` is not set when the cron pipeline runs, it throws:

```
Error: OPENAI_API_KEY is required for menu and article parsing.
Add it to .env.local. See docs/openai-api-permissions.md for the minimal permissions needed.
```

This error surfaces in the Render workflow logs.
