# Machine Connectivity

How each CNC is read. Everything here is **read-only**: the platform observes
execution state and never commands a machine (`docs/09`, `docs/10`).

## Connection hierarchy

Use the richest approved read-only source available for each CNC:

1. Native MTConnect endpoint or OEM-supported MTConnect adapter
2. OPC UA CNC endpoint
3. OEM API such as FANUC FOCAS or another supported controller interface
4. Approved machine relays or stack-light signals through isolated digital I/O
5. Current transducer or external part-count sensor only when no better source exists

The difference between tier 1 and tier 5 is not cosmetic. Tier 1 tells you the
work order, the program, the operation, the alarm code and the part count. Tier 5
tells you the spindle is drawing current. Both are useful; only one supports the
analytics in `docs/05`.

## What each tier actually gives you

| Signal | MTConnect / OPC UA | FOCAS / OEM API | Stack light | Current sensor |
|---|---|---|---|---|
| Running / idle / alarm | yes | yes | yes | inferred |
| Alarm code and text | yes | yes | no | no |
| Program number / name | yes | yes | no | no |
| Block or sequence number | yes | yes | no | no |
| Part count | yes | yes | no | inferred, poorly |
| Controller mode (auto / MDI / manual) | yes | yes | no | no |
| Feed and spindle override | usually | yes | no | no |
| Spindle load | usually | yes | no | direct |
| Tool in spindle | usually | yes | no | no |

Operation-level progress (`docs/05`) needs the **block or sequence number**, so it
requires tier 1–3. A machine on a stack light still contributes state and
downtime data, which is most of the value in the first month.

## By controller family

Confirm every line below against the specific machine during the survey. Options
vary by model year and by what the original purchaser specified.

**Haas (NGC — Next Generation Control).** MTConnect is built in and served over
Ethernet once the machine is on the network. This is the easiest case in the
shop. Older **Haas Classic** controls do not have it and fall to tier 4/5.

**FANUC (and the many machines built on FANUC controls — Doosan/DN Solutions,
Hwacheon, many others).** No native MTConnect. Use **FOCAS** (FOCAS1/FOCAS2),
FANUC's read-only library, usually wrapped by an adapter that translates it to
MTConnect. Two things to check before you assume it is available:

- The **Ethernet function** must be present on the control.
- On some machines FOCAS or the data-server function is a **paid, unlocked
  option**. This is the single most common budget surprise in a project like
  this — it is why `BOM-011` is a conditional line and why nothing is purchased
  before the survey.

**Okuma (OSP-P200 / P300).** THINC API is open and well documented; MTConnect
adapters exist and often run as an application on the control itself.

**Mazak (Mazatrol / SmoothX etc.).** Mazak was an early MTConnect adopter and
offers adapters and the SmartBox gateway. Generally straightforward on newer
machines.

**Siemens Sinumerik (840D sl, ONE).** OPC UA is the route, sometimes as a
licensed option. The **umati** companion specification standardises machine-tool
semantics on top of OPC UA and is worth asking about by name.

**Heidenhain TNC.** DNC interface; Heidenhain also sells StateMonitor. Confirm
which interface option the machine carries.

**Brother, Fanuc Robodrill, and other compact machining centres.** Usually
FANUC-based; treat as FANUC.

The MTConnect Institute maintains a supported-device list — check each machine
against it before contacting the OEM:
<https://www.mtconnect.org/step-2-supported-devices>

## The edge collector

One collector can serve several machines; it does not need to be one per CNC.

**Hardware** (see `bom/BOM.csv` for models and prices):

- Industrial fanless edge computer, DIN-rail or panel mounted (`BOM-003`)
- Managed industrial Ethernet switch on the OT segment (`BOM-004`)
- UPS, so a power blip does not create a false downtime event (`BOM-005`)
- Network drop per machine (`BOM-009`)
- For legacy signal work only: DIN-rail enclosure, 24 VDC supply, fusing,
  terminals, and isolated Ethernet remote I/O (`BOM-010`, `BOM-012`, `BOM-013`)

**Software.** The reference stack is the open-source MTConnect **agent** plus a
per-machine **adapter** — the agent publishes a normalised XML/HTTP feed, the
adapter speaks whatever the control speaks. FOCAS and OPC UA machines get an
adapter that translates into the same shape, so everything downstream sees one
format regardless of the machine underneath.

Requirements this project places on whatever collector is used:

- Read-only access
- Source timestamps preserved alongside collector timestamps
- Raw and normalised values both retained
- Deduplication and event-transition logic
- Local store-and-forward during central-server outages
- Connection-health heartbeat, surfaced in the UI as collector status
- Configuration-driven machine mapping
- No production credentials in source control

## Build or buy the collection layer

Worth deciding deliberately rather than by default.

Commercial machine-data-collection products exist (MachineMetrics, FactoryWiz,
Predator MDC, Scytec DataXchange, Datanomix, Amper and others) and are typically
priced per machine per month plus hardware. Some — Amper in particular — use a
current sensor and need no control integration at all, which makes them
attractive for legacy machines.

The honest comparison against `BOM-021`: 500 internal development hours at the
$30–80/hr range used in the BOM is **$15,000–$40,000 of labour**, which exceeds
the entire hardware budget. A vendor is often cheaper for collection alone.

What a vendor does **not** sell is the reason this project exists: the
requested-priority-versus-approved-queue governance in `docs/16`, the machinist
decision record, and the blocker routing. Those are the parts that address the
problem in `docs/01`.

So the defensible architecture is a **hybrid**: buy or adopt a proven collection
layer, and build the governance and communication layer on top of it. That keeps
internal effort on the part nobody sells, and it removes the riskiest and most
machine-specific engineering from the critical path. Recorded as **D-31** in
`docs/13`.

## Machine survey — required before procurement

For each pilot machine record manufacturer, model, controller and version, year,
Ethernet availability and current network status, supported protocol and any
required OEM licence, the available state/program/alarm/count/tool/mode fields,
existing stack-light and approved relay signals, cabinet voltage and isolation
requirements, typical part families and cycle times, operator interventions per
shift, and pilot priority.

Use `config/machine-survey.csv`.

## Legacy machines

- Qualified controls review before anyone opens a cabinet
- **Never attach to safety circuits**
- Use isolation and fused, labelled external panel hardware
- Validate that the signal actually represents useful production state
- Document every signal, terminal, wire and state mapping

A stack-light tap through isolated digital input gives running / idle / alarm and
is usually enough to earn a machine a place in the downtime Pareto. A split-core
current transducer on the spindle drive infers cutting from load and is the last
resort. Neither yields program, operation or reliable part count.

## Known traps

**The network option may not be there.** Ethernet hardware, the FOCAS option, or
an OPC UA licence can each be missing or unlicensed on a machine that otherwise
looks modern. Survey first; this is why no adapter is purchased before
`BOM-011`'s gate.

**Time synchronisation is not optional.** Machine clocks drift. Without NTP on
the collector and preserved source timestamps, cross-machine comparison and
downtime durations are quietly wrong.

**Execution state is not the same as cutting.** MTConnect `ACTIVE` means a
program is running — which includes rapids, tool changes, dwells, and an operator
stepping through in single block. Spindle load or feed rate is the better signal
for *actually removing material*, and the two should not be conflated in
utilisation figures.

**Controller part counts are not good-part counts.** They count cycle
completions, so aborted cycles, dry runs and re-runs all distort them. Validate
against physical pieces before any count feeds a schedule. Scrap is recorded
separately in the application for exactly this reason.

**Machines belong on an OT segment.** Not the office VLAN. Firewalled, with
traffic to the business network controlled — see `docs/10`.

**RS-232-only machines are a different project.** A serial DNC port gives almost
nothing useful for monitoring. Go straight to stack light or current sensing and
set expectations accordingly.

## Validation

Observe the machine and compare the platform timeline against actual operation.
Validate cycle counts, cycle boundaries, alarm timestamps, mode changes,
reconnection, time synchronisation, and power/network interruption behaviour
before trusting analytics.
