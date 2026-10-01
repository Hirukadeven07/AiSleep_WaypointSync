# Nightly Postgres backup for Windows (Docker Desktop). Same idea as backup-db.sh.
#   $env:BACKUP_DIR  where dumps are kept          (default: <repo>\backups)
#   $env:KEEP_DAYS   delete dumps older than this  (default: 14)
#   $env:BACKUP_COPY_DIR  optional second folder, e.g. a OneDrive or external drive path
#
# Task Scheduler: powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Waypoint Sync\scripts\backup-db.ps1"
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'waypoint' }
$db   = if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'waypoint' }
$dir  = if ($env:BACKUP_DIR)    { $env:BACKUP_DIR }    else { Join-Path (Get-Location) 'backups' }
$keep = if ($env:KEEP_DAYS)     { [int]$env:KEEP_DAYS } else { 14 }

New-Item -ItemType Directory -Force $dir | Out-Null
$name = "waypoint-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql.gz"
$file = Join-Path $dir $name

# dump + gzip inside the container, then copy the file out (piping binary through Windows PowerShell 5.1 corrupts it)
docker compose exec -T db sh -c "pg_dump -U $user -d $db --no-owner | gzip > /tmp/backup.sql.gz"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
docker compose cp db:/tmp/backup.sql.gz "$file.part"
if ($LASTEXITCODE -ne 0 -or (Get-Item "$file.part").Length -eq 0) { Remove-Item "$file.part" -Force -ErrorAction SilentlyContinue; throw 'copy from container failed' }
docker compose exec -T db rm -f /tmp/backup.sql.gz
Move-Item "$file.part" $file
Write-Output "$(Get-Date -Format o) wrote $file"

Get-ChildItem $dir -Filter 'waypoint-*.sql.gz' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-$keep) | Remove-Item -Force

if ($env:BACKUP_COPY_DIR) { Copy-Item $file $env:BACKUP_COPY_DIR; Write-Output "copied to $env:BACKUP_COPY_DIR" }
