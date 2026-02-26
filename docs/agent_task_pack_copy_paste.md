# Agent Task Pack (Copy/Paste) - Run Step Refactor

Dit document bevat losstaande, doelgerichte opdrachten voor opvolgende agents.  
Elke opdracht is direct copy-pastebaar.

---

## Globale samenwerkingsregel (geldt voor alle agents)

Voeg onderstaande regel toe aan elke agentprompt of behandel deze als hard requirement voor alle prompts in dit document:

```md
Samenwerkingsmodus met gebruiker (verplicht):
1. Als je hulp/input/toegang van de gebruiker nodig hebt, vraag dit expliciet.
2. Begeleid de gebruiker stap voor stap met korte, concrete instructies.
3. Vraag per stap expliciet toestemming voordat je doorgaat naar de volgende stap.
4. Bij geen toestemming: stop, vat status samen, en geef aan welke stap geblokkeerd is.
```

---

## Agent 1A - SSOT contract-id util (core sweep)

### Intro voor deze agent
Je werkt in een codebase waar contract-consistentie cruciaal is voor MCP/UI stabiliteit.  
Het globale doel is minder duplicatie en meer determinisme in `run_step`-flows.  
Deze fase pakt alleen core + renderer/UI payload aan.

### Codefocus
- `mcp-server/src/core/ui_contract_matrix.ts`
- `mcp-server/src/core/turn_policy_renderer.ts`
- `mcp-server/src/handlers/run_step_ui_payload.ts`

### Copy/paste prompt
```md
Doel:
Centraliseer contract-id parsing/building in 1 gedeelde util zonder gedragswijziging (fase A: core + renderer/ui payload).

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Executive Summary`, `Architectuurkaart`, `Contract-based design + SSOT`, `Aanbevelingen met prioriteit`.
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/core/ui_contract_matrix.ts
  - mcp-server/src/core/turn_policy_renderer.ts
  - mcp-server/src/handlers/run_step_ui_payload.ts
  - strikt noodzakelijke imports

Uit te voeren:
1. Identificeer alle duplicaten voor parse/build van contract_id/menu_id.
2. Maak 1 gedeelde util module met heldere API (parse/build/validate).
3. Vervang duplicaten in bovenstaande files (alleen fase A scope).
4. Laat relevante tests/checks draaien.
5. Pas waar nodig korte docs/comments aan.

Output verplicht:
1. Gedaan (exacte filewijzigingen + functies).
2. Nog te doen (concreet, geordend).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 1B (copy-paste). Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 1B - SSOT contract-id util (integration sweep)

### Intro voor deze agent
Dit is de vervolgtaak op Agent 1A.  
Je rondt de contract-id centralisatie af in pipeline/routes zonder gedrag te veranderen.

### Codefocus
- `mcp-server/src/handlers/run_step_pipeline.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- util uit Agent 1A (pad uit handoff)

### Copy/paste prompt
```md
Doel:
Voltooi contract-id centralisatie in pipeline/routes op basis van de util uit Agent 1A.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Architectuurkaart`, `Contract-based design + SSOT`, `Aanbevelingen met prioriteit`.
- Handoff output van Agent 1A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/handlers/run_step_pipeline.ts
  - mcp-server/src/handlers/run_step_routes.ts
  - util uit Agent 1A + strikt noodzakelijke imports

Uit te voeren:
1. Neem util API uit Agent 1A over; wijzig alleen als strikt nodig (met motivatie).
2. Migreer pipeline/routes naar centrale parse/build/validate util.
3. Verwijder lokale duplicaathelpers.
4. Draai relevante tests/checks.
5. Leg vast wat nog rest (indien buiten scope).

Output verplicht:
1. Gedaan (exacte filewijzigingen + functies).
2. Nog te doen (concreet, geordend).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 2A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 2A - SSOT step->final mapping (inventarisatie + centrale map)

### Intro voor deze agent
Deze stap reduceert inconsistenties in state-updates en contract-routing.  
Doel is 1 bron van waarheid voor `step_id -> final_field`.

### Codefocus
- `mcp-server/src/core/state.ts`
- `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`

### Copy/paste prompt
```md
Doel:
Inventariseer alle step->final mappings en introduceer 1 centrale SSOT-map in owner-module.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Waar state leeft en hoe het stroomt`, `Complexiteitsanalyse`, `Contract-based design + SSOT`.
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/core/state.ts
  - mcp-server/src/handlers/run_step_runtime_state_helpers.ts
  - strikt noodzakelijke imports

Uit te voeren:
1. Inventariseer alle bestaande step->final definities in scope.
2. Introduceer 1 centrale map met duidelijke owner.
3. Verwijs lokale helpers in scope naar de centrale map.
4. Voeg minimaal 1 test toe voor map-consistentie.
5. Documenteer verwachte migratiepunten voor 2B.

Output verplicht:
1. Gedaan (per file/function).
2. Nog te doen (concrete backlog voor 2B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 2A of 2B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 2B - SSOT step->final mapping (adoptie routing/renderer)

### Intro voor deze agent
Dit is de vervolgtaak op Agent 2A.  
Je migreert routing/renderer naar de centrale step->final map.

### Codefocus
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
- `mcp-server/src/core/turn_policy_renderer.ts`
- centrale map uit Agent 2A

### Copy/paste prompt
```md
Doel:
Adopteer de centrale step->final map in routing + renderer zonder gedragswijziging.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Waar state leeft en hoe het stroomt`, `Contract-based design + SSOT`.
- Handoff output van Agent 2A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/handlers/run_step_runtime_action_routing.ts
  - mcp-server/src/core/turn_policy_renderer.ts
  - centrale map/module uit Agent 2A + strikt noodzakelijke imports

Uit te voeren:
1. Vervang lokale step->final mapping logic door centrale map.
2. Verwijder duplicaatdefinities in scope.
3. Voeg regressietests toe voor kritieke stappen (incl. step_0).
4. Draai relevante tests/checks.

Output verplicht:
1. Gedaan.
2. Nog te doen.
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 3A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 3A - Runtime modularisatie (extractie pure policy)

### Intro voor deze agent
`run_step_runtime.ts` is een hotspot.  
Deze fase extraheert pure beleidslogica zonder extern contract te breken.

### Codefocus
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
- `mcp-server/src/handlers/run_step_runtime_preflight.ts`

### Copy/paste prompt
```md
Doel:
Extraheer 1-2 pure beleidsblokken uit runtime naar dedicated module(s) met stabiele interfaces.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Architectuurkaart`, `Complexiteitsanalyse`, `Refactor plan in fases`.
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/handlers/run_step_runtime.ts
  - mcp-server/src/handlers/run_step_runtime_action_routing.ts
  - mcp-server/src/handlers/run_step_runtime_preflight.ts
  - strikt noodzakelijke imports

Uit te voeren:
1. Identificeer pure policy-segmenten met lage side-effect coupling.
2. Extraheer 1-2 segmenten naar nieuwe module(s).
3. Houd run_step API/signature ongewijzigd.
4. Voeg tests toe voor geëxtraheerde logica.
5. Noteer integratiepunten voor 3B.

Output verplicht:
1. Gedaan.
2. Nog te doen (concreet voor 3B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 3A of 3B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 3B - Runtime modularisatie (ports/wiring/finalize)

### Intro voor deze agent
Dit is de vervolgtaak op Agent 3A.  
Je rondt wiring/coupling-reductie af rond finalize/ports.

### Codefocus
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_runtime_finalize.ts`
- `mcp-server/src/handlers/run_step_ports.ts`
- nieuwe module(s) uit Agent 3A

### Copy/paste prompt
```md
Doel:
Integreer de extracties uit 3A in runtime wiring en verlaag coupling in ports/finalize.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Complexiteitsanalyse`, `Refactor plan in fases`.
- Handoff output van Agent 3A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/handlers/run_step_runtime.ts
  - mcp-server/src/handlers/run_step_runtime_finalize.ts
  - mcp-server/src/handlers/run_step_ports.ts
  - modules uit Agent 3A + strikt noodzakelijke imports

Uit te voeren:
1. Werk runtime wiring bij naar geëxtraheerde modules.
2. Verminder port-coupling waar veilig mogelijk.
3. Houd extern gedrag en contractoutput stabiel.
4. Draai relevante arch checks/tests.

Output verplicht:
1. Gedaan.
2. Nog te doen.
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 4A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 4A - Structured logging (foundation)

### Intro voor deze agent
Debugbaarheid hangt af van consistente telemetry.  
Deze fase zet de loggingstandaard neer in server/response.

### Codefocus
- `mcp-server/server.ts`
- `mcp-server/src/handlers/run_step_response.ts`

### Copy/paste prompt
```md
Doel:
Definieer en implementeer een minimaal structured log-schema in server + response laag.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Opsplitsing & debugbaarheid`, `MCP / agent-proof beoordeling (0-5)`.
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/server.ts
  - mcp-server/src/handlers/run_step_response.ts
  - strikt noodzakelijke imports

Uit te voeren:
1. Definieer minimaal log-schema: `event`, `correlation_id`, `session_id`, `step_id`, `contract_id`, `severity`.
2. Pas kernlogs aan in request/response lifecycle.
3. Voorkom logging van secrets/gevoelige payloads.
4. Voeg kleine helper toe indien nodig.
5. Draai relevante checks.

Output verplicht:
1. Gedaan.
2. Nog te doen (voor 4B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 4A of 4B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 4B - Structured logging (runtime + i18n adoptie)

### Intro voor deze agent
Dit is de vervolgtaak op Agent 4A.  
Je trekt het log-schema door naar runtime en i18n.

### Codefocus
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_i18n_runtime.ts`
- logging helper/schema uit Agent 4A

### Copy/paste prompt
```md
Doel:
Adopteer het structured log-schema uit 4A in runtime/i18n zonder noise-explosie.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Opsplitsing & debugbaarheid`, `MCP / agent-proof beoordeling (0-5)`.
- Handoff output van Agent 4A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/handlers/run_step_runtime.ts
  - mcp-server/src/handlers/run_step_i18n_runtime.ts
  - logging helper/schema uit Agent 4A + strikt noodzakelijke imports

Uit te voeren:
1. Migreer relevante logs naar het schema.
2. Zorg dat correlation/context consistent blijft.
3. Houd fout- en gate-logs diagnostisch bruikbaar.
4. Draai relevante tests/checks.

Output verplicht:
1. Gedaan.
2. Nog te doen.
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 5A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 5A - Idempotency/concurrency (contract + ingress/server)

### Intro voor deze agent
MCP/agent-omgevingen krijgen retries en parallel requests; dit vereist expliciete idempotency-grenzen.

### Codefocus
- `mcp-server/server.ts`
- `mcp-server/src/handlers/ingress.ts`

### Copy/paste prompt
```md
Doel:
Definieer en implementeer minimale idempotency/replay basis in ingress/server laag.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `MCP / agent-proof beoordeling (0-5)`, `Architectuurkaart`.
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/server.ts
  - mcp-server/src/handlers/ingress.ts
  - strikt noodzakelijke imports

Uit te voeren:
1. Breng huidig retry/order gedrag in kaart binnen scope.
2. Introduceer minimale idempotency key-flow en conflict/replay uitkomsten.
3. Definieer foutcodes voor replay/conflict.
4. Voeg tests toe op server/ingress niveau.
5. Documenteer open infra-afhankelijkheden voor 5B.

Output verplicht:
1. Gedaan.
2. Nog te doen (voor 5B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 5A of 5B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 5B - Idempotency/concurrency (runtime/state adoptie + tests)

### Intro voor deze agent
Dit is de vervolgtaak op Agent 5A.  
Je trekt idempotency/replay door naar runtime/state paden en rondt tests af.

### Codefocus
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/core/state.ts`
- contract/handoff uit Agent 5A

### Copy/paste prompt
```md
Doel:
Integreer idempotency/replay model uit 5A in runtime/state paden met deterministische duplicate-request tests.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `MCP / agent-proof beoordeling (0-5)`, `Refactor plan in fases`.
- Handoff output van Agent 5A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/handlers/run_step_runtime.ts
  - mcp-server/src/core/state.ts
  - artefacten uit Agent 5A + strikt noodzakelijke imports

Uit te voeren:
1. Adopteer idempotency/replay regels in runtime/state.
2. Voeg duplicate-request tests toe voor kritieke paden.
3. Verifieer deterministisch gedrag en foutmapping.
4. Draai relevante tests/checks.

Output verplicht:
1. Gedaan.
2. Nog te doen.
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 6A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 6A - Contract inventory update

### Intro voor deze agent
Het team heeft governance nodig: expliciete contracts en eigenaarschap.

### Codefocus
- `mcp-server/src/contracts/*`
- `mcp-server/src/core/state.ts`
- `mcp-server/src/core/ui_contract_matrix.ts`
- `mcp-server/src/core/actioncode_registry.ts`
- `mcp-server/server.ts`
- bestaand inventory-doc

### Copy/paste prompt
```md
Doel:
Actualiseer contract inventory met owner, versie, enforcement en compat-status.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Contract inventory`, `Contract-based design + SSOT`.
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/contracts/*
  - mcp-server/src/core/state.ts
  - mcp-server/src/core/ui_contract_matrix.ts
  - mcp-server/src/core/actioncode_registry.ts
  - mcp-server/server.ts
  - bestaand inventory-document + strikt noodzakelijke imports

Uit te voeren:
1. Werk contract inventory volledig bij op basis van huidige code.
2. Benoem owner module + versie/status per contract.
3. Markeer onzekerheden expliciet als `Onzeker / te checken`.
4. Leg handoff vast voor ADR-werk in 6B.

Output verplicht:
1. Gedaan.
2. Nog te doen (voor 6B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 6A of 6B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 6B - ADR bootstrap + koppeling naar inventory

### Intro voor deze agent
Dit is de vervolgtaak op Agent 6A.  
Je zet ADR-governance op en linkt die aan contract inventory.

### Codefocus
- `docs/` (ADR-map en inventory)
- handoff/output uit Agent 6A

### Copy/paste prompt
```md
Doel:
Maak ADR-sjabloon + eerste ADR-set en koppel deze expliciet aan de contract inventory.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `ADR-lijst (ontbrekende beslissingen)`, `Contract inventory`.
- Handoff output van Agent 6A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - docs/inventory/adr-gerelateerde bestanden (of maak deze aan)
  - output/handoff van Agent 6A
  - strikt noodzakelijke imports/references

Uit te voeren:
1. Maak ADR-map + kort sjabloon.
2. Voeg 3-5 concrete ADR's toe op basis van geidentificeerde gaps.
3. Link ADR's en contract inventory naar elkaar.
4. Controleer op consistentie en leesbaarheid.

Output verplicht:
1. Gedaan.
2. Nog te doen.
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor vervolg. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 7A - Stabiliteitsgate: alle checks weer groen

### Intro voor deze agent
De mega-update is gedaan; nu moet de basispipeline aantoonbaar groen zijn.  
Deze fase fixt eerst de bekende rode checks en levert een harde statusmatrix op.

### Codefocus
- `mcp-server/` checkscripts + falende tests
- `chatkit/frontend` en `managed-chatkit/frontend` basischecks

### Copy/paste prompt
```md
Doel:
Maak de kernchecks weer groen en lever een harde "bewijs dat niets stuk is"-status op.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Executive Summary`, `MCP / agent-proof beoordeling (0-5)`, `Opsplitsing & debugbaarheid`.
- Laatste handoff/output van de mega-update validatie (indien aanwezig).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/package.json
  - mcp-server/scripts/*
  - mcp-server/src/server_safe_string.test.ts
  - mcp-server/src/core/bootstrap_runtime.test.ts
  - mcp-server/src/handlers/* (alleen waar tests/checks op falen)
  - chatkit/frontend/package.json
  - managed-chatkit/frontend/package.json
  - strikt noodzakelijke imports

Uit te voeren:
1. Draai en rapporteer status van: typecheck, lint/format (waar aanwezig), unit/integration tests, build.
2. Fix de actuele rode checks:
   - `server-safe-string-scan` failure (String(...) in server-flow) OF scanner-regel alignen met intent.
   - `server_safe_string.test.ts` assertions die niet meer passen bij structured logs/events.
   - `i18n_literal_guard` policy-conflict (NL locale literals vs deny-patterns) met duidelijke keuze: scope/policy aanpassen.
   - `arch:run-step:any-budget` drift (budget of code alignen, gemotiveerd).
3. Draai dezelfde checks opnieuw en bewijs regressievrij resultaat.
4. Lever een compacte checkmatrix: command, resultaat, korte notitie.

Output verplicht:
1. Gedaan (met checkmatrix en exacte fixes).
2. Nog te doen (voor 7B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 7A of 7B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 7B - Smoke + e2e betrouwbaarheid

### Intro voor deze agent
Nadat de basischecks groen zijn, moet runtimegedrag in praktijk aantoonbaar werken.  
Deze fase maakt smoke/e2e runs deterministischer en rapportabel.

### Codefocus
- `mcp-server/server.ts`
- e2e-config/tests in frontend pakketten
- eventueel startup scripts

### Copy/paste prompt
```md
Doel:
Verifieer app-smoke en e2e basisflow, en elimineer bekende flaky blocker(s).

Verplicht eerst lezen:
- Handoff output van Agent 7A (verplicht).
- Relevante smoke/e2e scripts in package.json van:
  - mcp-server
  - chatkit/frontend
  - managed-chatkit/frontend
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/server.ts
  - relevante e2e testfiles/config (alleen de falende flow + noodzakelijke helpers)
  - package.json scripts van betrokken pakketten
  - strikt noodzakelijke imports

Uit te voeren:
1. Definieer minimale smoke-suite:
   - server start
   - health/ready check (of tijdelijke fallback endpoint check)
   - step_0 request-response basisflow
   - idempotency replay/duplicate request gedrag
2. Maak de falende e2e-startflow stabiel (bijv. selector-contract, ready-state gating, test fixture).
3. Draai smoke + geselecteerde e2e smoke subset en rapporteer doorlooptijd + resultaat.
4. Documenteer wat nog geen volledige e2e-dekking heeft.

Output verplicht:
1. Gedaan.
2. Nog te doen (voor 8A).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 7B of 8A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 8A - SSOT/contract-audit remediation

### Intro voor deze agent
Deze fase pakt dubbele waarheden en contract-breaches aan.  
Doel: 1 duidelijke owner per regel en consistente runtime enforcement.

### Codefocus
- `mcp-server/server.ts`
- `mcp-server/src/handlers/ingress.ts`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/core/state.ts`

### Copy/paste prompt
```md
Doel:
Werk contract-SSOT uit: verwijder duplicaten, sluit validatiegaten, en leg ownership expliciet vast.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Contract inventory`, `Contract-based design + SSOT`, `Waar state leeft en hoe het stroomt`.
- Handoff output van Agent 7B (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/server.ts
  - mcp-server/src/handlers/ingress.ts
  - mcp-server/src/handlers/run_step_runtime.ts
  - mcp-server/src/handlers/run_step_routes.ts
  - mcp-server/src/core/state.ts
  - contract-inventory docs + strikt noodzakelijke imports

Uit te voeren:
1. Elimineer dubbele SSOT's in scope:
   - idempotency registry ownership centraliseren.
   - transient-state allowlist/canonicalization centraliseren.
   - step->field mapping duplicatie reduceren.
2. Maak runtime validation compleet op bekende gaten:
   - JSON.parse payloads met te lichte checks (schema-driven maken).
   - local-dev body read zonder size-limit alignen met veilige ingress-principes.
3. Valideer contract-enforcement end-to-end (types + runtime assertions).
4. Update contract inventory met: owner, enforcement punt, compat/notes.

Output verplicht:
1. Gedaan (incl. lijst van opgeloste duplicaten).
2. Nog te doen (voor 8B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 8A of 8B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 8B - Boundary enforcement + dependency violations

### Intro voor deze agent
Deze fase toetst of de opsplitsing echt klopt en maakt overtredingen zichtbaar/handhaafbaar.  
Doel: harde architectuurgrenzen i.p.v. impliciete afspraken.

### Codefocus
- `mcp-server/src/core/*`
- `mcp-server/src/handlers/*`
- arch scripts in `mcp-server/scripts/arch/*`

### Copy/paste prompt
```md
Doel:
Voer een boundary-check uit met concrete import/dependency overtredingen en fix of gate ze.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Architectuurkaart`, `Complexiteitsanalyse`, `Aanbevelingen met prioriteit`.
- Handoff output van Agent 8A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/src/core/*
  - mcp-server/src/handlers/*
  - mcp-server/scripts/arch/*
  - strikt noodzakelijke imports

Uit te voeren:
1. Genereer lijst met overtredingen per import/dependency:
   - domain/core die infra/UI dependencies binnenhaalt.
   - application orchestration die teveel rules bevat.
   - infra adapters die omhoog lekken.
2. Fix directe overtredingen in scope waar risico laag is.
3. Voor niet-direct-fixbare overtredingen: voeg expliciete architectuur-gates/checks toe (script + CI hook).
4. Lever een violation register (severity, file, reden, status).

Output verplicht:
1. Gedaan.
2. Nog te doen (voor 9A).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 8B of 9A. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 9A - OpenAI MCP app compliance hardening

### Intro voor deze agent
Deze fase maakt de codebase expliciet "MCP app compliant" i.p.v. impliciet werkend.  
Focus ligt op schema-contracten, versieerbaarheid, determinisme en retry-safety.

### Codefocus
- `mcp-server/server.ts`
- tool contract/schema modules
- write paths met side-effects

### Copy/paste prompt
```md
Doel:
Maak tool- en agent-geschiktheid expliciet conform MCP-app eisen: schema-driven, versionable, deterministic core.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `MCP / agent-proof beoordeling (0-5)`, `Contract inventory`.
- Handoff output van Agent 8B (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/server.ts
  - mcp-server/src/contracts/*
  - mcp-server/src/handlers/* (alleen tool-ingress/egress en writes)
  - strikt noodzakelijke imports

Uit te voeren:
1. Tool interfaces:
   - waarborg schema-driven input/output voor alle publieke tools.
   - maak versioning expliciet (contract/schema versie + compatbeleid).
2. Determinisme:
   - verplaats side-effects achter adapters/ports.
   - borg dat core policy-paden deterministisch testbaar blijven.
3. Retry/idempotency:
   - verifieer write-path retry-safety; fix ontbrekende idempotency of conflict handling.
4. Security hygiene:
   - check dat secrets/PII niet in logs/prompts terechtkomen.
5. Voeg compliance-checklist + automatische checks toe aan CI.

Output verplicht:
1. Gedaan.
2. Nog te doen (voor 9B).
3. Risico's/open vragen.
4. Als gestopt door ~70% en niet klaar: Nieuwe Agency Instruction voor Agent 9A of 9B. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Agent 9B - Observability + failure playbook

### Intro voor deze agent
Laatste fase: operationele paraatheid.  
Doel: bij falen snel kunnen detecteren, lokaliseren en herstellen.

### Codefocus
- logging/telemetry paden in `mcp-server`
- docs voor operations/playbooks

### Copy/paste prompt
```md
Doel:
Maak observability compleet en lever een praktisch failure playbook met top failure modes.

Verplicht eerst lezen:
- `docs/repo_architecture_audit_2026-02-26.md`
- Relevante secties: `Opsplitsing & debugbaarheid`, `MCP / agent-proof beoordeling (0-5)`.
- Handoff output van Agent 9A (verplicht).
- Start je output met: `Auditsecties gelezen: ...`

Algemene regels (verplicht):
1. Gebruik maximaal circa 70% contextbudget.
2. Lees alleen de opgegeven bestanden + direct noodzakelijke imports.
3. Stop expliciet wanneer je de circa 70%-grens nadert of de taak klaar is.
4. Rapporteer exact: wat gedaan is, wat nog moet gebeuren, risico's/open vragen.
5. Schrijf alleen een nieuwe "Agency Instruction" als je stopt door de circa 70%-grens EN de taak nog niet af is. Als alles afgerond is, hoeft dit niet.
6. Maak kleine, verifieerbare stappen; geen scope creep.

Taakscope (bestanden):
- Lees alleen:
  - mcp-server/server.ts
  - mcp-server/src/handlers/*
  - mcp-server/src/core/* (alleen logging/diagnostics gerelateerd)
  - docs/ (playbook/inventory gerelateerde bestanden)
  - strikt noodzakelijke imports

Uit te voeren:
1. Zorg voor consistente structured logging met correlation/trace ids door de volledige flow.
2. Controleer en verbeter error mapping (transient vs fatal, contract vs infra).
3. Voeg health/ready/diagnostics endpoint(s) toe of documenteer expliciet waarom niet.
4. Lever failure playbook met top 10 failure modes:
   - trigger/symptoom
   - detectie (log event/metric)
   - eerste mitigatie
   - duurzame fix richting
5. Koppel playbook terug aan contract inventory/ADR waar relevant.

Output verplicht:
1. Gedaan.
2. Nog te doen.
3. Risico's/open vragen.
4. Als klaar: meld expliciet `Geen vervolgprompt nodig`.
```

---

## Handoff-template (verplicht einde voor elke agent)

Gebruik exact dit format in de eindoutput van elke agent:

```md
## Stopmoment
- Reden stop: [taak klaar OF circa 70% contextgrens bereikt]
- Contextverbruik (schatting): [xx]%

## Gedaan
1. ...
2. ...

## Nog te doen
1. ...
2. ...

## Risico's / Open vragen
1. ...

## Vervolgprompt
- Als taak klaar: `Geen vervolgprompt nodig`.
- Als gestopt door circa 70% en niet klaar: voeg hieronder een copy-pastebare `Nieuwe Agency Instruction` toe.

## Nieuwe Agency Instruction (alleen indien nodig)
```md
[volgende agent prompt hier]
```
```
