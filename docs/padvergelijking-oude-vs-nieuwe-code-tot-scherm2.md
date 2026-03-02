# Padvergelijking: oude vs nieuwe code (tot scherm 2)

Doel van dit document: vanaf het moment dat ChatGPT de app/tool aanroept, exact naast elkaar zetten wat er gebeurt in:

- **A = oude code** (snapshot in `/tmp/old_working_snapshot/business-canvas-chatkit`)
- **B = nieuwe code** (huidige repo in `/Users/MinddMacBen/business-canvas-chatkit`)

`Scherm 2` in dit document = de eerste stap na Start (step_0-vraag/bevestiging) waar de user-input/context zichtbaar moet zijn.

---

## 1. ChatGPT roept de tool aan

### A (oude code)
- Toolregistratie `run_step` in monolithische server:
  - `server.registerTool("run_step", ...)`
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/server.ts:366`
- Tool-callback roept direct `runStepHandler(...)` aan en returned `structuredContent`:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/server.ts:388`
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/server.ts:396`

### B (nieuwe code)
- Toolregistratie `run_step` met uitgebreid contract (`outputSchema`, metadata, visibility):
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/mcp_registration.ts:82`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/mcp_registration.ts:95`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/mcp_registration.ts:99`
- Callback verrijkt context eerst (correlation/trace/locale/idempotency) en roept dan transport-handler:
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/mcp_registration.ts:118`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/mcp_registration.ts:135`

---

## 2. UI-bestand dat geladen wordt

### A (oude code)
- UI wordt uit `step-card.html` geladen:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/server.ts:181`
- UI resource endpoint serveert dat HTML direct:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/server.ts:555`

### B (nieuwe code)
- UI-route serveert `step-card.bundled.html`:
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/http_routes.ts:277`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/http_routes.ts:313`

---

## 3. Eerste user-input wordt opgeslagen als context

### A (oude code)
- In `run_step.ts` wordt eerste betekenisvolle user-tekst vastgezet in `initial_user_message`:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:2160`
- Bij `ACTION_TEXT_SUBMIT` wordt `__text_submit` omgezet naar echte user-tekst:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:2177`

### B (nieuwe code)
- Zelfde doel, maar opgesplitst in preflight:
  - Initieel bewaren `initial_user_message`:
    - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_preflight.ts:269`
  - `ACTION_TEXT_SUBMIT` + `__text_submit` verwerking:
    - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_preflight.ts:565`
  - Seed van step_0 kandidaat uit `initial_user_message`:
    - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_preflight.ts:322`

---

## 4. Start-gate gedrag (cruciaal verschil)

### A (oude code)
- Oude runtime is permissiever rond Start:
  - UI Start knop zet lokaal `sessionStarted = true` en evt. `callRunStep("ACTION_START")`:
    - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/ui/step-card.html:2552`
    - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/ui/step-card.html:2563`
- Backend fallback: als Start met lege input komt, hergebruik `initial_user_message`:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:2632`

### B (nieuwe code)
- Nieuwe transport-context is explicieter/strakker:
  - `requiresExplicitStart` + `started:false` tot echte `ACTION_START`:
    - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/run_step_transport_context.ts:242`
    - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/run_step_transport_context.ts:278`
- Step_0 route gebruikt seed uit `initial_user_message`, maar gate bepaalt of prestart of interactive teruggaat:
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_routes.ts:651`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_routes.ts:745`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_routes.ts:774`

---

## 5. Wat de UI als eerste render doet

### A (oude code)
- UI rendert direct op load (`render()`), ook zonder perfecte host-payload:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/ui/step-card.html:2599`
- Op prestart toont oude UI lokale default-content (`prestartWelcome`) via `innerHTML`:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/ui/step-card.html:2008`
- Bij eerste post-start scherm voegt UI welkom + body samen:
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/ui/step-card.html:2037`
  - Code: `/tmp/old_working_snapshot/business-canvas-chatkit/mcp-server/ui/step-card.html:2054`

### B (nieuwe code)
- UI ingest via `openai:set_globals`/`openai:notification`:
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html:1147`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html:1151`
- UI haalt payload uit `_meta.widget_result`/fallbacks:
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html:855`
- Render in nieuwe UI gebruikt `textContent` voor `text/prompt`:
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html:1033`
  - Code: `/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html:1034`

---

## 6. Pad naar scherm 2 waar input/context zichtbaar wordt

### A (oude code)
1. Eerste chat-input wordt opgeslagen als `initial_user_message`.
   - Code: `run_step.ts:2160`
2. Als Start met lege input komt, backend injecteert die eerder opgeslagen input alsnog.
   - Code: `run_step.ts:2632`
3. Step_0 maakt dan vraag/bevestiging met venture/naam-context.
   - Code: `run_step.ts:2952` (bevestigingszin met naam/venture)
   - Code: `run_step.ts:3005` (eerste vraag)
4. UI toont dit in scherm 2 in `cardDesc` (rich text).
   - Code: `step-card.html:2054`

### B (nieuwe code)
1. Eerste chat-input wordt ook opgeslagen (`initial_user_message`) en kan kandidaat seeden.
   - Code: `run_step_preflight.ts:269`
   - Code: `run_step_preflight.ts:322`
2. Start-gate logica beslist expliciet wanneer `started` op `true` mag.
   - Code: `run_step_transport_context.ts:242`
   - Code: `run_step_transport_context.ts:278`
3. Step_0 route gebruikt seed (`initial_user_message`) voor startlocale/startvraag.
   - Code: `run_step_routes.ts:651`
   - Code: `run_step_routes.ts:745`
4. UI toont `result.text` + `result.prompt` in aparte velden.
   - Code: `step-card.bundled.html:1028`
   - Code: `step-card.bundled.html:1034`

---

## Kort verschil in 1 zin

- **A (oud):** permissieve UI + backend fallback zorgen dat context bijna altijd zichtbaar wordt op scherm 2, ook bij lege Start-call.
- **B (nieuw):** context bestaat nog steeds, maar de flow hangt sterker af van expliciete gate/contractpaden voordat scherm 2 zichtbaar “doorstart”.

