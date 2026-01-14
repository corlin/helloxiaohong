import path from 'path';
import fs from 'fs';
import config from '../config.js';
import logger, { publishLogger } from '../utils/logger.js';
import { createContext, createPage, saveCookies, takeScreenshot } from './browser.js';
import {
    randomDelay, shortDelay, mediumDelay, longDelay,
    humanType, humanClick, simulateReading
} from './human-like.js';
import { getCookiePath, isCookieValid } from './login.js';

/**
 * 检查发布页是否处于已登录状态
 */
async function checkLoginStatusInPage(page) {
    try {
        const url = page.url();
        const loginBtn = await page.locator('text=登录').first().isVisible({ timeout: 2000 }).catch(() => false);
        if (loginBtn || url.includes('login')) return false;

        const userIndicators = [
            '.user-name', '.avatar', '.creator-avatar',
            'input[placeholder*="标题"]', 'textarea[placeholder*="标题"]',
            '.main-container .user .link-wrapper .channel' // Reference: api_reference.md
        ];

        for (const selector of userIndicators) {
            if (await page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false)) return true;
        }

        return url.includes('/publish');
    } catch { return false; }
}

/**
 * 智能关闭弹窗
 */
async function closePopups(page) {
    const closeSelectors = [
        '[aria-label="关闭"]',
        '.ant-modal-close',
        '.close-btn',
        'button:has-text("关闭")',
        '[class*="guide"] [class*="btn"]', // 引导弹窗按钮
        '.d-popover', // 提示气泡
        '.short-note-tooltip' // 提示气泡内容
    ];

    for (const selector of closeSelectors) {
        const els = await page.locator(selector).all();
        for (const el of els) {
            if (await el.isVisible()) await el.click();
        }
    }
    // 点击空白处
    await page.mouse.click(10, 10);
    await shortDelay();
}

/**
 * 确保切换到正确的 Tab
 */
async function ensureTab(page, targetType) {
    const targetText = targetType === 'video' ? '上传视频' : '上传图文';

    try {
        await page.waitForSelector(`text=${targetText}`, { timeout: 10000 });
    } catch (e) {
        logger.warn(`等待 Tab 文本超时: ${targetText}`);
    }

    const candidates = [
        // 明确排除隐藏的 Tab (style 包含 -9999px)
        page.locator(`.creator-tab:has-text("${targetText}"):not([style*="-9999px"])`),
        page.getByText(targetText, { exact: true }),
        page.getByText(targetText)
    ];

    for (const locator of candidates) {
        const count = await locator.count();
        if (count > 0) logger.info(`查找 Tab "${targetText}" 候选: ${count} 个`);

        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            if (await el.isVisible()) {
                // 增强点击逻辑：验证是否切换成功
                const maxClickRetries = 3;
                for (let attempt = 1; attempt <= maxClickRetries; attempt++) {
                    logger.info(`尝试点击 Tab (第 ${attempt} 次)`);

                    // 尝试点击文本区域，命中率更高
                    const titleEl = el.locator('.title').first();
                    if (await titleEl.isVisible()) {
                        await titleEl.click({ force: true });
                    } else {
                        await el.click({ force: true });
                    }

                    await shortDelay();

                    // 验证: 检查当前 Tab 是否变更为 Active
                    const classAttribute = await el.getAttribute('class');
                    if (classAttribute && classAttribute.includes('active')) {
                        logger.info('Tab 切换成功 (Active)');
                        await mediumDelay();
                        return true;
                    } else {
                        logger.warn('Tab 点击后未变 Active，重试...');
                    }
                }
                logger.error('Tab 点击多次失败');
                return false;
            }
        }
    }

    logger.warn(`未找到可见的 Tab: ${targetText} (尝试了多种选择器)`);
    return false;
}

/**
 * 上传文件
 */
async function uploadFile(page, filePaths) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

    for (const p of paths) {
        if (!fs.existsSync(p)) throw new Error(`文件不存在: ${p}`);
    }

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(paths);
    await mediumDelay();
}

/**
 * 等待编辑器加载 (严格状态检查)
 */
/**
 * 等待编辑器加载 (严格状态检查)
 * 可能会遇到"裁剪/编辑图片"的中间步骤，需要自动点击下一步
 */
async function waitForEditor(page) {
    const startTime = Date.now();
    const TIMEOUT = 30000;

    while (Date.now() - startTime < TIMEOUT) {
        // 1. 检查标题输入框 (目标状态)
        const titleInput = page.getByPlaceholder('标题', { exact: false })
            .or(page.locator('.title-input'))
            .or(page.locator('textarea[placeholder*="标题"]'))
            .first();

        if (await titleInput.isVisible()) return true;

        // 2. 检查是否有阻碍流程的"下一步"按钮 (中间状态)
        // 常见文案: 下一步, 确定, 完成, Next
        const nextBtn = page.getByRole('button', { name: '下一步' })
            .or(page.getByRole('button', { name: '确定' }))
            .or(page.locator('div:has-text("下一步")'))
            .first();

        if (await nextBtn.isVisible()) {
            await nextBtn.click().catch(() => { });
            await shortDelay();
            continue; // 点击后重新检查
        }

        await shortDelay();
    }
    return false;
}

/**
 * 填写元数据 (标题、正文、标签、地点)
 */
async function fillMetadata(page, { title, body, tags, location }) {
    // 1. 标题 (Semantic Locator)
    const titleInput = page.getByPlaceholder('标题', { exact: false })
        .or(page.locator('textarea[placeholder*="标题"]'))
        .or(page.locator('.c-input_title'))
        .first();

    // 智能截取标题并警告
    let safeTitle = title;
    if (title.length > 20) {
        logger.warn(`标题超过20字限制，已自动截取: "${title}" -> "${title.slice(0, 20)}"`);
        safeTitle = title.slice(0, 20);
    }
    await humanType(page, titleInput, safeTitle);
    await mediumDelay();

    // 2. 正文
    if (body) {
        const contentInput = page.getByPlaceholder('正文', { exact: false })
            .or(page.locator('#post-textarea'))
            .or(page.locator('div[contenteditable="true"]'))
            .or(page.locator('div.ql-editor')) // standard quill editor
            .or(page.locator('p[data-placeholder]'))
            .first();

        // 强制追加后缀
        // const suffix = '\n\n🚩素材来自：xiaohongshu-mcp';
        // const finalBody = body.includes('xiaohongshu-mcp') ? body : body + suffix;
        const finalBody = body;

        await humanClick(page, contentInput);
        await humanType(page, contentInput, finalBody.slice(0, 1000));
        await mediumDelay();
    }

    // 3. 标签
    if (tags && tags.length > 0) {
        const tagInput = page.getByPlaceholder('话题', { exact: false }).first();
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
        const locInput = page.getByPlaceholder('地点', { exact: false }).first();
        if (await locInput.isVisible()) {
            await humanClick(page, locInput);
            await humanType(page, locInput, location);
            await shortDelay();
            // 选中第一个结果
            await page.keyboard.press('Enter');
        }
    }
}

/**
 * 点击发布并等待结果
 */
async function publishAction(page) {
    const publishBtn = page.getByRole('button', { name: '发布' })
        .or(page.locator('button:has-text("发布")'))
        .first();

    await humanClick(page, publishBtn);

    // 等待成功提示
    const successToast = page.locator('text=发布成功')
        .or(page.locator('.success-toast'))
        .first();

    try {
        await successToast.waitFor({ state: 'visible', timeout: 15000 });
        return true;
    } catch {
        // 检查URL是否跳转
        return page.url().includes('success') || !page.url().includes('publish');
    }
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
        await uploadFile(page, absPaths); // multiple files support? uploadFile needs update for array

        // uploadFile helper simplified above only took one string. Need to fix in post-edit or use loop.
        // Actually uploadFile implementation above uses setInputFiles which accepts array. 
        // I will fix uploadFile logic in this file content.

        log('verify', '等待编辑器加载...');
        if (!await waitForEditor(page)) {
            // 保存错误页面 HTML
            const html = await page.content();
            const errorPagePath = path.join(config.logsDir, `error_page_${accountId}.html`);
            fs.writeFileSync(errorPagePath, html);
            logger.info('已保存错误页面 HTML 用于调试', { path: errorPagePath });

            // Retry: maybe tab wasn't switched?
            log('retry', '编辑器未出现，尝试重新切换模式...');
            await ensureTab(page, 'image');
            // 关闭可能的弹窗
            await closePopups(page);

            if (!await waitForEditor(page)) throw new Error('进入编辑器失败');
        }

        log('fill', '填写内容...');
        await fillMetadata(page, { title, body, tags, location });

        log('publish', '点击发布...');
        await takeScreenshot(page, `before_publish_${accountId}`);
        await publishAction(page);

        log('success', '发布成功');
        const screenshotPath = await takeScreenshot(page, `success_${accountId}`);
        await saveCookies(context, cookiePath);
        await context.close();

        return { success: true, screenshotPath };
    } catch (e) {
        log('error', `发布失败: ${e.message}`);
        await takeScreenshot(page, `error_${accountId}`);
        await context.close();
        return { success: false, error: e.message };
    }
}

export async function publishVideoNote(options) {
    // 简化的视频发布逻辑，复用 helper
    const { accountId, title, body, mediaPaths, tags, location, onProgress } = options;
    const log = (step, msg) => {
        logger.info(msg, { accountId, step });
        if (onProgress) onProgress(step, msg);
    };

    const cookiePath = getCookiePath(accountId);
    const context = await createContext(cookiePath);
    const page = await createPage(context);

    try {
        await page.goto(config.xhs.publishUrl);
        await mediumDelay();
        await closePopups(page);

        await ensureTab(page, 'video');

        const videoPath = path.isAbsolute(mediaPaths[0]) ? mediaPaths[0] : path.join(config.uploadsDir, mediaPaths[0]);
        await uploadFile(page, videoPath);

        log('upload', '等待视频上传处理...');
        // 视频特殊等待
        await page.waitForTimeout(5000);
        // 这里可以增加检查 "上传成功" 字样

        await fillMetadata(page, { title, body, tags, location });
        await publishAction(page);

        await saveCookies(context, cookiePath);
        await context.close();
        return { success: true };
    } catch (e) {
        await context.close();
        return { success: false, error: e.message };
    }
}

export async function publish(options) {
    if (options.type === 'video') return publishVideoNote(options);
    return publishImageNote(options);
}

export default { publish, publishImageNote, publishVideoNote };
