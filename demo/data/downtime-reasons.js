// GENERATED FILE — do not edit by hand.
// Source: config/downtime-reasons.csv
// Regenerate: node scripts/build-demo-config.mjs
// Verified in CI by tests/config-sync.test.mjs
window.DOWNTIME_REASONS = [
  {
    "code": "SETUP",
    "label": "Setup or changeover",
    "noteRequired": false,
    "owner": "Manufacturing Engineering",
    "definition": "Fixture, tools, offsets, program or first article preparation"
  },
  {
    "code": "MATERIAL",
    "label": "Waiting for material",
    "noteRequired": true,
    "owner": "Materials",
    "definition": "Raw material, components, pallet, traveler or certification unavailable"
  },
  {
    "code": "INSPECTION",
    "label": "Waiting for inspection",
    "noteRequired": true,
    "owner": "Quality",
    "definition": "First article, in-process inspection or quality approval pending"
  },
  {
    "code": "TOOLING",
    "label": "Tooling issue",
    "noteRequired": true,
    "owner": "Manufacturing Engineering",
    "definition": "Missing, broken, worn or unprepared tool"
  },
  {
    "code": "MACHINE_FAULT",
    "label": "Machine fault",
    "noteRequired": true,
    "owner": "Maintenance",
    "definition": "CNC, spindle, axis, hydraulic, pneumatic, door or approved machine alarm"
  },
  {
    "code": "CHIPS_COOLANT",
    "label": "Chips or coolant",
    "noteRequired": true,
    "owner": "Production Supervisor",
    "definition": "Chip clearing, coolant fill, washdown or contaminated fixture"
  },
  {
    "code": "ENGINEERING",
    "label": "Engineering or program question",
    "noteRequired": true,
    "owner": "Manufacturing Engineering",
    "definition": "Drawing, program, fixture or process clarification"
  },
  {
    "code": "WAITING_OPERATOR",
    "label": "Waiting for operator",
    "noteRequired": true,
    "owner": "Production Supervisor",
    "definition": "Machine ready but no qualified operator available"
  },
  {
    "code": "NO_WORK",
    "label": "No scheduled work",
    "noteRequired": false,
    "owner": "Planning",
    "definition": "No released job assigned"
  },
  {
    "code": "PLANNED_MAINT",
    "label": "Planned maintenance",
    "noteRequired": false,
    "owner": "Maintenance",
    "definition": "Scheduled maintenance, inspection or service"
  },
  {
    "code": "OTHER",
    "label": "Other",
    "noteRequired": true,
    "owner": "Production Supervisor",
    "definition": "Requires short note and later reason-tree review"
  }
];
