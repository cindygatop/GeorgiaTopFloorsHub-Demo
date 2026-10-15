"""Local browser checks using fictional files only; no external service calls.

Requires Playwright/Chromium and a local HTTP server. GTF_BASE_URL overrides it.
Private customer or pricing attachments must never be copied into this test.
"""
import json
import os
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from playwright.sync_api import sync_playwright, expect


BASE = os.environ.get("GTF_BASE_URL", "http://127.0.0.1:8011/").rstrip("/") + "/"


def fictional_workbook(path):
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fictional prices" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Standard</t></is></c><c r="C1" t="inlineStr"><is><t>Contractor</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Fictional service</t></is></c><c r="B2"><v>12.50</v></c><c r="C2"><v>0</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Other fictional service</t></is></c><c r="B3"><v>4.75</v></c></row></sheetData></worksheet>')
        archive.writestr("xl/worksheets/sheet2.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>')


with tempfile.TemporaryDirectory(prefix="gtf-data-tools-test-") as temporary:
    temporary = Path(temporary)
    xlsx = temporary / "fictional-prices.xlsx"
    fictional_workbook(xlsx)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        errors, unexpected_requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: unexpected_requests.append(request.url) if not request.url.startswith(BASE) and not request.url.startswith("blob:") else None)
        page.on("dialog", lambda dialog: dialog.accept())
        page.goto(BASE + "login.html", wait_until="domcontentloaded")
        page.get_by_role("button", name="Caritas").click()
        page.wait_for_url("**/index.html")
        page.goto(BASE + "data-tools.html", wait_until="domcontentloaded")
        assert page.locator("h1").inner_text() == "Your files, ready for review."
        before_storage = page.evaluate("JSON.stringify({...localStorage})")

        csv = 'Name,Email,Phone,Notes\r\nDemo Alpha,shared@example.invalid,+15550100101,"Quoted, note"\r\nDemo Beta,shared@example.invalid,+15550100102,Other\r\n"<img src=x onerror=window.injection=1>",xss@example.invalid,,Safe\r\n=2+2,formula@example.invalid,,Safe\r\n'
        for index in range(30):
            csv += f"Fictional customer {index},sample{index}@example.invalid,,Pagination\r\n"
        page.locator("#sourceFile").set_input_files({"name": "fictional-contacts.csv", "mimeType": "text/csv", "buffer": csv.encode()})
        page.locator("#buildPreview").click()
        assert page.locator("#previewRows tr").count() == 25
        assert page.locator("#addToSession").is_disabled()
        assert page.evaluate("window.injection") is None
        assert page.locator("#previewRows img").count() == 0
        page.locator("#previewNext").click()
        assert page.locator("#previewRows tr").count() == 9
        page.locator("#previewPrev").click()
        for name in ["Demo Alpha", "Demo Beta"]:
            page.locator("#previewRows tr").filter(has_text=name).get_by_role("button", name="Review / edit").click()
            assert page.locator("#duplicateDecision").is_visible()
            page.locator("#keepSeparate").check()
            page.locator("#saveEditor").click()
            assert not page.locator("#editDialog").is_visible()
        assert page.locator("#addToSession").is_enabled()
        page.locator("#addToSession").click()
        assert "34 customers" in page.locator("#sessionSummary").inner_text()
        assert page.evaluate("JSON.stringify({...localStorage})") == before_storage
        with page.expect_download() as pending:
            page.locator("#exportJSON").click()
        backup = temporary / "workspace.json"
        pending.value.save_as(backup)
        records = json.loads(backup.read_text())["records"]
        assert len(records) == 34
        assert len([record for record in records if record.get("review", {}).get("decision") == "keep-separate"]) == 2
        with page.expect_download() as pending:
            page.locator("#exportCSV").click()
        exported = temporary / "workspace.csv"
        pending.value.save_as(exported)
        assert "'=2+2" in exported.read_text(encoding="utf-8-sig")

        # Reimporting the same backup must produce separate candidates for review.
        page.locator("#sourceFile").set_input_files(str(backup))
        assert page.locator("#previewSection").is_visible()
        assert page.locator("#addToSession").is_disabled()
        assert "need review" in page.locator("#previewIssues").inner_text()
        page.locator("#clearSource").click()
        page.locator("#clearSession").click()
        assert page.locator("#sessionRows").inner_text().startswith("Add reviewed")

        page.locator("#sourceFile").set_input_files(str(xlsx))
        expect(page.locator("#sheetSelect option")).to_have_count(2)
        page.select_option("#entitySelect", "products")
        page.locator("#buildPreview").click()
        assert page.locator("#previewRows tr").count() == 2
        assert page.locator("#previewRows").inner_text().count("Contractor") == 1
        page.locator("#addToSession").click()
        assert "3 product price entries" in page.locator("#sessionSummary").inner_text()
        with page.expect_download() as pending:
            page.locator("#exportJSON").click()
        pending.value.save_as(backup)
        products = json.loads(backup.read_text())["records"]
        assert products[0]["prices"][1]["unitPrice"] == 0
        assert len(products[1]["prices"]) == 1
        assert products[0]["prices"][1]["customerType"] == "Contractor"
        page.locator("#exportProducts").uncheck()
        with page.expect_download() as pending:
            page.locator("#exportJSON").click()
        pending.value.save_as(backup)
        price_rows = json.loads(backup.read_text())["records"]
        assert len(price_rows) == 3 and all(record["entity"] == "prices" for record in price_rows)
        assert any(record["fields"]["unitPrice"] == 0 for record in price_rows)
        assert page.evaluate("JSON.stringify({...localStorage})") == before_storage

        for width in [1440, 390]:
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Page overflow at {width}px"
        page.locator("#clearSource").click()
        page.locator("#clearSession").click()
        page.reload(wait_until="domcontentloaded")
        assert "No records" in page.locator("#sessionSummary").inner_text()
        assert not errors, errors
        assert not unexpected_requests, unexpected_requests
        browser.close()
        print("PASS: CSV/XLSX preview, pagination, explicit duplicate decisions, XSS-safe DOM, JSON reimport, tier prices/zero, protected CSV, exports, unchanged localStorage, clear/reload, desktop/mobile, no external requests or JS errors.")
