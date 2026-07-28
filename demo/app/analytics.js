/**
 * Derived engineering values: advisory ETA ranges, confidence, leading risk,
 * and the shop analytics the engineering view needs.
 *
 * Everything in this file is a pure function of state. Nothing here mutates.
 *
 * Policy (docs/05, "ETA rule"): an ETA is an advisory RANGE with a stated
 * confidence and the leading risk. A single-point ETA is never produced,
 * because PMs read a single number as a commitment.
 */
(function () {
  const MIN = 60 * 1000;
  const BLOCKED_STATES = ['STOPPED', 'FAULT'];

  /** Reason codes that mean the *next* job cannot start cleanly. */
  const READINESS_RISK = {
    TOOLING: 'Tooling not ready for the next job',
    MATERIAL: 'Material not confirmed for the next job',
    INSPECTION: 'Inspection hold on the next job',
  };

  function median(values) {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function stdDev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Observed cycle statistics for the active work order, falling back to the
   * planned/standard values until enough real cycles exist. The fallback is
   * reported so the UI can say "planned" rather than implying measurement.
   */
  function cycleStats(machine) {
    const observed = machine.history.cycles
      .filter((c) => c.wo === machine.active.wo)
      .map((c) => c.min);

    if (observed.length < 3) {
      return {
        source: 'planned',
        count: observed.length,
        median: machine.active.cycleMedianMin,
        sigma: machine.active.cycleSigmaMin,
      };
    }
    const med = median(observed);
    return {
      source: 'observed',
      count: observed.length,
      median: med,
      sigma: Math.max(stdDev(observed), med * 0.02),
    };
  }

  function openBlockers(state, machineId) {
    return state.blockers.filter((b) => b.machineId === machineId && b.status !== 'CLOSED');
  }

  /**
   * Advisory completion range for the active job.
   *
   * Returns { blocked, lowMin, highMin, confidence, risk, basis }.
   * When blocked, no range is produced at all — an ETA through an unresolved
   * stoppage would be fiction.
   */
  function etaForActiveJob(state, machine) {
    const blockers = openBlockers(state, machine.id);
    const stats = cycleStats(machine);
    const remaining = Math.max(0, machine.active.qty - machine.active.done);

    if (BLOCKED_STATES.includes(machine.state)) {
      const reason = machine.downtime
        ? machine.downtime.label
        : 'Stoppage not yet classified';
      return {
        blocked: true,
        lowMin: null,
        highMin: null,
        confidence: 'None',
        risk: `Machine ${machine.state.toLowerCase()} — ${reason}`,
        basis: stats,
      };
    }

    if (remaining === 0) {
      return { blocked: false, lowMin: 0, highMin: 0, confidence: 'High', risk: 'Job complete', basis: stats };
    }

    const setup = machine.state === 'SETUP' ? machine.setupRemainingMin : 0;
    const low = setup + remaining * Math.max(0.2, stats.median - stats.sigma);
    const high = setup + remaining * (stats.median + stats.sigma) * (blockers.length ? 1.25 : 1);

    const cv = stats.median > 0 ? stats.sigma / stats.median : 1;
    let confidence = 'Low';
    if (stats.source === 'observed' && stats.count >= 8 && cv <= 0.08 && !blockers.length) confidence = 'High';
    else if (stats.count >= 3 && cv <= 0.2) confidence = 'Medium';

    return {
      blocked: false,
      lowMin: Math.round(low),
      highMin: Math.round(high),
      confidence,
      risk: leadingRisk(state, machine, { stats, cv, blockers }),
      basis: stats,
    };
  }

  /**
   * The single most important reason this ETA could be wrong. Shown instead of
   * a precise-looking number so the reader knows what to chase.
   */
  function leadingRisk(state, machine, ctx) {
    if (ctx.blockers.length) {
      const b = ctx.blockers[0];
      return `Open blocker: ${b.label} (${b.owner})`;
    }
    if (machine.state === 'SETUP') {
      return `Setup in progress — ${Math.round(machine.setupRemainingMin)} min remaining, not yet cutting`;
    }
    const nextJob = machine.queue[0];
    if (nextJob && READINESS_RISK[nextJob.readyCode]) {
      return `${READINESS_RISK[nextJob.readyCode]} (${nextJob.wo})`;
    }
    if (ctx.cv > 0.2) {
      return `Cycle time varies ±${Math.round(ctx.cv * 100)}% — range is wide`;
    }
    if (ctx.stats.source === 'planned') {
      return 'Based on planned cycle time — too few observed cycles yet';
    }
    if (!machine.collector.online) {
      return 'Collector offline — progress may be stale';
    }
    return 'No leading risk identified';
  }

  /**
   * Cumulative advisory ranges for the queued jobs, so a PM can see when the
   * third job down is realistically expected to finish rather than guessing.
   */
  function queueProjection(state, machine) {
    const active = etaForActiveJob(state, machine);
    let low = active.blocked ? null : active.lowMin;
    let high = active.blocked ? null : active.highMin;

    return machine.queue.map((job) => {
      if (low === null) return { wo: job.wo, blocked: true, lowMin: null, highMin: null };
      low += job.setupMin + job.qty * Math.max(0.2, job.cycleMedianMin - job.cycleSigmaMin);
      high += job.setupMin + job.qty * (job.cycleMedianMin + job.cycleSigmaMin);
      return { wo: job.wo, blocked: false, lowMin: Math.round(low), highMin: Math.round(high) };
    });
  }

  /** Is the active job projected to miss its due date? Used for leadership risk. */
  function dueDateRisk(state, machine, now) {
    const eta = etaForActiveJob(state, machine);
    if (eta.blocked) return { level: 'HIGH', text: 'Blocked — completion cannot be projected' };
    const latest = now + eta.highMin * MIN;
    if (latest > machine.active.dueAt) return { level: 'HIGH', text: 'Projected to finish after the due date' };
    if (latest > machine.active.dueAt - 4 * 60 * MIN) return { level: 'MEDIUM', text: 'Within four hours of the due date' };
    return { level: 'LOW', text: 'Projected to finish ahead of the due date' };
  }

  /** Downtime Pareto across the shift, largest loss first. */
  function downtimePareto(state, machineId, now) {
    const totals = new Map();
    state.machines
      .filter((m) => !machineId || m.id === machineId)
      .forEach((m) => {
        m.history.downtimes.forEach((d) => {
          const minutes = ((d.endedAt ?? now) - d.startedAt) / MIN;
          const cur = totals.get(d.code) ?? { code: d.code, label: d.label, owner: d.owner, minutes: 0, events: 0 };
          cur.minutes += minutes;
          cur.events += 1;
          totals.set(d.code, cur);
        });
        // An unclassified, still-open stoppage is itself a finding.
        if (BLOCKED_STATES.includes(m.state) && !m.downtime) {
          const minutes = (now - m.stateSince) / MIN;
          const cur = totals.get('UNCODED') ?? { code: 'UNCODED', label: 'Not yet classified', owner: '—', minutes: 0, events: 0 };
          cur.minutes += minutes;
          cur.events += 1;
          totals.set('UNCODED', cur);
        }
      });

    const rows = [...totals.values()].sort((a, b) => b.minutes - a.minutes);
    const total = rows.reduce((a, r) => a + r.minutes, 0) || 1;
    let running = 0;
    return rows.map((r) => {
      running += r.minutes;
      return { ...r, minutes: Math.round(r.minutes), share: r.minutes / total, cumulative: running / total };
    });
  }

  /** Histogram of observed cycle times for the active work order. */
  function cycleDistribution(machine, buckets = 8) {
    const values = machine.history.cycles.filter((c) => c.wo === machine.active.wo).map((c) => c.min);
    if (values.length < 2) return { values, bins: [], median: null, sigma: 0 };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const width = (hi - lo) / buckets || 1;
    const bins = Array.from({ length: buckets }, (_, i) => ({
      from: lo + i * width,
      to: lo + (i + 1) * width,
      count: 0,
    }));
    values.forEach((v) => {
      const idx = Math.min(buckets - 1, Math.floor((v - lo) / width));
      bins[idx].count += 1;
    });
    return { values, bins, median: median(values), sigma: stdDev(values) };
  }

  /** Percentage of shift time actually cutting. */
  function utilization(machine, shiftStart, now) {
    const cutting = machine.history.cycles
      .filter((c) => c.at >= shiftStart)
      .reduce((a, c) => a + c.min, 0);
    const elapsed = (now - shiftStart) / MIN;
    return elapsed > 0 ? Math.min(1, cutting / elapsed) : 0;
  }

  /**
   * Machine-tending candidate score (0–100).
   *
   * Long cycles, few operator interventions and low setup share make a machine
   * a good automation candidate. Inputs are returned alongside the score so an
   * engineer can argue with the weighting rather than trust a bare number.
   */
  function tendingScore(machine, shiftStart, now) {
    const cycles = machine.history.cycles.filter((c) => c.at >= shiftStart);
    const medianCycle = median(cycles.map((c) => c.min)) ?? machine.active.cycleMedianMin;
    const setupMin = machine.history.setups.reduce((a, s) => a + s.min, 0);
    const elapsed = Math.max(1, (now - shiftStart) / MIN);
    const setupShare = setupMin / elapsed;
    const interventionsPerHour = machine.history.interventions / Math.max(1, elapsed / 60);

    const cycleScore = Math.min(1, medianCycle / 15);
    const interventionScore = Math.max(0, 1 - interventionsPerHour / 2);
    const setupScore = Math.max(0, 1 - setupShare / 0.3);

    const score = Math.round(100 * (0.45 * cycleScore + 0.35 * interventionScore + 0.2 * setupScore));
    return {
      score,
      inputs: {
        medianCycleMin: Number(medianCycle.toFixed(1)),
        interventionsPerHour: Number(interventionsPerHour.toFixed(1)),
        setupSharePct: Math.round(setupShare * 100),
      },
    };
  }


  // --------------------------------------- in-cycle progress from the NC file ---

  /**
   * Where are we inside the current part?
   *
   * The controller reports the block (sequence) it is executing right now —
   * MTConnect exposes it, FANUC FOCAS exposes it via the running sequence
   * number, Okuma OSP exposes it. The CAMWorks operation list gives each
   * operation a block range and an estimated cut time. Put together, the block
   * number tells you which operation is running and — weighted by time, not by
   * block count — how far through the part you are.
   *
   * Weighting by TIME is the whole point. 500 blocks of rapids take seconds and
   * 500 blocks of a finish contour take minutes, so raw "block 1980 of 2960 =
   * 67%" would be badly wrong. Cumulative estimated minutes is right.
   *
   * The absolute accuracy of the CAM estimate barely matters here. It supplies
   * the SHAPE of the curve; `calibration` rescales the magnitude against what
   * this machine actually does, so the systematic optimism of any static
   * estimate cancels out after a few real cycles.
   */
  function operationProgress(machine) {
    const ops = machine.active.operations;
    if (!ops || !ops.length) return null;

    const totalEstMin = ops.reduce((a, o) => a + o.estMin, 0);
    const totalBlocks = ops[ops.length - 1].toBlock;
    const block = machine.telemetry ? machine.telemetry.block : 0;
    /**
     * 'PART' — the posted file makes one piece and is re-run per piece.
     * 'JOB'  — the posted file runs the whole quantity in one go.
     * The block number means a different thing in each case, so the scope is
     * carried on the job rather than assumed.
     */
    const scope = machine.active.programScope === 'JOB' ? 'JOB' : 'PART';

    if (!block) {
      return {
        ops, totalEstMin, totalBlocks, block: 0, scope,
        current: null, currentIndex: -1, withinOp: 0,
        elapsedEstMin: 0, percent: 0, remainingEstMin: totalEstMin,
        calibration: null, remainingMin: totalEstMin,
      };
    }

    let index = ops.findIndex((o) => block >= o.fromBlock && block <= o.toBlock);
    if (index < 0) index = block > totalBlocks ? ops.length - 1 : 0;
    const current = ops[index];

    const span = Math.max(1, current.toBlock - current.fromBlock);
    const withinOp = Math.min(1, Math.max(0, (block - current.fromBlock) / span));
    const elapsedEstMin = ops.slice(0, index).reduce((a, o) => a + o.estMin, 0) + withinOp * current.estMin;

    const calibration = programCalibration(machine, totalEstMin);
    const remainingEstMin = Math.max(0, totalEstMin - elapsedEstMin);

    return {
      ops,
      totalEstMin,
      totalBlocks,
      block,
      scope,
      current,
      currentIndex: index,
      withinOp,
      elapsedEstMin,
      percent: totalEstMin > 0 ? elapsedEstMin / totalEstMin : 0,
      remainingEstMin,
      calibration,
      remainingMin: remainingEstMin * (calibration ? calibration.factor : 1),
    };
  }

  /**
   * How wrong is the CAM estimate on this machine, measured?
   *
   * Returns null until there are enough observed cycles to say. This is what
   * turns a theoretical number into a trustworthy one without anyone having to
   * model accel/decel, look-ahead or feedrate override — the machine measures
   * all of that for us.
   */
  function programCalibration(machine, totalEstMin) {
    const observed = machine.history.cycles
      .filter((c) => c.wo === machine.active.wo)
      .map((c) => c.min);
    if (observed.length < 3 || !totalEstMin) return null;

    const actual = median(observed);
    return {
      samples: observed.length,
      estMin: totalEstMin,
      actualMin: actual,
      factor: actual / totalEstMin,
      variancePct: ((actual - totalEstMin) / totalEstMin) * 100,
    };
  }

  /**
   * The inverse: which block corresponds to a given fraction of cycle time.
   * The simulated collector uses this to report a plausible block number.
   */
  function blockAtTimeFraction(ops, fraction) {
    if (!ops || !ops.length) return 0;
    const totalEstMin = ops.reduce((a, o) => a + o.estMin, 0);
    let target = Math.min(1, Math.max(0, fraction)) * totalEstMin;
    for (const op of ops) {
      if (target <= op.estMin) {
        const within = op.estMin > 0 ? target / op.estMin : 0;
        return Math.round(op.fromBlock + within * (op.toBlock - op.fromBlock));
      }
      target -= op.estMin;
    }
    return ops[ops.length - 1].toBlock;
  }

  /** Formats a range as human text. Never returns a bare point estimate. */
  function formatRange(eta) {
    if (eta.blocked) return 'Blocked';
    if (eta.lowMin === 0 && eta.highMin === 0) return 'Complete';
    const fmt = (m) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
    if (Math.abs(eta.highMin - eta.lowMin) < 1) return `~${fmt(eta.lowMin)}`;
    return `${fmt(eta.lowMin)} – ${fmt(eta.highMin)}`;
  }

  function formatClockRange(eta, now) {
    if (eta.blocked) return 'Not projectable while blocked';
    const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${t(now + eta.lowMin * MIN)} – ${t(now + eta.highMin * MIN)}`;
  }

  window.MT_ANALYTICS = {
    BLOCKED_STATES,
    median,
    stdDev,
    cycleStats,
    openBlockers,
    etaForActiveJob,
    queueProjection,
    dueDateRisk,
    downtimePareto,
    cycleDistribution,
    utilization,
    tendingScore,
    operationProgress,
    programCalibration,
    blockAtTimeFraction,
    formatRange,
    formatClockRange,
  };
}());
