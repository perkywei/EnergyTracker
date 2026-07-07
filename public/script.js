const API_BASE = '/api';
let currentUser = null;
let initConfig = null;
let records = [];
let currentEventType = 'fuel';
let unifiedChart = null;
let currentPage = 1;
let pageSize = 10;
let vehicles = [];
let currentVehicleId = null;
let currentVehicle = null;

// 获取认证请求头
function getAuthHeaders() {
    const token = sessionStorage.getItem('ces_token');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
}

// 调试日志
function debugLog(msg) {
    console.log('[DEBUG]', msg);
    var panel = document.getElementById('debugPanel');
    if (panel) {
        var line = document.createElement('div');
        line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
        panel.appendChild(line);
        if (panel.children.length > 50) panel.removeChild(panel.firstChild);
        panel.scrollTop = panel.scrollHeight;
    }
}

// DOM 元素
const authCard = document.getElementById('authView');
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
const electricityPriceInp = document.getElementById('electricityPrice');
const refuelTimeInp = document.getElementById('refuelTimeInput');
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
const trashBtn = document.getElementById('trashBtn');
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const vehicleListContainer = document.getElementById('vehicleList');
const addVehicleBtn = document.getElementById('addVehicleBtn');
const userMenu = document.getElementById('userMenu');
const userAvatar = document.getElementById('userAvatar');

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
    // close any existing profile modal first
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const vtype = initConfig?.vehicle_type || 'erev_phev';
    const hevLabel = vtype === 'bev' ? 'HEV里程 (km，纯电固定为0)' : vtype === 'ice' ? '当前总里程需=HEV里程' : '当前HEV里程 (km)';
    modal.innerHTML = `
        <div class="modal-sheet" style="max-width:600px;">
            <div class="modal-header">
                <div class="modal-title">👤 个人中心 - ${currentUser.username}</div>
                <button class="modal-close" id="closeProfileModalBtn">×</button>
            </div>
            <div class="profile-tab-bar">
                <button id="menuManageBtn" class="profile-tab active">🚗 管理车辆</button>
                <button id="menuPwdBtn" class="profile-tab">🔐 修改密码</button>
            </div>
            <div class="modal-body">
            <div id="vehicleManagePanel" style="display: block;">
                <div id="vehicleListContainer"></div>
                <div style="margin-top:12px;">
                    <button id="showAddVehicleBtn" class="btn">➕ 新增车辆</button>
                </div>
                <div id="addVehicleForm" style="display:none; margin-top:12px; border-top:1px solid var(--glass-border-light); padding-top:12px;">
                    <div style="font-size:14px; font-weight:600; margin-bottom:10px;">新增车辆</div>
                    <div class="form-group"><label class="form-label">车辆名称</label><input id="newVName" class="form-input" type="text" placeholder="例如：我的Model3"></div>
                    <div class="type-radio-group" style="margin-top:8px;">
                        <label class="type-radio"><input type="radio" name="newVtype" value="erev_phev" checked> 增程/插混</label>
                        <label class="type-radio"><input type="radio" name="newVtype" value="bev"> 纯电</label>
                        <label class="type-radio"><input type="radio" name="newVtype" value="ice"> 纯油</label>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                        <div class="form-group newV-fuel-field" id="newVCapField"><label class="form-label">油箱总容量 (升)</label><input id="newVFuelCap" class="form-input" type="number" step="0.1" placeholder="例如 50"></div>
                        <div class="form-group newV-elec-field" id="newVElecCapField"><label class="form-label">电池总容量 (kWh)</label><input id="newVElecCap" class="form-input" type="number" step="0.1" placeholder="例如 40"></div>
                        <div class="form-group"><label class="form-label">当前总里程 (km)</label><input id="newVTotal" class="form-input" type="number" step="0.1" placeholder="起始里程"></div>
                        <div class="form-group newV-hev-field" id="newVHevField"><label class="form-label">当前HEV里程 (km)</label><input id="newVHev" class="form-input" type="number" step="0.1" placeholder="燃油里程"></div>
                        <div class="form-group newV-fuel-field" id="newVFuelPctField"><label class="form-label">当前油量 (%)</label><input id="newVFuelPct" class="form-input" type="number" step="0.1" placeholder="0~100"></div>
                        <div class="form-group newV-elec-field" id="newVChargePctField"><label class="form-label">当前电量 (%)</label><input id="newVChargePct" class="form-input" type="number" step="0.1" placeholder="0~100"></div>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button id="confirmAddVehicleBtn" class="btn btn-primary">确认添加</button>
                        <button id="cancelAddVehicleBtn" class="btn">取消</button>
                    </div>
                    <div id="addVehicleMsg" style="margin-top:8px; font-size:12px; color:var(--red);"></div>
                </div>
            </div>
            <div id="pwdPanel" style="display: none;">
                <div class="form-group"><label class="form-label">原密码</label><input type="password" class="form-input" id="oldPwd" placeholder="原密码"></div>
                <div class="form-group"><label class="form-label">新密码</label><input type="password" class="form-input" id="newPwd" placeholder="新密码(至少4位)"></div>
                <div class="form-group"><label class="form-label">确认新密码</label><input type="password" class="form-input" id="confirmPwd" placeholder="再次输入新密码"></div>
                <div style="margin-top:12px;"><button id="changePwdBtn" class="btn">确认修改</button></div>
            </div>
            </div>
            <div id="profileMsg" style="padding:0 20px 8px; font-size:12px; color:var(--red);"></div>
            <div class="modal-footer">
                <button id="logoutProfileBtn" class="btn" style="color:var(--red);">退出登录</button>
                <button id="closeModalFooterBtn" class="btn btn-primary">关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const vehicleManagePanel = modal.querySelector('#vehicleManagePanel');
    const pwdPanel = modal.querySelector('#pwdPanel');
    const menuManageBtn = modal.querySelector('#menuManageBtn');
    const menuPwdBtn = modal.querySelector('#menuPwdBtn');
    const closeBtn = modal.querySelector('#closeProfileModalBtn');
    const closeFooterBtn = modal.querySelector('#closeModalFooterBtn');
    const profileMsg = modal.querySelector('#profileMsg');

    const logoutProfileBtn = modal.querySelector('#logoutProfileBtn');
    if (logoutProfileBtn) logoutProfileBtn.onclick = () => { modal.remove(); logout(); };

    function switchProfileTab(activeBtn) {
        [menuManageBtn, menuPwdBtn].forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
        vehicleManagePanel.style.display = activeBtn === menuManageBtn ? 'block' : 'none';
        pwdPanel.style.display = activeBtn === menuPwdBtn ? 'block' : 'none';
        profileMsg.innerText = '';
    }

    renderVehicleList(modal);
    menuManageBtn.onclick = () => {
        switchProfileTab(menuManageBtn);
        renderVehicleList(modal);
    };
    menuPwdBtn.onclick = () => switchProfileTab(menuPwdBtn);
    closeBtn.onclick = () => modal.remove();
    if (closeFooterBtn) closeFooterBtn.onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        const changePwdBtn = modal.querySelector('#changePwdBtn');
    changePwdBtn.onclick = async () => {
        const oldPwd = modal.querySelector('#oldPwd').value;
        const newPwd = modal.querySelector('#newPwd').value;
        const confirmPwd = modal.querySelector('#confirmPwd').value;
        if (!oldPwd || !newPwd || !confirmPwd) {
            profileMsg.innerText = '请填写原密码、新密码和确认密码';
            return;
        }
        if (newPwd !== confirmPwd) {
            profileMsg.innerText = '两次输入的新密码不一致';
            return;
        }
        if (newPwd.length < 4) {
            profileMsg.innerText = '新密码至少4位';
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/change-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
    
    // 初始化车辆管理表单
    initAddVehicleForm(modal);
}

// ===== 车辆管理逻辑 =====

// 渲染车辆管理列表
function renderVehicleList(modal) {
    const container = modal.querySelector('#vehicleListContainer');
    if (!container) return;
    if (vehicles.length === 0) {
        container.innerHTML = '<p style="color:var(--text3);">暂无车辆</p>';
        return;
    }
    let html = '<div style="display:flex; flex-direction:column; gap:0.5rem;">';
    vehicles.forEach(v => {
        const isActive = v.id === currentVehicleId;
        const typeLabel = {erev_phev:'增程/插混',bev:'纯电',ice:'纯油'}[v.vehicle_type] || v.vehicle_type;
        html += `<div class="sidebar-item" style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.6rem; background:${isActive?'var(--glass-highlight)':'var(--glass-light)'}; border-radius:8px;">` +
            `<div><span style="font-weight:600;">${v.name || '车辆'+v.id}</span><br><small style="color:var(--text3);">${typeLabel} · ${v.init_total_mileage}km</small></div>` +
            `<span style="display:flex; gap:0.3rem; align-items:center;">` +
            `<button class="rename-vehicle-btn btn" data-id="${v.id}" data-name="${v.name||'车辆'+v.id}" style="padding:0 4px; font-size:12px; background:transparent; border:1px solid var(--glass-border-light); border-radius:4px; color:var(--text3);">✏️</button>` +
            (isActive ? '<span class="badge" style="background:var(--accent); color:white; padding:1px 8px; border-radius:10px; font-size:11px; align-self:center;">当前</span>' :
            `<button class="switch-vehicle-btn btn" data-id="${v.id}" style="padding:2px 8px; font-size:12px;">切换</button>`) +
            (vehicles.length > 1 ? `<button class="delete-vehicle-btn btn" data-id="${v.id}" data-name="${v.name||'车辆'+v.id}" style="padding:2px 8px; font-size:12px; color:var(--red);">删除</button>` : '') +
            `</span></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    
    // 切换按钮
    container.querySelectorAll('.switch-vehicle-btn').forEach(btn => {
        btn.onclick = async () => {
            const vid = parseInt(btn.dataset.id);
            await switchVehicle(vid);
            modal.remove();
        };
    });
    // 删除按钮
    container.querySelectorAll('.rename-vehicle-btn').forEach(btn => {
        btn.onclick = async () => {
            const vid = parseInt(btn.dataset.id);
            const veh = vehicles.find(v => v.id === vid);
            if (!veh) return;
            // 创建编辑弹窗
            const editOverlay = document.createElement('div');
            editOverlay.className = 'modal-overlay';
            const vt = veh.vehicle_type || 'erev_phev';
            const hevLabel = vt === 'bev' ? 'HEV里程 (km，纯电固定为0)' : vt === 'ice' ? '当前总里程需=HEV里程' : '当前HEV里程 (km)';
            editOverlay.innerHTML = '<div class="modal-sheet" style="max-width:520px;">' +
                '<div class="modal-header"><div class="modal-title">✏️ 编辑车辆 - ' + (veh.name || '车辆'+vid) + '</div><button class="modal-close" id="closeEditVehBtn">×</button></div>' +
                '<div class="modal-body"><div style="margin-bottom:10px;"><label class="form-label">车辆名称</label><input id="editVName" class="form-input" type="text" value="' + (veh.name || '') + '"></div>' +
                '<div class="type-radio-group"><label class="type-radio"><input type="radio" name="editVType" value="erev_phev"' + (vt==='erev_phev'?' checked':'') + '> 增程/插混</label>' +
                '<label class="type-radio"><input type="radio" name="editVType" value="bev"' + (vt==='bev'?' checked':'') + '> 纯电</label>' +
                '<label class="type-radio"><input type="radio" name="editVType" value="ice"' + (vt==='ice'?' checked':'') + '> 纯油</label></div>' +
                '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">' +
                '<div class="form-group editV-fuel-field" id="editVFuelCapField"><label class="form-label">油箱总容量 (升)</label><input id="editVFuelCap" class="form-input" type="number" step="0.1" value="' + (veh.total_fuel_capacity || '') + '"></div>' +
                '<div class="form-group editV-elec-field" id="editVElecCapField"><label class="form-label">电池总容量 (kWh)</label><input id="editVElecCap" class="form-input" type="number" step="0.1" value="' + (veh.total_elec_capacity || '') + '"></div>' +
                '<div class="form-group"><label class="form-label">当前总里程 (km)</label><input id="editVTotal" class="form-input" type="number" step="0.1" value="' + (veh.init_total_mileage || '') + '"></div>' +
                '<div class="form-group" id="editVHevField"><label class="form-label">' + hevLabel + '</label><input id="editVHev" class="form-input" type="number" step="0.1" value="' + (veh.init_hev_mileage || '') + '"' + (vt==='bev'?' disabled':'') + '></div>' +
                '<div class="form-group editV-fuel-field" id="editVFuelPctField"><label class="form-label">当前油量 (%)</label><input id="editVFuelPct" class="form-input" type="number" step="0.1" value="' + (veh.init_fuel_percent || '') + '"></div>' +
                '<div class="form-group editV-elec-field" id="editVChargePctField"><label class="form-label">当前电量 (%)</label><input id="editVChargePct" class="form-input" type="number" step="0.1" value="' + (veh.init_charge_percent || '') + '"></div></div>' +
                '<div style="margin-top:12px;"><button id="editVSaveBtn" class="btn btn-primary">保存</button></div></div></div>';

            document.body.appendChild(editOverlay);
            const closeEditBtn = editOverlay.querySelector('#closeEditVehBtn');
            if (closeEditBtn) closeEditBtn.onclick = () => editOverlay.remove();
            editOverlay.addEventListener('click', (e) => { if (e.target === editOverlay) editOverlay.remove(); });

            // 车型切换联动
            const typeRads = editOverlay.querySelectorAll('input[name="editVType"]');
            typeRads.forEach(r => r.onchange = () => {
                const vt2 = editOverlay.querySelector('input[name="editVType"]:checked').value;
                const hevF = editOverlay.querySelector('#editVHevField');
                const hevInp = editOverlay.querySelector('#editVHev');
                const fuelCapF = editOverlay.querySelector('#editVFuelCapField');
                const elecCapF = editOverlay.querySelector('#editVElecCapField');
                const fuelPctF = editOverlay.querySelector('#editVFuelPctField');
                const chargePctF = editOverlay.querySelector('#editVChargePctField');
                if (vt2 === 'bev') {
                    hevF.style.display = ''; hevInp.disabled = true; hevInp.value = '0';
                    fuelCapF.style.display = 'none'; fuelPctF.style.display = 'none';
                    elecCapF.style.display = ''; chargePctF.style.display = '';
                } else if (vt2 === 'ice') {
                    hevF.style.display = ''; hevInp.disabled = true;
                    const tv = editOverlay.querySelector('#editVTotal').value;
                    if (tv) hevInp.value = tv;
                    fuelCapF.style.display = ''; fuelPctF.style.display = '';
                    elecCapF.style.display = 'none'; chargePctF.style.display = 'none';
                } else {
                    hevF.style.display = ''; hevInp.disabled = false;
                    fuelCapF.style.display = ''; fuelPctF.style.display = '';
                    elecCapF.style.display = ''; chargePctF.style.display = '';
                }
            });
            // 触发初始状态
            var cr = editOverlay.querySelector("input[name=\"editVType\"]:checked");
            if (cr) cr.onchange();
            // 总里程联动HEV（纯油）
            editOverlay.querySelector('#editVTotal').addEventListener('input', function() {
                var ck = editOverlay.querySelector('input[name="editVType"]:checked');
                if (ck && ck.value === 'ice') editOverlay.querySelector('#editVHev').value = this.value;
            });

            // 保存
            editOverlay.querySelector('#editVSaveBtn').onclick = async () => {
                const saveBtn = editOverlay.querySelector('#editVSaveBtn');
                saveBtn.disabled = true;
                const vt2 = editOverlay.querySelector('input[name="editVType"]:checked').value;
                const isBEV = vt2 === 'bev';
                const isICE = vt2 === 'ice';
                const vehicleData = {
                    name: editOverlay.querySelector('#editVName').value.trim(),
                    vehicleType: vt2,
                    totalFuelCapacity: isBEV ? 0 : parseFloat(editOverlay.querySelector('#editVFuelCap').value) || 0,
                    totalElecCapacity: isICE ? 0 : parseFloat(editOverlay.querySelector('#editVElecCap').value) || 0,
                    initTotalMileage: parseFloat(editOverlay.querySelector('#editVTotal').value) || 0,
                    initHevMileage: isBEV ? 0 : (isICE ? parseFloat(editOverlay.querySelector('#editVTotal').value) || 0 : parseFloat(editOverlay.querySelector('#editVHev').value) || 0),
                    initFuelPercent: isBEV ? 0 : parseFloat(editOverlay.querySelector('#editVFuelPct').value) || 0,
                    initChargePercent: isICE ? 0 : parseFloat(editOverlay.querySelector('#editVChargePct').value) || 0
                };
                try {
                    const res = await fetch(`${API_BASE}/vehicles/${vid}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({ userId: currentUser.userId, vehicle: vehicleData })
                    });
                    if (res.ok) {
                        editOverlay.remove();
                        await loadVehicles();
                        await loadUserData();
                        recalcAllConsumptions();
                        try { await saveRecordsToServer(); } catch (_) {}
                        renderAll();
                        updateVehicleSelectorUI();
                        renderVehicleList(modal);
                    } else {
                        const err = await res.json();
                        alert(err.error || '保存失败');
                        saveBtn.disabled = false;
                    }
                } catch (e) {
                    alert('网络错误：' + e.message);
                    saveBtn.disabled = false;
                }
            };
        };
    });
    container.querySelectorAll('.delete-vehicle-btn').forEach(btn => {
        btn.onclick = async () => {
            const vid = parseInt(btn.dataset.id);
            const name = btn.dataset.name;
            if (!confirm('确定删除「'+name+'」？关联的能耗记录也将永久删除！')) return;
            try {
                const res = await fetch(`${API_BASE}/vehicles/${vid}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({ userId: currentUser.userId, confirm: true })
                });
                const data = await res.json();
                if (res.ok) {
                    await loadVehicles();
                    if (currentVehicleId === vid) {
                        if (vehicles.length > 0) {
                            currentVehicleId = vehicles[0].id;
                            currentVehicle = vehicles[0];
                        }
                    }
                    await loadUserData();
                    recalcAllConsumptions();
                    renderAll();
                    renderVehicleList(modal);
                    updateVehicleSelectorUI();
                } else {
                    alert(data.error || '删除失败');
                }
            } catch (e) { alert('网络错误: ' + e.message); }
        };
    });
}

// 新增车辆表单显示/隐藏
function initAddVehicleForm(modal) {
    const form = modal.querySelector('#addVehicleForm');
    const showBtn = modal.querySelector('#showAddVehicleBtn');
    const cancelBtn = modal.querySelector('#cancelAddVehicleBtn');
    const confirmBtn = modal.querySelector('#confirmAddVehicleBtn');
    const msgEl = modal.querySelector('#addVehicleMsg');
    
    showBtn.onclick = () => { form.style.display = 'block'; showBtn.style.display = 'none'; };
    cancelBtn.onclick = () => { form.style.display = 'none'; showBtn.style.display = ''; msgEl.innerText = ''; };
    
    // 车型切换显示字段
    const vtypeRads = form.querySelectorAll('input[name="newVtype"]');
    vtypeRads.forEach(r => r.onchange = () => {
        const vt = form.querySelector('input[name="newVtype"]:checked').value;
        const fuelField = form.querySelector('#newVCapField');
        const elecField = form.querySelector('#newVElecCapField');
        const hevField = form.querySelector('#newVHevField');
        const fuelPctField = form.querySelector('#newVFuelPctField');
        const chargePctField = form.querySelector('#newVChargePctField');
        fuelField.style.display = (vt==='erev_phev'||vt==='ice') ? '' : 'none';
        elecField.style.display = (vt==='erev_phev'||vt==='bev') ? '' : 'none';
        hevField.style.display = vt==='erev_phev' ? '' : 'none';
        fuelPctField.style.display = (vt==='erev_phev'||vt==='ice') ? '' : 'none';
        chargePctField.style.display = (vt==='erev_phev'||vt==='bev') ? '' : 'none';
    });
    // 手动触发初始
    if (vtypeRads.length > 0) vtypeRads[0].onchange();
    
    confirmBtn.onclick = async () => {
        const name = form.querySelector('#newVName').value.trim();
        const vt = form.querySelector('input[name="newVtype"]:checked').value;
        const isBEV = vt === 'bev';
        const isICE = vt === 'ice';
        
        const total = parseFloat(form.querySelector('#newVTotal').value);
        if (isNaN(total) || total <= 0) { msgEl.innerText = '总里程必须>0'; return; }
        
        let fuelCap, elecCap, hev, fuelPct, chargePct;
        if (vt === 'erev_phev' || isICE) {
            fuelCap = parseFloat(form.querySelector('#newVFuelCap').value);
            if (isNaN(fuelCap) || fuelCap <= 0) { msgEl.innerText = '油箱容量必须>0'; return; }
            fuelPct = parseFloat(form.querySelector('#newVFuelPct').value);
            if (isNaN(fuelPct) || fuelPct < 0 || fuelPct > 100) { msgEl.innerText = '油量百分比0~100'; return; }
        }
        if (vt === 'erev_phev') {
            hev = parseFloat(form.querySelector('#newVHev').value);
            if (isNaN(hev) || hev < 0 || hev > total) { msgEl.innerText = 'HEV里程无效'; return; }
        }
        if (vt === 'erev_phev' || isBEV) {
            elecCap = parseFloat(form.querySelector('#newVElecCap').value);
            if (isNaN(elecCap) || elecCap <= 0) { msgEl.innerText = '电池容量必须>0'; return; }
            chargePct = parseFloat(form.querySelector('#newVChargePct').value);
            if (isNaN(chargePct) || chargePct < 0 || chargePct > 100) { msgEl.innerText = '电量百分比0~100'; return; }
        }
        
        msgEl.innerText = '添加中...';
        try {
            const res = await fetch(`${API_BASE}/vehicles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ userId: currentUser.userId, vehicle: {
                    name, vehicleType: vt,
                    totalFuelCapacity: fuelCap || 0, totalElecCapacity: elecCap || 0,
                    initTotalMileage: total, initHevMileage: hev || 0,
                    initFuelPercent: fuelPct || 0, initChargePercent: chargePct || 0
                }})
            });
            const data = await res.json();
            if (res.ok) {
                msgEl.innerText = '添加成功！';
                form.style.display = 'none';
                modal.querySelector('#showAddVehicleBtn').style.display = '';
                // 刷新车辆列表
                await loadVehicles();
                if (currentVehicleId === null || vehicles.length === 1) {
                    currentVehicleId = vehicles[0].id;
                }
                await loadUserData();
                recalcAllConsumptions();
                renderAll();
                renderVehicleList(modal);
                updateVehicleSelectorUI();
            } else {
                msgEl.innerText = data.error || '添加失败';
            }
        } catch (e) { msgEl.innerText = '网络错误: ' + e.message; }
    };
}

// 在 showProfileModal 中初始化
// 在已有 modal 创建后的绑定代码末尾追加

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
// 协议弹窗关闭按钮
const agreeCloseBtn = document.getElementById('agreeCloseBtn');
if (agreeCloseBtn) agreeCloseBtn.onclick = hideAgreementModal;

// 点击模态框外部关闭（点击遮罩层）
const agreementModal = document.getElementById('agreementModal');
if (agreementModal) {
    agreementModal.addEventListener('click', (e) => {
        if (e.target === agreementModal) hideAgreementModal();
    });
}

// 提取注册逻辑为独立函数（原有验证逻辑不动）
function getRegVtype() {
    const active = document.querySelector('.reg-vtype-btn.active');
    return active ? active.dataset.vtype : 'erev_phev';
}

function updateRegFormFields(vtype) {
    const fuelFields = document.querySelectorAll('.reg-fuel-field');
    const elecFields = document.querySelectorAll('.reg-elec-field');
    const hevFields = document.querySelectorAll('.reg-hev-field');
    if (vtype === 'bev') {
        fuelFields.forEach(el => el.style.display = 'none');
        elecFields.forEach(el => el.style.display = '');
        hevFields.forEach(el => el.style.display = 'none');
    } else if (vtype === 'ice') {
        fuelFields.forEach(el => el.style.display = '');
        elecFields.forEach(el => el.style.display = 'none');
        hevFields.forEach(el => el.style.display = 'none');
    } else {
        fuelFields.forEach(el => el.style.display = '');
        elecFields.forEach(el => el.style.display = '');
        hevFields.forEach(el => el.style.display = '');
    }
}

// 注册页车型切换
const regVtypeBtns = document.querySelectorAll('.reg-vtype-btn');
regVtypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        regVtypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateRegFormFields(btn.dataset.vtype);
    });
});

async function doRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const licenseCode = document.getElementById('regLicense').value.trim();
    const vtype = getRegVtype();
    const isBEV = vtype === 'bev';
    const isICE = vtype === 'ice';
    const isPHEV = vtype === 'erev_phev';

    if (!username || !password) return showAgreeMsg('用户名和密码不能为空');
    if (!licenseCode) return showAgreeMsg('请填写注册码');

    const totalMile = parseFloat(document.getElementById('regTotalMile').value);
    if (isNaN(totalMile) || totalMile <= 0) return showAgreeMsg('总里程必须>0');

    let totalFuelCap, totalElecCap, hevMile, fuelPct, chargePct;

    if (isPHEV || isICE) {
        totalFuelCap = parseFloat(document.getElementById('regFuelCap').value);
        if (isNaN(totalFuelCap) || totalFuelCap <= 0) return showAgreeMsg('油箱容量必须>0');
        fuelPct = parseFloat(document.getElementById('regFuelPct').value);
        if (isNaN(fuelPct) || fuelPct < 0 || fuelPct > 100) return showAgreeMsg('油量百分比0~100');
    }
    if (isPHEV) {
        hevMile = parseFloat(document.getElementById('regHevMile').value);
        if (isNaN(hevMile) || hevMile < 0 || hevMile > totalMile) return showAgreeMsg('HEV里程无效');
    }

    if (isPHEV || isBEV) {
        totalElecCap = parseFloat(document.getElementById('regElecCap').value);
        if (isNaN(totalElecCap) || totalElecCap <= 0) return showAgreeMsg('电池容量必须>0');
        chargePct = parseFloat(document.getElementById('regChargePct').value);
        if (isNaN(chargePct) || chargePct < 0 || chargePct > 100) return showAgreeMsg('电量百分比0~100');
    }

    hideAgreementModal();

    const vehicle = {
        totalFuelCapacity: isPHEV || isICE ? totalFuelCap : 0,
        totalElecCapacity: isPHEV || isBEV ? totalElecCap : 0,
        initTotalMileage: totalMile,
        initHevMileage: isBEV ? 0 : isICE ? totalMile : hevMile,
        initFuelPercent: isPHEV || isICE ? fuelPct : 0,
        initChargePercent: isPHEV || isBEV ? chargePct : 0,
        vehicleType: vtype
    };

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, licenseCode, vehicle })
        });
        const data = await res.json();
        if (res.ok) {
            showLoginBtn.click();
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
            sessionStorage.setItem('ces_userId', data.userId);
            sessionStorage.setItem('ces_username', data.username);
            sessionStorage.setItem('ces_token', data.token);
            sessionStorage.setItem('ces_loginTime', Date.now().toString());
            
            userNameSpan.innerText = `👤 ${data.username}`;
            userNameSpan.style.cursor = 'pointer';
            userNameSpan.onclick = showProfileModal;
            if (userAvatar) userAvatar.innerText = data.username.charAt(0).toUpperCase();
            if (userMenu) userMenu.onclick = showProfileModal;
            authCard.style.display = 'none';
            mainApp.style.display = 'block';
            await loadUserData();
            recalcAllConsumptions();
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
    sessionStorage.removeItem('ces_userId');
    sessionStorage.removeItem('ces_username');
    sessionStorage.removeItem('ces_token');
    
    records = [];
    if (unifiedChart) unifiedChart.destroy();
    unifiedChart = null;
    currentPage = 1;
    pageSize = 10;
    document.getElementById('pageSizeSelect').value = '10';
    authCard.style.display = 'block';
    mainApp.style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    showMessage('已退出登录', false);
}
if (logoutBtn) logoutBtn.onclick = logout;

// 加载用户车辆列表
async function loadVehicles() {
    try {
        const res = await fetch(`${API_BASE}/vehicles/${currentUser.userId}`, { headers: getAuthHeaders() });
        if (res.status === 401) { logout(); return; }
        if (res.ok) vehicles = await res.json();
        else vehicles = [];
        if (vehicles.length > 0) {
            currentVehicleId = vehicles[0].id;
            currentVehicle = vehicles[0];
        }
    } catch (e) { console.error('加载车辆失败:', e); vehicles = []; }
}

// 更新车辆选择器 UI
function updateVehicleSelectorUI() {
    const list = document.getElementById('vehicleList');
    if (!list) return;
    list.innerHTML = '';
    vehicles.forEach(v => {
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (v.id === currentVehicleId ? ' active' : '');
        item.dataset.vid = v.id;
        const icon = v.vehicle_type === 'bev' ? '🔋' : v.vehicle_type === 'ice' ? '⛽' : '⚡⛽';
        item.innerHTML = `<span class="icon">${icon}</span><span class="label">${v.name || '车辆' + v.id}</span>`;
        item.addEventListener('click', async () => {
            if (v.id !== currentVehicleId) {
                await switchVehicle(v.id);
            }
        });
        list.appendChild(item);
    });
    // 如果有多辆车，高亮第一个
    if (!currentVehicle && vehicles.length > 0) {
        // wait for switch to happen
    }
}

// 切换当前车辆
async function switchVehicle(vehicleId) {
    currentVehicleId = vehicleId;
    currentVehicle = vehicles.find(v => v.id === vehicleId) || null;
    await loadUserData();
    recalcAllConsumptions();
    renderAll();
    updateVehicleSelectorUI();
}

// 加载用户数据
async function loadUserData() {
    debugLog('loadUserData() START — currentVehicleId=' + currentVehicleId + ', currentUser=' + (currentUser ? currentUser.username : 'null'));
    try {
        // 先加载车辆（首次会触发迁移）
        if (!currentVehicleId) {
            await loadVehicles();
            debugLog('loadUserData: after loadVehicles — vehicles=' + vehicles.length + ', currentVehicleId=' + currentVehicleId);
            if (!currentUser) { debugLog('loadUserData: no currentUser, BAILING OUT'); return; }
        }
        
        // 加载当前车辆的配置
        const configUrl = currentVehicleId 
            ? `${API_BASE}/config/${currentUser.userId}?vehicleId=${currentVehicleId}`
            : `${API_BASE}/config/${currentUser.userId}`;
        debugLog('loadUserData: fetching config from ' + configUrl);
        const configRes = await fetch(configUrl, { headers: getAuthHeaders() });
        debugLog('loadUserData: config response status=' + configRes.status);
        if (configRes.status === 401) { debugLog('loadUserData: 401 on config, logging out'); logout(); return; }
        if (configRes.ok) {
            initConfig = await configRes.json();
            debugLog('loadUserData: config loaded — vehicle_type=' + (initConfig?.vehicle_type || 'null') + ', fuel_cap=' + (initConfig?.total_fuel_capacity || 0) + ', elec_cap=' + (initConfig?.total_elec_capacity || 0));
        } else { initConfig = null; debugLog('loadUserData: config NOT ok, set to null'); }
        
        // 加载当前车辆的记录
        const recordsUrl = currentVehicleId
            ? `${API_BASE}/records/${currentUser.userId}?vehicleId=${currentVehicleId}`
            : `${API_BASE}/records/${currentUser.userId}`;
        debugLog('loadUserData: fetching records from ' + recordsUrl);
        const recordsRes = await fetch(recordsUrl, { headers: getAuthHeaders() });
        debugLog('loadUserData: records response status=' + recordsRes.status);
        if (recordsRes.status === 401) { debugLog('loadUserData: 401 on records, logging out'); logout(); return; }
        if (recordsRes.ok) {
            records = await recordsRes.json();
            debugLog('loadUserData: records loaded — count=' + records.length);
            if (records.length > 0) {
                var typeSummary = {};
                records.forEach(function(r) { typeSummary[r.type] = (typeSummary[r.type] || 0) + 1; });
                debugLog('loadUserData: types=' + JSON.stringify(typeSummary));
                var withEA = records.filter(function(r) { return r.energy_added != null && r.energy_added > 0; }).length;
                debugLog('loadUserData: records with energy_added>0=' + withEA);
                if (records.length > 0) {
                    var firstRec = records[0];
                    debugLog('loadUserData: first record type=' + firstRec.type + ', energy_added=' + firstRec.energy_added);
                }
            }
        } else { records = []; debugLog('loadUserData: records NOT ok, set to []'); }
        
        currentVehicle = vehicles.find(v => v.id === currentVehicleId) || null;
        debugLog('loadUserData: END — records.length=' + records.length + ', currentVehicle=' + (currentVehicle?.name || 'null'));
    } catch (e) { console.error(e); debugLog('loadUserData ERROR: ' + e.message); }
}

function percentToActual(percent, totalCap) {
    return (percent / 100) * totalCap;
}

// 数据校验：里程不倒退 + 能量交叉验证
// 返回 null 表示通过，返回字符串表示警告/错误信息
function validateNewRecord(rec, isEdit) {
    if (!initConfig) return null;
    const fuelCap = initConfig.total_fuel_capacity || 60;
    const elecCap = initConfig.total_elec_capacity || 18;
    const vtype = initConfig.vehicle_type || 'erev_phev';
    const warnings = [];

    // 找上一条记录（时间戳小于本条、未删除的最近一条）
    const sorted = [...records].sort((a, b) => (a.refuel_time || a.timestamp) - (b.refuel_time || b.timestamp));
    let prev = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].id === rec.id) continue;
        if ((sorted[i].refuel_time || sorted[i].timestamp) < (rec.refuel_time || rec.timestamp)) { prev = sorted[i]; break; }
    }

    // 1. 里程校验（按补能时间：历史数据不校验，新数据校验）
    const latestRec = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    const recTime = rec.refuel_time || rec.timestamp;
    const latestTime = latestRec && latestRec.id !== rec.id ? (latestRec.refuel_time || latestRec.timestamp) : null;
    if (latestTime && recTime >= latestTime) {
        // 补能日期 ≥ 已有最新补能日期 → 核对里程必须大于已有最新里程
        const latestTM = latestRec.total_mileage;
        if (rec.total_mileage < latestTM) {
            return `❌ 总里程倒退！最新记录 ${latestTM}km → 本次 ${rec.total_mileage}km（不允许减少）`;
        }
        if (rec.total_mileage === latestTM && !isEdit) {
            warnings.push('⚠️ 总里程与上次相同，未行驶就加油/充电？');
        }
    }
    // 补能日期旧于最新 → 不校验里程
    if (vtype === 'bev') {
        if (rec.hev_mileage !== 0) {
            return '❌ 纯电车型 HEV 里程必须为 0';
        }
    } else if (vtype === 'ice') {
        // HEV里程不校验
    } else {
        if (rec.hev_mileage > rec.total_mileage) {
            return `❌ HEV里程(${rec.hev_mileage}) 不能大于总里程(${rec.total_mileage})`;
        }
    }


    // 2. 能量交叉校验
    if (rec.energy_added !== null && rec.energy_added !== undefined && !isNaN(rec.energy_added) && rec.energy_added > 0) {
        if (rec.type === 'fuel' && vtype !== 'bev') {
            const pctBefore = rec.fuel_percent_before ?? 0;
            const pctAfter = rec.fuel_percent_after ?? 0;
            if (pctAfter > pctBefore) {
                const expectedMin = ((pctAfter - pctBefore - 2) / 100) * fuelCap;
                const expectedMax = ((pctAfter - pctBefore + 2) / 100) * fuelCap;
                if (rec.energy_added < Math.max(0, expectedMin)) {
                    warnings.push(`⚠️ 加油量 ${rec.energy_added.toFixed(2)}L 明显少于百分比变化 (${pctBefore}%→${pctAfter}%) 预期 ${((pctAfter-pctBefore)/100*fuelCap).toFixed(1)}L（油表仅显示整数%有舍入误差）`);
                } else if (rec.energy_added > expectedMax && rec.energy_added > ((pctAfter-pctBefore+5)/100*fuelCap)) {
                    warnings.push(`⚠️ 加油量 ${rec.energy_added.toFixed(2)}L 远超百分比变化，请核对`);
                }
            }
        } else if (rec.type === 'ev' && vtype !== 'ice') {
            const pctBefore = rec.charge_percent_before ?? 0;
            const pctAfter = rec.charge_percent_after ?? 0;
            if (pctAfter > pctBefore) {
                const batteryIncrease = ((pctAfter - pctBefore) / 100) * elecCap;
                if (rec.energy_added < batteryIncrease * 0.85) {
                    warnings.push(`⚠️ 充电量 ${rec.energy_added.toFixed(2)}kWh 低于电池增量 ${batteryIncrease.toFixed(1)}kWh（${pctBefore}%→${pctAfter}%），充电量应≥电池增量（考虑损耗通常还多10-20%）`);
                } else if (rec.energy_added > batteryIncrease * 1.4) {
                    warnings.push(`⚠️ 充电量 ${rec.energy_added.toFixed(2)}kWh 远超电池增量 ${batteryIncrease.toFixed(1)}kWh（损耗>40%），请核对`);
                }
            }
        }
    }

    return warnings.length > 0 ? warnings.join('\n') : null;
}

// 重新计算所有能耗（基于百分比差值，而非补能量）
function recalcAllConsumptions() {
    if (!initConfig) return;
    const fuelCap = initConfig.total_fuel_capacity || 60;
    const elecCap = initConfig.total_elec_capacity || 18;
    const initFuelPct = initConfig.init_fuel_percent ?? 100;
    const initChargePct = initConfig.init_charge_percent ?? 100;
    const vtype = initConfig.vehicle_type || 'erev_phev';
    const sorted = [...records].sort((a, b) => (a.refuel_time || a.timestamp) - (b.refuel_time || b.timestamp));
    
    for (let i = 0; i < sorted.length; i++) {
        const rec = sorted[i];
        const prev = i > 0 ? sorted[i - 1] : null;

        // 上一次离开时的状态（百分比）
        const prevFuelAfterPct = prev ? (prev.fuel_percent_after ?? prev.fuel_percent_before) : initFuelPct;
        const prevChargeAfterPct = prev ? (prev.charge_percent_after ?? prev.charge_percent_before) : initChargePct;

        // 本次到站时的百分比
        const fuelBeforePct = rec.fuel_percent_before ?? prevFuelAfterPct;
        const chargeBeforePct = rec.charge_percent_before ?? prevChargeAfterPct;

        // 消耗量 = (上次离开% - 本次到站%) × 容量 / 100
        const fuelConsumed = Math.max(0, (prevFuelAfterPct - fuelBeforePct) / 100 * fuelCap);
        const elecConsumed = Math.max(0, (prevChargeAfterPct - chargeBeforePct) / 100 * elecCap);

        // 里程差
        const prevTM = prev ? prev.total_mileage : (initConfig.init_total_mileage || 0);
        const prevHM = prev ? prev.hev_mileage : (initConfig.init_hev_mileage || 0);
        const interval = rec.total_mileage - prevTM;
        let hevD, evD;
        if (vtype === 'bev') {
            hevD = 0;
            evD = interval;
        } else if (vtype === 'ice') {
            hevD = interval;
            evD = 0;
        } else {
            hevD = rec.hev_mileage - prevHM;
            evD = (rec.total_mileage - rec.hev_mileage) - (prevTM - prevHM);
        }

        rec.fuel_consumption = hevD > 0 ? (fuelConsumed / hevD) * 100 : 0;
        rec.elec_consumption = evD > 0 ? (elecConsumed / evD) * 100 : 0;
        rec.total_consumption = interval > 0 ? (fuelConsumed + elecConsumed * 0.31) / interval * 100 : 0;
    }
}

// 保存所有记录到服务器（覆盖式）
async function saveRecordsToServer() {
    for (let rec of records) {
        await fetch(`${API_BASE}/records`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
    const vtype = initConfig.vehicle_type || 'erev_phev';
    
    // 车型自动限制记录类型
    let recordType = currentEventType;
    if (vtype === 'bev') recordType = 'ev';
    else if (vtype === 'ice') recordType = 'fuel';
    
    const total = parseFloat(totalMileageInp.value);
    let hev = parseFloat(hevMileageInp.value);
    const amount = parseFloat(amountInp.value);
    let fuelPctBefore = parseFloat(fuelPercentBefore.value);
    let chargePctBefore = parseFloat(chargePercentBefore.value);
    // 如果操作前百分比留空，自动从上一条记录推导
    if (isNaN(chargePctBefore)) {
        const prevRec = records[records.length - 1];
        if (prevRec && prevRec.charge_percent_after != null) {
            chargePctBefore = prevRec.charge_percent_after;
        } else {
            chargePctBefore = initConfig?.init_charge_percent ?? 100;
        }
    }
    if (isNaN(fuelPctBefore)) {
        if (vtype === 'bev') {
            fuelPctBefore = 0;
        } else {
            const prevRec = records[records.length - 1];
            if (prevRec && prevRec.fuel_percent_after != null) {
                fuelPctBefore = prevRec.fuel_percent_after;
            } else {
                fuelPctBefore = initConfig?.init_fuel_percent ?? 50;
            }
        }
    }
    // 金额非必填：未填金额时用电价×充电量计算
    let usePrice = false;
    if ((isNaN(amount) || amount <= 0) && recordType === 'ev') {
        const price = parseFloat(electricityPriceInp.value);
        if (!isNaN(price) && price > 0) {
            usePrice = true;
        } else {
            alert('请填写金额或电价'); return;
        }
    } else if (isNaN(total) || total <= 0 || isNaN(amount) || amount <= 0) {
        alert('请填写有效数值（总里程>0，金额>0）'); return;
    }
    
    // 根据车型自动修正HEV里程
    if (vtype === 'bev') {
        hev = 0;
    } else if (vtype === 'ice') {
        hev = total;
    } else {
        if (isNaN(hev) || hev < 0 || hev > total) {
            alert('请填写有效HEV里程（0 ≤ HEV ≤ 总里程）');
            return;
        }
    }
    
    if (vtype !== 'bev') {
        if (isNaN(fuelPctBefore) || fuelPctBefore < 0 || fuelPctBefore > 100) {
            alert('操作前油量百分比0~100');
            return;
        }
    }
    if (vtype !== 'ice') {
        if (isNaN(chargePctBefore) || chargePctBefore < 0 || chargePctBefore > 100) {
            alert('操作前电量百分比0~100');
            return;
        }
    }
    const fuelBeforeActual = vtype !== 'bev' ? percentToActual(fuelPctBefore, initConfig.total_fuel_capacity) : 0;
    const chargeBeforeActual = vtype !== 'ice' ? percentToActual(chargePctBefore, initConfig.total_elec_capacity) : 0;
    
    let newRecord = {
        id: generateUUID(), type: recordType, timestamp: Date.now(),
        total_mileage: total, hev_mileage: hev, amount_money: usePrice ? 0 : amount,
        fuel_percent_before: isNaN(fuelPctBefore) ? 0 : fuelPctBefore,
        charge_percent_before: isNaN(chargePctBefore) ? 0 : chargePctBefore,
        fuel_before_actual: fuelBeforeActual, charge_before_actual: chargeBeforeActual,
        fuel_percent_after: null, charge_percent_after: null,
        fuel_after_actual: null, charge_after_actual: null,
        energy_added: null,
        vehicle_id: currentVehicleId
    };
    
    if (recordType === 'fuel') {
        const fuelPctAfter = parseFloat(fuelPercentAfter.value);
        if (isNaN(fuelPctAfter) || fuelPctAfter < 0 || fuelPctAfter > 100 || fuelPctAfter < fuelPctBefore) {
            alert('加油后油量百分比无效（应 ≥ 加油前油量）');
            return;
        }
        // 燃油记录：仍可填电价转为金额
        if (usePrice) {
            const userAdded = parseFloat(fuelAmount.value);
            if (!isNaN(userAdded) && userAdded > 0) {
                newRecord.amount_money = userAdded * parseFloat(electricityPriceInp.value);
            }
        }
        const fuelAfterActual = percentToActual(fuelPctAfter, initConfig.total_fuel_capacity);
        newRecord.fuel_percent_after = fuelPctAfter;
        newRecord.charge_percent_after = vtype !== 'ice' ? chargePctBefore : 0;
        newRecord.fuel_after_actual = fuelAfterActual;
        newRecord.charge_after_actual = vtype !== 'ice' ? chargeBeforeActual : 0;
        // 加油量：优先用用户输入，否则用百分比差值计算
        const userAdded = parseFloat(fuelAmount.value);
        if (!isNaN(userAdded) && userAdded > 0) {
            newRecord.energy_added = userAdded;
        } else {
            newRecord.energy_added = fuelAfterActual - fuelBeforeActual;
        }
    } else {
        const chargePctAfter = parseFloat(chargePercentAfter.value);
        if (isNaN(chargePctAfter) || chargePctAfter < 0 || chargePctAfter > 100 || chargePctAfter < chargePctBefore) {
            alert('充电后电量百分比无效（应 ≥ 充电前电量）');
            return;
        }
        const chargeAfterActual = percentToActual(chargePctAfter, initConfig.total_elec_capacity);
        newRecord.charge_percent_after = chargePctAfter;
        newRecord.fuel_percent_after = fuelPctBefore;
        newRecord.charge_after_actual = chargeAfterActual;
        newRecord.fuel_after_actual = fuelBeforeActual;
        // 充电量：优先用用户输入，否则用百分比差值计算
        const userAdded = parseFloat(chargeAmount.value);
        if (!isNaN(userAdded) && userAdded > 0) {
            newRecord.energy_added = userAdded;
        } else {
            newRecord.energy_added = chargeAfterActual - chargeBeforeActual;
        }
    }

    // 补能时间：用户可手动选择，默认当前时间
    newRecord.refuel_time = refuelTimeInp.value ? new Date(refuelTimeInp.value).getTime() : Date.now();

    // 数据校验
    const validationError = validateNewRecord(newRecord, false);
    if (validationError) {
        if (validationError.startsWith('❌')) {
            alert(validationError);
            return;
        }
        // 警告级别：确认后仍可保存
        if (!confirm(validationError + '\n\n是否仍要保存？')) return;
    }

    records.push(newRecord);
    recalcAllConsumptions();
    try {
        const res = await fetch(`${API_BASE}/records`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ userId: currentUser.userId, record: newRecord })
        });
        const data = await res.json();
        if (res.ok) {
            // 保存用户原始输入
            fetch(`${API_BASE}/user-inputs`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    userId: currentUser.userId,
                    recordId: newRecord.id,
                    type: newRecord.type,
                    total_mileage: newRecord.total_mileage,
                    hev_mileage: newRecord.hev_mileage,
                    amount_money: newRecord.amount_money,
                    fuel_percent_before: newRecord.fuel_percent_before,
                    charge_percent_before: newRecord.charge_percent_before,
                    fuel_percent_after: newRecord.fuel_percent_after,
                    charge_percent_after: newRecord.charge_percent_after,
                    energy_added: newRecord.energy_added
                })
            }).catch(e => console.error('保存用户输入记录失败:', e));
            // 保存电价到车辆配置（电车且填了电价）
            if (recordType === 'ev' && electricityPriceInp.value && parseFloat(electricityPriceInp.value) > 0) {
                const priceVal = parseFloat(electricityPriceInp.value);
                fetch(`${API_BASE}/vehicles/${currentVehicleId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({
                        userId: currentUser.userId,
                        vehicle: { electricity_price: priceVal }
                    })
                }).catch(e => console.error('保存电价失败:', e));
            }
            currentPage = Math.ceil(records.length / pageSize);
            renderAll();
            totalMileageInp.value = '';
            hevMileageInp.value = '';
            amountInp.value = '';
            // 用最后一条记录的 after 值预填 before 字段
            var _lr = records[records.length - 1];
            if (_lr && _lr.fuel_percent_after != null) {
                fuelPercentBefore.value = _lr.fuel_percent_after;
            } else if (_lr) {
                fuelPercentBefore.value = _lr.fuel_percent_before ?? '';
            } else {
                fuelPercentBefore.value = initConfig.init_fuel_percent ?? '';
            }
            if (_lr && _lr.charge_percent_after != null) {
                chargePercentBefore.value = _lr.charge_percent_after;
            } else if (_lr) {
                chargePercentBefore.value = _lr.charge_percent_before ?? '';
            } else {
                chargePercentBefore.value = initConfig.init_charge_percent ?? '';
            }
            if (currentEventType === 'fuel') {
                fuelPercentAfter.value = '';
                fuelAmount.value = '';
            } else {
                chargePercentAfter.value = '';
                chargeAmount.value = '';
                delete chargeAmount.dataset.manual;
                delete amountInp.dataset.manual;
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

function editRecord(id) {
    if (!initConfig) { alert('请先设置车辆参数'); return; }
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    const vtype = initConfig.vehicle_type || 'erev_phev';
    
    // 编辑界面也遵守车型限制
    const showHev = vtype !== 'bev' && vtype !== 'ice';
    const hevLabel = vtype === 'bev' ? 'HEV里程=0' : vtype === 'ice' ? 'HEV=总里程' : 'HEV里程 (km)';
    const showFuelFields = vtype !== 'bev';
    const showChargeFields = vtype !== 'ice';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-sheet" style="max-width:600px;">
            <div class="modal-header">
                <div class="modal-title">✏️ 编辑记录 - ${rec.type === 'fuel' ? '⛽加油' : '🔋充电'}</div>
                <button class="modal-close" id="editCloseBtn">×</button>
            </div>
            <div class="modal-body">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="form-group"><label class="form-label">总里程 (km)</label><input id="editTotalMileage" class="form-input" type="number" step="0.1" value="${rec.total_mileage ?? ''}"></div>
                <div class="form-group" ${showHev ? '' : 'style="opacity:0.5"'}><label class="form-label">${hevLabel}</label><input id="editHevMileage" class="form-input" type="number" step="0.1" value="${rec.hev_mileage ?? ''}" ${showHev ? '' : 'disabled'}></div>
                <div class="form-group"><label class="form-label">金额 (元)</label><input id="editAmount" class="form-input" type="number" step="0.01" value="${rec.amount_money ?? ''}" placeholder="本次花费"></div>
                <div class="form-group"><label class="form-label">电价 (元/kWh)</label><input id="editPrice" class="form-input" type="number" step="0.01" placeholder="填入电价"></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div class="form-group"><label class="form-label">补能时间</label><input id="editRefuelTime" class="form-input" type="datetime-local"></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                ${showFuelFields ? `<div class="form-group"><label class="form-label">操作前油量 (%)</label><input id="editFuelBefore" class="form-input" type="number" step="0.1" value="${rec.fuel_percent_before ?? ''}"></div>` : ''}
                ${showChargeFields ? `<div class="form-group"><label class="form-label">操作前电量 (%)</label><input id="editChargeBefore" class="form-input" type="number" step="0.1" value="${rec.charge_percent_before ?? ''}"></div>` : ''}
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                ${showFuelFields ? `<div class="form-group"><label class="form-label">操作后油量 (%)</label><input id="editFuelAfter" class="form-input" type="number" step="0.1" value="${rec.fuel_percent_after ?? ''}"></div>` : ''}
                ${showChargeFields ? `<div class="form-group"><label class="form-label">操作后电量 (%)</label><input id="editChargeAfter" class="form-input" type="number" step="0.1" value="${rec.charge_percent_after ?? ''}"></div>` : ''}
            </div>
            <div style="margin-top:10px;">
                <div class="form-group"><label class="form-label">补能量 (${rec.type === 'fuel' ? 'L' : 'kWh'})</label><input id="editEnergyAdded" class="form-input" type="number" step="0.01" value="${rec.energy_added ?? ''}"></div>
            </div>
            </div>
            <div id="editMsg" style="padding:0 20px 8px; color:var(--red); font-size:13px;"></div>
            <div class="modal-footer">
                <button id="editCancelBtn" class="btn" style="color:var(--text3);">取消</button>
                <button id="editSaveBtn" class="btn">💾 保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 纯油：HEV联动总里程
    if (vtype === 'ice') {
        modal.querySelector('#editTotalMileage').addEventListener('input', function() {
            modal.querySelector('#editHevMileage').value = this.value;
        });
    }

    // 初始化补能时间
    const editRefuelEl = modal.querySelector('#editRefuelTime');
    if (rec.refuel_time) {
        editRefuelEl.value = new Date(rec.refuel_time).toISOString().slice(0, 16);
    } else if (rec.timestamp) {
        editRefuelEl.value = new Date(rec.timestamp).toISOString().slice(0, 16);
    }

    modal.querySelector('#editCancelBtn').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#editSaveBtn').onclick = async () => {
        const total = parseFloat(modal.querySelector('#editTotalMileage').value);
        let hev = parseFloat(modal.querySelector('#editHevMileage').value);
        const amount = parseFloat(modal.querySelector('#editAmount').value);
        const fuelBefore = showFuelFields ? parseFloat(modal.querySelector('#editFuelBefore').value) : 0;
        const chargeBefore = showChargeFields ? parseFloat(modal.querySelector('#editChargeBefore').value) : 0;
        const fuelAfter = showFuelFields ? parseFloat(modal.querySelector('#editFuelAfter').value) : 0;
        const chargeAfter = showChargeFields ? parseFloat(modal.querySelector('#editChargeAfter').value) : 0;
        const energyAdded = parseFloat(modal.querySelector('#editEnergyAdded').value);
        const msgEl = modal.querySelector('#editMsg');

        let usePrice = false;
        let priceAmount = amount;
        if (isNaN(amount) || amount < 0) {
            const price = parseFloat(modal.querySelector('#editPrice').value);
            if (!isNaN(price) && price > 0 && !isNaN(energyAdded) && energyAdded > 0) {
                priceAmount = energyAdded * price;
                usePrice = true;
            }
        }
        if (isNaN(total) || total <= 0) {
            msgEl.innerText = '请填写有效数值'; return;
        }
        if (isNaN(priceAmount) || priceAmount < 0) {
            if (!isNaN(energyAdded) && energyAdded > 0) {
                const p = parseFloat(modal.querySelector('#editPrice').value);
                if (isNaN(p) || p <= 0) { msgEl.innerText = '请填写金额或电价'; return; }
                priceAmount = energyAdded * p;
                usePrice = true;
            } else {
                msgEl.innerText = '请填写金额或电价'; return;
            }
        }
        // 车型校验
        if (vtype === 'bev') hev = 0;
        else if (vtype === 'ice') hev = total;
        else if (isNaN(hev) || hev < 0 || hev > total) { msgEl.innerText = 'HEV里程无效'; return; }
        
        if (showFuelFields && (isNaN(fuelBefore) || fuelBefore < 0 || fuelBefore > 100)) { msgEl.innerText = '油量百分比0~100'; return; }
        if (showChargeFields && (isNaN(chargeBefore) || chargeBefore < 0 || chargeBefore > 100)) { msgEl.innerText = '电量百分比0~100'; return; }

        const fuelCap = initConfig.total_fuel_capacity;
        const elecCap = initConfig.total_elec_capacity;

        const refuelEditVal = modal.querySelector('#editRefuelTime').value;
        const updated = {
            ...rec,
            total_mileage: total,
            hev_mileage: hev,
            amount_money: priceAmount,
            refuel_time: refuelEditVal ? new Date(refuelEditVal).getTime() : (rec.refuel_time || Date.now()),
            fuel_percent_before: fuelBefore,
            charge_percent_before: chargeBefore,
            fuel_before_actual: (fuelBefore / 100) * fuelCap,
            charge_before_actual: (chargeBefore / 100) * elecCap,
            energy_added: isNaN(energyAdded) ? null : energyAdded
        };

        if (rec.type === 'fuel' || vtype === 'ice') {
            if (isNaN(fuelAfter) || fuelAfter < 0 || fuelAfter > 100) { msgEl.innerText = '加油后油量无效'; return; }
            updated.fuel_percent_after = fuelAfter;
            updated.fuel_after_actual = (fuelAfter / 100) * fuelCap;
            updated.charge_percent_after = showChargeFields ? chargeBefore : 0;
            updated.charge_after_actual = showChargeFields ? updated.charge_before_actual : 0;
        } else {
            if (isNaN(chargeAfter) || chargeAfter < 0 || chargeAfter > 100) { msgEl.innerText = '充电后电量无效'; return; }
            updated.charge_percent_after = chargeAfter;
            updated.charge_after_actual = (chargeAfter / 100) * elecCap;
            updated.fuel_percent_after = showFuelFields ? fuelBefore : 0;
            updated.fuel_after_actual = showFuelFields ? updated.fuel_before_actual : 0;
        }

        // 数据校验
        const validationError = validateNewRecord(updated, true);
        if (validationError) {
            if (validationError.startsWith('❌')) {
                msgEl.innerText = validationError;
                return;
            }
            if (!confirm(validationError + '\n\n是否仍要保存？')) return;
        }

        // Save to server
        try {
            const res = await fetch(`${API_BASE}/records/${currentUser.userId}/${rec.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ record: updated })
            });
            const data = await res.json();
            if (res.ok) {
                // Update local record
                const idx = records.findIndex(r => r.id === rec.id);
                if (idx !== -1) records[idx] = { ...records[idx], ...updated };
                recalcAllConsumptions();
                renderAll();
                modal.remove();
            } else {
                msgEl.innerText = data.error || '保存失败';
            }
        } catch (e) {
            msgEl.innerText = '网络错误：' + e.message;
        }
    };
}

async function deleteRecord(id) {
    if (confirm('删除此记录？（可从回收站恢复）')) {
        await fetch(`${API_BASE}/records/${currentUser.userId}/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        records = records.filter(r => r.id !== id);
        recalcAllConsumptions();
        renderAll();
    }
}

// 回收站
async function showTrash() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    try {
        const res = await fetch(`${API_BASE}/records/${currentUser.userId}/trash`, { headers: getAuthHeaders() });
        const trashRecords = await res.json();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        let rowsHtml = '';
        if (trashRecords.length === 0) {
            rowsHtml = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text3);">回收站是空的</td></tr>';
        } else {
            for (const rec of trashRecords) {
                const dateStr = rec.timestamp ? new Date(rec.timestamp).toLocaleString() : '—';
                const typeLabel = rec.type === 'fuel' ? '⛽加油' : '🔋充电';
                rowsHtml += `<tr>
                    <td>${dateStr}</td>
                    <td>${typeLabel}</td>
                    <td>${rec.total_mileage?.toFixed(1) ?? '—'}</td>
                    <td>¥${rec.amount_money?.toFixed(2) ?? '—'}</td>
                    <td><button class="restore-btn btn" data-id="${rec.id}" style="padding:2px 10px; font-size:12px;">♻️ 恢复</button></td>
                </tr>`;
            }
        }
        modal.innerHTML = `
            <div class="modal-sheet" style="max-width:700px;">
                <div class="modal-header">
                    <div class="modal-title">🗑️ 回收站</div>
                    <button class="modal-close" id="closeTrashBtn">×</button>
                </div>
                <div class="modal-body">
                <p style="color:var(--text3); font-size:13px; margin-bottom:12px;">删除的记录会保留在这里，可以随时恢复</p>
                <div class="table-scroll">
                <table class="table-container" style="width:100%;">
                    <thead><tr>
                        <th style="text-align:left; padding:0.5rem;">时间</th>
                        <th style="text-align:left; padding:0.5rem;">类型</th>
                        <th style="text-align:right; padding:0.5rem;">里程</th>
                        <th style="text-align:right; padding:0.5rem;">金额</th>
                        <th style="text-align:center; padding:0.5rem;">操作</th>
                    </tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#closeTrashBtn').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        modal.querySelectorAll('.restore-btn').forEach(btn => {
            btn.onclick = async () => {
                await fetch(`${API_BASE}/records/${currentUser.userId}/${btn.dataset.id}/restore`, { method: 'POST', headers: getAuthHeaders() });
                modal.remove();
                await loadUserData();
                recalcAllConsumptions();
                renderAll();
            };
        });
    } catch (e) {
        alert('加载回收站失败：' + e.message);
    }
}

function updateTotalCost() {
    const total = records.reduce((sum, rec) => sum + (rec.amount_money || 0), 0);
    const costSpan = document.getElementById('totalCostDisplay');
    if (costSpan) costSpan.innerText = `累计花费: ¥${total.toFixed(2)}`;
}

function renderTable() {
    const tableHead = document.querySelector('#historyTable thead');
    const vtype = initConfig?.vehicle_type || 'erev_phev';
    
    if (!initConfig) {
        tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:2rem; color:#888;">请先在个人中心设置车辆参数</td></tr>';
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    
    // 根据车型设置表头和列数
    let colSpan = 12;
    if (vtype === 'bev') {
        tableHead.innerHTML = '<tr><th>时间</th><th>类型</th><th>总里程(km)</th><th>金额(元)</th><th>补能量</th><th>区间里程(km)</th><th>电耗(kWh/100km)</th><th>总能耗(L/100km)</th><th></th></tr>';
        colSpan = 9;
    } else if (vtype === 'ice') {
        tableHead.innerHTML = '<tr><th>时间</th><th>类型</th><th>总里程(km)</th><th>金额(元)</th><th>补能量</th><th>区间里程(km)</th><th>油耗(L/100km)</th><th>总能耗(L/100km)</th><th></th></tr>';
        colSpan = 9;
    } else {
        tableHead.innerHTML = '<tr><th>时间</th><th>类型</th><th>总里程(km)</th><th>HEV(km)</th><th>EV(km)</th><th>金额(元)</th><th>补能量</th><th>区间里程(km)</th><th>油耗(L/100km)</th><th>电耗(kWh/100km)</th><th>总能耗(L/100km)</th><th></th></tr>';
    }
    
    const sorted = [...records].sort((a, b) => (b.refuel_time || b.timestamp) - (a.refuel_time || a.timestamp));
    if (sorted.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:2rem; color:#888;">暂无记录，请添加第一条记录</td></tr>`;
        document.getElementById('pagination').style.display = 'none';
        updateTotalCost();
        return;
    }
    
    // 分页
    const totalPages = Math.ceil(sorted.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * pageSize;
    const pageRecords = sorted.slice(start, start + pageSize);
    renderPagination(totalPages, sorted.length);
    
    // 计算区间里程（按时间顺序相邻记录的总里程差值，首条用初始里程）
    const sortedAsc = [...records].sort((a, b) => (a.refuel_time || a.timestamp) - (b.refuel_time || b.timestamp));
    const intervalMap = new Map();
    let lastTotalMileage = initConfig ? initConfig.init_total_mileage : null;
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
    for (let rec of pageRecords) {
        const fillTime = rec.refuel_time && rec.refuel_time !== rec.timestamp;
        const dateStr = rec.refuel_time ? new Date(rec.refuel_time).toLocaleString() + (fillTime ? '' : '') : (rec.timestamp ? new Date(rec.timestamp).toLocaleString() : '未知');
        const typeLabel = rec.type === 'fuel' ? '⛽加油' : '🔋充电';
        const badgeClass = rec.type === 'fuel' ? 'badge-fuel' : 'badge-ev';
        const totalMile = (rec.total_mileage != null && !isNaN(rec.total_mileage)) ? rec.total_mileage.toFixed(1) : '—';
        const hevMile = (rec.hev_mileage != null && !isNaN(rec.hev_mileage)) ? rec.hev_mileage.toFixed(1) : '—';
        const evMile = (totalMile !== '—' && hevMile !== '—') ? (parseFloat(totalMile) - parseFloat(hevMile)).toFixed(1) : '—';
        const amount = (rec.amount_money != null && !isNaN(rec.amount_money)) ? rec.amount_money.toFixed(2) : '—';
        
        let energyAdded = '—';
        if (rec.energy_added !== null && rec.energy_added !== undefined && !isNaN(rec.energy_added)) {
            energyAdded = rec.type === 'fuel' ? `${parseFloat(rec.energy_added).toFixed(1)} L` : `${parseFloat(rec.energy_added).toFixed(1)} kWh`;
        }
        
        const intervalKm = intervalMap.get(rec.id);
        const intervalDisplay = (intervalKm !== null && !isNaN(intervalKm)) ? intervalKm.toFixed(1) : '—';
        
        const fuelShow = (rec.fuel_consumption !== null && rec.fuel_consumption !== undefined && !isNaN(rec.fuel_consumption)) ? Number(rec.fuel_consumption).toFixed(2) : '—';
        const elecShow = (rec.elec_consumption !== null && rec.elec_consumption !== undefined && !isNaN(rec.elec_consumption)) ? Number(rec.elec_consumption).toFixed(2) : '—';
        const totalShow = (rec.total_consumption !== null && rec.total_consumption !== undefined && !isNaN(rec.total_consumption)) ? Number(rec.total_consumption).toFixed(2) : '—';
        
        if (vtype === 'bev') {
            const bevTotal = elecShow !== '—' ? (parseFloat(elecShow) * 0.1131).toFixed(2) : '—';
            html += `<tr>
                <td>${dateStr}</td>
                <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
                <td>${totalMile}</td>
                <td>¥${amount}</td>
                <td>${energyAdded}</td>
                <td>${intervalDisplay}</td>
                <td style="font-weight:600; color:var(--accent);">${elecShow}</td>
                <td style="font-weight:600; color:var(--green);">${bevTotal}</td>
                <td style="white-space:nowrap;">
                    <span class="edit-btn" data-id="${rec.id}" style="cursor:pointer; padding:2px 6px;">✏️</span>
                    <span class="delete-btn" data-id="${rec.id}" style="cursor:pointer; padding:2px 6px; color:var(--red);">🗑️</span>
                </td>
            </tr>`;
        } else if (vtype === 'ice') {
            html += `<tr>
                <td>${dateStr}</td>
                <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
                <td>${totalMile}</td>
                <td>¥${amount}</td>
                <td>${energyAdded}</td>
                <td>${intervalDisplay}</td>
                <td style="font-weight:600; color:var(--accent);">${fuelShow}</td>
                <td style="font-weight:600; color:var(--green);">${totalShow}</td>
                <td>
                    <span class="edit-btn" data-id="${rec.id}" style="cursor:pointer; padding:2px 6px;">✏️</span>
                    <span class="delete-btn" data-id="${rec.id}" style="cursor:pointer; padding:2px 6px; color:var(--red);">🗑️</span>
                </td>
            </tr>`;
        } else {
            html += `<tr>
                <td>${dateStr}</td>
                <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
                <td>${totalMile}</td>
                <td>${hevMile}</td>
                <td>${evMile}</td>
                <td>¥${amount}</td>
                <td>${energyAdded}</td>
                <td>${intervalDisplay}</td>
                <td style="font-weight:600; color:var(--accent);">${fuelShow}</td>
                <td style="font-weight:600; color:var(--accent);">${elecShow}</td>
                <td style="font-weight:600; color:var(--green);">${totalShow}</td>
                <td>
                    <span class="edit-btn" data-id="${rec.id}" style="cursor:pointer; padding:2px 6px;">✏️</span>
                    <span class="delete-btn" data-id="${rec.id}" style="cursor:pointer; padding:2px 6px; color:var(--red);">🗑️</span>
                </td>
            </tr>`;
        }
    tableBody.innerHTML = html;
    updateTotalCost();
    // 事件委托：编辑/删除按钮（避免 CSP 拦截内联 onclick）
    tableBody.onclick = function(e) {
        var target = e.target;
        if (target.classList.contains('edit-btn')) {
            editRecord(target.getAttribute('data-id'));
        } else if (target.classList.contains('delete-btn')) {
            deleteRecord(target.getAttribute('data-id'));
        }
    };
}

}

function updateChart() {
    if (!initConfig) return;
    const sorted = [...records].sort((a, b) => (a.refuel_time || a.timestamp) - (b.refuel_time || b.timestamp));
    // 如果时间戳无效（小于 2000 年），用序号作标签
    const minValidTs = 946684800000; // 2000-01-01
    const hasValidDates = sorted.every(r => (r.refuel_time || r.timestamp) && (r.refuel_time || r.timestamp) > minValidTs);
    const labels = hasValidDates
        ? sorted.map(r => new Date(r.refuel_time || r.timestamp).toLocaleDateString())
        : sorted.map((r, i) => `#${i + 1}`);
    // 0 值不画，其余正常显示
    const fuelData = sorted.map(r => r.fuel_consumption === 0 ? null : r.fuel_consumption);
    const elecData = sorted.map(r => r.elec_consumption === 0 ? null : r.elec_consumption);
    const totalData = sorted.map(r => r.total_consumption === 0 ? null : r.total_consumption);
    if (unifiedChart) unifiedChart.destroy();
    const ctx = document.getElementById('unifiedChart').getContext('2d');
    unifiedChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels, datasets: [
                { label: '油耗 (L/100km)', data: fuelData, borderColor: '#e67e22', yAxisID: 'y', tension: 0.2, spanGaps: true },
                { label: '总能耗 (L/100km)', data: totalData, borderColor: '#2b6e4f', yAxisID: 'y', tension: 0.2, spanGaps: true },
                { label: '电耗 (kWh/100km)', data: elecData, borderColor: '#2c7da0', yAxisID: 'y1', tension: 0.2, spanGaps: true }
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
    debugLog('renderAll() START — records.length=' + records.length + ', initConfig=' + (initConfig ? 'set' : 'null'));
    initVehicleTypeUI();
    renderTable();
    updateChart();
    updateSidebarStats();
    updateVehicleSelectorUI();
    debugLog('renderAll() END');
}

// 根据车型调整录入界面
function initVehicleTypeUI() {
    const vtype = initConfig?.vehicle_type || 'erev_phev';
    const fuelBtn = document.querySelector('.type-btn[data-type="fuel"]');
    const evBtn = document.querySelector('.type-btn[data-type="ev"]');
    const hevInp = document.getElementById('hevMileage');
    const totalInp = document.getElementById('totalMileage');
    const fuelBeforeFld = document.getElementById('fuelPercentBefore');
    const chargeBeforeFld = document.getElementById('chargePercentBefore');
    
    if (vtype === 'bev') {
        // 纯电：只有充电
        if (fuelBtn) { fuelBtn.style.display = 'none'; }
        if (evBtn) {
            evBtn.style.display = '';
            if (!evBtn.classList.contains('active')) setEventTypeUI('ev');
        }
        // 隐藏HEV里程和加油后油量
        const hevField = document.getElementById('hevMileageField');
        const afterFuelField = document.getElementById('afterFuelField');
        if (hevField) hevField.style.display = 'none';
        if (afterFuelField) afterFuelField.style.display = 'none';
        if (hevInp) { hevInp.value = '0'; hevInp.disabled = true; }
        if (fuelBeforeFld) { fuelBeforeFld.closest('.form-group').style.display = 'none'; }
        if (chargeBeforeFld) { chargeBeforeFld.closest('.form-group').style.display = ''; }
    } else if (vtype === 'ice') {
        // 纯油：只有加油
        if (evBtn) { evBtn.style.display = 'none'; }
        if (fuelBtn) {
            fuelBtn.style.display = '';
            if (!fuelBtn.classList.contains('active')) setEventTypeUI('fuel');
        }
        if (hevInp) { hevInp.disabled = true; hevInp.style.opacity = '0.5'; }
        if (totalInp && hevInp) {
            const syncHev = () => { if (hevInp.disabled && totalInp.value && hevInp.value !== totalInp.value) hevInp.value = totalInp.value; };
            totalInp.addEventListener('input', syncHev);
            syncHev();
        }
        if (chargeBeforeFld) { chargeBeforeFld.closest('.form-group').style.display = 'none'; }
        if (fuelBeforeFld) { fuelBeforeFld.closest('.form-group').style.display = ''; }
    } else {
        // 增程/插混：全部显示
        if (fuelBtn) { fuelBtn.style.display = ''; }
        if (evBtn) { evBtn.style.display = ''; }
        if (hevInp) { hevInp.disabled = false; hevInp.style.opacity = ''; }
        if (fuelBeforeFld) { fuelBeforeFld.closest('.form-group').style.display = ''; }
        if (chargeBeforeFld) { chargeBeforeFld.closest('.form-group').style.display = ''; }
    }

    // 加载已保存的电价
    if (initConfig && initConfig.electricity_price && initConfig.electricity_price > 0) {
        electricityPriceInp.value = initConfig.electricity_price;
    }

    // 预填操作前百分比（从最后一条记录）
    if (records.length > 0) {
        var _lr2 = records[records.length - 1];
        if (fuelPercentBefore && _lr2.fuel_percent_after != null) {
            fuelPercentBefore.value = _lr2.fuel_percent_after;
        } else if (fuelPercentBefore && initConfig) {
            fuelPercentBefore.value = initConfig.init_fuel_percent ?? '';
        }
        if (chargePercentBefore && _lr2.charge_percent_after != null) {
            chargePercentBefore.value = _lr2.charge_percent_after;
        } else if (chargePercentBefore && initConfig) {
            chargePercentBefore.value = initConfig.init_charge_percent ?? '';
        }
    } else if (initConfig) {
        if (fuelPercentBefore) fuelPercentBefore.value = initConfig.init_fuel_percent ?? '';
        if (chargePercentBefore) chargePercentBefore.value = initConfig.init_charge_percent ?? '';
    }
}

// ===== BEV 实时自动计算 =====
function updateBevAutoCalc() {
    const vtype = initConfig?.vehicle_type || 'erev_phev';
    if (vtype !== 'bev') return;
    const chargeBefore = parseFloat(chargePercentBefore.value);
    const chargeAfter = parseFloat(chargePercentAfter.value);
    const price = parseFloat(electricityPriceInp.value);
    const batteryCap = initConfig?.total_elec_capacity || 18;
    
    if (!isNaN(chargeBefore) && !isNaN(chargeAfter) && chargeAfter > chargeBefore) {
        const autoEnergy = ((chargeAfter - chargeBefore) / 100) * batteryCap;
        // 充电量自动计算（用户未手动填入时）
        if (!chargeAmount.dataset.manual) {
            chargeAmount.value = autoEnergy.toFixed(2);
            chargeAmount.placeholder = autoEnergy.toFixed(2) + "kWh（自动计算，若充电桩有充电量显示可手动填入）";
        }
        // 金额自动计算
        if (!isNaN(price) && price > 0 && !amountInp.dataset.manual) {
            const autoAmount = autoEnergy * price;
            amountInp.value = autoAmount.toFixed(2);
        }
    }
}

// 实时计算事件监听
function initBevAutoCalc() {
    if (chargePercentBefore && chargePercentAfter) {
        ['input', 'change'].forEach(evt => {
            chargePercentBefore.addEventListener(evt, updateBevAutoCalc);
            chargePercentAfter.addEventListener(evt, updateBevAutoCalc);
        });
    }
    if (electricityPriceInp) {
        electricityPriceInp.addEventListener('input', updateBevAutoCalc);
    }
    // 手动覆盖标记：用户手动填入充电量时清除自动
    if (chargeAmount) {
        chargeAmount.addEventListener('input', function() {
            if (this.value && this.value > 0) {
                this.dataset.manual = 'true';
            } else {
                delete this.dataset.manual;
                updateBevAutoCalc();
            }
        });
    }
    // 手动覆盖标记：用户手动填入金额时清除自动
    if (amountInp) {
        amountInp.addEventListener('input', function() {
            if (this.value && this.value > 0) {
                this.dataset.manual = 'true';
            } else {
                delete this.dataset.manual;
                updateBevAutoCalc();
            }
        });
    }
}



// ===== 分页功能 =====
function renderPagination(totalPages, totalRecords) {
    const pagination = document.getElementById('pagination');
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    pagination.style.display = 'flex';
    // 总数信息
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalRecords);
    document.getElementById('pageInfo').innerText = `共 ${totalRecords} 条，第 ${start}-${end} 条`;
    // 按钮状态
    document.getElementById('firstPageBtn').disabled = currentPage === 1;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
    document.getElementById('lastPageBtn').disabled = currentPage === totalPages;
    // 页码按钮
    let pageNumsHtml = '';
    const maxShow = 5;
    let pStart = Math.max(1, currentPage - Math.floor(maxShow / 2));
    let pEnd = Math.min(totalPages, pStart + maxShow - 1);
    if (pEnd - pStart < maxShow - 1) pStart = Math.max(1, pEnd - maxShow + 1);
    for (let i = pStart; i <= pEnd; i++) {
        const active = i === currentPage ? ' active' : '';
        pageNumsHtml += `<button class="page-btn page-num${active}" data-page="${i}">${i}</button>`;
    }
    document.getElementById('pageNumbers').innerHTML = pageNumsHtml;
}

function goToPage(page) {
    const totalPages = Math.ceil(records.length / pageSize);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
}

function changePageSize(newSize) {
    pageSize = parseInt(newSize);
    currentPage = 1;
    renderTable();
}

// 分页按钮事件绑定
(function bindPagination() {
    document.getElementById('firstPageBtn').addEventListener('click', () => goToPage(1));
    document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('nextPageBtn').addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('lastPageBtn').addEventListener('click', () => goToPage(Math.ceil(records.length / pageSize)));
    document.getElementById('pageNumbers').addEventListener('click', (e) => {
        if (e.target.classList.contains('page-num')) {
            goToPage(parseInt(e.target.dataset.page));
        }
    });
    document.getElementById('pageSizeSelect').addEventListener('change', (e) => changePageSize(e.target.value));
})();



// 导出 Excel（含 try-catch，XLSX/CDN 加载失败时自动降级为 CSV）
async function exportToExcel() {
    try {
        if (!initConfig || records.length === 0) {
            alert('暂无数据可导出');
            return;
        }
        // 检查 XLSX 是否可用
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX 库未加载，自动切换到 CSV 导出');
        }
        const exportData = records.map(rec => ({
            '补能时间': rec.refuel_time ? new Date(rec.refuel_time).toLocaleString() : '',
            '记录时间': new Date(rec.timestamp).toLocaleString(),
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
    } catch (err) {
        console.error('Excel 导出失败:', err);
        // 降级：纯前端 CSV 导出，无需任何外部库
        if (records.length === 0) {
            alert('暂无数据可导出');
            return;
        }
        try {
            // 构建 CSV
            const headers = ['补能时间','记录时间','类型','总里程(km)','HEV里程(km)','EV里程(km)','金额(元)','补能量','区间里程(km)','油耗(L/100km)','电耗(kWh/100km)','总能耗(L/100km)'];
            const csvRows = [headers.join(',')];
            records.forEach(rec => {
                const row = [
                    `"${new Date(rec.timestamp).toLocaleString()}"`,
                    rec.type === 'fuel' ? '加油' : '充电',
                    rec.total_mileage ?? '',
                    rec.hev_mileage ?? '',
                    (rec.total_mileage - rec.hev_mileage).toFixed(1),
                    rec.amount_money ?? '',
                    rec.type === 'fuel' ? `${rec.energy_added?.toFixed(2)} L` : `${rec.energy_added?.toFixed(2)} kWh`,
                    rec.interval_mileage ?? '',
                    rec.fuel_consumption?.toFixed(2) ?? '',
                    rec.elec_consumption?.toFixed(2) ?? '',
                    rec.total_consumption?.toFixed(2) ?? ''
                ];
                csvRows.push(row.join(','));
            });
            const csvString = csvRows.join('\n');
            const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `能耗记录_${new Date().toISOString().slice(0,19)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            alert('XLSX 库未加载，已导出为 CSV 文件（可用 Excel 打开）');
        } catch (csvErr) {
            console.error('CSV 降级导出也失败:', csvErr);
            alert('导出失败，请按 F12 查看控制台错误信息');
        }
    }
}

// 导入 Excel / CSV
const fileInput = document.getElementById('excelFileInput');
const importBtn = document.getElementById('importExcelBtn');
if (importBtn) {
    importBtn.addEventListener('click', () => fileInput.click());
}
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) { console.log('导入：未选择文件'); return; }
        console.log('导入文件:', file.name, '大小:', file.size);

        const isCSV = file.name.toLowerCase().endsWith('.csv');

        // 统一的行记录解析函数（CSV 和 XLSX 共用）
        const parseRecordRow = (row) => {
            let type = row['类型'] === '充电' ? 'ev' : 'fuel';
            const parseNumber = (val) => {
                if (val === undefined || val === null || val === '') return null;
                const num = parseFloat(val);
                return isNaN(num) ? null : num;
            };
            let timestamp = row['时间'] ? new Date(row['时间']).getTime() : Date.now();
            if (!timestamp || isNaN(timestamp) || timestamp < 946684800000) timestamp = Date.now();
            const total_mileage = parseNumber(row['总里程(km)']);
            const hev_mileage = parseNumber(row['HEV里程(km)']);
            const amount_money = parseNumber(row['金额(元)']);
            const energy_added = parseNumber(String(row['补能量'] ?? '').split(' ')[0]);

            if (total_mileage === null || hev_mileage === null || amount_money === null) return null;
            return {
                id: generateUUID(),
                type: type,
                timestamp: timestamp,
                total_mileage: total_mileage,
                hev_mileage: hev_mileage,
                amount_money: amount_money,
                energy_added: energy_added,
                fuel_percent_before: 0,
                charge_percent_before: 0,
                fuel_percent_after: null,
                charge_percent_after: null,
                fuel_before_actual: 0,
                charge_before_actual: 0,
                fuel_after_actual: null,
                charge_after_actual: null,
                fuel_consumption: parseNumber(row['油耗(L/100km)']),
                elec_consumption: parseNumber(row['电耗(kWh/100km)']),
                total_consumption: parseNumber(row['总能耗(L/100km)'])
            };
        };

        const submitImport = async (recordsToImport) => {
            console.log('可导入记录数:', recordsToImport.length);
            if (recordsToImport.length === 0) {
                alert('没有有效记录可导入');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/records/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({ userId: currentUser.userId, records: recordsToImport })
                });
                const result = await res.json();
                console.log('导入结果:', result);
                if (res.ok) {
                    alert(`成功导入 ${result.count} 条记录`);
                    await loadUserData();
                    recalcAllConsumptions();
                    currentPage = 1;
                    renderAll();
                } else {
                    alert('导入失败: ' + (result.error || '未知错误'));
                }
            } catch (err) {
                alert('网络错误: ' + err.message);
            }
        };

        // --- CSV 解析 ---
        if (isCSV) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    let text = event.target.result;
                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                    const lines = text.split(/\r?\n/).filter(l => l.trim());
                    if (lines.length < 2) { alert('CSV 文件无数据'); return; }
                    const parseCSVLine = (line) => {
                        const fields = [];
                        let cur = '';
                        let inQuote = false;
                        for (let i = 0; i < line.length; i++) {
                            const ch = line[i];
                            if (inQuote) {
                                if (ch === '"') {
                                    if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
                                    else { inQuote = false; }
                                } else { cur += ch; }
                            } else {
                                if (ch === '"') { inQuote = true; }
                                else if (ch === ',') { fields.push(cur); cur = ''; }
                                else { cur += ch; }
                            }
                        }
                        fields.push(cur);
                        return fields;
                    };
                    const headers = parseCSVLine(lines[0]).map(h => h.trim());
                    const rows = [];
                    for (let i = 1; i < lines.length; i++) {
                        const fields = parseCSVLine(lines[i]);
                        if (fields.length === 0) continue;
                        const rowObj = {};
                        headers.forEach((h, idx) => { rowObj[h] = (fields[idx] || '').trim(); });
                        rows.push(rowObj);
                    }
                    console.log('CSV 解析到', rows.length, '行数据');
                    if (rows.length === 0) { alert('CSV 文件无数据'); return; }
                    const recordsToImport = [];
                    for (const row of rows) {
                        const rec = parseRecordRow(row);
                        if (rec) recordsToImport.push(rec);
                    }
                    await submitImport(recordsToImport);
                } catch (err) {
                    console.error('CSV 导入错误:', err);
                    alert('CSV 解析失败: ' + err.message);
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
            return;
        }

        // --- XLSX 解析 ---
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                if (typeof XLSX === 'undefined') {
                    alert('XLSX 库未加载，无法导入 Excel 文件。请刷新页面重试，或先将文件转为 CSV 后导入。');
                    return;
                }
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);
                console.log('解析到', rows.length, '行数据');
                if (rows.length === 0) { alert('Excel文件无数据'); return; }
                const recordsToImport = [];
                for (const row of rows) {
                    const rec = parseRecordRow(row);
                    if (rec) recordsToImport.push(rec);
                }
                await submitImport(recordsToImport);
            } catch (err) {
                console.error('XLSX 导入错误:', err);
                alert('Excel 解析失败: ' + err.message);
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
    document.querySelectorAll('.type-btn[data-type]').forEach(btn => {
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
        fuelAmount.required = false;
        chargeAmount.required = false;
    } else {
        afterFuelField.style.display = 'none';
        afterChargeField.style.display = 'flex';
        fuelPercentAfter.required = false;
        chargePercentAfter.required = true;
        fuelAmountField.style.display = 'none';
        chargeAmountField.style.display = 'block';
        fuelAmount.required = false;
        chargeAmount.required = false;
    }
}
document.querySelectorAll('.type-btn[data-type]').forEach(btn => btn.addEventListener('click', () => setEventTypeUI(btn.dataset.type)));

// 按钮事件绑定
submitBtn.onclick = addRecord;
// 阻止表单原生提交
const recordForm = document.getElementById('recordForm');
if (recordForm) recordForm.addEventListener('submit', (e) => e.preventDefault());
// 补能时间默认当前时间
function setDefaultRefuelTime() {
    var now = new Date();
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    refuelTimeInp.value = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
}

// 清空按钮（清空表单）
if (clearAllBtn) {
    // 补能时间默认当前时间
    setDefaultRefuelTime();
        initBevAutoCalc();

    clearAllBtn.onclick = () => {
        document.getElementById('recordForm').reset();
        setDefaultRefuelTime();
        renderAll();
    };
}
// 回收站按钮
if (trashBtn) {
    trashBtn.onclick = showTrash;
}
// 添加车辆按钮
if (addVehicleBtn) {
    addVehicleBtn.onclick = () => {
        showProfileModal();
    };
}
// 用户菜单点击打开个人中心
if (userMenu) {
    userMenu.onclick = showProfileModal;
} else {
    // 旧版方案：userNameSpan 点击
}
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
debugLog('session restore: checking saved credentials');
const savedUserId = sessionStorage.getItem('ces_userId');
const savedUsername = sessionStorage.getItem('ces_username');
const savedToken = sessionStorage.getItem('ces_token');
debugLog('session restore: got savedUserId=' + (savedUserId ? savedUserId.substring(0,8) : 'null') + ', savedUsername=' + (savedUsername || 'null') + ', savedToken=' + (savedToken ? '✓' : '✗'));
if (savedUserId && savedUsername && savedToken) {
    currentUser = { userId: savedUserId, username: savedUsername };
    debugLog('session restore: user=' + savedUsername + ', loading data...');
    userNameSpan.innerText = `👤 ${savedUsername}`;
    userNameSpan.style.cursor = 'pointer';
    userNameSpan.onclick = showProfileModal;
    if (userAvatar) userAvatar.innerText = savedUsername.charAt(0).toUpperCase();
    if (userMenu) userMenu.onclick = showProfileModal;
    authCard.style.display = 'none';
    mainApp.style.display = 'block';
    loadUserData().then(() => { debugLog('session restore: loadUserData complete, now recalc & render'); recalcAllConsumptions(); renderAll(); });
} else {
    // 未登录，显示登录界面
    debugLog('session restore: no saved credentials, showing login');
    showLoginBtn.click();
}
// ===== 页面不可见 5 分钟自动退出登录 =====
(function() {
    const TIMEOUT_MS = 2 * 60 * 1000; // 5 分钟
    let hiddenTimer = null;

    document.addEventListener("visibilitychange", function() {
        if (document.hidden) {
            hiddenTimer = setTimeout(function() {
                if (currentUser) {
                    logout();
                    showMessage("页面离开超过 2 分钟，已自动退出登录", true);
                }
            }, TIMEOUT_MS);
        } else {
            if (hiddenTimer) {
                clearTimeout(hiddenTimer);
                hiddenTimer = null;
            }
        }
    });
})();

// ===== 侧边栏统计更新 =====
function updateSidebarStats() {
    var totalCost = records.reduce(function(s, r) { return s + (r.amount_money || 0); }, 0);
    var totalFuelAdded = 0, totalElecAdded = 0;
    var fuelFromEA = 0, elecFromEA = 0, fuelFromPct = 0, elecFromPct = 0;
    
    // 优先使用 energy_added，没有的则从百分比差值计算（修复：不再要求两者均为0才启动备选计算）
    if (initConfig) {
        var fuelCap = initConfig.total_fuel_capacity || 60;
        var elecCap = initConfig.total_elec_capacity || 18;
        var initFuelPct = initConfig.init_fuel_percent ?? 100;
        var initChargePct = initConfig.init_charge_percent ?? 100;
        var sorted = [...records].sort(function(a, b) { return (a.refuel_time || a.timestamp) - (b.refuel_time || b.timestamp); });
        for (var i = 0; i < sorted.length; i++) {
            var r = sorted[i];
            var prev = i > 0 ? sorted[i - 1] : null;
            if (r.type === 'fuel') {
                if (r.energy_added != null && r.energy_added > 0) {
                    totalFuelAdded += r.energy_added;
                    fuelFromEA += r.energy_added;
                } else {
                    // 从百分比差值计算
                    var paf = prev ? (prev.fuel_percent_after ?? prev.fuel_percent_before) : initFuelPct;
                    var fbp = r.fuel_percent_before ?? paf;
                    var fap = r.fuel_percent_after;
                    if (fap != null && fbp != null) {
                        var added = Math.max(0, (fap - fbp) / 100 * fuelCap);
                        totalFuelAdded += added;
                        fuelFromPct += added;
                    }
                }
            } else if (r.type === 'ev') {
                if (r.energy_added != null && r.energy_added > 0) {
                    totalElecAdded += r.energy_added;
                    elecFromEA += r.energy_added;
                } else {
                    var pac = prev ? (prev.charge_percent_after ?? prev.charge_percent_before) : initChargePct;
                    var cbp = r.charge_percent_before ?? pac;
                    var cap = r.charge_percent_after;
                    if (cap != null && cbp != null) {
                        var added = Math.max(0, (cap - cbp) / 100 * elecCap);
                        totalElecAdded += added;
                        elecFromPct += added;
                    }
                }
            }
        }
    }
    
    debugLog('updateSidebarStats: records=' + records.length + ' fuel_total=' + totalFuelAdded.toFixed(2) + 'L (ea=' + fuelFromEA.toFixed(2) + ', pct=' + fuelFromPct.toFixed(2) + ') elec_total=' + totalElecAdded.toFixed(2) + 'kWh (ea=' + elecFromEA.toFixed(2) + ', pct=' + elecFromPct.toFixed(2) + ')');
    
    // 计算平均能耗
    var avgFuelConsumption = null, avgElecConsumption = null;
    var totalFuelConsumed = 0, totalElecConsumed = 0;
    if (records.length > 0 && initConfig) {
        var sorted = [...records].sort(function(a, b) { return (a.refuel_time || a.timestamp) - (b.refuel_time || b.timestamp); });
        var initTotal = initConfig.init_total_mileage || 0;
        var initHev = initConfig.init_hev_mileage || 0;
        var last = sorted[sorted.length - 1];
        var lastTotal = last.total_mileage || 0;
        var lastHev = last.hev_mileage || 0;
        var totalHevDriven = lastHev - initHev;
        var totalEvDriven = (lastTotal - initTotal) - (lastHev - initHev);
        for (var i = 0; i < sorted.length; i++) {
            var r = sorted[i];
            var prev = i > 0 ? sorted[i - 1] : null;
            var prevHev = prev ? prev.hev_mileage : initHev;
            var currHev = r.hev_mileage || prevHev;
            var tripHev = currHev - prevHev;
            if (tripHev > 0 && r.fuel_consumption != null && r.fuel_consumption > 0) {
                totalFuelConsumed += (r.fuel_consumption / 100 * tripHev);
            }
            var prevTotal = prev ? prev.total_mileage : initTotal;
            var currTotal = r.total_mileage || prevTotal;
            var tripTotal = currTotal - prevTotal;
            var tripEv = tripTotal - tripHev;
            if (tripEv > 0 && r.elec_consumption != null && r.elec_consumption > 0) {
                totalElecConsumed += (r.elec_consumption / 100 * tripEv);
            }
        }
        if (totalHevDriven > 0 && totalFuelConsumed > 0) {
            avgFuelConsumption = (totalFuelConsumed / totalHevDriven) * 100;
        }
        if (totalEvDriven > 0 && totalElecConsumed > 0) {
            avgElecConsumption = (totalElecConsumed / totalEvDriven) * 100;
        }
    }var vtype = initConfig ? (initConfig.vehicle_type || 'erev_phev') : 'erev_phev';
    var isBEV = vtype === 'bev';
    var isICE = vtype === 'ice';
    
    var el;
    el = document.getElementById('totalCostBadge');
    if (el) el.innerText = '\u00a5' + totalCost.toFixed(0);
    
    el = document.getElementById('totalFuelBadge');
    if (el) {
        el.innerText = avgFuelConsumption !== null ? avgFuelConsumption.toFixed(2) + ' L/100km' : '0';
    }
    el = document.getElementById('totalElecBadge');
    if (el) {
        el.innerText = avgElecConsumption !== null ? avgElecConsumption.toFixed(2) + ' kWh/100km' : '0';
    }
    
    el = document.getElementById('totalFuelAddedBadge');
    if (el) el.innerText = totalFuelAdded.toFixed(1) + 'L';
    el = document.getElementById('totalElecAddedBadge');
    if (el) el.innerText = totalElecAdded.toFixed(1) + 'kWh';
    
    el = document.getElementById('recordCount');
    if (el) el.innerText = records.length;
    
    // 纯电车不展示油耗和加油量，纯油车不展示电耗和充电量
    var avgFuelRow = document.getElementById('avgFuelRow');
    var avgElecRow = document.getElementById('avgElecRow');
    var fuelAddedRow = document.getElementById('fuelAddedRow');
    var elecAddedRow = document.getElementById('elecAddedRow');
    if (isBEV) {
        if (avgFuelRow) avgFuelRow.style.display = 'none';
        if (fuelAddedRow) fuelAddedRow.style.display = 'none';
        if (avgElecRow) avgElecRow.style.display = '';
        if (elecAddedRow) elecAddedRow.style.display = '';
    } else if (isICE) {
        if (avgElecRow) avgElecRow.style.display = 'none';
        if (elecAddedRow) elecAddedRow.style.display = 'none';
        if (avgFuelRow) avgFuelRow.style.display = '';
        if (fuelAddedRow) fuelAddedRow.style.display = '';
    } else {
        if (avgFuelRow) avgFuelRow.style.display = '';
        if (avgElecRow) avgElecRow.style.display = '';
        if (fuelAddedRow) fuelAddedRow.style.display = '';
        if (elecAddedRow) elecAddedRow.style.display = '';
    }
}

// ===== 主题面板初始化 =====
(function initThemePanel() {
    var themeBtn = document.getElementById('themeToggleBtn');
    var themePanel = document.getElementById('themePanel');
    var color1 = document.getElementById('themeColor1');
    var color2 = document.getElementById('themeColor2');
    var applyBtn = document.getElementById('applyCustomColor');

    if (!themeBtn || !themePanel) return;

    var savedTheme = localStorage.getItem('theme_mode');
    var savedBg = localStorage.getItem('theme_bg');
    if (savedTheme === 'light') document.body.classList.add('light-mode');
    if (savedBg) {
        document.body.style.background = savedBg;
        document.body.style.backgroundAttachment = 'fixed';
    }

    themeBtn.onclick = function(e) {
        e.stopPropagation();
        themePanel.style.display = (themePanel.style.display === 'none') ? 'block' : 'none';
    };

    document.addEventListener('click', function(e) {
        if (!themePanel.contains(e.target) && e.target !== themeBtn) {
            themePanel.style.display = 'none';
        }
    });

    themePanel.onclick = function(e) {
        var target = e.target;
        if (target.classList.contains('theme-mode-btn')) {
            var mode = target.dataset.mode;
            document.querySelectorAll('.theme-mode-btn').forEach(function(b) { b.classList.remove('active'); });
            target.classList.add('active');
            if (mode === 'light') {
                document.body.classList.add('light-mode');
                localStorage.setItem('theme_mode', 'light');
            } else {
                document.body.classList.remove('light-mode');
                localStorage.setItem('theme_mode', 'dark');
            }
        }
        if (target.classList.contains('theme-preset')) {
            var bg = target.dataset.bg;
            document.body.style.background = bg;
            document.body.style.backgroundAttachment = 'fixed';
            localStorage.setItem('theme_bg', bg);
            themePanel.style.display = 'none';
        }
        if (target.id === 'applyCustomColor' || target.closest('#applyCustomColor')) {
            var c1 = color1 ? color1.value : '#6c5ce7';
            var c2 = color2 ? color2.value : '#ec4899';
            var gradient = 'linear-gradient(135deg, ' + c1 + ' 0%, ' + c2 + ' 100%)';
            document.body.style.background = gradient;
            document.body.style.backgroundAttachment = 'fixed';
            localStorage.setItem('theme_bg', gradient);
            themePanel.style.display = 'none';
        }
    };
})();
