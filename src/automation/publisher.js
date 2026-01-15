import path from 'path';
import fs from 'fs';
import config from '../config.js';
import logger from '../utils/logger.js';
import { createContext, createPage, saveCookies, takeScreenshot } from './browser.js';
import {
    shortDelay, mediumDelay,
    humanType, humanClick
} from './human-like.js';
import { getCookiePath, isCookieValid } from './login.js';
import { SELECTORS } from './selectors.js';

/**
 * 辅助函数：尝试多个选择器直到找到一个可见的
 */
async function findVisibleElement(page, selectors, timeout = 1000) {
    for (const selector of selectors) {
        try {
            const el = page.locator(selector).first();
            if (await el.isVisible({ timeout })) {
                return el;
            }
        } catch (e) {
            // ignore
        }
    }
    return null;
}

/**
 * 检查发布页是否处于已登录状态
 */
async function checkLoginStatusInPage(page) {
    try {
        const url = page.url();
        // 显式检查登录按钮
        const loginBtn = await page.locator(SELECTORS.LOGIN.LOGIN_BUTTON).first().isVisible({ timeout: 2000 }).catch(() => false);
        if (loginBtn || url.includes('login')) return false;

        // 检查已登录特征
        const indicator = await findVisibleElement(page, SELECTORS.LOGIN.LOGGED_IN_INDICATORS);
        if (indicator) return true;

        return url.includes('/publish');
    } catch { return false; }
}

/**
 * 智能关闭弹窗
 */
async function closePopups(page) {
    for (const selector of SELECTORS.POPUPS.CLOSE_BUTTONS) {
        try {
            const els = await page.locator(selector).all();
            for (const el of els) {
                if (await el.isVisible()) {
                    logger.info(`关闭弹窗: ${selector}`);
                    await el.click();
                    await shortDelay();
                }
            }
        } catch (e) {
            // ignore selector parsing errors
        }
    }
    // 点击空白处以消除可能的 Popover
    try {
        await page.mouse.click(10, 10);
    } catch (e) { }
    await shortDelay();
}

/**
 * 确保切换到正确的 Tab
 */
async function ensureTab(page, targetType) {
    const tabConfig = targetType === 'video' ? SELECTORS.PUBLISH.TABS.VIDEO : SELECTORS.PUBLISH.TABS.IMAGE;

    try {
        await page.waitForSelector(tabConfig.LOCATOR, { timeout: 10000 });
    } catch (e) {
        logger.warn(`等待 Tab 超时: ${tabConfig.TEXT}`);
    }

    const tabEl = page.locator(tabConfig.LOCATOR).first();

    // 检查是否已经是 Active 状态
    const classAttr = await tabEl.getAttribute('class').catch(() => '');
    if (classAttr && classAttr.includes(tabConfig.ACTIVE_CLASS)) {
        logger.info(`已经是目标 Tab: ${tabConfig.TEXT}`);
        return true;
    }

    // 尝试点击切换
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
        if (await tabEl.isVisible()) {
            logger.info(`点击切换 Tab: ${tabConfig.TEXT} (尝试 ${i + 1}/${maxRetries})`);
            await tabEl.click({ force: true });
            await mediumDelay();

            // 验证切换结果
            const currentClass = await tabEl.getAttribute('class').catch(() => '');
            if (currentClass && currentClass.includes(tabConfig.ACTIVE_CLASS)) {
                return true;
            }
        }
        await shortDelay();
    }

    logger.error(`切换 Tab 失败: ${tabConfig.TEXT}`);
    return false;
}

/**
 * 上传文件
 */
async function uploadFile(page, filePaths) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

    // 验证文件存在
    for (const p of paths) {
        if (!fs.existsSync(p)) throw new Error(`文件不存在: ${p}`);
    }

    const fileInput = page.locator(SELECTORS.PUBLISH.UPLOAD_INPUT).first();
    await fileInput.setInputFiles(paths);
    await mediumDelay();
}

/**
 * 等待编辑器加载
 * 处理中间状态（如"下一步"按钮）
 */
async function waitForEditor(page) {
    const startTime = Date.now();
    const TIMEOUT = 30000;

    while (Date.now() - startTime < TIMEOUT) {
        // 1. 检查目标状态 (标题输入框)
        const titleInput = await findVisibleElement(page, SELECTORS.PUBLISH.EDITOR.TITLE_INPUT, 500);
        if (titleInput) return true;

        // 2. 检查中间阻碍状态 (下一步按钮)
        const nextBtn = await findVisibleElement(page, SELECTORS.PUBLISH.EDITOR.NEXT_BUTTON, 500);
        if (nextBtn) {
            logger.info('点击"下一步"或"确定"按钮');
            await nextBtn.click().catch(() => { });
            await shortDelay();
            continue;
        }

        await shortDelay();
    }
    return false;
}

/**
 * 填写元数据
 */
async function fillMetadata(page, { title, body, tags, location }) {
    // 1. 标题
    const titleInput = await findVisibleElement(page, SELECTORS.PUBLISH.EDITOR.TITLE_INPUT);
    if (titleInput) {
        let safeTitle = title;
        if (title.length > 20) {
            logger.warn(`标题超过20字限制，已自动截取`);
            safeTitle = title.slice(0, 20);
        }
        await humanType(page, titleInput, safeTitle);
        await mediumDelay();
    } else {
        throw new Error('找不到标题输入框');
    }

    // 2. 正文
    if (body) {
        const contentInput = await findVisibleElement(page, SELECTORS.PUBLISH.EDITOR.CONTENT_INPUT);
        if (contentInput) {
            await humanClick(page, contentInput);
            await humanType(page, contentInput, body.slice(0, 1000));
            await mediumDelay();
        }
    }

    // 3. 标签
    if (tags && tags.length > 0) {
        const tagInput = page.locator(SELECTORS.PUBLISH.METADATA.TAG_INPUT).first();
        if (await tagInput.isVisible()) {
            for (const tag of tags.slice(0, 5)) {
                await humanClick(page, tagInput);
                await humanType(page, tagInput, tag);
                await page.keyboard.press('Enter');
                await shortDelay();
            }
        }
    }

    // 4. 地点
    if (location) {
        const locInput = page.locator(SELECTORS.PUBLISH.METADATA.LOCATION_INPUT).first();
        if (await locInput.isVisible()) {
            await humanClick(page, locInput);
            await humanType(page, locInput, location);
            await shortDelay();
            await page.keyboard.press('Enter');
        }
    }
}

/**
 * 点击发布并等待
 */
async function publishAction(page) {
    const publishBtn = page.locator(SELECTORS.PUBLISH.SUBMIT.PUBLISH_BUTTON).first();
    await humanClick(page, publishBtn);

    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
        // 检查成功 Toast
        const successToast = await findVisibleElement(page, SELECTORS.PUBLISH.SUBMIT.SUCCESS_TOAST, 500);
        if (successToast) return true;

        // 检查URL跳转
        if (page.url().includes('success')) return true;

        await shortDelay();
    }
    return false;
}

export async function publishImageNote(options) {
    const { accountId, title, body, mediaPaths, tags = [], location = null, onProgress = null } = options;
    const log = (step, msg) => {
        logger.info(msg, { accountId, step });
        if (onProgress) onProgress(step, msg);
    };

    const cookiePath = getCookiePath(accountId);
    if (!isCookieValid(cookiePath)) throw new Error('Cookie 无效');

    const context = await createContext(cookiePath);
    const page = await createPage(context);

    try {
        log('navigate', '正在打开发布页...');
        await page.goto(config.xhs.publishUrl, { waitUntil: 'domcontentloaded' });
        await mediumDelay();

        if (!await checkLoginStatusInPage(page)) throw new Error('登录状态已失效');

        await closePopups(page);

        log('switch_tab', '切换到图文模式');
        await ensureTab(page, 'image');

        log('upload', '上传图片...');
        const absPaths = mediaPaths.map(p => path.isAbsolute(p) ? p : path.join(config.uploadsDir, p));
        await uploadFile(page, absPaths);

        log('verify', '等待编辑器加载...');
        if (!await waitForEditor(page)) {
            // 保存错误现场
            const html = await page.content();
            const errorPagePath = path.join(config.logsDir, `error_page_${accountId}.html`);
            fs.writeFileSync(errorPagePath, html);

            log('retry', '尝试重新切换 Tab...');
            await ensureTab(page, 'image');
            await closePopups(page);

            if (!await waitForEditor(page)) throw new Error('进入编辑器失败');
        }

        log('fill', '填写内容...');
        await fillMetadata(page, { title, body, tags, location });

        log('publish', '点击发布...');
        await takeScreenshot(page, `before_publish_${accountId}`);

        if (await publishAction(page)) {
            log('success', '发布成功');
            const screenshotPath = await takeScreenshot(page, `success_${accountId}`);
            await saveCookies(context, cookiePath);
            await context.close();
            return { success: true, screenshotPath };
        } else {
            throw new Error('未检测到发布成功信号');
        }

    } catch (e) {
        log('error', `发布失败: ${e.message}`);
        await takeScreenshot(page, `error_${accountId}`);
        await context.close();
        return { success: false, error: e.message };
    }
}

export async function publishVideoNote(options) {
    const { accountId, title, body, mediaPaths, tags, location, onProgress } = options;
    const log = (step, msg) => {
        logger.info(msg, { accountId, step });
        if (onProgress) onProgress(step, msg);
    };

    const cookiePath = getCookiePath(accountId);
    if (!isCookieValid(cookiePath)) throw new Error('Cookie 无效');

    const context = await createContext(cookiePath);
    const page = await createPage(context);

    try {
        log('navigate', '打开发布页');
        await page.goto(config.xhs.publishUrl);
        await mediumDelay();
        await closePopups(page);

        log('switch_tab', '切换到视频模式');
        await ensureTab(page, 'video');

        const videoPath = path.isAbsolute(mediaPaths[0]) ? mediaPaths[0] : path.join(config.uploadsDir, mediaPaths[0]);
        await uploadFile(page, videoPath);

        log('upload', '等待视频上传...');
        // 等待上传成功标志
        const successEl = page.locator(SELECTORS.PUBLISH.VIDEO.UPLOAD_SUCCESS).first();
        try {
            await successEl.waitFor({ state: 'visible', timeout: 60000 }); // 1分钟超时
            log('upload', '视频上传完成');
        } catch (e) {
            logger.warn('等待上传成功超时，尝试继续...');
        }

        // 视频上传后也可能进入编辑器流程
        if (!await waitForEditor(page)) {
            throw new Error('进入编辑器失败');
        }

        log('fill', '填写元数据');
        await fillMetadata(page, { title, body, tags, location });

        log('publish', '发布');
        if (await publishAction(page)) {
            log('success', '发布成功');
            const screenshotPath = await takeScreenshot(page, `success_${accountId}`);
            await saveCookies(context, cookiePath);
            await context.close();
            return { success: true, screenshotPath };
        } else {
            throw new Error('发布超时');
        }

    } catch (e) {
        log('error', `发布失败: ${e.message}`);
        await context.close();
        return { success: false, error: e.message };
    }
}

export async function publish(options) {
    if (options.type === 'video') return publishVideoNote(options);
    return publishImageNote(options);
}

export default { publish, publishImageNote, publishVideoNote };
