# Bug Fix 2.0

Dit document bevat een nieuwe, opgeschoonde reeks copy-paste prompts voor een Codex agent.

De oude instructies zijn vervangen.
De nieuwe set stopt bewust bij de punten die nu met code en tests hard onderbouwd zijn.

Uitgangspunten voor deze reeks:
- geen aannames
- geen cosmetische UI-fixes
- geen hardcoded productcopy in runtime code
- vaste UX-copy alleen via de bestaande i18n/ui-stringlaag
- tests moeten het echte structurele probleem zichtbaar maken

---

## Fix 1 Prompt

Kopieer onderstaande prompt volledig:

```text
You are working in this repository:
/Users/MinddMacBen/business-canvas-chatkit

Task:
Fix grouped/list wording-compare feedback so it always matches the active compare unit, or is absent.

Problem:
In grouped compare flows, feedback_reason_text can still be computed once and then copied across later compare units.
That makes the top feedback line stale when the cursor moves to a different unit.

There is also a second structural issue:
the grouped compare payload currently depends on compare feedback being present at all.
So a valid “no unit-specific feedback” case can collapse the whole grouped compare UI instead of rendering without the feedback line.

Affected family at minimum:
- strategy
- productsservices
- rulesofthegame

What you must do:
1. Audit how grouped compare feedback is derived, stored, copied, and rendered.
2. Remove any model where one shared feedback reason is blindly reused across multiple compare units.
3. Change grouped compare so feedback is:
   - recomputed for the active unit, or
   - omitted for that unit when no valid unit-specific reason exists.
4. Decouple grouped compare rendering from “feedback must exist”.
5. Keep retained-items messaging separate from the agent feedback line.
6. Add regression tests that prove:
   - the first active compare unit can show valid matching feedback
   - a later compare unit does not inherit stale feedback from an earlier unit
   - grouped compare still renders when no valid unit-specific feedback exists

Structural rules:
- Work from one source of truth for grouped compare state and payload behavior.
- Do not introduce parallel truth between specialist state, wording payload, renderer, and UI helper layers.
- Do not solve this in the renderer if the stale state is still carried in the payload or specialist result.
- Do not keep one shared feedback blob that is later treated as if it were unit-specific truth.
- Do not let the UI require a feedback line when the real state model allows a valid no-feedback unit.
- Fixed UX copy belongs in i18n only.
- Dynamic feedback reasoning must come from runtime context, not catalog copy.

Evidence protocol:
- First prove the exact stale path from active compare unit to displayed feedback.
- Then prove where the ownership should live and where truth currently diverges.
- Fix the issue at the owner layer.
- Add tests at the state/payload layer and at the user-visible rendering layer.
- In the final summary, state explicitly which path is now the single source of truth.

GitHub context rule:
- Use the latest verifiable GitHub baseline only if it helps confirm earlier user-visible contract behavior.
- Compare visible behavior and payload contract outcome, not just code shape.
- If that baseline cannot be verified, do not guess.

Critical content rule:
- The feedback itself must remain dynamic and context-derived.
- Do not replace stale feedback with one generic canned sentence.
- Only fixed labels or neutral UX copy may live in i18n.

Strict constraints:
- No quick fixes.
- No UI-only hiding while stale feedback is still carried underneath.
- No hardcoded product sentences in runtime code.
- No shared feedback blob copied over all units.

Definition of done:
- grouped compare feedback always matches the active unit, or is absent
- stale feedback cannot leak across compare-unit cursor changes
- grouped compare can render correctly without a feedback line
- regression tests prove the behavior
```

--- EINDE FIX 1 ---

## Fix 2 Prompt

Kopieer onderstaande prompt volledig:

```text
You are working in this repository:
/Users/MinddMacBen/business-canvas-chatkit

Task:
Refine the feedback sanitizing model so generic acknowledgment does not erase real case-specific reasoning.

Problem:
The current feedback pipeline can collapse multi-sentence reasoning into only the first sentence.
If that first sentence is a generic acknowledgment, the sanitizer can remove the whole feedback line.

That means valid dynamic rationale can disappear in cases like:
- an acknowledgment sentence followed by a real reason
- a reason that starts with encouragement and then becomes specific

Goal:
Keep pure generic acknowledgment suppressed, but preserve real feedback when substantive reasoning exists.

What you must do:
1. Audit the exact chain from specialist feedback_reason_text to displayed feedback.
2. Identify where multi-sentence feedback is compacted too aggressively.
3. Distinguish these categories explicitly:
   - pure generic acknowledgment
   - acknowledgment plus substantive reason
   - clearly substantive single-sentence reasoning
4. Keep the second and third categories visible.
5. Add regression tests for:
   - pure generic acknowledgment in Dutch
   - pure generic acknowledgment in English
   - acknowledgment followed by a real reason
   - encouragement wording that still contains a concrete rationale

Structural rules:
- Work from one source of truth for feedback sanitizing and display eligibility.
- Do not introduce a second ad hoc filter in the renderer if the real issue lives in feedback normalization or policy logic.
- Do not duplicate feedback policy across multiple steps when one shared family rule is the correct model.
- Do not use a fallback that hides the loss of real dynamic reasoning.
- Fixed UX copy belongs in i18n only.
- Dynamic contentful reasoning must come from runtime context, not catalog copy.

Evidence protocol:
- First trace the full path from specialist feedback_reason_text to what is finally displayed.
- Prove exactly where substantive reasoning is lost.
- Fix the issue at that owner layer.
- Add regression tests for the loss case and the preserved case.
- In the final summary, state explicitly which function or layer is now the single source of truth for this policy.

GitHub context rule:
- Use the latest verifiable GitHub baseline only if it helps confirm earlier user-visible behavior for acknowledgment versus rationale.
- Compare behavior, not only implementation shape.
- If that baseline cannot be verified, do not guess.

Critical content rule:
- Real feedback must remain derived from user input, suggested wording, and step semantics.
- Do not solve this with hardcoded example sentences in runtime logic.
- Fixed neutral UX copy may live in i18n; contentful reasoning may not.

Strict constraints:
- No quick fixes.
- No overengineered classifier layer.
- No hardcoded product sentences in runtime code.
- Keep the policy simple, structural, and testable.

Definition of done:
- pure generic acknowledgment is still suppressed
- acknowledgment plus real rationale survives
- valid dynamic feedback is no longer lost just because the opening sentence is generic
- regression tests prove the distinction
```

--- EINDE FIX 2 ---

## Fix 3 Prompt

Kopieer onderstaande prompt volledig:

```text
You are working in this repository:
/Users/MinddMacBen/business-canvas-chatkit

Task:
Finish the refine-adjust route family by proving visible end-to-end widget outcomes for every exposed refine-adjust action.

Problem:
Current coverage proves route forwarding and contract alignment, but not yet that every visible refine-adjust capability leads to a real next widget state.

That leaves a structural gap:
- a button can be exposed
- the action can route correctly
- but there may still be too little proof that the user actually gets a visible refinement or clarification outcome

Affected route family at minimum:
- ACTION_DREAM_EXPLAINER_REFINE_ADJUST
- ACTION_PURPOSE_REFINE_ADJUST
- ACTION_BIGWHY_REFINE_ADJUST
- ACTION_ROLE_REFINE_ADJUST
- ACTION_ENTITY_EXAMPLE_REFINE
- ACTION_RULES_REFINE_ADJUST

What you must do:
1. Audit each route end-to-end:
   - menu exposure
   - action registry
   - route handoff
   - specialist behavior
   - resulting widget payload/render state
2. Add route-family tests that prove each exposed refine-adjust capability produces a renderable next widget state:
   - a new wording
   - or a clarification/adjustment question
3. If a route is exposed but not reliably end-to-end, fix it structurally.
4. If a route genuinely cannot be guaranteed, remove it from visible UI exposure instead of pretending support exists.

Structural rules:
- Work from one source of truth per exposed refine-adjust capability across menu exposure, route registry, specialist behavior, and widget outcome.
- Do not keep a visible button if its end-to-end outcome is not structurally guaranteed.
- Do not treat route forwarding alone as proof of support.
- Do not patch unsupported capabilities with renderer-only handling or fake success states.
- Fixed labels and control copy belong in i18n only.
- Dynamic refined wording or clarification must come from runtime context.

Evidence protocol:
- Prove the full path for each visible refine-adjust action from menu exposure to renderable next state.
- Identify where truth breaks if a route forwards but does not yield visible widget output.
- Fix the issue at the owner layer, or remove unsupported exposure.
- Add tests both for routing and for actual visible widget outcome.
- In the final summary, state explicitly which path now acts as the single source of truth for each supported action.

GitHub context rule:
- Use the latest verifiable GitHub baseline only if it helps confirm whether a capability was previously exposed or previously had a visible widget outcome.
- Compare user-visible behavior and contract outcome, not only route names.
- If that baseline cannot be verified, do not guess.

Critical content rule:
- New refined wording or adjustment questions must remain context-derived.
- Do not patch unsupported routes with canned wording.
- Fixed labels and control copy belong in i18n only.

Strict constraints:
- No quick fixes.
- No tests that only prove action forwarding.
- No fake success states.
- No visible menu exposure for unsupported capabilities.

Definition of done:
- every visible refine-adjust button has a guaranteed visible next widget outcome
- route-family tests prove widget behavior, not only routing
- unsupported exposure is removed rather than left half-working
```

--- EINDE FIX 3 ---

## Fix 4 Prompt

Kopieer onderstaande prompt volledig:

```text
You are working in this repository:
/Users/MinddMacBen/business-canvas-chatkit

Task:
Fix 4: Do a root-cause validation pass over the proven UI bug family and prove the UI now behaves correctly without regressions across the other known user-visible issues.

Problem:
Several user-visible UI bugs were addressed across grouped compare, feedback display, single-value cards, Dream Builder flows, wording-choice behavior, refine-adjust actions, and related widget rendering.
What is still missing is one clean validation pass that proves, point by point:
- the fix really lives at the owner layer
- the original root cause is actually removed
- the visible UI now does what it should
- the other known UI issues do not silently break or interfere with this behavior

Goal:
Produce one structural validation pass that proves the fixed UI behavior is real, stable, and not blocked by the other known issues.

Scope:
Use the proven user-visible issue list from the last 24 hours as the validation checklist.
Do not invent a new bug family.
Do not open a Fix 5 unless a new concrete reproducible bug is found.

Checklist in scope:
You must evaluate all 22 items below separately.
Do not merge them into broader categories.
Do not skip an item because it seems related to another one.

1. In grouped compare, the top feedback line could show feedback from an earlier compare choice.
2. In grouped compare, the whole compare UI could disappear when the active choice had no valid unit-specific feedback.
3. In grouped compare, retained-items text could be treated as if it were the agent feedback line.
4. A real feedback line could disappear completely when it started with "Ik denk dat ik begrijp wat je bedoelt."
5. A real feedback line could disappear completely when it started with "I think I understand what you mean."
6. Feedback with a generic opener plus a real reason could lose the real reason.
7. Encouraging wording with a concrete rationale could be suppressed even though it was still substantive.
8. After choosing the user's own wording, the user could see only a generic acknowledgment and not the real contentful reason.
9. After choosing the user's own wording, stale autosuggest framing could still remain visible on screen.
10. On single-value cards, acknowledgment, feedback, heading, and canonical wording could render in the wrong order or wrong place.
11. Dream Builder input could be misread as feedback on the already accepted dream, sending the user into the wrong flow.
12. Dream Builder could lose or overwrite canonical statements while a rewrite was still only pending.
13. Dream Builder compare could disappear while a real compare choice was still needed.
14. Near-duplicate Dream Builder statements could fail to give the user a visible keep-both or merge choice.
15. A current-value refinement could remain trapped behind wording-choice state instead of showing its own refinement state.
16. In strategy, the consolidate action could be missing when focus points overflowed.
17. Stuck-support question flow could fail to appear even when the user was clearly stuck.
18. Choose-for-me result/state could disappear or go stale on rerender, making visible choice outcomes inconsistent.
19. Shared auxiliary choice buttons could appear in the wrong place or remain visible when they should be hidden.
20. Fallback step titles could show incorrectly or inconsistently on screen.
21. Visible refine-adjust buttons could route correctly without guaranteed proof that they always produce a real next widget state.
22. Specifically for ACTION_DREAM_EXPLAINER_REFINE_ADJUST, there was no hard proof that the user always landed in the correct refine view.

What you must do:
1. Build one checklist from the proven UI-visible issues only.
2. For each checklist item, trace the full path:
   - triggering user action or state
   - owner layer
   - payload/state behavior
   - rendered UI outcome
3. For each item, prove the original root cause.
4. For each item, prove the root cause is now removed at the owner layer.
5. For each item, prove the visible UI now shows the correct result.
6. For each item, prove the other known issues do not interfere with that path.
7. If any item is not structurally solved, fix it at the owner layer.
8. If it cannot be structurally guaranteed, remove the visible exposure instead of pretending support exists.
9. Add or extend regression tests only where proof is still missing.

Validation checklist requirements:
For every issue, document and verify:
- what the user previously saw wrong on screen
- the exact root cause
- which layer owns the truth now
- the code-path and logic proof that explains why this behavior happened before
- the code-path and logic proof that explains why this behavior now cannot happen the same way
- which test proves the correct visible result
- which nearby known issues were checked for interference
- whether the behavior is now guaranteed, conditional, or still broken

Evaluation rule:
- You must report all 22 items one by one in order.
- If two items share part of the same root cause, still evaluate both separately.
- If one item is already solved indirectly by another fix, you still must prove that separately.
- Test proof alone is not sufficient.
- Logic proof alone is not sufficient.
- Every item must have both:
  - structural logic proof from the real owner path
  - regression proof from tests or other executable verification

Structural rules:
- Always work from one source of truth per behavior.
- Always identify the root cause before changing code.
- Fix ownership problems at the owner layer, not in the renderer only.
- Do not hide stale or wrong state in the UI while it still exists underneath.
- Do not introduce parallel truth between specialist state, wording payload, renderer, and UI helper layers.
- Do not patch unsupported behavior with fake success states.
- Do not replace dynamic runtime reasoning with canned product sentences.
- Fixed labels and neutral UX copy belong in i18n only.
- Dynamic reasoning and dynamic wording must come from runtime context.
- Keep it simple.
- No quick fixes.

Evidence protocol:
- First prove the original broken user-visible behavior.
- Then prove the exact root cause.
- Then prove where ownership belongs.
- Then fix only at that owner layer.
- Then prove the final visible UI outcome.
- Then prove the other known issues do not interfere with that exact path.
- For every point, include both:
  - logic proof from code, state, payload, and render ownership
  - executable proof from tests or direct reproducible verification
- If GitHub baseline helps verify earlier user-visible behavior, use only the latest verifiable baseline.
- Compare visible behavior and payload contract outcome, not only code shape.
- If baseline cannot be verified, do not guess.

Regression proof requirements:
You must add or verify proof at these layers when relevant:
- state/payload layer
- route or orchestration layer
- user-visible rendering layer

Strict constraints:
- No quick fixes.
- No renderer-only masking.
- No hardcoded runtime product sentences.
- No fake success states.
- No theory-only cleanup.
- No new bug family unless a concrete reproducible bug is proven.

Definition of done:
- every proven UI issue in scope has a root-cause trace
- every proven UI issue in scope has a visible end-state proof
- every proven UI issue in scope is shown not to be broken by the other known issues
- unsupported exposure is removed instead of left half-working
- tests prove the user-visible behavior, not only internal forwarding
- the final summary states explicitly which layer is now the single source of truth for each validated behavior

Final summary requirements:
For each checklist item, state:
- old visible bug
- root cause
- owner layer
- logic proof
- proof test
- result
- interference check result

Stopgrens:
Stop after this validation pass.
Ga pas verder met een nieuwe fix als daarna opnieuw een concrete reproduceerbare bug zichtbaar is.
Open geen extra fix op basis van theorie alleen.
```

--- EINDE FIX 4 ---

## Stopgrens

Stop hier voorlopig.

Ga pas verder met `Fix 5` als na deze vier fixes opnieuw een concreet reproduceerbare bug zichtbaar is.
Open geen extra fix op basis van theorie alleen.
