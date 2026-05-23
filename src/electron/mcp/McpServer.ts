/**
 * MHAtomExcelTool MCP Server
 * 
 * 提供以下 MCP 工具供外部 AI 客户端调用：
 * 
 * === 原子表达式工具 ===
 * 1. parse_atom_expression - 解析原子表达式为 JSON
 * 2. deparse_json_to_expression - 将 JSON 反序列化为原子表达式
 * 3. get_atom_metadata - 获取所有原子类/函数的元数据
 * 4. search_atom_metadata - 搜索特定原子类/函数的元数据
 * 5. get_atom_field_config - 获取原子字段配置规则
 * 6. check_atomic_field - 判断字段是否为原子字段
 * 7. validate_atom_expression - 验证原子表达式是否合法
 * 
 * === Excel 读取工具 ===
 * 8. read_excel_workbook - 读取 Excel 工作簿数据
 * 9. read_excel_sheet - 读取 Excel 指定工作表数据
 * 10. parse_excel_atom_fields - 解析 Excel 中的原子字段
 * 
 * === Excel 写入工具 ===
 * 11. write_excel_rows - 批量写入/更新行数据
 * 12. add_excel_row - 快速新增单行配置
 * 13. update_excel_cell - 精确修改单个单元格
 * 14. delete_excel_rows - 清空指定行数据
 */

import 'reflect-metadata';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { FAtomExpressionParser } from '../main/MHTsAtomSystemUtils';
import { DelegateMetadataGenerator } from '../main/DelegateMetadataGenerator';
import { deParseJsonToExpression } from '../main/DeParseJsonToExpression';
import { AtomFieldsConfigLoader } from '../main/AtomFieldsConfigLoader';
import { DelegateFactory } from '../main/DelegateFactory';
import { ClassMetadata } from '../../types/MetaDefine';
import { buildAtomSummary } from '../main/PromptBuilder';
import ExcelJS from 'exceljs';
// @ts-ignore - xlsx-populate 没有类型定义
import XlsxPopulate from 'xlsx-populate';
import { existsSync, chmodSync, statSync, constants } from 'fs';
import { basename } from 'path';
import { reportMcpToolCall, reportMcpServerStart } from './McpUsageReporter';

// ============ 状态管理 ============

let cachedMetadata: ClassMetadata[] | null = null;
let configLoaded = false;

/**
 * 确保原子元数据已加载
 */
function ensureMetadataLoaded(): ClassMetadata[] {
  if (!cachedMetadata) {
    cachedMetadata = DelegateMetadataGenerator.generateMetadataFromMetaJsonConfig();
    DelegateMetadataGenerator.generateClassRegistry(cachedMetadata);
  }
  return cachedMetadata;
}

/**
 * 确保字段配置已加载
 */
async function ensureConfigLoaded(): Promise<AtomFieldsConfigLoader> {
  const loader = AtomFieldsConfigLoader.getInstance();
  if (!configLoaded) {
    await loader.load();
    configLoaded = true;
  }
  return loader;
}

// ============ Excel 工具函数 ============

const ROW_NAME_IDENTIFIER = 'rowname';

function normalizeHeaderIdentifier(label: string): string {
  return label.replace(/\s+/g, '').toLowerCase();
}

function isRowNameLabel(label: string): boolean {
  return normalizeHeaderIdentifier(label).startsWith(ROW_NAME_IDENTIFIER);
}

function getExcelFileName(filePath: string): string {
  const fileName = basename(filePath);
  return fileName.replace(/\.[^/.]+$/, '');
}

function findHeaderRowNumber(worksheet: ExcelJS.Worksheet): number {
  let lastHeaderRowNumber = -1;
  for (let r = 5; r >= 1; r -= 1) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= worksheet.columnCount; c += 1) {
      const text = row.getCell(c).text || '';
      if (isRowNameLabel(text)) {
        lastHeaderRowNumber = r;
        break;
      }
    }
    if (lastHeaderRowNumber !== -1) {
      break;
    }
  }
  if (lastHeaderRowNumber === -1) {
    throw new Error('未自动识别到包含 RowName 的表头行，请检查 Excel 列标题。');
  }
  return lastHeaderRowNumber;
}

function buildHeaderLabels(headerRow: ExcelJS.Row, totalColumns: number): string[] {
  const headerSet = new Set<string>();
  const labels: string[] = [];
  for (let c = 1; c <= totalColumns; c += 1) {
    const label = (headerRow.getCell(c).text || '').trim();
    const base = label || `Column${c}`;
    let candidate = base;
    let dup = 1;
    while (headerSet.has(candidate)) {
      dup += 1;
      candidate = `${base}_${dup}`;
    }
    headerSet.add(candidate);
    labels.push(candidate);
  }
  return labels;
}

type RowRecord = Record<string, string>;

function extractHeaderMetadata(worksheet: ExcelJS.Worksheet, xlsxFileName?: string) {
  let headerRowNumber: number;
  let dataStartRow: number;
  let descriptionRow: number;

  if (xlsxFileName && configLoaded) {
    const sheetName = worksheet.name;
    const configLoader = AtomFieldsConfigLoader.getInstance();
    const config = configLoader.getConfig();

    const headerConfig = config.headerRowConfig?.files?.find(
      (file: any) => file.xlsxFile === xlsxFileName && file.sheetName === sheetName
    ) || config.headerRowConfig?.files?.find(
      (file: any) => file.xlsxFile === xlsxFileName && (!file.sheetName || file.sheetName === '')
    );

    if (headerConfig && headerConfig.headerRowNumber) {
      headerRowNumber = headerConfig.headerRowNumber;
      dataStartRow = headerConfig.dataStartRow || (headerRowNumber + 1);
      descriptionRow = headerConfig.descriptionRow || 1;
    } else {
      headerRowNumber = findHeaderRowNumber(worksheet);
      dataStartRow = headerRowNumber + 1;
      descriptionRow = 1;
    }
  } else {
    headerRowNumber = findHeaderRowNumber(worksheet);
    dataStartRow = headerRowNumber + 1;
    descriptionRow = 1;
  }

  const headerRow = worksheet.getRow(headerRowNumber);
  const headerLabels = buildHeaderLabels(headerRow, worksheet.columnCount);
  const rowNameIndex = headerLabels.findIndex((label) => isRowNameLabel(label));
  if (rowNameIndex === -1) {
    throw new Error('未识别到 RowName 列，请确认表头包含 RowName。');
  }

  return {
    headerRowNumber,
    headerLabels,
    rowNameColumnNumber: rowNameIndex + 1,
    dataStartRow,
    descriptionRow
  };
}

function extractRowRecord(row: ExcelJS.Row, headerLabels: string[]): RowRecord {
  const record: RowRecord = {};
  headerLabels.forEach((columnName, index) => {
    const cell = row.getCell(index + 1);
    const text = cell.text ?? '';
    record[columnName] = text;
  });
  return record;
}

function buildColumnDescriptions(worksheet: ExcelJS.Worksheet, headerLabels: string[], descriptionRow: number): Record<string, string> {
  const columnDescriptions: Record<string, string> = {};
  const descRow = worksheet.getRow(descriptionRow);
  headerLabels.forEach((label, idx) => {
    const text = (descRow.getCell(idx + 1).text || '').trim();
    columnDescriptions[label] = text;
  });
  return columnDescriptions;
}

function preprocessCombinationExpression(rawValue: string, allowCombination: boolean): { expression: string; isCombination: boolean } {
  if (!allowCombination || !rawValue || typeof rawValue !== 'string') {
    return { expression: rawValue, isCombination: false };
  }
  const trimmed = rawValue.trim();
  if (!trimmed.includes(';')) {
    return { expression: rawValue, isCombination: false };
  }
  if (/^CombineActions?\s*\(/i.test(trimmed)) {
    return { expression: rawValue, isCombination: true };
  }
  const segments = trimmed.split(';').map(s => s.trim()).filter(s => s.length > 0);
  if (segments.length <= 1) {
    return { expression: rawValue, isCombination: false };
  }
  return { expression: `CombineActions(${segments.join(', ')})`, isCombination: true };
}

// ============ Excel 写入工具函数 ============

/**
 * 确保文件可写（处理只读文件）
 */
function ensureFileWritable(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const stats = statSync(filePath);
    const isReadOnly = !(stats.mode & constants.S_IWUSR);
    if (isReadOnly) {
      chmodSync(filePath, stats.mode | constants.S_IWUSR | constants.S_IWGRP | constants.S_IWOTH);
    }
  } catch (error) {
    // 权限修改失败不阻塞，后续写入时会报错
  }
}

/**
 * 使用 xlsx-populate 写入 Excel（保留原始格式）
 * 
 * 核心逻辑：
 * 1. 使用 ExcelJS 读取表头元数据（表头行号、列名映射）
 * 2. 使用 xlsx-populate 打开文件并写入数据（保留条件格式、合并单元格、样式等）
 * 3. 支持按 RowName 匹配已有行进行更新，或追加新行
 * 
 * @returns 写入结果统计
 */
async function writeExcelRows(
  filePath: string,
  rows: RowRecord[],
  sheetName?: string
): Promise<{ updatedRows: number; addedRows: number; totalRows: number }> {
  ensureFileWritable(filePath);

  // 使用 xlsx-populate 打开文件（完整保留所有格式）
  const workbook = await XlsxPopulate.fromFileAsync(filePath);

  // 获取目标工作表
  const targetSheet = sheetName ? workbook.sheet(sheetName) : workbook.sheet(0);
  if (!targetSheet) {
    throw new Error(`目标工作表不存在: ${sheetName || '(第一个工作表)'}`);
  }

  // 使用 ExcelJS 读取元数据
  const excelJsWorkbook = new ExcelJS.Workbook();
  await excelJsWorkbook.xlsx.readFile(filePath);
  const excelJsSheet = sheetName
    ? excelJsWorkbook.getWorksheet(sheetName)
    : excelJsWorkbook.worksheets[0];
  if (!excelJsSheet) {
    throw new Error('无法读取工作表元数据。');
  }

  const xlsxFileName = getExcelFileName(filePath);
  const { headerRowNumber, headerLabels, rowNameColumnNumber, dataStartRow } =
    extractHeaderMetadata(excelJsSheet, xlsxFileName);

  // 构建列名到列号的映射
  const columnNameToNumber = new Map<string, number>();
  headerLabels.forEach((label, index) => {
    columnNameToNumber.set(label, index + 1);
  });

  // 获取已使用的行数
  const usedRange = targetSheet.usedRange();
  let maxRowNumber = usedRange ? usedRange.endCell().rowNumber() : dataStartRow;

  // 构建 rowName 到行号的映射
  const rowNameToRowNumber = new Map<string, number>();
  for (let r = dataStartRow; r <= maxRowNumber; r += 1) {
    const cell = targetSheet.cell(r, rowNameColumnNumber);
    const value = cell.value();
    const text = value !== undefined && value !== null ? String(value).trim() : '';
    if (text.length > 0 && !rowNameToRowNumber.has(text)) {
      rowNameToRowNumber.set(text, r);
    }
  }

  // 确保列存在
  const ensureColumnNumber = (columnName: string): number => {
    const existing = columnNameToNumber.get(columnName);
    if (existing !== undefined) return existing;

    const newColumnNumber = columnNameToNumber.size + 1;
    targetSheet.cell(headerRowNumber, newColumnNumber).value(columnName);
    columnNameToNumber.set(columnName, newColumnNumber);
    headerLabels.push(columnName);
    return newColumnNumber;
  };

  let updatedRows = 0;
  let addedRows = 0;

  // 写入数据
  rows.forEach((incomingRow) => {
    // 查找 RowName
    let rowNameValue = '';
    const rowNameColName = headerLabels[rowNameColumnNumber - 1];
    if (incomingRow[rowNameColName]) {
      rowNameValue = incomingRow[rowNameColName].trim();
    } else {
      // 尝试从任何 RowName 风格的键中查找
      for (const key of Object.keys(incomingRow)) {
        if (isRowNameLabel(key)) {
          rowNameValue = (incomingRow[key] || '').trim();
          break;
        }
      }
    }

    if (rowNameValue.length === 0) return;

    let targetRowNumber = rowNameToRowNumber.get(rowNameValue);
    if (targetRowNumber) {
      updatedRows++;
    } else {
      maxRowNumber += 1;
      targetRowNumber = maxRowNumber;
      rowNameToRowNumber.set(rowNameValue, targetRowNumber);
      addedRows++;
    }

    // 写入 rowName
    targetSheet.cell(targetRowNumber, rowNameColumnNumber).value(rowNameValue);

    // 写入其他列
    Object.entries(incomingRow).forEach(([columnName, value]) => {
      if (value === undefined) return;
      const columnNumber = ensureColumnNumber(columnName);
      targetSheet.cell(targetRowNumber!, columnNumber).value(value);
    });
  });

  // 保存文件
  await workbook.toFileAsync(filePath);

  return { updatedRows, addedRows, totalRows: updatedRows + addedRows };
}

/**
 * 清空指定行的数据（保留行结构，将单元格值设为空字符串）
 */
async function clearExcelRows(
  filePath: string,
  rowNames: string[],
  sheetName?: string
): Promise<{ clearedRows: number; notFoundRows: string[] }> {
  ensureFileWritable(filePath);

  const workbook = await XlsxPopulate.fromFileAsync(filePath);
  const targetSheet = sheetName ? workbook.sheet(sheetName) : workbook.sheet(0);
  if (!targetSheet) {
    throw new Error(`目标工作表不存在: ${sheetName || '(第一个工作表)'}`);
  }

  const excelJsWorkbook = new ExcelJS.Workbook();
  await excelJsWorkbook.xlsx.readFile(filePath);
  const excelJsSheet = sheetName
    ? excelJsWorkbook.getWorksheet(sheetName)
    : excelJsWorkbook.worksheets[0];
  if (!excelJsSheet) {
    throw new Error('无法读取工作表元数据。');
  }

  const xlsxFileName = getExcelFileName(filePath);
  const { headerLabels, rowNameColumnNumber, dataStartRow } =
    extractHeaderMetadata(excelJsSheet, xlsxFileName);

  // 获取已使用的行范围
  const usedRange = targetSheet.usedRange();
  const maxRowNumber = usedRange ? usedRange.endCell().rowNumber() : dataStartRow;

  // 构建 rowName 到行号的映射
  const rowNameToRowNumber = new Map<string, number>();
  for (let r = dataStartRow; r <= maxRowNumber; r += 1) {
    const cell = targetSheet.cell(r, rowNameColumnNumber);
    const value = cell.value();
    const text = value !== undefined && value !== null ? String(value).trim() : '';
    if (text.length > 0) {
      rowNameToRowNumber.set(text, r);
    }
  }

  const totalColumns = headerLabels.length;
  let clearedRows = 0;
  const notFoundRows: string[] = [];

  for (const rowName of rowNames) {
    const rowNumber = rowNameToRowNumber.get(rowName);
    if (!rowNumber) {
      notFoundRows.push(rowName);
      continue;
    }

    // 清空该行所有单元格
    for (let c = 1; c <= totalColumns; c++) {
      targetSheet.cell(rowNumber, c).value('');
    }
    clearedRows++;
  }

  await workbook.toFileAsync(filePath);

  return { clearedRows, notFoundRows };
}

// ============ MCP Server 创建 ============

const server = new McpServer({
  name: 'mhatom-excel-tool',
  version: '1.0.0',
}, {
  capabilities: { logging: {}, prompts: {}, resources: {} }
});

// ============ Prompt: 原子表达式助手系统提示词 ============
// 外部 AI 客户端（如 Claude Desktop / Cursor）可以通过 MCP prompts/get 获取
// 包含完整的原子知识库索引和使用规则

server.prompt(
  'atom-assistant',
  '获取"原子表达式助手"的完整系统提示词，包含所有可用原子的知识库索引（函数签名）和使用规则。在对话开始时调用此 prompt，可以让 AI 精准理解原子系统并给出正确的表达式。',
  {
    includeSignatures: z.enum(['true', 'false']).optional().describe('是否包含完整的原子函数签名索引，默认 true。设为 false 则只返回使用规则，不含索引'),
    baseClassFilter: z.string().optional().describe('可选，只包含指定 baseClass 的原子索引。可选值: NumberValueDelegate, BoolValueDelegate, ActorValueDelegate, ActionDelegate, EventDelegateEx, TaskDelegate'),
  },
  async ({ includeSignatures, baseClassFilter }) => {
    const metadata = ensureMetadataLoaded();
    const showSignatures = includeSignatures !== 'false';

    let filteredMetadata = metadata;
    if (baseClassFilter) {
      filteredMetadata = metadata.filter(m => m.baseClass === baseClassFilter);
    }

    const systemPromptRules = `你是一个专业的"游戏配置原子表达式"助手。你的目标是：在不编造的前提下，给出可直接粘贴使用的、参数严格正确的原子表达式。

## 重要背景（必须遵守）
- 原子表达式由一系列函数调用组成：FuncName(arg1, arg2, ...)。
- 最终表达式中 **只允许出现 funcName**（不要输出 className/displayName 作为代码的一部分）。
- 参数是 **位置参数**：必须严格匹配知识库里该原子的"参数顺序/数量"。

## 可用 MCP 工具
你可以调用以下 MCP 工具来辅助回答用户问题：
- **parse_atom_expression**: 将原子表达式字符串解析为结构化 JSON
- **deparse_json_to_expression**: 将 JSON 反序列化回原子表达式字符串
- **get_atom_metadata**: 获取所有原子类型的完整元数据列表
- **search_atom_metadata**: 按关键词搜索原子类型元数据
- **get_atom_field_config**: 获取原子字段配置规则
- **check_atomic_field**: 判断字段是否为原子字段
- **validate_atom_expression**: 验证原子表达式是否合法
- **read_excel_workbook**: 读取 Excel 文件数据
- **read_excel_sheet**: 读取 Excel 指定工作表
- **parse_excel_atom_fields**: 解析 Excel 中的原子字段
- **write_excel_rows / add_excel_row / update_excel_cell / delete_excel_rows**: Excel 写入操作

**工具使用原则：**
- 当用户提供了表达式想要验证或分析时，使用 parse_atom_expression 工具
- 当需要查找某个原子的详细参数信息时，使用 search_atom_metadata 工具
- 当用户提到 Excel 文件时，使用 Excel 相关工具读取和分析数据
- 不要在回复中重复工具返回的完整 JSON 原始数据，而是提取关键信息用自然语言总结

## 原子类型与推荐原则（按 baseClass）
- [BoolValueDelegate] / [boolean]：条件/判断原子
- [NumberValueDelegate] / [number]：数值原子
- [ActorValueDelegate]：目标/对象原子
- [EventDelegateEx]：事件原子
- [ActionDelegate]：动作原子
- [TaskDelegate]：任务原子

## 绝对规则（高优先级）
1. **只能使用知识库索引中出现的原子 funcName**。找不到就明确说"知识库中没有该原子/能力"，并提出替代方案或反问。
2. **参数必须严格正确**：索引中已提供函数签名，简单场景可直接使用。不确定时用 search_atom_metadata 工具查询。
3. 如果用户需求不明确，**先问 1-3 个关键问题**，再给出默认假设版本。
4. 推荐时要根据 baseClass 匹配类型。

## 输出格式
- **结论**：一句话说明推荐思路
- **推荐表达式**：代码块给出表达式
- **参数对齐检查表**：列出关键原子的参数对齐
- **参数说明**：解释关键参数
- **需要确认的问题（如有）**`;

    let atomSection = '';
    if (showSignatures && filteredMetadata.length > 0) {
      atomSection = `\n\n## 原子知识库索引（可用原子清单）\n${buildAtomSummary(filteredMetadata)}`;
    } else if (filteredMetadata.length === 0 && baseClassFilter) {
      atomSection = `\n\n## 原子知识库索引\n未找到 baseClass 为 "${baseClassFilter}" 的原子。`;
    }

    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: systemPromptRules + atomSection,
          },
        },
      ],
    };
  }
);

// ============ Resource: 原子知识库索引 ============
// 外部 AI 客户端可以通过 resources/read 直接读取原子知识库内容

server.resource(
  'atom-knowledge-base',
  'atom://knowledge/index',
  {
    description: '原子表达式知识库索引 - 包含所有可用原子函数的签名列表，按 baseClass 分组。',
    mimeType: 'text/plain',
  },
  async () => {
    const metadata = ensureMetadataLoaded();
    const summary = buildAtomSummary(metadata);
    return {
      contents: [
        {
          uri: 'atom://knowledge/index',
          mimeType: 'text/plain',
          text: summary,
        },
      ],
    };
  }
);

server.resource(
  'atom-system-rules',
  'atom://knowledge/rules',
  {
    description: '原子表达式系统规则 - 语法规则、使用约束和最佳实践。',
    mimeType: 'text/plain',
  },
  async () => {
    return {
      contents: [
        {
          uri: 'atom://knowledge/rules',
          mimeType: 'text/plain',
          text: `# 原子表达式系统规则

## 表达式语法
- 原子表达式由函数调用组成：FuncName(arg1, arg2, ...)
- 支持嵌套调用：NumberAdd(GetLevel(), 5)
- 支持算术运算：GetHP() + GetMP() * 2
- 支持比较和逻辑运算：(GetHP() > 100) && (GetLevel() >= 10)
- 支持组合动作：CombineActions(Action1(), Action2())

## 原子类型（baseClass）
| baseClass | 返回类型 | 用途 |
|-----------|----------|------|
| NumberValueDelegate | 数值 | 数值计算（HP、等级、距离等） |
| BoolValueDelegate | 布尔值 | 条件判断 |
| ActorValueDelegate | 目标对象 | 选择目标（自身、敌人等） |
| ActionDelegate | 动作 | 执行操作 |
| EventDelegateEx | 事件 | 事件触发/监听 |
| TaskDelegate | 任务 | 行为树任务节点 |

## 参数规则
- 参数是位置参数，顺序必须严格匹配定义
- [param] 表示可选参数，...param 表示可变参数
- Number/Bool/Actor 等类型表示需要传入对应 baseClass 的原子表达式
- 枚举类型参数只能使用定义中列出的值

## Excel 原子字段
- Excel 中某些列是"原子字段"，其单元格值是原子表达式
- 用 check_atomic_field 工具判断某列是否为原子字段
- 写入前建议用 validate_atom_expression 验证
`,
        },
      ],
    };
  }
);

// ============ Tool 0: 使用指南（自动引导） ============
// 这个工具用于告诉外部 AI 客户端如何正确使用本 MCP Server

server.tool(
  'get_instructions',
  `获取本 MCP Server（原子表达式助手）的使用指南。

⚠️ 重要：当用户的提问涉及以下任何关键词或场景时，请【优先调用此工具】获取使用指南，然后按指南操作：
- "原子"、"表达式"、"atom"、"delegate"
- "配置表"、"Excel"、"技能配置"、"数值配置"
- 提到任何原子函数名（如 GetLevel、GetHP、NumberAdd、IsAlive 等）
- 想要编写、修改、分析、验证表达式
- 涉及游戏配置中的条件、数值、动作、事件等`,
  {},
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    reportMcpToolCall('get_instructions');
    const metadata = ensureMetadataLoaded();
    const summary = buildAtomSummary(metadata);

    return {
      content: [{
        type: 'text' as const,
        text: `# MHAtom Excel Tool - 原子表达式助手使用指南

## 你是谁
你是一个专业的"游戏配置原子表达式"助手。你的目标是：在不编造的前提下，给出可直接粘贴使用的、参数严格正确的原子表达式。

## 工作流程（请严格按此顺序操作）

### 第 1 步：理解用户需求
分析用户问题，判断需要哪种类型的原子（数值/布尔/动作/事件/目标/任务）。

### 第 2 步：查询知识库
- 使用 search_atom_metadata 工具按关键词搜索具体原子的完整参数定义
- 或使用 get_atom_metadata(summary=true) 获取所有原子的概览索引

### 第 3 步：构造并验证表达式
- 严格按照知识库中的函数签名构造表达式
- 使用 validate_atom_expression 工具验证表达式合法性

### 第 4 步：回答用户
- 给出推荐表达式（代码块）
- 列出参数对齐检查
- 说明关键参数含义

## 绝对规则
1. **只能使用知识库中出现的原子 funcName**，不允许编造不存在的原子
2. **参数必须严格正确**：位置参数，顺序/数量必须匹配定义
3. 不确定时先用 search_atom_metadata 查询，不要猜测

## 原子类型（baseClass）
| baseClass | 返回类型 | 用途 |
|-----------|----------|------|
| NumberValueDelegate | 数值 | HP、等级、距离等数值计算 |
| BoolValueDelegate | 布尔值 | 条件判断 |
| ActorValueDelegate | 目标对象 | 自身、敌人等目标选择 |
| ActionDelegate | 动作 | 播放动画、发射弹道等 |
| EventDelegateEx | 事件 | 事件触发/监听 |
| TaskDelegate | 任务 | 行为树任务节点 |

## 原子知识库索引（所有可用原子）
${summary}
`,
      }],
    };
  }
);

// ============ Tool 1: 解析原子表达式 ============

server.tool(
  'parse_atom_expression',
  `将原子表达式字符串解析为结构化的 JSON 对象。支持函数调用（如 GetLevel()）、算术运算、逻辑运算和嵌套表达式。

【提示】如果你还不了解本系统有哪些原子可用，建议先调用 get_atom_metadata(summary=true) 获取原子知识库索引。`,
  {
    expression: z.string().describe('要解析的原子表达式字符串，例如 "NumberAdd(GetLevel(), 5)" 或 "(GetHP() > 100)"'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ expression }) => {
    reportMcpToolCall('parse_atom_expression');
    try {
      ensureMetadataLoaded();
      const parsed = FAtomExpressionParser.main(expression);
      if (!parsed) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: '表达式解析失败，返回值为空。请检查表达式语法是否正确。' }) }],
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, parsed, json: JSON.stringify(parsed, null, 2) }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '解析表达式时发生未知错误。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 2: JSON 反序列化为表达式 ============

server.tool(
  'deparse_json_to_expression',
  '将结构化的 JSON 对象反序列化回原子表达式字符串。JSON 对象必须包含 _ClassName 属性来标识原子类型。',
  {
    json: z.string().describe('JSON 字符串，描述原子对象结构，必须包含 _ClassName 字段。例如: {"_ClassName": "NumberValueConstDelegate", "Constant": 42}'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ json }) => {
    reportMcpToolCall('deparse_json_to_expression');
    try {
      ensureMetadataLoaded();
      const jsonObject = JSON.parse(json);
      const result = deParseJsonToExpression(jsonObject);
      if (!result || !result.expression) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: '反向解析失败，请检查 JSON 结构是否正确。' }) }],
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, expression: result.expression, expressionDesc: result.expressionDesc }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '反向解析 JSON 时发生未知错误。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 3: 获取全部原子元数据 ============

server.tool(
  'get_atom_metadata',
  `获取所有可用的原子类型（Delegate）的完整元数据列表，包括类名、函数名、参数字段、基类类型等信息。可选按基类类型过滤。

【自动调用指南 - 重要】
当用户提到以下关键词或场景时，你应该 **主动调用此工具**（设 summary=true）来获取原子知识库索引：
- 提到"原子"、"表达式"、"Atom"、"Delegate"、"配置表"
- 想要编写、修改、验证原子表达式
- 提到具体的原子函数名（如 GetLevel、GetHP、NumberAdd 等）
- 提到原子相关的 baseClass（NumberValueDelegate、BoolValueDelegate、ActionDelegate 等）
- 询问"有哪些原子可用"、"怎么写表达式"等问题
- 涉及游戏配置、技能配置、数值配置等可能用到原子的场景

调用建议：
1. 首次遇到原子相关问题时，先用 summary=true 获取概览
2. 如需某个具体原子的详细参数，改用 search_atom_metadata 工具按关键词搜索
3. 用户要写表达式时，先查知识库确认原子存在且参数正确，不要凭空编造`,
  {
    baseClass: z.string().optional().describe('可选，按基类过滤。可选值: NumberValueDelegate, BoolValueDelegate, ActorValueDelegate, ActionDelegate, EventDelegateEx, TaskDelegate'),
    summary: z.boolean().optional().describe('可选，默认 false。设为 true 则只返回类名、函数名和基类的摘要信息，不返回完整字段详情。【建议首次调用时设为 true】'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ baseClass, summary }) => {
    reportMcpToolCall('get_atom_metadata', { baseClass: baseClass || 'all', summary: !!summary });
    try {
      const metadata = ensureMetadataLoaded();
      let result = metadata;

      if (baseClass) {
        result = metadata.filter(m => m.baseClass === baseClass);
      }

      if (summary) {
        const summaryList = result.map(m => ({
          className: m.className,
          funcName: m.funcName,
          displayName: m.displayName,
          baseClass: m.baseClass,
          fieldCount: m.fields.length,
          category: m.category || '',
          description: m.description || '',
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: summaryList.length, metadata: summaryList }, null, 2) }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: result.length, metadata: result }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取元数据失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 4: 搜索原子元数据 ============

server.tool(
  'search_atom_metadata',
  `按关键词搜索原子类型的元数据。支持按类名、函数名、显示名称、分类和描述进行模糊搜索。

【使用建议】
- 当你已经通过 get_atom_metadata(summary=true) 获取了概览，但需要查看某个具体原子的 **完整参数定义** 时，使用此工具
- 当用户提到一个具体的原子函数名或关键词时，直接用此工具搜索
- 搜索结果包含完整的参数列表（字段名、类型、是否必填、枚举值等），用于精确构造表达式`,
  {
    keyword: z.string().describe('搜索关键词，将在类名、函数名、显示名称、分类和描述中进行模糊匹配'),
    limit: z.number().optional().describe('可选，限制返回结果数量，默认 20'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ keyword, limit }) => {
    reportMcpToolCall('search_atom_metadata', { keyword });
    try {
      const metadata = ensureMetadataLoaded();
      const maxResults = limit || 20;
      const lowerKeyword = keyword.toLowerCase();

      const results = metadata.filter(m => {
        return (
          m.className.toLowerCase().includes(lowerKeyword) ||
          m.funcName.toLowerCase().includes(lowerKeyword) ||
          (m.displayName && m.displayName.toLowerCase().includes(lowerKeyword)) ||
          (m.category && m.category.toLowerCase().includes(lowerKeyword)) ||
          (m.description && m.description.toLowerCase().includes(lowerKeyword))
        );
      }).slice(0, maxResults);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, count: results.length, totalMatches: results.length, metadata: results }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '搜索元数据失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 5: 获取原子字段配置 ============

server.tool(
  'get_atom_field_config',
  '获取原子字段的配置规则（后缀规则、前缀规则、精确匹配规则），了解哪些 Excel 字段名被识别为原子字段及其对应的基类。',
  {},
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    reportMcpToolCall('get_atom_field_config');
    try {
      const loader = await ensureConfigLoaded();
      const config = loader.getConfig();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, config }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取原子字段配置失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 6: 检查是否为原子字段 ============

server.tool(
  'check_atomic_field',
  '判断给定的 Excel 字段名是否为原子字段，并返回该字段允许的基类类型。可指定工作表名和文件名以获得更精确的匹配。',
  {
    fieldName: z.string().describe('Excel 列标题/字段名称'),
    sheetName: z.string().optional().describe('可选，工作表名称'),
    fileName: z.string().optional().describe('可选，Excel 文件名（不含路径和扩展名）'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ fieldName, sheetName, fileName }) => {
    reportMcpToolCall('check_atomic_field', { fieldName });
    try {
      const loader = await ensureConfigLoaded();
      const isAtomic = loader.isAtomicField(fieldName, sheetName, fileName);
      const baseClasses = loader.getAllowedBaseClassesForField(fieldName, sheetName, fileName);
      const fieldRuleInfo = loader.getFieldRuleInfo(fieldName, sheetName, fileName);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          fieldName,
          isAtomic,
          baseClasses,
          allowCombination: fieldRuleInfo.allowCombination,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '判断原子字段失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 7: 读取 Excel 工作簿 ============

server.tool(
  'read_excel_workbook',
  '读取 Excel 文件的基本信息和第一个工作表的数据。返回文件路径、工作表列表、列名、行数据等。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径（支持 .xlsx, .xls, .xlsm, .xlsb）'),
    maxRows: z.number().optional().describe('可选，最大返回行数，默认 100。设为 -1 返回全部行'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ filePath, maxRows }) => {
    reportMcpToolCall('read_excel_workbook', { file_path: filePath });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      if (!workbook.worksheets.length) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Excel 文件中没有可读取的工作表。' }) }],
        };
      }

      const xlsxFileName = getExcelFileName(filePath);
      const sheetList = workbook.worksheets.map((ws) => ws.name);
      const worksheet = workbook.worksheets[0];
      const { headerLabels, rowNameColumnNumber, dataStartRow, descriptionRow } = extractHeaderMetadata(worksheet, xlsxFileName);

      const rows: RowRecord[] = [];
      const limit = maxRows === -1 ? Infinity : (maxRows || 100);
      let count = 0;

      for (let r = dataStartRow; r <= worksheet.rowCount && count < limit; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const rowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (rowName.length === 0) continue;
        rows.push(record);
        count++;
      }

      const columnDescriptions = buildColumnDescriptions(worksheet, headerLabels, descriptionRow);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          filePath,
          sheetName: worksheet.name,
          sheetList,
          rowCount: rows.length,
          totalRowCount: worksheet.rowCount - dataStartRow + 1,
          columnNames: headerLabels,
          columnDescriptions,
          rowNameColumnName: headerLabels[rowNameColumnNumber - 1],
          rows,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取 Excel 文件失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 8: 读取 Excel 指定工作表 ============

server.tool(
  'read_excel_sheet',
  '读取 Excel 文件中指定工作表的数据。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径'),
    sheetName: z.string().describe('要读取的工作表名称'),
    maxRows: z.number().optional().describe('可选，最大返回行数，默认 100。设为 -1 返回全部行'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ filePath, sheetName, maxRows }) => {
    reportMcpToolCall('read_excel_sheet', { file_path: filePath, sheet_name: sheetName });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) {
        const available = workbook.worksheets.map(ws => ws.name);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `未找到工作表: ${sheetName}`, availableSheets: available }) }],
        };
      }

      const xlsxFileName = getExcelFileName(filePath);
      const { headerLabels, rowNameColumnNumber, dataStartRow, descriptionRow } = extractHeaderMetadata(worksheet, xlsxFileName);

      const rows: RowRecord[] = [];
      const limit = maxRows === -1 ? Infinity : (maxRows || 100);
      let count = 0;

      for (let r = dataStartRow; r <= worksheet.rowCount && count < limit; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const rowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (rowName.length === 0) continue;
        rows.push(record);
        count++;
      }

      const columnDescriptions = buildColumnDescriptions(worksheet, headerLabels, descriptionRow);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          sheetName: worksheet.name,
          rowCount: rows.length,
          columnNames: headerLabels,
          columnDescriptions,
          rowNameColumnName: headerLabels[rowNameColumnNumber - 1],
          rows,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取工作表失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 9: 解析 Excel 中的原子字段 ============

server.tool(
  'parse_excel_atom_fields',
  '读取 Excel 文件并解析其中所有原子字段的表达式，返回每行中原子字段的解析结果（JSON 对象形式）。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径'),
    sheetName: z.string().optional().describe('可选，工作表名称。不指定则使用第一个工作表'),
    rowName: z.string().optional().describe('可选，指定行名（RowName）。不指定则处理所有行'),
    fieldName: z.string().optional().describe('可选，指定字段名。不指定则处理所有原子字段'),
    maxRows: z.number().optional().describe('可选，最大处理行数，默认 50'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ filePath, sheetName, rowName, fieldName, maxRows }) => {
    reportMcpToolCall('parse_excel_atom_fields', { file_path: filePath });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      ensureMetadataLoaded();
      const loader = await ensureConfigLoaded();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = sheetName
        ? workbook.getWorksheet(sheetName)
        : workbook.worksheets[0];

      if (!worksheet) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `未找到工作表: ${sheetName || '(第一个工作表)'}` }) }],
        };
      }

      const xlsxFileName = getExcelFileName(filePath);
      const currentSheetName = worksheet.name;
      const { headerLabels, rowNameColumnNumber, dataStartRow } = extractHeaderMetadata(worksheet, xlsxFileName);

      // 找出所有原子字段
      const atomFields = fieldName
        ? [fieldName].filter(f => loader.isAtomicField(f, currentSheetName, xlsxFileName))
        : headerLabels.filter(f => loader.isAtomicField(f, currentSheetName, xlsxFileName));

      if (atomFields.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: true,
            message: fieldName
              ? `字段 "${fieldName}" 不是原子字段`
              : '未发现原子字段',
            atomFields: [],
            results: [],
          }, null, 2) }],
        };
      }

      const limit = maxRows || 50;
      const results: any[] = [];
      let count = 0;

      for (let r = dataStartRow; r <= worksheet.rowCount && count < limit; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const currentRowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (currentRowName.length === 0) continue;

        // 如果指定了 rowName，只处理匹配的行
        if (rowName && currentRowName !== rowName) continue;

        const rowResult: any = { rowName: currentRowName, fields: {} };

        for (const af of atomFields) {
          const rawValue = record[af];
          if (!rawValue || rawValue.trim().length === 0) {
            rowResult.fields[af] = { raw: '', parsed: null };
            continue;
          }

          try {
            const fieldRuleInfo = loader.getFieldRuleInfo(af, currentSheetName, xlsxFileName);
            const { expression } = preprocessCombinationExpression(rawValue, fieldRuleInfo.allowCombination);
            const parsed = FAtomExpressionParser.main(expression);
            rowResult.fields[af] = {
              raw: rawValue,
              parsed: parsed || null,
              baseClasses: fieldRuleInfo.baseClasses,
            };
          } catch (parseError) {
            const msg = parseError instanceof Error ? parseError.message : '解析失败';
            rowResult.fields[af] = { raw: rawValue, error: msg };
          }
        }

        results.push(rowResult);
        count++;

        // 如果指定了 rowName 且已找到，提前退出
        if (rowName && currentRowName === rowName) break;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          filePath,
          sheetName: currentSheetName,
          atomFields,
          rowCount: results.length,
          results,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '解析 Excel 原子字段失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 10: 验证原子表达式 ============

server.tool(
  'validate_atom_expression',
  `验证原子表达式是否合法。在写入 Excel 前先调用此工具检查表达式语法和参数是否正确。返回解析结果或详细的错误信息。

【提示】验证前请确保你已了解原子知识库（通过 get_atom_metadata 或 search_atom_metadata），以便构造正确的表达式。`,
  {
    expression: z.string().describe('要验证的原子表达式字符串'),
    expectedBaseClass: z.string().optional().describe('可选，期望的基类类型（如 BoolValueDelegate、NumberValueDelegate 等），用于检查表达式返回类型是否匹配'),
  },
  { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ expression, expectedBaseClass }) => {
    reportMcpToolCall('validate_atom_expression');
    try {
      ensureMetadataLoaded();

      // 尝试解析
      const parsed = FAtomExpressionParser.main(expression);
      if (!parsed) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: false,
            valid: false,
            error: '表达式解析失败，返回值为空。请检查语法是否正确。',
            expression,
          }) }],
        };
      }

      // 检查基类匹配
      let baseClassMatch = true;
      let actualBaseClass = '';
      if (expectedBaseClass && parsed._ClassName) {
        const metadata = ensureMetadataLoaded();
        const meta = metadata.find(m => m.className === parsed._ClassName || m.funcName === parsed._ClassName);
        if (meta) {
          actualBaseClass = meta.baseClass;
          baseClassMatch = meta.baseClass === expectedBaseClass;
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          valid: true,
          expression,
          parsed,
          ...(expectedBaseClass ? { expectedBaseClass, actualBaseClass, baseClassMatch } : {}),
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '验证表达式时发生未知错误。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: false,
          valid: false,
          error: message,
          expression,
        }) }],
      };
    }
  }
);

// ============ Tool 11: 批量写入/更新 Excel 行 ============

server.tool(
  'write_excel_rows',
  '批量写入或更新 Excel 行数据。按 RowName 匹配已有行则更新，不存在则追加新行。使用 xlsx-populate 写入以完整保留原始格式（条件格式、合并单元格、样式等）。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径'),
    sheetName: z.string().optional().describe('可选，目标工作表名称。不指定则使用第一个工作表'),
    rows: z.array(z.record(z.string(), z.string())).describe('行数据数组。每个元素是 { 列名: 值 } 的对象，必须包含 RowName 列。例如: [{"RowName": "row1", "HP": "100", "ATK": "50"}]'),
    validateAtomFields: z.boolean().optional().describe('可选，默认 false。设为 true 则在写入前验证原子字段的表达式是否合法'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ filePath, sheetName, rows, validateAtomFields }) => {
    reportMcpToolCall('write_excel_rows', { file_path: filePath, row_count: rows?.length || 0 });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      if (!rows || rows.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: '行数据不能为空' }) }],
        };
      }

      // 转换为 RowRecord 类型
      const typedRows: RowRecord[] = rows as RowRecord[];

      // 可选：写入前验证原子字段
      const validationErrors: { rowName: string; field: string; error: string }[] = [];
      if (validateAtomFields) {
        ensureMetadataLoaded();
        const loader = await ensureConfigLoaded();
        const xlsxFileName = getExcelFileName(filePath);
        const targetSheetName = sheetName || '';

        for (const row of typedRows) {
          const rowName = Object.entries(row).find(([key]) => isRowNameLabel(key))?.[1] || '';
          for (const [fieldName, value] of Object.entries(row)) {
            if (isRowNameLabel(fieldName) || !value || value.trim().length === 0) continue;
            if (!loader.isAtomicField(fieldName, targetSheetName, xlsxFileName)) continue;

            try {
              const fieldRuleInfo = loader.getFieldRuleInfo(fieldName, targetSheetName, xlsxFileName);
              const { expression } = preprocessCombinationExpression(value, fieldRuleInfo.allowCombination);
              FAtomExpressionParser.main(expression);
            } catch (parseError) {
              const msg = parseError instanceof Error ? parseError.message : '表达式解析失败';
              validationErrors.push({ rowName, field: fieldName, error: msg });
            }
          }
        }

        if (validationErrors.length > 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              ok: false,
              error: '原子字段表达式验证失败，未写入任何数据',
              validationErrors,
            }, null, 2) }],
          };
        }
      }

      const result = await writeExcelRows(filePath, typedRows, sheetName);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          filePath,
          sheetName: sheetName || '(第一个工作表)',
          ...result,
          message: `成功写入 ${result.totalRows} 行（更新 ${result.updatedRows} 行，新增 ${result.addedRows} 行）`,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '写入 Excel 失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 12: 新增单行配置 ============

server.tool(
  'add_excel_row',
  '快速向 Excel 文件追加一行新的配置数据。如果 RowName 已存在则更新该行。适合单行操作场景，批量操作请用 write_excel_rows。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径'),
    sheetName: z.string().optional().describe('可选，目标工作表名称'),
    rowName: z.string().describe('新行的 RowName 值（唯一标识）'),
    data: z.record(z.string(), z.string()).describe('行数据，{ 列名: 值 } 格式。不需要包含 RowName 列（会自动设置）。例如: {"HP": "100", "ATK_Delegate": "GetLevel()"}'),
    validateAtomFields: z.boolean().optional().describe('可选，默认 false。设为 true 则验证原子字段表达式'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ filePath, sheetName, rowName, data, validateAtomFields }) => {
    reportMcpToolCall('add_excel_row', { file_path: filePath, row_name: rowName });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      // 先读取表头找到 RowName 列名
      const excelJsWorkbook = new ExcelJS.Workbook();
      await excelJsWorkbook.xlsx.readFile(filePath);
      const excelJsSheet = sheetName
        ? excelJsWorkbook.getWorksheet(sheetName)
        : excelJsWorkbook.worksheets[0];
      if (!excelJsSheet) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `工作表不存在: ${sheetName || '(第一个工作表)'}` }) }],
        };
      }

      const xlsxFileName = getExcelFileName(filePath);
      const { headerLabels, rowNameColumnNumber } = extractHeaderMetadata(excelJsSheet, xlsxFileName);
      const rowNameColName = headerLabels[rowNameColumnNumber - 1];

      // 构建完整行数据
      const fullRow: RowRecord = { ...data, [rowNameColName]: rowName };

      // 可选验证
      if (validateAtomFields) {
        ensureMetadataLoaded();
        const loader = await ensureConfigLoaded();
        const validationErrors: { field: string; error: string }[] = [];

        for (const [fieldName, value] of Object.entries(fullRow)) {
          if (isRowNameLabel(fieldName) || !value || value.trim().length === 0) continue;
          if (!loader.isAtomicField(fieldName, sheetName || '', xlsxFileName)) continue;

          try {
            const fieldRuleInfo = loader.getFieldRuleInfo(fieldName, sheetName || '', xlsxFileName);
            const { expression } = preprocessCombinationExpression(value, fieldRuleInfo.allowCombination);
            FAtomExpressionParser.main(expression);
          } catch (parseError) {
            const msg = parseError instanceof Error ? parseError.message : '表达式解析失败';
            validationErrors.push({ field: fieldName, error: msg });
          }
        }

        if (validationErrors.length > 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              ok: false,
              error: '原子字段表达式验证失败，未写入',
              validationErrors,
            }, null, 2) }],
          };
        }
      }

      const result = await writeExcelRows(filePath, [fullRow], sheetName);
      const action = result.updatedRows > 0 ? '更新' : '新增';

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          filePath,
          sheetName: sheetName || '(第一个工作表)',
          rowName,
          action,
          message: `成功${action}行: ${rowName}`,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '新增行失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 13: 修改单个单元格 ============

server.tool(
  'update_excel_cell',
  '精确修改 Excel 中某一行的某一个单元格。通过 RowName 定位行，通过列名定位列。支持在写入前验证原子表达式。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径'),
    sheetName: z.string().optional().describe('可选，目标工作表名称'),
    rowName: z.string().describe('目标行的 RowName 值'),
    columnName: z.string().describe('目标列名（Excel 表头中的列名）'),
    value: z.string().describe('要写入的值'),
    validateIfAtom: z.boolean().optional().describe('可选，默认 true。如果目标列是原子字段，先验证表达式合法性'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ filePath, sheetName, rowName, columnName, value, validateIfAtom }) => {
    reportMcpToolCall('update_excel_cell', { file_path: filePath, row_name: rowName, column_name: columnName });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      const xlsxFileName = getExcelFileName(filePath);
      const shouldValidate = validateIfAtom !== false; // 默认为 true

      // 可选验证原子字段
      if (shouldValidate && value && value.trim().length > 0) {
        const loader = await ensureConfigLoaded();
        if (loader.isAtomicField(columnName, sheetName || '', xlsxFileName)) {
          try {
            ensureMetadataLoaded();
            const fieldRuleInfo = loader.getFieldRuleInfo(columnName, sheetName || '', xlsxFileName);
            const { expression } = preprocessCombinationExpression(value, fieldRuleInfo.allowCombination);
            FAtomExpressionParser.main(expression);
          } catch (parseError) {
            const msg = parseError instanceof Error ? parseError.message : '表达式解析失败';
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                ok: false,
                error: `原子表达式验证失败: ${msg}`,
                columnName,
                value,
                hint: '请检查表达式语法，或设置 validateIfAtom=false 跳过验证',
              }) }],
            };
          }
        }
      }

      // 先读取表头找到 RowName 列名
      const excelJsWorkbook = new ExcelJS.Workbook();
      await excelJsWorkbook.xlsx.readFile(filePath);
      const excelJsSheet = sheetName
        ? excelJsWorkbook.getWorksheet(sheetName)
        : excelJsWorkbook.worksheets[0];
      if (!excelJsSheet) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `工作表不存在: ${sheetName || '(第一个工作表)'}` }) }],
        };
      }

      const { headerLabels, rowNameColumnNumber } = extractHeaderMetadata(excelJsSheet, xlsxFileName);
      const rowNameColName = headerLabels[rowNameColumnNumber - 1];

      // 检查目标列是否存在
      if (!headerLabels.includes(columnName)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: false,
            error: `列名不存在: ${columnName}`,
            availableColumns: headerLabels,
          }) }],
        };
      }

      // 构建行数据
      const row: RowRecord = { [rowNameColName]: rowName, [columnName]: value };
      const result = await writeExcelRows(filePath, [row], sheetName);

      if (result.updatedRows === 0 && result.addedRows === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `未找到 RowName 为 "${rowName}" 的行` }) }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          filePath,
          rowName,
          columnName,
          value,
          action: result.updatedRows > 0 ? '更新' : '新增行并设置',
          message: `成功${result.updatedRows > 0 ? '更新' : '新增'}单元格 [${rowName}].${columnName} = "${value}"`,
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '修改单元格失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ Tool 14: 清空/删除行 ============

server.tool(
  'delete_excel_rows',
  '清空 Excel 中指定行的所有数据（将单元格值设为空字符串）。通过 RowName 定位行。注意：不会物理删除行（避免影响其他行号引用），只是清空内容。',
  {
    filePath: z.string().describe('Excel 文件的绝对路径'),
    sheetName: z.string().optional().describe('可选，目标工作表名称'),
    rowNames: z.array(z.string()).describe('要清空的行的 RowName 数组，例如: ["row1", "row2"]'),
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async ({ filePath, sheetName, rowNames }) => {
    reportMcpToolCall('delete_excel_rows', { file_path: filePath, row_count: rowNames?.length || 0 });
    try {
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: `文件不存在: ${filePath}` }) }],
        };
      }

      if (!rowNames || rowNames.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'rowNames 不能为空' }) }],
        };
      }

      const result = await clearExcelRows(filePath, rowNames, sheetName);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          filePath,
          sheetName: sheetName || '(第一个工作表)',
          clearedRows: result.clearedRows,
          notFoundRows: result.notFoundRows,
          message: `成功清空 ${result.clearedRows} 行` +
            (result.notFoundRows.length > 0 ? `，${result.notFoundRows.length} 行未找到: ${result.notFoundRows.join(', ')}` : ''),
        }, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除行失败。';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: message }) }],
      };
    }
  }
);

// ============ 启动 MCP Server ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MHAtomExcelTool MCP Server running on stdio');
  
  // 上报 MCP Server 启动
  reportMcpServerStart();
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
