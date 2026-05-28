const API_BASE = '/api';
let isLoggedIn = false;

// DOM 元素
const loginContainer = document.getElementById('loginContainer');
const dashboard = document.getElementById('dashboard');
const adminPwd = document.getElementById('adminPwd');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const loginMsg = document.getElementById('loginMsg');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const newCodeDisplay = document.getElementById('newCodeDisplay');
const newCodeSpan = document.getElementById('newCode');
const newCodeExpirySpan = document.getElementById('newCodeExpiry');
const codesTableBody = document.getElementById('codesTableBody');
const usersTableBody = document.getElementById('usersTableBody');
const logoutBtn = document.getElementById('logoutBtn');

// 登录
adminLoginBtn.onclick = async () => {
    const password = adminPwd.value.trim();
    if (!password) {
        loginMsg.innerText = '请输入密码';
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (res.ok) {
            isLoggedIn = true;
            localStorage.setItem('ces_admin_token', data.token);
            loginContainer.style.display = 'none';
            dashboard.style.display = 'block';
            loadCodes();
            loadUsers();
        } else {
            loginMsg.innerText = data.error || '密码错误';
        }
    } catch (err) {
        loginMsg.innerText = '网络错误';
    }
};

const adminPwdInput = document.getElementById('adminPwd');
if (adminPwdInput) {
    adminPwdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            adminLoginBtn.click();
        }
    });
}
// 退出登录
function logout() {
    isLoggedIn = false;
    localStorage.removeItem('ces_admin_token');
    loginContainer.style.display = 'flex';
    dashboard.style.display = 'none';
    adminPwd.value = '';
    loginMsg.innerText = '';
}
logoutBtn.onclick = logout;

// 获取存储的 token
function getAdminToken() {
    return localStorage.getItem('ces_admin_token');
}

// 页面加载时自动恢复登录状态
if (getAdminToken()) {
    isLoggedIn = true;
    loginContainer.style.display = 'none';
    dashboard.style.display = 'block';
    loadCodes();
    loadUsers();
}

// 生成注册码
generateCodeBtn.onclick = async () => {
    try {
        const res = await fetch(`${API_BASE}/admin/generate-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminToken: getAdminToken() })
        });
        const data = await res.json();
        if (res.ok) {
            // 显示成功
            newCodeSpan.innerText = data.code;
            newCodeExpirySpan.innerText = new Date(data.expiresAt).toLocaleString();
            newCodeDisplay.style.display = 'block';
            loadCodes();  // 刷新列表
            setTimeout(() => newCodeDisplay.style.display = 'none', 5000);
        } else {
            alert(data.error || '生成失败');
        }
    } catch (err) {
        console.error(err);
        alert('网络错误：' + err.message);
    }
};

// 加载注册码列表
async function loadCodes() {
    try {
        const res = await fetch(`${API_BASE}/admin/codes`);
        const codes = await res.json();
        if (!Array.isArray(codes)) return;
        if (codes.length === 0) {
            codesTableBody.innerHTML = '<tr><td colspan="4">暂无注册码</td></tr>';
            return;
        }
        let html = '';
        for (let c of codes) {
            const created = new Date(c.created_at).toLocaleString();
            const expires = new Date(c.expires_at).toLocaleString();
            let status = '';
            let statusClass = '';
            if (c.used === 1) {
                status = '已使用';
                statusClass = 'status-used';
            } else {
                const now = Date.now();
                if (now > c.expires_at) {
                    status = '已过期';
                    statusClass = 'status-expired';
                } else {
                    status = '有效';
                    statusClass = 'status-valid';
                }
            }
            html += `<tr>
                <td><code>${c.code}</code></td>
                <td>${created}</td>
                <td>${expires}</td>
                <td class="${statusClass}">${status}</td>
            </tr>`;
        }
        codesTableBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        codesTableBody.innerHTML = '<tr><td colspan="4">加载失败</td></tr>';
    }
}

// 加载用户列表
async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/admin/users`);
        const users = await res.json();
        if (!Array.isArray(users)) return;
        if (users.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="3">暂无用户</td></tr>';
            return;
        }
        let html = '';
        for (let u of users) {
            const regTime = new Date(u.created_at).toLocaleString();
            html += `<tr>
                <td>${escapeHtml(u.username)}</td>
                <td>${regTime}</td>
                <td><button class="delete-user-btn" data-username="${escapeHtml(u.username)}" data-userid="${u.id}">🗑️ 删除</button></td>
            </tr>`;
        }
        usersTableBody.innerHTML = html;
        // 绑定删除事件
        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = btn.dataset.userid;
                const username = btn.dataset.username;
                if (confirm(`确定要删除用户 "${username}" 吗？\n此操作将同时删除该用户的所有车辆配置和能耗记录，不可恢复！`)) {
                    try {
                        const res = await fetch(`${API_BASE}/admin/user/${userId}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ adminToken: getAdminToken() })
                        });
                        const data = await res.json();
                        if (res.ok) {
                            alert('用户已删除');
                            loadUsers(); // 刷新用户列表
                            loadCodes(); // 可选：刷新注册码列表（如果有该用户使用的注册码需要处理，但注册码标记为已用无需改动）
                        } else {
                            alert('删除失败：' + (data.error || '未知错误'));
                        }
                    } catch (err) {
                        alert('网络错误：' + err.message);
                    }
                }
            });
        });
    } catch (err) {
        usersTableBody.innerHTML = '<tr><td colspan="3">加载失败</td></tr>';
    }
}
// 简单的防XSS
function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}