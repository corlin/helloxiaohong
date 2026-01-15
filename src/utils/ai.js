
import config from '../config.js';
import logger from './logger.js';

let openai = null;

async function initOpenAI() {
    if (openai) return openai;

    if (!config.ai.enabled && !config.ai.apiKey) {
        throw new Error('AI functionality is disabled or API Key is missing');
    }

    try {
        const { OpenAI } = await import('openai');
        openai = new OpenAI({
            apiKey: config.ai.apiKey,
            baseURL: config.ai.baseUrl,
        });
        return openai;
    } catch (e) {
        logger.error('Failed to initialize OpenAI', { error: e.message });
        throw new Error('OpenAI SDK not installed or init failed');
    }
}

export async function generateContent(topic) {
    const ai = await initOpenAI();

    const prompt = `
你是一个小红书爆款文案专家。请根据主题 "${topic}" 生成一篇小红书笔记。
要求：
1. 标题：吸引眼球，包含关键词，使用 Emoji。
2. 正文：亲切自然，分段清晰，包含 Emoji，最后加上相关话题标签。
3. 格式：返回 JSON 格式，包含 title, body, tags (数组)。
    `;

    try {
        const completion = await ai.chat.completions.create({
            model: config.ai.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        try {
            // 尝试直接解析
            return JSON.parse(content);
        } catch (e) {
            // 尝试剥离 Markdown 代码块
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            throw e;
        }
    } catch (e) {
        logger.error('AI Generation Failed', { error: e.message });
        throw e;
    }
}

export async function optimizeContent(title, body) {
    const ai = await initOpenAI();

    const prompt = `
请优化以下小红书笔记内容，使其更具吸引力，增加 Emoji，优化排版。
原标题: ${title}
原正文: ${body}

要求：返回 JSON 格式，包含 optimizedTitle, optimizedBody, tags。
    `;

    try {
        const completion = await ai.chat.completions.create({
            model: config.ai.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        try {
            return JSON.parse(content);
        } catch (e) {
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            throw e;
        }
    } catch (e) {
        throw e;
    }
}

export default { generateContent, optimizeContent };
