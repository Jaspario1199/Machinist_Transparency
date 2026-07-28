# Scope and Non-Goals

## In scope for the pilot

- Machine registry and connectivity status
- Current normalized CNC state
- Work-order association using approved identifiers
- Cycle start/stop and cycle-time history
- Setup and downtime intervals
- Operator-entered downtime reason and short note
- Blocker ownership and lifecycle
- Queue/status view for PMs and leadership
- Engineering analytics and machine-tending candidate metrics
- Estimated completion range with confidence and disclosed assumptions
- Exportable data and audit history

## Explicit non-goals

- Replacing Dynamics 365, Bluestar PLM, ERP, PLM, MES, WMS, QMS, or CMMS functions
- Creating independent production orders, BOMs, routings, revisions, inventory, or official schedules
- Direct database access to D365
- Writing production transactions back to D365 during the pilot
- Transferring CNC programs or changing offsets
- Starting, stopping, or controlling machines
- Controlling robots, AMRs, or forklifts
- Employee productivity ranking
- Automated priority decisions
- LLM-generated authoritative production decisions
- Predictive maintenance before reliable event and failure data exist

## Change-control rule

Any feature that edits D365/Bluestar, controls equipment, or becomes an official production record requires a separate architecture, security, validation, and ownership approval.
