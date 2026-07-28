# Machinist Transparency — CNC Manufacturing Visibility Layer

> **Status:** pre-implementation design package for internal review.  
> **Repository visibility:** private.  
> **Pilot target:** three CNC machines, read-only machine access, and no replacement of Dynamics 365 or Bluestar PLM.

## Purpose

This project creates a focused manufacturing-visibility layer that associates existing work-order identifiers with current and historical CNC activity. It is intended to give project managers, engineers, machinists, and manufacturing leadership a shared view of:

- Current CNC state and active work order
- Machine and work-order queue visibility
- Actual cycle and setup behavior
- Downtime duration and cause
- Active blockers and responsible group
- Estimated completion ranges and confidence
- Data needed to evaluate process optimization and future CNC machine tending

## System boundary

Dynamics 365 and Bluestar PLM remain the systems of record for production orders, inventory, part information, drawings, revisions, BOMs, routings, schedules, quantities, and official business transactions.

This project adds machine telemetry and operational context. It does **not** replace, edit, or recreate existing D365/Bluestar functions.

## Initial architecture

- **Business data:** approved read-only D365 data entities, exports, or events
- **Product/document links:** references back to Bluestar/D365
- **Machine data:** MTConnect, OPC UA, OEM APIs, or isolated digital I/O for legacy machines
- **Operational database:** PostgreSQL
- **API:** Python/FastAPI
- **User interface:** browser-based PM, engineering, and operator views
- **Dashboards:** Grafana or Power BI, depending on company standards
- **Deployment:** company-approved VM plus an industrial edge gateway
- **Security:** read-only CNC access, segmented OT network, Entra ID where approved

## Repository map

- `docs/` — proposal, scope, architecture, workflows, security, risks, and validation
- `bom/` — sourcing BOM and budget assumptions
- `architecture/` — Mermaid system and workflow diagrams
- `config/` — machine and downtime-code configuration templates
- `plans/` — 90-day plan, backlog, pilot checklist, and meeting agenda
- `src/` — planned application components and ownership boundaries
- `infra/` — deployment and networking assumptions
- `tests/` — planned acceptance and automated-test structure

## Recommended first decision

Approve a discovery-and-proof phase before purchasing all pilot hardware. The first required deliverable is a machine-connectivity survey for the three proposed CNCs.

## Key documents

1. [Proposal](docs/00-proposal.md)
2. [Scope and non-goals](docs/01-scope-and-non-goals.md)
3. [System architecture](docs/02-system-architecture.md)
4. [D365/Bluestar boundaries](docs/03-d365-bluestar-boundaries.md)
5. [Data ownership](docs/04-data-ownership.md)
6. [User workflows](docs/05-user-workflows.md)
7. [Machine connectivity](docs/06-machine-connectivity.md)
8. [BOM and budget](docs/07-bom-and-budget.md)
9. [Implementation roadmap](docs/08-implementation-roadmap.md)
10. [Validation](docs/09-validation-and-acceptance.md)
11. [Security](docs/10-security-and-ot-networking.md)
12. [Risk register](docs/11-risk-register.md)
13. [Handoff and ownership](docs/12-handoff-and-ownership.md)
14. [Open decisions](docs/13-open-decisions.md)
15. [References](docs/14-references.md)

## Working rule

**Make the work visible before automating the work.**
