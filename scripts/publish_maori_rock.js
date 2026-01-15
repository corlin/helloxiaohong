
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';
// Default API Key from src/config.js
const API_KEY = process.env.API_KEY || 'dev-secret-key';

async function main() {
    console.log('🔄 开始发布毛利岩雕贴文...');

    const headers = {
        'x-api-key': API_KEY
    };

    // 1. 获取活跃账号
    try {
        const accountsRes = await fetch(`${BASE_URL}/accounts`, { headers });
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
            mediaPaths: ['maori_rock_2.jpg'],
            tags: ['新西兰', '陶波湖', '旅行', '风景', '文化'],
            location: '新西兰陶波湖'
        };

        const contentRes = await fetch(`${BASE_URL}/contents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
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

        let scheduleId;
        const scheduleRes = await fetch(`${BASE_URL}/schedules`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(schedulePayload)
        });
        const scheduleData = await scheduleRes.json();

        if (scheduleRes.status === 409) {
            console.log('⚠️ 计划已存在，复用现有计划...');
            if (scheduleData.data && scheduleData.data.id) {
                scheduleId = scheduleData.data.id;
            } else {
                console.error('❌ 无法获取现有计划 ID');
                process.exit(1);
            }
        } else if (!scheduleData.success) {
            console.error('❌ 创建计划失败:', scheduleData.error);
            process.exit(1);
        } else {
            scheduleId = scheduleData.data.id;
            console.log(`✅ 发布计划创建成功 (ID: ${scheduleId})`);
        }

        // 4. 触发
        const runRes = await fetch(`${BASE_URL}/schedules/${scheduleId}/run`, {
            method: 'POST',
            headers: headers
        });
        const runData = await runRes.json();
        if (runData.success) {
            console.log('🚀 已触发调度器 (立即执行)');
        } else {
            console.error('❌ 触发调度器失败:', runData.error);
        }


    } catch (error) {
        console.error('❌ 发生错误:', error);
        process.exit(1);
    }
}

main().catch(console.error);
