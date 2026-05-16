@echo off
title BrawlNet Fighting Game Server
color 0B
echo.
echo  Installing dependencies (first run only)...
call npm install --silent
echo.
echo  Starting BrawlNet server...
echo  Keep this window open while playing!
echo.
node server.js
pause
