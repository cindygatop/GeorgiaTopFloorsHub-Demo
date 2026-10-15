"""Office/compliance smoke flows. Run against a local static HTTP server."""
import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

base = os.environ.get('GTF_BASE_URL', 'http://127.0.0.1:8000/').rstrip('/') + '/'
artifacts = Path(os.environ.get('GTF_QA_ARTIFACTS', str(Path(tempfile.gettempdir()) / 'gtf-v5-qa')))
artifacts.mkdir(parents=True, exist_ok=True)
results, errors, overflow = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    for name in ['Caritas', 'Cristiano', 'Alicia', 'Cindy']:
        page.goto(base + 'login.html', wait_until='domcontentloaded')
        page.locator('button.demo-account').filter(has_text=name).click()
        page.wait_for_url('**/index.html')
        assert name in page.locator('#assistantGreeting').inner_text()
        assert all(j.get('projectId') and j.get('appointmentId') for j in page.evaluate('GTFJobs()'))
        page.locator('#gtfUserChip button').click()
        page.wait_for_url('**/login.html')
    results.append('Four Office profile logins, personalized greetings, logout, stable job IDs: PASS')
    page.locator('button.demo-account').filter(has_text='Caritas').click()
    page.wait_for_url('**/index.html')
    page.evaluate("GTFAdaptive.trackAction('qa-caritas-only', 'QA action', 'compliance.html')")
    page.locator('#gtfUserChip button').click()
    page.wait_for_url('**/login.html')
    page.locator('button.demo-account').filter(has_text='Cindy').click()
    page.wait_for_url('**/index.html')
    usage = page.evaluate("JSON.parse(localStorage.getItem('gtfAdaptiveUsageV1'))")
    assert usage['office-caritas']['qa-caritas-only']['count'] == 1
    assert 'qa-caritas-only' not in usage.get('office-cindy', {})
    results.append('Office shortcut usage persists separately for each profile: PASS')
    for level in ['red', 'yellow', 'green']:
        page.locator(f'[data-priority="{level}"]').click()
        assert page.locator('#assistantConversation .assistant-message').count() > 0
    results.append('All three priority flags respond to clicks: PASS')

    page.goto(base + 'compliance.html', wait_until='domcontentloaded')
    # Keep the coverage fixture meaningful as the real date advances. The sample
    # company's WC expires on 2026-10-12, so its original status is time-dependent.
    page.evaluate('''() => {
        const data = GTFCompliance.load();
        const day = (offset) => {
            const date = new Date(GTFCompliance.TODAY + 'T12:00:00Z');
            date.setUTCDate(date.getUTCDate() + offset);
            return date.toISOString().slice(0, 10);
        };
        const expirationOffsets = {
            'cmp-gl': 180, 'cmp-wc': 3,
            'sub-lucas-coi': -5, 'sub-marcos-coi': -29, 'sub-marcos-wc': 180
        };
        for (const [id, offset] of Object.entries(expirationOffsets)) {
            const record = data.records.find(item => item.id === id);
            if (!record) throw new Error('Missing insurance test fixture: ' + id);
            record.expirationDate = day(offset);
            record.status = 'Current';
        }
        GTFCompliance.save(data);
    }''')
    page.select_option('#typeFilter', label='Insurance / COI')
    rows = page.locator('#recordRows tr.compliance-group-row')
    assert rows.count() == 3
    marcos = rows.filter(has_text='Marcos Silva')
    assert marcos.count() == 1
    marcos.get_by_role('button', name='Open →').click()
    assert page.locator('#drawerTitle').inner_text() == 'Certificate of Insurance (COI)'
    assert page.locator('#drawerContent .coverage-item').count() == 2
    assert 'General Liability' in page.locator('#drawerContent').inner_text()
    assert "Workers' Compensation" in page.locator('#drawerContent').inner_text()
    page.get_by_role('button', name='Close', exact=True).click()
    page.select_option('#statusFilter', label='Expired')
    expired_rows = page.locator('#recordRows tr.compliance-group-row')
    assert expired_rows.count() == 2
    assert set(expired_rows.locator('td:first-child strong').all_text_contents()) == {
        'Lucas Ferreira / LF Floors', 'Marcos Silva / MS Finish'
    }
    assert expired_rows.locator('td:nth-child(4) .badge').all_text_contents() == ['Expired', 'Expired']
    page.select_option('#statusFilter', label='Expiring Soon')
    expiring_rows = page.locator('#recordRows tr.compliance-group-row')
    assert expiring_rows.count() == 1
    assert expiring_rows.locator('td:first-child strong').inner_text() == 'Georgia Top Floors'
    assert expiring_rows.locator('td:nth-child(4) .badge').inner_text() == 'Expiring Soon'
    page.select_option('#statusFilter', value='')
    assert page.locator('#attentionQueue .attention').filter(has_text='Marcos Silva').count() == 1
    assert 'Certificate of Insurance (COI)' in page.locator('#attentionQueue .attention').filter(has_text='Marcos Silva').inner_text()
    page.locator('#attentionQueue .attention').filter(has_text='Marcos Silva').get_by_role('button', name='Review').click()
    assert page.locator('#drawerTitle').inner_text() == 'Certificate of Insurance (COI)'
    assert page.locator('#drawerContent .coverage-item').count() == 2
    page.get_by_role('button', name='Close', exact=True).click()
    page.select_option('#typeFilter', label='W-9 & Tax Forms')
    page.locator('#recordRows tr').filter(has_text='Lucas Ferreira').get_by_role('button', name='Open →').click()
    text = page.locator('#drawerContent').inner_text()
    assert 'routine federal expiration date' in text and 'annual internal review' in text
    page.get_by_role('button', name='Complete Annual Review', exact=True).click()
    assert 'Next internal review date updated' in page.locator('#toast').inner_text()
    page.get_by_role('button', name='Close', exact=True).click()
    results.append('Single COI row, nested GL/WC from table and attention queue, type/status filters, internal W-9 review: PASS')

    # Apostrophes are preserved when rendering Calendar event drafts.
    page.evaluate("() => { const jobs=JSON.parse(localStorage.getItem('gtfDemoJobs'));jobs[0].customer=\"QA O'Neil\";localStorage.setItem('gtfDemoJobs',JSON.stringify(jobs)); }")
    page.goto(base + 'calendar.html', wait_until='domcontentloaded')
    assert "QA O'Neil" in page.locator('#eventList').inner_text()
    assert 'NOT CONNECTED' in page.locator('body').inner_text()
    results.append('Calendar apostrophe escaping and truthful NOT CONNECTED status: PASS')

    for width in [1440, 390]:
        page.set_viewport_size({'width': width, 'height': 1000 if width == 1440 else 844})
        for route in ['index.html', 'database.html', 'documents.html', 'calendar.html', 'compliance.html']:
            page.goto(base + route, wait_until='domcontentloaded')
            measure = page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth})')
            if measure['document'] > measure['viewport'] + 1:
                overflow.append({'route': route, 'width': width, **measure})
            page.screenshot(path=str(artifacts / f'office-{route[:-5]}-{width}.png'), full_page=True)
    results.append('Office pages opened at 1440 px and 390 px; overflow measurements and screenshots recorded')
    browser.close()

report = {'results': results, 'pageErrors': errors, 'horizontalOverflow': overflow}
(artifacts / 'office-compliance-results.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
assert not errors, errors
assert not overflow, overflow
