export function buildSingleValueStepContractBlock(stepLabel: string, fieldName: string): string {
  return `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "${fieldName}", "wants_recap", "is_offtopic", "user_intent", "meta_topic".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect; runtime may normalize tone)
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
- REFINE:
  - action="REFINE"
  - refined_formulation non-empty
  - ${fieldName}=""
  - question=""
- ASK (collect/incomplete):
  - action="ASK"
  - refined_formulation=""
  - ${fieldName}=""
  - question=""
- ASK (valid/confirmed):
  - action="ASK"
  - refined_formulation non-empty
  - ${fieldName}=same as refined_formulation
  - question=""

${stepLabel} continuation and confirmation are handled by runtime contract menus and action codes.
`;
}

export function buildListStepContractBlock(stepLabel: string, fieldName: string, listRuleLine: string): string {
  return `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "${fieldName}", "wants_recap", "is_offtopic", "user_intent", "meta_topic", "statements".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - statements=[]
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect; runtime may normalize tone)
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - statements=preserve previous list
- ASK (collect/incomplete):
  - action="ASK"
  - question=""
  - refined_formulation=""
  - ${fieldName}=""
  - statements=updated list
- ASK/REFINE (valid):
  - action="ASK" or "REFINE"
  - question=""
  - refined_formulation=bullet list
  - ${fieldName}=same bullet list when finalized
  - statements=updated list
- ${listRuleLine}

${stepLabel} continuation and confirmation are handled by runtime contract menus and action codes.
`;
}
