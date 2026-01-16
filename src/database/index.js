import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 确保数据目录存在
if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
}

let db = null;

/**
 * 获取数据库实例
 */
export async function getDb() {
    if (db) return db;

    const SQL = await initSqlJs();

    // 加载现有数据库或创建新的
    if (fs.existsSync(config.dbPath)) {
        const fileBuffer = fs.readFileSync(config.dbPath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    return db;
}

/**
 * 保存数据库到文件
 */
export async function saveDb() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
}

/**
 * 初始化数据库表结构
 */
export async function initDatabase() {
    const database = await getDb();
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // 分割并执行每条语句
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
        try {
            database.run(stmt);
        } catch (e) {
            // 忽略已存在的表/索引错误
        }
    }

    await saveDb();
    console.log('✅ 数据库初始化完成');
}

// ==================== 账号相关 ====================

export const accountsDb = {
    async getAll() {
        const database = await getDb();
        const result = database.exec('SELECT * FROM accounts ORDER BY created_at DESC');
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async getById(id) {
        const database = await getDb();
        const result = database.exec('SELECT * FROM accounts WHERE id = ?', [id]);
        return result.length > 0 ? rowsToObjects(result[0])[0] : null;
    },

    async getByXhsId(xhsId) {
        const database = await getDb();
        const result = database.exec('SELECT * FROM accounts WHERE xhs_id = ?', [xhsId]);
        return result.length > 0 ? rowsToObjects(result[0])[0] : null;
    },

    async getActive() {
        const database = await getDb();
        const result = database.exec("SELECT * FROM accounts WHERE status = 'active'");
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async create(data) {
        const database = await getDb();
        database.run(`
      INSERT INTO accounts (nickname, xhs_id, avatar_url, cookie_path, status)
      VALUES (?, ?, ?, ?, ?)
    `, [
            data.nickname || null,
            data.xhsId || null,
            data.avatarUrl || null,
            data.cookiePath || null,
            data.status || 'pending',
        ]);
        await saveDb();

        // sql.js 的 last_insert_rowid() 返回 0，直接使用 MAX(id)
        const maxResult = database.exec('SELECT MAX(id) FROM accounts');
        const id = maxResult[0]?.values[0]?.[0];
        if (id && id > 0) {
            return id;
        }
        return 1;
    },

    async update(id, data) {
        const database = await getDb();
        const fields = [];
        const values = [];

        if (data.nickname !== undefined) { fields.push('nickname = ?'); values.push(data.nickname); }
        if (data.xhsId !== undefined) { fields.push('xhs_id = ?'); values.push(data.xhsId); }
        if (data.avatarUrl !== undefined) { fields.push('avatar_url = ?'); values.push(data.avatarUrl); }
        if (data.cookiePath !== undefined) { fields.push('cookie_path = ?'); values.push(data.cookiePath); }
        if (data.dailyCount !== undefined) { fields.push('daily_count = ?'); values.push(data.dailyCount); }
        if (data.lastPublishDate !== undefined) { fields.push('last_publish_date = ?'); values.push(data.lastPublishDate); }
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        database.run(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values);
        await saveDb();
    },

    async delete(id) {
        const database = await getDb();
        database.run('DELETE FROM accounts WHERE id = ?', [id]);
        await saveDb();
    },

    async resetDailyCount() {
        const database = await getDb();
        database.run('UPDATE accounts SET daily_count = 0');
        await saveDb();
    },

    async incrementDailyCount(id) {
        const database = await getDb();
        database.run(`
      UPDATE accounts 
      SET daily_count = daily_count + 1, 
          last_publish_date = date('now', 'localtime'),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);
        await saveDb();
    },
};

// ==================== 内容相关 ====================

export const contentsDb = {
    async getAll(status = null) {
        const database = await getDb();
        const sql = status
            ? 'SELECT * FROM contents WHERE status = ? ORDER BY created_at DESC'
            : 'SELECT * FROM contents ORDER BY created_at DESC';
        const result = database.exec(sql, status ? [status] : []);
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async getById(id) {
        const database = await getDb();
        const result = database.exec('SELECT * FROM contents WHERE id = ?', [id]);
        return result.length > 0 ? rowsToObjects(result[0])[0] : null;
    },

    async getByTitle(title) {
        const database = await getDb();
        const result = database.exec('SELECT * FROM contents WHERE title = ?', [title]);
        return result.length > 0 ? rowsToObjects(result[0])[0] : null;
    },

    async create(data) {
        const database = await getDb();
        database.run(`
      INSERT INTO contents (title, body, type, media_paths, cover_path, tags, location, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            data.title,
            data.body || '',
            data.type || 'image',
            JSON.stringify(data.mediaPaths || []),
            data.coverPath || null,
            JSON.stringify(data.tags || []),
            data.location || null,
            data.status || 'draft',
        ]);
        await saveDb();
        const maxResult = database.exec('SELECT MAX(id) FROM contents');
        return maxResult[0]?.values[0]?.[0] || 1;
    },

    async update(id, data) {
        const database = await getDb();
        const fields = [];
        const values = [];

        if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
        if (data.body !== undefined) { fields.push('body = ?'); values.push(data.body); }
        if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
        if (data.mediaPaths !== undefined) { fields.push('media_paths = ?'); values.push(JSON.stringify(data.mediaPaths)); }
        if (data.coverPath !== undefined) { fields.push('cover_path = ?'); values.push(data.coverPath); }
        if (data.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(data.tags)); }
        if (data.location !== undefined) { fields.push('location = ?'); values.push(data.location); }
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        database.run(`UPDATE contents SET ${fields.join(', ')} WHERE id = ?`, values);
        await saveDb();
    },

    async delete(id) {
        const database = await getDb();
        database.run('DELETE FROM contents WHERE id = ?', [id]);
        await saveDb();
    },
};

// ==================== 发布计划相关 ====================

export const schedulesDb = {
    async getAll(status = null) {
        const database = await getDb();
        const baseQuery = `
      SELECT s.*, c.title as content_title, c.type as content_type, 
             a.nickname as account_nickname
      FROM schedules s
      LEFT JOIN contents c ON s.content_id = c.id
      LEFT JOIN accounts a ON s.account_id = a.id
    `;
        const sql = status
            ? `${baseQuery} WHERE s.status = ? ORDER BY s.scheduled_at ASC`
            : `${baseQuery} ORDER BY s.scheduled_at DESC`;
        const result = database.exec(sql, status ? [status] : []);
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async getById(id) {
        const database = await getDb();
        const result = database.exec(`
      SELECT s.*, c.title as content_title, c.type as content_type,
             c.body as content_body, c.media_paths, c.tags, c.location,
             a.nickname as account_nickname, a.cookie_path
      FROM schedules s
      LEFT JOIN contents c ON s.content_id = c.id
      LEFT JOIN accounts a ON s.account_id = a.id
      WHERE s.id = ?
    `, [id]);
        return result.length > 0 ? rowsToObjects(result[0])[0] : null;
    },

    async getByContentId(contentId) {
        const database = await getDb();
        const result = database.exec('SELECT * FROM schedules WHERE content_id = ? ORDER BY scheduled_at DESC', [contentId]);
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async getPending() {
        const database = await getDb();
        const result = database.exec(`
      SELECT s.*, c.title as content_title, c.type as content_type,
             c.body as content_body, c.media_paths, c.cover_path, c.tags, c.location,
             a.nickname as account_nickname, a.cookie_path, a.daily_count
      FROM schedules s
      LEFT JOIN contents c ON s.content_id = c.id
      LEFT JOIN accounts a ON s.account_id = a.id
      WHERE s.status = 'pending' 
        AND datetime(s.scheduled_at) <= datetime('now')
        AND a.status = 'active'
      ORDER BY s.scheduled_at ASC
    `);
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async create(data) {
        const database = await getDb();
        database.run(`
      INSERT INTO schedules (content_id, account_id, scheduled_at, status)
      VALUES (?, ?, ?, ?)
    `, [
            data.contentId,
            data.accountId,
            data.scheduledAt,
            data.status || 'pending',
        ]);
        await saveDb();
        const maxResult = database.exec('SELECT MAX(id) FROM schedules');
        const id = maxResult[0]?.values[0]?.[0] || 1;

        // 更新内容状态
        await contentsDb.update(data.contentId, { status: 'scheduled' });

        return id;
    },

    async update(id, data) {
        const database = await getDb();
        const fields = [];
        const values = [];

        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        if (data.retryCount !== undefined) { fields.push('retry_count = ?'); values.push(data.retryCount); }
        if (data.errorMessage !== undefined) { fields.push('error_message = ?'); values.push(data.errorMessage); }
        if (data.scheduledAt !== undefined) { fields.push('scheduled_at = ?'); values.push(data.scheduledAt); }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        database.run(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`, values);
        await saveDb();
    },

    /**
     * 原子性地认领任务 (CAS: Check-And-Set)
     * 只有状态为 pending 的任务会被更新为 running
     * @returns {boolean} 是否成功认领
     */
    async claim(id) {
        const database = await getDb();
        const result = database.run(
            "UPDATE schedules SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
            [id]
        );
        const rowsModified = database.getRowsModified();
        await saveDb();
        return rowsModified > 0;
    },

    async resetStuckTasks() {
        const database = await getDb();
        const result = database.run(`
            UPDATE schedules 
            SET status = 'pending', retry_count = retry_count + 1, error_message = '服务异常重启，自动重置任务'
            WHERE status = 'running'
        `);
        const rowsModified = database.getRowsModified();
        await saveDb();
        return rowsModified;
    },

    async resetDailyLimitFailures() {
        const database = await getDb();
        const result = database.run(`
            UPDATE schedules 
            SET status = 'pending', retry_count = 0, error_message = NULL, scheduled_at = CURRENT_TIMESTAMP
            WHERE status = 'failed' AND error_message LIKE '%发布限制%'
        `);
        const rowsModified = database.getRowsModified();
        await saveDb();
        logger.info(`已重置 ${rowsModified} 个因发布限制失败的任务`);
        return rowsModified;
    },

    async cleanup() {
        const database = await getDb();
        database.run("DELETE FROM schedules WHERE status IN ('completed', 'failed', 'cancelled')");
        await saveDb();
    },

    async delete(id) {
        const database = await getDb();
        database.run('DELETE FROM schedules WHERE id = ?', [id]);
        await saveDb();
    },
};

// ==================== 发布日志相关 ====================

export const logsDb = {
    async getAll(limit = 100) {
        const database = await getDb();
        const result = database.exec(`
      SELECT l.*, s.content_id, s.account_id, c.title as content_title, a.nickname as account_nickname
      FROM publish_logs l
      LEFT JOIN schedules s ON l.schedule_id = s.id
      LEFT JOIN contents c ON s.content_id = c.id
      LEFT JOIN accounts a ON s.account_id = a.id
      ORDER BY l.created_at DESC
      LIMIT ?
    `, [limit]);
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async getByScheduleId(scheduleId) {
        const database = await getDb();
        const result = database.exec('SELECT * FROM publish_logs WHERE schedule_id = ? ORDER BY created_at ASC', [scheduleId]);
        return result.length > 0 ? rowsToObjects(result[0]) : [];
    },

    async cleanup() {
        const database = await getDb();
        database.run('DELETE FROM publish_logs');
        await saveDb();
    },

    async create(data) {
        const database = await getDb();
        database.run(`
      INSERT INTO publish_logs (schedule_id, status, message, note_url, screenshot_path, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
            data.scheduleId,
            data.status,
            data.message || null,
            data.noteUrl || null,
            data.screenshotPath || null,
            data.durationMs || null,
        ]);
        await saveDb();
        const maxResult = database.exec('SELECT MAX(id) FROM publish_logs');
        return maxResult[0]?.values[0]?.[0] || 1;
    },
};

// ==================== 设置相关 ====================

export const settingsDb = {
    async get(key) {
        const database = await getDb();
        const result = database.exec('SELECT value FROM settings WHERE key = ?', [key]);
        return result.length > 0 ? result[0].values[0][0] : null;
    },

    async set(key, value) {
        const database = await getDb();
        database.run(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `, [key, String(value), String(value)]);
        await saveDb();
    },

    async getAll() {
        const database = await getDb();
        const result = database.exec('SELECT key, value FROM settings');
        if (result.length === 0) return {};
        return Object.fromEntries(result[0].values);
    },
};

// ==================== 工具函数 ====================

function rowsToObjects(result) {
    const { columns, values } = result;
    return values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

export default { getDb, saveDb, initDatabase };
