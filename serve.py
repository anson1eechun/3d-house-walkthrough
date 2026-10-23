#!/usr/bin/env python3
"""Local static server for the walkthrough (no internet, no dependencies).

Usage: python serve.py [--port 8765] [--no-browser]
Binds to 127.0.0.1 only. Forces correct MIME types (some Windows installs map
.js to text/plain in the registry, which breaks ES modules).
"""
import argparse
import functools
import http.server
import os
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return TYPES.get(ext) or super().guess_type(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console readable
        if args and str(args[1]).startswith(('4', '5')):
            sys.stderr.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--no-browser', action='store_true')
    a = ap.parse_args()
    handler = functools.partial(Handler, directory=ROOT)
    httpd = None
    for port in range(a.port, a.port + 20):
        try:
            httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            continue
    if httpd is None:
        print('找不到可用的連接埠 (%d-%d)' % (a.port, a.port + 19))
        sys.exit(1)
    url = 'http://localhost:%d/' % httpd.server_address[1]
    print('=' * 60)
    print('  現代住宅 3D 看房  -  本機伺服器已啟動')
    print('  請用瀏覽器開啟： ' + url)
    print('  （按 Ctrl+C 結束）')
    print('=' * 60)
    if not a.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
