@echo off
if exist "%SystemRoot%\System32\chcp.com" (
    "%SystemRoot%\System32\chcp.com" 65001 >nul 2>&1
)
title Upload Automatico para o GitHub - CobbleSaS Launcher
color 0B

echo ========================================================
echo        BEM-VINDO AO UPLOADER DO COBBLESAS LAUNCHER
echo ========================================================
echo.
echo Preparando para empacotar e enviar seus arquivos...
echo Repositorio destino: https://github.com/dennyun/CobbleSaS-Launcher
echo.

:: Garante que estamos na pasta do script
cd /d "%~dp0"

:: Valida e garante que icon.png tenha no minimo 1024x1024 para o build de Mac/Windows/Linux
if exist "assets\icon.png" (
    echo [1/4] Verificando e garantindo resolucao dos icones...
    powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $p='assets\icon.png'; if(Test-Path $p){ $b=[System.IO.File]::ReadAllBytes($p); $ms=New-Object System.IO.MemoryStream(,$b); $img=[System.Drawing.Image]::FromStream($ms); if($img.Width -lt 512 -or $img.Height -lt 512){ $bmp=New-Object System.Drawing.Bitmap(1024,1024,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.DrawImage($img,0,0,1024,1024); $g.Dispose(); $img.Dispose(); $ms.Dispose(); $s=New-Object System.IO.MemoryStream; $bmp.Save($s,[System.Drawing.Imaging.ImageFormat]::Png); [System.IO.File]::WriteAllBytes($p,$s.ToArray()); $s.Dispose(); $bmp.Dispose(); Write-Output 'Icone otimizado para 1024x1024 com sucesso.'; } else { $img.Dispose(); $ms.Dispose(); } }" 2>nul
)

:: Inicializa o Git caso ainda nao exista
git init >nul 2>&1

:: Garante que a branch principal se chama "main"
git branch -M main >nul 2>&1

:: Configura o caminho do repositorio remoto
git remote remove origin 2>nul
git remote add origin https://github.com/dennyun/CobbleSaS-Launcher.git

:: Adiciona todas as pastas e arquivos modificados
echo [2/4] Detectando arquivos modificados...
git add -A

:: Pega a data e hora do Windows nativamente
set mydate=%date%
set mytime=%time:~0,5%

echo [3/4] Salvando o historico (Commit)...
git commit -m "Atualizacao do Launcher - %mydate% as %mytime%" >nul 2>&1

:: Envia para os servidores do GitHub
echo [4/4] Enviando arquivos para o GitHub... (Aguarde o envio)
git push -u origin main --force

echo.
echo ========================================================
echo                    UPLOAD CONCLUIDO!
echo ========================================================
echo.
echo Acompanhe a geracao automatica dos executaveis:
echo https://github.com/dennyun/CobbleSaS-Launcher/actions
echo.
pause
