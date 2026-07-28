# Simulated Browser Beta

This is a dependency-free workflow demo for the Machinist Transparency project.

## Run

Open `index.html` in a modern browser. No installation, server, database, CNC, or D365 access is required.

For a simple local web server:

```bash
python -m http.server 8080 --directory demo
```

Then open `http://localhost:8080`.

## Machine-first interface

The page is organized for fast machinist use:

1. Large buttons across the top represent each CNC.
2. Clicking a machine opens only that machine's workspace below.
3. The selected workspace shows five quick facts: work order, progress, remaining quantity, ETA, and queue length.
4. Expandable sections contain:
   - Current job and progress
   - Approved executable queue
   - Queue-change requests
   - Downtime and exception reason
   - Controller and FS1 file details
5. Switching machines replaces the lower workspace instead of showing three dense machine cards at once.

## Demonstrated workflow

1. Choose one of the three simulated CNCs.
2. Review its state, active job, progress, ETA, and approved executable queue.
3. Switch to **PM / Engineer** and submit a machine-specific queue-change request.
4. Switch to **Machinist** and approve, reject, defer, or propose another position.
5. The executable queue changes only after machinist approval.
6. A deferred approval takes effect only after the current job finishes.
7. Stop the selected machine and classify the downtime reason with one click.
8. Advance simulated cycles and review the selected machine's activity log.

## Intentional limitations

- In-memory browser state only; refresh resets the demo.
- Simulated machine data only.
- No authentication or authorization.
- No D365/Bluestar integration.
- No database, API, notifications, or real CNC protocol.
- ETA is intentionally simplified.

These limitations keep the first review focused on readability, machinist effort, and workflow before production architecture is implemented.
