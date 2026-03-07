type ParsedSection = {
  heading: string;
  body: string;
};

function parseInstructionSections(text: string): { title: string; sections: ParsedSection[] } {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const title = String(lines[0] || "").trim();
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];
  const headingRe = /^\d+\)\s+/;

  const pushCurrent = () => {
    if (!currentHeading) return;
    sections.push({
      heading: currentHeading,
      body: currentLines.join("\n").trim(),
    });
  };

  for (const line of lines.slice(1)) {
    if (headingRe.test(line.trim())) {
      pushCurrent();
      currentHeading = line.trim();
      currentLines = [];
      continue;
    }
    if (!currentHeading) continue;
    currentLines.push(line);
  }
  pushCurrent();

  return { title, sections };
}

function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const haystack = String(text || "").toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function pickSectionsForExplainProfile(sections: ParsedSection[]): ParsedSection[] {
  const keep = (section: ParsedSection): boolean => {
    const heading = section.heading;
    const content = `${section.heading}\n${section.body}`;
    if (matchesAnyKeyword(heading, ["STEP HEADER", "INPUTS", "OUTPUT SCHEMA", "ACTION CODES"])) return true;
    if (matchesAnyKeyword(content, ["EXPLAIN", "GIVE EXAMPLE"])) return true;
    if (matchesAnyKeyword(heading, ["LANGUAGE RULE", "STRICT JSON", "OFF-TOPIC"])) return true;
    return false;
  };

  return sections.filter((section) => keep(section));
}

export function isExplainLightProfileEnabled(): boolean {
  return String(process.env.BSC_PROMPT_PROFILE_EXPLAIN_V1 || "1").trim() !== "0";
}

export function buildExplainLightInstructions(baseInstructions: string): string {
  const parsed = parseInstructionSections(baseInstructions);
  const selected = pickSectionsForExplainProfile(parsed.sections);
  if (selected.length === 0) return baseInstructions;

  const hasOutputSchema = selected.some((section) => matchesAnyKeyword(section.heading, ["OUTPUT SCHEMA"]));
  const hasActionRoutes = selected.some((section) =>
    matchesAnyKeyword(`${section.heading}\n${section.body}`, ["ACTION CODES", "__ROUTE__", "ACTION_", "route token"])
  );
  const hasExplain = selected.some((section) =>
    matchesAnyKeyword(`${section.heading}\n${section.body}`, ["EXPLAIN", "GIVE EXAMPLE"])
  );
  if (!hasOutputSchema || !hasExplain || (!hasActionRoutes && !matchesAnyKeyword(baseInstructions, ["__ROUTE__", "ACTION_"]))) {
    return baseInstructions;
  }

  const blocks = [
    parsed.title,
    "EXPLAIN-LIGHT PROFILE (token-optimized)",
    "- Keep output fully compliant with the same strict JSON schema and route semantics.",
    "- Focus on explanation/example behavior for the current route.",
    "- Route handling: treat REQUEST_EXPLANATION / explain-more / give-example paths as explain turns, while preserving normal routing contract behavior for other inputs.",
    ...selected.map((section) => `${section.heading}\n\n${section.body}`.trim()),
    "END OF INSTRUCTIONS",
  ];
  return blocks.join("\n\n").trim();
}

export function shouldUseExplainLightProfile(intentType: string): boolean {
  return isExplainLightProfileEnabled() && String(intentType || "").trim() === "REQUEST_EXPLANATION";
}
