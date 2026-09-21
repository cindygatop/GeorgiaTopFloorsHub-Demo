(function(){
const KEY='gtfWorkflowV2';
const uid=(p='id')=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const clone=v=>JSON.parse(JSON.stringify(v));
const money=v=>Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const today='2026-09-21';

const seed={
 services:[
  {id:'svc-sf',description:'Sand & Finish',unit:'SF'},
  {id:'svc-install',description:'Hardwood Installation',unit:'SF'},
  {id:'svc-buff',description:'Buff & Coat',unit:'SF'},
  {id:'svc-repair',description:'Flooring Repair',unit:'Project'},
  {id:'svc-stairs',description:'Staircase Installation & Finishing',unit:'EA'},
  {id:'svc-shoe',description:'Shoe Molding',unit:'LF'},
  {id:'svc-furniture',description:'Furniture Handling',unit:'Project'}
 ],
 estimates:[
  {id:'est-1042',number:'EST-1042',customer:'Emily Carter',company:'Direct Homeowner',customerType:'direct',address:'410 Lakeview Ln, Roswell, GA',status:'Sent',issued:'Sep 18, 2026',validUntil:'Oct 18, 2026',taxRate:0,discount:0,customerVisible:true,notes:'Stain samples will be selected onsite before final staining.',items:[
    {id:'li-1',description:'Sand & Finish',qty:980,unit:'SF',unitPrice:4.00},
    {id:'li-2',description:'Water-based finish upgrade',qty:980,unit:'SF',unitPrice:0.50},
    {id:'li-3',description:'Furniture Handling',qty:1,unit:'Project',unitPrice:350.00}
  ]},
  {id:'est-1043',number:'EST-1043',customer:'John Miller',company:'Alpha',customerType:'contractor',address:'2850 Windward Pkwy, Alpharetta, GA',status:'Approved',issued:'Sep 17, 2026',validUntil:'Oct 17, 2026',taxRate:0,discount:0,customerVisible:false,notes:'Contractor-originated project. Homeowner financial visibility disabled.',items:[
    {id:'li-4',description:'Hardwood Installation',qty:1240,unit:'SF',unitPrice:3.25},
    {id:'li-5',description:'Shoe Molding',qty:280,unit:'LF',unitPrice:1.35}
  ],approvedAt:'Sep 18, 2026'},
  {id:'est-1044',number:'EST-1044',customer:'Sarah Brooks',company:'Direct Homeowner',customerType:'direct',address:'1555 North Point Dr, Alpharetta, GA',status:'Draft',issued:'Sep 21, 2026',validUntil:'Oct 21, 2026',taxRate:0,discount:100,customerVisible:true,notes:'Estimate Not Closed follow-up candidate.',items:[
    {id:'li-6',description:'Buff & Coat',qty:760,unit:'SF',unitPrice:2.50}
  ]}
 ],
 workOrders:[
  {id:'wo-1043',number:'WO-1043',estimateId:'est-1043',customer:'John Miller',company:'Alpha',address:'2850 Windward Pkwy, Alpharetta, GA',status:'Released',service:'Hardwood Installation',area:'1,240 SF',arrival:'8:00–9:00 AM',manager:'André',crew:'Carlos + Edilson',stain:'Natural',finish:'Site-finished hardwood',scope:['Hardwood Installation — 1240 SF','Shoe Molding — 280 LF'],materials:['3¼\" white oak','Shoe molding','Installation supplies'],notes:'No customer pricing is included in this Work Order.'}
 ],
 invoices:[
  {id:'inv-1043',number:'INV-1043',estimateId:'est-1043',customer:'Alpha',projectCustomer:'John Miller',company:'Alpha',customerType:'contractor',address:'2850 Windward Pkwy, Alpharetta, GA',status:'Partially Paid',issued:'Sep 18, 2026',dueDate:'Sep 21, 2026',paymentRule:'70% initial / 30% final',customerVisible:false,notes:'Internal contractor billing example.',items:[
    {description:'Hardwood Installation',qty:1240,unit:'SF',unitPrice:3.25},
    {description:'Shoe Molding',qty:280,unit:'LF',unitPrice:1.35}
  ],taxRate:0,discount:0}
 ],
 payments:[
  {id:'pay-1043-1',invoiceId:'inv-1043',invoiceNumber:'INV-1043',customer:'Alpha',date:'Sep 19, 2026',amount:3084.20,method:'Other',note:'Demo initial payment'}
 ]
};

function load(){
 try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&x.estimates&&x.workOrders&&x.invoices&&x.payments)return x;}catch(e){}
 const s=clone(seed);save(s);return s;
}
function save(s){localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new CustomEvent('gtf-workflow-changed'));return s;}
function reset(){localStorage.removeItem(KEY);const s=clone(seed);save(s);return s;}
function nextNumber(prefix,arr){let max=1040;arr.forEach(x=>{const m=String(x.number||'').match(/(\d+)$/);if(m)max=Math.max(max,Number(m[1]));});return `${prefix}-${max+1}`;}
function lineAmount(i){return Number(i.qty||0)*Number(i.unitPrice||0);}
function totals(doc){const subtotal=(doc.items||[]).reduce((s,i)=>s+lineAmount(i),0);const tax=subtotal*(Number(doc.taxRate||0)/100);const discount=Number(doc.discount||0);return {subtotal,tax,discount,total:Math.max(0,subtotal+tax-discount)};}
function paidForInvoice(s,invoiceId){return s.payments.filter(p=>p.invoiceId===invoiceId).reduce((a,p)=>a+Number(p.amount||0),0);}
function invoiceFinancials(s,inv){const t=totals(inv),paid=paidForInvoice(s,inv.id),balance=Math.max(0,t.total-paid);let status=inv.status;if(balance<=0&&t.total>0)status='Paid';else if(paid>0)status='Partially Paid';else if(status==='Paid')status='Open';return {...t,paid,balance,status};}
function getEstimate(id){return load().estimates.find(x=>x.id===id)||null;}
function getEstimateByCustomer(name){return load().estimates.find(x=>x.customer===name)||null;}
function getWorkOrderByEstimate(estId){return load().workOrders.find(x=>x.estimateId===estId)||null;}
function getInvoiceByEstimate(estId){return load().invoices.find(x=>x.estimateId===estId)||null;}
function getReleasedWorkOrders(){return load().workOrders.filter(x=>x.status==='Released');}
function saveEstimate(input){
 const s=load();let e;
 if(input.id){e=s.estimates.find(x=>x.id===input.id);if(!e)throw new Error('Estimate not found');Object.assign(e,input);}
 else{e={...input,id:uid('est'),number:nextNumber('EST',s.estimates),status:input.status||'Draft',issued:input.issued||today,validUntil:input.validUntil||'',customerVisible:input.customerType!=='contractor'};s.estimates.unshift(e);}
 save(s);return e;
}
function setEstimateStatus(id,status){const s=load(),e=s.estimates.find(x=>x.id===id);if(!e)return null;e.status=status;if(status==='Approved')e.approvedAt=today;save(s);return e;}
function createWorkOrder(estId,extra={}){const s=load(),e=s.estimates.find(x=>x.id===estId);if(!e)throw new Error('Estimate not found');if(e.status!=='Approved')throw new Error('Estimate must be approved first');let w=s.workOrders.find(x=>x.estimateId===estId);if(w)return w;const primary=e.items[0]||{};w={id:uid('wo'),number:nextNumber('WO',s.workOrders),estimateId:e.id,customer:e.customer,company:e.company,address:e.address,status:'Draft',service:primary.description||'Project',area:primary.qty&&primary.unit?`${primary.qty} ${primary.unit}`:'Project',arrival:extra.arrival||'8:00–9:00 AM',manager:extra.manager||'To assign',crew:extra.crew||'To assign',stain:extra.stain||'To confirm onsite',finish:extra.finish||'To confirm',scope:e.items.map(i=>`${i.description} — ${i.qty} ${i.unit}`),materials:['To confirm before service'],notes:extra.notes||e.notes||''};s.workOrders.unshift(w);save(s);return w;}
function updateWorkOrder(id,patch){const s=load(),w=s.workOrders.find(x=>x.id===id);if(!w)return null;Object.assign(w,patch);save(s);return w;}
function releaseWorkOrder(id){return updateWorkOrder(id,{status:'Released'});}
function createInvoice(estId,extra={}){const s=load(),e=s.estimates.find(x=>x.id===estId);if(!e)throw new Error('Estimate not found');if(e.status!=='Approved')throw new Error('Estimate must be approved first');let inv=s.invoices.find(x=>x.estimateId===estId);if(inv)return inv;inv={id:uid('inv'),number:nextNumber('INV',s.invoices),estimateId:e.id,customer:e.company==='Direct Homeowner'?e.customer:e.company,projectCustomer:e.customer,company:e.company,customerType:e.customerType,address:e.address,status:'Open',issued:extra.issued||today,dueDate:extra.dueDate||today,paymentRule:extra.paymentRule||'70% initial / 30% final',customerVisible:e.customerType!=='contractor'&&e.customerVisible!==false,notes:extra.notes||'Generated from approved estimate.',items:clone(e.items),taxRate:e.taxRate||0,discount:e.discount||0};s.invoices.unshift(inv);save(s);return inv;}
function recordPayment(invoiceId,amount,method='Other',note=''){const s=load(),inv=s.invoices.find(x=>x.id===invoiceId);if(!inv)throw new Error('Invoice not found');const f=invoiceFinancials(s,inv);const amt=Math.max(0,Math.min(Number(amount||0),f.balance));if(!amt)return null;const p={id:uid('pay'),invoiceId:inv.id,invoiceNumber:inv.number,customer:inv.customer,date:today,amount:amt,method,note};s.payments.unshift(p);save(s);return p;}
function approveCustomerEstimate(customerName){const s=load(),e=s.estimates.find(x=>x.customer===customerName&&x.customerVisible!==false);if(!e)return null;e.status='Approved';e.approvedAt=today;save(s);return e;}
function getCustomerBundle(customerName){const s=load();const e=s.estimates.find(x=>x.customer===customerName);if(!e)return null;const w=s.workOrders.find(x=>x.estimateId===e.id)||null;const inv=s.invoices.find(x=>x.estimateId===e.id)||null;return {estimate:e,workOrder:w,invoice:inv,invoiceFinancials:inv?invoiceFinancials(s,inv):null};}
function bundleForJob(job){const s=load();const e=s.estimates.find(x=>x.customer===job.customer)||null;return {estimate:e,workOrder:e?s.workOrders.find(x=>x.estimateId===e.id)||null:null,invoice:e?s.invoices.find(x=>x.estimateId===e.id)||null:null};}
function ensureEstimateForJob(job){let e=getEstimateByCustomer(job.customer);if(e)return e;return saveEstimate({customer:job.customer,company:job.company,customerType:job.company==='Direct Homeowner'?'direct':'contractor',address:job.address,status:'Draft',issued:today,validUntil:'Oct 21, 2026',taxRate:0,discount:0,customerVisible:job.company==='Direct Homeowner',notes:job.notes||'',items:[{id:uid('li'),description:job.service,qty:parseFloat(String(job.sf||'1').replace(/,/g,''))||1,unit:String(job.sf||'').includes('SF')?'SF':'Project',unitPrice:0}]});}

// Compatibility layer for the previous demo buttons.
const GTFDocs={
 money,
 ensureForJob(job){const e=ensureEstimateForJob(job),s=load();const w=s.workOrders.find(x=>x.estimateId===e.id)||{number:'Not created',status:'Not created',service:job.service,area:job.sf,arrival:job.window,manager:job.manager,crew:job.crew,stain:job.stain,finish:'To confirm',scope:[job.service],materials:[job.materials||'To confirm'],notes:job.notes||''};const inv=s.invoices.find(x=>x.estimateId===e.id);const tf=totals(e);const invoice=inv?Object.assign({},inv,invoiceFinancials(s,inv)):{number:'Not created',status:'Not created',issued:'—',dueDate:'—',total:tf.total,paid:0,balance:tf.total,paymentRule:'—',notes:'Create from approved Estimate.'};return {key:e.id,docs:{estimate:{...e,...tf},workOrder:w,invoice}};},
 approveEstimate(id){return setEstimateStatus(id,'Approved');},
 recordFinalPayment(id){const s=load();const inv=s.invoices.find(x=>x.estimateId===id)||s.invoices.find(x=>x.id===id);if(!inv)return null;const f=invoiceFinancials(s,inv);return recordPayment(inv.id,f.balance,'Demo Payment','Paid from demo');},
 releaseWorkOrder(id){const s=load();const w=s.workOrders.find(x=>x.estimateId===id)||s.workOrders.find(x=>x.id===id);return w?releaseWorkOrder(w.id):null;},
 get(key){const e=getEstimate(key)||getEstimateByCustomer(key==='emily-carter'?'Emily Carter':key);if(!e)return null;const s=load(),w=s.workOrders.find(x=>x.estimateId===e.id)||null,inv=s.invoices.find(x=>x.estimateId===e.id)||null;const tf=totals(e),fin=inv?invoiceFinancials(s,inv):null;return {project:{customer:e.customer,company:e.company,address:e.address},visibility:{customerEstimate:e.customerVisible!==false,customerInvoice:inv?inv.customerVisible!==false:false,crewWorkOrder:!!w},estimate:{...e,...tf},workOrder:w,invoice:inv?{...inv,...fin}:null};},
 resetDemo:reset
};

window.GTFWorkflow={KEY,money,lineAmount,totals,load,save,reset,nextNumber,getEstimate,getEstimateByCustomer,getWorkOrderByEstimate,getInvoiceByEstimate,getReleasedWorkOrders,saveEstimate,setEstimateStatus,createWorkOrder,updateWorkOrder,releaseWorkOrder,createInvoice,recordPayment,invoiceFinancials,approveCustomerEstimate,getCustomerBundle,bundleForJob,ensureEstimateForJob};
window.GTFDocs=GTFDocs;
})();