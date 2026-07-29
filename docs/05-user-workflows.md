# User Workflows

## Core queue-governance rule

PMs, engineers, and leadership may request a priority or queue change, but they cannot silently reorder the executable CNC queue.

A requested switch becomes active only after approval by:

1. The machinist responsible for the affected CNC; or
2. A designated shop-floor supervisor when the machinist is unavailable or escalation is required.

This protects production from impossible or disruptive changes involving unfinished cycles, setup loss, unavailable material, fixture conflicts, tooling constraints, inspection holds, or unsafe interruption points.

## End-to-end production visibility workflow

1. PM/planning releases the production order and records the requested priority in the existing system.
2. Engineering releases the approved revision, program, fixture, tooling, and inspection requirements.
3. Materials confirms availability/reservation/staging in the existing system where reliable.
4. The machinist or shop-floor supervisor maintains the executable queue for each CNC.
5. A PM, engineer, planner, or authorized leader may submit a queue-switch request containing the requested job, reason, urgency, and desired timing.
6. The affected machinist receives one concise approval prompt.
7. The machinist approves, rejects, or proposes a different sequence/time.
8. Only an approved request changes the visible executable queue.
9. The system records requester, approver, affected jobs, reason, timestamp, original queue, and resulting queue.
10. The machinist scans or selects the active production order at the CNC.
11. CNC telemetry reports machine activity automatically.
12. After a configurable stopped-time threshold, the operator interface requests a downtime reason.
13. The selected reason creates or updates a blocker assigned to the responsible group.
14. The responsible group acknowledges and resolves the blocker.
15. The platform updates the advisory completion range and confidence.
16. PMs and leadership see a simplified status view; engineers see detailed process analytics.

## Getting work onto a machine

Nothing in this project creates a production order. Orders are created,
scheduled, quantified and released in Dynamics 365. What was previously
undefined is how a *released* order reaches a specific CNC's executable queue —
this section closes that gap.

### Who

The machinist responsible for the CNC, or a designated shop-floor supervisor.
PMs, engineers and leadership use the queue-change request instead.

### Path A — a released work order (the normal path)

1. The machinist opens **Add work to this machine** on the CNC.
2. The system lists released D365 orders that are not yet on any machine,
   with the orders routed to this CNC first. Each shows part and revision,
   quantity, standard cycle and setup time, due date and requested priority.
3. The system checks the order against this machine and reports:
   - **Blocking:** the revision is not released in Bluestar. The order cannot
     be queued. Running an unreleased revision is a quality escape.
   - **Warning, not blocking:** the D365 routing names a different resource,
     material is unconfirmed or short, or an inspection hold is open. The
     machinist may still proceed — they often have a good reason, and a system
     that refuses gets worked around — and the acceptance is recorded.
4. The machinist picks a queue position.
5. The order joins the executable queue. The audit record names the person, the
   position, and any warning that was accepted.

This records **where an existing order runs**. It does not create, edit,
schedule or complete anything in D365.

### Path B — unplanned work

Rework, a tooling or program trial, fixture proving, a sample, a calibration
piece. This work has no production order and happens on every shop floor. If
the system cannot represent it, the machine time simply disappears from the
record and every utilisation and downtime number is quietly wrong.

1. The machinist chooses **Unplanned work** and selects a category.
2. They give a one-line description, an estimated machine time, and the name of
   whoever authorised it.
3. It receives a local reference (`UNPLANNED-nnn`) — never a work-order number.
4. It is badged as unplanned wherever it appears, and leadership sees the total
   as its own figure rather than mixed into production.

Unplanned work is never sent to Dynamics 365 and never becomes a production
record. It stays flagged until a real work order is attached to it, which is a
deliberate prompt to close the loop rather than let it accumulate.

### Removing work from a queue

A job can be taken off a queue with a reason from a short list. A released
order returns to the unassigned list so it can be put on another machine;
unplanned work is discarded. The removal, its reason and any completed quantity
are recorded.

### Rules

- The visibility layer never creates or edits a production order.
- Quantity, due date, revision and official priority stay read-only from D365.
- An unreleased revision cannot be queued.
- A routing deviation is allowed, attributed and recorded — not silently
  permitted and not blocked.
- Unplanned work is always visible as unplanned.

## Queue-switch request workflow

### Requester enters

- Requested job/work order
- Current requested priority
- Reason for the change
- Desired timing: now, after current cycle, after current job, or specific later point
- Optional customer/project impact note

### Machinist sees

> Queue change requested for CNC Mill 1  
> Move WO-20503 ahead of WO-20492  
> Reason: customer shipment risk  
> Requested timing: after current job

Available actions:

- **Approve**
- **Reject**
- **Approve after current job/cycle**
- **Propose another position**

The interface should require no written explanation for approval. A rejection reason may be selected from a short list:

- Material unavailable
- Fixture/tooling conflict
- Current setup should be completed
- Inspection or engineering hold
- Machine/process mismatch
- Unsafe or impractical interruption
- Other

A note remains optional.

## Escalation rule

If a request is urgent and not addressed within an agreed period, it may be escalated to the production supervisor. The supervisor can approve or resolve the priority conflict, but the decision and its operational consequences remain visible in the audit history.

There should be no hidden override. Emergency changes must still be timestamped and attributed.

## Operator interface

Keep the operator screen minimal:

- Current machine and work order
- Current normalized machine state
- Current and next queued jobs
- Scan/start or change work order
- One pending queue-request indicator
- Large downtime-reason buttons
- Request inspection
- Report blocker
- Short optional note

The operator should not manually enter every cycle, alarm, machine state, utilization calculation, or ETA.

Normal production should require zero additional clicks after the active job is associated with the machine. Queue approval should generally require one click.

## PM/leadership view

Display:

- Production order and current stage
- Assigned machine and state
- Quantity remaining
- Requested priority
- Approved executable queue position
- Pending queue-switch request
- Active blocker and owner
- Advisory completion range
- Confidence and risk reason
- Last meaningful update

PMs and engineers may request a change but cannot directly alter the approved executable queue.

## Engineering view

Display:

- Actual versus standard cycle time
- Cycle-time distribution
- Setup history
- Alarm and downtime Pareto
- Tooling/chip/material/inspection delays
- Operator-intervention frequency
- Queue-change frequency and resulting setup disruption
- Machine-tending candidate score

## Audit requirements

Every queue change must store:

- Machine
- Original queue
- Proposed queue
- Final approved queue
- Requester
- Approver
- Request reason
- Decision and rejection reason, if applicable
- Requested and actual effective time
- ETA impact on affected jobs

## ETA rule

ETAs are advisory ranges, not official schedules. Use remaining quantity, historical median cycle/setup time, current approved executable queue, operating calendar, open blockers, and variability. Show confidence and the leading risk rather than false precision.
