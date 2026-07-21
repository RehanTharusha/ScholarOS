$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)

# Replace the editorContentByPath state declaration with the store.
# Keep editorContent (active tab) and editorContentRef for now — they're
# used elsewhere. The new editorStore replaces the by-path state + ref pair.
$old = '  const [editorContentByPath, setEditorContentByPath] = useState<' + "`r`n" +
       '    Record<string, string>' + "`r`n" +
       '  >({});' + "`r`n" +
       '  const editorContentByPathRef = useRef<Map<string, string>>(new Map());'
$new = '  // Per-file editor content store (single source of truth, was previously' + "`r`n" +
       '  // duplicated as editorContentByPath (state) + editorContentByPathRef' + "`r`n" +
       '  // (ref)). See hooks/use-editor-content-store.ts for the API.' + "`r`n" +
       '  const editorStore = useEditorContentStore();'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "State replaced with store"
