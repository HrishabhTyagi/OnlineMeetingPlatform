# Online Meeting Platform - Service Launcher with Docker Support
# Stops existing local app processes, verifies Docker Compose services, then starts the platform.

$ErrorActionPreference = "Continue"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Online Meeting Platform - Service Launcher" -ForegroundColor Cyan
Write-Host "With Docker & Local Services Support" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Define service paths
$projectRoot = "D:\Projects\OnlineMeetingPlatform"
$gatewayPath = "$projectRoot\src\Gateway\ApiGateway"
$userServicePath = "$projectRoot\src\Services\UserService"
$meetingServicePath = "$projectRoot\src\Services\MeetingService"
$notificationServicePath = "$projectRoot\src\Services\NotificationService"
$frontendPath = "$projectRoot\src\Frontend\meeting-app"

# Define ports
$gatewayPort = 5000
$userServicePort = 5001
$meetingServicePort = 5002
$notificationServicePort = 5003
$frontendPort = 5173
$localAppPorts = @($gatewayPort, $userServicePort, $meetingServicePort, $notificationServicePort, $frontendPort)

# Docker settings
$dockerComposeFile = "$projectRoot\docker-compose.yml"
$useDocker = Test-Path $dockerComposeFile

function Invoke-DockerCompose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    Push-Location $projectRoot
    try {
        $dockerComposePlugin = docker compose version 2>$null
        if ($LASTEXITCODE -eq 0) {
            & docker compose @Arguments
        } else {
            & docker-compose @Arguments
        }
    } finally {
        Pop-Location
    }
}

function Check-Docker {
    try {
        $dockerVersion = docker --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker installed: $dockerVersion" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "Docker not found in PATH" -ForegroundColor Red
    }

    return $false
}

function Check-DockerRunning {
    try {
        docker ps >$null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker Desktop is running" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "Docker Desktop is not running" -ForegroundColor Red
    }

    return $false
}

function Stop-ProcessByIdSafe {
    param(
        [int]$ProcessId,
        [string]$Reason
    )

    if ($ProcessId -eq $PID) {
        return
    }

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        Write-Host "Stopping $($process.ProcessName) (PID $ProcessId) - $Reason" -ForegroundColor Yellow
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    } catch {
        Write-Host "Could not stop PID $ProcessId : $_" -ForegroundColor DarkYellow
    }
}

function Stop-ProcessesOnPort {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($connection in $connections) {
            Stop-ProcessByIdSafe -ProcessId $connection.OwningProcess -Reason "port $port is already in use"
        }
    }
}

function Stop-ProjectProcesses {
    $escapedRoot = [Regex]::Escape($projectRoot)
    $processes = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and
            $_.ProcessId -ne $PID -and
            $_.CommandLine -match $escapedRoot -and
            (
                $_.Name -in @("dotnet.exe", "node.exe", "npm.cmd", "powershell.exe", "pwsh.exe", "ApiGateway.exe", "UserService.exe", "MeetingService.exe", "NotificationService.exe") -or
                $_.CommandLine -match "npm run dev|dotnet run|ApiGateway|UserService|MeetingService|NotificationService"
            )
        }

    foreach ($process in $processes) {
        Stop-ProcessByIdSafe -ProcessId $process.ProcessId -Reason "old project process"
    }
}

function Stop-ExistingApplications {
    Write-Host "Stopping existing local application processes..." -ForegroundColor Cyan
    Stop-ProcessesOnPort -Ports $localAppPorts
    Stop-ProjectProcesses
    Start-Sleep -Seconds 2
    Write-Host "Local application cleanup complete." -ForegroundColor Green
    Write-Host ""
}

function Get-ComposeServices {
    if (-not $useDocker) {
        return @()
    }

    $services = Invoke-DockerCompose "config" "--services" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $services) {
        return @()
    }

    return @($services | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Ensure-DockerComposeServices {
    if (-not $useDocker) {
        Write-Host "No docker-compose.yml found. Skipping Docker startup." -ForegroundColor Yellow
        return $true
    }

    Write-Host "Checking Docker Compose containers..." -ForegroundColor Cyan

    $dockerInstalled = Check-Docker
    if (-not $dockerInstalled) {
        return $false
    }

    $dockerRunning = Check-DockerRunning
    if (-not $dockerRunning) {
        Write-Host "Start Docker Desktop and rerun this script." -ForegroundColor Red
        return $false
    }

    $services = Get-ComposeServices
    if ($services.Count -eq 0) {
        Write-Host "Could not read services from docker-compose.yml." -ForegroundColor Red
        return $false
    }

    Write-Host "Compose services found: $($services -join ', ')" -ForegroundColor Green
    Write-Host "Ensuring Docker containers are running..." -ForegroundColor Yellow
    Invoke-DockerCompose "up" "-d"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to start Docker Compose services." -ForegroundColor Red
        return $false
    }

    $deadline = (Get-Date).AddSeconds(45)
    do {
        $runningServices = @(Invoke-DockerCompose "ps" "--services" "--filter" "status=running" 2>$null)
        $missingServices = @($services | Where-Object { $_ -notin $runningServices })

        if ($missingServices.Count -eq 0) {
            Write-Host "All Docker Compose services are running: $($services -join ', ')" -ForegroundColor Green
            Write-Host ""
            return $true
        }

        Write-Host "Waiting for Docker services: $($missingServices -join ', ')" -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    Write-Host "Some Docker Compose services are not running: $($missingServices -join ', ')" -ForegroundColor Red
    Invoke-DockerCompose "ps"
    Write-Host ""
    return $false
}

function Wait-ForPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) {
            return $true
        }

        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Start-LocalService {
    param (
        [string]$ServiceName,
        [string]$ServicePath,
        [int]$Port,
        [string]$StartCommand
    )

    Write-Host "Starting $ServiceName on port $Port..." -ForegroundColor Yellow

    if (-not (Test-Path $ServicePath)) {
        Write-Host "Error: $ServiceName path not found: $ServicePath" -ForegroundColor Red
        return $false
    }

    try {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$ServicePath'; $StartCommand" -WindowStyle Normal

        if (Wait-ForPort -Port $Port -TimeoutSeconds 45) {
            Write-Host "$ServiceName started at http://localhost:$Port" -ForegroundColor Green
            return $true
        }

        Write-Host "$ServiceName was launched, but port $Port did not start listening in time." -ForegroundColor Yellow
        return $false
    } catch {
        Write-Host "Error starting $ServiceName : $_" -ForegroundColor Red
        return $false
    }
}

function Start-Frontend {
    Write-Host "Starting Frontend UI on port $frontendPort..." -ForegroundColor Yellow

    if (-not (Test-Path $frontendPath)) {
        Write-Host "Error: Frontend path not found: $frontendPath" -ForegroundColor Red
        return $false
    }

    try {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm run dev" -WindowStyle Normal

        if (Wait-ForPort -Port $frontendPort -TimeoutSeconds 45) {
            Write-Host "Frontend UI started at http://localhost:$frontendPort" -ForegroundColor Green
            return $true
        }

        Write-Host "Frontend UI was launched, but port $frontendPort did not start listening in time." -ForegroundColor Yellow
        return $false
    } catch {
        Write-Host "Error starting Frontend UI: $_" -ForegroundColor Red
        return $false
    }
}

Write-Host "Performing pre-flight checks..." -ForegroundColor Cyan
Write-Host ""

if ($useDocker) {
    Write-Host "Found docker-compose.yml" -ForegroundColor Green
} else {
    Write-Host "No docker-compose.yml found" -ForegroundColor Yellow
}

Write-Host ""

Stop-ExistingApplications
$dockerReady = Ensure-DockerComposeServices

if (-not $dockerReady) {
    Write-Host "Docker Compose services are required for this application. Fix Docker and rerun the script." -ForegroundColor Red
    exit 1
}

Write-Host "Starting local .NET services..." -ForegroundColor Cyan
Write-Host ""

$allStarted = $true
$allStarted = (Start-LocalService -ServiceName "API Gateway" -ServicePath $gatewayPath -Port $gatewayPort -StartCommand "dotnet run") -and $allStarted
$allStarted = (Start-LocalService -ServiceName "User Service" -ServicePath $userServicePath -Port $userServicePort -StartCommand "dotnet run") -and $allStarted
$allStarted = (Start-LocalService -ServiceName "Meeting Service" -ServicePath $meetingServicePath -Port $meetingServicePort -StartCommand "dotnet run") -and $allStarted
$allStarted = (Start-LocalService -ServiceName "Notification Service" -ServicePath $notificationServicePath -Port $notificationServicePort -StartCommand "dotnet run") -and $allStarted
$allStarted = (Start-Frontend) -and $allStarted

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

if ($allStarted) {
    Write-Host "All services started successfully." -ForegroundColor Green
} else {
    Write-Host "Some services failed to start. See errors above." -ForegroundColor Yellow
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Docker Status:" -ForegroundColor Cyan
if ($useDocker) {
    Invoke-DockerCompose "ps"
} else {
    Write-Host "  docker-compose.yml: Not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Local Services Status:" -ForegroundColor Cyan
Write-Host "  API Gateway:          http://localhost:$gatewayPort" -ForegroundColor Green
Write-Host "  User Service:         http://localhost:$userServicePort" -ForegroundColor Green
Write-Host "  Meeting Service:      http://localhost:$meetingServicePort" -ForegroundColor Green
Write-Host "  Notification Service: http://localhost:$notificationServicePort" -ForegroundColor Green
Write-Host "  Frontend UI:          http://localhost:$frontendPort" -ForegroundColor Green
Write-Host "  Test Email Inbox:     http://localhost:8025" -ForegroundColor Green
Write-Host ""

Write-Host "Access Application:" -ForegroundColor Cyan
Write-Host "  Web UI:               http://localhost:$frontendPort" -ForegroundColor Green
Write-Host "  Swagger API Docs:     http://localhost:$gatewayPort/swagger/index.html" -ForegroundColor Green
Write-Host "  Test Email Inbox:     http://localhost:8025" -ForegroundColor Green
Write-Host ""

Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "  View Docker logs:     docker compose logs -f" -ForegroundColor Cyan
Write-Host "  Stop Docker:          docker compose down" -ForegroundColor Cyan
Write-Host "  Port in use:          netstat -ano | findstr :PORT_NUMBER" -ForegroundColor Cyan
Write-Host "  Kill process:         taskkill /PID <PID> /F" -ForegroundColor Cyan
Write-Host "  Check .NET:           dotnet --version" -ForegroundColor Cyan
Write-Host "  Check Node:           node --version" -ForegroundColor Cyan
Write-Host ""

Write-Host "Note: Keep these windows open. Close them to stop the services." -ForegroundColor Yellow
Write-Host "      Rerunning this script will stop old local app processes first." -ForegroundColor Yellow
Write-Host ""
