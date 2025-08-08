@echo off
echo 启动后端服务
start cmd /k "cd /d %~dp0 && node ./src/server.js"
timeout /t 1 >nul
start "" "file:///C:/Users/Honor/Desktop/lexninja-editor/index.html"
