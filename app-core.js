(function(){
  const SESSION_KEY='gtfDemoSessionV2';
  const USAGE_KEY='gtfAdaptiveUsageV1';
  const NOTIFICATION_KEY='gtfDemoNotificationsV1';
  const INTEGRATION_KEY='gtfIntegrationStateV1';
  const REVIEW_URL='https://search.google.com/local/writereview?placeid=ChIJvdGf-LAT9YgRl6baSSmrcSI';

  // DEMO ONLY: these local accounts are not secure authentication or isolation.
  const users=[
    {id:'office-caritas',name:'Caritas',email:'caritas@gtf.demo',password:'gtf2026',role:'office',label:'Office',home:'index.html'},
    {id:'office-cristiano',name:'Cristiano',email:'cristiano@gtf.demo',password:'gtf2026',role:'office',label:'Office',home:'index.html'},
    {id:'office-alicia',name:'Alicia',email:'alicia@gtf.demo',password:'gtf2026',role:'office',label:'Office',home:'index.html'},
    {id:'office-cindy',name:'Cindy',email:'cindy@gtf.demo',password:'gtf2026',role:'office',label:'Office',home:'index.html'},
    {id:'crew-carlos',name:'Carlos',email:'carlos@gtf.demo',password:'gtf2026',role:'crew',label:'Crew',home:'crew.html',crewName:'Carlos'},
    {id:'client-emily',name:'Emily Carter',email:'emily@gtf.demo',password:'gtf2026',role:'client',label:'Client',home:'customer.html',customerName:'Emily Carter',customerId:'client-emily',projectId:'project-2'}
  ];

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null}}
  function setSession(user){const session={...user,password:undefined,signedInAt:new Date().toISOString()};delete session.password;localStorage.setItem(SESSION_KEY,JSON.stringify(session));return session;}
  function login(email,password){const user=users.find(u=>u.email.toLowerCase()===String(email||'').trim().toLowerCase()&&u.password===password);if(!user)return null;return setSession(user)}
  function loginAs(id){const user=users.find(u=>u.id===id);return user?setSession(user):null}
  function logout(){localStorage.removeItem(SESSION_KEY);location.href='login.html'}
  function roleHome(role){return role==='crew'?'crew.html':role==='client'?'customer.html':'index.html'}
  function requireRole(allowed){const s=getSession();if(!s){location.replace('login.html');return null;}const list=Array.isArray(allowed)?allowed:[allowed];const officePreview=s.role==='office'&&new URLSearchParams(location.search).get('preview')==='1'&&list.some(r=>r==='crew'||r==='client');if(!list.includes(s.role)&&!officePreview){location.replace(roleHome(s.role));return null;}return s;}
  function currentUser(){return getSession()}

  function addUserChip(){
    const s=getSession();if(!s)return;
    const target=document.querySelector('.topbar .actions, .top .actions, .top');
    if(!target||document.getElementById('gtfUserChip'))return;
    const wrap=document.createElement('div');wrap.id='gtfUserChip';wrap.className='gtf-user-chip';
    wrap.innerHTML=`<span><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(s.label||s.role)}</small></span><button type="button" title="Sign out" aria-label="Sign out">↗</button>`;
    wrap.querySelector('button').onclick=logout;target.appendChild(wrap);
  }

  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

  function usageData(){try{return JSON.parse(localStorage.getItem(USAGE_KEY)||'{}')}catch(e){return {}}}
  function saveUsage(d){localStorage.setItem(USAGE_KEY,JSON.stringify(d))}
  function trackAction(actionId,label,href){const s=getSession();if(!s||s.role!=='office')return;const d=usageData();d[s.id]=d[s.id]||{};const x=d[s.id][actionId]||{count:0,label,href};x.count+=1;x.label=label||x.label;x.href=href||x.href;x.lastUsed=Date.now();d[s.id][actionId]=x;saveUsage(d)}
  function smartActions(defaults){const s=getSession();if(!s)return defaults;const d=usageData()[s.id]||{};const now=Date.now();const enriched=defaults.map((a,i)=>{const u=d[a.id]||{};const days=u.lastUsed?Math.max(0,(now-u.lastUsed)/86400000):999;const recency=u.lastUsed?Math.max(0,14-days):0;return {...a,score:(u.count||0)*4+recency-i*.1,count:u.count||0}});return enriched.sort((a,b)=>b.score-a.score).slice(0,4)}

  function integrationState(){return {googleCalendar:false,quo:false,payments:false,eSignature:false}; /* No integrations are connected in this static build. */}
  function saveIntegrationState(s){localStorage.setItem(INTEGRATION_KEY,JSON.stringify(s));window.dispatchEvent(new CustomEvent('gtf-integrations-changed'));return s}
  function setIntegration(name,value){const s=integrationState();s[name]=!!value;return saveIntegrationState(s)}

  function notifications(){try{return JSON.parse(localStorage.getItem(NOTIFICATION_KEY)||'[]')}catch(e){return []}}
  function pushNotification(n){const arr=notifications();arr.unshift({id:'note-'+Date.now(),createdAt:new Date().toISOString(),read:false,...n});localStorage.setItem(NOTIFICATION_KEY,JSON.stringify(arr.slice(0,50)));window.dispatchEvent(new CustomEvent('gtf-notifications-changed'));return arr[0]}
  function queueCrewSMS(job){return pushNotification({type:'crew-sms',status:'setup-required',title:`Appointment draft · ${job.customer}`,body:`${job.service} · ${job.date} · ${job.window} · ${job.address}`,crew:job.crew,projectId:job.projectId||('project-'+job.id),appointmentId:job.appointmentId||('appointment-'+job.id)});}
  function queueCalendarSync(job){return pushNotification({type:'calendar-sync',status:'setup-required',title:`Calendar sync request · ${job.customer}`,body:`${job.date} · ${job.window} · ${job.service}`,projectId:job.projectId||('project-'+job.id),appointmentId:job.appointmentId||('appointment-'+job.id)});}
  function queueQuoAlert(from,preview){return pushNotification({type:'quo-message',status:'new',title:`Quo message · ${from}`,body:preview});}
  function markAllRead(){const arr=notifications().map(n=>({...n,read:true}));localStorage.setItem(NOTIFICATION_KEY,JSON.stringify(arr));window.dispatchEvent(new CustomEvent('gtf-notifications-changed'));}

  function renderNotificationButton(){
    const s=getSession();if(!s||s.role!=='office')return;
    const actions=document.querySelector('.topbar .actions');if(!actions||document.getElementById('gtfNotifyBtn'))return;
    const btn=document.createElement('button');btn.id='gtfNotifyBtn';btn.className='btn gtf-notify-btn';btn.type='button';btn.innerHTML='Messages <span id="gtfNotifyCount" class="gtf-notify-count"></span>';btn.onclick=toggleNotificationPanel;actions.insertBefore(btn,actions.firstChild);updateNotificationCount();
  }
  function updateNotificationCount(){const el=document.getElementById('gtfNotifyCount');if(!el)return;const count=notifications().filter(n=>!n.read).length;el.textContent=count?String(count):'';el.hidden=!count;}
  function toggleNotificationPanel(){let panel=document.getElementById('gtfNotifyPanel');if(panel){panel.remove();return;}panel=document.createElement('div');panel.id='gtfNotifyPanel';panel.className='gtf-notify-panel';const arr=notifications();panel.innerHTML=`<div class="gtf-notify-head"><strong>Activity & integration alerts</strong><button class="link-btn" type="button" id="gtfReadAll">Mark all read</button></div>${arr.length?arr.slice(0,8).map(n=>`<div class="gtf-notify-item ${n.read?'':'unread'}"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.body||'')}</span><small>${escapeHtml(n.status||'')}</small></div>`).join(''):'<div class="gtf-notify-empty">No alerts yet.</div>'}`;document.body.appendChild(panel);document.getElementById('gtfReadAll').onclick=()=>{markAllRead();panel.remove();updateNotificationCount();};}

  document.addEventListener('click',e=>{const el=e.target.closest('[data-track-action]');if(!el)return;trackAction(el.dataset.trackAction,el.dataset.trackLabel||el.textContent.trim(),el.dataset.trackHref||el.getAttribute('href')||'');});
  window.addEventListener('gtf-notifications-changed',updateNotificationCount);
  document.addEventListener('DOMContentLoaded',()=>{addUserChip();renderNotificationButton();updateNotificationCount();});

  window.GTF_CONFIG={REVIEW_URL};
  window.GTFAuth={users:clone(users).map(u=>{delete u.password;return u}),login,loginAs,logout,getSession,currentUser,requireRole,roleHome};
  window.GTFAdaptive={trackAction,smartActions,usageData};
  window.GTFIntegrations={integrationState,setIntegration,notifications,pushNotification,queueCrewSMS,queueCalendarSync,queueQuoAlert,markAllRead};
})();
