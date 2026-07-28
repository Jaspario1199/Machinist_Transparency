# Read-Only Copilot System Discovery Prompt

## Purpose

Use this prompt with the Microsoft Copilot experience connected to Rochester's Dynamics 365 Finance and Operations / Supply Chain Management environment. It is intended to accelerate discovery of existing manufacturing capabilities that may support the CNC Manufacturing Visibility Layer.

Copilot is an evidence-gathering assistant, not the authoritative source for licensing, system configuration, security approval, or architecture decisions. Every result must be validated by the Rochester business-systems owner or administrator.

## Safety and access rules

- Read-only investigation only.
- Do not create, edit, delete, post, release, reschedule, approve, or otherwise modify any record.
- Do not invoke actions that change forms, settings, configurations, feature flags, security roles, production orders, routes, inventory, journals, or integrations.
- Do not expose credentials, secrets, tokens, connection strings, customer-sensitive data, controlled drawings, or export-controlled information.
- Use only data and pages available through my current authorized access.
- Clearly distinguish verified facts from assumptions, documentation-based possibilities, and information you cannot access.
- For every verified fact, identify the page, workspace, entity, feature-management entry, or record type used as evidence.
- When access is insufficient, state `ADMIN VERIFICATION REQUIRED` rather than guessing.

## Prompt

You are assisting with a read-only capability audit for a proposed CNC Manufacturing Visibility Layer. The proposed layer will not replace or modify Dynamics 365 or Bluestar. Dynamics 365 and Bluestar will remain authoritative for production orders, inventory, items, revisions, drawings, BOMs, routes, schedules, quantities, costs, and official business transactions.

The proposed layer may eventually read approved business data and combine it with external CNC telemetry to display current machine state, active work order, queue visibility, cycle-time history, downtime causes, blockers, estimated completion ranges, and manufacturing-optimization data.

Perform the following investigation without changing any data or configuration.

### 1. Environment identification

Determine, where visible:

- Current Dynamics 365 Finance and Operations / Supply Chain Management application version
- Current legal entity/company context
- Whether this is production, sandbox, development, or another environment
- Which manufacturing, production-control, asset-management, quality-management, warehouse-management, Power Platform, and Power BI capabilities appear enabled or actively configured

Do not infer licensing from a visible menu alone. Mark licensing questions for administrator verification.

### 2. Production Floor Execution capability

Investigate whether the standard Dynamics 365 Production Floor Execution interface appears configured or in use.

Report:

- Whether production-floor configurations exist
- Available job-list, start/stop, feedback, quantity, scrap, time, material, serial/batch, indirect-activity, and document-related functions
- Whether workers appear to use badge/personnel-number sign-in
- Whether device-specific configurations or job filters exist
- Whether sensor-based production auto-reporting or counters are visible or enabled
- Whether test-result entry from the production-floor interface is available, preview-only, disabled, or unavailable
- Whether any custom tabs, forms, fields, or buttons appear to extend the interface

Do not enable features or open restricted configuration areas.

### 3. Bluestar capability and boundaries

Identify only what is visible through authorized menus, pages, links, or metadata.

Report:

- Which Bluestar-related workspaces, modules, pages, forms, menu items, or document links are visible
- Whether production users can open controlled drawings, 3D models, work instructions, revisions, or engineering-change information from production orders or operations
- Whether a Bluestar Production Floor Execution-related capability appears present
- How item revisions, drawings, documents, BOMs, and engineering changes are currently linked to production data

Do not claim that a module is licensed or installed unless the environment provides direct evidence. Otherwise write `BLUESTAR ADMIN VERIFICATION REQUIRED`.

### 4. Existing manufacturing data available for read-only integration

Identify the authoritative pages, records, or data entities that appear to contain:

- Production-order number and status
- Item/part number
- Product or engineering revision
- Route and route operations
- Work center/resource and machine assignment
- Scheduled start and end
- Required, started, reported-good, rejected/scrap, and remaining quantities
- Job priority or dispatch sequence
- Material availability, reservation, shortage, and staging status
- Quality order, inspection, hold, or nonconformance status
- Actual setup and process time registrations
- Worker/job registration data
- Machine/resource calendars and working time
- Production journals and feedback

For each field group, report:

1. The likely authoritative record/page/entity
2. Whether I can currently view it
3. Whether it appears suitable for read-only retrieval
4. Any ambiguity or duplicate source of truth
5. The administrator or process owner who should validate it

### 5. Integration mechanisms visible or documented in this environment

Without creating connections, determine what evidence exists for approved read-only integration through:

- OData-enabled data entities
- Data-management exports or recurring data jobs
- Business events
- Data events
- Dataverse virtual tables or dual-write
- Power BI semantic models, reports, workspaces, or embedded analytics
- Power Platform environments
- Custom services or existing integrations
- Existing machine, IoT, sensor, or production-data integrations

Do not test endpoints, generate tokens, create service principals, or activate events. Report only what is visible and what requires administrator confirmation.

### 6. Current scheduling and status workflow

Using visible configuration and records, describe how the organization currently appears to handle:

- Production-order release
- Job sequencing and priority
- Machine/resource assignment
- Start/stop registration
- Production feedback
- Material shortages
- Inspection/quality delays
- Job completion
- Project or order status reporting

Clearly separate direct evidence from inference.

### 7. Duplication-risk analysis

Compare the proposed CNC Manufacturing Visibility Layer against the functions you found.

Create three lists:

1. `REUSE EXISTING FUNCTION` — functionality already provided adequately by Dynamics 365 or Bluestar
2. `POTENTIAL VISIBILITY GAP` — functionality that does not appear available in one accessible view, especially external CNC state, cycle history, downtime explanations, blocker ownership, operational ETA, and automation-readiness analytics
3. `ADMIN VERIFICATION REQUIRED` — uncertain modules, permissions, licenses, entities, integrations, or customizations

Do not recommend duplicating official production, inventory, revision, drawing, BOM, routing, scheduling, quantity, cost, or quality records.

### 8. Recommended minimum read-only dataset

Based on verified findings, propose the smallest set of approved business fields that a three-CNC visibility pilot would need to read. For each field include:

- Field/business meaning
- Authoritative system/page/entity
- Record identifier or key
- Expected update frequency
- Whether event-driven or scheduled retrieval would be preferable
- Sensitivity or access considerations

Do not include data merely because it is available; include only what is required for the pilot.

### 9. Required human follow-up

Produce a targeted question list for:

- D365/Bluestar business-systems owner
- IT/OT cybersecurity
- Manufacturing engineering
- Production planning
- Machinists and production supervision
- Quality
- Materials
- Maintenance/controls

Only ask questions that could not be answered with verified evidence.

## Required output format

Return a structured report with these sections:

1. Executive summary
2. Verified existing capabilities
3. Production Floor Execution findings
4. Bluestar findings
5. Authoritative data-source map
6. Integration options and constraints
7. Reuse / gap / verification matrix
8. Recommended minimum read-only dataset
9. Open questions by owner
10. Evidence log

For every statement use one of these labels:

- `VERIFIED IN ENVIRONMENT`
- `DOCUMENTATION-BASED POSSIBILITY`
- `ADMIN VERIFICATION REQUIRED`
- `NOT ACCESSIBLE`

At the end, include a table with:

| Finding | Evidence location | Confidence | Owner to validate | Effect on visibility-layer scope |

Do not perform or propose any write operation during this audit.

## Follow-up prompts

After the main audit, use focused prompts rather than repeating the complete investigation.

### Production Floor Execution follow-up

`Using read-only access, show me the evidence for whether Production Floor Execution is configured and used in this environment. List configurations, visible capabilities, custom extensions, and items requiring administrator confirmation. Do not change anything.`

### Data-entity follow-up

`Using read-only access, identify candidate data entities or approved export mechanisms for the minimum pilot dataset: production order, item, operation, resource, quantity, schedule, material status, and quality status. Do not invoke endpoints or create integrations. Mark every uncertain result for administrator verification.`

### Bluestar follow-up

`Using only authorized visible information, identify which Bluestar capabilities connect controlled product information to manufacturing and production operations. Do not infer licenses from menu visibility. Cite the evidence location and mark uncertainty for Bluestar administrator verification.`

### Duplication check

`Compare the proposed read-only CNC visibility layer with verified Dynamics 365 and Bluestar capabilities. Identify which proposed features would duplicate existing functionality and which are genuine CNC-telemetry or operational-analytics gaps. Do not recommend replacing any existing system-of-record function.`
