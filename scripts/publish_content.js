
import path from 'path';
import { publish } from '../src/automation/publisher.js';
import { parseArgs, formatTags, formatImages } from './utils.js';
import config from '../src/config.js';
import fs from 'fs';

// node scripts/publish_content.js --title "T" --content "C" --images "I" --tags "T"

async function main() {
    const args = parseArgs();

    if (args.help || !args.title || !args.content || !args.images) {
        console.log(`
Usage:
  node scripts/publish_content.js --title "Title" --content "Body" --images "img1.jpg,img2.jpg" [--tags "tag1,tag2"] [--location "Location"]

Options:
  --title     笔记标题 (必填)
  --content   笔记正文 (必填)
  --images    图片路径，逗号分隔 (必填)
  --tags      标签，逗号分隔 (可选)
  --location  地点 (可选)
        `);
        process.exit(args.help ? 0 : 1);
    }

    // Default to first active account or account 1
    // In a real skill scenario, we might want to specify account ID, but for now defaults to strict checks.
    // Let's assume accountId 1 or find first valid cookie.

    // Find valid account
    const cookieFiles = fs.readdirSync(config.cookiesDir).filter(f => f.endsWith('.json'));
    if (cookieFiles.length === 0) {
        console.error('❌ 未找到登录凭证，请先登录');
        process.exit(1);
    }

    // Pick the first one for simplicity of the CLI skill
    const accountId = parseInt(cookieFiles[0].match(/account_(\d+)/)?.[1] || 1);
    console.log(`📝 使用账号 ID: ${accountId}`);

    const options = {
        accountId: accountId,
        type: 'image',
        title: args.title,
        body: args.content,
        mediaPaths: formatImages(args.images),
        tags: formatTags(args.tags),
        location: args.location,
        onProgress: (step, msg) => console.log(`[${step}] ${msg}`)
    };

    console.log('🚀 开始发布任务...');
    console.log(`标题: ${options.title}`);
    console.log(`图片: ${options.mediaPaths.length} 张`);

    const result = await publish(options);

    if (result.success) {
        console.log('✅ 发布成功!');
        if (result.noteUrl) console.log(`链接: ${result.noteUrl}`);
    } else {
        console.error(`❌ 发布失败: ${result.error}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Script Error:', err);
    process.exit(1);
});
