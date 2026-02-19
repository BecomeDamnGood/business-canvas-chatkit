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
