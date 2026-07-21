$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\App.tsx'
$content = [System.IO.File]::ReadAllText($f)

# Add an arbitrary value for content-visibility: auto since Tailwind v4
# doesn't include it as a default class.
$old = '                                isActive' + "`r`n" +
       '                                  ? "flex"' + "`r`n" +
       '                                  : "flex content-visibility-auto [contain-intrinsic-size:1px_800px]",'
$new = '                                isActive' + "`r`n" +
      '                                  ? "flex"' + "`r`n" +
      '                                  : "flex [content-visibility:auto] [contain-intrinsic-size:1px_800px]",'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "Patched"
