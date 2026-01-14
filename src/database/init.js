import { initDatabase } from './index.js';

console.log('正在初始化数据库...');
await initDatabase();
console.log('数据库初始化完成！');
process.exit(0);
