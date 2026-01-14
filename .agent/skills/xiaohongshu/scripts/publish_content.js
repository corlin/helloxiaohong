import { chromium } from "playwright";
import fs from "fs";

/* ======================
 * 常量
 * ====================== */

const URL_OF_PUBLISH =
  "https://creator.xiaohongshu.com/publish/publish?source=official";

/* ======================
 * PublishAction
 * ====================== */

export class PublishAction {
  constructor(page) {
    this.page = page;
  }

  static async create(page) {
    await page.goto(URL_OF_PUBLISH, {
      timeout: 300_000,
      waitUntil: "networkidle",
    });

    await page.waitForTimeout(1000);
    await mustClickPublishTab(page, "上传图文");
    await page.waitForTimeout(1000);

    return new PublishAction(page);
  }

  async publish(content) {
    const { title, content: body, tags = [], imagePaths } = content;

    if (!imagePaths || imagePaths.length === 0) {
      throw new Error("图片不能为空");
    }

    await uploadImages(this.page, imagePaths);

    let finalTags = tags;
    if (finalTags.length > 10) {
      console.warn("标签数量超过 10，已截断");
      finalTags = finalTags.slice(0, 10);
    }

    console.info("发布内容", {
      title,
      images: imagePaths.length,
      tags: finalTags,
    });

    await submitPublish(this.page, title, body, finalTags);
  }
}

/* ======================
 * 图片上传
 * eg: /Users/{user}/Desktop/xiaohongshu-mcp-js/maori_rock_carving.jpg
 * ====================== */

async function uploadImages(page, paths) {
  const validPaths = paths.filter((p) => {
    if (!fs.existsSync(p)) {
      console.warn("图片不存在:", p);
      return false;
    }
    return true;
  });

  if (!validPaths.length) {
    throw new Error("没有有效图片");
  }

  const input = await page.waitForSelector(".upload-input", {
    timeout: 30_000,
  });

  await input.setInputFiles(validPaths);
  await waitForUploadComplete(page, validPaths.length);
}

async function waitForUploadComplete(page, expected) {
  const start = Date.now();
  const timeout = 60_000;

  while (Date.now() - start < timeout) {
    const items = await page.$$(".img-preview-area .pr");
    console.info(`已上传 ${items.length}/${expected}`);

    if (items.length >= expected) return;
    await page.waitForTimeout(500);
  }

  throw new Error("图片上传超时");
}

/* ======================
 * 发布提交
 * ====================== */

async function submitPublish(page, title, body, tags) {
  const titleInput = await page.waitForSelector("div.d-input input");
  await titleInput.fill(title);

  await page.waitForTimeout(500);
  await checkTitleMaxLength(page);

  const contentElem = await getContentElement(page);
  if (!contentElem) {
    throw new Error("未找到正文输入框");
  }

  await contentElem.fill(body);
  await inputTags(page, contentElem, tags);

  await page.waitForTimeout(500);
  await checkContentMaxLength(page);

  const submitBtn = await page.waitForSelector(
    "div.submit div.d-button-content"
  );
  await submitBtn.click();

  await page.waitForTimeout(3000);
}

/* ======================
 * 长度校验
 * ====================== */

async function checkTitleMaxLength(page) {
  const elem = await page.$("div.title-container div.max_suffix");
  if (!elem) return;

  const text = await elem.innerText();
  throw makeMaxLengthError(text);
}

async function checkContentMaxLength(page) {
  const elem = await page.$("div.edit-container div.length-error");
  if (!elem) return;

  const text = await elem.innerText();
  throw makeMaxLengthError(text);
}

function makeMaxLengthError(text) {
  const parts = text.split("/");
  if (parts.length !== 2) {
    return new Error(`长度超限: ${text}`);
  }
  return new Error(`当前长度 ${parts[0]}，最大长度 ${parts[1]}`);
}

/* ======================
 * 正文输入框 & 标签
 * ====================== */

async function getContentElement(page) {
  const editor = await page.$("div.ql-editor");
  if (editor) return editor;

  const ps = await page.$$("p[data-placeholder]");
  for (const p of ps) {
    const placeholder = await p.getAttribute("data-placeholder");
    if (placeholder && placeholder.includes("输入正文描述")) {
      let el = p;
      for (let i = 0; i < 5; i++) {
        el = await el.evaluateHandle((n) => n.parentElement);
        const role = await el.getAttribute("role");
        if (role === "textbox") return el;
      }
    }
  }
  return null;
}

async function inputTags(page, elem, tags) {
  if (!tags.length) return;

  await elem.press("Enter");
  await elem.press("Enter");

  for (let tag of tags) {
    tag = tag.replace(/^#/, "");

    await elem.type("#" + tag, { delay: 50 });
    await page.waitForTimeout(500);

    const item = await page.$("#creator-editor-topic-container .item");
    if (item) {
      await item.click();
    } else {
      await elem.type(" ");
    }

    await page.waitForTimeout(300);
  }
}

/* ======================
 * TAB 点击 & 防遮挡
 * ====================== */

async function mustClickPublishTab(page, tabName) {
  await page.waitForSelector("div.upload-content");

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const tabs = await page.$$("div.creator-tab");

    for (const tab of tabs) {
      const text = (await tab.innerText()).trim();
      if (text !== tabName) continue;

      if (await isElementBlocked(page, tab)) {
        await removePopCover(page);
        await page.waitForTimeout(200);
        continue;
      }

      await tab.click();
      return;
    }

    await page.waitForTimeout(200);
  }

  throw new Error(`未找到发布 TAB: ${tabName}`);
}

async function isElementBlocked(page, elem) {
  return page.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    return !(target === el || el.contains(target));
  }, elem);
}

async function removePopCover(page) {
  const pop = await page.$("div.d-popover");
  if (pop) {
    await pop.evaluate((el) => el.remove());
  }
}

export async function handlePublishContent(title, content, imagePaths, tags) {
  const browser = await chromium.launchPersistentContext(".chromiumTemp", {
    headless: false,
  });
  const page = await browser.newPage();

  const action = await PublishAction.create(page);

  try {
    await action.publish({
      title,
      content,
      imagePaths,
      tags,
    });

    await browser.close();
    return true;
  } catch (error) {
    console.error(error);
    await browser.close();
    throw error;
  }
}

// 命令行参数处理
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        params[key] = nextArg;
        i++;
      } else {
        params[key] = true;
      }
    }
  }

  const { title, content, images, tags } = params;

  if (!title || !content || !images) {
    console.error('❌ 缺少必要参数');
    console.error('');
    console.error('用法: node scripts/publish_content.js --title "标题" --content "正文内容" --images "图片路径1,图片路径2" --tags "标签1,标签2"');
    console.error('');
    console.error('参数说明:');
    console.error('  --title    帖子标题（必需）');
    console.error('  --content  帖子正文（必需）');
    console.error('  --images   图片路径，多个图片用逗号分隔（必需）');
    console.error('  --tags     标签，多个标签用逗号分隔（可选）');
    process.exit(1);
  }

  const imagePaths = images.split(',').map(path => path.trim());
  const tagList = tags ? tags.split(',').map(tag => tag.trim()) : [];

  console.log('📝 准备发布内容...');
  console.log('   标题:', title);
  console.log('   图片数量:', imagePaths.length);
  console.log('   标签:', tagList);
  console.log('');

  handlePublishContent(title, content, imagePaths, tagList)
    .then(() => {
      console.log('');
      console.log('✅ 发布成功！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('');
      console.error('❌ 发布失败:', error.message);
      process.exit(1);
    });
}
