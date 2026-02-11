import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve(process.cwd(), "mcp-server", "server.ts"),
  path.resolve(process.cwd(), "server.ts"),
];
const target = candidates.find((p) => existsSync(p));

if (!target) {
  console.error("[scan] server.ts not found");
  process.exit(2);
}

const text = readFileSync(target, "utf8");
const failures = [];

if (/\bString\(/.test(text)) {
  failures.push("Found String(...) usage in server.ts");
}

const unsafeTemplate = /`[^`]*\$\{[^}]*\b(err|error|meta|result|payload|state|req|res)\b[^}]*\}[^`]*`/;
if (unsafeTemplate.test(text)) {
  failures.push("Found template literal interpolation of unsafe variable in server.ts");
}

if (failures.length) {
  console.error("[scan] server.ts safe-string scan failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[scan] server.ts safe-string scan passed");
