
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * 简单的并发任务队列
 * 控制最大并发数，防止浏览器资源耗尽
 */
export class TaskQueue {
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processNext();
        });
    }

    async processNext() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.running++;
        const { task, resolve, reject } = this.queue.shift();

        try {
            const result = await task();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.running--;
            this.processNext();
        }
    }

    get pendingCount() {
        return this.queue.length;
    }

    get runningCount() {
        return this.running;
    }
}

export default TaskQueue;
