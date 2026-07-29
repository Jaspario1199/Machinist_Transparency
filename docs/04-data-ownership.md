# Data Ownership and Inputs

## Automatically collected from CNCs or purchased edge hardware

- Machine availability and connection health
- Execution state and cycle start/stop
- Program number/name where exposed
- Currently executing block or sequence number where exposed (MTConnect block,
  FANUC FOCAS running sequence number, Okuma OSP equivalent) — this is what
  makes in-cycle operation progress possible
- Alarm state/code where exposed
- Automatic/manual mode
- Part count where reliable
- Spindle/tool/feed data where available and useful

Prefer native MTConnect, OPC UA, or OEM interfaces. Use isolated digital I/O only for legacy machines. Current transducers and external part sensors are last-resort signals.

## Read-only business references from Dynamics 365/Bluestar

- Production-order identifier
- Part number and revision
- Operation and assigned resource
- Required and completed quantity
- Due date and official priority
- Material status when approved
- Controlled drawing/document link

## Human-entered context

### Machinists

- Scan/select active work order
- Begin setup when it cannot be inferred
- Select downtime reason
- Report blocker or request inspection
- Add a short exception note

### PMs/planners

- Maintain official due date, commitment, and priority in the existing business system
- Review advisory status and ETA range in the visibility layer

### Engineers

- Maintain released revision, routing, fixture, and inspection requirements in existing controlled systems

**Note on programs and operations.** At this site the CNC operation plan — the
sequence of operations, their tools and their estimated times — is authored by
machinists in CAMWorks and posted to G-code, not held in D365 or Bluestar. It
therefore has no system of record today. See `docs/13` D-25: filling that gap
is a deliberate decision, not an assumption, because it makes the platform more
than a pure read-only sidecar.
- Review cycle, setup, tooling, and intervention analytics

### Materials

- Maintain official availability, location, reservation, and staging transactions in D365

### Quality

- Maintain official inspection and hold/disposition records
- Optionally expose approved read-only status to the visibility layer

### Maintenance

- Maintain official maintenance records
- Receive and close machine-fault blockers where integrated

## Rule

Automatically collect what the machine already knows. Ask people only for information the machine cannot know.
