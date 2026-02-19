/**
 * Text rendering and sanitization utilities.
 * Security: never use innerHTML for LLM/tool output. Bold is rendered via DOM nodes only.
 */

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  // SAFE: Use DOM to escape text into HTML entities.
  return div.innerHTML;
}

export function stripInlineText(raw: string | null | undefined): string {
  let s = String(raw || "");
  s = s.replace(/<[^>]*>/g, "");
  return s;
}

export function renderInlineText(el: Element | null, raw: string | null | undefined): void {
  if (!el) return;
  const s = String(raw || "");
  const fragment = document.createDocumentFragment();
  let buf = "";
  let bold = false;
  let i = 0;

  function appendTextPreservingLines(text: string, useBold: boolean): void {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx] ?? "";
      if (useBold) {
        const strong = document.createElement("strong");
        strong.textContent = line;
        fragment.appendChild(strong);
      } else {
        fragment.appendChild(document.createTextNode(line));
      }
      if (idx < lines.length - 1) {
        fragment.appendChild(document.createElement("br"));
      }
    }
  }

  function flush(): void {
    if (!buf) return;
    appendTextPreservingLines(buf, bold);
    buf = "";
  }

  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      buf += s.slice(i);
      break;
    }
    buf += s.slice(i, lt);
    const gt = s.indexOf(">", lt + 1);
    if (gt === -1) {
      buf += s.slice(lt);
      break;
    }
    const tag = s.slice(lt + 1, gt).trim().toLowerCase();
    if (tag === "strong") {
      flush();
      bold = true;
    } else if (tag === "/strong") {
      flush();
      bold = false;
    }
    i = gt + 1;
  }
  flush();

  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(fragment);
}

function clearElementChildren(el: Element | null): void {
  if (!el) return;
  const target = el as unknown as {
    firstChild?: Node | null;
    removeChild?: (child: Node) => void;
    innerHTML?: string;
  };
  if (typeof target.removeChild === "function") {
    while (target.firstChild) target.removeChild(target.firstChild);
    return;
  }
  if ("innerHTML" in target) {
    target.innerHTML = "";
  }
}

function normalizeLineText(raw: string): string {
  return stripInlineText(raw).replace(/\s+/g, " ").trim();
}

function isHeadingLikeLine(line: string): boolean {
  if (!line) return false;
  if (line.endsWith(":")) return true;
  return /^\s*<strong>.*<\/strong>\s*$/i.test(line);
}

function extractOrderedItem(line: string): string | null {
  const text = normalizeLineText(line);
  const m = text.match(/^\d+[\.\)]\s+(.+)$/);
  return m ? m[1].trim() : null;
}

function extractBulletItem(line: string): string | null {
  const text = normalizeLineText(line);
  const m = text.match(/^(?:[-*•])\s+(.+)$/);
  return m ? m[1].trim() : null;
}

function appendParagraph(el: Element, lines: string[]): void {
  const paragraph = normalizeLineText(lines.join(" "));
  if (!paragraph) return;
  const p = document.createElement("p");
  p.textContent = paragraph;
  el.appendChild(p);
}

function appendHeading(el: Element, line: string): void {
  const text = normalizeLineText(line).replace(/:$/, "");
  if (!text) return;
  const p = document.createElement("p");
  p.className = "cardSubheading";
  p.textContent = text;
  el.appendChild(p);
}

function appendList(el: Element, tagName: "ol" | "ul", className: string, items: string[]): void {
  const filtered = items.map((item) => normalizeLineText(item)).filter(Boolean);
  if (!filtered.length) return;
  const list = document.createElement(tagName);
  list.className = className;
  for (const item of filtered) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  el.appendChild(list);
}

/**
 * Render card body text with semantic structure:
 * - ordered lists for numbered steps/questions
 * - bullet lists for feature/example enumerations
 * - paragraphs for regular narrative text
 * - heading-like lines only for explicit heading markers (e.g. "<strong>...</strong>" or "...:")
 */
export function renderStructuredText(el: Element | null, raw: string | null | undefined): void {
  if (!el) return;
  clearElementChildren(el);

  const source = String(raw || "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return;

  const lines = source.split("\n");
  let i = 0;
  while (i < lines.length) {
    const currentRaw = String(lines[i] || "");
    const current = currentRaw.trim();
    if (!current) {
      i += 1;
      continue;
    }

    const orderedFirst = extractOrderedItem(currentRaw);
    if (orderedFirst) {
      const items: string[] = [orderedFirst];
      i += 1;
      while (i < lines.length) {
        const candidate = extractOrderedItem(String(lines[i] || ""));
        if (!candidate) break;
        items.push(candidate);
        i += 1;
      }
      appendList(el, "ol", "structuredList structuredListOrdered", items);
      continue;
    }

    const bulletFirst = extractBulletItem(currentRaw);
    if (bulletFirst) {
      const items: string[] = [bulletFirst];
      i += 1;
      while (i < lines.length) {
        const candidate = extractBulletItem(String(lines[i] || ""));
        if (!candidate) break;
        items.push(candidate);
        i += 1;
      }
      appendList(el, "ul", "structuredList structuredListBullet", items);
      continue;
    }

    if (isHeadingLikeLine(currentRaw)) {
      appendHeading(el, currentRaw);
      i += 1;
      continue;
    }

    const paragraphLines: string[] = [currentRaw];
    i += 1;
    while (i < lines.length) {
      const candidateRaw = String(lines[i] || "");
      const candidate = candidateRaw.trim();
      if (!candidate) break;
      if (extractOrderedItem(candidateRaw) || extractBulletItem(candidateRaw) || isHeadingLikeLine(candidateRaw)) {
        break;
      }
      paragraphLines.push(candidateRaw);
      i += 1;
    }
    appendParagraph(el, paragraphLines);
  }
}
