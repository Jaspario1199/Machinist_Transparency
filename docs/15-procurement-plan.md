# Procurement Plan — CNC Visibility Pilot

> Pricing basis: public/list/advertised pricing reviewed July 28, 2026. Obtain formal quotes before purchase.

## Procurement principle

Use native CNC/controller data first. Purchase external I/O or sensors only when the controller cannot provide the required read-only signals.

The project remains read-only toward CNCs and Dynamics 365/Bluestar. Do not connect to safety circuits or enable machine-control outputs.

## Recommended purchase sequence

### Gate 0 — No hardware purchases

Complete:

- Three-machine controller and network survey
- D365/Bluestar read-only data review
- IT/OT segmentation design
- Operator workflow prototype using simulated machine data

### Gate 1 — One-machine proof package

Purchase after the first CNC connection method is approved:

- Industrial edge gateway: Advantech UNO-127-1 class or company-approved equivalent
- Industrial SSD/local event buffer
- Managed industrial Ethernet switch: Moxa EDS-G4008-LV class or approved equivalent
- 24 VDC DIN-rail power supply: Phoenix Contact QUINT4 24 V / 5 A class
- 750 VA UPS: Eaton 5SC750 or company standard
- Required industrial Ethernet patch cables and one machine network connection
- One approved CNC software adapter/license, if the controller requires it
- Enclosure/panel hardware only when no protected cabinet location exists

### Gate 2 — Human workflow package

Use existing shop-floor PCs first. Purchase only after usability testing:

- Two shared rugged tablets, if existing PCs are unsuitable
- Tablet docks/mounts/protective enclosures
- Two Zebra DS2208 USB barcode scanners, only if travelers contain usable barcodes

### Gate 3 — Remaining two CNCs

Purchase each machine package separately after its connection method is documented and quoted:

1. Native MTConnect or OPC UA — software/configuration only
2. OEM API/adapter — controller-specific license and setup
3. Legacy digital I/O — Advantech ADAM-6050 class plus isolation/wiring
4. Analog current fallback — ADAM-6017 plus split-core current transducer, only after a signal test proves usefulness
5. Photoelectric part counter — only when controller counts are unavailable and physical part flow is consistent

## Shared core basis of design

| Item | Recommended basis | Planning range |
|---|---|---:|
| Industrial edge gateway | Advantech UNO-127-1, 8 GB preferred | $1,080–$1,900 |
| Industrial SSD | 128–512 GB | $150–$350 |
| Managed industrial switch | Moxa EDS-G4008-LV | $1,678–$2,200 |
| 24 VDC power supply | Phoenix Contact QUINT4 24 V / 5 A | $350–$600 |
| UPS | Eaton 5SC750 or company standard | $410–$590 |
| Core enclosure/panel hardware | NEMA 12 enclosure, DIN rail, protection and terminals | $500–$1,200 conditional |
| Machine network drops | Three installed/tested OT drops | $250–$800 each |
| OT-to-IT uplink | Approved segmented path | $250–$1,000 conditional |
| Industrial firewall | Existing corporate infrastructure preferred | $0–$6,000 conditional |
| Central VM/server | Existing company VM preferred | $0–$4,000 conditional |
| Backup target | Existing enterprise backup preferred | $0–$1,000 |

## Per-machine packages

### Package A — Native/OEM software connection

- Controller protocol or OEM adapter/license: $0–$2,500 per CNC
- Configuration and validation labor: typically 8+ hours per CNC
- No external sensor purchase unless a required data item remains unavailable

### Package B — Legacy digital I/O

- Advantech ADAM-6050-D1: approximately $246
- Isolation relays, terminals, fusing, wire and labels: $200–$600
- Local NEMA 12 enclosure: $200–$600 when needed
- Qualified controls labor: roughly 8–20 hours

Target signals may include cycle active, automatic mode, alarm, program complete or existing stack-light relays. Never use safety-circuit signals.

### Package C — Analog/current fallback

- Advantech ADAM-6017-D: approximately $380
- CR Magnetics CR4210S split-core 0–5 V transducer: approximately $168
- Installation/wiring kit: $150–$450
- Qualified controls labor

This produces only coarse running/idle inference and should be treated as a last resort.

## Planning scenarios

The procurement workbook calculates three scenarios:

- **Native/existing PCs:** approximately $15,000–$41,000, including IT/D365/security services but excluding application-development labor
- **Mixed connectivity:** approximately $19,000–$47,000
- **Heavy infrastructure:** approximately $22,000–$61,000
- **Application development:** approximately $15,000–$40,000 using a 500-hour planning basis

These are planning ranges, not approved budgets. Taxes, shipping, production downtime and corporate overhead are excluded.

## Do not purchase yet

- Vibration/temperature sensors across all CNCs
- Cameras or worker-tracking systems
- RFID infrastructure
- One tablet per CNC
- Connected stack lights when native or existing relay data works
- Current sensors before signal testing
- Dedicated industrial firewall before IT architecture review
- Full MES/scheduling software
- AI/LLM operational decision software

## Required approvals

| Area | Approval owner |
|---|---|
| CNC connection method | Manufacturing Engineering + OEM/integrator |
| OT network, firewall and hosting | IT/Cybersecurity |
| Electrical signal tapping and panel work | Controls/Facilities |
| Operator terminal location and workflow | Machinists + Production Supervisor |
| D365/Bluestar read-only integration | Business Systems |
| Purchase release | Project sponsor and Procurement |

## Acceptance evidence before expansion

- Read-only connection verified
- Machine state matches observed operation
- Cycle boundaries and counts validated
- Connection recovers after outage without duplicate events
- Machinist can associate a job and classify downtime in under ten seconds
- No unnecessary duplicate entry
- Queue-switch requests require machinist or supervisor approval
- Backup and restore test passes

## Current product references

- Advantech UNO-127-1: https://buy.advantech.com/Compact-Computers/Embedded-Computers-Automation-Series-UNO-Intel-Atom-Processor/UNO-127-1/system-22660.htm
- Moxa EDS-G4008: https://www.moxa.com/en/products/industrial-network-infrastructure/ethernet-switches/layer-2-managed-switches/eds-g4008-series
- Phoenix Contact QUINT4 24 V / 5 A: https://www.phoenixcontact.com/en-nz/products/power-supply-quint4-ps1ac24dc5-2904600
- Eaton 5SC750: https://www.eaton.com/us/en-us/skuPage.5SC750.html
- Zebra ET40: https://www.zebra.com/us/en/products/tablets/et4x-series/et40.html
- Zebra DS2208: https://www.cdw.com/product/Zebra-DS2208-USB-Kit-barcode-scanner/4459797
- Advantech ADAM-6050: https://buy.advantech.com/I-O-Devices-Communication/Remote-I-O-Modules-Ethernet-I-O-Modules-Digital-IO-Modules/model-ADAM-6050-D1.htm
- Advantech ADAM-6017: https://buy.advantech.com/Buy-Online/bymodel-ADAM-6017.htm
- CR Magnetics CR4210S: https://www.crmagnetics.com/ac-current-transducers/self-powered/cr4210s
- Banner QS18: https://www.bannerengineering.com/us/en/products/sensors/photoelectric-sensors/qs18-series.html
- NIST OT security guidance: https://csrc.nist.gov/pubs/sp/800/82/r3/final
