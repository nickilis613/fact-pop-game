$ErrorActionPreference = 'Stop'
$gameDirectory = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} else {
    $nodeExecutable = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Install Node.js 22.13 or newer, then launch Fact Pop again.' }
$isRunning = $false
try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/engine.js' -TimeoutSec 2
    $isRunning = $response.StatusCode -eq 200 -and $response.Content.Contains('fact-pop.progress.v2')
} catch {}
if (-not $isRunning) {
    Start-Process -FilePath $nodeExecutable -ArgumentList 'serve.mjs' -WorkingDirectory $gameDirectory -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/engine.js' -TimeoutSec 1
            if ($response.StatusCode -eq 200 -and $response.Content.Contains('fact-pop.progress.v2')) { $isRunning = $true; break }
        } catch {}
    }
}
if (-not $isRunning) { throw 'Fact Pop could not start. Port 4173 may already be in use.' }
Start-Process 'http://127.0.0.1:4173/'
