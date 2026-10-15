"""Emet browser QA: static fallback and explicitly mocked account API contracts.

Run against a local static server with GTF_TEST_URL (default port 8011).
API mocks verify browser behavior only; they do not provision accounts, send mail,
or prove that Supabase/Resend/invitations are connected in a deployed environment.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

import fitz
from playwright.sync_api import sync_playwright


BASE = os.environ.get("GTF_TEST_URL", "http://127.0.0.1:8011").rstrip("/")
ARTIFACTS = Path(os.environ.get("GTF_QA_ARTIFACTS", "/workspace/scratch/emet-qa"))
CARE_URL = "https://georgiatopfloors.com/care-maintenance/"
INSTAGRAM_URL = "https://www.instagram.com/georgiatopfloors/"
QA_PASSWORD = "QA-only-password-2026!"
QA_TOKEN = "qa_verification_hash_for_browser_testing_only_123456789"
QA_CODE = "emt_qa_invitation_for_browser_testing_only"
ORG = "10000000-0000-4000-8000-000000000001"
USER = "20000000-0000-4000-8000-000000000002"
REQUEST = "30000000-0000-4000-8000-000000000003"
RESULTS = []


def storage(page):
    return page.evaluate("({local:{...localStorage},session:{...sessionStorage}})")


def no_sensitive_storage(page):
    saved = json.dumps(storage(page))
    assert QA_PASSWORD not in saved and QA_TOKEN not in saved and QA_CODE not in saved, saved


def layout(page, name, width):
    size = page.evaluate("({viewport:innerWidth,scroll:document.documentElement.scrollWidth})")
    page.screenshot(path=str(ARTIFACTS / f"{name}-{width}.png"), full_page=True)
    assert size["viewport"] == width and size["scroll"] <= width + 1, (name, size)
    return size


class AccountAPI:
    """An isolated fixture; no request is forwarded to an account/mail provider."""

    def __init__(self, mode="ready", authenticated=False):
        self.mode = mode
        self.authenticated = authenticated
        self.calls = []
        self.external = []
        self.pending = True
        self.errors = []
        self.status_responses = []

    def account(self):
        return {"status": "authenticated", "csrfToken": "qa-csrf-fixture",
                "user": {"id": USER, "email": "manager@example.test", "displayName": "QA Manager"},
                "memberships": [{"organizationId": ORG, "organizationName": "QA Flooring", "role": "manager", "status": "active"}]}

    def install(self, context):
        context.route("**/*", self.route)

    def route(self, route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE).netloc:
            self.external.append(request.url)
            route.abort()
            return
        prefix = urlparse(BASE).path.rstrip("/") + "/api/emet/"
        if not parsed.path.startswith(prefix):
            route.continue_()
            return
        path = parsed.path[len(prefix):]
        body = request.post_data_json if request.method == "POST" else None
        self.calls.append({"path": path, "method": request.method, "body": body,
                           "csrf": request.headers.get("x-emet-csrf")})
        if self.mode == "static":
            route.continue_()
            return
        if self.mode == "unavailable":
            route.fulfill(status=503, json={"status": "provisioning_required", "capabilities": {"authentication": False}})
            return
        status, response = 200, {}
        if path == "status":
            response = {"status": "ready", "csrfToken": "qa-csrf-fixture",
                        "capabilities": {"authentication": True, "invitations": True, "profile": True, "businessData": False}}
        elif path == "session" and request.method == "GET":
            status, response = (200, self.account()) if self.authenticated else (401, {"error": "authentication_required"})
        elif path == "session" and body.get("action") == "login":
            if body.get("email") == "manager@example.test" and body.get("password") == QA_PASSWORD:
                self.authenticated = True
                response = self.account()
            else:
                status, response = 401, {"error": "invalid_credentials"}
        elif path == "session" and body.get("action") == "logout":
            self.authenticated = False
            response = {"status": "signed_out"}
        elif path == "invitations":
            if body.get("code") == QA_CODE and body.get("email") == "invitee@example.test":
                response = {"status": "invitation_available", "invitation": {"organizationId": ORG, "organizationName": "QA Flooring", "role": "crew"}}
            else:
                status, response = 422, {"error": "invalid_invitation"}
        elif path == "register":
            assert body.get("code") == QA_CODE and body.get("email") == "invitee@example.test"
            assert body.get("password") == QA_PASSWORD and body.get("displayName") == "QA Invitee"
            status, response = 202, {"status": "pending_verification_and_approval", "message": "QA mock: email verification and manager approval remain pending."}
        elif path in ["recovery", "client-access"]:
            status, response = 202, {"status": "pending", "message": "QA mock: verification request received; no real email was sent."}
        elif path == "verify":
            assert body.get("tokenHash") == QA_TOKEN
            self.authenticated = True
            response = {"status": "email_verified", "csrfToken": "qa-csrf-fixture", "message": "QA mock: email verification completed."}
        elif path == "approvals" and request.method == "GET":
            assert parse_qs(parsed.query).get("organizationId") == [ORG]
            response = {"requests": [{"requestId": REQUEST, "userId": USER, "displayName": "QA Invitee", "email": "invitee@example.test", "role": "crew"}] if self.pending else []}
        elif path == "approvals" and request.method == "POST":
            assert body == {"organizationId": ORG, "userId": USER, "requestId": REQUEST, "decision": "approve"}, body
            self.pending = False
            response = {"status": "approved"}
        else:
            raise AssertionError((path, body))
        if request.method == "POST":
            assert request.headers.get("x-emet-csrf") == "qa-csrf-fixture", self.calls[-1]
        route.fulfill(status=status, json=response)


def new_page(browser, api, width=1440):
    context = browser.new_context(viewport={"width": width, "height": 1000 if width == 1440 else 844})
    api.install(context)
    page = context.new_page()
    page.on("pageerror", lambda error: api.errors.append(str(error)))
    page.on("response", lambda response: api.status_responses.append(response.status)
            if urlparse(response.url).path.endswith("/api/emet/status") else None)
    return context, page


def unavailable_checks(browser, width, mode):
    api = AccountAPI(mode)
    context, page = new_page(browser, api, width)
    page.goto(BASE + "/emet.html")
    page.wait_for_function("document.querySelector('#serviceNotice').textContent.includes('disabled')")
    assert page.locator("[data-secure]:not(:disabled)").count() == 0
    assert page.get_by_role("link", name="Explore Georgia Top Floors demo").get_attribute("href") == "login.html"
    for name in ["login", "join", "client"]:
        page.locator(f'[data-view="{name}"]').click()
        assert page.locator(f'[data-panel="{name}"]').is_visible()
        layout(page, f"emet-{mode}-{name}", width)
    page.locator('[data-view="join"]').click()
    page.locator('#invitationForm [name="code"]').fill("fake-code-with-admin-role")
    page.locator('#invitationForm [name="email"]').fill("invitee@example.test")
    page.locator("#invitationForm").evaluate("form=>form.requestSubmit()")
    page.wait_for_function("!document.querySelector('#formMessage').hidden")
    assert "configuration" in page.locator("#formMessage").inner_text()
    assert page.locator("#registerForm").is_hidden()
    assert not any(call["method"] == "POST" for call in api.calls), api.calls
    page.goto("about:blank")
    page.goto(BASE + "/emet.html#token_hash=" + QA_TOKEN + "&type=recovery")
    page.wait_for_function("document.querySelector('#serviceNotice').textContent.includes('disabled')")
    assert "token_hash" not in page.url and QA_TOKEN not in page.url
    assert page.locator('#resetForm [name="password"]').is_disabled()
    assert storage(page) == {"local": {}, "session": {}}
    expected_status = 404 if mode == "static" else 503
    assert api.status_responses and all(code == expected_status for code in api.status_responses), api.status_responses
    assert not api.external and not api.errors, (api.external, api.errors)
    RESULTS.append({"check": "static/no-backend" if mode == "static" else "mock HTTP503", "width": width,
                    "status": "passed", "statusHTTP": api.status_responses, "postRequests": 0, "pageErrors": api.errors})
    context.close()


def ready_contract_checks(browser, width):
    api = AccountAPI()
    context, page = new_page(browser, api, width)
    page.goto(BASE + "/emet.html?view=join")
    page.wait_for_function("document.querySelector('#serviceNotice').classList.contains('ready')")
    page.locator('#invitationForm [name="code"]').fill("untrusted-made-up-invitation")
    page.locator('#invitationForm [name="email"]').fill("invitee@example.test")
    page.get_by_role("button", name="Check my invitation", exact=True).click()
    page.wait_for_function("document.querySelector('#formMessage').classList.contains('error')")
    assert page.locator("#registerForm").is_hidden()
    assert not any(c["path"] == "register" for c in api.calls)
    page.locator('#invitationForm [name="code"]').fill(QA_CODE)
    page.get_by_role("button", name="Check my invitation", exact=True).click()
    page.locator("#registerForm").wait_for(state="visible")
    assert "QA Flooring" in page.locator("#invitationSummary").inner_text()
    assert "crew" in page.locator("#invitationSummary").inner_text()
    page.locator('#registerForm [name="displayName"]').fill("QA Invitee")
    page.locator('#registerForm [name="password"]').fill(QA_PASSWORD)
    page.locator('#registerForm [name="passwordConfirm"]').fill("QA-mismatching-password")
    page.get_by_role("button", name="Create account & request approval", exact=False).click()
    assert "do not match" in page.locator("#formMessage").inner_text()
    assert not any(c["path"] == "register" for c in api.calls)
    page.locator('#registerForm [name="passwordConfirm"]').fill(QA_PASSWORD)
    page.get_by_role("button", name="Create account & request approval", exact=False).click()
    page.wait_for_function("document.querySelector('#registerForm').hidden")
    assert "remain pending" in page.locator("#formMessage").inner_text()
    assert page.locator('[data-panel="workspace"]').is_hidden()
    no_sensitive_storage(page)
    layout(page, "emet-mock-registration-pending", width)
    page.locator('[data-view="client"]').click()
    page.locator('#clientForm [name="code"]').fill(QA_CODE)
    page.locator('#clientForm [name="email"]').fill("invitee@example.test")
    page.get_by_role("button", name="Request verified project access", exact=False).click()
    page.wait_for_function("document.querySelector('#formMessage').textContent.includes('no real email')")
    page.locator('[data-view="login"]').click()
    page.locator('#loginForm [name="email"]').fill("manager@example.test")
    page.locator('#loginForm [name="password"]').fill("incorrect-password")
    page.get_by_role("button", name="Sign in to Emet", exact=False).click()
    page.wait_for_function("document.querySelector('#formMessage').textContent.includes('not recognized')")
    assert page.locator('[data-panel="workspace"]').is_hidden()
    page.locator('#loginForm [name="password"]').fill(QA_PASSWORD)
    page.get_by_role("button", name="Sign in to Emet", exact=False).click()
    page.locator('[data-panel="workspace"]').wait_for(state="visible")
    assert page.locator("#accountName").inner_text() == "QA Manager"
    assert "shared business workspace still needs" in page.locator("#memberships").inner_text()
    assert page.locator('#loginForm [name="password"]').input_value() == ""
    assert page.get_by_role("link", name="Account settings", exact=True).get_attribute("href") == "settings.html?mode=account&tab=profile"
    no_sensitive_storage(page)
    layout(page, "emet-mock-workspace", width)
    page.locator("#secureLogout").click()
    page.locator('[data-panel="login"]').wait_for(state="visible")
    page.goto("about:blank")
    page.goto(BASE + "/emet.html#token_hash=" + QA_TOKEN + "&type=magiclink")
    page.wait_for_function("document.querySelector('#formMessage').textContent.includes('QA mock: email verification')")
    assert QA_TOKEN not in page.url and "token_hash" not in page.url
    no_sensitive_storage(page)
    page.goto(BASE + f"/emet.html?view=approval&organizationId={ORG}&requestId={REQUEST}")
    page.get_by_role("button", name="Approve access", exact=True).wait_for(state="visible")
    assert not any(c["path"] == "approvals" and c["method"] == "POST" for c in api.calls)
    page.get_by_role("button", name="Approve access", exact=True).click()
    page.wait_for_function("document.querySelector('#approvalList').textContent.includes('No pending')")
    assert len([c for c in api.calls if c["path"] == "approvals" and c["method"] == "POST"]) == 1
    assert not api.errors and not api.external, (api.errors, api.external)
    no_sensitive_storage(page)
    RESULTS.append({"check": "mock API contracts only (not real accounts/email)", "width": width,
                    "status": "passed", "routes": sorted(set(c["path"] for c in api.calls)), "pageErrors": api.errors})
    context.close()


def demo_and_documents(browser, width):
    api = AccountAPI("static")
    context, page = new_page(browser, api, width)
    page.goto(BASE + "/emet.html")
    page.locator(".demo-company").click()
    page.wait_for_url("**/login.html")
    page.locator("button.demo-account").filter(has_text="Cindy").click()
    page.wait_for_url("**/index.html")
    page.get_by_role("link", name="Your profile and settings", exact=True).click()
    page.wait_for_url("**/settings.html?tab=profile")
    assert page.locator("#displayName").input_value() == "Cindy"
    assert page.locator("#workspaceMode").inner_text() == "Local demo"
    assert page.locator("#accountEmail").get_attribute("readonly") is not None
    layout(page, "office-avatar-settings", width)
    page.locator("#signOut").click()
    page.wait_for_url("**/login.html")
    page.locator("button.demo-account").filter(has_text="Emily Carter").click()
    page.wait_for_url("**/customer.html")
    page.get_by_role("button", name="Floor Care & Maintenance", exact=False).click()
    guide = page.locator("#careModal")
    assert guide.is_visible()
    assert guide.get_by_role("link", name="Open the official Care & Maintenance Guide", exact=False).get_attribute("href") == CARE_URL
    assert guide.get_by_role("link", name="Georgia Top Floors on Instagram", exact=False).get_attribute("href") == INSTAGRAM_URL
    assert "Temporary preview" not in guide.inner_text()
    page.locator("#careModal").get_by_role("button", name="Close", exact=True).click()
    certificate = page.get_by_role("link", name="Certificate of Acceptance", exact=False)
    assert certificate.get_attribute("href") == "assets/documents/acceptance-clickable.pdf"
    assert "after the work is completed" in certificate.locator("..").inner_text()
    # urllib honors the executor's HTTP(S)_PROXY and CA configuration; the
    # Playwright API request client does not inherit those environment proxies.
    with urlopen(Request(BASE + "/assets/documents/acceptance-clickable.pdf", headers={"User-Agent": "Emet-browser-QA"}), timeout=20) as pdf:
        pdf_status, pdf_body = pdf.status, pdf.read()
    assert pdf_status == 200 and pdf_body.startswith(b"%PDF-")
    document = fitz.open(stream=pdf_body, filetype="pdf")
    links = [item["uri"] for sheet in document for item in sheet.get_links() if "uri" in item]
    assert sorted(links) == sorted([CARE_URL, INSTAGRAM_URL]), links
    text = " ".join(" ".join(sheet.get_text() for sheet in document).split())
    for clause in ["CERTIFICATE OF ACCEPTANCE & SERVICE AGREEMENT", "No items or services remain incomplete or outstanding", "RELEASE & WAIVER OF LIABILITY", "Client’s Signature", "Representative’s Signature"]:
        assert clause in text, clause
    assert not api.external and not api.errors, (api.external, api.errors)
    layout(page, "client-official-documents", width)
    page.evaluate("GTFAuth.updateDemoProfile({name:'QA Long Profile Name With Several Words For Responsive Header Validation'})")
    assert "Emily" in page.locator("#name").inner_text()
    layout(page, "client-long-profile-name", width)
    page.locator("#gtfUserChip button").click()
    page.wait_for_url("**/login.html")
    page.locator("button.demo-account").filter(has_text="Carlos").click()
    page.wait_for_url("**/crew.html")
    page.evaluate("GTFAuth.updateDemoProfile({name:'QA Long Profile Name With Several Words For Responsive Header Validation'})")
    assert page.locator("#jobCustomer").inner_text() == "John Miller"
    layout(page, "crew-long-profile-name", width)
    assert not api.external and not api.errors, (api.external, api.errors)
    RESULTS.append({"check": "preserved demo, Office avatar→Settings, official Client URLs and local PDF", "width": width,
                    "status": "passed", "pdfHTTP": pdf_status, "pdfLinks": links,
                    "longProfileNames": "Client and Crew layout and project/assignment retained", "pageErrors": api.errors})
    context.close()


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        for width in [1440, 390]:
            unavailable_checks(browser, width, "static")
            unavailable_checks(browser, width, "unavailable")
            ready_contract_checks(browser, width)
            demo_and_documents(browser, width)
        browser.close()
    report = {"status": "passed", "baseURL": BASE, "results": RESULTS,
              "limits": "Local static site and explicitly mocked account responses only. No real accounts, mail, business-data migration, Supabase or Resend integration was activated or validated. Chromium only; no physical device, Safari or Firefox QA."}
    (ARTIFACTS / "emet-entry-results.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
