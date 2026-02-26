# SSOT Green-Pass Status (uitvoering 2026-02-26)

Datum: 2026-02-26  
Branch: `stabilize/ssot-green-pass`

## Uitgevoerde fixes

1. Statusdocs gesynchroniseerd met echte commitreeks.
- `docs/run_step_refactor_20pct_log.md`: alle `pending_in_current_workspace` vervangen door commitreferenties; PR7 handoff als afgerond gemarkeerd.
- `docs/run_step_runtime_refactor_execution_log.md`: statusboard en `commit hash` velden ingevuld met geldige hashes (`24bf58b` t/m `a714fb1`).

2. Instructiepad voor Step 8 gecorrigeerd.
- `docs/ssot_mcp_app_proof_pr_stappen.md`: scopepad aangepast van `docs/contracts/*` naar `mcp-server/docs/contracts/*`.

3. Contract-smoke instructies gestandaardiseerd in actieve playbook-instructie.
- `docs/run_step_refactor_agent_playbook_v3_20pct.md`: repo-root faalpad vervangen door werkende commandvariant:
  - `cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs`

4. Live service-checks uitgevoerd.
- `GET /version`: live draait op `VERSION=v195`.
- `GET /healthz`: status `ok` / `ready=true`.
- `GET /diagnostics`: endpoint beschikbaar, maar bevat geen `runtime.rollout_flags` veld.

5. Canary-activatie poging uitgevoerd.
- `aws apprunner update-service` met `RUN_STEP_STALE_INGEST_GUARD_V1=true` en `RUN_STEP_STALE_REBASE_V1=false` geprobeerd.
- Resultaat: geblokkeerd op IAM (`iam:PassRole` denied op `AppRunnerECRAccessRole`).

## Puntstatus (oud -> nu)

1. Workspace/PR-hygiene: `DEELS OPGELOST`
- Dedicated stabilisatiebranch staat klaar; maar worktree bevat nog pre-existente mixed wijzigingen buiten deze fix-run.

2. 20%-log pending placeholders: `OPGELOST`

3. Runtime refactor pending placeholders: `OPGELOST`

4. Contract-smoke command ambiguity: `OPGELOST` (actieve playbook gestandaardiseerd)

5. Step-8 contracts padfout: `OPGELOST`

6. Canary-rollout nog uit: `GEBLOKKEERD EXTERN`
- Technisch klaar, maar activatie geblokkeerd door IAM-rechten op App Runner update.

7. KPI/rollback live uitvoering: `GEBLOKKEERD EXTERN`
- CloudWatch Logs endpoint was in deze run niet bereikbaar (`https://logs.us-east-1.amazonaws.com/`).

8. Externe consumers audit: `DEELS OPGELOST`
- Repo-brede scan buiten `mcp-server` toont alleen docs-referenties; geen aanvullende runtime-consumer code in deze workspace.
- Echte externe consumers buiten deze repo blijven onbekend.

## Externe blockers die nog resteren

1. IAM-recht nodig:
- `iam:PassRole` voor `arn:aws:iam::559050238376:role/service-role/AppRunnerECRAccessRole`
- Nodig om App Runner env-flags (canary) te updaten.

2. CloudWatch Logs bereikbaarheid:
- `aws logs filter-log-events` faalt met endpoint connect error.
- Nodig voor live KPI-verificatie (`run_step_response`, `run_step_error`, `unknown_action_code`, `stale_bootstrap_payload_dropped`).

## Klaar-om-uit-te-voeren zodra rechten openstaan

1. Canary fase 1 aanzetten:
- `RUN_STEP_STALE_INGEST_GUARD_V1=true`
- `RUN_STEP_STALE_REBASE_V1=false`

2. 10-15 min observatie op KPI’s volgens `docs/operations_failure_playbook.md`.

3. Canary fase 2:
- `RUN_STEP_STALE_REBASE_V1=true`

4. Bij drempeloverschrijding rollback:
- eerst `RUN_STEP_STALE_REBASE_V1=false`, indien nodig ook ingest guard uit.
