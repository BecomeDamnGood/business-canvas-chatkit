# ADR-006: Widget-result SSOT voor UI-state autoriteit

- Status: Accepted
- Datum: 2026-02-26
- Owners: MCP server + widget contract owners
- Gerelateerde contractfamilies: MCP `run_step` output contract, bootstrap/session ordering contract, widget render-source contract

## Context

De huidige payload-keten bevat meerdere potentiële bronnen voor render-state (`_meta.widget_result`, `root.result`, losse root-velden). Dat maakt ordering-beslissingen en render-consistentie kwetsbaar bij retries, stale responses en host-bridges.

Voor bootstrap-concurrency en idempotency moeten widget en backend exact dezelfde bron en ordering-semantiek hanteren.

## Besluit

- De enige autoritatieve bron voor UI-state is `_meta.widget_result`.
- De ordering-autoriteit binnen die bron is exact de tuple:
  - `bootstrap_session_id`
  - `bootstrap_epoch`
  - `response_seq`
  - `host_widget_session_id`
- Deze tuple wordt gelezen uit `_meta.widget_result.state` en mag niet worden overschreven door alternatieve payload-locaties.
- `structuredContent.result` blijft model-safe/minimaal en is niet autoritatief voor UI-render-state.
- Bij ontbrekende of corrupte autoritatieve state geldt fail-closed gedrag (`waiting_locale`/`recovery`) in plaats van gokken op alternatieve bronnen.

## Anti-patterns (niet toegestaan)

- `root.result` als truth-source gebruiken wanneer `_meta.widget_result` ontbreekt.
- `toolResponseMetadata` of fallback-raw payload direct als render-state truth gebruiken.
- Ordering afleiden uit gemengde bronnen (bijv. `bootstrap_epoch` uit bron A en `response_seq` uit bron B).
- UI-state heuristisch reconstrueren uit display-only velden.

## Compatibiliteit

- Additief toegestaan:
  - Nieuwe niet-ordering velden in `_meta.widget_result` zolang bestaande velden semantisch stabiel blijven.
- Breaking wijziging:
  - Hernoemen/verwijderen van tuple-velden of opnieuw toestaan van alternatieve truth-sources.
- Deprecatiepad (backward compatibility):
  - Legacy payloadvormen (`root.result`/andere wrappers) worden alleen tijdelijk getolereerd tijdens migratie.
  - Tijdens dit window moet de producer canonicaliseren naar `_meta.widget_result` vóór widget-rendering.
  - Na uitfaseerwindow worden alternate sources hard afgekeurd door contract-tests.

## Migratiepad

1. Producer-pad: altijd `_meta.widget_result` + volledige ordering tuple uitsturen.
2. Consumer-pad: uitsluitend `_meta.widget_result` als render-state authority lezen.
3. Contract-gates: tests die alternate truth-sources detecteren moeten falen.
4. Legacy cleanup: fallback-leeslogica verwijderen zodra alle producers gemigreerd zijn.

## Rollback

- Tijdelijke rollback mag alleen als gecontroleerde compat-hotfix:
  - fallback naar legacy source achter expliciete, tijdelijke compat-guard,
  - met incident-ticket en einddatum,
  - en met herstelplan terug naar `_meta.widget_result`-only.
- Rollback zonder tijdslimiet of zonder test-aanpassing is niet toegestaan.

## Enforcement

- Code enforcement:
  - Contractlaag en widget-resolve pad lezen `_meta.widget_result` als primair SSOT.
  - Ordering-beslissingen gebruiken uitsluitend de tuple-velden.
- CI gates:
  - `mcp_app_contract.test.ts` moet falen wanneer alternate render-state truth-sources worden geïntroduceerd.
  - UI contract docs en inventory moeten deze SSOT-regel expliciet benoemen.

## Gevolgen

- Positief: deterministische rendering, minder stale regressies, duidelijke debugging.
- Trade-off: strikter contract dwingt volledige migratie van legacy wrappers af.

## Links

- Contract inventory: [contract-adr-inventory](../inventory/contract-adr-inventory.md)
- Referentie ADR: [ADR-005](./ADR-005-ssot-actioncode-governance.md)
- Relevante modules:
  - `mcp-server/server.ts`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
  - `mcp-server/src/mcp_app_contract.test.ts`
