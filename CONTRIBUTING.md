# Contributing

## Principles

1. Preserve Dynamics 365 and Bluestar as authoritative systems.
2. Keep machine access read-only in the pilot.
3. Prefer configuration over machine-specific code changes.
4. Add tests for state mapping, interval calculation, permissions, and ETA logic.
5. Never commit credentials, production IP addresses, customer data, or controlled drawings.
6. Record significant architecture decisions as ADRs.

## Workflow

- Create a short-lived feature branch.
- Link the change to a backlog item or issue.
- Run automated tests and the simulated-machine environment.
- Require review from the permanent technical owner before merging.
- Update documentation when behavior, schema, or deployment changes.
