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

ROOT = Path(__file__).resolve().parents[2]

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--screenshot')
    parser.add_argument('--fpi', action='store_true')
    parser.add_argument('--export-file')
    parser.add_argument('--import-file')
    args = parser.parse_args()
    firefox = os.environ.get('FIREFOX_BINARY', shutil.which('firefox') or '')
    if not firefox:
        raise RuntimeError('Set FIREFOX_BINARY to a Firefox desktop executable.')
    with tempfile.TemporaryDirectory(prefix='biscotty-native-') as directory:
        temporary = Path(directory)
        source = temporary / 'extension'
        source.mkdir()
        for path in ['src', 'assets', 'manifest.json', 'tests']:
            original = ROOT / path
            target = source / path
            if original.is_dir():
                shutil.copytree(original, target)
            else:
                shutil.copy2(original, target)
        imported = Path(args.import_file).read_text() if args.import_file else None
        (source / 'tests/native/input.js').write_text('export const importedText = ' + json.dumps(imported) + ';\n')
        # This script is inserted only into the disposable test copy.
        options = source / 'src/frontend/options.html'
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
                    raise RuntimeError('Firefox automation did not become available.')
                capabilities = client.command('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {'acceptInsecureCerts': True}}})
                client.command('Addon:Install', {'path': str(source), 'temporary': True})
                # Read the test add-on's generated UUID through Firefox's automation context.
                client.command('Marionette:SetContext', {'value': 'chrome'})
                result = client.command('WebDriver:ExecuteScript', {'script': 'return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))["biscotty@cordafab.dev"];', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                uuid = result.get('value', result) if isinstance(result, dict) else result
                client.command('Marionette:SetContext', {'value': 'content'})
                client.command('WebDriver:Navigate', {'url': 'moz-extension://' + uuid + '/src/frontend/options.html'})
                deadline = time.monotonic() + 60
                result = None
                while time.monotonic() < deadline:
                    data = client.command('WebDriver:ExecuteScript', {'script': 'return document.documentElement.getAttribute("data-native-results");', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    text = data.get('value') if isinstance(data, dict) else data
                    if text:
                        result = json.loads(text)
                        break
                    time.sleep(.15)
                if result is None:
                    state = client.command('WebDriver:ExecuteScript', {'script': 'return document.body.innerText;', 'args': [], 'newSandbox': True, 'sandbox': 'default'})
                    raise RuntimeError('Native tests timed out: ' + str(state))
                browser_capabilities = capabilities.get('capabilities', capabilities)
                print(json.dumps({'browser': browser_capabilities.get('browserVersion', 'unknown'), 'platform': platform.platform(), 'firstPartyIsolation': args.fpi, 'results': result}, indent=2))
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
