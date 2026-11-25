# Open the site to your phone through a free Cloudflare quick tunnel (Windows PowerShell).
#   $env:SITE_PASSWORD = 'pick-something-long'; .\scripts\public.ps1
# Needs: Node 18+ and cloudflared (winget install --id Cloudflare.cloudflared).
# Your computer has to stay on and awake. Stop with Ctrl+C. The trycloudflare.com address changes
# every time you start this, so open the new one it prints.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not $env:SITE_PASSWORD) {
  Write-Error "Set SITE_PASSWORD first:  `$env:SITE_PASSWORD = 'pick-something-long'. The tunnel makes the site public; it will not start without a password."
}
if ($env:SITE_PASSWORD.Length -lt 10) { Write-Error 'Use a password of at least 10 characters.' }
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) { Write-Error 'cloudflared is not installed: winget install --id Cloudflare.cloudflared' }

if (-not $env:PORT) { $env:PORT = (Get-Content config.json | ConvertFrom-Json).port }
$server = Start-Process node -ArgumentList 'server.js' -PassThru -NoNewWindow
try {
  Start-Sleep -Seconds 2
  Write-Host 'Starting the tunnel. Open the https://....trycloudflare.com address below on your phone.'
  Write-Host 'Any username works; the password is SITE_PASSWORD.'
  cloudflared tunnel --no-autoupdate --url "http://localhost:$($env:PORT)"
} finally {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
