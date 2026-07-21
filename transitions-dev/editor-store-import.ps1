$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)

# Add useEditorContentStore import
$old = 'import { useDebounce } from "./hooks/use-debounce";'
$new = 'import { useDebounce } from "./hooks/use-debounce";' + "`r`n" +
       'import { useEditorContentStore } from "./hooks/use-editor-content-store";'
$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "Import added"
