import { z } from "zod";

export const LegacyActionCodeZod = z
  .string()
  .regex(/^ACTION_[A-Z0-9_]+$/, "Legacy ActionCode must match ACTION_*");
export type LegacyActionCode = z.infer<typeof LegacyActionCodeZod>;

export const LegacyRouteTokenZod = z
  .string()
  .regex(/^__ROUTE__[A-Z0-9_]+__$/, "Legacy route token must match __ROUTE__*__");
export type LegacyRouteToken = z.infer<typeof LegacyRouteTokenZod>;

export function isLegacyActionCode(input: string): input is LegacyActionCode {
  return LegacyActionCodeZod.safeParse(String(input || "")).success;
}

export function isLegacyRouteToken(input: string): input is LegacyRouteToken {
  return LegacyRouteTokenZod.safeParse(String(input || "")).success;
}

