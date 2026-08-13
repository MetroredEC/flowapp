param(
  [switch]$SkipMigration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Migration = Join-Path $Backend 'schema_operational_core_v1_resume.sql'

function Run-Native {
  param(
    [Parameter(Mandatory)] [string]$Title,
    [Parameter(Mandatory)] [string]$Command,
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  Write-Host "`n==> $Title" -ForegroundColor Cyan
  & $Command @Arguments
  $exitCode = $LASTEXITCODE

  if ($exitCode -ne 0) {
    throw "$Title falló con código $exitCode"
  }
}

if (-not (Test-Path -LiteralPath $Migration)) {
  throw "No se encontró la migración: $Migration"
}

Push-Location $Backend
try {
  Run-Native 'Validar backend' 'npm' @('run', 'type-check')
  Run-Native 'Validar versión de Wrangler' 'npx' @('wrangler', '--version')
  Run-Native 'Validar sesión de Cloudflare' 'npx' @('wrangler', 'whoami')
  Run-Native 'Validar conectividad con D1 remoto' 'npx' @(
    'wrangler', 'd1', 'execute', 'flowapp-db',
    '--env', 'production', '--remote',
    '--command', 'SELECT 1 AS ok;', '--yes'
  )

  if ($SkipMigration) {
    Write-Host "`n==> Migración D1 omitida por parámetro -SkipMigration" -ForegroundColor Yellow
  }
  else {
    Run-Native 'Finalizar núcleo operacional en D1 (reanudable)' 'npx' @(
      'wrangler', 'd1', 'execute', 'flowapp-db',
      '--env', 'production', '--remote',
      '--file', $Migration, '--yes'
    )
  }

  Run-Native 'Desplegar backend' 'npm' @('run', 'deploy:prod')
}
finally {
  Pop-Location
}

Push-Location $Frontend
try {
  Run-Native 'Compilar frontend' 'npm' @('run', 'build')
  Copy-Item -LiteralPath (Join-Path $Frontend 'dist\index.html') `
    -Destination (Join-Path $Frontend 'dist\404.html') -Force
}
finally {
  Pop-Location
}

Run-Native 'Publicar frontend' (Join-Path $PSScriptRoot 'deploy.ps1') @(
  '-Production',
  '-SkipWorker',
  '-SkipFrontendBuild',
  '-PublishPagesBranch',
  '-ApiUrl', 'https://flowapp-production.dbermeo.workers.dev'
)

Write-Host "`nFase Técnica 1 publicada." -ForegroundColor Green
