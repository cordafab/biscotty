#!/usr/bin/env python3
"""Dependency-free disposable-profile Firefox test runner (Marionette TCP)."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import sys
import argparse
import platform
import zipfile
import hashlib
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]

class SiteFixture(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', '/page')
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        port = self.server.server_port
        body = '<!doctype html><title>Observation fixture</title>'
        if self.path == '/page':
            body += '<iframe src="http://127.0.0.1:%d/frame"></iframe>' % port
        elif self.path == '/restore-page':
            body += '<img src="http://127.0.0.1:%d/restore-resource">' % port
        elif self.path == '/frame':
            body += '<iframe src="/nested"></iframe>'
        self.wfile.write(body.encode())
    def log_message(self, *_args):
        pass

class Marionette:
    def __init__(self, port):
        self.connection = socket.create_connection(('127.0.0.1', port), timeout=60)
        self.connection.settimeout(60)
        self.index = 0
        self.receive()
    def receive(self):
        prefix = b''
        while not prefix.endswith(b':'):
            chunk = self.connection.recv(1)
            if not chunk:
                raise RuntimeError('Firefox disconnected')
            prefix += chunk
        remaining = int(prefix[:-1])
        data = b''
        while remaining:
            chunk = self.connection.recv(remaining)
            if not chunk:
                raise RuntimeError('Firefox disconnected')
            data += chunk
            remaining -= len(chunk)
        return json.loads(data)
    def command(self, name, args=None):
        self.index += 1
        data = json.dumps([0, self.index, name, args or {}]).encode()
        self.connection.sendall(str(len(data)).encode() + b':' + data)
        result = self.receive()
        if result[2]:
            raise RuntimeError(json.dumps(result[2]))
        return result[3]


def package_smoke(client, uuid):
    """Exercise the unmodified archive through its real Settings document."""
    def execute(script):
        result = client.command('WebDriver:ExecuteScript', {'script': script, 'args': [], 'newSandbox': True, 'sandbox': 'default'})
        return result.get('value', result) if isinstance(result, dict) else result

    def wait(script):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if execute(script):
                return
            time.sleep(.1)
        raise RuntimeError('Package UI did not reach the expected state: ' + script)

    results = []
    wait('return document.getElementById("status-indicator")?.textContent === "Status · Ready";')
    results.append({'name': 'Unmodified archive installs and initializes the production Settings page', 'ok': True})
    execute('document.getElementById("tab-transfer").click();')
    wait('return document.getElementById("export").getAttribute("aria-describedby") === "export-privacy" && document.getElementById("export-privacy").getBoundingClientRect().height > 0;')
    results.append({'name': 'Export privacy disclosure is visible and associated with Export', 'ok': True})
    execute('document.getElementById("tab-rules").click(); document.getElementById("add-rule").click(); document.getElementById("rule-domain").value = "package-smoke.example.com"; document.querySelector("#rule-form button[type=submit]").click();')
    wait('return !document.getElementById("save").disabled;')
    execute('document.getElementById("save").click();')
    wait('return document.getElementById("save").disabled && document.getElementById("rules-list").textContent.includes("package-smoke.example.com");')
    results.append({'name': 'Production UI saves a synthetic protection rule through the real gateway', 'ok': True})
    client.command('WebDriver:Refresh')
    wait('return document.getElementById("status-indicator")?.textContent === "Status · Ready" && document.getElementById("rules-list").textContent.includes("package-smoke.example.com");')
    results.append({'name': 'Saved protection survives a Settings page reload', 'ok': True})
    # A new extension page has a different sender document and reconnects to the backend.
    client.command('WebDriver:Navigate', {'url': 'moz-extension://' + uuid + '/src/frontend/popup.html'})
    wait('return document.getElementById("burner")?.textContent.includes("Preview burn");')
    results.append({'name': 'Production popup reconnects and renders the manual burner', 'ok': True})
    client.command('WebDriver:Navigate', {'url': 'moz-extension://' + uuid + '/src/frontend/options.html'})
    wait('return document.getElementById("status-indicator")?.textContent === "Status · Ready";')
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--screenshot')
    parser.add_argument('--fpi', action='store_true')
    parser.add_argument('--export-file')
    parser.add_argument('--import-file')
    parser.add_argument('--package', type=Path, help='Test production files from this unsigned ZIP instead of the checkout.')
    parser.add_argument('--smoke', action='store_true', help='Install the unmodified --package and exercise its production UI only.')
    args = parser.parse_args()
    if args.smoke and not args.package:
        parser.error('--smoke requires --package')
    firefox = os.environ.get('FIREFOX_BINARY', shutil.which('firefox') or '')
    if not firefox:
        raise RuntimeError('Set FIREFOX_BINARY to a Firefox desktop executable.')
    with tempfile.TemporaryDirectory(prefix='biscotty-native-') as directory:
        temporary = Path(directory)
        source = temporary / 'extension'
        source.mkdir()
        if args.package:
            with zipfile.ZipFile(args.package) as archive:
                names = archive.namelist()
                if len(names) != len(set(names)) or 'manifest.json' not in names:
                    raise RuntimeError('Invalid extension archive entries.')
                for name in names:
                    parts = Path(name).parts
                    if name.startswith('/') or '\\' in name or '..' in parts or not (name in ('LICENSE', 'manifest.json') or name.startswith(('src/', 'assets/'))):
                        raise RuntimeError('Unexpected extension archive entry: ' + name)
                if archive.testzip() is not None:
                    raise RuntimeError('Extension archive failed its CRC check.')
                archive.extractall(source)
        for path in (['tests'] if args.package else ['src', 'assets', 'manifest.json', 'tests']):
            original = ROOT / path
            target = source / path
            if original.is_dir():
                shutil.copytree(original, target)
            else:
                shutil.copy2(original, target)
        imported = Path(args.import_file).read_text() if args.import_file else None
        site_server = ThreadingHTTPServer(('127.0.0.1', 0), SiteFixture)
        threading.Thread(target=site_server.serve_forever, daemon=True).start()
        (source / 'tests/native/input.js').write_text('export const importedText = ' + json.dumps(imported) + ';\nexport const fixturePort = ' + str(site_server.server_port) + ';\n')
        # This script is inserted only into the disposable test copy.
        options = source / 'src/frontend/options.html'
        if not args.smoke:
            options.write_text(options.read_text().replace('</body>', '<script type="module" src="../../tests/native/runner.js"></script></body>'))
        profile = temporary / 'profile'
        profile.mkdir()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        prefs = {
            'marionette.port': port,
            'browser.shell.checkDefaultBrowser': False,
            'browser.aboutwelcome.enabled': False,
            'browser.startup.homepage_override.mstone': 'ignore',
            'browser.startup.page': 0,
            'browser.newtabpage.enabled': False,
            'datareporting.policy.dataSubmissionEnabled': False,
            'toolkit.telemetry.enabled': False,
            'privacy.userContext.enabled': True,
            'extensions.autoDisableScopes': 0,
            'extensions.webextensions.host_permissions.default_all_urls_granted': True,
            'remote.active-protocols': 1,
            'privacy.firstparty.isolate': args.fpi,
        }
        (profile / 'user.js').write_text('\n'.join('user_pref(%s, %s);' % (json.dumps(k), json.dumps(v)) for k, v in prefs.items()))
        with (temporary / 'firefox.log').open('w') as log:
            process = subprocess.Popen([firefox, '--headless', '--no-remote', '--marionette', '--remote-allow-system-access', '--profile', str(profile), 'about:blank'], stdout=log, stderr=log)
            client = None
            try:
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    try:
                        client = Marionette(port)
                        break
                    except (OSError, ValueError):
                        if process.poll() is not None:
                            raise RuntimeError('Firefox exit ' + str(process.returncode) + ': ' + (temporary / 'firefox.log').read_text()[-6000:])
                        time.sleep(.2)
                if client is None:
                    raise RuntimeError('Firefox automation did not become available: ' + (temporary / 'firefox.log').read_text()[-6000:])
                capabilities = client.command('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {'acceptInsecureCerts': True}}})
                if args.smoke:
                    client.command('Marionette:SetContext', {'value': 'chrome'})
                    client.command('WebDriver:ExecuteScript', {'script': '''
                        const state = { requests: 0 };
                        state.observer = { observe(subject) {
                            const info = subject.QueryInterface(Ci.nsIHttpChannel).loadInfo;
                            if ([info.loadingPrincipal, info.triggeringPrincipal].some(principal => principal?.addonPolicy?.id === 'biscotty@cordafab.com')) state.requests++;
                        } };
                        Services.appShell.hiddenDOMWindow.biscottyNetworkTest = state;
                        Services.obs.addObserver(state.observer, 'http-on-modify-request');
                    ''', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    client.command('Marionette:SetContext', {'value': 'content'})
                install_path = source
                if args.smoke:
                    install_path = temporary / 'candidate.xpi'
                    shutil.copy2(args.package, install_path)
                client.command('Addon:Install', {'path': str(install_path), 'temporary': True})
                # Read the test add-on's generated UUID through Firefox's automation context.
                client.command('Marionette:SetContext', {'value': 'chrome'})
                result = client.command('WebDriver:ExecuteScript', {'script': 'return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))["biscotty@cordafab.com"];', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                uuid = result.get('value', result) if isinstance(result, dict) else result
                client.command('Marionette:SetContext', {'value': 'content'})
                client.command('WebDriver:Navigate', {'url': 'moz-extension://' + uuid + '/src/frontend/options.html'})
                deadline = time.monotonic() + 60
                result = package_smoke(client, uuid) if args.smoke else None
                while result is None and time.monotonic() < deadline:
                    data = client.command('WebDriver:ExecuteScript', {'script': 'return document.documentElement.getAttribute("data-native-results");', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    text = data.get('value') if isinstance(data, dict) else data
                    if text:
                        result = json.loads(text)
                        break
                    time.sleep(.15)
                if result is None:
                    state = client.command('WebDriver:ExecuteScript', {'script': 'return document.body.innerText;', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    raise RuntimeError('Native tests timed out: ' + str(state))
                if args.smoke:
                    client.command('Marionette:SetContext', {'value': 'chrome'})
                    observed = client.command('WebDriver:ExecuteScript', {'script': '''
                        const state = Services.appShell.hiddenDOMWindow.biscottyNetworkTest;
                        Services.obs.removeObserver(state.observer, 'http-on-modify-request');
                        delete Services.appShell.hiddenDOMWindow.biscottyNetworkTest;
                        return state.requests;
                    ''', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    requests = observed.get('value', observed) if isinstance(observed, dict) else observed
                    result.append({'name': 'No extension-attributed HTTP requests during installation and production UI smoke', 'ok': requests == 0, 'requests': requests})
                    client.command('Marionette:SetContext', {'value': 'content'})
                browser_capabilities = capabilities.get('capabilities', capabilities)
                identity = {'sourcePackageSha256': hashlib.sha256(args.package.read_bytes()).hexdigest(), 'unmodifiedArchive': args.smoke} if args.package else {}
                print(json.dumps({'browser': browser_capabilities.get('browserVersion', 'unknown'), 'platform': platform.platform(), 'firstPartyIsolation': args.fpi, **identity, 'results': result}, indent=2))
                if any(not row['ok'] for row in result):
                    return 1
                if args.export_file:
                    exported = client.command('WebDriver:ExecuteScript', {'script': 'return document.documentElement.getAttribute("data-native-export");', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    Path(args.export_file).write_text(exported.get('value', exported) if isinstance(exported, dict) else exported)
                screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'highlights': [], 'full': True, 'scroll': True})
                if args.screenshot:
                    import base64
                    content = screenshot.get('value', screenshot) if isinstance(screenshot, dict) else screenshot
                    Path(args.screenshot).write_bytes(base64.b64decode(content))
            finally:
                if client:
                    try:
                        client.command('Marionette:Quit', {'flags': ['eForceQuit']})
                    except (OSError, RuntimeError):
                        pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    process.wait(timeout=5)
    return 0

if __name__ == '__main__':
    sys.exit(main())
