import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HOST,
  DEFAULT_KEEP_ALIVE,
  DEFAULT_MODEL,
  normalizeOllamaHost,
  OllamaClient
} from "./ollamaClient.js";

const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDirectory = path.join(rootDirectory, "data");
const settingsPath = path.join(dataDirectory, "ollama.json");

export function defaultOllamaConfig() {
  return normalizeOllamaConfig({
    host: process.env.OLLAMA_HOST ?? DEFAULT_HOST,
    model: process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE
  });
}

export function normalizeOllamaConfig(config = {}) {
  return {
    host: normalizeOllamaHost(config.host ?? DEFAULT_HOST),
    model: String(config.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    keepAlive: String(config.keepAlive ?? DEFAULT_KEEP_ALIVE).trim() || DEFAULT_KEEP_ALIVE
  };
}

export async function loadOllamaConfig() {
  try {
    const content = await readFile(settingsPath, "utf8");
    return normalizeOllamaConfig({
      ...defaultOllamaConfig(),
      ...JSON.parse(content)
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return defaultOllamaConfig();
  }
}

export async function saveOllamaConfig(config) {
  const normalized = normalizeOllamaConfig({
    ...(await loadOllamaConfig()),
    ...config
  });

  await mkdir(dataDirectory, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function testOllamaReachability(config, { timeoutMs = 5000 } = {}) {
  const normalized = normalizeOllamaConfig(config);
  const client = new OllamaClient(normalized);
  const reachability = await client.checkReachable({ timeoutMs });

  return {
    config: normalized,
    reachable: reachability.reachable,
    connected: false,
    version: reachability.version,
    models: [],
    selectedModelAvailable: false
  };
}

export async function inspectOllamaConnection(config, { timeoutMs = 8000 } = {}) {
  const normalized = normalizeOllamaConfig(config);
  const client = new OllamaClient(normalized);
  const reachability = await client.checkReachable({ timeoutMs: Math.min(timeoutMs, 5000) });

  let models = [];

  try {
    models = await client.listModels({ timeoutMs });
  } catch (error) {
    return {
      config: normalized,
      reachable: true,
      connected: false,
      version: reachability.version,
      models,
      selectedModelAvailable: false,
      error: error.name === "AbortError" ? "Timed out while loading installed models." : error.message
    };
  }

  return {
    config: normalized,
    reachable: reachability.reachable,
    connected: true,
    version: reachability.version,
    models,
    selectedModelAvailable: models.some((model) => model.name === normalized.model)
  };
}

export function selectDetectedModel(models, preferredModel) {
  const names = models.map((model) => model.name);

  if (preferredModel && names.includes(preferredModel)) {
    return preferredModel;
  }

  return names[0] ?? String(preferredModel ?? DEFAULT_MODEL);
}
