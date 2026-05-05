import { classifySms } from "./classifier.js";
import { loadCategories } from "./categories.js";
import { loadAiConfig } from "./aiSettings.js";

const MAX_BATCH_SIZE = 5000;
const DEFAULT_CLASSIFY_CONCURRENCY = 4;

function resolveConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    return DEFAULT_CLASSIFY_CONCURRENCY;
  }

  return Math.max(1, Math.floor(number));
}

function buildRowError(index, message, error) {
  const text = typeof message === "string" ? message : message?.text;
  const id = typeof message === "object" && message !== null ? message.id : undefined;
  const sentText = typeof message === "object" && message !== null ? message.sentText : undefined;

  return {
    index,
    id,
    sentText: sentText ?? "",
    text: text ?? "",
    error
  };
}

async function classifyOne(index, message, options, categories) {
  const text = typeof message === "string" ? message : message?.text;
  const id = typeof message === "object" && message !== null ? message.id : undefined;
  const sentText = typeof message === "object" && message !== null ? message.sentText : undefined;

  if (typeof text !== "string" || !text.trim()) {
    return buildRowError(index, message, "SMS text is required.");
  }

  try {
    const classification = await classifySms(text, {
      ...options,
      categories,
      sentText
    });
    return {
      index,
      id,
      sentText: sentText ?? "",
      text,
      ...classification
    };
  } catch (error) {
    return buildRowError(index, message, error.message);
  }
}

export async function classifyBatch(messages, options = {}) {
  if (!Array.isArray(messages)) {
    throw new Error("Expected 'messages' to be an array.");
  }

  if (messages.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size is limited to ${MAX_BATCH_SIZE} messages.`);
  }

  const categories = options.categories ?? (await loadCategories());
  const ai = options.ai ?? (options.client ? undefined : await loadAiConfig());
  const results = Array(messages.length);
  const concurrency = Math.min(
    messages.length || 1,
    resolveConcurrency(options.concurrency ?? process.env.OLLAMA_CLASSIFY_CONCURRENCY)
  );
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < messages.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await classifyOne(index, messages[index], { ...options, ai }, categories);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
