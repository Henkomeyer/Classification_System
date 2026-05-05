# SMS Classification

Classifies inbound debt-collection SMS replies into an operational triage category and returns the next step to take. The classifier uses deterministic rules for obvious high-confidence replies and a selected AI provider for ambiguous replies. Ollama and VLLM are supported. The model prompt is intentionally narrow: it asks for a single configured category ID, then the app attaches labels and next steps from configuration.

For a fuller architecture, deployment, and operations guide, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Classifications

Classifications are configurable in the frontend. Each classification has:

- `code`: the ID returned in results, such as `1`, `2`, `3`, or any value you choose.
- `id`: the internal key the model selects.
- `label`: the display name.
- `description`: when this classification should be selected.
- `next_step`: what the business should do next.
- `examples`: sample replies that belong in the classification.

Saved classifications are stored in `data/categories.json`.

Default debt-triage IDs:

- `1`: Call Management
- `2`: Payment Commitment
- `3`: Information Logistics
- `4`: Identity Error
- `5`: Email Pivot
- `6`: Legal Risk & Hostility
- `7`: General Identity Inquiry
- `8`: Financial Hardship
- `9`: Compliance Opt-Out
- `10`: Generic / Ignore

## AI Provider Connection

The frontend includes an AI Provider panel. Choose Ollama or VLLM, enter the provider URL, test the connection, then select the detected model.

Ollama:

- Default URL: `http://localhost:11434`
- Reachability check: `/api/version`
- Model list: `/api/tags`

VLLM:

- Default URL: `http://localhost:8000`
- Reachability check: `/health`, with `/v1/models` as fallback
- Model list: `/v1/models`
- Chat endpoint: `/v1/chat/completions`
- Optional bearer token is supported when your VLLM server is started with API key protection.

Saved provider settings are stored in `data/ai.json`. The legacy Ollama settings file, `data/ollama.json`, is still supported.

## Requirements

- Node.js 20 or newer.
- Ollama or VLLM installed and running locally.
- A local model available through one of those providers, for example:

```powershell
ollama pull llama3.1:8b
ollama serve
```

Or run a VLLM OpenAI-compatible server:

```powershell
vllm serve <model-name> --host 0.0.0.0 --port 8000
```

## Run the API

```powershell
npm start
```

The app and API start on `http://localhost:3000` by default. Open that URL to use the frontend for single replies or CSV import.

By default the server binds to `0.0.0.0`, which allows other machines on the network to reach it at `http://SERVER-IP:3000`. You can change the bind IP and port in the frontend under **Server Access**, then restart the app. The saved settings are stored in `data/server.json`.

You can also set the bind IP and port with environment variables:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "3000"
npm start
```

For CSV import, the preferred file structure is:

```csv
TX_Msg,RX_Message
"Hi, can we discuss your account today?","Please call me back after 3pm"
"Reply STOP if you no longer want messages","Stop sending me messages"
```

`TX_Msg` is the SMS that was sent. `RX_Message` is the customer's SMS reply that should be classified.

Classify a reply:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/classify `
  -ContentType 'application/json' `
  -Body '{"sentText":"Hi, are you available to discuss your application?","text":"Please call me back tomorrow"}'
```

Response shape:

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

## Run from the CLI

```powershell
npm run classify -- "Please call me back"
```

You can also pipe a message:

```powershell
"Stop sending me messages" | npm run classify
```

## Configuration

Environment variables:

- `OLLAMA_HOST`: Ollama base URL. Defaults to `http://localhost:11434`.
- `OLLAMA_MODEL`: Ollama model name. Defaults to `llama3.1:8b`.
- `VLLM_HOST`: VLLM OpenAI-compatible base URL. Defaults to `http://localhost:8000`.
- `VLLM_MODEL`: VLLM model name. Defaults to the first detected model when selected in the UI.
- `VLLM_API_KEY`: optional bearer token for VLLM.
- `AI_PROVIDER`: `ollama` or `vllm`. Defaults to `ollama`.
- `HOST`: web server bind address. Defaults to `0.0.0.0` so other machines can reach it.
- `OLLAMA_CLASSIFY_CONCURRENCY`: how many model-backed rows this app sends in parallel per server batch. Defaults to `4`.
- `OLLAMA_KEEP_ALIVE`: how long Ollama keeps the model loaded after a request. Defaults to `30m` for this app.
- `OLLAMA_PRELOAD`: set to `false` to skip loading the model when the server starts.
- `PORT`: API port. Defaults to `3000`.

Runtime settings saved from the UI override the defaults above for classification requests.

## Ollama GPU Throughput

This app can now issue multiple Ollama requests concurrently, but Ollama must also be configured to process concurrent requests. Start Ollama with settings like:

```powershell
$env:OLLAMA_NUM_PARALLEL = "4"
$env:OLLAMA_MAX_QUEUE = "1024"
$env:OLLAMA_KEEP_ALIVE = "30m"
ollama serve
```

Then start the app with matching concurrency:

```powershell
$env:OLLAMA_CLASSIFY_CONCURRENCY = "4"
npm start
```

Increase both values gradually while watching VRAM and GPU utilization. Higher parallelism uses more memory because Ollama allocates context per parallel request.

## Tests

```powershell
npm test
```
