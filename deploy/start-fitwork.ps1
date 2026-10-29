# Starts the public FitWork site from this laptop (free hosting).
#
#   1. waits for Docker Desktop
#   2. opens a free Cloudflare Quick Tunnel  -> public https://<random>.trycloudflare.com address
#   3. (re)starts the FitWork container (website + API) with that address
#   4. points the fixed address https://zain369-fitwork.static.hf.space at the new tunnel address
#
# Private settings live OUTSIDE the repo in C:\Users\PSBA\FitWork (fitwork-prod.env, hf_token.txt).
# Run by hand:   powershell -ExecutionPolicy Bypass -File deploy\start-fitwork.ps1
# It also runs automatically at Windows login (shortcut in the Startup folder).

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Dir = "C:\Users\PSBA\FitWork"
$Log = Join-Path $Dir "fitwork.log"
$TunnelLog = Join-Path $Dir "tunnel.log"
$Port = 8001

function Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $Log -Value $line
    Write-Output $line
}

Log "---- starting FitWork ----"

# 1. Docker engine
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
function DockerReady { & $docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (DockerReady)) {
    Log "Docker not running - starting Docker Desktop"
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    $deadline = (Get-Date).AddMinutes(5)
    while (-not (DockerReady)) {
        if ((Get-Date) -gt $deadline) { Log "ERROR: Docker did not start within 5 minutes"; exit 1 }
        Start-Sleep -Seconds 5
    }
}
Log "Docker is ready"

# 2. Cloudflare Quick Tunnel (no account needed). A new random address is issued on every start.
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) {
    $cloudflared = @("C:\Program Files (x86)\cloudflared\cloudflared.exe", "C:\Program Files\cloudflared\cloudflared.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $cloudflared) { Log "ERROR: cloudflared is not installed"; exit 1 }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force }
Start-Process -FilePath $cloudflared -WindowStyle Hidden -ArgumentList @(
    "tunnel", "--no-autoupdate", "--url", "http://localhost:$Port", "--logfile", "`"$TunnelLog`""
)
$url = $null
$deadline = (Get-Date).AddMinutes(2)
while (-not $url) {
    if ((Get-Date) -gt $deadline) { Log "ERROR: tunnel did not report an address"; exit 1 }
    Start-Sleep -Seconds 2
    if (Test-Path $TunnelLog) {
        $m = Select-String -Path $TunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
}
Log "Tunnel address: $url"

# 3. FitWork container (website + API). --restart unless-stopped: Docker restarts it after a crash.
& $docker rm -f fitwork *> $null
& $docker run -d --name fitwork --restart unless-stopped -p "${Port}:8000" `
    --env-file (Join-Path $Dir "fitwork-prod.env") -e "FRONTEND_URL=$url" -e "CORS_ORIGINS=$url" fitwork:prod | Out-Null
$deadline = (Get-Date).AddMinutes(3)
do {
    Start-Sleep -Seconds 3
    try { $ok = (Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 5).status -eq "ok" } catch { $ok = $false }
} until ($ok -or (Get-Date) -gt $deadline)
if (-not $ok) { Log "ERROR: FitWork container did not become healthy"; exit 1 }
Log "FitWork is running on port $Port"

# 4. Fixed public address -> current tunnel
Set-Content -Path (Join-Path $Dir "current-url.txt") -Value $url
$python = Join-Path $Repo "backend\.venv\Scripts\python.exe"
& $python (Join-Path $Repo "deploy\update_redirect.py") $url 2>&1 | ForEach-Object { Log "redirect: $_" }
Log "Done. Public address: $url"
