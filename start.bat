@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo.
echo Cloud Drive: http://localhost:3000
echo Login: jeel
echo Password: 1234
echo.
npm start
pause