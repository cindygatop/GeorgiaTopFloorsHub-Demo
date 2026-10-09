#!/usr/bin/env python3
"""Check this static demo without third-party Python dependencies.

Uses HTMLParser for basic document structure, references, IDs and scripts, then
Node's syntax checker. This is not a W3C validator or a browser/production audit.
Run from any directory: python3 tests/validate_static.py
"""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
OPTIONAL_END = set("li dt dd p rt rp optgroup option colgroup thead tbody tfoot tr td th".split())
JS_TYPES = {"", "text/javascript", "application/javascript", "module"}
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__"}


class Document(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.errors = []
        self.stack = []
        self.ids = set()
        self.references = []
        self.scripts = []
        self.handlers = []
        self.script = None
        self.doctype = False
        self.starts = Counter()
        self.ends = Counter()
        self.lang = False
        self.charset = False
        self.viewport = False

    def error(self, message):
        self.errors.append(f"{self.path.name}:{self.getpos()[0]}: {message}")

    def handle_decl(self, decl):
        if decl.lower() == "doctype html":
            self.doctype = True

    def handle_starttag(self, tag, attrs):
        self.starts[tag] += 1
        names = [key for key, _ in attrs]
        for key, count in Counter(names).items():
            if count > 1:
                self.error(f"duplicate {key!r} attribute on <{tag}>")
        attrs = dict(attrs)
        element_id = attrs.get("id")
        if element_id:
            if element_id in self.ids:
                self.error(f"duplicate ID {element_id!r}")
            self.ids.add(element_id)
        if tag == "html":
            self.lang = bool(attrs.get("lang"))
        if tag == "meta":
            self.charset |= bool(attrs.get("charset"))
            self.viewport |= attrs.get("name", "").lower() == "viewport"
        for attr in ("src", "href", "action", "poster", "data-href"):
            if attrs.get(attr):
                self.references.append((attrs[attr], self.getpos()[0]))
        for key, value in attrs.items():
            if key.startswith("on") and value:
                self.handlers.append((key, value, self.getpos()[0]))
        if tag == "script" and not attrs.get("src"):
            self.script = {
                "type": attrs.get("type", "").lower(),
                "line": self.getpos()[0],
                "parts": [],
            }
        if tag not in VOID:
            if self.stack and self.stack[-1] == tag and tag in OPTIONAL_END:
                self.stack.pop()
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.script is not None:
            self.script["parts"].append(data)

    def handle_endtag(self, tag):
        self.ends[tag] += 1
        if tag == "script" and self.script is not None:
            script = self.script
            if script["type"] in JS_TYPES:
                self.scripts.append(("".join(script["parts"]), script["line"], script["type"]))
            self.script = None
        if tag in VOID:
            self.error(f"unexpected closing tag </{tag}>")
            return
        if tag not in self.stack:
            self.error(f"unmatched closing tag </{tag}>")
            return
        while self.stack and self.stack[-1] != tag:
            unclosed = self.stack.pop()
            if unclosed not in OPTIONAL_END:
                self.error(f"<{unclosed}> not closed before </{tag}>")
        self.stack.pop()

    def finish(self):
        self.close()
        for tag in self.stack:
            if tag not in OPTIONAL_END:
                self.error(f"unclosed <{tag}>")
        for tag in ("html", "head", "body", "title"):
            if self.starts[tag] != 1 or self.ends[tag] != 1:
                self.error(f"expected one complete <{tag}> element")
        for valid, message in (
            (self.doctype, "missing HTML5 doctype"),
            (self.lang, "missing document language"),
            (self.charset, "missing charset declaration"),
            (self.viewport, "missing mobile viewport declaration"),
        ):
            if not valid:
                self.error(message)


def local_reference(path, raw):
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    decoded = unquote(parsed.path)
    return ROOT / decoded.lstrip("/") if decoded.startswith("/") else path.parent / decoded


def check_js(node, path, label, errors):
    checked = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
    if checked.returncode:
        # Syntax output can contain source text. Keep potential credentials out
        # of the report; the file/line label is sufficient to reproduce it.
        errors.append(f"{label}: JavaScript syntax check failed")


def main():
    errors = []
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and not SKIP_DIRS.intersection(path.relative_to(ROOT).parts))
    html_files = [path for path in files if path.suffix == ".html"]
    js_files = [path for path in files if path.suffix in (".js", ".mjs")]
    node = shutil.which("node")
    if not node:
        errors.append("Node.js is required for external/inline JavaScript syntax checks")
    references = inline_count = handler_count = 0
    with tempfile.TemporaryDirectory(prefix="gtf-static-validation-") as temporary:
        temporary = Path(temporary)
        for path in html_files:
            document = Document(path)
            document.feed(path.read_text(encoding="utf-8"))
            document.finish()
            errors.extend(document.errors)
            for raw, line in document.references:
                target = local_reference(path, raw)
                if target is not None:
                    references += 1
                    if not target.is_file():
                        errors.append(f"{path.name}:{line}: missing local reference {raw!r}")
            for content, line, script_type in document.scripts:
                if not content.strip():
                    continue
                inline_count += 1
                snippet = temporary / f"inline-{inline_count}.{ 'mjs' if script_type == 'module' else 'js'}"
                snippet.write_text(content, encoding="utf-8")
                if node:
                    check_js(node, snippet, f"{path.name}:{line} inline script", errors)
            for event, content, line in document.handlers:
                handler_count += 1
                snippet = temporary / f"handler-{handler_count}.js"
                snippet.write_text(f"function handler(event) {{\n{content}\n}}", encoding="utf-8")
                if node:
                    check_js(node, snippet, f"{path.name}:{line} {event}", errors)
        if node:
            for path in js_files:
                check_js(node, path, str(path.relative_to(ROOT)), errors)

    # Include literal navigation destinations in handlers/scripts and demo role
    # homes. Computed destinations still require browser flow testing.
    navigation = re.compile(
        r"(?:\blocation(?:\.href)?\s*=\s*|\blocation\.(?:assign|replace)\(\s*|\bwindow\.open\(\s*|\bhome\s*:\s*)(['\"])([^'\"]+)\1"
    )
    for path in html_files + js_files:
        for match in navigation.finditer(path.read_text(encoding="utf-8")):
            target = local_reference(path, match.group(2))
            if target is not None:
                references += 1
                if not target.is_file():
                    errors.append(f"{path.name}: missing local navigation destination")

    # Check relative URL resources in CSS, excluding data/remote resources.
    for path in files:
        if path.suffix != ".css":
            continue
        content = path.read_text(encoding="utf-8")
        for match in re.finditer(r"url\(\s*['\"]?([^\s)'\"]+)", content):
            target = local_reference(path, match.group(1))
            if target is not None:
                references += 1
                if not target.is_file():
                    errors.append(f"{path.name}: missing local CSS resource")

    # Narrow recognizers catch accidentally committed real provider keys. This
    # cannot prove absence of all secrets; demo password gtf2026 is intentional.
    secret_patterns = (
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
        r"\bgh[pousr]_[A-Za-z0-9]{36,}\b",
        r"\bgithub_pat_[A-Za-z0-9_]{60,}\b",
        r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b",
        r"\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b",
        r"\bAIza[A-Za-z0-9_-]{35}\b",
        r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b",
    )
    secret_re = re.compile("|".join(secret_patterns))
    scanned = 0
    for path in files:
        relative = path.relative_to(ROOT)
        if path.name == ".env" or path.name.startswith(".env.") and path.suffix not in (".example", ".sample"):
            errors.append(f"{relative}: environment file present; review before publication")
        if path.suffix.lower() not in {".html", ".js", ".mjs", ".css", ".sql", ".md", ".txt", ".json", ".yml", ".yaml", ".py"}:
            continue
        scanned += 1
        if secret_re.search(path.read_text(encoding="utf-8")):
            errors.append(f"{relative}: potential provider secret detected (value redacted)")

    print(f"Checked {len(html_files)} HTML documents, {len(js_files)} external JS/MJS, {inline_count} inline scripts, {handler_count} event handlers, {references} local resource references and {scanned} text files for recognizable secrets.")
    print("HTML checks: basic parser/structure, unique IDs/attributes, document metadata. Not W3C validation. Secret scan is pattern-based; SQL, browser behavior and integrations are not executed.")
    if errors:
        print("FAIL:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
