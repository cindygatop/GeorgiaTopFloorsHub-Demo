const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assistant.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const job = (patch = {}) => ({
  id: 1, projectId: 'project-a', appointmentId: 'appointment-a', customer: 'Emily Carter',
  address: '410 Lakeview Ln, Roswell, GA', service: 'Sand & Finish', date: '2026-10-12',
  window: '8:00–9:00 AM', crew: 'Edson + team', status: 'Scheduled', ...patch
});

function demo({ jobs = [job()], orders = [], role = 'office', storageFails = false, integrationFails = false } = {}) {
  const nodes = new Map();
  const documentListeners = {};
  const writes = [];
  const queues = [];
  const updates = [];
  const storage = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', dataset: {}, listeners: {},
      addEventListener(event, listener) { this.listeners[event] = listener; } });
    return nodes.get(id);
  };
  class GeorgiaDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-09T02:00:00Z'])); }
    static now() { return Date.parse('2026-10-09T02:00:00Z'); }
  }
  const window = {
    addEventListener() {},
    GTFJobs: () => jobs,
    GTFAuth: { currentUser: () => ({ name: 'Cindy', role }) },
    persist() { if (storageFails) throw new Error('Storage full'); writes.push(copy(jobs)); },
    GTFWorkflow: {
      load: () => ({ workOrders: orders }),
      updateWorkOrder(id, patch) { const order = orders.find(w => w.id === id); if (!order) return null;
        updates.push({ id, patch: copy(patch) }); Object.assign(order, patch); return order; }
    },
    GTFIntegrations: {
      notifications: () => [],
      queueCalendarSync(j) { if (integrationFails) throw new Error('No storage'); queues.push({ type: 'calendar', job: copy(j) }); return { status: 'setup-required' }; },
      queueCrewSMS(j) { queues.push({ type: 'sms', job: copy(j) }); return { status: 'setup-required' }; }
    }
  };
  vm.runInNewContext(source, { window, Date: GeorgiaDate, Intl, URLSearchParams, document: {
    getElementById: node, addEventListener: (event, listener) => { documentListeners[event] = listener; }
  }, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  localStorage: { setItem: (key, value) => { writes.push({ key, value }); } }, navigator: {}, location: {} });
  documentListeners.DOMContentLoaded();
  return { assistant: window.GTFAssistant, jobs, orders, writes, queues, updates,
    text: () => node('assistantConversation').innerHTML,
    action(value) { node('assistantConversation').listeners.click({ target: { closest: () => ({ dataset: { assistantAction: value } }) } }); }
  };
}

test('Portuguese, English, typos, weekday, and Georgia date before UTC midnight', () => {
  const { assistant } = demo();
  assert.deepEqual(copy(assistant.appointment('Alterar horário da Emily Carter para amanhã às 14h30')), { date: '2026-10-09', time: { h: 14, mins: 30 } });
  assert.deepEqual(copy(assistant.appointment('Change Emily Carter to tomorrow at 2:30 PM')), { date: '2026-10-09', time: { h: 14, mins: 30 } });
  assert.deepEqual(copy(assistant.appointment('muda o job da Emilly Catrer pra sexta, 2 PM')), { date: '2026-10-09', time: { h: 14, mins: 0 } });
  assert.equal(assistant.matches('Emilly Catrer').length, 1);
  assert.equal(assistant.appointment('10/15/2026 at 14:30').date, '2026-10-15');
  assert.equal(assistant.appointment('alterar para 15/10/2026 às 14:30').date, '2026-10-15');
  assert.equal(assistant.appointment('at 12 AM').time.h, 0);
  assert.equal(assistant.appointment('at 12 PM').time.h, 12);
});

test('rejects invalid and ambiguous dates and times instead of guessing', () => {
  const { assistant } = demo();
  for (const text of ['2026-02-30 at 2 PM', 'tomorrow at 13 PM', 'tomorrow at 24:00', 'tomorrow at 14:75', 'tomorrow at 14:3', 'tomorrow at 2', '10/11/2026']) {
    assert.ok(assistant.appointment(text).error, text);
  }
});

test('preview is read-only and confirmation updates only the selected project', () => {
  const jobs = [job(), job({ id: 2, projectId: 'project-b', appointmentId: 'appointment-b', address: '20 Pine St, Marietta, GA' })];
  const orders = [{ id: 'wo-a', projectId: 'project-a', customer: 'Emily Carter', arrival: '8:00–9:00 AM' },
    { id: 'wo-b', projectId: 'project-b', customer: 'Emily Carter', arrival: '8:00–9:00 AM' }];
  const d = demo({ jobs, orders });
  const before = copy({ jobs, orders });
  d.assistant.process('Alterar horário da Emily Carter para amanhã às 14h30');
  assert.match(d.text(), /more than one possible job or appointment/);
  assert.match(d.text(), /appointment-a/);
  d.assistant.process('1');
  assert.deepEqual({ jobs, orders }, before);
  assert.equal(d.writes.length, 0);
  assert.equal(d.queues.length, 0);
  assert.match(d.text(), /America\/New_York/);
  d.assistant.process('sim');
  assert.equal(jobs[0].window, '2:30 PM–3:30 PM');
  assert.deepEqual(jobs[1], before.jobs[1]);
  assert.deepEqual(orders[1], before.orders[1]);
  assert.deepEqual(d.updates.map(x => x.id), ['wo-a']);
  assert.equal(orders[0].appointmentId, 'appointment-a');
  assert.equal(d.queues.length, 2);
  assert.match(d.text(), /PENDING SETUP/);
  assert.match(d.text(), /not sent/);
  const writes = d.writes.length;
  d.assistant.process('prepare a message');
  assert.match(d.text(), /Here is a draft/);
  assert.equal(d.writes.length, writes);
  assert.equal(d.queues.length, 2);
});

test('same property with multiple appointments shows service and updates the bound Work Order', () => {
  const jobs = [job(), job({ id: 2, appointmentId: 'appointment-b', service: 'Stairs', date: '2026-10-13' })];
  const orders = [{ id: 'wo-a', projectId: 'project-a', appointmentId: 'appointment-a' },
    { id: 'wo-b', projectId: 'project-a', appointmentId: 'appointment-b' }];
  const d = demo({ jobs, orders });
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  assert.match(d.text(), /Sand &amp; Finish/);
  assert.match(d.text(), /Stairs/);
  d.assistant.process('2');
  d.assistant.process('yes');
  assert.equal(jobs[0].date, '2026-10-12');
  assert.equal(jobs[1].date, '2026-10-16');
  assert.deepEqual(d.updates.map(x => x.id), ['wo-b']);
});

test('unbound Work Orders for multiple appointments remain unchanged', () => {
  const jobs = [job(), job({ id: 2, appointmentId: 'appointment-b', date: '2026-10-13' })];
  const orders = [{ id: 'wo-a', projectId: 'project-a', customer: 'Emily Carter', arrival: 'Original' }];
  const d = demo({ jobs, orders });
  d.assistant.process('Move appointment-b to 2026-10-16 at 2 PM');
  d.assistant.process('yes');
  assert.equal(orders[0].arrival, 'Original');
  assert.equal(d.updates.length, 0);
  assert.match(d.text(), /Unlinked Work Orders were left unchanged/);
});

test('legacy identities are generated only on confirmation, without matching another customer job', () => {
  const legacy = job({ projectId: undefined, appointmentId: undefined });
  const orders = [{ id: 'correct', projectId: 'project-1', customer: 'Emily Carter' },
    { id: 'other', projectId: 'project-99', customer: 'Emily Carter' }];
  const d = demo({ jobs: [legacy], orders });
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  assert.equal(legacy.projectId, undefined);
  assert.equal(legacy.appointmentId, undefined);
  assert.equal(d.writes.length, 0);
  d.assistant.process('yes');
  assert.equal(legacy.projectId, 'project-1');
  assert.equal(legacy.appointmentId, 'appointment-1');
  assert.deepEqual(d.updates.map(x => x.id), ['correct']);
});

test('explicit appointment identifiers never match a longer identifier prefix', () => {
  const d = demo({ jobs: [job({ appointmentId: 'appointment-1' }), job({ id: 10, projectId: 'project-b', appointmentId: 'appointment-10' })] });
  assert.deepEqual(copy(d.assistant.matches('move appointment-10 to tomorrow at 2 PM')).map(j => j.id), [10]);
});

test('preserves two-hour duration and Google draft crosses midnight with appointment identity', () => {
  const d = demo({ jobs: [job({ window: '8:00 AM–10:00 AM' })] });
  d.assistant.process('Change Emily Carter to 2026-10-16 at 11 PM');
  d.assistant.process('yes');
  assert.equal(d.jobs[0].window, '11:00 PM–1:00 AM');
  const url = new URL(d.assistant.calendarUrl(d.jobs[0]));
  assert.equal(url.searchParams.get('dates'), '20261016T230000/20261017T010000');
  assert.equal(url.searchParams.get('ctz'), 'America/New_York');
  assert.match(url.searchParams.get('details'), /appointment-a/);
  const noon = new URL(d.assistant.calendarUrl(job({ window: '12:30–1:30 PM' })));
  assert.equal(noon.searchParams.get('dates'), '20261012T123000/20261012T133000');
});

test('daylight saving gaps, repeated local times, and transition-spanning intervals require clarification', () => {
  for (const text of ['Change Emily Carter to 2026-03-08 at 2:30 AM', 'Change Emily Carter to 2026-11-01 at 1:30 AM', 'Change Emily Carter to 2026-03-08 at 1:30 AM']) {
    const d = demo();
    d.assistant.process(text);
    d.assistant.process('yes');
    assert.equal(d.writes.length, 0);
    assert.match(d.text(), /daylight saving/);
  }
});

test('crew availability is checked again when a preview is confirmed', () => {
  const d = demo();
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  d.jobs.push(job({ id: 2, projectId: 'project-b', appointmentId: 'appointment-b', customer: 'John Miller', date: '2026-10-16', window: '2:00–3:00 PM' }));
  d.assistant.process('yes');
  assert.equal(d.writes.length, 0);
  assert.match(d.text(), /crew schedule changed after this preview/);
});

test('shared crew schedule conflict prevents saving until an available time is selected', () => {
  const d = demo({ jobs: [job(), job({ id: 2, projectId: 'project-b', appointmentId: 'appointment-b', customer: 'John Miller', date: '2026-10-16', window: '2:00–3:00 PM' })] });
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2:30 PM');
  assert.match(d.text(), /local schedule conflict/);
  d.assistant.process('yes');
  assert.equal(d.writes.length, 0);
  d.assistant.process('at 4 PM');
  d.assistant.process('yes');
  assert.equal(d.jobs[0].window, '4:00 PM–5:00 PM');
});

test('rejects stale preview and old confirmation buttons', () => {
  const d = demo();
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  d.assistant.process('at 4 PM');
  d.action('confirm:1');
  assert.equal(d.writes.length, 0);
  d.jobs[0].date = '2026-10-18';
  d.assistant.process('yes');
  assert.equal(d.writes.length, 0);
  assert.match(d.text(), /changed since the preview/);
});

test('cancelled previews and non-Office profiles cannot modify appointments', () => {
  const d = demo();
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  d.action('cancel');
  d.action('confirm:1');
  d.assistant.process('yes');
  assert.equal(d.writes.length, 0);
  const crew = demo({ role: 'crew' });
  crew.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  crew.assistant.process('yes');
  assert.equal(crew.writes.length, 0);
  assert.match(crew.text(), /Only an Office demo profile/);
});

test('storage failure rolls back local mutation; reminder failure reports the real component state', () => {
  const d = demo({ storageFails: true });
  const before = copy(d.jobs);
  d.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  d.assistant.process('yes');
  assert.deepEqual(d.jobs, before);
  assert.equal(d.queues.length, 0);
  assert.match(d.text(), /could not save the appointment/);
  const pending = demo({ integrationFails: true });
  pending.assistant.process('Change Emily Carter to 2026-10-16 at 2 PM');
  pending.assistant.process('yes');
  assert.equal(pending.jobs[0].date, '2026-10-16');
  assert.match(pending.text(), /Google Calendar: FAILED/);
  assert.match(pending.text(), /Crew SMS: PENDING SETUP/);
});
