# Initial Product Backlog

## Epic 0 — Governance and discovery

- [ ] Name executive sponsor and permanent product owner
- [ ] Confirm private company-owned repository
- [ ] Approve read-only CNC and D365/Bluestar boundaries
- [ ] Audit existing D365 Production Floor Execution, Bluestar, Power BI, and integration capabilities
- [ ] Interview PMs, engineers, machinists, supervisors, materials, quality, maintenance, IT, and business systems
- [ ] Complete three-machine connectivity survey
- [ ] Select one-machine proof candidate

## Epic 1 — Development foundation

- [ ] Create Docker Compose development environment
- [ ] Add PostgreSQL schema and migration framework
- [ ] Add FastAPI service with health endpoint
- [ ] Add React/TypeScript web application shell
- [ ] Add simulated machine collector
- [ ] Add test data and sample work orders
- [ ] Add automated unit/integration tests
- [ ] Add GitHub Actions build and test workflow

## Epic 2 — Machine telemetry

- [ ] Define normalized machine states
- [ ] Store raw events and source timestamps
- [ ] Implement event deduplication
- [ ] Convert transitions into state intervals
- [ ] Add local store-and-forward queue
- [ ] Add collector and stale-data health checks
- [ ] Implement configuration-driven machine mapping
- [ ] Validate one real CNC connection

## Epic 3 — Human workflow

- [ ] Work-order scan/select interface
- [ ] Configurable downtime prompt threshold
- [ ] Downtime reason buttons and required notes
- [ ] Blocker creation, assignment, acknowledgement, and closure
- [ ] Inspection request workflow
- [ ] Role-based access and audit history
- [ ] Shop-floor usability test

## Epic 4 — Visibility and analytics

- [ ] Current machine-state board
- [ ] Work-order queue/status view
- [ ] Machine timeline
- [ ] Cycle-time history and distribution
- [ ] Setup and downtime Pareto
- [ ] Material, quality, tooling, and engineering blocker analysis
- [ ] PM advisory ETA range and confidence
- [ ] Machine-tending candidate metrics
- [ ] CSV/export capability

## Epic 5 — Operations and handoff

- [ ] Central hosting and OT-network deployment
- [ ] Company identity integration
- [ ] Backup and restore automation
- [ ] Logging, monitoring, and alerting
- [ ] Security review and dependency update process
- [ ] Deployment, operations, onboarding, and troubleshooting runbooks
- [ ] Second-person deployment test
- [ ] Permanent ownership acceptance
