# 缓存优化说明

## 优化目标
提高 `deParseJsonToExpression` 函数的性能，避免重复遍历 `FunctionNameToDelegate` 映射。

## 实现方案

### 1. 添加缓存变量
```typescript
let classNameToFunctionNameCache: Map<string, string> | null = null;
```

### 2. 初始化缓存函数
```typescript
function initializeClassNameCache(): Map<string, string> {
  if (classNameToFunctionNameCache === null) {
    classNameToFunctionNameCache = new Map();
    for (const [functionName, delegateClass] of FunctionNameToDelegate.entries()) {
      if (delegateClass.name) {
        classNameToFunctionNameCache.set(delegateClass.name, functionName);
      }
    }
  }
  return classNameToFunctionNameCache;
}
```

### 3. 优化查找函数
**修改前：**
```typescript
function findFunctionNameByClassName(className: string): string | null {
  for (const [functionName, delegateClass] of FunctionNameToDelegate.entries()) {
    if (delegateClass.name === className) {
      return functionName;
    }
  }
  return null;
}
```

**修改后：**
```typescript
function findFunctionNameByClassName(className: string): string | null {
  const cache = initializeClassNameCache();
  return cache.get(className) ?? null;
}
```

## 性能提升

### 时间复杂度
- **修改前**：O(n) - 每次调用都需要遍历整个 `FunctionNameToDelegate` 映射
- **修改后**：O(1) - 第一次初始化后，后续查询都是 O(1) 的 Map 查询

### 实际效果
- 第一次调用：初始化缓存（一次性成本）
- 后续调用：直接从缓存中查询，性能提升显著

## 使用示例

```typescript
// 第一次调用 - 初始化缓存
const expr1 = deParseJsonToExpression(jsonObject1);  // 初始化缓存

// 后续调用 - 使用缓存
const expr2 = deParseJsonToExpression(jsonObject2);  // 使用缓存
const expr3 = deParseJsonToExpression(jsonObject3);  // 使用缓存
```

## 内存占用
缓存会占用额外的内存来存储类名到函数名的映射，但这是一个合理的权衡，因为：
1. 映射数量有限（通常几十到几百个）
2. 性能提升显著
3. 缓存在应用生命周期内保持不变

## 线程安全性
当前实现在单线程环境中是安全的。如果需要在多线程环境中使用，可以添加锁机制。
