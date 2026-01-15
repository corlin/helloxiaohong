
import config from '../src/config.js';
import { publish } from '../src/automation/publisher.js';
import { createContext, createPage } from '../src/automation/browser.js';
import { getCookiePath, isCookieValid } from '../src/automation/login.js';
import { parseArgs, formatTags, formatImages } from './utils.js';
import fs from 'fs';
import path from 'path';
import { SELECTORS } from '../src/automation/selectors.js';

const COMMANDS = {
    PUBLISH: 'publish',
    CHECK_LOGIN: 'check-login',
    LIST_ACCOUNTS: 'list-accounts'
};

function printUsage() {
    console.log(`
Usage: node scripts/cli.js <command> [options]

Commands:
  ${COMMANDS.PUBLISH}        发布内容
  ${COMMANDS.CHECK_LOGIN}    检查登录状态
  ${COMMANDS.LIST_ACCOUNTS}  列出所有账号

Options for '${COMMANDS.PUBLISH}':
  --title     笔记标题 (必填)
  --content   笔记正文 (必填)
  --images    图片路径，逗号分隔 (必填)
  --tags      标签，逗号分隔 (可选)
  --location  地点 (可选)
  --account   指定账号ID (可选，默认使用第一个有效账号)
    `);
}

async function getAccount(accountId) {
    const cookieFiles = fs.readdirSync(config.cookiesDir).filter(f => f.endsWith('.json'));

    if (cookieFiles.length === 0) {
        throw new Error('未找到任何登录凭证 (Cookies)');
    }

    let targetFile;
    if (accountId) {
        targetFile = `account_${accountId}.json`;
        if (!cookieFiles.includes(targetFile)) {
            throw new Error(`未找到账号 ${accountId} 的凭证`);
        }
    } else {
        targetFile = cookieFiles[0];
    }

    const id = targetFile.match(/account_(\d+)/)?.[1];
    return { id, path: path.join(config.cookiesDir, targetFile) };
}

async function handleCheckLogin(args) {
    console.log('🔍 正在检查登录状态...');
    const cookieFiles = fs.readdirSync(config.cookiesDir).filter(f => f.endsWith('.json'));

    if (cookieFiles.length === 0) {
        console.log('❌ 未找到任何登录凭证');
        return;
    }

    let anyValid = false;
    for (const file of cookieFiles) {
        const accountId = file.match(/account_(\d+)/)?.[1];
        const cookiePath = path.join(config.cookiesDir, file);

        if (!isCookieValid(cookiePath)) {
            console.log(`⚠️  账号 ${accountId}: Cookie 文件过期或无效`);
            continue;
        }

        console.log(`👤 正在验证账号 ${accountId}有效性...`);
        let context;
        try {
            context = await createContext(cookiePath);
            const page = await createPage(context);

            // 使用新版 SELECTORS
            await page.goto(config.xhs.creatorUrl, { waitUntil: 'domcontentloaded' });

            // Check for login indicators using SELECTORS
            let isLoggedIn = false;
            for (const selector of SELECTORS.LOGIN.LOGGED_IN_INDICATORS) {
                if (await page.locator(selector).first().isVisible({ timeout: 2000 }).catch(() => false)) {
                    isLoggedIn = true;
                    break;
                }
            }

            if (isLoggedIn) {
                console.log(`✅ 账号 ${accountId}: 登录有效`);
                anyValid = true;
            } else {
                console.log(`❌ 账号 ${accountId}: 登录失效 (需重新登录)`);
            }
            await context.close();
        } catch (e) {
            console.error(`❌ 账号 ${accountId} 验证出错: ${e.message}`);
            if (context) await context.close();
        }
    }

    if (!anyValid) process.exit(1);
}

async function handlePublish(args) {
    if (!args.title || !args.content || !args.images) {
        console.error('❌ 缺少必填参数: title, content, images');
        printUsage();
        process.exit(1);
    }

    try {
        const account = await getAccount(args.account);
        console.log(`📝 使用账号 ID: ${account.id}`);

        const result = await publish({
            accountId: parseInt(account.id),
            type: 'image',
            title: args.title,
            body: args.content,
            mediaPaths: formatImages(args.images),
            tags: formatTags(args.tags),
            location: args.location,
            onProgress: (step, msg) => console.log(`[${step}] ${msg}`)
        });

        if (result.success) {
            console.log('✅ 发布成功!');
            if (result.noteUrl) console.log(`链接: ${result.noteUrl}`);
        } else {
            console.error(`❌ 发布失败: ${result.error}`);
            process.exit(1);
        }
    } catch (e) {
        console.error(`❌ 错误: ${e.message}`);
        process.exit(1);
    }
}

async function main() {
    const args = parseArgs();
    const command = process.argv[2];

    switch (command) {
        case COMMANDS.PUBLISH:
            await handlePublish(args);
            break;
        case COMMANDS.CHECK_LOGIN:
            await handleCheckLogin(args);
            break;
        case COMMANDS.LIST_ACCOUNTS:
            // TODO: implement list
            const cookieFiles = fs.readdirSync(config.cookiesDir).filter(f => f.endsWith('.json'));
            console.log('可用账号凭证:');
            cookieFiles.forEach(f => console.log(`- ${f}`));
            break;
        default:
            printUsage();
            process.exit(1);
    }
}

main().catch(console.error);
