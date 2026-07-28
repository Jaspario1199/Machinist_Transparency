/**
 * Simulated shop-floor seed data.
 *
 * Mirrors the shape of config/machines/*.yaml plus the historical record the
 * real collector would have accumulated over a shift. History is seeded so the
 * engineering analytics (cycle distribution, downtime Pareto, setup history)
 * have content the moment the demo opens, instead of requiring a reviewer to
 * click for ten minutes before any analysis appears.
 *
 * All timestamps are generated relative to page load.
 */
(function () {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  /** Deterministic PRNG so every reviewer sees the same shift. */
  function rng(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Cycle observations scattered around a median, with occasional long tails. */
  function seedCycles(wo, medianMin, sigmaMin, count, endAt, random) {
    const out = [];
    let at = endAt;
    for (let i = 0; i < count; i += 1) {
      const tail = random() < 0.08 ? sigmaMin * 3 : 0;
      const jitter = (random() - 0.5) * 2 * sigmaMin;
      const min = Math.max(0.5, medianMin + jitter + tail);
      at -= min * MIN;
      out.unshift({ wo, min: Number(min.toFixed(2)), at });
    }
    return out;
  }

  /**
   * A CAMWorks operation list, as posted alongside the program.
   *
   * Each operation carries the block range it occupies in the NC file and the
   * estimated cut time CAMWorks produced. Together these are a time map: given
   * the block number the controller is currently executing, you can say which
   * operation is running and what fraction of the cycle is behind you.
   *
   * The estimate does not need to be accurate in absolute terms — see
   * docs/13 D-23. It only needs the right SHAPE, because the platform rescales
   * it against measured cycle time after a few real runs.
   */
  function operations(list) {
    let block = 1;
    return list.map(([name, tool, estMin, blocks], i) => {
      const op = { seq: i + 1, name, tool, estMin, fromBlock: block, toBlock: block + blocks - 1 };
      block += blocks;
      return op;
    });
  }

  window.MT_SEED = function buildSeed(now) {
    const shiftStart = now - 8 * HOUR;
    const random = rng(20481);

    return {
      shiftStart,
      /**
       * Demo identities. The real system takes these from Entra ID; the point
       * here is that every audit row names a person, not just a role.
       */
      actors: {
        machinist: { name: 'R. Delgado', role: 'Machinist', title: 'CNC Machinist — Mills' },
        engineer: { name: 'T. Okafor', role: 'Engineer / PM', title: 'Manufacturing Engineer' },
        leadership: { name: 'S. Whitfield', role: 'Leadership', title: 'Operations Manager' },
      },

      /**
       * Released D365 production orders that are not yet on any machine.
       *
       * This is a READ-ONLY mirror of Dynamics 365. The visibility layer never
       * creates, edits or completes a production order — it only records which
       * machine a released order has been put on, and in what order. Quantity,
       * due date, revision and priority all stay D365's.
       */
      unassignedOrders: [
        {
          wo: 'WO-20540', part: 'Sensor Housing B', rev: 'Rev B', qty: 30,
          cycleMedianMin: 7.5, cycleSigmaMin: 0.6, setupMin: 30, program: 'O20540',
          requestedPriority: 2, dueAt: now + 34 * HOUR,
          routedResource: 'cnc-1', materialStatus: 'READY', revisionStatus: 'RELEASED', inspectionHold: false,
        },
        {
          wo: 'WO-20544', part: 'Manifold Block', rev: 'Rev A', qty: 8,
          cycleMedianMin: 22, cycleSigmaMin: 3.0, setupMin: 65, program: 'O20544',
          requestedPriority: 1, dueAt: now + 16 * HOUR,
          routedResource: 'cnc-2', materialStatus: 'READY', revisionStatus: 'RELEASED', inspectionHold: false,
        },
        {
          wo: 'WO-20551', part: 'Retainer Ring', rev: 'Rev D', qty: 60,
          cycleMedianMin: 3.5, cycleSigmaMin: 0.3, setupMin: 18, program: 'O20551',
          requestedPriority: 4, dueAt: now + 66 * HOUR,
          routedResource: 'cnc-3', materialStatus: 'UNCONFIRMED', revisionStatus: 'RELEASED', inspectionHold: false,
        },
        {
          wo: 'WO-20557', part: 'Pilot Bushing', rev: 'Rev C', qty: 25,
          cycleMedianMin: 5.0, cycleSigmaMin: 0.4, setupMin: 22, program: 'O20557',
          requestedPriority: 3, dueAt: now + 40 * HOUR,
          routedResource: 'cnc-1', materialStatus: 'READY', revisionStatus: 'RELEASED', inspectionHold: true,
        },
        {
          wo: 'WO-20562', part: 'Test Coupon', rev: 'Rev F (pending)', qty: 12,
          cycleMedianMin: 4.0, cycleSigmaMin: 0.5, setupMin: 15, program: 'O20562',
          requestedPriority: 5, dueAt: now + 90 * HOUR,
          routedResource: 'cnc-3', materialStatus: 'READY', revisionStatus: 'PENDING', inspectionHold: false,
        },
      ],

      machines: [
        {
          id: 'cnc-1',
          name: 'CNC Mill 1',
          model: 'Haas VF-2SS',
          controller: 'Haas NGC 100.21',
          collector: { protocol: 'MTConnect', online: true, lastEventAt: now - 2000 },
          telemetry: { block: 1980, tool: 'T6 — 8 mm end mill', feedOverride: 100 },
          state: 'PRODUCTION',
          stateSince: now - 42 * MIN,
          setupRemainingMin: 0,
          alarm: null,
          active: {
            wo: 'WO-20481',
            part: 'Sensor Housing A',
            done: 34,
            qty: 50,
            cycleMedianMin: 8,
            cycleSigmaMin: 0.6,
            setupMin: 35,
            program: 'O20481',
            path: 'FS1 / Sensor Housing A / Rev C',
            requestedPriority: 3,
            dueAt: now + 26 * HOUR,
            camSource: 'CAMWorks 2026 · posted 3 days ago',
            operations: operations([
              ['Face top', 'T1 — 63 mm face mill', 0.9, 180],
              ['Rough pocket', 'T4 — 12 mm end mill', 3.2, 1270],
              ['Finish profile', 'T6 — 8 mm end mill', 2.1, 1150],
              ['Spot drill', 'T2 — 90° spot', 0.5, 100],
              ['Drill 4 × \u00d85', 'T7 — 5 mm drill', 0.8, 160],
              ['Chamfer', 'T9 — chamfer mill', 0.5, 100],
            ]),
          },
          queue: [
            { wo: 'WO-20503', part: 'Adapter Plate', qty: 24, cycleMedianMin: 6.5, cycleSigmaMin: 0.5, setupMin: 25, program: 'O20503', ready: 'Material ready', readyCode: 'READY', requestedPriority: 4, dueAt: now + 50 * HOUR },
            { wo: 'WO-20492', part: 'Valve Body', qty: 12, cycleMedianMin: 14, cycleSigmaMin: 2.1, setupMin: 55, program: 'O20492', ready: 'Waiting for tooling', readyCode: 'TOOLING', requestedPriority: 1, dueAt: now + 18 * HOUR },
            { wo: 'WO-20517', part: 'Mounting Ring', qty: 40, cycleMedianMin: 4.2, cycleSigmaMin: 0.3, setupMin: 20, program: 'O20517', ready: 'Material not confirmed', readyCode: 'MATERIAL', requestedPriority: 5, dueAt: now + 72 * HOUR },
          ],
          downtime: null,
          promptedAt: null,
          history: {
            cycles: seedCycles('WO-20481', 8, 0.6, 34, now - 3 * MIN, random),
            setups: [{ wo: 'WO-20481', min: 38, at: shiftStart + 30 * MIN }],
            downtimes: [
              { code: 'TOOLING', label: 'Tooling issue', owner: 'Manufacturing Engineering', startedAt: shiftStart + 2.2 * HOUR, endedAt: shiftStart + 2.6 * HOUR, note: 'Replaced chipped 1/2" endmill' },
              { code: 'INSPECTION', label: 'Waiting for inspection', owner: 'Quality', startedAt: shiftStart + 4.1 * HOUR, endedAt: shiftStart + 4.5 * HOUR, note: 'First article on Rev C' },
              { code: 'CHIPS_COOLANT', label: 'Chips or coolant', owner: 'Production Supervisor', startedAt: shiftStart + 6.0 * HOUR, endedAt: shiftStart + 6.15 * HOUR, note: 'Chip evacuation' },
            ],
            interventions: 6,
          },
        },
        {
          id: 'cnc-2',
          name: 'CNC Mill 2',
          model: 'Doosan DNM 5700',
          controller: 'FANUC 31i-B5',
          collector: { protocol: 'FOCAS', online: true, lastEventAt: now - 4000 },
          telemetry: { block: 0, tool: '—', feedOverride: 100 },
          state: 'SETUP',
          stateSince: now - 18 * MIN,
          setupRemainingMin: 22,
          alarm: null,
          active: {
            wo: 'WO-20511',
            part: 'Probe Bracket',
            done: 0,
            qty: 18,
            cycleMedianMin: 9,
            cycleSigmaMin: 1.4,
            setupMin: 40,
            program: 'O20511',
            path: 'FS1 / Probe Bracket / Rev B',
            requestedPriority: 2,
            dueAt: now + 30 * HOUR,
            camSource: 'CAMWorks 2026 · posted this morning',
            operations: operations([
              ['Face and square', 'T1 — 50 mm face mill', 1.1, 210],
              ['Rough profile', 'T4 — 10 mm end mill', 3.6, 1480],
              ['Finish profile', 'T6 — 6 mm end mill', 2.4, 1220],
              ['Drill 2 × \u00d86.8', 'T7 — 6.8 mm drill', 1.2, 190],
              ['Tap M8', 'T8 — M8 tap', 0.7, 90],
            ]),
          },
          queue: [
            { wo: 'WO-20524', part: 'Cover Plate', qty: 30, cycleMedianMin: 5, cycleSigmaMin: 0.4, setupMin: 20, program: 'O20524', ready: 'Material ready', readyCode: 'READY', requestedPriority: 3, dueAt: now + 44 * HOUR },
            { wo: 'WO-20531', part: 'Sensor Base', qty: 16, cycleMedianMin: 11, cycleSigmaMin: 1.8, setupMin: 45, program: 'O20531', ready: 'Inspection hold', readyCode: 'INSPECTION', requestedPriority: 2, dueAt: now + 28 * HOUR },
          ],
          downtime: null,
          promptedAt: null,
          history: {
            cycles: seedCycles('WO-20488', 9.4, 1.4, 22, shiftStart + 5.5 * HOUR, random),
            setups: [
              { wo: 'WO-20488', min: 44, at: shiftStart + 20 * MIN },
              { wo: 'WO-20511', min: 40, at: now - 18 * MIN },
            ],
            downtimes: [
              { code: 'MATERIAL', label: 'Waiting for material', owner: 'Materials', startedAt: shiftStart + 1.0 * HOUR, endedAt: shiftStart + 2.4 * HOUR, note: 'Bar stock not staged' },
              { code: 'ENGINEERING', label: 'Engineering or program question', owner: 'Manufacturing Engineering', startedAt: shiftStart + 3.3 * HOUR, endedAt: shiftStart + 3.8 * HOUR, note: 'Datum callout unclear on Rev B' },
              { code: 'SETUP', label: 'Setup or changeover', owner: 'Manufacturing Engineering', startedAt: shiftStart + 5.5 * HOUR, endedAt: shiftStart + 6.2 * HOUR, note: '' },
            ],
            interventions: 11,
          },
        },
        {
          id: 'cnc-3',
          name: 'CNC Lathe 1',
          model: 'Okuma LB3000',
          controller: 'OSP-P300L',
          collector: { protocol: 'MTConnect', online: true, lastEventAt: now - 3000 },
          telemetry: { block: 700, tool: 'T5 — 60° threading', feedOverride: 100 },
          state: 'STOPPED',
          stateSince: now - 9 * MIN,
          setupRemainingMin: 0,
          alarm: null,
          active: {
            wo: 'WO-20477',
            part: 'Threaded Stem',
            done: 62,
            qty: 80,
            cycleMedianMin: 4,
            cycleSigmaMin: 0.25,
            setupMin: 30,
            program: 'O20477',
            path: 'FS1 / Threaded Stem / Rev A',
            requestedPriority: 2,
            dueAt: now + 12 * HOUR,
            camSource: 'CAMWorks 2026 · posted last week',
            operations: operations([
              ['Face and rough OD', 'T1 — CNMG rougher', 1.4, 320],
              ['Finish OD', 'T3 — DNMG finisher', 0.9, 320],
              ['Single-point thread', 'T5 — 60° threading', 1.2, 340],
              ['Part off', 'T7 — 3 mm parting', 0.5, 100],
            ]),
          },
          queue: [
            { wo: 'WO-20508', part: 'Shaft Collar', qty: 50, cycleMedianMin: 3.2, cycleSigmaMin: 0.2, setupMin: 18, program: 'O20508', ready: 'Material ready', readyCode: 'READY', requestedPriority: 3, dueAt: now + 40 * HOUR },
            { wo: 'WO-20529', part: 'Valve Stem', qty: 20, cycleMedianMin: 6, cycleSigmaMin: 0.5, setupMin: 22, program: 'O20529', ready: 'Material ready', readyCode: 'READY', requestedPriority: 4, dueAt: now + 60 * HOUR },
          ],
          downtime: null,
          promptedAt: now - 9 * MIN + 3 * MIN,
          history: {
            cycles: seedCycles('WO-20477', 4, 0.25, 62, now - 9 * MIN, random),
            setups: [{ wo: 'WO-20477', min: 31, at: shiftStart + 15 * MIN }],
            downtimes: [
              { code: 'MACHINE_FAULT', label: 'Machine fault', owner: 'Maintenance', startedAt: shiftStart + 3.0 * HOUR, endedAt: shiftStart + 3.4 * HOUR, note: 'Tailstock pressure alarm' },
              { code: 'MATERIAL', label: 'Waiting for material', owner: 'Materials', startedAt: shiftStart + 5.2 * HOUR, endedAt: shiftStart + 5.6 * HOUR, note: '' },
            ],
            interventions: 4,
          },
        },
      ],

      requests: [
        {
          id: 1,
          machineId: 'cnc-1',
          wo: 'WO-20492',
          fromPos: 2,
          toPos: 1,
          reason: 'Customer shipment risk',
          urgency: 'HIGH',
          timing: 'AFTER_JOB',
          note: 'Ship date pulled in by two days at the customer request.',
          requestedBy: { name: 'T. Okafor', role: 'Engineer / PM' },
          status: 'PENDING',
          createdAt: now - 25 * MIN,
          decision: null,
          effectiveAt: null,
        },
      ],

      blockers: [
        {
          id: 1,
          machineId: 'cnc-1',
          wo: 'WO-20492',
          code: 'TOOLING',
          label: 'Tooling issue',
          owner: 'Manufacturing Engineering',
          note: 'Form tool for Valve Body not yet ground.',
          status: 'ACKNOWLEDGED',
          openedAt: now - 3.2 * HOUR,
          openedBy: 'R. Delgado',
          ackAt: now - 2.8 * HOUR,
          closedAt: null,
        },
      ],
    };
  };
}());
