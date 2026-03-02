## STAP 01 — PR `ui-assets-runtime-parity`
```md
Doel:
Herstel asset-parity zodat runtime geen ontbrekende `/ui/assets/*` meer heeft.

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/scripts/copy-ui-dist.mjs`
- `mcp-server/Dockerfile`
- `mcp-server/src/server/http_routes.ts` (alleen als nodig voor static serving, geen logic-uitbreiding)

Verboden:
- Geen nieuwe guards/fallbacks/checks/retries.
- Geen UI-flow wijzigingen.
- Geen contractwijzigingen.

Verplicht uitvoeren:
1. Zorg dat alle runtime UI-assets die door `ui/step-card.bundled.html` worden gebruikt mee gaan naar `dist/ui`.
2. Zorg dat runtime image exact die `dist/ui` assets bevat.
3. Behoud bestaande `/ui/*` static route; voeg geen nieuwe beveiligingslagen toe.

Acceptatie:
1. `/ui/step-card` laadt.
2. `/ui/assets/business-model_by_ben-steenstra.svg` levert 200.
3. Geen regressie in bestaande tests.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Restore runtime UI asset packaging parity for old 2.0 interface`
- Commit message: `Restore runtime UI asset packaging parity for old 2.0 interface`
```

## STAP 02 — PR `ui-first-paint-no-synthetic-fallback`
```md
Doel:
Verwijder synthetische first-paint fallback renderpad dat minimale/lege/EN prestart veroorzaakt.

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/ui/step-card.bundled.html`

Verboden:
- Geen nieuwe fallback, geen recovery-mode, geen nieuwe gates.
- Geen server-aanpassingen.
- Geen contractuitbreidingen.

Verplicht uitvoeren:
1. Verwijder/neutraliseer `set_globals_fallback` injectiepad.
2. Laat initial ingest alleen renderen op echte renderbare payload.
3. Behoud `_meta.widget_result` als autoritatieve bron.
4. Geen mode-coercion toevoegen.

Acceptatie:
1. Geen eerste synthetische minimale kaart voor normale flow.
2. Eerste render toont direct payload-gedreven content.
3. Geen contract_violation toevoegen.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Remove synthetic first-paint fallback and keep payload-authoritative rendering`
- Commit message: `Remove synthetic first-paint fallback and keep payload-authoritative rendering`
```

## STAP 03 — PR `step0-button-action-parity`
```md
Doel:
Herstel old 2.0 step_0 knop- en action-contractgedrag (`btnOk` pad en ActionCode-only).

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/ui/step-card.bundled.html`
- `mcp-server/src/handlers/run_step_routes.ts` (alleen indien nodig voor bestaande actioncodes)
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts` (alleen indien nodig voor bestaande actioncodes)

Verboden:
- Geen label-based dispatch.
- Geen nieuwe actioncodes.
- Geen extra contractstrictness/gates.

Verplicht uitvoeren:
1. Herstel expliciet readiness/confirm buttonpad voor step_0 zoals old 2.0.
2. Verwijder dispatch die buttonlabels als `user_message` stuurt.
3. Handhaaf ActionCode-only voor knoppen/menu’s.
4. Behoud `ACTION_START` semantiek (`started=false` prestart, `true` na start).

Acceptatie:
1. `btnOk_step0_ready` gedrag werkt weer via ActionCode-pad.
2. Geen fallback label-dispatch actief.
3. Start en confirm flow werken deterministic.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Restore old step_0 button/action parity and remove label-based dispatch`
- Commit message: `Restore old step_0 button/action parity and remove label-based dispatch`
```

## STAP 04 — PR `ui-structure-single-active-path`
```md
Doel:
Maak 1 actieve UI-renderflow zoals old 2.0; verwijder dode split tussen actieve render en verborgen legacy controls.

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/ui/step-card.bundled.html`

Verboden:
- Geen nieuwe componentarchitectuur.
- Geen extra panels, geen extra modes.
- Geen tijdelijke workarounds.

Verplicht uitvoeren:
1. Zorg dat zichtbare controls ook de actieve wired controls zijn.
2. Verwijder/neutraliseer dode UI-secties die nooit aangestuurd worden.
3. Behoud bestaande functionele onderdelen die old flow nodig heeft.

Acceptatie:
1. Geen dode knoppen in DOM voor primaire flow.
2. Alle zichtbare knoppen hebben werkende wiring.
3. Geen regressie op dream/scoring/presentation basisflow.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Consolidate UI to one active old-style render path`
- Commit message: `Consolidate UI to one active old-style render path`
```

## STAP 05 — PR `prestart-rich-content-priority`
```md
Doel:
Herstel old prestart inhoud en prioriteit: rijke welkomstkaart direct, met specialist-fallbacks waar nodig.

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/ui/step-card.bundled.html`
- `mcp-server/src/handlers/run_step_step0.ts` (alleen voor content-priority als nodig)

Verboden:
- Geen nieuwe fallbacklagen.
- Geen gating op locale readiness.
- Geen extra contractlaag.

Verplicht uitvoeren:
1. Herstel rijke prestartopbouw (proven/outcomes/how/time) in normale startflow.
2. Gebruik specialist-prioriteit conform old (`message` > `refined_formulation` > `question`).
3. Voorkom minimale prestart in gevallen met beschikbare rijke content.

Acceptatie:
1. Prestart toont volledige welkomstinhoud waar catalogus aanwezig is.
2. 2-koloms meta-blokken renderen zoals old.
3. Geen lege kaart bij geldige payload.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Restore rich prestart content priority to old 2.0 behavior`
- Commit message: `Restore rich prestart content priority to old 2.0 behavior`
```

## STAP 06 — PR `styling-layout-parity-old2`
```md
Doel:
Breng zichtbare interface-opmaak terug naar old 2.0 parity (logo/byline/stepper/typografie/layout).

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/ui/step-card.bundled.html`
- `mcp-server/ui/assets/*` (alleen bestaande assets gebruiken, geen nieuwe designrichting)

Verboden:
- Geen nieuw design.
- Geen framework-migratie.
- Geen runtime-flow wijzigingen.

Verplicht uitvoeren:
1. Herstel old 2.0 header/byline gedrag (incl. logo-render).
2. Herstel stepperpresentatie en kaartopmaak parity.
3. Herstel input/button visuele stijl zodat scherm 2 weer old-achtig opgemaakt is.
4. Gebruik old 2.0 als referentie, niet nieuwe interpretatie.

Acceptatie:
1. Prestart en interactieve kaart ogen als old 2.0.
2. Logo vervangt naamtekstweergave in header.
3. “Zo werkt het | Tijd” blokken tonen old-achtige kolomindeling.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Restore old 2.0 styling and layout parity for widget screens`
- Commit message: `Restore old 2.0 styling and layout parity for widget screens`
```

## STAP 07 — PR `server-guard-removal-open-start-flow`
```md
Doel:
Verwijder resterende server-side guard/gate/fail-close paden die normale open/start flow verstoren.

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/src/handlers/turn_contract.ts`
- `mcp-server/src/handlers/run_step_canonical_widget_state.ts`
- `mcp-server/src/handlers/run_step_response.ts`
- `mcp-server/src/handlers/run_step_runtime_preflight.ts`
- `mcp-server/src/handlers/run_step_preflight.ts`

Verboden:
- Geen nieuwe checks.
- Geen nieuwe recovery paden.
- Geen nieuwe canonical strictness.

Verplicht uitvoeren:
1. Neutraliseer paden die normale step_0 open/start naar blocked/minimale state duwen.
2. Behoud minimale invarianten: prestart startactie vereist; transport parity blijft.
3. Behoud `initial_user_message` seed en `started` semantiek.

Acceptatie:
1. Geen contract_violation op normale startflow.
2. Geen forced blocked bij partiële maar bruikbare startcontent.
3. `ACTION_START` gaat altijd naar interactieve step_0 met content.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Remove remaining guard/fail-close paths from normal open/start flow`
- Commit message: `Remove remaining guard/fail-close paths from normal open/start flow`
```

## STAP 08 — PR `tests-parity-proof-minimal`
```md
Doel:
Werk alleen noodzakelijke tests bij als bewijs van old-2.0 parity zonder guard/fallback uitbreiding.

Verplichte referentie:
- `mcp-server/docs/compare/ui-audit-old-v2-vs-current-2026-03-02.md`

Werk alleen in:
- `mcp-server/src/mcp_app_contract.test.ts`
- `mcp-server/src/ui_render.test.ts`
- `mcp-server/src/handlers/run_step.test.ts`
- gerelateerde golden/runtime fixtures indien strikt nodig

Verboden:
- Geen test die nieuw guard/fallback gedrag afdwingt.
- Geen uitbreiding naar nieuwe architectuurverwachtingen.

Verplicht uitvoeren:
1. Test dat prestart direct bruikbaar toont zonder blocked fail-close.
2. Test dat `ACTION_START` naar interactieve step_0 met content gaat.
3. Test dat ingest payload niet dropt op tuple/order in normale flow.
4. Test specialist-fallback render als `result.text` leeg is.
5. Test object-meta parse en `_meta.widget_result` renderbron.
6. Test `started=false` vóór start en `initial_user_message` behoud.

Acceptatie:
1. Alle tests groen.
2. Geen nieuwe guard/fallback assertions toegevoegd.
3. Bewijs sluit aan op old-2.0 gedrag.

Verificatie:
1. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && npm test`
2. `cd /Users/MinddMacBen/business-canvas-chatkit/mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

PR output:
- PR titel: `Update tests to prove old robust open/start parity without guard expansion`
- Commit message: `Update tests to prove old robust open/start parity without guard expansion`
```
