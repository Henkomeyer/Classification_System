const rules = [
  {
    category: "legal_risk_hostility",
    classification_id: "6",
    confidence: 0.99,
    patterns: [
      /\bharass(?:ment|ing)?\b/i,
      /\blawyer\b/i,
      /\battorney\b/i,
      /\blegal\b/i,
      /\breport\s+(you|this|it)\b/i,
      /\bsue\s+me\b/i,
      /\bcourt\b/i,
      /\bfuck|shit|piss\s+off\b/i
    ],
    reason: "The reply contains legal risk, hostility, or escalation language."
  },
  {
    category: "compliance_opt_out",
    classification_id: "9",
    confidence: 0.99,
    patterns: [
      /^stop$/i,
      /\bunsubscribe\b/i,
      /\bremove\s+me\b/i,
      /\bdon'?t\s+(sms|message|contact)\s+me\b/i
    ],
    reason: "The sender asked to stop or be removed."
  },
  {
    category: "email_pivot",
    classification_id: "5",
    confidence: 0.98,
    patterns: [
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
      /\bemail\s+me\b/i,
      /\bsend\s+(it|this|statement|documents?)\s+to\s+my\s+email\b/i,
      /\bcommunicate\s+by\s+email\b/i
    ],
    reason: "The reply asks to move communication or documents to email."
  },
  {
    category: "identity_error",
    classification_id: "4",
    confidence: 0.98,
    patterns: [
      /\bwrong\s+number\b/i,
      /\bwrong\s+person\b/i,
      /\bi\s+am\s+not\b/i,
      /\bi'?m\s+not\b/i,
      /\bnot\s+(me|mine)\b/i,
      /\bno\s+one\s+by\s+that\s+name\b/i
    ],
    reason: "The sender says this is not the correct number or person."
  },
  {
    category: "financial_hardship",
    classification_id: "8",
    confidence: 0.96,
    patterns: [
      /\blost\s+my\s+job\b/i,
      /\bunemployed\b/i,
      /\bno\s+income\b/i,
      /\bbankrupt(?:cy)?\b/i,
      /\bcan'?t\s+(afford|pay)\b/i,
      /\bcannot\s+(afford|pay)\b/i,
      /\btoo\s+sick\s+to\s+pay\b/i
    ],
    reason: "The reply expresses financial hardship or vulnerability."
  },
  {
    category: "information_logistics",
    classification_id: "3",
    confidence: 0.95,
    patterns: [
      /\bbank(?:ing)?\s+details\b/i,
      /\beft\b/i,
      /\bbalance\b/i,
      /\bstatement\b/i,
      /\breference\s+(number|must|should|do)\b/i,
      /\baccount\s+details\b/i,
      /\bsettlement\s+amount\b/i
    ],
    reason: "The sender needs information required to pay."
  },
  {
    category: "payment_commitment",
    classification_id: "2",
    confidence: 0.95,
    patterns: [
      /\balready\s+paid\b/i,
      /\bpayment\s+(done|made|sent)\b/i,
      /\bi\s+(have\s+)?paid\b/i,
      /\bwill\s+pay\b/i,
      /\bcan\s+pay\b/i,
      /\bpay\s+(on|by|before)\b/i,
      /\br\s?\d+(\.\d{1,2})?\b/i
    ],
    reason: "The reply confirms or commits to payment."
  },
  {
    category: "call_management",
    classification_id: "1",
    confidence: 0.98,
    patterns: [
      /\bcall\s+me\b/i,
      /\bcall\s+back\b/i,
      /\bphone\s+me\b/i,
      /\bring\s+me\b/i,
      /\bwill\s+call\s+(you|u)\b/i,
      /\bi\s+am\s+busy\b/i,
      /\bi'?m\s+busy\b/i,
      /\bcan\s+.*\bcall\b/i
    ],
    reason: "The sender asked for a call."
  },
  {
    category: "general_identity_inquiry",
    classification_id: "7",
    confidence: 0.94,
    patterns: [
      /\bwho\s+is\s+this\b/i,
      /\bwhat\s+is\s+this\s+for\b/i,
      /\bis\s+this\s+a\s+scam\b/i,
      /\bwhich\s+account\b/i,
      /\bwhat\s+account\b/i
    ],
    reason: "The sender is asking who is contacting them or what the debt is for."
  },
  {
    category: "unknown",
    classification_id: "10",
    confidence: 0.9,
    patterns: [
      /^(ok|okay|k|thanks|thank you|yes|no|maybe|fine)$/i,
      /^[a-z]{4,}$/i
    ],
    reason: "The reply is generic or too low-value to route."
  }
];

export function classifyWithRules(text) {
  const normalized = String(text ?? "").trim();

  if (!normalized) {
    return {
      category: "unknown",
      classification_id: "10",
      confidence: 1,
      reason: "The SMS reply is empty.",
      source: "rule"
    };
  }

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        category: rule.category,
        classification_id: rule.classification_id,
        confidence: rule.confidence,
        reason: rule.reason,
        source: "rule"
      };
    }
  }

  return null;
}
