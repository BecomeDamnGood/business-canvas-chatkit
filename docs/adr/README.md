# ADR Governance

Deze map bevat Architecture Decision Records (ADR's) voor contract- en runtime-beslissingen.

## Werkwijze

- Gebruik `template.md` voor nieuwe ADR's.
- Nummering is oplopend: `ADR-XXX`.
- Elke ADR moet verwijzen naar contractfamilies in de inventory.
- Elke contractfamilie in de inventory moet minimaal 1 ADR-verwijzing hebben.
- Breaking wijzigingen vereisen expliciete compat-sectie en CI-gate update.

## Eerste set (Agent 6B)

- [ADR-001 Runtime orchestration boundaries](./ADR-001-runtime-orchestration-boundaries.md)
- [ADR-002 Contract versioning policy](./ADR-002-contract-versioning-policy.md)
- [ADR-003 run_step idempotency and replay](./ADR-003-run-step-idempotency-replay.md)
- [ADR-004 Bootstrap/session concurrency ordering](./ADR-004-bootstrap-session-concurrency.md)
- [ADR-005 SSOT and ActionCode governance](./ADR-005-ssot-actioncode-governance.md)
