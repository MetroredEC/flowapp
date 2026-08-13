param(
  # Vacío = se deduce del entorno desplegado. Fijarlo a mano solo para pruebas.
  [string]$ApiUrl = "",
  [string]$FrontendUrl = "https://metroredec.github.io/flowapp",
  [switch]$Production,
  [switch]$ApplyDbSchema,
  [switch]$SkipWorker,
  [switch]$SkipFrontendBuild,
  [switch]$PublishPagesBranch,
  [string]$PagesBranch = "gh-pages"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

# Cada entorno tiene su propio worker. El sitio real consume el de production;
# construir el frontend contra el otro lo deja apuntando a una API que nadie
# actualiza.
if (-not $ApiUrl) {
  $ApiUrl = if ($Production) {
    "https://flowapp-production.dbermeo.workers.dev"
  } else {
    "https://flowapp.dbermeo.workers.dev"
  }
}

# gh-pages es el sitio en vivo: publicar ahí un bundle que apunta al worker de
# pruebas deja a producción hablando con una API desactualizada.
if ($PublishPagesBranch -and -not $Production) {
  throw "Usa -Production junto con -PublishPagesBranch: gh-pages sirve el sitio real y debe apuntar al worker de production."
}

function Invoke-Step {
  param([string]$Title, [scriptblock]$Block)
  Write-Host "`n==> $Title" -ForegroundColor Cyan
  & $Block
}

function Invoke-Native {
  param([string]$File, [string[]]$Arguments, [string]$WorkingDirectory)
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

if (-not $SkipWorker) {
  Invoke-Step "Backend dependencies" { Invoke-Native "npm" @("ci") $Backend }
  Invoke-Step "Backend type-check" { Invoke-Native "npm" @("run", "type-check") $Backend }

  if ($ApplyDbSchema) {
    $dbArgs = if ($Production) { @("run", "db:init:prod") } else { @("run", "db:init") }
    Invoke-Step "Apply D1 schema" { Invoke-Native "npm" $dbArgs $Backend }
  }

  $deployArgs = if ($Production) { @("wrangler", "deploy", "--env", "production") } else { @("wrangler", "deploy") }
  Invoke-Step "Deploy Cloudflare Worker" { Invoke-Native "npx" $deployArgs $Backend }
}

if (-not $SkipFrontendBuild) {
  Invoke-Step "Frontend dependencies" { Invoke-Native "npm" @("ci") $Frontend }
  Invoke-Step "Frontend build" {
    $env:VITE_API_URL = $ApiUrl.TrimEnd("/")
    if (-not $env:VITE_ENTRA_CLIENT_ID) { $env:VITE_ENTRA_CLIENT_ID = "66130291-fc50-43f1-943c-6818dac1ba99" }
    if (-not $env:VITE_ENTRA_TENANT_ID) { $env:VITE_ENTRA_TENANT_ID = "480bd49c-6f89-4faa-b39e-c7728d95d130" }
    if (-not $env:VITE_ENTRA_SCOPE) { $env:VITE_ENTRA_SCOPE = "api://66130291-fc50-43f1-943c-6818dac1ba99/basedeconocimiento" }
    Invoke-Native "npm" @("run", "build") $Frontend
    Copy-Item (Join-Path $Frontend "dist/index.html") (Join-Path $Frontend "dist/404.html") -Force
  }
}

if ($PublishPagesBranch) {
  Invoke-Step "Publish frontend to GitHub Pages branch" {
    $Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("flowapp-pages-" + [Guid]::NewGuid().ToString("N"))
    Invoke-Native "git" @("fetch", "origin") $Root

    Push-Location $Root
    try {
      & git worktree add $Temp $PagesBranch
      if ($LASTEXITCODE -ne 0) {
        & git worktree add --detach $Temp
        if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }
        Push-Location $Temp
        try {
          & git checkout --orphan $PagesBranch
          if ($LASTEXITCODE -ne 0) { throw "git checkout orphan failed" }
        }
        finally { Pop-Location }
      }
    }
    finally { Pop-Location }

    Get-ChildItem $Temp -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
    Copy-Item (Join-Path $Frontend "dist/*") $Temp -Recurse -Force

    Push-Location $Temp
    try {
      & git add -A
      if ($LASTEXITCODE -ne 0) { throw "git add failed" }
      & git diff --cached --quiet
      if ($LASTEXITCODE -eq 0) {
        Write-Host "No frontend changes to publish."
      } else {
        & git commit -m "Deploy FlowApp frontend"
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
        & git push origin "HEAD:$PagesBranch" --force
        if ($LASTEXITCODE -ne 0) { throw "git push failed" }
      }
    }
    finally {
      Pop-Location
      Push-Location $Root
      try { & git worktree remove $Temp --force | Out-Null } finally { Pop-Location }
    }
  }
}

Write-Host "`nDeploy script completed." -ForegroundColor Green
Write-Host "Frontend URL: $FrontendUrl"
Write-Host "API URL:      $ApiUrl"
