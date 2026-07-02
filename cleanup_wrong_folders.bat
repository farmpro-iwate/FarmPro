@echo off
echo FarmPro wrong folder cleanup
echo.

if exist client\server (
  echo Deleting client\server ...
  rmdir /s /q client\server
) else (
  echo client\server not found.
)

if exist server\client (
  echo Deleting server\client ...
  rmdir /s /q server\client
) else (
  echo server\client not found.
)

echo.
echo Done.
pause
