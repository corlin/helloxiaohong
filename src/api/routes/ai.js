
import express from 'express';
import aiUtils from '../../utils/ai.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Generate Content
router.post('/generate', async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'Topic is required' });
        }

        const result = await aiUtils.generateContent(topic);
        res.json({ success: true, data: result });
    } catch (e) {
        logger.error('AI Generate Error', { error: e.message });
        res.status(500).json({ success: false, error: e.message });
    }
});

// Optimize Content
router.post('/optimize', async (req, res) => {
    try {
        const { title, body } = req.body;
        const result = await aiUtils.optimizeContent(title, body);
        res.json({ success: true, data: result });
    } catch (e) {
        logger.error('AI Optimize Error', { error: e.message });
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
