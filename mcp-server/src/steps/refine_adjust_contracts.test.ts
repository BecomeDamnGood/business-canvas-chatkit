import test from "node:test";
import assert from "node:assert/strict";

import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { DREAM_EXPLAINER_INSTRUCTIONS } from "./dream_explainer.js";
import { PURPOSE_INSTRUCTIONS } from "./purpose.js";
import { BIGWHY_INSTRUCTIONS } from "./bigwhy.js";
import { ROLE_INSTRUCTIONS } from "./role.js";
import { ENTITY_INSTRUCTIONS } from "./entity.js";
import { RULESOFTHEGAME_INSTRUCTIONS } from "./rulesofthegame.js";

const SCENARIOS = [
  {
    actionCode: "ACTION_DREAM_EXPLAINER_REFINE_ADJUST",
    route: "__ROUTE__DREAM_EXPLAINER_REFINE__",
    menuId: "DREAM_EXPLAINER_MENU_CONFIRM_SINGLE",
    instructions: DREAM_EXPLAINER_INSTRUCTIONS,
    expectations: [/refine the current Dream candidate/i, /action="ASK"/i],
  },
  {
    actionCode: "ACTION_PURPOSE_REFINE_ADJUST",
    route: "__ROUTE__PURPOSE_REFINE__",
    menuId: "PURPOSE_MENU_REFINE",
    instructions: PURPOSE_INSTRUCTIONS,
    expectations: [/output action="REFINE"/i, /different purpose formulation/i],
  },
  {
    actionCode: "ACTION_BIGWHY_REFINE_ADJUST",
    route: "__ROUTE__BIGWHY_REFINE__",
    menuId: "BIGWHY_MENU_REFINE",
    instructions: BIGWHY_INSTRUCTIONS,
    expectations: [/output action="REFINE"/i, /different big why formulation/i],
  },
  {
    actionCode: "ACTION_ROLE_REFINE_ADJUST",
    route: "__ROUTE__ROLE_ADJUST__",
    menuId: "ROLE_MENU_REFINE",
    instructions: ROLE_INSTRUCTIONS,
    expectations: [/output action="ASK"/i, /adjustment question/i],
  },
  {
    actionCode: "ACTION_ENTITY_EXAMPLE_REFINE",
    route: "__ROUTE__ENTITY_REFINE__",
    menuId: "ENTITY_MENU_EXAMPLE",
    instructions: ENTITY_INSTRUCTIONS,
    expectations: [/output action="REFINE"/i, /new, different formulated entity/i],
  },
  {
    actionCode: "ACTION_RULES_REFINE_ADJUST",
    route: "__ROUTE__RULES_ADJUST__",
    menuId: "RULES_MENU_REFINE",
    instructions: RULESOFTHEGAME_INSTRUCTIONS,
    expectations: [/output action="ASK"/i, /adjustment question/i],
  },
] as const;

test("refine-adjust actions stay aligned across visible menu exposure, route mapping, and specialist instructions", () => {
  for (const scenario of SCENARIOS) {
    const registryRoute = ACTIONCODE_REGISTRY.actions[scenario.actionCode];
    assert.ok(registryRoute, `missing action registry entry for ${scenario.actionCode}`);
    assert.equal(registryRoute.route, scenario.route);

    const menuCodes = ACTIONCODE_REGISTRY.menus[scenario.menuId] || [];
    assert.ok(
      menuCodes.includes(scenario.actionCode),
      `${scenario.menuId} should expose ${scenario.actionCode}`
    );

    assert.match(
      scenario.instructions,
      new RegExp(scenario.route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `instructions should mention ${scenario.route}`
    );
    for (const expectation of scenario.expectations) {
      assert.match(scenario.instructions, expectation, `${scenario.actionCode} is missing expected contract text`);
    }
  }
});
