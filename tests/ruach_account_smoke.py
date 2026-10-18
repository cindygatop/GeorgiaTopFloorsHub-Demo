"""Authenticated Ruach browser contracts; AI/account providers are mocked.

These checks prove UI behavior only, not a deployed model, billing, Supabase or
business-data writes. Run with a local static server and GTF_TEST_URL if needed.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


BASE = os.environ.get("GTF_TEST_URL", "http://127.0.0.1:8011").rstrip("/")
ARTIFACTS = Path(os.environ.get("GTF_QA_ARTIFACTS", "/workspace/scratch/ruach-account-qa"))
ORG = "10000000-0000-4000-8000-000000000001"
OTHER = "10000000-0000-4000-8000-000000000002"
USER = "20000000-0000-4000-8000-000000000001"
RESULTS = []


class API:
    def __init__(self, role="office", member_status="active", verified=True,
                 authenticated=True, configured=True, static=False, multi=False):
        self.role = role
        self.member_status = member_status
        self.verified = verified
        self.authenticated = authenticated
        self.configured = configured
        self.static = static
        self.multi = multi
        self.calls, self.external, self.errors, self.pending = [], [], [], []
        self.hold = False
        self.failure = None
        self.response_override = None

    def session(self):
        memberships = [{"organizationId": ORG, "organizationName": "QA Flooring",
                        "role": self.role, "status": self.member_status}]
        if self.multi:
            memberships.append({"organizationId": OTHER, "organizationName": "QA Other Company",
                                "role": "admin", "status": "active"})
        return {"status": "authenticated", "csrfToken": "qa-csrf-fixture",
                "user": {"id": USER, "email": "qa@example.test", "displayName": "QA Manager",
                         "emailVerified": self.verified}, "memberships": memberships}

    def install(self, context):
        context.route("**/*", self.route)

    def route(self, route):
        req = route.request
        parsed = urlparse(req.url)
        if parsed.netloc != urlparse(BASE).netloc:
            self.external.append(req.url)
            route.abort()
            return
        prefix = urlparse(BASE).path.rstrip("/") + "/api/emet/"
        if not parsed.path.startswith(prefix):
            route.continue_()
            return
        path = parsed.path[len(prefix):]
        body = req.post_data_json if req.method == "POST" else None
        self.calls.append({"path": path, "method": req.method, "body": body})
        if self.static:
            route.continue_()
            return
        status, data = 200, {}
        if path == "status":
            data = {"status": "ready", "csrfToken": "qa-csrf-fixture",
                    "capabilities": {"authentication": True, "businessData": False}}
        elif path == "session" and req.method == "GET":
            status, data = (200, self.session()) if self.authenticated else (401, {"error": "authentication_required"})
        elif path == "session" and body == {"action": "logout"}:
            self.authenticated = False
            data = {"status": "signed_out"}
        elif path == "ruach" and req.method == "GET":
            assert parse_qs(parsed.query)["organizationId"][0] in [ORG, OTHER]
            status, data = (200, {"status": "ready", "csrfToken": "qa-csrf-fixture",
                                 "providerVerified": False, "model": "qa-model",
                                 "capabilities": {"conversation": True, "actionProposals": True,
                                                  "execution": False, "businessData": False}}) if self.configured else (
                503, {"status": "setup_required", "error": "ruach_setup_required"})
        elif path == "ruach" and req.method == "POST":
            assert req.headers.get("x-emet-csrf") == "qa-csrf-fixture"
            assert body["consent"] is True and body["context"]["mode"] == "account"
            assert body["context"]["organizationId"] in [ORG, OTHER]
            assert set(body) == {"message", "history", "context", "consent"}, body
            assert len(body["message"]) <= 4096 and len(body["history"]) <= 6
            assert all(set(h) == {"role", "content"} and h["role"] in ["user", "assistant"]
                       and len(h["content"]) <= 512 for h in body["history"])
            assert sum(len(h["content"]) for h in body["history"]) + len(body["message"]) <= 6000
            assert len(req.post_data_buffer) <= 8000
            assert "Private Demo Client" not in req.post_data
            if self.hold:
                self.pending.append(route)
                return
            if self.failure:
                status, data = self.failure
            else:
                data = self.response_override or {"status": "responded", "providerVerified": True,
                    "reply": "Claro, uai! Posso ajudar com essa proposta. <img src=x onerror=window.qaXss=1>",
                    "model": "qa-model", "requiresConfirmation": True,
                    "proposal": {"intent": "create_invoice_draft", "customerHint": "Client mentioned by you",
                                 "fields": {"description": "Floor repair", "quantity": 2, "unitPrice": 100}},
                    "execution": {"status": "not_executed", "businessData": False}}
        else:
            raise AssertionError((path, body))
        route.fulfill(status=status, json=data)

    def posts(self):
        return [c for c in self.calls if c["path"] == "ruach" and c["method"] == "POST"]

    def close(self, context):
        # Resolve intentionally held fixtures before Playwright tears down routes.
        for route in self.pending:
            route.abort()
        self.pending.clear()
        context.unroute_all(behavior="wait")
        context.close()


def open_page(browser, api, width):
    context = browser.new_context(viewport={"width": width, "height": 1000 if width == 1440 else 844})
    context.add_init_script("localStorage.setItem('demoPrivateFixture', JSON.stringify({client:'Private Demo Client'}))")
    api.install(context)
    page = context.new_page()
    page.on("pageerror", lambda error: api.errors.append(str(error)))
    page.goto(BASE + "/emet.html")
    page.wait_for_function("!document.querySelector('#serviceNotice').textContent.includes('Checking')")
    return context, page


def layout(page, name, width):
    size = page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
    assert size["width"] == width and size["scroll"] <= width + 1, size
    page.screenshot(path=str(ARTIFACTS / f"{name}-{width}.png"), full_page=True)


def send(page, text):
    page.locator("#ruachInput").fill(text)
    page.locator("#ruachSend").click()


def inaccessible_checks(browser, width):
    for options in [{"static": True}, {"authenticated": False}, {"role": "crew"},
                    {"role": "client"}, {"member_status": "pending_approval"}, {"verified": False}]:
        api = API(**options)
        context, page = open_page(browser, api, width)
        if not options.get("static") and options.get("authenticated", True):
            page.locator('[data-panel="workspace"]').wait_for(state="visible")
        assert page.locator("#ruachAccount").is_hidden(), options
        assert not [c for c in api.calls if c["path"] == "ruach"], api.calls
        assert not api.external and not api.errors, (api.external, api.errors)
        api.close(context)
    api = API(configured=False)
    context, page = open_page(browser, api, width)
    page.wait_for_function("document.querySelector('#ruachStatus').textContent.includes('server-side AI configuration')")
    assert page.locator("#ruachAccount").is_visible()
    assert page.locator("#ruachConsent").is_disabled() and page.locator("#ruachInput").is_disabled()
    assert not api.posts() and not api.external and not api.errors
    layout(page, "setup-required", width)
    api.close(context)
    RESULTS.append({"check": "static, anonymous, role, verification and setup gates", "width": width, "status": "passed"})


def conversation_checks(browser, width):
    api = API(role="admin", multi=True)
    context, page = open_page(browser, api, width)
    page.wait_for_function("document.querySelector('#ruachStatus').textContent.includes('Server configuration')")
    assert "connected" not in page.locator("#ruachStatus").inner_text().lower()
    assert page.locator("#ruachInput").is_disabled() and not api.posts()
    page.locator("#ruachConsent").check()
    assert page.locator("#ruachInput").is_enabled()
    send(page, "Uai, faz uma incoice de reparo pra mim?")
    page.wait_for_function("document.querySelector('#ruachProvider').textContent.includes('AI response received')")
    assert len(api.posts()) == 1 and api.posts()[0]["body"]["history"] == []
    assert "not executed" in page.locator(".ruach-proposal").inner_text()
    assert "shared business database is not connected" in page.locator(".ruach-proposal").inner_text()
    assert "No invoice" in page.locator(".ruach-no-write").inner_text()
    assert page.locator("#ruachConversation img").count() == 0 and page.evaluate("window.qaXss") is None
    assert "<img src=x" in page.locator("#ruachConversation").inner_text()
    for index in range(5):
        send(page, f"E muda a descrição, por favor {index}.")
        page.wait_for_function(f"document.querySelectorAll('.from-ruach').length === {index + 2}")
    assert len(api.posts()[-1]["body"]["history"]) == 6
    layout(page, "conversation-proposal", width)
    saved = page.evaluate("({local:{...localStorage},session:{...sessionStorage}})")
    assert "incoice" not in json.dumps(saved) and saved["session"] == {}, saved
    page.locator("#ruachCompany").select_option(OTHER)
    page.wait_for_function("document.querySelector('#ruachStatus').textContent.includes('Server configuration')")
    assert page.locator("#ruachConsent").is_checked() is False
    assert page.locator(".ruach-message").count() == 0 and page.locator("#ruachInput").is_disabled()
    page.locator("#ruachConsent").check()
    send(page, "Olá de outra empresa.")
    page.wait_for_function("document.querySelectorAll('.from-ruach').length === 1")
    assert api.posts()[-1]["body"]["context"]["organizationId"] == OTHER
    assert api.posts()[-1]["body"]["history"] == []
    page.locator("#ruachConsent").uncheck()
    assert page.locator(".ruach-message").count() == 0 and page.locator("#ruachInput").is_disabled()
    assert not api.external and not api.errors
    api.close(context)
    RESULTS.append({"check": "consent, natural-language proposal, safe DOM, bounded history, tenant isolation", "width": width, "status": "passed"})


def failure_and_cancellation_checks(browser, width):
    api = API()
    context, page = open_page(browser, api, width)
    page.wait_for_function("document.querySelector('#ruachStatus').textContent.includes('Server configuration')")
    page.locator("#ruachConsent").check()
    api.failure = (429, {"error": "rate_limited"})
    send(page, "Me ajuda com a invoice?")
    page.wait_for_function("document.querySelector('#ruachStatus').textContent.includes('request limit')")
    assert page.locator(".from-ruach").count() == 0 and "AI response received" not in page.locator("#ruachProvider").inner_text()
    assert page.locator("#ruachInput").input_value() == "Me ajuda com a invoice?"
    api.failure = None
    api.response_override = {"status": "responded", "providerVerified": False, "reply": "Success without provider proof"}
    send(page, "Não confirme sem resposta real.")
    page.wait_for_function("document.querySelector('#ruachStatus').textContent.includes('could not confirm')")
    assert page.locator(".from-ruach").count() == 0
    api.response_override = None
    api.hold = True
    send(page, "Aguarda esta resposta.")
    page.locator("#ruachStop").wait_for(state="visible")
    assert page.locator("#ruachSend").is_disabled() and page.locator("#ruachInput").is_disabled()
    page.locator("#ruachStop").click()
    assert "provider may already" in page.locator("#ruachStatus").inner_text()
    assert page.locator("#ruachInput").is_enabled()
    page.locator("#ruachClear").click()
    assert page.locator(".ruach-message").count() == 0
    send(page, "Conversa particular antes de sair.")
    page.locator("#ruachStop").wait_for(state="visible")
    page.locator("#secureLogout").click()
    page.locator('[data-panel="login"]').wait_for(state="visible")
    assert page.locator("#ruachAccount").is_hidden()
    assert page.locator(".ruach-message").count() == 0 and not page.locator("#ruachConsent").is_checked()
    assert page.locator("#ruachInput").input_value() == ""
    assert not api.external and not api.errors
    api.close(context)
    RESULTS.append({"check": "provider failure, unconfirmed response, cancellation and logout clearing", "width": width, "status": "passed"})


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        for width in [1440, 390]:
            inaccessible_checks(browser, width)
            conversation_checks(browser, width)
            failure_and_cancellation_checks(browser, width)
        browser.close()
    (ARTIFACTS / "results.json").write_text(json.dumps(RESULTS, indent=2), encoding="utf-8")
    print(json.dumps({"status": "passed", "checks": RESULTS, "note": "Explicit API fixtures; no real model/account provider was invoked."}, indent=2))


if __name__ == "__main__":
    main()
