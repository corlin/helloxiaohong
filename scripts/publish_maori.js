
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

async function main() {
    console.log('🔄 开始发布毛利岩雕贴文...');

    // 1. 获取活跃账号
    try {
        const accountsRes = await fetch(`${BASE_URL}/accounts`);
        if (!accountsRes.ok) {
            throw new Error(`Failed to fetch accounts: ${accountsRes.statusText}`);
        }
        const accountsData = await accountsRes.json();
        const activeAccount = accountsData.data.find(a => a.status === 'active');

        if (!activeAccount) {
            console.error('❌ 没有活跃账号');
            process.exit(1);
        }
        console.log(`✅ 使用账号: ${activeAccount.nickname}`);

        // 2. 创建内容
        const contentPayload = {
            title: '纽西兰陶波湖：Ngatoroirangi矿湾毛利岩雕',
            body: '纽西兰陶波湖的Ngatoroirangi矿湾毛利岩雕（© Joppi/Getty Images）\n\n#新西兰 #陶波湖 #旅行 #风景 #文化',
            type: 'image',
            mediaPaths: ['maori_rock_2.jpg'], // Filename in uploads folder
            tags: ['新西兰', '陶波湖'],
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

        // 3. 创建发布计划 (Immediate)
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

    } catch (error) {
        console.error('❌ 发生错误:', error);
        process.exit(1);
    }
}

main().catch(console.error);
