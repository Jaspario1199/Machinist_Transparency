# User Workflows

## End-to-end production visibility workflow

1. PM/planning releases and prioritizes the production order in the existing system.
2. Engineering releases the approved revision, routing, program, fixture, tooling, and inspection plan.
3. Materials confirms availability/reservation/staging in D365.
4. Scheduler assigns the work center and official queue.
5. Machinist scans or selects the production order at the CNC.
6. CNC telemetry reports machine activity automatically.
7. After a configurable stopped-time threshold, the operator interface requests a downtime reason.
8. The selected reason creates or updates a blocker assigned to the responsible group.
9. The responsible group acknowledges and resolves the blocker.
10. The platform updates the advisory completion range and confidence.
11. PMs and leadership see a simplified status view; engineers see detailed process analytics.

## Operator interface

Keep the operator screen minimal:

- Current machine and work order
- Current normalized machine state
- Scan/start or change work order
- Large downtime-reason buttons
- Request inspection
- Report blocker
- Short optional note

The operator should not manually enter every cycle, alarm, machine state, utilization calculation, or ETA.

## PM/leadership view

Display:

- Production order and current operation
- Assigned machine and state
- Quantity remaining
- Queue position
- Active blocker and owner
- Advisory completion range
- Confidence and risk reason
- Last meaningful update

## Engineering view

Display:

- Actual versus standard cycle time
- Cycle-time distribution
- Setup history
- Alarm and downtime Pareto
- Tooling/chip/material/inspection delays
- Operator-intervention frequency
- Machine-tending candidate score

## ETA rule

ETAs are advisory ranges, not official schedules. Use remaining quantity, historical median cycle/setup time, current queue, operating calendar, open blockers, and variability. Show confidence and the leading risk rather than false precision.
