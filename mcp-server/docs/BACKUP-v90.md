# Backup: version v90

**Version:** v90  
**Backup note date:** 2026-02-02

## Status for this version

This is version **v90** where everything **appears to work up through Big Why**:

- **Step 0 (ValidationAndBusinessName)** – works correctly
- **Dream step** – works correctly, including the Dream Builder flow
- **Purpose step** – works correctly, including:
  - Purpose examples flow with 3 examples related to Dream
  - "Choose a purpose for me" functionality
  - "Please give me another suggestion" repeat logic
  - "I'm pleased with this wording, continue to the next step Big Why" button
- **Big Why step** – appears to work (intro is shown)

## Important changes in this version

### Purpose step improvements:
- Section C added: "Give 3 examples" flow with specific intro text, 3 Purpose examples, and a reminder line
- Section D added: "Choose a purpose for me" flow that automatically proposes a Purpose
- Section E added: "Please give me another suggestion" flow that proposes a new, different Purpose
- Section F added: "I'm pleased with this wording, continue to the next step Big Why" flow that goes to CONFIRM with `proceed_to_next="true"`

### Known issues:
- There is a crash when the user chooses "I'm pleased with this wording, continue to the next step Big Why" — this happens because the backend uses the same `userMessage` for the next-step call. This must be fixed by using an empty `userMessage` when automatically proceeding to the next step in `run_step.ts` lines 1534–1551.

## Technical reference

- **VERSION** in `server.ts`: fallback `"v89"` (or via `process.env.VERSION`). For v90 this should be updated to `"v90"`.
- **Local testing:** `LOCAL_DEV=1 npm run dev` → http://localhost:8787/test
- **Production:** MCP endpoint `/mcp`, tool `run_step`

## Files changed

- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/purpose.ts` - New sections C, D, E, F added to PURPOSE_INSTRUCTIONS

## Use this backup as a reference

Use this backup as a reference or rollback point if later changes break behavior in this range. Everything up through Big Why appears to work as intended.
