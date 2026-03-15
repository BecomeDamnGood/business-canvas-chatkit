import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templatePath = path.join(repoRoot, "ui", "step-card.template.html");
const entryPath = path.join(repoRoot, "ui", "lib", "main.ts");
const outputPath = path.join(repoRoot, "ui", "step-card.bundled.html");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

if (!fs.existsSync(templatePath)) {
  throw new Error(`Missing UI template: ${templatePath}`);
}
if (!fs.existsSync(entryPath)) {
  throw new Error(`Missing UI runtime entrypoint: ${entryPath}`);
}

const template = fs.readFileSync(templatePath, "utf8");
if (!template.includes("__BSC_RUNTIME_SCRIPT__")) {
  throw new Error(`Template is missing __BSC_RUNTIME_SCRIPT__ placeholder: ${templatePath}`);
}

const result = await build({
  absWorkingDir: repoRoot,
  bundle: true,
  charset: "utf8",
  entryPoints: [entryPath],
  format: "iife",
  legalComments: "none",
  minify: false,
  platform: "browser",
  target: ["es2022"],
  write: false,
  banner: {
    js: "/* bundled iife */",
  },
});

if (!result.outputFiles || result.outputFiles.length !== 1) {
  throw new Error("Expected exactly one bundled UI runtime output");
}

const runtimeScript = result.outputFiles[0].text.trim();
const generated = template.replace("__BSC_RUNTIME_SCRIPT__", `\n${runtimeScript}\n    `);

if (checkOnly) {
  const current = fs.readFileSync(outputPath, "utf8");
  if (current !== generated) {
    throw new Error(
      `Generated UI bundle is out of date. Run node scripts/build-ui.mjs to refresh ${path.relative(repoRoot, outputPath)}`
    );
  }
  console.log(`[build-ui] Verified generated UI bundle matches source: ${path.relative(repoRoot, outputPath)}`);
} else {
  fs.writeFileSync(outputPath, generated);
  console.log(`[build-ui] Generated UI bundle from source: ${path.relative(repoRoot, outputPath)}`);
}
