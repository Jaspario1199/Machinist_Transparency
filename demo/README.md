# Simulated Beta

A dependency-free browser demo of the CNC visibility and queue-governance
workflow. It validates the workflow **before** any CNC, Dynamics 365 or Bluestar
connection exists, at no OT risk.

## Run it

Open `index.html` in Chrome, Edge, Firefox or Safari. No install, server,
database, machine or business-system access is required.

A local server works too, and is preferable if you want the CSV export to behave
exactly as it will in production:

```bash
python -m http.server 8080 --directory demo
# then open http://localhost:8080
```

## What to look at first

The shift opens mid-flow, with history already behind it — three machines, one
of them stopped and unexplained, one pending queue request, one open blocker,
and eight hours of cycle and downtime data.

1. **Machinist** — CNC Lathe 1 is stopped past the prompt threshold. Classify it
   in one tap and watch a blocker open against the owning group.
2. **Engineer / PM** — open *Process analytics* for the cycle-time distribution
   and downtime Pareto. Submit a queue request and confirm the queue does not
   move.
3. **Machinist** — approve, defer or counter that request. Every outcome lands in
   the audit trail.
4. **Leadership** — the shop-wide audit trail at the bottom, with queue
   before/after and ETA impact. Export it as CSV.

## Simulation controls

The grey bar under the header stands in for the edge collector. **None of it is
a product feature** — it exists so a reviewer can force conditions that would
otherwise take a shift to observe:

| Control | Why it is there |
|---|---|
| Pause / resume telemetry | The board advances on its own; pause it to read |
| Clock speed | Compress a shift into a few minutes |
| Downtime prompt after | Tune the threshold and see that short stops are *not* chased |
| Inject fault | Reach the `FAULT` state on demand |
| Simulate collector dropout | Verify that stale data is labelled, never silently shown as current |
| Export audit CSV | The exportable-audit requirement in `docs/01` |
| Reset demo | Returns to the opening state (asks first — it discards the audit trail) |

## What each role can do

### Machinist

- Select a CNC; everything below applies to that machine only.
- Confirm setup complete, stop, resume, or load the next job.
- Decide a queue request four ways: **approve now**, **approve after the current
  job**, **propose another position**, or **reject** with a reason from the
  agreed list.
- Classify a stoppage in one tap. Reasons that `config/downtime-reasons.csv`
  marks `note_required` ask for one line and nothing more.
- Acknowledge and close blockers.

### Engineer / PM

- Read-only machine detail plus process analytics: cycle-time distribution,
  downtime Pareto, setup history, intervention count, spindle utilisation, and a
  machine-tending candidate score that shows its own inputs and weighting.
- Submit a queue-change request with job, target position, urgency, desired
  timing, reason and an optional note.
- Cannot change the executable queue. The controls do not exist in this role.

### Leadership

- Shop-wide tiles including *approved but not yet in effect*, *unclassified
  stoppages* and *jobs at due-date risk*.
- Per-machine due-date risk, blockers with their owning group, and the full
  attributable audit trail.
- Requests a priority change; never applies one.

## Governance rules the demo enforces

- Only a machinist decision changes the approved executable queue.
- Requested priority (from D365) and approved queue position are shown as two
  separate things, because they are two separate things.
- An approval deferred to "after the current job" is visibly **not in effect**
  until that job completes — it is not styled as an applied change, and
  leadership counts it separately.
- An approval that cannot be carried out — because the work order already left
  the queue — fails loudly and stays pending. It never reports a success it did
  not achieve.
- Every decision writes an audit row with timestamp, named actor, role, the
  queue before and after, and the ETA impact.

## ETAs

Every completion estimate is a **range** with a confidence level and the single
leading reason it could be wrong, plus the number of observed cycles behind it.
A blocked machine gets no estimate at all. This is deliberate: a point estimate
is read as a commitment, and committed dates belong to Dynamics 365
(`docs/03-d365-bluestar-boundaries.md`).

## Deliberate limitations

- Simulated machine data only; nothing is connected to anything.
- State survives a refresh via `sessionStorage`, and is gone when the tab closes.
- No authentication. Role switching is a demo control; the real system uses
  company sign-in.
- The full normalised state model has nine states (`docs/02`); the demo exercises
  `PRODUCTION`, `SETUP`, `STOPPED`, `FAULT` and `READY`.
- ETA modelling is simple: observed cycle median and spread, plus remaining
  setup. It has no operating calendar, shift pattern or labour availability.

## Structure

```
demo/
  index.html                  markup only
  app.css                     styles
  app/analytics.js            ETA, confidence, risk, Pareto, distribution, scoring
  app/state.js                state, governance rules, audit, telemetry simulation
  app/views.js                rendering (all output escaped)
  app/main.js                 wiring, dialogs, accessibility, export
  data/seed.js                simulated shop-floor seed data
  data/downtime-reasons.js    GENERATED from config/downtime-reasons.csv
```

`data/downtime-reasons.js` must never be edited by hand. Change
`config/downtime-reasons.csv`, then:

```bash
node scripts/build-demo-config.mjs
```

`tests/config-sync.test.mjs` fails the build if the two drift.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

The suite covers the governance invariants, the ETA policy, downtime and blocker
routing, the audit trail, accessibility (tab semantics, dialog behaviour, live
regions, contrast in both colour schemes, 44px touch targets) and the tablet
layout.
