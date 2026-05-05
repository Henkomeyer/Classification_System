# SignalOps AI SMS Classification - Project Overview

## Purpose

SignalOps AI SMS Classification is a local operations console for routing debt-collection SMS replies. It combines deterministic business rules with a constrained local AI provider so staff can import replies, classify them, review the routing outcome, and export downstream-ready results.

The product is intentionally not a chatbot. The model receives the sent SMS, the reply SMS, and the configured classification definitions. It returns one valid classification ID. The application owns the final business output.

## Product Surface

| Surface | Description |
| --- | --- |
| Single reply | Classify one reply with optional sent-message context. |
| CSV import | Import rows, map sent/reply columns, and preview pending records. |
| Batch queue | Process large imports in async frontend chunks with live progress. |
| Results table | Search, filter, inspect confidence, next steps, reasons, and errors. |
| Insights | Track provider state, dataset state, export readiness, and category mix. |
| Classification editor | Manage category IDs, keys, colors, descriptions, examples, and next steps. |
| Provider settings | Configure Ollama or VLLM, test URL reachability, detect models, and save selection. |
| Server access | Configure bind IP and port for the next restart. |

## Modern UI System

The frontend is static HTML, CSS, and JavaScript served by Node. There is no build step.

| Token role | Current direction |
| --- | --- |
| Primary | Cobalt blue for primary actions, active states, focus rings, and batch activity. |
| Secondary | Cyan/teal for AI and data-system accents. |
| Tertiary | Amber/orange for inquiry and hardship routing. |
| Success | Green for completed processing and payment-oriented actions. |
| Risk | Red only for legal risk, opt-out, failed batches, and destructive controls. |
| Neutral | Cool slate surfaces with crisp borders and responsive density. |

The UI supports:

- Light and dark themes.
- Compact table density.
- Modern panel and table styling.
- Drag-and-drop CSV affordance.
- Toast feedback for imports, saves, errors, and classification completion.
- Responsive collapse for narrow screens.

## Default Classification Logic

| ID | Category | Business meaning |
| --- | --- | --- |
| `1` | Call Management | Debtor asks for a call, says they are busy, or says they will call later. |
| `2` | Payment Commitment | Debtor confirms payment or gives a concrete payment date or amount. |
| `3` | Information Logistics | Debtor needs banking details, balance, statement, reference, or account details. |
| `4` | Identity Error | Debtor says it is the wrong person or wrong number. |
| `5` | Email Pivot | Debtor gives an email address or asks to move communication to email. |
| `6` | Legal Risk & Hostility | Debtor is hostile or mentions harassment, lawyers, reporting, or legal action. |
| `7` | General Identity Inquiry | Debtor asks who is contacting them, what the debt is for, or whether it is a scam. |
| `8` | Financial Hardship | Debtor wants to pay but reports unemployment, illness, bankruptcy, or no income. |
| `9` | Compliance Opt-Out | Debtor sends STOP, unsubscribe, remove me, or another opt-out command. |
| `10` | Generic / Ignore | Low-value, unclear, neutral, or gibberish replies. |

Defaults are defined in `src/categories.js`. Saved runtime edits are stored in `data/categories.json`.

## Architecture

```text
Browser UI
  |
  | HTTP JSON API
  v
Node.js server
  |
  | deterministic rules first
  v
Classifier
  |
  | only for ambiguous replies
  v
AI provider adapter
  |
  +-- Ollama native API
  |
  +-- VLLM OpenAI-compatible API
```

## Runtime Flow

1. A user imports a CSV or enters a single reply.
2. The app preserves sent-message context when available.
3. High-confidence heuristics classify obvious replies locally.
4. Ambiguous replies are sent to the active AI provider.
5. The model returns one configured category ID.
6. The app maps that ID to label, color, next step, confidence, reason, and export fields.
7. Results update live and can be exported as CSV or JSON.

## Provider Behavior

### Ollama

| API | Purpose |
| --- | --- |
| `/api/version` | Reachability check. |
| `/api/tags` | Installed model discovery. |
| `/api/chat` | Classification request. |

Default URL: `http://localhost:11434`

### VLLM

| API | Purpose |
| --- | --- |
| `/health` | Primary reachability check. |
| `/v1/models` | Fallback reachability and model discovery. |
| `/v1/chat/completions` | OpenAI-compatible classification request. |

Default URL: `http://localhost:8000`

VLLM supports an optional bearer token when the server is API-key protected.

## Prompting Strategy

The classifier prompt is deliberately narrow:

- Input: sent SMS, reply SMS, and configured categories.
- Output: one valid configured category ID.
- Business mapping: handled by application code, not the model.

This reduces hallucination risk and keeps operational labels, actions, colors, and exports under local configuration.

## Batch Processing

The frontend splits imports into chunks and sends multiple batch requests with limited concurrency. Each completed batch updates the table immediately.

The backend also limits concurrent model-backed rows. Rule-based rows complete without model calls, which improves throughput and reduces local GPU pressure.

## Project Structure

```text
public/
  index.html       App shell and UI structure
  app.js           Client state, import, filters, batching, export, UI feedback
  styles.css       Modern responsive visual system
  favicon.svg      App icon

src/
  server.js        HTTP server, API routes, static serving
  classifier.js    Prompt construction, result parsing, category mapping
  heuristics.js    Deterministic high-confidence rules
  batch.js         Server-side batch classification
  categories.js    Defaults, validation, persistence
  aiSettings.js    Provider config and inspection
  ollamaClient.js  Ollama API client
  ollamaSettings.js
  vllmClient.js    VLLM OpenAI-compatible client
  serverSettings.js
  cli.js           Command-line classification

test/
  classifier.test.js

data/
  Runtime JSON settings
```

## Runtime Configuration

| File | Purpose |
| --- | --- |
| `data/categories.json` | Saved classification categories. |
| `data/ai.json` | Active AI provider and provider-specific settings. |
| `data/ollama.json` | Legacy Ollama settings support. |
| `data/server.json` | Saved host and port for next restart. |

Environment variables can override startup defaults:

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
$env:AI_PROVIDER = "ollama"
$env:OLLAMA_HOST = "http://localhost:11434"
$env:OLLAMA_MODEL = "llama3.1:8b"
$env:VLLM_HOST = "http://localhost:8000"
$env:VLLM_MODEL = "your-vllm-model"
$env:VLLM_API_KEY = "optional-token"
$env:OLLAMA_CLASSIFY_CONCURRENCY = "4"
npm start
```

## Windows Server Deployment

Recommended production topology:

```text
User browser
  |
  v
IIS on 80/443
  |
  | reverse proxy
  v
Node app on 127.0.0.1:3000
  |
  v
Ollama or VLLM
```

Recommended IIS role:

- Terminate HTTPS.
- Serve the staff-facing hostname.
- Reverse proxy to `http://127.0.0.1:3000`.
- Add Windows Authentication, VPN, IP allowlists, or another access-control layer.

Recommended Node role:

- Bind to `127.0.0.1`.
- Run as a Windows Service with NSSM, Task Scheduler, or a service manager.
- Keep Ollama or VLLM private to the machine or internal network.

Example NSSM setup:

```powershell
nssm install SMSClassification "C:\Program Files\nodejs\node.exe" "src/server.js"
nssm set SMSClassification AppDirectory "C:\SMS Classification"
nssm set SMSClassification AppEnvironmentExtra HOST=127.0.0.1 PORT=3000
nssm start SMSClassification
```

## Security Notes

- Do not expose Ollama or VLLM directly to the internet.
- Treat imported SMS files as sensitive operational data.
- Use HTTPS for network access.
- Put IIS, VPN, Windows Authentication, or another control layer in front of production use.
- Avoid committing real provider URLs, API keys, or operational data.

## Validation Coverage

The test suite covers:

- Rule-based classification.
- AI-backed classification parsing.
- Configurable category IDs.
- Label and object output mapping.
- Empty replies.
- Batch classification and row-level errors.
- Large CSV-sized batches.
- Batch concurrency.
- Ollama settings normalization.
- VLLM provider behavior.
- Server bind IP and port validation.

Run:

```powershell
npm test
```
