# Beknopte samenvatting

Fase 1 t/m 6 zijn nu technisch afgerond in een zuivere, meertalige implementatie zonder hardcoded user-facing teksten, workarounds of tijdelijke bypasses. De grootste functionele uitkomst is dat `step_0` nu veilig kan voorverwarmen vóór `Start`, terwijl onnodige specialist- en classifier-calls in andere paden zijn teruggebracht.

## Uitgevoerde fases

- Fase 1: regressievangrails toegevoegd voor dream force-refine, glossary-uitzonderingen en `start_prestart`.
- Fase 2: `AcceptedOutputUserTurnClassifier` in de dream-flow alleen nog oproepen wanneer `candidateMissing === true` en de turn niet offtopic of meta-fallback is.
- Fase 3: glossary centraal uitgeschakeld voor interne repair-routes van `BigWhy`, `Dream`, `DreamExplainer` en `Strategy`.
- Fase 4: `Step0BootstrapExtractor` gememoized op exact `(FIRST_USER_MESSAGE.trim(), LANGUAGE.trim().toLowerCase())`.
- Fase 5: debounced `ACTION_STEP0_PREWARM` toegevoegd, background-only, zonder zichtbare stapadvance en met intacte fallback naar het bestaande `ACTION_START`-pad.
- Fase 6: opschoning uitgevoerd, onnodige tijdelijke debug/frictie verwijderd en eindverificatie opnieuw gedraaid.

## Aantoonbare reducties

- Dream-flow:
  - de accepted-output-classifier wordt niet meer aangeroepen wanneer al een geldige kandidaat aanwezig is.
- Interne repair-routes:
  - glossary gaat niet meer mee op de expliciet aangewezen interne repair-calls.
- Step 0 bootstrap:
  - identieke bootstrap-input met dezelfde taalhint veroorzaakt geen tweede specialist-call.
- Start-overgang:
  - bij bestaande prewarm of bestaande bootstrap kan `Start` het voorbereide snapshot hergebruiken in plaats van opnieuw dezelfde bootstraproute te doorlopen.

## Verificatie

- `npm run typecheck`
- `node --loader ts-node/esm --test src/handlers/run_step_phase1_guards.test.ts src/handlers/run_step_step0_bootstrap_memo.test.ts ui/lib/step0_prewarm.test.ts`

Laatste status:

- typecheck groen
- 24/24 tests groen

## Open restrisico's

- De call-reducties zijn hard afgedekt met tests, maar productielatency is in deze fase niet extern gemeten tegen echte netwerk- en modelvertraging.
- De prewarm werkt bewust alleen in `step_0` en alleen zolang `started !== "true"`; dat is veilig, maar echte UX-winst hangt af van hoeveel gebruikers eerst tekst typen vóór ze op `Start` klikken.
- De nieuwe memoizationlaag is proces-lokaal in geheugen; dat is bewust laag-risico en simpel, maar geeft geen cross-process cachehits.
