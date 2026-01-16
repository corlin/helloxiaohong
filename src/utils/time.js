/**
 * 获取本地时间的 YYYY-MM-DD 格式字符串
 * 使用系统时区，而非 UTC
 * @returns {string} 
 */
export function getLocalDateString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - offset);
    return localDate.toISOString().split('T')[0];
}

/**
 * 获取本地时间的完整 ISO 字符串 (YYYY-MM-DDTHH:mm:ss.sss)
 * @returns {string}
 */
export function getLocalISOString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - offset);
    return localDate.toISOString().slice(0, -1); // 移除末尾的 Z
}

export default {
    getLocalDateString,
    getLocalISOString
};
