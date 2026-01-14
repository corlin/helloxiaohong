import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from '../config.js';

// 确保日志目录存在
if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
}

// 自定义格式
const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
});

// 创建 logger 实例
const logger = winston.createLogger({
    level: config.nodeEnv === 'development' ? 'debug' : 'info',
    format: winston.format.combine(
        // 使用本地时间格式 (zh-CN)
        winston.format.timestamp({ format: () => new Date().toLocaleString('zh-CN', { hour12: false }) }),
        customFormat
    ),
    transports: [
        // 控制台输出
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: () => new Date().toLocaleString('zh-CN', { hour12: false }).split(' ')[1] }), // 只显示时间
                customFormat
            ),
        }),
        // 文件输出 - 所有日志
        new winston.transports.File({
            filename: path.join(config.logsDir, 'app.log'),
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5,
        }),
        // 文件输出 - 错误日志
        new winston.transports.File({
            filename: path.join(config.logsDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
        }),
    ],
});

// 发布专用 logger
export const publishLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: () => new Date().toLocaleString('zh-CN', { hour12: false }) }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(config.logsDir, 'publish.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 10,
        }),
    ],
});

export default logger;
