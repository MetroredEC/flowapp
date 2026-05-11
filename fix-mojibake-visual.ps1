$Root = "C:\Users\USER\Desktop\flowapp"

$Extensions = @(
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".html", ".css", ".sql", ".txt", ".env"
)

$Files = Get-ChildItem $Root -Recurse -File |
  Where-Object {
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.FullName -notmatch "\\dist\\" -and
    $_.FullName -notmatch "\\.git\\" -and
    $_.FullName -notmatch "\\.flowapp_backup_" -and
    $Extensions -contains $_.Extension
  }

$BadChars = @(
  [char]0x2026, # ellipsis
  [char]0x00A6, # broken bar

  # Familias anteriores por seguridad
  [char]0x00C3,
  [char]0x00C2,
  [char]0x00C6,
  [char]0x00E2,
  [char]0x20AC,
  [char]0x2122,
  [char]0x00A2,
  [char]0x017E,
  [char]0x00BE,
  [char]0x00B1,
  [char]0x0153,
  [char]0x0178,
  [char]0x0192,
  [char]0x0160,
  [char]0x0161,
  [char]0xFFFD,
  [char]0x2020,
  [char]0x201A,
  [char]0x00AC,
  [char]0x2019,
  [char]0x201E,
  [char]0x00C5,
  [char]0x00A1,
  [char]0x201C,
  [char]0x201D,
  [char]0x2018,
  [char]0x00B4
)

foreach ($File in $Files) {
  $Path = $File.FullName
  $Content = Get-Content $Path -Raw -ErrorAction SilentlyContinue

  if ($null -eq $Content) {
    continue
  }

  $Original = $Content

  foreach ($Bad in $BadChars) {
    $Content = $Content.Replace([string]$Bad, "")
  }

  $Content = $Content.Replace("  ", " ")
  $Content = $Content.Replace(" .", ".")
  $Content = $Content.Replace(" ,", ",")
  $Content = $Content.Replace(" :", ":")
  $Content = $Content.Replace(" ;", ";")

  if ($Content -ne $Original) {
    [System.IO.File]::WriteAllText(
      $Path,
      $Content,
      [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "[OK] Limpio: $Path"
  }
}
