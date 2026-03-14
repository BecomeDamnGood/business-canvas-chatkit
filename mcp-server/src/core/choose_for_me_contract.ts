import {
  STEP_REGISTRY_ORDER,
  type StepRegistryChooseForMeField,
  type StepRegistryChooseForMeItemKind,
  type StepRegistryChooseForMeMode,
  type StepRegistryEntry,
  getChooseForMeRegistryEntry,
} from "../steps/step_registry.js";

export type ChooseForMeMode = StepRegistryChooseForMeMode;
export type ChooseForMeItemKind = StepRegistryChooseForMeItemKind;
export type ChooseForMeField = StepRegistryChooseForMeField;

export type ChooseForMeContract = {
  stepId: string;
  routeToken: string;
  menuId: string;
  actionCode: string;
  nextMenuId: string;
  mode: ChooseForMeMode;
  itemKind: ChooseForMeItemKind;
  field: ChooseForMeField;
};

function toChooseForMeContract(
  entry: StepRegistryEntry & { chooseForMe: NonNullable<StepRegistryEntry["chooseForMe"]> }
): ChooseForMeContract {
  return {
    stepId: entry.stepId,
    routeToken: entry.chooseForMe.routeToken,
    menuId: entry.chooseForMe.menuId,
    actionCode: entry.chooseForMe.actionCode,
    nextMenuId: entry.chooseForMe.nextMenuId,
    mode: entry.chooseForMe.mode,
    itemKind: entry.chooseForMe.itemKind,
    field: entry.chooseForMe.field,
  };
}

export const CHOOSE_FOR_ME_CONTRACTS: readonly ChooseForMeContract[] = STEP_REGISTRY_ORDER
  .map((stepId) => getChooseForMeRegistryEntry(stepId))
  .filter((entry): entry is StepRegistryEntry & { chooseForMe: NonNullable<StepRegistryEntry["chooseForMe"]> } => Boolean(entry))
  .map((entry) => toChooseForMeContract(entry));

export const CHOOSE_FOR_ME_STEP_IDS = CHOOSE_FOR_ME_CONTRACTS.map((contract) => contract.stepId) as readonly string[];

const CHOOSE_FOR_ME_BY_STEP_ID = Object.fromEntries(
  CHOOSE_FOR_ME_CONTRACTS.map((contract) => [contract.stepId, contract])
) as Record<string, ChooseForMeContract>;

const CHOOSE_FOR_ME_BY_MENU_ID = Object.fromEntries(
  CHOOSE_FOR_ME_CONTRACTS.map((contract) => [contract.menuId, contract])
) as Record<string, ChooseForMeContract>;

export function chooseForMeContractForStep(stepId: string): ChooseForMeContract | null {
  const normalized = String(stepId || "").trim();
  return CHOOSE_FOR_ME_BY_STEP_ID[normalized] || null;
}

export function chooseForMeActionCodeForStep(stepId: string): string {
  return chooseForMeContractForStep(stepId)?.actionCode || "";
}

export function chooseForMeRouteTokenForStep(stepId: string): string {
  return chooseForMeContractForStep(stepId)?.routeToken || "";
}

export function chooseForMeContractForMenu(
  stepId: string,
  menuId: string
): ChooseForMeContract | null {
  const contract = CHOOSE_FOR_ME_BY_MENU_ID[String(menuId || "").trim().toUpperCase()];
  if (!contract) return null;
  return contract.stepId === String(stepId || "").trim() ? contract : null;
}
