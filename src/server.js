import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import config from './config.js';
import logger from './utils/logger.js';
import { initDatabase } from './database/index.js';
import { startScheduler } from './scheduler/index.js';

// API 路由
import accountsRouter, { setWsClient } from './api/routes/accounts.js';
import contentsRouter from './api/routes/contents.js';
import schedulesRouter from './api/routes/schedules.js';
import logsRouter from './api/routes/logs.js';

// 确保必要目录存在
const dirs = [config.dataDir, config.uploadsDir, config.cookiesDir, config.logsDir];
for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// 初始化数据库
initDatabase();

// 创建 Express 应用
const app = express();

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(config.publicDir));
app.use('/uploads', express.static(config.uploadsDir));

// API 路由
app.use('/api/accounts', accountsRouter);
app.use('/api/contents', contentsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/logs', logsRouter);

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA 回退
app.get('*', (req, res) => {
    res.sendFile(path.join(config.publicDir, 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
    logger.error('服务器错误', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: '服务器内部错误' });
});

// 创建 HTTP 服务器
const server = http.createServer(app);

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const accountId = url.searchParams.get('accountId');

    if (accountId) {
        setWsClient(parseInt(accountId), ws);
        logger.info('WebSocket 连接', { accountId });
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            logger.debug('WebSocket 消息', { data });
        } catch (e) {
            // 忽略解析错误
        }
    });

    ws.on('close', () => {
        logger.debug('WebSocket 断开');
    });
});

// 启动服务器
server.listen(config.port, () => {
    logger.info(`🚀 服务器已启动: http://localhost:${config.port}`);
    logger.info(`📅 调度器已启动`);

    // 启动任务调度器
    startScheduler();
});

// 优雅关闭
process.on('SIGINT', async () => {
    logger.info('正在关闭服务器...');
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('正在关闭服务器...');
    server.close();
    process.exit(0);
});
