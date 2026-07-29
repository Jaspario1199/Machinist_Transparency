# Simulated Beta

A dependency-free browser demo of the CNC visibility and queue-governance
workflow. It validates the workflow **before** any CNC, Dynamics 365 or Bluestar
connection exists, at no OT risk.

## Run it

Open `index.html` in Chrome, Edge, Firefox or Safari. No install, server,
database, machine or business-system access is required.

### Sending it to someone

`demo/standalone.html` is the whole application in **one file** — no folder, no
server, no network. Attach it to a calendar invite, drop it on a shared drive,
or open it from a USB stick on a shop terminal. Rebuild it after any change:

```bash
node scripts/build-standalone.mjs
```

`tests/demo.test.mjs` fails the build if it goes stale or stops being
self-contained.

### Local server

A local server works too, and is preferable if you want the CSV export to behave
exactly as it will in production:

```bash
python -m http.server 8080 --directory demo
# then open http://localhost:8080
```

## What to look at first

The shift opens mid-flow, with history already behind it — three machines, one
of them stopped and unexplained, one pending queue request, one open blocker,
and eight hours of cycle and downtime data.

1. **Machinist** — CNC Lathe 1 is stopped past the prompt threshold. Classify it
   in one tap and watch a blocker open against the owning group.
2. **Engineer / PM** — open *Process analytics* for the cycle-time distribution
   and downtime Pareto. Submit a queue request and confirm the queue does not
   move.
3. **Machinist** — approve, defer or counter that request. Every outcome lands in
   the audit trail.
4. **Leadership** — the shop-wide audit trail at the bottom, with queue
   before/after and ETA impact. Export it as CSV.

## Simulation controls

The grey bar under the header stands in for the edge collector. **None of it is
a product feature** — it exists so a reviewer can force conditions that would
otherwise take a shift to observe:

| Control | Why it is there |
|---|---|
| Pause / resume telemetry | The board advances on its own; pause it to read |
| Clock speed | Compress a shift into a few minutes |
| Downtime prompt after | Tune the threshold and see that short stops are *not* chased |
| Start / stop a machine | Stand-in for the execution state a collector reads. **This is not a product feature and never will be** — see below |
| Inject fault | Reach the `FAULT` state on demand |
| Simulate collector dropout | Verify that stale data is labelled, never silently shown as current |
| Export audit CSV | The exportable-audit requirement in `docs/01` |
| Reset demo | Returns to the opening state (asks first — it discards the audit trail) |

## What each role can do

### Machinist

- Select a CNC; everything below applies to that machine only.
- Confirm setup complete, or load the next job.
- **Flag a planned stop.** The one thing the sensors cannot know is *why*, and
  in advance. Declaring "the next stop is a tool change" means the stoppage is
  classified the moment the collector sees it and nobody is chased for a reason
  they already gave. It changes nothing on the machine.
- Reorder the approved queue directly — up, down, straight to the top, run one
  now, or take one off. No request, no approval; still audited.
- Release or reject the first article when a job holds for one. Rejecting
  scraps the piece and keeps the machine held.
- Record scrap. Good quantity and cycles run are separate numbers and the gap
  between them is visible, because counting a finished cycle as a good part is
  how a job reports 100% and then ships short.
- Decide a queue request four ways: **approve now**, **approve after the current
  job**, **propose another position**, or **reject** with a reason from the
  agreed list.
- Classify a stoppage in one tap. Reasons that `config/downtime-reasons.csv`
  marks `note_required` ask for one line and nothing more.
- Acknowledge and close blockers.

### Engineer / PM

- Read-only machine detail plus process analytics: cycle-time distribution,
  downtime Pareto, setup history, intervention count, spindle utilisation, and a
  machine-tending candidate score that shows its own inputs and weighting.
- Submit a queue-change request with job, target position, urgency, desired
  timing, reason and an optional note.
- Cannot change the executable queue. The controls do not exist in this role.

### Leadership

- Shop-wide tiles including *approved but not yet in effect*, *unclassified
  stoppages* and *jobs at due-date risk*.
- Per-machine due-date risk, blockers with their owning group, and the full
  attributable audit trail.
- Requests a priority change; never applies one.

## The platform never commands a machine

Machine state is **observed, never set**. Running, stopped, faulted and ready
all arrive from the collector — MTConnect `Execution`, `Availability` and
`ControllerMode`, a FANUC FOCAS equivalent, or a stack-light relay at the
bottom of the `docs/06` hierarchy. Nobody presses anything for the board to
follow the spindle, and there is no code path from a user action to a machine
state: `setMachineRunning` takes no actor, holds no permission, and writes its
audit row as **Collector / System**.

Earlier builds had "Stop machine" and "Resume machine" buttons in the machinist
panel. They were wrong twice over. They contradicted an acceptance criterion
carried in both `docs/09` and `docs/10` — *the platform remains read-only
toward CNCs* — and they could lie: pressing Resume put `PRODUCTION` on the
board whether or not the spindle was turning.

The start/stop control in the simulation bar exists **only** because there is
no CNC connected to this demo. Something has to stand in for the execution
state a collector would read, and the simulation bar is the honest place for
it, because that bar is the stand-in collector. Tests fail the build if a
`stop`, `start` or `resume` action reappears in a role panel.

What the machinist *can* record is the thing no sensor knows: that the next
stop is planned, and what it is for.

## Governance rules the demo enforces

- Only a machinist decision changes the approved executable queue.
- Requested priority (from D365) and approved queue position are shown as two
  separate things, because they are two separate things.
- An approval deferred to "after the current job" is visibly **not in effect**
  until that job completes — it is not styled as an applied change, and
  leadership counts it separately.
- An approval that cannot be carried out — because the work order already left
  the queue — fails loudly. It never reports a success it did not achieve: the
  request itself says the approval never took effect, and it counts on the
  leadership board until somebody acknowledges it. The person who asked was
  told "approved"; they have to be told it did not happen.
- Unplanned work carries no due date, so it is never reported at due-date risk.
  There is no committed date to miss, and inventing one from the estimate would
  make every overrun on a piece of rework read as a broken commitment.
- Every decision writes an audit row with timestamp, named actor, role, the
  queue before and after, and the ETA impact.

## ETAs

Every completion estimate is a **range** with a confidence level and the single
leading reason it could be wrong, plus the number of observed cycles behind it.
A blocked machine gets no estimate at all. This is deliberate: a point estimate
is read as a commitment, and committed dates belong to Dynamics 365
(`docs/03-d365-bluestar-boundaries.md`).

## Deliberate limitations

- Simulated machine data only; nothing is connected to anything.
- State survives a refresh via `sessionStorage`, and is gone when the tab closes.
- No authentication. The identity picker in the header stands in for company
  sign-in; the real system takes the identity from Entra ID. What is *not* a
  stand-in is the permission layer behind it — every state change goes through
  a role check, and a terminal with nobody signed in cannot record anything.
  Sign-in, sign-out and handover are audit events in their own right.
- No idle timeout. A shared terminal left signed in will attribute the next
  person's decisions to whoever walked away (D-28).
- The full normalised state model has nine states (`docs/02`); the demo exercises
  `PRODUCTION`, `SETUP`, `STOPPED`, `FAULT` and `READY`.
- The page follows the viewer's light/dark preference, and a host page can pin
  it with `data-theme="light"` or `data-theme="dark"` on the root element.
- ETA modelling is simple: observed cycle median and spread, plus remaining
  setup. It has no operating calendar, shift pattern or labour availability.

## Re-skinning to a corporate identity

Everything visual lives in **`demo/theme.css`** — colours, typefaces, radii, and
a slot for the company mark. `app.css` contains no colour or typeface literals
at all, and a test fails the build if one creeps back in, so matching a brand
never means touching component styles.

To apply an identity:

1. Replace the values in the `BRAND` block of `theme.css` (`--brand`,
   `--accent`, `--accent-solid`, and the `--on-brand-*` text colours that sit on
   the header band).
2. Add the company mark with one command — do not hand-edit the LOGO block:

   ```bash
   node scripts/embed-logo.mjs path/to/rochester-sensors.svg
   node scripts/embed-logo.mjs --clear     # back to the text wordmark
   ```

   It inlines the file as a data URI, reads the artwork's own aspect ratio so
   the header reserves the right box, and stands the text wordmark down so the
   company name is not stated twice. **Supply SVG if you have it** — the
   standalone build carries every byte to a shop terminal with no network, and
   a mark has to stay sharp on a wall panel. A PNG works; a 200 KB one costs
   270 KB inlined.

   The mark sits on a **white plate**, because most corporate lockups are dark
   ink drawn for a white page and this header band is `#004A98`. If the brand
   team supplies a light-on-dark variant instead, set
   `--brand-logo-plate: transparent`.
3. For a licensed corporate typeface, self-host or inline it as a data URI and
   put it at the front of `--font-body`. **Do not link a CDN** — the page has to
   render from a file on a USB stick with no network, and a test enforces that.
4. Run `npm test`.

Step 4 is not optional. The suite checks contrast against the surface actually
painted behind each piece of text, in both colour schemes, and will fail a
palette that drops secondary text or button labels below WCAG AA. A shop
terminal in bright light is the worst-case reading environment there is, so a
brand colour that fails is a brand colour that needs a darker variant for the
`*-solid` fills.

State colours (green / amber / red) are deliberately **not** brand tokens. They
carry meaning on the floor and should stay recognisable through a rebrand.

## Structure

```
demo/
  index.html                  markup only
  theme.css                   BRAND — the only file to edit when re-skinning
  app.css                     component styles, no literals
  app/analytics.js            ETA, confidence, risk, Pareto, distribution, scoring
  app/state.js                state, governance rules, audit, telemetry simulation
  app/views.js                rendering (all output escaped)
  app/main.js                 wiring, dialogs, accessibility, export
  data/seed.js                simulated shop-floor seed data
  data/downtime-reasons.js    GENERATED from config/downtime-reasons.csv
  standalone.html             GENERATED single-file build for sharing
```

`data/downtime-reasons.js` must never be edited by hand. Change
`config/downtime-reasons.csv`, then:

```bash
node scripts/build-demo-config.mjs
```

`tests/config-sync.test.mjs` fails the build if the two drift.

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

The suite covers the governance invariants, the ETA policy, downtime and blocker
routing, the audit trail, accessibility (tab semantics, dialog behaviour, live
regions, contrast in both colour schemes, 44px touch targets) and the tablet
layout.
