# Stop all Questrade microservices
Write-Host "Stopping all Node.js services..." -ForegroundColor Yellow

# Get all node processes
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Cyan

    foreach ($process in $nodeProcesses) {
        try {
            $commandLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($process.Id)").CommandLine

            # Check if it's related to your project
            if ($commandLine -match "questrade|portfolio|dividend") {
                Write-Host "Stopping: $commandLine" -ForegroundColor Red
                Stop-Process -Id $process.Id -Force
                Write-Host "✓ Stopped process $($process.Id)" -ForegroundColor Green
            }
        } catch {
            Write-Host "Could not stop process $($process.Id): $_" -ForegroundColor Red
        }
    }

    Write-Host "`nAll services stopped!" -ForegroundColor Green
} else {
    Write-Host "No Node.js processes found." -ForegroundColor Yellow
}

# Also stop any processes running on the specific ports
$ports = @(4001, 4002, 4003, 4004, 5000, 5173)

Write-Host "`nChecking for processes on ports: $($ports -join ', ')" -ForegroundColor Cyan

foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connection) {
        $processId = $connection.OwningProcess
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping process on port ${port}: $($process.ProcessName) (PID: $processId)" -ForegroundColor Red
            Stop-Process -Id $processId -Force
            Write-Host "✓ Freed port $port" -ForegroundColor Green
        }
    }
}

Write-Host "`n✅ All services stopped!" -ForegroundColor Green
