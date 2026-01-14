
/**
 * 解析命令行参数
 * 支持格式: --key value 或 --key "value with spaces"
 */
export function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            // 检查下一个参数是否是值
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                result[key] = args[i + 1];
                i++; // 跳过值
            } else {
                result[key] = true; // 布尔标志
            }
        }
    }
    return result;
}

/**
 * 格式化标签字符串
 * @param {string} tagsStr 逗号分隔的标签字符串
 * @returns {string[]} 标签数组
 */
export function formatTags(tagsStr) {
    if (!tagsStr) return [];
    return tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean);
}

/**
 * 格式化图片路径
 * @param {string} imagesStr 逗号分隔的路径字符串
 * @returns {string[]} 路径数组
 */
export function formatImages(imagesStr) {
    if (!imagesStr) return [];
    return imagesStr.split(',').map(p => p.trim()).filter(Boolean);
}
