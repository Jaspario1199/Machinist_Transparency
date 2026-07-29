/**
 * View layer. Pure string rendering — no state mutation.
 *
 * Every interpolated value goes through esc(). The previous build defined an
 * escaping helper and applied it to exactly one value that could never be
 * user-controlled; that is corrected here so the same templates stay safe once
 * the data arrives from the planned API rather than a literal.
 */
(function () {
  const A = window.MT_ANALYTICS;
  const S = window.MT_STATE;
  const MIN = 60 * 1000;

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

  const PRIORITY_LABELS = { 1: 'P1 — Critical', 2: 'P2 — High', 3: 'P3 — Normal', 4: 'P4 — Low', 5: 'P5 — Filler' };
  const URGENCY_LABELS = { HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' };

  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateTime = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  function ago(ms, now) {
    const sec = Math.max(0, Math.round((now - ms) / 1000));
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
    return `${(sec / 3600).toFixed(1)}h ago`;
  }

  function pct(machine) {
    return machine.active.qty > 0 ? Math.round((machine.active.done / machine.active.qty) * 100) : 0;
  }

  function badge(text, kind) {
    return `<span class="badge ${esc(kind)}">${esc(text)}</span>`;
  }

  function stateBadge(machine) {
    return badge(machine.state, machine.state.toLowerCase());
  }

  function confidenceBadge(confidence) {
    const kind = { High: 'production', Medium: 'setup', Low: 'stopped', None: 'ready' }[confidence] ?? 'ready';
    return badge(`${confidence} confidence`, kind);
  }

  /**
   * Disclosure section whose open/closed state lives in the store, so a
   * re-render never discards what the user expanded.
   */
  function section(state, key, title, meta, body, defaultOpen, metaKind = '') {
    const stored = state.ui.sections[key];
    const open = stored === undefined ? defaultOpen : stored;
    return `<details class="section" data-section="${esc(key)}"${open ? ' open' : ''}>
      <summary><span>${esc(title)}</span><span class="meta ${esc(metaKind)}">${esc(meta)}</span></summary>
      <div class="section-body">${body}</div>
    </details>`;
  }

  function health(machine, now) {
    const h = S.collectorHealth(machine, now);
    const kind = { LIVE: 'ok', DELAYED: 'warn', STALE: 'bad' }[h.level];
    return `<span class="health ${esc(kind)}" title="${esc(machine.collector.protocol)} collector">
      <span class="dot" aria-hidden="true"></span>${esc(h.text)}</span>`;
  }

  // ------------------------------------------------------------ ETA block ---

  /**
   * States where the numbers came from.
   *
   * A cold-start job has no measured cycles, so the figure is the standard from
   * the D365 routing — which is a different kind of claim from "we have watched
   * this run 34 times". Saying "based on 0 planned cycles" would have been
   * both meaningless and quietly misleading.
   */
  function basisText(basis) {
    if (basis.source === 'machinist') {
      return basis.count === 0
        ? `Not measured — ${basis.median.toFixed(0)} min is ${basis.estimatedBy}'s estimate for this prototype`
        : `${basis.count} cycle${basis.count === 1 ? '' : 's'} measured so far — still using ${basis.estimatedBy}'s ${basis.median.toFixed(0)} min estimate`;
    }
    if (basis.source === 'planned') {
      return basis.count === 0
        ? `No cycles observed yet — using the ${basis.median.toFixed(1)} min standard from the D365 routing`
        : `Only ${basis.count} cycle${basis.count === 1 ? '' : 's'} observed — still using the ${basis.median.toFixed(1)} min routing standard`;
    }
    return `Measured from ${basis.count} observed cycles · median ${basis.median.toFixed(1)} min ± ${basis.sigma.toFixed(1)}`;
  }

  function etaBlock(state, machine, now) {
    const eta = A.etaForActiveJob(state, machine);
    if (eta.blocked) {
      return `<div class="eta blocked">
        <div class="eta-range">Not projectable</div>
        <div class="eta-detail">${esc(eta.risk)}</div>
      </div>`;
    }
    return `<div class="eta">
      <div class="eta-range">${esc(A.formatRange(eta))}</div>
      <div class="eta-detail">${esc(A.formatClockRange(eta, now))} · ${confidenceBadge(eta.confidence)}</div>
      <div class="eta-risk"><strong>Leading risk:</strong> ${esc(eta.risk)}</div>
      <div class="eta-basis">${esc(basisText(eta.basis))}</div>
      <p class="advisory">Advisory range — not an official schedule. The committed date lives in Dynamics 365.</p>
    </div>`;
  }

  // -------------------------------------------------------- machine strip ---

  function machineStrip(state, now) {
    return state.machines.map((m) => {
      const selected = m.id === state.selected;
      const pendingCount = state.requests.filter((r) => r.machineId === m.id && r.status === 'PENDING').length;
      const deferredCount = state.requests.filter((r) => r.machineId === m.id && r.status === 'APPROVED_AFTER_CURRENT').length;
      const needsReason = S.needsDowntimeReason(state, m);

      const flags = [];
      if (needsReason) flags.push('<span class="flag urgent">Reason needed</span>');
      if (pendingCount) flags.push(`<span class="flag">${pendingCount} to approve</span>`);
      if (deferredCount) flags.push(`<span class="flag deferred">${deferredCount} deferred</span>`);
      if (!flags.length) flags.push(`<span class="flag quiet">${m.queue.length} queued</span>`);

      return `<button class="machine${selected ? ' selected' : ''}" data-machine="${esc(m.id)}"
        aria-pressed="${selected}" data-focus-key="machine-${esc(m.id)}">
        <span class="row"><span class="name">${esc(m.name)}</span>${stateBadge(m)}</span>
        <span class="wo">${esc(m.active.wo)}</span>
        <span class="muted">${esc(m.active.part)}</span>
        <span class="progress-line"><span class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          aria-valuenow="${pct(m)}" aria-label="${esc(m.name)} progress"><span class="bar" style="width:${pct(m)}%"></span></span>
          <span class="muted">${pct(m)}%</span></span>
        <span class="flags">${flags.join('')}</span>
        <span class="muted small">${health(m, now)}</span>
      </button>`;
    }).join('');
  }

  // --------------------------------------------------------------- pieces ---

  function jobCard(state, machine, now, technical) {
    const p = pct(machine);
    const priority = PRIORITY_LABELS[machine.active.requestedPriority] ?? '—';
    return `<div class="job">
      <div class="row">
        <div><div class="wo big">${esc(machine.active.wo)}</div><div class="muted">${esc(machine.active.part)}</div>
          ${machine.active.unplanned ? `<div class="unplanned-badge">Unplanned · ${esc(machine.active.unplanned.categoryLabel)} · no work order</div>` : ''}</div>
        <div class="right-align"><div class="muted">Requested priority (D365)</div><div><strong>${esc(priority)}</strong></div></div>
      </div>
      <div class="track big-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"
        aria-label="Quantity complete"><div class="bar" style="width:${p}%"></div></div>
      <div class="row muted"><span>${esc(machine.active.done)} of ${esc(machine.active.qty)} complete</span>
        <span>${esc(machine.active.qty - machine.active.done)} remaining · ${p}%</span></div>
      ${/*
        * Good quantity and cycles run are two different numbers, and the gap
        * between them is scrap. Counting a completed cycle as a good part is
        * how a job reports 100% and then ships short. Scrap moves a piece from
        * good to scrapped rather than deleting it, so the machine time stays
        * visible in the cycle history that feeds the ETA.
        */''}
      ${machine.active.scrap ? `<div class="row muted small"><span class="scrap-count">${esc(machine.active.scrap)}
        scrapped · ${esc((machine.active.cyclesRun ?? machine.active.done + machine.active.scrap))} cycles run</span></div>` : ''}
      ${technical ? '<div class="row"><button class="btn" data-act="record-scrap" data-focus-key="record-scrap">Record scrap</button></div>' : ''}
      ${etaBlock(state, machine, now)}
      <div class="row muted small">
        <span>${machine.active.dueAt == null ? 'No committed due date' : `Due ${esc(dateTime(machine.active.dueAt))}`}</span>
        <span>Updated ${esc(ago(machine.collector.lastEventAt, now))}</span>
      </div>
      ${technical ? `<div class="row muted small tech">
        <span>Program ${esc(machine.active.program)}</span>
        <span>${esc(machine.controller)}</span>
        <span>${esc(machine.active.path)}</span>
      </div>` : ''}
    </div>`;
  }

  /**
   * The approved executable queue.
   *
   * `controls` is on for the machinist only. They own this queue (docs/05,
   * step 4) and reorder it directly — everyone else has to ask.
   */
  /**
   * In-cycle progress: which operation is running and how far through the part.
   *
   * This is derived entirely from data the controller already reports (the
   * executing block number) plus the CAMWorks operation list. Nothing is typed
   * in by anyone.
   */
  /** One-line in-cycle position for the stat row. */
  function inCycleSummary(machine) {
    if (machine.active.programMode === 'PROTOTYPE') return 'Prototype';
    const p = A.operationProgress(machine);
    if (!p) return 'No op list';
    if (machine.state !== 'PRODUCTION' || !p.current) return `${p.ops.length} ops planned`;
    return `Op ${p.current.seq}/${p.ops.length} · ${Math.round(p.percent * 100)}%`;
  }

  /**
   * A prototype has no finalised process to track against, so the panel says
   * exactly that and shows whose estimate is being used.
   */
  function prototypePanel(machine, proto) {
    const e = proto.estimate;
    const measured = proto.measuredCount >= 3
      ? `<p class="notice ok">${esc(proto.measuredCount)} cycles measured so far, median
          ${esc(proto.measuredMedian.toFixed(1))} min — that is now driving the completion range instead of the estimate.
          When the process is settled, mark it finalised and post the program to get operation-level tracking.</p>`
      : `<p class="notice">${esc(proto.measuredCount)} cycle${proto.measuredCount === 1 ? '' : 's'} measured.
          After three the measured median takes over from the estimate automatically.</p>`;

    return `<p class="banner warn"><strong>Prototype — process not finalised.</strong>
        There is no posted, stored program to track against, so nothing here claims to know which operation is running.
        The completion range uses the machinist's own estimate and says so.</p>
      ${e ? `<div class="op-headline">
          <div>
            <div class="label">Machinist estimate</div>
            <div class="op-name">${esc(e.min)} min per piece</div>
            <div class="muted small">Given by ${esc(e.by)} at ${esc(time(e.at))}</div>
          </div>
          <div class="right-align">
            <button class="btn" data-act="set-estimate" data-focus-key="set-estimate">Update estimate</button>
          </div>
        </div>
        ${e.note ? `<blockquote class="note">${esc(e.note)}</blockquote>` : ''}`
        : `<p class="empty">No estimate yet.
            <button class="btn" data-act="set-estimate" data-focus-key="set-estimate">Give an estimate</button></p>`}
      ${measured}
      <div class="queue-footer">
        <button class="btn primary" data-act="finalise-process" data-focus-key="finalise-process">Mark the process finalised</button>
        <span class="muted small">Once the process is settled and the full program is posted and stored, this job gets
          operation-level progress like any finalised part.</span>
      </div>`;
  }

  /** Summary line for the operations section header. */
  function operationMeta(machine) {
    if (machine.active.programMode === 'PROTOTYPE') return 'prototype — machinist estimate';
    const p = A.operationProgress(machine);
    if (!p) return 'no operation list';
    if (machine.state !== 'PRODUCTION' || !p.current) return `${p.ops.length} operations planned`;
    return `op ${p.current.seq} of ${p.ops.length} · ${Math.round(p.percent * 100)}% through the part`;
  }

  function operationStrip(machine) {
    const proto = A.prototypeState(machine);
    if (proto) return prototypePanel(machine, proto);

    const p = A.operationProgress(machine);
    if (!p) {
      return `<p class="empty">No operation list for ${esc(machine.active.wo)}. Attach the CAMWorks operation list
        to see which operation is running and how far through the part the machine is.</p>`;
    }

    const cutting = machine.state === 'PRODUCTION';
    const calib = p.calibration;
    const library = machine.active.program ? (window.MT_STATE_LIBRARY ?? {})[machine.active.program] : null;

    const header = p.current && cutting
      ? `<div class="op-headline">
          <div>
            <div class="label">Operation ${esc(p.current.seq)} of ${esc(p.ops.length)}</div>
            <div class="op-name">${esc(p.current.name)}</div>
            <div class="muted small">${esc(p.current.tool)} · block ${esc(p.block.toLocaleString())} of ${esc(p.totalBlocks.toLocaleString())}</div>
          </div>
          <div class="right-align">
            <div class="label">${p.scope === 'JOB' ? 'Through the whole job' : 'Through this part'}</div>
            <div class="op-percent">${Math.round(p.percent * 100)}%</div>
            <div class="muted small">~${esc(p.remainingMin.toFixed(1))} min left ${p.scope === 'JOB' ? 'on the whole job' : 'on this piece'}</div>
          </div>
        </div>`
      : `<p class="notice">${cutting ? 'Waiting for the first block of the cycle.' : `Not cutting — the operation list below is the plan for ${esc(machine.active.wo)}.`}</p>`;

    const rows = p.ops.map((op, i) => {
      const state = !cutting || p.currentIndex < 0 ? 'pending'
        : i < p.currentIndex ? 'done'
          : i === p.currentIndex ? 'active' : 'pending';
      const fill = state === 'done' ? 100 : state === 'active' ? Math.round(p.withinOp * 100) : 0;
      const status = null;
      return `<li class="op ${esc(state)}">
        <span class="op-seq" aria-hidden="true">${esc(op.seq)}</span>
        <span class="op-main">
          <span class="op-title">${esc(op.name)}</span>
          <span class="muted small">${esc(op.tool)} · blocks ${esc(op.fromBlock.toLocaleString())}–${esc(op.toBlock.toLocaleString())}</span>
          <span class="track op-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}"
            aria-label="${esc(op.name)} progress"><span class="bar" style="width:${fill}%"></span></span>
        </span>
        <span class="op-est muted">${esc(op.estMin.toFixed(1))} min est</span>
      </li>`;
    }).join('');

    const calibration = calib
      ? `<p class="notice ${Math.abs(calib.variancePct) > 15 ? 'warn' : 'ok'}">
          <strong>CAM estimate vs measured:</strong> CAMWorks says ${esc(calib.estMin.toFixed(1))} min,
          this machine actually runs ${esc(calib.actualMin.toFixed(1))} min —
          ${calib.variancePct >= 0 ? '+' : ''}${esc(calib.variancePct.toFixed(0))}% over ${esc(calib.samples)} cycles.
          Remaining time above is rescaled by that factor, so the estimate corrects itself.</p>`
      : `<p class="notice">Fewer than three measured cycles for ${esc(machine.active.wo)} — remaining time is still the raw
          CAMWorks estimate. It rescales itself against measured runs once there are enough.</p>`;

    return `${header}
      <ol class="ops">${rows}</ol>
      ${calibration}
      <p class="muted small">${p.scope === 'JOB'
        ? 'This posted file runs the whole quantity in one go, so the figures above are for the entire job.'
        : 'This posted file makes one piece and is re-run for each. The figures above are for the piece being cut now.'}</p>
      ${library ? `<p class="muted small">Stored program <code>${esc(machine.active.program)}</code> ${esc(library.rev)} —
        ${esc(library.lifetimeRuns.toLocaleString())} run${library.lifetimeRuns === 1 ? '' : 's'} across
        ${esc(library.jobs)} job${library.jobs === 1 ? '' : 's'} <strong>shop-wide, all machines</strong>.
        The estimates above are not drawn from that figure: they use the
        ${esc(A.relevantCycles(machine).length)} cycle${A.relevantCycles(machine).length === 1 ? '' : 's'} of this program
        measured on ${esc(machine.name)} itself, because the same program on a different spindle and fixture
        is a different cycle time.</p>` : ''}
      <p class="muted small">Source: ${esc(machine.active.camSource ?? 'CAM operation list')} ·
        live block number from the ${esc(machine.collector.protocol)} collector. Read-only; nothing is sent to the machine.</p>`;
  }

  function queueList(state, machine, now, controls = false) {
    if (!machine.queue.length) {
      return `<p class="empty">No queued work. The machine will go idle when the current job finishes.</p>
        ${controls ? '<div class="queue-footer"><button class="btn primary" data-act="add-job" data-focus-key="add-job">Add work to this machine</button></div>' : ''}`;
    }
    const projection = A.queueProjection(state, machine);
    const last = machine.queue.length - 1;

    return `<ol class="queue">${machine.queue.map((job, i) => {
      const proj = projection[i];
      const readyKind = job.readyCode === 'READY' ? 'ok' : 'warn';
      const partial = job.done ? `<span class="readiness warn">${esc(job.done)} of ${esc(job.qty)} already run</span>` : '';
      const unplanned = job.source === 'UNPLANNED'
        ? `<span class="unplanned-badge">Unplanned · ${esc(job.unplanned.categoryLabel)} · no work order</span>`
        : '';

      // "Move to top" exists because a nine-deep queue otherwise needs eight
      // presses to promote the last job, and on a wall terminal that is how a
      // machinist ends up not reordering at all. It is distinct from "Run this
      // now", which interrupts the current job rather than queueing next.
      const rowControls = controls ? `<span class="qcontrols">
        <button class="qbtn" data-queue-move="top" data-wo="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-top"
          ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(job.wo)} to the top of the queue"
          title="Move to the top of the queue">⤒</button>
        <button class="qbtn" data-queue-move="up" data-wo="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-up"
          ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(job.wo)} up">▲</button>
        <button class="qbtn" data-queue-move="down" data-wo="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-down"
          ${i === last ? 'disabled' : ''} aria-label="Move ${esc(job.wo)} down">▼</button>
        <button class="btn small qnow" data-queue-run="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-run">Run this now</button>
        <button class="qbtn" data-queue-remove="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-remove"
          aria-label="Remove ${esc(job.wo)} from this queue">✕</button>
      </span>` : '';

      return `<li class="q">
        <span class="pos" aria-hidden="true">${i + 1}</span>
        <span class="qmain">
          <span class="wo">${esc(job.wo)} · ${esc(job.part)}</span>
          <span class="muted">${esc(job.qty)} pcs · ${esc(PRIORITY_LABELS[job.requestedPriority] ?? '—')}</span>
          <span class="readiness ${esc(readyKind)}">${esc(job.ready)}</span>
          ${unplanned}
          ${partial}
        </span>
        <span class="qeta muted">${proj.blocked ? 'Blocked' : `finishes ${esc(A.formatClockRange({ blocked: false, lowMin: proj.lowMin, highMin: proj.highMin }, now))}`}</span>
        ${rowControls}
      </li>`;
    }).join('')}</ol>
    ${controls ? `<div class="queue-footer">
      <button class="btn primary" data-act="add-job" data-focus-key="add-job">Add work to this machine</button>
      <span class="muted small">You control this queue directly. Engineering and leadership can only request a change.</span>
    </div>` : ''}`;
  }

  /** The large one-tap reason buttons, shared by the panel and the popup. */
  function reasonGrid() {
    return `<div class="reasons">${window.DOWNTIME_REASONS.map((r) => `
      <button class="btn reason" data-reason="${esc(r.code)}" data-focus-key="reason-${esc(r.code)}"
        title="${esc(r.definition)}">
        <span class="reason-label">${esc(r.label)}</span>
        <span class="reason-owner">${esc(r.owner)}${r.noteRequired ? ' · note required' : ''}</span>
      </button>`).join('')}</div>`;
  }

  function requestCard(state, request, showControls) {
    const kind = {
      PENDING: 'setup',
      APPROVED: 'production',
      APPROVED_REPOSITIONED: 'production',
      APPROVED_AFTER_CURRENT: 'deferred',
      REJECTED: 'stopped',
      EXPIRED: 'ready',
    }[request.status] ?? 'ready';

    const decision = request.decision
      ? `<div class="muted small">${esc(request.decision.action === 'reject' ? 'Rejected' : 'Decided')} by ${esc(request.decision.by)} at ${esc(time(request.decision.at))}${request.decision.rejectionReason ? ` — ${esc(request.decision.rejectionReason)}` : ''}</div>`
      : '';

    const deferredNotice = request.status === 'APPROVED_AFTER_CURRENT'
      ? '<p class="notice warn">Approved but <strong>not yet in effect</strong> — the queue changes when the current job completes.</p>'
      : '';

    // An approval that lapsed says so on the request itself, not only in the
    // audit trail. Until somebody acknowledges it, it also counts on the
    // leadership tiles — an approval that silently did nothing is worse than a
    // rejection, because the requester believes it happened.
    const expiredNotice = request.status === 'EXPIRED'
      ? `<p class="notice urgent"><strong>This approval never took effect.</strong>
          ${esc(request.expiredReason ?? 'The work order was no longer in the queue when the current job finished')}.
          The queue was not changed. Submit a new request if the move is still needed.
          ${request.expiryAcknowledged
            ? '<br><span class="muted small">Acknowledged.</span>'
            : `<br><button class="btn small" data-ack-expiry="${esc(request.id)}"
                 data-focus-key="ack-${esc(request.id)}">Acknowledge</button>`}</p>`
      : '';

    return `<article class="request">
      <div class="row">
        <div>
          <div class="wo">Move ${esc(request.wo)} → position ${esc(request.toPos)}</div>
          <div class="muted">${esc(request.reason)} · ${esc(URGENCY_LABELS[request.urgency] ?? request.urgency)} urgency · ${esc(S.TIMING_LABELS[request.timing] ?? request.timing)}</div>
          <div class="muted small">Requested by ${esc(request.requestedBy.name)} (${esc(request.requestedBy.role)}) ${esc(time(request.createdAt))}</div>
        </div>
        ${badge(request.status.replace(/_/g, ' '), kind)}
      </div>
      ${request.note ? `<blockquote class="note">${esc(request.note)}</blockquote>` : ''}
      ${deferredNotice}
      ${expiredNotice}
      ${decision}
      ${showControls && request.status === 'PENDING' ? `<div class="request-actions">
        <button class="btn good decision" data-request="${request.id}" data-action="approve" data-focus-key="req-${request.id}-approve">Approve now</button>
        <button class="btn decision" data-request="${request.id}" data-action="defer" data-focus-key="req-${request.id}-defer">Approve after current job</button>
        <button class="btn decision" data-request="${request.id}" data-action="counter" data-focus-key="req-${request.id}-counter">Propose another position</button>
        <button class="btn bad decision" data-request="${request.id}" data-action="reject" data-focus-key="req-${request.id}-reject">Reject</button>
      </div>` : ''}
    </article>`;
  }

  function requestList(state, machine, showControls) {
    const rows = state.requests.filter((r) => r.machineId === machine.id);
    if (!rows.length) return '<p class="empty">No queue-change requests for this machine.</p>';
    return rows.slice().reverse().map((r) => requestCard(state, r, showControls)).join('');
  }

  function downtimePanel(state, machine, now) {
    if (!A.BLOCKED_STATES.includes(machine.state)) {
      return '<p class="empty">Machine is running. No downtime input needed.</p>';
    }
    const stoppedSec = Math.round((now - machine.stateSince) / 1000);
    const threshold = state.config.downtimePromptSeconds;

    if (machine.downtime) {
      return `<div class="classified">
        <p class="notice ok">Classified as <strong>${esc(machine.downtime.label)}</strong> — routed to ${esc(machine.downtime.owner)}.</p>
        ${machine.downtime.note ? `<blockquote class="note">${esc(machine.downtime.note)}</blockquote>` : ''}
        <p class="muted small">Recorded by ${esc(machine.downtime.classifiedBy)} at ${esc(time(machine.downtime.classifiedAt))} · stopped ${Math.round(stoppedSec / 60)} min</p>
      </div>`;
    }

    if (stoppedSec < threshold) {
      return `<p class="notice">Stopped ${stoppedSec}s ago. No reason is requested until ${threshold}s — short pauses and tool changes are not chased.</p>`;
    }

    const snoozed = machine.promptSnoozedUntil && machine.promptSnoozedUntil > now;
    return `<div class="downtime-prompt">
      <p class="notice urgent">Stopped ${Math.round(stoppedSec / 60)} min and still unclassified. Select a reason — one tap.
        ${machine.alarm ? `Controller reports <strong>${esc(machine.alarm)}</strong>.` : ''}
        ${snoozed ? `<br>Prompt deferred — asking again in ${Math.ceil((machine.promptSnoozedUntil - now) / 1000)}s.` : ''}</p>
      ${reasonGrid()}
    </div>`;
  }

  function blockerList(state, machineId) {
    const rows = state.blockers.filter((b) => (!machineId || b.machineId === machineId) && b.status !== 'CLOSED');
    if (!rows.length) return '<p class="empty">No open blockers.</p>';
    return `<div class="blockers">${rows.map((b) => `
      <article class="blocker">
        <div class="row">
          <div><div class="wo">${esc(b.label)}</div>
            <div class="muted">${esc(b.wo)} · owner: <strong>${esc(b.owner)}</strong> · opened ${esc(time(b.openedAt))} by ${esc(b.openedBy)}</div></div>
          ${badge(b.status, b.status === 'OPEN' ? 'stopped' : 'setup')}
        </div>
        ${b.note ? `<blockquote class="note">${esc(b.note)}</blockquote>` : ''}
        <div class="request-actions">
          ${b.status === 'OPEN' ? `<button class="btn small blocker-action" data-blocker="${b.id}" data-status="ACKNOWLEDGED" data-focus-key="blk-${b.id}-ack">Acknowledge</button>` : ''}
          <button class="btn small good blocker-action" data-blocker="${b.id}" data-status="CLOSED" data-focus-key="blk-${b.id}-close">Close blocker</button>
        </div>
      </article>`).join('')}</div>`;
  }

  // ------------------------------------------------------------- analytics ---

  function paretoChart(rows) {
    if (!rows.length) return '<p class="empty">No downtime recorded this shift.</p>';
    const max = rows[0].minutes || 1;
    return `<div class="chart pareto">${rows.map((r) => `
      <div class="pareto-row">
        <div class="pareto-label">${esc(r.label)}<span class="muted"> · ${esc(r.owner)}</span></div>
        <div class="pareto-bar"><div class="fill" style="width:${Math.round((r.minutes / max) * 100)}%"></div></div>
        <div class="pareto-value">${esc(r.minutes)} min<span class="muted"> · ${Math.round(r.share * 100)}%</span></div>
      </div>`).join('')}</div>`;
  }

  function histogram(dist) {
    if (!dist.bins.length) return '<p class="empty">Not enough observed cycles yet for a distribution.</p>';
    const max = Math.max(...dist.bins.map((b) => b.count)) || 1;
    return `<div class="chart histogram" role="img"
      aria-label="Cycle time distribution, median ${dist.median.toFixed(1)} minutes">
      ${dist.bins.map((b) => `<div class="hbar">
        <div class="hfill" style="height:${Math.round((b.count / max) * 100)}%"><span class="hcount">${b.count || ''}</span></div>
        <div class="hlabel">${b.from.toFixed(1)}</div>
      </div>`).join('')}
    </div>
    <p class="muted small">Median ${esc(dist.median.toFixed(2))} min · standard deviation ${esc(dist.sigma.toFixed(2))} min · ${esc(dist.values.length)} cycles observed</p>`;
  }

  function engineeringAnalytics(state, machine, now) {
    const dist = A.cycleDistribution(machine);
    const pareto = A.downtimePareto(state, machine.id, now);
    const tending = A.tendingScore(machine, state.shiftStart, now);
    const util = A.utilization(machine, state.shiftStart, now);
    const setups = machine.history.setups;
    const standard = machine.active.cycleMedianMin;
    const actual = dist.median;
    const variance = actual ? ((actual - standard) / standard) * 100 : 0;

    return `
      <div class="stats four">
        <div class="stat"><div class="label">Spindle utilisation (shift)</div><div class="value">${Math.round(util * 100)}%</div></div>
        <div class="stat"><div class="label">Actual vs standard cycle</div><div class="value">${actual ? `${variance >= 0 ? '+' : ''}${variance.toFixed(1)}%` : '—'}</div></div>
        <div class="stat"><div class="label">Operator interventions</div><div class="value">${esc(machine.history.interventions)}</div></div>
        <div class="stat"><div class="label">Tending candidate score</div><div class="value">${esc(tending.score)}<span class="unit">/100</span></div></div>
      </div>
      ${section(state, `eng-dist-${machine.id}`, 'Cycle-time distribution', `${dist.values.length} cycles`, histogram(dist), true)}
      ${section(state, `eng-pareto-${machine.id}`, 'Downtime Pareto', `${pareto.length} causes`, paretoChart(pareto), true)}
      ${section(state, `eng-setup-${machine.id}`, 'Setup history', `${setups.length} setups`,
        setups.length
          ? `<table class="table"><thead><tr><th>Work order</th><th>Actual</th><th>When</th></tr></thead><tbody>${setups.map((s) => `<tr><td>${esc(s.wo)}</td><td>${esc(s.min)} min</td><td>${esc(time(s.at))}</td></tr>`).join('')}</tbody></table>`
          : '<p class="empty">No setups recorded this shift.</p>', false)}
      ${section(state, `eng-tending-${machine.id}`, 'Machine-tending candidate detail', `score ${tending.score}`,
        `<table class="table"><tbody>
          <tr><td>Median cycle</td><td>${esc(tending.inputs.medianCycleMin)} min</td><td class="muted">Longer cycles favour unattended running</td></tr>
          <tr><td>Interventions per hour</td><td>${esc(tending.inputs.interventionsPerHour)}</td><td class="muted">Each intervention blocks lights-out operation</td></tr>
          <tr><td>Setup share of shift</td><td>${esc(tending.inputs.setupSharePct)}%</td><td class="muted">High changeover reduces the automation payback</td></tr>
        </tbody></table>
        <p class="muted small">Weighting: 45% cycle length, 35% intervention rate, 20% setup share. Inputs are shown so the weighting can be argued with.</p>`, false)}`;
  }

  // ------------------------------------------------------------ audit log ---

  function auditTable(state, machineId, limit) {
    let rows = state.audit.slice().sort((a, b) => b.at - a.at);
    if (machineId) rows = rows.filter((r) => r.machineId === machineId);
    if (limit) rows = rows.slice(0, limit);
    if (!rows.length) return '<p class="empty">No audit records yet.</p>';

    return `<div class="table-scroll"><table class="table audit">
      <thead><tr><th>Time</th><th>Actor</th><th>Event</th><th>Work order</th><th>Detail</th><th>Queue before → after</th><th>ETA impact</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="nowrap">${esc(dateTime(r.at))}</td>
        <td class="nowrap">${esc(r.actor)}<div class="muted small">${esc(r.role)}</div></td>
        <td class="nowrap"><code>${esc(r.event)}</code></td>
        <td class="nowrap">${esc(r.wo ?? '—')}</td>
        <td>${esc(r.summary)}</td>
        <td class="muted small">${r.before ? `${esc(r.before.join(' › '))}<br>→ ${esc((r.after ?? r.before).join(' › '))}` : '—'}</td>
        <td class="nowrap">${r.etaImpactMin === null || r.etaImpactMin === undefined ? '—' : `${r.etaImpactMin > 0 ? '+' : ''}${esc(Math.round(r.etaImpactMin))} min`}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ---------------------------------------------------------------- panels ---

  function panelHead(state, machine, subtitle, now, actionHtml) {
    return `<div class="panel-head">
      <div>
        <h3>${esc(machine.name)}</h3>
        <div class="muted">${esc(subtitle)}</div>
        <div class="muted small">${esc(machine.model)} · ${esc(machine.controller)} · ${health(machine, now)}</div>
      </div>
      <div class="panel-head-right">${stateBadge(machine)}${actionHtml ?? ''}</div>
    </div>`;
  }

  /** Flags other machines owing a reason, so nothing hides behind the selection. */
  function otherMachinesNeedingReason(state, selectedId) {
    const others = state.machines.filter((m) => m.id !== selectedId && S.needsDowntimeReason(state, m));
    if (!others.length) return '';
    return `<p class="banner warn">Also waiting on a reason: ${others.map((m) =>
      `<button class="btn small" data-select-machine="${esc(m.id)}" data-focus-key="jump-${esc(m.id)}">${esc(m.name)}</button>`).join(' ')}</p>`;
  }

  function machinistPanel(state, machine, now) {
    const pending = state.requests.filter((r) => r.machineId === machine.id && r.status === 'PENDING').length;
    const deferred = state.requests.filter((r) => r.machineId === machine.id && r.status === 'APPROVED_AFTER_CURRENT').length;
    const eta = A.etaForActiveJob(state, machine);
    const needsReason = S.needsDowntimeReason(state, machine);
    const openBlockers = A.openBlockers(state, machine.id).length;

    const controls = [];
    if (machine.state === 'SETUP') controls.push('<button class="btn primary" data-act="complete-setup" data-focus-key="complete-setup">Setup complete — start cutting</button>');
    if (machine.state === 'READY') controls.push('<button class="btn primary" data-act="start-next" data-focus-key="start-next">Start next job</button>');
    if (A.BLOCKED_STATES.includes(machine.state)) controls.push('<button class="btn good" data-act="resume" data-focus-key="resume">Resume machine</button>');
    else controls.push('<button class="btn bad" data-act="stop" data-focus-key="stop">Stop machine</button>');

    /*
     * First-article hold. The machine stops itself after the first piece on a
     * job that needs one, and stays stopped until somebody says the piece is
     * good. This is a hold, not a stoppage to be explained away: it is the one
     * downtime the shop wants, so it is surfaced as its own decision rather
     * than left to the generic reason grid.
     */
    const firstOff = machine.active.awaitingFirstOff
      ? `<p class="banner urgent"><strong>First article waiting.</strong> The first piece off
          ${esc(machine.active.wo)} is complete and production is held until it is measured.
          <button class="btn good" data-act="first-off-approve" data-focus-key="first-off-approve">Approve — run the rest</button>
          <button class="btn bad" data-act="first-off-reject" data-focus-key="first-off-reject">Reject — scrap and hold</button></p>`
      : '';

    return `${panelHead(state, machine, 'Machinist controls for this machine only', now, `<div class="head-actions">${controls.join('')}</div>`)}
      ${firstOff}
      ${needsReason ? `<p class="banner urgent"><strong>Reason needed.</strong> ${esc(machine.name)} has been stopped
        ${Math.round((now - machine.stateSince) / 60000)} min with no cause recorded. It stays flagged here, on the machine
        button and on the leadership board until someone answers.
        <button class="btn small" data-act="open-downtime" data-focus-key="open-downtime">Give a reason</button></p>` : ''}
      ${otherMachinesNeedingReason(state, machine.id)}
      <div class="stats five">
        <div class="stat"><div class="label">Active job</div><div class="value">${esc(machine.active.wo)}</div></div>
        <div class="stat"><div class="label">Progress</div><div class="value">${pct(machine)}%<span class="unit"> · ${esc(machine.active.qty - machine.active.done)} left</span></div></div>
        <div class="stat"><div class="label">Advisory completion</div><div class="value small-value">${esc(A.formatRange(eta))}</div></div>
        <div class="stat"><div class="label">In this part</div><div class="value small-value">${esc(inCycleSummary(machine))}</div></div>
        <div class="stat"><div class="label">Awaiting your decision</div><div class="value">${pending}</div></div>
      </div>
      <div class="content">
        ${section(state, `m-job-${machine.id}`, 'Current job', `${pct(machine)}% complete`, jobCard(state, machine, now, true), true)}
        ${section(state, `m-ops-${machine.id}`, 'Operations in this part', operationMeta(machine), operationStrip(machine), true)}
        ${section(state, `m-queue-${machine.id}`, 'Approved executable queue', `${machine.queue.length} queued${deferred ? ` · ${deferred} deferred change pending` : ''}`, queueList(state, machine, now, true), true)}
        ${section(state, `m-req-${machine.id}`, 'Queue-change requests', `${pending} to approve`, requestList(state, machine, true), pending > 0 || deferred > 0)}
        ${section(state, `m-down-${machine.id}`, 'Downtime and exceptions', machine.downtime ? machine.downtime.label : machine.state, downtimePanel(state, machine, now), A.BLOCKED_STATES.includes(machine.state))}
        ${section(state, `m-blk-${machine.id}`, 'Open blockers', `${openBlockers} open`, blockerList(state, machine.id), openBlockers > 0)}
        ${section(state, `m-audit-${machine.id}`, 'This machine’s history', 'audit trail', auditTable(state, machine.id, 25), false)}
      </div>`;
  }

  function engineerPanel(state, machine, now) {
    const pending = state.requests.filter((r) => r.machineId === machine.id && r.status === 'PENDING').length;
    const eta = A.etaForActiveJob(state, machine);
    return `${panelHead(state, machine, 'Engineering detail — read only. The queue is machinist-controlled.', now,
      '<button class="btn primary" data-act="request" data-focus-key="panel-request">Request queue change</button>')}
      <div class="stats four">
        <div class="stat"><div class="label">State</div><div class="value">${esc(machine.state)}</div></div>
        <div class="stat"><div class="label">Active job</div><div class="value">${esc(machine.active.wo)}</div></div>
        <div class="stat"><div class="label">Advisory completion</div><div class="value small-value">${esc(A.formatRange(eta))}</div></div>
        <div class="stat"><div class="label">Pending requests</div><div class="value">${pending}</div></div>
      </div>
      <div class="content">
        ${section(state, `e-job-${machine.id}`, 'Current status', 'read only', jobCard(state, machine, now, true), true)}
        ${section(state, `e-ops-${machine.id}`, 'Operations in this part', operationMeta(machine), operationStrip(machine), true)}
        ${section(state, `e-analytics-${machine.id}`, 'Process analytics', 'shift to date', engineeringAnalytics(state, machine, now), true)}
        ${section(state, `e-queue-${machine.id}`, 'Approved executable queue', 'machinist controlled', queueList(state, machine, now), false)}
        ${section(state, `e-req-${machine.id}`, 'Request history', `${pending} pending`, requestList(state, machine, false), false)}
        ${section(state, `e-blk-${machine.id}`, 'Blockers', `${A.openBlockers(state, machine.id).length} open`, blockerList(state, machine.id), false)}
        ${section(state, `e-audit-${machine.id}`, 'Audit trail', 'this machine', auditTable(state, machine.id, 40), false)}
      </div>`;
  }

  function leadershipPanel(state, machine, now) {
    const eta = A.etaForActiveJob(state, machine);
    const risk = A.dueDateRisk(state, machine, now);
    const blockers = A.openBlockers(state, machine.id);
    return `${panelHead(state, machine, 'Leadership summary — read only', now,
      '<button class="btn primary" data-act="request" data-focus-key="panel-request">Request priority change</button>')}
      <div class="stats four">
        <div class="stat"><div class="label">State</div><div class="value">${esc(machine.state)}</div></div>
        <div class="stat"><div class="label">Advisory completion</div><div class="value small-value">${esc(A.formatRange(eta))}</div></div>
        <div class="stat"><div class="label">Due-date risk</div><div class="value small-value ${esc(risk.level.toLowerCase())}-risk">${esc(risk.level === 'NONE' ? 'N/A' : risk.level)}</div></div>
        <div class="stat"><div class="label">Open blockers</div><div class="value">${blockers.length}</div></div>
      </div>
      <div class="content">
        <p class="banner">${esc(risk.text)}${blockers.length ? ` · Waiting on ${esc(blockers.map((b) => b.owner).join(', '))}` : ''}</p>
        ${section(state, `l-job-${machine.id}`, 'Current status', 'read only', jobCard(state, machine, now, false), true)}
        ${section(state, `l-queue-${machine.id}`, 'Approved executable queue', 'machinist controlled', queueList(state, machine, now), true)}
        ${section(state, `l-blk-${machine.id}`, 'Blockers and owners', `${blockers.length} open`, blockerList(state, machine.id), blockers.length > 0)}
        ${section(state, `l-req-${machine.id}`, 'Request history', 'decisions and outcomes', requestList(state, machine, false), false)}
        ${section(state, `l-audit-${machine.id}`, 'Audit trail', 'who changed what, when', auditTable(state, machine.id, 40), true)}
      </div>`;
  }

  function leadershipMetrics(state, now) {
    const producing = state.machines.filter((m) => m.state === 'PRODUCTION').length;
    const stopped = state.machines.filter((m) => A.BLOCKED_STATES.includes(m.state)).length;
    const pending = state.requests.filter((r) => r.status === 'PENDING').length;
    const deferred = state.requests.filter((r) => r.status === 'APPROVED_AFTER_CURRENT').length;
    const lapsed = S.unacknowledgedExpiries(state).length;
    const unclassified = state.machines.filter((m) => S.needsDowntimeReason(state, m)).length;
    const blockers = state.blockers.filter((b) => b.status !== 'CLOSED').length;
    const atRisk = state.machines.filter((m) => A.dueDateRisk(state, m, now).level === 'HIGH').length;
    const unplannedCount = state.machines.reduce((a, m) =>
      a + m.queue.filter((q) => q.source === 'UNPLANNED').length + (m.active.unplanned ? 1 : 0), 0);

    const tiles = [
      { label: 'Producing', value: producing },
      { label: 'Stopped or faulted', value: stopped, kind: stopped ? 'bad' : '' },
      { label: 'Awaiting machinist approval', value: pending, kind: pending ? 'warn' : '' },
      { label: 'Approved, not yet in effect', value: deferred, kind: deferred ? 'warn' : '' },
      { label: 'Open blockers', value: blockers, kind: blockers ? 'warn' : '' },
      { label: 'Jobs at due-date risk', value: atRisk, kind: atRisk ? 'bad' : '' },
      { label: 'Unclassified stoppages', value: unclassified, kind: unclassified ? 'bad' : '' },
      { label: 'Approvals that lapsed', value: lapsed, kind: lapsed ? 'bad' : '' },
      { label: 'Jobs queued', value: state.machines.reduce((a, m) => a + m.queue.length, 0) },
      { label: 'Unplanned work, no order', value: unplannedCount, kind: unplannedCount ? 'warn' : '' },
      { label: 'Released, not yet on a machine', value: state.unassignedOrders.length },
    ];

    /*
     * The tiles live behind a disclosure, below the machines.
     *
     * Eleven aggregate counts above the machine strip made the first thing a
     * viewer saw a dashboard rather than a shop. The machines are the product;
     * the counts are context for them.
     *
     * Collapsing them is only safe because nothing urgent depends on the grid
     * being open. A stoppage nobody has explained, an approval that lapsed and
     * a request waiting on a decision are the whole point of the board, and
     * they stay legible in two places without opening anything: the summary
     * line names them in red, and the machine cards above carry the same flags
     * per machine. The grid is the detail behind that, so it starts closed and
     * stays wherever the viewer leaves it.
     */
    const outstanding = [
      unclassified && `${unclassified} unclassified stoppage${unclassified === 1 ? '' : 's'}`,
      lapsed && `${lapsed} approval${lapsed === 1 ? '' : 's'} lapsed`,
      pending && `${pending} awaiting your machinists`,
      atRisk && `${atRisk} at due-date risk`,
      blockers && `${blockers} open blocker${blockers === 1 ? '' : 's'}`,
    ].filter(Boolean);

    const grid = `<div class="metrics">${tiles.map((t) => `<div class="metric ${esc(t.kind ?? '')}">
      <div class="label">${esc(t.label)}</div><div class="value">${esc(t.value)}</div></div>`).join('')}</div>`;

    return section(
      state,
      'shop-overview',
      'Shop overview',
      outstanding.length ? outstanding.join(' · ') : 'nothing outstanding',
      grid,
      false,
      outstanding.length ? 'meta-bad' : '',
    );
  }

  window.MT_VIEWS = {
    esc,
    PRIORITY_LABELS,
    time,
    dateTime,
    ago,
    pct,
    machineStrip,
    reasonGrid,
    queueList,
    operationStrip,
    machinistPanel,
    engineerPanel,
    leadershipPanel,
    leadershipMetrics,
    auditTable,
    paretoChart,
    blockerList,
  };
}());
