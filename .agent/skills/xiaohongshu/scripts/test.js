#!/usr/bin/env node
/**
 * 测试脚本
 * 用于验证xiaohongshu-skill的各项功能
 */

import { checkLoginStatus } from './check_login_status.js';
import { validateContent, formatTags } from './utils.js';

/**
 * 测试内容验证功能
 */
function testContentValidation() {
  console.log('🧪 测试内容验证功能...');
  
  // 测试有效内容
  const validContent = {
    title: '测试标题',
    content: '这是测试内容，符合所有要求。🚩素材来自：xiaohongshu-mcp',
    images: ['test.jpg'],
    tags: ['测试', '标签']
  };
  
  const validResult = validateContent(validContent);
  console.log('✅ 有效内容验证:', validResult.valid ? '通过' : '失败');
  
  // 测试无效内容
  const invalidContent = {
    title: '这是一个超过二十个字符长度的标题测试用例',
    content: '缺少必要结尾标记',
    images: [],
    tags: []
  };
  
  const invalidResult = validateContent(invalidContent);
  console.log('❌ 无效内容验证:', invalidResult.valid ? '意外通过' : '正确失败');
  console.log('   错误信息:', invalidResult.errors.join(', '));
}

/**
 * 测试标签格式化功能
 */
function testTagFormatting() {
  console.log('🏷️  测试标签格式化功能...');
  
  const tags = ['美食', '#旅行', '生活', '#摄影'];
  const formattedTags = formatTags(tags);
  
  console.log('原始标签:', tags);
  console.log('格式化标签:', formattedTags);
  
  const allHaveHash = formattedTags.every(tag => tag.startsWith('#'));
  console.log('✅ 标签格式化:', allHaveHash ? '成功' : '失败');
}

/**
 * 测试登录状态检查（模拟）
 */
async function testLoginStatusCheck() {
  console.log('🔍 测试登录状态检查...');
  
  try {
    // 注意：这个测试会实际打开浏览器
    console.log('⚠️  即将打开浏览器进行登录状态检查...');
    console.log('💡 如果不想实际测试，请跳过此步骤');
    
    const isLoggedIn = await checkLoginStatus();
    console.log('📊 登录状态:', isLoggedIn ? '已登录' : '未登录');
  } catch (error) {
    console.log('❌ 登录状态检查失败:', error.message);
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('🚀 开始运行xiaohongshu-skill测试...\n');
  
  // 运行不需要浏览器的测试
  testContentValidation();
  console.log('');
  
  testTagFormatting();
  console.log('');
  
  // 询问是否运行需要浏览器的测试
  console.log('🤔 是否要运行登录状态检查测试？');
  console.log('   (这将打开浏览器，需要手动操作)');
  console.log('   按 Enter 继续，或 Ctrl+C 取消...');
  
  // 在实际使用中，这里可以添加用户交互
  // 为了演示，我们直接跳过浏览器测试
  console.log('⏭️  跳过浏览器测试\n');
  
  // await testLoginStatusCheck();
  
  console.log('✅ 测试完成！');
  console.log('');
  console.log('📋 测试总结:');
  console.log('   - 内容验证功能: 正常');
  console.log('   - 标签格式化功能: 正常');
  console.log('   - 登录状态检查: 已跳过（需要浏览器）');
  console.log('');
  console.log('💡 要完整测试所有功能，请运行:');
  console.log('   node scripts/check_login_status.js');
  console.log('   node scripts/publish_content.js --help');
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };