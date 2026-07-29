# Machinist Transparency — CNC Manufacturing Visibility Layer

> **Status:** design package plus a runnable simulated beta — for internal review.  
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

Present in this repository:

- `demo/` — **runnable simulated beta** (open `demo/index.html` in a browser)
- `docs/` — proposal, scope, architecture, workflows, security, risks, validation
- `bom/` — sourcing BOM and budget assumptions
- `config/` — machine and downtime-reason configuration templates; the downtime
  reason tree here is the single source of truth and the demo is generated from it
- `plans/` — 90-day plan, product backlog, discovery prompt
- `scripts/` — build helpers (currently the config → demo generator)
- `tests/` — automated tests for the demo and the configuration contract

Planned, and deliberately not yet created (an empty directory is not a
deliverable):

- `src/` — FastAPI service, React interface and edge collector, after the
  simulated beta is accepted
- `infra/` — deployment and networking definitions, after IT/OT approves the
  architecture

Architecture diagrams live inline as Mermaid in
[`docs/02-system-architecture.md`](docs/02-system-architecture.md) and
[`docs/10-security-and-ot-networking.md`](docs/10-security-and-ot-networking.md)
rather than in a separate directory, so they cannot drift from the text that
explains them.

## Try the simulated beta

The workflow and governance model are demonstrable today, with no CNC, database
or Dynamics 365 connection:

```bash
git clone <this repo>
open demo/index.html          # or: python -m http.server 8080 --directory demo
```

It runs entirely in the browser. See [`demo/README.md`](demo/README.md) for what
each role can do and what is deliberately not implemented.

To run the automated tests:

```bash
npm install
npx playwright install chromium
npm test
```

## Recommended first decision

Approve a discovery-and-proof phase before purchasing all pilot hardware. The first required deliverable is a machine-connectivity survey for the three proposed CNCs.

## Key documents

**Design package**

1. [Proposal](docs/00-proposal.md)
2. [Scope and non-goals](docs/01-scope-and-non-goals.md)
3. [System architecture](docs/02-system-architecture.md)
4. [D365/Bluestar boundaries](docs/03-d365-bluestar-boundaries.md)
5. [Data ownership](docs/04-data-ownership.md)
6. [User workflows](docs/05-user-workflows.md)
7. [Machine connectivity](docs/06-machine-connectivity.md)
8. [BOM and budget](docs/07-bom-and-budget.md)
9. [Implementation roadmap](docs/08-implementation-roadmap.md)
10. [Validation and acceptance](docs/09-validation-and-acceptance.md)
11. [Security and OT networking](docs/10-security-and-ot-networking.md)

**Management and decisions**

12. [Risk register](docs/11-risk-register.md)
13. [Handoff and ownership](docs/12-handoff-and-ownership.md)
14. [Open decisions](docs/13-open-decisions.md)
15. [References](docs/14-references.md)
16. [Procurement plan](docs/15-procurement-plan.md)

**Simulated beta**

17. [Beta product specification](docs/16-beta-product-spec.md)
18. [Machine-first UI design](docs/17-machine-first-ui-design.md)
19. [Running the beta](demo/README.md)

## Working rule

**Make the work visible before automating the work.**
