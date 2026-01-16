import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { contentsDb, schedulesDb } from '../../database/index.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';

const router = Router();

// 确保上传目录存在
if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        const mimetype = file.mimetype;

        if (allowedTypes.test(ext) || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件类型'));
        }
    },
});

/**
 * 获取所有内容
 */
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const contents = await contentsDb.getAll(status || null);

        // 解析 JSON 字段
        const parsedContents = contents.map(content => ({
            ...content,
            media_paths: JSON.parse(content.media_paths || '[]'),
            tags: JSON.parse(content.tags || '[]'),
        }));

        res.json({ success: true, data: parsedContents });
    } catch (error) {
        logger.error('获取内容列表失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取单个内容
 */
router.get('/:id', async (req, res) => {
    try {
        const content = await contentsDb.getById(req.params.id);
        if (!content) {
            return res.status(404).json({ success: false, error: '内容不存在' });
        }

        content.media_paths = JSON.parse(content.media_paths || '[]');
        content.tags = JSON.parse(content.tags || '[]');

        res.json({ success: true, data: content });
    } catch (error) {
        logger.error('获取内容失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 创建内容
 */
router.post('/', async (req, res) => {
    try {
        const { title, body, type, mediaPaths, coverPath, tags, location } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, error: '标题不能为空' });
        }

        // 1. 检查是否存在同名内容
        const existingContent = await contentsDb.getByTitle(title);
        if (existingContent) {
            logger.info('发现已存在的内容，返回现有 ID', { title, id: existingContent.id });
            return res.json({ success: true, data: { id: existingContent.id } });
        }

        if (!mediaPaths || mediaPaths.length === 0) {
            return res.status(400).json({ success: false, error: '请上传媒体文件' });
        }

        const contentId = await contentsDb.create({
            title,
            body,
            type: type || 'image',
            mediaPaths,
            coverPath,
            tags: tags || [],
            location,
        });

        logger.info('内容创建成功', { contentId, title });
        res.json({ success: true, data: { id: contentId } });
    } catch (error) {
        logger.error('创建内容失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 更新内容
 */
router.put('/:id', async (req, res) => {
    try {
        const contentId = parseInt(req.params.id);
        const content = await contentsDb.getById(contentId);

        if (!content) {
            return res.status(404).json({ success: false, error: '内容不存在' });
        }

        const { title, body, type, mediaPaths, coverPath, tags, location, status } = req.body;

        await contentsDb.update(contentId, {
            title,
            body,
            type,
            mediaPaths,
            coverPath,
            tags,
            location,
            status,
        });

        logger.info('内容更新成功', { contentId });
        res.json({ success: true });
    } catch (error) {
        logger.error('更新内容失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 删除内容
 */
router.delete('/:id', async (req, res) => {
    try {
        const contentId = parseInt(req.params.id);
        const content = await contentsDb.getById(contentId);

        if (!content) {
            return res.status(404).json({ success: false, error: '内容不存在' });
        }

        // 删除关联的媒体文件
        const mediaPaths = JSON.parse(content.media_paths || '[]');
        for (const mediaPath of mediaPaths) {
            const fullPath = path.join(config.uploadsDir, mediaPath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        // 删除关联的发布计划
        await schedulesDb.deleteByContentId(contentId);

        await contentsDb.delete(contentId);

        logger.info('内容删除成功', { contentId });
        res.json({ success: true });
    } catch (error) {
        logger.error('删除内容失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 上传媒体文件
 */
router.post('/upload', upload.array('files', 18), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: '没有上传文件' });
        }

        const filePaths = req.files.map(file => file.filename);
        const fileInfos = req.files.map(file => ({
            filename: file.filename,
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            path: file.filename,
        }));

        logger.info('文件上传成功', { count: filePaths.length });
        res.json({ success: true, data: { files: fileInfos, paths: filePaths } });
    } catch (error) {
        logger.error('上传文件失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
