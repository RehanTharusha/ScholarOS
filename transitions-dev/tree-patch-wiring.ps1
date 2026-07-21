$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Add the patcher import after the SidebarContentPanel import
$old = 'import { SidebarContentPanel } from "@/components/sidebar-content";'
$new = 'import { SidebarContentPanel } from "@/components/sidebar-content";' + $le +
       'import { applyTreePatch as applyTreePatchOp } from "@/lib/tree-patch";'
$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
Write-Host "Patcher imported"

# Modify the workspace:didChange handler to use the patcher for single events
$old2 = '      const needsTreeReload =' + $le +
       '        event.type !== "changed";' + $le +
       '      if (needsTreeReload) {' + $le +
       '        loadDirectory().then(setTree);' + $le +
       '      }'
$new2 = '      const needsTreeReload =' + $le +
       '        event.type !== "changed";' + $le +
       '      if (needsTreeReload) {' + $le +
       '        // Try the incremental patcher first for single events. It' + $le +
       '        // mutates the tree map in place without touching the disk' + $le +
       '        // and avoids the cost of a full recursive readdir. Fall back' + $le +
       '        // to loadDirectory() only for events the patcher cannot handle' + $le +
       '        // (moves, bulkChanged) where we may be missing per-file stat data.' + $le +
       '        let patched = false;' + $le +
       '        if (event.type === "created" || event.type === "deleted") {' + $le +
       '          const stat = async (p: string) => {' + $le +
       '            try { return await window.ipc.invoke("workspace:stat", { path: p }); }' + $le +
       '            catch { return null; }' + $le +
       '          };' + $le +
       '          patched = applyTreePatchOp(treeMapRef.current, event, stat);' + $le +
       '        }' + $le +
       '        if (patched) {' + $le +
       '          const fresh = Array.from(treeMapRef.current.values())' + $le +
       '            .filter((n) => !n.path.includes("/"))' + $le +
       '            .map((n) => ({ ...n }));' + $le +
       '          setTree(sortNodes(fresh));' + $le +
       '        } else {' + $le +
       '          loadDirectory().then(setTree);' + $le +
       '        }' + $le +
       '      }'

$idx2 = $content.IndexOf($old2)
if ($idx2 -lt 0) { Write-Host "handler miss"; exit 1 }
$content = $content.Substring(0, $idx2) + $new2 + $content.Substring($idx2 + $old2.Length)
Write-Host "Handler patched"

# Add the treeMapRef declaration near the tree state
$old3 = '  const [tree, setTree] = useState<TreeNode[]>([]);'
$new3 = '  const [tree, setTree] = useState<TreeNode[]>([]);' + $le +
       '  // Map<path, TreeNode> kept in sync with `tree` for O(1) lookups and' + $le +
       '  // incremental updates from workspace:didChange events.' + $le +
       '  const treeMapRef = useRef<Map<string, TreeNode>>(new Map());'
$idx3 = $content.IndexOf($old3)
if ($idx3 -lt 0) { Write-Host "tree state miss"; exit 1 }
$content = $content.Substring(0, $idx3) + $new3 + $content.Substring($idx3 + $old3.Length)
Write-Host "treeMapRef added"

[System.IO.File]::WriteAllText($f, $content)
