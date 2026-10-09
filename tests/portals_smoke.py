"""Browser smoke checks for the local static demo; requires Python Playwright.

Run with a local HTTP server: python tests/portals_smoke.py
Screenshots are written outside the repository, under /workspace/scratch.
"""
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright

BASE = os.environ.get("GTF_TEST_URL", "http://127.0.0.1:8000")
ARTIFACTS = Path(os.environ.get("GTF_QA_ARTIFACTS", "/workspace/scratch"))


async def sign_in(page, account, destination):
    await page.goto(f"{BASE}/login.html")
    await page.get_by_role("button", name=account, exact=False).click()
    await page.wait_for_url(f"**/{destination}.html")


async def check_layout(page, label, width):
    dimensions = await page.evaluate("({viewport:innerWidth, scroll:document.documentElement.scrollWidth})")
    assert dimensions["scroll"] <= width + 1, (label, dimensions)
    await page.screenshot(path=str(ARTIFACTS / f"{label}-{width}.png"), full_page=True)
    return dimensions


async def crew_checks(browser, width):
    context = await browser.new_context(viewport={"width": width, "height": 900})
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await sign_in(page, "Carlos", "crew")
    assert await page.locator("#jobCustomer").inner_text() == "John Miller"
    assert await page.locator(".crew-layout").evaluate("el=>el.getBoundingClientRect().width") > (1000 if width == 1440 else 350)
    await page.evaluate("""() => {
        const s=GTFWorkflow.load(), source=s.workOrders[0];
        s.workOrders.push({...source,id:'wo-other',number:'WO-9000',customer:'Private Other Crew',crew:'Carlos Junior',assignedCrewUsers:['Carlos Junior']});
        s.workOrders.push({...source,id:'wo-draft',number:'WO-9001',status:'Draft'});
        GTFWorkflow.save(s);
    }""")
    options = await page.locator("#assignmentSelect").inner_text()
    assert "Private Other Crew" not in options and "WO-9001" not in options
    await page.get_by_role("button", name="View Work Order", exact=True).click()
    work_order_text = await page.locator("#woContent").inner_text()
    assert "$" not in work_order_text and "3,084" not in work_order_text
    await page.get_by_role("button", name="Acknowledge Work Order", exact=True).click()
    assert await page.evaluate("!!GTFWorkflow.load().workOrders.find(w=>w.id==='wo-1043').acknowledgedAt")
    await page.get_by_role("button", name="OTW", exact=False).click()
    assert await page.locator("#jobCustomer").inner_text() == "John Miller"
    assert await page.evaluate("GTFWorkflow.load().workOrders.find(w=>w.id==='wo-1043').status") == "OTW"
    await page.reload()
    assert await page.locator("#badge").inner_text() == "OTW"
    await page.get_by_role("button", name="Report Problem", exact=False).click()
    assert await page.locator("#jobCustomer").inner_text() == "John Miller"
    assert await page.evaluate("GTFIntegrations.notifications().some(n=>n.type==='crew-problem'&&n.projectId==='project-1')")
    assert "No message sent" in await page.locator("#toast").inner_text()
    await page.evaluate("window.open=(url)=>{window.__opened=url;return null;}")
    await page.get_by_role("button", name="Open Maps", exact=True).click()
    maps = await page.evaluate("window.__opened")
    assert "2850%20Windward%20Pkwy%2C%20Alpharetta%2C%20GA" in maps
    dimensions = await check_layout(page, "crew", width)
    await page.get_by_role("button", name="Sign out", exact=True).click()
    await page.wait_for_url("**/login.html")
    assert await page.evaluate("GTFAuth.currentUser()") is None
    assert not errors, errors
    await context.close()
    return {"view": "Crew", "width": width, "layout": dimensions, "errors": errors}


async def client_checks(browser, width):
    context = await browser.new_context(viewport={"width": width, "height": 900})
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await sign_in(page, "Emily Carter", "customer")
    await page.evaluate("""() => {
        const s=GTFWorkflow.load(), source=s.estimates.find(e=>e.projectId==='project-2');
        s.estimates.unshift({...source,id:'est-duplicate',number:'EST-9000',projectId:'project-other',address:'Other property'});
        GTFWorkflow.save(s);
        localStorage.setItem('gtfClientAgreementV1',JSON.stringify({signed:true,name:'Old Demo'}));
        localStorage.setItem('gtfClientAgreementV1:project-other',JSON.stringify({signed:true,projectId:'project-other',name:'Other Project'}));
        renderAgreementFlow();
    }""")
    assert "EST-1042" in await page.locator("#customerDocuments").inner_text()
    assert "EST-9000" not in await page.locator("#customerDocuments").inner_text()
    assert await page.locator("#agreementStatus").inner_text() == "Signature required"
    assert not await page.get_by_role("button", name="Contractor-referred homeowner", exact=True).is_visible()
    original_heading = await page.locator("#name").inner_text()
    await page.evaluate("setMode('contractor')")
    assert await page.locator("#name").inner_text() == original_heading
    assert await page.evaluate("portalProjectId") == "project-2"
    assert "Simulated route and ETA" in await page.locator("#tracking").inner_text()
    await page.get_by_role("button", name="Why locked?", exact=True).click()
    assert "Sign the Project Agreement" in await page.locator("#toast").inner_text()
    await page.get_by_role("button", name="Review & Sign", exact=True).click()
    await page.get_by_role("button", name="Sign Agreement", exact=True).click()
    assert await page.evaluate("localStorage.getItem('gtfClientAgreementV1:project-2')") is None
    await page.get_by_role("button", name="Open the Care & Maintenance Guide", exact=False).click()
    assert await page.locator("#careModal").is_visible()
    assert "Temporary preview" in await page.locator("#careModal").inner_text()
    await page.locator("#careModal").get_by_role("button", name="Close", exact=True).click()
    await page.locator("#signatureName").fill("Emily Carter")
    await page.locator("#signatureConsent").check()
    await page.get_by_role("button", name="Sign Agreement", exact=True).click()
    signature = await page.evaluate("agreementData()")
    assert signature["projectId"] == "project-2" and signature["signed"]
    assert await page.locator("#agreementStatus").inner_text() == "Signed — Demo"
    assert await page.locator("#warrantyState .unlocked-card").is_visible()
    await page.get_by_role("button", name="View Warranty", exact=True).click()
    assert "placeholder" in await page.locator("#customerDocContent").inner_text()
    await page.locator("#customerDocModal").get_by_role("button", name="Close", exact=True).click()
    await page.reload()
    assert await page.locator("#agreementStatus").inner_text() == "Signed — Demo"
    await page.get_by_role("button", name="I won't be home", exact=True).click()
    await page.get_by_role("button", name="Save Demo Notice", exact=True).click()
    assert await page.evaluate("GTFIntegrations.notifications().some(n=>n.type==='client-notice'&&n.projectId==='project-2'&&n.status==='demo-local')")
    dimensions = await check_layout(page, "client", width)
    assert "Before Your Job" in await page.locator("body").inner_text()
    await page.get_by_role("button", name="Sign out", exact=True).click()
    await page.wait_for_url("**/login.html")
    assert await page.evaluate("GTFAuth.currentUser()") is None
    assert not errors, errors
    await context.close()
    return {"view": "Client", "width": width, "layout": dimensions, "errors": errors}


async def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        results = []
        for width in [1440, 390]:
            results.append(await crew_checks(browser, width))
            results.append(await client_checks(browser, width))
        await browser.close()
    print(json.dumps({"status": "passed", "results": results}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
