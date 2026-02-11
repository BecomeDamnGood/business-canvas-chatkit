# Button visibility & routing – investigation (Part A)

## step-card.template.html – UI conditions

### showPreStart, sessionStarted, hasToolOutput
- **showPreStart** = `!sessionStarted` (line ~396). Session is only set when user clicks Start (btnStart click sets `sessionStarted = true`).
- **sessionStarted** = local-only boolean, never read from backend; only set to `true` on Start click.
- **hasToolOutput** = `Boolean(oa() && oa().toolOutput) || Boolean(getLastToolOutput() && Object.keys(getLastToolOutput()).length)` (line ~392). True when host provided toolOutput or cache has last tool output.

### showContinue
- **showContinue** (lines ~411–416):
  - `!showPreStart && hasToolOutput && (current === "step_0" || current === "dream") && specialist.action === "CONFIRM" && specialist.confirmation_question.trim() !== "" && !isDreamExplainerMode`
- So Continue was only shown for **step_0** or **dream**. Other steps with CONFIRM never showed Continue (fixed in Part B: remove step restriction).

### isDreamStepPreExercise
- **isDreamStepPreExercise** (lines ~408–410):
  - `current === "dream" && activeSpecialist === "Dream" && specialist.suggest_dreambuilder === "true" && specialist.action === "ASK"`

### btnStartDreamExercise behavior (readiness confirm)
- In readiness phase (Dream + `suggest_dreambuilder="true"` + `action="ASK"`), the **Start the exercise** button now sends a confirm action:
  - `callRunStep("ACTION_CONFIRM_CONTINUE")`
- Reason: readiness requires a clear confirm to trigger DreamExplainer via the backend guard; sending the original start-exercise ActionCode would loop the handshake.

### isDreamExplainerMode
- **isDreamExplainerMode** (line ~407):
  - `current === "dream" && activeSpecialist === "DreamExplainer"`

### choices.length > 0 and extractChoicesFromPrompt regex
- **choices** come from `extractChoicesFromPrompt(promptRaw)` where `promptRaw = result.prompt`.
- **extractChoicesFromPrompt** (lines ~354–373):
  - Splits prompt on `/\r?\n/`.
  - For each line: **regex** = `^\s*([1-9])[\)\.]\s*(.+?)\s*$` (single digit 1–9, then `)` or `.`, then label).
  - Collects `found[digit] = label`, keeps non-matching lines in `promptShown`.
  - Returns `{ promptShown: kept.join("\n").trim(), choices: [{ value: "1", label: "…" }, …] }`.
- When `choices.length > 0`, choice buttons are rendered; previously special buttons were not fully hidden in choice mode (fixed in Part B).

---

## run_step.ts – backend mapping for button-clicks

### prevQ for expandChoiceFromPreviousQuestion
- **Before fix**: `prevQ = state.last_specialist_result.question` (lines ~519–522). So only `question` was used; if the menu was in `confirmation_question`, clicking "1"/"2"/"3" could not expand correctly.
- **After fix (Part C)**: `prevQ = pickPrompt(state.last_specialist_result)` so same source as widget prompt (confirmation_question || question).

### result.prompt (pickPrompt) vs what prevQ used
- **pickPrompt(specialist)** (lines ~159–163): `confirmation_question || question || ""`.
- **result.prompt** returned to widget = `pickPrompt(specialistResult)` (e.g. line ~718).
- Widget displays `result.prompt` and runs `extractChoicesFromPrompt(promptRaw)` on it. So the menu the user sees is from pickPrompt. Using only `question` for prevQ caused misalignment when the menu was in `confirmation_question`; using pickPrompt for prevQ fixes that.

---

# Part D – Summary of changes and regression validation

## What changed

### UI (step-card.template.html)
1. **Single interaction mode per screen**
   - **Choice mode** (highest priority): if `choices.length > 0` → only choice buttons visible; `inputWrap`, `btnOk`, `btnStartDreamExercise`, `btnSwitchToSelfDream` hidden.
   - **Confirm mode**: if no choices and `specialist.action === "CONFIRM"` and there is a prompt (`confirmation_question` or `question`) → show only Continue button; removed the limitation `(current === "step_0" || current === "dream")` so Confirm works in all steps.
   - **Text mode**: otherwise → textarea + send; Dream pre-exercise and Dream Explainer “switch back” only in text mode when applicable.

2. **showContinue**
   - No longer restricted to step_0/dream: `showContinue` is now `!showPreStart && hasToolOutput && action === "CONFIRM" && hasPromptForConfirm && !isDreamExplainerMode`.

3. **setLoading**
   - Disables and re-enables all visible buttons: choice buttons, `btnStart`, `btnOk`, `btnStartDreamExercise`, `btnSwitchToSelfDream`. `callRunStep` still calls `setLoading(false)` in `finally`, so buttons are re-enabled after the tool call.

4. **Debug overlay (?debug=1)**
   - When the URL contains `?debug=1`, a compact JSON block is shown at the bottom with: `current_step`, `active_specialist`, `specialist.action`, `promptRaw200` (first 200 chars), `choicesLength`, `choiceLabels`, and booleans: `showContinue`, `isDreamStepPreExercise`, `isDreamExplainerMode`, `isLoading`.

### Backend (run_step.ts)
5. **prevQ for choice expansion**
   - Replaced `prevQ = last_specialist_result.question` with `prevQ = pickPrompt(last_specialist_result)` so the backend uses the same prompt source as the widget (`confirmation_question || question`). Clicking “1”/“2”/“3” now expands against the exact menu that was rendered.

## Why this fixes missing/disabled buttons

- **Missing Continue on CONFIRM in other steps**: Continue was only shown for step_0 and dream; now it is shown for any step when `action === "CONFIRM"` and there is a prompt.
- **Wrong or missing choice expansion**: The widget shows `result.prompt` (from `pickPrompt`); the backend now expands numeric clicks using the same `pickPrompt(last_specialist_result)`, so menu and expansion stay in sync.
- **Buttons stuck disabled**: `setLoading(true)` disables all relevant buttons (including Dream/Explainer); `setLoading(false)` in `finally` re-enables them after the response.
- **Cluttered UI in choice screens**: In choice mode only the numbered choice buttons are shown; special buttons and textarea are hidden.

## Regression validation (scenarios)

| Scenario | Expected | How to check |
|---------|----------|--------------|
| Any numbered menu | Only choice buttons visible, no special buttons | Open a step that returns “1) … 2) …”; verify only choice buttons; use `?debug=1` → `choicesLength` > 0, `choiceLabels` populated. |
| Any step with action=CONFIRM, no numbered options | Continue button visible | e.g. Purpose/Strategy CONFIRM; verify Continue visible; debug: `showContinue: true`, `choicesLength: 0`. |
| Dream pre-exercise | “Start the exercise” visible and clickable | Dream step, Dream specialist, suggest_dreambuilder + ASK; only in text mode; debug: `isDreamStepPreExercise: true`. |
| DreamExplainer ESCAPE/off-topic (2 options) | Exactly 2 choice buttons, no extra “switch back” in choice mode | In choice mode only choices; “Switch back” only in text mode when `isDreamExplainerMode`; debug: `choicesLength: 2`, `choiceLabels` length 2. |
| Loading during tool call | All visible buttons disabled; re-enabled after response | Click choice or send; during call debug `isLoading: true`; after response `isLoading: false` and buttons clickable. |

## Debug overlay usage

- Add `?debug=1` to the widget/page URL.
- Check the bottom overlay: `current_step`, `active_specialist`, `specialist.action`, `promptRaw200`, `choicesLength`, `choiceLabels`, and the booleans.
- Use this to confirm which mode (choice/confirm/text) is active and why buttons are shown or hidden.
