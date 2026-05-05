import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDirectory = path.join(rootDirectory, "data");
const categoriesPath = path.join(dataDirectory, "categories.json");
const fallbackColors = ["#ef3f49", "#687f91", "#2f8b62", "#bd7632", "#7a5cff", "#2196a3"];

export const defaultCategories = [
  {
    id: "call_management",
    code: "1",
    color: "#ef3f49",
    label: "Call Management",
    next_step: "Queue a voice-contact task and preserve any requested callback time.",
    description: "The debtor is busy, asks for a call, asks you to call later, or says they will call you.",
    examples: ["call me after 5", "I am busy now", "I will call you later", "please phone me tomorrow"]
  },
  {
    id: "payment_commitment",
    code: "2",
    color: "#2f8b62",
    label: "Payment Commitment",
    next_step: "Track the promised or confirmed payment and reconcile against incoming funds.",
    description: "The debtor confirms payment was made or gives a specific payment date, amount, or promise to pay.",
    examples: ["I paid this morning", "I will pay R500 on Friday", "payment done", "I can pay on the 25th"]
  },
  {
    id: "information_logistics",
    code: "3",
    color: "#2196a3",
    label: "Information Logistics",
    next_step: "Send the requested payment information, statement, balance, or account reference.",
    description: "The debtor wants to pay or engage but needs EFT details, banking info, balance, statement, reference, or account details.",
    examples: ["send banking details", "what is my balance", "please send a statement", "what reference must I use"]
  },
  {
    id: "identity_error",
    code: "4",
    color: "#687f91",
    label: "Identity Error",
    next_step: "Flag the contact record for data cleansing and stop person-specific follow-up.",
    description: "The debtor explicitly denies being the person you are looking for or says this is a wrong number.",
    examples: ["wrong number", "I am not Thabo", "you have the wrong person", "no one by that name here"]
  },
  {
    id: "email_pivot",
    code: "5",
    color: "#7a5cff",
    label: "Email Pivot",
    next_step: "Move the conversation or requested documents to the provided email channel.",
    description: "The debtor provides an email address or asks that communication, documents, or statements be sent by email.",
    examples: ["email me at john@example.com", "send it to my email", "please communicate by email", "mail me the documents"]
  },
  {
    id: "legal_risk_hostility",
    code: "6",
    color: "#cf3039",
    label: "Legal Risk & Hostility",
    next_step: "Escalate for compliance or supervisor review before further contact.",
    description: "The debtor is aggressive, uses profanity, mentions harassment, reporting, lawyers, legal action, or says to sue them.",
    examples: ["stop harassing me", "I will report you", "speak to my lawyer", "sue me"]
  },
  {
    id: "general_identity_inquiry",
    code: "7",
    color: "#bd7632",
    label: "General Identity Inquiry",
    next_step: "Respond with debt origin, account context, and verification-safe information.",
    description: "The debtor is confused and asks who is contacting them, what the account is for, or whether this is a scam.",
    examples: ["who is this", "what is this for", "is this a scam", "which account are you talking about"]
  },
  {
    id: "financial_hardship",
    code: "8",
    color: "#bd7632",
    label: "Financial Hardship",
    next_step: "Route to the hardship or vulnerability workflow for a suitable arrangement.",
    description: "The debtor wants to pay or acknowledges the debt but cannot due to unemployment, illness, bankruptcy, no income, or serious financial difficulty.",
    examples: ["I lost my job", "I want to pay but I have no income", "I am bankrupt", "I am sick and cannot afford it"]
  },
  {
    id: "compliance_opt_out",
    code: "9",
    color: "#cf3039",
    label: "Compliance Opt-Out",
    next_step: "Record the opt-out request and suppress future SMS contact where legally required.",
    description: "The debtor sends STOP, UNSUBSCRIBE, REMOVE ME, or another clear SMS opt-out command.",
    examples: ["STOP", "unsubscribe", "remove me", "do not SMS me again"]
  },
  {
    id: "unknown",
    code: "10",
    color: "#687f91",
    label: "Generic / Ignore",
    next_step: "Archive or leave for low-priority review unless more context is available.",
    description: "The reply is low-value, neutral, unclear, incomplete, gibberish, or does not require a business action.",
    examples: ["ok", "thanks", "yes", "asdfgh"]
  }
];

function slugify(value, fallback) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || fallback;
}

function normalizeExamples(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeColor(value, index) {
  const color = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }

  return fallbackColors[index % fallbackColors.length];
}

export function normalizeCategories(categories) {
  if (!Array.isArray(categories)) {
    throw new Error("Categories must be an array.");
  }

  const seenIds = new Set();
  const seenCodes = new Set();
  const normalized = categories.map((category, index) => {
    const label = String(category.label ?? category.id ?? `Category ${index + 1}`).trim();
    const id = slugify(category.id ?? label, `category_${index + 1}`);
    const code = String(category.code ?? index + 1).trim();

    if (!label) {
      throw new Error("Every category needs a label.");
    }

    if (!code) {
      throw new Error(`Category '${label}' needs a code.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate category id '${id}'.`);
    }

    if (seenCodes.has(code)) {
      throw new Error(`Duplicate category code '${code}'.`);
    }

    seenIds.add(id);
    seenCodes.add(code);

    return {
      id,
      code,
      color: normalizeColor(category.color, index),
      label,
      next_step: String(category.next_step ?? "").trim(),
      description: String(category.description ?? "").trim(),
      examples: normalizeExamples(category.examples)
    };
  });

  if (!normalized.some((category) => category.id === "unknown")) {
    normalized.push(defaultCategories.find((category) => category.id === "unknown"));
  }

  return normalized;
}

export async function loadCategories() {
  try {
    const content = await readFile(categoriesPath, "utf8");
    return normalizeCategories(JSON.parse(content));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return normalizeCategories(defaultCategories);
  }
}

export async function saveCategories(categories) {
  const normalized = normalizeCategories(categories);
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(categoriesPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function resetCategories() {
  return saveCategories(defaultCategories);
}

export function getCategory(categories, value) {
  return categories.find((category) => category.id === value || category.code === String(value));
}

export function categoryIds(categories) {
  return categories.map((category) => category.id);
}
