export function buildSingleValueStepContractBlock(stepLabel: string, fieldName: string): string {
  return `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "${fieldName}", "feedback_reason_text", "wants_recap", "is_offtopic", "user_intent", "meta_topic".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect; runtime may normalize tone)
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
- REFINE:
  - action="REFINE"
  - refined_formulation non-empty
  - ${fieldName}=""
  - question=""
  - feedback_reason_text must be one short localized sentence that explains the single strongest reason for the suggestion. It must be content-specific, written in agent voice, and grounded in the user's input and the step criteria. Do not use generic interpretation openers, filler, praise, or process talk.
- ASK (collect/incomplete):
  - action="ASK"
  - refined_formulation=""
  - ${fieldName}=""
  - question=""
  - feedback_reason_text=""
- ASK (valid/confirmed):
  - action="ASK"
  - refined_formulation non-empty
  - ${fieldName}=same as refined_formulation
  - question=""
  - feedback_reason_text=""

${stepLabel} continuation and confirmation are handled by runtime contract menus and action codes.
`;
}

export function buildListStepContractBlock(stepLabel: string, fieldName: string, listRuleLine: string): string {
  return `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "${fieldName}", "feedback_reason_text", "wants_recap", "is_offtopic", "user_intent", "meta_topic", "statements".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - statements=[]
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect; runtime may normalize tone)
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - statements=preserve previous list
- ASK (collect/incomplete):
  - action="ASK"
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - feedback_reason_text=""
  - statements=updated list
- ASK/REFINE (valid):
  - action="ASK" or "REFINE"
  - question=""
  - refined_formulation=bullet list
  - ${fieldName}=same bullet list when finalized
  - feedback_reason_text must be one short localized sentence when action="REFINE" and must be "" when action="ASK". The sentence must explain the one remaining difference or why the local rewrite helps, grounded in the user's input and step criteria. Do not use generic interpretation openers, filler, praise, or process talk.
  - statements=updated list
- ${listRuleLine}

${stepLabel} continuation and confirmation are handled by runtime contract menus and action codes.
`;
}
