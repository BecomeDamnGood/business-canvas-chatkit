export function buildSingleValueStepContractBlock(stepLabel: string, fieldName: string): string {
  return `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "${fieldName}", "feedback_reason_text", "feedback_mode", "step_support_state", "wants_recap", "is_offtopic", "user_intent", "meta_topic".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - feedback_mode="none"
  - step_support_state="ok"
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect; runtime may normalize tone)
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - feedback_mode="none"
  - step_support_state="ok"
- REFINE:
  - action="REFINE"
  - refined_formulation non-empty
  - ${fieldName}=""
  - question=""
  - feedback_reason_text must be one short localized sentence that explains the single strongest reason for the suggestion. It must be content-specific, grounded in the user's input and the step criteria, and written in a warm, non-judgmental agent voice. Phrase it so the user can feel understood before the strongest content reason is named, but do that naturally for the specific case, not with a fixed stock opener. Do not use generic interpretation openers, filler, praise, process talk, detached editorial phrasing, or repeat the refined sentence.
  - feedback_mode must be:
    - "compare_suggestion" only when the runtime should show "Your input / My suggestion" because the suggestion is meaningfully preferable to the user's wording
    - "affirm_input" when the user's wording is already strong and you are only lightly sharpening it
    - "refine_current" when you are rewriting an already chosen current wording after user feedback
  - step_support_state="ok" unless the user is explicitly still stuck and you are returning the stuck helper or graceful exit flow below.
- ASK (collect/incomplete):
  - action="ASK"
  - refined_formulation=""
  - ${fieldName}=""
  - question=""
  - feedback_reason_text=""
  - feedback_mode="none"
  - step_support_state="ok" unless the user is clearly stuck as defined below.
- ASK (valid/confirmed):
  - action="ASK"
  - refined_formulation non-empty
  - ${fieldName}=same as refined_formulation
  - question=""
  - feedback_reason_text=""
  - feedback_mode="none"
  - step_support_state="ok"

STUCK SUPPORT CONTRACT (HARD)
- step_support_state must be "stuck" when the user clearly signals they do not understand this step, cannot move forward in this step, truly do not know what to answer, or remains unable to answer after earlier help. Infer this semantically from the turn and the current step context. Do not use language-specific phrase lists.
- Read STUCK SUPPORT STATE from the injected system context:
  - current_step_stuck_count
  - current_step_support_mode
- If step_support_state="stuck" and current_step_stuck_count < 1:
  - keep this as the first stuck turn for the step
  - answer normally for the step in your best coaching voice
  - do not output numbered menu-like options in message/question
- If step_support_state="stuck" and current_step_stuck_count >= 1 and current_step_support_mode is not "stuck_questions":
  - action="ASK"
  - message must contain:
    1. one short empathetic introduction that acknowledges this step can genuinely be difficult
    2. one short invitation to answer three focused questions
    3. exactly 3 DASH bullets tailored to this step that could help the user think
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
- If step_support_state="stuck" and current_step_support_mode is "stuck_questions":
  - action="ASK"
  - message must become a final graceful exit screen in the user's language
  - start message with one standalone heading line using <strong>...</strong>
  - then add short body text that says this method may not be the right fit right now, the user can contact Ben via https://www.bensteenstra.com or try again later, and end with a warm sign-off plus "Ben Steenstra"
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""

${stepLabel} continuation and confirmation are handled by runtime contract menus and action codes.
`;
}

export function buildListStepContractBlock(stepLabel: string, fieldName: string, listRuleLine: string): string {
  return `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "${fieldName}", "feedback_reason_text", "step_support_state", "wants_recap", "is_offtopic", "user_intent", "meta_topic", "statements".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - step_support_state="ok"
  - statements=[]
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect; runtime may normalize tone)
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - step_support_state="ok"
  - statements=preserve previous list
- ASK (collect/incomplete):
  - action="ASK"
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - step_support_state="ok" unless the user is clearly stuck as defined below.
  - statements=updated list
- ASK/REFINE (valid):
  - action="ASK" or "REFINE"
  - question=""
  - refined_formulation=bullet list
  - ${fieldName}=same bullet list when finalized
  - feedback_reason_text must be one short localized sentence when action="REFINE" and must be "" when action="ASK". The sentence must explain the one remaining difference or why the local rewrite helps, grounded in the user's input and step criteria, and written in a warm, non-judgmental agent voice. Phrase it so the user can feel understood before the strongest content reason is named, but do that naturally for the specific case, not with a fixed stock opener. Do not use generic interpretation openers, filler, praise, process talk, detached editorial phrasing, or repeat the displayed list.
  - step_support_state="ok" unless the user is explicitly still stuck and you are returning the stuck helper or graceful exit flow below.
  - statements=updated list
- ${listRuleLine}

STUCK SUPPORT CONTRACT (HARD)
- step_support_state must be "stuck" when the user clearly signals they do not understand this step, cannot move forward in this step, truly do not know what to answer, or remains unable to answer after earlier help. Infer this semantically from the turn and the current step context. Do not use language-specific phrase lists.
- Read STUCK SUPPORT STATE from the injected system context:
  - current_step_stuck_count
  - current_step_support_mode
- If step_support_state="stuck" and current_step_stuck_count < 1:
  - keep this as the first stuck turn for the step
  - answer normally for the step in your best coaching voice
  - do not output numbered menu-like options in message/question
- If step_support_state="stuck" and current_step_stuck_count >= 1 and current_step_support_mode is not "stuck_questions":
  - action="ASK"
  - message must contain:
    1. one short empathetic introduction that acknowledges this step can genuinely be difficult
    2. one short invitation to answer three focused questions
    3. exactly 3 DASH bullets tailored to this step that could help the user think
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - statements=preserve previous list
- If step_support_state="stuck" and current_step_support_mode is "stuck_questions":
  - action="ASK"
  - message must become a final graceful exit screen in the user's language
  - start message with one standalone heading line using <strong>...</strong>
  - then add short body text that says this method may not be the right fit right now, the user can contact Ben via https://www.bensteenstra.com or try again later, and end with a warm sign-off plus "Ben Steenstra"
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - statements=preserve previous list

${stepLabel} continuation and confirmation are handled by runtime contract menus and action codes.
`;
}

export function buildStuckSupportInstructionBlock(stepLabel: string, fieldName: string, options?: {
  preserveStatements?: boolean;
}): string {
  const preserveStatementsLine = options?.preserveStatements ? '- statements=preserve previous list' : "";
  return `
STUCK SUPPORT CONTRACT (HARD)
- Always return "step_support_state" as "ok" or "stuck".
- Set step_support_state="stuck" when the user clearly signals they do not understand ${stepLabel}, cannot move forward in ${stepLabel}, truly do not know what to answer, or remains unable to answer after earlier help. Infer this semantically from the turn and the step context. Do not use language-specific phrase lists.
- Read STUCK SUPPORT STATE from the injected system context:
  - current_step_stuck_count
  - current_step_support_mode
- If step_support_state="stuck" and current_step_stuck_count < 1:
  - keep this as the first stuck turn for the step
  - answer normally for ${stepLabel}
  - do not output numbered menu-like options in message/question
- If step_support_state="stuck" and current_step_stuck_count >= 1 and current_step_support_mode is not "stuck_questions":
  - action="ASK"
  - message must contain:
    1. one short empathetic introduction that acknowledges this step can genuinely be difficult
    2. one short invitation to answer three focused questions
    3. exactly 3 DASH bullets tailored to ${stepLabel}
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  ${preserveStatementsLine}
- If step_support_state="stuck" and current_step_support_mode is "stuck_questions":
  - action="ASK"
  - message must become a final graceful exit screen in the user's language
  - start message with one standalone heading line using <strong>...</strong>
  - then add short body text that says this method may not be the right fit right now, the user can contact Ben via https://www.bensteenstra.com or try again later, and end with a warm sign-off plus "Ben Steenstra"
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  ${preserveStatementsLine}
`;
}
