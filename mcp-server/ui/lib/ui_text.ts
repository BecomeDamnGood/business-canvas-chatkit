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

  function appendLineWithLinks(line: string): void {
    const value = String(line || "");
    const urlPattern = /https?:\/\/[^\s<>"']+/g;
    let cursor = 0;
    let m: RegExpExecArray | null = null;
    while ((m = urlPattern.exec(value)) !== null) {
      const fullMatch = String(m[0] || "");
      const start = Number(m.index || 0);
      if (start > cursor) {
        fragment.appendChild(document.createTextNode(value.slice(cursor, start)));
      }
      let url = fullMatch;
      let trailing = "";
      while (/[).,!?;:]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      if (url) {
        const a = document.createElement("a");
        a.textContent = url;
        (a as HTMLAnchorElement).href = url;
        (a as HTMLAnchorElement).target = "_blank";
        (a as HTMLAnchorElement).rel = "noopener noreferrer";
        (a as HTMLElement).className = "inlineLink";
        fragment.appendChild(a);
      }
      if (trailing) {
        fragment.appendChild(document.createTextNode(trailing));
      }
      cursor = start + fullMatch.length;
    }
    if (cursor < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(cursor)));
    }
  }

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
        appendLineWithLinks(line);
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
  return /^\s*<strong>\s*[^<][\s\S]{0,200}<\/strong>\s*$/i.test(line);
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

function extractMarkdownImage(line: string): { alt: string; url: string } | null {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const m = raw.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
  if (!m) return null;
  const alt = String(m[1] || "").trim() || "Image";
  const url = String(m[2] || "").trim();
  if (!url || !/^(https?:\/\/|\/)/i.test(url)) return null;
  return { alt, url };
}

function appendImage(el: Element, image: { alt: string; url: string }): void {
  const img = document.createElement("img");
  img.className = "cardDesc-image";
  (img as HTMLImageElement).src = image.url;
  (img as HTMLImageElement).alt = image.alt;
  el.appendChild(img);
}

function appendParagraph(el: Element, lines: string[]): void {
  const paragraph = lines.map((line) => String(line || "").trim()).filter(Boolean).join(" ");
  const paragraphCheck = normalizeLineText(paragraph);
  if (!paragraphCheck) return;
  if (!paragraph) return;
  const p = document.createElement("p");
  renderInlineText(p, paragraph);
  el.appendChild(p);
}

function appendHeading(el: Element, line: string): void {
  const textRaw = String(line || "")
    .trim()
    .replace(/^<strong>\s*/i, "")
    .replace(/\s*<\/strong>$/i, "")
    .replace(/:$/, "");
  const textCheck = normalizeLineText(textRaw);
  if (!textCheck) return;
  const p = document.createElement("p");
  p.className = "cardSubheading";
  renderInlineText(p, textRaw);
  el.appendChild(p);
}

function appendList(el: Element, tagName: "ol" | "ul", className: string, items: string[]): void {
  const filtered = items
    .map((item) => ({ raw: String(item || "").trim(), clean: normalizeLineText(item) }))
    .filter((item) => item.clean.length > 0);
  if (!filtered.length) return;
  const list = document.createElement(tagName);
  list.className = className;
  for (const item of filtered) {
    const li = document.createElement("li");
    renderInlineText(li, item.raw);
    list.appendChild(li);
  }
  el.appendChild(list);
}

/**
 * Render card body text with semantic structure:
 * - bullet lists for all list-like enumerations (including numbered input lines)
 * - bullet lists for feature/example enumerations
 * - paragraphs for regular narrative text
 * - heading-like lines only for explicit heading markers ("...:" or standalone "<strong>...</strong>")
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

    const imageLine = extractMarkdownImage(currentRaw);
    if (imageLine) {
      appendImage(el, imageLine);
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
      appendList(el, "ul", "structuredList structuredListBullet", items);
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
