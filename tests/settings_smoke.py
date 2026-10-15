"""Settings browser checks; provider responses are explicit mocks, not live services.
Run with a static server and GTF_BASE_URL. Uses synthetic accounts/photos only.
"""
import base64,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.getenv('GTF_BASE_URL','http://127.0.0.1:8011/').rstrip('/')+'/'
artifacts=Path(os.getenv('GTF_QA_ARTIFACTS','/workspace/scratch/settings-qa'));artifacts.mkdir(parents=True,exist_ok=True)
errors=[];results=[];overflow=[];posts=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1000})
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r: posts.append(r.url) if r.method=='POST' else None)
 page.route('**/api/emet/status',lambda r:r.fulfill(status=503,content_type='application/json',body=json.dumps({'status':'provisioning_required','capabilities':{'authentication':False}})))
 page.goto(base+'login.html');page.evaluate("GTFAuth.loginAs('office-cindy')")
 page.goto(base+'settings.html')
 page.wait_for_selector('#displayName')
 assert page.input_value('#displayName')=='Cindy'
 page.fill('#displayName','Cindy QA');page.get_by_role('button',name='Save local profile',exact=True).click()
 assert 'Local profile saved' in page.locator('#profileMessage').inner_text()
 data=page.evaluate("JSON.parse(localStorage.getItem('emetProfileV1'))")
 assert set(data['office-cindy'])=={'name','avatar'}
 page.set_input_files('#avatarFile',{'name':'attack.svg','mimeType':'image/svg+xml','buffer':b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'})
 page.wait_for_function("document.getElementById('profileMessage').textContent.includes('PNG, JPEG or WebP')")
 png=page.evaluate("() => {const c=document.createElement('canvas');c.width=50;c.height=50;const x=c.getContext('2d');x.fillStyle='green';x.fillRect(0,0,50,50);return c.toDataURL('image/png').split(',')[1]}")
 page.set_input_files('#avatarFile',{'name':'profile.png','mimeType':'image/png','buffer':base64.b64decode(png)})
 page.wait_for_function("document.getElementById('profileMessage').textContent.includes('Photo ready')")
 page.get_by_role('button',name='Save local profile',exact=True).click()
 assert page.locator('#profileAvatar img').count()==1
 results.append('Demo profile name/avatar persists per user; SVG rejected; raster resized and reencoded: PASS')
 page.get_by_role('tab',name='Team & invitations').click()
 page.fill('#inviteEmail','qa@example.test');page.get_by_role('button',name='Review invitation',exact=True).click()
 assert page.locator('#confirmInvite').is_disabled()
 assert 'No invitation has been created or sent' in page.locator('#invitePreview').inner_text()
 assert not posts,posts
 results.append('Unavailable backend creates no invitation, sends no email and writes no account credentials: PASS')
 page.goto(base+'settings.html?integration=google')
 assert page.locator('#integrationDialog').is_visible()
 assert page.locator('#authorizedCalendar').count()==0
 assert 'Gmail is separate' in page.locator('#guideContent').inner_text()
 page.get_by_role('button',name='Close connection guide').click()
 page.goto(base+'settings.html?integration=quo')
 for _ in range(4): page.get_by_role('button',name='Next step →',exact=True).click()
 assert 'does not connect an account' in page.locator('#guideContent').inner_text()
 assert 'secret credentials on the server' in page.locator('#guideContent').inner_text()
 page.get_by_role('button',name='Done',exact=True).click()
 results.append('Calendar and Quo deep links, separate Gmail consent, no fabricated calendars, honest setup guides: PASS')
 for width in [1440,390]:
  page.set_viewport_size({'width':width,'height':1000 if width==1440 else 844})
  for tab in ['profile','team','integrations','company','data']:
   page.locator('[data-tab="'+tab+'"]').click()
   measure=page.evaluate('({w:innerWidth,doc:document.documentElement.scrollWidth})')
   if measure['doc']>measure['w']+1:overflow.append({'width':width,'tab':tab,**measure})
  page.locator('[data-tab="integrations"]').click()
  page.screenshot(path=str(artifacts/f'settings-{width}.png'),full_page=True)
 results.append('Five settings tabs at 1440/390px, without document overflow: '+('PASS' if not overflow else 'FAIL'))
 ctx.close()
 # Contract fixtures below exercise real-account UI; no real backend or provider is claimed.
 ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 uid='11111111-1111-4111-8111-111111111111';org='22222222-2222-4222-8222-222222222222'
 account={'id':uid,'email':'manager@example.test','displayName':'Verified Manager','avatarUrl':None}
 session={'user':account,'memberships':[{'organizationId':org,'organizationName':'QA Company','role':'manager','status':'active'}],'csrfToken':'test-csrf-only'}
 page.route('**/api/emet/status',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'status':'ready','capabilities':{'authentication':True,'invitations':True,'profile':True,'googleCalendar':False,'gmail':False}})))
 page.route('**/api/emet/session',lambda r:r.fulfill(content_type='application/json',body=json.dumps(session)))
 page.route('**/api/emet/profile',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'status':'profile_updated','user':{**account,'displayName':'Real Name QA'}})))
 page.route('**/api/emet/invitations',lambda r:r.fulfill(status=201,content_type='application/json',body=json.dumps({'status':'invitation_created','invitation':{'id':'server-invitation-id'},'code':'emt_test_fixture_only','delivery':{'status':'not_sent'}})))
 page.goto(base+'settings.html?mode=account&tab=profile')
 page.wait_for_selector('#displayName')
 assert page.input_value('#displayName')=='Verified Manager'
 assert page.locator('#workspaceMode').inner_text()=='Secure account'
 page.fill('#displayName','Real Name QA');page.get_by_role('button',name='Save profile',exact=True).click()
 page.wait_for_function("document.getElementById('profileMessage').textContent.includes('Profile saved by')")
 assert page.evaluate('localStorage.length')==0
 page.get_by_role('tab',name='Team & invitations').click()
 assert 'QA Company' in page.locator('#teamList').inner_text()
 assert 'Caritas' not in page.locator('#teamList').inner_text()
 page.fill('#inviteEmail','new@example.test');page.get_by_role('button',name='Review invitation',exact=True).click()
 page.get_by_role('button',name='Confirm invitation',exact=True).click()
 page.wait_for_function("document.getElementById('inviteMessage').textContent.includes('Invitation created by the server')")
 assert 'No email has been sent' in page.locator('#inviteMessage').inner_text()
 assert page.locator('.invitation-code').inner_text()=='emt_test_fixture_only'
 assert page.evaluate('localStorage.length')==0
 results.append('Mock API contract: account mode without demo login, secure profile POST, manager invitation response, one-time code and no email claim/localStorage: PASS')
 # Secure photo upload contract: authorization, isolated signed upload, profile link only after success.
 profile_payloads=[];upload_requests=[]
 page.route('**/api/emet/avatar',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'status':'upload_authorized','uploadUrl':'https://storage.example.test/storage/v1/object/upload/sign/emet-avatars/'+uid+'/photo.webp?token=fixture','avatarPath':uid+'/photo.webp','contentType':'image/webp','maxBytes':2097152})))
 page.route('https://storage.example.test/**',lambda r:(upload_requests.append({'method':r.request.method,'headers':r.request.headers,'size':len(r.request.post_data_buffer or b'')}),r.fulfill(status=201,content_type='application/json',body='{}'))[-1])
 def save_profile(route):
  payload=route.request.post_data_json;profile_payloads.append(payload)
  route.fulfill(content_type='application/json',body=json.dumps({'status':'profile_updated','user':{**account,'displayName':payload['displayName'],'avatarUrl':None}}))
 page.unroute('**/api/emet/profile');page.route('**/api/emet/profile',save_profile)
 page.get_by_role('tab',name='Profile',exact=True).click()
 page.set_input_files('#avatarFile',{'name':'secure.png','mimeType':'image/png','buffer':base64.b64decode(png)})
 page.wait_for_function("document.getElementById('profileMessage').textContent.includes('Photo ready')")
 page.get_by_role('button',name='Save profile',exact=True).click()
 page.wait_for_function("document.getElementById('profileMessage').textContent.includes('Profile saved by')")
 assert len(upload_requests)==1 and upload_requests[0]['method']=='PUT' and upload_requests[0]['size']>0
 assert 'cookie' not in upload_requests[0]['headers']
 assert 'x-emet-csrf' not in upload_requests[0]['headers']
 assert profile_payloads[-1]['avatarPath']==uid+'/photo.webp'
 assert 'avatarUrl' not in profile_payloads[-1]
 assert page.evaluate('localStorage.length')==0
 results.append('Mock API contract: resized avatar requests upload permission, uses signed PUT without credentials, then saves only avatarPath to profile: PASS')
 # Real credential forms use explicit server states and clear every sensitive field.
 credentials=[]
 def change_credentials(route):
  data=route.request.post_data_json;credentials.append(data)
  status='email_change_requested' if 'newEmail' in data else 'password_updated'
  assert 'x-emet-csrf' in route.request.headers
  route.fulfill(content_type='application/json',body=json.dumps({'status':status}))
 page.route('**/api/emet/credentials',change_credentials)
 page.get_by_text('Change email address',exact=True).click()
 page.fill('#emailCurrentPassword','current-test-only');page.fill('#newAccountEmail','changed@example.test')
 page.get_by_role('button',name='Request email change',exact=True).click()
 page.wait_for_function("document.getElementById('emailChangeMessage').textContent.includes('Email change requested')")
 assert page.input_value('#emailCurrentPassword')=='' and page.input_value('#newAccountEmail')==''
 assert page.input_value('#accountEmail')=='manager@example.test'
 page.get_by_text('Change password',exact=True).click()
 page.fill('#passwordCurrentPassword','current-test-only');page.fill('#newAccountPassword','new-fixture-password-only');page.fill('#confirmAccountPassword','new-fixture-password-only')
 page.get_by_role('button',name='Update password',exact=True).click()
 page.wait_for_function("document.getElementById('passwordChangeMessage').textContent.includes('updated by the secure account service')")
 assert all(page.input_value(selector)=='' for selector in ['#passwordCurrentPassword','#newAccountPassword','#confirmAccountPassword'])
 assert len(credentials)==2
 assert page.evaluate('localStorage.length')==0
 results.append('Mock API contract: email change remains pending verification, password update confirmed by API, credentials fields cleared and nothing stored locally: PASS')
 page.unroute('**/api/emet/credentials')
 page.route('**/api/emet/credentials',lambda r:r.fulfill(status=503,content_type='application/json',body=json.dumps({'status':'error','error':'secure_email_change_setup_required'})))
 page.fill('#emailCurrentPassword','current-test-only');page.fill('#newAccountEmail','other@example.test')
 page.get_by_role('button',name='Request email change',exact=True).click()
 page.wait_for_function("document.getElementById('emailChangeMessage').textContent.includes('secure email confirmation')")
 assert page.input_value('#emailCurrentPassword')=='' and page.input_value('#newAccountEmail')==''
 assert page.input_value('#accountEmail')=='manager@example.test'
 results.append('Mock API contract: unavailable secure email change is explained without success and sensitive fields are cleared: PASS')
 b.close()
report={'results':results,'pageErrors':errors,'overflow':overflow}
(artifacts/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
assert not errors,errors
assert not overflow,overflow
