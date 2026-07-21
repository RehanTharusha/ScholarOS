$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\main\src\ipc.ts'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Wrap workspace:readFile and workspace:writeFile to return IpcResult.
# Note: this is a backward-incompatible change for any renderer code
# that expected the raw return value. Existing call sites throw
# their own catch blocks on errors; the IpcResult version requires
# callers to check `.ok`. The wrap is opt-in for now; we're doing
# these two as proof-of-concept.

$old = '    "workspace:readFile": async (_event, args) => {' + $le +
       '      return workspace.readFile(args.path, args.encoding);' + $le +
       '    },' + $le +
       '    "workspace:writeFile": async (_event, args) => {' + $le +
       '      return workspace.writeFile(args.path, args.data, args.opts);' + $le +
       '    },'

$new = '    "workspace:readFile": async (_event, args) => {' + $le +
       '      try {' + $le +
       '        const data = await workspace.readFile(args.path, args.encoding);' + $le +
       '        return ok(data);' + $le +
       '      } catch (e) {' + $le +
       '        return err("READ_FAILED", e instanceof Error ? e.message : String(e));' + $le +
       '      }' + $le +
       '    },' + $le +
       '    "workspace:writeFile": async (_event, args) => {' + $le +
       '      try {' + $le +
       '        const result = await workspace.writeFile(args.path, args.data, args.opts);' + $le +
       '        return ok(result);' + $le +
       '      } catch (e) {' + $le +
       '        return err("WRITE_FAILED", e instanceof Error ? e.message : String(e));' + $le +
       '      }' + $le +
       '    },'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "readFile/writeFile wrapped"
