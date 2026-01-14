import { Router } from 'express';
import { schedulesDb, accountsDb, contentsDb } from '../../database/index.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * 获取所有发布计划
 */
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const schedules = await schedulesDb.getAll(status || null);
        res.json({ success: true, data: schedules });
    } catch (error) {
        logger.error('获取计划列表失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取单个发布计划
 */
router.get('/:id', async (req, res) => {
    try {
        const schedule = await schedulesDb.getById(req.params.id);
        if (!schedule) {
            return res.status(404).json({ success: false, error: '计划不存在' });
        }
        res.json({ success: true, data: schedule });
    } catch (error) {
        logger.error('获取计划失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 创建发布计划
 */
router.post('/', async (req, res) => {
    try {
        const { contentId, accountId, scheduledAt } = req.body;

        // 验证内容存在
        const content = await contentsDb.getById(contentId);
        if (!content) {
            return res.status(400).json({ success: false, error: '内容不存在' });
        }

        // 验证账号存在且有效
        const account = await accountsDb.getById(accountId);
        if (!account) {
            return res.status(400).json({ success: false, error: '账号不存在' });
        }
        if (account.status !== 'active') {
            return res.status(400).json({ success: false, error: '账号状态异常，请重新登录' });
        }

        // 验证时间
        const scheduleTime = new Date(scheduledAt);
        if (isNaN(scheduleTime.getTime())) {
            return res.status(400).json({ success: false, error: '无效的时间格式' });
        }

        // 检查该内容是否已有待执行或执行中的计划
        const contentSchedules = await schedulesDb.getByContentId(contentId);
        const activeSchedule = contentSchedules.find(s => ['pending', 'running'].includes(s.status));
        if (activeSchedule) {
            return res.status(409).json({
                success: false,
                error: '该内容已有待执行或执行中的计划',
                data: { id: activeSchedule.id }
            });
        }

        // 检查是否与现有计划冲突（同一账号，间隔太近）
        const existingSchedules = await schedulesDb.getAll('pending');
        const conflicting = existingSchedules.find(s => {
            if (s.account_id !== accountId) return false;
            const existingTime = new Date(s.scheduled_at);
            const diffMinutes = Math.abs(scheduleTime - existingTime) / 1000 / 60;
            return diffMinutes < config.publish.minIntervalMinutes;
        });

        if (conflicting) {
            return res.status(400).json({
                success: false,
                error: `发布间隔太近，需要至少 ${config.publish.minIntervalMinutes} 分钟`
            });
        }

        const scheduleId = await schedulesDb.create({
            contentId,
            accountId,
            scheduledAt: scheduleTime.toISOString(),
        });

        logger.info('发布计划创建成功', { scheduleId, contentId, accountId, scheduledAt });
        res.json({ success: true, data: { id: scheduleId } });
    } catch (error) {
        logger.error('创建计划失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取消发布计划
 */
router.delete('/:id', async (req, res) => {
    try {
        const scheduleId = parseInt(req.params.id);
        const schedule = await schedulesDb.getById(scheduleId);

        if (!schedule) {
            return res.status(404).json({ success: false, error: '计划不存在' });
        }

        if (schedule.status === 'running') {
            return res.status(400).json({ success: false, error: '正在执行中的计划无法取消' });
        }

        if (schedule.status === 'completed') {
            return res.status(400).json({ success: false, error: '已完成的计划无法取消' });
        }

        await schedulesDb.update(scheduleId, { status: 'cancelled' });

        // 恢复内容状态
        await contentsDb.update(schedule.content_id, { status: 'draft' });

        logger.info('发布计划已取消', { scheduleId });
        res.json({ success: true });
    } catch (error) {
        logger.error('取消计划失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 立即执行发布
 */
router.post('/:id/run', async (req, res) => {
    try {
        const scheduleId = parseInt(req.params.id);
        const schedule = await schedulesDb.getById(scheduleId);

        if (!schedule) {
            return res.status(404).json({ success: false, error: '计划不存在' });
        }

        if (schedule.status !== 'pending') {
            return res.status(400).json({ success: false, error: '只能执行待发布状态的计划' });
        }

        // 更新为立即执行
        await schedulesDb.update(scheduleId, {
            scheduledAt: new Date().toISOString()
        });

        logger.info('计划已设置为立即执行', { scheduleId });
        res.json({ success: true, message: '已加入执行队列' });
    } catch (error) {
        logger.error('执行计划失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
