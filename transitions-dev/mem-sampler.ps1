$f = 'F:\Programming Projects\ScholarOS\apps\scholaros\apps\main\src\main.ts'
$content = [System.IO.File]::ReadAllText($f)
$crlf = $content.Contains("`r`n")
$le = if ($crlf) { "`r`n" } else { "`n" }

# Insert the memory sampler after the __dirname line. The cleanest
# way is to find a unique anchor.
$marker = 'const __filename = fileURLToPath(import.meta.url);' + $le +
          'const __dirname = dirname(__filename);'
$insert = $marker + $le + $le + '/**' + $le +
          ' * Memory pressure sampler. Samples process.memoryUsage() every' + $le +
          ' * 30s and warns (or pushes a `main:mempressure` IPC event) if RSS' + $le +
          ' * exceeds 1.5GB. The main process can leak memory in long-running' + $le +
          ' * sessions — a 24h session can easily reach 2-3GB if not watched.' + $le +
          ' *' + $le +
          ' * The thresholds are conservative; tune in production.' + $le +
          ' */' + $le +
          'const MEM_PRESSURE_WARN_MB = 1500;' + $le +
          'const MEM_PRESSURE_CRITICAL_MB = 2200;' + $le +
          'const MEM_SAMPLE_INTERVAL_MS = 30_000;' + $le +
          $le +
          'let lastMemWarnMB = 0;' + $le +
          'const memSampler = setInterval(() => {' + $le +
          '  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);' + $le +
          '  if (rssMB >= MEM_PRESSURE_CRITICAL_MB) {' + $le +
          '    console.warn(' + $le +
          '      `[Main] CRITICAL memory pressure: ${rssMB}MB RSS. ` +' + $le +
          '        `Consider restarting the app.`,' + $le +
          '    );' + $le +
          '    for (const win of BrowserWindow.getAllWindows()) {' + $le +
          '      if (!win.isDestroyed() && win.webContents) {' + $le +
          '        win.webContents.send("main:mempressure", { level: "critical", rssMB });' + $le +
          '      }' + $le +
          '    }' + $le +
          '  } else if (rssMB >= MEM_PRESSURE_WARN_MB && rssMB - lastMemWarnMB >= 100) {' + $le +
          '    lastMemWarnMB = rssMB;' + $le +
          '    console.warn(`[Main] memory pressure: ${rssMB}MB RSS`);' + $le +
          '    for (const win of BrowserWindow.getAllWindows()) {' + $le +
          '      if (!win.isDestroyed() && win.webContents) {' + $le +
          '        win.webContents.send("main:mempressure", { level: "warn", rssMB });' + $le +
          '      }' + $le +
          '    }' + $le +
          '  }' + $le +
          '}, MEM_SAMPLE_INTERVAL_MS);' + $le +
          'memSampler.unref?.();'

$idx = $content.IndexOf($marker)
if ($idx -lt 0) { Write-Host "miss"; exit 1 }
$content = $content.Substring(0, $idx) + $insert + $content.Substring($idx + $marker.Length)
[System.IO.File]::WriteAllText($f, $content)
Write-Host "Memory sampler added"
