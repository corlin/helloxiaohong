import path from 'path';
import fs from 'fs';
import config from '../config.js';
import logger from '../utils/logger.js';
import { createContext, createPage, saveCookies, takeScreenshot } from './browser.js';
import { mediumDelay, longDelay, simulateReading, shortDelay } from './human-like.js';

/**
 * 小红书登录模块
 * 支持扫码登录和 Cookie 持久化
 */

import { SELECTORS } from './selectors.js';

// 小红书登录模块
// 支持扫码登录和 Cookie 持久化


/**
 * 获取账号的 Cookie 文件路径
 */
export function getCookiePath(accountId) {
    return path.join(config.cookiesDir, `account_${accountId}.json`);
}

/**
 * 检查 Cookie 是否有效
 */
export function isCookieValid(cookiePath) {
    if (!fs.existsSync(cookiePath)) {
        return false;
    }

    try {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
        const hasSession = cookies.some(c =>
            c.name === 'web_session' ||
            c.name === 'a1' ||
            c.name === 'webId'
        );
        return hasSession;
    } catch (error) {
        return false;
    }
}

/**
 * 尝试多个选择器，返回第一个可见的
 */
async function trySelectors(page, selectors, timeout = 3000) {
    if (!selectors || typeof selectors[Symbol.iterator] !== 'function') {
        logger.error('trySelectors received invalid selectors', { type: typeof selectors, value: selectors });
        // Return null instead of throwing, or throw a more descriptive error
        return null;
    }
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();
            const isVisible = await locator.isVisible({ timeout }).catch(() => false);
            if (isVisible) {
                logger.debug('找到元素', { selector });
                return { locator, selector };
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

/**
 * 等待加载完成
 */
async function waitForLoadingToFinish(page, maxWait = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        const loading = await trySelectors(page, SELECTORS.LOGIN.LOADING, 500);
        if (!loading) {
            return true;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

/**
 * 检测页面是否已登录
 */
async function isPageLoggedIn(page) {
    const url = page.url();

    // 如果在登录页面，肯定没登录
    if (url.includes('/login') || url.includes('加入我们')) {
        return false;
    }

    // 检查是否有登录按钮
    const loginBtn = await trySelectors(page, SELECTORS.LOGIN.LOGIN_BUTTON, 1500);
    if (loginBtn) {
        return false;
    }

    // 检查已登录元素
    const loggedInElement = await trySelectors(page, SELECTORS.LOGIN.LOGGED_IN_INDICATORS, 2000);
    return loggedInElement !== null;
}

/**
 * 获取用户信息
 */
/**
 * 获取用户信息
 */
async function getUserInfo(page) {
    try {
        await simulateReading(page, 1, 2);

        // 1. 获取昵称
        let nickname = '小红书用户';
        // 使用 selectors.js 中定义的 NICKNAME 选择器
        for (const selector of SELECTORS.LOGIN.USER_INFO.NICKNAME) {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible()) {
                    const text = await el.textContent();
                    if (text && text.trim()) {
                        nickname = text.trim();
                        break;
                    }
                }
            } catch (e) { continue; }
        }

        // 2. 获取头像
        let avatarUrl = null;
        // 使用 selectors.js 中定义的 AVATAR 选择器
        for (const selector of SELECTORS.LOGIN.USER_INFO.AVATAR) {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible()) {
                    avatarUrl = await el.getAttribute('src');
                    if (avatarUrl) break;
                }
            } catch (e) { continue; }
        }

        // 3. 获取 ID (尝试多种方式)
        let xhsId = await page.evaluate(() => {
            try {
                // 方式 A: 全局状态
                if (window.__INITIAL_STATE__?.user?.userId) {
                    return window.__INITIAL_STATE__.user.userId;
                }
                if (window.__INITIAL_STATE__?.user?.user_id) {
                    return window.__INITIAL_STATE__.user.user_id;
                }
            } catch (e) { return null; }
            return null;
        }).catch(() => null);

        // 方式 B: 页面文本 (根据 debug_user_info.html 分析得出: "小红书账号: 6896912017")
        if (!xhsId) {
            try {
                // 尝试查找包含 "小红书账号" 或 "小红书号" 的文本元素
                for (const selector of SELECTORS.LOGIN.USER_INFO.ID) {
                    if (selector.startsWith('text=')) {
                        const idText = await page.locator(selector).first().textContent().catch(() => null);
                        if (idText) {
                            // 匹配 "小红书账号: 123456" 或 "小红书号：123456"
                            const match = idText.match(/小红书(账)?号[:：]\s*([a-zA-Z0-9_]+)/);
                            if (match && match[2]) {
                                xhsId = match[2];
                                break;
                            }
                        }
                    } else {
                        // 常规选择器
                        const el = page.locator(selector).first();
                        if (await el.isVisible()) {
                            const text = await el.textContent();
                            if (text && text.trim()) {
                                xhsId = text.trim();
                            }
                        }
                    }
                }
            } catch (e) { logger.warn('ID scraping failed', { error: e.message }); }
        }

        // 如果实在找不到ID，尝试从头像 URL 中提取 (例如 spectrum/1040g2jo30vfcdt69lq00... 中的部分)
        // 目前暂不实现，留作后续优化的 fallback

        return {
            nickname,
            xhsId,
            avatarUrl,
        };
    } catch (error) {
        logger.warn('获取用户信息失败', { error: error.message });
        return { nickname: '小红书用户', avatarUrl: null, xhsId: null };
    }
}

/**
 * 登录小红书（扫码方式）
 */
export async function login(accountId, onQrCode = null, onStatus = null) {
    const cookiePath = getCookiePath(accountId);

    // 检查现有 Cookie
    if (isCookieValid(cookiePath)) {
        logger.info('Cookie 有效，尝试使用现有登录状态', { accountId });

        const context = await createContext(cookiePath);
        const page = await createPage(context);

        try {
            await page.goto(config.xhs.creatorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await mediumDelay();

            if (await isPageLoggedIn(page)) {
                logger.info('使用现有 Cookie 登录成功', { accountId });
                const userInfo = await getUserInfo(page);
                if (onStatus) onStatus('success', '登录成功');

                await saveCookies(context, cookiePath);
                await context.close();

                return { success: true, userInfo, cookiePath };
            }

            logger.warn('Cookie 无效，需要重新扫码登录', { accountId });
            await context.close();
        } catch (error) {
            logger.error('验证登录状态失败', { error: error.message });
            await context.close();
        }
    }

    // 需要扫码登录
    logger.info('开始扫码登录流程', { accountId });
    if (onStatus) onStatus('scanning', '正在打开登录页...');

    const context = await createContext();
    const page = await createPage(context);

    try {
        await page.goto(config.xhs.creatorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await longDelay();  // 等待页面完全加载

        // 首先检查是否已经登录
        if (await isPageLoggedIn(page)) {
            logger.info('检测到浏览器已登录状态');
            if (onStatus) onStatus('success', '检测到已登录');

            const userInfo = await getUserInfo(page);
            await saveCookies(context, cookiePath);
            await context.close();

            return { success: true, userInfo, cookiePath };
        }

        // 可能需要点击登录按钮
        const loginBtn = await trySelectors(page, SELECTORS.LOGIN.LOGIN_BUTTON, 3000);
        if (loginBtn) {
            logger.info('点击登录按钮');
            await loginBtn.locator.click();
            await mediumDelay();
        }

        // 等待加载状态消失
        if (onStatus) onStatus('scanning', '等待二维码加载...');
        logger.info('等待二维码加载...');

        await waitForLoadingToFinish(page, 15000);
        await shortDelay();

        // 查找二维码 - 等待更长时间
        let qrFound = false;
        for (let i = 0; i < 15; i++) {
            const qrResult = await trySelectors(page, SELECTORS.LOGIN.QR_CODE, 2000);
            if (qrResult) {
                qrFound = true;
                logger.info('找到二维码', { selector: qrResult.selector, attempt: i + 1 });
                break;
            }
            logger.debug('等待二维码...', { attempt: i + 1 });
            await new Promise(r => setTimeout(r, 1000));
        }

        // 即使没找到特定二维码元素，也截取页面发送给用户
        if (onQrCode) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 截取整个页面
                const screenshot = await page.screenshot({ type: 'png' });
                const base64 = screenshot.toString('base64');
                onQrCode(`data:image/png;base64,${base64}`);
                logger.info('页面截图已发送');
            } catch (e) {
                logger.warn('截图失败', { error: e.message });
            }
        }

        await takeScreenshot(page, `qrcode_${accountId}`);

        if (!qrFound) {
            logger.warn('未找到二维码元素，但已发送页面截图');
        }

        // 等待登录成功（轮询检测）
        logger.info('等待扫码登录...', { timeout: config.xhs.loginTimeout });
        if (onStatus) onStatus('waiting', '请在小红书APP中扫描二维码...');

        const startTime = Date.now();
        while (Date.now() - startTime < config.xhs.loginTimeout) {
            // 检查 URL 变化（登录成功通常会跳转）
            const currentUrl = page.url();
            if (currentUrl.includes('/new/home') || currentUrl.includes('/creator')) {
                logger.info('检测到页面跳转，可能已登录');
                await mediumDelay();

                if (await isPageLoggedIn(page)) {
                    logger.info('扫码登录成功');
                    if (onStatus) onStatus('success', '登录成功');

                    await saveCookies(context, cookiePath);
                    const userInfo = await getUserInfo(page);
                    await context.close();

                    return { success: true, userInfo, cookiePath };
                }
            }

            // 直接检查登录状态
            if (await isPageLoggedIn(page)) {
                logger.info('检测到登录指示元素，登录成功');
                if (onStatus) onStatus('success', '登录成功');

                await longDelay();
                await saveCookies(context, cookiePath);
                const userInfo = await getUserInfo(page);
                await context.close();

                return { success: true, userInfo, cookiePath };
            }

            // 尝试使用 waitForSelector 提高检测成功率 (Inspired by xiaohongshu-skill)
            try {
                for (const selector of SELECTORS.LOGIN.LOGGED_IN_INDICATORS) {
                    const el = await page.waitForSelector(selector, { state: 'visible', timeout: 500 }).catch(() => null);
                    if (el) {
                        logger.info('通过 waitForSelector 确认登录成功', { selector });
                        if (onStatus) onStatus('success', '登录成功');

                        await longDelay();
                        await saveCookies(context, cookiePath);
                        const userInfo = await getUserInfo(page);
                        await context.close();
                        return { success: true, userInfo, cookiePath };
                    }
                }
            } catch (ignore) { }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error('登录超时，请重试');

    } catch (error) {
        logger.error('登录失败', { error: error.message });
        if (onStatus) onStatus('failed', error.message);

        await takeScreenshot(page, `login_failed_${accountId}`);
        await context.close();

        return { success: false, error: error.message };
    }
}

/**
 * 验证登录状态
 */
export async function checkLoginStatus(page) {
    try {
        await page.goto(config.xhs.creatorUrl, { waitUntil: 'domcontentloaded' });
        await mediumDelay();
        return await isPageLoggedIn(page);
    } catch (error) {
        return false;
    }
}

/**
 * 注销（删除 Cookie）
 */
export function logout(accountId) {
    const cookiePath = getCookiePath(accountId);
    if (fs.existsSync(cookiePath)) {
        fs.unlinkSync(cookiePath);
        logger.info('已删除 Cookie', { accountId });
    }
}

export default {
    login,
    logout,
    checkLoginStatus,
    getCookiePath,
    isCookieValid,
};
