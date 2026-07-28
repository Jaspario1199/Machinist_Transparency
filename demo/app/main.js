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
    });

    $('panel').addEventListener('click', (event) => {
      const decision = event.target.closest('[data-request]');
      if (decision) { handleDecision(Number(decision.dataset.request), decision.dataset.action); return; }

      const reason = event.target.closest('[data-reason]');
      if (reason) { handleReason(reason.dataset.reason); return; }

      const blocker = event.target.closest('[data-blocker]');
      if (blocker) { commit(S.updateBlocker(state, Number(blocker.dataset.blocker), blocker.dataset.status)); return; }

      const act = event.target.closest('[data-act]');
      if (!act) return;
      const id = state.selected;
      switch (act.dataset.act) {
        case 'complete-setup': commit(S.completeSetup(state, id), 'Setup confirmed — machine is cutting'); break;
        case 'start-next': commit(S.startNextJob(state, id), 'Next job loaded'); break;
        case 'stop': commit(S.stopMachine(state, id)); break;
        case 'resume': commit(S.resumeMachine(state, id), 'Machine resumed'); break;
        case 'request': openRequestDialog(id); break;
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
  startSim();

  // Exposed for the automated test suite.
  window.MT_DEBUG = {
    getState: () => state,
    setState: (next) => { state = next; render(); },
    render,
    tick: (minutes) => { S.tick(state, minutes); render(); },
  };
}());
