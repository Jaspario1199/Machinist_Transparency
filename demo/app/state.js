/**
 * Application state, governance rules, audit trail and simulated telemetry.
 *
 * Design rules enforced here (see docs/05 and docs/16):
 *   1. The approved executable queue changes ONLY through a machinist decision.
 *   2. Requested priority and approved queue position are separate concepts.
 *   3. Every decision writes an attributable, timestamped audit record that
 *      captures the queue before and after and the ETA impact.
 *   4. An action that cannot be carried out fails loudly. It never reports
 *      success it did not achieve.
 */
(function () {
  const A = window.MT_ANALYTICS;
  const MIN = 60 * 1000;
  const STORAGE_KEY = 'mt-demo-state-v2';

  const REJECTION_REASONS = [
    'Material unavailable',
    'Fixture/tooling conflict',
    'Current setup should be completed',
    'Inspection or engineering hold',
    'Machine/process mismatch',
    'Unsafe or impractical interruption',
    'Other',
  ];

  const TIMING_LABELS = {
    NOW: 'Now — interrupt the current cycle',
    AFTER_CYCLE: 'After the current cycle',
    AFTER_JOB: 'After the current job',
    SCHEDULED: 'At a specific later point',
  };

  const ALARM_CODES = ['ALM 402 spindle load', 'ALM 118 tool life expired', 'ALM 231 low coolant', 'ALM 507 door interlock'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // ---------------------------------------------------------------- store ---

  function createStore(now = Date.now()) {
    const seed = window.MT_SEED(now);

    const state = {
      version: 2,
      role: 'machinist',
      selected: 'cnc-1',
      shiftStart: seed.shiftStart,
      actors: seed.actors,
      machines: seed.machines,
      requests: seed.requests,
      blockers: seed.blockers,
      audit: [],
      config: {
        downtimePromptSeconds: 180,
        simSpeed: 1, // simulated minutes per real second
        running: true,
      },
      ui: {
        // Disclosure state is kept in the store so a re-render never discards
        // what the user chose to expand.
        sections: {},
        lastEvent: null,
      },
      counters: { request: seed.requests.length, blocker: seed.blockers.length, audit: 0 },
    };

    seedAudit(state, now);
    return state;
  }

  /** Backfill the audit trail so the shift has a visible history at load. */
  function seedAudit(state, now) {
    const entries = [
      { at: state.shiftStart + 15 * MIN, actor: 'R. Delgado', role: 'Machinist', machineId: 'cnc-3', event: 'JOB_STARTED', wo: 'WO-20477', summary: 'Started WO-20477 after 31 min setup' },
      { at: state.shiftStart + 30 * MIN, actor: 'R. Delgado', role: 'Machinist', machineId: 'cnc-1', event: 'JOB_STARTED', wo: 'WO-20481', summary: 'Started WO-20481 after 38 min setup' },
      { at: state.shiftStart + 1.0 * 60 * MIN, actor: 'R. Delgado', role: 'Machinist', machineId: 'cnc-2', event: 'DOWNTIME_CLASSIFIED', wo: 'WO-20488', summary: 'Classified stoppage as Waiting for material' },
      { at: state.shiftStart + 1.0 * 60 * MIN, actor: 'System', role: 'System', machineId: 'cnc-2', event: 'BLOCKER_OPENED', wo: 'WO-20488', summary: 'Blocker assigned to Materials' },
      { at: state.shiftStart + 2.4 * 60 * MIN, actor: 'K. Reyes', role: 'Materials', machineId: 'cnc-2', event: 'BLOCKER_CLOSED', wo: 'WO-20488', summary: 'Materials closed the blocker — bar stock staged' },
      { at: now - 3.2 * 60 * MIN, actor: 'R. Delgado', role: 'Machinist', machineId: 'cnc-1', event: 'BLOCKER_OPENED', wo: 'WO-20492', summary: 'Tooling blocker opened against Manufacturing Engineering' },
      { at: now - 25 * MIN, actor: 'T. Okafor', role: 'Engineer / PM', machineId: 'cnc-1', event: 'REQUEST_SUBMITTED', wo: 'WO-20492', summary: 'Requested WO-20492 move to position 1 after the current job', before: ['WO-20503', 'WO-20492', 'WO-20517'], after: null },
    ];
    entries.forEach((e) => {
      state.counters.audit += 1;
      state.audit.push({ id: state.counters.audit, before: null, after: null, etaImpactMin: null, ...e });
    });
    state.audit.sort((a, b) => a.at - b.at);
  }

  // ---------------------------------------------------------------- audit ---

  function record(state, entry) {
    state.counters.audit += 1;
    const row = {
      id: state.counters.audit,
      at: entry.at ?? Date.now(),
      actor: entry.actor ?? currentActor(state).name,
      role: entry.role ?? currentActor(state).role,
      before: null,
      after: null,
      etaImpactMin: null,
      wo: null,
      ...entry,
    };
    state.audit.push(row);
    return row;
  }

  function currentActor(state) {
    return state.actors[state.role];
  }

  function machineById(state, id) {
    return state.machines.find((m) => m.id === id) ?? null;
  }

  function selectedMachine(state) {
    return machineById(state, state.selected) ?? state.machines[0];
  }

  function queueWos(machine) {
    return machine.queue.map((q) => q.wo);
  }

  /** Projected finish (upper bound) of a queued WO, used for ETA impact. */
  function projectedFinishMin(state, machine, wo) {
    const projection = A.queueProjection(state, machine);
    const row = projection.find((p) => p.wo === wo);
    return row && !row.blocked ? row.highMin : null;
  }

  // ----------------------------------------------------------- governance ---

  /**
   * Moves a work order inside the approved executable queue.
   * Returns { ok, reason } — callers must not assume success.
   */
  function moveInQueue(machine, wo, targetPos) {
    const from = machine.queue.findIndex((q) => q.wo === wo);
    if (from < 0) {
      return { ok: false, reason: `${wo} is no longer in this machine's queue` };
    }
    const bounded = Math.max(1, Math.min(targetPos, machine.queue.length));
    if (from + 1 === bounded) {
      return { ok: false, reason: `${wo} is already at position ${bounded}` };
    }
    const [job] = machine.queue.splice(from, 1);
    machine.queue.splice(bounded - 1, 0, job);
    return { ok: true, from: from + 1, to: bounded };
  }

  function submitRequest(state, input) {
    const machine = machineById(state, input.machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!machine.queue.length) {
      return { ok: false, reason: `${machine.name} has no queued work to reorder` };
    }
    const job = machine.queue.find((q) => q.wo === input.wo);
    if (!job) return { ok: false, reason: `${input.wo} is not in ${machine.name}'s queue` };

    const actor = currentActor(state);
    const before = queueWos(machine);
    const finishBefore = projectedFinishMin(state, machine, input.wo);

    state.counters.request += 1;
    const request = {
      id: state.counters.request,
      machineId: machine.id,
      wo: input.wo,
      fromPos: machine.queue.findIndex((q) => q.wo === input.wo) + 1,
      toPos: input.toPos,
      reason: input.reason,
      urgency: input.urgency,
      timing: input.timing,
      note: input.note ?? '',
      requestedBy: { name: actor.name, role: actor.role },
      status: 'PENDING',
      createdAt: Date.now(),
      decision: null,
      effectiveAt: null,
    };
    state.requests.push(request);

    record(state, {
      machineId: machine.id,
      event: 'REQUEST_SUBMITTED',
      wo: input.wo,
      summary: `Requested ${input.wo} move from position ${request.fromPos} to ${input.toPos} (${TIMING_LABELS[input.timing]})`,
      before,
      after: null,
      etaImpactMin: finishBefore,
    });

    return { ok: true, request };
  }

  /**
   * Machinist decision on a pending request.
   * action: 'approve' | 'reject' | 'defer' | 'counter'
   */
  function decideRequest(state, requestId, action, options = {}) {
    const request = state.requests.find((r) => r.id === requestId);
    if (!request) return { ok: false, reason: 'Request not found' };
    if (request.status !== 'PENDING') {
      return { ok: false, reason: `Request is already ${request.status.replace(/_/g, ' ').toLowerCase()}` };
    }
    const machine = machineById(state, request.machineId);
    const actor = currentActor(state);
    const before = queueWos(machine);
    const finishBefore = projectedFinishMin(state, machine, request.wo);

    if (action === 'reject') {
      request.status = 'REJECTED';
      request.decision = { by: actor.name, role: actor.role, at: Date.now(), action, rejectionReason: options.rejectionReason ?? 'Other' };
      record(state, {
        machineId: machine.id,
        event: 'REQUEST_REJECTED',
        wo: request.wo,
        summary: `Rejected move of ${request.wo} — ${request.decision.rejectionReason}`,
        before,
        after: before,
        etaImpactMin: 0,
      });
      return { ok: true, message: 'Request rejected' };
    }

    if (action === 'defer') {
      request.status = 'APPROVED_AFTER_CURRENT';
      request.decision = { by: actor.name, role: actor.role, at: Date.now(), action };
      record(state, {
        machineId: machine.id,
        event: 'REQUEST_DEFERRED',
        wo: request.wo,
        summary: `Approved ${request.wo} to move to position ${request.toPos}, effective after ${machine.active.wo} completes. Queue unchanged until then.`,
        before,
        after: before,
        etaImpactMin: 0,
      });
      return { ok: true, message: 'Approved — takes effect after the current job' };
    }

    const targetPos = action === 'counter' ? options.counterPos : request.toPos;
    const result = moveInQueue(machine, request.wo, targetPos);
    if (!result.ok) {
      // Do NOT mark the request approved. Surface the real reason.
      record(state, {
        machineId: machine.id,
        event: 'REQUEST_DECISION_FAILED',
        wo: request.wo,
        summary: `Approval could not be applied — ${result.reason}`,
        before,
        after: before,
        etaImpactMin: 0,
      });
      return { ok: false, reason: result.reason };
    }

    request.status = action === 'counter' ? 'APPROVED_REPOSITIONED' : 'APPROVED';
    request.effectiveAt = Date.now();
    request.decision = { by: actor.name, role: actor.role, at: Date.now(), action, counterPos: action === 'counter' ? targetPos : null };

    const finishAfter = projectedFinishMin(state, machine, request.wo);
    record(state, {
      machineId: machine.id,
      event: action === 'counter' ? 'REQUEST_COUNTERED' : 'REQUEST_APPROVED',
      wo: request.wo,
      summary: action === 'counter'
        ? `Approved at position ${targetPos} instead of the requested ${request.toPos}`
        : `Approved ${request.wo} move to position ${targetPos}`,
      before,
      after: queueWos(machine),
      etaImpactMin: finishBefore !== null && finishAfter !== null ? Math.round(finishAfter - finishBefore) : null,
    });

    return { ok: true, message: action === 'counter' ? `Approved at position ${targetPos}` : 'Request approved' };
  }

  /** Applies deferred approvals once the active job finishes. */
  function applyDeferredRequests(state, machine) {
    state.requests
      .filter((r) => r.machineId === machine.id && r.status === 'APPROVED_AFTER_CURRENT')
      .forEach((r) => {
        const before = queueWos(machine);
        const result = moveInQueue(machine, r.wo, r.toPos);
        if (result.ok) {
          r.status = 'APPROVED';
          r.effectiveAt = Date.now();
          record(state, {
            actor: 'System',
            role: 'System',
            machineId: machine.id,
            event: 'REQUEST_DEFERRED_APPLIED',
            wo: r.wo,
            summary: `Deferred approval applied — ${r.wo} moved to position ${result.to}`,
            before,
            after: queueWos(machine),
          });
        } else {
          r.status = 'EXPIRED';
          record(state, {
            actor: 'System',
            role: 'System',
            machineId: machine.id,
            event: 'REQUEST_EXPIRED',
            wo: r.wo,
            summary: `Deferred approval could not be applied — ${result.reason}`,
            before,
            after: before,
          });
        }
      });
  }

  // ------------------------------------------------------ downtime/blockers ---

  function reasonByCode(code) {
    return window.DOWNTIME_REASONS.find((r) => r.code === code) ?? null;
  }

  /**
   * Classifies the current stoppage. Honours note_required from
   * config/downtime-reasons.csv and opens a blocker owned by the responsible
   * group defined in the same file.
   */
  function classifyDowntime(state, machineId, code, note = '') {
    const machine = machineById(state, machineId);
    const reason = reasonByCode(code);
    if (!machine || !reason) return { ok: false, reason: 'Unknown machine or reason code' };
    if (!A.BLOCKED_STATES.includes(machine.state)) {
      return { ok: false, reason: `${machine.name} is not stopped` };
    }
    if (reason.noteRequired && !note.trim()) {
      return { ok: false, reason: `"${reason.label}" requires a short note`, needsNote: true };
    }

    const actor = currentActor(state);
    machine.downtime = {
      code: reason.code,
      label: reason.label,
      owner: reason.owner,
      note: note.trim(),
      startedAt: machine.stateSince,
      classifiedAt: Date.now(),
      classifiedBy: actor.name,
    };

    record(state, {
      machineId,
      event: 'DOWNTIME_CLASSIFIED',
      wo: machine.active.wo,
      summary: `Classified stoppage as ${reason.label}${note.trim() ? ` — ${note.trim()}` : ''}`,
    });

    // Reasons owned by a responding group become tracked blockers.
    if (reason.owner && reason.owner !== '—' && code !== 'NO_WORK') {
      state.counters.blocker += 1;
      state.blockers.push({
        id: state.counters.blocker,
        machineId,
        wo: machine.active.wo,
        code: reason.code,
        label: reason.label,
        owner: reason.owner,
        note: note.trim(),
        status: 'OPEN',
        openedAt: Date.now(),
        openedBy: actor.name,
        ackAt: null,
        closedAt: null,
      });
      record(state, {
        actor: 'System',
        role: 'System',
        machineId,
        event: 'BLOCKER_OPENED',
        wo: machine.active.wo,
        summary: `Blocker assigned to ${reason.owner}`,
      });
    }
    return { ok: true };
  }

  function updateBlocker(state, blockerId, status) {
    const blocker = state.blockers.find((b) => b.id === blockerId);
    if (!blocker) return { ok: false, reason: 'Blocker not found' };
    const actor = currentActor(state);
    blocker.status = status;
    if (status === 'ACKNOWLEDGED') blocker.ackAt = Date.now();
    if (status === 'CLOSED') blocker.closedAt = Date.now();
    record(state, {
      machineId: blocker.machineId,
      event: status === 'CLOSED' ? 'BLOCKER_CLOSED' : 'BLOCKER_ACKNOWLEDGED',
      wo: blocker.wo,
      summary: `${status === 'CLOSED' ? 'Closed' : 'Acknowledged'} ${blocker.label} blocker (${blocker.owner}) by ${actor.name}`,
    });
    return { ok: true };
  }

  // ------------------------------------------------------- machine actions ---

  function setState(state, machine, next, opts = {}) {
    if (machine.state === next) return;
    const previous = machine.state;
    const now = Date.now();

    // Leaving a stoppage closes the downtime interval and KEEPS it in history.
    if (A.BLOCKED_STATES.includes(previous)) {
      const elapsedSec = (now - machine.stateSince) / 1000;
      if (machine.downtime) {
        machine.history.downtimes.push({
          code: machine.downtime.code,
          label: machine.downtime.label,
          owner: machine.downtime.owner,
          note: machine.downtime.note,
          startedAt: machine.downtime.startedAt,
          endedAt: now,
        });
      } else if (elapsedSec >= state.config.downtimePromptSeconds) {
        // Past the prompt threshold and still unexplained — that is a finding.
        machine.history.downtimes.push({
          code: 'UNCODED',
          label: 'Not classified',
          owner: '—',
          note: '',
          startedAt: machine.stateSince,
          endedAt: now,
        });
      }
      // Below the threshold it is a short stop and is deliberately not coded,
      // per the acceptance rule that prompts must not chase tool changes.
      machine.downtime = null;
      machine.promptedAt = null;
    }

    machine.state = next;
    machine.stateSince = now;
    if (next !== 'FAULT') machine.alarm = null;

    record(state, {
      actor: opts.actor ?? 'Collector',
      role: opts.role ?? 'System',
      machineId: machine.id,
      event: 'STATE_CHANGED',
      wo: machine.active.wo,
      summary: `${previous} → ${next}${opts.detail ? ` (${opts.detail})` : ''}`,
    });
  }

  /** Machinist confirms setup is finished and the job can run. */
  function completeSetup(state, machineId) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (machine.state !== 'SETUP') return { ok: false, reason: `${machine.name} is not in setup` };

    const planned = machine.active.setupMin;
    const actual = Math.max(1, planned - machine.setupRemainingMin);
    machine.history.setups.push({ wo: machine.active.wo, min: Number(actual.toFixed(1)), at: Date.now() });
    machine.setupRemainingMin = 0;
    setState(state, machine, 'PRODUCTION', { actor: currentActor(state).name, role: currentActor(state).role, detail: 'setup confirmed complete' });
    record(state, {
      machineId,
      event: 'SETUP_COMPLETED',
      wo: machine.active.wo,
      summary: `Setup confirmed complete for ${machine.active.wo} (${actual.toFixed(0)} min actual vs ${planned} min planned)`,
    });
    return { ok: true };
  }

  /** Pull the next queued job onto a machine that has run out of work. */
  function startNextJob(state, machineId) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!machine.queue.length) return { ok: false, reason: `${machine.name} has no queued work` };

    applyDeferredRequests(state, machine);
    const job = machine.queue.shift();
    machine.active = {
      wo: job.wo,
      part: job.part,
      done: 0,
      qty: job.qty,
      cycleMedianMin: job.cycleMedianMin,
      cycleSigmaMin: job.cycleSigmaMin,
      setupMin: job.setupMin,
      program: job.program,
      path: `FS1 / ${job.part}`,
      requestedPriority: job.requestedPriority,
      dueAt: job.dueAt,
    };
    machine.setupRemainingMin = job.setupMin;
    machine.cycleElapsedMin = 0;
    machine.cycleTargetMin = null;
    setState(state, machine, 'SETUP', { actor: currentActor(state).name, role: currentActor(state).role, detail: `started ${job.wo}` });
    record(state, {
      machineId,
      event: 'JOB_STARTED',
      wo: job.wo,
      summary: `Loaded ${job.wo} (${job.part}) — ${job.setupMin} min setup planned`,
    });
    return { ok: true };
  }

  function stopMachine(state, machineId) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (A.BLOCKED_STATES.includes(machine.state)) return { ok: false, reason: 'Already stopped' };
    const actor = currentActor(state);
    setState(state, machine, 'STOPPED', { actor: actor.name, role: actor.role, detail: 'stopped by operator' });
    machine.history.interventions += 1;
    return { ok: true };
  }

  function resumeMachine(state, machineId) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!A.BLOCKED_STATES.includes(machine.state)) return { ok: false, reason: 'Machine is not stopped' };
    const actor = currentActor(state);
    const next = machine.setupRemainingMin > 0 ? 'SETUP' : 'PRODUCTION';
    setState(state, machine, next, { actor: actor.name, role: actor.role, detail: 'resumed by operator' });
    return { ok: true };
  }

  // --------------------------------------------------------- telemetry sim ---

  function sampleCycleTarget(machine) {
    const jitter = (Math.random() - 0.5) * 2 * machine.active.cycleSigmaMin;
    const tail = Math.random() < 0.06 ? machine.active.cycleSigmaMin * 3 : 0;
    return Math.max(0.3, machine.active.cycleMedianMin + jitter + tail);
  }

  /**
   * One simulation step. `elapsedSimMin` is simulated minutes since the last
   * tick. This stands in for the edge collector: it is the ONLY thing that
   * advances production. No human clicks a counter.
   */
  function tick(state, elapsedSimMin) {
    const now = Date.now();

    state.machines.forEach((machine) => {
      if (machine.collector.online) machine.collector.lastEventAt = now;

      if (machine.state === 'SETUP') {
        machine.setupRemainingMin = Math.max(0, machine.setupRemainingMin - elapsedSimMin);
        if (machine.setupRemainingMin === 0) {
          machine.history.setups.push({ wo: machine.active.wo, min: machine.active.setupMin, at: now });
          setState(state, machine, 'PRODUCTION', { detail: 'setup complete' });
        }
        return;
      }

      if (machine.state === 'PRODUCTION') {
        if (machine.cycleTargetMin == null) {
          machine.cycleTargetMin = sampleCycleTarget(machine);
          machine.cycleElapsedMin = 0;
        }
        machine.cycleElapsedMin += elapsedSimMin;

        if (machine.cycleElapsedMin >= machine.cycleTargetMin) {
          machine.history.cycles.push({ wo: machine.active.wo, min: Number(machine.cycleTargetMin.toFixed(2)), at: now });
          machine.active.done = Math.min(machine.active.qty, machine.active.done + 1);
          machine.cycleElapsedMin = 0;
          machine.cycleTargetMin = null;

          if (machine.active.done >= machine.active.qty) {
            record(state, {
              actor: 'Collector',
              role: 'System',
              machineId: machine.id,
              event: 'JOB_COMPLETED',
              wo: machine.active.wo,
              summary: `${machine.active.wo} complete — ${machine.active.qty} of ${machine.active.qty}`,
            });
            applyDeferredRequests(state, machine);
            if (machine.queue.length) {
              const job = machine.queue.shift();
              machine.active = {
                wo: job.wo,
                part: job.part,
                done: 0,
                qty: job.qty,
                cycleMedianMin: job.cycleMedianMin,
                cycleSigmaMin: job.cycleSigmaMin,
                setupMin: job.setupMin,
                program: job.program,
                path: `FS1 / ${job.part}`,
                requestedPriority: job.requestedPriority,
                dueAt: job.dueAt,
              };
              machine.setupRemainingMin = job.setupMin;
              setState(state, machine, 'SETUP', { detail: `next job ${job.wo}` });
              record(state, {
                actor: 'Collector',
                role: 'System',
                machineId: machine.id,
                event: 'JOB_STARTED',
                wo: job.wo,
                summary: `Loaded ${job.wo} (${job.part}) from the approved queue`,
              });
            } else {
              setState(state, machine, 'READY', { detail: 'no queued work' });
            }
            return;
          }
        }

        // Occasional unplanned fault, so FAULT handling is demonstrable.
        if (Math.random() < 0.0025) {
          machine.alarm = ALARM_CODES[Math.floor(Math.random() * ALARM_CODES.length)];
          setState(state, machine, 'FAULT', { detail: machine.alarm });
        }
        return;
      }

      // Stopped or faulted: fire the downtime prompt once past the threshold.
      if (A.BLOCKED_STATES.includes(machine.state) && !machine.downtime && !machine.promptedAt) {
        if ((now - machine.stateSince) / 1000 >= state.config.downtimePromptSeconds) {
          machine.promptedAt = now;
          record(state, {
            actor: 'System',
            role: 'System',
            machineId: machine.id,
            event: 'DOWNTIME_PROMPTED',
            wo: machine.active.wo,
            summary: `Stopped longer than ${state.config.downtimePromptSeconds}s — reason requested`,
          });
        }
      }
    });
  }

  function setCollectorOnline(state, machineId, online) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    machine.collector.online = online;
    record(state, {
      actor: 'System',
      role: 'System',
      machineId,
      event: online ? 'COLLECTOR_ONLINE' : 'COLLECTOR_OFFLINE',
      summary: online ? 'Edge collector reconnected' : 'Edge collector lost connection — data will go stale',
    });
    return { ok: true };
  }

  function injectFault(state, machineId) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (A.BLOCKED_STATES.includes(machine.state)) return { ok: false, reason: 'Machine is already stopped' };
    machine.alarm = ALARM_CODES[Math.floor(Math.random() * ALARM_CODES.length)];
    setState(state, machine, 'FAULT', { detail: machine.alarm });
    return { ok: true };
  }

  /** Collector staleness, used for the connection-health indicator. */
  function collectorHealth(machine, now) {
    const ageSec = (now - machine.collector.lastEventAt) / 1000;
    if (!machine.collector.online || ageSec > 30) {
      return { level: 'STALE', ageSec, text: `No data for ${Math.round(ageSec)}s` };
    }
    if (ageSec > 10) return { level: 'DELAYED', ageSec, text: `Last event ${Math.round(ageSec)}s ago` };
    return { level: 'LIVE', ageSec, text: `Live · last event ${Math.round(ageSec)}s ago` };
  }

  // ------------------------------------------------------------ persistence ---

  function save(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Storage is a convenience only; the demo still works without it.
    }
  }

  function load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.version === 2 ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function clearSaved() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  window.MT_STATE = {
    REJECTION_REASONS,
    TIMING_LABELS,
    clone,
    createStore,
    currentActor,
    machineById,
    selectedMachine,
    queueWos,
    moveInQueue,
    submitRequest,
    decideRequest,
    applyDeferredRequests,
    reasonByCode,
    classifyDowntime,
    updateBlocker,
    completeSetup,
    startNextJob,
    stopMachine,
    resumeMachine,
    setState,
    tick,
    setCollectorOnline,
    injectFault,
    collectorHealth,
    save,
    load,
    clearSaved,
  };
}());
