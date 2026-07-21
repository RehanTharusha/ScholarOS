$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\main\src\ipc.ts'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Revert the wrap. The schema is strict; switching the response shape
# to IpcResult<T> requires updating the Zod schema in
# packages/shared/src/ipc.ts. For now keep the helpers and let the
# registerIpcHandlers timing/error wrapper continue to handle
# thrown errors. Migration is opt-in per handler when the schema
# is updated.

$old = '    "workspace:readFile": async (_event, args) => {' + $le +
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

$new = '    "workspace:readFile": async (_event, args) => {' + $le +
       '      return workspace.readFile(args.path, args.encoding);' + $le +
       '    },' + $le +
       '    "workspace:writeFile": async (_event, args) => {' + $le +
       '      return workspace.writeFile(args.path, args.data, args.opts);' + $le +
       '    },'

$idx = $content.IndexOf($old)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $new + $content.Substring($idx + $old.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "reverted"
