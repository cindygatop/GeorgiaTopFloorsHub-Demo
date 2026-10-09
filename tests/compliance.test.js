const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function demo() {
  const data = new Map();
  const context = {window:{dispatchEvent() {},addEventListener() {}},CustomEvent:class {},
    document:{querySelectorAll:() => [],addEventListener() {}},localStorage:{
      getItem:key => data.get(key) ?? null,
      setItem:(key,value) => data.set(key,value),
      removeItem:key => data.delete(key)
    }};
  vm.runInNewContext(fs.readFileSync('compliance.js','utf8'),context);
  return context.window.GTFCompliance;
}
const job = (patch = {}) => ({id:2,projectId:'project-2',company:'Direct Homeowner',customer:'Emily Carter',address:'410 Lakeview Ln, Roswell, GA',...patch});

test('signing another project of the same client never signs the previous agreement', () => {
  const c=demo(),first=c.ensureJobAgreement(job());
  const second=c.ensureJobAgreement(job({id:92,projectId:'project-92',address:'Other property'}));
  assert.notEqual(first.id,second.id);
  c.markJobAgreementSigned(job({id:92,projectId:'project-92'}));
  assert.equal(c.getRecord(first.id).status,'Missing');
  assert.equal(c.getRecord(second.id).status,'Signed');
});

test('legacy agreement migrates by stable job/project identity even from the client portal', () => {
  const c=demo(),r=c.ensureJobAgreement(job({id:undefined}));
  assert.equal(r.id,'job-emily-consent');
  assert.equal(r.projectId,'project-2');
  assert.equal(c.load().records.filter(x=>x.projectId==='project-2').length,1);
});

test('appointments in the same project share its agreement; no-ID requests cannot sign by name', () => {
  const c=demo(),r=c.ensureJobAgreement(job());
  assert.equal(c.ensureJobAgreement(job({id:93,appointmentId:'another-appointment'})).id,r.id);
  assert.equal(c.markJobAgreementSigned({customer:'Emily Carter',company:'Direct Homeowner'}),null);
  assert.equal(c.getRecord(r.id).status,'Missing');
});
