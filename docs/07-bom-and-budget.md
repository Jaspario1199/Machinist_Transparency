# BOM and Budget

## Procurement strategy

Do not purchase all pilot hardware before surveying the machines. Buy the one-machine proof hardware first, validate the connection method, then expand to three machines.

## Required basis-of-design items

- Private, company-owned GitHub repository
- Company-approved central VM or server capacity
- Industrial edge computer
- Managed industrial Ethernet switch
- UPS for edge/network equipment
- Network drops and industrial patching for three pilot CNCs
- Two operator terminals or rugged tablets if existing hardware is unsuitable
- Two barcode scanners if current work travelers are barcoded
- Mounting/protective hardware
- Backup storage and retention
- IT/OT networking and cybersecurity labor
- Application development and validation labor
- D365/Bluestar read-only integration review

## Conditional items

- OEM or third-party machine adapter/license per controller
- Isolated Ethernet remote I/O for legacy machines
- External DIN-rail enclosure, 24 VDC supply, fusing, terminals, wiring, and labels
- Controls electrician/integrator labor
- Connected stack light
- Split-core current transducer or photoelectric part counter only as last-resort signals

## Planning range

For a three-machine pilot with reasonably modern network-capable CNCs:

- Purchased hardware and infrastructure: approximately **$10,000–$25,000**
- Internal application-development effort: approximately **350–650 hours**
- Budget basis used in the workbook: 500 development hours
- Legacy machine adapters and controls work may materially increase cost

Open-source software does not make the project free. Internal engineering, security, integration, testing, documentation, and support must be budgeted.

## Purchase gates

1. Leadership sponsor and permanent owner approved
2. D365/Bluestar capability and integration audit complete
3. Three-machine connectivity survey complete
4. IT/OT architecture and cybersecurity approved
5. One-machine connection method proven
6. Operator workflow accepted by machinists and supervisor
7. Expansion hardware purchased only after one-machine validation

## Source files

- `bom/BOM.csv` — detailed item-level BOM and purchasing gates
- `config/machine-survey.csv` — required machine discovery template
- A formatted Excel workbook was generated as `Rochester_CNC_Visibility_BOM.xlsx` for management review.
