@echo off
set PORT=8080
set URL=http://127.0.0.1:%PORT%
set ROOT=%~dp0..

echo Starting RuneBags online-ready server at %URL%

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo npm was not found on PATH.
  echo Install Node.js and run this file again.
  exit /b 1
)

pushd %ROOT%

if not exist node_modules (
  echo Installing dependencies...
  npm install
  if %errorlevel% neq 0 (
    popd
    echo Failed to install dependencies.
    exit /b 1
  )
)

start %URL%
npm run start:server
popd
