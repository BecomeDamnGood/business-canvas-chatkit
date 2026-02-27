# MCP Widget Stabilisatie - Uitgebreide Agent Instructie (Ketenfix)

## 1) Doel
Je taak is om de MCP-widget **stabiel end-to-end** te maken over de volledige keten:
1. eerste scherm direct met bruikbare content,
2. startknop direct en deterministisch werkend,
3. tweede scherm direct met renderbare content,
4. geen leeg/half scherm als eindtoestand,
5. zonder SSOT-schending of business-routing in de UI.

Deze opdracht is pas geslaagd als het gedrag reproduceerbaar stabiel is in de keten:
`host event -> ingest -> ordering -> render -> ACTION_START dispatch -> server response -> ingest -> next render`.

## 2) Verplichte referenties (eerst lezen)
1. `docs/mcp_widget_regressie_living_rapport.md`
2. `docs/mcp_widget_debug_agent_resultaat.md`
3. `docs/ssot_mcp_app_proof_pr_stappen.md`
4. `docs/ssot_openstaande_punten_en_vragen_2026-02-26.md`

Kerncontext uit eerdere pogingen:
- Veel deeloplossingen waren valide, maar niet stabiel over de **volledige keten**.
- Contracten/tests waren vaak groen terwijl live UX nog kon hangen.
- Er zijn aanwijzingen voor lifecycle/timing-races in UI-sequentie.

## 3) Harde randvoorwaarden
1. Respecteer SSOT:
   - `_meta.widget_result` is render-authority.
   - ordering tuple blijft leidend: `bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`.
2. UI blijft “dumb”:
   - UI mag dispatchen op server-geleverde action codes.
   - Geen business-routing in UI.
3. MCP/OpenAI compatibiliteit behouden:
   - `openai/outputTemplate`, `openai/widgetAccessible`, tool-result vorm.
4. Geen cosmetische workaround die kernrace verbergt.
5. Elke wijziging moet falsifieerbaar zijn met logs/tests.

## 4) 70% contextbudget-regel (verplicht)
Je mag per iteratie slechts circa 70% context gebruiken.

### 4.1 Context-universe (U)
Gebruik deze U als je relevante contextset:
1. `mcp-server/server.ts`
2. `mcp-server/ui/lib/main.ts`
3. `mcp-server/ui/lib/ui_actions.ts`
4. `mcp-server/ui/lib/ui_render.ts`
5. `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
6. `mcp-server/ui/step-card.template.html`
7. `mcp-server/ui/step-card.bundled.html`
8. `mcp-server/scripts/build-ui.mjs`
9. `mcp-server/src/handlers/run_step.ts`
10. `mcp-server/src/handlers/run_step_runtime.ts`
11. `mcp-server/src/handlers/run_step_ui_payload.ts`
12. `mcp-server/src/handlers/turn_contract.ts`
13. `mcp-server/src/mcp_app_contract.test.ts`
14. `mcp-server/src/ui_render.test.ts`
15. `mcp-server/src/server_safe_string.test.ts`

### 4.2 Budget-afspraak
- Max 70% van U in eerste pass (max 10-11 bestanden diep lezen).
- Eerst fixen op basis van prioriteit, dan pas uitbreiden.
- Alleen bij harde blokkade uitbreiden, met korte motivatie in je run-rapport.

### 4.3 Prioriteit voor eerste pass
1. `main.ts`, `ui_actions.ts`, `ui_render.ts`, `locale_bootstrap_runtime.ts`
2. `server.ts`, `run_step_runtime.ts`, `run_step_ui_payload.ts`, `turn_contract.ts`
3. `ui_render.test.ts`, `mcp_app_contract.test.ts`

## 5) Probleemhypothese (startpunt)
Gebruik als werkhypothese:
- De resterende regressie is primair lifecycle/timing/ordering gedrag tussen host-ingest en rendertransities, niet een fundamentele MCP metadata-fout.

Verplicht: probeer deze hypothese actief te weerleggen met bewijs.

## 6) Uitvoeringsstrategie (verplicht, in volgorde)

### Stap A - Reproduceerbare sequence vastleggen
1. Leg de exacte sequentie vast voor:
   - startup first paint,
   - start click,
   - overgang naar tweede scherm.
2. Koppel per stap de relevante event/log markers.
3. Definieer observables die “geslaagd” en “mislukt” ondubbelzinnig maken.

### Stap B - Fix first paint deterministisch
1. Zorg dat startup niet eindigt in lege/half toestand.
2. Wacht-shell mag alleen transient zijn en moet naar renderbaar state convergeren.
3. Geen pad waarin lege `set_globals` een eerder valide state tenietdoet.

### Stap C - Fix ACTION_START deterministisch
1. Start-dispatch exact 1x per click (met bestaande debounce/idempotency-mechaniek).
2. Ack zonder state advance mag niet als eindtoestand blijven.
3. Herstelpad moet automatisch en beperkt zijn (geen oneindige retries).

### Stap D - Garandeer tweede scherm-content
1. Na succesvolle start moet volgende state renderbaar zijn (prompt/body/actions of expliciete geldige no-buttons variant).
2. Contract-afwijkingen fail-closed met herstelbare UX, niet met lege UI.

### Stap E - Bewaak ordering/ingest bij race
1. Houd monotone ordering guards intact.
2. Voorkom regressie waarbij valide payload door sequence-volgorde verloren gaat.
3. Controleer stale-drop en same-seq-upgrade gedrag op regressies.

### Stap F - Tests en bewijs versterken
1. Voeg of verbeter tests voor echte event-sequenties (niet alleen shape-tests).
2. Test expliciet:
   - startup met lege init payload gevolgd door host payload,
   - ACTION_START ack zonder immediate advance,
   - out-of-order/duplicate tuple situaties.

## 7) Verboden oplossingsrichtingen
1. Business-routing naar UI verplaatsen.
2. Contract verzwakken om tests te “laten slagen”.
3. Structurele SSOT-fallback die `_meta.widget_result` de-prioritiseert.
4. “Fix” die alleen lokale dev route verbetert maar MCP pad niet.

## 8) Verplichte validatie

### 8.1 Lokaal (minimaal)
Voer minimaal uit:
- `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`

### 8.2 Live checks (indien beschikbaar)
1. `curl -sS -D - <public-url>/ui/step-card?...`
2. `curl -sS -D - <public-url>/version`
3. CloudWatch events controleren:
   - `run_step_request`
   - `run_step_response`
   - `run_step_render_source_selected`
   - `ui_ingest_dropped_no_widget_result`
   - `stale_bootstrap_payload_dropped`
   - `ui_start_dispatch_ack_without_state_advance`

### 8.3 Stabiliteitsdrempel (hard)
Pas “klaar” als:
1. Geen leeg/half scherm in herhaalde runs van volledige flow.
2. Startknop werkt deterministisch zonder handmatige tweede poging.
3. Tweede scherm toont consequent renderbare content.
4. Geen nieuwe SSOT of MCP contract regressie.
5. Bewijs bestaat uit tests + sequence-logica + (indien mogelijk) live logevents.

## 9) Verplichte outputbestanden van deze fix-run

### 9.1 Hoofdresultaat
Maak/actualiseer:
- `docs/mcp_widget_stabilisatie_run_resultaat.md`

Inhoud minimaal:
1. Hypothese en falsificatie.
2. Exacte wijzigingen per bestand.
3. Testresultaten.
4. Ketenbewijs startup -> start -> tweede scherm.
5. Restrisico’s en rollback-notes.

### 9.2 Update living rapport (verplicht)
Werk bij in:
- `docs/mcp_widget_regressie_living_rapport.md`

Voeg een nieuwe poging toe onder de bestaande template (`## 9) Invultemplate per nieuwe poging`) met:
- datum/tijd,
- hypothese,
- wijziging,
- observatie,
- uitkomst (bevestigd/weerlegd/onbeslist),
- wat eerder gemist was,
- besluit.

### 9.3 Nieuwe copy-paste instructie voor volgende agent (verplicht)
Maak altijd:
- `docs/mcp_widget_stabilisatie_next_agent_prompt.md`

Dit bestand moet direct copy-pastebaar zijn en bevatten:
1. Wat is afgerond (feitelijk, met bestandsnamen).
2. Wat nog open staat.
3. Welke hypotheses al weerlegd zijn.
4. Welke 70%-contextsubset de volgende agent als eerste moet nemen.
5. Exacte eerstvolgende 3 acties.

## 10) Wanneer je moet stoppen en handoffen
Stop en lever handoff als een van deze waar is:
1. 70%-contextbudget bereikt zonder sluitend bewijs.
2. Externe blockers (infra/logtoegang/deployrechten) blokkeren eindvalidatie.
3. Hypothese is weerlegd en nieuwe hypothese vereist bredere scope.

Bij stop: lever alsnog `docs/mcp_widget_stabilisatie_next_agent_prompt.md` volledig ingevuld op.

## 11) Definition of Done
Alleen “klaar” als alles waar is:
1. End-to-end flow is stabiel (startup + start + tweede scherm).
2. Geen lege/half-eindtoestand.
3. SSOT en MCP-compliance behouden.
4. Bewijs opgenomen in run-resultaatbestand.
5. Nieuwe poging opgenomen in living rapport.
6. Nieuwe copy-paste handoff promptbestand aangemaakt.

