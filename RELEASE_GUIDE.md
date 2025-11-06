# 自动发布指南

## 快速开始

### 1. 本地测试打包（可选）

```bash
# 只打包不发布
npm run app:build
```

输出文件在 `release/` 目录下。

### 2. 创建 Release（推荐方式）

```bash
# 步骤 1：创建并推送 tag
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 会自动：
- ✅ 构建应用
- ✅ 编译代码
- ✅ 打包 EXE
- ✅ 上传到 Release

### 3. 查看 Release

进入 GitHub 仓库 → **Releases** → 找到对应的 tag，即可下载 EXE 安装包

## 工作流细节

### 文件结构

```
.github/workflows/
└── auto-release.yml        # GitHub Actions 工作流
```

### 触发条件

| 触发方式 | 条件 |
|---------|------|
| **自动触发** | 推送标签：`v*`（如 v1.0.0） |
| **手动触发** | GitHub Actions → "Run workflow" |

### 输出文件

工作流自动上传以下文件到 Release：

```
release/
├── 1.0.0/
│   ├── MHAtomExcelTool_1.0.0.exe          # 安装程序
│   ├── MHAtomExcelTool_1.0.0.exe.blockmap # 增量更新
│   └── latest.yml                          # 版本信息
```

## 常见问题

### Q: 如何手动触发构建？

在 GitHub 仓库页面：
1. 进入 **Actions** 标签
2. 选择 **Auto Release EXE**
3. 点击 **Run workflow**

### Q: EXE 在哪里下载？

1. 进入仓库 **Releases** 页面
2. 找到对应版本的 Release
3. 下载 `*.exe` 文件

### Q: 如何更新版本号？

修改 `package.json` 中的 `version` 字段，然后创建新 tag：

```bash
# package.json: "version": "1.1.0"
git tag v1.1.0
git push origin v1.1.0
```

### Q: 能否跳过某次推送的自动构建？

可以，方法 1：不推送 tag
```bash
git commit -m "some changes"
git push origin main  # 只推送 commit，不推送 tag
```

方法 2：使用草稿发布（Draft）
在工作流中修改 `draft: true`，构建但不自动发布

### Q: 构建失败怎么办？

1. 进入 GitHub Actions 页面查看错误日志
2. 常见原因：
   - 缺少依赖：运行 `npm install`
   - TypeScript 错误：运行 `npm run ts` 检查
   - Vite 构建错误：运行 `npm run vite:build` 检查

## 高级配置

### 修改发布版本

编辑 `.github/workflows/auto-release.yml`：

```yaml
# 发布为预发布版本
prerelease: true

# 发布为草稿（不通知订阅者）
draft: true
```

### 修改上传文件

编辑 `files:` 部分：

```yaml
with:
  files: |
    release/**/*.exe
    release/**/*.yml
    # 添加其他文件：
    # release/**/*.zip
    # release/**/*.nsis.exe
```

### 同步到其他平台

可以在工作流后添加步骤上传到 OSS、CDN 等：

```yaml
- name: Upload to OSS
  run: |
    # 上传脚本
```

## 监控和日志

- 查看构建过程：GitHub Actions → auto-release.yml → 最新运行记录
- 查看发布状态：仓库 Releases 页面
- 调试问题：展开失败的 step 查看详细日志

---

**提示**：首次使用 GitHub Actions 时，可能需要授权 GitHub Token，已自动配置使用仓库默认 Token。
