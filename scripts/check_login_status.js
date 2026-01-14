
import config from '../src/config.js';
import { createContext, createPage } from '../src/automation/browser.js';
import { getCookiePath, isCookieValid } from '../src/automation/login.js';
import logger from '../src/utils/logger.js';

async function checkLoginStatus() {
    console.log('🔍 正在检查登录状态...');

    // 假设使用默认第一个账号或查找所有活跃账号
    // 这里简化为检查 active account
    // For specific account, user might need to pass arg, but skill spec says simple node check_login_status.js

    // Check account 1 for default or scan dir?
    // Let's check the most recently used or default id=1 if no others

    // Better: Check if ANY valid cookie exists
    const fs = await import('fs');
    const path = await import('path');

    const cookieFiles = fs.readdirSync(config.cookiesDir).filter(f => f.endsWith('.json'));

    if (cookieFiles.length === 0) {
        console.log('❌ 未找到任何登录凭证 (Cookies)');
        return false;
    }

    console.log(`📂 发现 ${cookieFiles.length} 个凭证文件`);

    let anyLoggedIn = false;

    for (const file of cookieFiles) {
        const cookiePath = path.join(config.cookiesDir, file);
        const accountId = file.match(/account_(\d+)/)?.[1] || 'unknown';

        if (!isCookieValid(cookiePath)) {
            console.log(`⚠️ 账号 ${accountId}: Cookie 文件格式无效或已过期`);
            continue;
        }

        console.log(`👤 正在验证账号 ${accountId}...`);

        let context, page;
        try {
            context = await createContext(cookiePath);
            page = await createPage(context);

            await page.goto(config.xhs.creatorUrl, { waitUntil: 'domcontentloaded' });

            // Check for login selector
            // User indicators from publisher.js
            const userIndicators = [
                '.user-name', '.avatar', '.creator-avatar', '.header-user',
                '.main-container .user .link-wrapper .channel'
            ];

            let isLoggedIn = false;
            for (const selector of userIndicators) {
                if (await page.locator(selector).first().isVisible({ timeout: 2000 }).catch(() => false)) {
                    isLoggedIn = true;
                    break;
                }
            }

            if (isLoggedIn) {
                console.log(`✅ 账号 ${accountId}: 已登录`);
                anyLoggedIn = true;
            } else {
                console.log(`❌ 账号 ${accountId}: 未登录 (Cookies 可能失效)`);
            }

        } catch (e) {
            console.error(`❌ 验证出错: ${e.message}`);
        } finally {
            if (context) await context.close();
        }
    }

    if (anyLoggedIn) {
        console.log('\n✨ 检查完成: 存在有效登录状态');
        process.exit(0);
    } else {
        console.log('\n🚫 检查完成: 无有效登录状态');
        process.exit(1);
    }
}

checkLoginStatus().catch(err => {
    console.error('Script Error:', err);
    process.exit(1);
});
