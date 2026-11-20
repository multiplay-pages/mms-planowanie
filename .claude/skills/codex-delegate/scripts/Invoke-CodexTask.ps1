#Requires -Version 7.2
<#
.SYNOPSIS
  Single entry point for delegating one bounded task to Codex CLI (see ../SKILL.md).
  Always run it from the main checkout's copy of the skill, never from a Codex or QA worktree.

.DESCRIPTION
  Actions:
    Bootstrap  -Spec <task.json>   create/reuse the task worktree from a verified base SHA, optional asset prep, baseline manifest
    Round      -TaskId -Round N    one Codex round (N=1..3) in that worktree; rounds 2-3 need -Review <review.md>
    Qa         -TaskId             freeze the Codex worktree and build a separate QA worktree (+ copied node_modules) for Claude's tests
    Unhalt     -TaskId -Reason     explicit, logged coordinator decision after a liftable halt
    Status     -TaskId             print state
  Fail-closed: any scope violation, invalid report, inconsistent state, surviving process or held lock stops the loop.
  Never commits, pushes, merges, calls gh, or passes tokens to Codex.

.EXITCODES
  0 OK | 10 Codex error | 11 timeout | 12 interrupted | 13 Codex reported blocked/partial | 20 scope violation | 21 invalid last.json
  30 round limit | 31 inconsistent state / lock / surviving processes | 32 bad input
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Bootstrap','Round','Qa','Unhalt','Status')][string]$Action,
  [string]$Reason,
  [switch]$AcceptPartial,
  [string]$Spec,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{1,40}$')][string]$TaskId,
  [int]$Round,
  [string]$Review,
  [switch]$Retry,
  [switch]$UseResume,
  [switch]$WhatIf,
  [string]$WorkRoot = (Join-Path $env:USERPROFILE 'work'),
  [string]$NodeModulesFrom,
  # Per-round override of the Codex model / reasoning effort (defaults come from task.json -> state.json).
  [ValidatePattern('^[A-Za-z0-9._:-]{1,64}$')][string]$Model,
  [ValidateSet('minimal','low','medium','high','xhigh')][string]$Effort
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'CodexTask.psm1') -Force
$SkillDir = Split-Path $PSScriptRoot -Parent
$SchemaPath = Join-Path $SkillDir 'templates\report.schema.json'
$WorkRoot = [IO.Path]::GetFullPath($WorkRoot).TrimEnd('\')
$RunsRoot = Join-Path $WorkRoot 'codex-runs'
$Pat = Get-CtPatterns
$Limits = Get-CtLimits
# Halts the coordinator may lift with Unhalt after verifying the cause. Scope/integrity halts are final.
$LiftableHalts = @('INVALID_REPORT','REPORTED_INCOMPLETE','PROCESS_SURVIVORS')

$script:LockStream = $null; $script:LockPath = $null
function Exit-Lock { if ($script:LockStream) { $script:LockStream.Dispose(); $script:LockStream = $null; Remove-Item -LiteralPath $script:LockPath -Force -ErrorAction SilentlyContinue } }
function Stop-Ct([string]$Code, [string]$Message) { Exit-Lock; Write-Host "[$Code] $Message"; exit (Get-CtExitCode $Code) }
function Enter-Lock([string]$StateDir) {
  $script:LockPath = Join-Path $StateDir 'lock'
  try { $script:LockStream = [System.IO.File]::Open($script:LockPath, 'CreateNew', 'Write', 'None') }
  catch { $script:LockStream = $null; Stop-Ct BAD_STATE "lock held ($script:LockPath); another run is active or a crash left it - check the PID/time inside, then delete it manually" }
  $b = [Text.Encoding]::UTF8.GetBytes("pid=$PID action=$Action at=$((Get-Date).ToString('o'))"); $script:LockStream.Write($b, 0, $b.Length); $script:LockStream.Flush()
}
function Get-StateDir([string]$Id) { Join-Path $RunsRoot $Id }
function Test-Under([string]$Path, [string]$Root) { $p = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'; $r = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'; return $p.StartsWith($r, [StringComparison]::OrdinalIgnoreCase) }
function Set-Halt($St, [string]$Kind, [string]$Text) { $St.halted = $true; $St['haltKind'] = $Kind; $St.haltReason = $Text }
function Test-Liftable($St) {
  if ($St.Contains('haltKind') -and $St['haltKind']) { return ($St['haltKind'] -in $LiftableHalts) }
  return ($St.haltReason -notmatch 'scope violation|worktree changed')   # state written before haltKind existed
}
function Test-TaskSettings([string]$M, [string]$E, $T, [string]$Mode) {
  if ($M -notmatch $Pat.model) { return "model '$M' does not match $($Pat.model)" }
  if ($E -notin (Get-CtEfforts)) { return "effort '$E' not in $((Get-CtEfforts) -join '|')" }
  if (-not ($T -is [int] -or $T -is [long]) -or $T -lt 1 -or $T -gt 240) { return "timeoutMin must be an integer 1..240" }
  if ($Mode -notin 'write','review') { return "mode must be write|review" }
  return $null
}

$Preamble = @'
You are the executor in a Claude Code (coordinator/reviewer) + Codex CLI workflow.
Hard rules for this run:
- Work only inside the current working directory (a dedicated git worktree). Do not write anywhere else, except where the task contract below explicitly asks for a sandbox probe.
- Change only the files listed in the contract allowlist. Do not create other files (no scratch files, no logs) inside the worktree. Use the TEMP directory for scratch files.
- Do not run git commit, git push, git stash, git checkout/switch, git reset, or any network command. Do not install packages. Do not leave background processes running.
- Do not read or print credentials, tokens, auth files or environment variable values.
- Follow AGENTS.md in the repository if present.
- Your final message must be a single JSON object matching the provided output schema. Report only commands you actually ran, with their real exit codes. Anything you could not do goes into open_issues; set status accordingly.
'@

switch ($Action) {
  # ------------------------------------------------------------------ BOOTSTRAP
  'Bootstrap' {
    if (-not $Spec -or -not (Test-Path -LiteralPath $Spec)) { Stop-Ct BAD_INPUT "Spec file required: $Spec" }
    try { $s = Read-CtJson $Spec } catch { Stop-Ct BAD_INPUT "spec is not valid JSON: $(Format-CtUntrusted $_.Exception.Message 200)" }
    if ($s -isnot [System.Collections.IDictionary]) { Stop-Ct BAD_INPUT 'spec must be a JSON object' }
    foreach ($k in 'taskId','slug','repo','base','brief','allow') { if (-not $s.Contains($k) -or -not $s[$k]) { Stop-Ct BAD_INPUT "spec missing '$k'" } }
    $id = $s.taskId
    if ($id -notmatch $Pat.taskId -or $s.slug -cnotmatch $Pat.slug) { Stop-Ct BAD_INPUT 'bad taskId/slug' }
    if ($s.base -cnotmatch '^[0-9a-f]{40}$') { Stop-Ct BAD_INPUT 'base must be a full 40-hex SHA (lowercase)' }
    $repo = (Resolve-Path -LiteralPath $s.repo).Path.TrimEnd('\')
    $top = (& git -C $repo rev-parse --show-toplevel 2>$null); if ($LASTEXITCODE -or [IO.Path]::GetFullPath($top) -ne [IO.Path]::GetFullPath($repo)) { Stop-Ct BAD_INPUT "repo must be a git top-level directory: $repo" }
    # The brief is sent to OpenAI: it must be the contract prepared under codex-runs, not an arbitrary file.
    $briefPath = (Resolve-Path -LiteralPath $s.brief).Path
    if (-not (Test-Under $briefPath $RunsRoot) -or (Test-Under $briefPath $repo)) { Stop-Ct BAD_INPUT "brief must live under $RunsRoot (e.g. $RunsRoot\$id-input\TASK.md), outside the repository" }
    $specModel = $s['model'] ?? 'gpt-6.2-sol'; $specEffort = $s['effort'] ?? 'high'; $timeoutMin = $s['timeoutMin'] ?? 30; $mode = $s['mode'] ?? 'write'
    $bad = Test-TaskSettings $specModel $specEffort $timeoutMin $mode; if ($bad) { Stop-Ct BAD_INPUT $bad }
    $defaultProtectOff = ($s['useDefaultProtect'] -eq $false)
    $protect = @($s['protect']) + @(if (-not $defaultProtectOff) { Get-CtDefaultProtect }) | Where-Object { $_ } | Select-Object -Unique
    foreach ($a in $s.allow) {
      $why = Test-CtAllowEntry $a; if ($why) { Stop-Ct BAD_INPUT "allowlist entry '$a': $why" }
      if (Test-CtGlob $a $protect) { Stop-Ct BAD_INPUT "allowlist entry '$a' is protected" }
    }
    & git -C $repo cat-file -e "$($s.base)^{commit}" 2>$null; if ($LASTEXITCODE) { Stop-Ct BAD_INPUT "base $($s.base) not in repo" }
    $wtName = $s['worktreeName'] ?? "mms-codex-$id"
    if ($wtName -notmatch $Pat.worktreeName -or $wtName -match '\.\.') { Stop-Ct BAD_INPUT "worktreeName '$wtName' must match $($Pat.worktreeName) (a plain folder name)" }
    $wt = [IO.Path]::GetFullPath((Join-Path $WorkRoot $wtName))
    if (-not (Test-Under $wt $WorkRoot) -or (Test-Under $wt $repo) -or (Test-Under $wt $RunsRoot) -or (Test-Under $repo $wt)) { Stop-Ct BAD_INPUT "worktree path $wt must be directly under $WorkRoot and outside the repository and $RunsRoot" }
    $branch = "codex/$id-$($s.slug)"
    $stateDir = Get-StateDir $id; $statePath = Join-Path $stateDir 'state.json'
    $branchExists = [bool](& git -C $repo rev-parse --verify --quiet "refs/heads/$branch")
    $plan = @("git -C `"$repo`" worktree add -b $branch `"$wt`" $($s.base)")
    if ($s['needsAssets']) { $plan += "python -X utf8 map05/prepare_assets.py  (cwd $wt)" }
    $plan += "manifest -> $stateDir\manifest-baseline.json"
    $plan += "model: $specModel / effort: $specEffort / timeoutMin: $timeoutMin / mode: $mode"
    if ($defaultProtectOff) { $plan += 'WARNING: useDefaultProtect=false - default MMS protections are OFF for this task' }
    if ($WhatIf) { Write-Host "WHATIF Bootstrap $id"; $plan | ForEach-Object { Write-Host "  $_" }; exit 0 }

    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    Enter-Lock $stateDir
    if (Test-Path -LiteralPath $statePath) {
      $st = Read-CtJson $statePath
      $headNow = (& git -C $st.worktree rev-parse HEAD 2>$null)
      $same = ($st.repo -eq $repo -and $st.base -eq $s.base -and $st.branch -eq $branch -and $st.worktree -eq $wt -and $headNow -eq $s.base -and
        (@($st.allow) -join '|') -ceq (@($s.allow) -join '|') -and (@($st.protect) -join '|') -ceq (@($protect) -join '|') -and
        $st.model -eq $specModel -and $st.effort -eq $specEffort -and $st.timeoutMin -eq $timeoutMin -and $st.mode -eq $mode)
      if (-not $same) { Stop-Ct BAD_STATE "existing state for $id does not match spec/worktree (fail-closed; a changed allow/protect/model needs a new task id); inspect $statePath" }
      Exit-Lock; Write-Host "Bootstrap already done for $id (reused, nothing created). nextRound=$($st.nextRound)"; exit 0
    }
    if ((Test-Path -LiteralPath $wt) -or $branchExists) { Stop-Ct BAD_STATE "worktree path or branch already exists without state: $wt / $branch (fail-closed)" }
    & git -C $repo worktree add -b $branch $wt $s.base 2>&1 | Write-Host
    if ($LASTEXITCODE) { Stop-Ct BAD_STATE 'git worktree add failed' }
    if ($s['needsAssets']) {
      Push-Location $wt; try { & python -X utf8 map05/prepare_assets.py 2>&1 | Write-Host } finally { Pop-Location }
      if ($LASTEXITCODE) { Stop-Ct BAD_STATE 'prepare_assets.py failed' }
    }
    Copy-Item -LiteralPath $briefPath -Destination (Join-Path $stateDir 'brief.md')
    Copy-Item -LiteralPath $Spec -Destination (Join-Path $stateDir 'spec.json')
    $m = Get-CtManifest $wt
    Write-CtJson (Join-Path $stateDir 'manifest-baseline.json') $m
    Write-CtJson (Join-Path $stateDir 'manifest-current.json') $m
    $state = [ordered]@{
      taskId = $id; repo = $repo; base = $s.base; branch = $branch; worktree = $wt
      allow = @($s.allow); protect = @($protect); defaultProtectDisabled = $defaultProtectOff
      model = $specModel; effort = $specEffort; timeoutMin = [int]$timeoutMin; mode = $mode
      briefSha256 = (Get-FileHash (Join-Path $stateDir 'brief.md') -Algorithm SHA256).Hash
      nextRound = 1; halted = $false; haltKind = $null; haltReason = $null; frozen = $false; rounds = @(); decisions = @()
      createdAt = (Get-Date).ToString('o'); assetsPrepared = [bool]$s['needsAssets']
    }
    Write-CtJson $statePath $state
    Exit-Lock
    Write-Host "Bootstrap OK: $wt on $branch @ $($s.base); files in baseline manifest: $($m.files.Count); links: $($m.links.Count)"
    exit 0
  }

  # ------------------------------------------------------------------ ROUND
  'Round' {
    if (-not $TaskId -or $Round -lt 1) { Stop-Ct BAD_INPUT '-TaskId and -Round are required' }
    if ($Round -gt $Limits.maxRounds) { Stop-Ct ROUND_LIMIT "round $Round exceeds limit (1 initial + 2 fix rounds)" }
    $stateDir = Get-StateDir $TaskId; $statePath = Join-Path $stateDir 'state.json'
    if (-not (Test-Path -LiteralPath $statePath)) { Stop-Ct BAD_STATE "no state for $TaskId; run Bootstrap first" }
    if (-not $WhatIf) { Enter-Lock $stateDir }            # everything below runs under the task lock
    $st = Read-CtJson $statePath
    if (-not $st.Contains('decisions')) { $st['decisions'] = @() }
    # A RUNNING entry without a live lock means the previous run died (Ctrl+C, closed console, crash).
    $stale = @($st.rounds | Where-Object { $_.outcome -eq 'RUNNING' })
    if ($stale.Count -and -not $WhatIf) {
      foreach ($r in $stale) { $r.outcome = 'INTERRUPTED'; $r['note'] = 'previous run ended without recording an outcome (detected on next invocation)' }
      Write-CtJson $statePath $st
    }
    if ($st.halted) { Stop-Ct BAD_STATE "task halted ($($st['haltKind'])): $($st.haltReason). Manual decision required." }
    if ($st.frozen) { Stop-Ct BAD_STATE 'task frozen for QA; no more Codex rounds' }
    $last = if (@($st.rounds).Count) { @($st.rounds)[-1] } else { $null }
    $failed = @('TIMEOUT','INTERRUPTED','CODEX_ERROR')
    if ($Retry) {
      if (-not $last -or $last.round -ne $Round -or $last.outcome -notin $failed) { Stop-Ct BAD_STATE "-Retry only for the last round after TIMEOUT/INTERRUPTED/CODEX_ERROR" }
    } else {
      if ($Round -ne $st.nextRound) { Stop-Ct BAD_STATE "expected round $($st.nextRound), got $Round" }
      if ($last -and $last.round -eq $Round -and $last.outcome -in $failed) { Stop-Ct BAD_INPUT "round $Round ended with $($last.outcome); re-run it explicitly with -Retry" }
    }
    if ($Round -ge 2 -and (-not $Review -or -not (Test-Path -LiteralPath $Review))) { Stop-Ct BAD_INPUT 'rounds 2-3 require -Review <review.md> from Claude' }
    if ((Get-FileHash (Join-Path $stateDir 'brief.md') -Algorithm SHA256).Hash -ne $st.briefSha256) { Stop-Ct BAD_STATE 'stored brief was modified' }
    $attempt = 1 + @($st.rounds | Where-Object { $_.round -eq $Round }).Count
    if ($attempt -gt $Limits.maxAttempts) { Stop-Ct ROUND_LIMIT "round $Round already has $($attempt - 1) attempts (max $($Limits.maxAttempts)); decide manually" }
    $rdir = Join-Path $stateDir ("round$Round" + $(if ($attempt -gt 1) { "-attempt$attempt" } else { '' }))
    if (Test-Path -LiteralPath $rdir) { Stop-Ct BAD_STATE "log directory already exists: $rdir (logs are never overwritten; inspect state.json)" }
    $tmpDir = Join-Path $RunsRoot ("$TaskId-tmp\round$Round-a$attempt")   # sibling of the state folder: Codex never writes next to state.json
    if ($tmpDir.Contains("'")) { Stop-Ct BAD_INPUT 'state path must not contain a single quote' }
    $sandbox = if ($st.mode -eq 'review') { 'read-only' } else { 'workspace-write' }
    $useModel = if ($Model) { $Model } else { $st.model }
    $useEffort = if ($Effort) { $Effort } else { $st.effort }
    $bad = Test-TaskSettings $useModel $useEffort $st.timeoutMin $st.mode; if ($bad) { Stop-Ct BAD_STATE "state.json: $bad" }
    # --ignore-user-config drops [windows] sandbox from config.toml; without it Codex 0.170 rejects every command
    # ("blocked by policy", verified in SYN1). The system TEMP and /tmp roots are excluded from the writable set;
    # TEMP/TMP point to a per-round folder outside the repository that is the only extra writable root.
    $common = @('--ignore-user-config','-c','windows.sandbox="unelevated"','-m',$useModel,'-c',"model_reasoning_effort=`"$useEffort`"",
      '-c','sandbox_workspace_write.network_access=false','-c','shell_environment_policy.inherit="core"',
      '-c','sandbox_workspace_write.exclude_tmpdir_env_var=true','-c','sandbox_workspace_write.exclude_slash_tmp=true',
      '-c',"sandbox_workspace_write.writable_roots=['$tmpDir']",
      '--json','-o',(Join-Path $rdir 'last.json'),'--output-schema',$SchemaPath)   # no --color: `exec resume` rejects it (0.170)
    $resumeId = $null
    if ($UseResume) {
      $withThread = @($st.rounds | Where-Object { $_.Contains('threadId') -and $_['threadId'] })
      if ($withThread.Count) { $resumeId = "$($withThread[-1]['threadId'])" }
      if (-not $resumeId -or $resumeId -notmatch $Pat.threadId) { Stop-Ct BAD_STATE "no valid thread id to resume ($resumeId)" }
      $codexArgs = @('exec','resume',$resumeId) + $common + @('-c',"sandbox_mode=`"$sandbox`"",'-')
    } else {
      $codexArgs = @('exec','-C',$st.worktree,'-s',$sandbox) + $common + @('-')
    }
    if ($WhatIf) { Write-Host "WHATIF Round $Round (attempt $attempt) of $TaskId"; Write-Host "  cwd: $($st.worktree)"; Write-Host "  model: $useModel / effort: $useEffort"; Write-Host "  TEMP/TMP: $tmpDir"; Write-Host "  codex $($codexArgs -join ' ')"; Write-Host "  logs: $rdir"; exit 0 }

    $outcome = 'INTERRUPTED'; $exitName = 'INTERRUPTED'
    $entry = [ordered]@{ round = $Round; attempt = $attempt; outcome = 'RUNNING'; model = $useModel; effort = $useEffort; threadId = $null; dir = $rdir; at = (Get-Date).ToString('o'); pid = $PID }
    $entryAdded = $false   # $entry is the same object as the last element of $st.rounds once added; updating it updates state
    try {
      # integrity between rounds: worktree must match the manifest recorded after the previous round
      $expected = Read-CtJson (Join-Path $stateDir 'manifest-current.json')
      $pre = Get-CtManifest $st.worktree
      $between = Compare-CtManifest $expected $pre
      if (Test-CtAnyChange $between) {
        $list = @($between.added + $between.removed + $between.modified + $between.newLinks + $between.removedLinks + $between.changedLinks) -join ', '
        Set-Halt $st 'INTEGRITY' "worktree changed outside a Codex round: $list (head=$($between.headChanged) branch=$($between.branchChanged) stash=$($between.stashChanged))"
        Write-CtJson $statePath $st; $exitName = 'BAD_STATE'; $outcome = 'BAD_STATE'; throw 'halt'
      }
      New-Item -ItemType Directory -Path $rdir | Out-Null
      New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
      $st.rounds = @($st.rounds) + @($entry); $entryAdded = $true; Write-CtJson $statePath $st     # RUNNING marker survives a hard stop
      $prompt = $Preamble + "`n`n# Task contract ($TaskId, round $Round of max 3)`n`n" + (Get-Content (Join-Path $stateDir 'brief.md') -Raw -Encoding utf8)
      if ($Round -ge 2) {
        $prompt += "`n`n# Review of the previous round by Claude (address every P1/P2 finding)`n`n" + (Get-Content -LiteralPath $Review -Raw -Encoding utf8)
        Copy-Item -LiteralPath $Review -Destination (Join-Path $rdir 'review-input.md')
      }
      $prompt += "`n`nRound number for the report: $Round. Task id: $TaskId."
      Set-Content -LiteralPath (Join-Path $rdir 'prompt.md') -Value $prompt -Encoding utf8
      $launcher = Resolve-CtCodexLauncher
      $res = Invoke-CtProcess -FilePath $launcher.file -ArgumentList (@($launcher.prefix) + $codexArgs) -WorkingDirectory $st.worktree `
        -StdinText $prompt -StdoutPath (Join-Path $rdir 'events.jsonl') -StderrPath (Join-Path $rdir 'stderr.txt') -TimeoutSec (60 * $st.timeoutMin) `
        -ExtraEnv @{ TEMP = $tmpDir; TMP = $tmpDir }
      $ev = Get-CtEventSummary (Join-Path $rdir 'events.jsonl')
      $post = Get-CtManifest $st.worktree
      $roundDiff = Compare-CtManifest $pre $post
      $baseline = Read-CtJson (Join-Path $stateDir 'manifest-baseline.json')
      $cumDiff = Compare-CtManifest $baseline $post
      $viol = Get-CtViolations $roundDiff $st.allow $st.protect
      $rep = Test-CtReportFile (Join-Path $rdir 'last.json') $SchemaPath $TaskId $Round
      $claimed = if ($rep.valid) { @($rep.report.files_changed | ForEach-Object { $_.Replace('\','/') }) } else { @() }
      $actualRound = @($roundDiff.added + $roundDiff.modified + $roundDiff.removed)
      $claimMismatch = [ordered]@{ claimedNotChanged = @($claimed | Where-Object { $_ -cnotin $actualRound }); changedNotClaimed = @($actualRound | Where-Object { $_ -cnotin $claimed }) }
      & git -C $st.worktree status --porcelain=v1 --ignored -uall 2>&1 | Set-Content (Join-Path $rdir 'status.txt') -Encoding utf8
      # Byte-exact patch (git writes the file itself): tracked changes vs base + new allowlisted files.
      $patchPath = Join-Path $rdir 'diff.patch'
      & git -C $st.worktree diff --binary "--output=$patchPath" $st.base 2>$null
      foreach ($f in $cumDiff.added) {
        if (Test-CtGlob $f $st.allow) {
          $part = Join-Path $rdir 'diff-added.tmp'
          & git -C $st.worktree diff --no-index --binary "--output=$part" -- /dev/null $f 2>$null
          if (Test-Path -LiteralPath $part) { $fs = [IO.File]::Open($patchPath, 'Append'); try { $b = [IO.File]::ReadAllBytes($part); $fs.Write($b, 0, $b.Length) } finally { $fs.Dispose() }; Remove-Item -LiteralPath $part -Force }
        }
      }
      Write-CtJson (Join-Path $rdir 'manifest-after.json') $post
      $survivors = @(@($res.survivorsAfterKill) + @($res.survivorsAfterExit) | Where-Object { $_ })

      if ($viol.Count) { $outcome = 'SCOPE_VIOLATION'; $exitName = 'SCOPE_VIOLATION'; Set-Halt $st 'SCOPE_VIOLATION' "scope violation round ${Round}: $($viol -join '; ')" }
      elseif ($survivors.Count) { $outcome = 'PROCESS_SURVIVORS'; $exitName = 'BAD_STATE'; Set-Halt $st 'PROCESS_SURVIVORS' "processes outlived Codex in round ${Round} (terminated): $($survivors -join ', ')" }
      elseif ($res.timedOut) { $outcome = 'TIMEOUT'; $exitName = 'TIMEOUT' }
      elseif ($res.exitCode -ne 0) { $outcome = 'CODEX_ERROR'; $exitName = 'CODEX_ERROR' }
      elseif (-not $rep.valid) { $outcome = 'INVALID_REPORT'; $exitName = 'INVALID_REPORT'; Set-Halt $st 'INVALID_REPORT' "invalid last.json round ${Round}: $($rep.errors -join '; ')" }
      elseif ($rep.report.status -cne 'completed') { $outcome = 'REPORTED_INCOMPLETE'; $exitName = 'REPORTED_INCOMPLETE'; Set-Halt $st 'REPORTED_INCOMPLETE' "Codex reported status '$($rep.report.status)' in round ${Round}: $(Format-CtUntrusted $rep.report.summary)" }
      else { $outcome = 'COMPLETED'; $exitName = 'OK' }

      $checks = [ordered]@{
        taskId = $TaskId; round = $Round; attempt = $attempt; outcome = $outcome; usedResume = [bool]$UseResume; resumedThread = $resumeId
        sandbox = $sandbox; model = $useModel; effort = $useEffort; tempDir = $tmpDir
        argv = @($launcher.file) + @($launcher.prefix) + $codexArgs
        hashes = [ordered]@{ script = Get-CtSha256 $PSCommandPath; module = Get-CtSha256 (Join-Path $PSScriptRoot 'CodexTask.psm1'); schema = Get-CtSha256 $SchemaPath; brief = $st.briefSha256; review = Get-CtSha256 $Review }
        process = $res; threadId = $ev.threadId; usage = $ev.usage; eventTypes = $ev.eventTypes; codexCommands = $ev.commands; codexErrors = $ev.errors; mcpToolCalls = $ev.mcpToolCalls
        roundDiff = $roundDiff; cumulativeDiff = $cumDiff; violations = $viol; reportValid = $rep.valid; reportErrors = $rep.errors
        reportClaimVsActual = $claimMismatch; note = 'Codex claims in last.json are not evidence; Claude re-runs tests independently.'
      }
      Write-CtJson (Join-Path $rdir 'checks.json') $checks
      $entry.outcome = $outcome; $entry.threadId = $ev.threadId; $entry['seconds'] = $res.seconds
      if ($outcome -eq 'COMPLETED') { $st.nextRound = $Round + 1 }
      # Order matters: persist outcome/halt BEFORE accepting the new manifest. A crash in between leaves the
      # old manifest, so the next run halts as INTEGRITY instead of forgetting a scope violation.
      Write-CtJson $statePath $st
      Write-CtJson (Join-Path $stateDir 'manifest-current.json') $post
      Write-Host "Round $Round $outcome | codex exit=$($res.exitCode) timeout=$($res.timedOut) $($res.seconds)s | thread=$($ev.threadId) | changed: +$($roundDiff.added.Count) ~$($roundDiff.modified.Count) -$($roundDiff.removed.Count) | violations: $($viol.Count) | report valid: $($rep.valid) | survivors: $($survivors.Count)"
      Write-Host "  claims vs diff: claimedNotChanged=$($claimMismatch.claimedNotChanged.Count) changedNotClaimed=$($claimMismatch.changedNotClaimed.Count)"
      if ($viol.Count) { $viol | ForEach-Object { Write-Host "  VIOLATION $(Format-CtUntrusted $_ 200)" } }
      if (-not $rep.valid) { $rep.errors | ForEach-Object { Write-Host "  REPORT $(Format-CtUntrusted $_ 200)" } }
    } catch {
      if ("$_" -ne 'halt') {
        Write-Host "Round failed: $(Format-CtUntrusted "$_" 300)"
        if ($entry.outcome -eq 'RUNNING') {
          $entry.outcome = 'INTERRUPTED'; $entry['note'] = Format-CtUntrusted "$_" 300
          if (-not $entryAdded) { $st.rounds = @($st.rounds) + @($entry) }
          Write-CtJson $statePath $st
        }
      }
    } finally {
      Exit-Lock
    }
    exit (Get-CtExitCode $exitName)
  }

  # ------------------------------------------------------------------ QA COPY
  'Qa' {
    if (-not $TaskId) { Stop-Ct BAD_INPUT '-TaskId is required' }
    $stateDir = Get-StateDir $TaskId; $statePath = Join-Path $stateDir 'state.json'
    if (-not (Test-Path -LiteralPath $statePath)) { Stop-Ct BAD_STATE "no state for $TaskId" }
    if (-not $WhatIf) { Enter-Lock $stateDir }
    $st = Read-CtJson $statePath
    if ($st.halted) { Stop-Ct BAD_STATE "task halted ($($st['haltKind'])): $($st.haltReason)" }
    if ($st.frozen) { Stop-Ct BAD_STATE "task already frozen; QA copy: $($st['qaWorktree'])" }
    $last = if (@($st.rounds).Count) { @($st.rounds)[-1] } else { $null }
    if (-not $last -or $last.outcome -ne 'COMPLETED') { Stop-Ct BAD_STATE "QA needs a COMPLETED last round (last: $($last.outcome))" }
    $qa = "$($st.worktree)-qa"
    if ($WhatIf) { Write-Host "WHATIF Qa: freeze $($st.worktree); git worktree add --detach `"$qa`" $($st.base); copy changed allowlisted files (hash-verified); robocopy node_modules from $NodeModulesFrom"; exit 0 }
    $current = Read-CtJson (Join-Path $stateDir 'manifest-current.json')
    $now = Get-CtManifest $st.worktree
    $d = Compare-CtManifest $current $now
    if (Test-CtAnyChange $d) { Set-Halt $st 'INTEGRITY' 'worktree changed after last round'; Write-CtJson $statePath $st; Stop-Ct BAD_STATE $st.haltReason }
    $baseline = Read-CtJson (Join-Path $stateDir 'manifest-baseline.json')
    $cum = Compare-CtManifest $baseline $now
    $cum.stashChanged = $false   # repo-wide stash is judged per round only (see Test-CtAnyChange)
    $cumViol = Get-CtViolations $cum $st.allow $st.protect
    if ($cumViol.Count) { Set-Halt $st 'SCOPE_VIOLATION' "cumulative scope violation at QA: $($cumViol -join '; ')"; Write-CtJson $statePath $st; Stop-Ct SCOPE_VIOLATION $st.haltReason }
    if (Test-Path -LiteralPath $qa) { Stop-Ct BAD_STATE "QA path exists: $qa (remove it deliberately first)" }
    & git -C $st.repo worktree add --detach $qa $st.base 2>&1 | Write-Host
    if ($LASTEXITCODE) { Stop-Ct BAD_STATE 'git worktree add (qa) failed' }
    foreach ($f in @($cum.added + $cum.modified)) {
      $dst = Join-Path $qa $f; New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
      Copy-Item -LiteralPath (Join-Path $st.worktree $f) -Destination $dst -Force
      $expectedHash = ("$($now.files[$f])" -split '\|')[0]
      if ((Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash -ne $expectedHash) { Stop-Ct BAD_STATE "copy of $f does not match the frozen manifest" }
    }
    foreach ($f in $cum.removed) { $t = Join-Path $qa $f; if (Test-Path -LiteralPath $t) { Remove-Item -LiteralPath $t -Force } }
    $nm = $null
    if ($NodeModulesFrom) {
      $src = (Resolve-Path -LiteralPath $NodeModulesFrom).Path
      $dstNm = Join-Path $qa 'map05\node_modules'
      # No /SL: links are copied as content, so the QA copy never points back into the main checkout.
      & robocopy.exe $src $dstNm /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
      $nm = $LASTEXITCODE; if ($nm -ge 8) { Stop-Ct BAD_STATE "robocopy failed ($nm)" }
    }
    $st.frozen = $true; $st['qaWorktree'] = $qa; $st['frozenManifestFiles'] = $now.files.Count; $st['frozenAt'] = (Get-Date).ToString('o')
    Write-CtJson $statePath $st
    Exit-Lock
    Write-Host "QA ready: $qa (applied +$($cum.added.Count) ~$($cum.modified.Count) -$($cum.removed.Count) from Codex worktree; node_modules robocopy=$nm). Codex worktree frozen (state flag; files are not made read-only)."
    Write-Host "Before running tests in QA: read diff.patch. QA runs Codex-written code OUTSIDE the sandbox with your environment."
    exit 0
  }

  # ------------------------------------------------------------------ UNHALT (explicit, logged coordinator decision)
  'Unhalt' {
    if (-not $TaskId) { Stop-Ct BAD_INPUT '-TaskId is required' }
    if (-not $Reason -or $Reason.Trim().Length -lt 15) { Stop-Ct BAD_INPUT 'Unhalt requires -Reason (>=15 chars) describing the verified cause' }
    $stateDir = Get-StateDir $TaskId; $statePath = Join-Path $stateDir 'state.json'
    if (-not (Test-Path -LiteralPath $statePath)) { Stop-Ct BAD_STATE "no state for $TaskId" }
    Enter-Lock $stateDir
    $st = Read-CtJson $statePath
    if (-not $st.halted) { Stop-Ct BAD_INPUT 'task is not halted' }
    if (-not (Test-Liftable $st)) { Stop-Ct BAD_STATE "halt '$($st['haltKind'])' cannot be lifted by script (scope/integrity); inspect manually and start a new task id" }
    $last = @($st.rounds)[-1]
    $decision = [ordered]@{ at = (Get-Date).ToString('o'); haltKind = $st['haltKind']; previousHalt = $st.haltReason; reason = $Reason; acceptedRound = $null }
    if ($AcceptPartial) {
      if ($last.outcome -ne 'REPORTED_INCOMPLETE') { Stop-Ct BAD_INPUT '-AcceptPartial only after REPORTED_INCOMPLETE' }
      $st.nextRound = $last.round + 1; $decision.acceptedRound = $last.round
    }
    $st.halted = $false; $st['haltKind'] = $null; $st.haltReason = $null
    $st['decisions'] = @(@($st['decisions']) | Where-Object { $_ }) + @($decision)
    Write-CtJson $statePath $st
    Exit-Lock
    Write-Host "Unhalted $TaskId (nextRound=$($st.nextRound)). Decision logged."; exit 0
  }

  'Status' {
    if (-not $TaskId) { Stop-Ct BAD_INPUT '-TaskId is required' }
    $statePath = Join-Path (Get-StateDir $TaskId) 'state.json'
    if (-not (Test-Path -LiteralPath $statePath)) { Stop-Ct BAD_STATE "no state for $TaskId" }
    Get-Content -LiteralPath $statePath -Raw; exit 0
  }
}
