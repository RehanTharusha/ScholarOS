$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\renderer\src\components\tab-bar.tsx'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# The X button is a span with role="button" + onClick. The user reports
# it does nothing for PDF tabs. The most likely cause is that the
# parent <button> swallows the click before stopPropagation() can
# run, OR the span has no pointer affordance. Switch to a real
# <button type="button"> to make the close target explicit, add
# cursor-pointer, and add preventDefault() as belt-and-suspenders.
$old = '                <span' + $le +
       '                  role="button"' + $le +
       '                  className="shrink-0 flex items-center justify-center rounded-sm p-0.5 opacity-0 group-hover/tab:opacity-60 hover:opacity-100! hover:bg-foreground/10 transition-all"' + $le +
       '                  onClick={(e) => {' + $le +
       '                    e.stopPropagation();' + $le +
       '                    onCloseTab(tabId);' + $le +
       '                  }}' + $le +
       '                  aria-label="Close tab"' + $le +
       '                >' + $le +
       '                  <X className="size-3" />' + $le +
       '                </span>'

$new = '                <button' + $le +
      '                  type="button"' + $le +
      '                  title="Close tab"' + $le +
      '                  aria-label="Close tab"' + $le +
      '                  className="shrink-0 flex items-center justify-center rounded-sm p-0.5 opacity-0 group-hover/tab:opacity-60 hover:opacity-100! hover:bg-foreground/10 transition-all cursor-pointer"' + $le +
      '                  onMouseDown={(e) => e.stopPropagation()}' + $le +
      '                  onClick={(e) => {' + $le +
      '                    e.stopPropagation();' + $le +
      '                    e.preventDefault();' + $le +
      '                    onCloseTab(tabId);' + $le +
      '                  }}' + $le +
      '                >' + $le +
      '                  <X className="size-3" />' + $le +
      '                </button>'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "X button hardened"
