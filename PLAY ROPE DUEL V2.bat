@echo off
title PLAY ROPE DUEL V2
set "URL=https://shojaee76-cmyk.github.io/rope-duel-v2/"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" "%URL%"
  exit /b 0
)
echo Chrome was not found at:
echo %CHROME%
echo Open this URL manually: %URL%
pause
