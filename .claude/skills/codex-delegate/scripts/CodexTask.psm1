#Requires -Version 7.2
# Helper module for Invoke-CodexTask.ps1 (Claude = coordinator/reviewer, Codex CLI = executor).
# No network, no git commit/push, no credentials. Raw logs stay outside the repository.
Set-StrictMode -Version Latest

$script:ExitCodes = [ordered]@{
  OK = 0; CODEX_ERROR = 10; TIMEOUT = 11; INTERRUPTED = 12; REPORTED_INCOMPLETE = 13
  SCOPE_VIOLATION = 20; INVALID_REPORT = 21; ROUND_LIMIT = 30; BAD_STATE = 31; BAD_INPUT = 32
}
# Unknown names fail closed (31), never 0.
function Get-CtExitCode([string]$Name) { if ($script:ExitCodes.Contains($Name)) { return [int]$script:ExitCodes[$Name] } return 31 }

$script:MaxRounds = 3     # 1 initial round + 2 fix rounds
$script:MaxAttempts = 3   # attempts per round (first run + retries)
function Get-CtLimits { return [ordered]@{ maxRounds = $script:MaxRounds; maxAttempts = $script:MaxAttempts } }

# Validation patterns shared by Bootstrap, Round and the self-test.
$script:Patterns = [ordered]@{
  taskId = '^[A-Za-z0-9][A-Za-z0-9_-]{1,40}$'; slug = '^[a-z0-9-]{1,40}$'; worktreeName = '^[A-Za-z0-9][A-Za-z0-9_.-]{1,60}$'
  model = '^[A-Za-z0-9._:-]{1,64}$'; threadId = '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
}
$script:Efforts = @('minimal','low','medium','high','xhigh')
function Get-CtPatterns { return $script:Patterns }
function Get-CtEfforts { return $script:Efforts }

# Environment passed to the Codex process. Everything else (tokens, API keys, proxies) is dropped.
$script:EnvAllowList = @(
  'SystemRoot','SystemDrive','windir','ComSpec','PATH','PATHEXT','TEMP','TMP','USERPROFILE',
  'HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','ProgramFiles(x86)',
  'ProgramW6432','CommonProgramFiles','CommonProgramW6432','OS','NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE','PROCESSOR_IDENTIFIER','PROCESSOR_LEVEL','PROCESSOR_REVISION',
  'USERNAME','USERDOMAIN','COMPUTERNAME','CODEX_HOME','PSModulePath'
)

# Paths that must never change in an MMS task worktree (checked by hash, tracked or ignored).
# Agent/tooling config is protected too: Codex must not edit this skill, hooks or CI.
$script:DefaultProtect = @(
  'AGENTS.md','CLAUDE.md','.gitignore','.gitattributes','.git','**/*.xlsx','**/*.csv',
  '.claude/**','.codex/**','.agents/**','.github/**','.vscode/**',
  'map04/**','map05/data/**','map05/basemap/**','map05/vendor/**',
  'map05/planner-offline.html','map05/planner.html','map05/offline.html','map05/index.html',
  'map05/optimizer.mjs','map05/routes.mjs','map05/local_routing.py','map05/build_local_routes.py',
  'map05/build_planner.py','map05/build_offline.py','map05/prepare_assets.py','map05/package.json','map05/package-lock.json'
)
function Get-CtDefaultProtect { return $script:DefaultProtect }

function ConvertTo-CtGlobRegex([string]$Glob) {
  $g = $Glob.Replace('\','/')
  $sb = [System.Text.StringBuilder]::new('^')
  for ($i = 0; $i -lt $g.Length; $i++) {
    $c = $g[$i]
    if ($c -eq '*') {
      if ($i + 1 -lt $g.Length -and $g[$i+1] -eq '*') {
        $i++
        if ($i + 1 -lt $g.Length -and $g[$i+1] -eq '/') { $i++; [void]$sb.Append('(?:.*/)?') } else { [void]$sb.Append('.*') }
      } else { [void]$sb.Append('[^/]*') }
    } elseif ($c -eq '?') { [void]$sb.Append('[^/]') }
    else { [void]$sb.Append([regex]::Escape([string]$c)) }
  }
  [void]$sb.Append('$')
  return $sb.ToString()
}
# Case-insensitive on purpose (Windows file system); case-only renames are caught by the manifest compare.
function Test-CtGlob([string]$Path, [string[]]$Globs) {
  $p = $Path.Replace('\','/')
  foreach ($g in $Globs) { if ($p -match (ConvertTo-CtGlobRegex $g)) { return $true } }
  return $false
}

# Allowlist entries must be narrow, relative repo paths. Returns $null when OK, else the reason.
function Test-CtAllowEntry([string]$Entry) {
  $e = "$Entry".Replace('\','/')
  if (-not $e.Trim()) { return 'empty entry' }
  if ($e -match '^(\*\*?)(/\*\*?)*(/\*(\.\*)?)?$' -or $e -in '**/*','*.*','**/*.*') { return 'matches the whole repository' }
  if ($e.StartsWith('/') -or $e.StartsWith('./') -or $e -match '(^|/)\.\.(/|$)' -or $e -match '^[A-Za-z]:' -or $e.StartsWith('//')) { return 'must be a relative path inside the repository' }
  return $null
}

function Read-CtJson([string]$Path) { return (Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable) }
function Write-CtJson([string]$Path, $Object) {
  $tmp = "$Path.tmp"
  $Object | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $tmp -Encoding utf8
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

# Codex-controlled text shown on the coordinator console: strip control characters and cap the length.
function Format-CtUntrusted([string]$Text, [int]$Max = 300) {
  $t = [regex]::Replace("$Text", '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x1B]', ' ')
  if ($t.Length -gt $Max) { $t = $t.Substring(0, $Max) + '...' }
  return $t
}

function Invoke-CtGit([string]$Dir, [string[]]$GitArgs, [switch]$AllowFail) {
  $out = & git -C $Dir @GitArgs 2>&1
  if ($LASTEXITCODE -ne 0 -and -not $AllowFail) { throw "git $($GitArgs -join ' ') failed in ${Dir}: $out" }
  return ,@($out | ForEach-Object { "$_" })
}

# ---------------------------------------------------------------- manifest
function New-CtOrdinalMap { return [System.Collections.Specialized.OrderedDictionary]::new([System.StringComparer]::Ordinal) }

function Get-CtManifest([string]$Root) {
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  $files = New-CtOrdinalMap          # case-sensitive keys: a case-only rename shows up as removed + added
  $links = New-CtOrdinalMap          # reparse points: never followed, target recorded
  $stack = [System.Collections.Generic.Stack[string]]::new(); $stack.Push($rootFull)
  while ($stack.Count) {
    $dir = $stack.Pop()
    foreach ($item in [System.IO.DirectoryInfo]::new($dir).EnumerateFileSystemInfos()) {
      $rel = $item.FullName.Substring($rootFull.Length + 1).Replace('\','/')
      $isLink = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
      if ($isLink) { $links[$rel] = "$($item.LinkTarget)"; continue }
      if ($item -is [System.IO.DirectoryInfo]) {
        if ($rel -eq '.git') { continue }     # main-repo layout; a worktree has a .git pointer FILE, which is hashed below
        $stack.Push($item.FullName); continue
      }
      $h = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
      $files[$rel] = "$h|$($item.Length)"
    }
  }
  $head = (Invoke-CtGit $rootFull @('rev-parse','HEAD'))[0].Trim()
  $branch = (Invoke-CtGit $rootFull @('rev-parse','--abbrev-ref','HEAD'))[0].Trim()
  # Note: the stash list is shared by all worktrees of the repo (a stash in the main checkout also counts).
  $stash = @(Invoke-CtGit $rootFull @('stash','list') -AllowFail)
  $sorted = New-CtOrdinalMap; foreach ($k in ([string[]]@($files.Keys) | Sort-Object -CaseSensitive)) { $sorted[$k] = $files[$k] }
  $sortedLinks = New-CtOrdinalMap; foreach ($k in ([string[]]@($links.Keys) | Sort-Object -CaseSensitive)) { $sortedLinks[$k] = $links[$k] }
  return [ordered]@{ head = $head; branch = $branch; stashCount = $stash.Count; links = @($sortedLinks.Keys); linkTargets = $sortedLinks; files = $sorted }
}

function Test-CtKey($Map, [string]$Key) { foreach ($k in $Map.Keys) { if ([string]::Equals($k, $Key, [System.StringComparison]::Ordinal)) { return $true } } return $false }

function Compare-CtManifest($Before, $After) {
  # Rebuild both sides as ordinal maps (manifests read from JSON are hashtables).
  $bf = New-CtOrdinalMap; foreach ($k in $Before.files.Keys) { $bf[$k] = $Before.files[$k] }
  $af = New-CtOrdinalMap; foreach ($k in $After.files.Keys) { $af[$k] = $After.files[$k] }
  $added = @(); $removed = @(); $modified = @()
  foreach ($k in $af.Keys) { if (-not $bf.Contains($k)) { $added += $k } elseif ($bf[$k] -cne $af[$k]) { $modified += $k } }
  foreach ($k in $bf.Keys) { if (-not $af.Contains($k)) { $removed += $k } }
  $bl = New-CtOrdinalMap; $al = New-CtOrdinalMap
  $bt = if ($Before.Contains('linkTargets') -and $Before.linkTargets) { $Before.linkTargets } else { $null }
  $at = if ($After.Contains('linkTargets') -and $After.linkTargets) { $After.linkTargets } else { $null }
  foreach ($l in @($Before.links)) { if ($l) { $bl[$l] = if ($bt) { "$($bt[$l])" } else { '' } } }
  foreach ($l in @($After.links)) { if ($l) { $al[$l] = if ($at) { "$($at[$l])" } else { '' } } }
  $newLinks = @($al.Keys | Where-Object { -not $bl.Contains($_) })
  $removedLinks = @($bl.Keys | Where-Object { -not $al.Contains($_) })
  $changedLinks = @($al.Keys | Where-Object { $bl.Contains($_) -and $bt -and $at -and ($bl[$_] -cne $al[$_]) })
  return [ordered]@{
    added = $added; removed = $removed; modified = $modified
    newLinks = $newLinks; removedLinks = $removedLinks; changedLinks = $changedLinks
    headChanged = ($Before.head -ne $After.head); branchChanged = ($Before.branch -ne $After.branch)
    stashChanged = ($Before.stashCount -ne $After.stashCount)
  }
}

# Any file or link change at all (used for "nothing may change between rounds / after freeze").
# The repo-wide stash count is checked only inside a round (Get-CtViolations): a stash in the main checkout
# between rounds cannot come from Codex, whose sandbox has no write access to the common .git.
function Test-CtAnyChange($Diff) {
  return [bool](@($Diff.added + $Diff.removed + $Diff.modified + $Diff.newLinks + $Diff.removedLinks + $Diff.changedLinks).Count -or
    $Diff.headChanged -or $Diff.branchChanged)
}

function Get-CtViolations($Diff, [string[]]$Allow, [string[]]$Protect) {
  $v = [System.Collections.Generic.List[string]]::new()
  foreach ($p in @($Diff.added + $Diff.removed + $Diff.modified)) {
    if (Test-CtGlob $p $Protect) { $v.Add("PROTECTED_CHANGED: $p") }
    elseif (-not (Test-CtGlob $p $Allow)) { $v.Add("OUTSIDE_ALLOWLIST: $p") }
  }
  foreach ($l in $Diff.newLinks) { $v.Add("NEW_LINK_OR_REPARSE_POINT: $l") }
  foreach ($l in $Diff.removedLinks) { $v.Add("LINK_REMOVED: $l") }
  foreach ($l in $Diff.changedLinks) { $v.Add("LINK_TARGET_CHANGED: $l") }
  if ($Diff.headChanged) { $v.Add('HEAD_MOVED (commit or checkout in worktree)') }
  if ($Diff.branchChanged) { $v.Add('BRANCH_SWITCHED') }
  if ($Diff.stashChanged) { $v.Add('STASH_CHANGED (repo-wide stash list)') }
  return ,@($v)
}

# ---------------------------------------------------------------- JSON schema subset validator
function Test-CtSchema($Value, $Schema, [string]$Path = '$') {
  $errs = [System.Collections.Generic.List[string]]::new()
  $type = $Schema['type']
  switch ($type) {
    'object' {
      if ($Value -isnot [System.Collections.IDictionary]) { $errs.Add("${Path}: expected object"); break }
      foreach ($r in @($Schema['required'])) { if ($r -and -not $Value.Contains($r)) { $errs.Add("${Path}: missing '$r'") } }
      $props = $Schema['properties']
      foreach ($k in $Value.Keys) {
        if ($props -and $props.Contains($k)) { foreach ($e in (Test-CtSchema $Value[$k] $props[$k] "$Path.$k")) { $errs.Add($e) } }
        elseif ($Schema['additionalProperties'] -eq $false) { $errs.Add("${Path}: unexpected '$(Format-CtUntrusted $k 60)'") }
      }
    }
    'array' {
      if ($Value -isnot [System.Collections.IList]) { $errs.Add("${Path}: expected array"); break }
      for ($i = 0; $i -lt $Value.Count; $i++) { foreach ($e in (Test-CtSchema $Value[$i] $Schema['items'] "$Path[$i]")) { $errs.Add($e) } }
    }
    'string'  { if ($Value -isnot [string]) { $errs.Add("${Path}: expected string") } }
    'integer' { if (-not ($Value -is [int] -or $Value -is [long])) { $errs.Add("${Path}: expected integer") } }
    'boolean' { if ($Value -isnot [bool]) { $errs.Add("${Path}: expected boolean") } }
    default   { $errs.Add("${Path}: unsupported schema type '$type'") }
  }
  if ($Schema.Contains('enum') -and $errs.Count -eq 0 -and $Value -cnotin @($Schema['enum'])) { $errs.Add("${Path}: '$(Format-CtUntrusted $Value 60)' not in enum") }
  return ,@($errs)
}

function Test-CtReportFile([string]$ReportPath, [string]$SchemaPath, [string]$ExpectTaskId, [int]$ExpectRound = 0) {
  if (-not (Test-Path -LiteralPath $ReportPath)) { return [ordered]@{ valid = $false; errors = @('report file missing'); report = $null } }
  try { $obj = Get-Content -LiteralPath $ReportPath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable }
  catch { return [ordered]@{ valid = $false; errors = @("not JSON: $(Format-CtUntrusted $_.Exception.Message 200)"); report = $null } }
  $schema = Read-CtJson $SchemaPath
  $errs = Test-CtSchema $obj $schema
  if ($errs.Count -eq 0 -and $ExpectTaskId -and $obj['task_id'] -cne $ExpectTaskId) { $errs += "`$.task_id: expected '$ExpectTaskId'" }
  if ($errs.Count -eq 0 -and $ExpectRound -gt 0 -and $obj['round'] -ne $ExpectRound) { $errs += "`$.round: expected $ExpectRound" }
  return [ordered]@{ valid = ($errs.Count -eq 0); errors = @($errs); report = $obj }
}

# ---------------------------------------------------------------- Windows Job Object (kill-on-close)
# Every process Codex starts stays in the job unless it breaks away; closing the handle (also when this
# PowerShell dies or the console is closed) terminates the whole tree.
if (-not ('CtJob' -as [type])) {
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CtJob {
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong R, W, O, RB, WB, OB; }
  [StructLayout(LayoutKind.Sequential)] struct EXT_LIMIT { public BASIC_LIMIT Basic; public IO_COUNTERS Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long TotalUserTime; public long TotalKernelTime; public long ThisPeriodTotalUserTime; public long ThisPeriodTotalKernelTime; public uint TotalPageFaultCount; public uint TotalProcesses; public uint ActiveProcesses; public uint TotalTerminatedProcesses; }
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attr, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref EXT_LIMIT info, uint len);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int cls, out ACCOUNTING info, uint len, IntPtr ret);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  public static IntPtr Create() {
    IntPtr h = CreateJobObject(IntPtr.Zero, null); if (h == IntPtr.Zero) return h;
    EXT_LIMIT e = new EXT_LIMIT(); e.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if (!SetInformationJobObject(h, 9, ref e, (uint)Marshal.SizeOf(typeof(EXT_LIMIT)))) { CloseHandle(h); return IntPtr.Zero; }
    return h;
  }
  public static bool Assign(IntPtr job, IntPtr process) { return AssignProcessToJobObject(job, process); }
  public static int Active(IntPtr job) { ACCOUNTING a; return QueryInformationJobObject(job, 1, out a, (uint)Marshal.SizeOf(typeof(ACCOUNTING)), IntPtr.Zero) ? (int)a.ActiveProcesses : -1; }
  public static bool Terminate(IntPtr job) { return TerminateJobObject(job, 1); }
  public static void Close(IntPtr job) { if (job != IntPtr.Zero) CloseHandle(job); }
}
'@
}

# ---------------------------------------------------------------- process runner (timeout + tree kill)
function Get-CtDescendants([int[]]$ProcessIds) {
  $all = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name -ErrorAction SilentlyContinue)
  $result = [System.Collections.Generic.List[object]]::new()
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new(); foreach ($id in $ProcessIds) { $queue.Enqueue($id); [void]$seen.Add($id) }
  while ($queue.Count) {
    $p = $queue.Dequeue()
    foreach ($c in $all | Where-Object { $_.ParentProcessId -eq $p -and $_.ProcessId -ne $p }) {
      if ($seen.Add([int]$c.ProcessId)) { $result.Add($c); $queue.Enqueue([int]$c.ProcessId) }
    }
  }
  return ,@($result)
}

function Invoke-CtProcess {
  param([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory, [string]$StdinText,
        [string]$StdoutPath, [string]$StderrPath, [int]$TimeoutSec, [string[]]$EnvAllow = $script:EnvAllowList,
        [hashtable]$ExtraEnv = @{})
  if ($TimeoutSec -lt 1) { throw "TimeoutSec must be >= 1" }
  $psi = [System.Diagnostics.ProcessStartInfo]::new($FilePath)
  foreach ($a in $ArgumentList) { $psi.ArgumentList.Add($a) }
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false); $psi.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.Environment.Clear()
  foreach ($n in $EnvAllow) { $val = [Environment]::GetEnvironmentVariable($n); if ($null -ne $val) { $psi.Environment[$n] = $val } }
  foreach ($k in $ExtraEnv.Keys) { $psi.Environment[$k] = [string]$ExtraEnv[$k] }
  $passed = @($psi.Environment.Keys | Sort-Object)
  $out = [System.IO.File]::Open($StdoutPath, 'CreateNew', 'Write', 'Read'); $err = [System.IO.File]::Open($StderrPath, 'CreateNew', 'Write', 'Read')
  $job = [CtJob]::Create(); $jobAssigned = $false
  $p = $null; $timedOut = $false; $completed = $false; $survivorsAfterKill = @(); $survivorsAfterExit = @(); $jobActiveAfterExit = $null
  $started = Get-Date
  try {
    $p = [System.Diagnostics.Process]::Start($psi)
    if ($job -ne [IntPtr]::Zero) { $jobAssigned = [CtJob]::Assign($job, $p.Handle) }
    $t1 = $p.StandardOutput.BaseStream.CopyToAsync($out); $t2 = $p.StandardError.BaseStream.CopyToAsync($err)
    $enc = [System.Text.UTF8Encoding]::new($false)
    if ($StdinText) { $bytes = $enc.GetBytes($StdinText); $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length) }
    $p.StandardInput.Close()
    $deadline = $started.AddSeconds($TimeoutSec)
    while (-not $p.HasExited -and (Get-Date) -lt $deadline) { [void]$p.WaitForExit(500) }
    if (-not $p.HasExited) {
      $timedOut = $true
      $tree = Get-CtDescendants @($p.Id)
      if ($jobAssigned) { [void][CtJob]::Terminate($job) }
      & taskkill.exe /T /F /PID $p.Id *> $null
      Start-Sleep -Milliseconds 800
      $survivorsAfterKill = @($tree | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } | ForEach-Object { "$($_.Name)#$($_.ProcessId)" })
      foreach ($s in $tree) { Stop-Process -Id $s.ProcessId -Force -ErrorAction SilentlyContinue }
    } else {
      # Codex exited: anything still alive in its job (or parented by it) outlived the run.
      Start-Sleep -Milliseconds 300
      if ($jobAssigned) { $jobActiveAfterExit = [CtJob]::Active($job) }
      $orphans = Get-CtDescendants @($p.Id)
      $survivorsAfterExit = @($orphans | ForEach-Object { "$($_.Name)#$($_.ProcessId)" })
      if ($jobAssigned -and $jobActiveAfterExit -gt 0 -and -not $survivorsAfterExit.Count) { $survivorsAfterExit = @("unnamed job processes: $jobActiveAfterExit") }
      if ($jobAssigned -and $jobActiveAfterExit -gt 0) { [void][CtJob]::Terminate($job) }
      foreach ($s in $orphans) { Stop-Process -Id $s.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    [void]$p.WaitForExit(5000)
    [void][System.Threading.Tasks.Task]::WaitAll(@($t1, $t2), 5000)
    $completed = $true
  } finally {
    if (-not $completed) {   # Ctrl+C or exception: never leave Codex running
      if ($jobAssigned) { [void][CtJob]::Terminate($job) }
      if ($p -and -not $p.HasExited) { & taskkill.exe /T /F /PID $p.Id *> $null }
    }
    [CtJob]::Close($job)
    $out.Dispose(); $err.Dispose()
  }
  return [ordered]@{
    exitCode = if ($p -and $p.HasExited) { $p.ExitCode } else { $null }
    timedOut = $timedOut; survivorsAfterKill = $survivorsAfterKill; survivorsAfterExit = $survivorsAfterExit
    jobAssigned = $jobAssigned; jobActiveAfterExit = $jobActiveAfterExit
    seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1); envNamesPassed = $passed
  }
}

# ---------------------------------------------------------------- Codex event log summary
function Get-CtEventSummary([string]$EventsPath) {
  $thread = $null; $usage = $null; $cmds = [System.Collections.Generic.List[object]]::new(); $types = @{}; $errors = @(); $mcpCalls = 0
  if (Test-Path -LiteralPath $EventsPath) {
    foreach ($line in [System.IO.File]::ReadLines($EventsPath)) {
      if (-not $line.Trim().StartsWith('{')) { continue }
      try { $e = $line | ConvertFrom-Json -AsHashtable } catch { continue }
      $t = [string]$e['type']; $types[$t] = 1 + [int]$types[$t]
      if ($t -eq 'thread.started') { $thread = $e['thread_id'] }
      elseif ($t -eq 'turn.completed') { $usage = $e['usage'] }
      elseif ($t -in 'error','turn.failed') { $errors += ($line.Substring(0, [math]::Min(400, $line.Length))) }
      elseif ($t -eq 'item.completed' -and $e['item']) {
        $it = $e['item']
        if ($it['type'] -eq 'command_execution') { $cmds.Add([ordered]@{ command = [string]$it['command']; exit_code = $it['exit_code']; status = [string]$it['status'] }) }
        elseif ("$($it['type'])" -match 'mcp') { $mcpCalls++ }
      }
    }
  }
  return [ordered]@{ threadId = $thread; usage = $usage; eventTypes = $types; commands = @($cmds); errors = $errors; mcpToolCalls = $mcpCalls }
}

function Resolve-CtCodexLauncher {
  $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $js = Join-Path $env:APPDATA 'npm\node_modules\@openai\codex\bin\codex.js'
  if (-not (Test-Path -LiteralPath $js)) { throw "Codex npm entrypoint not found: $js" }
  return [ordered]@{ file = $node; prefix = @($js) }
}

function Get-CtSha256([string]$Path) { if ($Path -and (Test-Path -LiteralPath $Path)) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash } return $null }

Export-ModuleMember -Function *-Ct*
