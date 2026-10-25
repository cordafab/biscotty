#!/usr/bin/env python3
"""Fresh audit assertions, production ZIP, disposable Firefox/Marionette profiles."""
import argparse
import json
import platform
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import zipfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

class Marionette:
    def __init__(self, port):
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=30)
        self.sock.settimeout(30)
        self.index = 0
        self.receive()
    def receive(self):
        prefix = b''
        while not prefix.endswith(b':'):
            piece = self.sock.recv(1)
            if not piece:
                raise RuntimeError('Browser disconnected')
            prefix += piece
        remaining = int(prefix[:-1])
        body = b''
        while remaining:
            piece = self.sock.recv(remaining)
            if not piece:
                raise RuntimeError('Browser disconnected')
            body += piece
            remaining -= len(piece)
        return json.loads(body)
    def command(self, name, args=None):
        self.index += 1
        body = json.dumps([0, self.index, name, args or {}]).encode()
        self.sock.sendall(str(len(body)).encode() + b':' + body)
        response = self.receive()
        if response[2]:
            raise RuntimeError(json.dumps(response[2]))
        value = response[3]
        return value.get('value', value) if isinstance(value, dict) else value

class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/redirect'):
            self.send_response(302)
            self.send_header('Location', '/page?secret=URL_SECRET_014')
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        body = '<!doctype html><title>Audit synthetic fixture</title>'
        if self.path.startswith('/page'):
            body += '<iframe src="http://127.0.0.1:%d/frame"></iframe>' % self.server.server_port
        elif self.path == '/frame':
            body += '<iframe src="/nested"></iframe>'
        self.wfile.write(body.encode())
    def log_message(self, *_args):
        pass

def run(binary, mode, fpi, imported):
    with tempfile.TemporaryDirectory(prefix='biscotty-clean-014-') as temporary:
        directory = Path(temporary)
        extension = directory / 'extension'
        with zipfile.ZipFile(ROOT / 'dist/biscotty-0.1.4.zip') as archive:
            archive.extractall(extension)
        audit = extension / 'audit'
        audit.mkdir()
        shutil.copy2(HERE / 'native-checks.js', audit / 'checks.js')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        (audit / 'input.js').write_text('export const mode = %s;\nexport const fixturePort = %d;\nexport const importedText = %s;\n' % (json.dumps(mode), server.server_port, json.dumps(imported)))
        options = extension / 'src/frontend/options.html'
        options.write_text(options.read_text().replace('</body>', '<script type="module" src="../../audit/checks.js"></script></body>'))
        profile = directory / 'profile'
        profile.mkdir()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        prefs = {
            'marionette.port': port, 'browser.shell.checkDefaultBrowser': False,
            'browser.aboutwelcome.enabled': False, 'browser.startup.homepage_override.mstone': 'ignore',
            'browser.startup.page': 0, 'browser.newtabpage.enabled': False,
            'datareporting.policy.dataSubmissionEnabled': False, 'toolkit.telemetry.enabled': False,
            'privacy.userContext.enabled': True, 'extensions.autoDisableScopes': 0,
            'extensions.webextensions.host_permissions.default_all_urls_granted': True,
            'privacy.firstparty.isolate': fpi,
        }
        (profile / 'user.js').write_text('\n'.join('user_pref(%s, %s);' % (json.dumps(key), json.dumps(value)) for key, value in prefs.items()))
        with (directory / 'firefox.log').open('w') as log:
            process = subprocess.Popen([binary, '--headless', '--no-remote', '--marionette', '--remote-allow-system-access', '--profile', str(profile), 'about:blank'], stdout=log, stderr=log)
            client = None
            try:
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    try:
                        client = Marionette(port)
                        break
                    except OSError:
                        if process.poll() is not None:
                            raise RuntimeError((directory / 'firefox.log').read_text()[-3000:])
                        time.sleep(.2)
                if client is None:
                    raise RuntimeError('Firefox did not start')
                capabilities = client.command('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {'acceptInsecureCerts': True}}})
                client.command('Addon:Install', {'path': str(extension), 'temporary': True})
                client.command('Marionette:SetContext', {'value': 'chrome'})
                uuid = client.command('WebDriver:ExecuteScript', {'script': 'return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))["biscotty@cordafab.com"];', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                client.command('Marionette:SetContext', {'value': 'content'})
                client.command('WebDriver:Navigate', {'url': 'moz-extension://' + uuid + '/src/frontend/options.html'})
                deadline = time.monotonic() + 50
                while time.monotonic() < deadline:
                    raw = client.command('WebDriver:ExecuteScript', {'script': 'return document.documentElement.getAttribute("data-audit-results");', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    if raw:
                        return {'browser': capabilities.get('capabilities', capabilities).get('browserVersion'), 'platform': platform.platform(), 'mode': mode, 'firstPartyIsolation': fpi, **json.loads(raw)}
                    time.sleep(.1)
                raise RuntimeError('Fresh native assertions timed out: ' + str(client.command('WebDriver:ExecuteScript', {'script': 'return document.body.innerText;', 'args': [], 'newSandbox': True, 'sandbox': 'default'})))
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
                server.shutdown()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', default=shutil.which('firefox'))
    parser.add_argument('--output', default=str(HERE / 'native-results.json'))
    args = parser.parse_args()
    runs = []
    for mode, fpi in [('full', False), ('full', True), ('denied', False)]:
        result = run(args.binary, mode, fpi, runs[0].get('exportedText') if runs and mode == 'full' else None)
        runs.append(result)
        Path(args.output).write_text(json.dumps(runs, indent=2) + '\n')
        print(json.dumps({key: value for key, value in result.items() if key != 'exportedText'}, indent=2), flush=True)
    raise SystemExit(1 if any(not item['ok'] for run_result in runs for item in run_result['results']) else 0)
