import type { FieldOption } from '../components/DynamicObjectForm.vue'
import { ClassRegistry } from '../types/MetaDefine'

/**
 * 规范化类实例，确保所有字段都符合定义的结构
 * @param className 类名
 * @param raw 原始数据
 * @param registry 类信息注册表
 * @param subclassOptions 子类选项映射
 * @returns 规范化后的对象
 */
export function normalizeClassInstance(
  className: string,
  raw: Record<string, unknown>,
  registry: ClassRegistry,
  subclassOptions: Record<string, FieldOption[]>
): Record<string, unknown> {
  const info = registry[className]
  if (!info) {
    return { _ClassName: className }
  }

  const normalized: Record<string, unknown> = { _ClassName: className }

  const getSubclassOptions = (baseClass: string): FieldOption[] => {
    return subclassOptions[baseClass] ?? []
  }

  Object.entries(info.fields).forEach(([fieldKey, fieldMeta]) => {
    const rawValue = raw[fieldKey]

    // 处理数组类型字段
    if (fieldMeta.type === 'array') {
      const baseClass = 'baseClass' in fieldMeta ? fieldMeta.baseClass : undefined
      if (baseClass) {
        const items = Array.isArray(rawValue) ? rawValue : []
        normalized[fieldKey] = items.map((item) => {
          // 对于基础类型数组，直接返回
          if (baseClass === 'string' || baseClass === 'number' || baseClass === 'boolean') {
            return item
          }

          const rawObject = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
          const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : ''

          if (requestedClass) {
            return normalizeClassInstance(requestedClass, rawObject, registry, subclassOptions)
          } else {
            // 保持空值，让用户从下拉框选择
            return { _ClassName: '' }
          }
        })
      } else {
        normalized[fieldKey] = Array.isArray(rawValue) ? rawValue : []
      }
      return
    }

    // 处理对象类型字段或其他带 baseClass 的字段
    if (fieldMeta.type === 'object') {
      const baseClass = 'baseClass' in fieldMeta ? fieldMeta.baseClass : undefined
      const rawObject = typeof rawValue === 'object' && rawValue !== null ? (rawValue as Record<string, unknown>) : {}
      const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : ''
      const options = getSubclassOptions(baseClass ? baseClass : '')
      
      // 如果请求的类在选项中存在，使用它；否则保持空值，让用户选择
      const selectedClass = options.some((option) => option.value === requestedClass)
        ? requestedClass
        : ''

      if (selectedClass) {
        normalized[fieldKey] = normalizeClassInstance(selectedClass, rawObject, registry, subclassOptions)
      } else {
        // 保持空值，让用户从下拉框选择
        normalized[fieldKey] = { _ClassName: '' }
      }
      return
    }

    // 处理基础类型字段
    if (fieldMeta.type === 'number') {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        normalized[fieldKey] = 0
        return
      }
      const numericValue = Number(rawValue)
      normalized[fieldKey] = Number.isNaN(numericValue) ? 0 : numericValue
      return
    }

    if (fieldMeta.type === 'boolean') {
      normalized[fieldKey] = Boolean(rawValue)
      return
    }

    normalized[fieldKey] = rawValue ?? ''
  })

  return normalized
}
