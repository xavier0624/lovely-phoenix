@echo off
echo Lovely Phoenix - 启动本地服务器
echo.
echo 浏览器打开 http://localhost:4567 即可查看
echo 按 Ctrl+C 关闭服务器
echo.
python -m http.server 4567
pause
