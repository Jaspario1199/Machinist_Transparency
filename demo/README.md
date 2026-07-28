# Role-Based Simulated Browser Beta

This dependency-free demo validates the CNC visibility and queue-request workflow before any real CNC or Dynamics 365/Bluestar connection.

## Run

Open `index.html` in Chrome or Edge. No installation, server, database, CNC connection, or business-system access is required.

A simple local server can also be used:

```bash
python -m http.server 8080 --directory demo
```

Then open `http://localhost:8080`.

## Role-specific behavior

### Machinist

1. Select a CNC using the large machine buttons.
2. Review only that machine's current job, executable queue, approvals, downtime reason, and file information.
3. Approve or reject queue-change requests.
4. Classify downtime with one button only when the machine cannot infer the reason.

### Engineer / PM

1. Select a CNC to view read-only technical details and the approved executable queue.
2. Click **Request queue change**.
3. In the popup, first select the machine.
4. Then select the queued work order, desired queue position, reason, and optional note.
5. Submit the request for machinist approval.

### Leadership

1. Review high-level machine metrics and risk.
2. Select a CNC for a read-only production summary.
3. Use the same controlled popup to request—not directly perform—a priority change.

## Governance behavior

- Engineers, PMs, and leaders cannot directly alter the executable CNC queue.
- The machinist must approve the requested move before it becomes active.
- Approval after the current job remains deferred until the active job completes.
- Requests, approvals, rejections, and downtime reasons remain visible in the demo state.

## Intentional limitations

- Browser-memory state only; refresh resets the demo.
- Simulated machine data only.
- No authentication or production authorization.
- No D365/Bluestar, FS1, database, API, notification, or CNC protocol connection.
- ETA is intentionally simplified.
