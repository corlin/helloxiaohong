import cron from 'node-cron';
import config from '../config.js';
import logger from '../utils/logger.js';
import { schedulesDb, accountsDb, contentsDb, logsDb } from '../database/index.js';
import { publish } from '../automation/publisher.js';

/**
 * 任务调度器
 * 每分钟检查待发布任务并执行
 */

let isRunning = false;
let schedulerTask = null;

/**
 * 处理单个发布任务
 * @param {object} schedule 
 */
async function processSchedule(schedule) {
    const { id, content_id, account_id, content_title, content_type, content_body,
        media_paths, cover_path, tags, location, account_nickname, daily_count } = schedule;

    logger.info('开始处理发布任务', {
        scheduleId: id,
        contentTitle: content_title,
        accountNickname: account_nickname
    });

    // 记录开始日志
    await logsDb.create({
        scheduleId: id,
        status: 'started',
        message: '开始发布',
    });

    // 原子性认领任务
    const claimed = await schedulesDb.claim(id);
    if (!claimed) {
        logger.warn('任务抢占失败或状态已变更', { scheduleId: id });
        await logsDb.create({
            scheduleId: id,
            status: 'failed',
            message: '任务抢占失败：任务可能已被取消或正在执行中',
        });
        return;
    }

    // 检查日发布限制
    if (daily_count >= config.publish.dailyLimit) {
        logger.warn('超过日发布限制', { accountId: account_id, dailyCount: daily_count });
        await schedulesDb.update(id, {
            status: 'failed',
            errorMessage: '超过日发布限制',
        });
        await logsDb.create({
            scheduleId: id,
            status: 'failed',
            message: `超过日发布限制 (${daily_count}/${config.publish.dailyLimit})`,
        });
        return;
    }

    try {
        // 解析 JSON 字段
        const mediaPaths = typeof media_paths === 'string' ? JSON.parse(media_paths) : media_paths;
        const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;

        // 执行发布
        const result = await publish({
            accountId: account_id,
            type: content_type,
            title: content_title,
            body: content_body,
            mediaPaths,
            coverPath: cover_path,
            tags: parsedTags || [],
            location,
            onProgress: async (step, message) => {
                // 映射发布器内部步骤到数据库允许的状态
                const statusMapping = {
                    'switch_tab': 'navigate',
                    'verify': 'processing',
                    'retry': 'processing',
                    'fill': 'filling',
                    'error': 'failed',
                };

                // 如果没有直接映射，且不在允许列表中，则回退到 'processing'
                // 允许列表: 'started', 'init', 'navigate', 'upload', 'uploading', 'processing', 'cover', 'title', 'content', 'filling', 'tags', 'location', 'publish', 'publishing', 'waiting', 'success', 'failed'
                const allowedStatuses = new Set(['started', 'init', 'navigate', 'upload', 'uploading', 'processing', 'cover', 'title', 'content', 'filling', 'tags', 'location', 'publish', 'publishing', 'waiting', 'success', 'failed']);

                let dbStatus = statusMapping[step] || step;

                if (!allowedStatuses.has(dbStatus)) {
                    // 若状态仍不合法，记录原始信息到消息中，状态设为 processing
                    message = `[${step}] ${message}`;
                    dbStatus = 'processing';
                }

                await logsDb.create({
                    scheduleId: id,
                    status: dbStatus,
                    message,
                });
            },
        });

        if (result.success) {
            // 发布成功
            await schedulesDb.update(id, { status: 'completed' });
            await contentsDb.update(content_id, { status: 'published' });
            await accountsDb.incrementDailyCount(account_id);

            await logsDb.create({
                scheduleId: id,
                status: 'success',
                message: '发布成功',
                noteUrl: result.noteUrl,
                screenshotPath: result.screenshotPath,
                durationMs: result.duration,
            });

            logger.info('发布成功', {
                scheduleId: id,
                noteUrl: result.noteUrl,
                duration: result.duration
            });
        } else {
            throw new Error(result.error || '发布失败');
        }

    } catch (error) {
        logger.error('发布失败', { scheduleId: id, error: error.message });

        // 更新重试次数
        const newRetryCount = (schedule.retry_count || 0) + 1;

        if (newRetryCount < config.publish.maxRetries) {
            // 还有重试机会
            await schedulesDb.update(id, {
                status: 'pending',
                retryCount: newRetryCount,
                errorMessage: error.message,
            });

            await logsDb.create({
                scheduleId: id,
                status: 'failed',
                message: `发布失败，将重试 (${newRetryCount}/${config.publish.maxRetries}): ${error.message}`,
            });
        } else {
            // 重试次数用尽
            await schedulesDb.update(id, {
                status: 'failed',
                retryCount: newRetryCount,
                errorMessage: error.message,
            });
            await contentsDb.update(content_id, { status: 'failed' });

            await logsDb.create({
                scheduleId: id,
                status: 'failed',
                message: `发布失败，重试次数用尽: ${error.message}`,
            });
        }
    }
}

/**
 * 检查并执行待发布任务
 */
async function checkAndExecute() {
    if (isRunning) {
        logger.debug('调度器正在运行中，跳过本次检查');
        return;
    }

    isRunning = true;

    try {
        // 获取待发布任务
        const pendingSchedules = await schedulesDb.getPending();

        if (pendingSchedules.length === 0) {
            logger.debug('没有待发布任务');
            return;
        }

        logger.info(`发现 ${pendingSchedules.length} 个待发布任务`);

        // 按账号分组，每个账号同时只执行一个任务
        const accountTasks = new Map();
        for (const schedule of pendingSchedules) {
            if (!accountTasks.has(schedule.account_id)) {
                accountTasks.set(schedule.account_id, schedule);
            }
        }

        // 串行执行（避免浏览器资源竞争）
        for (const [accountId, schedule] of accountTasks) {
            await processSchedule(schedule);

            // 任务间延迟
            await new Promise(resolve =>
                setTimeout(resolve, config.publish.minIntervalMinutes * 60 * 1000 / 4)
            );
        }

    } catch (error) {
        logger.error('调度器执行错误', { error: error.message });
    } finally {
        isRunning = false;
    }
}

/**
 * 启动调度器
 */
export async function startScheduler() {
    if (schedulerTask) {
        logger.warn('调度器已在运行');
        return;
    }

    // 启动时检查是否有异常中断的任务
    try {
        const resetCount = await schedulesDb.resetStuckTasks();
        if (resetCount > 0) {
            logger.info(`已自动重置 ${resetCount} 个异常中断的任务`);
        }
    } catch (e) {
        logger.error('重置异常任务失败', { error: e.message });
    }

    // 每分钟检查一次
    schedulerTask = cron.schedule('* * * * *', async () => {
        logger.debug('调度器检查任务...');
        await checkAndExecute();
    });

    // 每天零点重置日发布计数
    cron.schedule('0 0 * * *', async () => {
        logger.info('重置日发布计数');
        await accountsDb.resetDailyCount();
    });

    logger.info('调度器已启动');
}

/**
 * 停止调度器
 */
export function stopScheduler() {
    if (schedulerTask) {
        schedulerTask.stop();
        schedulerTask = null;
        logger.info('调度器已停止');
    }
}

/**
 * 立即执行一次检查
 */
export async function runNow() {
    await checkAndExecute();
}

export default {
    startScheduler,
    stopScheduler,
    runNow,
};
