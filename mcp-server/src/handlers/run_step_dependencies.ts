import { type LLMUsage } from "../core/llm.js";
import { resolveModelForCall } from "../core/model_routing.js";
import {
  CURRENT_STATE_VERSION,
  getFinalsSnapshot,
  normalizeState,
  migrateState,
  normalizeStateLanguageSource,
  type CanvasState,
  type ProvisionalSource,
} from "../core/state.js";
import {
  deriveTransitionEventFromLegacy,
  orchestrateFromTransition,
  type OrchestratorOutput,
} from "../core/orchestrator.js";
import { hasPresentationTemplate } from "../core/presentation_paths.js";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  type DreamOutput,
} from "../steps/dream.js";

import { DREAM_EXPLAINER_SPECIALIST } from "../steps/dream_explainer.js";

import {
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
} from "../steps/purpose.js";

import {
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
} from "../steps/bigwhy.js";

import {
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  type RoleOutput,
} from "../steps/role.js";

import {
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
} from "../steps/entity.js";

import {
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
} from "../steps/strategy.js";

import {
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
} from "../steps/targetgroup.js";

import {
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
} from "../steps/productsservices.js";

import {
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
} from "../steps/rulesofthegame.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  type PresentationOutput,
} from "../steps/presentation.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { MENU_LABEL_DEFAULTS, MENU_LABEL_KEYS, labelKeyForMenuAction } from "../core/menu_contract.js";
import {
  renderFreeTextTurnPolicy,
  type TurnPolicyRenderResult,
  type TurnOutputStatus,
} from "../core/turn_policy_renderer.js";
import {
  NEXT_MENU_BY_ACTIONCODE,
  DEFAULT_MENU_BY_STATUS,
  UI_CONTRACT_VERSION,
  buildContractId,
} from "../core/ui_contract_matrix.js";
import { actionCodeToIntent } from "../adapters/actioncode_to_intent.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import { UI_STRINGS_WITH_MENU_KEYS } from "../i18n/ui_strings_defaults.js";

export type {
  LLMUsage,
  CanvasState,
  ProvisionalSource,
  OrchestratorOutput,
  ValidationAndBusinessNameOutput,
  DreamOutput,
  RoleOutput,
  PresentationOutput,
  TurnPolicyRenderResult,
  TurnOutputStatus,
  RenderedAction,
};

export {
  resolveModelForCall,
  CURRENT_STATE_VERSION,
  getFinalsSnapshot,
  normalizeState,
  migrateState,
  normalizeStateLanguageSource,
  deriveTransitionEventFromLegacy,
  orchestrateFromTransition,
  hasPresentationTemplate,
  STEP_0_ID,
  STEP_0_SPECIALIST,
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_EXPLAINER_SPECIALIST,
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  ACTIONCODE_REGISTRY,
  MENU_LABEL_DEFAULTS,
  MENU_LABEL_KEYS,
  labelKeyForMenuAction,
  renderFreeTextTurnPolicy,
  NEXT_MENU_BY_ACTIONCODE,
  DEFAULT_MENU_BY_STATUS,
  UI_CONTRACT_VERSION,
  buildContractId,
  actionCodeToIntent,
  UI_STRINGS_WITH_MENU_KEYS,
};
