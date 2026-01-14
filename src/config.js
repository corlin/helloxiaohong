import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
    // 服务配置
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // 路径配置
    rootDir: ROOT_DIR,
    dataDir: path.join(ROOT_DIR, 'data'),
    uploadsDir: path.join(ROOT_DIR, 'uploads'),
    cookiesDir: path.join(ROOT_DIR, 'cookies'),
    logsDir: path.join(ROOT_DIR, 'logs'),
    publicDir: path.join(ROOT_DIR, 'public'),

    // 数据库
    dbPath: path.join(ROOT_DIR, 'data', 'xhs.db'),

    // 浏览器配置
    browser: {
        headless: process.env.HEADLESS === 'true',
        slowMo: parseInt(process.env.BROWSER_SLOW_MO || '100', 10),
        proxy: process.env.PROXY_SERVER || null,
    },

    // 发布限制
    publish: {
        dailyLimit: parseInt(process.env.DAILY_LIMIT || '5', 10),
        minIntervalMinutes: 0, // 两次发布最小间隔 (分钟)
        maxRetries: 3,
    },

    // 人类行为模拟
    humanLike: {
        minDelay: parseInt(process.env.MIN_DELAY_MS || '2000', 10),
        maxDelay: parseInt(process.env.MAX_DELAY_MS || '5000', 10),
        typingMinDelay: parseInt(process.env.TYPING_MIN_DELAY_MS || '50', 10),
        typingMaxDelay: parseInt(process.env.TYPING_MAX_DELAY_MS || '150', 10),
    },

    // AI 容错
    ai: {
        enabled: process.env.ENABLE_AI_FALLBACK === 'true',
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },

    // 小红书相关
    xhs: {
        creatorUrl: 'https://creator.xiaohongshu.com',
        publishUrl: 'https://creator.xiaohongshu.com/publish/publish',
        loginTimeout: 120000, // 扫码超时 2 分钟
    },
};

export default config;
