# Fallback local server for Windows machines without Python or Node.js.
# Uses the .NET HttpListener built into Windows PowerShell 5+ (localhost only, no admin rights needed).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg';
  '.svg' = 'image/svg+xml'; '.wasm' = 'application/wasm'; '.ico' = 'image/x-icon'; '.md' = 'text/markdown; charset=utf-8'
}
$listener = $null
foreach ($port in 8765..8784) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$port/")
    $l.Start()
    $listener = $l
    break
  } catch { }
}
if (-not $listener) { Write-Host '找不到可用的連接埠'; exit 1 }
$url = $listener.Prefixes | Select-Object -First 1
Write-Host ('=' * 60)
Write-Host '  現代住宅 3D 看房  -  本機伺服器已啟動 (PowerShell)'
Write-Host "  請用瀏覽器開啟： $url"
Write-Host '  （關閉此視窗即可結束）'
Write-Host ('=' * 60)
Start-Process $url
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($path.EndsWith('/')) { $path += 'index.html' }
  $file = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
  $res = $ctx.Response
  try {
    if ($file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    # e.g. the browser cancelled the request mid-transfer: keep serving
    try { $res.StatusCode = 500 } catch { }
  } finally {
    try { $res.OutputStream.Close() } catch { }
  }
}
