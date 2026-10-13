param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'Oil Perps Hyperliquid.lnk'
if ($Remove) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Host 'Demarrage automatique retire. Le programme et le JSON sont conserves.'
    exit 0
}
$executable = Join-Path $PSScriptRoot 'OilPerps.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'OilPerps.exe manque. Compilez avec build.cmd.' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executable
$shortcut.Arguments = '--background'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Oil Perps Hyperliquid - collecte chaque heure a HH:01'
$shortcut.Save()
Start-Process -FilePath $executable -ArgumentList '--background' -WindowStyle Hidden
Write-Host 'Collecteur lance et demarrage automatique installe pour votre session Windows.'
