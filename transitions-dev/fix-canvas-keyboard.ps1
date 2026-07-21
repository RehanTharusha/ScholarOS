$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\components\canvas-view.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Insert the input-focus guard right after the editingNodeId check.
$old = '  useEffect(() => {' + $le +
       '    const handler = (e: KeyboardEvent) => {' + $le +
       '      if (editingNodeId) return;' + $le +
       '      if (e.key === "Delete" || e.key === "Backspace") {'
$new = '  useEffect(() => {' + $le +
       '    const handler = (e: KeyboardEvent) => {' + $le +
       '      if (editingNodeId) return;' + $le +
       '      // Defer to native undo / delete when the user is typing in' + $le +
       '      // a text input or contentEditable (sidebar search, rename,' + $le +
       '      // etc). Without this guard every Delete / Ctrl+Z in any input' + $le +
       '      // would be hijacked by the canvas.' + $le +
       '      const target = e.target as HTMLElement | null;' + $le +
       '      if (' + $le +
       '        target &&' + $le +
       '        (target.isContentEditable ||' + $le +
       '          target.tagName === "INPUT" ||' + $le +
       '          target.tagName === "TEXTAREA")' + $le +
       '      ) {' + $le +
       '        return;' + $le +
       '      }' + $le +
       '      if (e.key === "Delete" || e.key === "Backspace") {'
$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "Patched"
