#Requires -Version 7.2
# E1 self-test of the delegation layer. No Codex call, no network; creates only temp files.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'CodexTask.psm1') -Force
$schema = Join-Path (Split-Path $PSScriptRoot -Parent) 'templates\report.schema.json'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ct-selftest-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory $tmp | Out-Null
$results = [System.Collections.Generic.List[object]]::new()
function Check([string]$Name, [bool]$Ok, [string]$Detail = '') { $results.Add([pscustomobject]@{ Test = $Name; Result = $(if ($Ok) { 'PASS' } else { 'FAIL' }); Detail = $Detail }) }
try {
  # glob matching and input rules
  Check 'glob: exact file' (Test-CtGlob 'map05/tests/locations.test.mjs' @('map05/tests/locations.test.mjs'))
  Check 'glob: ** matches nested' (Test-CtGlob 'map05/data/x/y.json' @('map05/data/**'))
  Check 'glob: **/*.csv matches root file' (Test-CtGlob 'a.csv' @('**/*.csv'))
  Check 'glob: * does not cross /' (-not (Test-CtGlob 'map05/tests/sub/a.mjs' @('map05/tests/*.mjs')))
  Check 'glob: planner protected' (Test-CtGlob 'map05/planner-offline.html' (Get-CtDefaultProtect))
  Check 'glob: skill/hook config protected' ((Test-CtGlob '.claude/skills/codex-delegate/scripts/Invoke-CodexTask.ps1' (Get-CtDefaultProtect)) -and (Test-CtGlob '.codex/config.toml' (Get-CtDefaultProtect)))
  Check 'exit code: unknown name fails closed (31)' ((Get-CtExitCode 'NO_SUCH_CODE') -eq 31)
  Check 'allowlist: whole-repo and escaping entries rejected' ([bool](Test-CtAllowEntry '**') -and [bool](Test-CtAllowEntry '**/*') -and [bool](Test-CtAllowEntry '../x.mjs') -and [bool](Test-CtAllowEntry '/etc/x') -and [bool](Test-CtAllowEntry 'C:/x'))
  Check 'allowlist: narrow entry accepted' ($null -eq (Test-CtAllowEntry 'map05/tests/locations.test.mjs'))

  # schema validator
  $good = [ordered]@{ task_id='T0'; round=1; status='completed'; summary='s'; files_changed=@('a'); commands_run=@([ordered]@{command='x';exit_code=0;result='ok'}); acceptance=@([ordered]@{criterion='c';met=$true;evidence='e'}); sandbox_probes=@(); open_issues=@() }
  $gp = Join-Path $tmp 'good.json'; $good | ConvertTo-Json -Depth 10 | Set-Content $gp -Encoding utf8
  $r = Test-CtReportFile $gp $schema; Check 'schema: valid report accepted' $r.valid ($r.errors -join '; ')
  $bad = [ordered]@{ task_id='T0'; round='1'; status='done'; summary='s'; files_changed=@(); commands_run=@(); acceptance=@(); sandbox_probes=@(); extra=1 }
  $bp = Join-Path $tmp 'bad.json'; $bad | ConvertTo-Json -Depth 10 | Set-Content $bp -Encoding utf8
  $r = Test-CtReportFile $bp $schema
  Check 'schema: invalid report rejected (4 errors expected)' ((-not $r.valid) -and $r.errors.Count -eq 4) ($r.errors -join '; ')
  $np = Join-Path $tmp 'notjson.json'; 'Done! all good' | Set-Content $np
  Check 'schema: non-JSON rejected' (-not (Test-CtReportFile $np $schema).valid)
  Check 'schema: missing file rejected' (-not (Test-CtReportFile (Join-Path $tmp 'none.json') $schema).valid)
  Check 'schema: report for another task/round rejected' ((-not (Test-CtReportFile $gp $schema 'T9' 1).valid) -and (-not (Test-CtReportFile $gp $schema 'T0' 2).valid) -and (Test-CtReportFile $gp $schema 'T0' 1).valid)
  $cp = Join-Path $tmp 'case.json'; $c2 = [ordered]@{}; foreach ($k in $good.Keys) { $c2[$k] = $good[$k] }; $c2.status = 'Completed'
  $c2 | ConvertTo-Json -Depth 10 | Set-Content $cp -Encoding utf8
  Check 'schema: enum is case-sensitive' (-not (Test-CtReportFile $cp $schema).valid)

  # manifest + violation detection on a scratch git repo
  $g = Join-Path $tmp 'repo'; New-Item -ItemType Directory $g | Out-Null
  & git -C $g init -q; 'a' | Set-Content "$g\allowed.txt"; 'p' | Set-Content "$g\protected.csv"; 'r' | Set-Content "$g\AGENTS.md"; 'd' | Set-Content "$g\deleteme.txt"
  & git -C $g -c user.name=selftest -c user.email=selftest@localhost add -A; & git -C $g -c user.name=selftest -c user.email=selftest@localhost commit -qm base
  New-Item -ItemType Junction -Path "$g\oldjn" -Target $tmp | Out-Null
  $m0 = Get-CtManifest $g
  Write-CtJson "$tmp\m0.json" $m0; $m0 = Read-CtJson "$tmp\m0.json"     # round-trip through JSON, as between rounds
  'b' | Set-Content "$g\allowed.txt"; 'q' | Set-Content "$g\protected.csv"; 'n' | Set-Content "$g\new-untracked.tmp"
  [IO.File]::Move("$g\AGENTS.md", "$g\agents.md"); Remove-Item "$g\deleteme.txt"; Remove-Item "$g\oldjn" -Force
  New-Item -ItemType Junction -Path "$g\jn" -Target $tmp | Out-Null
  $m1 = Get-CtManifest $g
  $v = Get-CtViolations (Compare-CtManifest $m0 $m1) @('allowed.txt') @('**/*.csv')
  Check 'scope: allowlisted change not flagged' (-not ($v -match 'allowed.txt'))
  Check 'scope: protected change flagged' ([bool]($v -match 'PROTECTED_CHANGED: protected.csv'))
  Check 'scope: untracked file outside allowlist flagged' ([bool]($v -match 'OUTSIDE_ALLOWLIST: new-untracked.tmp'))
  Check 'scope: new junction flagged' ([bool]($v -match 'NEW_LINK_OR_REPARSE_POINT: jn'))
  Check 'scope: removed junction flagged' ([bool]($v -match 'LINK_REMOVED: oldjn'))
  Check 'scope: case-only rename (AGENTS.md -> agents.md) flagged' (([bool]($v -cmatch 'OUTSIDE_ALLOWLIST: AGENTS\.md$')) -and ([bool]($v -cmatch 'OUTSIDE_ALLOWLIST: agents\.md$'))) ($v -join '; ')
  Check 'scope: deleted file flagged' ([bool]($v -match 'OUTSIDE_ALLOWLIST: deleteme.txt'))
  Remove-Item "$g\jn" -Force
  & git -C $g -c user.name=selftest -c user.email=selftest@localhost commit -qam second
  $v2 = Get-CtViolations (Compare-CtManifest $m1 (Get-CtManifest $g)) @('**') @()
  Check 'scope: commit (HEAD moved) flagged' ([bool]($v2 -match 'HEAD_MOVED'))

  # timeout + process-tree kill
  $pw = (Get-Command pwsh).Source
  $res = Invoke-CtProcess -FilePath $pw -ArgumentList @('-NoProfile','-Command','Start-Process ping.exe -ArgumentList ''-t'',''127.0.0.1'' -NoNewWindow; Start-Sleep 120') -WorkingDirectory $tmp -StdinText '' -StdoutPath "$tmp\o.txt" -StderrPath "$tmp\e.txt" -TimeoutSec 4
  Start-Sleep 1
  $leftPing = @(Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" | Where-Object { $_.CommandLine -match '-t\s+127\.0\.0\.1' })
  Check 'process: timeout detected' $res.timedOut "seconds=$($res.seconds)"
  Check 'process: no survivors in tree after kill' (($res.survivorsAfterKill.Count -eq 0) -and ($leftPing.Count -eq 0)) "survivors=$($res.survivorsAfterKill -join ',') ping=$($leftPing.Count) jobAssigned=$($res.jobAssigned)"

  # orphan left behind after a NORMAL exit is detected and killed (job object / parent chain)
  $res3 = Invoke-CtProcess -FilePath $pw -ArgumentList @('-NoProfile','-Command','Start-Process ping.exe -ArgumentList ''-n'',''300'',''127.0.0.2'' -NoNewWindow; exit 0') -WorkingDirectory $tmp -StdinText '' -StdoutPath "$tmp\o3.txt" -StderrPath "$tmp\e3.txt" -TimeoutSec 60
  Start-Sleep 1
  $leftPing3 = @(Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" | Where-Object { $_.CommandLine -match '127\.0\.0\.2' })
  Check 'process: orphan after normal exit reported' ($res3.survivorsAfterExit.Count -gt 0) "survivors=$($res3.survivorsAfterExit -join ',') jobAssigned=$($res3.jobAssigned) jobActive=$($res3.jobActiveAfterExit)"
  Check 'process: orphan after normal exit killed' ($leftPing3.Count -eq 0) "ping alive=$($leftPing3.Count)"
  $res4 = Invoke-CtProcess -FilePath $pw -ArgumentList @('-NoProfile','-Command','exit 0') -WorkingDirectory $tmp -StdinText '' -StdoutPath "$tmp\o4.txt" -StderrPath "$tmp\e4.txt" -TimeoutSec 60
  Check 'process: clean exit has no survivors' ($res4.survivorsAfterExit.Count -eq 0 -and $res4.exitCode -eq 0) "survivors=$($res4.survivorsAfterExit -join ',')"

  # logs are never overwritten
  $overwrote = $true; try { [void](Invoke-CtProcess -FilePath $pw -ArgumentList @('-NoProfile','-Command','exit 0') -WorkingDirectory $tmp -StdinText '' -StdoutPath "$tmp\o3.txt" -StderrPath "$tmp\e3b.txt" -TimeoutSec 30) } catch { $overwrote = $false }
  Check 'logs: existing stdout log is not overwritten' (-not $overwrote)

  # environment allowlist
  $env:CT_SELFTEST_SECRET = 'x'; $env:GITHUB_TOKEN_SELFTEST = 'y'
  $res2 = Invoke-CtProcess -FilePath $pw -ArgumentList @('-NoProfile','-Command','(Get-ChildItem env: | Select-Object -Expand Name) -join ","') -WorkingDirectory $tmp -StdinText '' -StdoutPath "$tmp\o2.txt" -StderrPath "$tmp\e2.txt" -TimeoutSec 60
  $names = (Get-Content "$tmp\o2.txt" -Raw)
  Check 'env: secrets not passed to child' (($names -notmatch 'CT_SELFTEST_SECRET') -and ($names -notmatch 'GITHUB_TOKEN')) "child saw: $($res2.envNamesPassed.Count) names"
  Remove-Item env:CT_SELFTEST_SECRET, env:GITHUB_TOKEN_SELFTEST
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
$results | Format-Table -AutoSize -Wrap
$fail = @($results | Where-Object Result -eq 'FAIL').Count
"SELFTEST: $($results.Count - $fail)/$($results.Count) PASS"
exit [int]($fail -gt 0)
