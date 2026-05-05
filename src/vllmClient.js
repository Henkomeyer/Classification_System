export const DEFAULT_VLLM_HOST = "http://localhost:8000";
export const DEFAULT_VLLM_MODEL = "";

export function normalizeVllmHost(value = DEFAULT_VLLM_HOST) {
  let host = String(value ?? "").trim() || DEFAULT_VLLM_HOST;

  if (!/^https?:\/\//i.test(host)) {
    host = `http://${host}`;
  }

  return host.replace(/\/+$/, "");
}

function buildHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  const key = String(apiKey ?? "").trim();

  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

export class VllmClient {
  constructor({
    host = process.env.VLLM_HOST ?? DEFAULT_VLLM_HOST,
    model = process.env.VLLM_MODEL ?? DEFAULT_VLLM_MODEL,
    apiKey = process.env.VLLM_API_KEY ?? ""
  } = {}) {
    this.host = normalizeVllmHost(host);
    this.model = String(model ?? "").trim();
    this.apiKey = String(apiKey ?? "").trim();
  }

  async checkReachable({ timeoutMs = 5000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/health`, {
        method: "GET",
        headers: buildHeaders(this.apiKey),
        signal: controller.signal
      });

      if (response.ok) {
        return {
          reachable: true,
          version: ""
        };
      }

      if (response.status !== 404) {
        const body = await response.text();
        throw new Error(`VLLM URL responded with ${response.status}: ${body || response.statusText}`);
      }

      return this.checkModelsEndpointReachable({ timeoutMs });
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkModelsEndpointReachable({ timeoutMs = 5000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/v1/models`, {
        method: "GET",
        headers: buildHeaders(this.apiKey),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`VLLM model endpoint responded with ${response.status}: ${body || response.statusText}`);
      }

      return {
        reachable: true,
        version: ""
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels({ timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/v1/models`, {
        method: "GET",
        headers: buildHeaders(this.apiKey),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`VLLM model lookup failed with ${response.status}: ${body}`);
      }

      const payload = await response.json();
      return (payload.data ?? [])
        .map((model) => ({
          name: model.id ?? model.name,
          modified_at: model.created ? new Date(model.created * 1000).toISOString() : undefined,
          size: undefined,
          digest: undefined,
          details: {
            owned_by: model.owned_by,
            object: model.object
          }
        }))
        .filter((model) => model.name);
    } finally {
      clearTimeout(timeout);
    }
  }

  async chat(messages, { temperature = 0, timeoutMs = 60000 } = {}) {
    if (!this.model) {
      throw new Error("No VLLM model is selected.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.host}/v1/chat/completions`, {
        method: "POST",
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens: 12,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`VLLM request failed with ${response.status}: ${body}`);
      }

      const payload = await response.json();
      return payload.choices?.[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }
}
