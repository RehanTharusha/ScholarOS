$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

$lines = $content -split $le
$patched = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  if ($line -match '^(\s+)setEditorContentByPath\(\(prev\) => \(\{ \.\.\.prev, \[([^\]]+)\]: ([^}]+) \}\)\);?\s*$') {
    $indent = $matches[1]
    $keyExpr = $matches[2]
    $valExpr = $matches[3]
    $lines[$i] = "$indent editorStore.set($keyExpr, $valExpr);"
    $patched++
    continue
  }
  if ($line -match '^\s*setEditorContentByPath\(\(prev\) => \{\s*$') {
    $start = $i
    $depth = 0
    $end = -1
    for ($k = $i; $k -lt $lines.Count; $k++) {
      $depth += ([regex]::Matches($lines[$k], '\{')).Count
      $depth -= ([regex]::Matches($lines[$k], '\}')).Count
      if ($depth -le 0 -and $k -gt $i) { $end = $k; break }
    }
    if ($end -lt 0) { continue }
    $block = ($lines[$start..$end] -join $le)
    if ($block -match 'delete next\[([^\]]+)\]') {
      $key = $matches[1]
      $lines[$start] = ($lines[$start] -replace 'setEditorContentByPath\(\(prev\) => \{', "editorStore.delete($key); {")
      for ($k = $start + 1; $k -lt $end; $k++) { $lines[$k] = '' }
      $lines[$end] = '}'
      $patched++
    }
  }
}
Write-Host "Patched $patched setEditorContentByPath sites"
$content = ($lines -join $le)
[System.IO.File]::WriteAllText($f, $content)
