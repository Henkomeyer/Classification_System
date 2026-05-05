export const DEFAULT_HOST = "http://localhost:11434";
export const DEFAULT_MODEL = "llama3.1:8b";
export const DEFAULT_KEEP_ALIVE = "30m";

export function normalizeOllamaHost(value = DEFAULT_HOST) {
  let host = String(value ?? "").trim() || DEFAULT_HOST;

  if (!/^https?:\/\//i.test(host)) {
    host = `http://${host}`;
  }

  return host.replace(/\/+$/, "");
}

export class OllamaClient {
  constructor({
    host = process.env.OLLAMA_HOST ?? DEFAULT_HOST,
    model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
    keepAlive = process.env.OLLAMA_KEEP_ALIVE ?? DEFAULT_KEEP_ALIVE
  } = {}) {
    this.host = normalizeOllamaHost(host);
    this.model = model;
    this.keepAlive = keepAlive;
  }

  async checkReachable({ timeoutMs = 5000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/api/version`, {
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama URL responded with ${response.status}: ${body || response.statusText}`);
      }

      const payload = await response.json();
      return {
        reachable: true,
        version: payload.version ?? ""
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels({ timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/api/tags`, {
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama model lookup failed with ${response.status}: ${body}`);
      }

      const payload = await response.json();
      return (payload.models ?? [])
        .map((model) => ({
          name: model.name ?? model.model,
          modified_at: model.modified_at,
          size: model.size,
          digest: model.digest,
          details: model.details ?? {}
        }))
        .filter((model) => model.name);
    } finally {
      clearTimeout(timeout);
    }
  }

  async chat(messages, { temperature = 0, timeoutMs = 60000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          format: "json",
          keep_alive: this.keepAlive,
          options: {
            temperature
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama request failed with ${response.status}: ${body}`);
      }

      const payload = await response.json();
      return payload.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  async preload({ timeoutMs = 60000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [],
          keep_alive: this.keepAlive,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama preload failed with ${response.status}: ${body}`);
      }

      await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
