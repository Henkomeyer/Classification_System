const els = {
  singleSentSms: document.querySelector("#singleSentSms"),
  singleSms: document.querySelector("#singleSms"),
  classifySingle: document.querySelector("#classifySingle"),
  singleResult: document.querySelector("#singleResult"),
  csvFile: document.querySelector("#csvFile"),
  fileName: document.querySelector("#fileName"),
  sentColumn: document.querySelector("#sentColumn"),
  replyColumn: document.querySelector("#replyColumn"),
  classifyCsv: document.querySelector("#classifyCsv"),
  providerSwitch: document.querySelector("#providerSwitch"),
  providerButtons: [...document.querySelectorAll("[data-provider]")],
  providerHint: document.querySelector("#providerHint"),
  ollamaHost: document.querySelector("#ollamaHost"),
  detectOllama: document.querySelector("#detectOllama"),
  ollamaModel: document.querySelector("#ollamaModel"),
  vllmApiKey: document.querySelector("#vllmApiKey"),
  vllmApiKeyLabel: document.querySelector("#vllmApiKeyLabel"),
  saveOllama: document.querySelector("#saveOllama"),
  ollamaStatus: document.querySelector("#ollamaStatus"),
  ollamaConnectionBadge: document.querySelector("#ollamaConnectionBadge"),
  ollamaModelMeta: document.querySelector("#ollamaModelMeta"),
  serverConnectionBadge: document.querySelector("#serverConnectionBadge"),
  serverHost: document.querySelector("#serverHost"),
  serverPort: document.querySelector("#serverPort"),
  saveServerConfig: document.querySelector("#saveServerConfig"),
  serverMeta: document.querySelector("#serverMeta"),
  serverStatus: document.querySelector("#serverStatus"),
  systemDot: document.querySelector("#systemDot"),
  connectionStatusText: document.querySelector("#connectionStatusText"),
  loadSample: document.querySelector("#loadSample"),
  downloadResults: document.querySelector("#downloadResults"),
  downloadJsonResults: document.querySelector("#downloadJsonResults"),
  statTotal: document.querySelector("#statTotal"),
  statCallback: document.querySelector("#statCallback"),
  statOptOut: document.querySelector("#statOptOut"),
  statReview: document.querySelector("#statReview"),
  tableStatus: document.querySelector("#tableStatus"),
  jobStatus: document.querySelector("#jobStatus"),
  jobProgress: document.querySelector("#jobProgress"),
  batchProgressPanel: document.querySelector("#batchProgressPanel"),
  batchPercent: document.querySelector("#batchPercent"),
  batchProgressTitle: document.querySelector("#batchProgressTitle"),
  batchActiveCount: document.querySelector("#batchActiveCount"),
  batchDoneCount: document.querySelector("#batchDoneCount"),
  batchLane: document.querySelector("#batchLane"),
  resultsBody: document.querySelector("#resultsBody"),
  categoryEditor: document.querySelector("#categoryEditor"),
  addCategory: document.querySelector("#addCategory"),
  saveCategories: document.querySelector("#saveCategories"),
  resetCategories: document.querySelector("#resetCategories"),
  categoryStatus: document.querySelector("#categoryStatus")
};

let importedRows = [];
let headers = [];
let classifiedRows = [];
let categoryConfig = [];
let aiConfig = null;
let activeProvider = "ollama";
let aiDetectTimer = null;

const CLASSIFY_CHUNK_SIZE = 100;
const ASYNC_BATCH_CONCURRENCY = 3;
const providerDefaults = {
  ollama: {
    name: "Ollama",
    placeholder: "http://localhost:11434",
    hint: "Ollama uses its native local API. Start it with ollama serve, then select an installed model.",
    versionLabel: "Ollama"
  },
  vllm: {
    name: "VLLM",
    placeholder: "http://localhost:8000",
    hint: "VLLM uses the OpenAI-compatible API. Start it with vllm serve and expose /v1/models.",
    versionLabel: "VLLM"
  }
};

const sampleRows = [
  {
    customer: "A. Mokoena",
    TX_Msg: "Please contact us today regarding your overdue account.",
    RX_Message: "Please call me back after 3pm"
  },
  {
    customer: "B. Naidoo",
    TX_Msg: "Your account is overdue. Please confirm when payment will be made.",
    RX_Message: "I will pay R500 on Friday"
  },
  {
    customer: "C. Smith",
    TX_Msg: "Please arrange payment on your overdue balance.",
    RX_Message: "Please send me the banking details and current balance"
  },
  {
    customer: "D. Khumalo",
    TX_Msg: "We are trying to reach Thabo about an outstanding account.",
    RX_Message: "Wrong number, I am not Thabo"
  },
  {
    customer: "E. Jacobs",
    TX_Msg: "Please contact us regarding your outstanding account.",
    RX_Message: "Stop harassing me or I will report you to my lawyer"
  }
];

function setJobStatus(text, state = "idle") {
  els.jobStatus.textContent = text;
  els.jobStatus.className = `status-pill ${state}`.trim();
}

function setProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  els.jobProgress.style.width = `${clamped}%`;
  els.batchPercent.textContent = `${Math.round(clamped)}%`;
}

function setAiConnectionState(state, text) {
  els.ollamaConnectionBadge.className = `connection-badge ${state}`;
  els.systemDot.className = `system-dot ${state}`;

  const badgeText = {
    connected: "Connected",
    checking: "Checking",
    disconnected: "Offline"
  }[state] ?? "Unknown";

  els.ollamaConnectionBadge.textContent = badgeText;
  els.connectionStatusText.textContent = text;
}

function providerName(provider = activeProvider) {
  return providerDefaults[provider]?.name ?? "AI";
}

function formatModelSize(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function renderProviderSwitch() {
  els.providerButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.provider === activeProvider);
  });

  const provider = providerDefaults[activeProvider] ?? providerDefaults.ollama;
  els.ollamaHost.placeholder = provider.placeholder;
  els.providerHint.textContent = provider.hint;
  els.vllmApiKey.classList.toggle("hidden", activeProvider !== "vllm");
  els.vllmApiKeyLabel.classList.toggle("hidden", activeProvider !== "vllm");
}

function activeProviderConfig() {
  return aiConfig?.providers?.[activeProvider] ?? {};
}

function renderAiModels(models, selectedModel) {
  if (models.length === 0) {
    els.ollamaModel.innerHTML = '<option value="">No installed models detected</option>';
    els.ollamaModel.disabled = true;
    return "";
  }

  const selected = models.some((model) => model.name === selectedModel) ? selectedModel : models[0].name;
  els.ollamaModel.innerHTML = models
    .map((model) => {
      const size = formatModelSize(model.size);
      const label = size ? `${model.name} (${size})` : model.name;
      return `<option value="${escapeHtml(model.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  els.ollamaModel.disabled = false;
  els.ollamaModel.value = selected;
  return selected;
}

function renderAiConnection(payload, message = "") {
  const provider = payload.provider ?? activeProvider;
  activeProvider = provider;
  const config = payload.config ?? activeProviderConfig();
  const models = payload.models ?? [];
  const connected = Boolean(payload.connected);
  const selectedModel = renderAiModels(models, config.model);

  aiConfig = {
    provider,
    providers: {
      ...(aiConfig?.providers ?? {}),
      ...(payload.providers ?? {}),
      [provider]: {
        ...config,
        model: selectedModel || config.model || ""
      }
    }
  };
  renderProviderSwitch();

  if (config.host) {
    els.ollamaHost.value = config.host;
  }

  if (provider === "vllm") {
    els.vllmApiKey.value = config.apiKey ?? "";
  } else {
    els.vllmApiKey.value = "";
  }

  els.saveOllama.disabled = !connected || models.length === 0 || !els.ollamaModel.value;
  els.ollamaModelMeta.innerHTML = `
    <span>${models.length} model${models.length === 1 ? "" : "s"} detected</span>
    ${payload.version ? `<span>${escapeHtml(providerDefaults[provider]?.versionLabel ?? "AI")} ${escapeHtml(payload.version)}</span>` : ""}
    ${selectedModel ? `<span>Active: ${escapeHtml(selectedModel)}</span>` : ""}
  `;

  if (connected) {
    setAiConnectionState("connected", `${providerName(provider)} connected - ${selectedModel || "no model selected"}`);
    els.ollamaStatus.className = "result-card empty";
    els.ollamaStatus.innerHTML = `
      <strong>${escapeHtml(message || "Connection ready")}</strong>
      <div>${escapeHtml(config.host)}${selectedModel ? ` - ${escapeHtml(selectedModel)}` : ""}</div>
    `;
    return;
  }

  if (payload.reachable) {
    setAiConnectionState("checking", `${providerName(provider)} URL reachable - loading models`);
    els.ollamaStatus.className = "result-card empty";
    els.ollamaStatus.innerHTML = `
      <strong>URL reachable</strong>
      <div>${escapeHtml(payload.error ?? `Now checking installed models from ${providerName(provider)}.`)}</div>
    `;
    return;
  }

  setAiConnectionState("disconnected", `${providerName(provider)} connection unavailable`);
  els.ollamaStatus.className = "result-card";
  els.ollamaStatus.innerHTML = `
    <strong>Could not connect</strong>
    <div>${escapeHtml(payload.error ?? `Check the ${providerName(provider)} URL and make sure the provider is running.`)}</div>
  `;
}

function shouldAutoDetectHost(value) {
  const host = String(value ?? "").trim();
  if (host.length < 8 || /\s/.test(host)) {
    return false;
  }

  return /^(https?:\/\/)?[^/]+(:\d+)?$/i.test(host) && /localhost|127\.0\.0\.1|\.|:\d+/i.test(host);
}

function providerRequestBody({ persistModel = true } = {}) {
  const current = activeProviderConfig();
  return {
    provider: activeProvider,
    host: els.ollamaHost.value.trim() || current.host,
    model: persistModel ? els.ollamaModel.value || current.model : current.model,
    apiKey: activeProvider === "vllm" ? els.vllmApiKey.value.trim() : undefined
  };
}

async function loadAiConnection() {
  setAiConnectionState("checking", "Checking AI provider");
  els.ollamaStatus.className = "result-card empty";
  els.ollamaStatus.textContent = "Checking AI provider connection...";

  try {
    const response = await fetch("/ai/config");
    const payload = await response.json();
    renderAiConnection(payload);
  } catch (error) {
    renderAiConnection({
      provider: activeProvider,
      config: activeProviderConfig(),
      connected: false,
      models: [],
      error: error.message
    });
  }
}

async function detectAiConnection({ persist = false } = {}) {
  window.clearTimeout(aiDetectTimer);

  const host = els.ollamaHost.value.trim();
  if (!host) {
    renderAiConnection({
      provider: activeProvider,
      config: { host },
      connected: false,
      models: [],
      error: `Enter a ${providerName()} URL first.`
    });
    return;
  }

  els.detectOllama.disabled = true;
  els.saveOllama.disabled = true;
  setAiConnectionState("checking", `Testing ${providerName()} URL`);
  els.ollamaStatus.className = "result-card empty";
  els.ollamaStatus.textContent = `Testing whether the ${providerName()} URL is reachable...`;

  try {
    const reachability = await postJson("/ai/ping", providerRequestBody({ persistModel: false }));

    if (!reachability.reachable) {
      renderAiConnection(reachability);
      return;
    }

    setAiConnectionState("checking", `${providerName()} URL reachable - loading models`);
    els.ollamaStatus.className = "result-card empty";
    els.ollamaStatus.innerHTML = `
      <strong>URL reachable</strong>
      <div>Loading installed models from ${escapeHtml(providerName())}...</div>
    `;

    const payload = await postJson(persist ? "/ai/config" : "/ai/detect", {
      method: persist ? "PUT" : "POST",
      ...providerRequestBody()
    });
    renderAiConnection(payload, persist ? "Provider saved" : "Models detected");
  } catch (error) {
    renderAiConnection(
      error.payload ?? {
        provider: activeProvider,
        config: { host },
        connected: false,
        models: [],
        error: error.message
      }
    );
  } finally {
    els.detectOllama.disabled = false;
  }
}

function scheduleAiAutoDetect() {
  window.clearTimeout(aiDetectTimer);

  const host = els.ollamaHost.value;
  if (!shouldAutoDetectHost(host)) {
    els.saveOllama.disabled = true;

    if (host.trim()) {
      setAiConnectionState("checking", `Finish the ${providerName()} URL to detect models`);
    } else {
      setAiConnectionState("disconnected", `Enter a ${providerName()} URL`);
    }

    return;
  }

  setAiConnectionState("checking", `Waiting to detect ${providerName()} models`);
  aiDetectTimer = window.setTimeout(() => {
    detectAiConnection();
  }, 700);
}

function switchProvider(provider) {
  if (!providerDefaults[provider] || provider === activeProvider) {
    return;
  }

  activeProvider = provider;
  renderProviderSwitch();
  const config = activeProviderConfig();
  els.ollamaHost.value = config.host ?? providerDefaults[provider].placeholder;
  els.vllmApiKey.value = provider === "vllm" ? config.apiKey ?? "" : "";
  renderAiModels([], config.model);
  els.saveOllama.disabled = true;
  setAiConnectionState("checking", `${providerName()} selected`);
  els.ollamaStatus.className = "result-card empty";
  els.ollamaStatus.innerHTML = `<strong>${escapeHtml(providerName())} selected</strong><div>Test the provider URL to load available models.</div>`;
}

function formatServerAddress(config) {
  const host = config?.host ?? "0.0.0.0";
  const port = config?.port ?? 3000;
  return host === "0.0.0.0" ? `localhost:${port} / server-ip:${port}` : `${host}:${port}`;
}

function renderServerConfig(payload, message = "") {
  const active = payload.active ?? {};
  const nextStart = payload.nextStart ?? payload.saved ?? active;
  const restartRequired = Boolean(payload.restartRequired);
  const envOverrides = payload.envOverrides ?? {};

  els.serverHost.value = nextStart.host ?? "0.0.0.0";
  els.serverPort.value = nextStart.port ?? 3000;
  els.serverConnectionBadge.className = `connection-badge ${restartRequired ? "checking" : "connected"}`;
  els.serverConnectionBadge.textContent = restartRequired ? "Restart" : "Active";
  els.serverMeta.innerHTML = `
    <span>Active: ${escapeHtml(formatServerAddress(active))}</span>
    <span>Next start: ${escapeHtml(formatServerAddress(nextStart))}</span>
  `;

  const overrideText =
    envOverrides.host || envOverrides.port
      ? "HOST or PORT environment variables are active, so update those values before restart if you want the saved settings to apply."
      : "Restart the app after saving to apply the new bind IP and port.";

  if (restartRequired) {
    els.serverStatus.className = "result-card";
    els.serverStatus.innerHTML = `
      <strong>${escapeHtml(message || "Restart required")}</strong>
      <div>${escapeHtml(overrideText)}</div>
    `;
    return;
  }

  els.serverStatus.className = "result-card empty";
  els.serverStatus.innerHTML = `
    <strong>${escapeHtml(message || "Server access ready")}</strong>
    <div>Listening on ${escapeHtml(formatServerAddress(active))}.</div>
  `;
}

async function loadServerConfig() {
  try {
    const response = await fetch("/server/config");
    renderServerConfig(await response.json());
  } catch (error) {
    els.serverConnectionBadge.className = "connection-badge disconnected";
    els.serverConnectionBadge.textContent = "Error";
    els.serverStatus.className = "result-card";
    els.serverStatus.innerHTML = `<strong>Could not load server settings</strong><div>${escapeHtml(error.message)}</div>`;
  }
}

async function saveServerConfig() {
  els.saveServerConfig.disabled = true;
  els.serverStatus.className = "result-card empty";
  els.serverStatus.textContent = "Saving server access settings...";

  try {
    const payload = await postJson("/server/config", {
      method: "PUT",
      host: els.serverHost.value.trim(),
      port: Number(els.serverPort.value)
    });
    renderServerConfig(payload, "Saved for next restart");
  } catch (error) {
    els.serverConnectionBadge.className = "connection-badge disconnected";
    els.serverConnectionBadge.textContent = "Invalid";
    els.serverStatus.className = "result-card";
    els.serverStatus.innerHTML = `<strong>Could not save server settings</strong><div>${escapeHtml(error.message)}</div>`;
  } finally {
    els.saveServerConfig.disabled = false;
  }
}

function buildBatches(messages) {
  const batches = [];

  for (let start = 0; start < messages.length; start += CLASSIFY_CHUNK_SIZE) {
    const records = messages.slice(start, start + CLASSIFY_CHUNK_SIZE);
    batches.push({
      id: batches.length + 1,
      start,
      end: start + records.length,
      records,
      status: "queued"
    });
  }

  return batches;
}

function renderBatchProgress(batches, completedRows, totalRows) {
  const active = batches.filter((batch) => batch.status === "active").length;
  const done = batches.filter((batch) => batch.status === "done").length;
  const failed = batches.filter((batch) => batch.status === "failed").length;

  els.batchProgressPanel.classList.add("active");
  els.batchProgressPanel.classList.toggle("is-processing", active > 0);
  els.batchProgressTitle.textContent =
    totalRows === 0 ? "Waiting for import" : `${completedRows} of ${totalRows} replies processed`;
  els.batchActiveCount.textContent = `${active} active`;
  els.batchDoneCount.textContent = failed > 0 ? `${done} done, ${failed} failed` : `${done} done`;
  els.batchLane.innerHTML = batches
    .map(
      (batch) => `
        <div class="batch-chip ${escapeHtml(batch.status)}">
          <span class="batch-dot" aria-hidden="true"></span>
          <strong>Batch ${batch.id}</strong>
          <small>${batch.start + 1}-${batch.end}</small>
        </div>
      `
    )
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "category";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(csvRows) {
  const [headerRow, ...dataRows] = csvRows;
  const normalizedHeaders = headerRow.map((header, index) => header.trim() || `column_${index + 1}`);

  return {
    headers: normalizedHeaders,
    rows: dataRows.map((row) =>
      Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? ""]))
    )
  };
}

function pickLikelyReplyColumn(headerList) {
  const exact = headerList.find((header) => /^(RX_Message|rx_message|reply|sms_reply|message|text)$/i.test(header));
  if (exact) {
    return exact;
  }

  return headerList.find((header) => /(rx|reply|response|message|comment|text)/i.test(header)) ?? headerList[0] ?? "";
}

function pickLikelySentColumn(headerList) {
  const exact = headerList.find((header) => /^(TX_Msg|tx_msg|sent|sms_sent|sent_sms)$/i.test(header));
  if (exact) {
    return exact;
  }

  return headerList.find((header) => /(tx|sent|outbound|original)/i.test(header)) ?? "";
}

function optionsForColumns(includeNone = false) {
  const none = includeNone ? '<option value="">No sent SMS column</option>' : "";
  return `${none}${headers
    .map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
    .join("")}`;
}

function updateColumnSelects() {
  els.sentColumn.innerHTML = optionsForColumns(true);
  els.replyColumn.innerHTML = optionsForColumns(false);
  els.sentColumn.disabled = headers.length === 0;
  els.replyColumn.disabled = headers.length === 0;
  els.classifyCsv.disabled = headers.length === 0 || importedRows.length === 0;
  els.sentColumn.value = pickLikelySentColumn(headers);
  els.replyColumn.value = pickLikelyReplyColumn(headers);
}

function updateStats(rows) {
  const total = rows.length;
  const callback = rows.filter((row) => row.category === "call_management" || row.classification_id === "1").length;
  const optOut = rows.filter((row) => row.category === "payment_commitment" || row.classification_id === "2").length;
  const review = rows.filter((row) => row.category === "unknown" || row.classification_id === "10" || row.error).length;

  els.statTotal.textContent = total;
  els.statCallback.textContent = callback;
  els.statOptOut.textContent = optOut;
  els.statReview.textContent = review;
}

function renderRows(rows) {
  if (rows.length === 0) {
    els.resultsBody.innerHTML = '<tr><td colspan="8" class="empty-table">No SMS replies loaded.</td></tr>';
    updateStats([]);
    els.downloadResults.disabled = true;
    els.downloadJsonResults.disabled = true;
    return;
  }

  els.resultsBody.innerHTML = rows
    .map((row, index) => {
      const category = row.error ? "error" : row.category ?? "pending";
      const confidence = row.confidence == null ? "" : `${Math.round(row.confidence * 100)}%`;

      return `
        <tr>
          <td>${index + 1}</td>
          <td class="sms-cell">${escapeHtml(row.sentText)}</td>
          <td class="sms-cell">${escapeHtml(row.text)}</td>
          <td>${escapeHtml(row.classification_id ?? "")}</td>
          <td><span class="badge ${escapeHtml(category)}" style="--badge-color: ${escapeHtml(row.color ?? "#687f91")}">${escapeHtml(row.label ?? category)}</span></td>
          <td>${escapeHtml(confidence)}</td>
          <td class="next-cell">${escapeHtml(row.next_step ?? "")}</td>
          <td class="reason-cell">${escapeHtml(row.error ?? row.reason ?? "")}</td>
        </tr>
      `;
    })
    .join("");

  updateStats(rows);
  els.downloadResults.disabled = rows.every((row) => !row.category && !row.error);
  els.downloadJsonResults.disabled = els.downloadResults.disabled;
}

async function loadCategories() {
  const payload = await fetch("/categories").then((response) => response.json());
  categoryConfig = payload.categories ?? [];
  renderCategoryEditor();
  els.categoryStatus.className = "result-card empty";
  els.categoryStatus.textContent = `${categoryConfig.length} classifications loaded.`;
}

function renderCategoryEditor() {
  els.categoryEditor.innerHTML = categoryConfig
    .map(
      (category, index) => `
        <div class="category-card" data-index="${index}">
          <div class="category-card-head">
            <label class="category-field">
              <span>ID</span>
              <input data-field="code" value="${escapeHtml(category.code)}" aria-label="Classification ID">
            </label>
            <label class="category-field">
              <span>Label</span>
              <input data-field="label" value="${escapeHtml(category.label)}" aria-label="Classification label">
            </label>
            <button class="delete-category" type="button" data-delete-index="${index}" aria-label="Delete classification">x</button>
          </div>
          <label class="category-field color-field">
            <span>Color</span>
            <input data-field="color" type="color" value="${escapeHtml(category.color ?? "#687f91")}" aria-label="Classification color">
            <em style="--preview-color: ${escapeHtml(category.color ?? "#687f91")}">${escapeHtml(category.label)}</em>
          </label>
          <label class="category-field">
            <span>Key</span>
            <input data-field="id" value="${escapeHtml(category.id)}" aria-label="Internal key">
          </label>
          <label class="category-field">
            <span>Meaning</span>
            <textarea data-field="description" aria-label="Classification description">${escapeHtml(category.description)}</textarea>
          </label>
          <label class="category-field">
            <span>Next Step</span>
            <textarea data-field="next_step" aria-label="Next step">${escapeHtml(category.next_step)}</textarea>
          </label>
          <label class="category-field">
            <span>Examples</span>
            <textarea class="examples-input" data-field="examples" aria-label="Examples">${escapeHtml(
              (category.examples ?? []).join("\n")
            )}</textarea>
          </label>
        </div>
      `
    )
    .join("");
}

function collectCategoryConfig() {
  return [...els.categoryEditor.querySelectorAll(".category-card")].map((card) => {
    const getField = (field) => card.querySelector(`[data-field="${field}"]`)?.value.trim() ?? "";
    const label = getField("label");

    return {
      code: getField("code"),
      color: getField("color") || "#687f91",
      label,
      id: slugify(getField("id") || label),
      description: getField("description"),
      next_step: getField("next_step"),
      examples: getField("examples")
        .split(/\r?\n|,/)
        .map((example) => example.trim())
        .filter(Boolean)
    };
  });
}

function addCategory() {
  const nextNumber =
    Math.max(
      0,
      ...categoryConfig.map((category) => Number(category.code)).filter((number) => Number.isFinite(number))
    ) + 1;

  categoryConfig.push({
    id: `category_${nextNumber}`,
    code: String(nextNumber),
    color: "#ef3f49",
    label: `Category ${nextNumber}`,
    description: "Describe when this classification should be selected.",
    next_step: "Describe what should happen next.",
    examples: []
  });
  renderCategoryEditor();
  els.categoryStatus.textContent = "New classification added. Save when ready.";
}

async function saveCategories() {
  els.saveCategories.disabled = true;
  els.categoryStatus.className = "result-card";
  els.categoryStatus.textContent = "Saving classifications...";

  try {
    const payload = await postJson("/categories", {
      method: "PUT",
      categories: collectCategoryConfig()
    });
    categoryConfig = payload.categories;
    renderCategoryEditor();
    els.categoryStatus.className = "result-card empty";
    els.categoryStatus.textContent = `${categoryConfig.length} classifications saved.`;
  } catch (error) {
    els.categoryStatus.className = "result-card";
    els.categoryStatus.innerHTML = `<strong>Save failed</strong><div>${escapeHtml(error.message)}</div>`;
  } finally {
    els.saveCategories.disabled = false;
  }
}

async function resetCategories() {
  els.resetCategories.disabled = true;
  els.categoryStatus.className = "result-card";
  els.categoryStatus.textContent = "Resetting classifications...";

  try {
    const payload = await postJson("/categories/reset", {});
    categoryConfig = payload.categories;
    renderCategoryEditor();
    els.categoryStatus.className = "result-card empty";
    els.categoryStatus.textContent = "Default classifications restored.";
  } catch (error) {
    els.categoryStatus.className = "result-card";
    els.categoryStatus.innerHTML = `<strong>Reset failed</strong><div>${escapeHtml(error.message)}</div>`;
  } finally {
    els.resetCategories.disabled = false;
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: body.method ?? "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.error ?? "Request failed.");
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function classifySingle() {
  const sentText = els.singleSentSms.value.trim();
  const text = els.singleSms.value.trim();
  if (!text) {
    els.singleResult.className = "result-card empty";
    els.singleResult.textContent = "Enter an SMS reply first.";
    return;
  }

  els.classifySingle.disabled = true;
  els.singleResult.className = "result-card";
  els.singleResult.textContent = "Classifying...";

  try {
    const result = await postJson("/classify", { sentText, text });
    els.singleResult.innerHTML = `
      <strong>${escapeHtml(result.classification_id)} - ${escapeHtml(result.label)} - ${Math.round(result.confidence * 100)}%</strong>
      <div>${escapeHtml(result.next_step)}</div>
      <div>${escapeHtml(result.reason)}</div>
    `;
  } catch (error) {
    els.singleResult.innerHTML = `<strong>Classification failed</strong><div>${escapeHtml(error.message)}</div>`;
  } finally {
    els.classifySingle.disabled = false;
  }
}

function loadImportedRows(rows, headerList, name) {
  const sentColumn = pickLikelySentColumn(headerList);
  const replyColumn = pickLikelyReplyColumn(headerList);

  importedRows = rows;
  headers = headerList;
  classifiedRows = rows.map((row) => ({
    sentText: row[sentColumn] ?? "",
    text: row[replyColumn] ?? ""
  }));

  els.fileName.textContent = name;
  updateColumnSelects();
  renderRows(classifiedRows);
  els.tableStatus.textContent = `${rows.length} SMS replies imported. Confirm TX_Msg and RX_Message columns, then classify.`;
  setJobStatus("Ready");
  setProgress(0);
  els.batchProgressPanel.classList.remove("active", "is-processing");
}

async function handleFileImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const csvRows = parseCsv(text);

    if (csvRows.length < 2) {
      throw new Error("CSV must include a header row and at least one SMS row.");
    }

    const parsed = rowsToObjects(csvRows);
    loadImportedRows(parsed.rows, parsed.headers, file.name);
  } catch (error) {
    setJobStatus("Import error", "error");
    els.tableStatus.textContent = error.message;
  }
}

function loadSample() {
  loadImportedRows(sampleRows, ["customer", "TX_Msg", "RX_Message"], "sample-data.csv");
}

async function classifyCsvRows() {
  const sentColumn = els.sentColumn.value;
  const replyColumn = els.replyColumn.value;
  const messages = importedRows.map((row, index) => ({
    id: row.id ?? row.ID ?? row.customer ?? String(index + 1),
    sentText: sentColumn ? row[sentColumn] ?? "" : "",
    text: row[replyColumn] ?? ""
  }));

  classifiedRows = messages.map((message) => ({
    sentText: message.sentText,
    text: message.text,
    classification_id: "",
    category: "pending"
  }));
  renderRows(classifiedRows);
  setJobStatus("Classifying", "busy");
  setProgress(0);
  els.classifyCsv.disabled = true;
  els.downloadResults.disabled = true;
  els.tableStatus.textContent = `Classifying 0 of ${messages.length} SMS replies...`;

  try {
    const batches = buildBatches(messages);
    const results = Array(messages.length);
    let completedRows = 0;
    let nextBatchIndex = 0;
    let failedBatches = 0;

    renderBatchProgress(batches, completedRows, messages.length);

    async function processNextBatch() {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;

      if (batchIndex >= batches.length) {
        return;
      }

      const batch = batches[batchIndex];
      batch.status = "active";
      renderBatchProgress(batches, completedRows, messages.length);

      try {
        const payload = await postJson("/classify-batch", { messages: batch.records });
        payload.results.forEach((result, resultIndex) => {
          results[batch.start + resultIndex] = result;
        });
        classifiedRows.splice(batch.start, payload.results.length, ...payload.results);
        batch.status = "done";
      } catch (error) {
        failedBatches += 1;
        const failedRows = batch.records.map((message) => ({
          sentText: message.sentText,
          text: message.text,
          classification_id: "",
          category: "error",
          error: error.message
        }));
        failedRows.forEach((row, rowIndex) => {
          results[batch.start + rowIndex] = row;
        });
        classifiedRows.splice(batch.start, failedRows.length, ...failedRows);
        batch.status = "failed";
      }

      completedRows += batch.records.length;
      renderRows(classifiedRows);
      renderBatchProgress(batches, completedRows, messages.length);
      setProgress((completedRows / messages.length) * 100);
      els.tableStatus.textContent = `Classifying ${completedRows} of ${messages.length} SMS replies...`;

      await processNextBatch();
    }

    const workers = Array.from(
      { length: Math.min(ASYNC_BATCH_CONCURRENCY, batches.length) },
      () => processNextBatch()
    );
    await Promise.all(workers);

    classifiedRows = results.filter(Boolean);
    renderRows(classifiedRows);
    setJobStatus(failedBatches > 0 ? "Complete with errors" : "Complete", failedBatches > 0 ? "error" : "done");
    setProgress(100);
    renderBatchProgress(batches, messages.length, messages.length);
    els.tableStatus.textContent =
      failedBatches > 0
        ? `${classifiedRows.length} SMS replies processed with ${failedBatches} failed batch request(s).`
        : `${classifiedRows.length} SMS replies classified.`;
  } catch (error) {
    setJobStatus("Error", "error");
    setProgress(100);
    els.tableStatus.textContent = error.message;
  } finally {
    els.classifyCsv.disabled = importedRows.length === 0;
  }
}

function toCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function downloadResults() {
  const csv = [
    ["sent_text", "reply_text", "classification_id", "category", "label", "color", "confidence", "next_step", "reason", "error"].join(","),
    ...classifiedRows.map((row) =>
      [row.sentText, row.text, row.classification_id, row.category, row.label, row.color, row.confidence, row.next_step, row.reason, row.error]
        .map(toCsvValue)
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sms-classification-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJsonResults() {
  const blob = new Blob([JSON.stringify(classifiedRows, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sms-classification-results.json";
  link.click();
  URL.revokeObjectURL(url);
}

els.classifySingle.addEventListener("click", classifySingle);
els.singleSms.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    classifySingle();
  }
});
els.csvFile.addEventListener("change", handleFileImport);
els.categoryEditor.addEventListener("click", (event) => {
  const deleteIndex = event.target?.dataset?.deleteIndex;
  if (deleteIndex == null) {
    return;
  }

  categoryConfig.splice(Number(deleteIndex), 1);
  renderCategoryEditor();
  els.categoryStatus.textContent = "Classification removed. Save when ready.";
});
els.categoryEditor.addEventListener("input", (event) => {
  const card = event.target.closest(".category-card");
  if (!card) {
    return;
  }

  const label = card.querySelector('[data-field="label"]')?.value.trim() || "Classification";
  const color = card.querySelector('[data-field="color"]')?.value || "#687f91";
  const preview = card.querySelector(".color-field em");

  if (preview) {
    preview.textContent = label;
    preview.style.setProperty("--preview-color", color);
  }
});
function refreshPreviewFromColumns() {
  const sentColumn = els.sentColumn.value;
  const replyColumn = els.replyColumn.value;
  classifiedRows = importedRows.map((row) => ({
    sentText: sentColumn ? row[sentColumn] ?? "" : "",
    text: row[replyColumn] ?? ""
  }));
  renderRows(classifiedRows);
}

els.sentColumn.addEventListener("change", refreshPreviewFromColumns);
els.replyColumn.addEventListener("change", refreshPreviewFromColumns);
els.providerButtons.forEach((button) => {
  button.addEventListener("click", () => switchProvider(button.dataset.provider));
});
els.ollamaHost.addEventListener("input", scheduleAiAutoDetect);
els.vllmApiKey.addEventListener("input", () => {
  els.saveOllama.disabled = true;
});
els.detectOllama.addEventListener("click", () => detectAiConnection());
els.saveOllama.addEventListener("click", () => detectAiConnection({ persist: true }));
els.ollamaModel.addEventListener("change", () => {
  els.saveOllama.disabled = !els.ollamaModel.value;
  els.ollamaStatus.className = "result-card empty";
  els.ollamaStatus.innerHTML = `<strong>Model selected</strong><div>${escapeHtml(els.ollamaModel.value)} is ready to save.</div>`;
});
els.saveServerConfig.addEventListener("click", saveServerConfig);
[els.serverHost, els.serverPort].forEach((input) => {
  input.addEventListener("input", () => {
    els.serverConnectionBadge.className = "connection-badge checking";
    els.serverConnectionBadge.textContent = "Unsaved";
    els.serverStatus.className = "result-card";
    els.serverStatus.innerHTML = "<strong>Unsaved server access change</strong><div>Save, then restart the app to apply it.</div>";
  });
});
els.classifyCsv.addEventListener("click", classifyCsvRows);
els.loadSample.addEventListener("click", loadSample);
els.downloadResults.addEventListener("click", downloadResults);
els.downloadJsonResults.addEventListener("click", downloadJsonResults);
els.addCategory.addEventListener("click", addCategory);
els.saveCategories.addEventListener("click", saveCategories);
els.resetCategories.addEventListener("click", resetCategories);

loadAiConnection();
loadServerConfig();

loadCategories().catch((error) => {
  els.categoryStatus.className = "result-card";
  els.categoryStatus.innerHTML = `<strong>Could not load classifications</strong><div>${escapeHtml(error.message)}</div>`;
});
