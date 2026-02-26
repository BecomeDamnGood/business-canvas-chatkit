export const UI_CONTRACT_NO_MENU = "NO_MENU";

const UI_CONTRACT_STATUSES = new Set(["no_output", "incomplete_output", "valid_output"]);

export type UiContractStatus = "no_output" | "incomplete_output" | "valid_output";

export type ParsedUiContractId = {
  stepId: string;
  status: string;
  menuId: string;
};

export function isUiContractStatus(statusRaw: unknown): statusRaw is UiContractStatus {
  return UI_CONTRACT_STATUSES.has(String(statusRaw || "").trim());
}

export function buildUiContractId(stepId: string, status: string, menuId: string): string {
  const safeStep = String(stepId || "").trim() || "unknown_step";
  const safeStatus = String(status || "").trim() || "unknown_status";
  const safeMenu = String(menuId || "").trim() || UI_CONTRACT_NO_MENU;
  return `${safeStep}:${safeStatus}:${safeMenu}`;
}

export function parseUiContractId(contractIdRaw: unknown): ParsedUiContractId | null {
  const contractId = String(contractIdRaw || "").trim();
  if (!contractId) return null;
  const parts = contractId.split(":");
  if (parts.length < 3) return null;
  const [stepPart, statusPart, ...menuParts] = parts;
  return {
    stepId: String(stepPart || "").trim(),
    status: String(statusPart || "").trim(),
    menuId: menuParts.join(":").trim(),
  };
}

export function validateUiContractIdForStep(contractIdRaw: unknown, stepId: string): boolean {
  const safeStepId = String(stepId || "").trim();
  if (!safeStepId) return false;
  const parsed = parseUiContractId(contractIdRaw);
  if (!parsed) return false;
  if (parsed.stepId !== safeStepId) return false;
  if (!isUiContractStatus(parsed.status)) return false;
  return Boolean(parsed.menuId);
}

export function parseUiContractMenuForStep(contractIdRaw: unknown, stepId: string): string {
  const safeStepId = String(stepId || "").trim();
  if (!safeStepId) return "";
  const parsed = parseUiContractId(contractIdRaw);
  if (!parsed) return "";
  if (parsed.stepId !== safeStepId) return "";
  if (!parsed.menuId || parsed.menuId === UI_CONTRACT_NO_MENU) return "";
  return parsed.menuId;
}

export function parseUiContractStatusForStep(contractIdRaw: unknown, stepId: string): UiContractStatus | null {
  const safeStepId = String(stepId || "").trim();
  if (!safeStepId) return null;
  const parsed = parseUiContractId(contractIdRaw);
  if (!parsed) return null;
  if (parsed.stepId !== safeStepId) return null;
  if (!isUiContractStatus(parsed.status)) return null;
  return parsed.status;
}
