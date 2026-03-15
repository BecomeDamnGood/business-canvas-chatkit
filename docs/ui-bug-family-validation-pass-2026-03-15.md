# UI Bug Family Validation Pass (2026-03-15)

Scope: the 22 proven user-visible issues from the last 24 hours only.

Outcome:
- No new concrete reproducible bug was found, so no Fix 5 was opened.
- One owner-layer gap was still real in grouped-compare rerender ownership and was fixed in `mcp-server/src/handlers/run_step_wording.ts`.
- The focused validation command passed after the fix:

```bash
cd mcp-server
TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test \
  src/core/feedback_display.test.ts \
  src/core/turn_policy_renderer.test.ts \
  src/core/stuck_support.test.ts \
  src/handlers/run_step_wording_intent.test.ts \
  src/handlers/run_step_pipeline.test.ts \
  src/handlers/run_step_ui_payload.test.ts \
  src/handlers/run_step_runtime_action_routing.test.ts \
  src/ui_render.test.ts \
  src/ui_sanitize.test.ts
```

## 1. Grouped compare could show feedback from an earlier compare choice
Old visible bug: the top feedback line could stay on an earlier compare unit after the active unit changed.
Root cause: the pending grouped-compare rerender path could rebuild compare feedback from top-level `feedback_reason_text` instead of the active compare unit.
Owner layer: `mcp-server/src/handlers/run_step_wording.ts`.
Logic proof: `groupedCompareWordingChoicePayload` reads `currentUnit.feedback_reason_text` and builds `compare_feedback` from that unit only; `buildWordingChoiceFromPendingSpecialist` now returns `comparePayload.compare_feedback` for grouped compare and bails out when no active-unit payload exists.
Proof test: `buildWordingChoiceFromPendingSpecialist keeps grouped compare feedback bound to the active unit instead of stale top-level feedback`.
Interference checked: items 2 and 3.
Result: guaranteed.

## 2. Grouped compare could disappear when the active choice had no valid unit-specific feedback
Old visible bug: the picker could either vanish mid-flow or silently reuse stale feedback to stay visible.
Root cause: grouped compare lacked one owner truth for active-unit feedback validity on rerender.
Owner layer: `mcp-server/src/handlers/run_step_wording.ts` plus `mcp-server/src/core/feedback_policy.ts`.
Logic proof: grouped-list compare policy requires explicit feedback and uses `emptyBehavior: "suppress_picker"`; `groupedCompareWordingChoicePayload` returns `null` when the active unit has no valid feedback, and pending rerender now also returns `null` instead of falling back to stale top-level feedback.
Proof test: `buildWordingChoiceFromPendingSpecialist suppresses grouped compare when the active unit has no valid feedback even if stale top-level feedback remains`; also `buildWordingChoiceFromTurn suppresses grouped compare when no explicit agent feedback is available`.
Interference checked: items 1 and 3.
Result: guaranteed, fail-closed unsupported exposure.

## 3. Retained-items text could be treated as the agent feedback line
Old visible bug: “already retained” list copy could end up looking like the feedback reason.
Root cause: retained-items instruction text and compare feedback were not enforced as separate contracts all the way to the widget.
Owner layer: `mcp-server/src/handlers/run_step_wording.ts` and `mcp-server/ui/lib/ui_render.ts`.
Logic proof: retained items are emitted only into `instruction`; compare reasoning is emitted only into `compare_feedback.text`; the widget reads the dedicated compare-feedback slot first.
Proof test: `buildWordingChoiceFromPendingSpecialist keeps grouped compare feedback bound to the active unit instead of stale top-level feedback`; `parseWordingChoiceInstruction keeps retained bullets separate`; `readWordingChoiceCompareFeedbackText prefers the dedicated compare feedback contract`.
Interference checked: items 1 and 2.
Result: guaranteed.

## 4. A real feedback line could disappear when it started with "Ik denk dat ik begrijp wat je bedoelt."
Old visible bug: Dutch feedback that began with a generic understanding opener could be stripped away.
Root cause: feedback sanitizing previously treated the opening sentence as the whole reason.
Owner layer: `mcp-server/src/core/feedback_display.ts`.
Logic proof: `sanitizeFeedbackReasonForDisplay` now splits sentences and suppresses only pure generic opener sentences; it keeps the first substantive sentence that follows.
Proof test: `sanitizeFeedbackReasonForDisplay keeps Dutch rationale after a generic acknowledgment opener`.
Interference checked: items 5, 6, and 7.
Result: guaranteed.

## 5. A real feedback line could disappear when it started with "I think I understand what you mean."
Old visible bug: English feedback with the same generic opener could be reduced to nothing.
Root cause: same sentence-selection bug as item 4, in the shared feedback sanitizer.
Owner layer: `mcp-server/src/core/feedback_display.ts`.
Logic proof: same owner path as item 4; only pure generic openers are removed, not the following substantive reason.
Proof test: `sanitizeFeedbackReasonForDisplay keeps rationale after a generic acknowledgment opener`.
Interference checked: items 4, 6, and 7.
Result: guaranteed.

## 6. Feedback with a generic opener plus a real reason could lose the real reason
Old visible bug: the opener survived or the real reason was dropped.
Root cause: multi-sentence feedback was compacted too aggressively before display.
Owner layer: `mcp-server/src/core/feedback_display.ts`.
Logic proof: sentence splitting happens before suppression, and the first non-generic sentence wins.
Proof test: `sanitizeFeedbackReasonForDisplay keeps rationale after a generic acknowledgment opener`.
Interference checked: items 4, 5, and 7.
Result: guaranteed.

## 7. Encouraging wording with a concrete rationale could be suppressed even though it was substantive
Old visible bug: feedback like “good start, but...” could disappear even when it contained a real reason.
Root cause: generic-ack detection was too broad instead of matching only pure acknowledgment sentences.
Owner layer: `mcp-server/src/core/feedback_display.ts`.
Logic proof: only exact pure-generic patterns are filtered; a mixed encouragement-plus-rationale sentence is preserved.
Proof test: `sanitizeFeedbackReasonForDisplay keeps encouragement when the sentence also contains concrete rationale`.
Interference checked: items 4, 5, 6, and 8.
Result: guaranteed.

## 8. After choosing the user's own wording, the UI could show only a generic acknowledgment and not the real reason
Old visible bug: user-pick confirmation could collapse to “your own wording is okay” without the real rationale.
Root cause: user-pick rendering had no guaranteed path to preserve substantive feedback once the picker resolved.
Owner layer: `mcp-server/src/core/turn_policy_renderer.ts` with fallback rules in `mcp-server/src/core/feedback_display.ts`.
Logic proof: renderer composes `userPickAcknowledgment`, `userPickFeedbackReasonForDisplay`, and canonical content in one path; the explicit reason survives when substantive and only falls back to catalog copy when the explicit text sanitizes to empty.
Proof test: `single-value valid output preserves feedback reason after user picks own wording`; `applyWordingPickSelection preserves feedback reason when user picks own single-value wording`.
Interference checked: items 6, 7, 9, and 10.
Result: guaranteed.

## 9. After choosing the user's own wording, stale autosuggest framing could remain visible
Old visible bug: “Based on your input I suggest...” could remain on screen after the user explicitly kept their own version.
Root cause: autosuggest framing lived in the carried message body instead of being stripped at the user-pick owner path.
Owner layer: `mcp-server/src/core/turn_policy_renderer.ts`.
Logic proof: when `wording_choice_selected === "user"`, `stripSuggestionFramingForUserPick` runs before the final `ui_content` is built.
Proof test: `single-value valid output strips autosuggest framing after user picks own wording`.
Interference checked: items 8 and 10.
Result: guaranteed.

## 10. On single-value cards, acknowledgment, feedback, heading, and canonical wording could render in the wrong order or place
Old visible bug: text blocks could be duplicated, misplaced, or appear both in free text and the card.
Root cause: single-value truth was split between message text, stale `ui_content`, and widget formatting.
Owner layer: `mcp-server/src/core/turn_policy_renderer.ts`, `mcp-server/src/handlers/run_step_ui_payload.ts`, and `mcp-server/ui/lib/ui_text.ts`.
Logic proof: renderer builds one `ui_content` payload; UI payload suppresses stale single-value content while wording-choice picker is active; card rendering uses the fixed order support text -> feedback -> heading -> canonical text.
Proof test: `renderSingleValueCardContent renders acknowledgment before feedback and canonical content`; `attachRegistryPayload suppresses single-value ui.content while wording-choice picker is active`; `single-value pending canonical wording hides canonical block, feedback reason, and stale ui content across steps`.
Interference checked: items 8, 9, and 15.
Result: guaranteed.

## 11. Dream Builder input could be misread as feedback on the already accepted dream
Old visible bug: new Dream Builder text could route into the accepted-dream refinement flow.
Root cause: current-value feedback detection did not cleanly exclude Dream Builder runtime modes.
Owner layer: `mcp-server/src/handlers/run_step_pipeline.ts`.
Logic proof: `shouldTreatTurnAsCurrentValueFeedback` now returns `false` for Dream Builder modes, so builder input stays in builder orchestration.
Proof test: `shouldTreatTurnAsCurrentValueFeedback never hijacks Dream Builder turns into current-value feedback`.
Interference checked: items 12, 13, and 15.
Result: guaranteed.

## 12. Dream Builder could lose or overwrite canonical statements while a rewrite was still only pending
Old visible bug: a pending rewrite could overwrite already accepted Dream Builder statements.
Root cause: pending builder rewrites were allowed to mutate canonical state too early.
Owner layer: `mcp-server/src/handlers/run_step_pipeline.ts` and `mcp-server/src/handlers/run_step_wording.ts`.
Logic proof: pending builder compare keeps canonical statements in state and specialist output until the wording choice is resolved.
Proof test: `runPostSpecialistPipeline restores Dream Builder canonical statements when a rewrite stays pending`; `buildWordingChoiceFromTurn keeps Dream Builder statements canonical while a rewritten addition is still pending`.
Interference checked: items 11, 13, and 14.
Result: guaranteed.

## 13. Dream Builder compare could disappear while a real compare choice was still needed
Old visible bug: a material rewrite could silently skip compare, especially when canonical dream text already existed.
Root cause: the Dream Builder material-rewrite path did not guarantee compare recovery when explicit feedback was absent or a canonical dream already existed.
Owner layer: `mcp-server/src/core/feedback_policy.ts` and `mcp-server/src/handlers/run_step_pipeline.ts`.
Logic proof: Dream Builder material rewrites use a dedicated fallback feedback policy and keep builder compare active until the user resolves it.
Proof test: `runPostSpecialistPipeline recovers Dream Builder compare when a material rewrite is returned without explicit feedback_reason_text`; `runPostSpecialistPipeline keeps Dream Builder compare active even when a canonical dream already exists`.
Interference checked: items 11, 12, and 14.
Result: guaranteed.

## 14. Near-duplicate Dream Builder statements could fail to show a keep-both or merge choice
Old visible bug: similar statements could be appended or replaced without a visible decision.
Root cause: near-duplicate builder statements were not converted into a visible grouped compare unit.
Owner layer: `mcp-server/src/handlers/run_step_wording.ts`.
Logic proof: Dream Builder near-duplicate detection now opens a grouped-list compare with dedicated “keep both” and “merge” labels and persists the chosen result into canonical builder state.
Proof test: `buildWordingChoiceFromTurn opens a merge choice for a near-duplicate Dream Builder statement`; `applyWordingPickSelection can keep both Dream Builder near-duplicate statements`; `applyWordingPickSelection can merge a Dream Builder near-duplicate into one stronger statement`.
Interference checked: items 12 and 13.
Result: guaranteed.

## 15. A current-value refinement could remain trapped behind wording-choice state
Old visible bug: the user could click refine and still remain in wording-choice state instead of a refine state.
Root cause: wording-choice state could outrank current-value refinement state in the renderer.
Owner layer: `mcp-server/src/core/turn_policy_renderer.ts`.
Logic proof: `current_value_refinement_pending` has its own canonical value and feedback path, and the renderer keeps the refine-confirm actions without relying on `wording_choice_pending`.
Proof test: `single-value current-value refinement uses its own state without wording-choice pending`; `dream builder_refine keeps confirm action for user-driven current-value refinements`.
Interference checked: items 10, 11, 21, and 22.
Result: guaranteed.

## 16. In strategy, the consolidate action could be missing when focus points overflowed
Old visible bug: more than 7 focus points could still show the wrong menu without consolidate.
Root cause: action visibility was not centrally tied to the overflow rule.
Owner layer: `mcp-server/src/core/turn_policy_renderer.ts`.
Logic proof: strategy action filtering exposes `ACTION_STRATEGY_CONSOLIDATE` only on overflow and hides the competing refine-more action in that state.
Proof test: `strategy confirm render exposes consolidate action when focus points overflow`; `strategy wording-pick render always appends canonical bullet context and never exposes consolidate action`.
Interference checked: items 19 and 21.
Result: guaranteed.

## 17. Stuck-support question flow could fail to appear even when the user was clearly stuck
Old visible bug: repeated stuck turns could stay in the normal menu flow instead of moving to support questions.
Root cause: stuck-support state was not owned and persisted at the step-support layer.
Owner layer: `mcp-server/src/core/stuck_support.ts` and `mcp-server/src/handlers/run_step_ui_payload.ts`.
Logic proof: stuck count and support mode are tracked per step, escalated after repeated stuck turns, and UI render mode switches to buttonless support-question mode for eligible steps.
Proof test: `step stuck support escalates from first stuck turn to questions to exit`; `runPostSpecialistPipeline escalates stuck support from server-side classifier even when specialist returns ok`; `stuck support questions mode suppresses step buttons for eligible steps`.
Interference checked: items 11 and 19.
Result: guaranteed.

## 18. Choose-for-me result/state could disappear or go stale on rerender
Old visible bug: choose-for-me outcomes could vanish when a later payload was leaner.
Root cause: choose-for-me had split ownership between route handling and later widget continuity.
Owner layer: special-route ownership in the action registry plus client continuity in `ui_sanitize`.
Logic proof: choose-for-me actions are registry-owned by special routes, and the widget continuity layer preserves the snapshot until the server explicitly clears it.
Proof test: `all choose-for-me actions are registry-owned by special routes`; `handleToolResultAndMaybeScheduleBootstrapRetry preserves choose-for-me snapshot when a later payload omits it`; `handleToolResultAndMaybeScheduleBootstrapRetry clears choose-for-me snapshot when the server sends an explicit empty map`; `callRunStep keeps choose-for-me snapshot in outbound state when latest render omitted it`.
Interference checked: items 19 and 20.
Result: guaranteed.

## 19. Shared auxiliary choice buttons could appear in the wrong place or remain visible when they should be hidden
Old visible bug: auxiliary Dream actions could leak into the wrong button group or remain visible when no shared choices existed.
Root cause: auxiliary button exposure and placement were not owned in one shared renderer path.
Owner layer: response finalization contract plus `ui_sanitize` shared-choice rendering.
Logic proof: auxiliary actions are emitted next to normal menu choices in the contract, switch-to-self stays out of the shared list, and the shared container hides when there are no shared choice actions.
Proof test: `interactive contract keeps menu choices and auxiliary Dream actions side by side`; `renderChoiceButtons renders auxiliary contract actions in the shared choice list`; `renderChoiceButtons keeps switch-to-self actions out of the shared choice list`; `renderChoiceButtons stays hidden when no shared choice actions are available`.
Interference checked: items 16, 17, and 18.
Result: guaranteed.

## 20. Fallback step titles could show incorrectly or inconsistently on screen
Old visible bug: step titles could be numbered in one place, unnumbered in another, or use the wrong fallback source.
Root cause: title fallback logic was split between runtime strings, section-title rules, and bundled UI extraction.
Owner layer: `mcp-server/ui/lib/ui_constants.ts` and `mcp-server/ui/lib/ui_render.ts`.
Logic proof: `titlesForLang` reads the registry title keys, `getSectionTitle` delegates to registry-backed section title formatting, and `extractStepTitle` strips step numbers from fallback titles.
Proof test: `titlesForLang exposes unnumbered step titles while stepper labels keep current UX`; `getSectionTitle preserves section title behavior for step_0, dream, presentation and business-name steps`; `bundled runtime keeps step title fallbacks unnumbered while preserving section title lookup`.
Interference checked: items 18 and 19.
Result: guaranteed.

## 21. Visible refine-adjust buttons could route correctly without proof that they always produce a real next widget state
Old visible bug: the route could exist, but there was no end-to-end proof that the widget always landed in a renderable next state.
Root cause: proof stopped at route forwarding instead of finishing at widget outcome ownership.
Owner layer: `mcp-server/src/handlers/run_step_runtime_action_routing.ts` and `mcp-server/src/handlers/run_step_pipeline.ts`.
Logic proof: refine-adjust actions stay special-route-owned in routing and each visible action is validated in pipeline output for a concrete renderable next widget state.
Proof test: `runStepRuntimeActionRoutingLayer lets refine-adjust action codes continue as specialist routes`; `runPostSpecialistPipeline exposes a renderable next widget outcome for every visible refine-adjust action`.
Interference checked: items 15, 16, and 22.
Result: guaranteed.

## 22. ACTION_DREAM_EXPLAINER_REFINE_ADJUST specifically lacked hard proof that it always lands in the correct refine view
Old visible bug: DreamExplainer refine-adjust had forwarding proof but not full proof of refine-state landing.
Root cause: no full owner-path evidence from action click to Dream Builder refine view.
Owner layer: `mcp-server/src/handlers/run_step_runtime_action_routing.ts` plus Dream Builder view selection in `mcp-server/src/handlers/run_step_ui_payload.ts`.
Logic proof: Dream refine-adjust sets Dream runtime mode to `builder_refine`, and Dream UI payload selection maps that mode to `dream_builder_refine`.
Proof test: `runStepRuntimeActionRoutingLayer lets refine-adjust action codes continue as specialist routes` (Dream scenario expects `builder_refine`); `runPostSpecialistPipeline exposes a renderable next widget outcome for every visible refine-adjust action` (Dream scenario expects `dream_builder_refine`); `callRunStep("ACTION_DREAM_EXPLAINER_REFINE_ADJUST")` keeps the canonical Dream continuity in outbound state.
Interference checked: items 11, 13, 15, and 21.
Result: guaranteed.

## Single Source Of Truth Summary
1. Grouped compare feedback and grouped compare visibility: `mcp-server/src/handlers/run_step_wording.ts`.
2. Feedback sanitizing and user-pick fallback semantics: `mcp-server/src/core/feedback_display.ts`.
3. Single-value visible composition and refine-vs-wording precedence: `mcp-server/src/core/turn_policy_renderer.ts`.
4. Widget content/view gating and Dream Builder view selection: `mcp-server/src/handlers/run_step_ui_payload.ts`.
5. Widget compare-feedback reading, shared-choice placement, and title fallback rendering: `mcp-server/ui/lib/ui_render.ts` and `mcp-server/ui/lib/ui_constants.ts`.
6. Stuck-support state escalation: `mcp-server/src/core/stuck_support.ts`.
7. Refine-adjust and choose-for-me routing ownership: `mcp-server/src/handlers/run_step_runtime_action_routing.ts` and the action registry.
