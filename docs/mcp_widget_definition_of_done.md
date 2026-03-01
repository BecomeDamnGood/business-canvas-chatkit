# MCP Widget Definition Of Done (DoD)

Gebruik deze checklist als harde review-gate voor elke widget PR.

## 1) Contract en SSOT

- [ ] Server-contract is de enige waarheid voor rendering (`ui.view`, `ui.action_contract`, `_meta.widget_result`).
- [ ] Geen client-side flowbeslissingen buiten contract (UI is dom).
- [ ] Geen dubbele runtime-logica die hetzelfde gedrag via 2 paden bepaalt.

## 2) UX-pariteit en action-policy

- [ ] `prestart` toont alleen de startactie; geen extra keuze-/hulpknoppen.
- [ ] `interactive` toont alleen contractueel toegestane acties per `role`/`surface`.
- [ ] Geen “render alle non-text actions” gedrag.
- [ ] Input-zichtbaarheid volgt `text_submit` contract (niet ad-hoc verbergen).

## 3) Foutgedrag en veiligheid

- [ ] Geen fallback/workaround-lagen toegevoegd.
- [ ] Bij contractschending: fail-closed met expliciete reason-code/marker.
- [ ] Geen assertion-verzwakking in tests.

## 4) OpenAI MCP App proof

- [ ] MCP app contract-tests blijven groen (inclusief `mcp_app_contract.test.ts`).
- [ ] Runtime owner blijft `ui/step-card.bundled.html` op `/ui/step-card`.
- [ ] SSOT/gates bewijzen contractconform gedrag.

## 5) Bewijs en verificatie

- [ ] Elke functionele claim heeft `file:line` bewijs in PR-notes.
- [ ] Verplichte lokale checks zijn volledig uitgevoerd:
  - `cd mcp-server && npm run typecheck`
  - `cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts`
  - `cd mcp-server && npm run gate:ci`
  - `cd mcp-server && npm test`
- [ ] Living writeback is pas gedaan na codewijzigingen + rerun.

