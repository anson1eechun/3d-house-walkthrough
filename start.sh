#!/usr/bin/env sh
# Starts a local web server for the 3D house walkthrough (works offline).
# Needs Python 3.7+ or Node.js 16+ (macOS and most Linux distributions ship Python 3).
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 serve.py "$@"; fi
if command -v python >/dev/null 2>&1 && python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)'; then exec python serve.py "$@"; fi
if command -v node >/dev/null 2>&1; then exec node serve.mjs "$@"; fi
echo "找不到 Python 3 或 Node.js。請安裝其中之一後再執行（不需要網路連線即可運作）。"
exit 1
