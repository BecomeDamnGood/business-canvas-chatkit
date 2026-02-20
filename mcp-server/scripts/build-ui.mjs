import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const uiDir = path.join(repoRoot, "ui");
const uiLibDir = path.join(uiDir, "lib");
const assetsDir = path.join(uiDir, "assets");

const templatePath = path.join(uiDir, "step-card.template.html");
const outputPath = path.join(uiDir, "step-card.bundled.html");
const entryPath = path.join(uiLibDir, "main.js");
const GENERATED_BANNER =
  "<!-- AUTO-GENERATED FILE: edit ui/step-card.template.html and ui/lib/*.ts, then run npm run build:ui && node scripts/build-ui.mjs -->";
const INLINE_BUNDLE_RE = /<!--\s*INLINE_BUNDLE(?:[\s\S]*?)?-->/;

const ASSET_MAP = {
  "__ASSET_BG__": "background.jpg",
  "__ASSET_TEXTBOX_BG__": "textbox_background.jpg",
  "__ASSET_SEND_ICON__": "send_icon.svg",
  "__ASSET_HERO_SVG__": "business-model_by_ben-steenstra.svg",
};

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function checkUiLibStaleness() {
  ensureFile(uiLibDir, "ui/lib directory");
  const entries = fs.readdirSync(uiLibDir, { withFileTypes: true });
  const tsFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);

  for (const tsFile of tsFiles) {
    const tsPath = path.join(uiLibDir, tsFile);
    const jsPath = path.join(uiLibDir, tsFile.replace(/\.ts$/, ".js"));
    if (!fs.existsSync(jsPath)) {
      throw new Error(`UI JS is missing for ${tsFile}. Run \"npm run build:ui\" first.`);
    }
    const tsStat = fs.statSync(tsPath);
    const jsStat = fs.statSync(jsPath);
    if (jsStat.mtimeMs < tsStat.mtimeMs) {
      throw new Error(`UI JS is stale for ${tsFile}. Run \"npm run build:ui\" first.`);
    }
  }
}

function mimeForExt(ext) {
  switch (ext) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function readAssetAsDataUri(assetPath) {
  const data = fs.readFileSync(assetPath);
  const ext = path.extname(assetPath).toLowerCase();
  const mime = mimeForExt(ext);
  const base64 = data.toString("base64");
  return `data:${mime};base64,${base64}`;
}

function replaceAll(source, replacements) {
  let out = source;
  for (const [token, value] of Object.entries(replacements)) {
    if (!out.includes(token)) {
      throw new Error(`Template placeholder missing: ${token}`);
    }
    out = out.split(token).join(value);
  }
  return out;
}

async function buildUi() {
  ensureFile(templatePath, "UI template");
  ensureFile(entryPath, "UI entrypoint");

  checkUiLibStaleness();

  const template = fs.readFileSync(templatePath, "utf8");
  if (!INLINE_BUNDLE_RE.test(template)) {
    throw new Error("Template is missing <!-- INLINE_BUNDLE --> placeholder.");
  }

  const buildResult = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "iife",
    write: false,
  });

  const outputFile = buildResult.outputFiles?.[0];
  if (!outputFile || !outputFile.text) {
    throw new Error("esbuild did not return output.");
  }

  const bundledScript = outputFile.text.replace(/<\/script>/g, "<\\/script>");
  const inlineScript = `<script>/* bundled iife */\n${bundledScript}\n</script>`;

  const assetReplacements = {};
  for (const [token, filename] of Object.entries(ASSET_MAP)) {
    const assetPath = path.join(assetsDir, filename);
    ensureFile(assetPath, `asset ${filename}`);
    assetReplacements[token] = readAssetAsDataUri(assetPath);
  }

  let outputHtml = template.replace(INLINE_BUNDLE_RE, inlineScript);
  outputHtml = replaceAll(outputHtml, assetReplacements);
  if (!outputHtml.includes(GENERATED_BANNER)) {
    outputHtml = outputHtml.replace(
      "<!doctype html>",
      `<!doctype html>\n${GENERATED_BANNER}`
    );
  }

  fs.writeFileSync(outputPath, outputHtml, "utf8");
  console.log(`[build-ui] Wrote ${outputPath}`);
}

buildUi().catch((err) => {
  console.error("[build-ui]", err?.message ?? err);
  process.exit(1);
});
