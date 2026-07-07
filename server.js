const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;

// 信任反向代理（nginx），确保限流使用真实 IP
app.set('trust proxy', 1);

// ==================== 会话存储 ====================
const userSessions = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [token, session] of userSessions) {
        if (now - session.createdAt > SESSION_TIMEOUT) userSessions.delete(token);
    }
}, 60 * 60 * 1000);

// ==================== 安全防护 ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.sheetjs.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: true
}));

app.use(cors({
    origin: ['https://oil.perkywei.xyz', 'http://oil.perkywei.xyz', 'https://m.oil.perkywei.xyz', 'http://m.oil.perkywei.xyz'],
    credentials: true
}));

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: '登录/注册尝试过多，请稍后再试' }
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/admin/login', authLimiter);

// ==================== 数据库 ====================
const DB_PATH = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH);
console.log('数据库路径:', DB_PATH);

db.get("SELECT 1", (err) => {
    if (err) console.error('数据库连接失败:', err.message);
    else console.log('数据库连接成功');
});

// ==================== 数据库迁移 ====================
db.all("PRAGMA table_info(energy_records)", (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'energy_added')) {
        db.run("ALTER TABLE energy_records ADD COLUMN energy_added REAL", (e) => {
            if (e) console.error('迁移 energy_added 失败:', e.message);
            else console.log('已添加 energy_added 列');
        });
    }
});

db.all("PRAGMA table_info(energy_records)", (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'deleted')) {
        db.run("ALTER TABLE energy_records ADD COLUMN deleted INTEGER DEFAULT 0", (e) => {
            if (e) console.error('迁移 deleted 失败:', e.message);
            else console.log('已添加 deleted 列');
        });
    }
});

// 迁移 vehicle_type
db.all("PRAGMA table_info(vehicle_config)", (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'vehicle_type')) {
        db.run("ALTER TABLE vehicle_config ADD COLUMN vehicle_type TEXT DEFAULT 'erev_phev'", (e) => {
            if (e) console.error('迁移 vehicle_type 失败:', e.message);
            else console.log('已添加 vehicle_type 列');
        });
    }
});

db.run('CREATE TABLE IF NOT EXISTS operation_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT, created_at INTEGER NOT NULL, backup_file TEXT)', (e) => {
    if (e) console.error('创建操作日志表失败:', e.message);
    else console.log('操作日志表就绪');
});

db.all("PRAGMA table_info(operation_logs)", (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'backup_file')) {
        db.run("ALTER TABLE operation_logs ADD COLUMN backup_file TEXT", (e) => {
            if (e) console.error('迁移 backup_file 列失败:', e.message);
            else console.log('已添加 backup_file 列');
        });
    }
});

const userInputsSql = 'CREATE TABLE IF NOT EXISTS user_inputs (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT, total_mileage REAL, hev_mileage REAL, amount_money REAL, fuel_percent_before REAL, charge_percent_before REAL, fuel_percent_after REAL, charge_percent_after REAL, energy_added REAL, created_at INTEGER NOT NULL)';
db.run(userInputsSql, (e) => {
    if (e) console.error('创建 user_inputs 表失败:', e.message);
    else console.log('user_inputs 表就绪');
});

// ==================== 辅助函数 ====================
function logOperation(userId, action, target, detail, ip, backupFile) {
    db.run('INSERT INTO operation_logs (user_id, action, target, detail, ip, created_at, backup_file) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId || 'system', action, target || '', detail || '', ip || '', Date.now(), backupFile || ''],
        (e) => { if (e) console.error('记录操作日志失败:', e.message); });
}

function dbError(res, err) {
    console.error('DB Error:', err.message);
    return res.status(500).json({ error: '服务器内部错误' });
}

function backupDb(action, userId) {
    try {
        if (!fs.existsSync(path.join(__dirname, 'backups', 'pre-op'))) {
            fs.mkdirSync(path.join(__dirname, 'backups', 'pre-op'), { recursive: true });
        }
        const now = new Date();
        const ts = now.getFullYear() +
            String(now.getMonth()+1).padStart(2,'0') +
            String(now.getDate()).padStart(2,'0') + '-' +
            String(now.getHours()).padStart(2,'0') +
            String(now.getMinutes()).padStart(2,'0') +
            String(now.getSeconds()).padStart(2,'0');
        const user = (userId || 'system').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 16);
        const op = (action || 'op').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 16);
        const filename = `preop-${ts}-${user}-${op}.db`;
        const dest = path.join(__dirname, 'backups', 'pre-op', filename);
        fs.copyFileSync(DB_PATH, dest);
        return filename;
    } catch (e) {
        console.error('备份数据库失败:', e.message);
        return null;
    }
}

// 自动备份中间件：在写操作前自动备份
function autoBackup(action) {
    return (req, res, next) => {
        const userId = req.authUserId || req.body?.userId || req.params?.userId || 'system';
        const backupFile = backupDb(action, userId);
        req._backupFile = backupFile;
        next();
    };
}

app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static('public', {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store');
    }
}));

// ==================== 初始化数据库表 ====================

// ==================== HTTP 请求日志 ====================
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (req.path.startsWith("/api/config") || req.path.startsWith("/api/login")) {
            const auth = req.headers.authorization ? "token✓" : "no-token";
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} ${duration}ms auth=${auth}`);
        }
    });
    next();
});

db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS vehicle_config (user_id TEXT PRIMARY KEY, total_fuel_capacity REAL, total_elec_capacity REAL, init_total_mileage REAL, init_hev_mileage REAL, init_fuel_percent REAL, init_charge_percent REAL, fuel_level_actual REAL, charge_level_actual REAL, vehicle_type TEXT DEFAULT "erev_phev", updated_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id))');
    db.run('CREATE TABLE IF NOT EXISTS energy_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT, timestamp INTEGER, total_mileage REAL, hev_mileage REAL, amount_money REAL, fuel_percent_before REAL, charge_percent_before REAL, fuel_percent_after REAL, charge_percent_after REAL, fuel_before_actual REAL, charge_before_actual REAL, fuel_after_actual REAL, charge_after_actual REAL, fuel_consumption REAL, elec_consumption REAL, total_consumption REAL, FOREIGN KEY(user_id) REFERENCES users(id))');
    db.run('CREATE TABLE IF NOT EXISTS license_codes (code TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER, used INTEGER DEFAULT 0)');
    db.run('CREATE TABLE IF NOT EXISTS vehicles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT DEFAULT \'\', vehicle_type TEXT DEFAULT \'erev_phev\', total_fuel_capacity REAL DEFAULT 0, total_elec_capacity REAL DEFAULT 0, init_total_mileage REAL DEFAULT 0, init_hev_mileage REAL DEFAULT 0, init_fuel_percent REAL DEFAULT 0, init_charge_percent REAL DEFAULT 0, fuel_level_actual REAL DEFAULT 0, charge_level_actual REAL DEFAULT 0, created_at INTEGER, FOREIGN KEY(user_id) REFERENCES users(id))', (e) => {
        if (e) console.error('创建 vehicles 表失败:', e.message);
        else console.log('vehicles 表就绪');
    });
});

db.all("PRAGMA table_info(energy_records)", (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'vehicle_id')) {
        db.run("ALTER TABLE energy_records ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id)", (e) => {
            if (e) console.error('迁移 vehicle_id 失败:', e.message);
            else console.log('已添加 vehicle_id 列');
        });
    }
});

function generateLicenseCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function isValidLicenseCode(code, callback) {
    db.get('SELECT * FROM license_codes WHERE code = ? AND used = 0', [code], (err, row) => {
        if (err) { console.error('验证注册码 DB 错误:', err.message); return callback(false); }
        if (!row) return callback(false);
        if (Date.now() > row.expires_at) return callback(false);
        callback(true, row.code);
    });
}

function markLicenseUsed(code) {
    return new Promise((resolve, reject) => {
        const backupFile = backupDb('mark_license_used', 'system');
        logOperation('system', 'mark_license_used', 'license_code', 'code=' + code, '', backupFile);
        db.run('UPDATE license_codes SET used = 1 WHERE code = ?', [code], (err) => {
            if (err) { console.error('标记注册码使用失败:', err.message); reject(err); }
            else resolve();
        });
    });
}

// ==================== 认证中间件 ====================
function requireAuth(req, res, next) {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : req.body?.token;
    if (!token) return res.status(401).json({ error: '请先登录' });
    const session = userSessions.get(token);
    if (!session) return res.status(401).json({ error: '登录已过期，请重新登录' });
    if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
        userSessions.delete(token);
        return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    session.createdAt = Date.now();
    req.authUserId = session.userId;
    req.authUsername = session.username;
    next();
}

function requireOwnership(req, res, next) {
    const targetUserId = req.params.userId || req.body.userId;
    if (!targetUserId) return res.status(400).json({ error: '缺少用户标识' });
    if (req.authUserId !== targetUserId) return res.status(403).json({ error: '无权访问该用户数据' });
    next();
}

// ==================== 用户注册 ====================
app.post('/api/register', async (req, res) => {
    const { username, password, vehicle, licenseCode } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (password.length < 8) return res.status(400).json({ error: '密码至少8位' });
    if (username.length < 2 || username.length > 30) return res.status(400).json({ error: '用户名需2-30个字符' });
    if (!licenseCode) return res.status(400).json({ error: '请填写注册码' });

    isValidLicenseCode(licenseCode, async (valid, validCode) => {
        if (!valid) return res.status(400).json({ error: '注册码无效或已过期' });

        const { totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
                initFuelPercent, initChargePercent, vehicleType } = vehicle || {};
        const vtype = vehicleType || 'erev_phev';
        const isBEV = vtype === 'bev';
        const isICE = vtype === 'ice';
        const needsFuel = (vtype === 'erev_phev' || isICE);
        const needsElec = (vtype === 'erev_phev' || isBEV);
        if (initTotalMileage === undefined || initTotalMileage <= 0) {
            return res.status(400).json({ error: '总里程必须>0' });
        }
        if (needsFuel) {
            if (!totalFuelCapacity || totalFuelCapacity <= 0) return res.status(400).json({ error: '油箱容量必须>0' });
            if (!isICE && (initHevMileage === undefined || initHevMileage < 0 || initHevMileage > initTotalMileage)) return res.status(400).json({ error: 'HEV里程无效' });
            if (initFuelPercent === undefined || initFuelPercent < 0 || initFuelPercent > 100) return res.status(400).json({ error: '油量百分比0~100' });
        }
        if (needsElec) {
            if (!totalElecCapacity || totalElecCapacity <= 0) return res.status(400).json({ error: '电池容量必须>0' });
            if (initChargePercent === undefined || initChargePercent < 0 || initChargePercent > 100) return res.status(400).json({ error: '电量百分比0~100' });
        }

        const backupFile = backupDb('register', username);
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const now = Date.now();

        db.run('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
            [userId, username, hashedPassword, now], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '用户名已存在' });
                    return dbError(res, err);
                }
                const needsFuel = (vtype === 'erev_phev' || isICE);
                const needsElec = (vtype === 'erev_phev' || isBEV);
                const fuelLevelActual = needsFuel ? (initFuelPercent / 100) * totalFuelCapacity : 0;
                const chargeLevelActual = needsElec ? (initChargePercent / 100) * totalElecCapacity : 0;
                db.run('INSERT INTO vehicle_config (user_id, total_fuel_capacity, total_elec_capacity, init_total_mileage, init_hev_mileage, init_fuel_percent, init_charge_percent, fuel_level_actual, charge_level_actual, vehicle_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [userId, needsFuel ? totalFuelCapacity : 0, needsElec ? totalElecCapacity : 0, initTotalMileage, isBEV ? 0 : initHevMileage,
                     needsFuel ? initFuelPercent : 0, needsElec ? initChargePercent : 0, fuelLevelActual, chargeLevelActual, vtype, now],
                    (err2) => {
                        if (err2) return dbError(res, err2);
                        markLicenseUsed(licenseCode).catch(e => console.error(e));
                        logOperation('system', 'register', 'user', 'username=' + username + ', id=' + userId, req.ip, backupFile);
                        const token = uuidv4();
                        userSessions.set(token, { userId, username, createdAt: Date.now() });
                        res.json({ success: true, userId, username, token });
                    });
            });
    });
});

// ==================== 用户登录 ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return dbError(res, err);
        if (!user) return res.status(401).json({ error: '用户名或密码错误' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: '用户名或密码错误' });
        const token = uuidv4();
        userSessions.set(token, { userId: user.id, username: user.username, createdAt: Date.now() });
        res.json({ success: true, userId: user.id, username: user.username, token });
    });
});

// ==================== 退出登录 ====================
app.post('/api/logout', requireAuth, (req, res) => {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : req.body?.token;
    userSessions.delete(token);
    res.json({ success: true });
});

// ==================== 修改密码 ====================
app.post('/api/change-password', requireAuth, requireOwnership, async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: '缺少必要参数' });
    if (newPassword.length < 8) return res.status(400).json({ error: '新密码至少8位' });
    const backupFile = backupDb('change_password', userId);
    db.get('SELECT password_hash FROM users WHERE id = ?', [userId], async (err, row) => {
        if (err) return dbError(res, err);
        if (!row) return res.status(404).json({ error: '用户不存在' });
        const match = await bcrypt.compare(oldPassword, row.password_hash);
        if (!match) return res.status(401).json({ error: '原密码错误' });
        const newHash = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId], (err2) => {
            if (err2) return dbError(res, err2);
            logOperation(userId, 'change_password', 'user', 'userId=' + userId, req.ip, backupFile);
            res.json({ success: true });
        });
    });
});

// ==================== 车辆配置 ====================
app.get('/api/config/:userId', requireAuth, requireOwnership, (req, res) => {
    const { userId } = req.params;
    const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId) : null;
    const sql = vehicleId
        ? 'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
        : 'SELECT * FROM vehicle_config WHERE user_id = ?';
    const params = vehicleId ? [vehicleId, userId] : [userId];
    db.get(sql, params, (err, row) => {
        if (err) return dbError(res, err);
        res.json(row || null);
    });
});

app.post('/api/config', requireAuth, autoBackup('save_config'), (req, res) => {
    const { userId, config } = req.body;
    if (req.authUserId !== userId) return res.status(403).json({ error: '无权修改该用户配置' });
    const { totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
            initFuelPercent, initChargePercent, fuelLevelActual, chargeLevelActual,
            vehicleType } = config;
    const vtype = vehicleType || 'erev_phev';
    const now = Date.now();
    db.run('INSERT OR REPLACE INTO vehicle_config (user_id, total_fuel_capacity, total_elec_capacity, init_total_mileage, init_hev_mileage, init_fuel_percent, init_charge_percent, fuel_level_actual, charge_level_actual, vehicle_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
         initFuelPercent, initChargePercent, fuelLevelActual, chargeLevelActual, vtype, now],
        (err) => {
            if (err) return dbError(res, err);
            logOperation(userId, 'update_config', 'vehicle_config', 'userId=' + userId, req.ip, req._backupFile);
            res.json({ success: true });
        });
});

// ==================== 能耗记录管理 ====================
app.get('/api/records/:userId', requireAuth, requireOwnership, (req, res) => {
    const userId = req.params.userId;
    const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId) : null;
    // 根据 vehicleId 获取车辆配置
    let configSql, configParams;
    if (vehicleId) {
        configSql = 'SELECT * FROM vehicles WHERE id = ? AND user_id = ?';
        configParams = [vehicleId, userId];
    } else {
        configSql = 'SELECT * FROM vehicle_config WHERE user_id = ?';
        configParams = [userId];
    }
    db.get(configSql, configParams, (err, config) => {
        if (err) return dbError(res, err);
        let recordsSql, recordsParams;
        if (vehicleId) {
            recordsSql = 'SELECT *, energy_added FROM energy_records WHERE user_id = ? AND vehicle_id = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY timestamp ASC';
            recordsParams = [userId, vehicleId];
        } else {
            recordsSql = 'SELECT *, energy_added FROM energy_records WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY timestamp ASC';
            recordsParams = [userId];
        }
        db.all(recordsSql, recordsParams, (err, rows) => {
            if (err) return dbError(res, err);
            if (!config) return res.json(rows);
            const fuelCap = config.total_fuel_capacity || 60;
            const elecCap = config.total_elec_capacity || 18;
            const initFuelPct = config.init_fuel_percent ?? 100;
            const initChargePct = config.init_charge_percent ?? 100;
            const vtype = config.vehicle_type || 'erev_phev';
            for (let i = 0; i < rows.length; i++) {
                const rec = rows[i];
                const prev = i > 0 ? rows[i - 1] : null;
                const prevFuelAfterPct = prev ? (prev.fuel_percent_after ?? prev.fuel_percent_before) : initFuelPct;
                const prevChargeAfterPct = prev ? (prev.charge_percent_after ?? prev.charge_percent_before) : initChargePct;
                const fuelBeforePct = rec.fuel_percent_before ?? prevFuelAfterPct;
                const chargeBeforePct = rec.charge_percent_before ?? prevChargeAfterPct;
                const fuelConsumed = Math.max(0, (prevFuelAfterPct - fuelBeforePct) / 100 * fuelCap);
                const elecConsumed = Math.max(0, (prevChargeAfterPct - chargeBeforePct) / 100 * elecCap);
                const prevTM = prev ? prev.total_mileage : (config.init_total_mileage || 0);
                const prevHM = prev ? prev.hev_mileage : (config.init_hev_mileage || 0);
                const interval = rec.total_mileage - prevTM;
                let hevD, evD;
                if (vtype === 'bev') {
                    // 纯电：总里程=EV里程
                    hevD = 0;
                    evD = interval;
                } else if (vtype === 'ice') {
                    // 纯油：总里程=HEV里程
                    hevD = interval;
                    evD = 0;
                } else {
                    // 增程/插混：HEV + EV = 总里程
                    hevD = rec.hev_mileage - prevHM;
                    evD = (rec.total_mileage - rec.hev_mileage) - (prevTM - prevHM);
                }
                rec.fuel_consumption = hevD > 0 ? (fuelConsumed / hevD) * 100 : 0;
                rec.elec_consumption = evD > 0 ? (elecConsumed / evD) * 100 : 0;
                rec.total_consumption = interval > 0 ? (fuelConsumed + elecConsumed * 0.31) / interval * 100 : 0;
            }
            res.json(rows);
        });
    });
});

app.post('/api/records', requireAuth, autoBackup('create_record'), (req, res) => {
    const { userId, record } = req.body;
    if (req.authUserId !== userId) return res.status(403).json({ error: '无权操作该用户记录' });
    if (!userId || !record) return res.status(400).json({ error: '缺少 userId 或 record' });

    const { id, type, timestamp, total_mileage, hev_mileage, amount_money,
            fuel_percent_before, charge_percent_before,
            fuel_percent_after, charge_percent_after,
            fuel_before_actual, charge_before_actual,
            fuel_after_actual, charge_after_actual,
            fuel_consumption, elec_consumption, total_consumption,
            energy_added, vehicle_id } = record;

    const vehicleId = vehicle_id ? parseInt(vehicle_id) : null;
    const sql = 'INSERT OR IGNORE INTO energy_records (id, user_id, type, timestamp, refuel_time, total_mileage, hev_mileage, amount_money, fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after, fuel_before_actual, charge_before_actual, fuel_after_actual, charge_after_actual, fuel_consumption, elec_consumption, total_consumption, energy_added, vehicle_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const params = [id, userId, type, timestamp, record.refuel_time ?? timestamp, total_mileage, hev_mileage, amount_money, fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after, fuel_before_actual, charge_before_actual, fuel_after_actual, charge_after_actual, fuel_consumption, elec_consumption, total_consumption, energy_added ?? null, vehicleId];

    db.run(sql, params, function(err) {
        if (err) return dbError(res, err);
        logOperation(userId, 'create', 'energy_record', 'id=' + id, req.ip, req._backupFile);
        res.json({ success: true });
    });
});

// ==================== 用户原始输入记录 ====================
app.post('/api/user-inputs', requireAuth, autoBackup('save_user_input'), (req, res) => {
    const { userId, recordId, type, total_mileage, hev_mileage, amount_money,
            fuel_percent_before, charge_percent_before,
            fuel_percent_after, charge_percent_after, energy_added } = req.body;
    if (req.authUserId !== userId) return res.status(403).json({ error: '无权操作该用户数据' });
    if (!userId || !recordId) return res.status(400).json({ error: '缺少参数' });
    const sql = 'INSERT OR IGNORE INTO user_inputs (record_id, user_id, type, total_mileage, hev_mileage, amount_money, fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after, energy_added, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const params = [recordId, userId, type, total_mileage, hev_mileage, amount_money, fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after, energy_added ?? null, Date.now()];
    db.run(sql, params, function(err) {
        if (err) return dbError(res, err);
        logOperation(userId, 'save_input', 'user_input', 'recordId=' + recordId, req.ip, req._backupFile);
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/user-inputs/:userId', requireAuth, requireOwnership, (req, res) => {
    db.all('SELECT * FROM user_inputs WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId], (err, rows) => {
        if (err) return dbError(res, err);
        res.json(rows);
    });
});

app.put('/api/records/:userId/:recordId', requireAuth, requireOwnership, autoBackup('update_record'), (req, res) => {
    const { userId, recordId } = req.params;
    const { record } = req.body;
    if (!record) return res.status(400).json({ error: '缺少 record 数据' });

    const { type, timestamp, refuel_time, total_mileage, hev_mileage, amount_money,
            fuel_percent_before, charge_percent_before,
            fuel_percent_after, charge_percent_after,
            fuel_before_actual, charge_before_actual,
            fuel_after_actual, charge_after_actual,
            fuel_consumption, elec_consumption, total_consumption } = record;

    const sql = 'UPDATE energy_records SET type=?, timestamp=?, refuel_time=?, total_mileage=?, hev_mileage=?, amount_money=?, fuel_percent_before=?, charge_percent_before=?, fuel_percent_after=?, charge_percent_after=?, fuel_before_actual=?, charge_before_actual=?, fuel_after_actual=?, charge_after_actual=?, fuel_consumption=?, elec_consumption=?, total_consumption=?, energy_added=? WHERE user_id=? AND id=?';
    const params = [type, timestamp, record.refuel_time ?? timestamp, total_mileage, hev_mileage, amount_money, fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after, fuel_before_actual, charge_before_actual, fuel_after_actual, charge_after_actual, fuel_consumption, elec_consumption, total_consumption, record.energy_added ?? null, userId, recordId];

    db.run(sql, params, function(err) {
        if (err) return dbError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: '记录不存在' });
        logOperation(userId, 'update', 'energy_record', 'recordId=' + recordId, req.ip, req._backupFile);
        res.json({ success: true });
    });
});

app.delete('/api/records/:userId/:recordId', requireAuth, requireOwnership, autoBackup('soft_delete_record'), (req, res) => {
    const { userId, recordId } = req.params;
    db.run('UPDATE energy_records SET deleted=1 WHERE user_id=? AND id=?', [userId, recordId], function(err) {
        if (err) return dbError(res, err);
        logOperation(userId, 'soft_delete', 'energy_record', 'recordId=' + recordId, req.ip, req._backupFile);
        res.json({ success: true });
    });
});

app.post('/api/records/:userId/:recordId/restore', requireAuth, requireOwnership, autoBackup('restore_record'), (req, res) => {
    const { userId, recordId } = req.params;
    db.run('UPDATE energy_records SET deleted=0 WHERE user_id=? AND id=?', [userId, recordId], function(err) {
        if (err) return dbError(res, err);
        logOperation(userId, 'restore', 'energy_record', 'recordId=' + recordId, req.ip, req._backupFile);
        res.json({ success: true });
    });
});

app.get('/api/records/:userId/trash', requireAuth, requireOwnership, (req, res) => {
    db.all('SELECT * FROM energy_records WHERE user_id=? AND deleted=1 ORDER BY timestamp DESC', [req.params.userId], (err, rows) => {
        if (err) return dbError(res, err);
        res.json(rows);
    });
});

app.post('/api/records/import', requireAuth, autoBackup('import_records'), (req, res) => {
    const { userId, records } = req.body;
    if (req.authUserId !== userId) return res.status(403).json({ error: '无权导入该用户数据' });
    if (!userId || !Array.isArray(records) || records.length === 0) return res.status(400).json({ error: '无效的导入数据' });
    let inserted = 0;
    const stmt = db.prepare('INSERT OR IGNORE INTO energy_records (id, user_id, type, timestamp, refuel_time, total_mileage, hev_mileage, amount_money, fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after, fuel_before_actual, charge_before_actual, fuel_after_actual, charge_after_actual, fuel_consumption, elec_consumption, total_consumption, energy_added, vehicle_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const rec of records) {
        const vehicleId = rec.vehicle_id ? parseInt(rec.vehicle_id) : null;
        stmt.run([rec.id, userId, rec.type, rec.timestamp, rec.refuel_time ?? rec.timestamp, rec.total_mileage, rec.hev_mileage, rec.amount_money, rec.fuel_percent_before, rec.charge_percent_before, rec.fuel_percent_after, rec.charge_percent_after, rec.fuel_before_actual, rec.charge_before_actual, rec.fuel_after_actual, rec.charge_after_actual, rec.fuel_consumption, rec.elec_consumption, rec.total_consumption, rec.energy_added ?? null, vehicleId], (err) => { if (!err) inserted++; });
    }
    stmt.finalize((err) => {
        if (err) return dbError(res, err);
        logOperation(userId, 'import', 'energy_record', 'imported=' + inserted, req.ip, req._backupFile);
        res.json({ success: true, count: inserted });
    });
});

// ==================== 管理员接口 ====================
let adminSessionToken = null;
const ADMIN_SESSION_TIMEOUT = 4 * 60 * 60 * 1000;
let adminSessionCreatedAt = 0;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    console.warn('⚠️  未设置 ADMIN_PASSWORD 环境变量，管理员功能不可用');
}
const ADMIN_PASSWORD_HASH = ADMIN_PASSWORD ? bcrypt.hashSync(ADMIN_PASSWORD, 10) : null;

app.post('/api/admin/login', async (req, res) => {
    if (!ADMIN_PASSWORD_HASH) return res.status(503).json({ error: '管理员功能未配置' });
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入密码' });
    const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (match) {
        adminSessionToken = uuidv4();
        adminSessionCreatedAt = Date.now();
        logOperation('admin', 'admin_login', 'system', '管理员登录', req.ip);
        res.json({ success: true, token: adminSessionToken });
    } else {
        res.status(401).json({ error: '密码错误' });
    }
});

function requireAdmin(req, res, next) {
    const token = req.body?.adminToken || req.query?.adminToken;
    if (!token || token !== adminSessionToken) return res.status(403).json({ error: '未授权' });
    if (Date.now() - adminSessionCreatedAt > ADMIN_SESSION_TIMEOUT) {
        adminSessionToken = null;
        return res.status(403).json({ error: '管理员登录已过期' });
    }
    next();
}

app.get('/api/admin/codes', requireAdmin, (req, res) => {
    db.all('SELECT code, created_at, expires_at, used FROM license_codes ORDER BY created_at DESC', (err, rows) => {
        if (err) return dbError(res, err);
        res.json(rows);
    });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all('SELECT id, username, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
        if (err) return dbError(res, err);
        res.json(rows);
    });
});

app.post('/api/admin/generate-code', requireAdmin, autoBackup('generate_code'), (req, res) => {
    const code = generateLicenseCode();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    db.run('INSERT INTO license_codes (code, created_at, expires_at) VALUES (?,?,?)', [code, now, expiresAt], (err) => {
        if (err) return dbError(res, err);
        logOperation('admin', 'generate_code', 'license_code', 'code=' + code, req.ip, req._backupFile);
        res.json({ code, expiresAt });
    });
});

app.delete('/api/admin/user/:userId', requireAdmin, autoBackup('admin_delete_user'), (req, res) => {
    const userId = req.params.userId;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM energy_records WHERE user_id=?', [userId], (err) => {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除能耗记录失败' }); }
            db.run('DELETE FROM vehicle_config WHERE user_id=?', [userId], (err2) => {
                if (err2) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除车辆配置失败' }); }
                db.run('DELETE FROM user_inputs WHERE user_id=?', [userId], (err3) => {
                    if (err3) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除用户输入失败' }); }
                    db.run('DELETE FROM users WHERE id=?', [userId], (err4) => {
                        if (err4) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除用户失败' }); }
                        db.run('COMMIT');
                        logOperation('admin', 'delete_user', 'user', 'userId=' + userId, req.ip, req._backupFile);
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

app.get('/api/admin/logs', requireAdmin, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    db.all('SELECT ol.*, u.username FROM operation_logs ol LEFT JOIN users u ON ol.user_id=u.id ORDER BY ol.created_at DESC LIMIT ?', [limit], (err, rows) => {
        if (err) return dbError(res, err);
        res.json(rows);
    });
});

// ==================== 备份管理 API ====================

app.get('/api/admin/backups', requireAdmin, (req, res) => {
    const backupDir = path.join(__dirname, 'backups');
    const result = { pre_op: [], daily: [], stats: {} };
    try {
        // pre-op 备份
        const preOpDir = path.join(backupDir, 'pre-op');
        if (fs.existsSync(preOpDir)) {
            const files = fs.readdirSync(preOpDir).filter(f => f.endsWith('.db')).sort().reverse();
            for (const file of files) {
                const fpath = path.join(preOpDir, file);
                const stat = fs.statSync(fpath);
                // 解析文件名: preop-YYYYMMDD-HHMMSS-user-action.db
                const parts = file.replace('.db', '').split('-');
                result.pre_op.push({
                    filename: file,
                    size: stat.size,
                    created_at: stat.mtimeMs,
                    date: parts.length >= 2 ? `${parts[0].slice(4,8)}-${parts[0].slice(8,10)}-${parts[0].slice(10,12)} ${parts[1].slice(0,2)}:${parts[1].slice(2,4)}` : '',
                    user: parts.length >= 3 ? parts[2] : '',
                    action: parts.length >= 4 ? parts[3] : ''
                });
            }
        }
        // 日常备份
        const dailyFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('database-') && f.endsWith('.db'));
        for (const file of dailyFiles) {
            const fpath = path.join(backupDir, file);
            const stat = fs.statSync(fpath);
            result.daily.push({ filename: file, size: stat.size, created_at: stat.mtimeMs });
        }
        result.daily.sort((a, b) => b.created_at - a.created_at);
        result.stats = {
            pre_op_count: result.pre_op.length,
            daily_count: result.daily.length,
            total_size: [...result.pre_op, ...result.daily].reduce((s, f) => s + f.size, 0),
            latest_daily: result.daily.length > 0 ? result.daily[0].filename : null,
            latest_pre_op: result.pre_op.length > 0 ? result.pre_op[0].filename : null
        };
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: '读取备份列表失败: ' + e.message });
    }
});

app.post('/api/admin/delete-daily-backup', requireAdmin, (req, res) => {
    // 只能删除日常备份（daily），不能删除 pre-op 备份
    const { filename, confirm } = req.body;
    if (!filename) return res.status(400).json({ error: '请指定要删除的备份文件' });
    if (confirm !== true) return res.status(400).json({ error: '需显式确认删除（confirm: true）' });
    if (!filename.startsWith('database-') || !filename.endsWith('.db')) {
        return res.status(400).json({ error: '只能删除日常备份文件（database-*.db）' });
    }
    const fpath = path.join(__dirname, 'backups', filename);
    if (!fs.existsSync(fpath)) return res.status(404).json({ error: '备份文件不存在' });
    try {
        fs.unlinkSync(fpath);
        logOperation('admin', 'delete_backup', 'backup', 'filename=' + filename, req.ip);
        res.json({ success: true, deleted: filename });
    } catch (e) {
        res.status(500).json({ error: '删除失败: ' + e.message });
    }
});

app.get('/api/admin/download-backup/:filename', requireAdmin, (req, res) => {
    const { filename } = req.params;
    // 允许下载 pre-op 和 daily 备份
    const allowedPrefixes = ['preop-', 'database-'];
    if (!allowedPrefixes.some(p => filename.startsWith(p)) || !filename.endsWith('.db')) {
        return res.status(400).json({ error: '无效的备份文件' });
    }
    let fpath = path.join(__dirname, 'backups', 'pre-op', filename);
    let inPreOp = true;
    if (!fs.existsSync(fpath)) {
        fpath = path.join(__dirname, 'backups', filename);
        inPreOp = false;
    }
    if (!fs.existsSync(fpath)) return res.status(404).json({ error: '文件不存在' });
    logOperation('admin', 'download_backup', 'backup', 'filename=' + filename, req.ip);
    res.download(fpath, filename);
});

// ==================== 多车辆管理 API ====================

// 获取用户车辆列表（同时迁移旧 engine_config 数据）
app.get('/api/vehicles/:userId', requireAuth, requireOwnership, (req, res) => {
    const userId = req.params.userId;
    db.all('SELECT * FROM vehicles WHERE user_id = ? ORDER BY id ASC', [userId], (err, rows) => {
        if (err) return dbError(res, err);
        if (rows.length > 0) return res.json(rows);
        // 没有车辆记录，尝试从 vehicle_config 迁移
        db.get('SELECT * FROM vehicle_config WHERE user_id = ?', [userId], (err2, oldConfig) => {
            if (err2) return dbError(res, err2);
            if (!oldConfig) return res.json([]);
            // 自动迁移第一辆车
            const now = Date.now();
            db.run('INSERT INTO vehicles (user_id, name, vehicle_type, total_fuel_capacity, total_elec_capacity, init_total_mileage, init_hev_mileage, init_fuel_percent, init_charge_percent, fuel_level_actual, charge_level_actual, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, '默认车辆', oldConfig.vehicle_type || 'erev_phev', oldConfig.total_fuel_capacity || 0, oldConfig.total_elec_capacity || 0, oldConfig.init_total_mileage || 0, oldConfig.init_hev_mileage || 0, oldConfig.init_fuel_percent || 0, oldConfig.init_charge_percent || 0, oldConfig.fuel_level_actual || 0, oldConfig.charge_level_actual || 0, now],
                function(err3) {
                    if (err3) return dbError(res, err3);
                    const newId = this.lastID;
                    // 更新旧记录的 vehicle_id
                    db.run('UPDATE energy_records SET vehicle_id = ? WHERE user_id = ? AND vehicle_id IS NULL', [newId, userId], () => {});
                    logOperation(userId, 'migrate_vehicle', 'vehicle', '从旧配置迁移', req.ip);
                    db.all('SELECT * FROM vehicles WHERE user_id = ? ORDER BY id ASC', [userId], (err4, newRows) => {
                        if (err4) return dbError(res, err4);
                        res.json(newRows);
                    });
                });
        });
    });
});

// 新增车辆
app.post('/api/vehicles', requireAuth, autoBackup('add_vehicle'), (req, res) => {
    const { userId, vehicle } = req.body;
    if (req.authUserId !== userId) return res.status(403).json({ error: '无权操作' });
    if (!vehicle) return res.status(400).json({ error: '缺少车辆参数' });
    
    const { name, vehicleType, totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage, initFuelPercent, initChargePercent } = vehicle;
    const vtype = vehicleType || 'erev_phev';
    const isBEV = vtype === 'bev';
    const isICE = vtype === 'ice';
    
    if (!initTotalMileage || initTotalMileage <= 0) return res.status(400).json({ error: '总里程必须>0' });
    
    const now = Date.now();
    const needsFuel = (vtype === 'erev_phev' || isICE);
    const needsElec = (vtype === 'erev_phev' || isBEV);
    const fuelLevelActual = needsFuel ? (initFuelPercent / 100) * totalFuelCapacity : 0;
    const chargeLevelActual = needsElec ? (initChargePercent / 100) * totalElecCapacity : 0;
    
    db.run('INSERT INTO vehicles (user_id, name, vehicle_type, total_fuel_capacity, total_elec_capacity, init_total_mileage, init_hev_mileage, init_fuel_percent, init_charge_percent, fuel_level_actual, charge_level_actual, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, name || '未命名车辆', vtype,
         needsFuel ? (totalFuelCapacity || 0) : 0,
         needsElec ? (totalElecCapacity || 0) : 0,
         initTotalMileage,
         isBEV ? 0 : (isICE ? initTotalMileage : (initHevMileage || 0)),
         needsFuel ? (initFuelPercent || 0) : 0,
         needsElec ? (initChargePercent || 0) : 0,
         fuelLevelActual, chargeLevelActual, now],
        function(err) {
            if (err) return dbError(res, err);
            logOperation(userId, 'add_vehicle', 'vehicle', 'vehicleId=' + this.lastID, req.ip, req._backupFile);
            res.json({ success: true, vehicleId: this.lastID });
        });
});

// 删除车辆（同时删除关联的能耗记录）
app.delete('/api/vehicles/:vehicleId', requireAuth, autoBackup('delete_vehicle'), (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    const { userId, confirm } = req.body;
    if (!userId || req.authUserId !== userId) return res.status(403).json({ error: '无权操作' });
    if (confirm !== true) return res.status(400).json({ error: '需确认删除（confirm: true）' });
    
    // 先查该用户有多少辆车
    db.all('SELECT id FROM vehicles WHERE user_id = ? ORDER BY id ASC', [userId], (err, allV) => {
        if (err) return dbError(res, err);
        if (allV.length <= 1) return res.status(400).json({ error: '至少保留一辆车' });
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('DELETE FROM energy_records WHERE vehicle_id = ?', [vehicleId], () => {});
            db.run('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [vehicleId, userId], (err2) => {
                if (err2) { db.run('ROLLBACK'); return dbError(res, err2); }
                db.run('COMMIT');
                logOperation(userId, 'delete_vehicle', 'vehicle', 'vehicleId=' + vehicleId, req.ip, req._backupFile);
                res.json({ success: true });
            });
        });
    });
});

// 更新车辆参数
app.put('/api/vehicles/:vehicleId', requireAuth, autoBackup('update_vehicle'), (req, res) => {
    const vehicleId = parseInt(req.params.vehicleId);
    const { userId, vehicle } = req.body;
    if (req.authUserId !== userId) return res.status(403).json({ error: '无权操作' });
    if (!vehicle) return res.status(400).json({ error: '缺少车辆参数' });
    
    const { name, vehicleType, totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage, initFuelPercent, initChargePercent, electricity_price } = vehicle;
    
    // 部分更新：只更新电价
    if (electricity_price !== undefined && name === undefined) {
        const price = parseFloat(electricity_price) || 0;
        db.run('UPDATE vehicles SET electricity_price=? WHERE id=? AND user_id=?',
            [price, vehicleId, userId],
            function(err) {
                if (err) return dbError(res, err);
                logOperation(userId, 'update_vehicle_price', 'vehicle', 'vehicleId=' + vehicleId + ' price=' + price, req.ip, req._backupFile);
                res.json({ success: true });
            });
        return;
    }
    
    const vtype = vehicleType || 'erev_phev';
    const needsFuel = (vtype === 'erev_phev' || vtype === 'ice');
    const needsElec = (vtype === 'erev_phev' || vtype === 'bev');
    const fuelLevelActual = needsFuel ? (initFuelPercent / 100) * totalFuelCapacity : 0;
    const chargeLevelActual = needsElec ? (initChargePercent / 100) * totalElecCapacity : 0;
    
    db.run('UPDATE vehicles SET name=?, vehicle_type=?, total_fuel_capacity=?, total_elec_capacity=?, init_total_mileage=?, init_hev_mileage=?, init_fuel_percent=?, init_charge_percent=?, fuel_level_actual=?, charge_level_actual=?, electricity_price=? WHERE id=? AND user_id=?',
        [name || '', vtype,
         needsFuel ? (totalFuelCapacity || 0) : 0,
         needsElec ? (totalElecCapacity || 0) : 0,
         initTotalMileage,
         vtype === 'bev' ? 0 : (vtype === 'ice' ? initTotalMileage : (initHevMileage || 0)),
         needsFuel ? (initFuelPercent || 0) : 0,
         needsElec ? (initChargePercent || 0) : 0,
         fuelLevelActual, chargeLevelActual,
         electricity_price !== undefined ? (parseFloat(electricity_price) || 0) : 0,
         vehicleId, userId],
        function(err) {
            if (err) return dbError(res, err);
            logOperation(userId, 'update_vehicle', 'vehicle', 'vehicleId=' + vehicleId, req.ip, req._backupFile);
            res.json({ success: true });
        });
});

// ==================== 防崩溃保护 ====================
process.on("uncaughtException", (err) => {
    console.error("未捕获异常:", err.message, err.stack?.split("\\n")[1]);
});
process.on("unhandledRejection", (reason) => {
    console.error("未处理 Promise 拒绝:", reason?.message || reason);
});
// ==================== 启动服务器 ====================
app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
    console.log('数据库文件位置:', DB_PATH);
});
