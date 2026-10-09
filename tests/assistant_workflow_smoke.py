import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('GTF_BASE_URL','http://127.0.0.1:8000/').rstrip('/')+'/'
artifacts=Path(os.environ.get('GTF_QA_ARTIFACTS',str(Path(tempfile.gettempdir())/'gtf-v5-qa')))
artifacts.mkdir(parents=True,exist_ok=True)
results=[]
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 page=ctx.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'login.html',wait_until='domcontentloaded')
 page.locator("button[onclick=\"demo('office-cindy')\"]").click()
 page.wait_for_url('**/index.html')
 page.wait_for_selector('#assistantInput')
 # Fixture: same customer, separate properties, estimate and two appointment-bound work orders.
 page.evaluate('''() => {
 const jobs=GTFJobs(); const emily=jobs.find(j=>j.id===2);
 emily.projectId='project-2';emily.appointmentId='appointment-2';
 jobs.push({...emily,id:92,projectId:'project-92',appointmentId:'appointment-92',address:'920 Other Road, Atlanta, GA',crew:'Other Crew'});persist();
 const s=GTFWorkflow.load();s.workOrders.push({id:'wo-2',number:'WO-2',projectId:'project-2',appointmentId:'appointment-2',estimateId:'est-1042',customer:'Emily Carter',scheduledDate:'',arrival:'8:00–9:00 AM',crew:'Edson',status:'Released'});s.workOrders.push({id:'wo-92',number:'WO-92',projectId:'project-92',appointmentId:'appointment-92',customer:'Emily Carter',scheduledDate:'',arrival:'8:00–9:00 AM',crew:'Other Crew',status:'Released'});GTFWorkflow.save(s);
 }''')
 before=page.evaluate("() => ({jobs:localStorage.getItem('gtfDemoJobs'),workflow:localStorage.getItem('gtfWorkflowV2')})")
 page.fill('#assistantInput','muda o job da Emilly Catrer pra sexta, 2 PM')
 page.locator('#assistantInput').press('Enter')
 page.wait_for_selector('[data-assistant-action^="choose:"]')
 assert page.locator('[data-assistant-action^="choose:"]').count()==2
 assert page.evaluate("() => ({jobs:localStorage.getItem('gtfDemoJobs'),workflow:localStorage.getItem('gtfWorkflowV2')})")==before
 page.locator('[data-assistant-action="choose:project-2:appointment-2"]').click()
 assert 'America/New_York' in page.locator('#assistantConversation').inner_text()
 assert page.evaluate("() => ({jobs:localStorage.getItem('gtfDemoJobs'),workflow:localStorage.getItem('gtfWorkflowV2')})")==before
 page.get_by_role('button',name='Confirm change',exact=True).click()
 saved=page.evaluate("() => ({jobs:GTFJobs(),workflow:GTFWorkflow.load(),notifications:GTFIntegrations.notifications()})")
 target=next(j for j in saved['jobs'] if j['id']==2)
 other=next(j for j in saved['jobs'] if j['id']==92)
 assert target['window']=='2:00 PM–3:00 PM'
 assert other['window']=='8:00–9:00 AM'
 targetwo=next(w for w in saved['workflow']['workOrders'] if w['id']=='wo-2')
 otherwo=next(w for w in saved['workflow']['workOrders'] if w['id']=='wo-92')
 assert targetwo['arrival']==target['window'] and otherwo['arrival']=='8:00–9:00 AM'
 assert all(n['status']=='setup-required' and n['appointmentId']=='appointment-2' for n in saved['notifications'])
 assert 'PENDING SETUP' in page.locator('#assistantConversation').inner_text()
 page.get_by_role('button',name='Draft a message',exact=True).click()
 assert 'Hello Emily' in page.locator('#assistantConversation').inner_text()
 page.screenshot(path=str(artifacts/'assistant-reschedule-desktop.png'),full_page=True)
 results.append('PT typo + sexta, duplicate-customer disambiguation, no preview writes, exact WO/appointment update, pending integrations and message draft: PASS')
 # English request gets a separate preview and cancel keeps persisted data untouched.
 snapshot=page.evaluate("() => localStorage.getItem('gtfDemoJobs')")
 page.fill('#assistantInput',"Change Emily Carter's appointment to tomorrow at 2 PM")
 page.locator('#assistantInput').press('Enter')
 page.locator('[data-assistant-action="choose:project-2:appointment-2"]').last.click()
 page.get_by_role('button',name='Cancel',exact=True).last.click()
 assert page.evaluate("() => localStorage.getItem('gtfDemoJobs')")==snapshot
 results.append('English request preview and cancel without writes: PASS')
 # Real UI creation: estimate → approval → WO → invoice all use the same generated project ID.
 page.goto(base+'documents.html',wait_until='domcontentloaded')
 page.get_by_role('button',name='+ New Estimate',exact=True).click()
 page.fill('#eCustomer','QA Demo Customer')
 page.fill('#eAddress','101 Test Lane, Roswell, GA')
 page.get_by_role('button',name='Save Estimate',exact=True).click()
 page.locator('#drawerContent').get_by_role('button',name='Approve',exact=True).click()
 page.locator('#drawerContent').get_by_role('button',name='Create Work Order',exact=True).click()
 page.get_by_role('button',name='Close',exact=True).filter(visible=True).first.click()
 state=page.evaluate('() => GTFWorkflow.load()')
 estimate=next(e for e in state['estimates'] if e['customer']=='QA Demo Customer')
 page.evaluate('(id) => openEstimate(id)',estimate['id'])
 page.locator('#drawerContent').get_by_role('button',name='Create Invoice',exact=True).click()
 state=page.evaluate('() => GTFWorkflow.load()')
 wo=next(w for w in state['workOrders'] if w['estimateId']==estimate['id'])
 inv=next(i for i in state['invoices'] if i['estimateId']==estimate['id'])
 assert estimate['projectId']==wo['projectId']==inv['projectId']
 results.append('New estimate → approved → WO → invoice through UI, stable project ID: PASS')
 assert not errors,errors
 browser.close()
(artifacts/'assistant-workflow-results.json').write_text(json.dumps({'results':results,'pageErrors':errors},indent=2))
print(json.dumps({'results':results,'pageErrors':errors},indent=2))
