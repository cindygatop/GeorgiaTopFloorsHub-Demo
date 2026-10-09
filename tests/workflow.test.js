const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function demo(jobs = []) {
  const data = new Map([['gtfDemoJobs', JSON.stringify(jobs)]]);
  const context = {window: {dispatchEvent() {}}, CustomEvent: class {}, localStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  }};
  vm.runInNewContext(fs.readFileSync('project-docs.js', 'utf8'), context);
  return context.window.GTFWorkflow;
}

test('new estimates keep the same project through work order and invoice creation', () => {
  const w = demo();
  const e = w.saveEstimate({customer:'Emily Carter', company:'Direct Homeowner', customerType:'direct', status:'Approved', items:[]});
  assert.ok(e.projectId);
  assert.equal(w.createWorkOrder(e.id).projectId, e.projectId);
  assert.equal(w.createInvoice(e.id).projectId, e.projectId);
  w.saveEstimate({id:e.id, projectId:'another-project', notes:'Edited'});
  assert.equal(w.getEstimate(e.id).projectId, e.projectId);
});

test('duplicate customer names require a project for lookup and approval', () => {
  const w = demo();
  const second = w.saveEstimate({customer:'Emily Carter', projectId:'project-second', customerType:'direct', status:'Sent', items:[]});
  assert.equal(w.getCustomerBundle('Emily Carter'), null);
  assert.equal(w.getEstimateByCustomer('Emily Carter'), null);
  assert.equal(w.approveCustomerEstimate('Emily Carter'), null);
  assert.equal(w.getEstimate('est-1042').status, 'Sent');
  assert.equal(w.approveCustomerEstimate('Emily Carter', second.projectId).id, second.id);
  assert.equal(w.getEstimate('est-1042').status, 'Sent');
});

test('job documents never fall back to another project by matching the customer name', () => {
  const w = demo();
  assert.equal(w.bundleForJob({id:999, customer:'Emily Carter'}).estimate, null);
  assert.equal(w.bundleForJob({id:2, projectId:'project-2', customer:'Emily Carter'}).estimate.id, 'est-1042');
});

test('work order links the unique appointment and preserves its assignment', () => {
  const w = demo([{id:2, projectId:'project-2', appointmentId:'appointment-2', window:'2:30–3:30 PM', crew:'Carlos + Edson', manager:'Isaque', date:'2026-10-10'}]);
  w.setEstimateStatus('est-1042','Approved');
  const wo = w.createWorkOrder('est-1042');
  assert.equal(wo.appointmentId, 'appointment-2');
  assert.equal(wo.arrival, '2:30–3:30 PM');
  assert.equal(wo.scheduledDate, '2026-10-10');
  assert.deepEqual(Array.from(wo.assignedCrewUsers), ['Carlos','Edson']);
});

test('multiple appointments are not inferred; an explicit appointment chooses the correct one', () => {
  const jobs = [{id:2,projectId:'project-2',appointmentId:'a2'}, {id:3,projectId:'project-2',appointmentId:'a3'}];
  const w = demo(jobs);
  w.setEstimateStatus('est-1042','Approved');
  assert.equal(w.createWorkOrder('est-1042').appointmentId, null);
  const explicit = demo(jobs);
  explicit.setEstimateStatus('est-1042','Approved');
  assert.equal(explicit.createWorkOrder('est-1042',{appointmentId:'a3'}).appointmentId, 'a3');
});

test('project bundle excludes documents whose project and estimate links disagree', () => {
  const w = demo(), state = w.load();
  state.workOrders.push({id:'wrong',estimateId:'est-1042',projectId:'other',crew:'Carlos'});
  w.save(state);
  assert.equal(w.getCustomerBundle('Emily Carter','project-2').workOrder, null);
});

test('reloading an already migrated unscheduled work order does not write or emit change events', () => {
  const data = new Map();
  let writes = 0;
  const context = {window:{dispatchEvent() {}}, CustomEvent:class {}, localStorage:{
    getItem:key => data.get(key) ?? null,
    setItem:(key,value) => {writes++;data.set(key,value);},
    removeItem:key => data.delete(key)
  }};
  vm.runInNewContext(fs.readFileSync('project-docs.js','utf8'),context);
  context.window.GTFWorkflow.load();
  const initialWrites = writes;
  context.window.GTFWorkflow.load();
  context.window.GTFWorkflow.load();
  assert.equal(writes,initialWrites);
});
