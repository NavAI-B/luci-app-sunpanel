$f = Join-Path $PSScriptRoot "..\htdocs\luci-static\resources\view\sunpanel.js"
node --check $f
if ($LASTEXITCODE -eq 0) { Write-Output "JS OK" } else { Write-Output "JS FAIL (exit $LASTEXITCODE)" }
