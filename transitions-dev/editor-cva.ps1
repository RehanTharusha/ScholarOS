$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)

# Replace the inactive-tab className "hidden" with content-visibility: auto
# so the browser skips rendering inactive editor panels (TipTap mounts
# but its work is deferred until the tab is shown). Also add
# contain-intrinsic-size so the layout doesn't collapse.
$old = '                                "min-h-0 flex-1 flex-col overflow-hidden",' + "`r`n" +
       '                                isActive ? "flex" : "hidden",'
$new = '                                "min-h-0 flex-1 flex-col overflow-hidden",' + "`r`n" +
       '                                isActive' + "`r`n" +
       '                                  ? "flex"' + "`r`n" +
       '                                  : "flex content-visibility-auto [contain-intrinsic-size:1px_800px]",'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "Patched: content-visibility on inactive editor tabs"
