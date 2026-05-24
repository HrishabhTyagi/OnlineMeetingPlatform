# Samvaad - Complete Test Runner
# Runs server, client unit, and client functional tests with a consolidated report.

param(
    [switch]$SkipFunctional,
    [switch]$NoRestore,
    [switch]$InstallClientDependencies,
    [switch]$InstallPlaywrightBrowsers,
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot = Join-Path $projectRoot "artifacts\test-reports\$timestamp"
$serverReportDir = Join-Path $reportRoot "server"
$clientReportDir = Join-Path $reportRoot "client"
$functionalReportDir = Join-Path $reportRoot "functional"
$serverBuildRoot = Join-Path $reportRoot "build\server"
$logDir = Join-Path $reportRoot "logs"
$summaryPath = Join-Path $reportRoot "summary.md"
$summaryJsonPath = Join-Path $reportRoot "summary.json"

$isWindows = $env:OS -eq "Windows_NT"
$npmCommand = if ($isWindows) { "npm.cmd" } else { "npm" }
$npxCommand = if ($isWindows) { "npx.cmd" } else { "npx" }

$serverSuites = @(
    @{
        Name = "MeetingService"
        Project = "tests\Server\MeetingService.Tests\MeetingService.Tests.csproj"
        Framework = $null
    },
    @{
        Name = "UserService"
        Project = "tests\Server\UserService.Tests\UserService.Tests.csproj"
        Framework = $null
    },
    @{
        Name = "OrganizationService"
        Project = "tests\Server\OrganizationService.Tests\OrganizationService.Tests.csproj"
        Framework = $null
    },
    @{
        Name = "NotificationService"
        Project = "tests\Server\NotificationService.Tests\NotificationService.Tests.csproj"
        Framework = $null
    },
    @{
        Name = "Infrastructure"
        Project = "tests\Server\Infrastructure.Tests\Infrastructure.Tests.csproj"
        Framework = $null
    }
)

$clientSuites = @(
    @{
        Name = "Meeting app unit"
        Path = "src\Frontend\meeting-app"
        Command = @($npmCommand, "test", "--", "--reporter=default", "--reporter=junit", "--outputFile=../../../artifacts/test-reports/$timestamp/client/meeting-app-junit.xml")
    },
    @{
        Name = "Organization admin unit"
        Path = "src\Frontend\organization-admin"
        Command = @($npmCommand, "test", "--", "--reporter=default", "--reporter=junit", "--outputFile=../../../artifacts/test-reports/$timestamp/client/organization-admin-junit.xml")
    }
)

$functionalSuites = @(
    @{
        Name = "Meeting app functional"
        Path = "src\Frontend\meeting-app"
        Command = @($npxCommand, "playwright", "test", "--reporter=line,junit")
        JUnitFile = Join-Path $functionalReportDir "meeting-app-playwright-junit.xml"
    }
)

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Format-Duration {
    param([TimeSpan]$Duration)

    if ($Duration.TotalHours -ge 1) {
        return "{0:hh\:mm\:ss}" -f $Duration
    }

    return "{0:mm\:ss}" -f $Duration
}

function Invoke-LoggedCommand {
    param(
        [string]$Name,
        [string]$Area,
        [string]$WorkingDirectory,
        [string[]]$Command,
        [string]$LogPath,
        [hashtable]$ExtraEnvironment = @{}
    )

    $startedAt = Get-Date
    $displayCommand = $Command -join " "
    $status = "Passed"

    Write-Host ""
    Write-Host "[$Area] $Name" -ForegroundColor Cyan
    Write-Host "Command: $displayCommand" -ForegroundColor DarkCyan

    Ensure-Directory -Path (Split-Path -Parent $LogPath)
    "[$startedAt] $displayCommand" | Set-Content -LiteralPath $LogPath
    "" | Add-Content -LiteralPath $LogPath

    $previousEnvironment = @{}
    foreach ($key in $ExtraEnvironment.Keys) {
        $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$ExtraEnvironment[$key], "Process")
    }

    Push-Location $WorkingDirectory
    try {
        & $Command[0] @($Command | Select-Object -Skip 1) 2>&1 | Tee-Object -FilePath $LogPath -Append
        $exitCode = $LASTEXITCODE
    } catch {
        $_ | Out-String | Tee-Object -FilePath $LogPath -Append
        $exitCode = 1
    } finally {
        Pop-Location
        foreach ($key in $ExtraEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], "Process")
        }
    }

    if ($exitCode -ne 0) {
        $status = "Failed"
        Write-Host "Result: FAILED ($exitCode)" -ForegroundColor Red
    } else {
        Write-Host "Result: PASSED" -ForegroundColor Green
    }

    $finishedAt = Get-Date
    return [pscustomobject]@{
        Area = $Area
        Name = $Name
        Command = $displayCommand
        Status = $status
        ExitCode = $exitCode
        StartedAt = $startedAt
        FinishedAt = $finishedAt
        Duration = $finishedAt - $startedAt
        LogPath = $LogPath
    }
}

function Get-CommandOutput {
    param(
        [string]$Command,
        [string[]]$Arguments = @()
    )

    try {
        $output = & $Command @Arguments 2>$null
        if ($LASTEXITCODE -ne 0 -or $null -eq $output) {
            return "Unavailable"
        }

        return (($output | Select-Object -First 1) -as [string]).Trim()
    } catch {
        return "Unavailable"
    }
}

function New-RelativePath {
    param(
        [string]$Path,
        [string]$BasePath = $projectRoot
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ""
    }

    $basePath = [System.IO.Path]::GetFullPath($BasePath).TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
    $targetPath = [System.IO.Path]::GetFullPath($Path)
    $baseUri = New-Object System.Uri($basePath)
    $targetUri = New-Object System.Uri($targetPath)

    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}

Ensure-Directory -Path $serverReportDir
Ensure-Directory -Path $clientReportDir
Ensure-Directory -Path $functionalReportDir
Ensure-Directory -Path $serverBuildRoot
Ensure-Directory -Path $logDir

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Samvaad - Complete Test Runner" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host "Report:  $reportRoot"
Write-Host ""

$results = New-Object System.Collections.Generic.List[object]

if ($InstallClientDependencies) {
    foreach ($clientPath in @("src\Frontend\meeting-app", "src\Frontend\organization-admin")) {
        $absoluteClientPath = Join-Path $projectRoot $clientPath
        $installCommand = if (Test-Path -LiteralPath (Join-Path $absoluteClientPath "package-lock.json")) {
            @($npmCommand, "ci")
        } else {
            @($npmCommand, "install")
        }

        $safeName = ($clientPath -replace "[^a-zA-Z0-9]+", "-").Trim("-").ToLowerInvariant()
        $results.Add((Invoke-LoggedCommand `
            -Name "$clientPath dependencies" `
            -Area "Client Setup" `
            -WorkingDirectory $absoluteClientPath `
            -Command $installCommand `
            -LogPath (Join-Path $logDir "$safeName-dependencies.log")))
    }
}

foreach ($suite in $serverSuites) {
    $projectPath = Join-Path $projectRoot $suite.Project
    if (-not (Test-Path -LiteralPath $projectPath)) {
        $results.Add([pscustomobject]@{
            Area = "Server"
            Name = $suite.Name
            Command = "dotnet test $($suite.Project)"
            Status = "Missing"
            ExitCode = 1
            StartedAt = Get-Date
            FinishedAt = Get-Date
            Duration = [TimeSpan]::Zero
            LogPath = ""
        })
        continue
    }

    $trxFile = "$($suite.Name).trx"
    $suiteBuildDir = Join-Path $serverBuildRoot $suite.Name
    Ensure-Directory -Path $suiteBuildDir
    $suiteBaseOutputPath = [System.IO.Path]::GetFullPath($suiteBuildDir).TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
    $command = @(
        "dotnet",
        "test",
        $projectPath,
        "--configuration",
        $Configuration,
        "-p:BaseOutputPath=$suiteBaseOutputPath",
        "--logger",
        "trx;LogFileName=$trxFile",
        "--results-directory",
        $serverReportDir
    )

    if ($NoRestore) {
        $command += "--no-restore"
    }

    $logPath = Join-Path $logDir "$($suite.Name)-server.log"
    $results.Add((Invoke-LoggedCommand -Name $suite.Name -Area "Server" -WorkingDirectory $projectRoot -Command $command -LogPath $logPath))
}

foreach ($suite in $clientSuites) {
    $suitePath = Join-Path $projectRoot $suite.Path
    $logName = ($suite.Name -replace "[^a-zA-Z0-9]+", "-").Trim("-").ToLowerInvariant()

    if (-not (Test-Path -LiteralPath (Join-Path $suitePath "package.json"))) {
        $results.Add([pscustomobject]@{
            Area = "Client Unit"
            Name = $suite.Name
            Command = $suite.Command -join " "
            Status = "Missing"
            ExitCode = 1
            StartedAt = Get-Date
            FinishedAt = Get-Date
            Duration = [TimeSpan]::Zero
            LogPath = ""
        })
        continue
    }

    $logPath = Join-Path $logDir "$logName.log"
    $results.Add((Invoke-LoggedCommand -Name $suite.Name -Area "Client Unit" -WorkingDirectory $suitePath -Command $suite.Command -LogPath $logPath))
}

if (-not $SkipFunctional) {
    if ($InstallPlaywrightBrowsers) {
        $meetingAppPath = Join-Path $projectRoot "src\Frontend\meeting-app"
        $results.Add((Invoke-LoggedCommand `
            -Name "Install Playwright Chromium" `
            -Area "Functional Setup" `
            -WorkingDirectory $meetingAppPath `
            -Command @($npxCommand, "playwright", "install", "chromium") `
            -LogPath (Join-Path $logDir "playwright-install.log")))
    }

    foreach ($suite in $functionalSuites) {
        $suitePath = Join-Path $projectRoot $suite.Path
        $logName = ($suite.Name -replace "[^a-zA-Z0-9]+", "-").Trim("-").ToLowerInvariant()
        $environment = @{
            PLAYWRIGHT_JUNIT_OUTPUT_FILE = $suite.JUnitFile
        }

        $logPath = Join-Path $logDir "$logName.log"
        $results.Add((Invoke-LoggedCommand -Name $suite.Name -Area "Functional" -WorkingDirectory $suitePath -Command $suite.Command -LogPath $logPath -ExtraEnvironment $environment))
    }
} else {
    Write-Host "Skipping functional tests because -SkipFunctional was provided." -ForegroundColor Yellow
}

$passed = @($results | Where-Object { $_.Status -eq "Passed" }).Count
$failed = @($results | Where-Object { $_.Status -eq "Failed" }).Count
$missing = @($results | Where-Object { $_.Status -eq "Missing" }).Count
$total = $results.Count
$overallStatus = if (($failed + $missing) -eq 0) { "PASSED" } else { "FAILED" }
$dotnetVersion = Get-CommandOutput -Command "dotnet" -Arguments @("--version")
$nodeVersion = Get-CommandOutput -Command "node" -Arguments @("--version")
$npmVersion = Get-CommandOutput -Command $npmCommand -Arguments @("--version")
$generatedAtText = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$serverReportRelative = New-RelativePath -Path $serverReportDir -BasePath $reportRoot
$clientReportRelative = New-RelativePath -Path $clientReportDir -BasePath $reportRoot
$functionalReportRelative = New-RelativePath -Path $functionalReportDir -BasePath $reportRoot

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# Samvaad Test Report")
$summary.Add("")
$summary.Add("- Generated: $generatedAtText")
$summary.Add("- Project: ``$projectRoot``")
$summary.Add("- Overall: **$overallStatus**")
$summary.Add("- Passed suites: $passed")
$summary.Add("- Failed suites: $failed")
$summary.Add("- Missing suites: $missing")
$summary.Add("- Total suites: $total")
$summary.Add("- .NET SDK: $dotnetVersion")
$summary.Add("- Node.js: $nodeVersion")
$summary.Add("- npm: $npmVersion")
$summary.Add("- PowerShell: $($PSVersionTable.PSVersion)")
$summary.Add("")
$summary.Add("## Suite Results")
$summary.Add("")
$summary.Add("| Area | Suite | Status | Exit | Duration | Log |")
$summary.Add("| --- | --- | --- | ---: | ---: | --- |")

foreach ($result in $results) {
    $logCell = if ($result.LogPath) { "[log]($(New-RelativePath -Path $result.LogPath -BasePath $reportRoot))" } else { "" }
    $summary.Add("| $($result.Area) | $($result.Name) | $($result.Status) | $($result.ExitCode) | $(Format-Duration $result.Duration) | $logCell |")
}

$summary.Add("")
$summary.Add("## Generated Machine Reports")
$summary.Add("")
$summary.Add("- Server TRX files: ``$serverReportRelative``")
$summary.Add("- Client JUnit files: ``$clientReportRelative``")
$summary.Add("- Functional JUnit files: ``$functionalReportRelative``")
$summary.Add("")
$summary.Add("## Notes")
$summary.Add("")
$summary.Add("- Use ``-SkipFunctional`` if you only want server and client unit tests.")
$summary.Add("- Use ``-InstallClientDependencies`` when node modules are missing or stale.")
$summary.Add("- Use ``-InstallPlaywrightBrowsers`` the first time Playwright functional tests run on a machine.")
$summary.Add("- Server tests build into isolated report folders so they can run while local services are open.")
$summary.Add("- Existing dependency warnings are preserved in the suite logs.")

$summary | Set-Content -LiteralPath $summaryPath

$jsonResults = $results | ForEach-Object {
    [pscustomobject]@{
        Area = $_.Area
        Name = $_.Name
        Command = $_.Command
        Status = $_.Status
        ExitCode = $_.ExitCode
        StartedAt = $_.StartedAt
        FinishedAt = $_.FinishedAt
        Duration = (Format-Duration $_.Duration)
        LogPath = $(if ($_.LogPath) { New-RelativePath $_.LogPath } else { "" })
    }
}

[pscustomobject]@{
    GeneratedAt = Get-Date
    ProjectRoot = $projectRoot
    OverallStatus = $overallStatus
    PassedSuites = $passed
    FailedSuites = $failed
    MissingSuites = $missing
    TotalSuites = $total
    DotNetSdk = $dotnetVersion
    Node = $nodeVersion
    Npm = $npmVersion
    PowerShell = "$($PSVersionTable.PSVersion)"
    Results = $jsonResults
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryJsonPath

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Overall: $overallStatus" -ForegroundColor ($(if ($overallStatus -eq "PASSED") { "Green" } else { "Red" }))
Write-Host "Passed suites:  $passed"
Write-Host "Failed suites:  $failed"
Write-Host "Missing suites: $missing"
Write-Host "Report: $summaryPath" -ForegroundColor Cyan
Write-Host "JSON:   $summaryJsonPath" -ForegroundColor Cyan
Write-Host ""

if ($overallStatus -ne "PASSED") {
    exit 1
}

exit 0
