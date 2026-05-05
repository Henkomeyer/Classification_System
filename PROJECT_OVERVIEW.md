# SMS Classification Project Overview

## Purpose

SMS Classification is a local AI-assisted triage console for debt-collection SMS replies. It imports replies from CSV, classifies each reply into a configured business action ID, shows results live while batches process, and exports the processed output for downstream systems.

The system is designed for operational routing, not free-form chatbot replies. The AI is constrained to return only the configured classification ID, while the application owns the business labels, next steps, colors, and export shape.

## Main Capabilities

- Classify a single SMS reply from the browser.
- Import CSV files with `TX_Msg` as the sent SMS and `RX_Message` as the debtor reply.
- Preserve sent-message context during classification so ambiguous replies can be interpreted more accurately.
- Process large files in async frontend batches and show live progress as each batch completes.
- Export processed results to CSV or JSON.
- Configure classification IDs, labels, colors, descriptions, examples, and next steps from the UI.
- Connect to either Ollama or VLLM.
- Detect available models from the selected AI provider before saving the provider configuration.
- Configure server bind IP and port for Windows Server deployment.
- Use deterministic rules for obvious high-confidence replies before calling the AI provider.

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

These defaults are stored in code and can be reset from the UI. Runtime edits are saved locally under `data/categories.json`.

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

The app intentionally keeps the frontend static and the backend small. There is no build step. Node.js serves the HTML, CSS, JavaScript, and JSON API from the same process.

## Project Structure

```text
public/
  index.html       Browser UI
  app.js           CSV import, provider config, batching, export, UI state
  styles.css       Enterprise-style visual design and responsive layout

src/
  server.js        HTTP server, API routes, static file serving
  classifier.js    Prompt construction, result parsing, category selection
  heuristics.js    Deterministic high-confidence business rules
  batch.js         Batch classification with provider concurrency
  categories.js    Default and saved classification config
  aiSettings.js    Shared Ollama/VLLM provider settings
  ollamaClient.js  Ollama API client
  ollamaSettings.js
  vllmClient.js    VLLM OpenAI-compatible API client
  serverSettings.js
  cli.js           Command-line classification helper

test/
  classifier.test.js

data/
  Runtime settings only. This folder is intentionally ignored by Git.
```

## AI Provider Behavior

### Ollama

Default local URL:

```text
http://localhost:11434
```

The app checks:

- `/api/version` for reachability.
- `/api/tags` for installed models.
- `/api/chat` for classification.

### VLLM

Default local URL:

```text
http://localhost:8000
```

The app checks:

- `/health` for reachability, with `/v1/models` as fallback.
- `/v1/models` for available models.
- `/v1/chat/completions` for classification.

An optional bearer token can be supplied for VLLM deployments protected by an API key.

## Prompting Strategy

The prompt is deliberately narrow:

- It receives the sent SMS and the reply SMS.
- It receives the configured classification IDs and descriptions.
- It is instructed to return only one valid classification ID.
- The application maps that ID back to the saved category, label, color, and next step.

This reduces hallucination and keeps business output controlled by configuration rather than by model-generated prose.

## Batch Processing

The frontend splits imported rows into chunks and sends multiple batch requests asynchronously. As each batch completes, the table updates immediately. This lets users see progress on large files instead of waiting for the entire import to finish.

The backend also limits concurrent model-backed rows to prevent overload. Obvious rule-based replies do not call the model.

## Runtime Configuration

Runtime configuration is saved under `data/` and is ignored by Git because it can contain environment-specific values:

- `data/categories.json`
- `data/ai.json`
- `data/ollama.json`
- `data/server.json`

Environment variables can override saved values:

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

## Running Locally

Requirements:

- Node.js 20 or newer.
- Ollama or VLLM reachable from the server.

Start the app:

```powershell
cd "C:\SMS Classification"
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

## Windows Server And IIS Deployment

The recommended production shape is IIS as the public web server and Node.js as a private backend process.

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
- Serve the public domain.
- Reverse proxy requests to `http://127.0.0.1:3000`.
- Add Windows Authentication or network restrictions if the app is staff-only.

Recommended Node role:

- Bind to `127.0.0.1`.
- Run as a Windows Service using NSSM, Task Scheduler, or another service manager.
- Keep Ollama or VLLM private to the server or internal network.

Example service command with NSSM:

```powershell
nssm install SMSClassification "C:\Program Files\nodejs\node.exe" "src/server.js"
nssm set SMSClassification AppDirectory "C:\SMS Classification"
nssm set SMSClassification AppEnvironmentExtra HOST=127.0.0.1 PORT=3000
nssm start SMSClassification
```

## Security Notes

- Do not expose Ollama or VLLM directly to the internet.
- Put IIS, VPN, or another access control layer in front of this app for production.
- Treat imported SMS files as sensitive operational data.
- Keep `data/*.json` out of Git because provider URLs, API keys, and local routing details can be stored there.
- Use HTTPS when users access the app over a network.

## Operational Notes

- Use the UI to test the AI provider URL before saving it.
- If models are not detected, verify the provider process is running and reachable from the Node server.
- For Ollama throughput, tune `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_QUEUE`, and `OLLAMA_CLASSIFY_CONCURRENCY` together.
- For large imports, start with conservative concurrency and increase while watching VRAM, CPU, and provider latency.

## Current Validation

The automated test suite covers:

- Rule-based classification.
- AI-backed classification parsing.
- Configurable category IDs.
- Large CSV-sized batch handling.
- Batch concurrency.
- Ollama settings normalization.
- VLLM client behavior.
- Server bind IP and port validation.
