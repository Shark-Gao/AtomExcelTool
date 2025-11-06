import { deParseJsonToExpression } from './DeParseJsonToExpression';
import { FAtomExpressionParser } from './MHTsAtomSystemUtils';

/**
 * 测试用例接口
 */
interface TestCase {
  name: string;
  json: any;
  expectedExpression: string;
  description?: string;
}

/**
 * 测试用例集合
 */
const testCases: TestCase[] = [
  {
    name: 'Function Call - Max',
    json: {
      _ClassName: 'NumberValueMaximumOperator',
      A: {
        _ClassName: 'NumberValueConstDelegate',
        Constant: 50,
        ConstantKey: ''
      },
      B: {
        _ClassName: 'NumberValueConstDelegate',
        Constant: 100,
        ConstantKey: ''
      }
    },
    expectedExpression: 'Max(50, 100)',
    description: '最大值函数'
  },
];

/**
 * 运行所有测试
 */
export function runAllTests(): void {
  console.log('========================================');
  console.log('  De-Parse JSON to Expression Tests');
  console.log('========================================\n');

  let passedCount = 0;
  let failedCount = 0;
  const failedTests: string[] = [];

  testCases.forEach((testCase, index) => {
    // const delegate = FAtomExpressionParser.main("ConditionalAction(CheckInteractActionType(1),NOP(),Heal(Self(), GetAttr(MaxHealth) * 0.02))");
    // const delegate = FAtomExpressionParser.main("NOP()");
    // const delegate = FAtomExpressionParser.main("Heal(Self(), GetAttr(MaxHealth) * 0.02)");
    const delegate = FAtomExpressionParser.main("CheckAdventureID(Self(), 11)");

    const result = deParseJsonToExpression(delegate);
    const passed = result === testCase.expectedExpression;

    if (passed) {
      passedCount++;
      console.log(`✓ Test ${index + 1}: ${testCase.name}`);
    } else {
      failedCount++;
      console.log(`✗ Test ${index + 1}: ${testCase.name}`);
      console.log(`  Expected: ${testCase.expectedExpression}`);
      console.log(`  Got:      ${result}`);
      failedTests.push(testCase.name);
    }

    if (testCase.description) {
      console.log(`  Description: ${testCase.description}`);
    }
    console.log('');
  });

  console.log('========================================');
  console.log(`  Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================\n');

  if (failedTests.length > 0) {
    console.log('Failed tests:');
    failedTests.forEach(name => console.log(`  - ${name}`));
  }
}

/**
 * 运行特定的测试
 */
export function runSpecificTest(testName: string): void {
  const testCase = testCases.find(t => t.name === testName);
  if (!testCase) {
    console.log(`Test "${testName}" not found`);
    return;
  }

  const result = deParseJsonToExpression(testCase.json);
  const passed = result === testCase.expectedExpression;

  console.log(`Test: ${testCase.name}`);
  console.log(`Description: ${testCase.description || 'N/A'}`);
  console.log(`Expected: ${testCase.expectedExpression}`);
  console.log(`Got:      ${result}`);
  console.log(`Status:   ${passed ? 'PASSED' : 'FAILED'}`);
}

/**
 * 获取所有测试用例
 */
export function getAllTestCases(): TestCase[] {
  return testCases;
}

// 如果直接运行此文件，执行所有测试
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
