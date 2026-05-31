@echo off
setlocal

REM ------------------------------------------------------------
REM Script para correr a transcrição automática via Node.js
REM Chamado pelo Programador de Tarefas do Windows
REM Regista toda a saída num ficheiro de log
REM ------------------------------------------------------------

REM Pasta onde está este ficheiro .bat
set "PROJECT_DIR=%~dp0"
for %%I in ("%PROJECT_DIR%\.") do set "PROJECT_DIR=%%~fI"

REM Nome do script Node
set "NODE_SCRIPT=radia.js"

REM Pasta dos logs
set "LOG_DIR=%PROJECT_DIR%\logs"

REM Criar pasta de logs se não existir
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Criar timestamp seguro para nome de ficheiro
for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "TIMESTAMP=%%a"

set "LOG_FILE=%LOG_DIR%\transcricao_%TIMESTAMP%.log"

echo ================================================== >> "%LOG_FILE%"
echo Inicio: %date% %time% >> "%LOG_FILE%"
echo Pasta do projecto: %PROJECT_DIR% >> "%LOG_FILE%"
echo Script Node: %NODE_SCRIPT% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

cd /d "%PROJECT_DIR%"

REM Correr o script Node e guardar stdout + stderr no log
node "%NODE_SCRIPT%" >> "%LOG_FILE%" 2>&1

set "EXIT_CODE=%ERRORLEVEL%"

echo. >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"
echo Fim: %date% %time% >> "%LOG_FILE%"
echo Codigo de saida: %EXIT_CODE% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"

exit /b %EXIT_CODE%
