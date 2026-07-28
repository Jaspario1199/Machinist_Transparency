# Validation and Acceptance

## Data accuracy

- Machine state agrees with direct observation at least 95% of scheduled pilot time
- Cycle boundaries and counts match production observation within an agreed tolerance
- Source timestamps and server timestamps remain synchronized
- Connection loss, restart, and store-and-forward behavior are demonstrated
- Raw source values remain available for troubleshooting

## Workflow quality

- A machinist can associate a work order and enter a downtime reason in under ten seconds
- Downtime prompts do not interrupt normal short pauses or tool changes unnecessarily
- At least 90–95% of meaningful scheduled downtime is assigned a valid cause
- `OTHER` and uncoded time remain below agreed thresholds
- Blockers have a responsible group, status, timestamps, and closure record

## User value

- PMs can see current operation, machine status, blocker, queue position, and advisory completion range
- Engineers can produce cycle, setup, intervention, and downtime analyses without spreadsheet cleanup
- Production supervision can review the previous day's largest lost-time events
- The pilot identifies and ranks concrete process-improvement or automation candidates

## Reliability and operations

- Application survives central-server and edge-collector restarts
- Nightly backups run automatically
- A restore is completed successfully in a test environment
- Logs and health checks identify failed collectors and stale data
- A second person can deploy and operate the system from documentation

## Safety and security

- The platform remains read-only toward CNCs and D365/Bluestar
- No CNC controller is directly internet-exposed
- Authentication and least-privilege roles are enabled
- Production credentials and machine addresses are not stored in Git
- IT/OT security and controls engineering approve the production architecture

## Pilot stop conditions

Stop or redesign if the system causes production disruption, requires excessive duplicate entry, cannot accurately identify machine states, creates unsupported D365 load, lacks a permanent owner, or cannot meet cybersecurity requirements.
