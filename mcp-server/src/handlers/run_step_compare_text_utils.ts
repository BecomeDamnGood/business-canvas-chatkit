import type { CanvasState } from "../core/state.js";
import { isValidStepValueForStorage, looksLikeExamplesFramingLine } from "./run_step_value_shape.js";

type CompareMode = "text" | "list";

export function normalizeLightUserInput(input: string): string {
  const collapsed = String(input || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return "";
  const normalized = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

export function normalizeListUserInput(input: string): string {
  const raw = String(input || "").replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return normalizeLightUserInput(raw);
  return lines.map((line) => normalizeLightUserInput(line)).join("\n");
}

function normalizeSurfaceSignature(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeWords(input: string): string[] {
  const normalized = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  const s = String(a || "");
  const t = String(b || "");
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row: number[] = Array.from({ length: n + 1 }, (_, idx) => idx);
  for (let i = 1; i <= m; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = row[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[n];
}

function tokenJaccardSimilarity(a: string, b: string): number {
  const left = new Set(tokenizeWords(a));
  const right = new Set(tokenizeWords(b));
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isSpellingOnlyCorrection(userRaw: string, suggestionRaw: string): boolean {
  const user = normalizeLightUserInput(userRaw);
  const suggestion = normalizeLightUserInput(suggestionRaw);
  if (!user || !suggestion) return false;
  if (/[{}]/.test(userRaw) || /[{}]/.test(suggestionRaw)) return false;

  const normalizedUser = normalizeSurfaceSignature(user);
  const normalizedSuggestion = normalizeSurfaceSignature(suggestion);
  if (!normalizedUser || !normalizedSuggestion) return false;
  if (normalizedUser === normalizedSuggestion) return true;

  const userTokens = tokenizeWords(normalizedUser);
  const suggestionTokens = tokenizeWords(normalizedSuggestion);
  if (userTokens.length === 0 || suggestionTokens.length === 0) return false;
  if (userTokens.length !== suggestionTokens.length) return false;

  let changedCount = 0;
  for (let i = 0; i < userTokens.length; i += 1) {
    const left = String(userTokens[i] || "");
    const right = String(suggestionTokens[i] || "");
    if (!left || !right) return false;
    if (left === right) continue;
    if (/^\d+$/.test(left) || /^\d+$/.test(right)) return false;
    if (left.length <= 1 || right.length <= 1) return false;
    if ((left.length <= 3 || right.length <= 3) && left.charAt(0) !== right.charAt(0)) return false;
    const distance = levenshteinDistance(left, right);
    const shortest = Math.min(left.length, right.length);
    const allowedDistance = shortest <= 3 ? 1 : Math.max(1, Math.floor(shortest / 5));
    if (distance > allowedDistance) return false;
    changedCount += 1;
  }

  if (changedCount === 0) return true;
  const maxChangedTokens = Math.max(1, Math.ceil(userTokens.length * 0.25));
  return changedCount <= maxChangedTokens;
}

export function isMaterialRewriteCandidate(userRaw: string, suggestionRaw: string): boolean {
  const user = normalizeLightUserInput(userRaw);
  const suggestion = normalizeLightUserInput(suggestionRaw);
  if (!user || !suggestion) return false;
  if (isSpellingOnlyCorrection(user, suggestion)) return false;
  return true;
}

export function normalizeUserInputAgainstSuggestion(userRaw: string, suggestionRaw: string): string {
  const user = normalizeLightUserInput(userRaw);
  if (!user) return "";
  const suggestion = normalizeLightUserInput(suggestionRaw);
  if (!suggestion) return user;
  if (isSpellingOnlyCorrection(userRaw, suggestionRaw)) return suggestion;
  return user;
}

function extractSuggestionFromMessage(message: string): string {
  const raw = String(message || "").trim();
  if (!raw) return "";
  const blocked = [
    /^you are in the\b/i,
    /^we have not yet defined\b/i,
    /^define your\b/i,
    /^refine your\b/i,
    /^choose an option\b/i,
    /^please click what suits you best\b/i,
    /^for more information\b/i,
  ];
  const genericAcknowledgements = [
    /^i think i understand\b/i,
    /^i understand\b/i,
    /^thank you for sharing\b/i,
    /^thanks for sharing\b/i,
    /^that'?s a strong\b/i,
    /^great (point|start|insight)\b/i,
    /^good (point|start|insight)\b/i,
  ];

  const paragraphs = raw
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
    const paragraph = paragraphs[i];
    if (blocked.some((re) => re.test(paragraph))) continue;
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let j = sentences.length - 1; j >= 0; j -= 1) {
      const sentence = sentences[j];
      if (blocked.some((re) => re.test(sentence))) continue;
      if (genericAcknowledgements.some((re) => re.test(sentence))) continue;
      if (/off-?topic/i.test(sentence)) continue;
      if (/choose an option/i.test(sentence)) continue;
      if (sentence.length < 18) continue;
      return sentence;
    }
    if (genericAcknowledgements.some((re) => re.test(paragraph))) continue;
    if (paragraph.length >= 18) return paragraph;
  }
  return "";
}

function extractDreamSuggestionSentences(params: {
  message: string;
  companyName: string;
}): string[] {
  const raw = String(params.message || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const companyName = String(params.companyName || "").trim();
  const companyKey = companyName.toLowerCase();
  const blocked = [
    /\bi hope\b/i,
    /\bthese suggestions\b/i,
    /\binspire you\b/i,
    /\bwrite your own dream\b/i,
    /\bchoose an option\b/i,
    /\bdefine your dream\b/i,
  ];
  const fragments = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+(?=\S)/)
        .map((part) => String(part || "").trim())
        .filter(Boolean)
    );
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments) {
    const sentence = fragment.replace(/\s+/g, " ").trim();
    if (!sentence || sentence.length < 30) continue;
    if (sentence.endsWith("?")) continue;
    if (blocked.some((re) => re.test(sentence))) continue;
    if (looksLikeExamplesFramingLine(sentence)) continue;
    const key = canonicalizeComparableText(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(sentence);
  }
  const scored = unique
    .map((sentence, idx) => {
      let score = 0;
      const lower = sentence.toLowerCase();
      if (companyKey && companyName !== "TBD" && lower.includes(companyKey)) score += 10;
      if (/\bdreams?\b.{0,24}\bworld\b/i.test(sentence)) score += 6;
      if (/^(my future company)\b/i.test(lower)) score += 3;
      return { sentence, idx, score };
    })
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return scored.map((item) => item.sentence);
}

function extractRoleSuggestionSentences(params: {
  message: string;
  companyName: string;
  ensureSentenceEnd: (value: string) => string;
}): string[] {
  const raw = String(params.message || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const companyName = String(params.companyName || "").trim();
  const companyKey = companyName.toLowerCase();
  const blocked = [
    /\bhere are\b.{0,32}\brole\b.{0,32}\bexamples?\b/i,
    /\bdo any of these roles resonate\b/i,
    /\bchoose one for me\b/i,
    /\bdefine your role\b/i,
    /\bor choose an option\b/i,
    /\bplease click\b/i,
  ];
  const lines = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const fragments: string[] = [];
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*(?:[-*•]|\d+[\).])\s*(.+)\s*$/);
    if (bulletMatch) {
      fragments.push(String(bulletMatch[1] || "").trim());
      continue;
    }
    const parts = line
      .split(/(?<=[.!?])\s+(?=\S)/)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    fragments.push(...parts);
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments) {
    const sentence = fragment.replace(/\s+/g, " ").trim();
    if (!sentence || sentence.length < 24) continue;
    if (sentence.endsWith("?")) continue;
    if (blocked.some((re) => re.test(sentence))) continue;
    if (looksLikeExamplesFramingLine(sentence)) continue;
    const key = canonicalizeComparableText(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(sentence);
  }
  const scored = unique
    .map((sentence, idx) => {
      let score = 0;
      const lower = sentence.toLowerCase();
      if (companyKey && companyName !== "TBD" && lower.includes(companyKey)) score += 10;
      if (/\bso that\b/i.test(sentence)) score += 4;
      if (/^(my future company)\b/i.test(lower)) score += 2;
      return { sentence, idx, score };
    })
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .map((item) => params.ensureSentenceEnd(item.sentence));
  return scored;
}

function extractBigWhySuggestionSentences(params: {
  message: string;
  ensureSentenceEnd: (value: string) => string;
}): string[] {
  const raw = String(params.message || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const blocked = [
    /\bhere are\b.{0,32}\bbig\s*why\b.{0,32}\bexamples?\b/i,
    /\bhere are\b.{0,32}\bbig\s*why\b.{0,32}\bsuggestions?\b/i,
    /\bi hope\b/i,
    /\bthese suggestions\b/i,
    /\binspire you\b/i,
    /\bwrite your own big why\b/i,
    /\bchoose one for me\b/i,
  ];
  const lines = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const fragments: string[] = [];
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*(?:[-*•]|\d+[\).])\s*(.+)\s*$/);
    if (bulletMatch) {
      fragments.push(String(bulletMatch[1] || "").trim());
      continue;
    }
    const parts = line
      .split(/(?<=[.!?])\s+(?=\S)/)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    fragments.push(...parts);
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments) {
    const sentence = fragment.replace(/\s+/g, " ").trim();
    if (!sentence || sentence.length < 24) continue;
    if (sentence.endsWith("?")) continue;
    if (blocked.some((re) => re.test(sentence))) continue;
    if (looksLikeExamplesFramingLine(sentence)) continue;
    if (tokenizeWords(sentence).length > 28) continue;
    const key = canonicalizeComparableText(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(sentence);
  }
  return unique.map((sentence) => params.ensureSentenceEnd(sentence));
}

function extractEntitySuggestionPhrases(params: {
  message: string;
  normalizeEntityPhrase: (value: string) => string;
}): string[] {
  const raw = String(params.message || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const blocked = [
    /\bhere are\b.{0,32}\bentity\b.{0,32}\bexamples?\b/i,
    /\bhere are\b.{0,32}\bentity\b.{0,32}\bsuggestions?\b/i,
    /\bi hope\b/i,
    /\bthese suggestions\b/i,
    /\binspire you\b/i,
    /\bwrite your own entity\b/i,
    /\bchoose one for me\b/i,
  ];
  const lines = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*(?:[-*•]|\d+[\).])\s*(.+)\s*$/);
    const candidateRaw = bulletMatch ? String(bulletMatch[1] || "").trim() : line;
    if (!candidateRaw) continue;
    if (blocked.some((re) => re.test(candidateRaw))) continue;
    if (looksLikeExamplesFramingLine(candidateRaw)) continue;
    const candidate = params.normalizeEntityPhrase(candidateRaw);
    if (!candidate) continue;
    const words = tokenizeWords(candidate);
    if (words.length < 2 || words.length > 8) continue;
    if (/[!?]/.test(candidate)) continue;
    const key = canonicalizeComparableText(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

export function parseListItems(input: string): string[] {
  const raw = String(input || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const normalizeListToken = (line: string): string =>
    String(line || "")
      .replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  const dedupe = (items: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const clean = normalizeListToken(item);
      if (!clean) continue;
      const key = canonicalizeComparableText(clean);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  };
  const lines = raw
    .split("\n")
    .map((line) => normalizeListToken(line))
    .filter(Boolean);
  if (lines.length >= 2) return dedupe(lines);
  const parts = raw
    .split(/[;\n]+/)
    .map((line) => normalizeListToken(line))
    .filter(Boolean);
  if (parts.length >= 2) return dedupe(parts);

  const punctuated = raw
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((line) => normalizeListToken(line))
    .filter(Boolean);
  if (punctuated.length >= 2) return dedupe(punctuated);

  const compact = normalizeListToken(raw).replace(/[.!?]+$/g, "").trim();
  if (!compact) return [];
  const words = compact.split(/\s+/).filter(Boolean);
  if (words.length < 9) return [compact];
  const normalizeWordToken = (token: string): string =>
    String(token || "")
      .replace(/^[("'\[]+|[)"'\],.;:!?]+$/g, "")
      .trim();
  const starterAllowList = new Set([
    "we",
    "wij",
    "ik",
    "i",
    "our",
    "ours",
    "my",
    "ons",
    "onze",
  ]);
  const firstToken = normalizeWordToken(words[0] || "").toLowerCase();
  if (firstToken) {
    const sameTokenIndexes: number[] = [];
    for (let i = 0; i < words.length; i += 1) {
      const token = normalizeWordToken(words[i] || "").toLowerCase();
      if (token && token === firstToken) sameTokenIndexes.push(i);
    }
    const repeatedStarterLikelyList =
      sameTokenIndexes.length >= 2 &&
      (starterAllowList.has(firstToken) || sameTokenIndexes.length >= 3);
    if (repeatedStarterLikelyList) {
      const splitIdxs: number[] = [];
      let lastSplit = 0;
      for (const idx of sameTokenIndexes) {
        if (idx <= 0) continue;
        const leftCount = idx - lastSplit;
        const rightCount = words.length - idx;
        if (leftCount < 3 || rightCount < 3) continue;
        splitIdxs.push(idx);
        lastSplit = idx;
      }
      if (splitIdxs.length > 0) {
        const segments: string[] = [];
        let start = 0;
        for (const idx of splitIdxs) {
          const segment = words.slice(start, idx).join(" ").trim();
          if (segment) segments.push(segment);
          start = idx;
        }
        const tail = words.slice(start).join(" ").trim();
        if (tail) segments.push(tail);
        const normalizedSegments = dedupe(
          segments
            .map((line) => line.replace(/[.!?]+$/g, "").trim())
            .filter((line) => line.split(/\s+/).filter(Boolean).length >= 3)
        );
        if (normalizedSegments.length >= 2) return normalizedSegments;
      }
    }
  }
  const actionCue = /^(always|focus|prioritize|deliver|build|invest|maintain|offer|provide|develop|strengthen|target|focussen|altijd|prioriteit|leveren|bouwen|investeren|aanbieden|ontwikkelen|overpresteren|richten|kiezen|werken|samenwerken|concentreren)$/i;
  const breakIdxs: number[] = [];
  let lastBreak = 0;
  for (let i = 1; i < words.length; i += 1) {
    const token = String(words[i] || "");
    const startsWithCapital = /^[A-ZÀ-ÖØ-Ý]/.test(token);
    if (!startsWithCapital) continue;
    const lowerToken = token.toLowerCase();
    const leftCount = i - lastBreak;
    const rightCount = words.length - i;
    if (leftCount < 4 || rightCount < 4) continue;
    if (actionCue.test(lowerToken) || (leftCount >= 7 && rightCount >= 7)) {
      breakIdxs.push(i);
      lastBreak = i;
    }
  }
  if (breakIdxs.length === 0) return [compact];
  const segments: string[] = [];
  let start = 0;
  for (const idx of breakIdxs) {
    const segment = words.slice(start, idx).join(" ").trim();
    if (segment) segments.push(segment);
    start = idx;
  }
  const tail = words.slice(start).join(" ").trim();
  if (tail) segments.push(tail);
  const normalizedSegments = dedupe(
    segments
      .map((line) => line.replace(/[.!?]+$/g, "").trim())
      .filter((line) => line.split(/\s+/).filter(Boolean).length >= 3)
  );
  if (normalizedSegments.length >= 2) return normalizedSegments;
  return [compact];
}

export function splitSentenceItems(input: string): string[] {
  const raw = String(input || "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .trim();
  if (!raw) return [];
  const items = raw
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return items.length >= 2 ? items : [];
}

export function canonicalizeComparableText(input: string): string {
  return normalizeSurfaceSignature(normalizeLightUserInput(input));
}

export function areEquivalentCompareVariants(params: {
  mode: CompareMode;
  userRaw: string;
  suggestionRaw: string;
  userItems: string[];
  suggestionItems: string[];
}): boolean {
  const { mode, userRaw, suggestionRaw, userItems, suggestionItems } = params;
  if (mode === "list") {
    const userCanonicalItems = userItems
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    const suggestionCanonicalItems = suggestionItems
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    if (userCanonicalItems.length > 0 || suggestionCanonicalItems.length > 0) {
      if (userCanonicalItems.length !== suggestionCanonicalItems.length) return false;
      return userCanonicalItems.every((line, idx) => {
        if (line === suggestionCanonicalItems[idx]) return true;
        const userItem = String(userItems[idx] || "");
        const suggestionItem = String(suggestionItems[idx] || "");
        return isSpellingOnlyCorrection(userItem, suggestionItem);
      });
    }
  }
  const userCanonical = canonicalizeComparableText(userRaw);
  const suggestionCanonical = canonicalizeComparableText(suggestionRaw);
  if (Boolean(userCanonical) && userCanonical === suggestionCanonical) return true;
  return isSpellingOnlyCorrection(userRaw, suggestionRaw);
}

type RunStepCompareSuggestionDeps = {
  entityStepId: string;
  dreamStepId: string;
  bigwhyStepId: string;
  roleStepId: string;
  fieldForStep: (stepId: string) => string;
  normalizeEntityPhrase: (value: string) => string;
  ensureSentenceEnd: (value: string) => string;
};

export function createRunStepCompareSuggestionHelpers(deps: RunStepCompareSuggestionDeps) {
  function pickDreamSuggestionFromPreviousState(
    state: CanvasState,
    previousSpecialist: Record<string, unknown>
  ): string {
    const previous = previousSpecialist && typeof previousSpecialist === "object"
      ? previousSpecialist
      : {};
    const businessName = String((state as any).business_name || "").trim();
    const fromMessage = extractDreamSuggestionSentences({
      message: String((previous as any).message || ""),
      companyName: businessName,
    });
    for (const candidate of fromMessage) {
      const cleaned = String(candidate || "").trim();
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.dreamStepId, cleaned)) continue;
      return cleaned;
    }
    const statementLines = Array.isArray((previous as any).statements)
      ? ((previous as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    if (statementLines.length > 0) return statementLines[0];
    const fromFields = [
      String((previous as any).dream || "").trim(),
      String((previous as any).refined_formulation || "").trim(),
      String((((state as any).provisional_by_step || {})[deps.dreamStepId] || "")).trim(),
      String((state as any).dream_final || "").trim(),
    ].filter(Boolean);
    for (const candidate of fromFields) {
      const cleaned = String(candidate || "").trim();
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.dreamStepId, cleaned)) continue;
      return cleaned;
    }
    return "";
  }

  function pickRoleSuggestionFromPreviousState(
    state: CanvasState,
    previousSpecialist: Record<string, unknown>
  ): string {
    const previous = previousSpecialist && typeof previousSpecialist === "object"
      ? previousSpecialist
      : {};
    const businessName = String((state as any).business_name || "").trim();
    const fromMessage = extractRoleSuggestionSentences({
      message: String((previous as any).message || ""),
      companyName: businessName,
      ensureSentenceEnd: deps.ensureSentenceEnd,
    });
    for (const candidate of fromMessage) {
      const cleaned = String(candidate || "").trim();
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.roleStepId, cleaned)) continue;
      return cleaned;
    }
    const fromFields = [
      String((previous as any).role || "").trim(),
      String((previous as any).refined_formulation || "").trim(),
      String((((state as any).provisional_by_step || {})[deps.roleStepId] || "")).trim(),
      String((state as any).role_final || "").trim(),
    ].filter(Boolean);
    for (const candidate of fromFields) {
      const cleaned = deps.ensureSentenceEnd(candidate);
      if (!isValidStepValueForStorage(deps.roleStepId, cleaned)) continue;
      const words = tokenizeWords(cleaned);
      if (words.length >= 5 && !cleaned.endsWith("?")) return cleaned;
    }
    return "";
  }

  function pickBigWhySuggestionFromPreviousState(
    state: CanvasState,
    previousSpecialist: Record<string, unknown>
  ): string {
    const previous = previousSpecialist && typeof previousSpecialist === "object"
      ? previousSpecialist
      : {};
    const fromMessage = extractBigWhySuggestionSentences({
      message: String((previous as any).message || ""),
      ensureSentenceEnd: deps.ensureSentenceEnd,
    });
    for (const candidate of fromMessage) {
      const cleaned = String(candidate || "").trim();
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.bigwhyStepId, cleaned)) continue;
      return cleaned;
    }
    const fromFields = [
      String((previous as any).bigwhy || "").trim(),
      String((previous as any).refined_formulation || "").trim(),
      String((((state as any).provisional_by_step || {})[deps.bigwhyStepId] || "")).trim(),
      String((state as any).bigwhy_final || "").trim(),
    ].filter(Boolean);
    for (const candidate of fromFields) {
      const cleaned = deps.ensureSentenceEnd(candidate);
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.bigwhyStepId, cleaned)) continue;
      if (tokenizeWords(cleaned).length <= 28 && !cleaned.endsWith("?")) return cleaned;
    }
    return "";
  }

  function pickEntitySuggestionFromPreviousState(
    state: CanvasState,
    previousSpecialist: Record<string, unknown>
  ): string {
    const previous = previousSpecialist && typeof previousSpecialist === "object"
      ? previousSpecialist
      : {};
    const fromMessage = extractEntitySuggestionPhrases({
      message: String((previous as any).message || ""),
      normalizeEntityPhrase: deps.normalizeEntityPhrase,
    });
    for (const candidate of fromMessage) {
      const cleaned = deps.normalizeEntityPhrase(candidate);
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.entityStepId, cleaned)) continue;
      return cleaned;
    }
    const fromFields = [
      String((previous as any).entity || "").trim(),
      String((previous as any).refined_formulation || "").trim(),
      String((((state as any).provisional_by_step || {})[deps.entityStepId] || "")).trim(),
      String((state as any).entity_final || "").trim(),
    ].filter(Boolean);
    for (const candidate of fromFields) {
      const cleaned = deps.normalizeEntityPhrase(candidate);
      if (!cleaned) continue;
      if (!isValidStepValueForStorage(deps.entityStepId, cleaned)) continue;
      const words = tokenizeWords(cleaned);
      if (words.length >= 2 && words.length <= 8) return cleaned;
    }
    return "";
  }

  function pickDualChoiceSuggestion(
    stepId: string,
    specialistResult: any,
    previousSpecialist: any,
    userRaw = "",
    options?: {
      allowDreamBuilderSuggestionShape?: boolean;
    }
  ): string {
    const candidates: string[] = [];
    const isDreamBuilderSuggestionCandidate = (value: string): boolean => {
      const lines = String(value || "")
        .replace(/\r/g, "\n")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length < 2 || lines.length > 12) return false;
      return lines.every((line) => {
        if (looksLikeExamplesFramingLine(line)) return false;
        if (/^[\-*•]\s+/.test(line)) return false;
        if (/^\d+[\).]\s+/.test(line)) return false;
        if (line.includes("?")) return false;
        const words = tokenizeWords(line);
        return words.length >= 5 && words.length <= 32;
      });
    };
    const canStoreCandidateForThisChoice = (value: string): boolean => {
      if (isValidStepValueForStorage(stepId, value)) return true;
      return Boolean(
        stepId === deps.dreamStepId &&
        options?.allowDreamBuilderSuggestionShape === true &&
        isDreamBuilderSuggestionCandidate(value)
      );
    };
    const pushCandidate = (value: string) => {
      const raw = String(value || "").trim();
      const trimmed = stepId === deps.entityStepId ? deps.normalizeEntityPhrase(raw) : raw;
      if (!trimmed) return;
      if (!canStoreCandidateForThisChoice(trimmed)) return;
      if (candidates.includes(trimmed)) return;
      candidates.push(trimmed);
    };
    const isAcceptableSuggestionForStep = (candidate: string): boolean => {
      const text = String(candidate || "").replace(/\r/g, "\n").trim();
      if (!text) return false;
      if (stepId !== deps.entityStepId) return true;
      const singleLine = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" ");
      const words = tokenizeWords(singleLine);
      if (words.length < 2 || words.length > 8) return false;
      if (/[!?]/.test(singleLine)) return false;
      if (/[.]/.test(singleLine)) return false;
      return true;
    };

    const field = deps.fieldForStep(stepId);
    if (field) pushCandidate(String(specialistResult?.[field] || ""));
    pushCandidate(String(specialistResult?.refined_formulation || ""));

    if (Array.isArray(specialistResult?.statements) && specialistResult.statements.length > 0) {
      pushCandidate(
        (specialistResult.statements as string[])
          .map((line) => String(line || "").trim())
          .filter(Boolean)
          .join("\n")
      );
    }

    pushCandidate(String(previousSpecialist?.refined_formulation || ""));
    const messageCandidate = extractSuggestionFromMessage(String(specialistResult?.message || ""));
    const userComparableForMessage = String(userRaw || "").trim();
    if (messageCandidate) {
      const overlap = tokenJaccardSimilarity(userComparableForMessage, messageCandidate);
      const candidateWordCount = tokenizeWords(messageCandidate).length;
      if (!userComparableForMessage || (candidateWordCount >= 6 && overlap >= 0.2)) {
        pushCandidate(messageCandidate);
      }
    }

    const user = String(userRaw || "").trim();
    const userComparable = canonicalizeComparableText(user);
    if (user) {
      for (const candidate of candidates) {
        if (!isAcceptableSuggestionForStep(candidate)) continue;
        const comparable = canonicalizeComparableText(candidate);
        if (!comparable || comparable === userComparable) continue;
        if (isMaterialRewriteCandidate(user, candidate)) return candidate;
      }
      for (const candidate of candidates) {
        if (!isAcceptableSuggestionForStep(candidate)) continue;
        const comparable = canonicalizeComparableText(candidate);
        if (!comparable || comparable === userComparable) continue;
        return candidate;
      }
    }

    for (const candidate of candidates) {
      if (isAcceptableSuggestionForStep(candidate)) return candidate;
    }
    return "";
  }

  return {
    pickDualChoiceSuggestion,
    pickDreamSuggestionFromPreviousState,
    pickBigWhySuggestionFromPreviousState,
    pickEntitySuggestionFromPreviousState,
    pickRoleSuggestionFromPreviousState,
  };
}
