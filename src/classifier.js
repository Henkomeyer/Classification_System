import { categoryIds, getCategory, loadCategories } from "./categories.js";
import { classifyWithRules } from "./heuristics.js";
import { createProviderClient, loadAiConfig, normalizeProvider } from "./aiSettings.js";

function categoryPromptBlock(categories) {
  return categories
    .map((category) => {
      const examples = category.examples.slice(0, 3).map((example) => `"${example}"`).join(", ");
      return `${category.code}: ${category.label} - ${category.description}${examples ? ` Examples: ${examples}` : ""}`;
    })
    .join("\n");
}

function genericCategoryCode(categories) {
  return getCategory(categories, "unknown")?.code ?? categories.at(-1)?.code ?? "10";
}

function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findCategoryCandidate(categories, value) {
  const raw = String(value ?? "").trim();
  const normalized = normalizeToken(raw);

  return categories.find(
    (category) =>
      category.code === raw ||
      category.id === raw ||
      normalizeToken(category.id) === normalized ||
      normalizeToken(category.label) === normalized
  );
}

function buildMessages(text, sentText = "", categories) {
  const sentContext = String(sentText ?? "").trim();
  const replyContext = String(text ?? "").trim();
  const validCodes = categories.map((category) => category.code).join(", ");

  return [
    {
      role: "system",
      content: [
        "Debt collection SMS triage.",
        "Classify only the debtor reply. The sent SMS is background context.",
        `Return only one valid JSON string containing a category ID: ${validCodes}.`,
        'Valid output example: "1"',
        "Do not return an object, explanation, label, confidence, or extra text.",
        `If unclear, return "${genericCategoryCode(categories)}".`,
        "Do not infer payment, hardship, legal risk, or identity denial unless the reply explicitly says it.",
        "",
        "Categories:",
        categoryPromptBlock(categories)
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        sent_sms: sentContext || null,
        reply_sms: replyContext
      })
    }
  ];
}

function parseOllamaClassification(content, categories) {
  const raw = String(content ?? "").trim();
  let value = raw;

  try {
    const parsed = JSON.parse(raw);
    value =
      typeof parsed === "object" && parsed !== null
        ? parsed.classification_id ?? parsed.category_id ?? parsed.code ?? parsed.category ?? parsed.id ?? ""
        : parsed;
  } catch {
    const validCodes = categories
      .map((category) => category.code)
      .sort((left, right) => right.length - left.length)
      .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const match = raw.match(new RegExp(`(^|\\D)(${validCodes.join("|")})(\\D|$)`));

    if (match) {
      value = match[2];
    }
  }

  const cleaned = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  const directCategory = findCategoryCandidate(categories, cleaned);

  if (directCategory) {
    return directCategory.code;
  }

  const rawToken = normalizeToken(raw);
  const mentionedCategory = categories.find((category) => {
    const labelToken = normalizeToken(category.label);
    const idToken = normalizeToken(category.id);
    return (
      (labelToken && rawToken.includes(labelToken)) ||
      (idToken && rawToken.includes(idToken))
    );
  });

  return mentionedCategory?.code ?? cleaned;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(1, number));
}

function attachNextStep(result, categories) {
  const category = getCategory(categories, result.category) ?? getCategory(categories, result.classification_id) ?? getCategory(categories, "unknown");

  return {
    category: category.id,
    classification_id: category.code,
    label: category.label,
    color: category.color,
    confidence: clampConfidence(result.confidence),
    next_step: category.next_step,
    reason: String(result.reason ?? "No reason supplied.").trim(),
    source: result.source ?? "ollama"
  };
}

export async function classifySms(text, options = {}) {
  const normalizedText = String(text ?? "").trim();
  const sentText = String(options.sentText ?? "").trim();
  const categories = options.categories ?? (await loadCategories());
  const ruleResult = classifyWithRules(normalizedText);

  if (ruleResult && getCategory(categories, ruleResult.category)) {
    return attachNextStep(ruleResult, categories);
  }

  const aiConfig = options.ai ?? (options.client ? undefined : await loadAiConfig());
  const provider = normalizeProvider(options.provider ?? aiConfig?.provider ?? "ollama");
  const providerConfig = options.ollama ?? options.providerConfig ?? aiConfig?.providers?.[provider];
  const client = options.client ?? createProviderClient(provider, providerConfig);
  const content = await client.chat(buildMessages(normalizedText, sentText, categories), {
    temperature: options.temperature ?? 0,
    timeoutMs: options.timeoutMs ?? 60000
  });
  const classificationId = parseOllamaClassification(content, categories);
  const validCategoryIds = new Set(categoryIds(categories));
  const parsedCategory = getCategory(categories, classificationId);
  const category = parsedCategory && validCategoryIds.has(parsedCategory.id) ? parsedCategory.id : "unknown";

  return attachNextStep({
    category,
    classification_id: classificationId,
    confidence: parsedCategory ? 0.82 : 0.4,
    reason: parsedCategory
      ? `Selected configured classification ID ${parsedCategory.code}.`
      : "The model did not return a valid configured classification ID.",
    source: provider
  }, categories);
}

export async function listCategories() {
  return loadCategories();
}
