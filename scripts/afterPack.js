/**
 * electron-builder afterPack 钩子
 * 在打包阶段删除不需要的语言文件
 */

const fs = require('fs');
const path = require('path');

// 保留的语言包列表
const KEEP_LOCALES = ['en-US.pak', 'zh-CN.pak', 'zh-TW.pak'];

/**
 * 删除不需要的语言文件
 */
function cleanLocalesInDir(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return 0;
  }

  const localesPath = path.join(dir, 'locales');
  
  if (!fs.existsSync(localesPath)) {
    return 0;
  }

  let deletedCount = 0;
  const files = fs.readdirSync(localesPath);
  
  files.forEach((file) => {
    if (!KEEP_LOCALES.includes(file)) {
      const filePath = path.join(localesPath, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`    ✓ 删除: ${file}`);
        deletedCount++;
      } catch (error) {
        console.warn(`    ✗ 删除失败: ${file} - ${error.message}`);
      }
    }
  });

  return deletedCount;
}

/**
 * 主函数 - afterPack 钩子被调用时执行
 * 参数 context 包含 appOutDir（应用输出目录）
 */
async function afterPack(context) {
  const appOutDir = context.appOutDir;

  if (!appOutDir) {
    console.warn('⚠️  无法获取应用输出目录 (appOutDir)，跳过清理');
    return;
  }

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   开始清理多语言文件                    ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  console.log(`打包目录: ${appOutDir}`);
  console.log(`保留语言: ${KEEP_LOCALES.join(', ')}\n`);
  
  console.log('正在清理多语言文件...\n');

  // 清理主程序目录中的 locales
  const deletedCount = cleanLocalesInDir(appOutDir);

  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   清理完成，共删除 ${deletedCount} 个文件                    ║`);
  console.log('╚════════════════════════════════════════╝\n');
}

// 导出为 CommonJS 模块
module.exports = afterPack;
