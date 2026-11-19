$src = Get-Content $args[0] -Encoding UTF8
$stack = New-Object System.Collections.Stack
$pairs = @{ ')' = '('; ']' = '['; '}' = '{' }
$inStr = $false; $strCh = ''; $esc = $false
for ($ln = 0; $ln -lt $src.Count; $ln++) {
  $line = $src[$ln]
  for ($i = 0; $i -lt $line.Length; $i++) {
    $c = $line[$i]
    if ($inStr) {
      if ($esc) { $esc = $false; continue }
      if ($c -eq '\') { $esc = $true; continue }
      if ($c -eq $strCh) { $inStr = $false }
      continue
    }
    if ($c -eq "'" -or $c -eq '"') { $inStr = $true; $strCh = $c; continue }
    if ($c -eq '/' -and $i -lt $line.Length - 1 -and $line[$i+1] -eq '/') { break }
    if ($c -eq '(' -or $c -eq '[' -or $c -eq '{') { $stack.Push(@($c, $ln + 1, $i + 1)); continue }
    if ($pairs.ContainsKey($c)) {
      if ($stack.Count -eq 0) { Write-Output ("MISMATCH extra " + $c + " at line " + ($ln+1) + " col " + ($i+1)); exit 1 }
      $top = $stack.Pop()
      if ($pairs[$c] -ne $top[0]) { Write-Output ("MISMATCH " + $c + " at line " + ($ln+1) + ": expected " + $top[0] + " from line " + $top[1]); exit 1 }
    }
  }
}
if ($stack.Count -gt 0) {
  Write-Output "UNCLOSED:"
  foreach ($s in $stack) { Write-Output ("  " + $s[0] + " from line " + $s[1] + " col " + $s[2]) }
} else { Write-Output "balanced" }
