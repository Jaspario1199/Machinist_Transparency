/**
 * Wiring: rendering loop, simulated telemetry clock, role tabs, dialogs and
 * export.
 *
 * Accessibility approach: the two modals are native <dialog> elements opened
 * with showModal(), so focus trapping, Escape handling, background inertness
 * and focus restoration are provided by the platform rather than reimplemented
 * badly. Role switching uses real tablist semantics with roving tabindex.
 *
 * Re-render preserves both the expanded/collapsed state of every disclosure
 * section and keyboard focus, so a live telemetry tick never yanks the page
 * out from under someone.
 */
(function () {
  const S = window.MT_STATE;
  const V = window.MT_VIEWS;
  const A = window.MT_ANALYTICS;

  const $ = (id) => document.getElementById(id);
  const ROLES = ['machinist', 'engineer', 'leadership'];

  const ROLE_COPY = {
    machinist: {
      title: 'Machinist workspace',
      help: 'Pick your CNC. Everything below applies to that machine only.',
      choose: 'Choose your CNC',
      chooseHelp: 'The selected machine opens below.',
    },
    engineer: {
      title: 'Engineer / PM visibility',
      help: 'Read-only machine detail and process analytics. Queue changes go through a request.',
      choose: 'View a CNC',
      chooseHelp: 'Machine details are read-only.',
    },
    leadership: {
      title: 'Leadership overview',
      help: 'Status, risk and decision history. Priority changes are requested, never applied directly.',
      choose: 'View a CNC',
      chooseHelp: 'Use a request for any proposed priority change.',
    },
  };

  let state = S.load() ?? S.createStore();
  let simTimer = null;
  let toastTimer = null;

  // ------------------------------------------------------------- utilities ---

  function toast(message, kind = '') {
    const el = $('toast');
    clearTimeout(toastTimer);
    el.className = `toast ${kind}`;
    el.textContent = message;
    el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  function commit(result, successMessage) {
    if (result && result.ok === false) {
      toast(result.reason, 'bad');
      return false;
    }
    if (successMessage || (result && result.message)) {
      toast((result && result.message) || successMessage, 'ok');
    }
    S.save(state);
    render();
    return true;
  }

  // -------------------------------------------------------------- rendering ---

  function captureFocus() {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    if (el.closest('dialog')) return null;
    return el.dataset ? el.dataset.focusKey ?? null : null;
  }

  function restoreFocus(key) {
    if (!key) return;
    const target = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
    if (target) target.focus({ preventScroll: true });
  }

  function render() {
    const now = Date.now();
    window.MT_STATE_LIBRARY = state.programLibrary;
    const focusKey = captureFocus();
    const machine = S.selectedMachine(state);
    state.selected = machine.id;
    const copy = ROLE_COPY[state.role];

    $('title').textContent = copy.title;
    $('help').textContent = copy.help;
    $('chooseTitle').textContent = copy.choose;
    $('chooseHelp').textContent = copy.chooseHelp;
    $('actorName').textContent = `${S.currentActor(state).name} — ${S.currentActor(state).title}`;

    ROLES.forEach((role) => {
      const tab = document.querySelector(`[data-role="${role}"]`);
      const selected = role === state.role;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('active', selected);
    });

    const metrics = $('metrics');
    metrics.hidden = state.role !== 'leadership';
    if (state.role === 'leadership') metrics.innerHTML = V.leadershipMetrics(state, now);

    $('machines').innerHTML = V.machineStrip(state, now);

    const panel = $('panel');
    if (state.role === 'machinist') panel.innerHTML = V.machinistPanel(state, machine, now);
    else if (state.role === 'engineer') panel.innerHTML = V.engineerPanel(state, machine, now);
    else panel.innerHTML = V.leadershipPanel(state, machine, now);

    const shopAudit = $('shopAudit');
    shopAudit.hidden = state.role !== 'leadership';
    if (state.role === 'leadership') $('shopAuditBody').innerHTML = V.auditTable(state, null, 60);

    bindSections();
    restoreFocus(focusKey);
  }

  function bindSections() {
    document.querySelectorAll('details[data-section]').forEach((el) => {
      el.addEventListener('toggle', () => {
        state.ui.sections[el.dataset.section] = el.open;
      });
    });
  }

  // --------------------------------------------------------------- dialogs ---

  /**
   * Small generic form dialog. Returns a promise resolving to the selected
   * value, or null when cancelled.
   */
  function ask({ title, description, fields, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const dialog = $('promptDialog');
      $('promptTitle').textContent = title;
      $('promptDescription').textContent = description ?? '';
      $('promptDescription').hidden = !description;
      $('promptFields').innerHTML = fields.map((f) => {
        if (f.type === 'select') {
          return `<label class="full"><span>${V.esc(f.label)}</span>
            <select name="${V.esc(f.name)}">${f.options.map((o) => `<option value="${V.esc(o.value)}">${V.esc(o.label)}</option>`).join('')}</select></label>`;
        }
        if (f.type === 'textarea') {
          return `<label class="full"><span>${V.esc(f.label)}</span>
            <textarea name="${V.esc(f.name)}" placeholder="${V.esc(f.placeholder ?? '')}"></textarea></label>`;
        }
        return `<p class="muted">${V.esc(f.label)}</p>`;
      }).join('');
      $('promptConfirm').textContent = confirmLabel;
      $('promptConfirm').className = `btn ${danger ? 'bad' : 'primary'}`;

      const form = $('promptForm');
      const onClose = () => {
        form.removeEventListener('submit', onSubmit);
        dialog.removeEventListener('close', onCancel);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        onClose();
        dialog.close();
        resolve(data);
      };
      const onCancel = () => { onClose(); resolve(null); };

      form.addEventListener('submit', onSubmit);
      dialog.addEventListener('close', onCancel, { once: true });
      dialog.showModal();
    });
  }



  // -------------------------------------------------------- adding work ---

  /**
   * "Add work to this machine" has two doors, because a shop has two kinds of
   * work and pretending otherwise just pushes one of them off the record.
   *
   *   Released work order — the normal path. Picks an order that ALREADY EXISTS
   *   in Dynamics 365 and records which machine will run it, in what order.
   *   Nothing here creates or edits a production order; that stays D365's job
   *   (docs/01 non-goals, docs/03 boundaries).
   *
   *   Unplanned work — rework, a tooling trial, a fixture proving run, a
   *   sample. No production order exists. It is recorded so the machine time is
   *   visible, badged as unplanned everywhere, counted separately for
   *   leadership, and never sent to D365.
   */
  let addJobSelection = null;

  function openAddJobDialog() {
    const machine = S.selectedMachine(state);
    addJobSelection = null;
    $('addJobSubtitle').textContent = `${machine.name} · ${machine.queue.length} already queued`;
    setAddJobSource('released');
    renderAddJobDialog();
    $('addJobDialog').showModal();
  }

  function setAddJobSource(source) {
    const released = source === 'released';
    $('releasedPane').hidden = !released;
    $('unplannedPane').hidden = released;
    $('sourceReleased').setAttribute('aria-selected', String(released));
    $('sourceUnplanned').setAttribute('aria-selected', String(!released));
    $('sourceReleased').classList.toggle('active', released);
    $('sourceUnplanned').classList.toggle('active', !released);
  }

  function positionOptions(machine) {
    return Array.from({ length: machine.queue.length + 1 }, (_, i) =>
      `<option value="${i + 1}"${i === machine.queue.length ? ' selected' : ''}>Position ${i + 1}${i === 0 ? ' — next up' : ''}${i === machine.queue.length ? ' — end of queue' : ''}</option>`).join('');
  }

  function renderAddJobDialog() {
    const machine = S.selectedMachine(state);
    const candidates = S.assignableOrders(state, machine);

    $('releasedList').innerHTML = candidates.length ? candidates.map(({ order, issues }) => {
      const flags = [];
      if (order.routedResource === machine.id) flags.push('<span class="flag">Routed here</span>');
      issues.warnings.forEach((w) => flags.push(`<span class="flag deferred">${V.esc(w.split('.')[0])}</span>`));
      issues.blocking.forEach(() => flags.push('<span class="flag urgent">Cannot be queued</span>'));

      return `<button type="button" class="order${addJobSelection === order.wo ? ' selected' : ''}"
        data-order="${V.esc(order.wo)}" aria-pressed="${addJobSelection === order.wo}"
        ${issues.canAssign ? '' : 'disabled'}>
        <span class="row"><strong>${V.esc(order.wo)} · ${V.esc(order.part)}</strong>
          <span class="muted">${V.esc(V.PRIORITY_LABELS[order.requestedPriority] ?? '—')}</span></span>
        <span class="muted">${V.esc(order.rev)} · ${V.esc(order.qty)} pcs · ~${V.esc(order.cycleMedianMin)} min/pc
          · ${V.esc(order.setupMin)} min setup · due ${V.esc(V.dateTime(order.dueAt))}</span>
        <span class="order-flags">${flags.join('')}</span>
      </button>`;
    }).join('') : '<p class="empty">No released orders are waiting to be assigned.</p>';

    $('addJobPosition').innerHTML = positionOptions(machine);
    $('unplannedPosition').innerHTML = positionOptions(machine);
    $('unplannedCategory').innerHTML = S.UNPLANNED_CATEGORIES.map((c) =>
      `<option value="${V.esc(c.code)}">${V.esc(c.label)} — ${V.esc(c.note)}</option>`).join('');
    $('unplannedEstimate').innerHTML = [15, 30, 45, 60, 90, 120, 240]
      .map((m) => `<option value="${m}"${m === 30 ? ' selected' : ''}>${m} minutes</option>`).join('');
    $('unplannedAuthorisedBy').innerHTML = ['R. Delgado (machinist)', 'Shop-floor supervisor', 'T. Okafor (manufacturing engineering)', 'Quality', 'Maintenance']
      .map((n) => `<option>${V.esc(n)}</option>`).join('');

    const selected = candidates.find(({ order }) => order.wo === addJobSelection);
    const issuesBox = $('assignIssues');
    if (!selected) {
      issuesBox.innerHTML = '';
      $('addJobConfirm').disabled = true;
      return;
    }
    issuesBox.innerHTML = selected.issues.warnings.length
      ? `<p class="notice warn"><strong>Before you add this:</strong><br>${selected.issues.warnings.map(V.esc).join('<br>')}
         <br><br>You can still run it here. Adding it records that you accepted these.</p>`
      : '<p class="notice ok">No conflicts — routed here, material confirmed, revision released.</p>';
    $('addJobConfirm').disabled = false;
  }

  function confirmAddOrder() {
    if (!addJobSelection) return;
    const result = S.addOrderToQueue(state, state.selected, addJobSelection, Number($('addJobPosition').value), true);
    if (result.ok === false) { toast(result.reason, 'bad'); return; }
    $('addJobDialog').close();
    commit(result);
  }

  function confirmAddUnplanned(event) {
    event.preventDefault();
    const result = S.addUnplannedJob(state, state.selected, {
      category: $('unplannedCategory').value,
      description: $('unplannedDescription').value,
      estimateMin: Number($('unplannedEstimate').value),
      authorizedBy: $('unplannedAuthorisedBy').value,
      position: Number($('unplannedPosition').value),
    });
    if (result.ok === false) { toast(result.reason, 'bad'); return; }
    $('addJobDialog').close();
    $('unplannedDescription').value = '';
    commit(result);
  }

  async function handleRemoveFromQueue(wo) {
    const answer = await ask({
      title: `Remove ${wo} from this queue?`,
      description: 'A released order goes back to the unassigned list and can be put on another machine. Unplanned work is discarded.',
      fields: [{
        type: 'select',
        name: 'reason',
        label: 'Why is it coming off?',
        options: S.REMOVAL_REASONS.map((r) => ({ value: r, label: r })),
      }],
      confirmLabel: 'Remove from queue',
      danger: true,
    });
    if (!answer) return;
    commit(S.removeFromQueue(state, state.selected, wo, answer.reason));
  }

  // ------------------------------------------------------ downtime popup ---

  /**
   * The stoppage prompt is a real popup, not a panel someone has to notice.
   *
   * It is dismissible on purpose: a prompt that cannot be cleared on a shop
   * terminal is how the whole system gets switched off (risk R-01/R-04). It is
   * also re-raised on purpose — deferring is recorded, the machine keeps its
   * "Reason needed" flag, and leadership keeps counting the stoppage as
   * unclassified until somebody answers.
   */
  function renderDowntimeDialog(machine) {
    const stoppedMin = Math.round((Date.now() - machine.stateSince) / 60000);
    $('downtimeSubtitle').textContent =
      `${machine.name} · ${machine.active.wo} · stopped ${stoppedMin} min. One tap is enough.`;
    const alarm = $('downtimeAlarm');
    alarm.hidden = !machine.alarm;
    if (machine.alarm) alarm.textContent = `Controller reports ${machine.alarm}.`;
    $('downtimeReasons').innerHTML = V.reasonGrid();
  }

  function maybeRaiseDowntimeDialog() {
    const dialog = $('downtimeDialog');
    const machine = S.selectedMachine(state);

    if (state.role !== 'machinist' || !S.downtimePromptDue(state, machine)) {
      if (dialog.open) dialog.close();
      return;
    }
    // Never fight another dialog the user is already in the middle of.
    if ($('requestDialog').open || $('promptDialog').open || $('addJobDialog').open) return;

    renderDowntimeDialog(machine);
    if (!dialog.open) dialog.showModal();
  }

  // ------------------------------------------------------- request dialog ---

  let requestDraftMachine = null;

  function openRequestDialog(machineId) {
    requestDraftMachine = machineId ?? state.selected;
    renderRequestDialog();
    $('requestDialog').showModal();
  }

  function renderRequestDialog() {
    const machine = S.machineById(state, requestDraftMachine);
    const picker = $('requestMachines');
    picker.innerHTML = state.machines.map((m) => `<button type="button" class="modal-machine${m.id === requestDraftMachine ? ' selected' : ''}"
      data-request-machine="${V.esc(m.id)}" aria-pressed="${m.id === requestDraftMachine}">
      <strong>${V.esc(m.name)}</strong>
      <span class="muted">${V.esc(m.active.wo)} · ${m.queue.length} queued</span></button>`).join('');

    const hasQueue = machine && machine.queue.length > 0;
    $('requestNoQueue').hidden = hasQueue;
    $('requestForm').hidden = !hasQueue;
    $('requestSubmit').disabled = !hasQueue;

    if (!hasQueue) {
      $('requestNoQueue').textContent = machine
        ? `${machine.name} has no queued work to reorder. A request needs at least one queued job.`
        : 'Select a machine.';
      return;
    }

    $('requestJob').innerHTML = machine.queue.map((q, i) => `<option value="${V.esc(q.wo)}">${V.esc(q.wo)} — ${V.esc(q.part)} (currently position ${i + 1})</option>`).join('');
    $('requestPosition').innerHTML = machine.queue.map((q, i) => `<option value="${i + 1}">Position ${i + 1}${i === 0 ? ' — next up' : ''}</option>`).join('');
  }

  function submitRequestFromDialog(event) {
    event.preventDefault();
    const machine = S.machineById(state, requestDraftMachine);
    if (!machine) return;
    const result = S.submitRequest(state, {
      machineId: machine.id,
      wo: $('requestJob').value,
      toPos: Number($('requestPosition').value),
      reason: $('requestReason').value,
      urgency: $('requestUrgency').value,
      timing: $('requestTiming').value,
      note: $('requestNote').value,
    });
    if (result.ok === false) {
      toast(result.reason, 'bad');
      return;
    }
    state.selected = machine.id;
    $('requestDialog').close();
    $('requestNote').value = '';
    commit(result, 'Request sent for machinist approval — the queue is unchanged');
  }

  // ---------------------------------------------------------------- actions ---

  async function handleDecision(requestId, action) {
    if (action === 'reject') {
      const answer = await ask({
        title: 'Reject queue change',
        description: 'A reason helps engineering and planning understand the constraint. No written explanation is required.',
        fields: [{
          type: 'select',
          name: 'rejectionReason',
          label: 'Reason for rejecting',
          options: S.REJECTION_REASONS.map((r) => ({ value: r, label: r })),
        }],
        confirmLabel: 'Reject request',
        danger: true,
      });
      if (!answer) return;
      commit(S.decideRequest(state, requestId, 'reject', answer));
      return;
    }

    if (action === 'counter') {
      const request = state.requests.find((r) => r.id === requestId);
      const machine = S.machineById(state, request.machineId);
      const answer = await ask({
        title: 'Propose another position',
        description: `Counter-offer a position for ${request.wo} instead of the requested position ${request.toPos}.`,
        fields: [{
          type: 'select',
          name: 'counterPos',
          label: 'Position you can actually run it in',
          options: machine.queue.map((q, i) => ({ value: String(i + 1), label: `Position ${i + 1}${i === 0 ? ' — next up' : ''}` })),
        }],
        confirmLabel: 'Approve at this position',
      });
      if (!answer) return;
      commit(S.decideRequest(state, requestId, 'counter', { counterPos: Number(answer.counterPos) }));
      return;
    }

    commit(S.decideRequest(state, requestId, action));
  }



  async function handleSetEstimate() {
    const machine = S.selectedMachine(state);
    const current = machine.active.machinistEstimate;
    const answer = await ask({
      title: current ? 'Update the prototype estimate' : 'Give a prototype estimate',
      description: `${machine.active.wo} — ${machine.active.part}. Your best guess at minutes per piece. `
        + 'It is recorded against your name and replaced automatically once three cycles have been measured.',
      fields: [
        {
          type: 'select',
          name: 'minutes',
          label: 'Estimated minutes per piece',
          options: [5, 10, 15, 20, 30, 45, 60, 90, 120, 180]
            .map((m) => ({ value: String(m), label: `${m} minutes` })),
        },
        { type: 'textarea', name: 'note', label: 'Anything worth noting (optional)' },
      ],
      confirmLabel: 'Save estimate',
    });
    if (!answer) return;
    commit(S.setMachinistEstimate(state, machine.id, Number(answer.minutes), answer.note ?? ''));
  }

  async function handleRunNow(wo) {
    const machine = S.selectedMachine(state);
    const job = machine.queue.find((q) => q.wo === wo);
    if (!job) { toast(`${wo} is not in this queue`, 'bad'); return; }

    const setupLost = machine.state === 'SETUP'
      ? Math.max(0, machine.active.setupMin - machine.setupRemainingMin)
      : machine.active.setupMin;

    const answer = await ask({
      title: `Run ${wo} now?`,
      description: `${machine.active.wo} goes back to position 1 keeping its ${machine.active.done} finished pieces, `
        + `but about ${Math.round(setupLost)} min of setup on it is abandoned. `
        + `${job.wo} then needs its own ${job.setupMin} min setup.`,
      fields: [{ label: 'This is your call — it needs nobody\u2019s approval. It is recorded in the audit trail.' }],
      confirmLabel: `Switch to ${wo}`,
    });
    if (!answer) return;
    commit(S.switchActiveJob(state, machine.id, wo));
  }

  async function handleReason(code) {
    const reason = S.reasonByCode(code);
    let note = '';
    if (reason.noteRequired) {
      const answer = await ask({
        title: reason.label,
        description: `${reason.definition}. This reason routes to ${reason.owner} and needs a short note.`,
        fields: [{ type: 'textarea', name: 'note', label: 'What is holding it up?', placeholder: 'One line is enough' }],
        confirmLabel: 'Save reason',
      });
      if (!answer) return;
      note = answer.note ?? '';
    }
    const result = S.classifyDowntime(state, state.selected, code, note);
    if (result.ok === false) {
      toast(result.reason, 'bad');
      return;
    }
    if ($('downtimeDialog').open) $('downtimeDialog').close();
    commit(result, `Recorded as ${reason.label} — ${reason.owner} notified`);
  }

  async function handleReset() {
    const answer = await ask({
      title: 'Reset the demo?',
      description: 'This discards the current shift, every queue decision and the whole audit trail.',
      fields: [{ label: 'The demo returns to its opening state.' }],
      confirmLabel: 'Reset demo',
      danger: true,
    });
    if (!answer) return;
    S.clearSaved();
    state = S.createStore();
    commit({ ok: true }, 'Demo reset');
  }

  function exportAuditCsv() {
    const header = ['timestamp', 'actor', 'role', 'machine', 'event', 'work_order', 'detail', 'queue_before', 'queue_after', 'eta_impact_min'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = state.audit.slice().sort((a, b) => a.at - b.at).map((r) => [
      new Date(r.at).toISOString(),
      r.actor,
      r.role,
      (S.machineById(state, r.machineId) ?? {}).name ?? r.machineId ?? '',
      r.event,
      r.wo ?? '',
      r.summary,
      r.before ? r.before.join(' > ') : '',
      r.after ? r.after.join(' > ') : '',
      r.etaImpactMin ?? '',
    ].map(cell).join(','));

    const blob = new Blob([[header.map(cell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `machinist-transparency-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${state.audit.length} audit records`, 'ok');
  }

  // ------------------------------------------------------------ simulation ---

  function startSim() {
    stopSim();
    simTimer = setInterval(() => {
      if (!state.config.running) return;
      S.tick(state, state.config.simSpeed);
      S.save(state);
      render();
      maybeRaiseDowntimeDialog();
    }, 1000);
  }

  function stopSim() {
    if (simTimer) clearInterval(simTimer);
    simTimer = null;
  }

  function updateSimControls() {
    $('simToggle').textContent = state.config.running ? 'Pause telemetry' : 'Resume telemetry';
    $('simToggle').setAttribute('aria-pressed', String(!state.config.running));
    $('simSpeed').value = String(state.config.simSpeed);
    $('promptThreshold').value = String(state.config.downtimePromptSeconds);
    const machine = S.selectedMachine(state);
    $('collectorToggle').textContent = machine.collector.online ? 'Simulate collector dropout' : 'Reconnect collector';
  }

  // ---------------------------------------------------------------- events ---

  function onTabKeydown(event) {
    const index = ROLES.indexOf(state.role);
    let next = null;
    if (event.key === 'ArrowRight') next = ROLES[(index + 1) % ROLES.length];
    if (event.key === 'ArrowLeft') next = ROLES[(index - 1 + ROLES.length) % ROLES.length];
    if (event.key === 'Home') [next] = ROLES;
    if (event.key === 'End') next = ROLES[ROLES.length - 1];
    if (!next) return;
    event.preventDefault();
    state.role = next;
    render();
    document.querySelector(`[data-role="${next}"]`).focus();
  }

  function bind() {
    document.querySelectorAll('[data-role]').forEach((tab) => {
      tab.addEventListener('click', () => { state.role = tab.dataset.role; S.save(state); render(); });
      tab.addEventListener('keydown', onTabKeydown);
    });

    $('machines').addEventListener('click', (event) => {
      const button = event.target.closest('[data-machine]');
      if (!button) return;
      state.selected = button.dataset.machine;
      S.save(state);
      render();
      updateSimControls();
      maybeRaiseDowntimeDialog();
    });

    $('panel').addEventListener('click', (event) => {
      const decision = event.target.closest('[data-request]');
      if (decision) { handleDecision(Number(decision.dataset.request), decision.dataset.action); return; }

      const reason = event.target.closest('[data-reason]');
      if (reason) { handleReason(reason.dataset.reason); return; }

      const blocker = event.target.closest('[data-blocker]');
      if (blocker) { commit(S.updateBlocker(state, Number(blocker.dataset.blocker), blocker.dataset.status)); return; }

      const move = event.target.closest('[data-queue-move]');
      if (move) { commit(S.reorderQueue(state, state.selected, move.dataset.wo, move.dataset.queueMove)); return; }

      const remove = event.target.closest('[data-queue-remove]');
      if (remove) { handleRemoveFromQueue(remove.dataset.queueRemove); return; }

      const runNow = event.target.closest('[data-queue-run]');
      if (runNow) { handleRunNow(runNow.dataset.queueRun); return; }

      const jump = event.target.closest('[data-select-machine]');
      if (jump) { state.selected = jump.dataset.selectMachine; S.save(state); render(); maybeRaiseDowntimeDialog(); return; }

      const act = event.target.closest('[data-act]');
      if (!act) return;
      const id = state.selected;
      switch (act.dataset.act) {
        case 'complete-setup': commit(S.completeSetup(state, id), 'Setup confirmed — machine is cutting'); break;
        case 'start-next': commit(S.startNextJob(state, id), 'Next job loaded'); break;
        case 'stop': commit(S.stopMachine(state, id)); break;
        case 'resume': commit(S.resumeMachine(state, id), 'Machine resumed'); break;
        case 'request': openRequestDialog(id); break;
        case 'add-job': openAddJobDialog(); break;
        case 'set-estimate': handleSetEstimate(); break;
        case 'finalise-process': commit(S.finaliseProcess(state, id)); break;
        case 'open-downtime': {
          const machine = S.selectedMachine(state);
          machine.promptSnoozedUntil = null;
          renderDowntimeDialog(machine);
          if (!$('downtimeDialog').open) $('downtimeDialog').showModal();
          break;
        }
        default: break;
      }
    });

    $('requestMachines').addEventListener('click', (event) => {
      const button = event.target.closest('[data-request-machine]');
      if (!button) return;
      requestDraftMachine = button.dataset.requestMachine;
      renderRequestDialog();
    });
    $('requestForm').addEventListener('submit', submitRequestFromDialog);
    $('requestCancel').addEventListener('click', () => $('requestDialog').close());
    $('requestClose').addEventListener('click', () => $('requestDialog').close());
    $('promptCancel').addEventListener('click', () => $('promptDialog').close());

    $('sourceReleased').addEventListener('click', () => setAddJobSource('released'));
    $('sourceUnplanned').addEventListener('click', () => setAddJobSource('unplanned'));
    $('releasedList').addEventListener('click', (event) => {
      const order = event.target.closest('[data-order]');
      if (!order || order.disabled) return;
      addJobSelection = order.dataset.order;
      renderAddJobDialog();
    });
    $('addJobConfirm').addEventListener('click', confirmAddOrder);
    $('unplannedForm').addEventListener('submit', confirmAddUnplanned);
    $('addJobClose').addEventListener('click', () => $('addJobDialog').close());
    $('addJobCancel').addEventListener('click', () => $('addJobDialog').close());
    $('unplannedCancel').addEventListener('click', () => $('addJobDialog').close());

    $('downtimeReasons').addEventListener('click', (event) => {
      const reason = event.target.closest('[data-reason]');
      if (reason) handleReason(reason.dataset.reason);
    });
    $('downtimeSnooze').addEventListener('click', () => {
      $('downtimeDialog').close();
      commit(S.snoozeDowntimePrompt(state, state.selected, 60));
    });

    $('simToggle').addEventListener('click', () => {
      state.config.running = !state.config.running;
      updateSimControls();
      toast(state.config.running ? 'Telemetry running' : 'Telemetry paused');
    });
    $('simSpeed').addEventListener('change', (event) => {
      state.config.simSpeed = Number(event.target.value);
      toast(`Simulated clock: ${event.target.value} min per second`);
    });
    $('promptThreshold').addEventListener('change', (event) => {
      state.config.downtimePromptSeconds = Number(event.target.value);
      toast(`Downtime prompt threshold: ${event.target.value}s`);
      render();
    });
    $('faultButton').addEventListener('click', () => commit(S.injectFault(state, state.selected), 'Fault injected'));
    $('collectorToggle').addEventListener('click', () => {
      const machine = S.selectedMachine(state);
      commit(S.setCollectorOnline(state, machine.id, !machine.collector.online));
      updateSimControls();
    });
    $('exportButton').addEventListener('click', exportAuditCsv);
    $('resetButton').addEventListener('click', handleReset);
  }

  bind();
  render();
  updateSimControls();
  maybeRaiseDowntimeDialog();
  startSim();

  // Exposed for the automated test suite.
  window.MT_DEBUG = {
    getState: () => state,
    setState: (next) => { state = next; render(); },
    render,
    raisePrompt: maybeRaiseDowntimeDialog,
    tick: (minutes) => { S.tick(state, minutes); render(); maybeRaiseDowntimeDialog(); },
  };
}());
