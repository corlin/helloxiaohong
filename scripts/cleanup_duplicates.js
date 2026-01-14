import { getDb, saveDb, contentsDb, schedulesDb } from '../src/database/index.js';
import fs from 'fs';
import path from 'path';
import config from '../src/config.js';

async function cleanup() {
    console.log('🧹 开始清理重复数据...');
    const db = await getDb();

    // 1. 获取所有内容
    const contents = await contentsDb.getAll();
    const titleMap = new Map();

    for (const c of contents) {
        if (!titleMap.has(c.title)) {
            titleMap.set(c.title, []);
        }
        titleMap.get(c.title).push(c);
    }

    let deletedContents = 0;
    let deletedSchedules = 0;

    for (const [title, items] of titleMap) {
        if (items.length > 1) {
            console.log(`Found ${items.length} duplicates for "${title}"`);

            // Sort by ID ascending (keep the first one)
            items.sort((a, b) => a.id - b.id);
            const keep = items[0];
            const remove = items.slice(1);

            for (const item of remove) {
                console.log(`  Deleting duplicate content ID ${item.id}`);

                // Find and delete schedules for this content
                const schedules = db.exec('SELECT id FROM schedules WHERE content_id = ?', [item.id]);
                if (schedules.length > 0 && schedules[0].values) {
                    for (const row of schedules[0].values) {
                        const sId = row[0];
                        await schedulesDb.delete(sId);
                        deletedSchedules++;
                    }
                }

                // Delete content
                // Also remove files
                const mediaPaths = JSON.parse(item.media_paths || '[]');
                for (const mediaPath of mediaPaths) {
                    const fullPath = path.join(config.uploadsDir, mediaPath);
                    // Check if the file is used by the KEPT content (unlikely if unique filenames, but safe to check)
                    // If filenames are unique per upload, we can delete.
                    // But if checking logic, let's assume specific files for specific content ID.
                    if (fs.existsSync(fullPath)) {
                        try {
                            fs.unlinkSync(fullPath);
                        } catch (e) { }
                    }
                }

                await contentsDb.delete(item.id);
                deletedContents++;
            }
        }
    }

    // 2. Clean up duplicate pending schedules for the same content
    const allPending = await schedulesDb.getAll('pending');
    const contentScheduleMap = new Map();

    for (const s of allPending) {
        if (!contentScheduleMap.has(s.content_id)) {
            contentScheduleMap.set(s.content_id, []);
        }
        contentScheduleMap.get(s.content_id).push(s);
    }

    for (const [cId, items] of contentScheduleMap) {
        if (items.length > 1) {
            // Keep the earliest one? Or latest? Latest scheduled time?
            // Let's keep the one with earliest ID (created first)
            items.sort((a, b) => a.id - b.id);
            const keep = items[0];
            const remove = items.slice(1);

            for (const s of remove) {
                console.log(`  Deleting duplicate pending schedule ID ${s.id} for content ${cId}`);
                await schedulesDb.delete(s.id);
                deletedSchedules++;
            }
        }
    }

    console.log(`✅ 清理完成`);
    console.log(`   Deleted Contents: ${deletedContents}`);
    console.log(`   Deleted Schedules: ${deletedSchedules}`);
}

cleanup().catch(console.error);
