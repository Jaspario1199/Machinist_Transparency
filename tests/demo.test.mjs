/**
 * Browser tests for the simulated beta.
 *
 * Every test here corresponds to a behaviour the design documents require or a
 * defect found in review. The suite is deliberately behavioural rather than
 * unit-level: the failures that mattered were all reachable by clicking.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = `file://${join(root, 'demo', 'index.html')}`;

/** Resolve playwright from the local install or the global one. */
function loadPlaywright() {
  const require_ = createRequire(import.meta.url);
  try {
    return require_('playwright');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'x.js'))('playwright');
  }
}

const { chromium } = loadPlaywright();
let browser;

test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });

/** Fresh page with telemetry paused, so assertions are deterministic. */
async function open({ width = 1280, height = 1000 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_);
  await page.evaluate(() => { window.MT_DEBUG.getState().config.running = false; });
  page.errors = errors;
  return page;
}

const openSections = (page) => page.evaluate(() => {
  document.querySelectorAll('#panel details').forEach((d) => { d.open = true; });
});

const getState = (page) => page.evaluate(() => window.MT_DEBUG.getState());

/** Closes the auto-raised downtime popup so the panel underneath is reachable. */
async function dismissDowntimePopup(page) {
  if (await page.evaluate(() => document.getElementById('downtimeDialog').open)) {
    await page.click('#downtimeSnooze');
    await page.waitForFunction(() => !document.getElementById('downtimeDialog').open);
  }
}

// ------------------------------------------------------------ ETA policy ---

test('active-job ETA is a range with confidence and a leading risk, never a bare number', async () => {
  const page = await open();
  const range = (await page.textContent('#panel .eta-range')).trim();
  const detail = (await page.textContent('#panel .eta-detail')).trim();
  const risk = (await page.textContent('#panel .eta-risk')).trim();

  assert.match(range, /–/, `expected a range, got "${range}"`);
  assert.match(detail, /confidence/i, 'ETA must state its confidence');
  assert.match(risk, /Leading risk:/, 'ETA must state the leading risk');
  assert.match(await page.textContent('#panel .advisory'), /Advisory range/i);
  assert.deepEqual(page.errors, []);
});

test('a blocked machine produces no ETA at all', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  const range = (await page.textContent('#panel .eta-range')).trim();
  assert.equal(range, 'Not projectable');
  assert.doesNotMatch(range, /\d/, 'a stopped machine must not display a numeric ETA');
});

// ----------------------------------------------------- machine lifecycle ---

test('a machine in SETUP can be started without faking a stoppage', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-2"]');
  assert.ok(await page.$('[data-act="complete-setup"]'), 'SETUP must offer a "setup complete" action');
  await page.click('[data-act="complete-setup"]');
  const state = await getState(page);
  assert.equal(state.machines.find((m) => m.id === 'cnc-2').state, 'PRODUCTION');
  assert.ok(state.audit.some((a) => a.event === 'SETUP_COMPLETED'), 'setup completion must be audited');
});

test('a machine with an empty queue can start the next job and is never a dead end', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[0];
    m.state = 'READY';
    m.active.done = m.active.qty;
    window.MT_DEBUG.setState(s);
  });
  assert.ok(await page.$('[data-act="start-next"]'), 'READY must offer a way to load the next job');
  await page.click('[data-act="start-next"]');
  const state = await getState(page);
  assert.equal(state.machines[0].state, 'SETUP', 'starting the next job enters setup');
});

// -------------------------------------------------------- queue governance ---

test('approving a request whose work order left the queue fails loudly and stays PENDING', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines.find((x) => x.id === 'cnc-1');
    m.queue = m.queue.filter((q) => q.wo !== 'WO-20492'); // it was promoted to active
    window.MT_DEBUG.setState(s);
  });
  await openSections(page);
  await page.click('.decision[data-action="approve"]');

  const toast = (await page.textContent('#toast')).trim();
  assert.match(toast, /no longer in this machine's queue/i, `expected a failure message, got "${toast}"`);
  assert.equal(await page.getAttribute('#toast', 'class'), 'toast bad');

  const state = await getState(page);
  assert.equal(state.requests[0].status, 'PENDING', 'a failed approval must not be recorded as approved');
  assert.ok(state.audit.some((a) => a.event === 'REQUEST_DECISION_FAILED'), 'the failure must be audited');
});

test('approval reorders the queue and records before/after plus ETA impact', async () => {
  const page = await open();
  await openSections(page);
  const before = (await getState(page)).machines.find((m) => m.id === 'cnc-1').queue.map((q) => q.wo);
  await page.click('.decision[data-action="approve"]');

  const state = await getState(page);
  const after = state.machines.find((m) => m.id === 'cnc-1').queue.map((q) => q.wo);
  assert.equal(after[0], 'WO-20492', 'the approved job must move to position 1');
  assert.notDeepEqual(before, after);

  const entry = state.audit.find((a) => a.event === 'REQUEST_APPROVED');
  assert.ok(entry, 'approval must be audited');
  assert.deepEqual(entry.before, before);
  assert.deepEqual(entry.after, after);
  assert.ok(entry.actor && entry.role, 'audit rows must name a person and a role');
  assert.equal(typeof entry.etaImpactMin, 'number', 'audit must record the ETA impact');
});

test('"approve after current job" leaves the queue untouched and is visibly not in effect', async () => {
  const page = await open();
  await openSections(page);
  const before = (await getState(page)).machines.find((m) => m.id === 'cnc-1').queue.map((q) => q.wo);
  await page.click('.decision[data-action="defer"]');

  const state = await getState(page);
  const after = state.machines.find((m) => m.id === 'cnc-1').queue.map((q) => q.wo);
  assert.deepEqual(after, before, 'a deferred approval must not move the queue yet');

  const badgeClass = await page.getAttribute('#panel .request .badge', 'class');
  assert.doesNotMatch(badgeClass, /production/, 'deferred must not be styled as an applied change');
  assert.match(badgeClass, /deferred/);
  assert.match(await page.textContent('#panel .request'), /not yet in effect/i);

  await page.click('[data-role="leadership"]');
  const metrics = await page.$$eval('.metric', (els) => els.map((e) => e.textContent.replace(/\s+/g, '')));
  assert.ok(
    metrics.includes('Approved,notyetineffect1'),
    `leadership must surface in-flight changes, got ${JSON.stringify(metrics)}`,
  );
});

test('a deferred approval is applied when the job completes', async () => {
  const page = await open();
  await openSections(page);
  await page.click('.decision[data-action="defer"]');
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines.find((x) => x.id === 'cnc-1');
    m.active.done = m.active.qty - 1;
    window.MT_DEBUG.setState(s);
    window.MT_DEBUG.tick(60);
  });
  const state = await getState(page);
  const request = state.requests.find((r) => r.id === 1);
  assert.equal(request.status, 'APPROVED');
  assert.ok(state.audit.some((a) => a.event === 'REQUEST_DEFERRED_APPLIED'));
});

test('rejection captures a reason from the agreed list', async () => {
  const page = await open();
  await openSections(page);
  await page.click('.decision[data-action="reject"]');
  await page.waitForSelector('#promptDialog[open]');
  await page.selectOption('#promptFields select', 'Fixture/tooling conflict');
  await page.click('#promptConfirm');

  const state = await getState(page);
  assert.equal(state.requests[0].status, 'REJECTED');
  assert.equal(state.requests[0].decision.rejectionReason, 'Fixture/tooling conflict');
  assert.ok(state.audit.some((a) => a.event === 'REQUEST_REJECTED' && /Fixture/.test(a.summary)));
});

test('the machinist can counter-propose a different position', async () => {
  const page = await open();
  await openSections(page);
  assert.ok(await page.$('.decision[data-action="counter"]'), '"propose another position" must exist');
  await page.click('.decision[data-action="counter"]');
  await page.waitForSelector('#promptDialog[open]');
  // The request asked for position 1; the machinist can only take it third.
  await page.selectOption('#promptFields select', '3');
  await page.click('#promptConfirm');

  const state = await getState(page);
  assert.equal(state.requests[0].status, 'APPROVED_REPOSITIONED');
  assert.equal(state.machines.find((m) => m.id === 'cnc-1').queue[2].wo, 'WO-20492');
  const entry = state.audit.find((a) => a.event === 'REQUEST_COUNTERED');
  assert.ok(entry, 'a counter-proposal must be audited');
  assert.match(entry.summary, /instead of the requested 1/);
});

test('requesters cannot reorder the queue directly from any read-only role', async () => {
  const page = await open();
  for (const role of ['engineer', 'leadership']) {
    await page.click(`[data-role="${role}"]`);
    const controls = await page.$$('.decision');
    assert.equal(controls.length, 0, `${role} must not see machinist decision controls`);
  }
  const before = (await getState(page)).machines.find((m) => m.id === 'cnc-1').queue.map((q) => q.wo);

  await page.click('[data-act="request"]');
  await page.waitForSelector('#requestDialog[open]');
  await page.selectOption('#requestJob', 'WO-20517');
  await page.selectOption('#requestPosition', '1');
  await page.fill('#requestNote', 'Customer called about this one');
  await page.click('#requestSubmit');

  const state = await getState(page);
  const after = state.machines.find((m) => m.id === 'cnc-1').queue.map((q) => q.wo);
  assert.deepEqual(after, before, 'submitting a request must never change the queue');
  assert.equal(state.requests.at(-1).status, 'PENDING');
  assert.ok(state.audit.some((a) => a.event === 'REQUEST_SUBMITTED' && a.before));
});

test('a request records urgency, desired timing and the note, and the note is shown', async () => {
  const page = await open();
  await page.click('[data-role="engineer"]');
  await page.click('[data-act="request"]');
  await page.waitForSelector('#requestDialog[open]');
  await page.selectOption('#requestJob', 'WO-20517');
  await page.selectOption('#requestUrgency', 'HIGH');
  await page.selectOption('#requestTiming', 'AFTER_CYCLE');
  await page.fill('#requestNote', 'NOTE-MUST-BE-VISIBLE');
  await page.click('#requestSubmit');

  const request = (await getState(page)).requests.at(-1);
  assert.equal(request.urgency, 'HIGH');
  assert.equal(request.timing, 'AFTER_CYCLE');
  assert.equal(request.note, 'NOTE-MUST-BE-VISIBLE');

  await openSections(page);
  assert.match(await page.textContent('#panel'), /NOTE-MUST-BE-VISIBLE/, 'the note must be rendered, not swallowed');
});

test('a machine with no queued work explains itself instead of offering a dead button', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.machines.find((m) => m.id === 'cnc-1').queue = [];
    window.MT_DEBUG.setState(s);
  });
  await page.click('[data-role="engineer"]');
  await page.click('[data-act="request"]');
  await page.waitForSelector('#requestDialog[open]');
  assert.equal(await page.isVisible('#requestNoQueue'), true);
  assert.match(await page.textContent('#requestNoQueue'), /no queued work/i);
  assert.equal(await page.isDisabled('#requestSubmit'), true);
});

// ------------------------------------------------- downtime and blockers ---

test('the reason list comes from config and shows the responsible group', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  const configured = await page.evaluate(() => window.DOWNTIME_REASONS.map((r) => r.code));

  // The popup and the panel must both offer exactly the configured tree.
  const inPopup = await page.$$eval('#downtimeReasons .reason', (els) => els.map((e) => e.dataset.reason));
  assert.deepEqual(inPopup, configured, 'the popup must render exactly the configured reason tree');

  await dismissDowntimePopup(page);
  await openSections(page);
  const inPanel = await page.$$eval('#panel .reason', (els) => els.map((e) => e.dataset.reason));
  assert.deepEqual(inPanel, configured, 'the panel must render exactly the configured reason tree');
  assert.match(await page.textContent('#panel .reason'), /Manufacturing Engineering|Materials|Quality|Maintenance|Planning|Production Supervisor/);
});

test('reasons flagged note_required actually demand a note', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await dismissDowntimePopup(page);
  await openSections(page);
  await page.click('#panel .reason[data-reason="MATERIAL"]'); // note_required = true
  await page.waitForSelector('#promptDialog[open]');
  assert.match(await page.textContent('#promptDescription'), /Materials/);
  await page.fill('#promptFields textarea', 'Bar stock still in receiving');
  await page.click('#promptConfirm');

  const state = await getState(page);
  const machine = state.machines.find((m) => m.id === 'cnc-3');
  assert.equal(machine.downtime.code, 'MATERIAL');
  assert.equal(machine.downtime.note, 'Bar stock still in receiving');
});

test('classifying downtime opens a blocker owned by the configured group', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await dismissDowntimePopup(page);
  await openSections(page);
  await page.click('#panel .reason[data-reason="MACHINE_FAULT"]');
  await page.waitForSelector('#promptDialog[open]');
  await page.fill('#promptFields textarea', 'Spindle alarm');
  await page.click('#promptConfirm');

  const state = await getState(page);
  const blocker = state.blockers.at(-1);
  assert.equal(blocker.code, 'MACHINE_FAULT');
  assert.equal(blocker.owner, 'Maintenance', 'the blocker must route to the owner defined in the CSV');
  assert.equal(blocker.status, 'OPEN');
  assert.ok(state.audit.some((a) => a.event === 'BLOCKER_OPENED'));
});

test('a classified stoppage survives the machine resuming', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await dismissDowntimePopup(page);
  await openSections(page);
  await page.click('#panel .reason[data-reason="TOOLING"]');
  await page.waitForSelector('#promptDialog[open]');
  await page.fill('#promptFields textarea', 'Insert change');
  await page.click('#promptConfirm');
  await page.click('[data-act="resume"]');

  const machine = (await getState(page)).machines.find((m) => m.id === 'cnc-3');
  const recorded = machine.history.downtimes.find((d) => d.note === 'Insert change');
  assert.ok(recorded, 'the downtime interval must be kept in history after resuming');
  assert.equal(recorded.code, 'TOOLING');
  assert.ok(recorded.endedAt > recorded.startedAt);
});

test('short stops below the threshold are not chased for a reason', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.config.downtimePromptSeconds = 600;
    const m = s.machines.find((x) => x.id === 'cnc-1');
    m.state = 'STOPPED';
    m.stateSince = Date.now() - 5000;
    m.downtime = null;
    m.promptedAt = null;
    window.MT_DEBUG.setState(s);
  });
  await openSections(page);
  await page.evaluate(() => window.MT_DEBUG.raisePrompt());
  const body = await page.textContent('#panel');
  assert.match(body, /No reason is requested until 600s/);
  assert.equal((await page.$$('#panel .reason')).length, 0, 'no prompt should appear below the threshold');
  assert.equal(
    await page.evaluate(() => document.getElementById('downtimeDialog').open),
    false,
    'a short stop must not raise the popup',
  );
});

test('blockers can be acknowledged and closed, and both are audited', async () => {
  const page = await open();
  await openSections(page);
  await page.click('.blocker-action[data-status="ACKNOWLEDGED"], .blocker-action[data-status="CLOSED"]');
  const state = await getState(page);
  assert.ok(state.audit.some((a) => /BLOCKER_(ACKNOWLEDGED|CLOSED)/.test(a.event)));
});

// -------------------------------------------------------------- audit log ---

test('the leadership view exposes a shop-wide, attributable audit trail', async () => {
  const page = await open();
  await page.click('[data-role="leadership"]');
  assert.equal(await page.isVisible('#shopAudit'), true);
  const headers = await page.$$eval('#shopAuditBody th', (els) => els.map((e) => e.textContent.trim()));
  for (const required of ['Time', 'Actor', 'Event', 'Work order', 'Queue before → after', 'ETA impact']) {
    assert.ok(headers.includes(required), `audit table is missing the "${required}" column`);
  }
  assert.ok((await page.$$('#shopAuditBody tbody tr')).length > 3, 'the shift should open with visible history');
});

test('every audit row carries a timestamp and a named actor', async () => {
  const page = await open();
  const audit = (await getState(page)).audit;
  assert.ok(audit.length > 0);
  for (const row of audit) {
    assert.equal(typeof row.at, 'number', 'audit row without a timestamp');
    assert.ok(row.actor, 'audit row without an actor');
    assert.ok(row.role, 'audit row without a role');
  }
});

// ------------------------------------------------------------- analytics ---

test('the engineering view provides real process analytics, not the machinist panel', async () => {
  const page = await open();
  await page.click('[data-role="engineer"]');
  await openSections(page);
  const body = await page.textContent('#panel');
  for (const required of ['Cycle-time distribution', 'Downtime Pareto', 'Setup history', 'Machine-tending candidate', 'Spindle utilisation', 'Actual vs standard cycle', 'Operator interventions']) {
    assert.match(body, new RegExp(required, 'i'), `engineering view is missing "${required}"`);
  }
  assert.ok((await page.$$('.pareto-row')).length > 0, 'Pareto must render rows');
  assert.ok((await page.$$('.hbar')).length > 0, 'cycle histogram must render bars');
});

test('leadership sees due-date risk, blocker owners and requested priority', async () => {
  const page = await open();
  await page.click('[data-role="leadership"]');
  await openSections(page);
  const body = await page.textContent('#panel');
  assert.match(body, /Due-date risk/);
  assert.match(body, /Requested priority/);
  assert.match(body, /owner:/);
});

// --------------------------------------------------------- live telemetry ---

test('the board advances on its own without anyone clicking', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await page.goto(URL_);
  await page.evaluate(() => { window.MT_DEBUG.getState().config.simSpeed = 15; });
  const before = await page.evaluate(() => window.MT_DEBUG.getState().machines[0].active.done);
  await page.waitForTimeout(3500);
  const after = await page.evaluate(() => window.MT_DEBUG.getState().machines[0].active.done);
  assert.ok(after > before, `production must advance from telemetry alone (${before} → ${after})`);
  await context.close();
});

test('collector health is surfaced and degrades when the collector drops', async () => {
  const page = await open();
  assert.match(await page.textContent('#panel .health'), /Live/);
  await page.click('#collectorToggle');
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.machines.find((m) => m.id === 'cnc-1').collector.lastEventAt = Date.now() - 60000;
    window.MT_DEBUG.setState(s);
  });
  const health = await page.textContent('#panel .health');
  assert.match(health, /No data for/, 'a dropped collector must be visible, not silent');
});

// ------------------------------------------------ rendering / interaction ---

test('a re-render preserves expanded sections and keyboard focus', async () => {
  const page = await open();
  await page.click('#panel details[data-section^="m-audit"] summary');
  await page.focus('[data-focus-key="stop"]');
  const openedBefore = await page.$$eval('#panel details', (els) => els.map((d) => d.open));

  await page.evaluate(() => window.MT_DEBUG.tick(1));

  const openedAfter = await page.$$eval('#panel details', (els) => els.map((d) => d.open));
  assert.deepEqual(openedAfter, openedBefore, 'a telemetry tick must not collapse what the user opened');
  const focused = await page.evaluate(() => document.activeElement?.dataset?.focusKey ?? null);
  assert.equal(focused, 'stop', 'focus must survive a re-render');
});

test('user-supplied text is escaped, not executed', async () => {
  const page = await open();
  await page.click('[data-role="engineer"]');
  await page.click('[data-act="request"]');
  await page.waitForSelector('#requestDialog[open]');
  await page.fill('#requestNote', '<img src=x onerror="window.__XSS=1"><b>bold</b>');
  await page.click('#requestSubmit');
  await openSections(page);
  await page.click('[data-role="machinist"]');
  await openSections(page);

  assert.equal(await page.evaluate(() => window.__XSS), undefined, 'injected markup must not execute');
  assert.equal(await page.$$eval('#panel .note b', (e) => e.length), 0, 'markup must render as text');
  assert.match(await page.textContent('#panel .note'), /<b>bold<\/b>/);
});

test('reset requires confirmation before discarding the audit trail', async () => {
  const page = await open();
  await page.click('#resetButton');
  await page.waitForSelector('#promptDialog[open]');
  assert.match(await page.textContent('#promptDescription'), /discards/i);
  await page.click('#promptCancel');
  assert.ok((await getState(page)).audit.length > 0, 'cancelling must not wipe state');
});

test('the audit trail exports as CSV', async () => {
  const page = await open();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportButton'),
  ]);
  assert.match(download.suggestedFilename(), /machinist-transparency-audit-.*\.csv/);
});

// ---------------------------------------------------------- accessibility ---

test('role switching uses real tab semantics with arrow-key navigation', async () => {
  const page = await open();
  assert.ok(await page.$('[role="tablist"]'));
  assert.equal(await page.getAttribute('#tab-machinist', 'aria-selected'), 'true');
  await page.focus('#tab-machinist');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#tab-engineer', 'aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-engineer');
});

test('machine selection is exposed to assistive technology, not colour alone', async () => {
  const page = await open();
  const pressed = await page.$$eval('.machine', (els) => els.map((e) => e.getAttribute('aria-pressed')));
  assert.deepEqual(pressed, ['true', 'false', 'false']);
  await page.click('.machine[data-machine="cnc-2"]');
  assert.deepEqual(
    await page.$$eval('.machine', (els) => els.map((e) => e.getAttribute('aria-pressed'))),
    ['false', 'true', 'false'],
  );
});

test('progress is exposed as a progressbar with values', async () => {
  const page = await open();
  const bars = await page.$$eval('[role="progressbar"]', (els) => els.map((e) => ({
    now: e.getAttribute('aria-valuenow'),
    label: e.getAttribute('aria-label'),
  })));
  assert.ok(bars.length >= 3);
  for (const bar of bars) {
    assert.ok(Number.isFinite(Number(bar.now)));
    assert.ok(bar.label);
  }
});

test('the toast is a live region so decisions are announced', async () => {
  const page = await open();
  assert.equal(await page.getAttribute('#toast', 'role'), 'status');
  assert.equal(await page.getAttribute('#toast', 'aria-live'), 'polite');
});

test('dialogs are labelled and take focus, and the background is inert', async () => {
  const page = await open();
  await page.click('[data-role="engineer"]');
  await page.click('[data-act="request"]');
  await page.waitForSelector('#requestDialog[open]');

  assert.equal(await page.getAttribute('#requestDialog', 'aria-labelledby'), 'requestDialogTitle');
  assert.equal(await page.evaluate(() => document.getElementById('requestDialog').contains(document.activeElement)), true);
  // showModal() makes everything outside the dialog inert; verify a background
  // control genuinely cannot be reached.
  assert.equal(
    await page.evaluate(() => {
      const tab = document.getElementById('tab-machinist');
      tab.focus();
      return document.activeElement === tab;
    }),
    false,
    'background controls must be unreachable while a modal is open',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('requestDialog').open);
});

test('there is a skip link to the workspace', async () => {
  const page = await open();
  assert.ok(await page.$('.skip-link'));
});

/**
 * Measures each piece of secondary text against the background actually painted
 * behind it, rather than an assumed white, and does so in both colour schemes.
 */
async function contrastFailures(page) {
  return page.evaluate(() => {
    const luminance = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    /**
     * Accepts both `rgb(0-255 …)` and the `color(srgb 0-1 …)` form that
     * color-mix() resolves to, which are numerically incompatible.
     */
    const parse = (s) => {
      const nums = s.match(/[\d.]+/g).slice(0, 3).map(Number);
      return s.startsWith('color(') ? nums.map((n) => n * 255) : nums;
    };
    const opaque = (s) => s && s !== 'transparent' && !/[\s,]0(\.0+)?\)$/.test(s);

    const effectiveBackground = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        if (opaque(bg)) return bg;
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    const ratio = (fg, bg) => {
      const a = luminance(parse(fg));
      const b = luminance(parse(bg));
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    };

    const failures = [];
    document.querySelectorAll('.muted, .small, .label, .advisory, .eta-basis, .reason-owner').forEach((el) => {
      if (!el.textContent.trim() || !el.getClientRects().length) return;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      // WCAG AA: 3:1 for large text (>=24px, or >=18.66px bold), else 4.5:1.
      const required = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const measured = ratio(style.color, effectiveBackground(el));
      if (measured < required) {
        failures.push({
          text: el.textContent.trim().slice(0, 40),
          className: el.className,
          measured: Number(measured.toFixed(2)),
          required,
        });
      }
    });
    return failures;
  });
}

test('secondary text meets WCAG AA contrast in light mode', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(URL_);
  await page.click('[data-role="leadership"]');
  const failures = await contrastFailures(page);
  assert.deepEqual(failures, [], `low-contrast text: ${JSON.stringify(failures, null, 2)}`);
  await context.close();
});

test('secondary text meets WCAG AA contrast in dark mode', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(URL_);
  await page.click('[data-role="leadership"]');
  const failures = await contrastFailures(page);
  assert.deepEqual(failures, [], `low-contrast text: ${JSON.stringify(failures, null, 2)}`);
  await context.close();
});

test('shop-floor controls meet a 44px touch target, decisions included', async () => {
  const page = await open();
  await openSections(page);
  const measure = (selector) => page.$$eval(selector, (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { text: e.textContent.trim().slice(0, 32), h: Math.round(r.height) };
  }));

  for (const [selector, min] of [['.decision', 44], ['[data-act]', 44], ['.machine', 44]]) {
    const items = await measure(selector);
    assert.ok(items.length > 0, `no elements matched ${selector}`);
    for (const item of items) {
      assert.ok(item.h >= min, `${selector} "${item.text}" is only ${item.h}px tall (need ${min}px)`);
    }
  }

  await page.click('.machine[data-machine="cnc-3"]');
  await dismissDowntimePopup(page);
  await openSections(page);
  for (const item of await measure('#panel .reason')) {
    assert.ok(item.h >= 60, `downtime reason "${item.text}" is only ${item.h}px tall`);
  }
});

test('destructive simulation controls are not the largest thing on the page', async () => {
  const page = await open();
  await openSections(page);
  const reset = await page.$eval('#resetButton', (e) => e.getBoundingClientRect().height);
  const approve = await page.$eval('.decision[data-action="approve"]', (e) => e.getBoundingClientRect().height);
  assert.ok(approve >= reset, 'the approval control must be at least as prominent as Reset');
});

// ---------------------------------------------------------------- layout ---

test('on a tablet the workspace is reachable without scrolling past the picker', async () => {
  const page = await open({ width: 820, height: 1180 });
  const top = await page.evaluate(() => Math.round(document.getElementById('panel').getBoundingClientRect().top));
  assert.ok(top < 700, `the machine workspace starts at y=${top}; it must stay near the fold on a tablet`);
});

test('the page never scrolls horizontally', async () => {
  for (const width of [1280, 820, 390]) {
    const page = await open({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow of ${overflow}px at ${width}px wide`);
  }
});

test('the page states that it measures processes rather than operators', async () => {
  const page = await open();
  assert.match(await page.textContent('header'), /not.*individual operator performance/is);
});

test('the demo declares that nothing is connected to a real system', async () => {
  const page = await open();
  const footer = await page.textContent('.footer');
  assert.match(footer, /No CNC, Dynamics 365, Bluestar/);
});

// ------------------------------------------------ theming and distribution ---

test('an explicit data-theme overrides the operating-system preference both ways', async () => {
  // Read the two palettes rather than pinning hex values, so a re-skin cannot
  // break this test for the wrong reason.
  const read = async (scheme, attr) => {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await page.goto(URL_);
    if (attr) await page.evaluate((v) => document.documentElement.setAttribute('data-theme', v), attr);
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--card').trim());
    await context.close();
    return value;
  };

  const lightCard = await read('light', null);
  const darkCard = await read('dark', null);
  assert.notEqual(lightCard, darkCard, 'the two schemes must actually differ');

  for (const scheme of ['light', 'dark']) {
    assert.equal(await read(scheme, 'dark'), darkCard, `data-theme="dark" must win under a ${scheme} OS preference`);
    assert.equal(await read(scheme, 'light'), lightCard, `data-theme="light" must win under a ${scheme} OS preference`);
  }
});

test('the standalone bundle is current and self-contained', async () => {
  const { execSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const bundlePath = join(root, 'demo', 'standalone.html');

  const before = readFileSync(bundlePath, 'utf8');
  execSync('node scripts/build-standalone.mjs', { cwd: root, stdio: 'pipe' });
  assert.equal(
    readFileSync(bundlePath, 'utf8'),
    before,
    'demo/standalone.html is stale — run: node scripts/build-standalone.mjs',
  );
  assert.equal(
    /<(link|script)[^>]+(href|src)=/.test(before),
    false,
    'the standalone bundle must have no external asset references',
  );
});

test('the standalone bundle behaves identically to the multi-file demo', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${join(root, 'demo', 'standalone.html')}`);
  await page.evaluate(() => { window.MT_DEBUG.getState().config.running = false; });

  assert.deepEqual(errors, []);
  assert.equal((await page.$$('.machine')).length, 3);
  assert.equal(await page.evaluate(() => window.DOWNTIME_REASONS.length), 11);
  assert.match((await page.textContent('#panel .eta-range')).trim(), /–/);

  await page.click('[data-role="leadership"]');
  assert.ok((await page.$$('#shopAuditBody tbody tr')).length > 3);
  await context.close();
});

// -------------------------------------- direct machinist control of the queue ---

test('the machinist reorders their own queue directly, with no request or approval', async () => {
  const page = await open();
  await openSections(page);
  const before = (await getState(page)).machines[0].queue.map((q) => q.wo);
  const pendingBefore = (await getState(page)).requests.filter((r) => r.status === 'PENDING').length;

  await page.click('[data-queue-move="up"][data-wo="WO-20492"]');

  const state = await getState(page);
  const after = state.machines[0].queue.map((q) => q.wo);
  assert.equal(after[0], 'WO-20492', 'the machinist must be able to promote a job themselves');
  assert.notDeepEqual(after, before);
  assert.equal(
    state.requests.filter((r) => r.status === 'PENDING').length,
    pendingBefore,
    'reordering your own queue must not create or consume a request',
  );

  const entry = state.audit.find((a) => a.event === 'QUEUE_REORDERED');
  assert.ok(entry, 'a direct reorder is still audited — attributable is not the same as needing approval');
  assert.deepEqual(entry.before, before);
  assert.deepEqual(entry.after, after);
  assert.equal(entry.role, 'Machinist');
});

test('queue reorder controls are disabled at the ends and never silently no-op', async () => {
  const page = await open();
  await openSections(page);
  const first = await page.$$eval('.q', (rows) => ({
    firstUp: rows[0].querySelector('[data-queue-move="up"]').disabled,
    lastDown: rows[rows.length - 1].querySelector('[data-queue-move="down"]').disabled,
    middleUp: rows[1].querySelector('[data-queue-move="up"]').disabled,
  }));
  assert.equal(first.firstUp, true, 'the top job cannot move up');
  assert.equal(first.lastDown, true, 'the bottom job cannot move down');
  assert.equal(first.middleUp, false);
});

test('only the machinist gets queue controls', async () => {
  const page = await open();
  assert.ok((await page.$$('[data-queue-move]')).length > 0, 'the machinist must have them');
  for (const role of ['engineer', 'leadership']) {
    await page.click(`[data-role="${role}"]`);
    await openSections(page);
    assert.equal((await page.$$('[data-queue-move], [data-queue-run]')).length, 0, `${role} must not reorder the queue`);
  }
});

test('the machinist can switch the running job, keeping progress and recording the setup loss', async () => {
  const page = await open();
  await openSections(page);
  await page.click('[data-queue-run="WO-20517"]');
  await page.waitForSelector('#promptDialog[open]');

  const warning = await page.textContent('#promptDescription');
  assert.match(warning, /34 finished pieces/, 'the warning must say what happens to the part-finished job');
  assert.match(warning, /setup on it is abandoned/, 'the warning must state the setup cost');
  await page.click('#promptConfirm');

  const machine = (await getState(page)).machines[0];
  assert.equal(machine.active.wo, 'WO-20517', 'the chosen job must now be running');
  assert.equal(machine.state, 'SETUP', 'a switched-to job needs its own setup');

  const displaced = machine.queue.find((q) => q.wo === 'WO-20481');
  assert.ok(displaced, 'the displaced job must go back into the queue, not vanish');
  assert.equal(machine.queue[0].wo, 'WO-20481', 'it holds position 1');
  assert.equal(displaced.done, 34, 'its completed quantity must be preserved');

  const entry = (await getState(page)).audit.find((a) => a.event === 'ACTIVE_JOB_SWITCHED');
  assert.ok(entry, 'switching the running job must be audited');
  assert.match(entry.summary, /34 of 50 complete/);
  assert.match(entry.summary, /setup abandoned/);
});

// ---------------------------------------------------- the downtime popup ---

test('a stoppage past the threshold raises a popup, not a panel to be noticed', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  assert.equal(
    await page.evaluate(() => document.getElementById('downtimeDialog').open),
    true,
    'the reason prompt must raise itself',
  );
  assert.match(await page.textContent('#downtimeSubtitle'), /CNC Lathe 1 .* stopped \d+ min/);
  assert.equal((await page.$$('#downtimeReasons .reason')).length, 11);
  assert.equal(await page.getAttribute('#downtimeDialog', 'aria-labelledby'), 'downtimeTitle');
});

test('the popup is answerable in one tap and routes the blocker', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await page.click('#downtimeReasons .reason[data-reason="NO_WORK"]'); // no note required

  await page.waitForFunction(() => !document.getElementById('downtimeDialog').open);
  const state = await getState(page);
  assert.equal(state.machines.find((m) => m.id === 'cnc-3').downtime.code, 'NO_WORK');
  assert.ok(state.audit.some((a) => a.event === 'DOWNTIME_CLASSIFIED'));
});

test('the popup can be deferred — but deferring is recorded and stays visible', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await page.click('#downtimeSnooze');
  await page.waitForFunction(() => !document.getElementById('downtimeDialog').open);

  const state = await getState(page);
  assert.ok(state.audit.some((a) => a.event === 'DOWNTIME_PROMPT_DEFERRED'), 'deferring must be audited');
  assert.equal(state.machines.find((m) => m.id === 'cnc-3').downtime, null, 'deferring must not classify anything');

  assert.match(await page.textContent('.machine[data-machine="cnc-3"]'), /Reason needed/, 'the machine stays flagged');
  assert.match(await page.textContent('#panel .banner'), /Reason needed/, 'the workspace stays flagged');

  await page.click('[data-role="leadership"]');
  const metrics = await page.$$eval('.metric', (els) => els.map((e) => e.textContent.replace(/\s+/g, '')));
  assert.ok(
    metrics.includes('Unclassifiedstoppages1'),
    `leadership must still count it as unclassified, got ${JSON.stringify(metrics)}`,
  );
});

test('a deferred prompt comes back when the snooze expires', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await page.click('#downtimeSnooze');
  await page.waitForFunction(() => !document.getElementById('downtimeDialog').open);

  await page.evaluate(() => window.MT_DEBUG.raisePrompt());
  assert.equal(
    await page.evaluate(() => document.getElementById('downtimeDialog').open),
    false,
    'it must stay closed while snoozed',
  );

  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.machines.find((m) => m.id === 'cnc-3').promptSnoozedUntil = Date.now() - 1;
    window.MT_DEBUG.setState(s);
    window.MT_DEBUG.raisePrompt();
  });
  assert.equal(
    await page.evaluate(() => document.getElementById('downtimeDialog').open),
    true,
    'the prompt must return once the snooze expires',
  );
});

test('the popup never traps a role that cannot answer it', async () => {
  const page = await open();
  for (const role of ['engineer', 'leadership']) {
    await page.click(`[data-role="${role}"]`);
    await page.click('.machine[data-machine="cnc-3"]');
    await page.evaluate(() => window.MT_DEBUG.raisePrompt());
    assert.equal(
      await page.evaluate(() => document.getElementById('downtimeDialog').open),
      false,
      `${role} cannot classify a stoppage, so must not be interrupted by the prompt`,
    );
  }
});

test('the popup does not fight another dialog the user is already in', async () => {
  const page = await open();
  await page.click('[data-role="engineer"]');
  await page.click('[data-act="request"]');
  await page.waitForSelector('#requestDialog[open]');

  await page.evaluate(() => {
    window.MT_DEBUG.getState().role = 'machinist';
    window.MT_DEBUG.getState().selected = 'cnc-3';
    window.MT_DEBUG.raisePrompt();
  });
  assert.equal(
    await page.evaluate(() => document.getElementById('downtimeDialog').open),
    false,
    'a second modal must not open on top of one already in use',
  );
});

// ------------------------------------------ getting work onto a machine ---

test('the machinist has a button to add work, and it never creates a production order', async () => {
  const page = await open();
  await openSections(page);
  assert.ok(await page.$('[data-act="add-job"]'), 'there must be a way to add work to a queue');

  await page.click('[data-act="add-job"]');
  await page.waitForSelector('#addJobDialog[open]');
  assert.match(await page.textContent('#releasedPane'), /never creates or edits the order itself/i,
    'the dialog must state that it does not create production orders');

  const poolBefore = (await getState(page)).unassignedOrders.length;
  await page.click('.order[data-order="WO-20540"]');
  await page.selectOption('#addJobPosition', '1');
  await page.click('#addJobConfirm');

  const state = await getState(page);
  assert.equal(state.machines[0].queue[0].wo, 'WO-20540', 'the order must land at the chosen position');
  assert.equal(state.machines[0].queue[0].source, 'D365');
  assert.equal(state.unassignedOrders.length, poolBefore - 1, 'it must leave the unassigned pool');

  const entry = state.audit.find((a) => a.event === 'JOB_ADDED_TO_QUEUE');
  assert.ok(entry, 'assigning work must be audited');
  assert.deepEqual(entry.after, state.machines[0].queue.map((q) => q.wo));
});

test('an unreleased revision cannot be queued at all', async () => {
  const page = await open();
  await openSections(page);
  await page.click('[data-act="add-job"]');
  await page.waitForSelector('#addJobDialog[open]');

  assert.equal(
    await page.isDisabled('.order[data-order="WO-20562"]'),
    true,
    'a pending revision is a quality escape, not a warning',
  );

  const result = await page.evaluate(() =>
    window.MT_STATE.addOrderToQueue(window.MT_DEBUG.getState(), 'cnc-1', 'WO-20562', 1, true));
  assert.equal(result.ok, false);
  assert.match(result.reason, /not released in Bluestar/);
});

test('routing and material conflicts warn but do not block, and the acceptance is recorded', async () => {
  const page = await open();
  await openSections(page);
  await page.click('[data-act="add-job"]');
  await page.waitForSelector('#addJobDialog[open]');

  await page.click('.order[data-order="WO-20544"]'); // routed to CNC Mill 2
  const notice = await page.textContent('#assignIssues');
  assert.match(notice, /routing puts this on CNC Mill 2/);
  assert.match(notice, /You can still run it here/);
  assert.equal(await page.isDisabled('#addJobConfirm'), false, 'a deviation must remain the machinist\'s call');

  await page.click('#addJobConfirm');
  const entry = (await getState(page)).audit.find((a) => a.event === 'JOB_ADDED_TO_QUEUE');
  assert.match(entry.summary, /accepted with: The D365 routing puts this on CNC Mill 2/);
});

test('unplanned work can be recorded, is badged as having no order, and needs a name against it', async () => {
  const page = await open();
  await openSections(page);
  await page.click('[data-act="add-job"]');
  await page.waitForSelector('#addJobDialog[open]');
  await page.click('#sourceUnplanned');

  await page.click('#unplannedConfirm');
  assert.match((await page.textContent('#toast')).trim(), /needs a one-line description/,
    'unplanned work without a description must be refused');

  await page.selectOption('#unplannedCategory', 'REWORK');
  await page.fill('#unplannedDescription', 'Re-cut bore on 6 rejected Sensor Housing A');
  await page.selectOption('#unplannedEstimate', '60');
  await page.selectOption('#unplannedPosition', '1');
  await page.click('#unplannedConfirm');

  const state = await getState(page);
  const job = state.machines[0].queue[0];
  assert.match(job.wo, /^UNPLANNED-\d{3}$/, 'unplanned work gets a local reference, not a work-order number');
  assert.equal(job.source, 'UNPLANNED');
  assert.equal(job.unplanned.categoryLabel, 'Rework / salvage');
  assert.ok(job.unplanned.authorizedBy, 'someone must be named against it');

  const entry = state.audit.find((a) => a.event === 'UNPLANNED_JOB_ADDED');
  assert.match(entry.summary, /No production order — needs one attaching/);

  await openSections(page);
  assert.match(await page.textContent('#panel .unplanned-badge'), /no work order/,
    'unplanned work must be visibly unplanned in the queue');
});

test('leadership sees unplanned load and the unassigned backlog rather than having them buried', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.machines[0].queue.unshift({
      wo: 'UNPLANNED-001', part: 'Fixture proving', qty: 1, done: 0,
      cycleMedianMin: 30, cycleSigmaMin: 5, setupMin: 5, program: '—',
      requestedPriority: 3, dueAt: Date.now(), source: 'UNPLANNED',
      unplanned: { category: 'FIXTURE', categoryLabel: 'Fixture proving', authorizedBy: 'Supervisor', openedAt: Date.now() },
      ready: 'Fixture proving — no work order', readyCode: 'MATERIAL',
    });
    window.MT_DEBUG.setState(s);
  });
  await page.click('[data-role="leadership"]');
  const metrics = await page.$$eval('.metric', (els) => els.map((e) => e.textContent.replace(/\s+/g, '')));
  assert.ok(metrics.includes('Unplannedwork,noorder1'), `got ${JSON.stringify(metrics)}`);
  assert.ok(metrics.some((m) => m.startsWith('Released,notyetonamachine')), `got ${JSON.stringify(metrics)}`);
});

test('removing a released order returns it to the unassigned pool, with a reason', async () => {
  const page = await open();
  await openSections(page);
  const poolBefore = (await getState(page)).unassignedOrders.length;

  await page.click('[data-queue-remove="WO-20503"]');
  await page.waitForSelector('#promptDialog[open]');
  await page.selectOption('#promptFields select', 'Moved to another machine');
  await page.click('#promptConfirm');

  const state = await getState(page);
  assert.ok(!state.machines[0].queue.some((q) => q.wo === 'WO-20503'), 'it must leave the queue');
  assert.equal(state.unassignedOrders.length, poolBefore + 1, 'a D365 order must go back to the pool, not vanish');
  assert.ok(state.unassignedOrders.some((o) => o.wo === 'WO-20503'));

  const entry = state.audit.find((a) => a.event === 'JOB_REMOVED_FROM_QUEUE');
  assert.match(entry.summary, /Moved to another machine/);
  assert.match(entry.summary, /Returned to the unassigned released list/);
});

test('only the machinist can add or remove work', async () => {
  const page = await open();
  for (const role of ['engineer', 'leadership']) {
    await page.click(`[data-role="${role}"]`);
    await openSections(page);
    assert.equal((await page.$$('[data-act="add-job"]')).length, 0, `${role} must not add work directly`);
    assert.equal((await page.$$('[data-queue-remove]')).length, 0, `${role} must not remove work directly`);
  }
});

test('the ETA says where its numbers came from, and does not claim measurement it has not made', async () => {
  const page = await open();

  // A job with history: measured.
  assert.match(await page.textContent('#panel .eta-basis'), /Measured from \d+ observed cycles/);

  // A cold-start job: the routing standard, said plainly.
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[0];
    m.active.wo = 'WO-99999';           // nothing observed for this order
    m.history.cycles = [];
    window.MT_DEBUG.setState(s);
  });
  const basis = await page.textContent('#panel .eta-basis');
  assert.match(basis, /No cycles observed yet/);
  assert.match(basis, /standard from the D365 routing/);
  assert.doesNotMatch(basis, /0 planned cycles/, 'must not report a measurement it never made');
});

// ----------------------------------------- in-cycle progress from the NC file ---

test('the block number reported by the controller identifies the running operation', async () => {
  const page = await open();
  await openSections(page);

  const headline = (await page.textContent('.op-headline')).replace(/\s+/g, ' ');
  assert.match(headline, /Operation 3 of 6/, 'the active operation must be identified');
  assert.match(headline, /Finish profile/);
  assert.match(headline, /T6 — 8 mm end mill/, 'the tool in the spindle comes with it');
  assert.match(headline, /block 1,980 of 2,960/);

  const ops = await page.$$eval('.op', (els) => els.map((e) => e.className));
  assert.deepEqual(ops, ['op done', 'op done', 'op active', 'op pending', 'op pending', 'op pending'],
    'operations before the current one are done, after it are pending');
});

test('progress is weighted by time, not by block count', async () => {
  const page = await open();
  const figures = await page.evaluate(() => {
    const m = window.MT_DEBUG.getState().machines[0];
    const p = window.MT_ANALYTICS.operationProgress(m);
    return { rawBlockPct: p.block / p.totalBlocks, timePct: p.percent };
  });
  // 500 blocks of rapids and 500 blocks of a finish contour take very different
  // times, so a raw block percentage is the wrong number to show.
  assert.notEqual(Math.round(figures.rawBlockPct * 100), Math.round(figures.timePct * 100));
  assert.equal(Math.round(figures.timePct * 100), 63);
});

test('the CAM estimate is rescaled against what the machine actually does', async () => {
  const page = await open();
  await openSections(page);
  const calibration = await page.evaluate(() =>
    window.MT_ANALYTICS.operationProgress(window.MT_DEBUG.getState().machines[0]).calibration);

  assert.ok(calibration, 'with enough cycles there must be a measured correction');
  assert.ok(calibration.samples >= 3);
  assert.equal(typeof calibration.factor, 'number');
  assert.match(await page.textContent('#panel .op-headline ~ * , #panel'), /CAM estimate vs measured/);

  // Under three cycles it must say so rather than imply a correction it has not made.
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.machines[0].history.cycles = [];
    window.MT_DEBUG.setState(s);
  });
  await openSections(page);
  assert.match(await page.textContent('#panel'), /Fewer than three measured cycles/);
});

test('progress advances from the collector alone as the program runs', async () => {
  const page = await open();
  const readings = [];
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => window.MT_DEBUG.tick(1.5));
    readings.push(await page.evaluate(() => {
      const m = window.MT_DEBUG.getState().machines[0];
      const p = window.MT_ANALYTICS.operationProgress(m);
      return { seq: p.current.seq, block: p.block, tool: m.telemetry.tool };
    }));
  }
  assert.ok(readings[3].block > readings[0].block, 'the block number must advance');
  assert.ok(readings[3].seq >= readings[0].seq, 'operations must progress in order');
  assert.ok(readings.some((r, i) => i > 0 && r.seq !== readings[i - 1].seq), 'the operation must change during a cycle');
  assert.match(readings[3].tool, /^T\d/, 'the reported tool must follow the operation');
});

test('a job with no CAM operation list says so instead of inventing progress', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    delete s.machines[0].active.operations;
    window.MT_DEBUG.setState(s);
  });
  await openSections(page);
  assert.match(await page.textContent('#panel .empty'), /No operation list for WO-20481/);
  assert.equal(await page.evaluate(() =>
    window.MT_ANALYTICS.operationProgress(window.MT_DEBUG.getState().machines[0])), null);
});

test('the wording follows whether the posted file makes one part or the whole job', async () => {
  const page = await open();
  await openSections(page);
  assert.match(await page.textContent('#panel'), /makes one piece and is re-run for each/);

  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    s.machines[0].active.programScope = 'JOB';
    window.MT_DEBUG.setState(s);
  });
  await openSections(page);
  const body = await page.textContent('#panel');
  assert.match(body, /Through the whole job/);
  assert.match(body, /runs the whole quantity in one go/);
});

// ------------------------------------------------- prototypes vs finalised ---

test('a prototype uses the machinist estimate and never claims to be measuring', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-2"]');
  await openSections(page);

  const body = await page.textContent('#panel');
  assert.match(body, /Prototype — process not finalised/);
  assert.match(body, /no posted, stored program to track against/);
  assert.match(body, /9 min per piece/);
  assert.match(body, /Given by R\. Delgado/);

  const basis = await page.textContent('#panel .eta-basis');
  assert.match(basis, /Not measured/, 'a prototype estimate must not be described as measured');
  assert.doesNotMatch(basis, /Measured from 0/, 'must never claim a measurement it has not made');
  assert.match(await page.textContent('#panel .eta-risk'), /machinist estimate from R\. Delgado/);

  // No operation-level claims are made without a program to back them.
  assert.equal((await page.$$('#panel .op')).length, 0);
  assert.equal(await page.evaluate(() =>
    window.MT_ANALYTICS.operationProgress(window.MT_DEBUG.getState().machines[1])), null);
});

test('the machinist can set and revise the estimate, and revisions are audited', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-2"]');
  await openSections(page);

  await page.click('[data-act="set-estimate"]');
  await page.waitForSelector('#promptDialog[open]');
  await page.selectOption('#promptFields select', '20');
  await page.fill('#promptFields textarea', 'Second op slower than expected');
  await page.click('#promptConfirm');

  const state = await getState(page);
  const estimate = state.machines[1].active.machinistEstimate;
  assert.equal(estimate.min, 20);
  assert.equal(estimate.by, 'R. Delgado');
  assert.equal(estimate.note, 'Second op slower than expected');

  const entry = state.audit.find((a) => a.event === 'PROTOTYPE_ESTIMATE_REVISED');
  assert.match(entry.summary, /from 9 to 20 min/, 'the previous estimate must stay in the record');
});

test('a process cannot be called finalised before it has been measured', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-2"]');
  await openSections(page);
  await page.click('[data-act="finalise-process"]');

  assert.match((await page.textContent('#toast')).trim(), /run it a few more times/);
  assert.equal((await getState(page)).machines[1].active.programMode, 'PROTOTYPE');

  // With cycles behind it, finalising is allowed and recorded.
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[1];
    m.history.cycles = [1, 2, 3, 4].map(() => ({ wo: m.active.wo, program: m.active.program, min: 9.1, at: Date.now() }));
    window.MT_DEBUG.setState(s);
  });
  await openSections(page);
  await page.click('[data-act="finalise-process"]');
  const state = await getState(page);
  assert.equal(state.machines[1].active.programMode, 'FULL_PROGRAM');
  assert.ok(state.audit.some((a) => a.event === 'PROCESS_FINALISED'));
});

test('measured cycles take over from the estimate automatically', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[1];
    m.history.cycles = [8.8, 9.2, 9.0, 8.9].map((min) => ({ wo: m.active.wo, program: m.active.program, min, at: Date.now() }));
    window.MT_DEBUG.setState(s);
  });
  const stats = await page.evaluate(() =>
    window.MT_ANALYTICS.cycleStats(window.MT_DEBUG.getState().machines[1]));
  assert.equal(stats.source, 'observed', 'once measured, the estimate is no longer used');
  assert.ok(stats.median > 8.5 && stats.median < 9.5);
});

test('cycle history follows the program, so a repeat order does not start cold', async () => {
  const page = await open();
  const result = await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[0];
    m.active.wo = 'WO-30999';       // brand-new order, same stored program
    return window.MT_ANALYTICS.cycleStats(m);
  });
  assert.equal(result.source, 'observed', 'a repeat order must inherit the program history');
  assert.ok(result.count >= 30, `expected the program's cycles, got ${result.count}`);
});

test('the stored program library separates shop-wide history from this machine', async () => {
  const page = await open();
  await openSections(page);
  const body = await page.textContent('#panel');
  assert.match(body, /Stored program/);
  assert.match(body, /412 runs across\s+6 jobs/);

  // The lifetime figure is shop-wide; the estimate is not drawn from it. Saying
  // "412 runs" next to an estimate built from a handful of local cycles reads
  // as though 412 runs of evidence sit behind the number. They do not — cycles
  // are scoped to this machine — and the screen has to say so.
  assert.match(body, /shop-wide, all machines/i);
  assert.match(body, /not drawn from that figure/i);
  assert.match(body, /measured on CNC Mill 1 itself/);
});

// -------------------------------------------------------------- theming ---

test('component styles contain no colour or typeface literals', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(join(root, 'demo', 'app.css'), 'utf8');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const hex = withoutComments.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(hex, [], `app.css must take every colour from theme.css, found: ${hex.join(', ')}`);

  const functional = withoutComments.match(/\b(rgb|rgba|hsl|hsla)\(/g) ?? [];
  assert.deepEqual(functional, [], 'app.css must not declare colours directly');

  // Extract the value and inspect it, rather than relying on a lookahead that
  // whitespace can backtrack past.
  const fonts = [...withoutComments.matchAll(/font-family:\s*([^;}]+)/g)]
    .map((m) => m[1].trim())
    .filter((value) => !value.startsWith('var(') && value !== 'inherit');
  assert.deepEqual(fonts, [], `typefaces belong in theme.css, found: ${fonts.join(' | ')}`);
});

test('re-skinning through theme.css alone changes the whole interface', async () => {
  const page = await open();

  // Stand in for an edited theme.css: override the brand tokens at runtime.
  await page.evaluate(() => {
    const r = document.documentElement;
    r.style.setProperty('--brand', '#5c1a1a');
    r.style.setProperty('--accent', '#a33');
    r.style.setProperty('--accent-solid', '#8c2020');
  });

  const painted = await page.evaluate(() => ({
    header: getComputedStyle(document.querySelector('header')).backgroundColor,
    primaryBtn: getComputedStyle(document.querySelector('.btn.primary, [data-act]')).backgroundColor,
    selectedCard: getComputedStyle(document.querySelector('.machine.selected')).borderTopColor,
  }));

  assert.match(painted.header, /92, 26, 26/, 'the header must follow --brand');
  assert.notEqual(painted.selectedCard, 'rgb(18, 87, 176)', 'selection must follow --accent, not a literal');
});

test('the corporate logo slot is present and hidden until a mark is supplied', async () => {
  const page = await open();
  const mark = await page.$('.brand-mark');
  assert.ok(mark, 'there must be a slot for the company mark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.brand-mark')).display), 'none',
    'the slot stays out of the way until a logo is set');

  await page.evaluate(() => {
    const r = document.documentElement;
    r.style.setProperty('--brand-logo', 'url("data:image/svg+xml;base64,PHN2Zy8+")');
    r.style.setProperty('--brand-logo-display', 'block');
  });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.brand-mark')).display), 'block');
});

test('the theme never links an external font or stylesheet', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['theme.css', 'app.css', 'index.html', 'standalone.html']) {
    const content = readFileSync(join(root, 'demo', file), 'utf8');
    const remote = content.match(/@import[^;]*https?:|url\(\s*['"]?https?:/g) ?? [];
    assert.deepEqual(remote, [], `${file} must not reach the network — it has to run from a USB stick`);
  }
});

// ------------------------------------------------ audit findings, fixed ---
//
// Each test below pins a hole found in the second deep-dive review. They are
// grouped here rather than scattered so that a regression is obvious: if one
// of these fails, the screen has started asserting something it cannot back.

test('nobody signed in means the terminal cannot record a decision', async () => {
  const page = await open();
  await page.click('#signOutButton');

  const result = await page.evaluate(() => window.MT_STATE.stopMachine(window.MT_DEBUG.getState(), 'cnc-1'));
  assert.equal(result.ok, false, 'an unattended terminal must not be able to act');
  assert.match(result.reason, /signed in/i);

  const state = await getState(page);
  assert.equal(state.signedIn, null);
  assert.ok(state.audit.some((a) => a.event === 'SIGNED_OUT'), 'signing out is itself audited');
});

test('a role may only do what that role is allowed to do', async () => {
  const page = await open();
  const denied = await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    window.MT_STATE.signIn(s, 'T. Okafor');
    return {
      reorder: window.MT_STATE.reorderQueue(s, 'cnc-1', s.machines[0].queue[1].wo, 'up'),
      classify: window.MT_STATE.classifyDowntime(s, 'cnc-3', 'TOOLING', 'x'),
      request: window.MT_STATE.submitRequest(s, {
        machineId: 'cnc-1', wo: s.machines[0].queue[0].wo, toPos: 1,
        urgency: 'NORMAL', timing: 'AFTER_JOB', reason: 'Customer shipment risk', note: '',
      }),
    };
  });
  assert.equal(denied.reorder.ok, false, 'an engineer must not reorder the executable queue');
  assert.equal(denied.classify.ok, false, 'an engineer must not classify somebody else’s stoppage');
  assert.equal(denied.request.ok, true, 'an engineer must still be able to ask');
});

test('switching role tab switches the identity, so the audit never misattributes', async () => {
  const page = await open();
  await page.click('[data-role="engineer"]');
  const state = await getState(page);
  assert.equal(state.signedIn.role, 'Engineer / PM',
    'the tab and the signed-in person must agree — a screen saying "Engineer" while attributing to a machinist is the exact failure this app exists to prevent');
  assert.ok(state.audit.some((a) => a.event === 'SHIFT_HANDOVER' || a.event === 'SIGNED_IN'));
});

test('unplanned work has no committed date, so it is never reported at due-date risk', async () => {
  const page = await open();
  const risk = await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[0];
    m.active.dueAt = null;
    m.active.unplanned = { categoryLabel: 'Rework', authorizedBy: 'P. Osei', openedAt: Date.now() };
    return window.MT_ANALYTICS.dueDateRisk(s, m, Date.now());
  });
  assert.equal(risk.level, 'NONE');
  assert.match(risk.text, /no committed date/i);
});

test('unplanned work is added without a fabricated due date', async () => {
  const page = await open();
  const job = await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    window.MT_STATE.addUnplannedJob(s, 'cnc-1', {
      category: 'REWORK', description: 'Re-cut bore on 6 rejected housings',
      estimateMin: 45, authorizedBy: 'P. Osei', position: 1,
    });
    return s.machines[0].queue.find((q) => q.source === 'UNPLANNED');
  });
  assert.ok(job, 'the unplanned job must reach the queue');
  assert.equal(job.dueAt, null,
    'inventing a due date from the estimate makes every overrun read as a missed commitment');
});

test('escaping the stoppage prompt records the deferral instead of dropping it', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await page.waitForFunction(() => document.getElementById('downtimeDialog').open);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('downtimeDialog').open);

  const state = await getState(page);
  assert.ok(state.audit.some((a) => a.event === 'DOWNTIME_PROMPT_DEFERRED'),
    'a dismissal that leaves no trace is a dismissal nobody can see');
  const machine = state.machines.find((m) => m.id === 'cnc-3');
  assert.ok(machine.promptSnoozedUntil > Date.now(), 'Escape must snooze, or the prompt reopens instantly');
  assert.equal(machine.downtime, null, 'the stoppage stays unclassified');
});

test('a note-required reason never stacks two modals', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await page.waitForFunction(() => document.getElementById('downtimeDialog').open);
  await page.click('#downtimeReasons [data-reason="TOOLING"]');
  await page.waitForFunction(() => document.getElementById('promptDialog').open);

  assert.equal(await page.evaluate(() => document.getElementById('downtimeDialog').open), false,
    'the stoppage prompt must step aside rather than sit behind the note prompt');

  // Abandoning the note brings the reason grid back rather than losing it.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('downtimeDialog').open);
});

test('a queued job can be promoted to the top in one press', async () => {
  const page = await open();
  await openSections(page);
  const last = await page.evaluate(() => window.MT_DEBUG.getState().machines[0].queue.at(-1).wo);
  await page.click(`[data-queue-move="top"][data-wo="${last}"]`);
  const state = await getState(page);
  assert.equal(state.machines[0].queue[0].wo, last,
    'a nine-deep queue must not need eight presses to promote the last job');
  assert.ok(state.audit.some((a) => a.event === 'QUEUE_REORDERED'));
});

test('a deferred approval that lapses says so on the request, not only in the audit', async () => {
  const page = await open();
  await page.evaluate(() => {
    const s = window.MT_DEBUG.getState();
    const m = s.machines[0];
    const wo = m.queue[1].wo;
    window.MT_STATE.signIn(s, 'T. Okafor');
    window.MT_STATE.submitRequest(s, {
      machineId: m.id, wo, toPos: 1, urgency: 'HIGH', timing: 'AFTER_JOB',
      reason: 'Customer shipment risk', note: '',
    });
    window.MT_STATE.signIn(s, 'R. Delgado');
    const req = s.requests.at(-1);
    window.MT_STATE.decideRequest(s, req.id, 'defer');
    // The work order leaves the queue before the current job finishes.
    window.MT_STATE.removeFromQueue(s, m.id, wo, 'Material unavailable');
    m.active.done = m.active.qty - 1;
    window.MT_DEBUG.tick(120);
  });

  const state = await getState(page);
  const expired = state.requests.find((r) => r.status === 'EXPIRED');
  assert.ok(expired, 'the approval must lapse rather than silently succeed');
  assert.equal(expired.expiryAcknowledged, false);
  assert.equal(await page.evaluate(() => window.MT_STATE.unacknowledgedExpiries(window.MT_DEBUG.getState()).length), 1);

  await page.evaluate(() => { document.querySelectorAll('#panel details').forEach((d) => { d.open = true; }); });
  const panel = await page.textContent('#panel');
  assert.match(panel, /This approval never took effect/i,
    'the requester was told "approved"; they have to be told it did not happen');

  await page.click('[data-ack-expiry]');
  const after = await getState(page);
  assert.equal(after.requests.find((r) => r.id === expired.id).expiryAcknowledged, true);
  assert.ok(after.audit.some((a) => a.event === 'REQUEST_EXPIRY_ACKNOWLEDGED'));
});

test('scrap moves a piece out of the good count instead of vanishing', async () => {
  const page = await open();
  const before = await page.evaluate(() => window.MT_DEBUG.getState().machines[0].active.done);
  const result = await page.evaluate(() => window.MT_STATE.recordScrap(window.MT_DEBUG.getState(), 'cnc-1', 2, 'bore oversize'));
  assert.equal(result.ok, true);

  const state = await getState(page);
  const active = state.machines[0].active;
  assert.equal(active.done, before - 2, 'good quantity is what D365 needs, and it must drop');
  assert.equal(active.scrap, 2);
  assert.ok(state.audit.some((a) => a.event === 'SCRAP_RECORDED'));

  const over = await page.evaluate(() => window.MT_STATE.recordScrap(window.MT_DEBUG.getState(), 'cnc-1', 9999));
  assert.equal(over.ok, false, 'you cannot scrap more than has been made');
});

/*
 * The audit listed "Reset can stack a second modal on top of the stoppage
 * prompt" as a hole. Reproducing it showed the opposite: every dialog in the
 * application uses showModal(), which makes the rest of the document inert, so
 * the destructive control is unreachable while a decision is open. The finding
 * was wrong. This test pins the property that makes it wrong, so a future
 * change from showModal() to show() fails here rather than in a shop.
 */
test('a destructive control cannot be reached while a decision dialog is open', async () => {
  const page = await open();
  await page.click('.machine[data-machine="cnc-3"]');
  await page.waitForFunction(() => document.getElementById('downtimeDialog').open);

  const reachable = await page.evaluate(() => {
    const reset = document.getElementById('resetButton');
    const r = reset.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === reset;
  });
  assert.equal(reachable, false, 'Reset must be inert behind the modal, not clickable through it');
});

// ---------------------------------------------------------------- layout ---

test('machines come before shop-wide aggregates, which start collapsed', async () => {
  const page = await open();
  await page.click('[data-role="leadership"]');

  const order = await page.evaluate(() => {
    const machines = document.getElementById('machines');
    const metrics = document.getElementById('metrics');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    return (machines.compareDocumentPosition(metrics) & 4) !== 0;
  });
  assert.ok(order, 'the machines are the product; the aggregate board is context for them');

  const open_ = await page.evaluate(() => document.querySelector('#metrics details').open);
  assert.equal(open_, false, 'eleven tiles should not be the first thing on the screen');

  // Collapsing is only safe if the exceptions stay legible while it is closed.
  const summary = await page.textContent('#metrics summary');
  assert.match(summary, /Shop overview/);
  assert.match(summary, /unclassified stoppage/i);
  assert.match(summary, /awaiting your machinists/i);
});

test('the shop-wide board never appears outside leadership', async () => {
  const page = await open();
  for (const role of ['machinist', 'engineer']) {
    await page.click(`[data-role="${role}"]`);
    const shown = await page.evaluate(() => {
      const el = document.getElementById('metrics');
      return el.getBoundingClientRect().height > 0;
    });
    assert.equal(shown, false, `${role} must not see the leadership board — a display rule can beat [hidden]`);
  }
  await page.click('[data-role="leadership"]');
  assert.ok(await page.evaluate(() => document.getElementById('metrics').getBoundingClientRect().height > 0));
});

/*
 * The interface reads as an instrument, not a game.
 *
 * These pin the specific decisions that made it read as a toy: fully-round
 * status pills inside square containers, thick filled progress troughs, and a
 * saturated confirmation box for routine actions. Each is cheap to reintroduce
 * by habit, so each gets a test.
 */
test('status tags are square tags, not achievement pills', async () => {
  const page = await open();
  const containerRadius = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.panel')).borderTopLeftRadius));

  for (const selector of ['.badge', '.flag']) {
    const radius = await page.$$eval(selector, (els) =>
      els.map((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius)));
    assert.ok(radius.length > 0, `no ${selector} on the page`);
    for (const r of radius) {
      assert.ok(r <= containerRadius + 1,
        `${selector} radius ${r}px exceeds its container's ${containerRadius}px — a small element rounder than the box it sits in reads as a game chip`);
    }
  }
});

test('progress is a thin rule beside a number, not a loading bar', async () => {
  const page = await open();
  const heights = await page.$$eval('.track', (els) =>
    els.map((e) => parseFloat(getComputedStyle(e).height)));
  assert.ok(heights.length > 0);
  for (const h of heights) {
    assert.ok(h <= 6, `a ${h}px filled trough is an XP bar; the quantity is already stated in words beside it`);
  }
  // The words have to actually be there for the thin rule to be enough.
  assert.match(await page.textContent('#panel'), /34 of 50 complete/);
});

test('a routine confirmation is not styled as a celebration', async () => {
  const page = await open();
  const [neutral, ok, bad] = await page.evaluate(() => {
    const el = document.getElementById('toast');
    const read = (cls) => {
      el.className = cls;
      return getComputedStyle(el).backgroundColor;
    };
    return [read('toast'), read('toast ok'), read('toast bad')];
  });
  assert.equal(ok, neutral,
    'success should use the neutral surface — a saturated green box in the corner reads as achievement unlocked');
  assert.notEqual(bad, neutral,
    'a rejected action is the one thing that genuinely has to interrupt, so it keeps the red');
});

test('the simulation controls sit below the work, not above it', async () => {
  const page = await open();
  const belowPanel = await page.evaluate(() => {
    const panel = document.getElementById('panel');
    const simbar = document.querySelector('.simbar');
    return (panel.compareDocumentPosition(simbar) & 4) !== 0;
  });
  assert.ok(belowPanel,
    'a clock multiplier and a fault injector above the shop teach the eye "simulator" before the work loads');
  // Still reachable — a reviewer cannot otherwise force a fault or compress a shift.
  assert.ok(await page.$('#faultButton'));
  assert.ok(await page.$('#simSpeed'));
});
