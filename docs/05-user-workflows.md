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
