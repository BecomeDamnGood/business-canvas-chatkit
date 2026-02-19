import { spawnSync } from "node:child_process";

if (!process.env.TS_NODE_AUDIT_BOOTSTRAPPED) {
  const rerun = spawnSync(
    process.execPath,
    ["--loader", "ts-node/esm", new URL(import.meta.url).pathname, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, TS_NODE_AUDIT_BOOTSTRAPPED: "1" },
      cwd: new URL("..", import.meta.url).pathname,
    }
  );
  process.exit(rerun.status ?? 1);
}

const { ACTIONCODE_REGISTRY } = await import("../src/core/actioncode_registry.ts");
const { MENU_LABELS, NEXT_MENU_BY_ACTIONCODE } = await import("../src/core/ui_contract_matrix.ts");

function isEscapedMenu(menuId) {
  return String(menuId || "").trim().endsWith("_MENU_ESCAPE");
}

function normalize(value) {
  return String(value || "").trim();
}

function collectIssues() {
  const issues = [];

  for (const [menuIdRaw, codesRaw] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const menuId = normalize(menuIdRaw);
    const codes = Array.isArray(codesRaw) ? codesRaw : [];
    if (!menuId || isEscapedMenu(menuId)) continue;

    for (let index = 0; index < codes.length; index += 1) {
      const actionCode = normalize(codes[index]);
      if (!actionCode) continue;
      const actionEntry = ACTIONCODE_REGISTRY.actions[actionCode];
      const route = normalize(actionEntry?.route);
      const step = normalize(actionEntry?.step);
      if (!route || step === "system") continue;

      const transition = NEXT_MENU_BY_ACTIONCODE[actionCode];
      if (!transition) {
        issues.push({
          type: "missing_transition",
          action_code: actionCode,
          source_menu_id: menuId,
        });
        continue;
      }

      const transitionStep = normalize(transition.step_id);
      if (transitionStep !== step) {
        issues.push({
          type: "transition_step_mismatch",
          action_code: actionCode,
          source_menu_id: menuId,
          action_step: step,
          transition_step: transitionStep,
        });
        continue;
      }

      const sourceMenus = Array.isArray(transition.from_menu_ids)
        ? transition.from_menu_ids.map((menu) => normalize(menu)).filter(Boolean)
        : [];
      if (sourceMenus.length > 0 && !sourceMenus.includes(menuId)) {
        issues.push({
          type: "source_menu_not_covered",
          action_code: actionCode,
          source_menu_id: menuId,
          declared_sources: sourceMenus,
        });
        continue;
      }

      const renderMode = normalize(transition.render_mode) === "no_buttons" ? "no_buttons" : "menu";
      if (renderMode === "no_buttons") continue;

      const targetMenuId = normalize(transition.to_menu_id);
      if (!targetMenuId) {
        issues.push({
          type: "missing_target_menu",
          action_code: actionCode,
          source_menu_id: menuId,
        });
        continue;
      }

      const targetCodes = ACTIONCODE_REGISTRY.menus[targetMenuId];
      if (!Array.isArray(targetCodes) || targetCodes.length === 0) {
        issues.push({
          type: "invalid_target_menu",
          action_code: actionCode,
          source_menu_id: menuId,
          target_menu_id: targetMenuId,
        });
        continue;
      }

      const sourceLabel = normalize((MENU_LABELS[menuId] || [])[index]);
      const targetLabels = (MENU_LABELS[targetMenuId] || []).map((label) => normalize(label)).filter(Boolean);
      if (sourceLabel && targetLabels.includes(sourceLabel)) {
        issues.push({
          type: "same_button_repeated_after_click",
          action_code: actionCode,
          source_menu_id: menuId,
          target_menu_id: targetMenuId,
          repeated_label: sourceLabel,
        });
      }
    }
  }

  return issues;
}

const issues = collectIssues();
const summary = {
  checked_menus: Object.keys(ACTIONCODE_REGISTRY.menus).length,
  checked_actions: Object.keys(ACTIONCODE_REGISTRY.actions).length,
  issues,
};

const checkMode = process.argv.includes("--check");
if (issues.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  if (checkMode) process.exit(1);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
