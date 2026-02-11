# Step 1 behavior – request path, root causes, fix plan, acceptance tests

## 1. Request/response path (new session)

### server.ts (start handling)
- **Lines 63–91**: Tool handler receives `current_step_id`, `user_message`, `state`.
- **Lines 69–71**: When `current_step_id.toLowerCase() === "start"`, `user_message` is forced to `""` before calling the backend; raw message is only used for `seed_user_message` (response metadata).
- **Lines 87–90**: Calls `runStepTool({ user_message, state })` only — **seed/initiator is never passed into the handler**.
- **Lines 94–108**: Builds `structuredContent` from result; attaches `seed_user_message` to response for the widget only.

### run_step.ts (Step 0 / Step 1 decision)
- **Lines 719–723**: Parses args, migrates state, `userMessageRaw` / `userMessageCandidate` from `args.user_message`.
- **Lines 481–487**: Sets `state.initial_user_message` only when a **non-empty** `userMessageCandidate` is present.
- **Lines 458–469**: Backend fallback: if `userMessage` is `""` and `state.initial_user_message` is set (and step_0, no step_0_final, no last_specialist_result), sets `userMessage = initialUserMessage`.
- **Lines 467–472**: `isStartTrigger` = `userMessage === ""` and step_0, intro not shown, no last_specialist_result.
- **Lines 474–528**: If `isStartTrigger`: sets `intro_shown_session`, then returns either (a) Step 0 confirmation (if `step0Final`) or (b) **first-time Step 0 question** via `step0QuestionForLang(langFromState(state))` (line 524).
- **Lines 139–141, 764–765**: `langFromState(state)` = `state.language || "en"`. On pristine/empty state, **language is `"en"`**.
- **Lines 576–583 (step-card.html)**: On Start click: if `oa().toolOutput` exists, only `render()`; else `callRunStep("")` → one tool call with `current_step_id: nextState.current_step || "step_0"`, `user_message: ""`, `state`.

### step-card.html (prestart/start rendering)
- **Lines 409–421**: `render(overrideToolOutput)`: `toolData()` from override, then `oa().toolOutput`, then `getLastToolOutput()`.
- **Lines 434–441**: `hasToolOutput` / `persistedStarted` → `sessionStarted = true`; `showPreStart = !sessionStarted`.
- **Lines 423–424, 313–318**: `uiLang(state)` prefers `result.state.language`, then `widgetState.language`, then `navigator.language`.
- **Lines 419–421**: When `showPreStart`, card shows `prestartWelcomeForLang(lang)` and Start button; no prompt.
- **Lines 457–474**: Start click: `sessionStarted = true`; if `oa().toolOutput` exists → `render()` only; else `callRunStep("")`.

So: **server.ts** → **run_step.ts** (start branch or orchestrate → specialist) → one tool result → **step-card.html** `render()` (one card per tool output).

---

## 2. Root causes

### Two tool calls / two cards
- **Cause**: Two separate **invocations** of the `run_step` tool for the same logical “start” turn. Each invocation produces one tool result; the host renders one card per tool result (OpenAI SDK: one result per tool call).
- **Where it happens**:
  - **server.ts:63–108**: Every tool call runs the handler once and returns one `structuredContent`. Two calls ⇒ two results ⇒ two cards.
  - **step-card.html:578–584**: Widget only skips calling when `oa().toolOutput` already exists. If the user clicks Start before the composer has returned a tool result, the widget calls `run_step`. The composer can then also call `run_step` for the same turn (e.g. “start” intent) ⇒ second tool call ⇒ second card.
- **Exact condition**: (1) User clicks Start and/or sends a start-like message. (2) Widget calls `run_step("step_0", "", state)`. (3) Composer also calls `run_step("start" or "step_0", …)` for that turn. (4) No guarantee that `toolOutput` is set before the widget’s Start click, so the “if toolOutput exists, don’t call” guard does not prevent the second call when the composer calls after the widget.

### Language mix (EN question, then NL confirmation)
- **Cause**: First Step 1 (step_0) response uses **default language** because state has no `language`; later response uses **language detected from user input** (e.g. another language).
- **Where it happens**:
  - **run_step.ts:139–141**: `langFromState(state)` returns `state.language || "en"`. Pristine/empty state ⇒ `"en"`.
  - **run_step.ts:524**: First-time Step 0 question is `step0QuestionForLang(langFromState(state))` ⇒ EN when state has no language.
  - **run_step.ts:262–282, 764**: `ensureLanguageFromUserMessage(state, userMessage)` runs only when there is a non-empty `userMessage`; it sets and locks `state.language` from `detectLanguageHeuristic(userMessage)`. So the **first** card (empty message, start trigger) never sets language; the **second** interaction (user reply in another language) sets `state.language` from the heuristic and the confirmation follows that language.
- **step-card.html:313–318**: `uiLang(state)` uses `result.state.language` then widgetState then navigator. So UI labels can switch to NL once state has `language: "nl"`, while the first backend question was already EN.

### Initiator message not used immediately
- **Cause**: When the **composer** sends a start call with the user’s message (e.g. `current_step_id: "start"`, `user_message: "I have a bakery"`), the **server** clears `user_message` to `""` and never passes that text into the backend. The backend therefore never sees the initiator for that request.
- **Where it happens**:
  - **server.ts:69–71**: `user_message = current_step_id.toLowerCase() === "start" ? "" : user_message_raw` ⇒ initiator is dropped before `runStepTool`.
  - **server.ts:87–90**: `runStepTool({ user_message, state })` — no `seed_user_message` or equivalent passed.
  - **run_step.ts:458–469**: Fallback “use initial_user_message when Start with empty input” only works when `state.initial_user_message` is already set. That is only set in run_step when a **previous** request had a non-empty `user_message` (lines 481–487). So when the **first** request is composer’s (“start”, “I have a bakery”, {}), backend receives `user_message: ""` and `state: {}` ⇒ no `initial_user_message` ⇒ start trigger runs with empty message ⇒ generic EN question; initiator is never used for that response.

---

## 3. Minimal fix plan (max 3 changes)

1. **File: server.ts — exact area: tool handler, before `runStepTool` (around lines 64–91)**  
   **Change**: When `current_step_id.toLowerCase() === "start"` and `user_message_raw.trim()` is non-empty, set `state.initial_user_message = user_message_raw.trim()` (merge into the existing `state` object) before calling `runStepTool({ user_message, state })`.  
   **Intended behavior**: Composer start calls that carry the user’s message put that message into state so the backend can use it in the same request (fallback at run_step.ts:458–469), set language from it, and return one card with the right language and content; initiator is used immediately.

2. **File: run_step.ts — exact area: start trigger, first-time Step 0 question (around lines 519–528)**  
   **Change**: When in the “first-time Step 0 setup question” branch (no `step0Final`), if `state.language` is still empty, set language from `state.initial_user_message` via `detectLanguageHeuristic` and assign `state.language` (and optionally `language_locked`) so that `step0QuestionForLang(langFromState(state))` uses that language.  
   **Intended behavior**: First card can be in the user’s language when the only hint we have is `initial_user_message` (e.g. from fix 1), avoiding EN question followed by a different-language confirmation when the user already signaled that language.

3. **File: step-card.html — exact area: Start button click (around lines 457–474)**  
   **Change**: When the user clicks Start and we are about to call `run_step`, pass `state` that includes `language` from the widget (e.g. from `uiLang(state)` / `widgetState.language` or `navigator.language`) so that the first backend question uses that language when state is otherwise empty. (Ensure `ensureLanguageInState` / payload already send this; if they do, add a short comment that this is required so the first card is not default EN.)  
   **Intended behavior**: When the **widget** is the sole caller for start (no composer message), the first Step 1 card uses the widget’s language (e.g. navigator) instead of default EN, reducing EN→other-language mix when the user’s locale is not English.

(If the widget already reliably sends `language` in `state` on first Start click, change 3 can be limited to a comment or omitted; the critical backend fixes are 1 and 2.)

---

## 4. Acceptance tests (3 manual steps)

1. **Single card for start**  
   Open a new session, click **Start** in the widget (do not type in the chat).  
   **Pass**: Exactly one Step 1 card/tool output is shown.  
   **Fail**: Two Step 1 cards appear.

2. **Initiator used and single card when composer starts with message**  
   Open a new session, type in chat something like “I have a bakery called X” and send so that the composer calls the tool with a start intent and that message.  
   **Pass**: One Step 1 card is shown and the content reflects the initiator (e.g. confirmation or follow-up about the bakery), not the generic “What type of venture…” only.  
   **Fail**: Generic question only, or two cards (one generic, one with initiator).

3. **Consistent language in Step 1**  
   (a) New session, browser/lang set to a non-English language; click **Start** in the widget only.  
   **Pass**: The first Step 0 question and any confirmation in that same step are in that language (no EN question then different-language confirmation in the same step).  
   (b) New session, type a non-English initiator in chat (e.g. “Tengo una panadería”) and send so the composer calls run_step for start with that message.  
   **Pass**: The first Step 1 response is in that language.  
   **Fail**: First text is in English and the next is in another language within the same step.
