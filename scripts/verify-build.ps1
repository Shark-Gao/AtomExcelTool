# 验证本地构建是否生成正确的文件
# 使用方法: pwsh scripts/verify-build.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "构建验证脚本" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 检查必要的目录和文件
$checks = @{
    "dist 目录" = "dist"
    "package.json" = "package.json"
    "electron-builder.yml" = "electron-builder.yml"
}

Write-Host "`n📋 检查项目文件..." -ForegroundColor Yellow

foreach ($check in $checks.GetEnumerator()) {
    $path = $check.Value
    if (Test-Path $path) {
        Write-Host "  ✅ $($check.Key): 存在" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($check.Key): 不存在" -ForegroundColor Red
    }
}

# 检查构建输出
Write-Host "`n🔍 检查构建输出..." -ForegroundColor Yellow

if (Test-Path "release") {
    $exeFiles = Get-ChildItem -Path "release" -Recurse -Include "*.exe" -ErrorAction SilentlyContinue
    $ymlFiles = Get-ChildItem -Path "release" -Recurse -Include "*.yml" -ErrorAction SilentlyContinue
    $blockFiles = Get-ChildItem -Path "release" -Recurse -Include "*.blockmap" -ErrorAction SilentlyContinue
    
    if ($exeFiles.Count -gt 0) {
        Write-Host "  ✅ 发现 EXE 文件 ($($exeFiles.Count) 个):" -ForegroundColor Green
        $exeFiles | ForEach-Object {
            $sizeMB = [math]::Round($_.Length / 1MB, 2)
            Write-Host "     - $($_.Name) ($sizeMB MB)" -ForegroundColor Green
        }
    } else {
        Write-Host "  ❌ 未发现 EXE 文件" -ForegroundColor Red
    }
    
    if ($ymlFiles.Count -gt 0) {
        Write-Host "  ✅ 发现版本文件 ($($ymlFiles.Count) 个):" -ForegroundColor Green
        $ymlFiles | ForEach-Object {
            Write-Host "     - $($_.Name)" -ForegroundColor Green
        }
    }
    
    if ($blockFiles.Count -gt 0) {
        Write-Host "  ✅ 发现增量更新文件 ($($blockFiles.Count) 个)" -ForegroundColor Green
    }
} else {
    Write-Host "  ❌ release 目录不存在" -ForegroundColor Red
    Write-Host "`n  💡 请先运行: npm run app:build" -ForegroundColor Yellow
}

# 显示完整文件列表
if (Test-Path "release") {
    Write-Host "`n📁 release 目录完整结构:" -ForegroundColor Yellow
    Get-ChildItem -Path "release" -Recurse | ForEach-Object {
        $indent = [math]::Floor(($_.FullName.Split([System.IO.Path]::DirectorySeparatorChar).Count - "release".Split([System.IO.Path]::DirectorySeparatorChar).Count) * 2)
        $prefix = " " * $indent
        if ($_.PSIsContainer) {
            Write-Host "$prefix📂 $($_.Name)/" -ForegroundColor Cyan
        } else {
            $size = [math]::Round($_.Length / 1MB, 2)
            Write-Host "$prefix📄 $($_.Name) ($size MB)" -ForegroundColor White
        }
    }
}

# 建议
Write-Host "`n💡 下一步建议:" -ForegroundColor Yellow

if (!(Test-Path "release")) {
    Write-Host "  1. 运行: npm install"
    Write-Host "  2. 运行: npm run vite:build"
    Write-Host "  3. 运行: npm run ts"
    Write-Host "  4. 运行: npm run app:build"
    Write-Host "  5. 重新运行此脚本验证"
} elseif ((Get-ChildItem -Path "release" -Recurse -Include "*.exe" -ErrorAction SilentlyContinue).Count -eq 0) {
    Write-Host "  1. 检查 electron-builder.yml 配置"
    Write-Host "  2. 查看 npm run app:build 的完整输出"
    Write-Host "  3. 确认 dist 目录中有编译后的文件"
} else {
    Write-Host "  ✅ 构建成功! 可以推送到 GitHub："
    Write-Host "     git tag v1.0.0"
    Write-Host "     git push origin v1.0.0"
}

Write-Host "`n================================" -ForegroundColor Cyan
