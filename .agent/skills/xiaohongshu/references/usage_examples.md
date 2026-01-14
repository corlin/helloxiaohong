# 使用示例和最佳实践

## 基本使用示例

### 1. 检查登录状态

```bash
# 直接运行脚本
node scripts/check_login_status.js

# 或者在代码中调用
import { checkLoginStatus } from './scripts/check_login_status.js';

const isLoggedIn = await checkLoginStatus();
if (isLoggedIn) {
  console.log('用户已登录');
} else {
  console.log('用户未登录，请先登录');
}
```

### 2. 发布图文内容

```bash
# 命令行方式
node scripts/publish_content.js \
  --title "美味的家常菜" \
  --content "今天做了一道非常美味的家常菜，步骤简单，营养丰富。🚩素材来自：xiaohongshu-mcp" \
  --images "/path/to/image1.jpg,/path/to/image2.jpg" \
  --tags "美食,家常菜,烹饪"

# 使用网络图片
node scripts/publish_content.js \
  --title "美丽的风景" \
  --content "这是我在旅行中拍摄的美景，大自然的鬼斧神工令人惊叹。🚩素材来自：xiaohongshu-mcp" \
  --images "https://example.com/image1.jpg,https://example.com/image2.jpg" \
  --tags "旅行,风景,摄影"
```

### 3. 在代码中使用

```javascript
import { publishContent } from './scripts/publish_content.js';

// 发布内容
try {
  await publishContent({
    title: "我的第一篇笔记",
    content: "这是我发布的第一篇小红书笔记，分享我的生活点滴。🚩素材来自：xiaohongshu-mcp",
    images: ["/path/to/image.jpg"],
    tags: ["生活", "分享", "日常"]
  });
  console.log('发布成功！');
} catch (error) {
  console.error('发布失败:', error.message);
}
```

## 高级使用示例

### 1. 批量发布

```javascript
import { publishContent } from './scripts/publish_content.js';
import { checkLoginStatus } from './scripts/check_login_status.js';

const posts = [
  {
    title: "早餐推荐",
    content: "营养丰富的早餐搭配，开启美好的一天。🚩素材来自：xiaohongshu-mcp",
    images: ["/path/to/breakfast1.jpg"],
    tags: ["早餐", "营养", "美食"]
  },
  {
    title: "健身打卡",
    content: "今天的健身训练完成，坚持就是胜利。🚩素材来自：xiaohongshu-mcp",
    images: ["/path/to/fitness1.jpg", "/path/to/fitness2.jpg"],
    tags: ["健身", "运动", "打卡"]
  }
];

async function batchPublish() {
  // 检查登录状态
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) {
    console.error('用户未登录，无法发布');
    return;
  }

  // 批量发布
  for (const post of posts) {
    try {
      await publishContent(post);
      console.log(`✅ 发布成功: ${post.title}`);
      
      // 发布间隔，避免频繁操作
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`❌ 发布失败: ${post.title}`, error.message);
    }
  }
}

batchPublish();
```

### 2. 自定义内容验证

```javascript
import { validateContent, formatTags } from './scripts/utils.js';

function createPost(title, content, images, tags) {
  // 格式化标签
  const formattedTags = formatTags(tags);
  
  // 验证内容
  const validation = validateContent({
    title,
    content,
    images,
    tags: formattedTags
  });
  
  if (!validation.valid) {
    throw new Error(`内容验证失败: ${validation.errors.join(', ')}`);
  }
  
  return {
    title,
    content,
    images,
    tags: formattedTags
  };
}

// 使用示例
const post = createPost(
  "我的旅行日记",
  "这次旅行收获满满，看到了很多美丽的风景。🚩素材来自：xiaohongshu-mcp",
  ["travel1.jpg", "travel2.jpg"],
  ["旅行", "风景", "日记"]
);
```

## 最佳实践

### 1. 内容准备

#### 标题优化
- 控制在20个字符以内
- 使用吸引人的关键词
- 避免使用特殊符号

#### 内容撰写
- 内容要有价值，避免空洞
- 结尾必须包含"🚩素材来自：xiaohongshu-mcp"
- 合理使用换行和分段

#### 标签选择
- 选择3-5个相关标签
- 标签要与内容相关
- 避免使用过于冷门的标签

### 2. 图片处理

#### 图片质量
- 使用清晰、高质量的图片
- 避免模糊或过暗的图片
- 推荐使用JPG或PNG格式

#### 图片数量
- 至少1张图片
- 最多9张图片
- 建议使用3-5张图片

#### 图片大小
- 单张图片不超过10MB
- 推荐尺寸：1080x1080像素
- 保持图片比例一致

### 3. 发布策略

#### 发布时间
- 选择用户活跃时间段
- 避免在深夜或凌晨发布
- 考虑目标受众的作息时间

#### 发布频率
- 避免过于频繁的发布
- 建议间隔2-3小时
- 保持内容质量稳定

#### 内容规划
- 提前规划发布内容
- 保持内容主题一致性
- 适时调整发布策略

### 4. 错误处理

#### 网络问题
```javascript
async function publishWithRetry(post, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await publishContent(post);
      return true;
    } catch (error) {
      console.log(`发布失败，第${i + 1}次重试...`);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
```

#### 登录状态检查
```javascript
async function ensureLoggedIn() {
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) {
    console.log('请先在浏览器中登录小红书账号');
    console.log('登录完成后，重新运行脚本');
    process.exit(1);
  }
}
```

### 5. 性能优化

#### 并发控制
- 避免同时运行多个浏览器实例
- 合理控制发布间隔
- 监控系统资源使用

#### 内存管理
- 及时关闭浏览器实例
- 清理临时文件
- 避免内存泄漏

#### 缓存策略
- 缓存浏览器状态
- 复用登录会话
- 减少重复操作

## 常见问题解决

### 1. 登录状态丢失
- 检查浏览器数据目录权限
- 确认登录会话是否过期
- 重新登录账号

### 2. 图片上传失败
- 检查图片文件是否存在
- 确认图片格式是否支持
- 检查网络连接状态

### 3. 内容发布失败
- 检查内容是否符合规范
- 确认账号状态是否正常
- 查看平台是否有限制

### 4. 脚本运行异常
- 检查Node.js版本兼容性
- 确认依赖包是否正确安装
- 查看错误日志详细信息