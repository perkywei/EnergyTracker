# 智慧能耗管家 (Energy Tracker)

车辆能耗记录系统，支持记录加油/充电事件，自动计算油耗、电耗及综合能耗。

## 技术栈

- **后端:** Node.js + Express + SQLite3
- **前端:** 原生 HTML + CSS + JavaScript
- **图表:** Chart.js（离线版）
- **反向代理:** Nginx / OpenResty

## 目录结构

```
energy-tracker/
├── server.js              # 后端服务（Express + SQLite3）
├── package.json           # npm 依赖配置
├── package-lock.json      # 依赖锁定
├── ecosystem.config.js    # PM2 配置（管理员密码设在这里）
├── README.md              # 本文件
├── CHANGELOG.md           # 更新日志
└── public/                # 前端静态文件
    ├── index.html         # 用户主页面
    ├── script.js          # 前端业务逻辑
    ├── style.css          # 毛玻璃主题样式
    ├── mobile.css         # 手机适配样式
    ├── admin.html         # 管理员后台页面
    ├── admin.js           # 管理员后台逻辑
    ├── admin.css          # 管理员后台样式
    ├── chart.umd.min.js   # Chart.js 图表库（离线版）
    └── xlsx.full.min.js   # XLSX 导出库（离线版）
```

## 部署步骤

### 1. 安装 Node.js

要求 Node.js >= 18（推荐 20 LTS）。

```bash
# Debian/Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 验证
node -v
npm -v
```

### 2. 下载源码

```bash
git clone https://github.com/perkywei/EnergyTracker.git
cd EnergyTracker
```

### 3. 安装依赖

```bash
npm install
```

### 4. 设置管理员密码

编辑 `ecosystem.config.js`，把 `ADMIN_PASSWORD` 改成你自己的密码：

```javascript
env: {
  ADMIN_PASSWORD: '***'   // ← 改成你的密码
}
```

管理员后台地址：`https://你的域名/admin.html`

### 5. 配置 Nginx 反向代理（推荐）

将 API 请求转发到 Node.js 后端（默认端口 3000）。

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/EnergyTracker/public;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 禁止访问数据库
    location ~ \.db$ {
        deny all;
    }
}
```

> 开发环境可以直接 `http://localhost:3000` 访问，不需要 Nginx。

### 6. 启动服务

```bash
# 方式一：直接启动
node server.js

# 方式二：推荐 PM2（进程守护 + 自动重启）
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

启动后访问 `http://your-domain.com` 即可。

## 管理后台

| 功能 | 地址 |
|------|------|
| 用户端 | `https://你的域名/` |
| 管理后台 | `https://你的域名/admin.html` |

管理员登录后可在后台生成注册码，新用户注册时需要填写有效注册码。

## 修改密码

### 管理员密码

编辑 `ecosystem.config.js`，修改 `ADMIN_PASSWORD` 的值，然后重启：

```bash
pm2 restart oil-system
```

### 用户密码

用户在个人中心（点击右上角头像）自行修改，需输入原密码。

## 常见问题

**Q: 数据库在哪？**  
A: SQLite 文件 `database.db` 启动后自动创建在项目根目录。

**Q: 如何备份数据？**  
A: 直接复制 `database.db` 文件即可，恢复时覆盖后重启服务。

**Q: 忘记管理员密码？**  
A: 编辑 `ecosystem.config.js` 里的 `ADMIN_PASSWORD`，然后 `pm2 restart oil-system`。

**Q: 如何修改端口号？**  
A: 编辑 `server.js`，修改 `const PORT = 3000;` 这一行，然后重启。
