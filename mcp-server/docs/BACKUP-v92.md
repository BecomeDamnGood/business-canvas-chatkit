# Backup: version v92

**Version:** v92  
**Backup note date:** 2026-02-02

## Status for this version

This is version **v92** where all buttons up through the Big Why step were converted to a fully hard-coded ActionCode system:

- **Step 0 (ValidationAndBusinessName)** – works correctly
- **Dream step** – works correctly, including Dream Builder flow; all buttons hard-coded with ActionCodes
- **DreamExplainer step** – works correctly; all buttons hard-coded with ActionCodes
- **Purpose step** – works correctly; all buttons hard-coded with ActionCodes
- **Big Why step** – works correctly; all buttons hard-coded with ActionCodes, including:
  - REFINE menu buttons with exact labels: "I'm happy with this wording, continue to step 5 Role" and "Redefine the Big Why for me please"
  - Prompt text: "Define your Big Why or Choose an option."

## Important changes in this version

### Hard-Coded Button Action Codes System

**Full implementation of the hard-coded button system:**

1. **Backend ActionCode Handler** (`run_step.ts`):
   - `processActionCode()` implemented with deterministic switch/case for all ActionCodes
   - `HARD_CONFIRM_ACTIONS` set for direct confirm handling without LLM routing
   - Old `determineConfirmChoiceIndices()` function removed
   - `confirm_choice_indices` removed from return type

2. **UI ActionCode Mapping** (`step-card.html`):
   - `getActionCodeForChoice()` implemented with hard-coded mapping from `menu_id` + `choiceIndex` + `currentStep` to ActionCode
   - `renderChoiceButtons()` updated to send ActionCodes instead of `choice:X` tokens
   - Pre-validation added: buttons are only rendered if an ActionCode mapping exists
   - No fallback to the old system (error message if mapping is missing)

3. **Specialist Instructions** (all step files):
   - ACTION CODE INTERPRETATION sections added to all step files:
     - `dream.ts`
     - `dream_explainer.ts`
     - `purpose.ts`
     - `bigwhy.ts`
     - `role.ts`
     - `entity.ts`
     - `strategy.ts`
     - `rulesofthegame.ts`
     - `presentation.ts`

4. **Big Why REFINE Menu Fix**:
   - Button labels updated to the exact text:
     - "I'm happy with this wording, continue to step 5 Role"
     - "Redefine the Big Why for me please"
   - Prompt text updated to: "Define your Big Why or Choose an option."
   - Explicit `menu_id="BIGWHY_MENU_REFINE"` instruction added

### Documentation

- **Plan documentation**: `.cursor/plans/hard-coded_button_action_codes_systeem_b9ba17ee.plan.md`
  - Full button inventory matrix for all steps
  - Implementation details and migration strategy
  - Button labels and ActionCodes documented

## Benefits of the new system

- **100% deterministic**: no LLM routing for buttons
- **Explicit**: each button has a fixed ActionCode
- **Testable**: each ActionCode can be tested independently
- **Maintainable**: new buttons = add a new ActionCode
- **No context dependency**: ActionCode is always the same, regardless of state

## Technical reference

- **VERSION** in `server.ts`: fallback `"v92"` (or via `process.env.VERSION`)
- **Local testing:** `LOCAL_DEV=1 npm run dev` → http://localhost:8787/test
- **Production:** MCP endpoint `/mcp`, tool `run_step`

## Files changed

### Backend
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts`
  - `processActionCode()` function added
  - `HARD_CONFIRM_ACTIONS` set added for direct confirm handling
  - `determineConfirmChoiceIndices()` removed
  - `confirm_choice_indices` removed from return type
  - `mapChoiceTokenToRoute()` kept as deprecated fallback

### Frontend
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.html`
  - `getActionCodeForChoice()` function added
  - `renderChoiceButtons()` updated for ActionCode mapping
  - Pre-validation added

### Specialist Instructions
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/dream.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/dream_explainer.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/purpose.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/bigwhy.ts` - ACTION CODE INTERPRETATION section added + REFINE menu buttons and prompt text fixed
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/role.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/entity.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/strategy.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/rulesofthegame.ts` - ACTION CODE INTERPRETATION section added
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/presentation.ts` - ACTION CODE INTERPRETATION section added

### Documentation
- `/Users/MinddMacBen/.cursor/plans/hard-coded_button_action_codes_systeem_b9ba17ee.plan.md` - Full button inventory matrix and implementation plan

## Status per step

- ✅ **Step 0** - Hard-coded buttons implemented
- ✅ **Dream** - Hard-coded buttons implemented
- ✅ **DreamExplainer** - Hard-coded buttons implemented
- ✅ **Purpose** - Hard-coded buttons implemented
- ✅ **Big Why** - Hard-coded buttons implemented (including REFINE menu fix)
- ⏳ **Role** - Hard-coded buttons implemented (not tested yet)
- ⏳ **Entity** - Hard-coded buttons implemented (not tested yet)
- ⏳ **Strategy** - Hard-coded buttons implemented (not tested yet)
- ⏳ **Rules of the Game** - Hard-coded buttons implemented (not tested yet)
- ⏳ **Presentation** - Hard-coded buttons implemented (not tested yet)

## Use this backup as a reference

Use this backup as a reference or rollback point if later changes break behavior in this range. This version contains a fully hard-coded button system for all steps up through Big Why, with all agreements and ActionCodes documented in the plan document.
