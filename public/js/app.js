/**
 * 小红书自动发布系统 - 前端应用
 */

// 全局状态
let uploadedFiles = [];
let currentAccountId = null;
let ws = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadDashboard();
});

// Tab 切换
function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = item.dataset.tab;

            // 更新导航激活状态
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // 切换内容
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tab).classList.add('active');

            // 加载对应数据
            switch (tab) {
                case 'dashboard': loadDashboard(); break;
                case 'contents': loadContents(); break;
                case 'schedules': loadSchedules(); break;
                case 'logs': loadLogs(); break;
                case 'accounts': loadAccounts(); break;
            }
        });
    });
}

// ==================== 仪表盘 ====================

async function loadDashboard() {
    try {
        const { data: stats } = await logsApi.getStats();

        document.getElementById('stat-accounts').textContent = stats.accounts.active;
        document.getElementById('stat-contents').textContent = stats.contents.draft + stats.contents.scheduled;
        document.getElementById('stat-pending').textContent = stats.schedules.pending;
        document.getElementById('stat-today').textContent = stats.today.published;

        // 加载最近日志
        const { data: logs } = await logsApi.getAll(10);
        renderRecentLogs(logs);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function renderRecentLogs(logs) {
    const container = document.getElementById('recent-logs');

    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state"><span>📭</span><p>暂无日志</p></div>';
        return;
    }

    container.innerHTML = logs.map(log => `
    <div class="log-item ${log.status}">
      <div class="log-item-header">
        <span class="log-item-title">${log.content_title || '未知内容'}</span>
        <span class="log-item-time">${formatTime(log.created_at)}</span>
      </div>
      <div class="log-item-message">${log.message || log.status}</div>
    </div>
  `).join('');
}

// ==================== 内容管理 ====================

async function loadContents() {
    try {
        const { data: contents } = await contentsApi.getAll();
        renderContents(contents);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function renderContents(contents) {
    const container = document.getElementById('content-list');

    if (contents.length === 0) {
        container.innerHTML = '<div class="empty-state"><span>📝</span><p>暂无内容，点击右上角创建</p></div>';
        return;
    }

    container.innerHTML = contents.map(content => `
    <div class="list-item">
      <div class="list-item-info">
        <div class="list-item-title">${content.title}</div>
        <div class="list-item-meta">
          <span>${content.type === 'video' ? '🎬 视频' : '📷 图文'}</span>
          <span>${content.media_paths.length} 个文件</span>
          <span class="status status-${content.status}">${getStatusText(content.status)}</span>
        </div>
      </div>
      <div class="list-item-actions">
        ${content.status === 'draft' ? `
          <button class="btn btn-small btn-primary" onclick="scheduleContent(${content.id})">排期发布</button>
        ` : ''}
        <button class="btn btn-small btn-danger" onclick="deleteContent(${content.id})">删除</button>
      </div>
    </div>
  `).join('');
}

function showCreateContent() {
    uploadedFiles = [];
    document.getElementById('create-content-form').reset();
    document.getElementById('preview-list').innerHTML = '';
    openModal('create-content-modal');
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    uploadedFiles = uploadedFiles.concat(files);
    renderPreviews();
}

function renderPreviews() {
    const container = document.getElementById('preview-list');
    container.innerHTML = uploadedFiles.map((file, index) => {
        const url = URL.createObjectURL(file);
        const isVideo = file.type.startsWith('video/');
        return `
      <div class="preview-item">
        ${isVideo
                ? `<video src="${url}" muted></video>`
                : `<img src="${url}" alt="">`
            }
        <button class="remove-btn" onclick="removeFile(${index})">×</button>
      </div>
    `;
    }).join('');
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderPreviews();
}

async function submitContent(event) {
    event.preventDefault();

    if (uploadedFiles.length === 0) {
        showToast('请上传至少一个文件', 'error');
        return;
    }

    try {
        // 上传文件
        const uploadResult = await contentsApi.upload(uploadedFiles);
        if (!uploadResult.success) {
            throw new Error(uploadResult.error);
        }

        // 创建内容
        const form = event.target;
        const formData = new FormData(form);

        const { data } = await contentsApi.create({
            title: formData.get('title'),
            body: formData.get('body'),
            type: formData.get('type'),
            mediaPaths: uploadResult.data.paths,
            tags: formData.get('tags') ? formData.get('tags').split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
            location: formData.get('location'),
        });

        showToast('内容创建成功');
        closeModal('create-content-modal');
        loadContents();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteContent(id) {
    if (!confirm('确定要删除这个内容吗？')) return;

    try {
        await contentsApi.delete(id);
        showToast('删除成功');
        loadContents();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function scheduleContent(contentId) {
    try {
        // 加载账号列表
        const { data: accounts } = await accountsApi.getAll();
        const activeAccounts = accounts.filter(a => a.status === 'active' && a.isLoggedIn);

        if (activeAccounts.length === 0) {
            showToast('请先添加并登录账号', 'error');
            return;
        }

        // 设置表单
        document.getElementById('schedule-content-id').value = contentId;
        document.getElementById('schedule-account-select').innerHTML = activeAccounts.map(a =>
            `<option value="${a.id}">${a.nickname || `账号 ${a.id}`}</option>`
        ).join('');

        // 设置默认时间（5分钟后）
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);

        // 构建本地时间字符串 YYYY-MM-DDTHH:mm
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${year}-${month}-${day}T${hours}:${minutes}`;

        document.querySelector('input[name="scheduledAt"]').value = timeStr;

        openModal('create-schedule-modal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function submitSchedule(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    try {
        await schedulesApi.create({
            contentId: parseInt(formData.get('contentId')),
            accountId: parseInt(formData.get('accountId')),
            scheduledAt: formData.get('scheduledAt'),
        });

        showToast('发布计划创建成功');
        closeModal('create-schedule-modal');
        loadContents();
        loadSchedules();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== 发布计划 ====================

async function loadSchedules() {
    try {
        const { data: schedules } = await schedulesApi.getAll();
        renderSchedules(schedules);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function renderSchedules(schedules) {
    const container = document.getElementById('schedule-list');

    if (schedules.length === 0) {
        container.innerHTML = '<div class="empty-state"><span>📅</span><p>暂无发布计划</p></div>';
        return;
    }

    container.innerHTML = schedules.map(schedule => `
    <div class="list-item">
      <div class="list-item-info">
        <div class="list-item-title">${schedule.content_title || '未知内容'}</div>
        <div class="list-item-meta">
          <span>👤 ${schedule.account_nickname || '未知账号'}</span>
          <span>📅 ${formatTime(schedule.scheduled_at)}</span>
          <span class="status status-${schedule.status}">${getStatusText(schedule.status)}</span>
        </div>
      </div>
      <div class="list-item-actions">
        ${schedule.status === 'pending' ? `
          <button class="btn btn-small btn-success" onclick="runSchedule(${schedule.id})">立即执行</button>
          <button class="btn btn-small btn-danger" onclick="cancelSchedule(${schedule.id})">取消</button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

async function runSchedule(id) {
    try {
        await schedulesApi.run(id);
        showToast('已加入执行队列');
        loadSchedules();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function cancelSchedule(id) {
    if (!confirm('确定要取消这个发布计划吗？')) return;

    try {
        await schedulesApi.delete(id);
        showToast('计划已取消');
        loadSchedules();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== 发布日志 ====================

async function loadLogs() {
    try {
        const { data: logs } = await logsApi.getAll(100);
        renderLogs(logs);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function renderLogs(logs) {
    const container = document.getElementById('log-list');

    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state"><span>📜</span><p>暂无日志</p></div>';
        return;
    }

    container.innerHTML = logs.map(log => `
    <div class="log-item ${log.status}">
      <div class="log-item-header">
        <span class="log-item-title">
          ${log.content_title || '未知内容'} 
          ${log.account_nickname ? `(${log.account_nickname})` : ''}
        </span>
        <span class="log-item-time">${formatTime(log.created_at)}</span>
      </div>
      <div class="log-item-message">
        <span class="status status-${log.status}">${log.status}</span>
        ${log.message || ''}
        ${log.note_url ? `<a href="${log.note_url}" target="_blank">查看笔记</a>` : ''}
      </div>
    </div>
  `).join('');
}

// ==================== 账号管理 ====================

async function loadAccounts() {
    try {
        const { data: accounts } = await accountsApi.getAll();
        renderAccounts(accounts);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function renderAccounts(accounts) {
    const container = document.getElementById('account-list');

    if (accounts.length === 0) {
        container.innerHTML = '<div class="empty-state"><span>👤</span><p>暂无账号，点击右上角添加</p></div>';
        return;
    }

    container.innerHTML = accounts.map(account => `
    <div class="list-item">
      <div class="list-item-info">
        <div class="list-item-title">${account.nickname || `账号 ${account.id}`}</div>
        <div class="list-item-meta">
          <span>今日发布: ${account.daily_count || 0} 条</span>
          <span class="status status-${account.isLoggedIn ? 'active' : 'expired'}">
            ${account.isLoggedIn ? '已登录' : '需要登录'}
          </span>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-small btn-danger" onclick="deleteAccount(${account.id})">删除</button>
      </div>
    </div>
  `).join('');
}

async function startLogin() {
    try {
        openModal('qrcode-modal');
        document.getElementById('qrcode-loading').style.display = 'block';
        document.getElementById('qrcode-image').style.display = 'none';
        document.getElementById('qrcode-status').textContent = '正在生成二维码...';

        const { data } = await accountsApi.login();
        currentAccountId = data.accountId;

        // 建立 WebSocket 连接
        connectWebSocket(currentAccountId);
    } catch (error) {
        showToast(error.message, 'error');
        closeModal('qrcode-modal');
    }
}

function connectWebSocket(accountId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws?accountId=${accountId}`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'qrcode':
                document.getElementById('qrcode-loading').style.display = 'none';
                document.getElementById('qrcode-image').src = data.data;
                document.getElementById('qrcode-image').style.display = 'block';
                document.getElementById('qrcode-status').textContent = '请使用小红书APP扫描二维码';
                break;

            case 'status':
                document.getElementById('qrcode-status').textContent = data.message;
                break;

            case 'login_success':
                showToast('登录成功');
                closeModal('qrcode-modal');
                loadAccounts();
                ws.close();
                break;

            case 'login_failed':
                showToast('登录失败: ' + data.error, 'error');
                closeModal('qrcode-modal');
                ws.close();
                break;
        }
    };

    ws.onerror = () => {
        showToast('WebSocket 连接失败', 'error');
    };
}

async function deleteAccount(id) {
    if (!confirm('确定要删除这个账号吗？')) return;

    try {
        await accountsApi.delete(id);
        showToast('账号已删除');
        loadAccounts();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== 工具函数 ====================

function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getStatusText(status) {
    const statusMap = {
        draft: '草稿',
        scheduled: '已排期',
        published: '已发布',
        pending: '待执行',
        running: '执行中',
        completed: '已完成',
        failed: '失败',
        cancelled: '已取消',
        active: '正常',
        expired: '已过期',
    };
    return statusMap[status] || status;
}
