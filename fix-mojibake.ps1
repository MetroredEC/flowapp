$Root = "C:\Users\USER\Desktop\flowapp"

$Extensions = @(
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".html", ".css", ".sql", ".txt", ".env"
)

$Files = Get-ChildItem $Root -Recurse -File |
  Where-Object {
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.FullName -notmatch "\\dist\\" -and
    $_.FullName -notmatch "\\.git\\" -and
    $Extensions -contains $_.Extension
  }

# Caracteres tipicos de mojibake, definidos por codigo para no romper PowerShell.
$BadChars = @(
  [char]0x00C3, # A con tilde mal decodificada
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
  [char]0xFFFD
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

  # Limpieza de frases que suelen quedar despues de quitar mojibake.
  $Content = $Content.Replace("publicaci n", "publicacion")
  $Content = $Content.Replace("edici n", "edicion")
  $Content = $Content.Replace("descripci n", "descripcion")
  $Content = $Content.Replace("recepci n", "recepcion")
  $Content = $Content.Replace("configuraci n", "configuracion")
  $Content = $Content.Replace("revisi n", "revision")
  $Content = $Content.Replace("aprobaci n", "aprobacion")
  $Content = $Content.Replace("N mero", "Numero")
  $Content = $Content.Replace("n mero", "numero")

  # Limpieza agresiva de cadenas largas de basura visual dentro de textos.
  $Content = [regex]::Replace(
    $Content,
    "[A-Za-z0-9_\-]*[\u00C3\u00C2\u00C6\u00E2\u20AC\u2122\u00A2\u017E\u00BE\u00B1\u0153\u0178\u0192\u0160\u0161\uFFFD][A-Za-z0-9_\-]*",
    ""
  )

  if ($Content -ne $Original) {
    [System.IO.File]::WriteAllText(
      $Path,
      $Content,
      [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "[OK] Limpio: $Path"
  }
}
