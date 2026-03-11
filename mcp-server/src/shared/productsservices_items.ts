type ProductsServicesItemsOptions = {
  comparableText?: (value: string) => string;
};

function normalizeProductsServicesItem(value: string): string {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeProductsServicesItems(items: string[], options: ProductsServicesItemsOptions): string[] {
  const comparableText = options.comparableText;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = normalizeProductsServicesItem(raw);
    if (!item) continue;
    const key = comparableText ? comparableText(item) : item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function splitCamelTitleItems(raw: string): string[] {
  const tokens = String(raw || "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 3) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  for (const token of tokens) {
    const plain = token.replace(/^[("'\[]+|[)"'\],.;:!?]+$/g, "");
    const startsUpper = /^\p{Lu}/u.test(plain);
    if (startsUpper && current.length > 0) {
      chunks.push(current.join(" ").trim());
      current = [token];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) chunks.push(current.join(" ").trim());
  const cleaned = chunks
    .map((chunk) => normalizeProductsServicesItem(chunk))
    .filter(Boolean);
  return cleaned.length >= 2 ? cleaned : [];
}

export function productsServicesItemsFromText(
  rawValue: string,
  options: ProductsServicesItemsOptions = {}
): string[] {
  const raw = String(rawValue || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];

  const allLines = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const lines =
    allLines.length >= 2 && /:\s*$/.test(allLines[0]) && !/^(?:[-*•]|\d+[\).])\s+/.test(allLines[0])
      ? allLines.slice(1)
      : allLines;
  const explicitListItems = lines.filter((line) => /^(?:[-*•]|\d+[\).])\s+/.test(line));
  if (explicitListItems.length >= 1) {
    return dedupeProductsServicesItems(explicitListItems, options);
  }
  if (lines.length >= 2) {
    return dedupeProductsServicesItems(lines, options);
  }

  const semicolonItems = raw
    .split(/\s*;\s*/)
    .map((line) => normalizeProductsServicesItem(line))
    .filter(Boolean);
  if (semicolonItems.length >= 2) {
    return dedupeProductsServicesItems(semicolonItems, options);
  }

  if (!raw.includes(",")) {
    const titleSplit = splitCamelTitleItems(raw);
    if (titleSplit.length >= 2) {
      return dedupeProductsServicesItems(titleSplit, options);
    }
  }

  const single = normalizeProductsServicesItem(raw);
  return single ? [single] : [];
}
