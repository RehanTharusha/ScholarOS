$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\main\src\ipc.ts'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Insert IpcResult helpers right after the execAsync line
$marker = 'const execAsync = promisify(exec);'
$insert = $marker + $le + $le +
          '/**' + $le +
          ' * Discriminated-union result type for IPC handlers. Handlers can' + $le +
          ' * return `ok(data)` or `err(code, message)` instead of throwing, so' + $le +
          ' * the renderer can branch on `result.ok` rather than wrapping every' + $le +
          ' * call in a try/catch.' + $le +
          ' *' + $le +
          ' * Throwing is still allowed (and still wrapped by the' + $le +
          ' * registerIpcHandlers timing/error wrapper for logging). This is' + $le +
          ' * an opt-in for handlers that want explicit success/failure paths.' + $le +
          ' */' + $le +
          'export type IpcResult<T> =' + $le +
          '  | { ok: true; data: T }' + $le +
          '  | { ok: false; error: { code: string; message: string } };' + $le +
          $le +
          'export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });' + $le +
          'export const err = (code: string, message: string): IpcResult<never> => ({' + $le +
          '  ok: false,' + $le +
          '  error: { code, message },' + $le +
          '});'

$idx = $content.IndexOf($marker)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $insert + $content.Substring($idx + $marker.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "IpcResult helpers added"
