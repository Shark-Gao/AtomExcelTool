import type { ClassRegistry, FieldOption } from '../components/DynamicObjectForm.vue'

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

    if (fieldMeta.type === 'object') {
      const options = getSubclassOptions(fieldMeta.baseClass)
      const rawObject = typeof rawValue === 'object' && rawValue !== null ? (rawValue as Record<string, unknown>) : {}
      const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : ''

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

    if (fieldMeta.type === 'array') {
      const options = getSubclassOptions(fieldMeta.baseClass)
      const items = Array.isArray(rawValue) ? rawValue : []
      normalized[fieldKey] = items.map((item) => {
        const rawObject = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
        const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : ''

        // 如果请求的类在选项中存在，使用它；否则保持空值
        const selectedClass = options.some((option) => option.value === requestedClass)
          ? requestedClass
          : ''

        if (selectedClass) {
          return normalizeClassInstance(selectedClass, rawObject, registry, subclassOptions)
        } else {
          // 保持空值，让用户从下拉框选择
          return { _ClassName: '' }
        }
      })
      return
    }

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
