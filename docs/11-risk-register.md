# Risk Register

Severity is `impact × likelihood` if the risk is not actively managed. Every
risk names a single owner; "the team" is not an owner.

Review cadence: at each phase exit gate in `docs/08-implementation-roadmap.md`,
and immediately when a risk materialises.

## Adoption and organisational risk

| ID | Risk | Severity | Owner | Mitigation | Trigger to escalate |
|---|---|---|---|---|---|
| R-01 | Machinists read the system as surveillance of operators and disengage or work around it | **High** | Manufacturing owner | Measure machines and processes only; no operator ranking or per-person productivity metrics; state this in the product UI, not just in documents; machinists approve their own queue | Any request for a per-operator performance report |
| R-02 | The project has no permanent owner after the pilot and decays | **High** | Executive sponsor | Named permanent technical owner is a Phase 0 exit gate; second-person deployment test in Phase 6 | Owner unassigned at the end of Phase 0 |
| R-03 | PMs or leadership bypass the approval workflow with verbal priority changes | Medium | Production supervisor | Queue-switch request is the only path that changes the executable queue; escalation is timestamped and attributed, never hidden | Queue changes appearing without a matching audit record |
| R-04 | Duplicate data entry makes the shop floor slower, not faster | **High** | Manufacturing owner | Collect automatically what the machine knows; usability test in Phase 4; acceptance threshold of under ten seconds per interaction | Operators reporting added workload in usability testing |
| R-05 | The system is perceived as a competing MES and attracts organisational resistance | Medium | Executive sponsor | Positioned and documented as a read-only sidecar; `docs/03` boundaries reviewed with business systems | Any request to make it the system of record |

## Technical and data risk

| ID | Risk | Severity | Owner | Mitigation | Trigger to escalate |
|---|---|---|---|---|---|
| R-06 | Legacy CNCs expose no usable state signal and need cabinet work | **High** | Controls engineering | Connectivity survey before purchase; one-machine proof before expansion; isolated I/O as a documented fallback | Survey shows fewer than two machines with a native protocol |
| R-07 | Normalised machine state does not match what a human observes | **High** | Technical owner | Side-by-side observation in Phase 3; raw source values always retained; 95% agreement is an acceptance threshold | Agreement below 95% after mapping corrections |
| R-08 | Advisory ETAs are treated as commitments and drive customer promises | Medium | Technical owner | ETAs are ranges with confidence and a stated leading risk; never a point estimate; UI states that committed dates live in D365 | An ETA from this system quoted to a customer |
| R-09 | Cycle and downtime data are too sparse or noisy to support automation decisions | Medium | Manufacturing engineering | Report the basis of every derived number (observed vs planned, sample size); do not publish an analysis below its sample threshold | Fewer than three observed cycles behind a published figure |
| R-10 | Edge collector outages silently produce gaps that look like downtime | **High** | Technical owner | Store-and-forward buffering; connection-health heartbeat surfaced in the UI; stale data is labelled, not hidden | Any gap not visible as `STALE` in the interface |
| R-11 | D365 integration load or an unsupported access pattern affects production ERP | **High** | Business systems owner | No direct application-database access; approved read-only entities or events; sandbox first; no high-frequency telemetry written back | Any proposal to poll D365 aggressively or write back |
| R-12 | Clock drift between controllers, edge and server corrupts interval maths | Medium | IT/OT owner | Preserve source timestamps alongside receipt timestamps; NTP on edge devices; verify synchronisation in Phase 3 | Source and receipt timestamps diverging by more than a cycle |

## Security and safety risk

| ID | Risk | Severity | Owner | Mitigation | Trigger to escalate |
|---|---|---|---|---|---|
| R-13 | Machine-network access widens the OT attack surface | **High** | IT/OT security | Read-only access, segmented OT VLAN, no controller internet exposure, controlled outbound only; NIST SP 800-82 Rev. 3 as the reference | Any request for inbound access to a controller |
| R-14 | Someone attaches signal hardware to a safety circuit | **Critical** | Controls engineering | Qualified controls review before any cabinet is opened; explicit prohibition on safety and e-stop circuits; every signal documented | Any proposed connection near a safety circuit |
| R-15 | Credentials, machine addresses or controlled drawings are committed to Git | Medium | Technical owner | Secrets in an approved store; configuration templates carry placeholders; secret scanning in CI | Any real address or credential found in history |
| R-16 | Scope creep into machine control or write-back during the pilot | **High** | Executive sponsor | Explicit non-goals in `docs/01`; separate approval required for any write path | Any story proposing a write to D365 or a machine |

## Retired and accepted

| ID | Risk | Status | Note |
|---|---|---|---|
| R-17 | The browser beta is mistaken for a working connected system | Accepted, mitigated | The demo states on-page that nothing is connected, and the simulation controls are labelled as such |
