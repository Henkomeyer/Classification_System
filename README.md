# SignalOps AI SMS Classification

![Node.js](https://img.shields.io/badge/Node.js-20%2B-16a34a?style=for-the-badge&logo=node.js&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Static%20HTML%2FCSS%2FJS-2563eb?style=for-the-badge)
![AI Providers](https://img.shields.io/badge/AI-Ollama%20%7C%20VLLM-8b5cf6?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-node%20test-f59e0b?style=for-the-badge)

Local AI-assisted triage for inbound debt-collection SMS replies. The app imports replies from CSV, classifies each reply into a configured operational action ID, and exports routing-ready results for downstream teams.

> The model only selects a configured classification ID. Labels, next steps, colors, and export shape stay controlled by the application.

## Highlights

| Area | What it does |
| --- | --- |
| Modern operator console | Responsive UI with light/dark theme, compact table density, live insights, search, filters, and classification mix charts. |
| Local-first AI | Supports Ollama native API and VLLM OpenAI-compatible API. |
| Deterministic fast path | Obvious high-confidence replies are classified by rules before calling the model. |
| Batch import | CSV import with sent-message context, async batch processing, progress tracking, and row-level errors. |
| Configurable routing | Edit classification IDs, labels, colors, descriptions, examples, and next steps from the browser. |
| Export workflow | Download classified results as CSV or JSON. |

## Quick Start

```powershell
git clone https://github.com/Henkomeyer/Classification_System.git
cd Classification_System
npm start
```

Open:

```text
http://localhost:3000
```

Run tests:

```powershell
npm test
```

## AI Provider Setup

### Ollama

```powershell
ollama pull llama3.1:8b
ollama serve
```

Defaults:

| Setting | Value |
| --- | --- |
| Provider URL | `http://localhost:11434` |
| Reachability | `/api/version` |
| Model list | `/api/tags` |
| Chat endpoint | `/api/chat` |

### VLLM

```powershell
vllm serve <model-name> --host 0.0.0.0 --port 8000
```

Defaults:

| Setting | Value |
| --- | --- |
| Provider URL | `http://localhost:8000` |
| Reachability | `/health`, then `/v1/models` fallback |
| Model list | `/v1/models` |
| Chat endpoint | `/v1/chat/completions` |
| Auth | Optional bearer token |

Provider settings are stored in `data/ai.json`. Legacy Ollama settings in `data/ollama.json` are still supported.

## CSV Format

Preferred columns:

```csv
TX_Msg,RX_Message
"Hi, can we discuss your account today?","Please call me back after 3pm"
"Reply STOP if you no longer want messages","Stop sending me messages"
```

| Column | Purpose |
| --- | --- |
| `TX_Msg` | SMS sent by the business. Used as context for ambiguous replies. |
| `RX_Message` | Customer reply that should be classified. |

The UI can remap columns after import if your CSV uses different names.

## Default Classifications

| ID | Category | Business action |
| --- | --- | --- |
| `1` | Call Management | Queue a voice-contact task and preserve callback timing. |
| `2` | Payment Commitment | Track promised or confirmed payment. |
| `3` | Information Logistics | Send banking details, balance, statement, or reference. |
| `4` | Identity Error | Flag for data cleansing and stop person-specific follow-up. |
| `5` | Email Pivot | Move documents or conversation to email. |
| `6` | Legal Risk & Hostility | Escalate for compliance or supervisor review. |
| `7` | General Identity Inquiry | Provide verification-safe account context. |
| `8` | Financial Hardship | Route to hardship or vulnerability workflow. |
| `9` | Compliance Opt-Out | Record opt-out and suppress SMS where required. |
| `10` | Generic / Ignore | Archive or leave for low-priority review. |

Saved classifications live in `data/categories.json` and can be reset from the UI.

## API Examples

Classify one reply:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/classify `
  -ContentType 'application/json' `
  -Body '{"sentText":"Hi, are you available to discuss your account?","text":"Please call me back tomorrow"}'
```

Example response:

```json
{
  "category": "call_management",
  "classification_id": "1",
  "label": "Call Management",
  "confidence": 0.98,
  "next_step": "Queue a voice-contact task and preserve any requested callback time.",
  "reason": "The sender asked for a call.",
  "source": "rule"
}
```

Classify from the CLI:

```powershell
npm run classify -- "Please call me back"
```

Pipe a message:

```powershell
"Stop sending me messages" | npm run classify
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Web server bind address. |
| `PORT` | `3000` | Web/API port. |
| `AI_PROVIDER` | `ollama` | Active provider: `ollama` or `vllm`. |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama base URL. |
| `OLLAMA_MODEL` | `llama3.1:8b` | Ollama model name. |
| `VLLM_HOST` | `http://localhost:8000` | VLLM base URL. |
| `VLLM_MODEL` | First detected model | VLLM model name. |
| `VLLM_API_KEY` | Empty | Optional bearer token. |
| `OLLAMA_CLASSIFY_CONCURRENCY` | `4` | Concurrent model-backed rows per server batch. |
| `OLLAMA_KEEP_ALIVE` | `30m` | Ollama keep-alive duration. |
| `OLLAMA_PRELOAD` | Enabled | Set to `false` to skip startup preload. |

Runtime settings saved from the UI override these defaults where applicable.

## Project Layout

```text
public/
  index.html       Browser UI
  app.js           Import, provider config, batching, export, UI state
  styles.css       Modern responsive console styling
  favicon.svg      App icon

src/
  server.js        HTTP API and static file server
  classifier.js    Prompt construction and result mapping
  heuristics.js    High-confidence rule classifier
  batch.js         Batch classification
  categories.js    Classification config and defaults
  aiSettings.js    Ollama/VLLM provider settings
  ollamaClient.js  Ollama API client
  vllmClient.js    VLLM API client
  cli.js           CLI helper

test/
  classifier.test.js

data/
  Runtime configuration JSON files
```

## Windows Server Notes

Recommended production shape:

```text
User browser
  -> IIS on 80/443
  -> reverse proxy
  -> Node app on 127.0.0.1:3000
  -> Ollama or VLLM
```

Use IIS, VPN, or another access-control layer for staff-only deployments. Do not expose Ollama or VLLM directly to the internet.

## More Detail

See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for architecture, runtime behavior, deployment guidance, and validation coverage.
