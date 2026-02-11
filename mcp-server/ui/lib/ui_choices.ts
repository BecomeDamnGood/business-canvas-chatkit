/**
 * Prompt parsing and choice extraction.
 * extractChoicesFromPrompt MUST receive raw prompt (not stripped).
 */

export interface Choice {
  value: string;
  label: string;
}

export interface ExtractChoicesResult {
  promptShown: string;
  choices: Choice[];
}

/**
 * Structure-only choice detection (language-agnostic).
 * Renders numbered lines as buttons when: one contiguous numbered block,
 * consecutive from 1, count 2–6, prompt <= 12 lines, each label <= 140 chars.
 * No "choose/type/select" cue required.
 */
export function extractChoicesFromPrompt(promptText: string | null | undefined): ExtractChoicesResult {
  const raw = String(promptText || "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const found: Record<string, string> = {};
  const kept: string[] = [];

  for (const line of lines) {
    const m = line.match(/^\s*([1-9])[\)\.]\s*(.+?)\s*$/);
    if (m && m[1] && m[2]) {
      found[m[1]] = m[2].trim();
      continue;
    }
    kept.push(line);
  }

  const keys = Object.keys(found).sort((a, b) => Number(a) - Number(b));
  const choiceCount = keys.length;
  let consecutive = choiceCount > 0;
  for (let i = 0; i < keys.length; i++) {
    if (Number(keys[i]) !== i + 1) {
      consecutive = false;
      break;
    }
  }
  const shortPrompt = lines.length <= 12;
  const smallMenu = choiceCount >= 1 && choiceCount <= 6;
  const maxLabelLen = 140;
  const labelsReasonable = keys.every((k) => String(found[k]).length <= maxLabelLen);
  const useAsChoices = consecutive && shortPrompt && smallMenu && labelsReasonable;

  const choices: Choice[] = useAsChoices
    ? keys.map((k) => ({ value: String(k), label: String(found[k]) }))
    : [];
  const promptShown = useAsChoices ? kept.join("\n").trim() : raw.trim();

  return { promptShown, choices };
}
