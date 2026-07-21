$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# 1) Rewrite setEditorCacheForPath and removeEditorCacheForPath to
#    use editorStore instead of editorContentByPathRef + state.
$old1 = '  const setEditorCacheForPath = useCallback((path: string, content: string) => {' + $le +
        '    editorContentByPathRef.current.set(path, content);' + $le +
        '    setEditorContentByPath((prev) => {' + $le +
        '      if (prev[path] === content) return prev;' + $le +
        '      return { ...prev, [path]: content };' + $le +
        '    });' + $le +
        '  }, []);' + $le +
        $le +
        '  const removeEditorCacheForPath = useCallback((path: string) => {' + $le +
        '    editorContentByPathRef.current.delete(path);' + $le +
        '    untitledRenameReadyPathsRef.current.delete(path);' + $le +
        '    setEditorContentByPath((prev) => {' + $le +
        '      if (!(path in prev)) return prev;' + $le +
        '      const next = { ...prev };' + $le +
        '      delete next[path];' + $le +
        '      return next;' + $le +
        '    });' + $le +
        '  }, []);'

$new1 = '  const setEditorCacheForPath = useCallback(' + $le +
        '    (path: string, content: string) => {' + $le +
        '      editorStore.set(path, content);' + $le +
        '    },' + $le +
        '    [editorStore],' + $le +
        '  );' + $le +
        $le +
        '  const removeEditorCacheForPath = useCallback(' + $le +
        '    (path: string) => {' + $le +
        '      editorStore.delete(path);' + $le +
        '      untitledRenameReadyPathsRef.current.delete(path);' + $le +
        '    },' + $le +
        '    [editorStore],' + $le +
        '  );'

$idx1 = $content.IndexOf($old1)
if ($idx1 -lt 0) { Write-Host "setEditor miss"; exit 1 }
$content = $content.Substring(0, $idx1) + $new1 + $content.Substring($idx1 + $old1.Length)
Write-Host "Patched setEditor/removeEditor"

# 2) Reset state - replace editorContentByPathRef.current.clear() with
#    editorStore.clear() in resetWorkspaceState
$old2 = '      editorPathRef.current = null;' + $le +
        '      editorContentByPathRef.current.clear();' + $le +
        '      initialContentByPathRef.current.clear();'
$new2 = '      editorPathRef.current = null;' + $le +
        '      editorStore.clear();' + $le +
        '      initialContentByPathRef.current.clear();'
$idx2 = $content.IndexOf($old2)
if ($idx2 -lt 0) { Write-Host "reset miss"; exit 1 }
$content = $content.Substring(0, $idx2) + $new2 + $content.Substring($idx2 + $old2.Length)
Write-Host "Patched resetWorkspaceState"

# 3) Patch all remaining editorContentByPathRef references.
# There are 8 remaining (lines 1700, 1918, 1926, 1927, 5174, 5177, 5178, 5332)
# We do this with a regex that handles all variants:
#   .get(...)     -> editorStore.get(...)
#   .delete(...)  -> editorStore.delete(...)
#   .set(...)     -> editorStore.set(...)

$lines = $content -split $le
$patched = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  if ($line -match 'editorContentByPathRef\.current\.') {
    $newLine = $line -replace 'editorContentByPathRef\.current\.', 'editorStore.'
    $lines[$i] = $newLine
    $patched++
  }
}
$content = ($lines -join $le)
Write-Host "Patched $patched remaining ref sites"

[System.IO.File]::WriteAllText($f, $content)
