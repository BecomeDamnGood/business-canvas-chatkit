import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source fonts directory does not exist: ${srcDir}`);
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  ensureDir(destDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  const cwd = process.cwd();

  const sourceDir = path.join(cwd, "assets", "presentation_source");
  const zipName = process.env.PRESENTATION_ZIP || "ppt_v1_2.zip";
  const zipPath = path.join(sourceDir, zipName);

  if (!fs.existsSync(zipPath)) {
    throw new Error(
      `Presentation ZIP not found at ${zipPath}. ` +
        "Place the design ZIP (containing presentation.pptx and fonts/ next to it) in assets/presentation_source."
    );
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "presentation-zip-"));
  try {
    // Unzip the source ZIP to a temp directory.
    execFileSync("unzip", ["-q", zipPath, "-d", workDir]);

    // Many design ZIPs wrap assets in a single top-level folder (e.g. ppt_v1/).
    // Detect that and treat that folder as the real root for presentation.pptx + fonts/.
    let rootDir = workDir;
    const entries = fs.readdirSync(workDir, { withFileTypes: true });
    const nonMetaDirs = entries.filter(
      (e) => e.isDirectory() && e.name !== "__MACOSX"
    );
    if (!fs.existsSync(path.join(workDir, "presentation.pptx")) && nonMetaDirs.length === 1) {
      rootDir = path.join(workDir, nonMetaDirs[0].name);
    }

    const pptxPath = path.join(rootDir, "presentation.pptx");
    const fontsDir = path.join(rootDir, "fonts");

    if (!fs.existsSync(pptxPath)) {
      throw new Error(
        `Expected presentation.pptx next to fonts/ in ZIP, but did not find it at ${pptxPath}.`
      );
    }
    if (!fs.existsSync(fontsDir)) {
      throw new Error(
        `Expected fonts directory next to presentation.pptx in ZIP, but did not find it at ${fontsDir}.`
      );
    }

    const targetAssetsDir = path.join(cwd, "assets");
    const targetPptx = path.join(targetAssetsDir, "presentation.pptx");
    const targetFontsDir = path.join(targetAssetsDir, "presentation", "fonts");

    ensureDir(path.dirname(targetPptx));
    copyFile(pptxPath, targetPptx);
    copyDirRecursive(fontsDir, targetFontsDir);

    // Optional log to ease debugging during CI/builds.
    console.log(
      `[prepare-presentation-assets] Prepared template and fonts from ${zipPath} to ${targetPptx} (fonts in ${targetFontsDir})`
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main();

