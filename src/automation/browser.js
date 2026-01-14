import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import config from '../config.js';
import logger from '../utils/logger.js';
import { randomizeUserAgent } from './human-like.js';

// 应用 Stealth 插件
chromium.use(StealthPlugin());

// 存储浏览器实例
let browserInstance = null;

/**
 * 获取浏览器启动参数
 */
function getBrowserArgs() {
    const args = [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-infobars',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1440,900',
        '--lang=zh-CN',
    ];

    if (config.browser.proxy) {
        args.push(`--proxy-server=${config.browser.proxy}`);
    }

    return args;
}

/**
 * 获取或创建浏览器实例
 */
export async function getBrowser() {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    logger.info('正在启动浏览器...', { headless: config.browser.headless });

    browserInstance = await chromium.launch({
        headless: config.browser.headless,
        slowMo: config.browser.slowMo,
        args: getBrowserArgs(),
    });

    logger.info('浏览器启动成功');
    return browserInstance;
}

/**
 * 创建新的浏览器上下文
 * @param {string} cookiePath Cookie 文件路径（可选）
 */
export async function createContext(cookiePath = null) {
    const browser = await getBrowser();

    // 基础 User-Agent
    const baseUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const contextOptions = {
        viewport: { width: 1440, height: 900 },
        userAgent: randomizeUserAgent(baseUA),
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        geolocation: { longitude: 121.4737, latitude: 31.2304 }, // 上海
        permissions: ['geolocation'],
        colorScheme: 'light',
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: false,
        javaScriptEnabled: true,
    };

    const context = await browser.newContext(contextOptions);

    // 添加额外的反检测脚本
    await context.addInitScript(() => {
        // 删除 webdriver 属性
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        // 伪装 plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' },
            ],
        });

        // 伪装 languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        });

        // 隐藏自动化特征
        window.chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {},
        };

        // 伪装 permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters)
        );
    });

    // 加载 Cookie（如果存在）
    if (cookiePath && fs.existsSync(cookiePath)) {
        try {
            const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
            await context.addCookies(cookies);
            logger.info('已加载 Cookie', { path: cookiePath });
        } catch (error) {
            logger.warn('加载 Cookie 失败', { error: error.message });
        }
    }

    return context;
}

/**
 * 保存 Cookie 到文件
 * @param {import('playwright').BrowserContext} context 
 * @param {string} cookiePath 
 */
export async function saveCookies(context, cookiePath) {
    // 确保目录存在
    const dir = path.dirname(cookiePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const cookies = await context.cookies();
    fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
    logger.info('Cookie 已保存', { path: cookiePath, count: cookies.length });
}

/**
 * 创建新页面
 * @param {import('playwright').BrowserContext} context 
 */
export async function createPage(context) {
    const page = await context.newPage();

    // 设置默认超时
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);

    // 监听控制台消息（调试用）
    if (config.nodeEnv === 'development') {
        page.on('console', msg => {
            if (msg.type() === 'error') {
                logger.debug('页面控制台错误', { text: msg.text() });
            }
        });
    }

    return page;
}

/**
 * 关闭浏览器
 */
export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        logger.info('浏览器已关闭');
    }
}

/**
 * 截图保存
 * @param {import('playwright').Page} page 
 * @param {string} name 
 */
export async function takeScreenshot(page, name) {
    const screenshotDir = path.join(config.logsDir, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}_${timestamp}.png`;
    const filepath = path.join(screenshotDir, filename);

    await page.screenshot({ path: filepath, fullPage: false });
    logger.debug('截图已保存', { path: filepath });

    return filepath;
}

export default {
    getBrowser,
    createContext,
    createPage,
    saveCookies,
    closeBrowser,
    takeScreenshot,
};
