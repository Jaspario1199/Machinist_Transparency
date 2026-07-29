# Machine-First Machinist Interface

## Design objective

The machinist should never have to scan three dense machine cards or maintain a separate dashboard. The interface begins with large machine-selection buttons. Selecting a CNC replaces the lower workspace with only that machine's information and actions.

## Top-level machine buttons

Each button shows only:

- Machine name
- Current normalized state
- Active work order and part
- Percent complete
- Pending approval count or queue length

The selected machine is visually highlighted.

## Selected machine workspace

The selected machine displays five quick facts:

1. Active work order
2. Quantity progress
3. Remaining quantity
4. Advisory ETA
5. Queue length

Below the quick facts, native expandable sections organize the detail:

- Current job and progress
- Approved executable queue
- Queue-change requests
- Downtime and exception reason
- Machine and file details

Only the selected machine's requests, downtime buttons and activity log are displayed.

## Role behavior

### Machinist

- Select a machine.
- Approve, reject, defer or reposition a queue-change request.
- Classify a stopped machine with one large reason button.
- Confirm setup complete, stop, resume, or load the next queued job — the
  machine must never reach a state with no way forward.
- Acknowledge and close blockers.
- Review the active job, executable queue and FS1 location.

### PM / Engineer

- Select a machine.
- Review its current state and approved queue.
- Submit a machine-specific queue request.
- Cannot change the executable queue directly.

### Leadership

- Select a machine.
- Review status, progress, queue, blockers and decision history.
- No queue-edit controls.

## Interaction requirements

- One click selects a machine.
- One click approves a routine queue request.
- One click classifies downtime.
- No mandatory notes for normal approval or downtime classification.
- Routine production needs no repeated manual updates.
- A request approved for after the current job must not alter the queue until that job completes.
- All request and exception decisions remain attributable in the audit history,
  with a named actor and a timestamp.
- Re-rendering must preserve what the user expanded and where keyboard focus
  sits. Live telemetry updates the page roughly once a second; it must never
  collapse a section someone is reading or drop focus.
- Interactive targets are at least 44px tall. The approve and reject controls
  are among the largest on the page, never the smallest.
- Secondary text meets WCAG 2.2 AA contrast in both light and dark schemes.
- Destructive controls confirm before discarding state.

## Accessibility contract

- Role switching uses `tablist`/`tab` semantics with arrow-key navigation and
  roving tabindex.
- Machine selection is exposed through `aria-pressed`, never colour alone.
- Progress is exposed as `role="progressbar"` with values and a label.
- Dialogs are native `<dialog>` elements opened with `showModal()`, so focus
  trapping, Escape handling, background inertness and focus restoration come
  from the platform rather than a partial reimplementation.
- Status messages are announced through a polite live region.
- A skip link reaches the machine workspace directly.
