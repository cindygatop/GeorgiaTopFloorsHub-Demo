"""Invoice chat flow through real demo controls; never contacts a provider."""
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.environ.get('GTF_BASE_URL', 'http://127.0.0.1:8000/').rstrip('/') + '/'
artifacts = Path(os.environ.get('GTF_QA_ARTIFACTS', str(Path(tempfile.gettempdir()) / 'gtf-invoice-chat-qa')))
artifacts.mkdir(parents=True, exist_ok=True)
results, errors, posts = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in (1440, 390):
        context = browser.new_context(viewport={'width': width, 'height': 1000})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: posts.append(request.url) if request.method == 'POST' else None)
        page.goto(base + 'login.html', wait_until='domcontentloaded')
        page.locator("button[onclick=\"demo('office-cindy')\"]").click()
        page.wait_for_url('**/index.html')
        page.wait_for_selector('#assistantInput')
        page.evaluate('''() => {
          const jobs=GTFJobs(), emily=jobs.find(j=>j.id===2);
          emily.projectId='project-2'; emily.appointmentId='appointment-2';
          jobs.push({...emily,id:92,projectId:'project-92',appointmentId:'appointment-92',address:'Other fictional property in Marietta, GA'}); persist();
          GTFWorkflow.load();
        }''')

        def ask(text):
            page.fill('#assistantInput', text)
            page.locator('#assistantInput').press('Enter')

        def last_reply():
            return page.locator('#assistantConversation .assistant-message.assistant').last

        def stored():
            return page.evaluate("() => localStorage.getItem('gtfWorkflowV2')")

        before = stored()
        ask('bom dia cria uma incoice pra Emily')
        assert 'mais de um projeto ou appointment' in last_reply().inner_text()
        assert stored() == before
        last_reply().locator('[data-assistant-action="invoice-job:project-2:appointment-2"]').click()
        assert 'vencimento' in last_reply().inner_text()
        ask('vencimento 2026-10-30')
        assert 'Project: project-2 · Appointment: appointment-2' in last_reply().inner_text()
        assert 'Cobrar de: Emily Carter' in last_reply().inner_text()
        assert 'ainda não foi aprovado' in last_reply().inner_text()
        token = last_reply().locator('[data-assistant-action^="invoice-confirm:"]').get_attribute('data-assistant-action')
        assert stored() == before
        ask('bom dia')
        assert 'nada foi salvo' in last_reply().inner_text()
        assert last_reply().locator('[data-assistant-action^="invoice-confirm:"]').get_attribute('data-assistant-action') == token
        assert stored() == before
        last_reply().get_by_role('button', name='Salvar rascunho', exact=True).click()
        invoice = page.evaluate("() => GTFWorkflow.load().invoices.find(i=>i.projectId==='project-2')")
        assert invoice['status'] == 'Draft' and invoice['customerVisible'] is False
        assert invoice['appointmentId'] == 'appointment-2' and invoice['estimateId'] == 'est-1042'
        assert page.evaluate("() => GTFWorkflow.getCustomerBundle('Emily Carter','project-2').invoice") is None
        assert 'Nada foi enviado, emitido, cobrado ou pago' in last_reply().inner_text()
        results.append(f'{width}px: typo + project disambiguation + missing due date + greeting-preserved preview + confirmed hidden Draft: PASS')

        snapshot = stored()
        ask('altera isso')
        assert 'O que você quer alterar' in last_reply().inner_text()
        ask('item 2 preço unitário 1.25')
        assert stored() == snapshot
        ask('envia essa invoice')
        assert 'Não enviei nada' in last_reply().inner_text()
        assert stored() == snapshot
        ask('sim')
        updated = page.evaluate("() => GTFWorkflow.load().invoices.find(i=>i.projectId==='project-2')")
        assert updated['id'] == invoice['id'] and updated['items'][1]['unitPrice'] == 1.25
        assert updated['items'][0] == invoice['items'][0]
        assert updated['items'][2] == invoice['items'][2]
        assert updated['status'] == 'Draft' and updated['customerVisible'] is False
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
        page.screenshot(path=str(artifacts / f'invoice-chat-{width}.png'), full_page=True)
        results.append(f'{width}px: reference-based exact Draft edit + no writes before confirmation + explicit no-send + no overflow: PASS')

        page.goto(base + 'documents.html', wait_until='domcontentloaded')
        page.evaluate('(id)=>openInvoice(id)', updated['id'])
        drawer = page.locator('#drawerContent')
        assert 'Draft' in drawer.inner_text()
        assert drawer.get_by_role('button', name='Record Payment', exact=True).count() == 0
        assert drawer.get_by_role('button', name='Open Customer View', exact=True).count() == 0
        results.append(f'{width}px: Draft available in Billing, no payment or client action: PASS')
        context.close()
    assert not errors, errors
    assert not posts, posts
    browser.close()

report = {'results': results, 'pageErrors': errors, 'postRequests': posts}
(artifacts / 'assistant-invoice-results.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
