
import config from '../../config.js';
import logger from '../../utils/logger.js';

export const authMiddleware = (req, res, next) => {
    // Skip auth for health check and static files
    if (req.path === '/api/health' || !req.path.startsWith('/api')) {
        return next();
    }

    const apiKey = req.header('X-API-Key') || req.query.apiKey;

    if (!apiKey || apiKey !== config.apiKey) {
        logger.warn('API 鉴权失败', {
            path: req.path,
            ip: req.ip,
            providedKey: apiKey ? '***' : 'missing'
        });
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key' });
    }

    next();
};
