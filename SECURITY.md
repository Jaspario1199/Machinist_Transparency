# Security Policy

## Reporting

Report security concerns privately to the assigned Rochester Sensors IT/OT owner. Do not open public issues containing credentials, machine addresses, vulnerabilities, or production details.

## Pilot security requirements

- No direct internet exposure of CNC controllers
- Segmented OT network or approved protected machine VLAN
- Read-only machine-data acquisition
- Company-owned service accounts and secrets
- Least-privilege access
- Encrypted application traffic
- Logged administrative changes
- Nightly database backup and tested restore
- Dependency and container-image updates
- No personal accounts or personal cloud services in production

Reference: NIST SP 800-82 Rev. 3, Guide to Operational Technology Security.
