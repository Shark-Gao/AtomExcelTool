# 依赖使用情况分析

## 生产依赖 (dependencies)

### ✅ 已使用的依赖

| 依赖 | 版本 | 用途 | 位置 |
|------|------|------|------|
| **exceljs** | ^4.4.0 | 读写 Excel 文件 | `src/electron/main/main.ts` |
| **reflect-metadata** | ^0.2.2 | 装饰器元数据反射 | `src/electron/main/DelegateMetadataGenerator.ts`, `src/electron/main/DelegateDecorators.ts` |
| **vue** | ^3.5.22 | 前端框架 | `src/App.vue`, `src/components/**` |

### ❌ 未使用的依赖（可以删除）

| 依赖 | 版本 | 原因 |
|------|------|------|
| **decimal.js** | ^10.6.0 | 代码中搜索不到导入和使用 |
| **luxon** | ^3.7.2 | 代码中搜索不到导入和使用 |

---

## 开发依赖 (devDependencies)

### ✅ 已使用的依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| **vue** | ^3.5.22 | Vue 框架 |
| **vite** | ^7.1.12 | 打包工具 |
| **@vitejs/plugin-vue** | ^6.0.1 | Vite Vue 插件 |
| **typescript** | ~5.9.3 | TypeScript 编译 |
| **vue-tsc** | ^3.1.1 | Vue TypeScript 编译 |
| **tailwindcss** | ^4.1.16 | 样式框架 |
| **@tailwindcss/vite** | ^4.1.16 | Tailwind Vite 插件 |
| **daisyui** | ^5.3.8 | UI 组件库 |
| **electron** | ^38.4.0 | 桌面应用框架 |
| **electron-builder** | ^26.0.12 | 打包工具 |
| **eslint** | ^9.39.0 | 代码检查 |
| **@types/node** | ^24.9.1 | Node.js 类型定义 |
| **@vue/tsconfig** | ^0.8.1 | Vue TypeScript 配置 |
| **concurrently** | ^9.2.1 | 并发运行命令 |

---

## 建议

### 删除不用的依赖

```bash
npm uninstall decimal.js luxon
```

**预期效果：** 可减少约 200-300KB 的包体积（打包后）

### 依赖检查命令

查看哪些依赖没有被使用：
```bash
npm install -g depcheck
depcheck --ignores=reflect-metadata,vue,exceljs,vite,typescript,electron,electron-builder,tailwindcss,eslint
```

---

## 最终依赖清单

### 保留的生产依赖
- ✅ **exceljs** - Excel 文件操作（必需）
- ✅ **reflect-metadata** - 装饰器支持（必需）
- ✅ **vue** - 前端框架（必需）

### 保留的开发依赖
所有当前的开发依赖都在使用中，无需删除

### 可删除的依赖
- ❌ **decimal.js**（未使用）
- ❌ **luxon**（未使用）

---

## 其他优化建议

1. **代码压缩**（已配置）
   - Vite 中已启用 terser 压缩
   - 已禁用 sourcemap

2. **代码分割**（已配置）
   - 已在 Vite 中配置 manualChunks

3. **多语言清理**（已自动化）
   - afterPack 钩子会清理不需要的语言包

4. **Electron 优化**
   - 已配置 asar 打包
   - 已清理 node_modules 不必要文件
