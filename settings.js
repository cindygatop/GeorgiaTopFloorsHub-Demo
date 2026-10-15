/* Emet settings. Local profile preferences and deterministic Ruach setup guides.
   Real account/invitation actions require an authenticated server and CSRF token. */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search),demoUser=window.GTFAuth && GTFAuth.currentUser();
  const state = {status:null, session:null, request:0, guide:null, step:0, avatar:null, avatarTask:0, invite:null, account:false, avatarChanged:false};
  let user=demoUser;
  if (params.get('mode')==='account' || !demoUser) {
    try {
      const available=await requestJSON('/api/emet/status');
      if (available.ok && available.data.status==='ready') {
        state.status=available.data;
        const session=await requestJSON('/api/emet/session');
        if (session.ok && session.data.user) {state.account=true;state.session=session.data;user={...session.data.user,name:session.data.user.displayName||session.data.user.email,role:'account'};}
      }
    } catch (_) {}
    if (!state.account && (!demoUser || params.get('mode')==='account')) {location.replace('emet.html#account');return;}
  }
  const office = state.account?Array.isArray(state.session.memberships)&&state.session.memberships.some(m=>['owner','admin','manager','office'].includes(m.role)&&m.status==='active'):user.role==='office';
  const avatarTypes = new Set(['image/png','image/jpeg','image/webp']);
  const catalog = {
    google: {title:'Google Calendar',symbol:'▦',key:'googleCalendar',summary:'Keep project appointments together in your company calendar.',read:'Appointments and the calendars you explicitly authorize.',write:'Create or update project events only with approved access. Gmail is separate.',links:[['Google Calendar documentation','https://developers.google.com/workspace/calendar/api/guides/overview'],['Google account permissions','https://myaccount.google.com/connections']],steps:[['Choose the company account','Use a company-owned Google account and decide which shared calendar will hold project appointments. Personal calendars stay outside the connection unless you authorize them.'],['Review Calendar permissions','Ruach will ask you to review Calendar access before Google authorization. Event reading and event editing are distinct permissions. Connecting Calendar does not enable Gmail or access your inbox.'],['Authorize, then choose a calendar','The secure backend must complete Google OAuth first. Only calendars returned by your authorized Google account can then appear for selection. This demo does not invent calendar names or permissions.'],['Verify a real update','After the backend is configured, test a project appointment and verify the Google event ID and API result. A new-event draft is a manual tool; it is not two-way synchronization.']]},
    gmail: {title:'Gmail inbox',symbol:'M',key:'gmail',summary:'An optional, separate connection for an authorized inbox.',read:'Only the Gmail access approved by the mailbox owner.',write:'Sending needs a separate permission and an explicit approved action.',links:[['Gmail API permissions','https://developers.google.com/workspace/gmail/api/auth/scopes'],['Google account permissions','https://myaccount.google.com/connections']],steps:[['Decide whether you need inbox access','Gmail is optional. Your Calendar connection never turns on inbox access. Choose the company mailbox and who is permitted to review its messages.'],['Review a separate consent request','The backend must request the minimum Gmail scopes in a separate authorization flow. Read-only access does not authorize sending or deleting messages.'],['Verify the selected mailbox','Once OAuth is available, confirm the returned account and granted scopes. Emet must show the real result before treating the inbox as connected.']]},
    quo: {title:'Quo messaging',symbol:'Q',key:'quo',summary:'Crew messages and inbound conversation alerts, when configured.',read:'Authorized phone numbers and inbound messages delivered by verified webhooks.',write:'Send reviewed SMS from an authorized business number, with consent.',links:[['Quo API documentation','https://www.quo.com/docs'],['Quo workspace','https://my.quo.com/']],steps:[['Open your company’s Quo workspace','Sign in to the Quo account your company owns. Confirm the business phone number, plan and user permissions that will be used for project communication.'],['Configure the server connection','An authorized administrator creates the Quo API credential and stores it in the server’s secret configuration. Do not paste it into Ruach, a browser field, source code or a data backup.'],['Set up inbound message webhooks','Configure the HTTPS webhook on the secure backend and verify the provider’s signature. Link conversations to the correct company, project and phone number; ambiguous matches need review.'],['Review consent before sending','Choose the authorized number and confirm the recipient’s consent. Review the exact message and recipient before the server sends a test. Opening this guide does not send an SMS.'],['Check the provider’s response','Only a confirmed Quo API response can mark a request as sent. Delivery is a separate provider status. Without the server connection, Emet keeps the request as setup required.']]},
    esign: {title:'Electronic signatures',symbol:'✍',key:'eSignature',summary:'Signed agreements and a verifiable signature trail.',read:'Agreement status, signed documents and audit information for the right project.',write:'Create a signature request after review. Warranty follows a verified signing event.',links:[['SignWell API','https://developers.signwell.com/'],['Documenso documentation','https://docs.documenso.com/']],steps:[['Choose your signature provider','Choose SignWell, Documenso or another provider that supports your legal, document and embedded signing requirements.'],['Prepare the approved documents','Use the final company Agreement, Care & Maintenance Guide and Warranty terms. Version the template and link every request to its project and company.'],['Configure signing and verification','Keep provider credentials on the server. Validate signing webhooks and store the signed PDF and audit trail. A name typed in the local demo is not a verified legal signature.']]},
    stripe: {title:'Stripe payments',symbol:'S',key:'payments',summary:'Secure invoice payment and provider-confirmed receipts.',read:'Payment state and receipts for the company’s invoices.',write:'Create approved checkout sessions; verify payment through signed webhooks.',links:[['Stripe Checkout','https://docs.stripe.com/payments/checkout'],['Stripe Connect','https://docs.stripe.com/connect']],steps:[['Choose the receiving business','Connect the company’s own Stripe account. For multiple Emet companies, choose a suitable Stripe Connect model that separates each company’s funds.'],['Configure checkout on the server','Store secret keys only in secure server configuration. Use Stripe-hosted checkout or approved payment components; card details never belong in local demo data.'],['Verify payment events','Use test mode before a real charge. Verify signed webhooks, invoice IDs, currency and amount before updating a balance. No payment is created by this guide.']]},
    maps: {title:'Maps & directions',symbol:'→',key:'maps',summary:'Open property directions and plan future location tools.',read:'The property address you choose to open in a map.',write:'A directions link opens the map provider. Route APIs require separate setup.',links:[['Google Maps URLs','https://developers.google.com/maps/documentation/urls/guide'],['Maps Platform documentation','https://developers.google.com/maps/documentation']],steps:[['Start with a property address','The existing map buttons open the selected property address in Google Maps. Those links do not require an API connection.'],['Choose any additional map service','Distance estimates, routing or embedded maps require a configured service, usage limits and the appropriate account.'],['Restrict any future API access','Use server-side secrets for server APIs. Any provider-approved browser key must be restricted to the exact site and API. Never use a secret server key in the browser.']]},
    ai: {title:'Ruach AI',symbol:'✳',key:'ai',summary:'Prepare for a secure assistant that can use company tools.',read:'Only company data that the signed-in user may access.',write:'Propose actions for review; authorized changes need validation and confirmation.',links:[['OpenAI API documentation','https://platform.openai.com/docs/overview']],steps:[['Start with the current Ruach guide','Ruach’s demo responses and setup guides follow local rules. No live language model is connected and opening this guide does not call one.'],['Choose the approved model service','Select a provider, budget and data policy. Configure the model credential in server secrets and scope tool access to the signed-in company and user.'],['Keep actions reviewable','Validate tool calls, ask for missing information and require confirmation before changes. Keep an audit record and verify each integration response before claiming success.']]},
    email: {title:'Transactional email',symbol:'→',key:'email',summary:'Invitation and project email from your verified domain.',read:'Provider delivery events and verified sender configuration.',write:'Send approved templates to intended recipients; log provider-confirmed results.',links:[['Resend documentation','https://resend.com/docs/introduction'],['Amazon SES documentation','https://docs.aws.amazon.com/ses/']],steps:[['Choose a sending service','Use the email service configured for Emet account invitations or select a transactional email provider. This is separate from optional Gmail inbox access.'],['Verify your company’s domain','Configure the provider’s sender verification and DNS records. Keep API credentials on the server and review which sender addresses the company may use.'],['Verify delivery honestly','A provider response can confirm that a message was accepted. Delivered, bounced or failed are separate statuses from verified events. This demo does not send email.']]}
  };
  function profileData() {
    if (state.account) return {name:user.name,avatar:user.avatarUrl};
    try {const all=JSON.parse(localStorage.getItem('emetProfileV1')||'{}');return all && typeof all==='object' && all[user.id] && typeof all[user.id]==='object'?all[user.id]:{};} catch (_) {return {};}
  }
  function validAvatar(data) {return typeof data==='string' && data.length<600000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data);}
  function renderAvatar(target, name, source) {
    target.replaceChildren();
    let safeURL=false;
    if(state.account && typeof source==='string') {try {const url=new URL(source,location.href);safeURL=url.protocol==='https:'||url.origin===location.origin&&url.protocol==='http:';} catch (_) {}}
    if (validAvatar(source)||safeURL) {const img=document.createElement('img');img.src=source;img.alt='';img.referrerPolicy='no-referrer';target.append(img);}
    else target.textContent=String(name||'You').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  }
  function showProfile() {
    const profile=profileData(),name=profile.name||user.name;
    $('displayName').value=name;
    $('accountEmail').value=user.email||'';
    state.avatar=state.account?profile.avatar||null:validAvatar(profile.avatar)?profile.avatar:null;
    $('headerName').textContent=name;
    renderAvatar($('headerAvatar'),name,state.avatar);
    renderAvatar($('profileAvatar'),name,state.avatar);
    $('workspaceLink').href=state.account?'emet.html#account':GTFAuth.roleHome(user.role);
    if(state.account) {
      $('workspaceMode').textContent='Secure account';$('workspaceMode').classList.remove('local');
      $('workspaceModeCopy').textContent='Your account and company permissions are verified by the secure service.';
      $('displayNameHelp').textContent='Your display name is saved to your secure Emet profile.';
      $('accountEmailLabel').textContent='Account email';$('accountEmailHelp').textContent='Manage email and password through your secure account.';
      $('profileSaveScope').textContent='Saved to your Emet account.';$('profileSave').textContent='Save profile';
      $('secureCredentials').hidden=false;
      $('teamHeading').textContent='Your company access';$('teamMode').textContent='Verified memberships';$('teamMode').classList.remove('local');
      $('teamExplanation').textContent='These are the company memberships returned for your account. Invitation permissions are enforced by the server.';
      document.querySelector('.settings-footer>span').textContent='Emet · account settings';
      const membership=(state.session.memberships||[]).find(m=>m.status==='active');
      $('companyBrand').innerHTML='<span class="status-pill">Company account</span>';
      $('companyDetails').innerHTML=`<div><dt>Company</dt><dd>${esc(membership?membership.organizationName||membership.organizationId:'No active membership')}</dd></div><div><dt>Workspace</dt><dd>Emet account service</dd></div><div><dt>Access</dt><dd>${esc(membership?membership.role:'Pending')}</dd></div><div><dt>Business data</dt><dd>Not connected to the local demo</dd></div>`;
    }
  }
  function profileMessage(message,error) {$('profileMessage').textContent=message;$('profileMessage').classList.toggle('error',!!error);}
  async function prepareAvatar(file) {
    const task=++state.avatarTask;
    if (!file) return;
    if (!avatarTypes.has(file.type) || file.size>2*1024*1024 || !file.size) throw new Error('Choose a PNG, JPEG or WebP photo up to 2 MB.');
    const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
    const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if (!(file.type==='image/png'&&png || file.type==='image/jpeg'&&jpeg || file.type==='image/webp'&&webp)) throw new Error('That file is not a supported photo. Please choose a PNG, JPEG or WebP image.');
    const bitmap=await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width>4096 || bitmap.height>4096) throw new Error('Choose a photo no larger than 4096 × 4096 pixels.');
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
      const context=canvas.getContext('2d');const size=Math.min(bitmap.width,bitmap.height);
      context.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);
      const data=canvas.toDataURL('image/webp',.86);
      if (!validAvatar(data)) throw new Error('The photo could not be prepared. Choose a different image.');
      if (task===state.avatarTask) {state.avatar=data;state.avatarChanged=true;renderAvatar($('profileAvatar'),$('displayName').value,state.avatar);profileMessage(state.account?'Photo ready. Save your profile to upload it securely.':'Photo ready. Save your local profile to keep it.');}
    } finally {bitmap.close();}
  }
  async function saveProfile(event) {
    event.preventDefault();const name=$('displayName').value.trim().replace(/\s+/g,' ');
    if (!name || name.length>70 || /[\u0000-\u001f<>]/.test(name)) {profileMessage('Enter a display name between 1 and 70 characters, without markup.',true);return;}
    if(state.account){await saveAccountProfile(name);return;}
    try {
      if (typeof GTFAuth.updateDemoProfile==='function') GTFAuth.updateDemoProfile({name,avatar:state.avatar});
      else {const all=JSON.parse(localStorage.getItem('emetProfileV1')||'{}');all[user.id]={name,avatar:state.avatar};localStorage.setItem('emetProfileV1',JSON.stringify(all));}
      $('headerName').textContent=name;renderAvatar($('headerAvatar'),name,state.avatar);renderAvatar($('profileAvatar'),name,state.avatar);
      profileMessage('Local profile saved in this browser.');
    } catch (_) {profileMessage('This browser could not save your profile. Try a smaller photo or free some storage.',true);}
  }
  async function saveAccountProfile(name) {
    if (!capability('profile') || !state.session || !state.session.csrfToken) {profileMessage('Sign in to the secure account service before saving your profile.',true);return;}
    $('profileSave').disabled=true;
    try {
      const payload={displayName:name};
      if(state.avatarChanged&&state.avatar) {
        const match=state.avatar.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
        if(!match)throw new Error('invalid_photo');
        const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));
        const authorize=await requestJSON('/api/emet/avatar',{method:'POST',headers:{'Content-Type':'application/json','X-Emet-CSRF':state.session.csrfToken},body:JSON.stringify({contentType:match[1]})});
        if(!authorize.ok || authorize.data.status!=='upload_authorized' || typeof authorize.data.uploadUrl!=='string' || typeof authorize.data.avatarPath!=='string' || bytes.length>Math.min(Number(authorize.data.maxBytes)||0,2097152))throw new Error('upload_not_authorized');
        const uploadURL=new URL(authorize.data.uploadUrl,location.href);
        if(uploadURL.protocol!=='https:' && uploadURL.origin!==location.origin)throw new Error('invalid_upload_destination');
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
        let uploaded;
        try {uploaded=await fetch(uploadURL.href,{method:'PUT',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':match[1],'x-upsert':'false'},body:bytes,signal:controller.signal});}
        finally {clearTimeout(timer);}
        if(!uploaded.ok)throw new Error('upload_not_confirmed');
        payload.avatarPath=authorize.data.avatarPath;
      } else if(state.avatarChanged)payload.avatarPath=null;
      const result=await requestJSON('/api/emet/profile',{method:'POST',headers:{'Content-Type':'application/json','X-Emet-CSRF':state.session.csrfToken},body:JSON.stringify(payload)});
      if(!result.ok || !result.data || result.data.status!=='profile_updated' || !result.data.user || result.data.user.id!==user.id)throw new Error('profile_not_confirmed');
      user={...user,...result.data.user,name:result.data.user.displayName||name};state.session.user=result.data.user;
      state.avatar=result.data.user.avatarUrl||null;
      $('headerName').textContent=user.name;renderAvatar($('headerAvatar'),user.name,state.avatar);renderAvatar($('profileAvatar'),user.name,state.avatar);state.avatarChanged=false;
      profileMessage('Profile saved by the secure account service.');
    } catch (_) {profileMessage('The account service could not confirm that your profile was saved. Please check your account before trying again.',true);}
    finally {$('profileSave').disabled=false;}
  }
  async function changeCredentials(event,kind) {
    event.preventDefault();
    const form=event.currentTarget,message=$(kind==='email'?'emailChangeMessage':'passwordChangeMessage'),button=form.querySelector('button[type=submit]');
    if (!state.account || !capability('authentication') || !state.session || !state.session.csrfToken) {form.reset();message.textContent='Sign in to the secure account service before changing account credentials.';message.classList.add('error');return;}
    const currentPassword=$(kind==='email'?'emailCurrentPassword':'passwordCurrentPassword').value;
    const payload={currentPassword};
    if(kind==='email')payload.newEmail=$('newAccountEmail').value.trim();
    else {
      if($('newAccountPassword').value!==$('confirmAccountPassword').value){message.textContent='The new passwords do not match.';message.classList.add('error');return;}
      payload.newPassword=$('newAccountPassword').value;
    }
    button.disabled=true;message.textContent='Confirming your account request…';message.classList.remove('error');
    try {
      const result=await requestJSON('/api/emet/credentials',{method:'POST',headers:{'Content-Type':'application/json','X-Emet-CSRF':state.session.csrfToken},body:JSON.stringify(payload)});
      if(!result.ok) {message.textContent=result.data.error==='secure_email_change_setup_required'?'Email changes need secure email confirmation to be configured by your account administrator. Your current email has not changed.':result.status===401?'Your account request was not authorized. Check your current password or sign in again.':'The account service could not complete this request. Your account change has not been confirmed.';message.classList.add('error');return;}
      if(kind==='email'&&result.data.status==='email_change_requested')message.textContent='Email change requested. Follow the confirmation instructions sent by the account service. Your current email remains displayed until the change is verified.';
      else if(kind==='password'&&result.data.status==='password_updated')message.textContent='Your password was updated by the secure account service.';
      else {message.textContent='The service returned a response, but the account change has not been confirmed. Check your account before trying again.';message.classList.add('error');}
    } catch (_) {message.textContent='The service could not confirm a result. Check your account before trying again.';message.classList.add('error');}
    finally {form.reset();button.disabled=false;}
  }
  function selectTab(name,updateURL) {
    if (!['profile','team','integrations','company','data'].includes(name) || !office&&name!=='profile') name='profile';
    document.querySelectorAll('[role=tab]').forEach(button=>{const selected=button.dataset.tab===name;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    document.querySelectorAll('[role=tabpanel]').forEach(panel=>panel.hidden=panel.id!=='panel-'+name);
    if (updateURL) {const url=new URL(location.href);url.searchParams.set('tab',name);url.searchParams.delete('integration');history.replaceState(null,'',url);}
  }
  async function requestJSON(path,options={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try {
      const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal});
      const type=response.headers.get('content-type')||'';
      if (!type.includes('application/json')) throw new Error('service_unavailable');
      const data=await response.json();return {ok:response.ok,status:response.status,data};
    } finally {clearTimeout(timer);}
  }
  function capability(name) {return state.status && state.status.status==='ready' && state.status.capabilities && state.status.capabilities[name]===true;}
  function managerMembership() {
    if(!state.account)return null;
    const selected=$('inviteOrganization').value;
    return state.session && Array.isArray(state.session.memberships) && state.session.memberships.find(m=>['owner','admin','manager'].includes(m.role)&&m.status==='active'&&m.organizationId&&(!selected||m.organizationId===selected));
  }
  function connection(id) {
    const integration=catalog[id],connections=state.status&&state.status.integrations;
    const known=connections&&connections[integration.key];
    if (!known || typeof known!=='object') return {label:'Setup required',className:'',value:null};
    if (known.status==='connected') return {label:'Connected',className:'connected',value:known};
    if (known.status==='failed') return {label:'Connection failed',className:'failed',value:known};
    return {label:'Setup required',className:'',value:known};
  }
  function renderConnections() {
    $('integrationGrid').innerHTML=Object.entries(catalog).map(([id,item])=>{const status=connection(id);return `<article class="integration-card"><div class="integration-card-top"><span class="integration-logo" aria-hidden="true">${esc(item.symbol)}</span><span class="status-pill ${esc(status.className)}">${esc(status.label)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><button class="text-button" type="button" data-guide="${id}">Set up with Ruach <span aria-hidden="true">→</span></button></article>`;}).join('');
    const ready=state.status&&state.status.status==='ready';
    $('integrationSummary').textContent=ready?'Account service available. Connections below require their own confirmed setup and permission.':'This demo has no connected integration service. Explore the guides to see what each connection needs.';
    $('accountStatus').textContent=capability('authentication')?'Service available':'Setup required';
    $('accountStatus').className='status-pill'+(capability('authentication')?' connected':'');
    $('accountServiceMessage').textContent=capability('authentication')?'The secure account service is available. Sign in there to manage real credentials; local demo settings do not change your email or password.':'Email and password changes are not available in the local demo. Enable the secure account service first.';
    $('invitationService').textContent=capability('invitations')?(managerMembership()?'Manager account verified. Review the role before sending.':'Sign in with a verified manager account to send invitations.'):'Secure invitations require backend setup.';
    $('serviceFootnote').textContent=state.account?'Secure Emet account':ready?'Account service available · local demo profile':'Local demo · account service setup required';
  }
  async function checkService() {
    const request=++state.request;
    document.querySelectorAll('[data-check-service]').forEach(button=>button.disabled=true);
    try {
      const response=await requestJSON('/api/emet/status');
      if (request!==state.request) return;
      state.status=response.data&&typeof response.data==='object'?response.data:null;
      let nextSession=null;
      if (response.ok&&capability('authentication')) {try {const session=await requestJSON('/api/emet/session');if(session.ok && session.data.user) nextSession=session.data;} catch (_) {}}
      if(request===state.request)state.session=nextSession;
    } catch (_) {if(request===state.request){state.status=null;state.session=null;}}
    finally {
      if(request===state.request){renderConnections();document.querySelectorAll('[data-check-service]').forEach(button=>button.disabled=false);if(state.guide) renderGuide();}
    }
  }
  function renderTeam() {
    if(state.account) {
      $('teamList').innerHTML=(state.session.memberships||[]).map(m=>`<div class="team-member"><div class="team-person"><div><strong>${esc(m.organizationName||m.organizationId)}</strong><small>${esc(m.status)}</small></div></div><span>${esc(m.role)}</span></div>`).join('')||'<p class="muted">No company membership has been returned for this account.</p>';
      const companies=(state.session.memberships||[]).filter(m=>['owner','admin','manager'].includes(m.role)&&m.status==='active');
      $('inviteOrganizationField').hidden=!companies.length;
      $('inviteOrganization').innerHTML=companies.map(m=>`<option value="${esc(m.organizationId)}">${esc(m.organizationName||m.organizationId)}</option>`).join('');
      return;
    }
    const profiles=Array.isArray(GTFAuth.users)?GTFAuth.users:[];
    $('teamList').innerHTML=profiles.map(member=>`<div class="team-member"><div class="team-person"><span class="avatar avatar-small" aria-hidden="true">${esc(member.name.split(/\s+/).slice(0,2).map(n=>n[0]).join(''))}</span><div><strong>${esc(member.name)}</strong><small>${esc(member.email)}</small></div></div><span>${esc(member.label||member.role)}</span></div>`).join('');
  }
  function reviewInvitation(event) {
    event.preventDefault();const email=$('inviteEmail').value.trim(),role=$('inviteRole').value;
    if (!email || !['office','crew','client'].includes(role)) return;
    const projectId=$('inviteProject').value.trim();
    if(role==='client'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {$('inviteProject').setCustomValidity('Enter the real project UUID assigned to this client.');$('inviteProject').reportValidity();return;}
    $('inviteProject').setCustomValidity('');
    state.invite={email,role,...(role==='client'?{projectId}:{})};const membership=managerMembership(),canSend=state.account&&capability('invitations')&&membership&&state.session.csrfToken;
    $('invitePreview').hidden=false;
    $('invitePreview').innerHTML=`<p><strong>Review invitation</strong></p><p>${esc(email)} · ${esc(role.charAt(0).toUpperCase()+role.slice(1))}${membership?' · '+esc(membership.organizationName||membership.organizationId):''}</p><p class="muted">${canSend?'The server will validate your company membership and permissions before creating an invitation.':'No invitation has been created or sent. A verified manager and the secure invitation service are required.'}</p><div class="button-row"><button class="button primary" id="confirmInvite" type="button" ${canSend?'':'disabled'}>Confirm invitation</button><button class="text-button" type="button" id="cancelInvite">Cancel</button></div><p class="inline-message" id="inviteMessage" role="status"></p>`;
    $('cancelInvite').onclick=()=>{state.invite=null;$('invitePreview').hidden=true;};
    $('confirmInvite').onclick=sendInvitation;
  }
  async function sendInvitation() {
    const membership=managerMembership();
    if (!capability('invitations') || !membership || !state.session.csrfToken || !state.invite) return;
    const button=$('confirmInvite');button.disabled=true;
    try {
      const result=await requestJSON('/api/emet/invitations',{method:'POST',headers:{'Content-Type':'application/json','X-Emet-CSRF':state.session.csrfToken},body:JSON.stringify({action:'create',organizationId:membership.organizationId,...state.invite})});
      const message=$('inviteMessage');
      if (!result.ok || result.data.status!=='invitation_created' || !result.data.invitation || !result.data.invitation.id || typeof result.data.code!=='string') {message.textContent='The server could not confirm this invitation. Check your manager access and company records before trying again.';message.classList.add('error');return;}
      message.textContent='Invitation created by the server. No email has been sent. Share the one-time invitation code securely with this recipient; this code is not a password or a signed-in session.';
      const code=document.createElement('code');code.textContent=result.data.code;code.className='invitation-code';message.after(code);
      state.invite=null;
    } catch (_) {$('inviteMessage').textContent='The invitation service could not confirm a result. Check the team records before trying again.';$('inviteMessage').classList.add('error');}
    finally {if(state.invite) button.disabled=false;}
  }
  function openGuide(id,updateURL=true) {
    if (!office || !catalog[id]) return;
    state.guide=id;state.step=0;selectTab('integrations',false);renderGuide();
    if (!$('integrationDialog').open) $('integrationDialog').showModal();
    if (updateURL) {const url=new URL(location.href);url.searchParams.set('tab','integrations');url.searchParams.set('integration',id);history.replaceState(null,'',url);}
  }
  function renderGuide() {
    const item=catalog[state.guide];if (!item) return;
    const status=connection(state.guide),step=item.steps[state.step],last=state.step===item.steps.length-1;
    $('guideTitle').textContent=item.title;
    let authorized='';
    if (state.guide==='google' && status.value && status.value.oauthAuthorized===true && Array.isArray(status.value.calendars)) {
      const calendars=status.value.calendars.filter(c=>c&&typeof c.id==='string'&&typeof c.summary==='string');
      authorized=`<div class="calendar-choice"><h3>Authorized calendars</h3><p class="muted">Returned by your authorized Google account. Selection does not change synchronization in this demo.</p><label for="authorizedCalendar">Calendar</label><select id="authorizedCalendar"><option value="">Choose an authorized calendar</option>${calendars.map(c=>`<option value="${esc(c.id)}">${esc(c.summary)}</option>`).join('')}</select>${Array.isArray(status.value.scopes)?`<p class="muted small">Granted scopes: ${status.value.scopes.map(esc).join(', ')||'None returned'}</p>`:''}</div>`;
    }
    $('guideContent').innerHTML=`<div class="guide-body"><div class="guide-status"><span class="status-pill ${esc(status.className)}">${esc(status.label)}</span><span class="muted small">${state.guide==='maps'?'Address links work without an API connection.':'Connection status comes from the server.'}</span></div><p class="guide-intro">${esc(item.summary)}</p><div class="guide-permissions"><div><strong>Read access</strong><p>${esc(item.read)}</p></div><div><strong>Write access &amp; consent</strong><p>${esc(item.write)}</p></div></div><div class="guide-steps" aria-hidden="true">${item.steps.map((_,i)=>`<span class="${i<=state.step?'current':''}"></span>`).join('')}</div><div class="guide-step-count">Step ${state.step+1} of ${item.steps.length}</div><h3>${esc(step[0])}</h3><p class="guide-step-copy">${esc(step[1])}</p><div class="guide-links">${item.links.map(([name,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)} →</a>`).join('')}</div>${authorized}${last?`<div class="guide-action"><p class="muted">${status.label==='Connected'?'This provider reports a connected account. Verify each requested operation before relying on its result.':'The guide is ready. Activation still needs server configuration and provider authorization; completing these steps here does not connect an account.'}</p><button class="button secondary" type="button" id="guideCheck">Check connection status</button><p class="muted small">An administrator can follow the <a class="text-link" href="docs/EMET_AUTH_SETUP.md">secure setup guide</a>. Keep all secret credentials on the server.</p></div>`:''}<div class="guide-buttons"><button class="text-button" id="guidePrevious" type="button" ${state.step?'':'disabled'}>← Previous</button><button class="button primary" id="guideNext" type="button">${last?'Done':'Next step →'}</button></div></div>`;
    $('guidePrevious').onclick=()=>{if(state.step>0){state.step--;renderGuide();}};
    $('guideNext').onclick=()=>{if(last) closeGuide();else{state.step++;renderGuide();}};
    if ($('guideCheck')) $('guideCheck').onclick=checkService;
  }
  function closeGuide() {$('integrationDialog').close();state.guide=null;const url=new URL(location.href);url.searchParams.delete('integration');history.replaceState(null,'',url);}
  document.querySelectorAll('[data-office]').forEach(node=>node.hidden=!office);
  document.querySelectorAll('[role=tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab,true)));
  document.querySelector('[role=tablist]').addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')].filter(t=>!t.hidden),current=tabs.indexOf(document.activeElement);const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+tabs.length)%tabs.length;tabs[index].focus();selectTab(tabs[index].dataset.tab,true);});
  $('headerProfile').onclick=()=>selectTab('profile',true);
  $('signOut').onclick=async()=>{if(!state.account){GTFAuth.logout();return;}try{const result=await requestJSON('/api/emet/session',{method:'POST',headers:{'Content-Type':'application/json','X-Emet-CSRF':state.session.csrfToken},body:JSON.stringify({action:'logout'})});if(!result.ok)throw new Error('logout_failed');location.href='emet.html';}catch(_){profileMessage('The server could not confirm sign out. Please try again.',true);selectTab('profile',true);}};
  $('profileForm').addEventListener('submit',saveProfile);
  $('emailChangeForm').addEventListener('submit',event=>changeCredentials(event,'email'));
  $('passwordChangeForm').addEventListener('submit',event=>changeCredentials(event,'password'));
  $('avatarFile').addEventListener('change',async event=>{try{await prepareAvatar(event.target.files[0]);}catch(error){profileMessage(error.message||'The photo could not be prepared.',true);}finally{event.target.value='';}});
  $('removeAvatar').onclick=()=>{state.avatarTask++;state.avatar=null;state.avatarChanged=true;renderAvatar($('profileAvatar'),$('displayName').value,null);profileMessage(state.account?'Photo removed from the preview. Save your profile to keep this change.':'Photo removed from the preview. Save your local profile to keep this change.');};
  $('displayName').addEventListener('input',()=>{if(!state.avatar)renderAvatar($('profileAvatar'),$('displayName').value,null);});
  $('inviteForm').addEventListener('submit',reviewInvitation);
  $('inviteOrganization').addEventListener('change',()=>{state.invite=null;$('invitePreview').hidden=true;});
  $('inviteRole').addEventListener('change',()=>{const client=$('inviteRole').value==='client';$('inviteProjectField').hidden=!client;$('inviteProject').required=client;$('inviteProject').setCustomValidity('');});
  $('inviteProject').addEventListener('input',()=>$('inviteProject').setCustomValidity(''));
  $('integrationGrid').addEventListener('click',event=>{const button=event.target.closest('[data-guide]');if(button)openGuide(button.dataset.guide);});
  $('closeGuide').onclick=closeGuide;
  $('integrationDialog').addEventListener('cancel',event=>{event.preventDefault();closeGuide();});
  $('integrationDialog').addEventListener('click',event=>{if(event.target===$('integrationDialog')){const box=$('integrationDialog').getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeGuide();}});
  document.querySelectorAll('[data-check-service]').forEach(button=>button.addEventListener('click',checkService));
  showProfile();renderTeam();renderConnections();
  selectTab(params.get('tab')||'profile',false);
  if(params.get('integration')&&catalog[params.get('integration')])openGuide(params.get('integration'),false);
  checkService();
})();
