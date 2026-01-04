@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo         MHAtomExcelTool 打包脚本
echo ========================================

REM 关闭 codebuddy 和相关进程
echo.
echo [1/4] 正在关闭进程...
taskkill /F /IM CodeBuddy.exe 2>nul
taskkill /F /IM "CodeBuddy CN.exe" 2>nul
taskkill /F /IM electron.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak

REM 清理之前的构建输出
echo.
echo [2/4] 正在清理旧的构建文件...
if exist dist (
  rmdir /s /q dist
  echo   ✓ dist 文件夹已删除
)
if exist release\0.0.2 (
  rmdir /s /q release\0.0.2
  echo   ✓ release\0.0.2 文件夹已删除
)

REM 开始打包
echo.
echo [3/4] 正在打包应用...
cd /d g:\workspace\MHAtomExcelTool
call npm run app:build

REM 检查打包结果
echo.
echo [4/4] 检查打包结果...
if exist release\0.0.2 (
  echo.
  echo ========================================
  echo     ✓ 打包成功！
  echo ========================================
  echo 输出位置: g:\workspace\MHAtomExcelTool\release\0.0.2
  echo.
  
  REM 复制文件到目标目录
  echo [5/5] 正在复制文件到目标目录...
  set SOURCE_DIR=g:\workspace\MHAtomExcelTool\release\0.0.2\win-unpacked
  set TARGET_DIR=K:\MHA_Client_main\MHAGame\Tools\MHAtomExcelTool
  
  REM 清理目标目录（保留 config 目录）
  echo   正在清理目标目录（保留 config 目录）...
  for /d %%i in (!TARGET_DIR!\*) do (
    if /i not "%%~nxi"=="config" (
      rmdir /s /q "%%i" 2>nul
      echo   ✓ 已删除 %%~nxi
    )
  )
  
  for %%i in (!TARGET_DIR!\*) do (
    if not "%%i"=="!TARGET_DIR!\config" (
      del /q "%%i" 2>nul
    )
  )
  
  REM 比较并只 checkout 有变化的文件
  echo.
  echo [5/6] 正在检测变化的文件并 P4 checkout...
  set CHANGED_COUNT=0
  
  REM 遍历源目录所有文件，比较与目标文件的差异
  for /r "!SOURCE_DIR!" %%F in (*) do (
    set "SRC_FILE=%%F"
    set "REL_PATH=%%F"
    set "REL_PATH=!REL_PATH:%SOURCE_DIR%\=!"
    set "DST_FILE=!TARGET_DIR!\!REL_PATH!"
    
    REM 检查目标文件是否存在
    if exist "!DST_FILE!" (
      REM 使用 fc 比较文件内容
      fc /b "!SRC_FILE!" "!DST_FILE!" >nul 2>&1
      if !errorlevel! neq 0 (
        REM 文件有变化，执行 p4 edit
        p4 edit "!DST_FILE!" >nul 2>&1
        set /a CHANGED_COUNT+=1
      )
    ) else (
      REM 新文件，需要 p4 add（复制后再 add）
      set /a CHANGED_COUNT+=1
    )
  )
  echo   ✓ 检测到 !CHANGED_COUNT! 个文件有变化
  
  REM 复制新文件
  echo.
  echo [6/6] 正在复制新文件...
  xcopy "!SOURCE_DIR!\*" "!TARGET_DIR!\" /E /Y /I >nul
  
  if !errorlevel! equ 0 (
    echo.
    echo ========================================
    echo     ✓ 文件复制成功！
    echo ========================================
    echo 目标位置: !TARGET_DIR!
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
