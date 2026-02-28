# MCP Widget PR Copy-Paste Plan (Self-Contained Per PR)

Gebruik:
1. Copy-paste exact 1 PR-blok naar een nieuwe agent.
2. Elk PR-blok is volledig zelfstandig en bevat alle context, regels en writeback-verplichtingen.
3. Als de agent rond 70% contextlimiet komt en nog niet klaar is, moet hij de ingebouwde handover-sectie invullen zodat je die direct naar een volgende agent kunt copy-pasten.

---

## PR-1 Prompt (Observability Baseline)

```text
PR-ID: PR-1
Titel: Observability Baseline voor hard bewijs

DOEL
- Maak alle open root-cause hypothesen meetbaar met timestamped, correleerbare client+server signalen.
- Sluit nog geen root-cause claim; dit PR levert bewijsinfrastructuur.

SCOPE (IN)
- mcp-server/ui/lib/main.ts
- mcp-server/ui/lib/ui_actions.ts
- mcp-server/ui/lib/locale_bootstrap_runtime.ts
- (indien nodig) mcp-server/src/server/observability.ts
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md

SCOPE (OUT)
- Geen functionele business-logica wijzigingen buiten observability/instrumentatie.

VERPLICHTE BRONNEN
1) docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md (sectie 4 matrix + detailblokken)
2) docs/mcp_widget_regressie_living_rapport.md (laatste pogingen/timestamps)
3) docs/mcp_widget_stabilisatie_run_resultaat.md (laatste status)

HARDE REGELS
- Geen aannames; alleen bewijsbare claims.
- Claims met file/line refs.
- Als bewijs ontbreekt: label evidence_gap.
- Focusmarkers verplicht:
  - ui_ingest_dropped_no_widget_result
  - ui_ingest_ack_cache_preserved
  - ui_action_dispatch_ack_without_state_advance

UIT TE VOEREN WERK
1) Voeg uniforme correlatievelden toe in client logs voor:
   - callTool request/response shape fingerprint
   - ui/notifications/tool-result ingest
   - openai:set_globals ingest
   - resolver source + reason_code
2) Voeg monotone timestamp (ms) + sequence index toe aan client ingest-events.
3) Zorg dat markers dezelfde correlation-id/client_action_id dragen waar mogelijk.
4) Geen noisy logging flood: compact, machine-readable, deterministic.

VERIFICATIE (VERPLICHT DRAAIEN)
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

VERPLICHTE WRITEBACK IN LIVING DOC
- Voeg een nieuwe poging toe met kop:
  - "### Poging <UTC timestamp> (PR-1 observability baseline)"
- Vul verplicht in:
  1. Hypothese
  2. Waarom deze hypothese
  3. Exacte wijziging(en)
  4. Verwachte uitkomst
  5. Testresultaten lokaal
  6. Live observatie
  7. AWS/logbewijs met timestamps
  8. Uitkomst (Bevestigd/Weerlegd/Onbeslist)
  9. Wat bleek achteraf onjuist
  10. Wat was gemist
  11. Besluit
  12. OpenAI zero-diff compliance matrix (tussenstatus)
  13. Waarom vorige aanpak niet zero-diff was
  14. Welke laatste verschillen zijn verwijderd

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Voeg een run-resultaatblok toe met:
  - scope
  - exacte observability-wijzigingen
  - testresultaten
  - live/logstatus
  - openstaande evidence_gaps

OUTPUT AAN EIND
- Geef korte samenvatting met:
  - gewijzigde files
  - testuitkomst
  - welke gaps nu meetbaar zijn gemaakt
  - welke gaps nog open staan

CONTEXT-GUARD 70% (VERPLICHT)
- Als je merkt dat ~70% context bereikt is en werk is niet klaar:
  1) Stop met nieuwe codewijzigingen.
  2) Maak een "Handover voor volgende agent" blok in je antwoord.
  3) Schrijf dezelfde handover ook in living doc onder de lopende poging.
- Handover moet exact bevatten:
  - Reeds gedaan (files + kernwijzigingen)
  - Reeds gevalideerd (commando + resultaat)
  - Niet af (concrete TODO per file)
  - Open risico's / blockers
  - Exact copy-paste prompt voor volgende agent
```

---

## PR-2 Prompt (Canonical Transport Convergence)

```text
PR-ID: PR-2
Titel: Canonical transport/ingest convergentie (callTool shape + dual ingress)

DOEL
- Sluit ambiguiteit tussen callTool response-shapes en resolver lookup.
- Harmoniseer event-ingest zodat beide host-ingangen deterministisch op hetzelfde canonical pad uitkomen.

SCOPE (IN)
- mcp-server/ui/lib/locale_bootstrap_runtime.ts
- mcp-server/ui/lib/main.ts
- mcp-server/ui/lib/ui_actions.ts
- relevante tests in mcp-server/src/ui_render.test.ts en mcp-server/src/mcp_app_contract.test.ts
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md

SCOPE (OUT)
- Geen niet-gerelateerde server business-flow wijzigingen.

VERPLICHTE FOCUS
- callTool response-shape varianten vs resolver lookup.
- Event-order openai:set_globals vs ui/notifications/tool-result.

HARDE REGELS
- Deterministische canonical acceptatie (geen verborgen fallbackgedrag).
- Expliciete reason codes bij drop/reject.
- Bewijs met file/line refs + test/log.

UIT TE VOEREN WERK
1) Definieer expliciete shape-matrix in code/tests:
   - root._widget_result
   - root._meta.widget_result
   - root.structuredContent._widget_result (indien van toepassing)
   - toolOutput._widget_result
2) Maak ingestpad consistent:
   - host_notification en set_globals moeten exact dezelfde normalize+ingest keten volgen.
3) Leg event-order diagnose vast met timestamp markering (zonder extra side effects).
4) Update tests zodat shape-matrix regressieproof wordt.

VERIFICATIE (VERPLICHT DRAAIEN)
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

VERPLICHTE WRITEBACK IN LIVING DOC
- Nieuwe poging:
  - "### Poging <UTC timestamp> (PR-2 canonical transport convergence)"
- Zelfde 14 verplichte velden.
- Voeg expliciet toe:
  - shape-matrix tabel (waargenomen vs geaccepteerd)
  - event-order observaties (tool-result vs set_globals)
  - update van itemstatus 3.1.1, 3.1.2, 3.2.1, 3.2.2

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Nieuwe sectie met:
  - ketenbewijs startup -> ingest -> render authority
  - welke canonical varianten nu aantoonbaar gedekt zijn
  - resterende evidence_gaps

OUTPUT AAN EIND
- Samenvatting met:
  - welke implementation_gap is gesloten
  - welke evidence_gap overblijft
  - regressierisico

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context en nog werk open: stop en lever handover met:
  - precies welke shape-cases al gedekt zijn
  - welke testcases nog ontbreken
  - welke files nog aangepast moeten worden
  - copy-paste vervolgprompt voor volgende agent
```

---

## PR-3 Prompt (Cache/Liveness Consistency)

```text
PR-ID: PR-3
Titel: Cache-preserve en liveness consistentie (accepted/no-op uitsluiten)

DOEL
- Elimineer perceptie "klik doet niets" door harde consistentie tussen ack-status, state_advanced en zichtbare UI-eindstatus.

SCOPE (IN)
- mcp-server/ui/lib/ui_actions.ts
- mcp-server/ui/lib/ui_render.ts
- mcp-server/src/server/run_step_transport.ts
- mcp-server/src/server/run_step_transport_context.ts (alleen indien nodig voor contractconsistentie)
- relevante tests in src/ui_render.test.ts en src/handlers/run_step.test.ts
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md

SCOPE (OUT)
- Geen brede transport-refactor buiten liveness/cache.

VERPLICHTE FOCUS
- ui_ingest_ack_cache_preserved
- ui_action_dispatch_ack_without_state_advance
- timeout/no-op perceptie

HARDE REGELS
- Geen silent success bij accepted + !state_advanced.
- Elke actie eindigt in state_advanced of expliciete error.
- Resultaat moet in logs en UX eenduidig zijn.

UIT TE VOEREN WERK
1) Verfijn cache-preserve policy:
   - laat preserve alleen toe onder expliciet veilige voorwaarden.
2) Zorg dat no-advance pad altijd expliciet en zichtbaar blijft.
3) Normaliseer mapping timeout/rejected/dropped naar consistente UX notice + markers.
4) Voeg regressietests toe op no-op perceptie en timeoutpad.

VERIFICATIE (VERPLICHT DRAAIEN)
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

VERPLICHTE WRITEBACK IN LIVING DOC
- Nieuwe poging:
  - "### Poging <UTC timestamp> (PR-3 cache+liveness consistency)"
- Zelfde 14 verplichte velden.
- Voeg expliciet toe:
  - marker-correlatie voor ack/no-advance/cache-preserve
  - update itemstatus 3.1.5 en 3.2.4

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Nieuwe sectie met:
  - contract-/ketenbewijs voor dispatch -> ack -> advance/error
  - expliciete status op no-op perceptie risico

OUTPUT AAN EIND
- Benoem expliciet:
  - wat nu de zichtbare eindstatus is bij each failure class
  - welke bewijs-gap nog over is (indien live ontbreekt)

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% contextlimiet en onaf:
  - lever handover met:
    - reeds aangepaste liveness/cache regels
    - resterende edge-cases
    - nog te schrijven tests
    - copy-paste vervolgprompt
```

---

## PR-4 Prompt (widgetState Persist/Rehydrate Invariants)

```text
PR-ID: PR-4
Titel: widgetState persist/rehydrate invarianten (reload/resume hardening)

DOEL
- Bewijs en borg dat widgetState bij reload/resume geen ordering/session regressie veroorzaakt.

SCOPE (IN)
- mcp-server/ui/lib/ui_actions.ts
- mcp-server/ui/lib/main.ts
- mcp-server/src/server/run_step_transport_context.ts (alleen waar nodig voor tuple-consistentie)
- tests rond ordering/rehydrate
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md

SCOPE (OUT)
- Geen niet-gerelateerde UI styling of productflow aanpassingen.

VERPLICHTE FOCUS
- widgetState persist/rehydrate bij reload/resume.
- host_widget_session_id + bootstrap tuple consistentie.

HARDE REGELS
- Geen overwriting met oudere tuple.
- Geen early-return pad dat sessie-id persist omzeilt.
- Elke conclusie met file/line refs.

UIT TE VOEREN WERK
1) Voeg expliciete persist/rehydrate markers toe (voor/na reload moment).
2) Versterk invarianten op:
   - bootstrap_session_id
   - bootstrap_epoch
   - response_seq
   - host_widget_session_id
3) Schrijf reproduceerbare tests voor reload/resume scenario's.
4) Als host-run mogelijk is: voer 1 reproduceerbare reload-sessie uit met timestamps.

VERIFICATIE (VERPLICHT DRAAIEN)
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

VERPLICHTE WRITEBACK IN LIVING DOC
- Nieuwe poging:
  - "### Poging <UTC timestamp> (PR-4 widgetState rehydrate invariants)"
- Zelfde 14 verplichte velden.
- Update expliciet itemstatus 3.2.3.

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Nieuwe sectie met:
  - bewijs reload/resume gedrag
  - welke invarianten nu hard afgedwongen zijn
  - resterende live evidence_gaps

OUTPUT AAN EIND
- Geef:
  - wat bewezen is op code/testniveau
  - wat nog alleen evidence_gap is op live niveau

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context en nog onaf:
  - lever overdracht met:
    - welke invarianten al hard zijn
    - welke reload-cases nog ontbreken
    - copy-paste vervolgprompt
```

---

## PR-5 Prompt (Surface Matrix: Projects/Chat/Pinned + Mobile + Timeout)

```text
PR-ID: PR-5
Titel: Surface A/B bewijsrun (Projects vs chat/pinned) + mobile + timeout

DOEL
- Sluit evidence_gaps die alleen via reproduceerbare host-surface runs kunnen worden bewezen of verworpen.

SCOPE (IN)
- Geen of minimale codewijziging; focus op reproduceerbare meting en rapportage.
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- eventuele kleine instrumentation toggles indien nodig.

SCOPE (OUT)
- Geen brede refactors.

VERPLICHTE FOCUS
- Contextverschillen (Projects vs normale chat) alleen met bewijs.
- Mobile viewport alleen met reproduceerbaar bewijs.
- Timeout/no-op perceptie met correlatie.

RUNMATRIX (VERPLICHT)
1) Normale chat: startup -> start -> vervolgactie
2) Projects: zelfde flow
3) Pinned app (indien beschikbaar): zelfde flow
4) Mobile viewport: zelfde flow + screenshot/timestamp
5) Timeout scenario: gecontroleerde vertraging + markers

PER RUN VERPLICHT CAPTUREN
- client markers:
  - ui_ingest_dropped_no_widget_result
  - ui_ingest_ack_cache_preserved
  - ui_action_dispatch_ack_without_state_advance
- event-order:
  - ui/notifications/tool-result
  - openai:set_globals
- server markers:
  - run_step_request / run_step_response / run_step_render_source_selected
  - mcp_request_timeout (indien timeout-run)

VERIFICATIE
- Als code aangepast is: draai de 3 standaard testcommando's.
- Als geen code aangepast is: expliciet vermelden "no code change".

VERPLICHTE WRITEBACK IN LIVING DOC
- Nieuwe poging:
  - "### Poging <UTC timestamp> (PR-5 surface matrix evidence)"
- Zelfde 14 verplichte velden.
- Voeg tabel toe:
  - surface
  - flow
  - observed shape
  - event order
  - outcome
  - gap gesloten ja/nee
- Update expliciet items: 3.2.5, 3.3.5, 3.2.4, 3.3.1, 3.3.3 (voor zover bewijs aanwezig).

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Nieuwe sectie "Live matrix bewijs" met run-IDs/timestamps en uitslag per surface.

OUTPUT AAN EIND
- Duidelijk:
  - welke hypotheses nu verworpen zijn
  - welke nog open staan met exacte evidence_gap reden

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context:
  - stop na huidige run,
  - schrijf handover met:
    - afgeronde surfaces
    - niet-afgeronde surfaces
    - exacte volgende run die nodig is
    - copy-paste vervolgprompt
```

---

## PR-6 Prompt (Final Root-Cause Closure + DoD Gate)

```text
PR-ID: PR-6
Titel: Finale root-cause closure en DoD-gate (bewijsgedreven)

DOEL
- Finaliseer alleen wat bewijsbaar is:
  - root cause bewezen OF
  - hypothese expliciet verworpen OF
  - evidence_gap expliciet open.
- Geen absolute claims zonder sluitend bewijs.

SCOPE (IN)
- docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md (sectie 4 + DoD)
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- beperkte codefixes alleen als nog P0/P1 gaps technisch open zijn.

SCOPE (OUT)
- Geen nieuwe experimentele refactor zonder gekoppelde gapsluiting.

BESLISREGELS (VERPLICHT)
1) "Root cause bewezen" mag pas als:
   - alle relevante P0 gaps dicht zijn,
   - en live correlatie bewijs aanwezig is voor winnend pad.
2) Hypothese verwerpen als falsificatie-conditie gehaald is.
3) Als live bewijs ontbreekt: expliciet evidence_gap laten staan.

UIT TE VOEREN WERK
1) Herbeoordeel alle open items 3.1.1 t/m 3.3.5 met laatste bewijs.
2) Werk hypothese-matrix bij:
   - type: architectural fault / code fault
   - bewijs vóór/tegen
   - status: open/verworpen/waarschijnlijk/bevestigd
3) Werk Definition of Done bij naar harde checklist met gesloten gaps.
4) Doe geen "0 gaps" claim als er nog evidence_gaps bestaan.

VERIFICATIE
- Als code gewijzigd: draai de 3 standaard testcommando's.
- Als docs-only: expliciet vermelden.

VERPLICHTE WRITEBACK IN LIVING DOC
- Nieuwe poging:
  - "### Poging <UTC timestamp> (PR-6 final closure gate)"
- Zelfde 14 verplichte velden.
- Verplichte extra sectie:
  - "Finale oorzaakclaim: bewezen/verworpen/open"
  - met onderbouwing per gap-ID.

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Finale statusblok met:
  - gesloten gaps
  - open gaps
  - expliciete next-step trigger als nog open.

OUTPUT AAN EIND
- Lever:
  - finale gap-telling per label
  - of root cause claim toegestaan is (ja/nee)
  - welke exacte gaps dit blokkeren als nee

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context en niet afgerond:
  - lever handover met:
    - geüpdatete matrixstatus
    - wat nog ontbreekt voor definitieve claim
    - copy-paste vervolgprompt voor volgende agent
```

---

## PR-7 Prompt (Completeness Audit van uitgevoerde PR’s)

```text
PR-ID: PR-7
Titel: Onafhankelijke volledigheidscontrole (audit op uitgevoerde PR’s)

DOEL
- Controleer of het werk uit dit plan (PR-1 t/m PR-6) volledig en consistent is uitgevoerd.
- Geef een harde PASS/FAIL op volledigheid.
- Geen nieuwe implementatie; alleen audit + rapportage.

SCOPE (IN)
- docs/mcp_widget_pr_copy_paste_plan.md (dit document als normbron)
- docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md

SCOPE (OUT)
- Geen codewijzigingen in `mcp-server/`.
- Geen nieuwe hypothese-implementaties.

HARDE AUDITREGELS
1) Elke claim moet herleidbaar zijn naar bewijs in docs (met file/line refs).
2) Controleer per PR-blok (PR-1..PR-6):
   - doel gehaald ja/nee,
   - verplichte verificatie uitgevoerd of terecht docs-only gemarkeerd,
   - verplichte writeback aanwezig in living/stabilisatie doc.
3) Markeer elk ontbrekend item als:
   - `audit_gap` (documentatie/trace ontbreekt),
   - `evidence_gap` (bewijs inhoudelijk ontbreekt),
   - `consistency_gap` (tegenspraak tussen docs).
4) Geen "compleet" claim als nog gaps open staan.

UIT TE VOEREN WERK
1) Bouw een checklistmatrix voor PR-1..PR-6 met kolommen:
   - PR-ID
   - verplichte onderdelen uit plan
   - gevonden bewijslocatie
   - status (PASS/FAIL)
   - gap-label (indien FAIL)
2) Controleer specifiek:
   - Of living doc per relevante PR een poging-sectie bevat.
   - Of stabilisatie doc per relevante PR een run-statusblok bevat.
   - Of PR-6 een expliciete root-cause gate-beslissing bevat.
   - Of er nergens een impliciete/expliciete "0 gaps" claim staat die strijdig is met open gaps.
3) Geef eindverdict:
   - `Completeness verdict: PASS` of `FAIL`.
   - Als FAIL: exact welke checklistregels ontbreken.

VERIFICATIE
- Docs-only audit: expliciet vermelden "no code change".
- Geen test-run verplicht tenzij je code wijzigt (normaal niet toegestaan in deze PR).

VERPLICHTE WRITEBACK IN LIVING DOC (VERPLICHT)
- Voeg een nieuwe poging toe:
  - "### Poging <UTC timestamp> (PR-7 completeness audit)"
- Vul minimaal in:
  1. Audit scope
  2. Normbron (dit planbestand)
  3. Checklistresultaat PR-1..PR-6 (tabel)
  4. Gevonden gaps met label (`audit_gap`/`evidence_gap`/`consistency_gap`)
  5. Completeness verdict (PASS/FAIL)
  6. Besluit en exacte follow-up
- Vermeld expliciet: `no code change`.

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Voeg korte sectie toe:
  - "PR-7 auditstatus"
  - verdict PASS/FAIL
  - aantal open auditgaps
  - verwijzing naar living doc poging.

OUTPUT AAN EIND
- Lever:
  - totaal aantal gecontroleerde checklistpunten
  - aantal PASS en FAIL
  - volledige lijst van open gaps met label
  - eindverdict PASS/FAIL

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context en audit nog niet af:
  - stop na huidige controleblok,
  - lever handover met:
    - reeds gecontroleerde PR’s
    - nog niet gecontroleerde PR’s
    - exacte volgende auditstap
    - copy-paste vervolgprompt
```

---

## PR-8 Prompt (Structurele sluiting van PR-7 fails, geen workarounds)

```text
PR-ID: PR-8
Titel: Structurele sluiting van PR-7 auditfails (geen workarounds)

DOEL
- Sluit alle open PR-7 fails inhoudelijk en documentair.
- Einddoel: her-audit (PR-7) met volledige PASS.

SCOPE (IN)
- docs/mcp_widget_pr_copy_paste_plan.md
- docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- mcp-server/ (alleen waar technisch nodig voor echte gapsluiting)

SCOPE (OUT)
- Geen cosmetische docs-fix die inhoudelijke evidence ontbreekt.
- Geen tijdelijke toggles of handmatige bypasses als vervanging voor structurele oplossing.

OPEN FAILS DIE VERPLICHT DICHT MOETEN
1) PR2-G1 (`evidence_gap`)
2) PR2-G2 (`audit_gap`)
3) PR2-G3 (`audit_gap`)
4) PR2-G4 (`audit_gap`)
5) PR5-G1 (`evidence_gap`)
6) CROSS-G1 (`consistency_gap`)

HARDE REGELS (GEEN WORKAROUNDS)
1) Geen "n.v.t." of "niet beschikbaar" gebruiken om evidence-gaps als gesloten te markeren.
2) Geen proxy-only of lokale substituutrun gebruiken als vervanging voor vereiste host-surface evidence.
3) Geen terugwerkende claim zonder nieuw bewijs met timestamps + correlatie-id.
4) Geen "0 gaps" claim zolang er nog 1 open gap bestaat.

UIT TE VOEREN WERK
A) PR-2 structureel afronden
1. Maak/valideer 1 canoniek normalize+ingest pad voor:
   - `callTool` response
   - `ui/notifications/tool-result`
   - `openai:set_globals`
2. Sluit shape-matrix voor alle verplichte varianten uit PR-2.
3. Leg event-order deterministisch vast (zelfde correlatie-id + monotone timestamps).
4. Draai verplichte verificatiecommando's uit PR-2.
5. Voeg expliciete PR-2 poging toe in living doc met 14 velden.
6. Voeg expliciet PR-2 run-statusblok toe in stabilisatiedoc.

B) PR-5 evidence-gaps echt sluiten
1. Voer volledige 5-run matrix uit op echte surfaces:
   - normale chat
   - Projects
   - pinned
   - mobile
   - timeout
2. Per run verplicht capturen:
   - client markers
   - event-order (`tool-result` vs `set_globals`)
   - server markers
   - run-id + timestamp + correlatie-id
3. Bij externe blokkade: expliciet escaleren met owner/dependency; niet vervangen door workaround.
4. Update living + stabilisatie met complete matrix en verdict per surface.

C) Consistency-repair
1. Verwijder/herlabel alle oude "0 open gaps" claims die strijdig zijn met latere status.
2. Voeg waar nodig expliciete "superseded by <timestamp/sectie>" notitie toe.
3. Harmoniseer finale gap-telling over alle 3 docs.

VERIFICATIE (VERPLICHT)
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

VERPLICHTE WRITEBACK IN LIVING DOC
- Nieuwe poging:
  - "### Poging <UTC timestamp> (PR-8 structurele failsluiting)"
- Verplicht opnemen:
  1. Welke van de 6 fails gesloten zijn
  2. Bewijslocatie per gesloten fail (file/line)
  3. Welke fails nog open zijn + harde blocker
  4. Geactualiseerde checklistmatrix
  5. Expliciet: wel/geen codewijziging per fail

VERPLICHTE WRITEBACK IN STABILISATIE DOC
- Nieuwe sectie:
  - "PR-8 failsluitingsstatus"
  - status per fail-ID (PASS/FAIL)
  - actuele open-gaptelling
  - verwijzing naar living poging

EINDGATE (MOET GEHAALD WORDEN)
- Herhaal PR-7 auditmatrix na afronding.
- Alleen PASS als:
  1. alle checklistregels PASS,
  2. geen open `audit_gap`/`evidence_gap`/`consistency_gap`,
  3. geen conflicterende "0 gaps" claims in docs.

OUTPUT AAN EIND
- Lever:
  - totaal aantal gecontroleerde checklistpunten
  - aantal PASS en FAIL
  - volledige lijst gesloten fails (met bewijslocatie)
  - eventuele resterende blockers (met owner/dependency)
  - eindverdict PASS/FAIL

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context en nog niet klaar:
  - stop na huidige blok,
  - lever handover met:
    - gesloten fail-IDs
    - nog open fail-IDs
    - eerstvolgende concrete stap
    - copy-paste vervolgprompt
```

---

## PR-9 Prompt (Single-agent eindcontrole op PR-8)

```text
PR-ID: PR-9
Titel: Single-agent eindcontrole op PR-8 uitkomst

DOEL
- Voer een onafhankelijke eindcontrole uit op PR-8 als aparte controlestap.
- Bevestig met bewijs of PR-8 correct is uitgevoerd en of de PR-7 her-audit terecht PASS/FAIL is.

SCOPE (IN)
- docs/mcp_widget_pr_copy_paste_plan.md
- docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- mcp-server/ (alleen waar nodig om bewijs te verifiëren)

SCOPE (OUT)
- Geen nieuwe workaround-implementaties.
- Geen statusclaims zonder bewijs met file/line refs.

VERPLICHT TE CONTROLEREN
1) Status van alle 6 fail-IDs:
   - PR2-G1, PR2-G2, PR2-G3, PR2-G4, PR5-G1, CROSS-G1
2) Of PR-8 verplichte writebacks volledig aanwezig zijn:
   - living pogingsectie
   - stabilisatie failsluitingsstatus
3) Of consistency-repair echt is doorgevoerd:
   - geen conflicterende actuele "0 gaps" claims
   - oudere claims expliciet superseded/historisch gelabeld
4) Of PR-7 her-auditmatrix correct is herhaald en eindverdict onderbouwd is.

VERIFICATIE (VERPLICHT)
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

VERPLICHTE OUTPUT
- Lever exact:
  1. totaal aantal gecontroleerde checklistpunten
  2. aantal PASS en FAIL
  3. lijst van gesloten fails met bewijslocatie (file/line)
  4. resterende blockers met owner/dependency
  5. eindverdict PASS/FAIL

HARDE REGELS
1) Geen "n.v.t."/"niet beschikbaar" om evidence-gaps kunstmatig te sluiten.
2) Geen proxy-only substituutrun als vervanging voor vereiste host-surface evidence.
3) Geen "0 gaps" claim zolang er nog 1 open gap is.
4) Als blocker extern is: expliciet labelen met owner + dependency.

CONTEXT-GUARD 70% (VERPLICHT)
- Bij ~70% context en nog niet klaar:
  - stop na huidig blok,
  - lever handover met:
    - gecontroleerde fail-IDs
    - nog niet gecontroleerde fail-IDs
    - eerstvolgende concrete controle
    - copy-paste vervolgprompt
```

---

## Universeel Handover-Template (te gebruiken in elk PR)

```text
Handover voor volgende agent (PR-<ID>)

1) Reeds gedaan
- <file>: <wijziging>
- <file>: <wijziging>

2) Reeds gevalideerd
- <commando> -> <PASS/FAIL + kernoutput>

3) Nog te doen (concreet)
- <file>: <exacte wijziging>
- <test/doc>: <exacte update>

4) Open gaps / blockers
- <gap-id>: <reden>
- <toegang/probleem>: <impact>

5) Laatste observaties
- <timestamp>: <event/marker + betekenis>

6) Copy-paste vervolgprompt
Voer PR-<ID> verder uit vanaf onderstaande status:
- afgerond: <...>
- nog open: <...>
- eerstvolgende stap: <...>
- verplicht na afronding: update living doc + stabilisatie doc met volledige pogingsectie.
```
