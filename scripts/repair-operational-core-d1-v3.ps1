param(
  [string]$DatabaseName = "flowapp-db",
  [string]$Environment = "production"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir "..")
$Backend = Join-Path $Root "backend"

if (-not (Test-Path (Join-Path $Backend "package.json"))) {
  throw "No se encontro la carpeta backend en $Backend"
}

function Invoke-WranglerD1 {
  param(
    [Parameter(Mandatory = $true)][string[]]$ExtraArgs,
    [Parameter(Mandatory = $true)][string]$Title
  )

  Write-Host "`n==> $Title" -ForegroundColor Cyan
  Push-Location $Backend
  try {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $args = @(
        "wrangler", "d1", "execute", $DatabaseName,
        "--env", $Environment,
        "--remote"
      ) + $ExtraArgs + @("--yes")

      $outputLines = & npx @args 2>&1
      $exitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $oldPreference
    }

    $output = $outputLines | Out-String
    Write-Host $output

    if ($exitCode -ne 0) {
      throw "$Title fallo con codigo $exitCode"
    }

    return $output
  }
  finally {
    Pop-Location
  }
}

function Invoke-D1Command {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Title
  )

  return Invoke-WranglerD1 -ExtraArgs @("--command", $Sql) -Title $Title
}

function Invoke-D1File {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Title
  )

  $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("flowapp-d1-" + [Guid]::NewGuid().ToString("N") + ".sql")
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

  try {
    [System.IO.File]::WriteAllText($tempFile, $Sql, $utf8NoBom)
    return Invoke-WranglerD1 -ExtraArgs @("--file", $tempFile) -Title $Title
  }
  finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-D1Column {
  param(
    [Parameter(Mandatory = $true)][string]$Table,
    [Parameter(Mandatory = $true)][string]$Column,
    [Parameter(Mandatory = $true)][string]$Definition
  )

  $token = "MISSING_${Table}_${Column}"
  $checkSql = "SELECT CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('$Table') WHERE name='$Column') THEN 'PRESENT_${Table}_${Column}' ELSE '$token' END AS schema_state;"
  $result = Invoke-D1Command -Sql $checkSql -Title "Validar $Table.$Column"

  if ($result -match [regex]::Escape($token)) {
    Invoke-D1Command -Sql "ALTER TABLE $Table ADD COLUMN $Column $Definition;" -Title "Agregar $Table.$Column" | Out-Null
  }
  else {
    Write-Host "$Table.$Column ya existe." -ForegroundColor DarkGray
  }
}

# Revalidar columnas: las ya agregadas se omiten.
Ensure-D1Column -Table "process_configs" -Column "default_sla_days" -Definition "INTEGER NOT NULL DEFAULT 5"
Ensure-D1Column -Table "requests" -Column "process_version_id" -Definition "TEXT"
Ensure-D1Column -Table "requests" -Column "process_version" -Definition "INTEGER"
Ensure-D1Column -Table "requests" -Column "submitted_at" -Definition "TEXT"
Ensure-D1Column -Table "requests" -Column "approved_at" -Definition "TEXT"
Ensure-D1Column -Table "requests" -Column "rejected_at" -Definition "TEXT"
Ensure-D1Column -Table "requests" -Column "cancelled_at" -Definition "TEXT"
Ensure-D1Column -Table "requests" -Column "closed_at" -Definition "TEXT"
Ensure-D1Column -Table "requests" -Column "sla_due_at" -Definition "TEXT"
Ensure-D1Column -Table "ws_tasks" -Column "started_at" -Definition "TEXT"
Ensure-D1Column -Table "ws_tasks" -Column "completed_at" -Definition "TEXT"

$CreateObjectsSql = @'
CREATE TABLE IF NOT EXISTS process_versions (
  id            TEXT PRIMARY KEY,
  process_id    TEXT NOT NULL REFERENCES request_types(id),
  version       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  snapshot_json TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(process_id, version)
);

CREATE INDEX IF NOT EXISTS idx_process_versions_process
  ON process_versions(process_id, version DESC);

CREATE TABLE IF NOT EXISTS work_events (
  id          TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  task_id     TEXT,
  event_type  TEXT NOT NULL,
  title       TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  actor_email TEXT,
  detail_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_events_request
  ON work_events(request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_events_task
  ON work_events(task_id, created_at DESC);
'@

Invoke-D1File -Sql $CreateObjectsSql -Title "Crear tablas e indices operacionales" | Out-Null

$BackfillVersionsSql = @'
INSERT OR IGNORE INTO process_versions
  (id, process_id, version, name, description, snapshot_json, created_by, created_at)
SELECT
  lower(hex(randomblob(16))),
  rt.id,
  1,
  rt.name,
  rt.description,
  json_object(
    'name', rt.name,
    'description', rt.description,
    'form_schema_json', COALESCE(pc.form_schema_json, '[]'),
    'close_schema_json', COALESCE(pc.close_schema_json, '[]'),
    'email_subject', pc.email_subject,
    'email_body', pc.email_body,
    'category', pc.category,
    'color', COALESCE(pc.color, '#0284C7'),
    'icon', COALESCE(pc.icon, 'flow'),
    'default_sla_days', COALESCE(pc.default_sla_days, 5)
  ),
  'hotfix-operational-core',
  COALESCE(rt.created_at, datetime('now'))
FROM request_types rt
LEFT JOIN process_configs pc ON pc.id = rt.id;

UPDATE requests
SET process_version_id = (
      SELECT pv.id
      FROM process_versions pv
      WHERE pv.process_id = requests.request_type_id
      ORDER BY pv.version DESC
      LIMIT 1
    ),
    process_version = COALESCE((
      SELECT pv.version
      FROM process_versions pv
      WHERE pv.process_id = requests.request_type_id
      ORDER BY pv.version DESC
      LIMIT 1
    ), 1)
WHERE process_version_id IS NULL;

UPDATE ws_tasks
SET completed_at = COALESCE(completed_at, updated_at)
WHERE EXISTS (
  SELECT 1
  FROM ws_space_statuses s
  WHERE s.space_id = ws_tasks.space_id
    AND s.key = ws_tasks.status
    AND s.is_done = 1
);
'@

Invoke-D1File -Sql $BackfillVersionsSql -Title "Crear versiones iniciales y vincular solicitudes" | Out-Null

$BackfillEventsSql = @'
INSERT INTO work_events
  (id, request_id, event_type, title, actor_id, actor_name, actor_email, created_at)
SELECT
  lower(hex(randomblob(16))),
  r.id,
  'request_created',
  'Solicitud creada',
  r.requester_id,
  r.requester_name,
  r.requester_email,
  r.created_at
FROM requests r
WHERE NOT EXISTS (
  SELECT 1
  FROM work_events e
  WHERE e.request_id = r.id
    AND e.event_type = 'request_created'
);

INSERT INTO work_events
  (id, request_id, event_type, title, actor_id, actor_name, actor_email, detail_json, created_at)
SELECT
  lower(hex(randomblob(16))),
  s.request_id,
  CASE WHEN s.status = 'approved' THEN 'approval_approved' ELSE 'approval_rejected' END,
  CASE WHEN s.status = 'approved' THEN 'Aprobacion registrada' ELSE 'Solicitud rechazada' END,
  s.approver_id,
  s.approver_name,
  s.approver_email,
  json_object('level', s.level, 'label', s.label, 'comment', s.comment),
  COALESCE(s.decided_at, s.created_at)
FROM approval_steps s
WHERE s.status IN ('approved', 'rejected')
  AND NOT EXISTS (
    SELECT 1
    FROM work_events e
    WHERE e.request_id = s.request_id
      AND e.event_type = CASE WHEN s.status = 'approved' THEN 'approval_approved' ELSE 'approval_rejected' END
      AND json_extract(e.detail_json, '$.level') = s.level
  );

INSERT INTO work_events
  (id, request_id, task_id, event_type, title, actor_name, actor_email, detail_json, created_at)
SELECT
  lower(hex(randomblob(16))),
  t.source_id,
  t.id,
  'task_created',
  'Trabajo creado en el area',
  COALESCE(t.created_by_name, 'FlowApp'),
  t.created_by_email,
  json_object('space_id', t.space_id, 'status', t.status, 'assignee', t.assignee_name),
  t.created_at
FROM ws_tasks t
JOIN requests r ON r.id = t.source_id
WHERE t.source_type = 'request'
  AND t.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM work_events e
    WHERE e.task_id = t.id
      AND e.event_type = 'task_created'
  );
'@

Invoke-D1File -Sql $BackfillEventsSql -Title "Reconstruir linea de tiempo historica" | Out-Null

$VerifySql = @'
SELECT 'process_versions' AS object, COUNT(*) AS rows FROM process_versions
UNION ALL
SELECT 'work_events', COUNT(*) FROM work_events
UNION ALL
SELECT 'requests_without_version', COUNT(*) FROM requests WHERE process_version_id IS NULL;
'@

Invoke-D1Command -Sql $VerifySql -Title "Verificar reparacion"

Write-Host "`nReparacion D1 completada. Prueba nuevamente guardar el proceso." -ForegroundColor Green
