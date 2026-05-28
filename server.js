const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 3000;

// ==================== 数据库绝对路径 ====================
const DB_PATH = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH);
console.log(`数据库路径: ${DB_PATH}`);

// 测试连接
db.get("SELECT 1", (err) => {
    if (err) console.error('数据库连接失败:', err.message);
    else console.log('数据库连接成功');
});

// 迁移：补 energy_added 列
db.all("PRAGMA table_info(energy_records)", (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'energy_added')) {
        db.run("ALTER TABLE energy_records ADD COLUMN energy_added REAL", (e) => {
            if (e) console.error('迁移 energy_added 失败:', e.message);
            else console.log('已添加 energy_added 列');
        });
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ==================== 初始化数据库表 ====================
db.serialize(() => {
    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER
    )`);
    // 车辆配置表
    db.run(`CREATE TABLE IF NOT EXISTS vehicle_config (
        user_id TEXT PRIMARY KEY,
        total_fuel_capacity REAL,
        total_elec_capacity REAL,
        init_total_mileage REAL,
        init_hev_mileage REAL,
        init_fuel_percent REAL,
        init_charge_percent REAL,
        fuel_level_actual REAL,
        charge_level_actual REAL,
        updated_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    // 能耗记录表
    db.run(`CREATE TABLE IF NOT EXISTS energy_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT,
        timestamp INTEGER,
        total_mileage REAL,
        hev_mileage REAL,
        amount_money REAL,
        fuel_percent_before REAL,
        charge_percent_before REAL,
        fuel_percent_after REAL,
        charge_percent_after REAL,
        fuel_before_actual REAL,
        charge_before_actual REAL,
        fuel_after_actual REAL,
        charge_after_actual REAL,
        fuel_consumption REAL,
        elec_consumption REAL,
        total_consumption REAL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    // 注册码表
    db.run(`CREATE TABLE IF NOT EXISTS license_codes (
        code TEXT PRIMARY KEY,
        created_at INTEGER,
        expires_at INTEGER,
        used INTEGER DEFAULT 0
    )`);
});

// ==================== 辅助函数 ====================
function generateLicenseCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function isValidLicenseCode(code, callback) {
    db.get(`SELECT * FROM license_codes WHERE code = ? AND used = 0`, [code], (err, row) => {
        if (err || !row) return callback(false);
        const now = Date.now();
        if (now > row.expires_at) return callback(false);
        callback(true, row.code);
    });
}

function markLicenseUsed(code, callback) {
    db.run(`UPDATE license_codes SET used = 1 WHERE code = ?`, [code], callback);
}

// ==================== 用户注册（含注册码验证） ====================
app.post('/api/register', async (req, res) => {
    const { username, password, vehicle, licenseCode } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (!licenseCode) return res.status(400).json({ error: '请填写注册码' });

    isValidLicenseCode(licenseCode, async (valid) => {
        if (!valid) return res.status(400).json({ error: '注册码无效或已过期' });

        const { totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
                initFuelPercent, initChargePercent } = vehicle || {};
        if (!totalFuelCapacity || !totalElecCapacity || initTotalMileage === undefined ||
            initHevMileage === undefined || initFuelPercent === undefined || initChargePercent === undefined) {
            return res.status(400).json({ error: '请完整填写车辆参数' });
        }
        if (totalFuelCapacity <= 0 || totalElecCapacity <= 0 || initTotalMileage <= 0 ||
            initHevMileage < 0 || initHevMileage > initTotalMileage ||
            initFuelPercent < 0 || initFuelPercent > 100 || initChargePercent < 0 || initChargePercent > 100) {
            return res.status(400).json({ error: '车辆参数数值无效' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const now = Date.now();

        db.run(`INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
            [userId, username, hashedPassword, now], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '用户名已存在' });
                    return res.status(500).json({ error: err.message });
                }
                const fuelLevelActual = (initFuelPercent / 100) * totalFuelCapacity;
                const chargeLevelActual = (initChargePercent / 100) * totalElecCapacity;
                db.run(`INSERT INTO vehicle_config 
                    (user_id, total_fuel_capacity, total_elec_capacity, init_total_mileage, init_hev_mileage,
                     init_fuel_percent, init_charge_percent, fuel_level_actual, charge_level_actual, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
                     initFuelPercent, initChargePercent, fuelLevelActual, chargeLevelActual, now],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: '保存车辆配置失败' });
                        markLicenseUsed(licenseCode, () => {});
                        res.json({ success: true, userId });
                    });
            });
    });
});

// ==================== 用户登录 ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: '用户名或密码错误' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: '用户名或密码错误' });
        res.json({ success: true, userId: user.id, username: user.username });
    });
});

// ==================== 修改密码 ====================
app.post('/api/change-password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: '缺少必要参数' });
    if (newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
    db.get(`SELECT password_hash FROM users WHERE id = ?`, [userId], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: '用户不存在' });
        const match = await bcrypt.compare(oldPassword, row.password_hash);
        if (!match) return res.status(401).json({ error: '原密码错误' });
        const newHash = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, userId], (err2) => {
            if (err2) return res.status(500).json({ error: '修改失败' });
            res.json({ success: true });
        });
    });
});

// ==================== 车辆配置 ====================
app.get('/api/config/:userId', (req, res) => {
    const { userId } = req.params;
    db.get(`SELECT * FROM vehicle_config WHERE user_id = ?`, [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

app.post('/api/config', (req, res) => {
    const { userId, config } = req.body;
    const { totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
            initFuelPercent, initChargePercent, fuelLevelActual, chargeLevelActual } = config;
    const now = Date.now();
    db.run(`INSERT OR REPLACE INTO vehicle_config 
        (user_id, total_fuel_capacity, total_elec_capacity, init_total_mileage, init_hev_mileage,
         init_fuel_percent, init_charge_percent, fuel_level_actual, charge_level_actual, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, totalFuelCapacity, totalElecCapacity, initTotalMileage, initHevMileage,
         initFuelPercent, initChargePercent, fuelLevelActual, chargeLevelActual, now],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// ==================== 能耗记录管理 ====================
app.get('/api/records/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT *, energy_added FROM energy_records WHERE user_id = ? ORDER BY timestamp ASC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/records', (req, res) => {
    const { userId, record } = req.body;
    console.log('=== 保存记录请求 ===');
    console.log('userId:', userId);
    console.log('record:', JSON.stringify(record, null, 2));

    if (!userId || !record) return res.status(400).json({ error: '缺少 userId 或 record' });

    const {
        id, type, timestamp, total_mileage, hev_mileage, amount_money,
        fuel_percent_before, charge_percent_before,
        fuel_percent_after, charge_percent_after,
        fuel_before_actual, charge_before_actual,
        fuel_after_actual, charge_after_actual,
        fuel_consumption, elec_consumption, total_consumption,
        energy_added
    } = record;

    const sql = `INSERT INTO energy_records (
        id, user_id, type, timestamp, total_mileage, hev_mileage, amount_money,
        fuel_percent_before, charge_percent_before,
        fuel_percent_after, charge_percent_after,
        fuel_before_actual, charge_before_actual,
        fuel_after_actual, charge_after_actual,
        fuel_consumption, elec_consumption, total_consumption,
        energy_added
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        id, userId, type, timestamp,
        total_mileage, hev_mileage, amount_money,
        fuel_percent_before, charge_percent_before,
        fuel_percent_after, charge_percent_after,
        fuel_before_actual, charge_before_actual,
        fuel_after_actual, charge_after_actual,
        fuel_consumption, elec_consumption, total_consumption,
        energy_added ?? null
    ];

    db.run(sql, params, function(err) {
        if (err) {
            console.error('插入失败:', err.message);
            return res.status(500).json({ error: err.message });
        }
        console.log('插入成功，lastID:', this.lastID);
        res.json({ success: true });
    });
});

app.put('/api/records/:userId/:recordId', (req, res) => {
    const { userId, recordId } = req.params;
    const { record } = req.body;
    if (!record) return res.status(400).json({ error: '缺少 record 数据' });

    const {
        type, timestamp, total_mileage, hev_mileage, amount_money,
        fuel_percent_before, charge_percent_before,
        fuel_percent_after, charge_percent_after,
        fuel_before_actual, charge_before_actual,
        fuel_after_actual, charge_after_actual,
        fuel_consumption, elec_consumption, total_consumption
    } = record;

    const sql = `UPDATE energy_records SET
        type = ?, timestamp = ?, total_mileage = ?, hev_mileage = ?, amount_money = ?,
        fuel_percent_before = ?, charge_percent_before = ?,
        fuel_percent_after = ?, charge_percent_after = ?,
        fuel_before_actual = ?, charge_before_actual = ?,
        fuel_after_actual = ?, charge_after_actual = ?,
        fuel_consumption = ?, elec_consumption = ?, total_consumption = ?,
        energy_added = ?
    WHERE user_id = ? AND id = ?`;

    const params = [
        type, timestamp, total_mileage, hev_mileage, amount_money,
        fuel_percent_before, charge_percent_before,
        fuel_percent_after, charge_percent_after,
        fuel_before_actual, charge_before_actual,
        fuel_after_actual, charge_after_actual,
        fuel_consumption, elec_consumption, total_consumption,
        record.energy_added ?? null,
        userId, recordId
    ];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: '记录不存在' });
        res.json({ success: true });
    });
});

app.delete('/api/records/:userId/:recordId', (req, res) => {
    const { userId, recordId } = req.params;
    db.run(`DELETE FROM energy_records WHERE user_id = ? AND id = ?`, [userId, recordId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/records/:userId', (req, res) => {
    const { userId } = req.params;
    db.run(`DELETE FROM energy_records WHERE user_id = ?`, [userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 批量导入记录
app.post('/api/records/import', (req, res) => {
    const { userId, records } = req.body;
    if (!userId || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: '无效的导入数据' });
    }
    let inserted = 0;
    const stmt = db.prepare(`INSERT INTO energy_records (
        id, user_id, type, timestamp, total_mileage, hev_mileage, amount_money,
        fuel_percent_before, charge_percent_before, fuel_percent_after, charge_percent_after,
        fuel_before_actual, charge_before_actual, fuel_after_actual, charge_after_actual,
        fuel_consumption, elec_consumption, total_consumption, energy_added
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const rec of records) {
        const params = [
            rec.id, userId, rec.type, rec.timestamp,
            rec.total_mileage, rec.hev_mileage, rec.amount_money,
            rec.fuel_percent_before, rec.charge_percent_before,
            rec.fuel_percent_after, rec.charge_percent_after,
            rec.fuel_before_actual, rec.charge_before_actual,
            rec.fuel_after_actual, rec.charge_after_actual,
            rec.fuel_consumption, rec.elec_consumption, rec.total_consumption,
            rec.energy_added ?? null
        ];
        stmt.run(params, (err) => { if (!err) inserted++; });
    }
    stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: inserted });
    });
});

// ==================== 管理员接口 ====================
let adminSessionToken = null;

// 管理员密码（只需改这里）
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入密码' });
    const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (match) {
        adminSessionToken = require('uuid').v4();
        res.json({ success: true, token: adminSessionToken });
    } else {
        res.status(401).json({ error: '密码错误' });
    }
});

// 验证管理员 token 的中间件
function requireAdmin(req, res, next) {
    const token = req.body?.adminToken || req.query?.adminToken;
    if (!token || token !== adminSessionToken) {
        return res.status(403).json({ error: '未授权' });
    }
    next();
}

app.get('/api/admin/codes', (req, res) => {
    db.all(`SELECT code, created_at, expires_at, used FROM license_codes ORDER BY created_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT id, username, created_at FROM users ORDER BY created_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/generate-code', requireAdmin, (req, res) => {
    const code = generateLicenseCode();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    db.run(`INSERT INTO license_codes (code, created_at, expires_at) VALUES (?, ?, ?)`,
        [code, now, expiresAt], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ code, expiresAt });
        });
});

app.delete('/api/admin/user/:userId', requireAdmin, (req, res) => {
    const userId = req.params.userId;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`DELETE FROM energy_records WHERE user_id = ?`, [userId], (err) => {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除能耗记录失败' }); }
            db.run(`DELETE FROM vehicle_config WHERE user_id = ?`, [userId], (err2) => {
                if (err2) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除车辆配置失败' }); }
                db.run(`DELETE FROM users WHERE id = ?`, [userId], (err3) => {
                    if (err3) { db.run('ROLLBACK'); return res.status(500).json({ error: '删除用户失败' }); }
                    db.run('COMMIT');
                    res.json({ success: true });
                });
            });
        });
    });
});

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`数据库文件位置: ${DB_PATH}`);
});