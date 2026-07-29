# References

Standards, protocols and sources this design leans on. Where a claim in these
documents depends on an external source, it should be traceable to something in
this list.

## Security and OT networking

- **NIST SP 800-82 Rev. 3** — *Guide to Operational Technology (OT) Security*.
  The reference for segmentation, read-only acquisition and the prohibition on
  exposing controllers. <https://csrc.nist.gov/pubs/sp/800/82/r3/final>
- **IEC 62443** series — industrial automation and control system security,
  zones and conduits. Relevant when IT/OT formalises the network boundary.
- **NIST SP 800-53** — control catalogue, where company policy maps to it.

## Machine connectivity

- **MTConnect** — open, read-only standard for machine-tool data; the preferred
  first choice in `docs/06`. <https://www.mtconnect.org/>
- **OPC UA (IEC 62541)** — second choice where a CNC exposes a UA server.
  <https://opcfoundation.org/about/opc-technologies/opc-ua/>
- **FANUC FOCAS** — OEM library for FANUC controllers; typically licensed.
- Controller vendor documentation — Haas NGC, Okuma OSP (THINC API), Siemens
  Sinumerik, Mazak SmoothLink. Availability and licensing vary per machine and
  must be confirmed by the connectivity survey, not assumed.

## Manufacturing measurement

- **SEMI E10** — definitions of equipment states (productive, standby,
  engineering, scheduled/unscheduled downtime). Useful vocabulary for the
  normalised state model even though this is not a semiconductor shop.
- **OEE** (availability × performance × quality) — deliberately *not* a pilot
  deliverable. Quality data is not in scope, so a published OEE number would be
  misleading. Availability and cycle behaviour are reported instead.
- **ISA-95 / IEC 62264** — the enterprise-control integration model that names
  the MES layer this project deliberately does **not** occupy.

## Business systems

- **Dynamics 365 Supply Chain Management** — production orders, routings,
  inventory. Integration must use supported data entities, exports or business
  events; direct application-database access is prohibited (`docs/03`).
- **Dynamics 365 Production Floor Execution** — Microsoft's own shop-floor
  interface. Its capabilities must be audited in Phase 1 before this project
  builds anything that overlaps it.
- **Bluestar PLM** — part, revision and document control inside D365. Linked
  to, never recreated.

## Accessibility and interface

- **WCAG 2.2 Level AA** — the contrast and target-size baseline the browser
  interface is tested against. <https://www.w3.org/TR/WCAG22/>
- **WAI-ARIA Authoring Practices** — tab, dialog and disclosure patterns used
  in the beta. <https://www.w3.org/WAI/ARIA/apg/>

## Internal documents

- `docs/00-proposal.md` — problem statement and pilot recommendation
- `docs/03-d365-bluestar-boundaries.md` — the authoritative-ownership table
- `docs/09-validation-and-acceptance.md` — acceptance thresholds
- `docs/11-risk-register.md` — risks and owners
- `config/downtime-reasons.csv` — the reason tree, its owners and note rules

## A note on sourcing

Cost ranges in `docs/07` and `docs/15` are planning estimates, not quotes. They
are not sourced from a vendor and must be replaced with real quotations before
any purchase decision.
