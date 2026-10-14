@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo         MHAtomExcelTool 打包脚本
echo ========================================

REM 仅关闭本工具正在运行的实例（避免打包/复制时 exe 与文件被占用）
REM 注意：不会关闭 CodeBuddy / IDE / node，避免影响正在进行的开发工作
echo.
echo [1/4] 正在关闭本工具正在运行的实例（不影响 IDE）...
taskkill /F /IM MHAtomExcelTool.exe 2>nul
taskkill /F /IM electron.exe 2>nul
timeout /t 2 /nobreak

REM 清理之前的构建输出
echo.
echo [2/4] 正在清理旧的构建文件...
if exist dist (
  rmdir /s /q dist
  echo   ✓ dist 文件夹已删除
)
if exist release\1.0.0 (
  rmdir /s /q release\1.0.0
  echo   ✓ release\1.0.0 文件夹已删除
)

REM 开始打包
echo.
echo [3/4] 正在打包应用...
cd /d "%~dp0"
call npm run app:build

REM 检查打包结果
echo.
echo [4/4] 检查打包结果...
if exist release\1.0.0 (
  echo.
  echo ========================================
  echo     ✓ 打包成功！
  echo ========================================
  echo 输出位置: %~dp0release\1.0.0
  echo.
  
  REM 复制文件到目标目录
  echo [5/6] 正在复制文件到目标目录...
  set SOURCE_DIR=%~dp0release\1.0.0\win-unpacked
  REM 上报地址放在 exe 同目录；打包结果带默认配置，目标目录已有配置时保留用户修改。
  copy /Y "%~dp0telemetry.json" "!SOURCE_DIR!\telemetry.json" >nul
  if errorlevel 1 (
    echo     上报配置复制失败，停止部署。
    pause
    exit /b 1
  )
  set "DEFAULT_TARGET=K:\MHA_Client_main\MHAGame\Tools\MHAtomExcelTool"
  echo.
  echo   默认部署目录: !DEFAULT_TARGET!
  set /p "TARGET_DIR=  请输入打包输出（部署）目录，直接回车使用默认值: "
  if "!TARGET_DIR!"=="" set "TARGET_DIR=!DEFAULT_TARGET!"
  set TARGET_DIR=!TARGET_DIR:"=!
  echo   本次部署目录: !TARGET_DIR!
  
  REM 清理目标目录（保留 config 目录）
  echo.
  echo   正在清理目标目录（保留 config 目录）...
  for /d %%i in (!TARGET_DIR!\*) do (
    if /i not "%%~nxi"=="config" (
      attrib -r "%%i\*" /s >nul 2>&1
      rmdir /s /q "%%i" 2>nul
    )
  )
  
  for %%i in (!TARGET_DIR!\*) do (
    if /i not "%%~nxi"=="config" (
      if /i not "%%~nxi"=="telemetry.json" (
        attrib -r "%%i" >nul 2>&1
        del /f /q "%%i" 2>nul
      )
    )
  )
  echo   ✓ 目标目录已清理
  
  REM 复制新文件
  echo.
  echo   正在复制新文件...
  robocopy "!SOURCE_DIR!" "!TARGET_DIR!" /E /XF telemetry.json /R:2 /W:1 >nul
  set "COPY_RESULT=!ERRORLEVEL!"
  if !COPY_RESULT! LSS 8 (
    if not exist "!TARGET_DIR!\telemetry.json" (
      copy /Y "!SOURCE_DIR!\telemetry.json" "!TARGET_DIR!\telemetry.json" >nul
      if errorlevel 1 set "COPY_RESULT=8"
    )
  )
  
  if !COPY_RESULT! LSS 8 (
    echo   ✓ 文件复制成功
    
    REM 使用 p4 reconcile 自动检测变化并标记文件
    echo.
    echo [6/6] 正在执行 P4 reconcile...
    p4 reconcile "!TARGET_DIR!\..."
    
    echo.
    echo ========================================
    echo     ✓ 打包完成！
    echo ========================================
    echo 目标位置: !TARGET_DIR!
    echo 请检查 P4 pending changelist 并提交
  ) else (
    echo.
    echo ========================================
    echo     ✗ 文件复制失败！
    echo ========================================
    echo 请检查目标目录权限
  )
  
  echo.
  pause
) else (
  echo.
  echo ========================================
  echo     ✗ 打包失败！
  echo ========================================
  echo 请检查上方的错误信息
  echo.
  pause
)
