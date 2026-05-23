const API_BASE = '/api';
let currentUser = null;
let initConfig = null;
let records = [];
let currentEventType = 'fuel';
let unifiedChart = null;

// DOM 元素
const authCard = document.getElementById('authCard');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showLoginBtn = document.getElementById('showLoginBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const doLoginBtn = document.getElementById('doLoginBtn');
const doRegisterBtn = document.getElementById('doRegisterBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userNameSpan = document.getElementById('userNameSpan');
const authMsg = document.getElementById('authMsg');
const totalMileageInp = document.getElementById('totalMileage');
const hevMileageInp = document.getElementById('hevMileage');
const amountInp = document.getElementById('amountMoney');
const fuelPercentBefore = document.getElementById('fuelPercentBefore');
const chargePercentBefore = document.getElementById('chargePercentBefore');
const fuelPercentAfter = document.getElementById('fuelPercentAfter');
const chargePercentAfter = document.getElementById('chargePercentAfter');
const afterFuelField = document.getElementById('afterFuelField');
const afterChargeField = document.getElementById('afterChargeField');
const fuelAmount = document.getElementById('fuelAmount');
const chargeAmount = document.getElementById('chargeAmount');
const fuelAmountField = document.getElementById('fuelAmountField');
const chargeAmountField = document.getElementById('chargeAmountField');
const submitBtn = document.getElementById('submitRecord');
const clearAllBtn = document.getElementById('clearAllBtn');
const tableBody = document.getElementById('tableBody');

function showMessage(msg, isError = true) {
    if (authMsg) {
        authMsg.innerText = msg;
        authMsg.style.color = isError ? '#c13b1b' : '#2b6e4f';
        authMsg.style.display = 'block';
        setTimeout(() => { if (authMsg) authMsg.innerText = ''; }, 4000);
    }
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// 个人中心模态框
function showProfileModal() {
    if (!currentUser) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>👤 个人中心 - ${currentUser.username}</h3>
            <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem;">
                <button id="menuVehicleBtn" class="profile-menu-btn active">🚗 车辆参数</button>
                <button id="menuPwdBtn" class="profile-menu-btn">🔐 修改密码</button>
            </div>
            <div id="vehiclePanel" style="display: block;">
                <div class="form-grid">
                    <div class="input-field"><label>油箱总容量 (升)</label><input id="profileFuelCap" type="number" step="0.1" value="${initConfig?.total_fuel_capacity || ''}"></div>
                    <div class="input-field"><label>电池总容量 (kWh)</label><input id="profileElecCap" type="number" step="0.1" value="${initConfig?.total_elec_capacity || ''}"></div>
                    <div class="input-field"><label>当前总里程 (km)</label><input id="profileTotal" type="number" step="0.1" value="${initConfig?.init_total_mileage || ''}"></div>
                    <div class="input-field"><label>当前HEV里程 (km)</label><input id="profileHev" type="number" step="0.1" value="${initConfig?.init_hev_mileage || ''}"></div>
                    <div class="input-field"><label>当前油量 (%)</label><input id="profileFuelPct" type="number" step="0.1" value="${initConfig?.init_fuel_percent || ''}"></div>
                    <div class="input-field"><label>当前电量 (%)</label><input id="profileChargePct" type="number" step="0.1" value="${initConfig?.init_charge_percent || ''}"></div>
                </div>
                <div style="margin-top: 1rem;"><button id="saveProfileBtn">保存车辆参数</button></div>
            </div>
            <div id="pwdPanel" style="display: none;">
                <div class="form-grid">
                    <div class="input-field"><label>原密码</label><input type="password" id="oldPwd" placeholder="原密码"></div>
                    <div class="input-field"><label>新密码</label><input type="password" id="newPwd" placeholder="新密码(至少4位)"></div>
                </div>
                <div style="margin-top: 1rem;"><button id="changePwdBtn" class="btn-outline">确认修改</button></div>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
                <button id="closeProfileBtn" class="btn-outline">关闭</button>
            </div>
            <div id="profileMsg" style="margin-top: 1rem; color: #c13b1b;"></div>
        </div>
    `;
    document.body.appendChild(modal);

    const vehiclePanel = modal.querySelector('#vehiclePanel');
    const pwdPanel = modal.querySelector('#pwdPanel');
    const menuVehicleBtn = modal.querySelector('#menuVehicleBtn');
    const menuPwdBtn = modal.querySelector('#menuPwdBtn');
    const closeBtn = modal.querySelector('#closeProfileBtn');
    const profileMsg = modal.querySelector('#profileMsg');

    menuVehicleBtn.onclick = () => {
        menuVehicleBtn.classList.add('active');
        menuPwdBtn.classList.remove('active');
        vehiclePanel.style.display = 'block';
        pwdPanel.style.display = 'none';
        profileMsg.innerText = '';
    };
    menuPwdBtn.onclick = () => {
        menuPwdBtn.classList.add('active');
        menuVehicleBtn.classList.remove('active');
        vehiclePanel.style.display = 'none';
        pwdPanel.style.display = 'block';
        profileMsg.innerText = '';
    };
    closeBtn.onclick = () => modal.remove();

    const saveVehicleBtn = modal.querySelector('#saveProfileBtn');
    saveVehicleBtn.onclick = async () => {
        const fuelCap = parseFloat(modal.querySelector('#profileFuelCap').value);
        const elecCap = parseFloat(modal.querySelector('#profileElecCap').value);
        const total = parseFloat(modal.querySelector('#profileTotal').value);
        const hev = parseFloat(modal.querySelector('#profileHev').value);
        const fuelPct = parseFloat(modal.querySelector('#profileFuelPct').value);
        const chargePct = parseFloat(modal.querySelector('#profileChargePct').value);
        if (fuelCap <= 0 || elecCap <= 0 || total <= 0 || hev < 0 || hev > total || fuelPct < 0 || fuelPct > 100 || chargePct < 0 || chargePct > 100) {
            profileMsg.innerText = '请填写有效数值';
            return;
        }
        const config = {
            totalFuelCapacity: fuelCap, totalElecCapacity: elecCap,
            initTotalMileage: total, initHevMileage: hev,
            initFuelPercent: fuelPct, initChargePercent: chargePct,
            fuelLevelActual: (fuelPct / 100) * fuelCap,
            chargeLevelActual: (chargePct / 100) * elecCap
        };
        try {
            const res = await fetch(`${API_BASE}/config`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.userId, config })
            });
            if (res.ok) {
                await loadUserData();
                recalcAllConsumptions();
                await saveRecordsToServer();
                renderAll();
                profileMsg.innerText = '车辆参数已更新';
                setTimeout(() => modal.remove(), 1000);
            } else {
                const err = await res.json();
                profileMsg.innerText = err.error || '保存失败';
            }
        } catch (e) {
            profileMsg.innerText = '网络错误：' + e.message;
        }
    };

    const changePwdBtn = modal.querySelector('#changePwdBtn');
    changePwdBtn.onclick = async () => {
        const oldPwd = modal.querySelector('#oldPwd').value;
        const newPwd = modal.querySelector('#newPwd').value;
        if (!oldPwd || !newPwd) {
            profileMsg.innerText = '请填写原密码和新密码';
            return;
        }
        if (newPwd.length < 4) {
            profileMsg.innerText = '新密码至少4位';
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/change-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.userId, oldPassword: oldPwd, newPassword: newPwd })
            });
            const data = await res.json();
            if (res.ok) {
                profileMsg.innerText = '密码修改成功，请重新登录';
                setTimeout(() => {
                    modal.remove();
                    logout();
                }, 1500);
            } else {
                profileMsg.innerText = data.error || '修改失败';
            }
        } catch (e) {
            profileMsg.innerText = '网络错误：' + e.message;
        }
    };
}

// ===== 注册协议弹窗逻辑 =====
function showAgreeMsg(msg, isError = true) {
    const el = document.getElementById('agreeMsg');
    if (el) {
        el.innerText = msg;
        el.style.color = isError ? '#c13b1b' : '#2b6e4f';
    }
}

function showAgreementModal() {
    const modal = document.getElementById('agreementModal');
    const checkbox = document.getElementById('agreeCheckbox');
    const confirmBtn = document.getElementById('agreeConfirmBtn');
    const msgEl = document.getElementById('agreeMsg');

    // 重置状态
    checkbox.checked = false;
    confirmBtn.disabled = true;
    if (msgEl) msgEl.innerText = '';
    modal.style.display = 'flex';
}

function hideAgreementModal() {
    document.getElementById('agreementModal').style.display = 'none';
}

// checkbox 勾选/取消控制确认按钮
const agreeCheckbox = document.getElementById('agreeCheckbox');
const agreeConfirmBtn = document.getElementById('agreeConfirmBtn');
if (agreeCheckbox && agreeConfirmBtn) {
    agreeCheckbox.addEventListener('change', () => {
        agreeConfirmBtn.disabled = !agreeCheckbox.checked;
    });
}

// 点击模态框外部关闭（点击遮罩层）
const agreementModal = document.getElementById('agreementModal');
if (agreementModal) {
    agreementModal.addEventListener('click', (e) => {
        if (e.target === agreementModal) hideAgreementModal();
    });
}

// 提取注册逻辑为独立函数（原有验证逻辑不动）
async function doRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const licenseCode = document.getElementById('regLicense').value.trim();
    const totalFuelCap = parseFloat(document.getElementById('regFuelCap').value);
    const totalElecCap = parseFloat(document.getElementById('regElecCap').value);
    const totalMile = parseFloat(document.getElementById('regTotalMile').value);
    const hevMile = parseFloat(document.getElementById('regHevMile').value);
    const fuelPct = parseFloat(document.getElementById('regFuelPct').value);
    const chargePct = parseFloat(document.getElementById('regChargePct').value);

    if (!username || !password) return showAgreeMsg('用户名和密码不能为空');
    if (!licenseCode) return showAgreeMsg('请填写注册码');
    if (isNaN(totalFuelCap) || totalFuelCap <= 0) return showAgreeMsg('油箱容量必须>0');
    if (isNaN(totalElecCap) || totalElecCap <= 0) return showAgreeMsg('电池容量必须>0');
    if (isNaN(totalMile) || totalMile <= 0) return showAgreeMsg('总里程必须>0');
    if (isNaN(hevMile) || hevMile < 0 || hevMile > totalMile) return showAgreeMsg('HEV里程无效');
    if (isNaN(fuelPct) || fuelPct < 0 || fuelPct > 100) return showAgreeMsg('油量百分比0~100');
    if (isNaN(chargePct) || chargePct < 0 || chargePct > 100) return showAgreeMsg('电量百分比0~100');

    hideAgreementModal();

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, licenseCode, vehicle: {
                totalFuelCapacity: totalFuelCap, totalElecCapacity: totalElecCap,
                initTotalMileage: totalMile, initHevMileage: hevMile,
                initFuelPercent: fuelPct, initChargePercent: chargePct
            } })
        });
        const data = await res.json();
        if (res.ok) {
            showLoginBtn.click();
            // 等切换完成后再显示提示
            setTimeout(() => showMessage('注册成功，请登录', false), 100);
        } else {
            showMessage(data.error || '注册失败');
        }
    } catch (err) {
        showMessage('网络错误: ' + err.message);
    }
}

// 注册按钮：先弹协议，同意后再走 doRegister
doRegisterBtn.onclick = () => {
    showAgreementModal();
};

// 确认注册按钮：触发实际注册
if (agreeConfirmBtn) {
    agreeConfirmBtn.addEventListener('click', doRegister);
}

// 取消注册按钮：关闭弹窗
const agreeCancelBtn = document.getElementById('agreeCancelBtn');
if (agreeCancelBtn) {
    agreeCancelBtn.addEventListener('click', hideAgreementModal);
}

// 登录
doLoginBtn.onclick = async () => {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    if (!username || !password) return showMessage('请输入用户名和密码');
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = { userId: data.userId, username: data.username };
            // 持久化登录状态
            localStorage.setItem('ces_userId', data.userId);
            localStorage.setItem('ces_username', data.username);
            userNameSpan.innerText = `👤 ${data.username}`;
            userNameSpan.style.cursor = 'pointer';
            userNameSpan.onclick = showProfileModal;
            authCard.style.display = 'none';
            mainApp.style.display = 'block';
            await loadUserData();
            renderAll();
        } else {
            showMessage(data.error || '登录失败');
        }
    } catch (e) {
        showMessage('网络错误: ' + e.message);
    }
};

// 退出登录
function logout() {
    currentUser = null;
    initConfig = null;
    localStorage.removeItem('ces_userId');
    localStorage.removeItem('ces_username');
    records = [];
    if (unifiedChart) unifiedChart.destroy();
    unifiedChart = null;
    authCard.style.display = 'block';
    mainApp.style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    showMessage('已退出登录', false);
}
if (logoutBtn) logoutBtn.onclick = logout;

// 加载用户数据
async function loadUserData() {
    try {
        const configRes = await fetch(`${API_BASE}/config/${currentUser.userId}`);
        if (configRes.ok) initConfig = await configRes.json();
        else initConfig = null;
        const recordsRes = await fetch(`${API_BASE}/records/${currentUser.userId}`);
        if (recordsRes.ok) records = await recordsRes.json();
        else records = [];
    } catch (e) { console.error(e); }
}

function percentToActual(percent, totalCap) {
    return (percent / 100) * totalCap;
}

// 重新计算能耗
function recalcAllConsumptions() {
    if (!initConfig) return;
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    let fuelChain = { hev: initConfig.init_hev_mileage, fuelLevel: initConfig.fuel_level_actual };
    let chargeChain = { totalMileage: initConfig.init_total_mileage, hevMileage: initConfig.init_hev_mileage, chargeLevel: initConfig.charge_level_actual };
    for (let rec of sorted) {
        const fuelConsumed = fuelChain.fuelLevel - (rec.fuel_before_actual || 0);
        const hevDelta = rec.hev_mileage - fuelChain.hev;
        if (hevDelta > 0 && fuelConsumed > 0) rec.fuel_consumption = (fuelConsumed / hevDelta) * 100;
        else if (hevDelta === 0 && fuelConsumed === 0) rec.fuel_consumption = 0;
        else rec.fuel_consumption = null;
        const prevEV = chargeChain.totalMileage - chargeChain.hevMileage;
        const currEV = rec.total_mileage - rec.hev_mileage;
        const evDelta = currEV - prevEV;
        const energyUsed = chargeChain.chargeLevel - (rec.charge_before_actual || 0);
        if (evDelta > 0 && energyUsed > 0) rec.elec_consumption = (energyUsed / evDelta) * 100;
        else if (evDelta === 0 && energyUsed === 0) rec.elec_consumption = 0;
        else rec.elec_consumption = null;
        if (rec.fuel_consumption !== null && evDelta !== undefined && evDelta >= 0) {
            rec.total_consumption = (25 * rec.fuel_consumption) / (evDelta + 25);
        } else rec.total_consumption = null;
        if (rec.type === 'fuel' && rec.fuel_after_actual) fuelChain = { hev: rec.hev_mileage, fuelLevel: rec.fuel_after_actual };
        if (rec.type === 'ev' && rec.charge_after_actual) chargeChain = { totalMileage: rec.total_mileage, hevMileage: rec.hev_mileage, chargeLevel: rec.charge_after_actual };
    }
}

// 保存所有记录到服务器（覆盖式）
async function saveRecordsToServer() {
    for (let rec of records) {
        await fetch(`${API_BASE}/records`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.userId, record: rec })
        });
    }
}

// 添加单条记录
async function addRecord() {
    if (!initConfig) {
        alert('请先在个人中心设置车辆参数');
        showProfileModal();
        return;
    }
    const total = parseFloat(totalMileageInp.value);
    const hev = parseFloat(hevMileageInp.value);
    const amount = parseFloat(amountInp.value);
    const fuelPctBefore = parseFloat(fuelPercentBefore.value);
    const chargePctBefore = parseFloat(chargePercentBefore.value);
    if (isNaN(total) || total <= 0 || isNaN(hev) || hev < 0 || hev > total || isNaN(amount) || amount <= 0) {
        alert('请填写有效数值（总里程>0，HEV里程有效，金额>0）');
        return;
    }
    if (isNaN(fuelPctBefore) || fuelPctBefore < 0 || fuelPctBefore > 100) {
        alert('操作前油量百分比0~100');
        return;
    }
    if (isNaN(chargePctBefore) || chargePctBefore < 0 || chargePctBefore > 100) {
        alert('操作前电量百分比0~100');
        return;
    }
    const fuelBeforeActual = percentToActual(fuelPctBefore, initConfig.total_fuel_capacity);
    const chargeBeforeActual = percentToActual(chargePctBefore, initConfig.total_elec_capacity);
    
    let newRecord = {
        id: generateUUID(), type: currentEventType, timestamp: Date.now(),
        total_mileage: total, hev_mileage: hev, amount_money: amount,
        fuel_percent_before: fuelPctBefore, charge_percent_before: chargePctBefore,
        fuel_before_actual: fuelBeforeActual, charge_before_actual: chargeBeforeActual,
        fuel_percent_after: null, charge_percent_after: null,
        fuel_after_actual: null, charge_after_actual: null,
        energy_added: null
    };
    
    if (currentEventType === 'fuel') {
        const fuelPctAfter = parseFloat(fuelPercentAfter.value);
        if (isNaN(fuelPctAfter) || fuelPctAfter < 0 || fuelPctAfter > 100 || fuelPctAfter < fuelPctBefore) {
            alert('加油后油量百分比无效（应 ≥ 加油前油量）');
            return;
        }
        const added = parseFloat(fuelAmount.value);
        if (isNaN(added) || added <= 0) {
            alert('请输入有效的加油量(升)');
            return;
        }
        newRecord.fuel_percent_after = fuelPctAfter;
        newRecord.charge_percent_after = chargePctBefore;
        newRecord.fuel_after_actual = percentToActual(fuelPctAfter, initConfig.total_fuel_capacity);
        newRecord.charge_after_actual = chargeBeforeActual;
        newRecord.energy_added = added;
    } else {
        const chargePctAfter = parseFloat(chargePercentAfter.value);
        if (isNaN(chargePctAfter) || chargePctAfter < 0 || chargePctAfter > 100 || chargePctAfter < chargePctBefore) {
            alert('充电后电量百分比无效（应 ≥ 充电前电量）');
            return;
        }
        const added = parseFloat(chargeAmount.value);
        if (isNaN(added) || added <= 0) {
            alert('请输入有效的充电量(kWh)');
            return;
        }
        newRecord.charge_percent_after = chargePctAfter;
        newRecord.fuel_percent_after = fuelPctBefore;
        newRecord.charge_after_actual = percentToActual(chargePctAfter, initConfig.total_elec_capacity);
        newRecord.fuel_after_actual = fuelBeforeActual;
        newRecord.energy_added = added;
    }
    
    records.push(newRecord);
    recalcAllConsumptions();
    try {
        const res = await fetch(`${API_BASE}/records`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.userId, record: newRecord })
        });
        const data = await res.json();
        if (res.ok) {
            renderAll();
            totalMileageInp.value = '';
            hevMileageInp.value = '';
            amountInp.value = '';
            fuelPercentBefore.value = '';
            chargePercentBefore.value = '';
            if (currentEventType === 'fuel') {
                fuelPercentAfter.value = '';
                fuelAmount.value = '';
            } else {
                chargePercentAfter.value = '';
                chargeAmount.value = '';
            }
        } else {
            alert('保存失败：' + (data.error || '未知错误'));
            records.pop();
        }
    } catch (err) {
        console.error('保存记录网络错误:', err);
        alert('网络错误：' + err.message);
        records.pop();
    }
}

async function deleteRecord(id) {
    if (confirm('删除记录？')) {
        await fetch(`${API_BASE}/records/${currentUser.userId}/${id}`, { method: 'DELETE' });
        records = records.filter(r => r.id !== id);
        recalcAllConsumptions();
        renderAll();
    }
}

async function clearAllRecords() {
    if (confirm('清空所有记录？')) {
        await fetch(`${API_BASE}/records/${currentUser.userId}`, { method: 'DELETE' });
        records = [];
        renderAll();
    }
}

function updateTotalCost() {
    const total = records.reduce((sum, rec) => sum + (rec.amount_money || 0), 0);
    const costSpan = document.getElementById('totalCostDisplay');
    if (costSpan) costSpan.innerText = `累计花费: ¥${total.toFixed(2)}`;
}

function renderTable() {
    if (!initConfig) {
        tableBody.innerHTML = '<tr><td colspan="12">请先在个人中心设置车辆参数</td></tr>';
        return;
    }
    const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
    if (sorted.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="12">暂无记录</td></tr>';
        updateTotalCost();
        return;
    }
    
    // 计算区间里程（按时间顺序相邻记录的总里程差值）
    const sortedAsc = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const intervalMap = new Map();
    let lastTotalMileage = null;
    for (let rec of sortedAsc) {
        let interval = null;
        if (lastTotalMileage !== null) {
            interval = rec.total_mileage - lastTotalMileage;
            if (interval <= 0) interval = null;
        }
        intervalMap.set(rec.id, interval);
        lastTotalMileage = rec.total_mileage;
    }
    
    let html = '';
    for (let rec of sorted) {
        const dateStr = rec.timestamp ? new Date(rec.timestamp).toLocaleString() : '未知';
        const typeLabel = rec.type === 'fuel' ? '⛽加油' : '🔋充电';
        const badgeClass = rec.type === 'fuel' ? 'badge-fuel' : 'badge-ev';
        const totalMile = (rec.total_mileage != null && !isNaN(rec.total_mileage)) ? rec.total_mileage.toFixed(1) : '—';
        const hevMile = (rec.hev_mileage != null && !isNaN(rec.hev_mileage)) ? rec.hev_mileage.toFixed(1) : '—';
        const evMile = (totalMile !== '—' && hevMile !== '—') ? (parseFloat(totalMile) - parseFloat(hevMile)).toFixed(1) : '—';
        const amount = (rec.amount_money != null && !isNaN(rec.amount_money)) ? rec.amount_money.toFixed(2) : '—';
        
        let energyAdded = '—';
        if (rec.energy_added != null && !isNaN(rec.energy_added)) {
            energyAdded = rec.type === 'fuel' ? `${rec.energy_added.toFixed(1)} L` : `${rec.energy_added.toFixed(1)} kWh`;
        }
        
        const intervalKm = intervalMap.get(rec.id);
        const intervalDisplay = (intervalKm !== null && !isNaN(intervalKm)) ? intervalKm.toFixed(1) : '—';
        
        const fuelShow = (rec.fuel_consumption != null && !isNaN(rec.fuel_consumption)) ? rec.fuel_consumption.toFixed(2) : '—';
        const elecShow = (rec.elec_consumption != null && !isNaN(rec.elec_consumption)) ? rec.elec_consumption.toFixed(2) : '—';
        const totalShow = (rec.total_consumption != null && !isNaN(rec.total_consumption)) ? rec.total_consumption.toFixed(2) : '—';
        
        html += `<tr>
            <td>${dateStr}</td>
            <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
            <td>${totalMile}</td>
            <td>${hevMile}</td>
            <td>${evMile}</td>
            <td>¥${amount}</td>
            <td>${energyAdded}</td>
            <td>${intervalDisplay}</td>
            <td style="font-weight:600; color:#c46b1a;">${fuelShow}</td>
            <td style="font-weight:600; color:#197e9e;">${elecShow}</td>
            <td style="font-weight:600; color:#2b6e4f;">${totalShow}</td>
            <td><button class="delete-btn" data-id="${rec.id}">🗑️</button></td>
        </tr>`;
    }
    tableBody.innerHTML = html;
    document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (e) => deleteRecord(btn.dataset.id)));
    updateTotalCost();
}

function updateChart() {
    if (!initConfig) return;
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp).filter(r => r.fuel_consumption !== null && r.elec_consumption !== null && r.total_consumption !== null);
    const labels = sorted.map(r => new Date(r.timestamp).toLocaleDateString());
    const fuelData = sorted.map(r => r.fuel_consumption);
    const elecData = sorted.map(r => r.elec_consumption);
    const totalData = sorted.map(r => r.total_consumption);
    if (unifiedChart) unifiedChart.destroy();
    const ctx = document.getElementById('unifiedChart').getContext('2d');
    unifiedChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels, datasets: [
                { label: '油耗 (L/100km)', data: fuelData, borderColor: '#e67e22', yAxisID: 'y', tension: 0.2 },
                { label: '总能耗 (L/100km)', data: totalData, borderColor: '#2b6e4f', yAxisID: 'y', tension: 0.2 },
                { label: '电耗 (kWh/100km)', data: elecData, borderColor: '#2c7da0', yAxisID: 'y1', tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            scales: {
                y: { title: { display: true, text: '油耗/总能耗 (L/100km)' } },
                y1: { position: 'right', title: { text: '电耗 (kWh/100km)' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function renderAll() {
    renderTable();
    updateChart();
}

// 导出 Excel
async function exportToExcel() {
    if (!initConfig || records.length === 0) {
        alert('暂无数据可导出');
        return;
    }
    const exportData = records.map(rec => ({
        '时间': new Date(rec.timestamp).toLocaleString(),
        '类型': rec.type === 'fuel' ? '加油' : '充电',
        '总里程(km)': rec.total_mileage ?? '',
        'HEV里程(km)': rec.hev_mileage ?? '',
        'EV里程(km)': (rec.total_mileage - rec.hev_mileage).toFixed(1),
        '金额(元)': rec.amount_money ?? '',
        '补能量': rec.type === 'fuel' ? `${rec.energy_added?.toFixed(2)} L` : `${rec.energy_added?.toFixed(2)} kWh`,
        '区间里程(km)': rec.interval_mileage ?? '',
        '油耗(L/100km)': rec.fuel_consumption?.toFixed(2) ?? '',
        '电耗(kWh/100km)': rec.elec_consumption?.toFixed(2) ?? '',
        '总能耗(L/100km)': rec.total_consumption?.toFixed(2) ?? ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '能耗记录');
    XLSX.writeFile(wb, `能耗记录_${new Date().toISOString().slice(0,19)}.xlsx`);
}

// 导入 Excel
const fileInput = document.getElementById('excelFileInput');
const importBtn = document.getElementById('importExcelBtn');
if (importBtn) {
    importBtn.addEventListener('click', () => fileInput.click());
}
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            if (rows.length === 0) {
                alert('Excel文件无数据');
                return;
            }
            const recordsToImport = [];
            for (let row of rows) {
                let type = row['类型'] === '充电' ? 'ev' : 'fuel';
                const parseNumber = (val) => {
                    if (val === undefined || val === null || val === '') return null;
                    const num = parseFloat(val);
                    return isNaN(num) ? null : num;
                };
                const timestamp = row['时间'] ? new Date(row['时间']).getTime() : Date.now();
                const total_mileage = parseNumber(row['总里程(km)']);
                const hev_mileage = parseNumber(row['HEV里程(km)']);
                const amount_money = parseNumber(row['金额(元)']);
                const energy_added = parseNumber(row['补能量']?.split(' ')[0]); // 提取数值部分
                
                if (total_mileage === null || hev_mileage === null || amount_money === null) continue;
                // 注意：导入时需要操作前后油量电量，但表格没有，我们这里简单填0（实际导入需要更复杂处理）
                // 建议导入时在导出时包含这些字段，简化处理：直接使用0，用户需自行修正。
                // 为简化，这里仅导入基础数据，能耗需重新计算。
                recordsToImport.push({
                    id: generateUUID(),
                    type: type,
                    timestamp: timestamp,
                    total_mileage: total_mileage,
                    hev_mileage: hev_mileage,
                    amount_money: amount_money,
                    energy_added: energy_added,
                    // 缺失字段填默认值
                    fuel_percent_before: 0,
                    charge_percent_before: 0,
                    fuel_percent_after: null,
                    charge_percent_after: null,
                    fuel_before_actual: 0,
                    charge_before_actual: 0,
                    fuel_after_actual: null,
                    charge_after_actual: null,
                    fuel_consumption: null,
                    elec_consumption: null,
                    total_consumption: null
                });
            }
            if (recordsToImport.length === 0) {
                alert('没有有效记录可导入');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/records/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.userId, records: recordsToImport })
                });
                const result = await res.json();
                if (res.ok) {
                    alert(`成功导入 ${result.count} 条记录`);
                    await loadUserData();
                    recalcAllConsumptions();
                    renderAll();
                } else {
                    alert('导入失败: ' + (result.error || '未知错误'));
                }
            } catch (err) {
                alert('网络错误: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
        fileInput.value = '';
    });
}

// 导出按钮绑定
const exportBtn = document.getElementById('exportExcelBtn');
if (exportBtn) exportBtn.addEventListener('click', exportToExcel);

// 切换事件类型
function setEventTypeUI(type) {
    currentEventType = type;
    document.querySelectorAll('.type-btn').forEach(btn => {
        if (btn.dataset.type === type) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (type === 'fuel') {
        afterFuelField.style.display = 'flex';
        afterChargeField.style.display = 'none';
        fuelPercentAfter.required = true;
        chargePercentAfter.required = false;
        fuelAmountField.style.display = 'block';
        chargeAmountField.style.display = 'none';
        fuelAmount.required = true;
        chargeAmount.required = false;
    } else {
        afterFuelField.style.display = 'none';
        afterChargeField.style.display = 'flex';
        fuelPercentAfter.required = false;
        chargePercentAfter.required = true;
        fuelAmountField.style.display = 'none';
        chargeAmountField.style.display = 'block';
        fuelAmount.required = false;
        chargeAmount.required = true;
    }
}
document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', () => setEventTypeUI(btn.dataset.type)));

// 按钮事件绑定
submitBtn.onclick = addRecord;
clearAllBtn.onclick = clearAllRecords;
showLoginBtn.onclick = () => { loginForm.style.display = 'block'; registerForm.style.display = 'none'; if (authMsg) authMsg.innerText = ''; };
showRegisterBtn.onclick = () => { loginForm.style.display = 'none'; registerForm.style.display = 'block'; if (authMsg) authMsg.innerText = ''; };

// 回车登录
const loginPasswordInput = document.getElementById('loginPassword');
if (loginPasswordInput) {
    loginPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doLoginBtn.click(); }
    });
}

// 尝试自动恢复登录状态
const savedUserId = localStorage.getItem('ces_userId');
const savedUsername = localStorage.getItem('ces_username');
if (savedUserId && savedUsername) {
    currentUser = { userId: savedUserId, username: savedUsername };
    userNameSpan.innerText = `👤 ${savedUsername}`;
    userNameSpan.style.cursor = 'pointer';
    userNameSpan.onclick = showProfileModal;
    authCard.style.display = 'none';
    mainApp.style.display = 'block';
    loadUserData().then(() => renderAll());
} else {
    // 未登录，显示登录界面
    showLoginBtn.click();
}