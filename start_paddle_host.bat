@echo off
rem ===========================================
rem   FoodIn Paddle 模型本地托管服务
rem   - 端口 8765（8000 易被 C-Lodop 抢占）
rem   - 根目录：脚本所在目录（即项目根目录）
rem   - 模型目录：_paddle_models\det 和 _paddle_models\rec
rem   - 停止：直接关闭本窗口
rem ===========================================
chcp 65001 >nul
title FoodIn Paddle 本地模型服务（端口 8765）
cd /d "%~dp0"

echo ================================================
echo   FoodIn Paddle 本地模型服务
echo ================================================
echo   服务目录：%cd%
echo   模型目录：%cd%\_paddle_models
echo   监听端口：8765  (避开 C-Lodop 的 8000)
echo   停止方式：直接关闭本窗口
echo ================================================
echo.
echo 使用步骤：
echo   1. 保持本窗口打开（关闭 = 停止服务）
echo   2. 浏览器打开（同一台电脑）：
echo        http://127.0.0.1:8765/index.html
echo      ^>^> 注意必须用 http 打开，不能直接双击 index.html
echo   3. F12 控制台执行：
echo        __foodin.setPaddleModelUrls(
echo          'http://127.0.0.1:8765/_paddle_models/det/model.json',
echo          'http://127.0.0.1:8765/_paddle_models/rec/model.json'
echo        )
echo        await __foodin.preloadPaddleModel()
echo.
echo ================================================
echo.

rem 检查模型目录是否存在
if not exist "_paddle_models\det\model.json" (
  echo [!] 警告：_paddle_models 目录下的模型文件未找到
  echo     请先运行：python paddle_models_dl.py 下载模型
  echo.
)

rem 检查 8765 端口是否被占
netstat -ano | findstr ":8765 " >nul
if %errorlevel%==0 (
  echo [!] 警告：8765 端口已被占用，请关掉占用进程后重试
  echo.
  pause
  exit /b 1
)

python -m http.server 8765 --bind 127.0.0.1
pause