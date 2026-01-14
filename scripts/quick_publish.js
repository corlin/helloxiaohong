
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

async function main() {
    // 1. 获取活跃账号
    const accountsRes = await fetch(`${BASE_URL}/accounts`);
    const accountsData = await accountsRes.json();
    const activeAccount = accountsData.data.find(a => a.status === 'active');

    if (!activeAccount) {
        console.error('❌ 没有活跃账号');
        process.exit(1);
    }
    console.log(`✅ 使用账号: ${activeAccount.nickname} (ID: ${activeAccount.id})`);

    // 2. 创建内容
    const contentPayload = {
        title: '🇳🇿 探秘陶波湖：古老的毛利岩雕',
        body: `在纽西兰陶波湖的Ngatoroirangi矿湾，藏着震撼人心的毛利岩雕（Ngātoroirangi Mine Bay Māori Rock Carvings）。\n\n乘坐皮划艇或游船，近距离感受这高达14米的艺术杰作，每一笔都诉说着古老的传说。🌊✨\n\n图片来源：© Joppi/Getty Images\n\n#新西兰旅行 #陶波湖 #毛利文化 #自然奇观 #旅行灵感`,
        type: 'image',
        mediaPaths: ['maori_rock.jpg'], // 文件名，相对于 uploads 目录
        tags: ['新西兰', '陶波湖', '毛利文化', '自然奇观'],
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

    // 3. 创建发布计划 (立即发布)
    const schedulePayload = {
        contentId: contentId,
        accountId: activeAccount.id,
        scheduledAt: new Date().toISOString() // 立即
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

    // 4. 触发调度器立即检查
    await fetch(`${BASE_URL}/schedules/run-now`, { method: 'POST' });
    console.log('🚀 已触发调度器立即执行');
}

main().catch(console.error);
