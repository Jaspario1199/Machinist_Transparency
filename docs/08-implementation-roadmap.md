# Implementation Roadmap

## Phase 0 — Governance and boundaries (Days 1–10)

- Name executive sponsor, manufacturing owner, technical owner, and IT/OT owner
- Confirm private company-owned repository and service accounts
- Approve read-only machine and D365/Bluestar boundaries
- Agree that the system measures processes rather than ranking employees
- Approve pilot outcomes and stop conditions

**Exit gate:** signed project charter and named permanent owner.

## Phase 1 — Discovery (Days 1–20)

- Audit existing D365 Production Floor Execution, Bluestar modules, Power BI, and integration capabilities
- Interview PMs, manufacturing engineering, production supervision, machinists, quality, materials, maintenance, IT, and business systems
- Complete the three-machine connectivity survey
- Define downtime reason tree and blocker-routing owners
- Select one-machine proof candidate

**Exit gate:** approved data sources, selected machines, and architecture decision.

## Phase 2 — Simulated MVP (Days 16–35)

- Create database schema and migrations
- Build simulated machine-event source
- Build event normalization and interval reducer
- Build work-order sample import
- Build operator downtime prompt
- Build current-state timeline and basic dashboard
- Add automated tests and Docker development environment

**Exit gate:** end-to-end demo with no production machine connected.

## Phase 3 — One-machine proof (Days 36–55)

- Acquire only the required edge/network/adapter hardware
- Connect one CNC read-only
- Validate timestamps, state mapping, cycles, counts, alarms, reconnection, and buffering
- Run side-by-side observations with a machinist
- Correct false states and mapping errors

**Exit gate:** manufacturing and IT accept machine-data accuracy and reliability.

## Phase 4 — Human workflow (Days 46–65)

- Add work-order scan/select workflow
- Add downtime prompt thresholds and reason entry
- Add blocker assignment, acknowledgement, and closure
- Add operator, PM, engineering, and administrator permissions
- Add audit history
- Conduct usability testing with machinists

**Exit gate:** common actions take seconds, duplicate entry is controlled, and operators accept the workflow.

## Phase 5 — Three-machine pilot (Days 56–80)

- Add two more machine adapters/configurations
- Add PM/leadership status view
- Add engineering analytics and downtime Pareto
- Add advisory ETA ranges and confidence
- Add backup, monitoring, logs, and security hardening
- Train pilot users and collect representative data

**Exit gate:** acceptance thresholds met across three machines.

## Phase 6 — Handoff and decision (Days 76–90)

- Freeze feature scope and stabilize defects
- Perform backup/restore and redeployment tests
- Complete runbooks, onboarding, data dictionary, and architecture documentation
- Have a second person deploy and operate the system from documentation
- Present pilot findings, benefits, limitations, and expansion recommendation

**Exit gate:** permanent owner accepts operations and management makes a scale/stop/revise decision.
