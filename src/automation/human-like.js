import config from '../config.js';

/**
 * 人类行为模拟模块
 * 通过随机延迟、鼠标轨迹、打字速度等模拟真实用户操作
 */

/**
 * 随机延迟
 * @param {number} min 最小毫秒数
 * @param {number} max 最大毫秒数
 */
export async function randomDelay(min = config.humanLike.minDelay, max = config.humanLike.maxDelay) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
}

/**
 * 短延迟（用于连续操作之间）
 */
export async function shortDelay() {
    return randomDelay(500, 1500);
}

/**
 * 中等延迟（用于页面加载后）
 */
export async function mediumDelay() {
    return randomDelay(1500, 3000);
}

/**
 * 长延迟（用于重要操作前后）
 */
export async function longDelay() {
    return randomDelay(3000, 6000);
}

/**
 * 模拟人类打字
 * @param {import('playwright').Page} page 
 * @param {string|import('playwright').Locator} selectorOrLocator 
 * @param {string} text 
 */
export async function humanType(page, selectorOrLocator, text) {
    const element = typeof selectorOrLocator === 'string'
        ? page.locator(selectorOrLocator)
        : selectorOrLocator;

    await element.click();
    await shortDelay();

    for (const char of text) {
        await element.type(char, { delay: 0 });
        // 随机打字间隔
        const typingDelay = Math.floor(
            Math.random() * (config.humanLike.typingMaxDelay - config.humanLike.typingMinDelay)
            + config.humanLike.typingMinDelay
        );
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        // 偶尔暂停一下（模拟思考）
        if (Math.random() < 0.05) {
            await randomDelay(300, 800);
        }
    }
}

/**
 * 模拟人类点击（带随机偏移）
 * @param {import('playwright').Page} page 
 * @param {string|import('playwright').Locator} selectorOrLocator 
 */
export async function humanClick(page, selectorOrLocator) {
    const element = typeof selectorOrLocator === 'string'
        ? page.locator(selectorOrLocator)
        : selectorOrLocator;

    const box = await element.boundingBox();

    if (box) {
        // 在元素范围内随机选择点击位置
        const x = box.x + box.width * (0.3 + Math.random() * 0.4);
        const y = box.y + box.height * (0.3 + Math.random() * 0.4);

        // 移动到目标位置
        await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
        await shortDelay();
        await page.mouse.click(x, y);
    } else {
        // 降级为普通点击
        await element.click();
    }
}

/**
 * 贝塞尔曲线鼠标移动
 * @param {import('playwright').Page} page 
 * @param {number} endX 
 * @param {number} endY 
 */
export async function bezierMouseMove(page, endX, endY) {
    const mouse = page.mouse;

    // 获取当前位置（估算）
    const startX = Math.random() * 100;
    const startY = Math.random() * 100;

    // 生成贝塞尔曲线控制点
    const cp1x = startX + (endX - startX) * 0.25 + (Math.random() - 0.5) * 100;
    const cp1y = startY + (endY - startY) * 0.25 + (Math.random() - 0.5) * 100;
    const cp2x = startX + (endX - startX) * 0.75 + (Math.random() - 0.5) * 100;
    const cp2y = startY + (endY - startY) * 0.75 + (Math.random() - 0.5) * 100;

    const steps = 20 + Math.floor(Math.random() * 20);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const t1 = 1 - t;

        // 三次贝塞尔曲线公式
        const x = t1 * t1 * t1 * startX
            + 3 * t1 * t1 * t * cp1x
            + 3 * t1 * t * t * cp2x
            + t * t * t * endX;
        const y = t1 * t1 * t1 * startY
            + 3 * t1 * t1 * t * cp1y
            + 3 * t1 * t * t * cp2y
            + t * t * t * endY;

        await mouse.move(x, y);
        await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 10));
    }
}

/**
 * 模拟人类滚动
 * @param {import('playwright').Page} page 
 * @param {number} distance 滚动距离（像素）
 */
export async function humanScroll(page, distance) {
    const steps = Math.ceil(Math.abs(distance) / 100);
    const direction = distance > 0 ? 1 : -1;

    for (let i = 0; i < steps; i++) {
        const scrollAmount = (80 + Math.random() * 40) * direction;
        await page.mouse.wheel(0, scrollAmount);
        await randomDelay(100, 300);
    }

    // 滚动后停顿
    await mediumDelay();
}

/**
 * 等待并模拟阅读页面
 * @param {import('playwright').Page} page 
 * @param {number} minSeconds 
 * @param {number} maxSeconds 
 */
export async function simulateReading(page, minSeconds = 2, maxSeconds = 5) {
    const readTime = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;

    // 随机滚动几次
    const scrollTimes = Math.floor(Math.random() * 3);
    for (let i = 0; i < scrollTimes; i++) {
        await humanScroll(page, 100 + Math.random() * 200);
    }

    await new Promise(resolve => setTimeout(resolve, readTime));
}

/**
 * 随机化用户代理中的版本号
 */
export function randomizeUserAgent(baseUA) {
    // 微调版本号
    const chromeVersion = 120 + Math.floor(Math.random() * 5);
    return baseUA.replace(/Chrome\/\d+/, `Chrome/${chromeVersion}`);
}

export default {
    randomDelay,
    shortDelay,
    mediumDelay,
    longDelay,
    humanType,
    humanClick,
    bezierMouseMove,
    humanScroll,
    simulateReading,
    randomizeUserAgent,
};
