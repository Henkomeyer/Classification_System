import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyBatch } from "./batch.js";
import { classifySms, listCategories } from "./classifier.js";
import { resetCategories, saveCategories } from "./categories.js";
import {
  createProviderClient,
  inspectProviderConnection,
  loadAiConfig,
  normalizeAiConfig,
  normalizeProvider,
  normalizeProviderConfig,
  redactedConfig,
  saveAiConfig,
  selectDetectedModel,
  testProviderReachability
} from "./aiSettings.js";
import {
  inspectOllamaConnection,
  loadOllamaConfig,
  normalizeOllamaConfig,
  saveOllamaConfig,
  selectDetectedModel as selectOllamaDetectedModel,
  testOllamaReachability
} from "./ollamaSettings.js";
import { buildServerConfigPayload, loadServerConfig, saveServerConfig } from "./serverSettings.js";

const serverConfig = await loadServerConfig();
const port = serverConfig.port;
const host = serverConfig.host;
const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDirectory = path.join(rootDirectory, "public");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function buildOllamaPayload(config, { timeoutMs = 8000 } = {}) {
  try {
    return await inspectOllamaConnection(config, { timeoutMs });
  } catch (error) {
    return {
      config: normalizeOllamaConfig(config),
      reachable: false,
      connected: false,
      models: [],
      selectedModelAvailable: false,
      error: error.name === "AbortError" ? "Timed out while connecting to Ollama." : error.message
    };
  }
}

function publicProviderPayload(payload, aiConfig = undefined) {
  return {
    ...payload,
    config: redactedConfig(payload.config),
    providers: aiConfig
      ? {
          ollama: redactedConfig(aiConfig.providers.ollama),
          vllm: redactedConfig(aiConfig.providers.vllm)
        }
      : undefined
  };
}

async function buildProviderPayload(provider, config, { timeoutMs = 8000 } = {}) {
  const normalizedProvider = normalizeProvider(provider);

  try {
    return await inspectProviderConnection(normalizedProvider, config, { timeoutMs });
  } catch (error) {
    return {
      provider: normalizedProvider,
      config: normalizeProviderConfig(normalizedProvider, config),
      reachable: false,
      connected: false,
      models: [],
      selectedModelAvailable: false,
      error: error.name === "AbortError" ? `Timed out while connecting to ${normalizedProvider.toUpperCase()}.` : error.message
    };
  }
}

async function buildProviderReachabilityPayload(provider, config, { timeoutMs = 5000 } = {}) {
  const normalizedProvider = normalizeProvider(provider);

  try {
    return await testProviderReachability(normalizedProvider, config, { timeoutMs });
  } catch (error) {
    return {
      provider: normalizedProvider,
      config: normalizeProviderConfig(normalizedProvider, config),
      reachable: false,
      connected: false,
      models: [],
      selectedModelAvailable: false,
      error: error.name === "AbortError" ? `Timed out while connecting to ${normalizedProvider.toUpperCase()}.` : error.message
    };
  }
}

async function buildRequestedAiConfig(body) {
  const current = await loadAiConfig();
  const provider = normalizeProvider(body.provider ?? current.provider);
  const config = normalizeProviderConfig(provider, {
    ...current.providers[provider],
    host: body.host || current.providers[provider].host,
    model: body.model ?? current.providers[provider].model,
    keepAlive: body.keepAlive ?? current.providers[provider].keepAlive,
    apiKey: body.apiKey === "********" ? current.providers[provider].apiKey : body.apiKey ?? current.providers[provider].apiKey
  });

  return normalizeAiConfig({
    ...current,
    provider,
    providers: {
      ...current.providers,
      [provider]: config
    }
  });
}

async function detectProviderFromBody(body, { persist = false } = {}) {
  const requestedConfig = await buildRequestedAiConfig(body);
  const provider = requestedConfig.provider;
  const detected = await buildProviderPayload(provider, requestedConfig.providers[provider]);

  if (!detected.connected) {
    return publicProviderPayload(detected, requestedConfig);
  }

  const selectedModel = selectDetectedModel(detected.models, body.model || requestedConfig.providers[provider].model);
  const providerConfig = normalizeProviderConfig(provider, {
    ...requestedConfig.providers[provider],
    model: selectedModel
  });
  const aiConfig = await normalizeAiConfig({
    ...requestedConfig,
    provider,
    providers: {
      ...requestedConfig.providers,
      [provider]: providerConfig
    }
  });
  const selectedModelAvailable = detected.models.some((model) => model.name === selectedModel);

  if (!persist || detected.models.length === 0) {
    return publicProviderPayload(
      {
        ...detected,
        config: providerConfig,
        selectedModelAvailable
      },
      aiConfig
    );
  }

  const savedConfig = await saveAiConfig(aiConfig);
  return publicProviderPayload(
    {
      ...detected,
      config: savedConfig.providers[provider],
      selectedModelAvailable: detected.models.some((model) => model.name === savedConfig.providers[provider].model)
    },
    savedConfig
  );
}

async function buildOllamaReachabilityPayload(config, { timeoutMs = 5000 } = {}) {
  try {
    return await testOllamaReachability(config, { timeoutMs });
  } catch (error) {
    return {
      config: normalizeOllamaConfig(config),
      reachable: false,
      connected: false,
      models: [],
      selectedModelAvailable: false,
      error: error.name === "AbortError" ? "Timed out while connecting to Ollama." : error.message
    };
  }
}

async function buildRequestedOllamaConfig(body) {
  const existingConfig = await loadOllamaConfig();
  return normalizeOllamaConfig({
    ...existingConfig,
    host: body.host || existingConfig.host,
    model: body.model || existingConfig.model,
    keepAlive: body.keepAlive || existingConfig.keepAlive
  });
}

async function detectOllamaFromBody(body, { persist = false } = {}) {
  const requestedConfig = await buildRequestedOllamaConfig(body);
  const detected = await buildOllamaPayload(requestedConfig);

  if (!detected.connected) {
    return detected;
  }

  const selectedModel = selectOllamaDetectedModel(detected.models, body.model || requestedConfig.model);
  const config = normalizeOllamaConfig({
    ...requestedConfig,
    model: selectedModel
  });
  const selectedModelAvailable = detected.models.some((model) => model.name === selectedModel);

  if (!persist || detected.models.length === 0) {
    return {
      ...detected,
      config,
      selectedModelAvailable
    };
  }

  const savedConfig = await saveOllamaConfig(config);
  return {
    ...detected,
    config: savedConfig,
    selectedModelAvailable: detected.models.some((model) => model.name === savedConfig.model)
  };
}

async function sendStatic(response, requestedPath) {
  const cleanPath = requestedPath === "/" ? "/index.html" : requestedPath;
  const decodedPath = decodeURIComponent(cleanPath).replace(/^\/+/, "");
  const filePath = path.normalize(path.join(publicDirectory, decodedPath));

  if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  try {
    const content = await readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/server/config") {
      sendJson(response, 200, await buildServerConfigPayload({ host, port }));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/server/config") {
      const body = await readJson(request);
      try {
        await saveServerConfig({
          host: body.host,
          port: body.port
        });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      sendJson(response, 200, await buildServerConfigPayload({ host, port }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/categories") {
      sendJson(response, 200, { categories: await listCategories() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/ai/config") {
      const aiConfig = await loadAiConfig();
      const payload = await buildProviderPayload(aiConfig.provider, aiConfig.providers[aiConfig.provider], {
        timeoutMs: 5000
      });
      sendJson(response, 200, publicProviderPayload(payload, aiConfig));
      return;
    }

    if (request.method === "POST" && url.pathname === "/ai/ping") {
      const body = await readJson(request);
      const aiConfig = await buildRequestedAiConfig(body);
      const provider = aiConfig.provider;
      const payload = await buildProviderReachabilityPayload(provider, aiConfig.providers[provider]);
      sendJson(response, 200, publicProviderPayload(payload, aiConfig));
      return;
    }

    if (request.method === "POST" && url.pathname === "/ai/detect") {
      const body = await readJson(request);
      sendJson(response, 200, await detectProviderFromBody(body));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/ai/config") {
      const body = await readJson(request);
      const payload = await detectProviderFromBody(body, { persist: true });
      const providerLabel = normalizeProvider(body.provider).toUpperCase();

      if (!payload.connected) {
        sendJson(response, 400, payload);
        return;
      }

      if (payload.models.length === 0) {
        sendJson(response, 400, {
          ...payload,
          error: `Connected to ${providerLabel}, but no models were found.`
        });
        return;
      }

      sendJson(response, 200, payload);
      return;
    }

    if (request.method === "GET" && url.pathname === "/ollama/config") {
      const config = await loadOllamaConfig();
      sendJson(response, 200, await buildOllamaPayload(config, { timeoutMs: 5000 }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/ollama/ping") {
      const body = await readJson(request);
      const config = await buildRequestedOllamaConfig(body);
      sendJson(response, 200, await buildOllamaReachabilityPayload(config));
      return;
    }

    if (request.method === "POST" && url.pathname === "/ollama/detect") {
      const body = await readJson(request);
      sendJson(response, 200, await detectOllamaFromBody(body));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/ollama/config") {
      const body = await readJson(request);
      const payload = await detectOllamaFromBody(body, { persist: true });

      if (!payload.connected) {
        sendJson(response, 400, payload);
        return;
      }

      if (payload.models.length === 0) {
        sendJson(response, 400, {
          ...payload,
          error: "Connected to Ollama, but no installed models were found. Pull a model first."
        });
        return;
      }

      sendJson(response, 200, payload);
      return;
    }

    if (request.method === "PUT" && url.pathname === "/categories") {
      const body = await readJson(request);
      const categories = await saveCategories(body.categories);
      sendJson(response, 200, { categories });
      return;
    }

    if (request.method === "POST" && url.pathname === "/categories/reset") {
      const categories = await resetCategories();
      sendJson(response, 200, { categories });
      return;
    }

    if (request.method === "POST" && url.pathname === "/classify") {
      const body = await readJson(request);

      if (typeof body.text !== "string") {
        sendJson(response, 400, { error: "Expected JSON body with a string 'text' field." });
        return;
      }

      const result = await classifySms(body.text, {
        sentText: body.sentText
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/classify-batch") {
      const body = await readJson(request);
      const results = await classifyBatch(body.messages);
      sendJson(response, 200, {
        count: results.length,
        results
      });
      return;
    }

    if (request.method === "GET") {
      await sendStatic(response, url.pathname);
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message,
      hint: "Check that Ollama is running and the configured model is available."
    });
  }
});

server.listen(port, host, () => {
  const localUrl = `http://localhost:${port}`;
  const boundUrl = host === "0.0.0.0" ? `http://<server-ip>:${port}` : `http://${host}:${port}`;

  console.log(`SMS classifier listening on ${localUrl}`);
  console.log(`Network access available at ${boundUrl}`);

  if (process.env.OLLAMA_PRELOAD !== "false") {
    loadAiConfig()
      .then((config) => {
        if (config.provider !== "ollama") {
          console.log(`Active AI provider is ${config.provider}; Ollama preload skipped.`);
          return undefined;
        }

        const client = createProviderClient(config.provider, config.providers.ollama);
        return client
          .preload({ timeoutMs: Number(process.env.OLLAMA_PRELOAD_TIMEOUT_MS ?? 120000) })
          .then(() => client);
      })
      .then((client) => {
        if (client) {
          console.log(`Preloaded Ollama model ${client.model}.`);
        }
      })
      .catch((error) => {
        console.warn(`AI preload skipped: ${error.message}`);
      });
  }
});
