# 主线程迁移说明

## 概述
将 `deParseJsonToExpression` 函数从渲染进程迁移到主线程，通过 IPC 通信调用。

## 修改内容

### 1. Preload 配置 (`src/electron/preload/preload.ts`)

添加新的 IPC 方法暴露到渲染进程：

```typescript
deParseJsonToExpression: (payload: { json: any }) => 
  ipcRenderer.invoke('delegate:deparse-json-to-expression', payload) as Promise<{
    ok: boolean;
    expression?: string;
    error?: string;
  }>
```

### 2. 类型定义 (`src/env.d.ts`)

更新 `DelegateBridge` 接口：

```typescript
interface DelegateBridge {
  // ... 其他方法 ...
  deParseJsonToExpression: (payload: { json: any }) => Promise<{ 
    ok: boolean; 
    expression?: string; 
    error?: string 
  }>
}
```

### 3. 主线程处理 (`src/electron/main/main.ts`)

#### 导入
```typescript
import { deParseJsonToExpression } from './DeParseJsonToExpression';
```

#### IPC 处理器
```typescript
ipcMain.handle('delegate:deparse-json-to-expression', async (_event, payload: { json: any }) => {
    try {
        if (!payload.json || typeof payload.json !== 'object') {
            return { ok: false, error: 'JSON 对象为空或无效。' };
        }

        const expression = deParseJsonToExpression(payload.json);
        if (!expression) {
            return { ok: false, error: '反向解析失败，返回值为空。' };
        }

        return { ok: true, expression };
    } catch (error) {
        const message = error instanceof Error ? error.message : '反向解析 JSON 时发生未知错误。';
        console.error('[delegate:deparse-json-to-expression]:', message);
        return { ok: false, error: message };
    }
});
```

### 4. 渲染进程调用 (`src/App.vue`)

**修改前：**
```typescript
async function applyNormalizedObjectByColumnName(normalized: ParsedClassObject, updateColumnName: string) {
  if (selectedRowName.value && window.delegateBridge) {
    const rawValue = deParseJsonToExpression(normalized);
    conditionFieldsMap[selectedRowName.value][updateColumnName] = {
      raw: rawValue,
      parsed: normalized,
      json: JSON.stringify(normalized, null, 2)
    }
    editableRecord[updateColumnName] = rawValue
  }
}
```

**修改后：**
```typescript
async function applyNormalizedObjectByColumnName(normalized: ParsedClassObject, updateColumnName: string) {
  if (selectedRowName.value && window.delegateBridge) {
    try {
      const result = await window.delegateBridge.deParseJsonToExpression({ json: normalized });
      if (result.ok && result.expression) {
        conditionFieldsMap[selectedRowName.value][updateColumnName] = {
          raw: result.expression,
          parsed: normalized,
          json: JSON.stringify(normalized, null, 2)
        }
        editableRecord[updateColumnName] = result.expression
      } else {
        console.error('反向解析失败:', result.error);
      }
    } catch (error) {
      console.error('调用反向解析接口失败:', error);
    }
  }
}
```

## 优势

1. **安全性**：主线程处理敏感的解析逻辑
2. **性能**：缓存机制在主线程中初始化一次，后续调用都使用缓存
3. **可维护性**：业务逻辑集中在主线程，便于管理
4. **错误处理**：统一的错误处理和日志记录

## 调用流程

```
渲染进程 (App.vue)
    ↓
window.delegateBridge.deParseJsonToExpression()
    ↓
IPC 通信
    ↓
主线程 (main.ts)
    ↓
deParseJsonToExpression() [使用缓存]
    ↓
返回结果
    ↓
渲染进程处理结果
```

## 注意事项

1. 调用现在是异步的，需要使用 `await`
2. 需要检查返回结果的 `ok` 字段
3. 错误信息在 `error` 字段中
4. 表达式在 `expression` 字段中
