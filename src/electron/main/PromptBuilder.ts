/**
 * AI 提示词构建器
 * 统一管理所有 AI 服务的系统提示词
 */

import { ClassMetadata } from '../../types/MetaDefine';

/**
 * 构建原子知识库摘要
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
      atomSummary += `- **${atom.displayName || atom.className}** (\`${atom.className}\`)\n`;
      if (atom.funcName) {
        atomSummary += `  - 函数名: \`${atom.funcName}\`\n`;
      }
      if (atom.description) {
        atomSummary += `  - 说明: ${atom.description}\n`;
      }
      if (atom.richDescription) {
        atomSummary += `  - 用法: ${atom.richDescription}\n`;
      }
      if (atom.baseClass) {
        atomSummary += `  - 基类: ${atom.baseClass}\n`;
      }
      if (atom.fields && atom.fields.length > 0) {
        const fieldDesc = atom.fields.map(f => `${f.label || f.key}${f.isOptional ? '?' : ''}`).join(', ');
        atomSummary += `  - 参数: ${fieldDesc}\n`;
      }
    }
  }

  return atomSummary;
}

/**
 * 获取默认系统提示词（无知识库时使用）
 */
export function getDefaultSystemPrompt(): string {
  return `你是一个专业的游戏配置原子表达式助手。你的任务是帮助用户理解和配置原子表达式。
请根据用户的问题进行回答。`;
}

/**
 * 构建完整的系统提示词（包含原子知识库）
 */
export function buildSystemPromptWithKnowledge(atomSummary: string): string {
  return `你是一个专业的游戏配置原子表达式助手。你的任务是帮助用户理解和配置原子表达式。

## 你的能力
1. 解释原子的用途和参数含义
2. 根据用户需求推荐合适的原子配置
3. 帮助用户排查原子配置问题
4. 提供原子表达式的最佳实践建议

## 原子知识库

以下是可用的原子类型及其说明：
${atomSummary}

## 回答规范
1. 使用简洁清晰的中文回答
2. 推荐配置时，给出具体的原子类名和参数值示例
3. 推荐的原子参数一定要完全遵循知识库中的参数格式，不能随意增减参数，数量要保证无误。比如Self()，本身没有参数，你推荐Self(GetTarget())
4. 如果用户的需求不明确，主动询问细节
5. 对于复杂配置，分步骤说明
6. 引用原子时只显示funcName，最后推荐的原子也只能只funcName，类似这种程序代码的格式
(AAINextDamageTimeSpecificTaskType(RangedAttack)<=(AAIAbilityRandom()*0.05+0.075))&&AAINextDamageTimeSpecificTaskType(RangedAttack)>0&&GetDist2D(Self(), AAIGetEnemy())<=2000

请根据用户的问题，结合上述原子知识库进行回答。`;
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
