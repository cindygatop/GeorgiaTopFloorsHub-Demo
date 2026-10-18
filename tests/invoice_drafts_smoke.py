"""Draft invoice editing and client/payment boundaries using synthetic demo data."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.environ.get('GTF_BASE_URL', 'http://127.0.0.1:8022/').rstrip('/') + '/'
artifacts = Path(os.environ.get('GTF_QA_ARTIFACTS', '/tmp/emet-invoice-drafts-qa'))
artifacts.mkdir(parents=True, exist_ok=True)
errors, results = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in (1440, 390):
        context = browser.new_context(viewport={'width': width, 'height': 1000})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + 'login.html', wait_until='domcontentloaded')
        page.locator('button.demo-account').filter(has_text='Cindy').click()
        page.wait_for_url('**/index.html')
        page.goto(base + 'documents.html', wait_until='domcontentloaded')
        invoice = page.evaluate('''() => {
            GTFWorkflow.reset();
            localStorage.setItem('gtfDemoJobs', JSON.stringify([{id:2,projectId:'project-2',appointmentId:'appointment-2',customer:'Emily Carter',company:'Direct Homeowner',service:'Sand & Finish',sf:'100 SF',address:'Demo property'}]));
            return GTFWorkflow.createInvoiceDraft({projectId:'project-2',appointmentId:'appointment-2',estimateId:null,customer:'Emily Carter',projectCustomer:'Emily Carter',company:'Direct Homeowner',customerType:'direct',address:'Demo property',issued:'2026-10-15',dueDate:'2026-11-15',items:[{description:'Sand & Finish',qty:100,unit:'SF',unitPrice:4}],taxRate:0,discount:0,notes:'Synthetic draft',paymentRule:'Review before issue',actor:'Cindy'});
        }''')
        page.locator('[data-tab="invoices"]').click()
        page.locator('#content tr').filter(has_text=invoice['number']).get_by_role('button', name='Open →').click()
        assert 'Draft — Office only' in page.locator('#drawerContent').inner_text()
        assert page.locator('#drawerContent').get_by_role('button', name='Record Payment', exact=True).count() == 0
        assert page.locator('#drawerContent').get_by_role('button', name='Open Customer View', exact=True).count() == 0
        page.get_by_role('button', name='Edit Draft', exact=True).click()
        assert page.locator('#eStatus').is_disabled()
        assert page.locator('#eCustomer').is_disabled()
        page.locator('#itemRows .qty').fill('150')
        page.locator('#itemRows .price').fill('5')
        page.locator('#eDiscount').fill('25')
        page.locator('#eNotes').fill('<img src=x onerror="window.invoiceInjected=true"> Review only')
        page.get_by_role('button', name='Save Draft', exact=True).click()
        saved = page.evaluate('(id) => GTFWorkflow.load().invoices.find(i=>i.id===id)', invoice['id'])
        assert saved['items'][0]['qty'] == 150 and saved['items'][0]['unitPrice'] == 5
        assert saved['status'] == 'Draft' and saved['customerVisible'] is False
        assert page.locator('#drawerContent img').count() == 0
        assert page.evaluate('window.invoiceInjected || false') is False
        assert '$725.00' in page.locator('#drawerContent').inner_text()
        assert 'Nothing was sent or charged' in page.locator('#toast').inner_text()
        page.get_by_role('button', name='Edit Draft', exact=True).click()
        page.evaluate('(id) => GTFWorkflow.updateInvoiceDraft(id,{notes:"Newer edit"})', invoice['id'])
        page.locator('#eNotes').fill('Stale edit')
        page.get_by_role('button', name='Save Draft', exact=True).click()
        assert 'fresh preview' in page.locator('#toast').inner_text()
        assert page.evaluate('(id)=>GTFWorkflow.load().invoices.find(i=>i.id===id).notes', invoice['id']) == 'Newer edit'
        page.get_by_role('button', name='Close', exact=True).filter(visible=True).click()
        page.evaluate('(id)=>openPayment(id)', invoice['id'])
        assert not page.locator('#paymentModal').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(artifacts / f'draft-office-{width}.png'), full_page=True)
        page.goto(base + 'customer.html?preview=1', wait_until='domcontentloaded')
        assert invoice['number'] not in page.locator('#customerDocuments').inner_text()
        assert page.locator('#customerDocuments').get_by_role('button', name='View / Pay', exact=True).count() == 0
        assert page.evaluate('GTFWorkflow.getCustomerBundle("Emily Carter","project-2").invoice') is None
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.goto(base + 'documents.html', wait_until='domcontentloaded')
        page.locator('[data-tab="invoices"]').click()
        page.locator('#content tr').filter(has_text=invoice['number']).get_by_role('button', name='Open →').click()
        page.get_by_role('button', name='Review & Issue Draft', exact=True).click()
        assert 'No approved estimate' in page.locator('#invoiceIssueSelection').inner_text()
        assert page.get_by_role('button', name='Preview Local Issue', exact=True).is_disabled()
        assert page.evaluate('GTFWorkflow.getEstimate("est-1042").status') == 'Sent'
        page.locator('#invoiceIssueModal').get_by_role('button', name='Cancel', exact=True).click()
        page.evaluate('closeDrawer()')
        page.locator('[data-tab="estimates"]').click()
        page.locator('#content tr').filter(has_text='EST-1042').get_by_role('button', name='Open →').click()
        page.locator('#drawerContent').get_by_role('button', name='Approve', exact=True).click()
        page.evaluate('closeDrawer()')
        page.locator('[data-tab="invoices"]').click()
        page.locator('#content tr').filter(has_text=invoice['number']).get_by_role('button', name='Open →').click()
        page.get_by_role('button', name='Review & Issue Draft', exact=True).click()
        assert page.locator('#invoiceIssueEstimate').input_value() == ''
        page.get_by_role('button', name='Preview Local Issue', exact=True).click()
        assert 'Choose an approved estimate' in page.locator('#toast').inner_text()
        page.locator('#invoiceIssueEstimate').select_option('est-1042')
        page.get_by_role('button', name='Preview Local Issue', exact=True).click()
        assert '$725.00' in page.locator('#invoiceIssuePreview').inner_text()
        assert page.evaluate('(id)=>GTFWorkflow.load().invoices.find(i=>i.id===id).status', invoice['id']) == 'Draft'
        page.evaluate('(id)=>GTFWorkflow.updateInvoiceDraft(id,{notes:"New edit after preview"})', invoice['id'])
        page.get_by_role('button', name='Confirm Local Issue', exact=True).click()
        assert 'fresh preview' in page.locator('#toast').inner_text()
        assert page.evaluate('(id)=>GTFWorkflow.load().invoices.find(i=>i.id===id).status', invoice['id']) == 'Draft'
        page.get_by_role('button', name='Back to Review', exact=True).click()
        page.locator('#invoiceIssueEstimate').select_option('est-1042')
        page.get_by_role('button', name='Preview Local Issue', exact=True).click()
        page.locator('#invoiceIssueModal').get_by_role('button', name='Cancel', exact=True).click()
        assert page.evaluate('(id)=>GTFWorkflow.load().invoices.find(i=>i.id===id).status', invoice['id']) == 'Draft'
        page.get_by_role('button', name='Review & Issue Draft', exact=True).click()
        page.locator('#invoiceIssueEstimate').select_option('est-1042')
        page.get_by_role('button', name='Preview Local Issue', exact=True).click()
        page.get_by_role('button', name='Confirm Local Issue', exact=True).click()
        issued = page.evaluate('(id)=>GTFWorkflow.load().invoices.find(i=>i.id===id)', invoice['id'])
        assert issued['status'] == 'Open' and issued['customerVisible'] is True and issued['estimateId'] == 'est-1042'
        assert 'Issued in the local demo only' in page.locator('#drawerContent').inner_text()
        assert 'Nothing was sent or charged' in page.locator('#toast').inner_text()
        page.locator('#drawerContent').get_by_role('button', name='Record Payment', exact=True).click()
        page.locator('#payAmount').fill('200')
        page.locator('#payMethod').select_option('Check')
        page.locator('#paymentModal').get_by_role('button', name='Record Payment', exact=True).click()
        assert 'Partially Paid' in page.locator('#drawerContent').inner_text()
        assert 'No money was charged' in page.locator('#toast').inner_text()
        page.goto(base + 'customer.html?preview=1', wait_until='domcontentloaded')
        assert invoice['number'] in page.locator('#customerDocuments').inner_text()
        assert page.locator('#customerDocuments').get_by_role('button', name='View / Pay', exact=True).count() == 1
        assert page.evaluate('GTFWorkflow.getCustomerBundle("Emily Carter","project-2").invoiceFinancials.balance') == 525
        page.screenshot(path=str(artifacts / f'issued-client-{width}.png'), full_page=True)
        page.goto(base + 'documents.html', wait_until='domcontentloaded')
        page.evaluate('(id)=>openInvoice(id)', invoice['id'])
        page.locator('#drawerContent').get_by_role('button', name='Record Payment', exact=True).click()
        assert page.locator('#payAmount').input_value() == '525.00'
        page.locator('#paymentModal').get_by_role('button', name='Record Payment', exact=True).click()
        assert page.evaluate('(id)=>GTFWorkflow.invoiceFinancials(GTFWorkflow.load(),GTFWorkflow.load().invoices.find(i=>i.id===id)).status', invoice['id']) == 'Paid'
        assert page.locator('#drawerContent').get_by_role('button', name='Record Payment', exact=True).count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        results.append(f'{width}px: edit, stale-write protection, escaped notes, approved source selection, issue preview/confirmation, client visibility and partial/full demo payments: PASS')
        context.close()
    browser.close()

assert not errors, errors
print(json.dumps({'results':results, 'pageErrors':errors}, indent=2))
