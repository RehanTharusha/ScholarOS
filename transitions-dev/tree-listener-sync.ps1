$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# In the patcher path, call setTreeAndMap instead of setTree so the
# map stays in sync.
$old = '        if (patched) {' + $le +
       '          const fresh = Array.from(treeMapRef.current.values())' + $le +
       '            .filter((n) => !n.path.includes("/"))' + $le +
       '            .map((n) => ({ ...n }));' + $le +
       '          setTree(sortNodes(fresh));' + $le +
       '        } else {' + $le +
       '          loadDirectory().then(setTree);' + $le +
       '        }'
$new = '        if (patched) {' + $le +
       '          const fresh = Array.from(treeMapRef.current.values())' + $le +
       '            .filter((n) => !n.path.includes("/"))' + $le +
       '            .map((n) => ({ ...n }));' + $le +
       '          setTreeAndMap(sortNodes(fresh));' + $le +
       '        } else {' + $le +
       '          loadDirectory().then(setTreeAndMap);' + $le +
       '        }'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "Listener updated to setTreeAndMap"
