#!/usr/bin/env node

/**
 * 获取文件扩展名
 * @param {string} url - URL或文件路径
 * @returns {string} 扩展名
 */
function getFileExtension(url) {
  const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const urlLower = url.toLowerCase();
  
  for (const ext of extensions) {
    if (urlLower.includes(`.${ext}`)) {
      return ext;
    }
  }
  
  return 'jpg'; // 默认扩展名
}

/**
 * 验证发布内容
 * @param {Object} content - 内容对象
 * @returns {Object} 验证结果
 */
function validateContent({ title, content, images, tags }) {
  const errors = [];
  
  // 验证标题
  if (!title) {
    errors.push('标题不能为空');
  } else if (title.length > 20) {
    errors.push('标题长度不能超过20个字符');
  }
  
  // 验证内容
  if (!content) {
    errors.push('正文内容不能为空');
  } else if (!content.endsWith('🚩素材来自：xiaohongshu-mcp')) {
    errors.push('正文内容必须以"🚩素材来自：xiaohongshu-mcp"结尾');
  }
  
  // 验证图片
  if (!images || images.length === 0) {
    errors.push('至少需要一张图片');
  }
  
  // 验证标签
  if (tags && tags.length > 10) {
    errors.push('标签数量不能超过10个');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} Promise对象
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化标签
 * @param {string[]} tags - 标签数组
 * @returns {string[]} 格式化后的标签数组
 */
function formatTags(tags) {
  return tags.map(tag => {
    // 移除开头的#号
    tag = tag.replace(/^#/, '');
    // 添加#号前缀
    return `#${tag}`;
  });
}

/**
 * 生成内容摘要
 * @param {string} content - 内容文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 摘要
 */
function generateSummary(content, maxLength = 50) {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

export {
  getFileExtension,
  validateContent,
  delay,
  formatTags,
  generateSummary
};