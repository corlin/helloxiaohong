/**
 * HelloXiaohong - Frontend Application
 */

// Global State
let uploadedFiles = [];
let existingMediaPaths = []; // For editing: stores paths of already uploaded files
let currentEditingId = null; // For editing: stores ID of content being edited
let currentAccountId = null;
let ws = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadDashboard();
    setupUploadArea();
});

function setupUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('media-input');

    if (!uploadArea || !fileInput) return;

    // Handle click
    uploadArea.addEventListener('click', (e) => {
        // Prevent recursive triggering if clicking on input itself (though it's hidden)
        // or if clicking remove button in preview
        if (e.target !== fileInput && !e.target.closest('.remove-btn')) {
            fileInput.click();
        }
    });

    // Handle drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        uploadArea.classList.add('highlight-drag');
        uploadArea.style.borderColor = 'var(--primary)';
        uploadArea.style.background = 'rgba(255, 36, 66, 0.1)';
    }

    function unhighlight(e) {
        uploadArea.classList.remove('highlight-drag');
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
    }

    uploadArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        const newFiles = Array.from(files).filter(file =>
            file.type.startsWith('image/') || file.type.startsWith('video/')
        );

        if (newFiles.length === 0 && files.length > 0) {
            showToast('仅支持图片和视频文件', 'error');
            return;
        }

        uploadedFiles = uploadedFiles.concat(newFiles);
        renderPreviews();
    }
}

// Tab Switching
function initTabs() {
    const navItems = document.querySelectorAll('.nav-item, [data-tab-trigger]');

    // Handle nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.dataset.tab);
        });
    });

    // Handle extra triggers (like "View All" buttons)
    document.querySelectorAll('[data-tab-trigger]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(trigger.dataset.tabTrigger);
        });
    });
}

function switchTab(tabId) {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(i => {
        if (i.dataset.tab === tabId) {
            i.classList.add('active');
        } else {
            i.classList.remove('active');
        }
    });

    // Switch content with simple fade
    document.querySelectorAll('.tab-content').forEach(c => {
        c.style.opacity = '0';
        setTimeout(() => {
            c.classList.remove('active');
            if (c.id === tabId) {
                c.classList.add('active');
                requestAnimationFrame(() => {
                    c.style.opacity = '1';
                });
            }
        }, 200);
    });

    // Make active immediately for better responsiveness (CSS transition handles opacity)
    document.getElementById(tabId).classList.add('active');

    // Load data
    switch (tabId) {
        case 'dashboard': loadDashboard(); break;
        case 'contents': loadContents(); break;
        case 'schedules': loadSchedules(); break;
        case 'logs': loadLogs(); break;
        case 'accounts': loadAccounts(); break;
    }
}

// ==================== Dashboard ====================

async function refreshDashboard() {
    const btn = document.querySelector('.btn-icon i');
    btn.classList.add('time-spin'); // Add a spinning animation class if you have one, or just rotate
    btn.style.transition = 'transform 1s';
    btn.style.transform = 'rotate(360deg)';

    await loadDashboard();

    setTimeout(() => {
        btn.style.transform = 'rotate(0deg)';
    }, 1000);
}

async function loadDashboard() {
    try {
        const { data: stats } = await logsApi.getStats();

        animateCountUp('stat-accounts', stats.accounts.active || 0);
        animateCountUp('stat-contents', (stats.contents.draft || 0) + (stats.contents.scheduled || 0));
        animateCountUp('stat-pending', stats.schedules.pending || 0);
        animateCountUp('stat-today', stats.today.published || 0);

        // Load recent logs
        const { data: logs } = await logsApi.getAll(5);
        renderRecentLogs(logs);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function animateCountUp(elementId, target) {
    const element = document.getElementById(elementId);
    const start = parseInt(element.innerText) || 0;
    const duration = 1000;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out quart
        const ease = 1 - Math.pow(1 - progress, 4);

        const current = Math.floor(start + (target - start) * ease);
        element.innerText = current;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.innerText = target;
        }
    }

    requestAnimationFrame(update);
}

function renderRecentLogs(logs) {
    const container = document.getElementById('recent-logs');

    if (logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; color: var(--text-secondary); padding: 20px;">
                <i class="ph ph-inbox" style="font-size: 32px; margin-bottom: 8px;"></i>
                <p>暂无日志</p>
            </div>`;
        return;
    }

    container.innerHTML = logs.map(log => {
        let icon = 'ph-info';
        if (log.status === 'success') icon = 'ph-check-circle';
        if (log.status === 'failed') icon = 'ph-warning-circle';

        return `
        <div class="log-item ${log.status}">
            <div class="log-item-header">
                <i class="ph ${icon}" style="margin-right: 12px; font-size: 18px; color: var(--${log.status === 'failed' ? 'error' : 'success'})"></i>
                <div class="log-item-content">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="log-item-title">${log.content_title || '未知内容'}</span>
                        <span class="log-item-time">${formatTime(log.created_at)}</span>
                    </div>
                    <div class="log-item-message" style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                        ${log.message || log.status}
                    </div>
                </div>
            </div>
        </div>
    `}).join('');
}

// ==================== Content Management ====================

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
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="ph ph-files" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>暂无内容，点击右上角创建</p>
            </div>`;
        return;
    }

    container.innerHTML = contents.map(content => `
    <div class="list-item slide-in">
      <div class="list-item-info">
        <div class="list-item-title">${content.title}</div>
        <div class="list-item-meta">
          <span style="display: flex; align-items: center; gap: 4px;">
            <i class="ph ${content.type === 'video' ? 'ph-film-strip' : 'ph-image'}"></i>
            ${content.type === 'video' ? '视频' : '图文'}
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <i class="ph ph-stack"></i>
            ${content.media_paths.length} 个文件
          </span>
          <span class="status status-${content.status}">${getStatusText(content.status)}</span>
        </div>
      </div>
      <div class="list-item-actions">
        ${['draft', 'scheduled', 'failed'].includes(content.status) ? `
          <button class="btn btn-small btn-primary" onclick="editContent(${content.id})" title="编辑">
            <i class="ph ph-pencil-simple"></i>
          </button>
        ` : ''}
        ${content.status === 'draft' ? `
          <button class="btn btn-small btn-success" onclick="scheduleContent(${content.id})" title="发布排期">
            <i class="ph ph-calendar-plus"></i> 排期
          </button>
        ` : ''}
        <button class="btn btn-small btn-danger" onclick="deleteContent(${content.id})">
            <i class="ph ph-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function showCreateContent() {
    uploadedFiles = [];
    existingMediaPaths = [];
    currentEditingId = null;
    document.getElementById('modal-title').textContent = '创建内容';
    document.getElementById('create-content-form').reset();
    document.getElementById('preview-list').innerHTML = '';
    openModal('create-content-modal');
}

async function editContent(id) {
    try {
        const { data: content } = await contentsApi.getById(id);

        currentEditingId = id;
        uploadedFiles = [];
        existingMediaPaths = content.media_paths || [];

        // Populate form
        const form = document.getElementById('create-content-form');
        form.querySelector('[name="title"]').value = content.title;
        form.querySelector('[name="body"]').value = content.body || '';
        form.querySelector('[name="type"]').value = content.type;
        form.querySelector('[name="tags"]').value = (content.tags || []).join(', ');
        form.querySelector('[name="location"]').value = content.location || '';

        document.getElementById('modal-title').textContent = '编辑内容';
        renderPreviews();
        openModal('create-content-modal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    uploadedFiles = uploadedFiles.concat(files);
    renderPreviews();
}

function renderPreviews() {
    const container = document.getElementById('preview-list');

    // Check if we have any files (uploaded or existing)
    if (uploadedFiles.length === 0 && existingMediaPaths.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Render existing files
    if (existingMediaPaths.length > 0) {
        html += existingMediaPaths.map((path, index) => {
            // Assume uploads/ prefix if relative, or construct full URL
            // Since we serve uploads static folder, assume /uploads/filename
            const url = path.startsWith('http') ? path : `/uploads/${path.split('/').pop()}`;
            // Simple heuristic for video based on extension, or we need type from DB. 
            // DB doesn't store per-file type easily, but we know content type.
            // Let's assume common extensions.
            const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(path);

            return `
              <div class="preview-item existing-file">
                ${isVideo
                    ? `<video src="${url}" muted></video>`
                    : `<img src="${url}" alt="">`
                }
                <div class="existing-badge">已上传</div>
                <button class="remove-btn" onclick="removeExistingFile(${index})"><i class="ph ph-x"></i></button>
              </div>
            `;
        }).join('');
    }

    // Render new uploaded files
    if (uploadedFiles.length > 0) {
        html += uploadedFiles.map((file, index) => {
            const url = URL.createObjectURL(file);
            const isVideo = file.type.startsWith('video/');
            return `
          <div class="preview-item">
            ${isVideo
                    ? `<video src="${url}" muted></video>`
                    : `<img src="${url}" alt="">`
                }
            <button class="remove-btn" onclick="removeFile(${index})"><i class="ph ph-x"></i></button>
          </div>
        `;
        }).join('');
    }

    container.innerHTML = html;
}

function removeExistingFile(index) {
    existingMediaPaths.splice(index, 1);
    renderPreviews();
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderPreviews();
}

async function submitContent(event) {
    event.preventDefault();

    if (uploadedFiles.length === 0 && existingMediaPaths.length === 0) {
        showToast('请上传至少一个文件', 'error');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ph ph-spinner spinner-icon"></i> 保存中...';

    try {
        // Upload new files if any
        let newMediaPaths = [];
        if (uploadedFiles.length > 0) {
            const uploadResult = await contentsApi.upload(uploadedFiles);
            if (!uploadResult.success) {
                throw new Error(uploadResult.error);
            }
            newMediaPaths = uploadResult.data.paths;
        }

        // Combine existing and new paths
        const finalMediaPaths = [...existingMediaPaths, ...newMediaPaths];

        // Create or Update content
        const form = event.target;
        const formData = new FormData(form);
        const contentData = {
            title: formData.get('title'),
            body: formData.get('body'),
            type: formData.get('type'),
            mediaPaths: finalMediaPaths,
            tags: formData.get('tags') ? formData.get('tags').split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
            location: formData.get('location'),
        };

        if (currentEditingId) {
            await contentsApi.update(currentEditingId, contentData);
            showToast('内容更新成功');
        } else {
            await contentsApi.create(contentData);
            showToast('内容创建成功');
        }

        closeModal('create-content-modal');
        loadContents();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
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
        const { data: accounts } = await accountsApi.getAll();
        const activeAccounts = accounts.filter(a => a.status === 'active' && a.isLoggedIn);

        if (activeAccounts.length === 0) {
            showToast('请先添加并登录账号', 'error');
            return;
        }

        document.getElementById('schedule-content-id').value = contentId;
        document.getElementById('schedule-account-select').innerHTML = activeAccounts.map(a =>
            `<option value="${a.id}">${a.nickname || `账号 ${a.id}`}</option>`
        ).join('');

        // Default time: 5 minutes later
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);

        // Format for datetime-local: YYYY-MM-DDTHH:mm
        // Note: This needs to be local time
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
    const rescheduleId = document.getElementById('create-schedule-modal').dataset.rescheduleId;

    try {
        if (rescheduleId) {
            // Update existing schedule
            await schedulesApi.update(rescheduleId, {
                scheduledAt: formData.get('scheduledAt'),
                status: 'pending', // Reset status to pending
                errorMessage: null,
                retryCount: 0
            });
            showToast('计划已重新排期');
        } else {
            // Create new schedule
            await schedulesApi.create({
                contentId: parseInt(formData.get('contentId')),
                accountId: parseInt(formData.get('accountId')),
                scheduledAt: formData.get('scheduledAt'),
            });
            showToast('发布计划创建成功');
        }

        closeModal('create-schedule-modal');
        // Clear dataset
        delete document.getElementById('create-schedule-modal').dataset.rescheduleId;

        loadContents();
        loadSchedules();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ==================== Schedules ====================

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
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="ph ph-calendar-blank" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>暂无发布计划</p>
            </div>`;
        return;
    }

    container.innerHTML = schedules.map(schedule => `
    <div class="list-item slide-in">
      <div class="list-item-info">
        <div class="list-item-title">${schedule.content_title || '未知内容'}</div>
        <div class="list-item-meta">
          <span style="display: flex; align-items: center; gap: 4px;">
            <i class="ph ph-user-circle"></i>
            ${schedule.account_nickname || '未知账号'}
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <i class="ph ph-clock"></i>
            ${formatTime(schedule.scheduled_at)}
          </span>
          <span class="status status-${schedule.status}">${getStatusText(schedule.status)}</span>
        </div>
      </div>
      <div class="list-item-actions">
        ${schedule.status === 'pending' ? `
          <button class="btn btn-small btn-success" onclick="runSchedule(${schedule.id})">
            <i class="ph ph-play"></i> 执行
          </button>
          <button class="btn btn-small btn-danger" onclick="cancelSchedule(${schedule.id})">
            <i class="ph ph-x"></i> 取消
          </button>
        ` : ''}
        ${schedule.status === 'failed' || schedule.status === 'cancelled' ? `
          <button class="btn btn-small btn-primary" onclick="retrySchedule(${schedule.id})">
            <i class="ph ph-arrow-clockwise"></i> 重试
          </button>
          <button class="btn btn-small btn-default" onclick="reschedule(${schedule.id})">
            <i class="ph ph-calendar"></i> 改期
          </button>
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

async function retrySchedule(id) {
    try {
        await schedulesApi.retry(id);
        showToast('已加入重试队列');
        loadSchedules();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function reschedule(id) {
    try {
        const { data: schedule } = await schedulesApi.getById(id);
        // Reuse schedule modal helper, but we need to pre-fill content and ideally "update" the schedule instead of creating new
        // Ideally we should have `editSchedule` but for now let's just create new one or update existing if API supports it.
        // Our backend API currently: PUT /schedules/:id supports updating scheduledAt and status.

        // Let's implement a specific flow for rescheduling
        document.getElementById('schedule-content-id').value = schedule.content_id;

        // Fetch accounts to populate select
        const { data: accounts } = await accountsApi.getAll();
        const activeAccounts = accounts.filter(a => a.status === 'active' && a.isLoggedIn);
        document.getElementById('schedule-account-select').innerHTML = activeAccounts.map(a =>
            `<option value="${a.id}" ${a.id === schedule.account_id ? 'selected' : ''}>${a.nickname || `账号 ${a.id}`}</option>`
        ).join('');

        // Set time to now + 5 min default, or original + 1 hour? Let's do now + 5 min
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);
        const timeStr = formatDateTimeForInput(now);
        document.querySelector('input[name="scheduledAt"]').value = timeStr;

        // Store the schedule ID we are rescheduling so we can UPDATE instead of CREATE
        document.getElementById('create-schedule-modal').dataset.rescheduleId = id;

        openModal('create-schedule-modal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Helper for datetime input
function formatDateTimeForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ==================== Logs ====================

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
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="ph ph-scroll" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>暂无日志</p>
            </div>`;
        return;
    }

    container.innerHTML = logs.map(log => `
    <div class="log-item ${log.status} slide-in">
      <div class="log-item-header">
        <span class="log-item-title">
          ${log.content_title || '未知内容'} 
          <span style="font-weight: normal; font-size: 12px; color: var(--text-secondary); margin-left: 8px;">
            ${log.account_nickname ? `<i class="ph ph-user"></i> ${log.account_nickname}` : ''}
          </span>
        </span>
        <span class="log-item-time">${formatTime(log.created_at)}</span>
      </div>
      <div class="log-item-message" style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
        <span style="color: var(--text-secondary); font-size: 13px;">
            <span class="status status-${log.status}" style="margin-right: 8px;">${log.status}</span>
            ${log.message || ''}
        </span>
        ${log.note_url ? `<a href="${log.note_url}" target="_blank" class="btn btn-small btn-primary" style="text-decoration: none;"><i class="ph ph-arrow-square-out"></i> 查看笔记</a>` : ''}
      </div>
    </div>
  `).join('');
}

// ==================== Accounts ====================

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
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="ph ph-users" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>暂无账号，点击右上角添加</p>
            </div>`;
        return;
    }

    container.innerHTML = accounts.map(account => `
    <div class="list-item slide-in">
      <div class="list-item-info">
        <div class="list-item-title">${account.nickname || `账号 ${account.id}`}</div>
        <div class="list-item-meta">
          <span><i class="ph ph-check-circle"></i> 今日发布: ${account.daily_count || 0} 条</span>
          <span class="status status-${account.isLoggedIn ? 'active' : 'expired'}">
            ${account.isLoggedIn ? '已登录' : '需要登录'}
          </span>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-small btn-danger" onclick="deleteAccount(${account.id})">
            <i class="ph ph-trash"></i> 删除
        </button>
      </div>
    </div>
  `).join('');
}

async function startLogin() {
    try {
        openModal('qrcode-modal');
        const loading = document.getElementById('qrcode-loading');
        const img = document.getElementById('qrcode-image');
        loading.style.display = 'block';
        img.style.display = 'none';
        document.getElementById('qrcode-status').textContent = '正在生成二维码...';

        const { data } = await accountsApi.login();
        currentAccountId = data.accountId;

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
                const img = document.getElementById('qrcode-image');
                img.src = data.data;
                img.style.display = 'block';
                img.classList.add('scale-in');
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

// ==================== Utilities ====================

function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('show');
    // Animate child modal
    const content = modal.querySelector('.modal');
    content.classList.remove('scale-in');
    void content.offsetWidth; // trigger reflow
    content.classList.add('scale-in');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ph-check-circle';
    if (type === 'error') icon = 'ph-warning-circle';

    toast.innerHTML = `
        <i class="ph ${icon}" style="font-size: 20px; color: var(--${type})"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatTime(dateStr) {
    if (!dateStr) return '';

    let date;
    // SQLite CAUTION: DEFAULT CURRENT_TIMESTAMP creates strings like "2023-01-01 12:00:00" (UTC)
    // Browsers often treat this as Local Time if 'Z' is missing.
    // We must force it to be treated as UTC.
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
        date = new Date(dateStr.replace(' ', 'T') + 'Z');
    } else {
        date = new Date(dateStr);
    }

    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
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
