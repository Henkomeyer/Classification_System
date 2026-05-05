import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultOllamaConfig,
  inspectOllamaConnection,
  loadOllamaConfig,
  normalizeOllamaConfig,
  saveOllamaConfig,
  selectDetectedModel as selectOllamaDetectedModel,
  testOllamaReachability
} from "./ollamaSettings.js";
import { OllamaClient } from "./ollamaClient.js";
import { DEFAULT_VLLM_HOST, DEFAULT_VLLM_MODEL, normalizeVllmHost, VllmClient } from "./vllmClient.js";

const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDirectory = path.join(rootDirectory, "data");
const settingsPath = path.join(dataDirectory, "ai.json");
const providers = ["ollama", "vllm"];

export function normalizeProvider(value) {
  const provider = String(value ?? "").trim().toLowerCase();
  return providers.includes(provider) ? provider : "ollama";
}

export function defaultVllmConfig() {
  return normalizeVllmConfig({
    host: process.env.VLLM_HOST ?? DEFAULT_VLLM_HOST,
    model: process.env.VLLM_MODEL ?? DEFAULT_VLLM_MODEL,
    apiKey: process.env.VLLM_API_KEY ?? ""
  });
}

export function normalizeVllmConfig(config = {}) {
  return {
    host: normalizeVllmHost(config.host ?? DEFAULT_VLLM_HOST),
    model: String(config.model ?? DEFAULT_VLLM_MODEL).trim(),
    apiKey: String(config.apiKey ?? "").trim()
  };
}

export function normalizeProviderConfig(provider, config = {}) {
  return provider === "vllm" ? normalizeVllmConfig(config) : normalizeOllamaConfig(config);
}

export async function defaultAiConfig() {
  return {
    provider: normalizeProvider(process.env.AI_PROVIDER ?? "ollama"),
    providers: {
      ollama: await loadOllamaConfig(),
      vllm: defaultVllmConfig()
    }
  };
}

export async function normalizeAiConfig(config = {}) {
  const defaults = await defaultAiConfig();
  const provider = normalizeProvider(config.provider ?? defaults.provider);
  const ollama = normalizeOllamaConfig({
    ...defaults.providers.ollama,
    ...config.providers?.ollama
  });
  const vllm = normalizeVllmConfig({
    ...defaults.providers.vllm,
    ...config.providers?.vllm
  });

  return {
    provider,
    providers: {
      ollama,
      vllm
    }
  };
}

export async function loadAiConfig() {
  try {
    const content = await readFile(settingsPath, "utf8");
    return normalizeAiConfig(JSON.parse(content));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return defaultAiConfig();
  }
}

export async function saveAiConfig(config) {
  const normalized = await normalizeAiConfig(config);

  await mkdir(dataDirectory, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  if (normalized.provider === "ollama") {
    await saveOllamaConfig(normalized.providers.ollama);
  }

  return normalized;
}

export function createProviderClient(provider, config) {
  const normalizedProvider = normalizeProvider(provider);
  return normalizedProvider === "vllm"
    ? new VllmClient(normalizeVllmConfig(config))
    : new OllamaClient(normalizeOllamaConfig(config));
}

export async function createActiveClient(config = undefined) {
  const aiConfig = config ?? (await loadAiConfig());
  return {
    provider: aiConfig.provider,
    client: createProviderClient(aiConfig.provider, aiConfig.providers[aiConfig.provider])
  };
}

export async function testProviderReachability(provider, config, { timeoutMs = 5000 } = {}) {
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === "ollama") {
    const payload = await testOllamaReachability(config, { timeoutMs });
    return {
      provider: normalizedProvider,
      ...payload
    };
  }

  const normalized = normalizeVllmConfig(config);
  const client = new VllmClient(normalized);
  const reachability = await client.checkReachable({ timeoutMs });

  return {
    provider: normalizedProvider,
    config: normalized,
    reachable: reachability.reachable,
    connected: false,
    version: reachability.version,
    models: [],
    selectedModelAvailable: false
  };
}

export async function inspectProviderConnection(provider, config, { timeoutMs = 8000 } = {}) {
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === "ollama") {
    const payload = await inspectOllamaConnection(config, { timeoutMs });
    return {
      provider: normalizedProvider,
      ...payload
    };
  }

  const normalized = normalizeVllmConfig(config);
  const client = new VllmClient(normalized);
  const reachability = await client.checkReachable({ timeoutMs: Math.min(timeoutMs, 5000) });

  let models = [];

  try {
    models = await client.listModels({ timeoutMs });
  } catch (error) {
    return {
      provider: normalizedProvider,
      config: normalized,
      reachable: true,
      connected: false,
      version: reachability.version,
      models,
      selectedModelAvailable: false,
      error: error.name === "AbortError" ? "Timed out while loading VLLM models." : error.message
    };
  }

  return {
    provider: normalizedProvider,
    config: normalized,
    reachable: true,
    connected: true,
    version: reachability.version,
    models,
    selectedModelAvailable: models.some((model) => model.name === normalized.model)
  };
}

export function selectDetectedModel(models, preferredModel) {
  return selectOllamaDetectedModel(models, preferredModel);
}

export function redactedConfig(config) {
  if (!config?.apiKey) {
    return config;
  }

  return {
    ...config,
    apiKey: "********"
  };
}
