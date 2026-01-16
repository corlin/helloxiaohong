import cron from 'node-cron';
import config from '../config.js';
import logger from '../utils/logger.js';
import { schedulesDb, accountsDb, contentsDb, logsDb, settingsDb } from '../database/index.js';
import { publish } from '../automation/publisher.js';
import TaskQueue from '../utils/taskQueue.js';
import { getLocalDateString } from '../utils/time.js';

/**
 * 任务调度器
 * 每分钟检查待发布任务并执行
 */

let isSchedulerRunning = false;
let schedulerTask = null;

// 全局任务队列
const taskQueue = new TaskQueue(config.publish.maxConcurrentTasks);

// 内存中记录已入队的任务 ID，避免重复入队
const queuedScheduleIds = new Set();

/**
 * 处理单个发布任务
 * @param {object} schedule 
 */
async function processSchedule(schedule) {
    const { id, content_id, account_id, content_title, content_type, content_body,
        media_paths, cover_path, tags, location, account_nickname, daily_count } = schedule;

    try {
        logger.info('开始处理发布任务', {
            scheduleId: id,
            contentTitle: content_title,
            accountNickname: account_nickname
        });

        // 记录开始日志
        await logsDb.create({
            scheduleId: id,
            status: 'started',
            message: '开始处理任务',
        });

        // 原子性认领任务
        const claimed = await schedulesDb.claim(id);
        if (!claimed) {
            logger.warn('任务抢占失败或状态已变更', { scheduleId: id });
            return;
        }

        // 检查日发布限制
        const currentAccount = await accountsDb.getById(account_id);

        // 获取今日已发布成功次数 (动态统计，更准确)
        const currentDailyCount = await schedulesDb.getDailyPublishCount(account_id);

        // 动态获取每日限制
        const limitSetting = await settingsDb.get('daily_limit');
        const dailyLimit = limitSetting ? parseInt(limitSetting) : config.publish.dailyLimit;

        if (currentDailyCount >= dailyLimit) {
            logger.warn('超过日发布限制', { accountId: account_id, dailyCount: currentDailyCount, limit: dailyLimit });
            await schedulesDb.update(id, {
                status: 'failed',
                errorMessage: `超过日发布限制 (${dailyLimit})`,
            });
            await logsDb.create({
                scheduleId: id,
                status: 'failed',
                message: `超过日发布限制 (今日已发 ${currentDailyCount}/${dailyLimit})`,
            });
            return;
        }

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
                const allowedStatuses = new Set(['started', 'init', 'navigate', 'upload', 'uploading', 'processing', 'cover', 'title', 'content', 'filling', 'tags', 'location', 'publish', 'publishing', 'waiting', 'success', 'failed']);

                const statusMapping = {
                    'switch_tab': 'navigate',
                    'verify': 'processing',
                    'retry': 'processing',
                    'fill': 'filling',
                    'error': 'failed',
                };

                let dbStatus = statusMapping[step] || step;
                if (!allowedStatuses.has(dbStatus)) {
                    dbStatus = 'processing';
                    message = `[${step}] ${message}`;
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
            });
        } else {
            throw new Error(result.error || '发布失败');
        }

    } catch (error) {
        logger.error('发布失败', { scheduleId: id, error: error.message });

        // 更新重试次数
        const newRetryCount = (schedule.retry_count || 0) + 1;

        if (newRetryCount < config.publish.maxRetries) {
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
    } finally {
        // 无论成功失败，移除队列标记
        queuedScheduleIds.delete(id);
    }
}

/**
 * 检查并执行待发布任务
 */
async function checkAndExecute() {
    if (isSchedulerRunning) return;
    isSchedulerRunning = true;

    try {
        // 获取待发布任务
        const pendingSchedules = await schedulesDb.getPending();

        if (pendingSchedules.length === 0) {
            return;
        }

        logger.info(`调度器发现 ${pendingSchedules.length} 个待发布任务`);

        // 将任务加入队列
        for (const schedule of pendingSchedules) {
            if (queuedScheduleIds.has(schedule.id)) {
                continue; // 已在队列中
            }

            queuedScheduleIds.add(schedule.id);
            taskQueue.add(() => processSchedule(schedule)).catch(err => {
                logger.error('任务执行未捕获异常', { error: err.message });
                queuedScheduleIds.delete(schedule.id);
            });

            logger.info(`任务已入队: ID ${schedule.id} (当前队列: ${taskQueue.pendingCount}, 运行中: ${taskQueue.runningCount})`);
        }

    } catch (error) {
        logger.error('调度器检查错误', { error: error.message });
    } finally {
        isSchedulerRunning = false;
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

    // 重置异常任务
    try {
        await schedulesDb.resetStuckTasks();
        // 清理内存队列
        queuedScheduleIds.clear();
    } catch (e) {
        logger.error('重置异常任务失败', { error: e.message });
    }

    // 每分钟检查一次
    schedulerTask = cron.schedule('* * * * *', async () => {
        await checkAndExecute();
    });

    // 每天零点重置日发布计数，并尝试重试因限制失败的任务
    cron.schedule('0 0 * * *', async () => {
        logger.info('执行每日重置任务...');
        await accountsDb.resetDailyCount();
        await schedulesDb.resetDailyLimitFailures();
    });

    logger.info(`调度器已启动 (并发数: ${config.publish.maxConcurrentTasks})`);

    // 立即执行一次
    runNow();
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
