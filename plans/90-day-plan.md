# 90-Day Pilot Plan

## Days 1–10 — Governance

- Confirm sponsor, permanent owner, IT/OT owner, and business-systems owner
- Approve read-only scope and private repository
- Agree on success metrics and stop conditions
- Schedule user and system-discovery interviews

## Days 1–20 — Discovery

- Audit current D365, Bluestar, Power BI, and production-floor capabilities
- Complete the three-machine connectivity survey
- Select the one-machine proof candidate
- Finalize the downtime reason tree and blocker ownership
- Approve the architecture and first purchase gate

## Days 16–35 — Simulated MVP

- Stand up Docker development environment
- Implement PostgreSQL schema and migrations
- Implement simulated CNC feed
- Implement state normalization and interval reduction
- Implement sample work-order import
- Implement operator downtime interface and basic timeline
- Add automated tests

## Days 36–55 — One-Machine Proof

- Install approved edge/network equipment
- Connect one CNC read-only
- Validate state, cycle, alarm, count, timestamp, and reconnection behavior
- Run side-by-side observation with a machinist
- Correct mappings and document the connection

## Days 46–65 — Human Workflow

- Add scan/select job workflow
- Add downtime prompts and blocker lifecycle
- Add user roles, audit logging, and PM/engineering views
- Conduct usability testing and revise the interface

## Days 56–80 — Three-Machine Pilot

- Add two machines through configuration-driven adapters
- Add dashboards, ETA ranges, and data-quality indicators
- Train pilot users
- Collect representative production data
- Review daily and weekly pilot metrics

## Days 76–90 — Stabilization and Handoff

- Freeze new features
- Fix defects and reduce manual deployment steps
- Test backup, restore, redeployment, and collector outage recovery
- Complete runbooks and data dictionary
- Have a second person deploy and operate the system
- Present results and recommend scale, revision, or stop
