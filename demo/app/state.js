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
  const STORAGE_KEY = 'mt-demo-state-v3';

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

  /**
   * Who may do what, enforced HERE rather than by which buttons get rendered.
   * Hiding a control is a courtesy; refusing the operation is the rule.
   */
  const PERMISSIONS = {
    Machinist: [
      'decideRequest', 'reorderQueue', 'switchActiveJob', 'classifyDowntime',
      'completeSetup', 'startNextJob', 'flagPlannedStop', 'clearPlannedStop',
      'addOrderToQueue', 'addUnplannedJob', 'removeFromQueue', 'updateBlocker',
      'recordScrap', 'setMachinistEstimate', 'finaliseProcess', 'approveFirstOff',
      'submitRequest',
    ],
    'Engineer / PM': ['submitRequest', 'updateBlocker'],
    Leadership: ['submitRequest'],
  };

  function may(state, action) {
    const person = state.signedIn;
    if (!person) return { ok: false, reason: 'Nobody is signed in at this terminal' };
    const allowed = PERMISSIONS[person.role] ?? [];
    if (!allowed.includes(action)) {
      return { ok: false, reason: `${person.role} may not ${action.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}` };
    }
    return { ok: true };
  }

  const ALARM_CODES = ['ALM 402 spindle load', 'ALM 118 tool life expired', 'ALM 231 low coolant', 'ALM 507 door interlock'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // ---------------------------------------------------------------- store ---

  function createStore(now = Date.now()) {
    const seed = window.MT_SEED(now);

    const state = {
      version: 3,
      role: 'machinist',
      selected: 'cnc-1',
      shiftStart: seed.shiftStart,
      actors: seed.actors,
      people: seed.people,
      // Who is physically at this terminal. Every audit row names this person,
      // not the role — a shared wall terminal sees several people per shift.
      signedIn: seed.people.find((x) => x.role === 'Machinist'),
      machines: seed.machines,
      unassignedOrders: seed.unassignedOrders,
      programLibrary: seed.programLibrary,
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
      counters: { request: seed.requests.length, blocker: seed.blockers.length, audit: 0, unplanned: 0 },
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
    return state.signedIn ?? { name: 'Not signed in', role: 'Unknown', title: '' };
  }

  /**
   * Shift handover. Signing in and out is itself audited, because an audit
   * trail that cannot say who was at the terminal is not an audit trail.
   */
  function signIn(state, name) {
    const person = state.people.find((x) => x.name === name);
    if (!person) return { ok: false, reason: 'Unknown person' };
    const previous = state.signedIn;
    state.signedIn = person;
    state.role = { Machinist: 'machinist', 'Engineer / PM': 'engineer', Leadership: 'leadership' }[person.role] ?? state.role;
    record(state, {
      actor: person.name,
      role: person.role,
      event: previous ? 'SHIFT_HANDOVER' : 'SIGNED_IN',
      summary: previous
        ? `${person.name} (${person.role}) took over the terminal from ${previous.name}`
        : `${person.name} (${person.role}) signed in`,
    });
    return { ok: true, message: `Signed in as ${person.name}` };
  }

  function signOut(state) {
    const previous = state.signedIn;
    if (!previous) return { ok: false, reason: 'Nobody is signed in' };
    record(state, {
      actor: previous.name,
      role: previous.role,
      event: 'SIGNED_OUT',
      summary: `${previous.name} signed out of the terminal`,
    });
    state.signedIn = null;
    return { ok: true, message: 'Signed out' };
  }

  /** Builds an active-job record from a queue entry, preserving partial progress. */
  function activeFromJob(job) {
    return {
      wo: job.wo,
      part: job.part,
      done: job.done ?? 0,
      qty: job.qty,
      cycleMedianMin: job.cycleMedianMin,
      cycleSigmaMin: job.cycleSigmaMin,
      setupMin: job.setupMin,
      program: job.program,
      path: `FS1 / ${job.part}`,
      requestedPriority: job.requestedPriority,
      dueAt: job.dueAt,
    };
  }

  /** Puts the active job back into the queue, keeping the quantity already run. */
  function jobFromActive(machine) {
    return {
      wo: machine.active.wo,
      part: machine.active.part,
      qty: machine.active.qty,
      done: machine.active.done,
      cycleMedianMin: machine.active.cycleMedianMin,
      cycleSigmaMin: machine.active.cycleSigmaMin,
      setupMin: machine.active.setupMin,
      program: machine.active.program,
      ready: machine.active.done > 0 ? `Part-finished — ${machine.active.done} of ${machine.active.qty} done` : 'Ready to run',
      readyCode: 'READY',
      requestedPriority: machine.active.requestedPriority,
      dueAt: machine.active.dueAt,
    };
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
    const permitted = may(state, 'submitRequest');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, input.machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!machine.queue.length) {
      return { ok: false, reason: `${machine.name} has no queued work to reorder` };
    }
    const job = machine.queue.find((q) => q.wo === input.wo);
    if (!job) return { ok: false, reason: `${input.wo} is not in ${machine.name}'s queue` };
    const already = state.requests.find((r) => r.machineId === machine.id && r.wo === input.wo
      && (r.status === 'PENDING' || r.status === 'APPROVED_AFTER_CURRENT'));
    if (already) {
      return {
        ok: false,
        reason: `There is already an undecided request to move ${input.wo} (from ${already.requestedBy.name}). `
          + 'Chasing it with a second one does not make it happen faster.',
      };
    }

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
    const permitted = may(state, 'decideRequest');
    if (!permitted.ok) return permitted;
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

  /**
   * Clears the unacknowledged flag on a lapsed approval.
   *
   * Anyone may do this — the point is that a human has seen it, not that a
   * particular role has. It does not change the queue and does not revive the
   * request; the requester has to submit a new one if they still want the move.
   */
  function acknowledgeExpiry(state, requestId) {
    const request = state.requests.find((r) => r.id === requestId);
    if (!request) return { ok: false, reason: 'Unknown request' };
    if (request.status !== 'EXPIRED') return { ok: false, reason: 'That request did not lapse' };
    if (request.expiryAcknowledged) return { ok: false, reason: 'Already acknowledged' };
    request.expiryAcknowledged = true;
    record(state, {
      machineId: request.machineId,
      event: 'REQUEST_EXPIRY_ACKNOWLEDGED',
      wo: request.wo,
      summary: `Lapsed approval for ${request.wo} acknowledged. A new request is needed if the move is still wanted.`,
    });
    return { ok: true, message: 'Acknowledged — submit a new request if the move is still needed' };
  }

  /** Lapsed approvals nobody has looked at yet. */
  function unacknowledgedExpiries(state, machineId) {
    return state.requests.filter((r) => r.status === 'EXPIRED' && !r.expiryAcknowledged
      && (!machineId || r.machineId === machineId));
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
          /*
           * The approval lapsed — the work order left the queue before the
           * current job finished, so there is nothing left to move.
           *
           * This used to be recorded in the audit trail and nowhere else,
           * which meant the person who asked for the change was told
           * "approved" and never told it had not happened. They would only
           * find out by reading an audit row they have no reason to open. The
           * lapse now carries its own reason and an unacknowledged flag, so it
           * is shown on the request itself and counted for leadership until
           * somebody clears it.
           */
          r.status = 'EXPIRED';
          r.expiredAt = Date.now();
          r.expiredReason = result.reason;
          r.expiryAcknowledged = false;
          record(state, {
            actor: 'System',
            role: 'System',
            machineId: machine.id,
            event: 'REQUEST_EXPIRED',
            wo: r.wo,
            summary: `Deferred approval could not be applied — ${result.reason}. `
              + `${r.requestedBy.name} (${r.requestedBy.role}) asked for this and it did not happen.`,
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
  /**
   * A reason owned by a responding group becomes a tracked blocker. Shared by
   * the reactive path (someone answered the prompt) and the pre-classified one
   * (someone declared the stop before it happened) so both routes route work to
   * the same group in the same way.
   */
  function openBlockerFor(state, machine, reason, note, by) {
    if (!reason.owner || reason.owner === '—' || reason.code === 'NO_WORK') return;
    state.counters.blocker += 1;
    state.blockers.push({
      id: state.counters.blocker,
      machineId: machine.id,
      wo: machine.active.wo,
      code: reason.code,
      label: reason.label,
      owner: reason.owner,
      note,
      status: 'OPEN',
      openedAt: Date.now(),
      openedBy: by,
      ackAt: null,
      closedAt: null,
    });
    record(state, {
      actor: 'System',
      role: 'System',
      machineId: machine.id,
      event: 'BLOCKER_OPENED',
      wo: machine.active.wo,
      summary: `Blocker assigned to ${reason.owner}`,
    });
  }

  function classifyDowntime(state, machineId, code, note = '') {
    const permitted = may(state, 'classifyDowntime');
    if (!permitted.ok) return permitted;
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

    openBlockerFor(state, machine, reason, note.trim(), actor.name);
    return { ok: true };
  }

  function updateBlocker(state, blockerId, status) {
    const permitted = may(state, 'updateBlocker');
    if (!permitted.ok) return permitted;
    const blocker = state.blockers.find((b) => b.id === blockerId);
    if (!blocker) return { ok: false, reason: 'Blocker not found' };
    if (blocker.status === 'CLOSED') {
      return { ok: false, reason: `That blocker was already closed at ${new Date(blocker.closedAt).toLocaleTimeString()}` };
    }
    if (blocker.status === status) {
      return { ok: false, reason: `That blocker is already ${status.toLowerCase()}` };
    }
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
      machine.promptSnoozedUntil = null;
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
    const permitted = may(state, 'completeSetup');
    if (!permitted.ok) return permitted;
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
    const permitted = may(state, 'startNextJob');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!machine.queue.length) return { ok: false, reason: `${machine.name} has no queued work` };

    applyDeferredRequests(state, machine);
    const job = machine.queue.shift();
    machine.active = activeFromJob(job);
    machine.setupRemainingMin = job.setupMin;
    machine.cycleElapsedMin = 0;
    machine.cycleTargetMin = null;
    if (machine.telemetry) { machine.telemetry.block = 0; machine.telemetry.tool = '—'; }
    setState(state, machine, 'SETUP', { actor: currentActor(state).name, role: currentActor(state).role, detail: `started ${job.wo}` });
    record(state, {
      machineId,
      event: 'JOB_STARTED',
      wo: job.wo,
      summary: `Loaded ${job.wo} (${job.part}) — ${job.setupMin} min setup planned`,
    });
    return { ok: true };
  }

  /*
   * ==========================================================================
   * MACHINE STATE IS OBSERVED, NEVER COMMANDED
   * ==========================================================================
   *
   * There used to be "Stop machine" and "Resume machine" buttons here, writing
   * `stopped by operator` and `resumed by operator` into machine state. That
   * was wrong in two separate ways.
   *
   * It contradicted the product. `docs/09` and `docs/10` both carry "the
   * platform remains read-only toward CNCs" as an acceptance criterion, and the
   * operations panel says "nothing is sent to the machine" a few lines under
   * where the red Stop button used to sit. A visibility sidecar that appears to
   * command a spindle is the fastest possible route to R-05 — being read as a
   * competing MES — and to a controls engineer refusing the connection.
   *
   * It was also redundant, and worse than redundant: it could lie. Execution
   * state is exactly what the collector already reads — MTConnect `Execution`
   * (ACTIVE / INTERRUPTED / STOPPED / READY) plus `Availability` and
   * `ControllerMode`, FANUC FOCAS equivalents, or a stack-light relay at the
   * bottom of the `docs/06` hierarchy. It arrives in seconds without anyone
   * pressing anything. A Resume button let a machinist put PRODUCTION on the
   * board while the spindle sat still.
   *
   * So state transitions now enter through one door — the collector — and
   * `setMachineRunning` is that door. It is deliberately NOT in PERMISSIONS and
   * takes no actor: it is not a person doing something, and the audit row is
   * attributed to the collector. In the demo the simulation bar drives it,
   * which is honest, because the simulation bar IS the stand-in collector.
   */
  function setMachineRunning(state, machineId, running) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const stopped = A.BLOCKED_STATES.includes(machine.state);
    if (running === !stopped) {
      return { ok: false, reason: `The collector already reports ${machine.name} as ${machine.state}` };
    }

    if (!running) {
      setState(state, machine, 'STOPPED', {
        actor: 'Collector', role: 'System', detail: 'execution stopped — reported by the collector',
      });
      applyPlannedStop(state, machine);
      return { ok: true, message: `Collector reports ${machine.name} stopped` };
    }

    const next = machine.setupRemainingMin > 0 ? 'SETUP' : 'PRODUCTION';
    setState(state, machine, next, {
      actor: 'Collector', role: 'System', detail: 'execution resumed — reported by the collector',
    });
    machine.plannedStop = null;
    return { ok: true, message: `Collector reports ${machine.name} running` };
  }

  /**
   * The one thing the sensors genuinely cannot know: why, and in advance.
   *
   * The collector sees a stop the instant it happens but has no idea whether it
   * is a tool change, a scheduled break, preventive maintenance or a crash. The
   * reactive path — stop, wait past the threshold, prompt — is right for the
   * unexpected ones and a nuisance for the planned ones, and nuisance prompts
   * are how the whole system gets ignored (R-01/R-04).
   *
   * So a machinist can say beforehand what the next stop will be. This changes
   * no machine state and sends nothing anywhere; it arms a reason that the
   * collector's next observed stop consumes. Declaring it is audited, and so is
   * consuming it, because "pre-classified" and "answered at the time" are
   * different claims and leadership should be able to tell them apart.
   */
  function flagPlannedStop(state, machineId, code, note = '', windowMin = 30) {
    const permitted = may(state, 'flagPlannedStop');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const reason = reasonByCode(code);
    if (!reason) return { ok: false, reason: 'Unknown reason code' };
    if (reason.noteRequired && !note.trim()) {
      return { ok: false, reason: `${reason.label} needs a one-line note` };
    }

    const actor = currentActor(state);
    machine.plannedStop = {
      code, label: reason.label, owner: reason.owner, note: note.trim(),
      declaredBy: actor.name, declaredAt: Date.now(), expiresAt: Date.now() + windowMin * MIN,
    };
    record(state, {
      machineId,
      event: 'PLANNED_STOP_DECLARED',
      wo: machine.active.wo,
      summary: `${actor.name} flagged an upcoming stop: ${reason.label}`
        + `${note.trim() ? ` — ${note.trim()}` : ''}. It will be classified automatically and not chased for a reason, `
        + `for the next ${windowMin} min.`,
    });
    return { ok: true, message: `Next stop is pre-classified as ${reason.label} — you will not be prompted` };
  }

  function clearPlannedStop(state, machineId) {
    const permitted = may(state, 'clearPlannedStop');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!machine.plannedStop) return { ok: false, reason: 'No planned stop is flagged' };
    const { label } = machine.plannedStop;
    machine.plannedStop = null;
    record(state, {
      machineId,
      event: 'PLANNED_STOP_CLEARED',
      wo: machine.active.wo,
      summary: `Planned stop (${label}) withdrawn — the next stoppage will be asked about as usual`,
    });
    return { ok: true, message: 'Withdrawn' };
  }

  /** Is a declared planned stop still live? */
  function livePlannedStop(machine, at = now()) {
    const planned = machine.plannedStop;
    if (!planned) return null;
    return planned.expiresAt > at ? planned : null;
  }

  /**
   * Consumes a live declaration when the collector reports the stop. An expired
   * one is discarded and the machine is asked as normal — a tool change flagged
   * two hours ago is not an explanation for a stop happening now.
   */
  function applyPlannedStop(state, machine) {
    const planned = livePlannedStop(machine);
    machine.plannedStop = null;
    if (!planned) return;

    machine.downtime = {
      code: planned.code,
      label: planned.label,
      owner: planned.owner,
      note: planned.note,
      startedAt: machine.stateSince,
      classifiedAt: Date.now(),
      classifiedBy: planned.declaredBy,
      preClassified: true,
    };
    record(state, {
      actor: 'Collector',
      role: 'System',
      machineId: machine.id,
      event: 'DOWNTIME_PRECLASSIFIED',
      wo: machine.active.wo,
      summary: `Stop classified on arrival as ${planned.label} — declared in advance by ${planned.declaredBy}`
        + `${planned.note ? ` — ${planned.note}` : ''}. Nobody was prompted.`,
    });
    openBlockerFor(state, machine, reasonByCode(planned.code), planned.note, planned.declaredBy);
  }



  // ------------------------------------------------ getting work onto a CNC ---

  const UNPLANNED_CATEGORIES = [
    { code: 'REWORK', label: 'Rework / salvage', note: 'Repairing parts from an existing order' },
    { code: 'TOOLING_TRIAL', label: 'Tooling or program trial', note: 'Proving a tool, offset or program change' },
    { code: 'FIXTURE', label: 'Fixture proving', note: 'Setting or checking a new fixture' },
    { code: 'SAMPLE', label: 'Sample or test piece', note: 'Quote sample, first article, R&D piece' },
    { code: 'MAINTENANCE', label: 'Maintenance or calibration', note: 'Warm-up, ballbar, service work' },
  ];

  const REMOVAL_REASONS = [
    'Moved to another machine',
    'Material or tooling not available',
    'Cancelled or put on hold in D365',
    'Superseded by a revision change',
    'Added to this machine in error',
    'Other',
  ];

  /**
   * Checks a released order against the machine it is about to be queued on.
   *
   * `blocking` stops the assignment outright. `warnings` do not — a machinist
   * often has a legitimate reason to deviate, and a system that refuses gets
   * worked around. Warnings are acknowledged and recorded instead.
   */
  function assignmentIssues(state, machine, order) {
    const blocking = [];
    const warnings = [];

    if (order.revisionStatus !== 'RELEASED') {
      blocking.push(`${order.rev} is not released in Bluestar. Running an unreleased revision is a quality escape — release it first.`);
    }
    if (order.routedResource && order.routedResource !== machine.id) {
      const routed = machineById(state, order.routedResource);
      warnings.push(`The D365 routing puts this on ${routed ? routed.name : order.routedResource}. Running it here is a routing deviation.`);
    }
    if (order.materialStatus === 'UNCONFIRMED') warnings.push('Material is not confirmed in D365.');
    if (order.materialStatus === 'SHORT') warnings.push('Material is short in D365.');
    if (order.inspectionHold) warnings.push('There is an open inspection hold on this order.');

    return { blocking, warnings, canAssign: blocking.length === 0 };
  }

  function readinessFromOrder(order, issues) {
    if (order.inspectionHold) return { ready: 'Inspection hold', readyCode: 'INSPECTION' };
    if (order.materialStatus !== 'READY') return { ready: 'Material not confirmed', readyCode: 'MATERIAL' };
    if (issues.warnings.length) return { ready: 'Routing deviation — accepted', readyCode: 'TOOLING' };
    return { ready: 'Material ready', readyCode: 'READY' };
  }

  /**
   * Puts a released D365 order onto a machine's executable queue.
   *
   * This does NOT create a production order. It records a local assignment of
   * an order that already exists in Dynamics 365, plus a queue position. See
   * docs/03 — quantity, due date, revision and priority remain D365's.
   */
  function addOrderToQueue(state, machineId, wo, position, acknowledged = false) {
    const permitted = may(state, 'addOrderToQueue');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const index = state.unassignedOrders.findIndex((o) => o.wo === wo);
    if (index < 0) return { ok: false, reason: `${wo} is not in the released, unassigned list` };

    const order = state.unassignedOrders[index];
    const issues = assignmentIssues(state, machine, order);
    if (!issues.canAssign) return { ok: false, reason: issues.blocking[0] };
    if (issues.warnings.length && !acknowledged) {
      return { ok: false, reason: 'Warnings must be acknowledged before this order can be queued', issues };
    }

    const before = queueWos(machine);
    state.unassignedOrders.splice(index, 1);
    const readiness = readinessFromOrder(order, issues);
    const job = {
      wo: order.wo,
      part: order.part,
      qty: order.qty,
      done: 0,
      cycleMedianMin: order.cycleMedianMin,
      cycleSigmaMin: order.cycleSigmaMin,
      setupMin: order.setupMin,
      program: order.program,
      requestedPriority: order.requestedPriority,
      dueAt: order.dueAt,
      rev: order.rev,
      source: 'D365',
      ...readiness,
    };
    const at = Math.max(1, Math.min(position ?? machine.queue.length + 1, machine.queue.length + 1));
    machine.queue.splice(at - 1, 0, job);

    record(state, {
      machineId,
      event: 'JOB_ADDED_TO_QUEUE',
      wo: order.wo,
      summary: `Added released order ${order.wo} (${order.part}, ${order.rev}) at position ${at}`
        + `${issues.warnings.length ? ` — accepted with: ${issues.warnings.join(' ')}` : ''}`,
      before,
      after: queueWos(machine),
    });
    return { ok: true, message: `${order.wo} queued at position ${at}` };
  }

  /**
   * Records unplanned work that has no production order — rework, a tooling
   * trial, a fixture proving run, a sample.
   *
   * This is the honest middle ground. It happens on every shop floor, and if
   * the system has no way to represent it the machine time simply disappears
   * from the record. It is deliberately NOT a production order: it never
   * reaches D365, it is badged as unplanned everywhere it appears, and it is
   * reported separately so the total is visible rather than buried.
   */
  function addUnplannedJob(state, machineId, input) {
    const permitted = may(state, 'addUnplannedJob');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const category = UNPLANNED_CATEGORIES.find((c) => c.code === input.category);
    if (!category) return { ok: false, reason: 'Pick what kind of work this is' };
    if (!input.description || !input.description.trim()) {
      return { ok: false, reason: 'Unplanned work needs a one-line description' };
    }
    if (!input.authorizedBy || !input.authorizedBy.trim()) {
      return { ok: false, reason: 'Unplanned work needs a name against it' };
    }

    const estimateMin = Math.max(1, Number(input.estimateMin) || 30);
    state.counters.unplanned += 1;
    const reference = `UNPLANNED-${String(state.counters.unplanned).padStart(3, '0')}`;
    const before = queueWos(machine);

    const job = {
      wo: reference,
      part: input.description.trim(),
      qty: 1,
      done: 0,
      cycleMedianMin: estimateMin,
      cycleSigmaMin: estimateMin * 0.25,
      setupMin: 5,
      program: '—',
      requestedPriority: 3,
      // Deliberately null. Unplanned work has no production order, so it has no
      // committed date — fabricating one from the estimate would make every
      // piece of rework read as a due-date breach the moment it overran.
      dueAt: null,
      source: 'UNPLANNED',
      unplanned: {
        category: category.code,
        categoryLabel: category.label,
        authorizedBy: input.authorizedBy.trim(),
        openedAt: Date.now(),
      },
      ready: `${category.label} — no work order`,
      readyCode: 'MATERIAL',
    };
    const at = Math.max(1, Math.min(input.position ?? machine.queue.length + 1, machine.queue.length + 1));
    machine.queue.splice(at - 1, 0, job);

    record(state, {
      machineId,
      event: 'UNPLANNED_JOB_ADDED',
      wo: reference,
      summary: `${category.label}: "${job.part}" (~${estimateMin} min) at position ${at}, authorised by ${job.unplanned.authorizedBy}. No production order — needs one attaching.`,
      before,
      after: queueWos(machine),
    });
    return { ok: true, message: `${reference} queued — it will show as unplanned until a work order is attached` };
  }

  /** Takes a job off a queue. D365 orders go back to the unassigned pool. */
  function removeFromQueue(state, machineId, wo, reason) {
    const permitted = may(state, 'removeFromQueue');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const index = machine.queue.findIndex((q) => q.wo === wo);
    if (index < 0) return { ok: false, reason: `${wo} is not in this queue` };
    if (!reason) return { ok: false, reason: 'A removal reason is required' };

    const before = queueWos(machine);
    const [job] = machine.queue.splice(index, 1);

    if (job.source !== 'UNPLANNED') {
      state.unassignedOrders.push({
        wo: job.wo,
        part: job.part,
        rev: job.rev ?? 'Rev —',
        qty: job.qty,
        // Carry the finished quantity with it. Dropping this loses real parts.
        done: job.done ?? 0,
        scrap: job.scrap ?? 0,
        cycleMedianMin: job.cycleMedianMin,
        cycleSigmaMin: job.cycleSigmaMin,
        setupMin: job.setupMin,
        program: job.program,
        requestedPriority: job.requestedPriority,
        dueAt: job.dueAt,
        routedResource: null,
        materialStatus: job.readyCode === 'MATERIAL' ? 'UNCONFIRMED' : 'READY',
        revisionStatus: 'RELEASED',
        inspectionHold: job.readyCode === 'INSPECTION',
      });
    }

    state.blockers
      .filter((b) => b.machineId === machineId && b.wo === wo && b.status !== 'CLOSED')
      .forEach((b) => {
        b.status = 'CLOSED';
        b.closedAt = Date.now();
        record(state, {
          actor: 'System',
          role: 'System',
          machineId,
          event: 'BLOCKER_CLOSED',
          wo,
          summary: `Closed the ${b.label} blocker automatically — ${wo} is no longer on this machine`,
        });
      });

    record(state, {
      machineId,
      event: 'JOB_REMOVED_FROM_QUEUE',
      wo,
      summary: `Removed ${wo} from the queue — ${reason}.`
        + `${job.source === 'UNPLANNED' ? ' Unplanned work, discarded.' : ' Returned to the unassigned released list.'}`
        + `${job.done ? ` It had ${job.done} of ${job.qty} finished.` : ''}`,
      before,
      after: queueWos(machine),
    });
    return { ok: true, message: `${wo} removed from ${machine.name}` };
  }

  /** Orders a machine could take on, best candidates first. */
  function assignableOrders(state, machine) {
    return state.unassignedOrders
      .map((order) => ({ order, issues: assignmentIssues(state, machine, order) }))
      .sort((a, b) => {
        const routedA = a.order.routedResource === machine.id ? 0 : 1;
        const routedB = b.order.routedResource === machine.id ? 0 : 1;
        if (routedA !== routedB) return routedA - routedB;
        return a.order.requestedPriority - b.order.requestedPriority;
      });
  }


  /**
   * The machinist's own time estimate for a prototype.
   *
   * Prototypes have no finalised process and no stored program, so there is
   * nothing to measure against. Rather than manufacture a number, the system
   * asks the person doing the work and then says whose number it is wherever
   * it appears. Revisions are audited so the estimate has a history.
   */
  function setMachinistEstimate(state, machineId, minutes, note = '') {
    const permitted = may(state, 'setMachinistEstimate');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'Give a time in minutes' };

    const actor = currentActor(state);
    const previous = machine.active.machinistEstimate;
    machine.active.programMode = 'PROTOTYPE';
    machine.active.machinistEstimate = {
      min: value, by: actor.name, at: Date.now(), note: note.trim(),
    };
    machine.active.cycleMedianMin = value;
    machine.active.cycleSigmaMin = value * 0.35;

    record(state, {
      machineId,
      event: previous ? 'PROTOTYPE_ESTIMATE_REVISED' : 'PROTOTYPE_ESTIMATE_SET',
      wo: machine.active.wo,
      summary: previous
        ? `Revised the prototype estimate for ${machine.active.wo} from ${previous.min} to ${value} min${note.trim() ? ` — ${note.trim()}` : ''}`
        : `Set a prototype estimate of ${value} min for ${machine.active.wo}${note.trim() ? ` — ${note.trim()}` : ''}`,
    });
    return { ok: true, message: `Estimate set to ${value} min` };
  }

  /** Promote a settled prototype to a finalised, tracked program. */
  function finaliseProcess(state, machineId) {
    const permitted = may(state, 'finaliseProcess');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (machine.active.programMode !== 'PROTOTYPE') return { ok: false, reason: 'This is not a prototype' };
    const measured = A.relevantCycles(machine);
    if (measured.length < 3) {
      return { ok: false, reason: `Only ${measured.length} cycle${measured.length === 1 ? '' : 's'} measured — run it a few more times before calling the process finalised` };
    }
    machine.active.programMode = 'FULL_PROGRAM';
    record(state, {
      machineId,
      event: 'PROCESS_FINALISED',
      wo: machine.active.wo,
      summary: `Marked the process for ${machine.active.wo} finalised after ${measured.length} measured cycles. Post and store the program to enable operation-level tracking.`,
    });
    return { ok: true, message: 'Process marked finalised' };
  }


  /**
   * Record scrap. A completed cycle is a cycle; it is only a good part if it
   * passes. Good quantity is what D365 needs, so the two are counted apart and
   * scrap moves one from good to scrap rather than vanishing.
   */
  function recordScrap(state, machineId, count, note = '') {
    const permitted = may(state, 'recordScrap');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 1) return { ok: false, reason: 'How many pieces?' };
    if (n > machine.active.done) {
      return { ok: false, reason: `Only ${machine.active.done} good piece${machine.active.done === 1 ? '' : 's'} recorded so far` };
    }
    machine.active.done -= n;
    machine.active.scrap = (machine.active.scrap ?? 0) + n;
    record(state, {
      machineId,
      event: 'SCRAP_RECORDED',
      wo: machine.active.wo,
      summary: `${n} piece${n === 1 ? '' : 's'} scrapped on ${machine.active.wo}`
        + `${note.trim() ? ` — ${note.trim()}` : ''}. Good quantity now ${machine.active.done} of ${machine.active.qty}.`,
    });
    return { ok: true, message: `${n} scrapped — good quantity now ${machine.active.done}` };
  }

  /** Release the first piece so the rest of the job can run. */
  function approveFirstOff(state, machineId, approved, note = '') {
    const permitted = may(state, 'approveFirstOff');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    if (!machine.active.awaitingFirstOff) return { ok: false, reason: 'No first article is waiting on this machine' };

    const actor = currentActor(state);
    machine.active.awaitingFirstOff = false;
    if (approved) {
      machine.active.firstOffApprovedAt = Date.now();
      machine.active.firstOffApprovedBy = actor.name;
      machine.downtime = null;
      setState(state, machine, 'PRODUCTION', { actor: actor.name, role: actor.role, detail: 'first article approved' });
      record(state, {
        machineId, event: 'FIRST_OFF_APPROVED', wo: machine.active.wo,
        summary: `First article on ${machine.active.wo} approved by ${actor.name}${note.trim() ? ` — ${note.trim()}` : ''}`,
      });
      return { ok: true, message: 'First article approved — running' };
    }
    machine.active.done = Math.max(0, machine.active.done - 1);
    machine.active.scrap = (machine.active.scrap ?? 0) + 1;
    record(state, {
      machineId, event: 'FIRST_OFF_REJECTED', wo: machine.active.wo,
      summary: `First article on ${machine.active.wo} rejected by ${actor.name}${note.trim() ? ` — ${note.trim()}` : ''}. `
        + 'Piece scrapped; the machine stays held until the setup is corrected.',
    });
    return { ok: true, message: 'First article rejected — machine stays held' };
  }

  // -------------------------------------------- direct machinist control ---

  /**
   * The machinist owns the approved executable queue (docs/05, step 4) and
   * reorders it directly — no request, no approval, nobody else's permission.
   * The change is still audited, because "attributable" and "needs approval"
   * are different things.
   */
  function reorderQueue(state, machineId, wo, direction) {
    const permitted = may(state, 'reorderQueue');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const from = machine.queue.findIndex((q) => q.wo === wo);
    if (from < 0) return { ok: false, reason: `${wo} is not in this queue` };

    const target = direction === 'top' ? 1 : direction === 'up' ? from : from + 2;
    const before = queueWos(machine);
    const result = moveInQueue(machine, wo, target);
    if (!result.ok) return { ok: false, reason: result.reason };

    record(state, {
      machineId,
      event: 'QUEUE_REORDERED',
      wo,
      summary: `Machinist moved ${wo} from position ${result.from} to ${result.to}`,
      before,
      after: queueWos(machine),
    });
    return { ok: true, message: `${wo} moved to position ${result.to}` };
  }

  /**
   * Switch the machine onto a different job now. The current job goes back to
   * the front of the queue with its completed quantity intact, so nothing is
   * lost — but its setup is abandoned, which is exactly the cost docs/05 warns
   * about, so it is recorded rather than glossed over.
   */
  function switchActiveJob(state, machineId, wo) {
    const permitted = may(state, 'switchActiveJob');
    if (!permitted.ok) return permitted;
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    const index = machine.queue.findIndex((q) => q.wo === wo);
    if (index < 0) return { ok: false, reason: `${wo} is not in this queue` };
    if (machine.active.wo === wo) return { ok: false, reason: `${wo} is already running` };
    // Swapping the job would end the stoppage as a side effect and the reason
    // would never be recorded. Make it explicit instead.
    if (A.BLOCKED_STATES.includes(machine.state) && !machine.downtime) {
      return {
        ok: false,
        reason: 'Classify the current stoppage first — switching jobs would close it with no reason recorded',
      };
    }

    const actor = currentActor(state);
    const before = queueWos(machine);
    const displaced = jobFromActive(machine);
    const setupLost = machine.state === 'SETUP'
      ? Math.max(0, machine.active.setupMin - machine.setupRemainingMin)
      : machine.active.setupMin;

    const [job] = machine.queue.splice(index, 1);
    machine.queue.unshift(displaced);
    machine.active = activeFromJob(job);
    machine.setupRemainingMin = job.setupMin;
    machine.cycleElapsedMin = 0;
    machine.cycleTargetMin = null;
    setState(state, machine, 'SETUP', { actor: actor.name, role: actor.role, detail: `switched to ${job.wo}` });

    record(state, {
      machineId,
      event: 'ACTIVE_JOB_SWITCHED',
      wo: job.wo,
      summary: `Switched to ${job.wo}. ${displaced.wo} returns to position 1 with ${displaced.done} of ${displaced.qty} complete; about ${Math.round(setupLost)} min of setup abandoned.`,
      before,
      after: queueWos(machine),
    });
    return { ok: true, message: `Now running ${job.wo} — ${displaced.wo} held at position 1` };
  }

  /**
   * Defer the downtime prompt without answering it. Deliberately possible: a
   * prompt that cannot be dismissed on a shop terminal is how the whole system
   * gets switched off. Deliberately recorded and re-raised: the stoppage still
   * counts as unclassified everywhere until someone answers.
   */
  function snoozeDowntimePrompt(state, machineId, seconds) {
    const machine = machineById(state, machineId);
    if (!machine) return { ok: false, reason: 'Unknown machine' };
    machine.promptSnoozedUntil = Date.now() + seconds * 1000;
    record(state, {
      machineId,
      event: 'DOWNTIME_PROMPT_DEFERRED',
      wo: machine.active.wo,
      summary: `Reason prompt deferred for ${seconds}s — stoppage remains unclassified`,
    });
    return { ok: true, message: `Asking again in ${seconds}s` };
  }

  /** Does this machine currently owe someone a downtime reason? */
  function needsDowntimeReason(state, machine) {
    return A.BLOCKED_STATES.includes(machine.state)
      && !machine.downtime
      && (now() - machine.stateSince) / 1000 >= state.config.downtimePromptSeconds;
  }

  /** Is the prompt due to be shown right now (not snoozed)? */
  function downtimePromptDue(state, machine) {
    if (!needsDowntimeReason(state, machine)) return false;
    return !machine.promptSnoozedUntil || machine.promptSnoozedUntil <= now();
  }

  function now() {
    return Date.now();
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
      /*
       * No collector, no data. When the link is down the platform receives
       * nothing, so nothing may advance — the last known values simply go
       * stale and are labelled as such. Continuing to increment counters
       * during an outage would be inventing production that may not have
       * happened, which is the single worst thing a visibility layer can do.
       */
      if (!machine.collector.online) return;
      machine.collector.lastEventAt = now;

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

        // Stand in for the controller reporting its current sequence number.
        if (machine.telemetry && machine.active.operations) {
          const fraction = machine.cycleElapsedMin / machine.cycleTargetMin;
          machine.telemetry.block = A.blockAtTimeFraction(machine.active.operations, fraction);
          const progress = A.operationProgress(machine);
          machine.telemetry.tool = progress && progress.current ? progress.current.tool : '—';
        }

        /*
         * A poll can span more than one cycle — a 30-second poll on a 12-second
         * part, or the demo clock at 15 min/s. Counting a single part per poll
         * silently loses the rest, so every completed cycle in the interval is
         * counted. This is the same trap in production: derive part count from
         * cycle events, not from "did it change since I last looked".
         */
        while (machine.cycleElapsedMin >= machine.cycleTargetMin) {
          machine.history.cycles.push({
            wo: machine.active.wo,
            program: machine.active.program,
            min: Number(machine.cycleTargetMin.toFixed(2)),
            at: now,
          });
          /*
           * A completed cycle is a cycle, not necessarily a good part. The
           * count of cycles run and the count of good parts are tracked
           * separately; scrap moves one from good to scrap. D365 wants good
           * quantity, and conflating the two overstates every job.
           */
          machine.active.cyclesRun = (machine.active.cyclesRun ?? machine.active.done) + 1;
          machine.active.done = Math.min(machine.active.qty, machine.active.done + 1);
          machine.cycleElapsedMin -= machine.cycleTargetMin;
          machine.cycleTargetMin = sampleCycleTarget(machine);
          if (machine.telemetry) machine.telemetry.block = 1;

          // First piece off a fresh setup goes to inspection before the rest.
          if (machine.active.firstOffRequired && !machine.active.firstOffApprovedAt) {
            machine.active.awaitingFirstOff = true;
            setState(state, machine, 'STOPPED', { detail: 'first piece awaiting inspection' });
            machine.downtime = {
              code: 'INSPECTION',
              label: 'Waiting for inspection',
              owner: 'Quality',
              note: `First piece off ${machine.active.wo} — held for first-article approval`,
              startedAt: now,
              classifiedAt: now,
              classifiedBy: 'System',
            };
            record(state, {
              actor: 'System', role: 'System', machineId: machine.id,
              event: 'FIRST_OFF_HELD', wo: machine.active.wo,
              summary: 'First piece complete — production held until the first article is approved',
            });
            return;
          }

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
              machine.active = activeFromJob(job);
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
        if (machine.cycleTargetMin == null) machine.cycleTargetMin = sampleCycleTarget(machine);

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
      return parsed.version === 3 ? parsed : null;
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
    reorderQueue,
    switchActiveJob,
    setMachinistEstimate,
    finaliseProcess,
    recordScrap,
    approveFirstOff,
    signIn,
    signOut,
    acknowledgeExpiry,
    unacknowledgedExpiries,
    may,
    PERMISSIONS,
    UNPLANNED_CATEGORIES,
    REMOVAL_REASONS,
    assignmentIssues,
    assignableOrders,
    addOrderToQueue,
    addUnplannedJob,
    removeFromQueue,
    snoozeDowntimePrompt,
    needsDowntimeReason,
    downtimePromptDue,
    setMachineRunning,
    flagPlannedStop,
    clearPlannedStop,
    livePlannedStop,
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
