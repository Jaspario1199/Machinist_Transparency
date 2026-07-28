# Simulated Browser Beta

This is a dependency-free workflow demo for the Machinist Transparency project.

## Run

Open `index.html` in a modern browser. No installation, server, database, CNC, or D365 access is required.

For a simple local web server:

```bash
python -m http.server 8080 --directory demo
```

Then open `http://localhost:8080`.

## Demonstrated workflow

1. Three simulated CNCs display current state, active job, progress, ETA, and approved executable queue.
2. Switch to **PM / Engineer** and submit a queue-change request.
3. Switch to **Machinist** and approve, reject, defer, or propose another position.
4. The executable queue changes only after machinist approval.
5. Simulate a machine stop and classify the reason with one click.
6. Advance simulated cycles to update quantity and progress.
7. Review the audit log for queue and exception decisions.

## Intentional limitations

- In-memory browser state only; refresh resets the demo.
- Simulated machine data only.
- No authentication or authorization.
- No D365/Bluestar integration.
- No database, API, notifications, or real CNC protocol.
- ETA is intentionally simplified.

These limitations keep the first review focused on user workflow and scope before production architecture is implemented.
