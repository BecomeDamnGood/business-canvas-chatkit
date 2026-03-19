import test from "node:test";
import assert from "node:assert/strict";

import {
  createRunStepRuntimeFinalizeLayer,
  createRunStepRuntimeTextHelpers,
} from "./run_step_runtime_finalize.js";
import { createCompareRuntimeState } from "./compare_runtime.js";

function buildTextHelpers(compareSelectionMessage: (
  stepId: string,
  _state: any,
  _activeSpecialist?: string,
  _selectedValue?: string
) => string) {
  return createRunStepRuntimeTextHelpers({
    dreamStepId: "dream",
    parseMenuFromContractIdForStep: (contractIdRaw: unknown) => {
      const parts = String(contractIdRaw || "").split(":");
      return String(parts[2] || "").trim();
    },
    canonicalizeComparableText: (value: string) =>
      String(value || "")
        .toLowerCase()
        .replace(/<[^>]+>/g, " ")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    compareSelectionMessage,
    mergeListItems: (userItems: string[], suggestionItems: string[]) => [...userItems, ...suggestionItems],
    splitSentenceItems: (text: string) =>
      String(text || "")
        .split(/(?:[.!?]+\s+|\n+)/)
        .map((line) => line.trim())
        .filter(Boolean),
    sanitizePendingListMessage: (message: string) => String(message || ""),
    isComparePanelCleanBodyV1Enabled: () => false,
    fieldForStep: (stepId: string) => {
      if (stepId === "bigwhy") return "bigwhy";
      if (stepId === "strategy") return "strategy";
      if (stepId === "productsservices") return "productsservices";
      if (stepId === "rulesofthegame") return "rulesofthegame";
      return "";
    },
    stripUnsupportedReformulationClaims: (message: string) => String(message || ""),
    tokenizeWords: (text: string) =>
      String(text || "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean),
    compactComparePanelBody: (message: string) => String(message || ""),
  });
}

function buildFinalizeLayer() {
  let currentState: any = {};
  return {
    setState(state: Record<string, unknown>) {
      currentState = state;
    },
    layer: createRunStepRuntimeFinalizeLayer<Record<string, unknown>>({
      routing: {
        baselineModel: "gpt-5-mini",
        modelRoutingEnabled: false,
        modelRoutingShadow: false,
        getState: () => currentState,
        getActionCodeRaw: () => "",
        deriveIntentTypeForRouting: () => "",
        resolveModelForCall: ({ fallbackModel }) => ({
          applied: false,
          model: fallbackModel,
        }),
        shouldLogLocalDevDiagnostics: () => false,
        isUiTranslationFastModelV1Enabled: () => false,
      },
      i18n: {
        localeHint: "",
        localeHintSource: "none",
        inputMode: "widget",
        isBootstrapPollCall: false,
        uiI18nTelemetry: {},
        isUiI18nV3LangBootstrapEnabled: () => false,
        isUiStartTriggerLangResolveV1Enabled: () => false,
        isInteractiveLocaleReady: () => true,
        normalizeLangCode: (raw) => String(raw || ""),
        ensureUiStringsForState: async (state) => state,
        resolveLanguageForTurn: async (state) => state,
        isLanguageResolvedThisTurn: () => false,
      },
      response: {
        tokenLoggingEnabled: false,
        baselineModel: "gpt-5-mini",
        parseMenuFromContractIdForStep: () => "",
        labelKeysForMenuActionCodes: () => [],
        onUiParityError: () => {},
        attachRegistryPayload: (payload) => payload,
        uiI18nTelemetry: {},
        getMigrationApplied: () => false,
        getMigrationFromVersion: () => "",
        getBlockingMarkerClass: () => "none",
        resolveTurnTokenUsage: () => ({
          usage: {
            input_tokens: null,
            output_tokens: null,
            total_tokens: null,
            provider_available: false,
          },
          attempts: 0,
          models: [],
        }),
        getDreamRuntimeMode: (state) => String((state as Record<string, unknown>).__dream_runtime_mode || ""),
        getDreamStepId: () => "dream",
        getDreamExplainerSpecialist: () => "DreamExplainer",
        buildTextForWidget: () => "",
        deriveSuggestionStateForWidget: () => null,
        pickPrompt: () => "",
        renderFreeTextTurnPolicy: ({ state, specialist }) => ({
          state,
          specialist,
          renderedStatus: "valid_output",
          actionCodes: [],
          renderedActions: [],
          contractMeta: {
            contractId: "",
            contractVersion: "v1",
            textKeys: [],
          },
        }),
        validateRenderedContractOrRecover: ({ rendered, state }) => ({
          rendered,
          state,
          violation: null,
        }),
        applyUiPhaseByStep: () => {},
      },
    }),
  };
}

test("buildTextForWidget uses formatted strategy body with bullets from wording selection", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "strategy") return "";
    return [
      "Je huidige strategie voor Mindd is:",
      "",
      "• Focus op enterprise-opdrachten",
      "• Inzetten op langdurige samenwerkingen",
      "• Overpresteren via netwerkprojecten",
      "• Prioriteit voor investeringsbereidheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_QUESTIONS:v1",
      message: "Korte toelichting.",
      refined_formulation:
        "Focus op enterprise-opdrachten Inzetten op langdurige samenwerkingen Overpresteren via netwerkprojecten Prioriteit voor investeringsbereidheid",
      strategy:
        "Focus op enterprise-opdrachten Inzetten op langdurige samenwerkingen Overpresteren via netwerkprojecten Prioriteit voor investeringsbereidheid",
    },
    state: {
      active_specialist: "Strategy",
      current_step: "strategy",
    } as any,
  });

  assert.match(output, /Je huidige strategie voor Mindd is:/);
  assert.match(output, /• Focus op enterprise-opdrachten/);
  assert.match(output, /• Prioriteit voor investeringsbereidheid/);
});

test("buildTextForWidget keeps products/services list formatting when heading+body are provided", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "productsservices") return "";
    return [
      "De huidige producten en diensten van Mindd zijn",
      "• Strategische sessies",
      "• Leiderschapscoaching",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "productsservices:ASK:PRODUCTSSERVICES_MENU_QUESTIONS:v1",
      message: "Context.",
      refined_formulation: "Strategische sessies Leiderschapscoaching",
      productsservices: "Strategische sessies Leiderschapscoaching",
    },
    state: {
      active_specialist: "ProductsAndServices",
      current_step: "productsservices",
    } as any,
  });

  assert.match(output, /De huidige producten en diensten van Mindd zijn/);
  assert.match(output, /• Strategische sessies/);
  assert.match(output, /• Leiderschapscoaching/);
});

test("buildTextForWidget keeps rules-of-the-game bullets when selecting suggestion", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "rulesofthegame") return "";
    return [
      "De Spelregels van Mindd:",
      "",
      "• We leveren op afspraken",
      "• We spreken conflicten direct uit",
      "• We kiezen kwaliteit boven snelheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "rulesofthegame:ASK:RULESOFTHEGAME_MENU_QUESTIONS:v1",
      message: "Startpunt.",
      refined_formulation:
        "We leveren op afspraken We spreken conflicten direct uit We kiezen kwaliteit boven snelheid",
      rulesofthegame:
        "We leveren op afspraken We spreken conflicten direct uit We kiezen kwaliteit boven snelheid",
    },
    state: {
      active_specialist: "RulesOfTheGame",
      current_step: "rulesofthegame",
    } as any,
  });

  assert.match(output, /De Spelregels van Mindd:/);
  assert.match(output, /• We leveren op afspraken/);
  assert.match(output, /• We kiezen kwaliteit boven snelheid/);
});

test("buildTextForWidget always shows current heading for Big Why when message only contains formulation", () => {
  const heading = "JE HUIDIGE GROTE WAAROM VOOR MINDD IS:";
  const formulation =
    "Mensen zouden altijd toegang moeten hebben tot eerlijke en volledige informatie, zodat zij zelfstandig en met vertrouwen keuzes kunnen maken die hun leven verrijken.";
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "bigwhy") return "";
    return [heading, "", formulation].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "bigwhy:ASK:BIGWHY_MENU_QUESTIONS:v1",
      message: formulation,
      refined_formulation: formulation,
      bigwhy: formulation,
    },
    state: {
      active_specialist: "BigWhy",
      current_step: "bigwhy",
    } as any,
  });

  assert.match(output, new RegExp(heading));
  assert.match(output, /Mensen zouden altijd toegang moeten hebben/);
});

test("buildTextForWidget normalizes structured suggestion menus into heading, bullets, and outro", () => {
  const helpers = buildTextHelpers(() => "");
  const scenarios = [
    {
      contract: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
      stepId: "dream",
      message: "fallback",
      suggestionIntro: "Here are three examples of a Dream for an advertising agency like Mindd.",
      expectedHeading: "Here are three examples of a Dream for an advertising agency like Mindd:",
      expectedItems: [
        "Mindd dreams of a world in which creative ideas help brands connect with people on a deeper, more meaningful level.",
        "Mindd dreams of a world in which advertising inspires trust and brings genuine value to everyday lives.",
        "Mindd dreams of a world in which brands communicate with honesty, making people feel understood and respected.",
      ],
      expectedOutro: "I hope these suggestions inspire you to write your own Dream.",
    },
    {
      contract: "bigwhy:ASK:BIGWHY_MENU_FROM_GIVE:v1",
      stepId: "bigwhy",
      message: "fallback",
      suggestionIntro: "Here are three Big Why suggestions for Mindd, each reflecting the deeper meaning behind your Dream and Purpose.",
      expectedHeading: "Here are three Big Why suggestions for Mindd, each reflecting the deeper meaning behind your Dream and Purpose:",
      expectedItems: [
        "People should feel more deeply understood by the messages that shape their choices.",
        "Communication should strengthen trust between brands and the people they serve.",
        "Creative work should move culture toward more honest and human connection.",
      ],
      expectedOutro: "I hope these suggestions inspire you to write your own Big Why.",
    },
    {
      contract: "role:ASK:ROLE_MENU_EXAMPLES:v1",
      stepId: "role",
      message: "fallback",
      suggestionIntro: "Here are three examples of a Role for an advertising agency like Mindd.",
      expectedHeading: "Here are three examples of a Role for an advertising agency like Mindd:",
      expectedItems: [
        "Mindd connects brands and people by translating creative ideas into meaningful experiences that foster genuine connection.",
        "Mindd aligns business goals with human insight, ensuring every campaign bridges the gap between brands and their audiences.",
        "Mindd translates complex brand messages into relatable stories, making it easier for people to feel understood and valued.",
      ],
      expectedOutro: "I hope these suggestions inspire you to write your own Role.",
    },
    {
      contract: "entity:ASK:ENTITY_MENU_SUGGESTIONS:v1",
      stepId: "entity",
      message: "fallback",
      suggestionIntro: "Here are three examples of an Entity for an advertising agency like Mindd.",
      expectedHeading: "Here are three examples of an Entity for an advertising agency like Mindd:",
      expectedItems: [
        "A creative brand agency",
        "An experiential marketing studio",
        "A purpose-driven advertising collective",
      ],
      expectedOutro: "I hope these suggestions inspire you to write your own Entity.",
    },
    {
      contract: "bigwhy:ASK:BIGWHY_MENU_FROM_GIVE:v1",
      stepId: "bigwhy",
      message: "fallback",
      suggestionIntro:
        "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD",
      expectedHeading:
        "HIER ZIJN DRIE MOGELIJKE GROTE WAAROM-FORMULERINGEN DIE PASSEN BIJ DE DROOM EN BESTAANSREDEN VAN MINDD:",
      expectedItems: [
        "Mensen verdienen het om zich gezien en geraakt te voelen, zodat ze hun volledige potentieel kunnen ontdekken en benutten.",
        "Echte verbinding en oprechte inspiratie zorgen ervoor dat mensen boven zichzelf uitstijgen, ongeacht hun achtergrond of omstandigheden.",
        "Wanneer merken mensen oprecht raken, ontstaat er ruimte voor persoonlijke groei en langdurige positieve verandering in de samenleving.",
      ],
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen Grote Waarom te schrijven.",
    },
    {
      contract: "purpose:ASK:PURPOSE_MENU_EXAMPLES:v1",
      stepId: "purpose",
      message: "fallback",
      suggestionIntro: "HIER ZIJN DRIE MOGELIJKE FORMULERINGEN VOOR DE BESTAANSREDEN VAN MINDD",
      expectedHeading: "HIER ZIJN DRIE MOGELIJKE FORMULERINGEN VOOR DE BESTAANSREDEN VAN MINDD:",
      expectedItems: [
        "Mindd bestaat om mensen te helpen complexe keuzes met rust en vertrouwen te maken.",
        "Mindd bestaat om moeilijke informatie om te zetten in helderheid die mensen verder helpt.",
        "Mindd bestaat om mensen richting te geven wanneer belangrijke beslissingen overweldigend voelen.",
      ],
      expectedOutro: "Ik hoop dat deze suggesties je inspireren om je eigen bestaansreden te schrijven.",
    },
  ];

  for (const scenario of scenarios) {
    const output = helpers.buildTextForWidget({
      specialist: {
        ui_contract_id: scenario.contract,
        message: scenario.message,
        suggestion_intro: scenario.suggestionIntro,
        suggestion_items: scenario.expectedItems,
        suggestion_outro: scenario.expectedOutro,
        suggestion_item_style: "bullets",
        refined_formulation: "",
      },
      state: {
        active_specialist: scenario.stepId,
        current_step: scenario.stepId,
      } as any,
    });

    assert.match(output, new RegExp(scenario.expectedHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const item of scenario.expectedItems) {
      assert.match(output, new RegExp(`- ${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
    assert.match(output, new RegExp(scenario.expectedOutro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("buildTextForWidget keeps purpose discovery questions intact when examples-menu copy contains a question flow", () => {
  const helpers = buildTextHelpers(() => "");
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "purpose:ASK:PURPOSE_MENU_EXAMPLES:v1",
      message: [
        "Het is heel begrijpelijk dat deze stap lastig kan zijn.",
        "",
        "De bestaansreden van een bedrijf is niet altijd direct duidelijk en vraagt soms om wat verdieping.",
        "",
        "Om je te helpen, kun je proberen antwoord te geven op deze drie punten:",
        "",
        "1. Wat raakt jou hier persoonlijk het meest en waarom?",
        "2. Welke overtuiging moet waar zijn om dit na te blijven streven?",
        "3. Welke menselijke behoefte wordt dan eindelijk beter vervuld?",
      ].join("\n"),
      refined_formulation: "",
    },
    state: {
      active_specialist: "purpose",
      current_step: "purpose",
      ui_strings: {
        "structuredSuggestions.outro.template": "Ik hoop dat deze suggesties je inspireren om je eigen {0} te schrijven.",
      },
    } as any,
  });

  assert.match(output, /^Het is heel begrijpelijk dat deze stap lastig kan zijn\./);
  assert.match(output, /1\. Wat raakt jou hier persoonlijk het meest en waarom\?/);
  assert.match(output, /2\. Welke overtuiging moet waar zijn om dit na te blijven streven\?/);
  assert.match(output, /3\. Welke menselijke behoefte wordt dan eindelijk beter vervuld\?/);
  assert.doesNotMatch(output, /^- Het is heel begrijpelijk/m);
  assert.doesNotMatch(output, /Ik hoop dat deze suggesties je inspireren/i);
});

test("deriveSuggestionStateForWidget captures explicit sentence suggestions for Dream", () => {
  const helpers = buildTextHelpers(() => "");
  const specialist = {
    ui_contract_id: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
    message: "fallback",
    suggestion_intro: "Here are three examples of a Dream for an advertising agency like Mindd.",
    suggestion_items: [
      "Mindd dreams of a world in which creative ideas help brands connect with people on a deeper, more meaningful level.",
      "Mindd dreams of a world in which advertising inspires trust and brings genuine value to everyday lives.",
      "Mindd dreams of a world in which brands communicate with honesty, making people feel understood and respected.",
    ],
    suggestion_outro: "I hope these suggestions inspire you to write your own Dream.",
    suggestion_item_style: "bullets",
  } as Record<string, unknown>;

  const snapshot = helpers.deriveSuggestionStateForWidget({ specialist, state: {} as any });

  assert.deepEqual(snapshot, {
    stepId: "dream",
    mode: "suggestions",
    items: [
      "Mindd dreams of a world in which creative ideas help brands connect with people on a deeper, more meaningful level.",
      "Mindd dreams of a world in which advertising inspires trust and brings genuine value to everyday lives.",
      "Mindd dreams of a world in which brands communicate with honesty, making people feel understood and respected.",
    ],
    valid_for_action_codes: ["ACTION_DREAM_SUGGESTIONS_PICK_ONE"],
  });
});

test("deriveSuggestionStateForWidget captures explicit multiline Strategy examples as plain line blocks", () => {
  const helpers = buildTextHelpers(() => "");
  const specialist = {
    ui_contract_id: "strategy:ASK:STRATEGY_MENU_EXAMPLES:v1",
    message: "fallback",
    suggestion_intro: "HERE ARE THREE EXAMPLE STRATEGIES FOR MINDD",
    suggestion_items: [
      [
        "Focus on long-term partnerships",
        "Prioritize depth over volume",
        "Select clients that match the mission",
        "Invest in strategic learning",
      ].join("\n"),
      [
        "Build a culture of curiosity",
        "Protect time for reflection",
        "Choose quality over speed",
        "Work with values-aligned clients",
      ].join("\n"),
      [
        "Make every project reinforce the long-term mission",
        "Prefer values-aligned growth over short-term wins",
        "Invest in reflection after each engagement",
        "Protect quality over throughput",
      ].join("\n"),
    ],
    suggestion_outro: "I hope these suggestions inspire you to write your own strategy.",
    suggestion_item_style: "blocks",
  } as Record<string, unknown>;

  const snapshot = helpers.deriveSuggestionStateForWidget({ specialist, state: {} as any });

  assert.deepEqual(snapshot, {
    stepId: "strategy",
    mode: "examples",
    items: [
      [
        "Focus on long-term partnerships",
        "Prioritize depth over volume",
        "Select clients that match the mission",
        "Invest in strategic learning",
      ].join("\n"),
      [
        "Build a culture of curiosity",
        "Protect time for reflection",
        "Choose quality over speed",
        "Work with values-aligned clients",
      ].join("\n"),
      [
        "Make every project reinforce the long-term mission",
        "Prefer values-aligned growth over short-term wins",
        "Invest in reflection after each engagement",
        "Protect quality over throughput",
      ].join("\n"),
    ],
    valid_for_action_codes: ["ACTION_STRATEGY_EXAMPLES_CHOOSE_FOR_ME"],
  });
});

test("buildTextForWidget avoids duplicate strategy bullets when message already contains the same list", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "strategy") return "";
    return [
      "JE HUIDIGE STRATEGIE VOOR MINDD IS:",
      "",
      "• Focus op enterprise-opdrachten",
      "• Inzetten op langdurige samenwerkingen",
      "• Overpresteren via netwerkprojecten",
      "• Prioriteit voor investeringsbereidheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_QUESTIONS:v1",
      message: [
        "Tot nu toe hebben we deze 4 strategische focuspunten:",
        "",
        "• Focus op enterprise-opdrachten",
        "• Inzetten op langdurige samenwerkingen",
        "• Overpresteren via netwerkprojecten",
        "• Prioriteit voor investeringsbereidheid",
      ].join("\n"),
      refined_formulation: [
        "• Focus op enterprise-opdrachten",
        "• Inzetten op langdurige samenwerkingen",
        "• Overpresteren via netwerkprojecten",
        "• Prioriteit voor investeringsbereidheid",
      ].join("\n"),
      strategy: [
        "• Focus op enterprise-opdrachten",
        "• Inzetten op langdurige samenwerkingen",
        "• Overpresteren via netwerkprojecten",
        "• Prioriteit voor investeringsbereidheid",
      ].join("\n"),
    },
    state: {
      active_specialist: "Strategy",
      current_step: "strategy",
    } as any,
  });

  assert.equal((output.match(/Focus op enterprise-opdrachten/g) || []).length, 1);
});

test("buildTextForWidget keeps strategy support text but renders the current strategy block only once", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "strategy") return "";
    return [
      "Je huidige strategie voor Mindd is:",
      "",
      "• Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
      "• Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
      "• Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
      "• Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
      "• Werk alleen met klanten die groei vanuit wederzijds begrip nastreven",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "strategy:ASK:STRATEGY_MENU_QUESTIONS:v1",
      message: [
        "JE HUIDIGE STRATEGIE VOOR MINDD IS",
        "",
        "JE HEBT NU 5 FOCUSPUNTEN BINNEN JE STRATEGIE",
        "Ik adviseer je om minimaal 4 en maximaal 7 focuspunten te formuleren.",
      ].join("\n"),
      refined_formulation: [
        "Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
        "Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
        "Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
        "Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
        "Werk alleen met klanten die groei vanuit wederzijds begrip nastreven",
      ].join(" "),
      strategy: [
        "Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep",
        "Kies voor diepgaande merktrajecten in plaats van snelle, oppervlakkige projecten",
        "Investeer in het ontwikkelen van unieke positioneringsmethodes die klanten helpen zich te onderscheiden",
        "Prioriteer kwaliteit en persoonlijke aandacht boven volume en snelheid",
        "Werk alleen met klanten die groei vanuit wederzijds begrip nastreven",
      ].join(" "),
    },
    state: {
      active_specialist: "Strategy",
      current_step: "strategy",
    } as any,
  });

  assert.equal((output.match(/Je huidige strategie voor Mindd is:/g) || []).length, 1);
  assert.match(output, /Je hebt nu 5 focuspunten binnen je strategie/i);
  assert.equal(
    (output.match(/Richt je op langdurige samenwerkingen met merken die waarde hechten aan echte verbinding met hun doelgroep/g) || []).length,
    1
  );
});

test("buildTextForWidget avoids duplicate products/services bullets when message already contains the same list", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "productsservices") return "";
    return [
      "De huidige producten en diensten van Mindd zijn:",
      "• AI-compatible websites en apps",
      "• AI-tools en ondersteuning",
      "• Branding",
      "• Strategie",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "productsservices:ASK:PRODUCTSSERVICES_MENU_QUESTIONS:v1",
      message: [
        "Dit is wat je volgens jouw input aan je klanten biedt:",
        "",
        "• AI-compatible websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
        "• Strategie",
      ].join("\n"),
      refined_formulation: [
        "• AI-compatible websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
        "• Strategie",
      ].join("\n"),
      productsservices: [
        "• AI-compatible websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
        "• Strategie",
      ].join("\n"),
    },
    state: {
      active_specialist: "ProductsAndServices",
      current_step: "productsservices",
    } as any,
  });

  assert.equal((output.match(/AI-tools en ondersteuning/g) || []).length, 1);
});

test("buildTextForWidget falls back to products/services field bullets when message and refined text are empty", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "productsservices") return "";
    return [
      "De huidige producten en diensten van Mindd zijn:",
      "",
      "• AI-compatibele websites en apps",
      "• AI-tools en ondersteuning",
      "• Branding",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "productsservices:valid_output:PRODUCTSSERVICES_MENU_CONFIRM:v1",
      message: "",
      refined_formulation: "",
      productsservices: [
        "• AI-compatibele websites en apps",
        "• AI-tools en ondersteuning",
        "• Branding",
      ].join("\n"),
    },
    state: {
      active_specialist: "ProductsServices",
      current_step: "productsservices",
    } as any,
  });

  assert.match(output, /De huidige producten en diensten van Mindd zijn:/);
  assert.match(output, /• AI-compatibele websites en apps/);
  assert.match(output, /• AI-tools en ondersteuning/);
  assert.match(output, /• Branding/);
});

test("buildTextForWidget falls back to canonical products/services state when specialist payload is empty", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "productsservices") return "";
    return [
      "De huidige producten en diensten van Mindd zijn:",
      "",
      "• Strategisch bedrijfs- en communicatieadvies",
      "• Creatieve campagnes",
      "• Graphic, motion- en interaction design",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "productsservices:valid_output:PRODUCTSSERVICES_MENU_CONFIRM:v1",
      message: "",
      refined_formulation: "",
      productsservices: "",
    },
    state: {
      active_specialist: "ProductsServices",
      current_step: "productsservices",
      provisional_by_step: {
        productsservices: [
          "• Strategisch bedrijfs- en communicatieadvies",
          "• Creatieve campagnes",
          "• Graphic, motion- en interaction design",
        ].join("\n"),
      },
    } as any,
  });

  assert.match(output, /De huidige producten en diensten van Mindd zijn:/);
  assert.match(output, /• Strategisch bedrijfs- en communicatieadvies/);
  assert.match(output, /• Creatieve campagnes/);
  assert.match(output, /• Graphic, motion- en interaction design/);
});

test("buildTextForWidget avoids duplicate rules bullets when message already contains the same list", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "rulesofthegame") return "";
    return [
      "De Spelregels van Mindd:",
      "",
      "• We leveren op afspraken",
      "• We spreken conflicten direct uit",
      "• We kiezen kwaliteit boven snelheid",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "rulesofthegame:ASK:RULESOFTHEGAME_MENU_QUESTIONS:v1",
      message: [
        "Tot nu toe hebben we deze spelregels scherp:",
        "",
        "• We leveren op afspraken",
        "• We spreken conflicten direct uit",
        "• We kiezen kwaliteit boven snelheid",
      ].join("\n"),
      refined_formulation: [
        "• We leveren op afspraken",
        "• We spreken conflicten direct uit",
        "• We kiezen kwaliteit boven snelheid",
      ].join("\n"),
      rulesofthegame: [
        "• We leveren op afspraken",
        "• We spreken conflicten direct uit",
        "• We kiezen kwaliteit boven snelheid",
      ].join("\n"),
    },
    state: {
      active_specialist: "RulesOfTheGame",
      current_step: "rulesofthegame",
    } as any,
  });

  assert.equal((output.match(/We leveren op afspraken/g) || []).length, 1);
});

test("buildTextForWidget removes monolithic dream summary paragraph when statements are already present", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "Grenzen zullen vervagen.",
    "Mensen worden socialer en zorgzamer.",
    "Heldere en eenvoudige informatie wordt steeds belangrijker in een steeds complexere wereld.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_EXPLAINER_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "true",
      message: [
        "Ga verder met de Droom-oefening.",
        "",
        "Grenzen zullen vervagen. Mensen worden socialer en zorgzamer. Heldere en eenvoudige informatie wordt steeds belangrijker in een steeds complexere wereld.",
      ].join("\n\n"),
      statements,
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "DreamExplainer",
      current_step: "dream",
    } as any,
  });

  assert.equal(output, "Ga verder met de Droom-oefening.");
});

test("buildTextForWidget removes duplicate dream summary paragraph using canonical state statements when specialist statements are missing", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "People will have more opportunities to improve their lives and feel valued for their contributions.",
    "Positive impact and meaningful work will be increasingly valued in society.",
    "Individuals will have greater freedom in how they use their time and make choices.",
    "People will take greater pride in their work and its contribution to the world.",
    "Businesses will increasingly reflect the values and identities of their founders.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_EXPLAINER_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "true",
      message: [
        "People will have more opportunities to improve their lives and feel valued for their contributions. Positive impact and meaningful work will be increasingly valued in society. Individuals will have greater freedom in how they use their time and make choices. People will take greater pride in their work and its contribution to the world. Businesses will increasingly reflect the values and identities of their founders.",
        "",
        "YOUR DREAM STATEMENTS",
        "5 statements out of a minimum of 20 so far",
        "1. People will have more opportunities to improve their lives and feel valued for their contributions.",
        "2. Positive impact and meaningful work will be increasingly valued in society.",
        "3. Individuals will have greater freedom in how they use their time and make choices.",
        "4. People will take greater pride in their work and its contribution to the world.",
        "5. Businesses will increasingly reflect the values and identities of their founders.",
      ].join("\n"),
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "DreamExplainer",
      current_step: "dream",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "YOUR DREAM STATEMENTS",
        "dreamBuilder.statements.count": "N statements out of a minimum of 20 so far",
      },
    } as any,
  });

  assert.equal(
    output,
    ""
  );
});

test("buildTextForWidget removes duplicate dream summary paragraph in builder runtime mode even without dream-explainer flags", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "Wanneer mensen werk doen dat betekenisvol is, ervaren ze meer welzijn en voldoening in hun leven.",
    "Duurzame initiatieven en bedrijven zullen een blijvende positieve impact hebben op de samenleving, ook na de oprichters.",
    "De komende jaren zal de roep om meer autonomie en vrijheid in werk en leven verder toenemen.",
    "Mensen zullen steeds meer waarde hechten aan trots en zingeving in hun werk.",
    "Bedrijven zullen vaker een afspiegeling zijn van de waarden en identiteit van hun oprichters.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "false",
      message: [
        "Ga verder met de Droom-oefening.",
        "",
        statements.join(" "),
      ].join("\n\n"),
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "JOUW DROOM-STATEMENTS",
        "dreamBuilder.statements.count": "N statements van minimaal 20 tot nu toe",
      },
    } as any,
  });

  assert.equal(output, "Ga verder met de Droom-oefening.");
});

test("buildTextForWidget drops dream narrative paragraph when it only repeats canonical statements", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "Over 5 tot 10 jaar zullen mensen meer waarde hechten aan werk dat een positieve impact heeft op hun leven en dat van anderen.",
    "Duurzame initiatieven en bedrijven zullen een grotere rol spelen in de samenleving en generaties overstijgen.",
    "Mensen zullen meer vrijheid zoeken in hun tijdsbesteding en keuzes, zowel prive als professioneel.",
    "Trots op het eigen werk en de bijdrage aan de samenleving wordt belangrijker voor mensen.",
    "Bedrijven zullen steeds vaker een authentieke afspiegeling zijn van de waarden en identiteit van hun oprichters.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "false",
      message: statements.join(" "),
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "JOUW DROOM-STATEMENTS",
        "dreamBuilder.statements.count": "N statements van minimaal 20 tot nu toe",
      },
    } as any,
  });

  assert.equal(output, "");
});

test("buildTextForWidget drops paraphrased dream narrative summary when canonical statements are shown", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "In de komende 5 tot 10 jaar zullen mensen meer zoeken naar werk dat een positieve impact heeft op hun leven en dat van anderen.",
    "Er zal een groeiende behoefte zijn aan bedrijven en initiatieven die een blijvende waarde creeren voor de samenleving.",
    "Vrijheid in tijd en keuzes wordt steeds belangrijker voor mensen in hun werk en leven.",
    "Mensen zullen steeds meer waarde hechten aan trots kunnen zijn op hun werk en bijdrage aan de maatschappij.",
    "Ondernemingen zullen vaker een authentieke weerspiegeling zijn van de waarden en identiteit van hun oprichters.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "false",
      message: [
        "Mensen zullen vaker betekenis zoeken in werk dat positief doorwerkt in hun omgeving.",
        "Organisaties die duurzame waarde toevoegen, krijgen meer vertrouwen en relevantie.",
        "Autonomie in keuzes over tijd en werk wordt voor steeds meer mensen een harde voorwaarde.",
        "Trots en maatschappelijke bijdrage worden bepalender in hoe mensen werk beoordelen.",
        "Bedrijven laten in toenemende mate de identiteit van hun oprichters zien in hun handelen.",
      ].join(" "),
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "JOUW DROOM-STATEMENTS",
        "dreamBuilder.statements.count": "N statements van minimaal 20 tot nu toe",
      },
    } as any,
  });

  assert.equal(output, "");
});

test("buildTextForWidget keeps short dream-builder support sentence while dropping long paraphrased summary", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "Over 5 tot 10 jaar zullen mensen meer waarde hechten aan werk dat een positieve impact heeft op hun leven en dat van anderen.",
    "Duurzame initiatieven en bedrijven zullen een grotere rol spelen in de samenleving en generaties overstijgen.",
    "Mensen zullen meer vrijheid zoeken in hun tijdsbesteding en keuzes, zowel prive als professioneel.",
    "Trots op het eigen werk en de bijdrage aan de samenleving wordt belangrijker voor mensen.",
    "Bedrijven zullen steeds vaker een authentieke afspiegeling zijn van de waarden en identiteit van hun oprichters.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "false",
      message: [
        "Dat is een goed beginpunt.",
        "",
        "Mensen kiezen vaker voor werk met betekenis en zichtbare impact. Organisaties met duurzame waarde worden betrouwbaarder gevonden. Vrijheid en autonomie in keuzes worden belangrijker. Trots op bijdrage en zingeving groeit. Bedrijven laten sterker zien welke waarden ze belichamen.",
      ].join("\n\n"),
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "JOUW DROOM-STATEMENTS",
        "dreamBuilder.statements.count": "N statements van minimaal 20 tot nu toe",
      },
    } as any,
  });

  assert.equal(output, "Dat is een goed beginpunt.");
});

test("buildTextForWidget keeps recap body exclusive when refined append is suppressed", () => {
  const helpers = buildTextHelpers(() => "");
  const canonical = "Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken.";
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:valid_output:DREAM_MENU_NEXT_STEP:v1",
      wants_recap: true,
      __suppress_refined_append: "true",
      message: [
        "DROOM:",
        canonical,
      ].join("\n"),
      refined_formulation: canonical,
      dream: canonical,
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
    } as any,
  });

  assert.equal((output.match(/Mindd droomt van een wereld waarin mensen met vertrouwen complexe keuzes maken\./g) || []).length, 1);
});

test("buildTextForWidget does not append refined dream text when it semantically equals canonical statements", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "Wanneer mensen werk doen dat betekenisvol is, ervaren ze meer welzijn en voldoening in hun leven.",
    "Duurzame initiatieven en bedrijven zullen een blijvende positieve impact hebben op de samenleving, ook na de oprichters.",
    "De komende jaren zal de roep om meer autonomie en vrijheid in werk en leven verder toenemen.",
    "Mensen zullen steeds meer waarde hechten aan trots en zingeving in hun werk.",
    "Bedrijven zullen vaker een afspiegeling zijn van de waarden en identiteit van hun oprichters.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "false",
      message: "Dat is een sterk startpunt.",
      refined_formulation: statements.join(" "),
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "JOUW DROOM-STATEMENTS",
        "dreamBuilder.statements.count": "N statements van minimaal 20 tot nu toe",
      },
    } as any,
  });

  assert.equal(output, "Dat is een sterk startpunt.");
});

test("buildTextForWidget keeps dream-builder rendering canonical-only and skips refined append channel", () => {
  const helpers = buildTextHelpers(() => "");
  const statements = [
    "Mensen zoeken vaker betekenisvol werk met zichtbare impact.",
    "Bedrijven nemen meer verantwoordelijkheid voor lange-termijn effecten.",
    "Autonomie en keuzevrijheid in werk worden belangrijker.",
    "Trots en zingeving sturen keuzes van professionals.",
    "Organisaties weerspiegelen steeds sterker de waarden van oprichters.",
  ];
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      suggest_dreambuilder: "false",
      message: "Ga verder met de Droom-oefening.",
      refined_formulation: "We bouwen een toekomst met meer humane AI-keuzes.",
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      __dream_runtime_mode: "builder_collect",
      dream_builder_statements: statements,
      ui_strings: {
        "dreamBuilder.statements.title": "JOUW DROOM-STATEMENTS",
        "dreamBuilder.statements.count": "N statements van minimaal 20 tot nu toe",
      },
    } as any,
  });

  assert.equal(output, "Ga verder met de Droom-oefening.");
});

test("buildTextForWidget includes canonical pending compare suggestion text when compare is pending", () => {
  const helpers = buildTextHelpers(() => "");
  const suggestion =
    "Mindd droomt van een wereld waarin mensen dankzij AI beter geinformeerde keuzes maken en meer rust ervaren bij aankopen.";
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      message: "Dat is een interessant uitgangspunt.",
      compare_runtime: createCompareRuntimeState({
        kind: "text_compare",
        mode: "text",
        status: "pending",
        presentation: "canonical",
        suggestion_text: suggestion,
      }),
      refined_formulation: "",
      dream: "",
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
      ui_strings: {
        compareSuggestionLabel: "Dit zou mijn suggestie zijn:",
      },
    } as any,
  });

  assert.match(output, /Dat is een interessant uitgangspunt\./);
  assert.match(output, /Dit zou mijn suggestie zijn:/);
  assert.equal((output.match(/Mindd droomt van een wereld/g) || []).length, 1);
});

test("buildTextForWidget keeps canonical pending compare suggestion visible across single-value confirm steps", () => {
  const helpers = buildTextHelpers(() => "");
  const scenarios = [
    {
      stepId: "purpose",
      contract: "purpose:ASK:PURPOSE_MENU_QUESTIONS:v1",
      suggestion:
        "Mindd bestaat om mensen met complexe keuzes helderheid te geven, zodat ze met vertrouwen kunnen handelen.",
    },
    {
      stepId: "role",
      contract: "role:ASK:ROLE_MENU_QUESTIONS:v1",
      suggestion:
        "Mindd is de gids die complexe informatie vertaalt naar heldere keuzes voor ondernemers.",
    },
  ];

  for (const scenario of scenarios) {
    const output = helpers.buildTextForWidget({
      specialist: {
        ui_contract_id: scenario.contract,
        message: "Heldere richting helpt je keuzes verscherpen.",
        compare_runtime: createCompareRuntimeState({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "canonical",
          suggestion_text: scenario.suggestion,
        }),
        refined_formulation: "",
      },
      state: {
        active_specialist: scenario.stepId,
        current_step: scenario.stepId,
      } as any,
    });
    assert.match(output, /Heldere richting helpt je keuzes verscherpen\./);
    assert.match(output, new RegExp(scenario.suggestion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("buildTextForWidget suppresses standalone body text for single-value compare picker states", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId === "purpose") {
      return [
        "JE HUIDIGE PURPOSE VOOR MINDD IS",
        "",
        "Mindd bestaat om mensen helderheid te geven in complexe beslissingen.",
      ].join("\n");
    }
    return "";
  });

  const scenarios = [
    {
      contract: "purpose:ASK:PURPOSE_MENU_QUESTIONS:v1",
      stepId: "purpose",
      message: [
        "Ik heb het herschreven zodat het specifieker wordt.",
        "",
        "JE HUIDIGE PURPOSE VOOR MINDD IS",
        "",
        "Mindd bestaat om mensen helderheid te geven in complexe beslissingen.",
      ].join("\n"),
      suggestion: "Mindd bestaat om mensen helderheid te geven in complexe beslissingen.",
    },
  ];

  for (const scenario of scenarios) {
    const output = helpers.buildTextForWidget({
      specialist: {
        ui_contract_id: scenario.contract,
        message: scenario.message,
        refined_formulation: scenario.suggestion,
        compare_runtime: createCompareRuntimeState({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          target_field: scenario.stepId,
          user_normalized_text: "Originele input",
          suggestion_text: scenario.suggestion,
        }),
      },
      state: {
        active_specialist: scenario.stepId,
        current_step: scenario.stepId,
      } as any,
    });

    assert.equal(output, "");
  }
});

test("buildTextForWidget keeps Dream single-value body visible even when stale canonical compare state is present", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "dream") return "";
    return [
      "JE HUIDIGE DROOM VOOR MINDD IS",
      "",
      "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      message: [
        "Je voorstel is te algemeen voor een droom.",
        "",
        "JE HUIDIGE DROOM VOOR MINDD IS",
        "",
        "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      ].join("\n"),
      refined_formulation: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      compare_runtime: createCompareRuntimeState({
        kind: "text_compare",
        mode: "text",
        status: "pending",
        presentation: "canonical",
        target_field: "dream",
        user_normalized_text: "Originele input",
        suggestion_text: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      }),
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
    } as any,
  });

  assert.match(output, /Je voorstel is te algemeen voor een droom\./);
  assert.match(output, /JE HUIDIGE DROOM VOOR MINDD IS/);
  assert.match(output, /Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes\./);
});

test("buildTextForWidget suppresses Dream standalone body while an active compare compare is present", () => {
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "dream") return "";
    return [
      "JE HUIDIGE DROOM VOOR MINDD IS",
      "",
      "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      message: [
        "Ik heb je input herschreven naar een droom.",
        "",
        "JE HUIDIGE DROOM VOOR MINDD IS",
        "",
        "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      ].join("\n"),
      refined_formulation: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      compare_runtime: createCompareRuntimeState({
        kind: "text_compare",
        mode: "text",
        status: "pending",
        presentation: "picker",
        target_field: "dream",
        user_normalized_text: "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.",
        suggestion_text: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      }),
    },
    state: {
      active_specialist: "Dream",
      current_step: "dream",
    } as any,
  });

  assert.equal(output, "");
});

test("buildTextForWidget strips raw HTML tags from user-facing text", () => {
  const helpers = buildTextHelpers(() => "");
  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "targetgroup:ASK:TARGETGROUP_MENU_INTRO:v1",
      message: "<strong>Dit mag niet zichtbaar zijn</strong>\nDoelgroep blijft zichtbaar.",
      refined_formulation: "<em>Verfijnde tekst</em>",
      question: "<b>Welke doelgroep bedoel je?</b>",
      targetgroup: "Doelgroep",
    },
    state: {
      active_specialist: "TargetGroup",
      current_step: "targetgroup",
    } as any,
  });

  assert.doesNotMatch(output, /<[^>]+>/);
  assert.match(output, /Dit mag niet zichtbaar zijn/);
  assert.match(output, /Doelgroep blijft zichtbaar\./);
});

test("finalizeResponse keeps Dream self compare actions when builder compare is not active", () => {
  const helpers = buildFinalizeLayer();
  const state = {
    current_step: "dream",
    active_specialist: "Dream",
    started: "true",
    last_specialist_result: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
      compare_runtime: createCompareRuntimeState({
        kind: "text_compare",
        mode: "text",
        status: "pending",
        presentation: "picker",
        target_field: "dream",
        user_normalized_text: "Mijn ruwe droom",
        suggestion_text: "Mindd droomt van een wereld waarin keuzes rust geven.",
      }),
    },
  } satisfies Record<string, unknown>;
  helpers.setState(state);

  const response = helpers.layer.finalizeResponse({
    ok: false,
    tool: "run_step",
    current_step_id: "dream",
    active_specialist: "Dream",
    text: "",
    prompt: "Kies welke formulering het beste past.",
    specialist: {
      ui_contract_id: "dream:ASK:DREAM_MENU_NEXT_STEP:v1",
    },
    state: state as any,
    ui: {
      view: {
        mode: "interactive",
      },
    },
  });

  const finalState = (response.state || {}) as Record<string, unknown>;
  assert.equal(String(finalState.ui_action_compare_pick_user || ""), "ACTION_COMPARE_PICK_USER");
  assert.equal(String(finalState.ui_action_compare_pick_suggestion || ""), "ACTION_COMPARE_PICK_SUGGESTION");
});

test("buildTextForWidget keeps single-value confirm fallback text stable without duplicating canonical output", () => {
  const canonical =
    "Mensen zouden altijd toegang moeten hebben tot eerlijke en volledige informatie, zodat zij zelfstandig keuzes kunnen maken.";
  const helpers = buildTextHelpers((stepId) => {
    if (stepId !== "bigwhy") return "";
    return [
      "JE HUIDIGE GROTE WAAROM VOOR MINDD IS:",
      "",
      canonical,
    ].join("\n");
  });

  const output = helpers.buildTextForWidget({
    specialist: {
      ui_contract_id: "bigwhy:valid_output:BIGWHY_MENU_CONFIRM_SINGLE:v1",
      message: ["Wat denk je van deze formulering", canonical].join("\n"),
      refined_formulation: canonical,
      bigwhy: canonical,
    },
    state: {
      active_specialist: "BigWhy",
      current_step: "bigwhy",
    } as any,
  });

  assert.match(output, /^Wat denk je van deze formulering$/im);
  assert.equal((output.match(/Mensen zouden altijd toegang moeten hebben/g) || []).length, 1);
});
