$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $runtime = $node.Source
} else {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
    if (-not (Test-Path -LiteralPath $runtime)) {
        throw 'Node.js 22 or later is required. Install Node.js LTS, then run this script again.'
    }
}
Push-Location $PSScriptRoot
try {
    & $runtime (Join-Path $PSScriptRoot 'server.js')
    if ($LASTEXITCODE -ne 0) {
        throw "Task planner exited with code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
