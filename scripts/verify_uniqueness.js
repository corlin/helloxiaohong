import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';
const TIMESTAMP = Date.now();

async function main() {
    console.log('🔄 开始验证任务唯一性...');

    // 0. Get Active Account
    const accountsRes = await fetch(`${BASE_URL}/accounts`);
    const accountsData = await accountsRes.json();
    const activeAccount = accountsData.data.find(a => a.status === 'active');
    if (!activeAccount) {
        console.error('❌ 没有活跃账号');
        process.exit(1);
    }

    // 1. Create Initial Content
    const title = `Verification Content ${TIMESTAMP}`;
    console.log(`Step 1: Creating content "${title}"...`);
    const contentPayload = {
        title: title,
        body: 'Validation body',
        type: 'image',
        mediaPaths: ['test_media.jpg'],
        tags: ['test'],
    };

    const c1Res = await fetch(`${BASE_URL}/contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contentPayload)
    });
    const c1Data = await c1Res.json();
    const c1Id = c1Data.data.id;
    console.log(`✅ Step 1: Created Content ID: ${c1Id}`);

    // 2. Create Duplicate Content
    console.log(`Step 2: Creating Duplicate Content "${title}"...`);
    const c2Res = await fetch(`${BASE_URL}/contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contentPayload)
    });
    const c2Data = await c2Res.json();
    const c2Id = c2Data.data.id;

    if (c1Id === c2Id) {
        console.log(`✅ Step 2: Correctly returned existing Content ID: ${c2Id}`);
    } else {
        console.error(`❌ Step 2 Failed: Expected ID ${c1Id}, got ${c2Id}`);
    }

    // 3. Create Schedule
    console.log(`Step 3: Creating Schedule for Content ${c1Id}...`);
    const s1Res = await fetch(`${BASE_URL}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contentId: c1Id,
            accountId: activeAccount.id,
            scheduledAt: new Date().toISOString()
        })
    });
    const s1Data = await s1Res.json();
    if (s1Data.success) {
        console.log(`✅ Step 3: Created Schedule ID: ${s1Data.data.id}`);
    } else {
        console.error(`❌ Step 3 Failed: ${s1Data.error}`);
    }

    // 4. Create Duplicate Schedule
    console.log(`Step 4: Creating Duplicate Schedule for Content ${c1Id}...`);
    const s2Res = await fetch(`${BASE_URL}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contentId: c1Id,
            accountId: activeAccount.id,
            scheduledAt: new Date().toISOString()
        })
    });

    if (s2Res.status === 409 || s2Res.status === 400) {
        const s2Data = await s2Res.json();
        console.log(`✅ Step 4: Correctly rejected duplicate schedule: ${s2Data.error}`);
    } else {
        console.error(`❌ Step 4 Failed: Expected 409/400, got ${s2Res.status}`);
    }
}

main().catch(console.error);
