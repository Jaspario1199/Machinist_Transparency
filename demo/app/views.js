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
  function section(state, key, title, meta, body, defaultOpen) {
    const stored = state.ui.sections[key];
    const open = stored === undefined ? defaultOpen : stored;
    return `<details class="section" data-section="${esc(key)}"${open ? ' open' : ''}>
      <summary><span>${esc(title)}</span><span class="meta">${esc(meta)}</span></summary>
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
      <div class="eta-basis">Based on ${esc(eta.basis.count)} ${esc(eta.basis.source)} cycles · median ${esc(eta.basis.median.toFixed(1))} min ± ${esc(eta.basis.sigma.toFixed(1))}</div>
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
        <div><div class="wo big">${esc(machine.active.wo)}</div><div class="muted">${esc(machine.active.part)}</div></div>
        <div class="right-align"><div class="muted">Requested priority (D365)</div><div><strong>${esc(priority)}</strong></div></div>
      </div>
      <div class="track big-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"
        aria-label="Quantity complete"><div class="bar" style="width:${p}%"></div></div>
      <div class="row muted"><span>${esc(machine.active.done)} of ${esc(machine.active.qty)} complete</span>
        <span>${esc(machine.active.qty - machine.active.done)} remaining · ${p}%</span></div>
      ${etaBlock(state, machine, now)}
      <div class="row muted small">
        <span>Due ${esc(dateTime(machine.active.dueAt))}</span>
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
  function queueList(state, machine, now, controls = false) {
    if (!machine.queue.length) return '<p class="empty">No queued work. The machine will go idle when the current job finishes.</p>';
    const projection = A.queueProjection(state, machine);
    const last = machine.queue.length - 1;

    return `<ol class="queue">${machine.queue.map((job, i) => {
      const proj = projection[i];
      const readyKind = job.readyCode === 'READY' ? 'ok' : 'warn';
      const partial = job.done ? `<span class="readiness warn">${esc(job.done)} of ${esc(job.qty)} already run</span>` : '';

      const rowControls = controls ? `<span class="qcontrols">
        <button class="qbtn" data-queue-move="up" data-wo="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-up"
          ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(job.wo)} up">▲</button>
        <button class="qbtn" data-queue-move="down" data-wo="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-down"
          ${i === last ? 'disabled' : ''} aria-label="Move ${esc(job.wo)} down">▼</button>
        <button class="btn small qnow" data-queue-run="${esc(job.wo)}" data-focus-key="q-${esc(job.wo)}-run">Run this now</button>
      </span>` : '';

      return `<li class="q">
        <span class="pos" aria-hidden="true">${i + 1}</span>
        <span class="qmain">
          <span class="wo">${esc(job.wo)} · ${esc(job.part)}</span>
          <span class="muted">${esc(job.qty)} pcs · ${esc(PRIORITY_LABELS[job.requestedPriority] ?? '—')}</span>
          <span class="readiness ${esc(readyKind)}">${esc(job.ready)}</span>
          ${partial}
        </span>
        <span class="qeta muted">${proj.blocked ? 'Blocked' : `finishes ${esc(A.formatClockRange({ blocked: false, lowMin: proj.lowMin, highMin: proj.highMin }, now))}`}</span>
        ${rowControls}
      </li>`;
    }).join('')}</ol>
    ${controls ? '<p class="muted small">You control this queue directly. Engineering and leadership can only request a change.</p>' : ''}`;
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

    return `${panelHead(state, machine, 'Machinist controls for this machine only', now, `<div class="head-actions">${controls.join('')}</div>`)}
      ${needsReason ? `<p class="banner urgent"><strong>Reason needed.</strong> ${esc(machine.name)} has been stopped
        ${Math.round((now - machine.stateSince) / 60000)} min with no cause recorded. It stays flagged here, on the machine
        button and on the leadership board until someone answers.
        <button class="btn small" data-act="open-downtime" data-focus-key="open-downtime">Give a reason</button></p>` : ''}
      ${otherMachinesNeedingReason(state, machine.id)}
      <div class="stats four">
        <div class="stat"><div class="label">Active job</div><div class="value">${esc(machine.active.wo)}</div></div>
        <div class="stat"><div class="label">Progress</div><div class="value">${pct(machine)}%<span class="unit"> · ${esc(machine.active.qty - machine.active.done)} left</span></div></div>
        <div class="stat"><div class="label">Advisory completion</div><div class="value small-value">${esc(A.formatRange(eta))}</div></div>
        <div class="stat"><div class="label">Awaiting your decision</div><div class="value">${pending}</div></div>
      </div>
      <div class="content">
        ${section(state, `m-job-${machine.id}`, 'Current job', `${pct(machine)}% complete`, jobCard(state, machine, now, true), true)}
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
        <div class="stat"><div class="label">Due-date risk</div><div class="value small-value ${esc(risk.level.toLowerCase())}-risk">${esc(risk.level)}</div></div>
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
    const unclassified = state.machines.filter((m) => S.needsDowntimeReason(state, m)).length;
    const blockers = state.blockers.filter((b) => b.status !== 'CLOSED').length;
    const atRisk = state.machines.filter((m) => A.dueDateRisk(state, m, now).level === 'HIGH').length;

    const tiles = [
      { label: 'Producing', value: producing },
      { label: 'Stopped or faulted', value: stopped, kind: stopped ? 'bad' : '' },
      { label: 'Awaiting machinist approval', value: pending, kind: pending ? 'warn' : '' },
      { label: 'Approved, not yet in effect', value: deferred, kind: deferred ? 'warn' : '' },
      { label: 'Open blockers', value: blockers, kind: blockers ? 'warn' : '' },
      { label: 'Jobs at due-date risk', value: atRisk, kind: atRisk ? 'bad' : '' },
      { label: 'Unclassified stoppages', value: unclassified, kind: unclassified ? 'bad' : '' },
      { label: 'Jobs queued', value: state.machines.reduce((a, m) => a + m.queue.length, 0) },
    ];
    return tiles.map((t) => `<div class="metric ${esc(t.kind ?? '')}">
      <div class="label">${esc(t.label)}</div><div class="value">${esc(t.value)}</div></div>`).join('');
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
    machinistPanel,
    engineerPanel,
    leadershipPanel,
    leadershipMetrics,
    auditTable,
    paretoChart,
    blockerList,
  };
}());
