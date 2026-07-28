# Simulated Beta Product Specification

## Beta objective

Validate the CNC visibility and queue-governance workflow without connecting to a production machine or business system.

The beta must answer four questions:

1. Can everyone understand current CNC status and queue position from one screen?
2. Can PMs and engineers request a priority change without directly controlling the executable queue?
3. Can a machinist approve or reject a request in one interaction?
4. Can stopped-time context be captured with minimal machinist effort?

## Roles

### Machinist

- View current job and approved executable queue for each CNC.
- Associate a work order in the later full-stack beta.
- Approve, reject, defer, or modify a queue-switch request.
- Classify downtime with one large reason button.
- Operate normally without manually entering cycles, alarms, states, utilization, or ETA.

### PM / engineer

- View machine state, progress, queue position, blocker, and ETA.
- Submit a queue-switch request with machine, job, target position, and reason.
- Cannot directly reorder the executable queue.

### Leadership

- View current producing/stopped counts, active work, pending requests, queues, and audit history.
- Cannot silently reorder the executable queue.

## Queue governance

The software stores two separate concepts:

- **Requested priority:** urgency communicated by PM, engineering, planning, or leadership.
- **Approved executable queue:** the sequence accepted by the responsible machinist or designated supervisor.

A switch request begins in `PENDING`. The queue is unchanged until the machinist selects one of:

- Approve
- Reject, with a reason from the agreed list in `docs/05`
- Approve after the current job or cycle
- Propose another position

All four are implemented in the browser beta.

Every decision is written to the audit history with machine, work order, requester, approver role, request reason, previous position, resulting position, and timestamp.

## Machine-state model

The full application will normalize telemetry into:

- `OFF`
- `UNAVAILABLE`
- `READY`
- `PRODUCTION`
- `SETUP`
- `STOPPED`
- `FAULT`
- `PLANNED_DOWNTIME`
- `UNKNOWN`

The browser demo exercises `PRODUCTION`, `SETUP`, `STOPPED`, `FAULT` and
`READY`. The remaining states are modelled in the full application only.

## ETA policy

An estimated completion is always an **advisory range**, never a point estimate:

- lower and upper bound derived from the observed cycle median and spread, plus
  any remaining setup time;
- a stated confidence level (`High`/`Medium`/`Low`), driven by sample size,
  coefficient of variation and open blockers;
- the single leading reason the estimate could be wrong;
- the basis — how many cycles were observed, and whether the figure is observed
  or still falling back to the planned cycle time.

A blocked machine produces **no** estimate. Projecting through an unresolved
stoppage would be fiction.

This is a boundary rule, not a presentation preference: a point estimate is read
as a commitment, and committed dates belong to Dynamics 365 (`docs/03`).

## Downtime, reasons and blockers

- The reason tree is `config/downtime-reasons.csv` and nothing else. The demo
  consumes a generated mirror of that file, verified in CI.
- Each reason carries a responsible group and a note requirement, both taken
  from the same file.
- Classifying a stoppage opens a **blocker** owned by that group, with an
  `OPEN → ACKNOWLEDGED → CLOSED` lifecycle.
- A stoppage shorter than the configured prompt threshold is deliberately not
  chased for a reason. A stoppage longer than the threshold that is still
  unexplained when the machine resumes is recorded as `UNCODED`, because
  unexplained time is itself a finding.

## Audit requirements

Every decision writes a record containing:

- timestamp;
- named actor and role (not just a role);
- machine and work order;
- event type;
- the approved executable queue **before** and **after**;
- the ETA impact in minutes, where it can be computed.

The audit trail is visible per machine in every role, shop-wide to leadership,
and exportable as CSV.

## Minimum data objects

### Machine

- ID and display name
- Connectivity health
- Normalized state
- Active work-order association
- Approved executable queue
- Current blocker or downtime reason
- Last meaningful update

### Work order

- Work-order number
- Part number/name
- Required, completed, and remaining quantity
- Median cycle time
- Expected setup time
- Material/readiness indicator
- Requested priority
- Document link placeholder

### Queue-switch request

- Machine
- Work order
- Requested target position
- Reason and requested timing
- Requester
- Status
- Machinist decision
- Effective time and audit record

### Machine event

- Source timestamp
- Receipt timestamp
- Source state/value
- Normalized state
- Program and part count when available
- Quality/health indicator

## Demo acceptance criteria

Each criterion below has a corresponding automated test in `tests/demo.test.mjs`.

- A reviewer can identify current state and active job for all three CNCs in under 10 seconds.
- A PM/engineer can submit a queue request without altering the queue.
- The requested queue position becomes active only after machinist approval.
- A machinist can decide a request in one click, across all four decisions.
- A machinist can classify a stopped machine in one tap; only `note_required`
  reasons ask for anything more.
- Progress advances from simulated telemetry alone, with nobody clicking.
- Queue and downtime decisions appear in a visible, attributable, exportable
  audit log.
- An approval that cannot be applied fails loudly and stays pending.
- A deferred approval is visibly not in effect until the current job completes.
- A machine is never left in a state with no way forward.
- Collector health is visible, and stale data is labelled rather than shown as
  current.
- The interface meets WCAG 2.2 AA contrast and a 44px touch target, in both
  light and dark colour schemes.
- The workspace stays near the fold on a 820px-wide tablet.
- The demo runs with no installation beyond opening a browser file.

## Full-stack beta after workflow approval

The next implementation adds:

- FastAPI service and OpenAPI contract
- PostgreSQL schema and migrations
- React/TypeScript production UI
- Simulated telemetry collector over HTTP or WebSocket
- Persistent audit log and queue history
- Role-based access stub, followed by Entra ID
- CSV/sample D365 work-order import
- Configurable downtime threshold
- ETA range and confidence service
- Automated unit, API, and UI tests

Real CNC and D365/Bluestar integrations remain disabled until the simulated beta is accepted and the read-only architecture is approved.
