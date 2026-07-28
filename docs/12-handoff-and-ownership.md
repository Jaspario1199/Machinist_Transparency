# Handoff and Ownership

A pilot that only one person can operate has not been delivered. This document
defines who owns what, and what "handed over" concretely means.

## Named roles

| Role | Responsibility | Decides |
|---|---|---|
| Executive sponsor | Funds the pilot, resolves cross-department conflict, owns the scale/stop decision | Whether the project continues past Phase 6 |
| Manufacturing owner | Represents the shop floor, owns workflow acceptance and the downtime reason tree | Whether the operator workflow is acceptable |
| Technical owner (permanent) | Owns the codebase, deployment, backups, upgrades and defect triage | Technical architecture within approved boundaries |
| IT/OT owner | Owns network segmentation, identity, and security approval | Whether the production architecture may be deployed |
| Business systems owner | Owns the D365/Bluestar integration contract | Which data entities may be read, and how |
| Controls engineering | Owns any physical machine signal | Whether a machine may be connected and how |

The technical owner must be named **before** Phase 2 begins and must be an
employee, not a contractor or a single project participant.

## Definition of handover

Handover is complete only when all of the following are demonstrated, not
merely documented:

1. A second person deploys the system from the runbook, on a clean environment,
   without help from the original author.
2. That person restores the database from a backup into a test environment.
3. That person adds a new machine using only the configuration template.
4. That person can explain where every number on the operator screen comes
   from, using the data dictionary.
5. Monitoring alerts reach someone who is on shift, not a personal inbox.
6. The repository contains no dependency on a personal account, personal cloud
   service, or personal machine.

## Required operational documentation

- **Deployment runbook** — provisioning, configuration, first start, upgrade
  and rollback
- **Operations runbook** — daily checks, backup verification, log locations,
  common alerts and their responses
- **Machine onboarding guide** — survey, configuration file, mapping
  validation, sign-off
- **Data dictionary** — every stored field, its source, its units, its
  refresh behaviour, and whether it is authoritative or advisory
- **Troubleshooting guide** — collector offline, stale data, state mismatch,
  clock drift, D365 read failure
- **Support model** — who is called, in what order, and what the expected
  response is

## Ongoing ownership after the pilot

| Area | Cadence | Owner |
|---|---|---|
| Dependency and container patching | Monthly, under change control | Technical owner |
| Backup restore test | Quarterly | Technical owner |
| Downtime reason-tree review (`OTHER` rate, uncoded time) | Monthly | Manufacturing owner |
| State-mapping accuracy spot check | Quarterly per machine | Controls engineering |
| Security review | Annually and on architecture change | IT/OT owner |
| D365 integration contract review | On any D365 upgrade | Business systems owner |

## Exit conditions

If the permanent technical owner leaves and is not replaced within one review
cycle, the system moves to read-only maintenance and no new machines are
onboarded until ownership is restored. This is deliberate: an unowned system
with machine-network access is a liability, not an asset.
