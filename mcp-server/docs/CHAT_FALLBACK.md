# Chat-visible text paths (Step 1)

## Where chat-visible text can originate

1. **Tool response `content` (server.ts)**  
   The run_step tool handler returns `{ content: [{ type: "text", text: "..." }], structuredContent }`.  
   **Chat-visible field:** `content[0].text` is the only field the host may display as assistant message in the normal chat.  
   Success and error paths both set this; it must be exactly one line (redirect), never JSON/code/debug.

2. **Tool fallback on error (server.ts catch block)**  
   On run_step failure we build `fallbackResult` and put it in `structuredContent.result`.  
   The widget renders from `result.text`, `result.prompt`, `result.specialist`, `result.state`.  
   **Chat:** Only `content[0].text` is used for chat; we keep it as the one-line fallback.  
   **Widget:** `result.text` / `result.prompt` are shown in the card; they must be the same redirect (or existing errorMessage key) so no debug/state leaks.

3. **Integrator fallback (integrator.ts)**  
   `integrateUserFacingOutput` returns `{ text, debug }` when specialist output is unparseable; fallback text is "What would you like to do next?".  
   This function is not currently used by the run_step tool or server.ts; run_step builds `text` via `buildTextForWidget`.  
   If a caller used integrator output for chat, `text` would be chat-visible; it is not in the current flow.

4. **run_step return value (run_step.ts)**  
   Returns `{ ok, tool, current_step_id, active_specialist, text, prompt, specialist, state, debug? }`.  
   **Chat:** The server does not send these fields directly to chat; it sends `content[0].text` and `structuredContent`.  
   **Widget:** Receives `structuredContent.result` (same shape). Widget displays `result.text`, `result.prompt`, `result.specialist`, etc. It does not render `result.debug` in the main UI (debug overlay is gated by `?debug=1`).

## Summary

- **Chat:** Only `content[0].text` in the tool response is chat-visible. It must be a single redirect line, no formatting, no JSON.
- **Widget:** Uses `structuredContent.result` (text, prompt, specialist, state). Debug must not appear in user-facing fields; debug overlay stays behind `?debug=1`.
