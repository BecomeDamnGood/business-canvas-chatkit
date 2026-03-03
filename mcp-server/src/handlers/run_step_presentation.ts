import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { getPresentationTemplatePath } from "../core/presentation_paths.js";
import type { CanvasState } from "../core/state.js";
import { parseStep0Final } from "./run_step_step0.js";

type SectionKey = "strategy" | "targetgroup" | "productsservices" | "rulesofthegame";

type RunStepPresentationDeps = {
  uiDefaultString: (key: string, fallback?: string) => string;
  uiStringFromStateMap: (
    state: CanvasState | null | undefined,
    key: string,
    fallback: string
  ) => string;
};

const SECTION_LABELS: Record<SectionKey, string[]> = {
  strategy: ["strategy"],
  targetgroup: ["target group"],
  productsservices: ["products and services", "products & services"],
  rulesofthegame: ["rules of the game"],
};

function normalizePresentationTextSingle(input: string): string {
  return String(input || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function presentationLines(input: string): string[] {
  const raw = String(input || "").replace(/\r/g, "");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[•\-]\s+/, "").trim())
    .filter((line) => line.length > 0);
  return lines.length ? lines : [""];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectSectionLabel(line: string): { section: SectionKey; rest: string } | null {
  const trimmed = line.trim();
  for (const [section, labels] of Object.entries(SECTION_LABELS) as [SectionKey, string[]][]) {
    for (const label of labels) {
      const re = new RegExp(`^${escapeRegExp(label)}\\s*[:\\-–]?\\s*(.*)$`, "i");
      const match = trimmed.match(re);
      if (match) {
        const rest = String(match[1] || "").trim();
        return { section, rest };
      }
    }
  }
  return null;
}

function sanitizeLinesForSection(lines: string[], section: SectionKey): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned || /^[.\-•]+$/.test(cleaned)) continue;
    const detected = detectSectionLabel(cleaned);
    if (detected) {
      if (detected.section !== section) break;
      if (detected.rest) out.push(detected.rest);
      continue;
    }
    out.push(cleaned);
  }
  return out.length ? out : [""];
}

function extractFirstTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>|<${tag}[^>]*/>`);
  const m = xml.match(re);
  return m ? m[0] : "";
}

function hasNumberedLines(lines: string[]): boolean {
  if (!lines || lines.length === 0) return false;
  const firstLine = lines[0].trim();
  return /^\d+[.)]\s/.test(firstLine);
}

function removeBulletsFromPPr(pPr: string): string {
  if (!pPr) return pPr;
  return pPr
    .replace(/<a:buFont[^>]*>[\s\S]*?<\/a:buFont>/g, "")
    .replace(/<a:buNone\/>/g, "")
    .replace(/<a:buAutoNum[^>]*\/>/g, "")
    .replace(/<a:buChar[^>]*\/>/g, "")
    .replace(/<a:buBlip[^>]*\/>/g, "");
}

function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildParagraphXml(params: {
  pPr: string;
  rPr: string;
  endParaRPr: string;
  text: string;
}): string {
  const { pPr, rPr, endParaRPr, text } = params;
  const parts: string[] = ["<a:p>"];
  if (pPr) parts.push(pPr);
  parts.push("<a:r>");
  if (rPr) parts.push(rPr);
  parts.push(`<a:t>${escapeXml(text)}</a:t>`);
  parts.push("</a:r>");
  if (endParaRPr) parts.push(endParaRPr);
  parts.push("</a:p>");
  return parts.join("");
}

function replacePlaceholderParagraphs(xml: string, placeholder: string, lines: string[]): string {
  const paraRe = /<a:p\b[\s\S]*?<\/a:p>/g;
  return xml.replace(paraRe, (paraXml) => {
    if (!paraXml.includes(`<a:t>${placeholder}</a:t>`)) return paraXml;
    let pPr = extractFirstTag(paraXml, "a:pPr");
    const rPr = extractFirstTag(paraXml, "a:rPr");
    const endParaRPr = extractFirstTag(paraXml, "a:endParaRPr");
    const safeLines = lines && lines.length ? lines : [""];

    if (placeholder === "{{STRATEGY}}" && hasNumberedLines(safeLines)) {
      pPr = removeBulletsFromPPr(pPr);
    }

    return safeLines
      .map((line) =>
        buildParagraphXml({
          pPr,
          rPr,
          endParaRPr,
          text: line,
        })
      )
      .join("");
  });
}

function collectXmlFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectXmlFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xml")) {
      files.push(full);
    }
  }
  return files;
}

function replacePlaceholdersInDir(
  rootDir: string,
  replacements: Record<string, string>,
  paragraphReplacements: Record<string, string[]>
): void {
  const xmlFiles = collectXmlFiles(rootDir);
  for (const filePath of xmlFiles) {
    const original = fs.readFileSync(filePath, "utf-8");
    let updated = original;
    for (const [placeholder, lines] of Object.entries(paragraphReplacements)) {
      if (!placeholder) continue;
      updated = replacePlaceholderParagraphs(updated, placeholder, lines);
    }
    for (const [placeholder, value] of Object.entries(replacements)) {
      if (!placeholder) continue;
      updated = updated.split(placeholder).join(value);
    }
    updated = updated.replace(/<a:normAutofit\/>/g, "<a:noAutofit/>");
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf-8");
    }
  }
}

function headingLabelsForState(
  state: CanvasState,
  deps: RunStepPresentationDeps
): Record<string, string> {
  return {
    PURPOSEH: deps.uiStringFromStateMap(
      state,
      "ppt.heading.purpose",
      deps.uiDefaultString("ppt.heading.purpose")
    ),
    ROLEH: deps.uiStringFromStateMap(state, "ppt.heading.role", deps.uiDefaultString("ppt.heading.role")),
    STRATEGYH: deps.uiStringFromStateMap(
      state,
      "ppt.heading.strategy",
      deps.uiDefaultString("ppt.heading.strategy")
    ),
    ENTITYH: deps.uiStringFromStateMap(
      state,
      "ppt.heading.entity",
      deps.uiDefaultString("ppt.heading.entity")
    ),
    DREAMH: deps.uiStringFromStateMap(state, "ppt.heading.dream", deps.uiDefaultString("ppt.heading.dream")),
    TARGET_GROUPH: deps.uiStringFromStateMap(
      state,
      "ppt.heading.targetgroup",
      deps.uiDefaultString("ppt.heading.targetgroup")
    ),
    PRODUCTS_SERVICESH: deps.uiStringFromStateMap(
      state,
      "ppt.heading.productsservices",
      deps.uiDefaultString("ppt.heading.productsservices")
    ),
    RULES_OF_THE_GAMEH: deps.uiStringFromStateMap(
      state,
      "ppt.heading.rulesofthegame",
      deps.uiDefaultString("ppt.heading.rulesofthegame")
    ),
  };
}

function toStableFingerprintValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[depth_limit]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => toStableFingerprintValue(entry, depth + 1));
  if (typeof value !== "object") return String(value);
  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(raw).sort()) {
    next[key] = toStableFingerprintValue(raw[key], depth + 1);
  }
  return next;
}

export function createRunStepPresentationHelpers(deps: RunStepPresentationDeps) {
  function baseUrlFromEnv(): string {
    const explicit = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    if (process.env.LOCAL_DEV === "1") {
      const port = String(process.env.PORT || "3000").trim();
      return `http://localhost:${port}`;
    }
    return "";
  }

  function buildPresentationAssetFingerprint(
    state: CanvasState,
    labels: Record<string, string>,
    templatePath: string
  ): string {
    const templateStat = fs.statSync(templatePath);
    const payload = toStableFingerprintValue({
      schema_version: "presentation_asset_fingerprint_v1",
      template: {
        file: path.basename(templatePath),
        size: templateStat.size,
        mtime_ms: Math.trunc(templateStat.mtimeMs),
      },
      labels,
      content: {
        business_name: String((state as any).business_name ?? ""),
        step_0_final: String((state as any).step_0_final ?? ""),
        purpose_final: String((state as any).purpose_final ?? ""),
        role_final: String((state as any).role_final ?? ""),
        entity_final: String((state as any).entity_final ?? ""),
        dream_final: String((state as any).dream_final ?? ""),
        bigwhy_final: String((state as any).bigwhy_final ?? ""),
        strategy_final: String((state as any).strategy_final ?? ""),
        targetgroup_final: String((state as any).targetgroup_final ?? ""),
        productsservices_final: String((state as any).productsservices_final ?? ""),
        rulesofthegame_final: String((state as any).rulesofthegame_final ?? ""),
      },
    });
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, 16);
  }

  function generatePresentationPptx(state: CanvasState): {
    fileName: string;
    filePath: string;
    outDir: string;
    assetFingerprint: string;
  } {
    const templatePath = getPresentationTemplatePath();
    if (!fs.existsSync(templatePath)) {
      throw new Error("Presentation template not found");
    }
    const outDir = path.join(os.tmpdir(), "business-canvas-presentations");
    fs.mkdirSync(outDir, { recursive: true });

    const step0Final = String((state as any).step_0_final ?? "").trim();
    const fallbackName = String((state as any).business_name ?? "").trim();
    const { name } = parseStep0Final(step0Final, fallbackName);

    const labels = headingLabelsForState(state, deps);
    const assetFingerprint = buildPresentationAssetFingerprint(state, labels, templatePath);
    const fileName = `presentation-${assetFingerprint}.pptx`;
    const filePath = path.join(outDir, fileName);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return { fileName, filePath, outDir, assetFingerprint };
    }

    const strategyLines = sanitizeLinesForSection(
      presentationLines(String((state as any).strategy_final ?? "")),
      "strategy"
    );
    const targetGroupLines = sanitizeLinesForSection(
      presentationLines(String((state as any).targetgroup_final ?? "")),
      "targetgroup"
    );
    const productsServicesLines = sanitizeLinesForSection(
      presentationLines(String((state as any).productsservices_final ?? "")),
      "productsservices"
    );
    const rulesLines = sanitizeLinesForSection(
      presentationLines(String((state as any).rulesofthegame_final ?? "")),
      "rulesofthegame"
    );

    const replacements: Record<string, string> = {
      "{{BUSINESS_NAME}}": escapeXml(normalizePresentationTextSingle(name || "TBD")),
      "{{BIG_WHY}}": escapeXml(normalizePresentationTextSingle(String((state as any).bigwhy_final ?? ""))),
      "{{BIGWHY}}": escapeXml(normalizePresentationTextSingle(String((state as any).bigwhy_final ?? ""))),
      "{{PURPOSE}}": escapeXml(normalizePresentationTextSingle(String((state as any).purpose_final ?? ""))),
      "{{ROLE}}": escapeXml(normalizePresentationTextSingle(String((state as any).role_final ?? ""))),
      "{{ENTITY}}": escapeXml(normalizePresentationTextSingle(String((state as any).entity_final ?? ""))),
      "{{DREAM}}": escapeXml(normalizePresentationTextSingle(String((state as any).dream_final ?? ""))),
      "{{STRATEGY}}": escapeXml(strategyLines.join("\n")),
      "{{TARGET_GROUP}}": escapeXml(targetGroupLines.join("\n")),
      "{{PRODUCTS_SERVICES}}": escapeXml(productsServicesLines.join("\n")),
      "{{RULES_OF_THE_GAME}}": escapeXml(rulesLines.join("\n")),
      "{{PURPOSEH}}": escapeXml(labels.PURPOSEH),
      "{{ROLEH}}": escapeXml(labels.ROLEH),
      "{{STRATEGYH}}": escapeXml(labels.STRATEGYH),
      "{{ENTITYH}}": escapeXml(labels.ENTITYH),
      "{{DREAMH}}": escapeXml(labels.DREAMH),
      "{{TARGET_GROUPH}}": escapeXml(labels.TARGET_GROUPH),
      "{{PRODUCTS_SERVICESH}}": escapeXml(labels.PRODUCTS_SERVICESH),
      "{{RULES_OF_THE_GAMEH}}": escapeXml(labels.RULES_OF_THE_GAMEH),
    };

    const paragraphReplacements: Record<string, string[]> = {
      "{{STRATEGY}}": strategyLines,
      "{{TARGET_GROUP}}": targetGroupLines,
      "{{PRODUCTS_SERVICES}}": productsServicesLines,
      "{{RULES_OF_THE_GAME}}": rulesLines,
    };

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bsc-pptx-"));

    try {
      execFileSync("unzip", ["-q", templatePath, "-d", workDir]);
      const pptDir = path.join(workDir, "ppt");
      replacePlaceholdersInDir(pptDir, replacements, paragraphReplacements);

      const tempFilePath = path.join(
        outDir,
        `${fileName}.${process.pid}.${Date.now()}.tmp`
      );
      execFileSync("zip", ["-qr", tempFilePath, "."], { cwd: workDir });
      try {
        fs.renameSync(tempFilePath, filePath);
      } catch (error) {
        const code = String((error as NodeJS.ErrnoException)?.code || "");
        if ((code === "EEXIST" || code === "ENOTEMPTY") && fs.existsSync(filePath)) {
          fs.rmSync(tempFilePath, { force: true });
        } else {
          throw error;
        }
      }
      return { fileName, filePath, outDir, assetFingerprint };
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  function cleanupOldPresentationFiles(dir: string, maxAgeMs: number): void {
    try {
      const now = Date.now();
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (!stat.isFile()) continue;
          if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
        } catch {
          // ignore cleanup errors
        }
      }
    } catch {
      // ignore cleanup errors
    }
  }

  function convertPptxToPdf(pptxPath: string, outDir: string): string {
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.basename(pptxPath, ".pptx");
    const targetPath = path.join(outDir, `${base}.pdf`);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      return targetPath;
    }
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, pptxPath]);
    return targetPath;
  }

  function convertPdfToPng(pdfPath: string, outDir: string): string {
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.basename(pdfPath, ".pdf");
    const outPrefix = path.join(outDir, base);
    const targetPath = `${outPrefix}.png`;
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      return targetPath;
    }
    execFileSync("pdftoppm", ["-png", "-f", "1", "-singlefile", pdfPath, outPrefix]);
    return targetPath;
  }

  function generatePresentationAssets(state: CanvasState): {
    pdfUrl: string;
    pngUrl: string;
    baseName: string;
    assetFingerprint: string;
  } {
    const generated = generatePresentationPptx(state);
    const pdfPath = convertPptxToPdf(generated.filePath, generated.outDir);
    const pngPath = convertPdfToPng(pdfPath, generated.outDir);
    cleanupOldPresentationFiles(generated.outDir, 24 * 60 * 60 * 1000);

    const baseUrl = baseUrlFromEnv();
    const pdfFile = path.basename(pdfPath);
    const pngFile = path.basename(pngPath);
    return {
      pdfUrl: baseUrl ? `${baseUrl}/presentations/${pdfFile}` : `/presentations/${pdfFile}`,
      pngUrl: baseUrl ? `${baseUrl}/presentations/${pngFile}` : `/presentations/${pngFile}`,
      baseName: path.basename(generated.fileName, ".pptx"),
      assetFingerprint: generated.assetFingerprint,
    };
  }

  return {
    generatePresentationAssets,
  };
}
