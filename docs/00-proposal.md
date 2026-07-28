# Proposal: CNC Manufacturing Visibility Layer

## Problem

Manufacturing status is often reconstructed through conversations: where a job is, what machine is running it, what is blocking it, and how long it may take. This creates interruptions, inconsistent expectations, and weak evidence for automation decisions.

## Proposal

Build a small, read-only internal visibility layer that connects existing work-order identifiers with current and historical CNC activity. The system will show machine state, active job, queue, cycle behavior, downtime reasons, blockers, and estimated completion ranges.

## Immediate value

- Reduce routine status-chasing and repeated interruptions
- Make delays visible without assigning blame to individual employees
- Give machinists objective evidence when material, tooling, inspection, or engineering support is blocking work
- Improve PM and leadership awareness of schedule risk
- Create a shared fact base for priority discussions

## Long-term value

- Identify high-impact setup, tooling, inspection, material, and machine losses
- Rank CNC processes for fixture improvement and machine tending
- Quantify operator-intervention frequency and unattended-production potential
- Support future material-handling and test-automation decisions

## Pilot recommendation

- Three CNCs selected for connectivity diversity and business relevance
- One modern network-capable machine
- One suspected bottleneck or high-volume machine
- One likely future machine-tending candidate
- Eight to twelve downtime categories
- Read-only business-data references and read-only machine access
- Twelve-week discovery, implementation, validation, and handoff cycle

## Success statement

The pilot succeeds when authorized users can answer: what is running, what is next, what is blocked, why it is blocked, and what the completion range looks like—without duplicating D365/Bluestar or creating excessive shop-floor entry.
