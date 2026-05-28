# 智慧能耗管家 (Energy Tracker)

车辆能耗记录系统，支持记录加油/充电事件，自动计算油耗、电耗及综合能耗。

## 技术栈

- **后端:** Node.js + Express + SQLite3
- **前端:** 原生 HTML + CSS + JavaScript
- **图表:** Chart.js
- **反向代理:** Nginx / OpenResty

## 目录结构

```
energy-tracker/
├── server.js          # 后端服务（Express + SQLite）
├── package.json       # 依赖配置
├── database.db        # SQLite 数据库（自动创建）
└── public/            # 前端静态文件
    ├── index.html     # 用户主页面（登录/注册/记录）
    ├── admin.html     # 管理员页面
    ├── admin.js       # 管理员页面逻辑
    ├── admin.css      # 管理员页面样式
    ├── script.js      # 用户端逻辑
    ├── style.css      # 用户端样式
    └── user-guide.md  # 用户使用说明
```

## 部署步骤

### 1. 安装 Node.js

要求 Node.js >= 16。

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

### 4. 配置 Nginx 反向代理（推荐）

将 API 请求转发到 Node.js 后端（默认端口 3000）。

Nginx 配置示例：

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
}
```

> 也可以直接通过 `http://localhost:3000` 访问（开发环境），此时不需要 Nginx。

### 5. 启动服务

```bash
# 直接启动
node server.js

# 推荐使用 PM2（进程守护 + 开机自启）
npm install -g pm2
pm2 start server.js --name energy-tracker
pm2 save
pm2 startup
```

启动后访问 `http://your-domain.com` 即可。

## 管理员密码修改

管理员密码在 `server.js` 中定义，只有一个地方：

```javascript
// 搜索这一行
const ADMIN_PASSWORD = 'Admin@123';
```

改成你想要的密码后重启服务即可：

```bash
pm2 restart energy-tracker
```

无需修改任何其他文件。

## 生成注册码

管理员登录后可在 `/admin.html` 页面生成注册码，新用户注册时需要填写有效的注册码。

## 常见问题

**Q: 数据库在哪？**  
A: SQLite 数据库文件 `database.db` 会在启动时自动创建在项目根目录。

**Q: 如何备份数据？**  
A: 直接备份 `database.db` 文件即可。

**Q: 忘记管理员密码？**  
A: 直接编辑 `server.js`，修改 `ADMIN_PASSWORD` 的值，然后重启服务。

**Q: 如何修改端口号？**  
A: 编辑 `server.js`，修改 `PORT` 变量的值（默认 3000）。
