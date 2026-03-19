export { MENU_LABEL_DEFAULTS } from "../i18n/menu_label_defaults.js";
import { labelKeyForActionCode } from "./ui_contract_matrix.js";

export const MENU_LABEL_KEYS: Record<string, string[]> = {};
export function labelKeyForMenuAction(_menuId: string, actionCode: string, _indexHint?: number): string {
  return labelKeyForActionCode(actionCode);
}
