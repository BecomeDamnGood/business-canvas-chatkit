import { inspect } from "node:util";

export function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") return json;
  } catch {}
  try {
    return inspect(value, { depth: 5, breakLength: 120 });
  } catch {}
  return "[unstringifiable]";
}
