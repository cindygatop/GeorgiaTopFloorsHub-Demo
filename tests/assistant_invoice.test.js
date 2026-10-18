'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const assistantSource=fs.readFileSync(path.join(__dirname,'..','assistant.js'),'utf8');
const workflowSource=fs.readFileSync(path.join(__dirname,'..','project-docs.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const job=patch=>({id:2,projectId:'project-2',appointmentId:'appointment-2',customer:'Emily Carter',company:'Direct Homeowner',address:'Fictional property in Roswell, GA',service:'Sand & Finish',date:'2026-10-16',window:'8:00–9:00 AM',crew:'Crew A',status:'Scheduled',...patch});

function fixture({jobs=[job()],role='office',storageFails=false}={}){
 const nodes=new Map(),listeners={},data=new Map([['gtfDemoJobs',JSON.stringify(jobs)]]),writes=[],network=[],queues=[];
 let user={name:'Cindy',role};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',dataset:{},listeners:{},addEventListener(event,listener){this.listeners[event]=listener;}});return nodes.get(id);};
 class GeorgiaDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-15T15:00:00Z']));}static now(){return Date.parse('2026-10-15T15:00:00Z');}}
 const window={addEventListener(){},dispatchEvent(){},GTFAuth:{currentUser:()=>user},GTFJobs:()=>jobs,persist(){data.set('gtfDemoJobs',JSON.stringify(jobs));writes.push('jobs');},GTFIntegrations:{notifications:()=>[],queueCalendarSync(){queues.push('calendar');return{status:'setup-required'};},queueCrewSMS(){queues.push('sms');return{status:'setup-required'};}}};
 const context={window,Date:GeorgiaDate,Intl,URLSearchParams,CustomEvent:class{},document:{getElementById:node,addEventListener(event,listener){listeners[event]=listener;}},location:{href:''},navigator:{},localStorage:{getItem:key=>data.get(key)??null,setItem(key,value){if(storageFails&&writes.enabled)throw new Error('Storage full');data.set(key,value);writes.push(key);},removeItem:key=>data.delete(key)},sessionStorage:{getItem:()=>null,setItem(){}},fetch(){network.push('fetch');throw new Error('Demo must not call a provider');}};
 vm.runInNewContext(workflowSource,context);
 const workflow=window.GTFWorkflow;workflow.load();writes.length=0;writes.enabled=true;
 vm.runInNewContext(assistantSource,context);listeners.DOMContentLoaded();
 return{assistant:window.GTFAssistant,workflow,jobs,writes,network,queues,
  state:()=>clone(workflow.load()),
  reply:()=>node('assistantConversation').innerHTML.split('<article class="assistant-message assistant">').pop(),
  process(text){window.GTFAssistant.process(text);},
  action(value){node('assistantConversation').listeners.click({target:{closest:()=>({dataset:{assistantAction:value}})}});},
  token(){return this.reply().match(/data-assistant-action="invoice-confirm:(\d+)"/)?.[1];},
  role(value){user={...user,role:value};},
  useSingleLine(){const state=workflow.load();state.estimates.find(e=>e.id==='est-1042').items=[{description:'Sand & Finish',qty:980,unit:'SF',unitPrice:4}];workflow.save(state);writes.length=0;},
  draft(){return workflow.load().invoices.find(i=>i.projectId==='project-2');}
 };
}

test('informal Portuguese, greeting and invoice typo select the exact project before any writes',()=>{
 const d=fixture({jobs:[job(),job({id:92,projectId:'project-92',appointmentId:'appointment-92',address:'Other fictional property, Marietta, GA'})]});
 const before=d.state();d.process('bom dia cria uma incoice pra Emily');
 assert.match(d.reply(),/mais de um projeto ou appointment/);assert.match(d.reply(),/appointment-2/);assert.match(d.reply(),/appointment-92/);
 assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);
 d.process('1');assert.match(d.reply(),/vencimento/);assert.equal(d.writes.length,0);
 d.process('vencimento amanhã');assert.ok(d.token());assert.match(d.reply(),/project-2/);assert.match(d.reply(),/Appointment: appointment-2/);assert.match(d.reply(),/ainda não foi aprovado/);
 assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);assert.deepEqual(d.network,[]);
 d.process('sim');const draft=d.draft();assert.equal(draft.status,'Draft');assert.equal(draft.customerVisible,false);assert.equal(draft.appointmentId,'appointment-2');assert.equal(draft.estimateId,'est-1042');assert.equal(draft.dueDate,'2026-10-16');
 assert.equal(d.state().estimates.find(e=>e.id==='est-1042').status,'Sent');assert.equal(d.state().payments.length,before.payments.length);assert.equal(d.writes.length,1);assert.deepEqual(d.queues,[]);
 assert.match(d.reply(),/Nada foi enviado, emitido, cobrado ou pago/);
});

test('generic fatura asks for a customer and gathers missing manual fields without inventing a price',()=>{
 const d=fixture({jobs:[job({id:77,projectId:'project-77',appointmentId:'appointment-77',customer:'QA Sample Person'})]});
 const before=d.state();d.process('uai faz uma fatura');assert.match(d.reply(),/qual cliente e projeto/);assert.equal(d.writes.length,0);
 d.process('QA Sample Person');assert.match(d.reply(),/quantidade/);
 d.process('quantidade 100; preço unitário 4.50');assert.match(d.reply(),/vencimento/);assert.equal(d.writes.length,0);
 d.process('vencimento 2026-11-01');assert.ok(d.token());assert.match(d.reply(),/\$450\.00/);assert.deepEqual(d.state(),before);
 d.process('bora');const created=d.state().invoices.find(i=>i.projectId==='project-77');assert.equal(created.items[0].unitPrice,4.5);assert.equal(created.items[0].qty,100);assert.equal(created.estimateId,null);assert.equal(created.status,'Draft');
});

test('bare numeric follow-ups use only the explicitly requested quantity and unit-price fields',()=>{
 const d=fixture({jobs:[job({id:77,projectId:'project-77',appointmentId:'appointment-77',customer:'QA Sample Person'})]});
 d.process('cria fatura pra QA Sample Person');d.process('100');assert.match(d.reply(),/preço unitário/);
 d.process('4,50');assert.match(d.reply(),/vencimento/);d.process('amanhã');assert.ok(d.token());assert.match(d.reply(),/\$450\.00/);assert.equal(d.writes.length,0);
});

test('draft preview survives conversation, requires its own current confirmation token and is cancelable',()=>{
 const d=fixture();d.process('cria invoice Emily vencimento 2026-10-30');const token=d.token(),before=d.state();assert.ok(token);
 d.process('bom dia');assert.equal(d.token(),token);assert.match(d.reply(),/nada foi salvo/);assert.equal(d.writes.length,0);
 d.process('obrigada');assert.equal(d.token(),token);
 d.action('confirm:'+token);assert.equal(d.writes.length,0);
 d.action('invoice-cancel');d.action('invoice-confirm:'+token);assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);
 d.process('cria invoice Emily vencimento 2026-11-02');const nextToken=d.token();assert.notEqual(nextToken,token);
 d.action('invoice-confirm:'+token);assert.equal(d.writes.length,0);d.action('invoice-confirm:'+nextToken);assert.equal(d.writes.length,1);
});

test('editing the last identified invoice uses document, project and appointment IDs with a fresh preview',()=>{
 const d=fixture();d.useSingleLine();d.process('faz uma fatura pra Emily vencimento 2026-10-30');d.process('sim');const original=d.draft(),before=d.state();
 d.writes.length=0;d.process('altera isso');assert.match(d.reply(),/O que você quer alterar/);assert.equal(d.writes.length,0);
 d.process('preço unitário 5.25');const token=d.token();assert.ok(token);assert.match(d.reply(),/\$5,145\.00/);assert.deepEqual(d.state(),before);
 d.action('invoice-confirm:'+token);const after=d.draft();assert.equal(after.id,original.id);assert.equal(after.projectId,original.projectId);assert.equal(after.appointmentId,original.appointmentId);assert.equal(after.items[0].unitPrice,5.25);assert.equal(after.status,'Draft');assert.equal(d.writes.length,1);
});

test('a price edit in a multi-line invoice asks which line and preserves all the others',()=>{
 const d=fixture();d.process('cria invoice Emily vencimento 2026-10-30');d.process('sim');const original=d.draft();d.writes.length=0;
 d.process('edita essa invoice preço unitário 8');assert.match(d.reply(),/Qual item/);assert.equal(d.writes.length,0);
 d.process('2');assert.ok(d.token());assert.equal(d.writes.length,0);d.process('pode salvar');const after=d.draft();
 assert.equal(after.items[1].unitPrice,8);assert.deepEqual(after.items[0],original.items[0]);assert.deepEqual(after.items[2],original.items[2]);
});

test('altera isso without a current invoice context asks what record instead of choosing a customer',()=>{
 const d=fixture();const before=d.state();d.process('altera isso');assert.match(d.reply(),/O que você quer alterar/);assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);
 d.process('cria invoice Emily vencimento 2026-10-30');d.process('sim');d.writes.length=0;
 d.process('como conectar Gmail?');d.process('altera isso');assert.match(d.reply(),/O que você quer alterar/);assert.equal(d.writes.length,0);
});

test('issued and paid invoices are preserved and are never duplicated by chat',()=>{
 const d=fixture({jobs:[job({id:1,projectId:'project-1',appointmentId:'appointment-1',customer:'John Miller',company:'Alpha'})]});
 const before=d.state();d.process('cria invoice John Miller');assert.match(d.reply(),/já tem invoice/);d.process('1');assert.match(d.reply(),/já foi emitida ou tem pagamentos/);assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);
 d.process('edit invoice John Miller price 2');assert.match(d.reply(),/issued or has payments/);assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);
});

test('payment and sending requests never confirm or mutate a prepared invoice',()=>{
 const d=fixture();d.process('cria invoice Emily vencimento 2026-10-30');const token=d.token(),before=d.state();
 d.process('envia essa invoice');assert.match(d.reply(),/Não enviei nada/);assert.equal(d.token(),token);
 d.process('marca essa invoice como paga');assert.match(d.reply(),/Não registrei pagamento/);assert.equal(d.token(),token);assert.equal(d.writes.length,0);assert.deepEqual(d.state(),before);assert.deepEqual(d.network,[]);
});

test('invoice and schedule previews cannot silently replace or confirm each other',()=>{
 const d=fixture();d.process('cria invoice Emily vencimento 2026-10-30');const token=d.token(),before=d.state();
 d.process('muda o job Emily para amanhã às 14h30');assert.match(d.reply(),/Há uma invoice em preparação/);assert.equal(d.token(),token);assert.equal(d.writes.length,0);
 d.action('invoice-cancel');d.process('muda o job Emily para amanhã às 14h30');assert.match(d.reply(),/Timezone/);
 d.process('cria fatura Emily');assert.match(d.reply(),/Há um reagendamento pendente/);d.action('invoice-confirm:'+token);assert.equal(d.writes.length,0);assert.deepEqual(d.state(),before);
});

test('stale projects, source estimates or invoices invalidate confirmation without writes',()=>{
 for(const change of ['job','estimate','invoice']){
  const d=fixture();if(change==='invoice'){d.process('cria invoice Emily vencimento 2026-10-30');d.process('sim');d.process('altera essa invoice vencimento 2026-11-01');}else d.process('cria invoice Emily vencimento 2026-10-30');
  const token=d.token();assert.ok(token,change);
  if(change==='job')d.jobs[0].address='Changed fictional property';else{const s=d.workflow.load();if(change==='estimate')s.estimates.find(e=>e.id==='est-1042').items[0].unitPrice=99;else s.invoices.find(i=>i.projectId==='project-2').notes='Changed in another tab';d.workflow.save(s);}
  const before=d.state();d.writes.length=0;d.action('invoice-confirm:'+token);assert.match(d.reply(),/mudou desde a prévia/);assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0);
 }
});

test('negative, ambiguous and impossible values do not reach a save preview',()=>{
 for(const input of ['preço unitário -5','preço unitário 1.000','quantidade 0','vencimento 2026-02-30']){
  const d=fixture();d.useSingleLine();d.process('cria invoice Emily');const before=d.state();d.process(input);assert.equal(d.token(),undefined,input);assert.deepEqual(d.state(),before);assert.equal(d.writes.length,0,input);
 }
});

test('permission is checked again on confirmation and browser storage failure is reported honestly',()=>{
 const d=fixture();d.process('cria invoice Emily vencimento 2026-10-30');const token=d.token();d.role('crew');d.action('invoice-confirm:'+token);assert.match(d.reply(),/Somente um perfil Office/);assert.equal(d.writes.length,0);
 const denied=fixture({role:'client'});denied.process('cria invoice Emily');assert.match(denied.reply(),/Somente um perfil Office/);assert.equal(denied.writes.length,0);
 const failed=fixture({storageFails:true});const before=failed.state();failed.process('cria invoice Emily vencimento 2026-10-30');assert.ok(failed.token());failed.process('sim');assert.match(failed.reply(),/Não consegui confirmar a gravação/);assert.deepEqual(failed.state(),before);assert.equal(failed.writes.length,0);
});

test('estimate requests get a document distinction and guidance rather than a monthly budget response',()=>{
 const d=fixture();d.process('faz um orçamento pra Emily');assert.match(d.reply(),/Orçamento é Estimate/);assert.doesNotMatch(d.reply(),/US\$45|mensal/);assert.equal(d.writes.length,0);
});

test('invoice identifiers locate the exact document and never match a longer number prefix',()=>{
 const d=fixture();d.useSingleLine();d.process('cria invoice Emily vencimento 2026-10-30');d.process('sim');const invoice=d.draft();d.writes.length=0;
 d.process(`edita ${invoice.number} preço unitário 6`);assert.ok(d.token());assert.match(d.reply(),/project-2/);assert.equal(d.writes.length,0);d.process('sim');assert.equal(d.draft().id,invoice.id);assert.equal(d.draft().items[0].unitPrice,6);
 d.process(`edita ${invoice.number}9 preço unitário 7`);assert.match(d.reply(),/qual cliente e projeto/);assert.equal(d.draft().items[0].unitPrice,6);
});

test('foreign currencies are rejected instead of being silently converted to USD',()=>{
 for(const currency of ['R$','BRL','EUR','€','GBP','£']){
  const d=fixture();d.process(`cria invoice Emily valor total ${currency} 500 vencimento amanhã`);assert.match(d.reply(),/Este fluxo usa USD/);assert.equal(d.token(),undefined);assert.equal(d.writes.length,0);
 }
 const d=fixture();d.useSingleLine();d.process('cria invoice Emily vencimento 2026-10-30');const token=d.token();d.process('preço R$500');assert.match(d.reply(),/não vou converter/);assert.equal(d.token(),undefined);d.action('invoice-confirm:'+token);assert.equal(d.writes.length,0);
});

test('moving into another operation clears the previous invoice reference',()=>{
 const d=fixture();d.process('cria invoice Emily vencimento 2026-10-30');d.process('sim');const invoice=d.draft();
 d.process('muda o job Emily para amanhã às 14h30');d.process('cancelar');d.writes.length=0;
 d.process('altera isso');assert.match(d.reply(),/O que você quer alterar/);assert.equal(d.draft().id,invoice.id);assert.equal(d.writes.length,0);
});
