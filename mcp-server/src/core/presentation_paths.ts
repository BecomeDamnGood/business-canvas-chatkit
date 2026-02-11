import path from "node:path";
import fs from "node:fs";

export function getPresentationTemplatePath(): string {
  const cwd = process.cwd();
  return path.join(cwd, "assets", "presentation.pptx");
}

export function getPresentationFontsDir(): string {
  const templatePath = getPresentationTemplatePath();
  const templateDir = path.dirname(templatePath);
  return path.join(templateDir, "fonts");
}

export function hasPresentationTemplate(): boolean {
  return fs.existsSync(getPresentationTemplatePath());
}

