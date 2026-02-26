import type { CanvasState } from "../core/state.js";

export type UnknownRecord = Record<string, unknown>;
export type MutableCanvasStateRecord = CanvasState & UnknownRecord;

export function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object") return {};
  return value as UnknownRecord;
}

export function asStateRecord(state: CanvasState): MutableCanvasStateRecord {
  return state as MutableCanvasStateRecord;
}

export function readString(value: unknown): string {
  return String(value ?? "");
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

export function isTrueFlag(value: unknown): boolean {
  if (value === true) return true;
  return String(value ?? "").trim().toLowerCase() === "true";
}
