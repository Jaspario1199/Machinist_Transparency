# Open Decisions

Decisions that are not yet made, who must make them, and what is blocked until
they are. A decision recorded here moves to "Resolved" with a date and a
rationale — it is not deleted.

Status: **Open** (needs a decision) · **Blocked** (waiting on evidence) ·
**Resolved**.

## Governance

| ID | Question | Status | Decider | Blocks | Notes |
|---|---|---|---|---|---|
| D-01 | Who is the permanent technical owner? | **Open** | Executive sponsor | Phase 2 onward | Phase 0 exit gate; see `docs/12` |
| D-02 | Does a designated supervisor approve queue changes when the machinist is unavailable, and who is designated per shift? | **Open** | Production supervisor | Phase 4 workflow build | `docs/05` allows it; the named list does not exist |
| D-03 | What is the escalation window before an unaddressed urgent request may be escalated? | **Open** | Production supervisor | Phase 4 | Currently "an agreed period" — needs a number |
| D-04 | Is the product name acceptable to the shop floor? | **Open** | Manufacturing owner | Rollout communications | "Machinist Transparency" can read as surveillance *of* machinists; see R-01 |

## Data and integration

| ID | Question | Status | Decider | Blocks | Notes |
|---|---|---|---|---|---|
| D-05 | Which D365 read-only mechanism is approved: data entities, exports, or business events? | **Open** | Business systems owner | Phase 2 work-order import | Determines refresh latency and load |
| D-06 | Is a D365 sandbox available for the pilot, and on what refresh schedule? | **Open** | Business systems owner | Phase 2 | Without it the pilot stays on CSV samples |
| D-07 | Are work travellers barcoded today? | **Open** | Manufacturing owner | Scanner line in the BOM | Determines whether scanners are purchased at all |
| D-08 | How long is machine-event data retained, and at what granularity? | **Open** | Technical owner + IT | Storage sizing | Raw events are the largest volume by far |
| D-09 | Does quality expose inspection status read-only to the platform? | **Blocked** | Quality | Blocker auto-closure for `INSPECTION` | Blocked on D-05 |

## Technical

| ID | Question | Status | Decider | Blocks | Notes |
|---|---|---|---|---|---|
| D-10 | Which three CNCs are the pilot machines? | **Blocked** | Manufacturing owner | All hardware purchase | Blocked on the connectivity survey (`config/machine-survey.csv`) |
| D-11 | Grafana or Power BI for dashboards? | **Open** | IT | Phase 5 | Company standard should decide; not a technical toss-up |
| D-12 | Entra ID from the start, or a role stub first? | **Open** | IT/OT owner | Phase 4 permissions | A stub is faster but must not reach production |
| D-13 | Where is the central VM hosted, and who patches it? | **Open** | IT | Phase 3 | Affects the security review and the BOM |
| D-14 | What is the production downtime prompt threshold? | **Open** | Manufacturing owner | Phase 4 | The demo defaults to 180 s and makes it configurable so it can be tuned with machinists |
| D-15 | Is the machine-tending candidate score weighting agreed by engineering? | **Open** | Manufacturing engineering | Phase 5 analytics | The demo publishes its inputs and weighting so it can be argued with rather than trusted |
| D-19 | Who may assign a released order to a machine — machinist only, or supervisor too? | **Open** | Production supervisor | Phase 4 permissions | The demo allows the machinist; docs/05 allows a designated supervisor as well |
| D-20 | How long may unplanned work stay without an attached work order before it escalates? | **Open** | Manufacturing owner | Phase 5 reporting | Without a limit, `UNPLANNED-nnn` becomes a permanent shadow backlog |
| D-21 | Is a routing deviation acceptable with a recorded acknowledgement, or does it need supervisor approval? | **Open** | Manufacturing engineering | Phase 4 | The demo allows it with an audited acknowledgement |

## Resolved

| ID | Question | Resolved | Decision and rationale |
|---|---|---|---|
| D-16 | Should the beta be validated with a simulated workflow before any machine is connected? | 2026-07 | Yes. A browser beta with no machine, database or business-system connection validates the workflow and governance model at near-zero cost and no OT risk. See `docs/16` and `demo/`. |
| D-17 | Should ETAs be point estimates or ranges? | 2026-07 | Ranges only, with stated confidence and leading risk. A point estimate is read as a commitment and would undermine the "advisory, not authoritative" boundary in `docs/03`. |
| D-18 | Where does the downtime reason tree live? | 2026-07 | `config/downtime-reasons.csv` is the single source of truth, including the responsible group and note requirement. The demo's copy is generated from it and verified in CI. |
