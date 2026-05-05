import test from "node:test";
import assert from "node:assert/strict";
import { classifyBatch } from "../src/batch.js";
import { defaultCategories } from "../src/categories.js";
import { classifySms } from "../src/classifier.js";
import { createProviderClient, normalizeProvider, normalizeVllmConfig } from "../src/aiSettings.js";
import { normalizeOllamaConfig, selectDetectedModel } from "../src/ollamaSettings.js";
import { normalizeServerConfig, validateServerConfig } from "../src/serverSettings.js";
import { VllmClient } from "../src/vllmClient.js";

test("classifies call back replies without calling Ollama", async () => {
  const result = await classifySms("Please call me back tomorrow", {
    categories: defaultCategories,
    client: {
      async chat() {
        throw new Error("Ollama should not be called for callback rule.");
      }
    }
  });

  assert.equal(result.category, "call_management");
  assert.equal(result.classification_id, "1");
  assert.equal(result.label, "Call Management");
  assert.equal(result.source, "rule");
  assert.match(result.next_step, /voice-contact task/i);
});

test("uses Ollama result when no high-confidence rule matches", async () => {
  const result = await classifySms("Can you explain this account?", {
    categories: defaultCategories,
    sentText: "Please contact us about your outstanding account.",
    client: {
      async chat(messages) {
        assert.equal(messages.length, 2);
        assert.match(messages[0].content, /Return only one valid JSON string/);
        assert.match(messages[1].content, /outstanding account/);
        assert.match(messages[1].content, /Can you explain this account/);
        return JSON.stringify("7");
      }
    }
  });

  assert.equal(result.category, "general_identity_inquiry");
  assert.equal(result.classification_id, "7");
  assert.equal(result.source, "ollama");
  assert.equal(result.confidence, 0.82);
  assert.match(result.next_step, /debt origin/i);
});

test("returns configurable classification codes", async () => {
  const categories = [
    {
      id: "book_callback",
      code: "25",
      label: "Book Callback",
      description: "The sender wants a callback.",
      next_step: "Book a callback.",
      examples: ["call me"]
    },
    {
      id: "unknown",
      code: "0",
      label: "Unknown",
      description: "Unclear reply.",
      next_step: "Review manually.",
      examples: []
    }
  ];

  const result = await classifySms("Please call me tomorrow", {
    categories,
    client: {
      async chat() {
        return JSON.stringify({
          category: "book_callback",
          classification_id: "25",
          confidence: 0.91,
          reason: "The sender asked for a callback."
        });
      }
    }
  });

  assert.equal(result.category, "book_callback");
  assert.equal(result.classification_id, "25");
  assert.equal(result.label, "Book Callback");
});

test("falls back to unknown when Ollama returns an unsupported category", async () => {
  const result = await classifySms("Hmm", {
    categories: defaultCategories,
    client: {
      async chat() {
        return JSON.stringify("99");
      }
    }
  });

  assert.equal(result.category, "unknown");
  assert.equal(result.classification_id, "10");
  assert.match(result.next_step, /Archive/i);
});

test("maps Ollama label output back to a configured classification ID", async () => {
  const result = await classifySms("Can you clarify this account?", {
    categories: defaultCategories,
    client: {
      async chat() {
        return JSON.stringify("General Identity Inquiry");
      }
    }
  });

  assert.equal(result.category, "general_identity_inquiry");
  assert.equal(result.classification_id, "7");
});

test("maps Ollama object label output back to a configured classification ID", async () => {
  const result = await classifySms("Please clarify", {
    categories: defaultCategories,
    client: {
      async chat() {
        return JSON.stringify({ category: "Information Logistics" });
      }
    }
  });

  assert.equal(result.category, "information_logistics");
  assert.equal(result.classification_id, "3");
});

test("maps Ollama category_id object output back to a configured classification ID", async () => {
  const result = await classifySms("Ok", {
    categories: defaultCategories,
    client: {
      async chat() {
        return JSON.stringify({ category_id: 10 });
      }
    }
  });

  assert.equal(result.category, "unknown");
  assert.equal(result.classification_id, "10");
});

test("empty replies are unknown", async () => {
  const result = await classifySms("  ", {
    categories: defaultCategories
  });

  assert.equal(result.category, "unknown");
  assert.equal(result.classification_id, "10");
  assert.equal(result.source, "rule");
});

test("classifies batches, keeps sent SMS context, and keeps row-level errors", async () => {
  const results = await classifyBatch(
    [
      {
        sentText: "Hi, can we call you today?",
        text: "Please call me"
      },
      {
        sentText: "Please confirm your appointment.",
        text: ""
      }
    ],
    {
      categories: defaultCategories,
      client: {
        async chat() {
          throw new Error("Ollama should not be called for this batch.");
        }
      }
    }
  );

  assert.equal(results.length, 2);
  assert.equal(results[0].sentText, "Hi, can we call you today?");
  assert.equal(results[0].category, "call_management");
  assert.equal(results[1].sentText, "Please confirm your appointment.");
  assert.equal(results[1].error, "SMS text is required.");
});

test("supports large CSV-sized batches", async () => {
  const messages = Array.from({ length: 1501 }, (_, index) => ({
    sentText: `Sent message ${index + 1}`,
    text: "Please call me back"
  }));

  const results = await classifyBatch(messages, {
    categories: defaultCategories,
    client: {
      async chat() {
        throw new Error("Ollama should not be called for callback rules.");
      }
    }
  });

  assert.equal(results.length, 1501);
  assert.equal(results[0].category, "call_management");
  assert.equal(results[1500].sentText, "Sent message 1501");
  assert.equal(results[1500].category, "call_management");
});

test("runs Ollama-backed rows concurrently inside a batch", async () => {
  let active = 0;
  let maxActive = 0;
  const categories = [
    {
      id: "question",
      code: "6",
      label: "Question",
      description: "The sender asks for more information.",
      next_step: "Answer the question.",
      examples: []
    },
    {
      id: "unknown",
      code: "0",
      label: "Unknown",
      description: "Unclear reply.",
      next_step: "Review manually.",
      examples: []
    }
  ];

  const results = await classifyBatch(
    [
      { text: "What does this mean?" },
      { text: "Can you explain the offer?" },
      { text: "How does it work?" },
      { text: "What are the requirements?" }
    ],
    {
      categories,
      concurrency: 3,
      client: {
        async chat() {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 30));
          active -= 1;

          return JSON.stringify("6");
        }
      }
    }
  );

  assert.equal(results.length, 4);
  assert.ok(maxActive > 1);
  assert.equal(results[0].classification_id, "6");
});

test("normalizes Ollama connection settings and selects installed models", () => {
  const config = normalizeOllamaConfig({
    host: "localhost:11434/",
    model: "mistral:latest",
    keepAlive: "10m"
  });

  assert.equal(config.host, "http://localhost:11434");
  assert.equal(config.model, "mistral:latest");
  assert.equal(config.keepAlive, "10m");
  assert.equal(selectDetectedModel([{ name: "llama3.1:8b" }, { name: "mistral:latest" }], "mistral:latest"), "mistral:latest");
  assert.equal(selectDetectedModel([{ name: "llama3.1:8b" }], "missing:model"), "llama3.1:8b");
});

test("normalizes VLLM settings and creates provider clients", () => {
  const config = normalizeVllmConfig({
    host: "localhost:8000/",
    model: "debt-triage",
    apiKey: "token"
  });

  assert.equal(config.host, "http://localhost:8000");
  assert.equal(config.model, "debt-triage");
  assert.equal(config.apiKey, "token");
  assert.equal(normalizeProvider("vllm"), "vllm");
  assert.ok(createProviderClient("vllm", config) instanceof VllmClient);
});

test("validates server bind host and port settings", () => {
  assert.deepEqual(normalizeServerConfig({ host: "", port: "bad" }), {
    host: "0.0.0.0",
    port: 3000
  });
  assert.deepEqual(validateServerConfig({ host: "192.168.1.50", port: "8080" }), {
    host: "192.168.1.50",
    port: 8080
  });
  assert.throws(() => validateServerConfig({ host: "http://localhost:3000", port: 3000 }), /only the bind IP/i);
  assert.throws(() => validateServerConfig({ host: "0.0.0.0", port: 70000 }), /between 1 and 65535/i);
});

test("VLLM client lists models and reads OpenAI-compatible chat responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });

    if (String(url).endsWith("/health")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {};
        }
      };
    }

    if (String(url).endsWith("/v1/models")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [{ id: "debt-triage", object: "model", owned_by: "local" }]
          };
        }
      };
    }

    if (String(url).endsWith("/v1/chat/completions")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify("7") } }]
          };
        }
      };
    }

    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const client = new VllmClient({
      host: "http://localhost:8000",
      model: "debt-triage",
      apiKey: "secret"
    });
    const reachable = await client.checkReachable();
    const models = await client.listModels();
    const content = await client.chat([{ role: "user", content: "Who is this?" }]);

    assert.equal(reachable.reachable, true);
    assert.equal(models[0].name, "debt-triage");
    assert.equal(content, JSON.stringify("7"));
    assert.equal(calls.at(-1).options.headers.Authorization, "Bearer secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
