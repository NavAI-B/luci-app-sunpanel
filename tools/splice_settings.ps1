$main = Join-Path $PSScriptRoot "..\luci-app-sunpanel\htdocs\luci-static\resources\view\sunpanel.js"
$frag = Join-Path $PSScriptRoot "settings_block.fragment"
$L = Get-Content $main -Encoding UTF8
$F = Get-Content $frag -Encoding UTF8
# replace source lines 158..207 (1-based) = indices 157..206 with the fragment
$new = $L[0..156] + $F + $L[207..($L.Count - 1)]
Set-Content -Path $main -Value $new -Encoding UTF8
Write-Output ("spliced; new total lines: " + $new.Count)
