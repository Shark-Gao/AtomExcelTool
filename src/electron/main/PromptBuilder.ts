/**
 * AI 提示词构建器
 * 统一管理所有 AI 服务的系统提示词
 */

import { ClassMetadata, FieldMeta, FieldType } from '../../types/MetaDefine';

function formatFieldType(type: FieldType | FieldType[]): string {
  return Array.isArray(type) ? type.join(' | ') : type;
}

function formatOptions(field: FieldMeta): string {
  if (!field.options || field.options.length === 0) return '';

  // 避免把整个枚举塞爆 prompt：最多展示前 8 个
  const max = 8;
  const shown = field.options.slice(0, max)
    .map(o => `${String(o.value)}${o.label ? `(${o.label})` : ''}`)
    .join(', ');

  if (field.options.length > max) {
    return `${shown} ...(+${field.options.length - max})`;
  }
  return shown;
}

function formatFieldLine(field: FieldMeta, index: number): string {
  const name = field.label || field.key;
  const flags: string[] = [];
  if (field.isOptional) flags.push('可选');
  if (field.isRest) flags.push('可变参数');
  if (field.selectEditable) flags.push('可编辑下拉');

  const flagText = flags.length ? `（${flags.join('，')}）` : '';
  const typeText = formatFieldType(field.type);
  const baseClassText = field.baseClass ? `, baseClass=${field.baseClass}` : '';
  const descText = field.description ? ` - ${field.description}` : '';
  const optionsText = formatOptions(field);
  const optionsSuffix = optionsText ? `; 可选值: ${optionsText}` : '';

  return `    ${index + 1}) ${name}${flagText}: type=${typeText}${baseClassText}${descText}${optionsSuffix}`;
}

/**
 * 构建原子知识库摘要（高精度版）
 * - 以 funcName 为主
 * - 明确 baseClass（决定返回类型/原子类别）
 * - 明确参数顺序/数量（避免 AI 乱编参数）
 */
export function buildAtomSummary(metadata: ClassMetadata[]): string {
  // 按类别分组
  const categoryMap = new Map<string, ClassMetadata[]>();

  for (const meta of metadata) {
    const category = meta.category || '未分类';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(meta);
  }

  // 构建知识库摘要
  let atomSummary = '';

  for (const [category, atoms] of categoryMap) {
    atomSummary += `\n### ${category}\n`;

    for (const atom of atoms) {
      // 注意：表达式里只允许出现 funcName，所以这里也以 funcName 做主键
      const title = atom.funcName || atom.className;
      atomSummary += `- \`${title}\`  （displayName: ${atom.displayName || ''}, className: \`${atom.className}\`）\n`;
      atomSummary += `  - baseClass: \`${atom.baseClass}\`\n`;

      // 给模型一个“可执行”的签名，降低乱填/乱增参数概率
      if (atom.fields && atom.fields.length > 0) {
        const sigParams = atom.fields.map(f => {
          const rawName = f.key || f.label || 'param';
          const name = f.isRest ? `...${rawName}` : rawName;
          return f.isOptional ? `${name}?` : name;
        }).join(', ');
        atomSummary += `  - signature: \`${title}(${sigParams})\`\n`;
      } else {
        atomSummary += `  - signature: \`${title}()\`\n`;
      }

      if (atom.description) {

        atomSummary += `  - 说明: ${atom.description}\n`;
      }
      if (atom.richDescription) {
        atomSummary += `  - 用法: ${atom.richDescription}\n`;
      }
      if (atom.baseClass) {
        // baseClass 已单独列出，这里不重复 baseClass 字段
      }

      if (atom.fields && atom.fields.length > 0) {
        atomSummary += `  - 参数（严格按顺序/数量）:\n`;
        atomSummary += atom.fields.map((f, idx) => formatFieldLine(f, idx)).join('\n') + '\n';
      } else {
        atomSummary += `  - 参数: 无（必须写成 \`${title}()\`，不要添加任何参数）\n`;

      }
    }
  }

  return atomSummary;
}

/**
 * 获取默认系统提示词（无知识库时使用）
 */
export function getDefaultSystemPrompt(): string {
  return `你是一个专业的“游戏配置原子表达式”助手。

当前没有加载原子知识库。
- 你可以解释概念、给出排查思路、提出需要用户补充的信息。
- 你不允许编造不存在的原子函数名或参数。`;
}

/**
 * 构建完整的系统提示词（包含原子知识库）
 */
export function buildSystemPromptWithKnowledge(atomSummary: string): string {
  return `你是一个专业的“游戏配置原子表达式”助手。你的目标是：在不编造的前提下，给出可直接粘贴使用的、参数严格正确的原子表达式。

## 重要背景（必须遵守）
- 原子表达式由一系列函数调用组成：FuncName(arg1, arg2, ...)。
- 最终表达式中 **只允许出现 funcName**（不要输出 className/displayName 作为代码的一部分）。
- 参数是 **位置参数**：必须严格匹配知识库里该原子的“参数顺序/数量”。

## 原子类型与推荐原则（按 baseClass）
- [BoolValueDelegate] / [boolean]：条件/判断原子（可用于 &&、||、!、比较表达式结果等）
- [NumberValueDelegate] / [number]：数值原子（可用于 + - * / 和比较）
- [ActorValueDelegate]：目标/对象原子（如 Self、Enemy、Target 等语义）
- [EventDelegateEx]：事件原子（事件触发/监听语义）
- [ActionDelegate]：动作原子（执行/调用语义）
- [TaskDelegate]：任务原子（Task/行为树语义）

## 绝对规则（高优先级）
1. **只能使用知识库中出现的原子 funcName**。找不到就明确说“知识库中没有该原子/能力”，并提出替代方案或反问。
2. **参数必须严格正确**：
   - 不允许凭空新增参数、不允许漏必填参数、不允许交换顺序。
   - 带“可选”的参数：仅在你能确定“可选参数可以省略”且省略不影响语义时才省略；否则请补齐或先反问确认。
   - 带“可选值”的字段：参数值必须来自可选值（不要造一个新枚举）。
3. 如果用户需求不明确（比如：比较阈值、距离单位、目标是谁、事件名等），**先问 1-3 个关键问题**，再给出一个“默认假设版本”的表达式，并明确写出你的默认假设。
4. 推荐时要根据 baseClass 匹配类型：不要把数值原子塞到 bool 位置，也不要把动作原子当条件。
5. 当用户提供“当前正在编辑的原子”上下文时：优先解释/推荐与该原子同类（baseClass 相同）或可直接组合使用的原子。

## 输出格式（务必遵循）
按下面结构输出（中文）：
- **结论**：一句话说明你推荐的思路
- **推荐表达式**：用一个代码块给出单行表达式（只包含 funcName）
- **参数对齐检查表**：当你给出的表达式中出现某个原子调用（例如 A(x,y)），你必须列出该原子每个参数的对齐：
  - 1) 字段名（来自知识库） -> 你填入的实参
  - 2) 字段名 -> 你填入的实参
  你可以只对“你新增/你重点推荐”的那几个原子做对齐检查表（不需要对整条长表达式里每一处都展开）。
- **参数说明**：逐个解释关键参数为什么这么填（可简洁）
- **需要确认的问题（如有）**：列出你缺的信息


## 原子知识库（可用原子清单）
${atomSummary}

现在开始，根据用户问题回答。`;
}

/**
 * 一站式构建系统提示词
 * @param metadata 原子元数据，为空则返回默认提示词
 */
export function buildSystemPrompt(metadata?: ClassMetadata[]): string {
  if (!metadata || metadata.length === 0) {
    return getDefaultSystemPrompt();
  }

  const atomSummary = buildAtomSummary(metadata);
  return buildSystemPromptWithKnowledge(atomSummary);
}
