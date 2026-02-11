# Backup: version v91

**Version:** v91  
**Backup note date:** 2026-02-02

## Status for this version

This is version **v91** where the Purpose and Big Why steps were refined with improved UI flows and button behavior:

- **Step 0 (ValidationAndBusinessName)** – works correctly
- **Dream step** – works correctly, including the Dream Builder flow
- **Purpose step** – works correctly, including:
  - Purpose examples flow with 3 examples tied to Dream
  - "Choose a purpose for me" functionality
  - "Ask 3 questions to help me define the Purpose" flow (Route G)
  - Refinement loop with consistent button text ("I'm happy with this wording, please continue to next step Big Why" and "Refine the wording")
  - Purpose instruction hint below the text area for Route G
- **Big Why step** – works correctly, including:
  - Updated INTRO buttons ("Give me an example of the Big Why" and "Explain the importance of a Big Why")
  - Direct REFINE output for "Give me an example of the Big Why" (Route B')
  - Refinement loop for Big Why (Route E')
  - Improved formulation focusing on why Dream and Purpose matter for people and society

## Important changes in this version

### Purpose step improvements:
- Route G added: "Ask 3 questions to help me define the Purpose" flow with specific intro text, 3 questions, and an instruction hint
- Route H added: after answering the 3 questions, a Purpose is proposed
- Route A adjusted: only "I'm happy with this wording, please continue to next step Big Why" button, without the "Refine the wording" button
- Routes A, D, E, H, F: consistent button text implemented
- Refinement loop: "Refine the wording" generates new Purpose formulations until confirmation
- UI: Purpose instruction hint added below the text area for Route G

### Big Why step improvements:
- INTRO buttons updated: "Give me an example of the Big Why" and "Explain the importance of a Big Why"
- Route B' added: direct REFINE output for "Give me an example of the Big Why" with specific intro text
- Route E' added: refinement loop for Big Why with consistent button text
- Route F' added: confirmation flow that proceeds to the Role step
- Route A adjusted: option 3 text changed to "Give me an example of the Big Why"
- Choice prompt updated: "Formulate your Big Why or choose an option."
- Question text updated: "Are you content with this Big Why or do you want to refine it?"
- LLM instructions strengthened: focus on why Dream and Purpose are meaningful and important for people and society

## ⚠️ Known issues and considerations

### Critical considerations for the next version:

1. **Language switching is fragile**
   - The language switch functionality is fragile and can behave unexpectedly when the language changes during a conversation
   - This should be addressed in a future version

2. **Buttons are too “smart”**
   - Button behavior is too complex and “smart” — buttons are generated based on parsing LLM output
   - The `extractChoicesFromPrompt()` function in `step-card.html` parses numbered options from the `question` field
   - This makes button rendering dependent on specific LLM formatting and therefore fragile
   - **After this backup, the button behavior should be changed** to be more robust and less dependent on LLM formatting

## Technical reference

- **VERSION** in `server.ts`: fallback `"v89"` (or via `process.env.VERSION`). For v91 this should be updated to `"v91"`.
- **Local testing:** `LOCAL_DEV=1 npm run dev` → http://localhost:8787/test
- **Production:** MCP endpoint `/mcp`, tool `run_step`

## Files changed

- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/purpose.ts` - Routes A, D, E, F, G, H updated with consistent button text and new flows
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/bigwhy.ts` - Routes A, B', E', F' added/updated, INTRO buttons updated, LLM instructions strengthened
- `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.html` - Purpose instruction hint added; button rendering logic (extractChoicesFromPrompt) used for dynamic button generation

## Use this backup as a reference

Use this backup as a reference or rollback point if later changes break behavior in this range. This version contains full Purpose and Big Why flows with improved UI, but has known issues around language switching and button behavior that should be addressed in later versions.
