import { readFileSync } from 'fs';
import { getConfigFilePath } from './ConfigManager';

export interface AtomFieldRule {
  type: 'suffix' | 'prefix' | 'exact';
  value: string;
  baseClass: string;
  allowCombination?: boolean;
}

export interface SheetAtomFieldsConfig {
  suffixRules: AtomFieldRule[];
  prefixRules: AtomFieldRule[];
  exactFieldNames: Map<string, AtomFieldRule>;
}

export interface FieldRuleInfo {
  baseClasses: string[];
  allowCombination: boolean;
}

/**
 * 工作表配置的键格式：`fileName#sheetName`
 * 或仅 `sheetName`（表示全局工作表配置，适用于所有文件）
 */
export class AtomFieldsConfigLoader {
  private static instance: AtomFieldsConfigLoader;
  
  // 配置存储格式：
  // Key: "fileName#sheetName" 或 "sheetName"（全局）
  // Value: 该工作表的规则配置
  private config: Map<string, SheetAtomFieldsConfig> = new Map();
  
  private defaultSuffixRules: AtomFieldRule[] = [];
  private defaultExactFieldNames: Map<string, AtomFieldRule> = new Map();
  private isLoaded = false;

  private constructor() {}

  public static getInstance(): AtomFieldsConfigLoader {
    if (!AtomFieldsConfigLoader.instance) {
      AtomFieldsConfigLoader.instance = new AtomFieldsConfigLoader();
    }
    return AtomFieldsConfigLoader.instance;
  }

  /**
   * 获取配置文件路径
   * 复用 ConfigManager 的路径管理逻辑
   */
  private getConfigPath(): string {
    return getConfigFilePath('AtomFieldsExcelConfig.json');
  }

  /**
   * 解析 JSON 配置文件
   */
  private parseJsonConfig(jsonContent: string): void {
    try {
      const config = JSON.parse(jsonContent);

      // 解析默认规则
      if (config.defaultRules) {
        const {
          suffixRules = [],
          prefixRules = [],
          exactFieldNames = {}
        } = config.defaultRules;

        for (const rule of suffixRules) {
          if (!rule || !rule.baseClass) {
            continue;
          }
          this.defaultSuffixRules.push({
            type: 'suffix',
            value: rule.value || '',
            baseClass: rule.baseClass,
            allowCombination: Boolean(rule.allowCombination)
          });
        }

        for (const rule of prefixRules) {
          if (!rule || !rule.baseClass) {
            continue;
          }
          this.defaultSuffixRules.push({
            type: 'prefix',
            value: rule.value || '',
            baseClass: rule.baseClass,
            allowCombination: Boolean(rule.allowCombination)
          });
        }

        const exactRules = this.normalizeExactRules(exactFieldNames);
        for (const rule of exactRules) {
          this.defaultExactFieldNames.set(rule.value, rule);
        }
      }

      // 解析工作表特定规则
      if (config.SpecificFieldNames && Array.isArray(config.SpecificFieldNames)) {
        for (const sheet of config.SpecificFieldNames) {
          this.parseSheetRulesFromJsonNode(sheet);
        }
      }

      this.isLoaded = true;
      console.log('[AtomFieldsConfigLoader] 配置加载成功');
      console.log(`  - 后缀规则: ${this.defaultSuffixRules.filter(r => r.type === 'suffix').length} 个`);
      console.log(`  - 前缀规则: ${this.defaultSuffixRules.filter(r => r.type === 'prefix').length} 个`);
      console.log(`  - 字段规则: ${this.defaultExactFieldNames.size} 个`);
      console.log(`  - 工作表规则: ${this.config.size} 个`);
    } catch (error) {
      console.error('[AtomFieldsConfigLoader] JSON 解析失败:', error);
      throw error;
    }
  }

  /**
   * 从 JSON 节点中解析工作表特定规则
   */
  private parseSheetRulesFromJsonNode(sheetNode: any): void {
    if (!sheetNode.sheetName) {
      console.warn('[AtomFieldsConfigLoader] Sheet 节点缺少 name 属性');
      return;
    }

    const sheetName = sheetNode.sheetName;
    const fileName = sheetNode.xlsxFile;  // 可选

    const sheetConfig: SheetAtomFieldsConfig = {
      suffixRules: [],
      prefixRules: [],
      exactFieldNames: new Map<string, AtomFieldRule>()
    };

    // 解析该工作表的后缀规则
    if (sheetNode.suffixRules && Array.isArray(sheetNode.suffixRules)) {
      for (const rule of sheetNode.suffixRules) {
        if (!rule || !rule.baseClass) {
          continue;
        }
        sheetConfig.suffixRules.push({
          type: 'suffix',
          value: rule.value || '',
          baseClass: rule.baseClass,
          allowCombination: Boolean(rule.allowCombination)
        });
      }
    }

    // 解析该工作表的前缀规则
    if (sheetNode.prefixRules && Array.isArray(sheetNode.prefixRules)) {
      for (const rule of sheetNode.prefixRules) {
        if (!rule || !rule.baseClass) {
          continue;
        }
        sheetConfig.prefixRules.push({
          type: 'prefix',
          value: rule.value || '',
          baseClass: rule.baseClass,
          allowCombination: Boolean(rule.allowCombination)
        });
      }
    }

    // 解析该工作表的精确匹配字段
    if (sheetNode.exactFieldNames) {
      const exactRules = this.normalizeExactRules(sheetNode.exactFieldNames);
      for (const rule of exactRules) {
        sheetConfig.exactFieldNames.set(rule.value, rule);
      }
    }

    // 如果该工作表有规则，添加到配置
    if (sheetConfig.suffixRules.length > 0 || 
        sheetConfig.prefixRules.length > 0 || 
        sheetConfig.exactFieldNames.size > 0) {
      const configKey = this.getConfigKey(fileName, sheetName);
      this.config.set(configKey, sheetConfig);
    }
  }

  private parseExactRule(ruleConfig: any): AtomFieldRule | null {
    if (!ruleConfig || typeof ruleConfig !== 'object') {
      return null;
    }

    const value = typeof ruleConfig.value === 'string' ? ruleConfig.value.trim() : '';
    const baseClass = ruleConfig.baseClass;

    if (!value || typeof baseClass !== 'string') {
      console.warn('[AtomFieldsConfigLoader] Exact rule 配置无效:', ruleConfig);
      return null;
    }

    return {
      type: 'exact',
      value,
      baseClass,
      allowCombination: Boolean(ruleConfig.allowCombination)
    };
  }

  private normalizeExactRules(exactFieldNames: any): AtomFieldRule[] {
    const rules: AtomFieldRule[] = [];
    if (!exactFieldNames) {
      return rules;
    }

    if (Array.isArray(exactFieldNames)) {
      for (const rule of exactFieldNames) {
        const parsedRule = this.parseExactRule(rule);
        if (parsedRule) {
          rules.push(parsedRule);
        }
      }
    }

    return rules;
  }


  /**
   * 加载并解析配置文件
   */
  public async load(): Promise<void> {
    try {
      const configPath = this.getConfigPath();
      console.log('[AtomFieldsConfigLoader] 开始加载配置文件:', configPath);

      const jsonContent = readFileSync(configPath, 'utf-8');
      console.log('[AtomFieldsConfigLoader] 配置文件大小:', jsonContent.length, '字节');
      
      this.parseJsonConfig(jsonContent);
      
      console.log('[AtomFieldsConfigLoader] ✅ 配置加载完成');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';
      console.error('[AtomFieldsConfigLoader] ❌ 配置加载失败:', errorMsg);
      if (stack) {
        console.error('[AtomFieldsConfigLoader] 错误堆栈:', stack);
      }
      throw error;
    }
  }

  /**
   * 生成配置键
   * @param fileName Excel 文件名（不包括路径）
   * @param sheetName 工作表名
   * @returns 配置键
   */
  private getConfigKey(fileName?: string, sheetName?: string): string {
    if (fileName && sheetName) {
      return `${fileName}#${sheetName}`;
    }
    return sheetName || '';
  }

  /**
   * 获取字段匹配信息（包含允许基类与组合配置）
   */
  public getFieldRuleInfo(fieldName: string, sheetName?: string, fileName?: string): FieldRuleInfo {
    // 1. 检查文件特定的工作表规则（最高优先级）
    if (fileName && sheetName) {
      const fileSheetKey = this.getConfigKey(fileName, sheetName);
      const sheetConfig = this.config.get(fileSheetKey);
      const matchedRule = this.checkSheetConfig(fieldName, sheetConfig);
      if (matchedRule) {
        return this.buildFieldRuleInfoFromMatches([matchedRule]);
      }
    }

    // 2. 检查全局工作表规则（仅工作表名，不指定文件）
    if (sheetName) {
      const globalSheetKey = this.getConfigKey(undefined, sheetName);
      const sheetConfig = this.config.get(globalSheetKey);
      const matchedRule = this.checkSheetConfig(fieldName, sheetConfig);
      if (matchedRule) {
        return this.buildFieldRuleInfoFromMatches([matchedRule]);
      }
    }

    // 3. 检查全局规则 - 精确匹配
    if (this.defaultExactFieldNames.has(fieldName)) {
      return this.buildFieldRuleInfoFromMatches([
        this.defaultExactFieldNames.get(fieldName)!
      ]);
    }

    // 4. 检查全局规则 - 前后缀
    const matches: AtomFieldRule[] = [];
    for (const rule of this.defaultSuffixRules) {
      if (rule.type === 'suffix' && fieldName.endsWith(rule.value)) {
        matches.push(rule);
      } else if (rule.type === 'prefix' && fieldName.startsWith(rule.value)) {
        matches.push(rule);
      }
    }

    if (matches.length > 0) {
      return this.buildFieldRuleInfoFromMatches(matches);
    }

    return { baseClasses: [], allowCombination: false };
  }

  /**
   * 根据字段名、文件名和工作表名获取允许的基类
   * 优先级：文件特定工作表 > 全局工作表 > 全局规则
   */
  public getAllowedBaseClassesForField(fieldName: string, sheetName?: string, fileName?: string): string[] {
    return this.getFieldRuleInfo(fieldName, sheetName, fileName).baseClasses;
  }

  /**
   * 检查工作表配置
   */
  private checkSheetConfig(fieldName: string, sheetConfig?: SheetAtomFieldsConfig): AtomFieldRule | null {
    if (!sheetConfig) {
      return null;
    }

    // 检查精确匹配
    if (sheetConfig.exactFieldNames.has(fieldName)) {
      return sheetConfig.exactFieldNames.get(fieldName)!;
    }

    // 检查后缀规则
    for (const rule of sheetConfig.suffixRules) {
      if (rule.type === 'suffix' && fieldName.endsWith(rule.value)) {
        return rule;
      }
    }

    // 检查前缀规则
    for (const rule of sheetConfig.prefixRules) {
      if (rule.type === 'prefix' && fieldName.startsWith(rule.value)) {
        return rule;
      }
    }

    return null;
  }

  private buildFieldRuleInfoFromMatches(matches: AtomFieldRule[]): FieldRuleInfo {
    return {
      baseClasses: matches.map(rule => rule.baseClass),
      allowCombination: matches.some(rule => Boolean(rule.allowCombination))
    };
  }

  /**
   * 判断是否为原子字段
   */
  public isAtomicField(fieldName: string, sheetName?: string, fileName?: string): boolean {
    return this.getAllowedBaseClassesForField(fieldName, sheetName, fileName).length > 0;
  }

  /**
   * 获取所有配置（用于调试）
   */
  public getConfig() {
    return {
      defaultSuffixRules: this.defaultSuffixRules,
      defaultExactFieldNames: Array.from(this.defaultExactFieldNames.entries()),
      sheetConfigs: Array.from(this.config.entries())
    };
  }

  /**
   * 检查是否已加载
   */
  public isConfigLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * 重新加载配置（热更新）
   */
  public async reload(): Promise<void> {
    this.config.clear();
    this.defaultSuffixRules = [];
    this.defaultExactFieldNames.clear();
    this.isLoaded = false;
    await this.load();
  }
}
