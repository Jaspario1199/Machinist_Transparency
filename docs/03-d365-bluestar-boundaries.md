# Dynamics 365 and Bluestar Boundaries

## Authoritative ownership

| Data | System of record | Visibility-layer behavior |
|---|---|---|
| Production order | Dynamics 365 | Read and reference only |
| Part number and revision | D365/Bluestar | Read and link only |
| Drawings, CAD, documents | Bluestar | Link to controlled record |
| BOM and routing | D365/Bluestar | Read only when approved |
| Inventory and material location | Dynamics 365 | Read/cache; never independently edit |
| Official quantity and status | Dynamics 365 | Read only during pilot |
| Official priority and schedule | Dynamics 365/planning process | Display; do not override |
| Raw machine events | Visibility platform | Store and own |
| Normalized machine-state intervals | Visibility platform | Store and own |
| Downtime explanation | Visibility platform during pilot | Store with user and timestamp |
| Blocker workflow | Visibility platform during pilot | Store with owner and status |
| Calculated ETA range | Visibility platform | Advisory only |

## Supported integration approach

1. Begin with CSV/sample data and a simulated machine feed.
2. Use a D365 sandbox and approved read-only data entities or exports.
3. Prefer business/data events for selected changes instead of aggressive polling.
4. Never query the D365 application database directly.
5. Do not write high-frequency CNC telemetry into D365.
6. Link users back to D365/Bluestar for official edits and controlled documents.
7. Treat any write-back as a later, separately approved project.

## Political and technical positioning

This project is not a replacement MES, ERP, PLM, scheduler, or inventory system. It is a read-only manufacturing-visibility sidecar that adds machine telemetry and downtime context not currently visible in one operational view.
