// mcp-server/src/handlers/run_step.ts
import { z } from "zod";
import { callStrictJson } from "../core/llm.js";
import { migrateState } from "../core/state.js";
import { orchestrate } from "../core/orchestrator.js";
import { STEP_0_ID, STEP_0_SPECIALIST, VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS, ValidationAndBusinessNameJsonSchema, ValidationAndBusinessNameZodSchema, buildStep0SpecialistInput, } from "../steps/step_0_validation.js";
import { DREAM_STEP_ID, DREAM_SPECIALIST, DREAM_INSTRUCTIONS, DreamJsonSchema, DreamZodSchema, buildDreamSpecialistInput, } from "../steps/dream.js";
import { DREAM_EXPLAINER_SPECIALIST, DREAM_EXPLAINER_INSTRUCTIONS, DreamExplainerJsonSchema, DreamExplainerZodSchema, buildDreamExplainerSpecialistInput, } from "../steps/dream_explainer.js";
import { PURPOSE_STEP_ID, PURPOSE_SPECIALIST, PURPOSE_INSTRUCTIONS, PurposeJsonSchema, PurposeZodSchema, buildPurposeSpecialistInput, } from "../steps/purpose.js";
import { BIGWHY_STEP_ID, BIGWHY_SPECIALIST, BIGWHY_INSTRUCTIONS, BigWhyJsonSchema, BigWhyZodSchema, buildBigWhySpecialistInput, } from "../steps/bigwhy.js";
import { ROLE_STEP_ID, ROLE_SPECIALIST, ROLE_INSTRUCTIONS, RoleJsonSchema, RoleZodSchema, buildRoleSpecialistInput, } from "../steps/role.js";
import { ENTITY_STEP_ID, ENTITY_SPECIALIST, ENTITY_INSTRUCTIONS, EntityJsonSchema, EntityZodSchema, buildEntitySpecialistInput, } from "../steps/entity.js";
import { STRATEGY_STEP_ID, STRATEGY_SPECIALIST, STRATEGY_INSTRUCTIONS, StrategyJsonSchema, StrategyZodSchema, buildStrategySpecialistInput, } from "../steps/strategy.js";
import { RULESOFTHEGAME_STEP_ID, RULESOFTHEGAME_SPECIALIST, RULESOFTHEGAME_INSTRUCTIONS, RulesOfTheGameJsonSchema, RulesOfTheGameZodSchema, buildRulesOfTheGameSpecialistInput, } from "../steps/rulesofthegame.js";
import { PRESENTATION_STEP_ID, PRESENTATION_SPECIALIST, PRESENTATION_INSTRUCTIONS, PresentationJsonSchema, PresentationZodSchema, buildPresentationSpecialistInput, } from "../steps/presentation.js";
/**
 * Incoming tool args
 * NOTE: Some tool callers include current_step_id ("start") — accepted but not relied on.
 */
const RunStepArgsSchema = z.object({
    current_step_id: z.string().optional(),
    user_message: z.string().default(""),
    state: z.record(z.string(), z.any()).optional().default({}),
});
const STEP0_QUESTION_EN = "What type of venture are you starting or running, and what’s the name of your business (or is it still TBD)?";
const STEP0_QUESTION_NL = "Wat voor soort onderneming start of run je, en wat is de naam van je bedrijf (of is die nog TBD)?";
function step0QuestionForLang(lang) {
    const l = String(lang || "").toLowerCase();
    return l.startsWith("nl") ? STEP0_QUESTION_NL : STEP0_QUESTION_EN;
}
function yesTokenForLang(lang) {
    const l = String(lang || "").toLowerCase();
    if (l.startsWith("nl"))
        return "ja";
    if (l.startsWith("fr"))
        return "oui";
    if (l.startsWith("es"))
        return "sí";
    if (l.startsWith("it"))
        return "sì";
    if (l.startsWith("pt"))
        return "sim";
    if (l.startsWith("de"))
        return "ja";
    return "yes";
}
function langFromState(state) {
    const l = String(state.language ?? "").trim().toLowerCase();
    return l || "en";
}
/**
 * Render order (strict):
 * message -> refined_formulation
 */
function buildTextForWidget(params) {
    const { specialist } = params;
    const parts = [];
    const msg = String(specialist?.message ?? "").trim();
    const refined = String(specialist?.refined_formulation ?? "").trim();
    if (msg)
        parts.push(msg);
    if (refined)
        parts.push(refined);
    return parts.join("\n\n").trim();
}
function pickPrompt(specialist) {
    const confirmQ = String(specialist?.confirmation_question ?? "").trim();
    const q = String(specialist?.question ?? "").trim();
    return confirmQ || q || "";
}
function expandChoiceFromPreviousQuestion(userMsg, prevQuestion) {
    const t = String(userMsg ?? "").trim();
    if (t !== "1" && t !== "2" && t !== "3")
        return userMsg; // safe for future 3-option menus
    const q = String(prevQuestion ?? "");
    if (!q)
        return userMsg;
    const lines = q
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const wanted = `${t})`;
    for (const line of lines) {
        // Match "1) something" or "1. something"
        const m = line.match(/^([123])[\)\.]\s*(.+?)\s*$/);
        if (m && `${m[1]})` === wanted) {
            return m[2].trim();
        }
    }
    return userMsg;
}
function isClearYes(userMessage) {
    const tRaw = String(userMessage ?? "").trim();
    if (!tRaw)
        return false;
    // Always accept explicit option click.
    if (tRaw === "1")
        return true;
    // Only treat very short replies as "clear yes" to avoid accidental triggers.
    const t = tRaw.toLowerCase();
    if (t.length > 24)
        return false;
    const yesPhrases = new Set([
        "yes",
        "y",
        "yeah",
        "yep",
        "sure",
        "ok",
        "okay",
        "k",
        "continue",
        "go on",
        "ja",
        "j",
        "jazeker",
        "zeker",
        "klopt",
        "prima",
        "goed",
        "doorgaan",
        "ga door",
        "verder",
        "oui",
        "si",
        "sí",
        "sì",
        "sim",
    ]);
    return yesPhrases.has(t);
}
function looksLikeMetaInstruction(userMessage) {
    const t = String(userMessage ?? "").trim();
    if (!t)
        return false;
    const lower = t.toLowerCase();
    const longish = t.length >= 80;
    const hasBullets = /(^|\n)\s*[-*]\s+/.test(t);
    const hasSections = lower.includes("instructions") ||
        lower.includes("context") ||
        lower.includes("requirements") ||
        lower.includes("goals");
    const hasUserFraming = lower.includes("the user") ||
        lower.includes("user wants") ||
        lower.includes("start the flow") ||
        lower.includes("answer in") ||
        lower.includes("respond in");
    return longish && (hasUserFraming || hasSections || hasBullets);
}
function extractUserMessageFromWrappedInput(raw) {
    const t = String(raw ?? "");
    if (!t.trim())
        return "";
    // Common wrapper used by planners / orchestrators:
    // "CURRENT_STEP_ID: step_0 | USER_MESSAGE: <text>"
    const m1 = t.match(/\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
    if (m1 && typeof m1[1] === "string")
        return m1[1].trim();
    // Sometimes the wrapper is multi-line and includes "PLANNER_INPUT:".
    const m2 = t.match(/\bPLANNER_INPUT\s*:\s*[\s\S]*?\bUSER_MESSAGE\s*:\s*([\s\S]+)$/i);
    if (m2 && typeof m2[1] === "string")
        return m2[1].trim();
    // Otherwise, return empty to indicate "no extraction happened".
    return "";
}
function detectLanguageHeuristic(text) {
    const s = String(text ?? "").trim().toLowerCase();
    if (!s)
        return "en";
    // Super-lightweight heuristic: count a few common stopwords.
    const nl = [
        " de ",
        " het ",
        " een ",
        " ik ",
        " jij ",
        " je ",
        " mijn ",
        " niet ",
        " en ",
        " dat ",
        " dit ",
        " als ",
        " omdat ",
        " klaar ",
    ];
    const en = [" the ", " a ", " an ", " i ", " you ", " my ", " not ", " and ", " that ", " this ", " because ", " ready "];
    const pad = ` ${s} `;
    const count = (arr) => arr.reduce((acc, w) => acc + (pad.includes(w) ? 1 : 0), 0);
    const nlScore = count(nl);
    const enScore = count(en);
    if (nlScore > enScore)
        return "nl";
    return "en";
}
function ensureLanguageFromUserMessage(state, userMessage) {
    const msg = String(userMessage ?? "").trim();
    if (!msg)
        return state;
    const locked = String(state.language_locked ?? "false") === "true";
    const current = String(state.language ?? "").trim().toLowerCase();
    if (locked && current)
        return state;
    // Do not lock language on pure numeric menu clicks.
    if (/^[0-9]+$/.test(msg))
        return state;
    const detected = detectLanguageHeuristic(msg);
    return {
        ...state,
        language: current || detected,
        language_locked: "true",
    };
}
function isPristineStateForStart(s) {
    return (String(s.current_step) === STEP_0_ID &&
        String(s.step_0_final ?? "").trim() === "" &&
        String(s.dream_final ?? "").trim() === "" &&
        String(s.intro_shown_session ?? "") !== "true" &&
        Object.keys(s.last_specialist_result ?? {}).length === 0);
}
/**
 * Specialist context block for reliability (used by Presentation and helps other steps avoid guesswork)
 */
function buildSpecialistContextBlock(state) {
    const safe = (v) => String(v ?? "").replace(/\r\n/g, "\n");
    const last = state.last_specialist_result && typeof state.last_specialist_result === "object"
        ? JSON.stringify(state.last_specialist_result)
        : "";
    return `STATE FINALS (use these if needed; do not invent)
- step_0_final: ${safe(state.step_0_final)}
- dream_final: ${safe(state.dream_final)}
- purpose_final: ${safe(state.purpose_final)}
- bigwhy_final: ${safe(state.bigwhy_final)}
- role_final: ${safe(state.role_final)}
- entity_final: ${safe(state.entity_final)}
- strategy_final: ${safe(state.strategy_final)}
- rulesofthegame_final: ${safe(state.rulesofthegame_final)}

STATE META (do not output this section)
- business_name: ${safe(state.business_name)}
- intro_shown_for_step: ${safe(state.intro_shown_for_step)}
- intro_shown_session: ${safe(state.intro_shown_session)}
- last_specialist_result_json: ${safe(last)}`;
}
/**
 * Persist state updates consistently (no nulls)
 * Minimal: store finals when the specialist returns CONFIRM with its output field.
 */
function applyStateUpdate(params) {
    const { prev, decision, specialistResult, showSessionIntroUsed } = params;
    const action = String(specialistResult?.action ?? "");
    const next_step = String(decision.current_step ?? "");
    const active_specialist = String(decision.specialist_to_call ?? "");
    let nextState = {
        ...prev,
        current_step: next_step,
        active_specialist,
        last_specialist_result: typeof specialistResult === "object" && specialistResult !== null ? specialistResult : {},
        intro_shown_session: showSessionIntroUsed === "true" ? "true" : prev.intro_shown_session,
        // mark a step intro as shown only when the specialist actually outputs INTRO
        intro_shown_for_step: action === "INTRO" ? next_step : prev.intro_shown_for_step,
    };
    // ---- Step 0 ----
    if (next_step === STEP_0_ID) {
        if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
            nextState.step_0_final = specialistResult.step_0.trim();
        }
        if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
            nextState.business_name = specialistResult.business_name.trim();
        }
    }
    // ---- Dream (and DreamExplainer final Dream) ----
    if (next_step === DREAM_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.dream === "string") {
            const v = specialistResult.dream.trim();
            if (v)
                nextState.dream_final = v;
        }
    }
    // ---- Purpose ----
    if (next_step === PURPOSE_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.purpose === "string") {
            const v = specialistResult.purpose.trim();
            if (v)
                nextState.purpose_final = v;
        }
    }
    // ---- Big Why ----
    if (next_step === BIGWHY_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.bigwhy === "string") {
            const v = specialistResult.bigwhy.trim();
            if (v)
                nextState.bigwhy_final = v;
        }
    }
    // ---- Role ----
    if (next_step === ROLE_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.role === "string") {
            const v = specialistResult.role.trim();
            if (v)
                nextState.role_final = v;
        }
    }
    // ---- Entity ----
    if (next_step === ENTITY_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.entity === "string") {
            const v = specialistResult.entity.trim();
            if (v)
                nextState.entity_final = v;
        }
    }
    // ---- Strategy ----
    if (next_step === STRATEGY_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.strategy === "string") {
            const v = specialistResult.strategy.trim();
            if (v)
                nextState.strategy_final = v;
        }
    }
    // ---- Rules of the Game ----
    if (next_step === RULESOFTHEGAME_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.rulesofthegame === "string") {
            const v = specialistResult.rulesofthegame.trim();
            if (v)
                nextState.rulesofthegame_final = v;
        }
    }
    // ---- Presentation ----
    if (next_step === PRESENTATION_STEP_ID) {
        if (action === "CONFIRM" && typeof specialistResult?.presentation_brief === "string") {
            const v = specialistResult.presentation_brief.trim();
            if (v)
                nextState.presentation_brief_final = v;
        }
    }
    return nextState;
}
async function callSpecialistStrict(params) {
    const { model, state, decision, userMessage } = params;
    const specialist = String(decision.specialist_to_call ?? "");
    const contextBlock = buildSpecialistContextBlock(state);
    const lang = langFromState(state);
    if (specialist === STEP_0_SPECIALIST) {
        const plannerInput = buildStep0SpecialistInput(userMessage, lang);
        const res = await callStrictJson({
            model,
            instructions: `${VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "ValidationAndBusinessName",
            jsonSchema: ValidationAndBusinessNameJsonSchema,
            zodSchema: ValidationAndBusinessNameZodSchema,
            temperature: 0.2,
            topP: 1,
            maxOutputTokens: 2048,
            debugLabel: "ValidationAndBusinessName",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === DREAM_SPECIALIST) {
        const plannerInput = buildDreamSpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || DREAM_STEP_ID), lang);
        const res = await callStrictJson({
            model,
            instructions: `${DREAM_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "Dream",
            jsonSchema: DreamJsonSchema,
            zodSchema: DreamZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "Dream",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === DREAM_EXPLAINER_SPECIALIST) {
        const plannerInput = buildDreamExplainerSpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || DREAM_STEP_ID), lang);
        const res = await callStrictJson({
            model,
            instructions: `${DREAM_EXPLAINER_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "DreamExplainer",
            jsonSchema: DreamExplainerJsonSchema,
            zodSchema: DreamExplainerZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "DreamExplainer",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === PURPOSE_SPECIALIST) {
        const plannerInput = buildPurposeSpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || PURPOSE_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${PURPOSE_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "Purpose",
            jsonSchema: PurposeJsonSchema,
            zodSchema: PurposeZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "Purpose",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === BIGWHY_SPECIALIST) {
        const plannerInput = buildBigWhySpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || BIGWHY_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${BIGWHY_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "BigWhy",
            jsonSchema: BigWhyJsonSchema,
            zodSchema: BigWhyZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "BigWhy",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === ROLE_SPECIALIST) {
        const plannerInput = buildRoleSpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || ROLE_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${ROLE_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "Role",
            jsonSchema: RoleJsonSchema,
            zodSchema: RoleZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "Role",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === ENTITY_SPECIALIST) {
        const plannerInput = buildEntitySpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || ENTITY_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${ENTITY_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "Entity",
            jsonSchema: EntityJsonSchema,
            zodSchema: EntityZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "Entity",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === STRATEGY_SPECIALIST) {
        const plannerInput = buildStrategySpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || STRATEGY_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${STRATEGY_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "Strategy",
            jsonSchema: StrategyJsonSchema,
            zodSchema: StrategyZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "Strategy",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === RULESOFTHEGAME_SPECIALIST) {
        const plannerInput = buildRulesOfTheGameSpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || RULESOFTHEGAME_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${RULESOFTHEGAME_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "RulesOfTheGame",
            jsonSchema: RulesOfTheGameJsonSchema,
            zodSchema: RulesOfTheGameZodSchema,
            temperature: 0.3,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "RulesOfTheGame",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    if (specialist === PRESENTATION_SPECIALIST) {
        const plannerInput = buildPresentationSpecialistInput(userMessage, state.intro_shown_for_step, String(decision.current_step || PRESENTATION_STEP_ID));
        const res = await callStrictJson({
            model,
            instructions: `${PRESENTATION_INSTRUCTIONS}\n\n${contextBlock}`,
            plannerInput,
            schemaName: "Presentation",
            jsonSchema: PresentationJsonSchema,
            zodSchema: PresentationZodSchema,
            temperature: 0.2,
            topP: 1,
            maxOutputTokens: 10000,
            debugLabel: "Presentation",
        });
        return { specialistResult: res.data, attempts: res.attempts };
    }
    // Safe fallback: Step 0 ESCAPE payload (language-neutral English here; UI/flow will recover)
    return {
        specialistResult: {
            action: "ESCAPE",
            message: "I can only help you here with building your Business Strategy Canvas.",
            question: "Do you want to continue with verification now?",
            refined_formulation: "",
            confirmation_question: "",
            business_name: "TBD",
            proceed_to_dream: "false",
            step_0: "",
        },
        attempts: 0,
    };
}
function shouldChainToNextStep(decision, specialistResult) {
    const step = String(decision.current_step ?? "");
    if (!step)
        return false;
    // Step 0 uses proceed_to_dream
    if (step === STEP_0_ID && String(specialistResult?.proceed_to_dream ?? "") === "true")
        return true;
    // Dream + DreamExplainer use proceed_to_purpose
    if (step === DREAM_STEP_ID && String(specialistResult?.proceed_to_purpose ?? "") === "true")
        return true;
    // Dream exercise handshake: if Dream confirms readiness with suggest_dreambuilder=true,
    // immediately chain into DreamExplainer so the exercise starts within the same interaction.
    if (step === DREAM_STEP_ID &&
        String(specialistResult?.action ?? "") === "CONFIRM" &&
        String(specialistResult?.suggest_dreambuilder ?? "") === "true") {
        return true;
    }
    // Everything else uses proceed_to_next
    if (String(specialistResult?.proceed_to_next ?? "") === "true")
        return true;
    return false;
}
/**
 * MCP tool implementation (widget-leading)
 *
 * IMPORTANT:
 * - Pre-start UI owns the welcome text.
 * - Start calls this tool with empty user_message; we respond with Step 0 question without calling the specialist.
 */
export async function run_step(rawArgs) {
    const args = RunStepArgsSchema.parse(rawArgs);
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
    let state = migrateState(args.state ?? {});
    const pristineAtEntry = isPristineStateForStart(state);
    const userMessageRaw = String(args.user_message ?? "");
    const extracted = extractUserMessageFromWrappedInput(userMessageRaw);
    const rawNormalized = extracted ? extracted : userMessageRaw;
    const userMessageCandidate = looksLikeMetaInstruction(rawNormalized) && pristineAtEntry ? "" : rawNormalized;
    // If user clicks a numbered option button, the UI sends "1"/"2"/"3".
    // Expand it to the real option label from the previous question, so every step can route correctly.
    const prevQ = typeof state?.last_specialist_result?.question === "string"
        ? String(state.last_specialist_result.question)
        : "";
    const userMessage = expandChoiceFromPreviousQuestion(userMessageCandidate, prevQ);
    // Lock language once we see a meaningful user message (prevents mid-flow flips).
    state = ensureLanguageFromUserMessage(state, userMessage);
    const lang = langFromState(state);
    // START trigger (widget start screen)
    const isStartTrigger = userMessage.trim() === "" &&
        state.current_step === STEP_0_ID &&
        String(state.intro_shown_session) !== "true" &&
        Object.keys(state.last_specialist_result ?? {}).length === 0;
    if (isStartTrigger) {
        state.intro_shown_session = "true";
        const step0Final = String(state.step_0_final ?? "").trim();
        // If Step 0 is already known, show the combined confirmation directly.
        if (step0Final) {
            const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
            const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
            const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);
            const venture = (ventureMatch?.[1] || "venture").trim();
            const name = (nameMatch?.[1] || state.business_name || "TBD").trim();
            const status = (statusMatch?.[1] || "starting").toLowerCase();
            const langLocal = langFromState(state);
            const statement = status === "existing"
                ? langLocal.startsWith("nl")
                    ? `Je hebt een ${venture} genaamd ${name}.`
                    : `You have a ${venture} called ${name}.`
                : langLocal.startsWith("nl")
                    ? `Je wilt een ${venture} starten genaamd ${name}.`
                    : `You want to start a ${venture} called ${name}.`;
            const specialist = {
                action: "CONFIRM",
                message: "",
                question: "",
                refined_formulation: "",
                confirmation_question: langLocal.startsWith("nl")
                    ? `${statement} Klopt dat, en ben je klaar om te starten met de eerste stap, 'Jouw Droom'?`
                    : `${statement} Is that correct, and if so are you ready to start the first step, 'Your Dream'?`,
                business_name: name || "TBD",
                proceed_to_dream: "false",
                step_0: step0Final,
            };
            return {
                ok: true,
                tool: "run_step",
                current_step_id: String(state.current_step),
                active_specialist: STEP_0_SPECIALIST,
                text: "",
                prompt: specialist.confirmation_question,
                specialist,
                state: {
                    ...state,
                    active_specialist: STEP_0_SPECIALIST,
                    last_specialist_result: specialist,
                },
            };
        }
        // Otherwise: first-time Step 0 setup question.
        const specialist = {
            action: "ASK",
            message: "",
            question: step0QuestionForLang(langFromState(state)),
            refined_formulation: "",
            confirmation_question: "",
            business_name: state.business_name || "TBD",
            proceed_to_dream: "false",
            step_0: "",
        };
        return {
            ok: true,
            tool: "run_step",
            current_step_id: String(state.current_step),
            active_specialist: STEP_0_SPECIALIST,
            text: "",
            prompt: specialist.question,
            specialist,
            state: {
                ...state,
                active_specialist: STEP_0_SPECIALIST,
                last_specialist_result: specialist,
            },
        };
    }
    // --------- SPEECH-PROOF PROCEED TRIGGER (Step 0 readiness moment only) ---------
    const prev = state.last_specialist_result || {};
    const readinessAsked = state.current_step === STEP_0_ID &&
        String(prev?.action ?? "") === "CONFIRM" &&
        typeof prev?.confirmation_question === "string" &&
        prev.confirmation_question.trim() !== "" &&
        String(prev?.proceed_to_dream ?? "") === "false";
    const canProceedFromStep0 = readinessAsked && isClearYes(userMessage) && String(state.step_0_final ?? "").trim() !== "";
    if (canProceedFromStep0) {
        const proceedPayload = {
            action: "CONFIRM",
            message: "",
            question: "",
            refined_formulation: "",
            confirmation_question: "",
            business_name: state.business_name || "TBD",
            proceed_to_dream: "true",
            step_0: state.step_0_final || "",
        };
        state.active_specialist = STEP_0_SPECIALIST;
        state.last_specialist_result = proceedPayload;
    }
    // --------- ORCHESTRATE (decision 1) ----------
    const decision1 = orchestrate({ state, userMessage });
    // We do not render a session intro here.
    const showSessionIntro = decision1.show_session_intro;
    // --------- CALL SPECIALIST (first) ----------
    const call1 = await callSpecialistStrict({ model, state, decision: decision1, userMessage });
    let attempts = call1.attempts;
    let specialistResult = call1.specialistResult;
    // --------- UPDATE STATE (after first specialist) ----------
    let nextState = applyStateUpdate({
        prev: state,
        decision: decision1,
        specialistResult,
        showSessionIntroUsed: "false",
    });
    // --------- OPTIONAL CHAIN: immediate next-step intro on proceed flags ----------
    let finalDecision = decision1;
    if (shouldChainToNextStep(decision1, specialistResult)) {
        // For the Dream exercise readiness handshake, always use a clear "yes" token
        // for the chained DreamExplainer call to start deterministically.
        const chainUserMessage = String(decision1.current_step || "") === DREAM_STEP_ID &&
            String(specialistResult?.action ?? "") === "CONFIRM" &&
            String(specialistResult?.suggest_dreambuilder ?? "") === "true"
            ? yesTokenForLang(lang)
            : userMessage;
        const decision2 = orchestrate({ state: nextState, userMessage: chainUserMessage });
        if (String(decision2.specialist_to_call || "") && String(decision2.current_step || "")) {
            const call2 = await callSpecialistStrict({
                model,
                state: nextState,
                decision: decision2,
                userMessage: chainUserMessage,
            });
            attempts = Math.max(attempts, call2.attempts);
            specialistResult = call2.specialistResult;
            nextState = applyStateUpdate({
                prev: nextState,
                decision: decision2,
                specialistResult,
                showSessionIntroUsed: "false",
            });
            finalDecision = decision2;
        }
    }
    const text = buildTextForWidget({ specialist: specialistResult });
    const prompt = pickPrompt(specialistResult);
    // keep state consistent even though we don't render session intro copy here
    if (showSessionIntro === "true" && String(nextState.intro_shown_session) !== "true") {
        nextState.intro_shown_session = "true";
    }
    return {
        ok: true,
        tool: "run_step",
        current_step_id: String(nextState.current_step),
        active_specialist: String(nextState.active_specialist || ""),
        text,
        prompt,
        specialist: specialistResult,
        state: nextState,
        debug: {
            decision: finalDecision,
            attempts,
            language: lang,
            meta_user_message_ignored: looksLikeMetaInstruction(rawNormalized) && pristineAtEntry,
        },
    };
}
