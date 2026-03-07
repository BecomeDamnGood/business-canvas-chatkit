# Session Log Privacy & Retention Policy

## Scope
Geldt voor token/turn logs in `session-logs/` geschreven door `src/core/session_token_log.ts`.

## Data minimization
- Logs bevatten operationele telemetrie voor token/latency en flow-debugging.
- Geen ruwe user prompts of volledige specialist payloads in dit logtype.
- Bedrijfsnaam kan aanwezig zijn als operationele context.

## Retention
- Configuratie: `BSC_SESSION_LOG_RETENTION_DAYS`
- Default: `30` dagen
- Minimum: `1` dag
- Oude `session-*.md` bestanden worden automatisch verwijderd tijdens append-cyclus.

## Doelbinding
- Incidentanalyse
- Token/kostenoptimalisatie
- Latency regressiedetectie

## Verwijdering
- Automatische purge op basis van bestand `mtime`.
- Alleen bestanden met pattern `session-YYYY-MM-DD-HHMMSS-<sessionId>.md` vallen onder purge.

## Evidence
- Implementatie: `src/core/session_token_log.ts`
- Regressietests: `src/core/session_token_log.test.ts`
