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
