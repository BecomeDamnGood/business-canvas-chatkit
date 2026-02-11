// mcp-server/src/handlers/run_step.ts
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { callStrictJson } from "../core/llm.js";
import {
  CANONICAL_STEPS,
  getFinalsSnapshot,
  migrateState,
  CanvasStateZod,
  getDefaultState,
  type CanvasState,
  type BoolString,
} from "../core/state.js";
import { orchestrate, type OrchestratorOutput } from "../core/orchestrator.js";
import {
  getPresentationTemplatePath,
  hasPresentationTemplate,
} from "../core/presentation_paths.js";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_INSTRUCTIONS,
  DreamJsonSchema,
  DreamZodSchema,
  buildDreamSpecialistInput,
  type DreamOutput,
} from "../steps/dream.js";

import {
  DREAM_EXPLAINER_SPECIALIST,
  DREAM_EXPLAINER_INSTRUCTIONS,
  DreamExplainerJsonSchema,
  DreamExplainerZodSchema,
  buildDreamExplainerSpecialistInput,
  type DreamExplainerOutput,
} from "../steps/dream_explainer.js";

import {
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
  PURPOSE_INSTRUCTIONS,
  PurposeJsonSchema,
  PurposeZodSchema,
  buildPurposeSpecialistInput,
  type PurposeOutput,
} from "../steps/purpose.js";

import {
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
  BIGWHY_INSTRUCTIONS,
  BigWhyJsonSchema,
  BigWhyZodSchema,
  buildBigWhySpecialistInput,
  type BigWhyOutput,
} from "../steps/bigwhy.js";

import {
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  ROLE_INSTRUCTIONS,
  RoleJsonSchema,
  RoleZodSchema,
  buildRoleSpecialistInput,
  type RoleOutput,
} from "../steps/role.js";

import {
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
  ENTITY_INSTRUCTIONS,
  EntityJsonSchema,
  EntityZodSchema,
  buildEntitySpecialistInput,
  type EntityOutput,
} from "../steps/entity.js";

import {
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
  STRATEGY_INSTRUCTIONS,
  StrategyJsonSchema,
  StrategyZodSchema,
  buildStrategySpecialistInput,
  type StrategyOutput,
} from "../steps/strategy.js";

import {
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
  TARGETGROUP_INSTRUCTIONS,
  TargetGroupJsonSchema,
  TargetGroupZodSchema,
  buildTargetGroupSpecialistInput,
  type TargetGroupOutput,
} from "../steps/targetgroup.js";

import {
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
  PRODUCTSSERVICES_INSTRUCTIONS,
  ProductsServicesJsonSchema,
  ProductsServicesZodSchema,
  buildProductsServicesSpecialistInput,
  type ProductsServicesOutput,
} from "../steps/productsservices.js";

import {
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  RULESOFTHEGAME_INSTRUCTIONS,
  RulesOfTheGameJsonSchema,
  RulesOfTheGameZodSchema,
  buildRulesOfTheGameSpecialistInput,
  type RulesOfTheGameOutput,
  postProcessRulesOfTheGame,
  postProcessRulesOfTheGameFromBullets,
  buildRulesOfTheGameBullets,
  buildUserFeedbackForRulesProcessing,
} from "../steps/rulesofthegame.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  PRESENTATION_INSTRUCTIONS,
  PresentationJsonSchema,
  PresentationZodSchema,
  buildPresentationSpecialistInput,
  type PresentationOutput,
} from "../steps/presentation.js";
import { loadModule as loadCld3 } from "cld3-asm";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";

/**
 * Incoming tool args
 * NOTE: Some tool callers include current_step_id ("start") — accepted but not relied on.
 */
const RunStepArgsSchema = z.object({
  current_step_id: z.string().optional().default("step_0"),
  user_message: z.string().default(""),
  input_mode: z.enum(["widget", "chat"]).optional().default("chat"),
  // Use CanvasStateZod schema for type safety and validation
  // .partial() makes all fields optional (for empty/partial state)
  // .passthrough() allows extra fields for backwards compatibility (transient fields, etc.)
  state: CanvasStateZod.partial().passthrough().optional(),
});

type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

const STEP0_CARDDESC_EN =
  "Just to set the context, we'll start with the basics.";
const STEP0_QUESTION_EN =
  "What type of venture is it, and what's the business name? If the name isn't final yet, write \"TBD\".";
function step0QuestionForLang(_lang: string): string {
  return STEP0_QUESTION_EN;
}

function yesTokenForLang(_lang: string): string {
  return "yes";
}

const PRESTART_WELCOME_DEFAULT =
  `Build a complete Business Model and Strategy Canvas step by step.

<strong>The Proven Standard</strong>
A globally implemented strategy canvas used by teams worldwide, built through Ben Steenstra's unique step-by-step method of questioning and structured development.

<strong>By the end you'll have</strong><ul>
<li>A focused canvas that fits on one page</li>
<li>A presentation you can use immediately (PPTX)</li>
<li>A plan your team can align around</li>
</ul><strong>How it works</strong>
One question at a time. Clear input, structured output.

<strong>Time</strong>
Estimated time: 10–15 minutes.`;


const UI_STRINGS_DEFAULT: Record<string, string> = {
  "title.step_0": "Step 1: Validation & Business Name",
  "title.dream": "Step 2: Dream",
  "title.purpose": "Step 3: Purpose",
  "title.bigwhy": "Step 4: Big Why",
  "title.role": "Step 5: Role",
  "title.entity": "Step 6: Entity",
  "title.strategy": "Step 7: Strategy",
  "title.targetgroup": "Step 8: Target Group",
  "title.productsservices": "Step 9: Products and Services",
  "title.rulesofthegame": "Step 10: Rules of the game",
  "title.presentation": "Step 11: Presentation",
  prestartWelcome: PRESTART_WELCOME_DEFAULT,
  uiSubtitle: "Use The Business Strategy Canvas Builder widget to continue (not the chat box)",
  uiUseWidgetToContinue: "Use The Business Strategy Canvas Builder widget to continue (not the chat box).",
  btnGoToNextStep: "Go to next step",
  byText: "A business model by:",
  startHint: "Click Start to begin.",
  inputPlaceholder: "Type your answer here (use The Business Strategy Canvas Builder widget, not the chat box)…",
  thinking: "Thinking…",
  btnStart: "Start",
  btnOk: "Continue",
  btnOk_strategy: "I'm happy, continue to step 7 Strategy",
  btnDreamConfirm: "I'm happy with this formulation, continue to the Purpose step",
  "dreamBuilder.startExercise": "Start the exercise",
  "dreamBuilder.statements.title": "Your Dream statements",
  "dreamBuilder.statements.count": "N statements out of a minimum of 20 so far",
  "dreamBuilder.statements.empty": "No statements yet.",
  btnSwitchToSelfDream: "Switch back to self-formulate the dream",
  sendTitle: "Send",
  errorMessage: "Something went wrong while processing your message. Please try again.",
  scoringIntro1: "You now have more than 20 statements, so I've clustered them for you. You can still edit and add statements, but please give them a score.",
  scoringIntro2: "",
  scoringIntro3: "The average per cluster updates immediately while you type.",
  scoringDreamQuestion: "You can see above, based on your scores, which topics matter most to you. Do you now have a clearer idea of what your Dream could be about, and can you say something about it? Or would you prefer that I formulate a Dream for you based on what you find important?",
  btnScoringContinue: "Formulate my dream for me based on what I find important.",
  scoringFilled: "N/M",
  scoringAvg: "Average: X",
  purposeInstructionHint: "Answer the question, formulate your own Purpose, or choose an option",
  "sectionTitle.dream": "Your Dream",
  "sectionTitle.purposeOf": "The Purpose of {0}",
  "sectionTitle.purposeOfFuture": "The Purpose of your future company",
  "sectionTitle.bigwhyOf": "The Big Why of {0}",
  "sectionTitle.bigwhyOfFuture": "The Big Why of your future company",
  "sectionTitle.roleOf": "The Role of {0}",
  "sectionTitle.roleOfFuture": "The Role of your future company",
  "sectionTitle.entityOf": "The Entity of {0}",
  "sectionTitle.entityOfFuture": "The Entity of your future company",
  "sectionTitle.strategyOf": "The Strategy of {0}",
  "sectionTitle.strategyOfFuture": "The Strategy of your future company",
  "sectionTitle.targetgroupOf": "The Target Group of {0}",
  "sectionTitle.targetgroupOfFuture": "The Target Group of your future company",
  "sectionTitle.productsservicesOf": "The Products and Services of {0}",
  "sectionTitle.productsservicesOfFuture": "The Products and Services of your future company",
  "sectionTitle.rulesofthegameOf": "The Rules of the game of {0}",
  "sectionTitle.rulesofthegameOfFuture": "The Rules of the game of your future company",
  "sectionTitle.presentation": "Create your Presentation",
};

const UI_STRINGS_KEYS = Object.keys(UI_STRINGS_DEFAULT);
const UiStringsZodSchema = z.object(
  UI_STRINGS_KEYS.reduce<Record<string, z.ZodString>>((acc, k) => {
    acc[k] = z.string();
    return acc;
  }, {})
);
const UiStringsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: UI_STRINGS_KEYS,
  properties: UI_STRINGS_KEYS.reduce<Record<string, { type: "string" }>>((acc, k) => {
    acc[k] = { type: "string" };
    return acc;
  }, {}),
} as const;

const UI_STRINGS_CACHE = new Map<string, Record<string, string>>();

function langFromState(state: CanvasState): string {
  const l = String((state as any).language ?? "").trim().toLowerCase();
  return l || "en";
}

function baseUrlFromEnv(): string {
  const explicit = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.LOCAL_DEV === "1") {
    const port = String(process.env.PORT || "3000").trim();
    return `http://localhost:${port}`;
  }
  return "";
}

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

type SectionKey = "strategy" | "targetgroup" | "productsservices" | "rulesofthegame";

const SECTION_LABELS: Record<SectionKey, string[]> = {
  strategy: ["strategy", "strategie"],
  targetgroup: ["target group", "doelgroep"],
  productsservices: ["products and services", "products & services", "producten en diensten"],
  rulesofthegame: ["rules of the game", "spelregels"],
};

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
  // Remove bullet-related tags
  return pPr
    .replace(/<a:buFont[^>]*>[\s\S]*?<\/a:buFont>/g, "")
    .replace(/<a:buNone\/>/g, "")
    .replace(/<a:buAutoNum[^>]*\/>/g, "")
    .replace(/<a:buChar[^>]*\/>/g, "")
    .replace(/<a:buBlip[^>]*\/>/g, "");
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
    
    // Remove bullets from pPr for Strategy when lines are numbered
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

function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseStep0Final(step0Final: string, fallbackName: string): { venture: string; name: string; status: string } {
  const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
  const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
  const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);

  const venture = (ventureMatch?.[1] || "venture").trim();
  const name = (nameMatch?.[1] || fallbackName || "TBD").trim();
  const status = (statusMatch?.[1] || "starting").trim();
  return { venture, name, status };
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
    // Prevent auto-resize changing font size
    updated = updated.replace(/<a:normAutofit\/>/g, "<a:noAutofit/>");
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf-8");
    }
  }
}

function headingLabelsForLang(lang: string): Record<string, string> {
  const isNl = String(lang || "").toLowerCase().startsWith("nl");
  if (isNl) {
    return {
      PURPOSEH: "Doel",
      ROLEH: "Rol",
      STRATEGYH: "Strategie",
      ENTITYH: "Entiteit",
      DREAMH: "Droom",
      TARGET_GROUPH: "Doelgroep",
      PRODUCTS_SERVICESH: "Producten en Diensten",
      RULES_OF_THE_GAMEH: "Spelregels",
    };
  }
  return {
    PURPOSEH: "Purpose",
    ROLEH: "Role",
    STRATEGYH: "Strategy",
    ENTITYH: "Entity",
    DREAMH: "Dream",
    TARGET_GROUPH: "Target Group",
    PRODUCTS_SERVICESH: "Products and Services",
    RULES_OF_THE_GAMEH: "Rules of the Game",
  };
}

function generatePresentationPptx(state: CanvasState, lang: string): { fileName: string; filePath: string } {
  const templatePath = getPresentationTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new Error("Presentation template not found");
  }

  const step0Final = String((state as any).step_0_final ?? "").trim();
  const fallbackName = String((state as any).business_name ?? "").trim();
  const { name } = parseStep0Final(step0Final, fallbackName);

  const labels = headingLabelsForLang(lang);

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
    // fallback for bullet fields (only used if paragraph replacement fails)
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
  const outDir = path.join(os.tmpdir(), "business-canvas-presentations");
  fs.mkdirSync(outDir, { recursive: true });

  try {
    execFileSync("unzip", ["-q", templatePath, "-d", workDir]);
    const pptDir = path.join(workDir, "ppt");
    replacePlaceholdersInDir(pptDir, replacements, paragraphReplacements);

    const fileName = `presentation-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pptx`;
    const filePath = path.join(outDir, fileName);
    execFileSync("zip", ["-qr", filePath, "."], { cwd: workDir });
    return { fileName, filePath };
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
  execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, pptxPath]);
  const base = path.basename(pptxPath, ".pptx");
  return path.join(outDir, `${base}.pdf`);
}

function convertPdfToPng(pdfPath: string, outDir: string): string {
  const base = path.basename(pdfPath, ".pdf");
  const outPrefix = path.join(outDir, base);
  execFileSync("pdftoppm", ["-png", "-f", "1", "-singlefile", pdfPath, outPrefix]);
  return `${outPrefix}.png`;
}

/**
 * Render order (strict):
 * message -> refined_formulation; if both empty, fallback to question.
 * Only append refined_formulation if it is not already contained in message (prevents duplicate display e.g. Rules REFINE).
 */
function buildTextForWidget(params: { specialist: any }): string {
  const { specialist } = params;
  const parts: string[] = [];

  const msg = String(specialist?.message ?? "").trim();
  const refined = String(specialist?.refined_formulation ?? "").trim();
  if (msg) parts.push(msg);
  if (refined) {
    const refinedNormalized = refined.toLowerCase().replace(/\s+/g, " ");
    const messageNormalized = msg.toLowerCase().replace(/\s+/g, " ");
    if (!messageNormalized.includes(refinedNormalized)) {
      parts.push(refined);
    }
  }
  if (parts.length === 0) {
    const q = String(specialist?.question ?? "").trim();
    if (q) parts.push(q);
  }

  return parts.join("\n\n").trim();
}

function pickPrompt(specialist: any): string {
  const confirmQ = String(specialist?.confirmation_question ?? "").trim();
  const q = String(specialist?.question ?? "").trim();
  return confirmQ || q || "";
}

/**
 * Process ActionCode: deterministic switch/case for all ActionCodes.
 * Returns explicit route token or "yes" for the specialist.
 * No LLM routing, no context-dependent logic.
 */
function processActionCode(
  actionCode: string,
  currentStep: string,
  state: CanvasState,
  lastSpecialistResult: any
): string {
  const entry = ACTIONCODE_REGISTRY.actions[actionCode];
  if (entry) return entry.route;
  if (actionCode.startsWith("ACTION_")) {
    console.warn("[actioncode] Unknown ActionCode", { actionCode, currentStep });
  }
  return actionCode;
}

function buildUiPayload(
  specialist: any,
  flagsOverride?: Record<string, boolean> | null
): { action_codes?: string[]; expected_choice_count?: number; flags: Record<string, boolean> } | undefined {
  const flags = flagsOverride || {};
  const menuId = String(specialist?.menu_id || "").trim();
  if (menuId) {
    const actionCodes = ACTIONCODE_REGISTRY.menus[menuId];
    if (actionCodes && actionCodes.length > 0) {
      return { action_codes: actionCodes, expected_choice_count: actionCodes.length, flags };
    }
  }
  if (Object.keys(flags).length > 0) {
    return { flags };
  }
  return undefined;
}

function attachRegistryPayload<T extends Record<string, unknown>>(
  payload: T,
  specialist: any,
  flagsOverride?: Record<string, boolean> | null
): T & { registry_version: string; ui?: ReturnType<typeof buildUiPayload> } {
  const ui = buildUiPayload(specialist, flagsOverride);
  return {
    ...payload,
    registry_version: ACTIONCODE_REGISTRY.version,
    ...(ui ? { ui } : {}),
  };
}

/**
 * Map choice:X token to explicit route token (100% deterministic).
 * Returns "yes" for confirm, or explicit route token like "__ROUTE__PURPOSE_EXPLAIN_MORE__".
 * Specialist never receives "choice:X" - only explicit tokens.
 * @deprecated Use processActionCode() instead. Kept for backwards compatibility during migration.
 */
function mapChoiceTokenToRoute(
  choiceToken: string,
  currentStep: string,
  lastSpecialistResult: any
): string {
  const match = choiceToken.match(/^choice:([1-9])$/);
  if (!match) return choiceToken; // Geen choice token, doorlaten
  const choiceNum = match[1];
  const prevAction = String(lastSpecialistResult?.action || "");
  const menuId = String(lastSpecialistResult?.menu_id || "");

  // Deterministic menu_id routing (preferred)
  if (menuId) {
    // Dream menus
    if (menuId === "DREAM_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__DREAM_EXPLAIN_MORE__";
      if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
    }
    if (menuId === "DREAM_MENU_WHY") {
      if (choiceNum === "1") return "__ROUTE__DREAM_GIVE_SUGGESTIONS__";
      if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
    }
    if (menuId === "DREAM_MENU_SUGGESTIONS") {
      if (choiceNum === "1") return "__ROUTE__DREAM_PICK_ONE__";
      if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
    }
    if (menuId === "DREAM_MENU_REFINE") {
      if (choiceNum === "1") return "yes";
      if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
    }
    if (menuId === "DREAM_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__DREAM_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__DREAM_FINISH_LATER__";
    }

    // DreamExplainer menus
    if (menuId === "DREAM_EXPLAINER_MENU_REFINE") {
      if (choiceNum === "1") return "__ROUTE__DREAM_EXPLAINER_CONTINUE_TO_PURPOSE__";
      if (choiceNum === "2") return "__ROUTE__DREAM_EXPLAINER_REFINE__";
    }
    if (menuId === "DREAM_EXPLAINER_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__DREAM_EXPLAINER_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__DREAM_EXPLAINER_FINISH_LATER__";
    }

    // Purpose menus
    if (menuId === "PURPOSE_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__PURPOSE_EXPLAIN_MORE__";
    }
    if (menuId === "PURPOSE_MENU_EXPLAIN") {
      if (choiceNum === "1") return "__ROUTE__PURPOSE_ASK_3_QUESTIONS__";
      if (choiceNum === "2") return "__ROUTE__PURPOSE_GIVE_EXAMPLES__";
    }
    if (menuId === "PURPOSE_MENU_EXAMPLES") {
      if (choiceNum === "1") return "__ROUTE__PURPOSE_ASK_3_QUESTIONS__";
      if (choiceNum === "2") return "__ROUTE__PURPOSE_CHOOSE_FOR_ME__";
    }
    if (menuId === "PURPOSE_MENU_REFINE") {
      if (choiceNum === "1") return "yes";
      if (choiceNum === "2") return "__ROUTE__PURPOSE_REFINE__";
    }
    if (menuId === "PURPOSE_MENU_CONFIRM_SINGLE") {
      if (choiceNum === "1") return "yes";
    }
    if (menuId === "PURPOSE_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__PURPOSE_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__PURPOSE_FINISH_LATER__";
    }

    // Big Why menus
    if (menuId === "BIGWHY_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__BIGWHY_GIVE_EXAMPLE__";
      if (choiceNum === "2") return "__ROUTE__BIGWHY_EXPLAIN_IMPORTANCE__";
    }
    if (menuId === "BIGWHY_MENU_A") {
      if (choiceNum === "1") return "__ROUTE__BIGWHY_ASK_3_QUESTIONS__";
      if (choiceNum === "2") return "__ROUTE__BIGWHY_GIVE_EXAMPLES__";
      if (choiceNum === "3") return "__ROUTE__BIGWHY_GIVE_EXAMPLE__";
    }
    if (menuId === "BIGWHY_MENU_REFINE") {
      if (choiceNum === "1") return "yes";
      if (choiceNum === "2") return "__ROUTE__BIGWHY_REFINE__";
    }
    if (menuId === "BIGWHY_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__BIGWHY_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__BIGWHY_FINISH_LATER__";
    }

    // Role menus
    if (menuId === "ROLE_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__ROLE_FORMULATE__";
      if (choiceNum === "2") return "__ROUTE__ROLE_GIVE_EXAMPLES__";
      if (choiceNum === "3") return "__ROUTE__ROLE_EXPLAIN_MORE__";
    }
    if (menuId === "ROLE_MENU_ASK") {
      if (choiceNum === "1") return "__ROUTE__ROLE_GIVE_EXAMPLES__";
    }
    if (menuId === "ROLE_MENU_REFINE") {
      if (choiceNum === "1") return "yes";
      if (choiceNum === "2") return "__ROUTE__ROLE_ADJUST__";
    }
    if (menuId === "ROLE_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__ROLE_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__ROLE_FINISH_LATER__";
    }

    // Entity menus
    if (menuId === "ENTITY_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__ENTITY_FORMULATE__";
      if (choiceNum === "2") return "__ROUTE__ENTITY_EXPLAIN_MORE__";
    }
    if (menuId === "ENTITY_MENU_EXAMPLE") {
      if (choiceNum === "1") return "yes"; // Confirm and proceed to Strategy
      if (choiceNum === "2") return "__ROUTE__ENTITY_REFINE__"; // Refine - generate new formulation
    }
    if (menuId === "ENTITY_MENU_FORMULATE") {
      if (choiceNum === "1") return "__ROUTE__ENTITY_FORMULATE_FOR_ME__";
    }
    if (menuId === "ENTITY_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__ENTITY_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__ENTITY_FINISH_LATER__";
    }

    // Strategy menus
    if (menuId === "STRATEGY_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_EXPLAIN_MORE__";
    }
    if (menuId === "STRATEGY_MENU_ASK") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_ASK_3_QUESTIONS__";
      if (choiceNum === "2") return "__ROUTE__STRATEGY_GIVE_EXAMPLES__";
    }
    if (menuId === "STRATEGY_MENU_REFINE") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_EXPLAIN_MORE__";
    }
    if (menuId === "STRATEGY_MENU_QUESTIONS") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_EXPLAIN_MORE__"; // "Explain why I need a strategy"
    }
    if (menuId === "STRATEGY_MENU_CONFIRM") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_EXPLAIN_MORE__";      // "Explain why a Strategy matters"
      if (choiceNum === "2") return "__ROUTE__STRATEGY_CONFIRM_SATISFIED__"; // "I'm satisfied with my Strategy. Let's go to Rules of the Game"
    }
    if (menuId === "STRATEGY_MENU_FINAL_CONFIRM") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_FINAL_CONTINUE__";
    }
    if (menuId === "STRATEGY_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__STRATEGY_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__STRATEGY_FINISH_LATER__";
    }

    // Target Group menus
    if (menuId === "TARGETGROUP_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__TARGETGROUP_EXPLAIN_MORE__"; // "Explain me more about Target Groups"
      if (choiceNum === "2") return "__ROUTE__TARGETGROUP_ASK_QUESTIONS__"; // "Ask me some questions to define my specific Target Group"
    }
    if (menuId === "TARGETGROUP_MENU_EXPLAIN_MORE") {
      if (choiceNum === "1") return "__ROUTE__TARGETGROUP_ASK_QUESTIONS__"; // "Ask me some questions to define my specific Target Group"
    }
    if (menuId === "TARGETGROUP_MENU_POSTREFINE") {
      if (choiceNum === "1") return "yes"; // "Ja, dit is precies wat ik bedoel, ga naar stap Product and Services"
      if (choiceNum === "2") return "__ROUTE__TARGETGROUP_ASK_QUESTIONS__"; // "Ask me some questions to define my specific Target Group"
    }

    // Products and Services menus
    if (menuId === "PRODUCTSSERVICES_MENU_CONFIRM") {
      if (choiceNum === "1") return "__ROUTE__PRODUCTSSERVICES_CONFIRM__"; // "This is all what we offer, continue to step Rules of the Game"
    }

    // Rules menus
    if (menuId === "RULES_MENU_INTRO") {
      if (choiceNum === "1") return "__ROUTE__RULES_EXPLAIN_MORE__";
      if (choiceNum === "2") return "__ROUTE__RULES_GIVE_EXAMPLE__";
    }
    if (menuId === "RULES_MENU_ASK_EXPLAIN") {
      if (choiceNum === "1") return "__ROUTE__RULES_EXPLAIN_MORE__";
      if (choiceNum === "2") return "__ROUTE__RULES_GIVE_EXAMPLE__";
    }
    if (menuId === "RULES_MENU_EXAMPLE_ONLY") {
      if (choiceNum === "1") return "__ROUTE__RULES_GIVE_EXAMPLE__";
    }
    if (menuId === "RULES_MENU_REFINE") {
      if (choiceNum === "1") return "yes";
      if (choiceNum === "2") return "__ROUTE__RULES_ADJUST__";
    }
    if (menuId === "RULES_MENU_CONFIRM") {
      if (choiceNum === "1") return "__ROUTE__RULES_CONFIRM_ALL__";
      if (choiceNum === "2") return "__ROUTE__RULES_EXPLAIN_MORE__";
      if (choiceNum === "3") return "__ROUTE__RULES_GIVE_EXAMPLE__";
    }
    if (menuId === "RULES_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__RULES_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__RULES_FINISH_LATER__";
    }

    // Presentation menus
    if (menuId === "PRESENTATION_MENU_ASK") {
      if (choiceNum === "1") return "__ROUTE__PRESENTATION_MAKE__";
    }
    if (menuId === "PRESENTATION_MENU_ESCAPE") {
      if (choiceNum === "1") return "__ROUTE__PRESENTATION_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__PRESENTATION_FINISH_LATER__";
    }
  }
  // Purpose step routing
  if (currentStep === PURPOSE_STEP_ID) {
    if (prevAction === "REFINE") {
      // REFINE with 2-option menu
      if (choiceNum === "1") return "yes"; // Confirm
      if (choiceNum === "2") return "__ROUTE__PURPOSE_REFINE__"; // Refine further
    }
    if (prevAction === "ASK") {
      // ASK: check menu context
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 1 && choiceNum === "1") {
        // Route A: single option = confirm
        return "yes";
      }
      if (choiceLines.length === 2) {
        // Route B/C: 2 options
        if (choiceNum === "1") return "__ROUTE__PURPOSE_ASK_3_QUESTIONS__";
        if (choiceNum === "2") {
          // Check if it's "Give examples" or "Choose for me"
          const option2Text = choiceLines[1]?.toLowerCase() || "";
          if (option2Text.includes("example")) {
            return "__ROUTE__PURPOSE_GIVE_EXAMPLES__";
          }
          return "__ROUTE__PURPOSE_CHOOSE_FOR_ME__";
        }
      }
    }
    if (prevAction === "INTRO") {
      // INTRO: single option
      if (choiceNum === "1") return "__ROUTE__PURPOSE_EXPLAIN_MORE__";
    }
    if (prevAction === "ESCAPE") {
      // ESCAPE menu
      if (choiceNum === "1") return "__ROUTE__PURPOSE_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__PURPOSE_FINISH_LATER__";
    }
  }
  // Big Why step routing
  if (currentStep === BIGWHY_STEP_ID) {
    if (prevAction === "REFINE") {
      // REFINE met 2-optie menu
      if (choiceNum === "1") return "yes"; // Confirm
      if (choiceNum === "2") return "__ROUTE__BIGWHY_REFINE__"; // Refine further
    }
    if (prevAction === "ASK") {
      // ASK: check menu context
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 3) {
        // Route A: 3 options
        if (choiceNum === "1") return "__ROUTE__BIGWHY_ASK_3_QUESTIONS__";
        if (choiceNum === "2") return "__ROUTE__BIGWHY_GIVE_EXAMPLES__";
        if (choiceNum === "3") return "__ROUTE__BIGWHY_GIVE_EXAMPLE__";
      }
    }
    if (prevAction === "INTRO") {
      // INTRO: 2 options
      if (choiceNum === "1") return "__ROUTE__BIGWHY_GIVE_EXAMPLE__";
      if (choiceNum === "2") return "__ROUTE__BIGWHY_EXPLAIN_IMPORTANCE__";
    }
    if (prevAction === "ESCAPE") {
      // ESCAPE menu
      if (choiceNum === "1") return "__ROUTE__BIGWHY_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__BIGWHY_FINISH_LATER__";
    }
  }

  // Dream step routing
  if (currentStep === DREAM_STEP_ID) {
    if (prevAction === "REFINE") {
      // REFINE met 2-optie menu
      if (choiceNum === "1") return "yes"; // Confirm ("I'm happy with this wording...")
      if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__"; // Start exercise
    }
    if (prevAction === "INTRO") {
      // INTRO: 2 options
      if (choiceNum === "1") return "__ROUTE__DREAM_EXPLAIN_MORE__";
      if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
    }
    if (prevAction === "ASK") {
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 2) {
        const option1Text = choiceLines[0]?.toLowerCase() || "";
        const option2Text = choiceLines[1]?.toLowerCase() || "";

        // ESCAPE menu: Continue / Finish later
        if (option1Text.includes("continue")) {
          if (choiceNum === "1") return "__ROUTE__DREAM_CONTINUE__";
          if (choiceNum === "2") return "__ROUTE__DREAM_FINISH_LATER__";
        }

        // Suggestions menu: "Give me a few dream suggestions"
        if (option1Text.includes("suggestion")) {
          if (choiceNum === "1") return "__ROUTE__DREAM_GIVE_SUGGESTIONS__";
          if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
        }

        // Pick-one menu: "Pick one for me and continue"
        if (option1Text.includes("pick one") || option1Text.includes("choose")) {
          if (choiceNum === "1") return "__ROUTE__DREAM_PICK_ONE__";
          if (choiceNum === "2") return "__ROUTE__DREAM_START_EXERCISE__";
        }

        // Fallback: if option 2 mentions exercise, treat as exercise
        if (choiceNum === "2" && option2Text.includes("exercise")) {
          return "__ROUTE__DREAM_START_EXERCISE__";
        }
      }
    }
  }

  // Role step routing
  if (currentStep === ROLE_STEP_ID) {
    if (prevAction === "REFINE") {
      // REFINE met 2-optie menu
      if (choiceNum === "1") return "yes"; // Confirm ("Yes, this fits.")
      if (choiceNum === "2") return "__ROUTE__ROLE_ADJUST__"; // Adjust
    }
    if (prevAction === "ASK") {
      // ASK: check menu context
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 2) {
        // ESCAPE menu (continue/finish later)
        if (choiceNum === "1") return "__ROUTE__ROLE_CONTINUE__";
        if (choiceNum === "2") return "__ROUTE__ROLE_FINISH_LATER__";
      }
      if (choiceLines.length === 1) {
        // Explain more menu (1 option) - fallback if menu_id not set
        if (choiceNum === "1") return "__ROUTE__ROLE_GIVE_EXAMPLES__";
      }
    }
    if (prevAction === "INTRO") {
      // INTRO: 2 options
      if (choiceNum === "1") return "__ROUTE__ROLE_GIVE_EXAMPLES__";
      if (choiceNum === "2") return "__ROUTE__ROLE_EXPLAIN_MORE__";
    }
  }
  // Entity step routing
  if (currentStep === ENTITY_STEP_ID) {
    if (prevAction === "REFINE") {
      // REFINE: check menu context
      const prevMenuId = (lastSpecialistResult?.menu_id || "").trim();
      if (prevMenuId === "ENTITY_MENU_EXAMPLE") {
        // Example menu (confirm or refine)
        if (choiceNum === "1") return "yes"; // Confirm
        if (choiceNum === "2") return "__ROUTE__ENTITY_REFINE__"; // Refine - generate new formulation
      }
    }
    if (prevAction === "ASK") {
      // ASK: check menu context
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 2) {
        // ESCAPE menu (continue/finish later)
        if (choiceNum === "1") return "__ROUTE__ENTITY_CONTINUE__";
        if (choiceNum === "2") return "__ROUTE__ENTITY_FINISH_LATER__";
      }
    }
    if (prevAction === "INTRO") {
      // INTRO: 2 options
      if (choiceNum === "1") return "__ROUTE__ENTITY_FORMULATE__";
      if (choiceNum === "2") return "__ROUTE__ENTITY_EXPLAIN_MORE__";
    }
  }
  // Strategy step routing
  if (currentStep === STRATEGY_STEP_ID) {
    if (prevAction === "ASK") {
      // ASK: check menu context
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 2) {
        // ESCAPE menu (continue/finish later)
        if (choiceNum === "1") return "__ROUTE__STRATEGY_CONTINUE__";
        if (choiceNum === "2") return "__ROUTE__STRATEGY_FINISH_LATER__";
      }
      if (choiceLines.length === 2) {
        // Explain more menu (2 options)
        if (choiceNum === "1") return "__ROUTE__STRATEGY_ASK_3_QUESTIONS__";
        if (choiceNum === "2") return "__ROUTE__STRATEGY_GIVE_EXAMPLES__";
      }
    }
    if (prevAction === "INTRO") {
      // INTRO: 1 option
      if (choiceNum === "1") return "__ROUTE__STRATEGY_EXPLAIN_MORE__";
    }
  }
  // Rules of the Game step routing
  if (currentStep === RULESOFTHEGAME_STEP_ID) {
    if (prevAction === "REFINE") {
      // REFINE met 2-optie menu
      if (choiceNum === "1") return "yes"; // Confirm ("Yes, this fits")
      if (choiceNum === "2") return "__ROUTE__RULES_ADJUST__"; // Adjust
    }
    if (prevAction === "ASK") {
      // ASK: check menu context
      const prevQ = pickPrompt(lastSpecialistResult);
      const lines = prevQ.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const choiceLines = lines.filter((l) => /^[1-9]\)/.test(l));
      if (choiceLines.length === 2) {
        // ESCAPE menu (2 options)
        const option1Text = choiceLines[0]?.toLowerCase() || "";
        if (option1Text.includes("continue")) {
          // ESCAPE menu
          if (choiceNum === "1") return "__ROUTE__RULES_CONTINUE__";
          if (choiceNum === "2") return "__ROUTE__RULES_FINISH_LATER__";
        }
      }
      if (choiceLines.length === 1) {
        // Explain more menu (1 option: Give one concrete example)
        const option1Text = choiceLines[0]?.toLowerCase() || "";
        if (option1Text.includes("give") || option1Text.includes("concrete") || option1Text.includes("example")) {
          if (choiceNum === "1") return "__ROUTE__RULES_GIVE_EXAMPLE__";
        }
      }
    }
    if (prevAction === "INTRO") {
      // INTRO: 3 options
      if (choiceNum === "1") return "__ROUTE__RULES_WRITE__";
      if (choiceNum === "2") return "__ROUTE__RULES_EXPLAIN_MORE__";
      if (choiceNum === "3") return "__ROUTE__RULES_GIVE_EXAMPLE__";
    }
  }
  // Presentation step routing
  if (currentStep === PRESENTATION_STEP_ID) {
    if (prevAction === "ESCAPE") {
      // ESCAPE menu
      if (choiceNum === "1") return "__ROUTE__PRESENTATION_CONTINUE__";
      if (choiceNum === "2") return "__ROUTE__PRESENTATION_FINISH_LATER__";
    }
    if (prevAction === "INTRO" || prevAction === "ASK") {
      // INTRO/ASK: 2 options (change/make)
      if (choiceNum === "1") return "__ROUTE__PRESENTATION_CHANGE__";
      if (choiceNum === "2") return "__ROUTE__PRESENTATION_MAKE__";
    }
  }
  // Fallback: unknown combination, pass through as choice token (for debugging)
  return choiceToken;
}

function expandChoiceFromPreviousQuestion(userMsg: string, prevQuestion: string): string {
  const t = String(userMsg ?? "").trim();
  if (t !== "1" && t !== "2" && t !== "3") return userMsg; // safe for future 3-option menus

  const q = String(prevQuestion ?? "");
  if (!q) return userMsg;

  const lines = q.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const wanted = `${t})`;
  for (const line of lines) {
    // Match "1) something" or "1. something"
    const m = line.match(/^([123])[\)\.]\s*(.+?)\s*$/);
    if (m && `${m[1]})` === wanted) {
      return m[2].trim();
    }
  }

  return userMsg;
}

function isClearYes(userMessage: string): boolean {
  const tRaw = String(userMessage ?? "").trim();
  if (!tRaw) return false;

  // Always accept explicit option click.
  if (tRaw === "1") return true;

  // Only treat very short replies as "clear yes" to avoid accidental triggers.
  const t = tRaw.toLowerCase();
  if (t.length > 24) return false;

  const yesPhrases = new Set([
    "yes", "y", "yeah", "yep", "sure", "ok", "okay", "k", "continue", "go on",
  ]);

  return yesPhrases.has(t);
}

/** Only flag explicit injection markers; never flag bullets/requirements/goals (business brief). */
function looksLikeMetaInstruction(userMessage: string): boolean {
  const t = String(userMessage ?? "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const injectionMarkers = [
    "system:",
    "assistant:",
    "ignore previous instructions",
    "ignore all previous",
    "disregard previous",
    "you are chatgpt",
    "you are a model",
    "you are an ai",
    "pretend you are",
    "roleplay as",
    "act as ",
  ];
  return injectionMarkers.some((m) => lower.includes(m));
}

function extractUserMessageFromWrappedInput(raw: string): string {
  const t = String(raw ?? "");
  if (!t.trim()) return "";

  // Common wrapper used by planners / orchestrators:
  // "CURRENT_STEP_ID: step_0 | USER_MESSAGE: <text>"
  const m1 = t.match(/\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
  if (m1 && typeof m1[1] === "string") return m1[1].trim();

  // Sometimes the wrapper is multi-line and includes "PLANNER_INPUT:".
  const m2 = t.match(/\bPLANNER_INPUT\s*:\s*[\s\S]*?\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
  if (m2 && typeof m2[1] === "string") return m2[1].trim();

  // Otherwise, return empty to indicate "no extraction happened".
  return "";
}

const LANGUAGE_CONFIDENCE_THRESHOLD = 0.8;
const LANGUAGE_MIN_ALPHA = 8;
let cld3FactoryPromise: Promise<any> | null = null;
let cld3Identifier: any | null = null;

async function getCld3Identifier(): Promise<any> {
  if (cld3Identifier) return cld3Identifier;
  if (!cld3FactoryPromise) {
    cld3FactoryPromise = loadCld3();
  }
  const factory = await cld3FactoryPromise;
  cld3Identifier = factory.create(0, 512);
  return cld3Identifier;
}

function normalizeLangCode(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || s === "und") return "";
  return s.split(/[-_]/)[0] || "";
}

function countAlphaChars(input: string): number {
  const s = String(input || "");
  const matches = s.match(/\p{L}/gu);
  return matches ? matches.length : 0;
}

async function detectLanguageHeuristic(text: string): Promise<{ lang: string; confident: boolean }> {
  const raw = String(text ?? "").trim();
  if (!raw) return { lang: "", confident: false };

  try {
    const id = await getCld3Identifier();
    const res = id.findLanguage(raw) || {};
    const lang = normalizeLangCode(res.language);
    const prob =
      typeof res.probability === "number" ? res.probability :
      typeof res.prob === "number" ? res.prob : 0;
    const reliable =
      typeof res.isReliable === "boolean" ? res.isReliable :
      typeof res.is_reliable === "boolean" ? res.is_reliable : false;
    const confident = Boolean(reliable || (prob && prob >= LANGUAGE_CONFIDENCE_THRESHOLD));
    return { lang, confident };
  } catch {
    return { lang: "", confident: false };
  }
}

async function getUiStringsForLang(lang: string, model: string): Promise<Record<string, string>> {
  const normalized = normalizeLangCode(lang) || "en";
  if (normalized === "en") return UI_STRINGS_DEFAULT;
  const cached = UI_STRINGS_CACHE.get(normalized);
  if (cached) return cached;

  if (process.env.TS_NODE_TRANSPILE_ONLY === "true" && process.env.RUN_INTEGRATION_TESTS !== "1") {
    return UI_STRINGS_DEFAULT;
  }

  if (!process.env.OPENAI_API_KEY) return UI_STRINGS_DEFAULT;

  const instructions = [
    "You are a UI translation engine for The Business Strategy Canvas Builder app.",
    "Translate the VALUES to the target LANGUAGE.",
    "Keep KEYS exactly the same.",
    "Return valid JSON only. No markdown. No extra keys. No comments.",
    "Preserve placeholders like N, M, and X exactly as-is.",
    "Do not translate or alter the product name 'The Business Strategy Canvas Builder'; keep it exactly as-is.",
    "Use concise, natural UI wording in the target language.",
  ].join("\n");

  const plannerInput = `LANGUAGE: ${normalized}\nINPUT_JSON:\n${JSON.stringify(UI_STRINGS_DEFAULT)}`;

  try {
    const res = await callStrictJson<Record<string, string>>({
      model,
      instructions,
      plannerInput,
      schemaName: "UiStrings",
      jsonSchema: UiStringsJsonSchema,
      zodSchema: UiStringsZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "UiStrings",
    });
    UI_STRINGS_CACHE.set(normalized, res.data);
    return res.data;
  } catch {
    return UI_STRINGS_DEFAULT;
  }
}

async function ensureUiStringsForState(state: CanvasState, model: string): Promise<CanvasState> {
  const lang = normalizeLangCode(String((state as any).language ?? "")) || "en";
  const existingLang = String((state as any).ui_strings_lang ?? "").trim().toLowerCase();
  const existing = (state as any).ui_strings;
  if (existing && typeof existing === "object" && existingLang === lang && Object.keys(existing).length) {
    return state;
  }
  const ui_strings = await getUiStringsForLang(lang, model);
  return {
    ...(state as any),
    ui_strings,
    ui_strings_lang: lang,
  } as CanvasState;
}

async function ensureLanguageFromUserMessage(state: CanvasState, userMessage: string, model: string): Promise<CanvasState> {
  const msg = String(userMessage ?? "");

  // Explicit user request overrides everything.
  const explicit = msg.trim() ? parseExplicitLanguageOverride(msg) : "";
  if (explicit) {
    const next = {
      ...(state as any),
      language: explicit,
      language_locked: "true",
      language_override: "true",
    } as CanvasState;
    return ensureUiStringsForState(next, model);
  }

  const current = String((state as any).language ?? "").trim().toLowerCase();
  const locked = String((state as any).language_locked ?? "false") === "true";
  const override = String((state as any).language_override ?? "false") === "true";
  if ((override || locked) && current) {
    return ensureUiStringsForState(state, model);
  }

  const alphaCount = countAlphaChars(msg);
  if (alphaCount < LANGUAGE_MIN_ALPHA) {
    return ensureUiStringsForState(state, model);
  }

  const detected = await detectLanguageHeuristic(msg);
  if (!detected.lang) {
    return ensureUiStringsForState(state, model);
  }

  const next = {
    ...(state as any),
    language: detected.lang,
    language_locked: "true",
    language_override: "false",
  } as CanvasState;

  return ensureUiStringsForState(next, model);
}

function parseExplicitLanguageOverride(message: string): string {
  const raw = String(message ?? "").trim().toLowerCase();
  if (!raw) return "";

  // Explicit code form: "language: en" or "lang=de"
  const codeMatch = raw.match(/\b(lang|language)\s*[:=]\s*([a-z]{2,3})\b/);
  if (codeMatch && codeMatch[2]) {
    const code = codeMatch[2].slice(0, 2);
    return code;
  }

  const keywords = [
    "switch", "change", "use", "speak", "language", "lang",
  ];
  const hasKeyword = keywords.some((k) => raw.includes(k));
  if (!hasKeyword) return "";

  const nameMap: Record<string, string> = {
    english: "en",
    german: "de",
    deutsch: "de",
    french: "fr",
    spanish: "es",
    italian: "it",
    portuguese: "pt",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    arabic: "ar",
    hindi: "hi",
    turkish: "tr",
    russian: "ru",
  };

  for (const [name, code] of Object.entries(nameMap)) {
    if (raw.includes(name)) return code;
  }

  return "";
}

function isPristineStateForStart(s: CanvasState): boolean {
  return (
    String(s.current_step) === STEP_0_ID &&
    String((s as any).step_0_final ?? "").trim() === "" &&
    String((s as any).dream_final ?? "").trim() === "" &&
    String((s as any).intro_shown_session ?? "") !== "true" &&
    Object.keys((s as any).last_specialist_result ?? {}).length === 0
  );
}

/**
 * Specialist context block for reliability (used by Presentation and helps other steps avoid guesswork)
 */
function buildSpecialistContextBlock(state: CanvasState): string {
  const safe = (v: any) => String(v ?? "").replace(/\r\n/g, "\n");
  const last =
    state.last_specialist_result && typeof state.last_specialist_result === "object"
      ? JSON.stringify(state.last_specialist_result)
      : "";

  const finals = getFinalsSnapshot(state);
  const finalsLines =
    Object.keys(finals).length === 0
      ? "(none yet)"
      : Object.entries(finals)
          .map(([k, v]) => `- ${k}: ${safe(v)}`)
          .join("\n");

  return `STATE FINALS (canonical; use for recap; do not invent)
${finalsLines}

RECAP RULE: Only include in a recap the finals listed above. Do not add placeholder values for missing steps.

STATE META (do not output this section)
- intro_shown_for_step: ${safe((state as any).intro_shown_for_step)}
- intro_shown_session: ${safe((state as any).intro_shown_session)}
- last_specialist_result_json: ${safe(last)}`;
}

/**
 * Universal recap instruction (language-agnostic; appended to every specialist).
 * Model-driven: when user asks for recap/summary of what is established, set wants_recap=true.
 */
/** Exported for tests (Step 0 unchanged; recap behavior). */
export const RECAP_INSTRUCTION = `UNIVERSAL RECAP (every step)
- If the user asks to summarize or recap what has been established so far (in any wording or language), set wants_recap=true. Do not use language-specific keyword lists; infer from intent.
- When wants_recap=true: set message to show the recap, localized, built ONLY from the finals:
  Start with one line: "This is what we have established so far based on our dialogue:" (localized).
  Then add one blank line (empty line).
  Then show the recap with the following formatting using HTML <strong> tags for labels:
  (1) For step_0_final: parse the pattern "Venture: <venture_type> | Name: <business_name> | Status: <existing|starting>":
     - Format as "<strong>Venture:</strong> <venture_type>" (translate "Venture" to the user's language).
     - Directly below that: "<strong>Name:</strong> <business_name>" (translate "Name" to the user's language). Show this even if business_name is "TBD".
     - Then one blank line (empty line).
  (2) For all other non-empty finals (dream_final, purpose_final, bigwhy_final, role_final, entity_final, strategy_final, targetgroup_final, productsservices_final, rulesofthegame_final): 
      - If the value is a single line: format as "<strong>Label:</strong> <value>" with Label in the user's language (e.g. "Dream:", "Purpose:", "Big Why:", "Role:", "Entity:", "Strategy:", "Target Group:", "Products and Services:", "Rules of the Game:").
      - If the value contains bullets (lines starting with "• " or "- "): format as:
        "<strong>Label:</strong>" on its own line, then each bullet on its own line prefixed with "• " (convert "- " bullets to "• ").
      - If the value contains numbered lines (lines starting with "1.", "2.", "3.", etc. or "1)", "2)", "3)", etc.): format as:
        "<strong>Label:</strong>" on its own line, then each numbered line on its own line (preserve the numbering format).
      - CRITICAL: Each final must be formatted separately. Do NOT combine content from strategy_final, targetgroup_final, productsservices_final, or rulesofthegame_final into one section. Each final has its own label and its own content.
      - After each step, ALWAYS add one blank line (empty line). Skip empty finals.
  Then set question to your normal next question for this step.
- When wants_recap=false: behave as usual.`;

export const LANGUAGE_LOCK_INSTRUCTION = `LANGUAGE OVERRIDE (HARD)
- ALWAYS produce ALL user-facing JSON strings in the LANGUAGE parameter.
- If LANGUAGE is missing or empty: detect language from USER_MESSAGE and use that language.
- Once LANGUAGE is set, keep using it unless the user explicitly requests a different language.
- Do NOT mix languages.
- Do not translate or alter the product name 'The Business Strategy Canvas Builder'; keep it exactly as-is.`;

/**
 * Universal meta vs off-topic policy (steps other than Step 0 only).
 * Appended to every step prompt except step_0. Intent-driven; no language-specific keyword lists.
 * Exported for tests (non-Step0 steps include this block).
 */
export const UNIVERSAL_META_OFFTOPIC_POLICY = `UNIVERSAL_META_OFFTOPIC_POLICY (apply only on steps after Step 0)

1) ALLOWED META (always answer briefly, then return to the step)
Treat as allowed at any time; infer from intent (no language-specific keyword lists):
- Who is Ben Steenstra / why is this method credible / why is it used by companies
- What is the benefit of this step / what is the benefit of the full process
- Requests to recap what we have established so far (use wants_recap above; do not replace that mechanism)
After answering: put the short answer in message, then set question to your normal next question for this step.

BEN STEENSTRA FACTUAL REFERENCE (use when answering Ben/method credibility questions; keep short and non-marketing):
- Ben Steenstra is an entrepreneur, author, executive coach, and public speaker.
- His approach uses a proven canvas connecting purpose, vision, mission, strategy, and values.
- He has experience with large organizations (e.g., Samsung, HTC) and smaller businesses.
- Always include in the answer: www.bensteenstra.com

2) OFF-TOPIC OR NONSENSE (reject with light humor + redirect)
If the user asks something unrelated to The Business Strategy Canvas Builder or the current step:
- Reply in message with a short, light-humored boundary (never insulting, never sarcastic), then redirect.
- Offer ONLY two plain-text outcomes. Do NOT format them as "1) … 2) …" in question or confirmation_question (that may render as buttons). Put the two options in message as bullets, and keep question as a single open question (e.g. "Do you want to continue with the current step, or pause here?").
- The two outcomes: (a) Continue with the current step now. (b) Stop politely—e.g. "No worries—maybe we're not the right fit right now."
- Then set question to your normal next question for this step.`;

/** @deprecated Use UNIVERSAL_META_OFFTOPIC_POLICY. Kept for test backward compatibility. */
export const OFF_TOPIC_POLICY = UNIVERSAL_META_OFFTOPIC_POLICY;

/**
 * Persist state updates consistently (no nulls)
 * Minimal: store finals when the specialist returns CONFIRM with its output field.
 * Exported for unit tests (finals merge / no overwrite).
 */
export function applyStateUpdate(params: {
  prev: CanvasState;
  decision: OrchestratorOutput;
  specialistResult: any;
  showSessionIntroUsed: BoolString;
}): CanvasState {
  const { prev, decision, specialistResult, showSessionIntroUsed } = params;

  const action = String(specialistResult?.action ?? "");
  const next_step = String(decision.current_step ?? "");
  const active_specialist = String(decision.specialist_to_call ?? "");

  let nextState: CanvasState = {
    ...prev,
    current_step: next_step,
    active_specialist,
    last_specialist_result:
      typeof specialistResult === "object" && specialistResult !== null ? specialistResult : {},

    intro_shown_session: showSessionIntroUsed === "true" ? "true" : (prev as any).intro_shown_session,

    // mark a step intro as shown only when the specialist actually outputs INTRO
    intro_shown_for_step: action === "INTRO" ? next_step : (prev as any).intro_shown_for_step,
  };

  // ---- Step 0 ----
  if (next_step === STEP_0_ID) {
    if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
      (nextState as any).step_0_final = specialistResult.step_0.trim();
    }
    if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
      (nextState as any).business_name = specialistResult.business_name.trim();
    }
  }

  // ---- Dream (and DreamExplainer final Dream) ----
  if (next_step === DREAM_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.dream === "string") {
      const v = specialistResult.dream.trim();
      if (v) (nextState as any).dream_final = v;
    }
  }

  // ---- Purpose ----
  if (next_step === PURPOSE_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.purpose === "string") {
      const v = specialistResult.purpose.trim();
      if (v) (nextState as any).purpose_final = v;
    }
  }

  // ---- Big Why ----
  if (next_step === BIGWHY_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.bigwhy === "string") {
      const v = specialistResult.bigwhy.trim();
      if (v) (nextState as any).bigwhy_final = v;
    }
  }

  // ---- Role ----
  if (next_step === ROLE_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.role === "string") {
      const v = specialistResult.role.trim();
      if (v) (nextState as any).role_final = v;
    }
  }

  // ---- Entity ----
  if (next_step === ENTITY_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.entity === "string") {
      const v = specialistResult.entity.trim();
      if (v) (nextState as any).entity_final = v;
    }
  }

  // ---- Strategy ----
  if (next_step === STRATEGY_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.strategy === "string") {
      const v = specialistResult.strategy.trim();
      if (v) (nextState as any).strategy_final = v;
    }
  }

  // ---- Target Group ----
  if (next_step === TARGETGROUP_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.targetgroup === "string") {
      const v = specialistResult.targetgroup.trim();
      // Post-processing: only keep first sentence and enforce max 10 words (final guard; primary responsibility is in the specialist instructions)
      const firstSentence = v.split(/[.!?]/)[0].trim();
      if (firstSentence) {
        const words = firstSentence.split(/\s+/).filter(Boolean);
        const trimmed = words.length > 10 ? words.slice(0, 10).join(" ") : firstSentence;
        (nextState as any).targetgroup_final = trimmed;
      }
    }
  }

  // ---- Products and Services ----
  if (next_step === PRODUCTSSERVICES_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.productsservices === "string") {
      const v = specialistResult.productsservices.trim();
      if (v) (nextState as any).productsservices_final = v;
    }
  }

  // ---- Rules of the Game ----
  if (next_step === RULESOFTHEGAME_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.rulesofthegame === "string") {
      const statementsArray = Array.isArray(specialistResult.statements)
        ? (specialistResult.statements as string[])
        : [];
      const processed = postProcessRulesOfTheGame(statementsArray, 6);
      const bullets = buildRulesOfTheGameBullets(processed.finalRules);

      if (bullets) {
        (nextState as any).rulesofthegame_final = bullets;
      }
    }
  }

  // ---- Presentation ----
  if (next_step === PRESENTATION_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.presentation_brief === "string") {
      const v = specialistResult.presentation_brief.trim();
      if (v) (nextState as any).presentation_brief_final = v;
    }
  }

  return nextState;
}

async function callSpecialistStrict(params: {
  model: string;
  state: CanvasState;
  decision: OrchestratorOutput;
  userMessage: string;
}): Promise<{ specialistResult: any; attempts: number }> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");
  const contextBlock = buildSpecialistContextBlock(state);
  const lang = langFromState(state);

  if (process.env.TS_NODE_TRANSPILE_ONLY === "true" && process.env.RUN_INTEGRATION_TESTS !== "1") {
    const base = {
      action: "ASK",
      message: "",
      question: "Test question",
      refined_formulation: "",
      confirmation_question: "",
      menu_id: "",
      proceed_to_next: "false",
      wants_recap: false,
    };
    const specialistResult =
      specialist === STEP_0_SPECIALIST
        ? { ...base, business_name: "TBD", step_0: "", proceed_to_dream: "false" }
        : base;
    return { specialistResult, attempts: 0 };
  }

  if (specialist === STEP_0_SPECIALIST) {
    const langExplicit = String((state as any).language ?? "").trim();
    const plannerInput = buildStep0SpecialistInput(userMessage, langExplicit ? lang : "");

    const res = await callStrictJson<ValidationAndBusinessNameOutput>({
      model,
      instructions: `${VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}`,
      plannerInput,
      schemaName: "ValidationAndBusinessName",
      jsonSchema: ValidationAndBusinessNameJsonSchema as any,
      zodSchema: ValidationAndBusinessNameZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "ValidationAndBusinessName",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === DREAM_SPECIALIST) {
    const langExplicitDream = String((state as any).language ?? "").trim();
    const plannerInput = buildDreamSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitDream ? lang : ""
    );

    const res = await callStrictJson<DreamOutput>({
      model,
      instructions: `${DREAM_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "Dream",
      jsonSchema: DreamJsonSchema as any,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === DREAM_EXPLAINER_SPECIALIST) {
    const langExplicitExplainer = String((state as any).language ?? "").trim();
    const fromLast = Array.isArray((state as any).last_specialist_result?.statements)
      ? ((state as any).last_specialist_result.statements as string[])
      : [];
    const fromScoring = Array.isArray((state as any).dream_scoring_statements)
      ? ((state as any).dream_scoring_statements as string[])
      : [];
    const previousStatements =
      fromScoring.length >= fromLast.length && fromScoring.length > 0 ? fromScoring : fromLast;
    const dreamAwaitingDirection = String((state as any).dream_awaiting_direction ?? "").trim() === "true";
    const topClusters = dreamAwaitingDirection && Array.isArray((state as any).dream_top_clusters)
      ? ((state as any).dream_top_clusters as { theme: string; average: number }[])
      : undefined;
    const businessContext = dreamAwaitingDirection && topClusters
      ? {
          step_0_final: String((state as any).step_0_final ?? "").trim(),
          business_name: String((state as any).business_name ?? "").trim(),
        }
      : undefined;
    const plannerInput = buildDreamExplainerSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitExplainer ? lang : "",
      previousStatements,
      topClusters,
      businessContext
    );

    const res = await callStrictJson<DreamExplainerOutput>({
      model,
      instructions: `${DREAM_EXPLAINER_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "DreamExplainer",
      jsonSchema: DreamExplainerJsonSchema as any,
      zodSchema: DreamExplainerZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "DreamExplainer",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === PURPOSE_SPECIALIST) {
    const plannerInput = buildPurposeSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PURPOSE_STEP_ID),
      lang
    );

    const res = await callStrictJson<PurposeOutput>({
      model,
      instructions: `${PURPOSE_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "Purpose",
      jsonSchema: PurposeJsonSchema as any,
      zodSchema: PurposeZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Purpose",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === BIGWHY_SPECIALIST) {
    const plannerInput = buildBigWhySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || BIGWHY_STEP_ID),
      lang
    );

    const res = await callStrictJson<BigWhyOutput>({
      model,
      instructions: `${BIGWHY_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "BigWhy",
      jsonSchema: BigWhyJsonSchema as any,
      zodSchema: BigWhyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "BigWhy",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === ROLE_SPECIALIST) {
    const plannerInput = buildRoleSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ROLE_STEP_ID),
      lang
    );

    const res = await callStrictJson<RoleOutput>({
      model,
      instructions: `${ROLE_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "Role",
      jsonSchema: RoleJsonSchema as any,
      zodSchema: RoleZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Role",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === ENTITY_SPECIALIST) {
    const plannerInput = buildEntitySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ENTITY_STEP_ID),
      lang
    );

    const res = await callStrictJson<EntityOutput>({
      model,
      instructions: `${ENTITY_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "Entity",
      jsonSchema: EntityJsonSchema as any,
      zodSchema: EntityZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Entity",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === STRATEGY_SPECIALIST) {
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildStrategySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || STRATEGY_STEP_ID),
      lang,
      statementsFromLast
    );

    const res = await callStrictJson<StrategyOutput>({
      model,
      instructions: `${STRATEGY_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "Strategy",
      jsonSchema: StrategyJsonSchema as any,
      zodSchema: StrategyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Strategy",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === TARGETGROUP_SPECIALIST) {
    const plannerInput = buildTargetGroupSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || TARGETGROUP_STEP_ID),
      lang,
      contextBlock
    );

    const res = await callStrictJson<TargetGroupOutput>({
      model,
      instructions: `${TARGETGROUP_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "TargetGroup",
      jsonSchema: TargetGroupJsonSchema as any,
      zodSchema: TargetGroupZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "TargetGroup",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === PRODUCTSSERVICES_SPECIALIST) {
    const plannerInput = buildProductsServicesSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRODUCTSSERVICES_STEP_ID),
      lang,
      contextBlock
    );

    const res = await callStrictJson<ProductsServicesOutput>({
      model,
      instructions: `${PRODUCTSSERVICES_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "ProductsServices",
      jsonSchema: ProductsServicesJsonSchema as any,
      zodSchema: ProductsServicesZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "ProductsServices",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === RULESOFTHEGAME_SPECIALIST) {
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildRulesOfTheGameSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || RULESOFTHEGAME_STEP_ID),
      lang,
      statementsFromLast
    );

    const res = await callStrictJson<RulesOfTheGameOutput>({
      model,
      instructions: `${RULESOFTHEGAME_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "RulesOfTheGame",
      jsonSchema: RulesOfTheGameJsonSchema as any,
      zodSchema: RulesOfTheGameZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "RulesOfTheGame",
    });

    let data = res.data;

    // Apply post-processing only when we have a confirmed Rules of the Game list.
    if (data && typeof data === "object" && String((data as any).action) === "CONFIRM") {
      const statementsForProcessing = Array.isArray((data as any).statements)
        ? ((data as any).statements as string[])
        : [];
      const processed = postProcessRulesOfTheGame(statementsForProcessing, 6);
      const bullets = buildRulesOfTheGameBullets(processed.finalRules);

      if (bullets) {
        data = {
          ...(data as any),
          refined_formulation: bullets,
          rulesofthegame: bullets,
        };
      }

      const feedback = buildUserFeedbackForRulesProcessing(processed);
      if (feedback) {
        const baseMessage =
          typeof (data as any).message === "string" ? String((data as any).message).trim() : "";
        (data as any) = {
          ...(data as any),
          message: baseMessage ? `${baseMessage}\n\n${feedback}` : feedback,
        };
      }
    }

    return { specialistResult: data, attempts: res.attempts };
  }

  if (specialist === PRESENTATION_SPECIALIST) {
    const plannerInput = buildPresentationSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRESENTATION_STEP_ID),
      lang
    );

    const res = await callStrictJson<PresentationOutput>({
      model,
      instructions: `${PRESENTATION_INSTRUCTIONS}\n\n${LANGUAGE_LOCK_INSTRUCTION}\n\n${contextBlock}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`,
      plannerInput,
      schemaName: "Presentation",
      jsonSchema: PresentationJsonSchema as any,
      zodSchema: PresentationZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Presentation",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  // Safe fallback: Step 0 ESCAPE payload (language-neutral English here; UI/flow will recover)
  return {
    specialistResult: {
      action: "ESCAPE",
      message: "I can only help you here with The Business Strategy Canvas Builder.",
      question: "Do you want to continue with verification now?",
      refined_formulation: "",
      confirmation_question: "",
      business_name: "TBD",
      proceed_to_dream: "false",
      step_0: "",
    },
    attempts: 0,
  };
}

function shouldChainToNextStep(decision: OrchestratorOutput, specialistResult: any): boolean {
  const step = String(decision.current_step ?? "");
  if (!step) return false;

  // Step 0 uses proceed_to_dream
  if (step === STEP_0_ID && String(specialistResult?.proceed_to_dream ?? "") === "true") return true;

  // Dream + DreamExplainer use proceed_to_purpose
  if (step === DREAM_STEP_ID && String(specialistResult?.proceed_to_purpose ?? "") === "true") return true;

  // Everything else uses proceed_to_next
  if (String(specialistResult?.proceed_to_next ?? "") === "true") return true;

  return false;
}

/**
 * MCP tool implementation (widget-leading)
 *
 * IMPORTANT:
 * - Pre-start UI owns the welcome text.
 * - Start calls this tool with empty user_message; we respond with Step 0 question without calling the specialist.
 */
type RunStepBase = {
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: any;
  registry_version: string;
  ui?: {
    action_codes: string[];
    expected_choice_count: number;
    flags: Record<string, boolean>;
  };
  presentation_assets?: {
    pdf_url: string;
    png_url: string;
    base_name: string;
  };
  state: CanvasState;
  debug?: any;
};
type RunStepSuccess = RunStepBase & { ok: true };
type RunStepError = RunStepBase & { ok: false; error: Record<string, unknown> };

export async function run_step(rawArgs: unknown): Promise<RunStepSuccess | RunStepError> {
  const args: RunStepArgs = RunStepArgsSchema.parse(rawArgs);
  const inputMode = args.input_mode || "chat";
  if (process.env.ACTIONCODE_LOG_INPUT_MODE === "1") {
    console.log("[run_step] input_mode", { inputMode });
  }
  const widgetStrict = process.env.ACTIONCODE_WIDGET_STRICT === "1";
  const allowLegacyRouting = inputMode !== "widget";

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  const rawState = (args.state ?? {}) as Record<string, unknown>;
  const uiTelemetry = (rawState as any).__ui_telemetry;
  if (uiTelemetry && typeof uiTelemetry === "object") {
    console.log("[ui_telemetry]", uiTelemetry);
  }
  const transientTextSubmit = typeof (rawState as any).__text_submit === "string"
    ? String((rawState as any).__text_submit)
    : "";
  const transientPendingScores = Array.isArray((rawState as any).__pending_scores)
    ? (rawState as any).__pending_scores
    : null;

  let state = migrateState(args.state ?? {});
  if ((state as any).__ui_telemetry) {
    delete (state as any).__ui_telemetry;
  }
  const fromArgs = String(rawState?.initial_user_message ?? "").trim();
  if (fromArgs && !String((state as any).initial_user_message ?? "").trim()) {
    (state as any).initial_user_message = fromArgs;
  }
  if (String(rawState?.started ?? "").trim().toLowerCase() === "true") {
    (state as any).started = "true";
  }
  const pristineAtEntry = isPristineStateForStart(state);

  const userMessageRaw = String(args.user_message ?? "");
  const extracted = extractUserMessageFromWrappedInput(userMessageRaw);
  const rawNormalized = extracted ? extracted : userMessageRaw;

  // Never discard the first user message as business context (e.g. long bulleted briefs).
  const userMessageCandidate =
    pristineAtEntry ? rawNormalized : (looksLikeMetaInstruction(rawNormalized) ? "" : rawNormalized);


  // Store the initial user message once. This enables a backend fallback when the widget Start button
  // sends an empty message, but the user already provided an initiator message in the chat.
  if (
    String((state as any).initial_user_message ?? "").trim() === "" &&
    String(userMessageCandidate ?? "").trim() !== "" &&
    !/^[0-9]+$/.test(String(userMessageCandidate ?? "").trim()) &&
    !String(userMessageCandidate ?? "").trim().startsWith("ACTION_")
  ) {
    (state as any).initial_user_message = String(userMessageCandidate).trim();
  }

  // If user clicks a numbered option button, the UI sends ActionCode (new system) or "1"/"2"/"3" or "choice:X" (old system).
  // Process ActionCode first (new hard-coded system), then fall back to old system for backwards compatibility.
  const lastSpecialistResult = (state as any)?.last_specialist_result;
  const prevQ = lastSpecialistResult ? pickPrompt(lastSpecialistResult) : "";

  let actionCodeRaw = userMessageCandidate.startsWith("ACTION_") ? userMessageCandidate : "";
  let userMessage = userMessageCandidate;

  if (actionCodeRaw) {
    const menuId = String(lastSpecialistResult?.menu_id || "").trim();
    if (menuId) {
      const expectedCount = ACTIONCODE_REGISTRY.menus[menuId]?.length;
      console.log("[actioncode_click]", {
        registry_version: ACTIONCODE_REGISTRY.version,
        menu_id: menuId,
        step: String(state.current_step || ""),
        expected_count: expectedCount,
        action_code: actionCodeRaw,
        input_mode: inputMode,
      });
    }
  }

  if (actionCodeRaw === "ACTION_TEXT_SUBMIT") {
    const submitted = String(transientTextSubmit ?? "").trim();
    userMessage = submitted;
    actionCodeRaw = "";
    if (
      String((state as any).initial_user_message ?? "").trim() === "" &&
      submitted &&
      !/^[0-9]+$/.test(submitted)
    ) {
      (state as any).initial_user_message = submitted;
    }
  }

  // If we're at Step 0 with no final yet and the user just typed real text,
  // reset any stale language from previous sessions so language is determined
  // by this first message (not by old widget/browser state).
  const msgForLang = String(userMessage ?? "").trim();
  const isUserTextForLang =
    msgForLang &&
    !/^[0-9]+$/.test(msgForLang) &&
    !msgForLang.startsWith("ACTION_") &&
    !msgForLang.startsWith("__ROUTE__") &&
    !msgForLang.startsWith("choice:");
  if (
    String(state.current_step) === STEP_0_ID &&
    String((state as any).step_0_final ?? "").trim() === "" &&
    isUserTextForLang
  ) {
    const hasOverride = String((state as any).language_override ?? "false") === "true";
    if (!hasOverride) {
      (state as any).language = "";
      (state as any).language_locked = "false";
      (state as any).language_override = "false";
    }
  }

  // SKIP-MODUS (TEST-ONLY) - BEGIN
  // Om te verwijderen: delete dit hele blok (regel X tot Y)
  if (
    (process.env.SKIP_MODE === "1" || true) && // Remove "|| true" voor productie veiligheid
    String(state.current_step) === STEP_0_ID &&
    String(userMessage ?? "").trim().startsWith("SKIP:")
  ) {
    function parseSkipMode(input: string): {
      step0?: { venture: string; name: string; status: "existing" | "starting" };
      dream?: string;
      purpose?: string;
      bigwhy?: string;
      role?: string;
      entity?: string;
      strategy?: string;
      targetgroup?: string;
      productsservices?: string;
      rulesofthegame?: string;
      presentation?: string;
    } {
      const result: {
        step0?: { venture: string; name: string; status: "existing" | "starting" };
        dream?: string;
        purpose?: string;
        bigwhy?: string;
        role?: string;
        entity?: string;
        strategy?: string;
        targetgroup?: string;
        productsservices?: string;
        rulesofthegame?: string;
        presentation?: string;
      } = {};

      // Remove SKIP: prefix
      const content = input.replace(/^SKIP:\s*/i, "").trim();

      // Parse Step 0
      const step0Match = content.match(/Step\s*0:\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Entity|Strategy|Target|Products|Rules|Presentation):|$)/is);
      if (step0Match) {
        const step0Text = step0Match[1].trim();
        // Extract business name from patterns like "called X", "named X", "company X"
        const nameMatch =
          step0Text.match(/called\s+([^.,\n]+)/i) ||
          step0Text.match(/named\s+([^.,\n]+)/i) ||
          step0Text.match(/company\s+([^.,\n]+)/i);
        const name = nameMatch ? nameMatch[1].trim() : "TBD";

        // Extract venture type (everything before "called"/"named"/"company" or first sentence)
        let venture = step0Text
          .replace(/called\s+[^.,\n]+/i, "")
          .replace(/named\s+[^.,\n]+/i, "")
          .replace(/company\s+[^.,\n]+/i, "")
          .trim();
        // Remove common prefixes
        venture = venture.replace(/^(I\s*(?:run|have|own|operate)\s*an?\s*)/i, "").trim();
        venture = venture.replace(/^(I\s*(?:want\s*to\s*)?start\s*(?:an?|a\s*new)?\s*)/i, "").trim();
        if (!venture) venture = "business";

        // Determine status
        const hasRun = /run|have|own|operate/i.test(step0Text);
        const hasStart = /start|want\s*to/i.test(step0Text);
        const status: "existing" | "starting" = hasRun ? "existing" : hasStart ? "starting" : "existing";

        result.step0 = { venture, name, status };
      }

      // Parse other steps (case-insensitive, flexible labels)
      const patterns = [
        { key: "dream", regex: /(?:Dream|dream):\s*(.+?)(?=\n(?:Purpose|Big\s*Why|Role|Entity|Strategy|Target|Products|Rules|Presentation):|$)/is },
        { key: "purpose", regex: /(?:Purpose|purpose):\s*(.+?)(?=\n(?:Dream|Big\s*Why|Role|Entity|Strategy|Target|Products|Rules|Presentation):|$)/is },
        { key: "bigwhy", regex: /(?:Big\s*Why|Big\s*why|big\s*why):\s*(.+?)(?=\n(?:Dream|Purpose|Role|Entity|Strategy|Target|Products|Rules|Presentation):|$)/is },
        { key: "role", regex: /(?:Role|role):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Entity|Strategy|Target|Products|Rules|Presentation):|$)/is },
        { key: "entity", regex: /(?:Entity|entity):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Strategy|Target|Products|Rules|Presentation):|$)/is },
        { key: "strategy", regex: /(?:Strategy|strategy):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Entity|Target|Products|Rules|Presentation):|$)/is },
        { key: "targetgroup", regex: /(?:Target\s*Group|target\s*group|Target\s*group):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Entity|Strategy|Products|Rules|Presentation):|$)/is },
        { key: "productsservices", regex: /(?:Products\s*and\s*Services|products\s*and\s*services|Products\s*and\s*services|Products|products):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Entity|Strategy|Target|Rules|Presentation):|$)/is },
        { key: "rulesofthegame", regex: /(?:Rules\s*of\s*the\s*Game|Rules\s*of\s*the\s*game|rules\s*of\s*the\s*game|Rules|rules):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Entity|Strategy|Target|Products|Presentation):|$)/is },
        { key: "presentation", regex: /(?:Presentation|presentation):\s*(.+?)(?=\n(?:Dream|Purpose|Big\s*Why|Role|Entity|Strategy|Target|Products|Rules):|$)/is },
      ];

      for (const { key, regex } of patterns) {
        const match = content.match(regex);
        if (match) {
          const text = match[1].trim();
          if (text) {
            (result as any)[key] = text;
          }
        }
      }

      return result;
    }

    const parsed = parseSkipMode(String(userMessage ?? "").trim());

    // Update state with parsed values
    if (parsed.step0) {
      const step0Final = `Venture: ${parsed.step0.venture} | Name: ${parsed.step0.name} | Status: ${parsed.step0.status}`;
      (state as any).step_0_final = step0Final;
      (state as any).business_name = parsed.step0.name;
    }

    if (parsed.dream) {
      (state as any).dream_final = parsed.dream;
    }
    if (parsed.purpose) {
      (state as any).purpose_final = parsed.purpose;
    }
    if (parsed.bigwhy) {
      (state as any).bigwhy_final = parsed.bigwhy;
    }
    if (parsed.role) {
      (state as any).role_final = parsed.role;
    }
    if (parsed.entity) {
      (state as any).entity_final = parsed.entity;
    }
    if (parsed.strategy) {
      (state as any).strategy_final = parsed.strategy;
    }
    if (parsed.targetgroup) {
      (state as any).targetgroup_final = parsed.targetgroup;
    }
    if (parsed.productsservices) {
      (state as any).productsservices_final = parsed.productsservices;
    }
    if (parsed.rulesofthegame) {
      const processed = postProcessRulesOfTheGameFromBullets(parsed.rulesofthegame, 6);
      (state as any).rulesofthegame_final = processed.bulletList;
    }
    if (parsed.presentation) {
      (state as any).presentation_brief_final = parsed.presentation;
    }

    // Determine next step based on what was filled in
    // Order: Step 0 → Dream → Purpose → Big Why → Role → Entity → Strategy → Target Group → Products and Services → Rules of the Game → Presentation
    // If only Step 0 is filled, go to Purpose (Dream is skipped)
    let nextStep: string = String(PURPOSE_STEP_ID);
    if (parsed.dream) {
      nextStep = String(PURPOSE_STEP_ID);
    }
    if (parsed.dream && parsed.purpose) {
      nextStep = String(BIGWHY_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy) {
      nextStep = String(ROLE_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role) {
      nextStep = String(ENTITY_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role && parsed.entity) {
      nextStep = String(STRATEGY_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role && parsed.entity && parsed.strategy) {
      nextStep = String(TARGETGROUP_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role && parsed.entity && parsed.strategy && parsed.targetgroup) {
      nextStep = String(PRODUCTSSERVICES_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role && parsed.entity && parsed.strategy && parsed.targetgroup && parsed.productsservices) {
      nextStep = String(RULESOFTHEGAME_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role && parsed.entity && parsed.strategy && parsed.targetgroup && parsed.productsservices && parsed.rulesofthegame) {
      nextStep = String(PRESENTATION_STEP_ID);
    }
    if (parsed.dream && parsed.purpose && parsed.bigwhy && parsed.role && parsed.entity && parsed.strategy && parsed.targetgroup && parsed.productsservices && parsed.rulesofthegame && parsed.presentation) {
      nextStep = String(PRESENTATION_STEP_ID); // Already at last step
    }

    // Update current_step and intro_shown_for_step
    state.current_step = nextStep;
    (state as any).intro_shown_for_step = ""; // Reset so intro will be shown for new step
    (state as any).started = "true";

    // Return early with updated state to go to new step
    // This simulates arriving at the new step with empty message (triggers intro)
    // IMPORTANT: This return ONLY happens inside the SKIP-modus block, so it has ZERO impact on normal flow
    // Ensure language is set from the SKIP input
    state = await ensureLanguageFromUserMessage(state, String(userMessage ?? "").trim(), model);
    const lang = langFromState(state);

    // Orchestrate to determine which specialist to call
    const decision = orchestrate({ state, userMessage: "" });
    // Call the specialist with empty message to get intro
    const callResult = await callSpecialistStrict({
      model,
      state,
      decision,
      userMessage: "",
    });

    // Update state with specialist result
    const nextState = applyStateUpdate({
      prev: state,
      decision,
      specialistResult: callResult.specialistResult,
      showSessionIntroUsed: "false",
    });

    // Build output
    const text = buildTextForWidget({ specialist: callResult.specialistResult });
    const prompt = pickPrompt(callResult.specialistResult);

    return attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(nextState.current_step),
      active_specialist: String((nextState as any).active_specialist || ""),
      text,
      prompt,
      specialist: callResult.specialistResult,
      state: nextState,
      debug: {
        decision,
        attempts: callResult.attempts,
        language: lang,
        meta_user_message_ignored: false,
      },
    }, callResult.specialistResult);
  }
  // SKIP-MODUS (TEST-ONLY) - END

  let forcedProceed = false;

  function pickFirstNonEmpty(...vals: Array<unknown>): string {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  const BIGWHY_MAX_WORDS = 28;

  function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function pickBigWhyCandidate(result: any): string {
    const fromFinal = typeof result?.bigwhy === "string" ? result.bigwhy.trim() : "";
    if (fromFinal) return fromFinal;
    const fromRefine = typeof result?.refined_formulation === "string" ? result.refined_formulation.trim() : "";
    return fromRefine;
  }

  function buildBigWhyTooLongFeedback(lang: string): any {
    const isNl = String(lang || "").toLowerCase().startsWith("nl");
    const message = isNl
      ? "Je formulering is langer dan 28 woorden. Kort en bondig is duidelijker, dus graag een compacte versie."
      : "Your formulation is longer than 28 words. Short and clear is better, so please provide a compact version.";
    const question = isNl
      ? "Wil je het herschrijven tot maximaal 28 woorden?"
      : "Can you rewrite it in 28 words or fewer?";
    return {
      action: "REFINE",
      message,
      question,
      refined_formulation: "",
      confirmation_question: "",
      bigwhy: "",
      menu_id: "",
      proceed_to_next: "false",
      wants_recap: false,
    };
  }

  function requireFinalValue(stepId: string, prev: any, stateObj: CanvasState): { field: string; value: string } {
    if (stepId === STEP_0_ID) {
      return { field: "step_0_final", value: pickFirstNonEmpty(prev.step_0, (stateObj as any).step_0_final) };
    }
    if (stepId === DREAM_STEP_ID) {
      return { field: "dream_final", value: pickFirstNonEmpty(prev.dream, prev.refined_formulation, (stateObj as any).dream_final) };
    }
    if (stepId === PURPOSE_STEP_ID) {
      return { field: "purpose_final", value: pickFirstNonEmpty(prev.purpose, prev.refined_formulation, (stateObj as any).purpose_final) };
    }
    if (stepId === BIGWHY_STEP_ID) {
      return { field: "bigwhy_final", value: pickFirstNonEmpty(prev.bigwhy, prev.refined_formulation, (stateObj as any).bigwhy_final) };
    }
    if (stepId === ROLE_STEP_ID) {
      return { field: "role_final", value: pickFirstNonEmpty(prev.role, prev.refined_formulation, (stateObj as any).role_final) };
    }
    if (stepId === ENTITY_STEP_ID) {
      return { field: "entity_final", value: pickFirstNonEmpty(prev.entity, prev.refined_formulation, (stateObj as any).entity_final) };
    }
    if (stepId === STRATEGY_STEP_ID) {
      return { field: "strategy_final", value: pickFirstNonEmpty(prev.strategy, prev.refined_formulation, (stateObj as any).strategy_final) };
    }
    if (stepId === TARGETGROUP_STEP_ID) {
      return { field: "targetgroup_final", value: pickFirstNonEmpty(prev.targetgroup, prev.refined_formulation, (stateObj as any).targetgroup_final) };
    }
    if (stepId === PRODUCTSSERVICES_STEP_ID) {
      return { field: "productsservices_final", value: pickFirstNonEmpty(prev.productsservices, prev.refined_formulation, (stateObj as any).productsservices_final) };
    }
    if (stepId === RULESOFTHEGAME_STEP_ID) {
      return { field: "rulesofthegame_final", value: pickFirstNonEmpty(prev.rulesofthegame, prev.refined_formulation, (stateObj as any).rulesofthegame_final) };
    }
    if (stepId === PRESENTATION_STEP_ID) {
      return { field: "presentation_brief_final", value: pickFirstNonEmpty(prev.presentation_brief, prev.refined_formulation, (stateObj as any).presentation_brief_final) };
    }
    return { field: "", value: "" };
  }

  function normalizeConfirmFinals(stepId: string, result: any, currentState: CanvasState, langCode: string): any {
    if (!result || String(result.action || "") !== "CONFIRM") return result;

    const confirmationPrompt =
      String(result.confirmation_question ?? "").trim() || String(result.question ?? "").trim();
    if (!confirmationPrompt) return result;

    if (stepId === STEP_0_ID) {
      const step0 = String(result.step_0 ?? "").trim();
      if (step0) return result;
      const businessName = String(result.business_name ?? (currentState as any).business_name ?? "TBD").trim() || "TBD";
      return {
        ...result,
        action: "ASK",
        message: "",
        question: step0QuestionForLang(langCode),
        confirmation_question: "",
        business_name: businessName,
        step_0: "",
        proceed_to_dream: "false",
      };
    }

    const refined = String(result.refined_formulation ?? "").trim();
    if (refined) {
      if (stepId === DREAM_STEP_ID) return { ...result, dream: refined };
      if (stepId === PURPOSE_STEP_ID) return { ...result, purpose: refined };
      if (stepId === BIGWHY_STEP_ID) return { ...result, bigwhy: refined };
      if (stepId === ROLE_STEP_ID) return { ...result, role: refined };
      if (stepId === ENTITY_STEP_ID) return { ...result, entity: refined };
      if (stepId === STRATEGY_STEP_ID) return { ...result, strategy: refined };
      if (stepId === TARGETGROUP_STEP_ID) {
        // Post-processing: only keep first sentence for targetgroup
        const firstSentence = refined.split(/[.!?]/)[0].trim();
        return { ...result, targetgroup: firstSentence + (refined.match(/[.!?]/) ? refined.match(/[.!?]/)?.[0] : ".") };
      }
      if (stepId === PRODUCTSSERVICES_STEP_ID) return { ...result, productsservices: refined };
      if (stepId === RULESOFTHEGAME_STEP_ID) return { ...result, rulesofthegame: refined };
      if (stepId === PRESENTATION_STEP_ID) return { ...result, presentation_brief: refined };
    }

    return {
      ...result,
      action: "ASK",
      question: confirmationPrompt,
      confirmation_question: "",
      proceed_to_next: "false",
      proceed_to_purpose: "false",
    };
  }

  // Hard-coded confirm actions: bypass LLM and proceed deterministically.
  const HARD_CONFIRM_ACTIONS = new Set([
    "ACTION_STRATEGY_FINAL_CONTINUE",
    "ACTION_DREAM_REFINE_CONFIRM",
    "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
    "ACTION_PURPOSE_REFINE_CONFIRM",
    "ACTION_PURPOSE_CONFIRM_SINGLE",
    "ACTION_BIGWHY_REFINE_CONFIRM",
    "ACTION_ROLE_REFINE_CONFIRM",
    "ACTION_ENTITY_EXAMPLE_CONFIRM",
    "ACTION_TARGETGROUP_POSTREFINE_CONFIRM",
    "ACTION_PRODUCTSSERVICES_CONFIRM",
    "ACTION_RULES_REFINE_CONFIRM",
    "ACTION_CONFIRM_CONTINUE",
  ]);

  if (actionCodeRaw && HARD_CONFIRM_ACTIONS.has(actionCodeRaw)) {
    const stepId = String(state.current_step ?? "");
    const prev = (state as any).last_specialist_result || {};
    const finalInfo = requireFinalValue(stepId, prev, state);
    // If we cannot find a final value, do not hard-confirm; fall back to normal handling.
    if (finalInfo.field && !finalInfo.value) {
      // Leave actionCodeRaw intact; it will be processed to "yes" via processActionCode.
    } else {
      const nextLast = { ...prev, action: "CONFIRM" };

      if (stepId === STEP_0_ID) {
        nextLast.proceed_to_dream = "true";
      } else if (stepId === DREAM_STEP_ID) {
        nextLast.proceed_to_purpose = "true";
        nextLast.suggest_dreambuilder = "false";
      } else {
        // Purpose -> Presentation: proceed one canonical step
        nextLast.proceed_to_next = "true";
      }

      if (finalInfo.field && finalInfo.value) {
        (state as any)[finalInfo.field] = finalInfo.value;
      }

      (state as any).last_specialist_result = nextLast;
      userMessage = "";
      forcedProceed = true;
    }
  }
  // NEW SYSTEM: Check if message is an ActionCode (starts with "ACTION_")
  if (!forcedProceed && userMessage.startsWith("ACTION_")) {
    const actionCodeInput = userMessage;
    const routed = processActionCode(actionCodeInput, state.current_step, state, lastSpecialistResult);
    if (inputMode === "widget" && routed === actionCodeInput) {
      const errorPayload = {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as any).active_specialist || ""),
        text: "We could not process this choice. Please refresh and try again.",
        prompt: "",
        specialist: lastSpecialistResult || {},
        state,
        error: {
          type: "unknown_actioncode",
          action_code: actionCodeInput,
          strict: widgetStrict,
        },
      };
      if (widgetStrict) {
        throw new Error(`Unknown ActionCode in widget mode: ${actionCodeInput}`);
      }
      return attachRegistryPayload(errorPayload, lastSpecialistResult);
    }
    userMessage = routed;
  } else if (allowLegacyRouting && userMessage.match(/^choice:[1-9]$/)) {
    // OLD SYSTEM: Map choice:X to explicit route token (100% deterministic)
    userMessage = mapChoiceTokenToRoute(userMessage, state.current_step, lastSpecialistResult);
    // Dream fallback: if no route found, use text expansion
    if (userMessage.match(/^choice:[1-9]$/) && state.current_step === DREAM_STEP_ID) {
      const match = userMessage.match(/^choice:([1-9])$/);
      if (match) {
        userMessage = expandChoiceFromPreviousQuestion(match[1], prevQ);
      }
    }
  } else if (allowLegacyRouting) {
    // Backwards compatibility: expand oude "1"/"2"/"3" format
    userMessage = expandChoiceFromPreviousQuestion(userMessage, prevQ);
  }

  const responseUiFlags = ACTIONCODE_REGISTRY.ui_flags[userMessage] || null;

  // Backend fallback: if Start arrives with empty input, reuse the captured initial message so Step 0 can extract Venture + Name.
  const initialUserMessage = String((state as any).initial_user_message ?? "").trim();
  if (
    userMessage.trim() === "" &&
    initialUserMessage &&
    state.current_step === STEP_0_ID &&
    String((state as any).step_0_final ?? "").trim() === "" &&
    Object.keys((state as any).last_specialist_result ?? {}).length === 0
  ) {
    userMessage = initialUserMessage;
  }

  // Lock language once we see a meaningful user message (prevents mid-flow flips).
  state = await ensureLanguageFromUserMessage(state, userMessage, model);
  const lang = langFromState(state);

  // Presentation: create PPTX on button click (no LLM)
  if (state.current_step === PRESENTATION_STEP_ID && userMessage === "__ROUTE__PRESENTATION_MAKE__") {
    try {
      console.log("[presentation] Generate requested", {
        cwd: process.cwd(),
        hasTemplate: hasPresentationTemplate(),
      });
      const { fileName, filePath } = generatePresentationPptx(state, lang);
      console.log("[presentation] PPTX generated", { fileName, filePath });
      const outDir = path.join(os.tmpdir(), "business-canvas-presentations");
      const pdfPath = convertPptxToPdf(filePath, outDir);
      console.log("[presentation] PDF generated", { pdfPath });
      const pngPath = convertPdfToPng(pdfPath, outDir);
      console.log("[presentation] PNG generated", { pngPath });

      cleanupOldPresentationFiles(outDir, 24 * 60 * 60 * 1000);

      const baseUrl = baseUrlFromEnv();
      const pdfFile = path.basename(pdfPath);
      const pngFile = path.basename(pngPath);
      const pdfUrl = baseUrl ? `${baseUrl}/presentations/${pdfFile}` : `/presentations/${pdfFile}`;
      const pngUrl = baseUrl ? `${baseUrl}/presentations/${pngFile}` : `/presentations/${pngFile}`;

      const message =
        lang.startsWith("nl")
          ? `Je presentatie is klaar.`
          : `Your presentation is ready.`;

      const specialist: PresentationOutput = {
        action: "ASK",
        message,
        question: "",
        refined_formulation: "",
        confirmation_question: "",
        presentation_brief: "",
        menu_id: "",
        proceed_to_next: "false",
        wants_recap: false,
      };

      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: PRESENTATION_SPECIALIST,
        text: buildTextForWidget({ specialist }),
        prompt: "",
        specialist,
        presentation_assets: {
          pdf_url: pdfUrl,
          png_url: pngUrl,
          base_name: path.basename(fileName, ".pptx"),
        },
        state: {
          ...state,
          active_specialist: PRESENTATION_SPECIALIST,
          last_specialist_result: specialist,
        },
      }, specialist, responseUiFlags);
    } catch (err) {
      console.error("[presentation] Generation failed", err);
      const message =
        lang.startsWith("nl")
          ? "Het maken van de presentatie is mislukt. Controleer of de template bestaat en probeer het opnieuw."
          : "Presentation generation failed. Please check that the template exists and try again.";

      const specialist: PresentationOutput = {
        action: "ASK",
        message,
        question: "",
        refined_formulation: "",
        confirmation_question: "",
        presentation_brief: "",
        menu_id: "",
        proceed_to_next: "false",
        wants_recap: false,
      };

      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: PRESENTATION_SPECIALIST,
        text: buildTextForWidget({ specialist }),
        prompt: "",
        specialist,
        state: {
          ...state,
          active_specialist: PRESENTATION_SPECIALIST,
          last_specialist_result: specialist,
        },
      }, specialist, responseUiFlags);
    }
  }

  // Switch back from Dream Explainer to normal Dream: route to Dream specialist, no intro, short prompt to write dream in own words.
  const SWITCH_TO_SELF_DREAM_TOKEN = "__SWITCH_TO_SELF_DREAM__";
  // --------- DREAM EXPLAINER: submit_scores → synthetic Dream-direction ASK (no LLM) ---------
  const isDreamStepExplainer =
    state.current_step === DREAM_STEP_ID &&
    String((state as any).active_specialist ?? "") === DREAM_EXPLAINER_SPECIALIST;
  let parsedScores: number[][] | null = null;
  if (isDreamStepExplainer && userMessage.trim().length > 0) {
    if (userMessage === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
      if (Array.isArray(transientPendingScores)) parsedScores = transientPendingScores as number[][];
    } else {
      try {
        const parsed = JSON.parse(userMessage) as { action?: string; scores?: number[][] };
        if (parsed?.action === "submit_scores" && Array.isArray(parsed.scores)) {
          parsedScores = parsed.scores;
        }
      } catch {
        // not JSON or invalid
      }
    }
  }
  if (isDreamStepExplainer && parsedScores && parsedScores.length > 0) {
    const lastResult = (state as any).last_specialist_result || {};
    const clusters = Array.isArray(lastResult.clusters) ? lastResult.clusters : [];
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const statements =
      statementsFromLast.length > 0
        ? statementsFromLast
        : Array.isArray((state as any).dream_scoring_statements)
          ? (state as any).dream_scoring_statements
          : [];
    if (clusters.length === parsedScores.length && statements.length > 0) {
      type ClusterInfo = { theme: string; statement_indices: number[] };
      const clusterAverages: { theme: string; average: number }[] = clusters.map((c: ClusterInfo, ci: number) => {
        const row = parsedScores![ci] || [];
        const nums = row.map((n) => (typeof n === "number" && !isNaN(n) ? Math.max(1, Math.min(10, n)) : 0)).filter((n) => n > 0);
        const sum = nums.reduce((a, b) => a + b, 0);
        const average = nums.length > 0 ? sum / nums.length : 0;
        return { theme: String((c as any).theme ?? "").trim() || `Category ${ci + 1}`, average };
      });
      const maxAvg = Math.max(...clusterAverages.map((x) => x.average), 0);
      const topClusters = clusterAverages.filter((x) => x.average === maxAvg && x.average > 0);
      const topClusterNames = topClusters.map((x) => x.theme);
      const nextStateScores: CanvasState = {
        ...state,
        last_specialist_result: {
          action: "ASK",
          message: "",
          question: "",
          refined_formulation: "",
          confirmation_question: "",
          dream: "",
          suggest_dreambuilder: "true",
          proceed_to_dream: "false",
          proceed_to_purpose: "false",
          statements,
          user_state: "ok",
          wants_recap: false,
          scoring_phase: "false",
          clusters: [],
        },
      } as CanvasState;
      (nextStateScores as any).dream_scores = parsedScores;
      (nextStateScores as any).dream_top_clusters = topClusters;
      (nextStateScores as any).dream_awaiting_direction = "true";

      // Immediate formulation (Option A): user clicked "Formulate my dream" → agent formulates from clusters + business context, no extra question screen
      const forcedDecision: OrchestratorOutput = {
        specialist_to_call: DREAM_EXPLAINER_SPECIALIST,
        specialist_input: `CURRENT_STEP_ID: ${DREAM_STEP_ID} | USER_MESSAGE: (user chose to continue without text)`,
        current_step: DREAM_STEP_ID,
        intro_shown_for_step: String((state as any).intro_shown_for_step ?? "").trim() || "dream",
        intro_shown_session: String((state as any).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
        show_step_intro: "false",
        show_session_intro: "false",
      };
      const callFormulation = await callSpecialistStrict({
        model,
        state: nextStateScores,
        decision: forcedDecision,
        userMessage: "", // so USER_DREAM_DIRECTION = "(user chose to continue without text)" → Option A
      });
      const formulationResult = callFormulation.specialistResult;
      const nextStateFormulation = applyStateUpdate({
        prev: nextStateScores,
        decision: forcedDecision,
        specialistResult: formulationResult,
        showSessionIntroUsed: "false",
      });
      (nextStateFormulation as any).dream_awaiting_direction = "false";
      const nextStateFormulationUi = await ensureUiStringsForState(nextStateFormulation, model);
      const textFormulation = buildTextForWidget({ specialist: formulationResult });
      const promptFormulation = pickPrompt(formulationResult);
      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(nextStateFormulation.current_step),
        active_specialist: DREAM_EXPLAINER_SPECIALIST,
        text: textFormulation,
        prompt: promptFormulation,
        specialist: formulationResult,
        state: nextStateFormulationUi,
        debug: { submit_scores_handled: true, formulation_direct: true, top_cluster_count: topClusters.length },
      }, formulationResult, responseUiFlags);
    }
  }

  if (userMessage.trim() === SWITCH_TO_SELF_DREAM_TOKEN && state.current_step === DREAM_STEP_ID) {
    (state as any).intro_shown_for_step = "dream";
    const forcedDecision: OrchestratorOutput = {
      specialist_to_call: DREAM_SPECIALIST,
      specialist_input: `CURRENT_STEP_ID: ${DREAM_STEP_ID} | USER_MESSAGE: I want to write my dream in my own words.`,
      current_step: DREAM_STEP_ID,
      intro_shown_for_step: "dream",
      intro_shown_session: String((state as any).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
      show_step_intro: "false",
      show_session_intro: "false",
    };
    const callDream = await callSpecialistStrict({
      model,
      state,
      decision: forcedDecision,
      userMessage: "I want to write my dream in my own words.",
    });
    const nextStateSwitch = applyStateUpdate({
      prev: state,
      decision: forcedDecision,
      specialistResult: callDream.specialistResult,
      showSessionIntroUsed: "false",
    });
    const nextStateSwitchUi = await ensureUiStringsForState(nextStateSwitch, model);
    const textSwitch = buildTextForWidget({ specialist: callDream.specialistResult });
    const promptSwitch = pickPrompt(callDream.specialistResult);
    return attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(nextStateSwitch.current_step),
      active_specialist: DREAM_SPECIALIST,
      text: textSwitch,
      prompt: promptSwitch,
      specialist: callDream.specialistResult,
      state: nextStateSwitchUi,
    }, callDream.specialistResult, responseUiFlags);
  }

  // START trigger (widget start screen)
  const isStartTrigger =
    userMessage.trim() === "" &&
    state.current_step === STEP_0_ID &&
    String((state as any).intro_shown_session) !== "true" &&
    Object.keys((state as any).last_specialist_result ?? {}).length === 0;

  if (isStartTrigger) {
    const started = String((state as any).started ?? "").trim().toLowerCase() === "true";
    if (!started) {
      const stateWithUi = await ensureUiStringsForState(state, model);
      const startHint =
        typeof (stateWithUi as any).ui_strings?.startHint === "string"
          ? String((stateWithUi as any).ui_strings.startHint)
          : "Click Start in the widget to begin.";
      const specialist: ValidationAndBusinessNameOutput = {
        action: "ASK",
        message: "",
        question: startHint,
        refined_formulation: "",
        confirmation_question: "",
        business_name: (state as any).business_name || "TBD",
        menu_id: "",
        proceed_to_dream: "false",
        step_0: "",
        wants_recap: false,
      };
      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: STEP_0_SPECIALIST,
        text: "",
        prompt: specialist.question,
        specialist,
        state: { ...stateWithUi, active_specialist: STEP_0_SPECIALIST, last_specialist_result: specialist },
      }, specialist, responseUiFlags);
    }
    const existingFirst = (state as any).last_specialist_result;
    const isReuseFirst =
      existingFirst &&
      (String(existingFirst.action) === "ASK" || String(existingFirst.action) === "CONFIRM") &&
      (String(existingFirst.question ?? "").trim() !== "" || String(existingFirst.confirmation_question ?? "").trim() !== "");
    if (isReuseFirst) {
      const stateWithUi = await ensureUiStringsForState(state, model);
      (state as any).intro_shown_session = "true";
      const prompt = existingFirst.question?.trim() || existingFirst.confirmation_question?.trim() || "";
      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: STEP_0_SPECIALIST,
        text: "",
        prompt,
        specialist: existingFirst,
        state: { ...stateWithUi, active_specialist: STEP_0_SPECIALIST, last_specialist_result: existingFirst },
      }, existingFirst, responseUiFlags);
    }

    (state as any).intro_shown_session = "true";

    const step0Final = String((state as any).step_0_final ?? "").trim();

    // If Step 0 is already known, show the combined confirmation directly.
    if (step0Final) {
      const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
      const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
      const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);

      const venture = (ventureMatch?.[1] || "venture").trim();
      const name = (nameMatch?.[1] || (state as any).business_name || "TBD").trim();
      const status = (statusMatch?.[1] || "starting").toLowerCase();
      const statement =
        status === "existing"
          ? `You have a ${venture} called ${name}.`
          : `You want to start a ${venture} called ${name}.`;
      const confirmReady =
        " Is that correct, and if so are you ready to start the first step, 'Your Dream'?";

      const specialist: ValidationAndBusinessNameOutput = {
        action: "CONFIRM",
        message: "",
        question: "",
        refined_formulation: "",
        confirmation_question: `${statement}${confirmReady}`,
        business_name: name || "TBD",
        menu_id: "",
        proceed_to_dream: "false",
        step_0: step0Final,
        wants_recap: false,
      };

      const stateWithUi = await ensureUiStringsForState(state, model);
      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: STEP_0_SPECIALIST,
        text: "",
        prompt: specialist.confirmation_question,
        specialist,
        state: {
          ...stateWithUi,
          ...((state as any).started !== "true" ? { started: "true" as const } : {}),
          active_specialist: STEP_0_SPECIALIST,
          last_specialist_result: specialist,
        },
      }, specialist, responseUiFlags);
    }

    // Otherwise: first-time Step 0 setup question.
    const initialMsg = String((state as any).initial_user_message ?? "").trim();
    if (!String((state as any).language ?? "").trim() && initialMsg) {
      state = await ensureLanguageFromUserMessage(state, initialMsg, model);
    }
    const stateWithUi = await ensureUiStringsForState(state, model);
    const specialist: ValidationAndBusinessNameOutput = {
      action: "ASK",
      message: STEP0_CARDDESC_EN,
      question: step0QuestionForLang(langFromState(state)),
      refined_formulation: "",
      confirmation_question: "",
      business_name: (state as any).business_name || "TBD",
      menu_id: "",
      proceed_to_dream: "false",
      step_0: "",
      wants_recap: false,
    };

    return attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(state.current_step),
      active_specialist: STEP_0_SPECIALIST,
      text: "",
      prompt: specialist.question,
      specialist,
      state: {
        ...stateWithUi,
        ...((state as any).started !== "true" ? { started: "true" as const } : {}),
        active_specialist: STEP_0_SPECIALIST,
        last_specialist_result: specialist,
      },
    }, specialist, responseUiFlags);
  }

  // --------- SPEECH-PROOF PROCEED TRIGGER (Step 0 readiness moment only) ---------
  const prev = (state as any).last_specialist_result || {};
  const readinessAsked =
    state.current_step === STEP_0_ID &&
    String(prev?.action ?? "") === "CONFIRM" &&
    typeof prev?.confirmation_question === "string" &&
    prev.confirmation_question.trim() !== "" &&
    String(prev?.proceed_to_dream ?? "") === "false";

  const canProceedFromStep0 =
    readinessAsked && allowLegacyRouting && isClearYes(userMessage) && String((state as any).step_0_final ?? "").trim() !== "";

  if (canProceedFromStep0) {
    const proceedPayload: ValidationAndBusinessNameOutput = {
      action: "CONFIRM",
      message: "",
      question: "",
      refined_formulation: "",
      confirmation_question: "",
      business_name: (state as any).business_name || "TBD",
      menu_id: "",
      proceed_to_dream: "true",
      step_0: (state as any).step_0_final || "",
      wants_recap: false,
    };

    (state as any).active_specialist = STEP_0_SPECIALIST;
    (state as any).last_specialist_result = proceedPayload;
  }

  // --------- CONFIRM SCREEN: deterministic advance to next step (Dream..Presentation only) ---------
  const prevConfirm = (state as any).last_specialist_result || {};
  const confirmAction = String(prevConfirm?.action ?? "") === "CONFIRM";
  const confirmPromptNonEmpty =
    typeof prevConfirm?.confirmation_question === "string" &&
    String(prevConfirm.confirmation_question).trim() !== "";
  const stepId = String(state.current_step ?? "").trim();
  const hasFinal =
    (stepId === DREAM_STEP_ID && String((state as any).dream_final ?? "").trim() !== "") ||
    (stepId === PURPOSE_STEP_ID && String((state as any).purpose_final ?? "").trim() !== "") ||
    (stepId === BIGWHY_STEP_ID && String((state as any).bigwhy_final ?? "").trim() !== "") ||
    (stepId === ROLE_STEP_ID && String((state as any).role_final ?? "").trim() !== "") ||
    (stepId === ENTITY_STEP_ID && String((state as any).entity_final ?? "").trim() !== "") ||
    (stepId === STRATEGY_STEP_ID && String((state as any).strategy_final ?? "").trim() !== "") ||
    (stepId === TARGETGROUP_STEP_ID && String((state as any).targetgroup_final ?? "").trim() !== "") ||
    (stepId === PRODUCTSSERVICES_STEP_ID && String((state as any).productsservices_final ?? "").trim() !== "") ||
    (stepId === RULESOFTHEGAME_STEP_ID &&
      String((state as any).rulesofthegame_final ?? "").trim() !== "") ||
    (stepId === PRESENTATION_STEP_ID &&
      String((state as any).presentation_brief_final ?? "").trim() !== "");
  const confirmDetected = confirmAction && confirmPromptNonEmpty && hasFinal;
  const userAffirmed = allowLegacyRouting && isClearYes(userMessage);

  if (confirmDetected && userAffirmed) {
    const idx = CANONICAL_STEPS.indexOf(stepId as (typeof CANONICAL_STEPS)[number]);
    const nextStepId = idx >= 0 && idx < CANONICAL_STEPS.length - 1 ? CANONICAL_STEPS[idx + 1] : undefined;
    if (nextStepId) {
      const stateForAdvance: CanvasState = {
        ...state,
        current_step: nextStepId,
        last_specialist_result: {},
      } as CanvasState;
      const decision = orchestrate({ state: stateForAdvance, userMessage: "" });
      const call1 = await callSpecialistStrict({
        model,
        state: stateForAdvance,
        decision,
        userMessage: "",
      });
      const nextState = applyStateUpdate({
        prev: stateForAdvance,
        decision,
        specialistResult: call1.specialistResult,
        showSessionIntroUsed: "false",
      });
      const text = buildTextForWidget({ specialist: call1.specialistResult });
      const prompt = pickPrompt(call1.specialistResult);
      return attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(nextState.current_step),
        active_specialist: String((nextState as any).active_specialist || ""),
        text,
        prompt,
        specialist: call1.specialistResult,
        state: nextState,
        debug: {
          decision,
          attempts: call1.attempts,
          language: lang,
          meta_user_message_ignored: false,
        },
      }, call1.specialistResult, responseUiFlags);
    }
  }

  // --------- DREAM READINESS → DREAM EXPLAINER (guard) ----------
  const lastResult = (state as any).last_specialist_result || {};
  const dreamReadinessYes =
    allowLegacyRouting &&
    state.current_step === DREAM_STEP_ID &&
    String(lastResult.suggest_dreambuilder ?? "") === "true" &&
    isClearYes(userMessage);
  const dreamReadinessFallback =
    allowLegacyRouting &&
    state.current_step === DREAM_STEP_ID &&
    isClearYes(userMessage) &&
    String(lastResult.action ?? "") === "ASK" &&
    /ready|start/i.test(String(lastResult.question ?? ""));
  const useDreamExplainerGuard = dreamReadinessYes || dreamReadinessFallback;
  if (useDreamExplainerGuard) {
    const forcedDecision: OrchestratorOutput = {
      specialist_to_call: DREAM_EXPLAINER_SPECIALIST,
      specialist_input: `CURRENT_STEP_ID: ${DREAM_STEP_ID} | USER_MESSAGE: ${userMessage}`,
      current_step: DREAM_STEP_ID,
      intro_shown_for_step: String((state as any).intro_shown_for_step ?? ""),
      intro_shown_session: (state as any).intro_shown_session === "true" ? "true" : "false",
      show_step_intro: "false",
      show_session_intro: "false",
    };
    const callDreamExplainer = await callSpecialistStrict({
      model,
      state,
      decision: forcedDecision,
      userMessage,
    });
    const normalizedDreamExplainer = normalizeConfirmFinals(
      String(forcedDecision.current_step || ""),
      callDreamExplainer.specialistResult,
      state,
      lang
    );
    const nextStateDream = applyStateUpdate({
      prev: state,
      decision: forcedDecision,
      specialistResult: normalizedDreamExplainer,
      showSessionIntroUsed: "false",
    });
    const textDream = buildTextForWidget({ specialist: normalizedDreamExplainer });
    const promptDream = pickPrompt(normalizedDreamExplainer);
    return attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(nextStateDream.current_step),
      active_specialist: String((nextStateDream as any).active_specialist || ""),
      text: textDream,
      prompt: promptDream,
      specialist: normalizedDreamExplainer,
      state: nextStateDream,
      debug: {
        decision: forcedDecision,
        attempts: callDreamExplainer.attempts,
        language: lang,
        meta_user_message_ignored: false,
      },
    }, normalizedDreamExplainer, responseUiFlags);
  }

  // --------- ORCHESTRATE (decision 1) ----------
  const decision1 = orchestrate({ state, userMessage });

  // We do not render a session intro here.
  const showSessionIntro: BoolString = decision1.show_session_intro;

  // --------- CALL SPECIALIST (first) ----------
  const call1 = await callSpecialistStrict({ model, state, decision: decision1, userMessage });
  let attempts = call1.attempts;
  let specialistResult: any = call1.specialistResult;

  // --------- PATCH: DreamExplainer scoring view must have statements ----------
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    String(specialistResult.scoring_phase ?? "") === "true" &&
    (!Array.isArray(specialistResult.statements) || specialistResult.statements.length === 0)
  ) {
    const prevStatements = Array.isArray((state as any).last_specialist_result?.statements)
      ? (state as any).last_specialist_result.statements
      : [];
    if (prevStatements.length > 0) {
      specialistResult = { ...specialistResult, statements: prevStatements };
    }
  }

  // --------- GUARD: scoring view only when at least 20 statements ----------
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    String(specialistResult.scoring_phase ?? "") === "true"
  ) {
    const stmtCount = Array.isArray(specialistResult.statements) ? specialistResult.statements.length : 0;
    if (stmtCount < 20) {
      specialistResult = {
        ...specialistResult,
        scoring_phase: "false",
        clusters: [],
      };
    }
  }

  // --------- CONFIRM NORMALIZATION (ensure finals are present) ----------
  specialistResult = normalizeConfirmFinals(
    String(decision1.current_step || ""),
    specialistResult,
    state,
    lang
  );
  if (String(decision1.current_step || "") === BIGWHY_STEP_ID) {
    const candidate = pickBigWhyCandidate(specialistResult);
    if (candidate && countWords(candidate) > BIGWHY_MAX_WORDS) {
      const shortenRequest = `__SHORTEN_BIGWHY__ ${candidate}`;
      const callShorten = await callSpecialistStrict({
        model,
        state,
        decision: decision1,
        userMessage: shortenRequest,
      });
      attempts = Math.max(attempts, callShorten.attempts);
      specialistResult = normalizeConfirmFinals(
        String(decision1.current_step || ""),
        callShorten.specialistResult,
        state,
        lang
      );
      const shortened = pickBigWhyCandidate(specialistResult);
      if (!shortened || countWords(shortened) > BIGWHY_MAX_WORDS) {
        specialistResult = buildBigWhyTooLongFeedback(lang);
      }
    }
  }

  // --------- FALLBACK: 20+ statements but no scoring view → re-call with "Go to next step" ----------
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    String(specialistResult.scoring_phase ?? "") !== "true"
  ) {
    const stmtCount = Array.isArray(specialistResult.statements) ? specialistResult.statements.length : 0;
    if (stmtCount >= 20) {
      const stateAfterFirst = applyStateUpdate({
        prev: state,
        decision: decision1,
        specialistResult,
        showSessionIntroUsed: "false",
      });
      const decisionNext = orchestrate({
        state: stateAfterFirst,
        userMessage: "Go to next step",
      });
      if (decisionNext.specialist_to_call === DREAM_EXPLAINER_SPECIALIST) {
        const call2 = await callSpecialistStrict({
          model,
          state: stateAfterFirst,
          decision: decisionNext,
          userMessage: "Go to next step",
        });
        if (call2.specialistResult && String(call2.specialistResult.scoring_phase ?? "") === "true") {
          attempts = Math.max(attempts, call2.attempts);
          specialistResult = normalizeConfirmFinals(
            String(decisionNext.current_step || ""),
            call2.specialistResult,
            stateAfterFirst,
            lang
          );
          if (String(decisionNext.current_step || "") === BIGWHY_STEP_ID) {
            const candidate = pickBigWhyCandidate(specialistResult);
            if (!candidate || countWords(candidate) > BIGWHY_MAX_WORDS) {
              specialistResult = buildBigWhyTooLongFeedback(lang);
            }
          }
        }
      }
    }
  }

  // --------- UPDATE STATE (after first specialist) ----------
  let nextState = applyStateUpdate({
    prev: state,
    decision: decision1,
    specialistResult,
    showSessionIntroUsed: "false",
  });
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    String((state as any).dream_awaiting_direction ?? "").trim() === "true"
  ) {
    (nextState as any).dream_awaiting_direction = "false";
  }
  if (
    decision1.specialist_to_call === DREAM_EXPLAINER_SPECIALIST &&
    specialistResult &&
    Array.isArray(specialistResult.statements) &&
    specialistResult.statements.length >= 20
  ) {
    (nextState as any).dream_scoring_statements = specialistResult.statements;
  }

  // --------- OPTIONAL CHAIN: immediate next-step intro on proceed flags ----------
  let finalDecision = decision1;

  if (shouldChainToNextStep(decision1, specialistResult)) {
    const decision2 = orchestrate({ state: nextState, userMessage });

    if (String(decision2.specialist_to_call || "") && String(decision2.current_step || "")) {
      const call2 = await callSpecialistStrict({ model, state: nextState, decision: decision2, userMessage });
      attempts = Math.max(attempts, call2.attempts);
      specialistResult = normalizeConfirmFinals(
        String(decision2.current_step || ""),
        call2.specialistResult,
        nextState,
        lang
      );
      if (String(decision2.current_step || "") === BIGWHY_STEP_ID) {
        const candidate = pickBigWhyCandidate(specialistResult);
        if (!candidate || countWords(candidate) > BIGWHY_MAX_WORDS) {
          specialistResult = buildBigWhyTooLongFeedback(lang);
        }
      }

      nextState = applyStateUpdate({
        prev: nextState,
        decision: decision2,
        specialistResult,
        showSessionIntroUsed: "false",
      });

      finalDecision = decision2;
    }
  }

  const text = buildTextForWidget({ specialist: specialistResult });
  const prompt = pickPrompt(specialistResult);

  // keep state consistent even though we don't render session intro copy here
  if (showSessionIntro === "true" && String((nextState as any).intro_shown_session) !== "true") {
    (nextState as any).intro_shown_session = "true";
  }

  return attachRegistryPayload({
    ok: true as const,
    tool: "run_step" as const,
    current_step_id: String(nextState.current_step),
    active_specialist: String((nextState as any).active_specialist || ""),
    text,
    prompt,
    specialist: specialistResult,
    state: nextState,
    debug: {
      decision: finalDecision,
      attempts,
      language: lang,
      meta_user_message_ignored: looksLikeMetaInstruction(rawNormalized) && pristineAtEntry,
    },
  }, specialistResult, responseUiFlags);
}
