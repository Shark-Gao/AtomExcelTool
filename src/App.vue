<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

type RowRecord = Record<string, string>

type WorkbookMeta = {
  sheetName: string
  rowCount: number
}

const rowNameToRecord = reactive<Record<string, RowRecord>>({})
const selectedRowName = ref<string | null>(null)
const editableRecord = reactive<RowRecord>({})
const workbookMeta = ref<WorkbookMeta | null>(null)
const errorMessage = ref<string | null>(null)
const isLoading = ref(false)
const searchKeyword = ref('')
const openedFilePath = ref<string | null>(null)
const sheetName = ref<string>('Sheet1')
const searchInputRef = ref<HTMLInputElement | null>(null)
const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'retro', label: 'Retro' },
  { value: 'black', label: 'Black' }
]
const currentTheme = ref<string>('light')

const listContainerRef = ref<HTMLDivElement | null>(null)
const rowButtonRefs = ref<Record<string, HTMLButtonElement | null>>({})

const filteredRowNames = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const allRowNames = Object.keys(rowNameToRecord)
  if (!keyword) {
    return allRowNames
  }
  return allRowNames.filter((rowName) => rowName.toLowerCase().includes(keyword))
})

const currentRecord = computed<RowRecord | null>(() => {
  if (!selectedRowName.value) {
    return null
  }
  return rowNameToRecord[selectedRowName.value] ?? null
})

const statusMessage = computed(() => {
  if (errorMessage.value) {
    return errorMessage.value
  }
  if (!Object.keys(rowNameToRecord).length) {
    return '尚未加载配置，请使用工具栏打开 Excel 文件。'
  }
  if (!selectedRowName.value) {
    return '数据已加载，请从左侧选择一个 RowName。'
  }
  return ''
})

watch(currentRecord, (newRecord) => {
  Object.keys(editableRecord).forEach((key) => delete editableRecord[key])
  if (!newRecord) {
    return
  }
  Object.entries(newRecord).forEach(([columnName, value]) => {
    editableRecord[columnName] = value ?? ''
  })
})

watch(currentTheme, (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme)
})

watch(selectedRowName, async (newSelection) => {
  if (!newSelection) {
    return
  }
  await nextTick()
  const button = rowButtonRefs.value[newSelection]
  button?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

function clearWorkbookState() {
  Object.keys(rowNameToRecord).forEach((key) => delete rowNameToRecord[key])
  selectedRowName.value = null
  workbookMeta.value = null
  openedFilePath.value = null
  sheetName.value = 'Sheet1'
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

async function openWorkbookFromMainProcess() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }

  isLoading.value = true
  errorMessage.value = null

  try {
    const result = await window.excelBridge.openWorkbook()
    if (result.canceled) {
      return
    }

    if (result.error) {
      throw new Error(result.error)
    }

    if (!result.rows || !result.rows.length) {
      throw new Error('工作表没有数据行。')
    }

    openedFilePath.value = result.filePath ?? null
    sheetName.value = result.sheetName ?? 'Sheet1'
    workbookMeta.value = {
      sheetName: sheetName.value,
      rowCount: result.rowCount ?? result.rows.length
    }

    Object.keys(rowNameToRecord).forEach((key) => delete rowNameToRecord[key])
    result.rows.forEach((row, index) => {
      const rowName = row.RowName ?? row.ROWNAME ?? row.rowname
      if (!rowName) {
        throw new Error(`第 ${index + 2} 行缺少 RowName 列，请检查表头是否包含 RowName。`)
      }
      rowNameToRecord[rowName] = row
    })

    selectedRowName.value = Object.keys(rowNameToRecord)[0] ?? null
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打开 Excel 文件失败。'
    clearWorkbookState()
  } finally {
    isLoading.value = false
  }
}

function resetEditableRecord() {
  if (!currentRecord.value) {
    return
  }
  Object.keys(editableRecord).forEach((key) => delete editableRecord[key])
  Object.entries(currentRecord.value).forEach(([columnName, value]) => {
    editableRecord[columnName] = value ?? ''
  })
}

function saveEditableRecord() {
  if (!currentRecord.value || !selectedRowName.value) {
    return
  }

  rowNameToRecord[selectedRowName.value] = { ...editableRecord }
}

function buildRowsForSaving(): RowRecord[] {
  return Object.keys(rowNameToRecord).map((rowName) => ({
    RowName: rowName,
    ...rowNameToRecord[rowName]
  }))
}

async function saveWorkbookToDisk() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }
  if (!openedFilePath.value) {
    await saveWorkbookAs()
    return
  }

  try {
    const rows = buildRowsForSaving()
    const result = await window.excelBridge.saveWorkbook({
      filePath: openedFilePath.value,
      sheetName: sheetName.value,
      rows
    })
    if (!result.ok) {
      throw new Error(result.error ?? '保存失败')
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存 Excel 时失败。'
  }
}

async function saveWorkbookAs() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }

  try {
    const rows = buildRowsForSaving()
    const result = await window.excelBridge.saveWorkbookAs({
      defaultPath: openedFilePath.value ?? undefined,
      sheetName: sheetName.value,
      rows
    })

    if (result.canceled) {
      return
    }

    if (!result.ok) {
      throw new Error(result.error ?? '保存失败')
    }

    openedFilePath.value = result.filePath ?? openedFilePath.value
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存 Excel 时失败。'
  }
}
</script>

<template>
  <div class="flex h-full flex-col bg-base-200 text-base-content">
    <header class="sticky top-0 z-10 border-b border-base-300 bg-base-100 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div class="join">
          <button class="btn join-item btn-primary" @click="openWorkbookFromMainProcess">打开 Excel 配置</button>
          <button class="btn join-item" :disabled="!Object.keys(rowNameToRecord).length" @click="saveWorkbookToDisk">保存</button>
          <button class="btn join-item" :disabled="!Object.keys(rowNameToRecord).length" @click="saveWorkbookAs">另存为</button>
        </div>
        <span v-if="workbookMeta" class="badge badge-outline">{{ sheetName }} · {{ workbookMeta.rowCount }} 行</span>
        <span v-if="openedFilePath" class="badge badge-ghost">{{ openedFilePath }}</span>
        <span v-if="statusMessage" class="text-sm" :class="errorMessage ? 'text-error' : 'text-base-content/60'">
          {{ statusMessage }}
        </span>
        <span v-if="isLoading" class="loading loading-spinner text-primary"></span>
        <div class="dropdown dropdown-end ml-auto">
          <div tabindex="0" role="button" class="btn btn-ghost">
            <span class="hidden sm:inline">主题</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <ul tabindex="0" class="menu dropdown-content z-[1] mt-2 w-40 rounded-box bg-base-100 p-2 shadow">
            <li v-for="option in themeOptions" :key="option.value">
              <button class="justify-between" :class="{ active: option.value === currentTheme }" @click="currentTheme = option.value">
                {{ option.label }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>

    <main class="flex flex-1 min-h-0 gap-3 px-3 py-3 overflow-hidden">
      <aside class="card flex w-72 max-w-xs min-h-0 flex-col overflow-hidden bg-base-100 shadow-md">
        <div class="px-4 pt-3 pb-2 space-y-4">
          <div class="form-control">
            <label class="label">
              <span class="label-text">搜索 RowName</span>
            </label>
            <label class="input input-bordered flex items-center gap-2">
              <input ref="searchInputRef" v-model="searchKeyword" type="text" class="grow" placeholder="输入关键字过滤" />
              <kbd class="kbd kbd-sm">Ctrl</kbd>
              <kbd class="kbd kbd-sm">F</kbd>
            </label>
          </div>

          <div class="divider my-0"></div>

          <div class="flex items-center justify-between text-sm text-base-content/70">
            <span>数据条目</span>
            <span>{{ filteredRowNames.length }} / {{ Object.keys(rowNameToRecord).length }}</span>
          </div>
        </div>
        <div class="h-px w-full bg-base-200"></div>
        <div class="scrollbar flex-1 px-4 pb-4 pt-2 min-h-0 overflow-y-auto">
          <div class="flex flex-1 flex-col space-y-2">
            <button
              v-for="row in filteredRowNames"
              :key="row"
              ref="(el) => (rowButtonRefs[row] = el)"
              class="btn btn-sm w-full justify-start items-start text-left normal-case leading-snug"
              :class="{ 'btn-active btn-primary': row === selectedRowName }"
              @click="selectedRowName = row"
            >
              {{ row }}
            </button>
            <p v-if="!filteredRowNames.length" class="text-center text-sm text-base-content/60">
              暂无数据，请先打开 Excel 配置表。
            </p>
          </div>
        </div>
      </aside>

      <section class="card flex flex-1 min-h-0 flex-col overflow-hidden bg-base-100 shadow-md">
        <div class="px-6 pt-6 pb-4">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="card-title text-2xl font-bold">配置详情</h2>
              <p class="text-sm text-base-content/60">
                {{ selectedRowName ? `正在查看 RowName：${selectedRowName}` : '请选择左侧的 RowName 以查看详细配置。' }}
              </p>
            </div>
            <div class="join">
              <button class="btn join-item" :disabled="!selectedRowName" @click="resetEditableRecord">重置</button>
              <button class="btn join-item btn-primary" :disabled="!selectedRowName" @click="saveEditableRecord">保存修改</button>
            </div>
          </header>
        </div>
        <div class="scrollbar flex-1 overflow-y-auto px-6 pb-4">
          <div v-if="selectedRowName" class="space-y-4 pt-2">
            <div
              v-for="(value, columnName) in currentRecord"
              :key="columnName"
              class="grid grid-cols-[minmax(160px,200px),minmax(0,1fr)] items-center gap-4"
            >
              <div class="text-sm font-semibold text-base-content/70 truncate" :title="columnName">{{ columnName }}</div>
              <input v-model="editableRecord[columnName]" type="text" class="input input-bordered" />
            </div>
          </div>

          <div v-else class="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/60 p-16 text-base-content/60">
            <p>暂无选中条目，请在左侧列表中选择一个 RowName。</p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
