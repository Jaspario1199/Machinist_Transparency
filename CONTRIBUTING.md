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

## Running the checks

```bash
npm install
npx playwright install chromium
npm test
```

CI runs the same suite plus a credential/address scan on every push.

## Configuration is the source of truth

`config/downtime-reasons.csv` owns the downtime reason tree, including each
reason's responsible group and note requirement. The browser demo consumes a
generated mirror of it:

```bash
node scripts/build-demo-config.mjs
```

Never edit `demo/data/downtime-reasons.js` by hand — `tests/config-sync.test.mjs`
fails the build when the two drift.

## Demo code standards

- Keep markup, styles and behaviour in separate files. A single minified file
  cannot be reviewed, and review before merge is required above.
- Escape every value interpolated into HTML, including values that are literals
  today. They will come from an API later.
- An operation that cannot be completed must fail visibly. Never report success
  that did not happen.
- Any new interactive control needs a 44px target, a keyboard path, and an
  accessible name.
