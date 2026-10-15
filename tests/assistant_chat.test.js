'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assistant.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const appointment = patch => ({ id:1, projectId:'chat-project-a', appointmentId:'chat-appointment-a', customer:'Emily Carter', address:'Fictional property, Roswell, GA', service:'Sand & Finish', date:'2026-10-16', window:'8:00–9:00 AM', crew:'Fictional crew', status:'Scheduled', ...patch });

function fixture({ name='Cindy', role='office', now='2026-10-15T15:00:00Z', jobs=[appointment()] }={}) {
  const nodes=new Map(), documentListeners={}, windowListeners={}, writes=[], queued=[], calls=[];
  let user={name,role};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',dataset:{},listeners:{},addEventListener(event,listener){this.listeners[event]=listener;}});return nodes.get(id);};
  class GeorgiaDate extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return Date.parse(now);} }
  const forbidden=()=>{calls.push('network');throw new Error('Chat must not call a provider');};
  const location={href:''};
  const window={addEventListener:(event,listener)=>{windowListeners[event]=listener;},GTFAuth:{currentUser:()=>user},GTFJobs:()=>jobs,persist:()=>writes.push(clone(jobs)),GTFIntegrations:{notifications:()=>[],queueCalendarSync(job){queued.push('calendar');return{status:'setup-required'};},queueCrewSMS(job){queued.push('sms');return{status:'setup-required'};}},open:forbidden};
  vm.runInNewContext(source,{window,document:{getElementById:node,addEventListener:(event,listener)=>{documentListeners[event]=listener;}},Date:GeorgiaDate,Intl,URLSearchParams,location,navigator:{},fetch:forbidden,XMLHttpRequest:forbidden,localStorage:{setItem:(...args)=>writes.push(args)},sessionStorage:{getItem:()=>null,setItem:(...args)=>writes.push(args)}});
  documentListeners.DOMContentLoaded();
  return {assistant:window.GTFAssistant,writes,queued,calls,jobs,location,node,
    reply(){return node('assistantConversation').innerHTML.split('<article class="assistant-message assistant">').pop();},
    action(value){node('assistantConversation').listeners.click({target:{closest:()=>({dataset:{assistantAction:value}})}});},
    changeProfile(name){user={...user,name};windowListeners['gtf-profile-changed']();},
    token(){return this.reply().match(/data-assistant-action="confirm:(\d+)"/)?.[1];}
  };
}

test('Portuguese and English greetings respond naturally with current profile, without task fallback',()=>{
  for(const greeting of ['bom dia','boa tarde','boa noite','oi','Olá!','Oi, bom dia, Ruach!']){
    const d=fixture();d.assistant.process(greeting);assert.match(d.reply(),/Cindy/);assert.match(d.reply(),/Ruach/);assert.doesNotMatch(d.reply(),/Try:|Change Emily|could not identify/);assert.equal(d.writes.length,0);
  }
  for(const greeting of ['hello','hi','good morning','good afternoon','good evening']){
    const d=fixture();d.assistant.process(greeting);assert.match(d.reply(),/Good morning, Cindy/);assert.match(d.reply(),/How can I help/);assert.equal(d.calls.length,0);
  }
});

test('greetings use Georgia time rather than UTC and vary within the same memory-only session',()=>{
  const d=fixture({now:'2026-10-15T02:00:00Z'});
  assert.match(d.node('assistantGreeting').textContent,/Good evening, Cindy/);
  d.assistant.process('bom dia');assert.match(d.reply(),/Boa noite, Cindy/);
  const first=d.reply();d.assistant.process('bom dia');assert.notEqual(d.reply(),first);
  d.assistant.process('bom dia');assert.match(d.reply(),/Boa noite/);
  assert.equal(d.writes.length,0);assert.equal(d.queued.length,0);
});

test('profile changes are reflected without adopting a name guessed from chat',()=>{
  const d=fixture();d.changeProfile('Alicia');d.assistant.process('olá');assert.match(d.reply(),/Alicia/);assert.doesNotMatch(d.reply(),/Cindy/);
  d.assistant.process('qual é meu nome?');assert.match(d.reply(),/Alicia/);assert.match(d.reply(),/Profile/);
  d.assistant.process('mudar meu nome para Outra Pessoa');assert.match(d.reply(),/Alicia/);assert.equal(d.writes.length,0);
});

test('Ruach and Emet identity, help and AI limits are truthful',()=>{
  const d=fixture();d.assistant.process("what's your name?");assert.match(d.reply(),/Ruach/);
  d.assistant.process('Quem é a Emet?');assert.match(d.reply(),/plataforma/);assert.match(d.reply(),/piloto/);
  d.assistant.process('o que você pode fazer?');assert.match(d.reply(),/pergunta ou uma tarefa/);assert.match(d.reply(),/confirma/);
  d.assistant.process('Você tem IA de verdade?');assert.match(d.reply(),/não tenho um LLM conectado/);assert.match(d.reply(),/programados/);
  assert.deepEqual(d.calls,[]);assert.deepEqual(d.writes,[]);
});

test('thanks does not erase a short FAQ context and follow-up switches language naturally',()=>{
  const d=fixture();d.assistant.process('How do I connect Gmail?');const initial=d.reply();assert.match(initial,/Gmail/);assert.match(initial,/separate from Calendar/);
  d.assistant.process('thank you');assert.match(d.reply(),/welcome/);
  d.assistant.process('e como conectar?');assert.match(d.reply(),/Gmail/);assert.match(d.reply(),/separada do Calendar|Permissão de agenda/);assert.notEqual(d.reply(),initial);
  d.assistant.process('muito obrigada pela ajuda, Ruach');assert.match(d.reply(),/Por nada|Disponha|disposição/);
  assert.deepEqual(d.calls,[]);assert.deepEqual(d.writes,[]);
});

test('unknown requests get varied useful clarification, and help can be opened',()=>{
  const d=fixture();d.assistant.process('oi');d.assistant.process('algo completamente indefinido');const first=d.reply();assert.match(first,/pouco mais|contexto|Hub/);
  d.assistant.process('outra coisa indefinida');assert.notEqual(d.reply(),first);assert.match(d.reply(),/resultado que espera/);
  d.action('chat-help');assert.match(d.reply(),/pergunta ou uma tarefa/);assert.equal(d.writes.length,0);
});

test('greeting during confirmation preserves the same preview token and makes no writes',()=>{
  const d=fixture();d.assistant.process('Change Emily Carter to tomorrow at 2 PM');const token=d.token(),before=clone(d.jobs);assert.ok(token);
  d.assistant.process('bom dia');assert.equal(d.token(),token);assert.match(d.reply(),/nada foi salvo/);assert.deepEqual(d.jobs,before);assert.deepEqual(d.writes,[]);assert.deepEqual(d.queued,[]);
  d.assistant.process('obrigada');assert.equal(d.token(),token);assert.deepEqual(d.jobs,before);
  d.action('confirm:'+token);assert.equal(d.writes.length,1);assert.equal(d.queued.length,2);assert.match(d.reply(),/PENDING SETUP/);
});

test('combined Portuguese greeting and command still requires disambiguation, preview and confirmation',()=>{
  const jobs=[appointment(),appointment({id:2,projectId:'chat-project-b',appointmentId:'chat-appointment-b',address:'Another fictional property, Marietta, GA'})];
  const d=fixture({jobs});const before=clone(jobs);
  d.assistant.process('Bom dia, muda o job da Emily Carter para amanhã às 14h30');assert.match(d.reply(),/more than one possible job or appointment/);assert.deepEqual(jobs,before);assert.deepEqual(d.writes,[]);
  d.assistant.process('2');const token=d.token();assert.ok(token);assert.match(d.reply(),/chat-appointment-b/);assert.deepEqual(jobs,before);
  d.assistant.process('Olá, Ruach!');assert.equal(d.token(),token);assert.deepEqual(jobs,before);
  d.assistant.process('sim');assert.deepEqual(jobs[0],before[0]);assert.equal(jobs[1].window,'2:30 PM–3:30 PM');assert.equal(d.writes.length,1);
});

test('FAQ while choosing an appointment preserves the selection and its requested time',()=>{
  const d=fixture({jobs:[appointment(),appointment({id:2,projectId:'chat-project-b',appointmentId:'chat-appointment-b'})]});
  d.assistant.process('Change Emily Carter to tomorrow at 2 PM');d.assistant.process('como convidar um cliente?');assert.match(d.reply(),/verificação do email/);assert.match(d.reply(),/escolha do projeto continua pendente/);
  d.assistant.process('2');assert.match(d.reply(),/chat-appointment-b/);assert.match(d.reply(),/2:00 PM/);assert.deepEqual(d.writes,[]);
});

test('sending requests never send messages or mutate a pending appointment',()=>{
  const d=fixture();d.assistant.process('Change Emily Carter to tomorrow at 2 PM');const token=d.token();
  d.assistant.process('envie a mensagem agora');assert.match(d.reply(),/Não enviei nada/);assert.equal(d.token(),token);assert.equal(d.writes.length,0);assert.equal(d.queued.length,0);
  d.action('confirm:'+token);const writeCount=d.writes.length,queueCount=d.queued.length;
  d.assistant.process('send it');assert.match(d.reply(),/Nothing was sent/);assert.equal(d.writes.length,writeCount);assert.equal(d.queued.length,queueCount);assert.deepEqual(d.calls,[]);
});

test('Hub FAQs state current limits and preserve existing Settings guide destinations',()=>{
  const d=fixture();
  for(const [query,expected] of [
    ['como criar conta para um cliente?',/convite|convites/],
    ['como importar meus dados?',/memória|memória desta aba/],
    ['meus clientes estão no Supabase?',/não foram migrados/],
    ['como importar preços por tipo de cliente?',/Zero é preservado/],
    ['como conectar o Google Calendar?',/Gmail é separado/],
    ['como conectar Quo?',/nenhum SMS|não envia mensagens/],
    ['como conectar Gmail?',/autoriza|OAuth|permissões/],
  ]){d.assistant.process(query);assert.match(d.reply(),expected,query);}
  d.action('settings:gmail');assert.equal(d.location.href,'settings.html?integration=gmail');
  d.action('settings:google');assert.equal(d.location.href,'settings.html?integration=google');
  d.action('settings:quo');assert.equal(d.location.href,'settings.html?integration=quo');
  d.action('settings-tab:team');assert.equal(d.location.href,'settings.html?tab=team');
  assert.deepEqual(d.writes,[]);assert.deepEqual(d.calls,[]);
});

test('chat escapes profile text and does not pretend to know a real manager or account status',()=>{
  const d=fixture({name:'<img src=x onerror=alert(1)>'});d.assistant.process('oi');assert.doesNotMatch(d.reply(),/<img/);assert.match(d.reply(),/&lt;img/);
  d.assistant.process('quem é o gerente que pode aprovar?');assert.match(d.reply(),/autorizad/);assert.doesNotMatch(d.reply(),/Cindy aprovou|approved your account|account is active/);assert.deepEqual(d.calls,[]);
});

test('oversized input is not echoed or parsed and leaves the pending preview unchanged',()=>{
  const d=fixture();d.assistant.process('Change Emily Carter to tomorrow at 2 PM');const token=d.token(),before=clone(d.jobs);
  d.assistant.process('Bom dia, muda o job da Emily Carter '.repeat(200));
  assert.match(d.reply(),/4\.096 caracteres/);assert.match(d.reply(),/Data workspace/);assert.equal(d.token(),token);
  assert.doesNotMatch(d.reply(),/Bom dia, muda o job/);assert.deepEqual(d.jobs,before);assert.deepEqual(d.writes,[]);assert.deepEqual(d.queued,[]);assert.deepEqual(d.calls,[]);
  d.action('confirm:'+token);assert.equal(d.writes.length,1);
});
