# Machine Connectivity

## Connection hierarchy

Use the richest approved read-only source available for each CNC:

1. Native MTConnect endpoint or OEM-supported MTConnect adapter
2. OPC UA CNC endpoint
3. OEM API such as FANUC FOCAS or another supported controller interface
4. Approved machine relays or stack-light signals through isolated digital I/O
5. Current transducer or external part-count sensor only when no better source exists

## Machine survey required before procurement

For each pilot machine record:

- Manufacturer, model, controller, controller version, and year
- Ethernet availability and current network status
- Supported protocol and any required OEM license
- Available state, program, alarm, count, tool, and mode fields
- Existing stack-light and approved relay signals
- Cabinet voltage and isolation requirements
- Typical part families and cycle times
- Operator interventions per shift
- Candidate importance for the pilot and future tending

Use `config/machine-survey.csv`.

## Edge collector requirements

- Read-only access
- Source timestamps preserved
- Raw and normalized values retained
- Deduplication and event-transition logic
- Local store-and-forward during central-server outages
- Connection-health heartbeat
- Configuration-driven machine mapping
- No production credentials in source control

## Legacy-machine requirements

- Qualified controls review before opening a cabinet
- Never attach to safety circuits
- Use isolation and fused/labelled external panel hardware
- Validate that the signal actually represents useful production state
- Document every signal, terminal, wire, and state mapping

## Validation

Observe the machine and compare the platform timeline against actual operation. Validate cycle counts, cycle boundaries, alarm timestamps, mode changes, reconnection, time synchronization, and power/network interruption behavior before trusting analytics.
