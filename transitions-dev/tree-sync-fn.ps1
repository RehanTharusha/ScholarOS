$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Add a syncTree function that updates both tree state and treeMapRef.
# Insert right after the treeMapRef declaration.
$old = '  const treeMapRef = useRef<Map<string, TreeNode>>(new Map());'
$new = '  const treeMapRef = useRef<Map<string, TreeNode>>(new Map());' + $le +
       $le +
       '  /**' + $le +
       '   * Replace the rendered tree and re-sync the lookup map. Callers' + $le +
       '   * should use this instead of setTree directly so the map never' + $le +
       '   * drifts out of sync with the rendered tree.' + $le +
       '   */' + $le +
       '  const setTreeAndMap = useCallback((next: TreeNode[]) => {' + $le +
       '    const map = new Map<string, TreeNode>();' + $le +
       '    const walk = (nodes: TreeNode[]) => {' + $le +
       '      for (const n of nodes) {' + $le +
       '        map.set(n.path, n);' + $le +
       '        if (n.children) walk(n.children);' + $le +
       '      }' + $le +
       '    };' + $le +
       '    walk(next);' + $le +
       '    treeMapRef.current = map;' + $le +
       '    setTree(next);' + $le +
       '  }, []);'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "setTreeAndMap added"
