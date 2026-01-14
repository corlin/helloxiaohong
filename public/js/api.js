/**
 * API 请求封装
 */

const API_BASE = '/api';

async function request(url, options = {}) {
    const response = await fetch(`${API_BASE}${url}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || '请求失败');
    }

    return data;
}

// 账号 API
const accountsApi = {
    getAll: () => request('/accounts'),
    getById: (id) => request(`/accounts/${id}`),
    login: () => request('/accounts/login', { method: 'POST' }),
    delete: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),
    refresh: (id) => request(`/accounts/${id}/refresh`, { method: 'POST' }),
};

// 内容 API
const contentsApi = {
    getAll: (status) => request(`/contents${status ? `?status=${status}` : ''}`),
    getById: (id) => request(`/contents/${id}`),
    create: (data) => request('/contents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/contents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/contents/${id}`, { method: 'DELETE' }),
    upload: async (files) => {
        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }
        const response = await fetch(`${API_BASE}/contents/upload`, {
            method: 'POST',
            body: formData,
        });
        return response.json();
    },
};

// 计划 API
const schedulesApi = {
    getAll: (status) => request(`/schedules${status ? `?status=${status}` : ''}`),
    getById: (id) => request(`/schedules/${id}`),
    create: (data) => request('/schedules', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),
    run: (id) => request(`/schedules/${id}/run`, { method: 'POST' }),
};

// 日志 API
const logsApi = {
    getAll: (limit = 100) => request(`/logs?limit=${limit}`),
    getStats: () => request('/logs/stats'),
};
