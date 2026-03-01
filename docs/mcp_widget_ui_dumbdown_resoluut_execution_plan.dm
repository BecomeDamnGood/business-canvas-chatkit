# MCP Widget UI Dumbdown - Resoluut Execution Plan (.dm)

Date: 2026-03-01
Status: Active
Owner scope: `mcp-server/ui/*` + directe server/ui build-koppelingen

## Context En Waarom (niet onderhandelbaar)

De huidige UI is historisch uitgegroeid tot een semi-intelligente laag met:
- dubbele bron (`step-card.template.html` + `step-card.bundled.html`),
- client-side beslislogica en fallback-routes,
- hardcoded user-facing teksten en i18n-afhandeling buiten servercontract.

Dit veroorzaakt drift, regressierisico en onduidelijke ownership.

Doel van dit plan:
- UI **100% dom** maken.
- Alle intelligentie, tekstbeslissing en flow-ownership **server-side** afdwingen.
- Éen actieve UI bron voor runtime.

## Harde Principes (RESOLUUT, GEEN COMPROMIS)

1. UI mag geen beslissingen nemen over inhoud/flow.
2. UI mag geen hardcoded user-facing copy bevatten (behalve strikt technische foutmelding voor fail-closed).
3. UI mag geen fallback-semantieken bouwen als servervelden ontbreken.
4. UI mag geen client-side i18n selectie/vertaalkeuzes uitvoeren.
5. Bij ontbrekend contract: fail-closed + observability marker, niet “slim herstellen”.
6. Dual-source UI is verboden.

## Scope (IN)

- `mcp-server/ui/step-card.template.html`
- `mcp-server/ui/step-card.bundled.html`
- `mcp-server/ui/lib/*.ts` (alleen voor verwijderen van client intelligence)
- `mcp-server/scripts/build-ui.mjs`
- `mcp-server/scripts/copy-ui-dist.mjs`
- `mcp-server/package.json`
- `mcp-server/Dockerfile`
- `mcp-server/src/server/http_routes.ts`
- `mcp-server/src/server/run_step_transport.ts`
- `mcp-server/README.md`
- relevante docs met verwijzingen naar template/bundle-source model

## Scope (OUT)

- Geen nieuwe productfeatures.
- Geen workaroundlaag in client.
- Geen “tijdelijke” uitzonderingen op bovenstaande principes.

## Verplichte Uitvoering

### Fase A - Single Source Forceren
1. Kies `mcp-server/ui/step-card.bundled.html` als enige actieve runtime-source.
2. Merge relevante structurele delen uit `step-card.template.html` in dezelfde runtime-source als er nog unieke elementen zijn.
3. Verwijder `step-card.template.html` uit actieve flow (delete of archive met expliciete reden; geen actieve referenties).

### Fase B - Client Intelligence Slopen
Verwijder resoluut uit UI/clientside code:
1. hardcoded user-facing teksten die niet direct uit serverpayload komen;
2. fallback-teksten of alternatieve narratieven;
3. heuristieken voor intent/step/flow-bepaling;
4. client-side i18n beslissingen;
5. impliciete “self-healing” gedragspaden.

Resultaat:
- UI rendert uitsluitend servercontractvelden.
- Ontbrekende contractvelden -> fail-closed.

### Fase C - Build/Deploy Vereenvoudigen
1. Verwijder template->bundle buildverplichting uit standaard scripts.
2. Verwijder checks op template-file uit Docker/build pipeline.
3. Behoud alleen runtime-check op de enige actieve UI file.
4. Verwijder/documenteer obsolete scripts en references die dual-source in stand houden.

### Fase D - Documentatie Harmoniseren
1. Update README en docs: UI is domme renderer, server is owner van intelligence.
2. Verwijder claims over template als actieve source.
3. Leg kort vast waarom deze vereenvoudiging is gedaan.

## Verificatie (VERPLICHT)

1. `cd mcp-server && npm run build`
2. `cd mcp-server && npm run typecheck`
3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
4. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
5. `rg -n "step-card.template.html|build-ui.mjs" mcp-server docs`
   - Alleen toegestane historische/documentaire verwijzingen mogen overblijven.
   - Geen actieve runtime/build dependency meer op template.

## Acceptatiecriteria (HARD GATE)

1. Single-source UI: ja/nee.
2. Client intelligence verwijderd: ja/nee.
3. Hardcoded user-facing copy verwijderd uit UI: ja/nee.
4. Fallback-semantieken verwijderd uit UI: ja/nee.
5. Alle verificatiecommando’s PASS: ja/nee.
6. Runtime `/ui/step-card` intact: ja/nee.

Als een van deze punten “nee” is: verdict = FAIL.

## Verplichte Output Van De Agent

Lever exact:
1. Gewijzigde bestanden (volledige lijst).
2. Wat verwijderd is (intelligence/copy/fallbacks) met file/line bewijs.
3. Wat server-side moet bestaan om domme UI te laten werken (contractvelden).
4. Resultaat van alle verificatiecommando’s (PASS/FAIL + kernoutput).
5. Eindverdict PASS/FAIL.

## 70% Context-Guard

Bij ~70% context en nog niet klaar:
- stop na huidig blok;
- lever handover met:
  - wat al resoluut verwijderd is,
  - wat nog resterend is,
  - eerste concrete vervolgactie,
  - copy-paste vervolgprompt.
