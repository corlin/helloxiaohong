import { Router } from 'express';
import { logsDb, schedulesDb, accountsDb, contentsDb } from '../../database/index.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * 获取发布日志
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const logs = await logsDb.getAll(parseInt(limit));
        res.json({ success: true, data: logs });
    } catch (error) {
        logger.error('获取日志列表失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取某个计划的日志
 */
router.get('/schedule/:scheduleId', async (req, res) => {
    try {
        const logs = await logsDb.getByScheduleId(req.params.scheduleId);
        res.json({ success: true, data: logs });
    } catch (error) {
        logger.error('获取计划日志失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 清理日志和历史任务
 */
router.delete('/cleanup', async (req, res) => {
    try {
        await logsDb.cleanup();
        await schedulesDb.cleanup();
        logger.info('已清理日志和历史任务');
        res.json({ success: true });
    } catch (error) {
        logger.error('清理失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取统计数据
 */
router.get('/stats', async (req, res) => {
    try {
        const accounts = await accountsDb.getAll();
        const contents = await contentsDb.getAll();
        const schedules = await schedulesDb.getAll();

        const today = new Date().toISOString().split('T')[0];

        const stats = {
            accounts: {
                total: accounts.length,
                active: accounts.filter(a => a.status === 'active').length,
            },
            contents: {
                total: contents.length,
                draft: contents.filter(c => c.status === 'draft').length,
                scheduled: contents.filter(c => c.status === 'scheduled').length,
                published: contents.filter(c => c.status === 'published').length,
                failed: contents.filter(c => c.status === 'failed').length,
            },
            schedules: {
                total: schedules.length,
                pending: schedules.filter(s => s.status === 'pending').length,
                completed: schedules.filter(s => s.status === 'completed').length,
                failed: schedules.filter(s => s.status === 'failed').length,
            },
            today: {
                published: accounts.reduce((sum, a) => {
                    return sum + (a.last_publish_date === today ? a.daily_count : 0);
                }, 0),
            },
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('获取统计数据失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
