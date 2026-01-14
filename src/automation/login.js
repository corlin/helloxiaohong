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

// 小红书相关选择器（2024-2025 更新版 - 基于实际截图）
const SELECTORS = {
    // 已登录状态检测
    loggedIn: [
        '.sidebar-creator',
        '.dyn-avatar',
        '[class*="user-info"]',
        '.user-name',
        'a[href*="/publish"]',
        '.header-user',
    ],

    // 登录按钮（未登录时显示）
    loginBtn: [
        'text=登录',
        'a:has-text("登录")',
        'button:has-text("登录")',
        '[class*="login"]',
    ],

    // 二维码相关（基于实际页面结构）
    qrCode: [
        'canvas',                         // 二维码通常是 canvas
        'img[src*="qrcode"]',             // 图片形式的二维码
        '[class*="qr"] canvas',
        '[class*="qrcode"] canvas',
        '.login-qrcode canvas',
    ],

    // 二维码容器/登录框
    qrCodeContainer: [
        '[class*="qr-box"]',
        '[class*="qrcode-box"]',
        '[class*="login-box"]',
        '.login-container',
    ],

    // 加载状态
    loading: [
        'text=加载中',
        'text=登录加载中',
        '[class*="loading"]',
    ],

    // 用户昵称
    nickname: [
        '.user-name',
        '.dyn-name',
        '[class*="nickname"]',
    ],
};

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
        const loading = await trySelectors(page, SELECTORS.loading, 500);
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
    const loginBtn = await trySelectors(page, SELECTORS.loginBtn, 1500);
    if (loginBtn) {
        return false;
    }

    // 检查已登录元素
    const loggedInElement = await trySelectors(page, SELECTORS.loggedIn, 2000);
    return loggedInElement !== null;
}

/**
 * 获取用户信息
 */
async function getUserInfo(page) {
    try {
        await simulateReading(page, 1, 2);

        let nickname = null;
        for (const selector of SELECTORS.nickname) {
            try {
                const text = await page.locator(selector).first().textContent({ timeout: 3000 });
                if (text && text.trim()) {
                    nickname = text.trim();
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        const xhsId = await page.evaluate(() => {
            if (window.__INITIAL_STATE__?.user?.userId) {
                return window.__INITIAL_STATE__.user.userId;
            }
            return null;
        }).catch(() => null);

        return {
            nickname: nickname || '小红书用户',
            xhsId,
            avatarUrl: null,
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
        const loginBtn = await trySelectors(page, SELECTORS.loginBtn, 3000);
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
            const qrResult = await trySelectors(page, SELECTORS.qrCode, 2000);
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
                logger.info('扫码登录成功');
                if (onStatus) onStatus('success', '登录成功');

                await longDelay();
                await saveCookies(context, cookiePath);
                const userInfo = await getUserInfo(page);
                await context.close();

                return { success: true, userInfo, cookiePath };
            }

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
