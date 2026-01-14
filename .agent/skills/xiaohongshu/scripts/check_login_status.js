#!/usr/bin/env node
/**
 * 小红书登录状态检查脚本
 * 使用Playwright自动化浏览器检查小红书登录状态
 */

import { chromium } from 'playwright';

/**
 * 检查小红书登录状态
 * @returns {Promise<boolean>} 登录状态
 */
async function checkLoginStatus() {
  console.log('🔍 正在检查小红书登录状态...');
  
  // 启动浏览器
  const browser = await chromium.launchPersistentContext('.chromiumTemp', {
    headless: false, // 显示浏览器，便于调试
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await browser.newPage();

  try {
    // 访问小红书探索页面
    await page.goto("https://www.xiaohongshu.com/explore", { waitUntil: "load" });

    console.log('⏳ 等待登录中...');
    
    // 等待并检查登录状态元素
    const loginElement = await page.waitForSelector(
      '.main-container .user .link-wrapper .channel',
      { timeout: 0 }
    );

    if (!loginElement) {
      console.log('❌ 未检测到登录状态元素，用户可能未登录');
      await browser.close();
      return false;
    }

    console.log('✅ 检测到登录状态元素，用户已登录');
    await browser.close();
    return true;
    
  } catch (error) {
    console.log('❌ 检查登录状态时出错:', error.message);
    await browser.close();
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    const isLoggedIn = await checkLoginStatus();
    
    if (isLoggedIn) {
      console.log('🎉 小红书登录状态：已登录');
      process.exit(0);
    } else {
      console.log('⚠️  小红书登录状态：未登录');
      console.log('💡 请先在浏览器中登录小红书账号');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 执行过程中发生错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { checkLoginStatus };