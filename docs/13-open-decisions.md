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
| D-22 | Do we ever want theoretical cycle time estimated from the G-code, and if so bought or built? | **Resolved, see D-24** | Manufacturing engineering | — | Superseded once it became clear CAMWorks already produces the estimate |
| D-25 | Does this platform become the home of the CNC operation plan, which today lives nowhere systematic? | **Open** | Manufacturing owner + business systems | Phase 4 architecture | Machinists author operations in CAMWorks; D365/Bluestar do not hold them. This is a vacuum, not a system-of-record conflict — but filling it makes the platform more than a pure read-only sidecar and must be a deliberate decision |
| D-26 | Will the CAMWorks post-processor be modified to emit operation markers? | **Open** | Manufacturing engineering | Operation-level progress | A one-time post change gives exact operation boundaries with no parsing. Without it, tool changes give approximate boundaries for free |
| D-27 | Is a posted file one piece, or the whole quantity in one program? | **Open** | Manufacturing engineering | Progress reporting | It changes what "percent complete" means; the demo carries the answer per job rather than assuming |

## Resolved

| ID | Question | Resolved | Decision and rationale |
|---|---|---|---|
| D-16 | Should the beta be validated with a simulated workflow before any machine is connected? | 2026-07 | Yes. A browser beta with no machine, database or business-system connection validates the workflow and governance model at near-zero cost and no OT risk. See `docs/16` and `demo/`. |
| D-17 | Should ETAs be point estimates or ranges? | 2026-07 | Ranges only, with stated confidence and leading risk. A point estimate is read as a commitment and would undermine the "advisory, not authoritative" boundary in `docs/03`. |
| D-18 | Where does the downtime reason tree live? | 2026-07 | `config/downtime-reasons.csv` is the single source of truth, including the responsible group and note requirement. The demo's copy is generated from it and verified in CI. |
| D-23 | Should the pilot estimate cycle time by parsing G-code? | 2026-07 | **No, not for the pilot.** Reasoning below. |

### D-23 — why the pilot does not parse G-code

Estimating run time from a program is a real, established technique. Sum the
moves: rapids at rapid rate, feed moves at the programmed feedrate, plus
dwells, tool changes and spindle ramp. CAM post-processors do a rough version;
dedicated simulators do a good one.

The problem is that a naive parse is systematically optimistic, typically by
10–40%, and the error is largest on exactly the dense 3D toolpaths where an
estimate would be most useful:

- **Acceleration and deceleration.** The machine never reaches the programmed
  feedrate on a short move. Thousands of small segments turn this from a
  rounding error into the dominant term.
- **Block-processing rate and look-ahead.** On a dense path the controller,
  not the feedrate, becomes the bottleneck — and the limit differs sharply
  between a Haas NGC, a FANUC 31i and an Okuma OSP.
- **Path-smoothing mode.** G61 exact stop versus G64 with a tolerance changes
  real corner speed.
- **Feedrate override.** Operators run at 80% or 120%, especially on a first
  article.
- **Machine dynamics.** Axis acceleration and jerk limits are machine-specific.
- **What is not in the program at all.** Tool changes, pallet changes, probing,
  chip clearing, in-cycle stops.
- **Macros and parametric logic.** A static parse cannot always resolve how
  many times a loop actually runs.

Getting this right means modelling the kinematics and the controller's
behaviour per machine. That is what Vericut, NCSIMUL, ICAM and CAMplete sell,
and it is where their accuracy comes from. It is not a weekend project.

Three further reasons it is wrong for **this** pilot specifically:

1. **Programs are out of scope.** `docs/01` lists transferring CNC programs as
   a non-goal, and programs are controlled documents. Feeding G-code to the
   visibility layer is a new integration with a new IP and security question.
2. **Measurement beats estimation almost immediately.** After roughly three
   observed cycles the measured median already reflects accel/decel, override,
   the specific machine and the operator's real behaviour — everything a static
   parse has to approximate. The platform's whole premise is that the machine
   already knows.
3. **The cold-start case is already covered.** A part with no history uses the
   standard cycle time from the D365 routing, which is read-only data we
   already plan to consume, and the interface says plainly that it is doing so.

**Where a theoretical figure is genuinely valuable is not the ETA — it is the
variance.** Theoretical versus actual is a strong engineering metric: an 8-minute
program running in 11 minutes on the floor is a 3-minute gap worth chasing
(override, tool changes, in-cycle stops, or a program worth optimising). The
engineering view already compares actual against the routing standard for
exactly this reason.

**Recommendation:** keep the routing standard as the cold-start figure and the
variance baseline. If a genuine theoretical number is wanted later, take it
from CAM output or buy a simulator — do not build a G-code parser in-house. Any
such figure must be labelled theoretical and carry a wide band.

### D-24 — using CAM operation data for in-cycle progress (supersedes part of D-23)

D-23 asked the wrong question. It assessed whether to **predict absolute cycle
time** by parsing G-code, and concluded no. That conclusion still holds, and it
is now moot: CAMWorks already produces the estimate, so nothing needs building
to obtain one.

The valuable question is different. **Where are we inside the running program?**
That needs only the relative shape of the time curve, not its absolute
magnitude — so every objection in D-23 (accel/decel, look-ahead, smoothing
mode, feedrate override) largely cancels, because the platform rescales the
curve against measured cycle time after three real runs.

The shop's actual workflow makes this straightforward:

> Tool paths are built in CAMWorks, posted to G-code, uploaded to the machine,
> and run there.

Two artefacts already exist at post time — the operation list with estimated
times, and the NC file — and the shop controls the post-processor.

**Getting operation boundaries, cheapest first:**

1. **Tool changes only.** Zero effort, works today. The controller reports the
   tool in the spindle; a change marks an operation boundary. Approximate when
   one tool is used for several operations, but free.
2. **Post-processor markers.** The best value by a distance. A one-time change
   to the post emits an operation-start comment or a reserved N-number at each
   boundary. Exact operations, no parsing, no ambiguity. This is the
   recommended route.
3. **Parse the posted file on upload.** Works without touching the post, but
   has to infer boundaries from tool changes and comments.

**Runtime signal:** the currently executing block or sequence number. MTConnect
exposes it, FANUC FOCAS exposes the running sequence number, Okuma OSP exposes
it. It is read-only, and it is the one field `docs/04` did not previously list.

**Weight by time, not blocks.** 500 blocks of rapids take seconds; 500 blocks of
a finish contour take minutes. In the demo, block 1,980 of 2,960 is 67% of the
file but 63% of the time — and the gap is far larger on real 3D work.

**Self-correction.** Compare CAM estimate against measured cycle time and
rescale. This is also the theoretical-versus-actual engineering metric D-23
identified as the genuinely valuable output, obtained as a by-product.

**Recommendation:** capture the CAMWorks operation list at post time, read the
block number from the controller, weight progress by estimated time, and
rescale against measured runs. Store the derived operation map and time
data — **not** the program body — so the platform does not become an
uncontrolled repository of controlled documents.
