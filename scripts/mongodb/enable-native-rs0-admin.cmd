@echo off
echo Agrivio: enable local MongoDB single-node rs0 (Administrator)
cd /d "%~dp0..\.."
node scripts\mongodb\configure-native-windows.mjs --write-config
if errorlevel 1 exit /b 1
call npm run db:init
call npm run db:status
pause
