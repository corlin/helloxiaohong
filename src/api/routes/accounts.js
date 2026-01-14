import { Router } from 'express';
import { accountsDb } from '../../database/index.js';
import { login, logout, getCookiePath, isCookieValid } from '../../automation/login.js';
import logger from '../../utils/logger.js';

const router = Router();

// WebSocket 连接存储（用于推送二维码）
const wsClients = new Map();

/**
 * 设置 WebSocket 客户端
 */
export function setWsClient(accountId, ws) {
    wsClients.set(accountId, ws);
}

/**
 * 获取所有账号
 */
router.get('/', async (req, res) => {
    try {
        const accounts = await accountsDb.getAll();

        // 添加登录状态
        const accountsWithStatus = accounts.map(account => ({
            ...account,
            isLoggedIn: account.cookie_path ? isCookieValid(account.cookie_path) : false,
        }));

        res.json({ success: true, data: accountsWithStatus });
    } catch (error) {
        logger.error('获取账号列表失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取单个账号
 */
router.get('/:id', async (req, res) => {
    try {
        const account = await accountsDb.getById(req.params.id);
        if (!account) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }

        account.isLoggedIn = account.cookie_path ? isCookieValid(account.cookie_path) : false;
        res.json({ success: true, data: account });
    } catch (error) {
        logger.error('获取账号失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 添加账号（触发扫码登录）
 */
router.post('/login', async (req, res) => {
    try {
        // 创建待登录账号
        const accountId = await accountsDb.create({
            nickname: '待登录',
            status: 'pending',
        });

        logger.info('开始扫码登录', { accountId });

        // 发送响应（包含账号ID，前端通过 WebSocket 接收二维码）
        res.json({
            success: true,
            data: {
                accountId,
                message: '请等待二维码生成，通过 WebSocket 接收'
            }
        });

        // 异步执行登录
        const result = await login(
            accountId,
            // 二维码回调
            (qrCodeBase64) => {
                const ws = wsClients.get(accountId);
                if (ws) {
                    ws.send(JSON.stringify({
                        type: 'qrcode',
                        accountId,
                        data: qrCodeBase64
                    }));
                }
            },
            // 状态回调
            (status, message) => {
                const ws = wsClients.get(accountId);
                if (ws) {
                    ws.send(JSON.stringify({
                        type: 'status',
                        accountId,
                        status,
                        message
                    }));
                }
            }
        );

        if (result.success) {
            // 更新账号信息
            await accountsDb.update(accountId, {
                nickname: result.userInfo?.nickname || '小红书用户',
                xhsId: result.userInfo?.xhsId,
                avatarUrl: result.userInfo?.avatarUrl,
                cookiePath: getCookiePath(accountId),
                status: 'active',
            });

            // 通知前端
            const ws = wsClients.get(accountId);
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'login_success',
                    accountId,
                    data: result.userInfo
                }));
            }
        } else {
            // 登录失败，删除账号记录
            await accountsDb.delete(accountId);

            const ws = wsClients.get(accountId);
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'login_failed',
                    accountId,
                    error: result.error
                }));
            }
        }

    } catch (error) {
        logger.error('登录失败', { error: error.message });
        // 响应已在前面发送，这里只记录日志
    }
});

/**
 * 删除账号
 */
router.delete('/:id', async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        const account = await accountsDb.getById(accountId);

        if (!account) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }

        // 删除 Cookie
        logout(accountId);

        // 删除数据库记录
        await accountsDb.delete(accountId);

        logger.info('账号已删除', { accountId });
        res.json({ success: true });
    } catch (error) {
        logger.error('删除账号失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 刷新账号状态
 */
router.post('/:id/refresh', async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        const account = await accountsDb.getById(accountId);

        if (!account) {
            return res.status(404).json({ success: false, error: '账号不存在' });
        }

        const isValid = account.cookie_path ? isCookieValid(account.cookie_path) : false;

        if (!isValid) {
            await accountsDb.update(accountId, { status: 'expired' });
        }

        res.json({
            success: true,
            data: {
                isLoggedIn: isValid,
                status: isValid ? 'active' : 'expired'
            }
        });
    } catch (error) {
        logger.error('刷新账号状态失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
