const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function demo(jobs = [{id:2,projectId:'project-2',appointmentId:'appointment-2',customer:'Emily Carter'}]) {
  const data = new Map([['gtfDemoJobs', JSON.stringify(jobs)]]);
  const context = {window:{dispatchEvent() {}}, CustomEvent:class {}, localStorage:{
    getItem:key => data.get(key) ?? null,
    setItem:(key,value) => data.set(key,value),
    removeItem:key => data.delete(key)
  }};
  vm.runInNewContext(fs.readFileSync('project-docs.js','utf8'),context);
  context.window.GTFWorkflow.load();
  return {w:context.window.GTFWorkflow, docs:context.window.GTFDocs};
}
function input(extra={}) {
  return {projectId:'project-2',appointmentId:'appointment-2',estimateId:'est-1042',customer:'Emily Carter',projectCustomer:'Emily Carter',company:'Direct Homeowner',customerType:'direct',address:'Demo property',issued:'2026-10-15',dueDate:'2026-11-15',items:[{description:'Sand & Finish',qty:100,unit:'SF',unitPrice:4}],taxRate:0,discount:0,notes:'Office review',paymentRule:'Review before issue',actor:'Cindy',...extra};
}
function snapshot(w) {return JSON.stringify(w.load());}

test('creating a draft preserves project, appointment and estimate while forcing Office-only status',()=>{
  const {w}=demo(),inv=w.createInvoiceDraft(input({status:'Paid',customerVisible:true}));
  assert.equal(inv.status,'Draft');
  assert.equal(inv.customerVisible,false);
  assert.equal(inv.projectId,'project-2');
  assert.equal(inv.appointmentId,'appointment-2');
  assert.equal(inv.estimateId,'est-1042');
  assert.equal(inv.createdBy,'Cindy');
  assert.equal(w.invoiceFinancials(w.load(),inv).total,400);
  assert.equal(w.load().workOrders.length,1);
  assert.equal(w.load().payments.length,1);
  assert.equal(w.getEstimate('est-1042').status,'Sent');
});

test('a second invoice for the same estimate scope is rejected without a write',()=>{
  const {w}=demo();w.createInvoiceDraft(input());const before=snapshot(w);
  assert.throws(()=>w.createInvoiceDraft(input()),/already exists/);
  assert.equal(snapshot(w),before);
});

test('an unissued project draft cannot be bypassed by generating another invoice from its approved estimate',()=>{
  const {w}=demo();w.createInvoiceDraft(input({estimateId:null}));w.setEstimateStatus('est-1042','Approved');const before=snapshot(w);
  assert.throws(()=>w.createInvoice('est-1042'),/existing project draft/);
  assert.throws(()=>w.createInvoiceDraft(input()),/already exists/);
  assert.equal(snapshot(w),before);
});

test('draft client visibility is blocked even if a legacy record has customerVisible true',()=>{
  const {w,docs}=demo(),inv=w.createInvoiceDraft(input()),state=w.load();
  state.invoices.find(i=>i.id===inv.id).customerVisible=true;w.save(state);
  assert.equal(w.customerInvoiceVisible(state.invoices.find(i=>i.id===inv.id)),false);
  assert.equal(w.getCustomerBundle('Emily Carter','project-2').invoice,null);
  assert.equal(w.getCustomerBundle('Emily Carter','project-2').invoiceFinancials,null);
  assert.equal(docs.get('est-1042').visibility.customerInvoice,false);
  assert.equal(docs.get('est-1042').invoice,null);
});

test('drafts reject both normal and compatibility demo payment paths',()=>{
  const {w,docs}=demo(),inv=w.createInvoiceDraft(input()),before=snapshot(w);
  assert.throws(()=>w.recordPayment(inv.id,400),/Draft invoices cannot receive payments/);
  assert.throws(()=>docs.recordFinalPayment('est-1042'),/Draft invoices cannot receive payments/);
  assert.equal(snapshot(w),before);
});

test('financial calculations keep Draft even when a legacy payment exists',()=>{
  const {w}=demo(),inv=w.createInvoiceDraft(input()),state=w.load();
  state.payments.push({invoiceId:inv.id,amount:400});
  assert.equal(w.invoiceFinancials(state,inv).status,'Draft');
  w.save(state);const before=snapshot(w);
  assert.throws(()=>w.updateInvoiceDraft(inv.id,{notes:'Changed'}),/with payments/);
  assert.equal(snapshot(w),before);
});

test('an approved estimate still creates an Open invoice and supports partial and full demo payments',()=>{
  const {w}=demo();w.setEstimateStatus('est-1042','Approved');
  const inv=w.createInvoice('est-1042'),total=w.invoiceFinancials(w.load(),inv).total;
  assert.equal(inv.status,'Open');
  assert.equal(w.getCustomerBundle('Emily Carter','project-2').invoice.id,inv.id);
  w.recordPayment(inv.id,100,'Check');
  assert.equal(w.invoiceFinancials(w.load(),inv).status,'Partially Paid');
  w.recordPayment(inv.id,total-100,'Check');
  assert.equal(w.invoiceFinancials(w.load(),inv).status,'Paid');
  assert.equal(w.recordPayment(inv.id,10),null);
});

test('existing issued and partially paid invoices cannot be edited through the draft API',()=>{
  const {w}=demo(),before=snapshot(w);
  assert.throws(()=>w.updateInvoiceDraft('inv-1043',{notes:'Changed'}),/Only draft/);
  assert.equal(snapshot(w),before);
});

test('invalid payment amounts cannot create misleading demo payment records',()=>{
  const {w}=demo(),before=snapshot(w);
  for(const amount of [NaN,Infinity,'not a number'])assert.throws(()=>w.recordPayment('inv-1043',amount),/Invalid payment amount/);
  assert.equal(snapshot(w),before);
});

test('draft edits update amounts and notes while preserving immutable document identity',()=>{
  const {w}=demo(),inv=w.createInvoiceDraft(input()),signature=w.invoiceDraftSignature(inv);
  const edited=w.updateInvoiceDraft(inv.id,{items:[{description:'Flooring repair',qty:2,unit:'Project',unitPrice:150}],discount:25,notes:'Revised',status:'Open',customerVisible:true},{expectedSignature:signature});
  assert.equal(edited.id,inv.id);
  assert.equal(edited.projectId,'project-2');
  assert.equal(edited.appointmentId,'appointment-2');
  assert.equal(edited.estimateId,'est-1042');
  assert.equal(edited.status,'Draft');
  assert.equal(edited.customerVisible,false);
  assert.equal(w.invoiceFinancials(w.load(),edited).total,275);
  for(const [field,value] of [['projectId','project-1'],['appointmentId','another'],['estimateId','est-1043'],['customer','Other'],['number','INV-OTHER']]) {
    const before=snapshot(w);
    assert.throws(()=>w.updateInvoiceDraft(inv.id,{[field]:value}),/cannot be changed/);
    assert.equal(snapshot(w),before);
  }
});

test('a stale draft editor cannot overwrite a more recent change',()=>{
  const {w}=demo(),inv=w.createInvoiceDraft(input()),signature=w.invoiceDraftSignature(inv);
  w.updateInvoiceDraft(inv.id,{notes:'Newer edit'},{expectedSignature:signature});
  const before=snapshot(w);
  assert.throws(()=>w.updateInvoiceDraft(inv.id,{notes:'Stale edit'},{expectedSignature:signature}),/fresh preview/);
  assert.equal(snapshot(w),before);
});

test('project, estimate and appointment references must agree',()=>{
  const {w}=demo(),before=snapshot(w);
  assert.throws(()=>w.createInvoiceDraft(input({estimateId:'est-1043'})),/Estimate does not belong/);
  assert.throws(()=>w.createInvoiceDraft(input({appointmentId:'appointment-1'})),/Appointment does not belong/);
  assert.throws(()=>w.createInvoiceDraft(input({projectId:'unknown',estimateId:null,appointmentId:null})),/Project not found/);
  assert.equal(snapshot(w),before);
});

test('multiple appointments require a selection and never cross-link a different appointment',()=>{
  const {w}=demo([{id:2,projectId:'project-2',appointmentId:'a2'},{id:3,projectId:'project-2',appointmentId:'a3'}]);
  assert.throws(()=>w.createInvoiceDraft(input({appointmentId:null})),/specific project appointment/);
  const inv=w.createInvoiceDraft(input({appointmentId:'a3',estimateId:null}));
  assert.equal(w.bundleForJob({id:2,projectId:'project-2',appointmentId:'a2'}).invoice,null);
  assert.equal(w.bundleForJob({id:3,projectId:'project-2',appointmentId:'a3'}).invoice.id,inv.id);
});

test('a standalone draft is visible in its Office job context without creating or approving an estimate',()=>{
  const job={id:8,projectId:'project-8',appointmentId:'a8',customer:'Demo Customer',company:'Direct Homeowner',service:'Repair',sf:'1 Project'};
  const {w,docs}=demo([job]),count=w.load().estimates.length;
  const inv=w.createInvoiceDraft(input({projectId:'project-8',appointmentId:'a8',estimateId:null,customer:'Demo Customer',projectCustomer:'Demo Customer'}));
  assert.equal(w.load().estimates.length,count);
  assert.equal(w.bundleForJob(job).estimate,null);
  assert.equal(w.bundleForJob(job).invoice.id,inv.id);
  assert.equal(docs.ensureForJob(job).docs.invoice.id,inv.id);
  assert.equal(w.getCustomerBundles('Demo Customer')[0].invoice,null);
});

test('invalid monetary fields, empty items and excessive discounts never mutate the draft',()=>{
  const {w}=demo(),inv=w.createInvoiceDraft(input());
  for(const patch of [{items:[]},{items:[{description:'Bad',qty:0,unitPrice:4}]},{items:[{description:'Bad',qty:1,unitPrice:NaN}]},{taxRate:101},{discount:401},{dueDate:'2026-02-30'}]) {
    const before=snapshot(w);
    assert.throws(()=>w.updateInvoiceDraft(inv.id,patch));
    assert.equal(snapshot(w),before);
  }
});

test('draft items are copied as safe fields instead of retaining caller-controlled nested data',()=>{
  const {w}=demo(),payload=input();payload.items[0].privateSecret='not stored';
  const inv=w.createInvoiceDraft(payload);payload.items[0].description='Mutated later';
  assert.equal(w.load().invoices.find(i=>i.id===inv.id).items[0].description,'Sand & Finish');
  assert.equal(inv.items[0].privateSecret,undefined);
});

function issueOptions(preview) {
  return {estimateId:preview.estimateId,expectedSignature:preview.signature,expectedEstimateSignature:preview.estimateSignature,expectedIssued:preview.issued,confirmed:true};
}

test('issue preview makes no write and explicit confirmation opens the reviewed draft for the client and demo payments',()=>{
  const {w}=demo();w.setEstimateStatus('est-1042','Approved');
  const draft=w.createInvoiceDraft(input()),before=snapshot(w),preview=w.prepareInvoiceDraftIssue(draft.id);
  assert.equal(snapshot(w),before);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,{...issueOptions(preview),confirmed:false}),/explicitly confirm/);
  assert.equal(snapshot(w),before);
  const issued=w.issueInvoiceDraft(draft.id,issueOptions(preview));
  assert.equal(issued.status,'Open');assert.equal(issued.customerVisible,true);assert.equal(issued.issuedLocally,true);
  assert.equal(issued.issued,preview.issued);assert.equal(issued.id,draft.id);assert.equal(issued.appointmentId,'appointment-2');
  assert.equal(w.invoiceFinancials(w.load(),issued).total,400);
  assert.equal(w.getCustomerBundle('Emily Carter','project-2').invoice.id,issued.id);
  w.recordPayment(issued.id,100,'Check');assert.equal(w.invoiceFinancials(w.load(),issued).status,'Partially Paid');
  w.recordPayment(issued.id,300,'Check');assert.equal(w.invoiceFinancials(w.load(),issued).status,'Paid');
  assert.throws(()=>w.issueInvoiceDraft(issued.id,issueOptions(preview)),/Only draft/);
});

test('a standalone draft requires an explicitly selected approved source in the same project and appointment',()=>{
  const {w}=demo(),draft=w.createInvoiceDraft(input({estimateId:null})),before=snapshot(w);
  assert.throws(()=>w.prepareInvoiceDraftIssue(draft.id),/Choose an approved estimate/);
  assert.throws(()=>w.prepareInvoiceDraftIssue(draft.id,'est-1042'),/must be approved/);
  assert.throws(()=>w.prepareInvoiceDraftIssue(draft.id,'est-1043'),/does not belong to this project/);
  assert.equal(snapshot(w),before);assert.equal(w.getEstimate('est-1042').status,'Sent');
  w.setEstimateStatus('est-1042','Approved');let state=w.load();state.estimates.find(e=>e.id==='est-1042').appointmentId='another-appointment';w.save(state);
  const wrongScope=snapshot(w);assert.throws(()=>w.prepareInvoiceDraftIssue(draft.id,'est-1042'),/does not belong to this appointment/);assert.equal(snapshot(w),wrongScope);
  state=w.load();delete state.estimates.find(e=>e.id==='est-1042').appointmentId;w.save(state);
  const issued=w.issueInvoiceDraft(draft.id,issueOptions(w.prepareInvoiceDraftIssue(draft.id,'est-1042')));
  assert.equal(issued.estimateId,'est-1042');assert.equal(w.getEstimate('est-1042').status,'Approved');
});

test('issuing refuses missing, stale draft, stale estimate and stale date confirmation snapshots',()=>{
  const {w}=demo();w.setEstimateStatus('est-1042','Approved');const draft=w.createInvoiceDraft(input());
  let preview=w.prepareInvoiceDraftIssue(draft.id),before=snapshot(w);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,{confirmed:true}),/fresh preview/);assert.equal(snapshot(w),before);
  w.updateInvoiceDraft(draft.id,{notes:'Newer change'});before=snapshot(w);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,issueOptions(preview)),/fresh preview/);assert.equal(snapshot(w),before);
  preview=w.prepareInvoiceDraftIssue(draft.id);const state=w.load();state.estimates.find(e=>e.id==='est-1042').notes='Revised approval source';w.save(state);before=snapshot(w);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,issueOptions(preview)),/fresh preview/);assert.equal(snapshot(w),before);
  preview=w.prepareInvoiceDraftIssue(draft.id);assert.throws(()=>w.issueInvoiceDraft(draft.id,{...issueOptions(preview),expectedIssued:'2000-01-01'}),/fresh preview/);assert.equal(snapshot(w),before);
});

test('issuing never bypasses duplicate scope, revoked approval or any existing payment',()=>{
  const {w}=demo();w.setEstimateStatus('est-1042','Approved');const draft=w.createInvoiceDraft(input()),preview=w.prepareInvoiceDraftIssue(draft.id);
  let state=w.load();state.invoices.push({...draft,id:'competing-invoice',status:'Open'});w.save(state);let before=snapshot(w);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,issueOptions(preview)),/already exists/);assert.equal(snapshot(w),before);
  state=w.load();state.invoices=state.invoices.filter(i=>i.id!=='competing-invoice');state.payments.push({invoiceId:draft.id,amount:0});w.save(state);before=snapshot(w);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,issueOptions(preview)),/with payments/);assert.equal(snapshot(w),before);
  state=w.load();state.payments=state.payments.filter(p=>p.invoiceId!==draft.id);w.save(state);w.setEstimateStatus('est-1042','Sent');before=snapshot(w);
  assert.throws(()=>w.issueInvoiceDraft(draft.id,issueOptions(preview)),/must be approved/);assert.equal(snapshot(w),before);
});

test('issuing revalidates stored monetary fields, items, due date and appointment without a write',()=>{
  for(const patch of [{items:[]},{items:[{description:'Bad',qty:0,unit:'SF',unitPrice:4}]},{taxRate:101},{discount:401},{dueDate:'2026-02-30'},{dueDate:'2000-01-01'},{appointmentId:'unrelated'}]) {
    const {w}=demo();w.setEstimateStatus('est-1042','Approved');const draft=w.createInvoiceDraft(input()),preview=w.prepareInvoiceDraftIssue(draft.id),state=w.load();
    Object.assign(state.invoices.find(i=>i.id===draft.id),patch);w.save(state);const before=snapshot(w);
    assert.throws(()=>w.issueInvoiceDraft(draft.id,issueOptions(preview)));assert.equal(snapshot(w),before);
  }
});

test('issuing preserves contractor and hidden-source customer visibility rules',()=>{
  for(const source of [{customerType:'contractor',customerVisible:false},{customerType:'direct',customerVisible:false}]) {
    const {w}=demo();w.setEstimateStatus('est-1042','Approved');const state=w.load();Object.assign(state.estimates.find(e=>e.id==='est-1042'),source);w.save(state);
    const draft=w.createInvoiceDraft(input()),preview=w.prepareInvoiceDraftIssue(draft.id),issued=w.issueInvoiceDraft(draft.id,issueOptions(preview));
    assert.equal(preview.customerVisible,false);assert.equal(issued.status,'Open');assert.equal(issued.customerVisible,false);
    assert.equal(w.getCustomerBundle('Emily Carter','project-2').invoice,null);
  }
});
