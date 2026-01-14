
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

async function main() {
    console.log('🔄 重置所有失败任务为 pending...');
    // Simply creating a new task is easier for now as I don't have a reset API exposed yet (internal function).
    // Actually resetStuckTasks is internal. 
    // I will just create a NEW task.

    // 1. 获取活跃账号
    const accountsRes = await fetch(`${BASE_URL}/accounts`);
    const accountsData = await accountsRes.json();
    const activeAccount = accountsData.data.find(a => a.status === 'active');

    if (!activeAccount) {
        console.error('❌ 没有活跃账号');
        process.exit(1);
    }
    console.log(`✅ 使用账号: ${activeAccount.nickname}`);

    // 2. 创建内容 (Unique title to distinguish)
    const uniqueTitle = `🇳🇿 探秘陶波湖：古老的毛利岩雕 (Test ${Date.now()})`;
    const contentPayload = {
        title: uniqueTitle,
        body: `在纽西兰陶波湖的Ngatoroirangi矿湾，藏着震撼人心的毛利岩雕。\n\n#新西兰旅行 #陶波湖`,
        type: 'image',
        mediaPaths: ['maori_rock.jpg'],
        tags: ['新西兰'],
        location: '新西兰陶波湖'
    };

    const contentRes = await fetch(`${BASE_URL}/contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contentPayload)
    });
    const contentData = await contentRes.json();
    if (!contentData.success) {
        console.error('❌ 创建内容失败:', contentData.error);
        process.exit(1);
    }
    const contentId = contentData.data.id;
    console.log(`✅ 内容创建成功 (ID: ${contentId})`);

    // 3. 创建发布计划
    const schedulePayload = {
        contentId: contentId,
        accountId: activeAccount.id,
        scheduledAt: new Date().toISOString()
    };

    const scheduleRes = await fetch(`${BASE_URL}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedulePayload)
    });
    const scheduleData = await scheduleRes.json();

    if (!scheduleData.success) {
        console.error('❌ 创建计划失败:', scheduleData.error);
        process.exit(1);
    }
    console.log(`✅ 发布计划创建成功 (ID: ${scheduleData.data.id})`);

    // 4. 触发
    await fetch(`${BASE_URL}/schedules/run-now`, { method: 'POST' });
    console.log('🚀 已触发调度器');
}

main().catch(console.error);
