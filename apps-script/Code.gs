/**
 * 成大單車社｜社員系統 v5
 * 貼到「綁定在試算表上的 Apps Script」，檔名 Code.gs
 * 更新後：執行一次 setup()（會自動整理欄位、補欄位），再「部署 → 管理部署 → 編輯 → 新版本」
 * 部署設定請務必：執行身分＝「我」、誰可以存取＝「所有人」（否則每個人開都會跳權限）
 */
const TZ = 'Asia/Taipei';
const EXP = ['無經驗', '1-3km', '3-20km', '20-50km', '50km以上'];
const RULE_ZH = 'https://docs.google.com/document/d/1q5ujgpk2lxlKUb2O8sR9eJJm0a5BivzjMhTOqSI4EY4/edit?usp=sharing';
const RULE_EN = 'https://docs.google.com/document/d/1kOiuNEeB7kAFdmgDzaDB9souQYXE2uOhIxgtxQXSM_Q/edit?usp=sharing';

// 欄位順序＝幹部在 Excel 看到的順序：人看得懂的欄位在前，ID 在最後（會被自動隱藏）
const SCHEMA = {
  '活動': ['日期','活動名稱','類型','集合時間','預計結束','報名截止','最晚還車時間','集合地點','路線連結','距離km','難度','領騎','領騎電話','押後','押後電話','人數上限','一般價','社員價','幹部價','開放報名','開放借車','活動說明','注意事項','備註','活動照片URL','建立時間','activityId'],
  '社員名單': ['姓名','FB名稱','性別','學號','系級','Email','電話','騎行經驗','經驗里程','累計里程km','是否社員','幹部','幹部職稱','社費年度','社費已繳','已讀團騎公約','啟用','最後更新','memberId'],
  '活動報名': ['活動日期','活動名稱','姓名','學號','電話','Email','身分','應繳金額','已繳費','借安全帽','借車燈','借攜車袋','是否借車','身高','租借費用','租借費已繳','團騎公約','想說的話','報名時間','狀態','取消原因','取消備註','取消時間','社車優先序','activityId','memberId','registrationId'],
  '簽到紀錄': ['活動日期','活動名稱','姓名','學號','簽到時間','方式','activityId','memberId','checkinId'],
  '社車名單': ['車名','類型','尺寸','顏色','照片URL','狀態','啟用','備註','最後更新','bikeId'],
  '社車預約': ['活動日期','活動名稱','姓名','車名','預約時間','狀態','優先序','取消時間','activityId','memberId','bikeId','reservationId'],
  '借車紀錄': ['活動日期','活動名稱','姓名','車名','借出時間','應還時間','歸還時間','狀態','備註','activityId','memberId','bikeId','loanId'],
  '車況回報': ['回報時間','車名','姓名','車況','說明','處理狀態','照片URL','loanId','bikeId','memberId','reportId'],
  '行程反饋': ['活動日期','活動名稱','姓名','填寫時間','難度評分','路線評分','節奏','文字回饋','activityId','memberId','feedbackId'],
  '系統設定': ['key','value','description']
};

// 這些欄位固定用純文字，避免 Sheets 把 "18:30" 轉成 1899 年的日期、電話開頭 0 被吃掉
const TEXT_COLS = {
  '活動': ['日期', '集合時間', '預計結束', '報名截止', '最晚還車時間', '領騎電話', '押後電話'],
  '社員名單': ['學號', '電話'],
  '活動報名': ['學號', '電話'],
  '系統設定': ['value']
};
const FILTER_SHEETS = ['活動', '社員名單', '活動報名', '簽到紀錄', '社車預約', '借車紀錄', '車況回報', '行程反饋'];

// ================= 入口 =================

// ================= GitHub Pages API =================
// Cloudflare Worker 會把前端請求轉送到這裡。
// 請在「專案設定 → 指令碼屬性」建立 API_SHARED_SECRET。

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('API_SHARED_SECRET') || '';
    if (!expected || String(body.secret || '') !== expected) {
      return apiJson_({ ok: false, error: 'Unauthorized' });
    }
    const fn = String(body.fn || '');
    const args = Array.isArray(body.args) ? body.args : [];
    const allowed = {
      getAppData: getAppData, getMyDashboard: getMyDashboard, getActivityDetail: getActivityDetail, getImages: getImages,
      loginMember: loginMember, saveMemberProfile: saveMemberProfile, registerActivity: registerActivity, updateRental: updateRental,
      cancelRegistration: cancelRegistration, reserveBike: reserveBike, borrowReservedBike: borrowReservedBike, returnBike: returnBike,
      checkIn: checkIn, submitFeedback: submitFeedback, sendCadreCode: sendCadreCode, verifyCadreCode: verifyCadreCode, adminLogin: adminLogin,
      getAdminSummary: getAdminSummary, getRoster: getRoster, getBikeBoard: getBikeBoard, adminAssignBike: adminAssignBike,
      adminUnassignBike: adminUnassignBike, setPaid: setPaid, adminSetAttendance: adminSetAttendance, saveActivity: saveActivity,
      toggleActivityOpen: toggleActivityOpen, saveBike: saveBike, resolveReport: resolveReport, forceReturn: forceReturn,
      setMemberFlags: setMemberFlags, adminRebuildAttendance: adminRebuildAttendance, uploadImage: uploadImage
    };
    if (!allowed[fn]) return apiJson_({ ok: false, error: 'Unknown API method' });
    const result = allowed[fn].apply(null, args);
    return apiJson_({ ok: true, result: result });
  } catch (err) {
    console.error(err);
    return apiJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

function apiJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('成大單車社｜社員系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('單車社')
      .addItem('整理工作表 / 升級欄位', 'setup')
      .addItem('更新出席總表', 'rebuildAttendance')
      .addToUi();
  } catch (e) {}
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SCHEMA).forEach(n => upgradeSheet_(ss, n, SCHEMA[n]));
  styleSheets_(ss);

  const defs = [
    ['clubName', '成大單車社', '網站顯示名稱'],
    ['adminPin', '1234', '幹部後台密碼（請改掉！）'],
    ['adminEmails', '', '幹部 Gmail，多個用逗號分隔；可用 Email 驗證碼登入後台'],
    ['allowSelfReserve', 'FALSE', 'TRUE＝社員可自己選車；FALSE＝由幹部分配，社員只看得到被分配的車'],
    ['defaultReturnTime', '23:59', '未填最晚還車時間時的預設值'],
    ['rentBikeFee', '30', '非繳費社員借社車（含安全帽、車燈）的費用'],
    ['rentGearFee', '10', '非繳費社員只借安全帽／車燈的費用（一起借也是這個價）'],
    ['rentBagFee', '10', '非繳費社員借攜車袋的費用'],
    ['ruleUrlZh', RULE_ZH, '團騎公約（中文）連結'],
    ['ruleUrlEn', RULE_EN, '團騎公約（English）連結']
  ];
  const have = rows_('系統設定').map(r => String(r.key));
  defs.forEach(d => { if (!have.includes(d[0])) appendObj_('系統設定', { key: d[0], value: d[1], description: d[2] }); });
  // 攜車袋舊預設是 0，改成 10
  const bagRow = rows_('系統設定').find(r => String(r.key) === 'rentBagFee');
  if (bagRow && String(bagRow.value).trim() === '0') setRow_('系統設定', bagRow._row, { value: '10' });

  if (!rows_('社車名單').length) {
    appendObj_('社車名單', { bikeId: id_('BIKE'), 車名: '範例公路車 A', 類型: '公路車', 尺寸: 'M', 顏色: '#2563eb', 狀態: '可借', 啟用: true, 最後更新: new Date() });
    appendObj_('社車名單', { bikeId: id_('BIKE'), 車名: '範例公路車 B', 類型: '公路車', 尺寸: 'S', 顏色: '#dc2626', 狀態: '可借', 啟用: true, 最後更新: new Date() });
  }
  if (!rows_('活動').length) {
    const d = new Date(); d.setDate(d.getDate() + 7);
    appendObj_('活動', {
      activityId: id_('ACT'), 活動名稱: '範例夜騎', 類型: '例行活動', 日期: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'),
      集合時間: '18:30', 預計結束: '22:00', 最晚還車時間: '23:30', 集合地點: '成大光復校區',
      距離km: 35, 難度: 2, 人數上限: 30, 開放報名: true, 開放借車: true,
      活動說明: '這是範例活動，可在幹部後台修改。', 建立時間: new Date()
    });
  }
  fillMissing_();
  return 'setup 完成';
}

// ---- 升級舊表：重排欄位、補欄位、補活動名稱，改之前先備份 ----
function upgradeSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, headers.length).setValues([headers]); return; }
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, headers.length).setValues([headers]); return; }

  const v = sh.getDataRange().getValues();
  const cur = v[0].map(String);
  const target = headers.concat(cur.filter(h => h && !headers.includes(h)));
  if (cur.length === target.length && cur.every((h, i) => h === target[i])) return;

  sh.copyTo(ss).setName('備份_' + name + '_' + Utilities.formatDate(new Date(), TZ, 'MMddHHmmss'));

  const idx = {}; cur.forEach((h, i) => idx[h] = i);
  const acts = {};
  if (name !== '活動') rows_('活動').forEach(a => acts[String(a.activityId)] = a);
  const out = v.slice(1).filter(r => r.some(x => x !== '')).map(r => {
    return target.map(h => {
      let x = idx[h] === undefined ? '' : r[idx[h]];
      if (x === '' && idx.activityId !== undefined && (h === '活動名稱' || h === '活動日期')) {
        const a = acts[String(r[idx.activityId])];
        if (a) x = h === '活動名稱' ? a.活動名稱 : dateStr_(a.日期);
      }
      if (x === '' && h === 'memberId' && name === '社員名單') x = id_('MEM');
      if (x === '' && h === 'bikeId' && name === '社車名單') x = id_('BIKE');
      return x;
    });
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, target.length).setValues([target]);
  if (out.length) sh.getRange(2, 1, out.length, target.length).setValues(out);
}

function styleSheets_(ss) {
  Object.keys(SCHEMA).forEach(name => {
    const sh = ss.getSheetByName(name);
    const lastCol = sh.getLastColumn();
    const h = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const rowsMax = sh.getMaxRows();

    h.forEach((c, i) => {
      const textCol = (TEXT_COLS[name] || []).includes(c) || c === '活動日期';
      if (textCol) sh.getRange(1, i + 1, rowsMax, 1).setNumberFormat('@');
      else if (/時間$/.test(c) || c === '最後更新') sh.getRange(2, i + 1, Math.max(rowsMax - 1, 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
      if (/Id$/.test(c)) { try { sh.hideColumns(i + 1); } catch (e) {} }
    });

    sh.getRange(1, 1, 1, lastCol).setFontWeight('bold').setBackground('#ede9fe');
    sh.setFrozenRows(1);
    if (FILTER_SHEETS.includes(name)) {
      try { if (!sh.getFilter()) sh.getRange(1, 1, rowsMax, lastCol).createFilter(); } catch (e) {}
    }
  });
}

// 幹部直接在 Excel 新增的車／活動／社員，如果沒填 ID 與預設值，自動補
function fillMissing_() {
  fillCol_('活動', 'activityId', 'ACT', { 開放報名: true, 開放借車: true });
  fillCol_('社車名單', 'bikeId', 'BIKE', { 狀態: '可借', 啟用: true });
  fillCol_('社員名單', 'memberId', 'MEM', { 啟用: true });
}
function fillCol_(name, idCol, prefix, defaults) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) return;
  const lastCol = sh.getLastColumn();
  const h = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  const ci = h.indexOf(idCol);
  let changed = false;
  data.forEach(r => {
    if (!r.some(x => x !== '')) return;
    if (ci >= 0 && r[ci] === '') { r[ci] = id_(prefix); changed = true; }
    Object.keys(defaults).forEach(k => {
      const c = h.indexOf(k);
      if (c >= 0 && r[c] === '') { r[c] = defaults[k]; changed = true; }
    });
  });
  if (changed) sh.getRange(2, 1, data.length, lastCol).setValues(data);
}
function throttledFill_() {
  const c = CacheService.getScriptCache();
  if (c.get('filled')) return;
  try { fillMissing_(); } catch (e) {}
  c.put('filled', '1', 60);
}

// ================= 圖片（用「我」的身分讀 Drive，社員不需要任何權限） =================

function getImage(fileId) {
  const id = String(fileId || '').trim();
  if (!/^[\w-]{10,}$/.test(id)) return '';
  const cache = CacheService.getScriptCache(), key = 'img_' + id;
  const hit = cache.get(key);
  if (hit) return hit;
  const f = DriveApp.getFileById(id);
  let blob = f.getBlob();
  if (!/^image\//.test(blob.getContentType())) return '';
  if (blob.getBytes().length > 180000) blob = f.getThumbnail() || blob;
  const data = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  if (data.length < 95000) cache.put(key, data, 21600);
  return data;
}

// 一次取得多張 Drive 圖片，減少前端 google.script.run 往返次數
function getImages(fileIds) {
  const ids = [...new Set((fileIds || []).map(x => String(x || '').trim()).filter(x => /^[\w-]{10,}$/.test(x)))].slice(0, 30);
  const out = {};
  ids.forEach(id => {
    try { out[id] = getImage(id) || ''; }
    catch (e) { out[id] = ''; }
  });
  return out;
}

// 上傳照片到 Drive（社車、活動）。前端會先縮圖，這裡只收 JPG/PNG/WebP
function uploadImage(auth, dataUrl, kind) {
  requireAdmin_(auth);
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('只支援 JPG / PNG / WebP 圖片');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 3 * 1024 * 1024) throw new Error('圖片太大，請換小一點的');
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  const blob = Utilities.newBlob(bytes, m[1], (kind || 'img') + '_' + Date.now() + '.' + ext);
  const it = DriveApp.getFoldersByName('成大單車社照片');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('成大單車社照片');
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {} // 學校網域可能禁止，沒關係，顯示不靠它
  return { ok: true, url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200' };
}

// ================= 社員 =================

function getBootstrap(memberId) {
  throttledFill_();
  const member = memberId ? findMemberById_(memberId) : null;
  return ser_({
    clubName: getSetting_('clubName') || '成大單車社',
    today: today_(),
    member: member ? clean_(member) : null,
    activities: listActivities_(member, false),
    bikes: listBikes_(memberId, false)
  });
}

// v5-speed：首頁所需資料一次回傳；同一 request 內 Sheet 只讀一次
function getAppData(memberId) {
  return withReadCache_(() => {
    const boot = getBootstrap(memberId);
    const dash = boot.member ? getMyDashboard(boot.member.memberId) : null;
    return ser_({ boot: boot, dash: dash });
  });
}

function loginMember(studentId, name) {
  const sid = normalize_(studentId), nm = normalize_(name);
  if (!sid || !nm) throw new Error('請輸入學號與姓名');
  const m = rows_('社員名單').find(r => truthy_(r.啟用) && normalize_(r.學號) === sid && normalize_(r.姓名) === nm);
  if (!m) throw new Error('找不到符合的資料，請確認學號與姓名，或先建立社員資料');
  return ser_(clean_(m));
}

function saveMemberProfile(p) {
  return withLock_(() => {
    const name = String(p.name || '').trim(), sid = String(p.studentId || '').trim();
    if (!name || !sid) throw new Error('姓名與學號為必填');
    [['fb', 'FB 名稱'], ['gender', '性別'], ['department', '系級'], ['phone', '電話']].forEach(x => {
      if (!String(p[x[0]] || '').trim()) throw new Error('請填寫' + x[1]);
    });
    if (EXP.indexOf(p.exp) < 0) throw new Error('請選擇騎行經驗');

    const f = {
      姓名: name, FB名稱: String(p.fb).trim(), 性別: p.gender, 系級: String(p.department).trim(),
      Email: String(p.email || '').trim(), 電話: String(p.phone).trim(),
      經驗里程: p.exp, 騎行經驗: p.exp === EXP[0] ? '無經驗' : '有經驗', 啟用: true, 最後更新: new Date()
    };
    const existing = rows_('社員名單').find(r => normalize_(r.學號) === normalize_(sid));
    if (existing) {
      if (normalize_(existing.姓名) !== normalize_(name))
        throw new Error('這個學號已經有資料了，請改用「登入」，並輸入原本的姓名');
      setRow_('社員名單', existing._row, f);
      return ser_(clean_(findMemberById_(existing.memberId)));
    }
    const memberId = id_('MEM');
    appendObj_('社員名單', Object.assign({
      memberId, 學號: sid, 累計里程km: 0, 是否社員: false, 幹部: false, 社費年度: '', 社費已繳: false, 已讀團騎公約: false
    }, f));
    return ser_(clean_(findMemberById_(memberId)));
  });
}

// 社員空間：我的所有活動紀錄、待領車、借車中
function getMyDashboard(memberId) {
  const m = findMemberById_(memberId);
  if (!m) return null;
  const id = String(m.memberId), mine = r => String(r.memberId) === id, today = today_();

  const acts = {}; rows_('活動').forEach(a => acts[String(a.activityId)] = a);
  const bikes = {}; rows_('社車名單').forEach(b => bikes[String(b.bikeId)] = b);
  const regs = rows_('活動報名').filter(r => mine(r) && String(r.狀態) !== '已取消');
  const rsvAll = rows_('社車預約').filter(r => mine(r) && String(r.狀態) !== '已取消');
  const checks = rows_('簽到紀錄').filter(mine);
  const fbs = rows_('行程反饋').filter(mine);

  const aname = aid => acts[String(aid)] ? acts[String(aid)].活動名稱 : '';
  const adate = aid => acts[String(aid)] ? dateStr_(acts[String(aid)].日期) : '';
  const checkedSet = {}; checks.forEach(c => checkedSet[String(c.activityId)] = true);
  const fbSet = {}; fbs.forEach(f => fbSet[String(f.activityId)] = true);
  const bikeInfo = bid => { const b = bikes[String(bid)]; return b ? { 照片URL: b.照片URL || '', 尺寸: b.尺寸 || '', 類型: b.類型 || '' } : {}; };

  const ids = [];
  regs.concat(checks).forEach(r => { const k = String(r.activityId); if (ids.indexOf(k) < 0) ids.push(k); });
  const history = ids.map(aid => {
    const reg = regs.find(r => String(r.activityId) === aid);
    const rsv = rsvAll.find(r => String(r.activityId) === aid);
    return {
      activityId: aid, date: adate(aid), name: aname(aid) || '（活動已刪除）',
      type: acts[aid] ? (acts[aid].類型 || '') : '',
      registered: !!reg, checkedIn: !!checkedSet[aid], feedbackDone: !!fbSet[aid],
      needBike: reg ? truthy_(reg.是否借車) : false, bike: rsv ? rsv.車名 : '',
      amount: reg ? numOrBlank_(reg.應繳金額) : '', paid: reg ? truthy_(reg.已繳費) : false,
      rentFee: reg ? numOrBlank_(reg.租借費用) : '', rentPaid: reg ? truthy_(reg.租借費已繳) : false,
      place: acts[aid] ? String(acts[aid].集合地點 || '') : '', meet: acts[aid] ? timeStr_(acts[aid].集合時間) : '',
      dist: acts[aid] ? acts[aid].距離km : '', diff: acts[aid] ? diffNum_(acts[aid].難度) : '',
      isPast: adate(aid) < today
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  return ser_({
    member: clean_(m),
    stats: { attended: history.filter(h => h.checkedIn).length, registered: history.filter(h => h.registered && !h.isPast).length },
    history,
    reservations: rsvAll.filter(r => String(r.狀態) === '已預約' && adate(r.activityId) >= today).map(r =>
      Object.assign(clean_(r), { 活動名稱: aname(r.activityId), checkedIn: !!checkedSet[String(r.activityId)] }, bikeInfo(r.bikeId))),
    loans: rows_('借車紀錄').filter(r => mine(r) && String(r.狀態) === '借出中').map(r => Object.assign(clean_(r), bikeInfo(r.bikeId)))
  });
}

// ================= 活動 =================

function getActivityDetail(activityId, memberId) {
  const a = findActivity_(activityId);
  const m = findMemberById_(memberId);
  const reg = findReg_(activityId, memberId);
  const rsv = rows_('社車預約').find(r => String(r.activityId) === String(activityId) &&
    String(r.memberId) === String(memberId) && String(r.狀態) !== '已取消');
  let rsvObj = null;
  if (rsv) {
    rsvObj = clean_(rsv);
    const b = rows_('社車名單').find(x => String(x.bikeId) === String(rsv.bikeId));
    if (b) { rsvObj.照片URL = b.照片URL || ''; rsvObj.尺寸 = b.尺寸 || ''; }
  }
  return ser_({
    activity: cleanActivity_(a, m),
    registration: reg ? clean_(reg) : null,
    reservation: rsvObj,
    selfReserve: truthy_(getSetting_('allowSelfReserve')),
    availableBikes: availableBikes_(activityId, memberId),
    rental: { tier: m ? tierOf_(m) : '一般', bike: settingNum_('rentBikeFee', 30), gear: settingNum_('rentGearFee', 10), bag: settingNum_('rentBagFee', 10) },
    rules: { zh: getSetting_('ruleUrlZh') || RULE_ZH, en: getSetting_('ruleUrlEn') || RULE_EN },
    memberRead: m ? truthy_(m.已讀團騎公約) : false
  });
}

// 繳費社員／幹部借東西免費；一般人：社車（含安全帽車燈）一個價、只借安全帽/車燈一個價、攜車袋另計
function rentalFee_(tier, o) {
  if (tier !== '一般') return 0;
  let f = 0;
  if (o.bike) f += settingNum_('rentBikeFee', 30);
  else if (o.helmet || o.light) f += settingNum_('rentGearFee', 10);
  if (o.bag) f += settingNum_('rentBagFee', 10);
  return f;
}

function registerActivity(p) {
  return withLock_(() => {
    const m = findMemberById_(p.memberId);
    if (!m) throw new Error('請先建立或登入社員資料');
    if (!m.經驗里程 || !m.性別 || !m.FB名稱 || !m.電話 || !m.系級)
      throw new Error('請先到「我的」補齊個人資料（含 FB 名稱、性別、騎行經驗）再報名');
    const a = findActivity_(p.activityId);
    if (!truthy_(a.開放報名)) throw new Error('此活動目前未開放報名');
    if (deadlinePassed_(a)) throw new Error('報名已截止');
    if (dateStr_(a.日期) && dateStr_(a.日期) < today_()) throw new Error('這場活動已經結束了');

    const regs = rows_('活動報名').filter(r => String(r.activityId) === String(p.activityId) && String(r.狀態) !== '已取消');
    if (regs.some(r => String(r.memberId) === String(m.memberId))) return { ok: true, message: '你已經報名過了' };
    const cap = Number(a.人數上限 || 0);
    if (cap > 0 && regs.length >= cap) throw new Error('活動名額已滿');

    const rules = String(p.rules || '').trim();
    if (!rules) throw new Error('請選擇是否已閱讀團騎公約');
    const can = truthy_(a.開放借車);
    const r = { bike: can && !!p.needBike, helmet: can && !!p.helmet, light: can && !!p.light, bag: can && !!p.bag };
    if (r.bike) { r.helmet = true; r.light = true; } // 社車已含安全帽、車燈
    const height = String(p.height || '').trim();
    if (r.bike && !height) throw new Error('借社車請填寫身高');

    const tier = tierOf_(m), price = priceFor_(a, m), rent = rentalFee_(tier, r);
    appendObj_('活動報名', {
      registrationId: id_('REG'), activityId: p.activityId, memberId: m.memberId,
      姓名: m.姓名, 學號: m.學號, 電話: m.電話, Email: m.Email, 身分: tier, 應繳金額: price,
      已繳費: price > 0 ? false : '', 借安全帽: r.helmet, 借車燈: r.light, 借攜車袋: r.bag, 是否借車: r.bike,
      身高: height, 租借費用: rent, 租借費已繳: rent > 0 ? false : '',
      團騎公約: rules, 想說的話: String(p.words || ''), 報名時間: new Date(), 狀態: '已報名'
    });
    setRow_('社員名單', m._row, { 已讀團騎公約: true });
    const tot = (Number(price) || 0) + rent;
    return { ok: true, message: tot > 0 ? '報名成功，應繳 $' + tot + '（活動費＋租借費，現場繳給幹部）' : '報名成功' };
  });
}

// 報名後修改租借（社車、安全帽、車燈、攜車袋）
function updateRental(p) {
  return withLock_(() => {
    const reg = findReg_(p.activityId, p.memberId);
    if (!reg) throw new Error('請先報名活動');
    const a = findActivity_(p.activityId);
    if (!truthy_(a.開放借車)) throw new Error('此活動未開放租借');
    const m = findMemberById_(p.memberId);
    const r = { bike: !!p.bike, helmet: !!p.helmet, light: !!p.light, bag: !!p.bag };
    if (r.bike) { r.helmet = true; r.light = true; }
    const height = String(p.height || '').trim();
    if (r.bike && !height) throw new Error('借社車請填寫身高');
    const rsv = findRsv_(p.activityId, p.memberId);
    if (!r.bike && rsv && String(rsv.狀態) === '已借出') throw new Error('你已經領車了，請先歸還');

    const rent = rentalFee_(tierOf_(m), r), old = Number(numOrBlank_(reg.租借費用)) || 0;
    setRow_('活動報名', reg._row, {
      借安全帽: r.helmet, 借車燈: r.light, 借攜車袋: r.bag, 是否借車: r.bike, 身高: height, 租借費用: rent,
      租借費已繳: rent > 0 ? (rent <= old ? truthy_(reg.租借費已繳) : false) : ''
    });
    if (!r.bike && rsv && String(rsv.狀態) === '已預約') setRow_('社車預約', rsv._row, { 狀態: '已取消', 取消時間: new Date() });
    return { ok: true, message: rent > 0 ? '已更新租借，租借費 $' + rent : '已更新租借' };
  });
}

// 取消報名一定要填原因
function cancelRegistration(activityId, memberId, reason, note) {
  return withLock_(() => {
    reason = String(reason || '').trim(); note = String(note || '').trim();
    if (!reason) throw new Error('請選擇取消原因');
    if (reason === '其他' && !note) throw new Error('選「其他」請補充說明');
    const rsv = findRsv_(activityId, memberId);
    if (rsv && String(rsv.狀態) === '已借出') throw new Error('你已經領車了，請先歸還社車再取消報名');
    const reg = findReg_(activityId, memberId);
    if (!reg) throw new Error('找不到報名紀錄');
    setRow_('活動報名', reg._row, { 狀態: '已取消', 取消原因: reason, 取消備註: note, 取消時間: new Date() });
    if (rsv) setRow_('社車預約', rsv._row, { 狀態: '已取消', 取消時間: new Date() });
    return { ok: true, message: '已取消報名' };
  });
}

// ================= 社車 =================

// 社員自己選車（只有 allowSelfReserve=TRUE 才開放）
function reserveBike(p) {
  return withLock_(() => {
    if (!truthy_(getSetting_('allowSelfReserve'))) throw new Error('社車由幹部統一分配，請在報名時勾選「社車」');
    const m = findMemberById_(p.memberId);
    if (!m) throw new Error('找不到社員資料');
    const a = findActivity_(p.activityId);
    if (!truthy_(a.開放借車)) throw new Error('此活動未開放社車預約');
    if (!findReg_(p.activityId, m.memberId)) throw new Error('請先報名活動，再預約社車');
    const bike = availableBikes_(p.activityId, m.memberId).find(b => String(b.bikeId) === String(p.bikeId));
    if (!bike) throw new Error('這台車剛剛被預約了，或目前不能借');
    assignBike_(p.activityId, m, bike, p.priority || '');
    return { ok: true, message: '已預約：' + bike.車名 };
  });
}

function assignBike_(activityId, m, bike, priority) {
  const existing = findRsv_(activityId, m.memberId);
  if (existing) {
    if (String(existing.狀態) === '已借出') throw new Error('這位社員已經領車了，不能更換');
    setRow_('社車預約', existing._row, { bikeId: bike.bikeId, 車名: bike.車名, 優先序: priority, 預約時間: new Date(), 狀態: '已預約' });
  } else {
    appendObj_('社車預約', {
      reservationId: id_('RSV'), activityId: activityId, memberId: m.memberId, 姓名: m.姓名,
      bikeId: bike.bikeId, 車名: bike.車名, 優先序: priority, 預約時間: new Date(), 狀態: '已預約'
    });
  }
}

function borrowReservedBike(p) {
  return withLock_(() => {
    const m = findMemberById_(p.memberId);
    if (!m) throw new Error('找不到社員資料');
    const checked = rows_('簽到紀錄').some(c => String(c.activityId) === String(p.activityId) && String(c.memberId) === String(m.memberId));
    if (!checked) throw new Error('請先完成活動簽到，再領車');

    const rsv = rows_('社車預約').find(r => String(r.activityId) === String(p.activityId) &&
      String(r.memberId) === String(m.memberId) && String(r.狀態) === '已預約');
    if (!rsv) throw new Error('找不到你的社車預約');
    if (rows_('借車紀錄').some(l => String(l.bikeId) === String(rsv.bikeId) && String(l.狀態) === '借出中'))
      throw new Error('這台車目前還沒歸還');

    const a = findActivity_(p.activityId);
    appendObj_('借車紀錄', {
      loanId: id_('LOAN'), activityId: p.activityId, memberId: m.memberId, 姓名: m.姓名,
      bikeId: rsv.bikeId, 車名: rsv.車名, 借出時間: new Date(), 應還時間: computeDue_(a), 狀態: '借出中'
    });
    setRow_('社車預約', rsv._row, { 狀態: '已借出' });
    return { ok: true, message: '已領車：' + rsv.車名 };
  });
}

function returnBike(p) {
  return withLock_(() => {
    const loan = rows_('借車紀錄').find(r => String(r.memberId) === String(p.memberId) &&
      String(r.狀態) === '借出中' && (!p.loanId || String(r.loanId) === String(p.loanId)));
    if (!loan) throw new Error('找不到未歸還的借車紀錄');

    setRow_('借車紀錄', loan._row, { 歸還時間: new Date(), 狀態: '已歸還' });
    if (p.condition && p.condition !== '正常') {
      appendObj_('車況回報', {
        reportId: id_('RPT'), loanId: loan.loanId, bikeId: loan.bikeId, 車名: loan.車名,
        memberId: loan.memberId, 姓名: loan.姓名, 回報時間: new Date(),
        車況: p.condition, 說明: p.note || '', 處理狀態: '待處理'
      });
      const b = rows_('社車名單').find(x => String(x.bikeId) === String(loan.bikeId));
      if (b) setRow_('社車名單', b._row, { 狀態: '待檢修', 最後更新: new Date() });
    }
    return { ok: true, message: '已歸還：' + loan.車名 };
  });
}

// 社員看到的社車狀態：可借／已預約（待借出）／借出中／待檢修
function listBikes_(memberId, admin) {
  const today = today_();
  const acts = {}; rows_('活動').forEach(a => acts[String(a.activityId)] = a);
  const rsv = {};
  rows_('社車預約').forEach(r => {
    if (String(r.狀態) !== '已預約') return;
    const a = acts[String(r.activityId)];
    if (!a || dateStr_(a.日期) < today) return;
    const k = String(r.bikeId);
    (rsv[k] = rsv[k] || []).push({ name: r.姓名, memberId: r.memberId, activity: a.活動名稱, date: dateStr_(a.日期) });
  });
  const loan = {};
  rows_('借車紀錄').forEach(l => { if (String(l.狀態) === '借出中') loan[String(l.bikeId)] = { name: l.姓名, memberId: l.memberId, activity: l.活動名稱 }; });

  return rows_('社車名單').filter(b => admin || truthy_(b.啟用)).map(b => {
    const o = clean_(b), id = String(b.bikeId);
    const L = loan[id], R = rsv[id] || [];
    let st = String(b.狀態 || '可借');
    if (L) st = '借出中'; else if (st === '可借' && R.length) st = '已預約（待借出）';
    o.顯示狀態 = st;
    o.啟用 = truthy_(b.啟用);
    const mineL = L && String(L.memberId) === String(memberId);
    const mineR = R.find(x => String(x.memberId) === String(memberId));
    o.mine = !!(mineL || mineR);
    o.說明 = mineL ? '你正在使用這台車' : mineR ? '已分配給你：' + mineR.activity : (L ? '' : R.map(x => x.activity).join('、'));
    if (admin) o.使用者 = L ? L.name + '（借出中）' : R.map(x => x.name + '（' + x.activity + '）').join('、');
    return o;
  });
}

function availableBikes_(activityId, memberId) {
  const bikes = rows_('社車名單').filter(b => truthy_(b.啟用) && String(b.狀態 || '可借') === '可借');
  const occupied = {};
  rows_('社車預約').forEach(r => {
    if (String(r.activityId) === String(activityId) && ['已預約', '已借出'].includes(String(r.狀態)) &&
        String(r.memberId) !== String(memberId)) occupied[String(r.bikeId)] = true;
  });
  rows_('借車紀錄').forEach(l => { if (String(l.狀態) === '借出中') occupied[String(l.bikeId)] = true; });
  return bikes.filter(b => !occupied[String(b.bikeId)]).map(clean_);
}

// ================= 簽到／回饋 =================

// 簽到核心：寫紀錄＋自動更新騎行經驗／里程
function doCheckIn_(activityId, m, method) {
  const a = findActivity_(activityId);
  const dup = rows_('簽到紀錄').some(r => String(r.activityId) === String(activityId) && String(r.memberId) === String(m.memberId));
  if (dup) return { ok: true, already: true, message: '已經簽到過了' };
  appendObj_('簽到紀錄', {
    checkinId: id_('CHK'), activityId: activityId, memberId: m.memberId,
    姓名: m.姓名, 學號: m.學號, 簽到時間: new Date(), 方式: method
  });
  bumpExperience_(m, a);
  return { ok: true, message: m.姓名 + ' 簽到成功' };
}

// 沒經驗的人簽到後 → 有經驗；里程級距依活動距離往上升（不會往下降）
function bumpExperience_(m, a) {
  const d = Number(a.距離km) || 0;
  const di = d >= 50 ? 4 : d >= 20 ? 3 : d >= 3 ? 2 : 1;
  const ci = Math.max(0, EXP.indexOf(String(m.經驗里程 || '')));
  setRow_('社員名單', m._row, {
    經驗里程: EXP[Math.max(ci, di)], 騎行經驗: '有經驗',
    累計里程km: Math.round(((Number(m.累計里程km) || 0) + d) * 10) / 10, 最後更新: new Date()
  });
}

function checkIn(p) {
  return withLock_(() => {
    const m = findMemberById_(p.memberId);
    if (!m) throw new Error('找不到社員資料，請先建立或登入');
    if (!findReg_(p.activityId, m.memberId)) throw new Error('你還沒有報名這場活動，要先報名才能簽到');
    return doCheckIn_(p.activityId, m, '網站');
  });
}

function submitFeedback(p) {
  return withLock_(() => {
    const m = findMemberById_(p.memberId);
    if (!m) throw new Error('找不到社員資料');
    const checked = rows_('簽到紀錄').some(c => String(c.activityId) === String(p.activityId) && String(c.memberId) === String(m.memberId));
    if (!checked) throw new Error('有簽到的活動才能填回饋');
    const dup = rows_('行程反饋').some(r => String(r.activityId) === String(p.activityId) && String(r.memberId) === String(m.memberId));
    if (dup) throw new Error('這場活動你已經填過回饋了');
    appendObj_('行程反饋', {
      feedbackId: id_('FDB'), activityId: p.activityId, memberId: m.memberId, 姓名: m.姓名, 填寫時間: new Date(),
      難度評分: p.difficulty || '', 路線評分: p.route || '', 節奏: p.pace || '', 文字回饋: p.text || ''
    });
    return { ok: true, message: '謝謝你的回饋！' };
  });
}

// ================= 幹部登入（密碼 或 Gmail 驗證碼） =================

function requireAdmin_(auth) {
  const a = String(auth || '').trim();
  if (!a) throw new Error('請先登入幹部後台');
  if (a.indexOf('TOK_') === 0) {
    if (CacheService.getScriptCache().get('tok_' + a)) return;
    throw new Error('幹部登入已過期，請重新登入');
  }
  const real = String(getSetting_('adminPin') || '').trim();
  if (!real || a !== real) throw new Error('幹部密碼錯誤');
}

// 後台右上角顯示「誰在操作」
function cadreInfo_(memberId, email) {
  let m = memberId ? findMemberById_(memberId) : null;
  if (m && !truthy_(m.幹部)) m = null;
  if (!m && email) m = rows_('社員名單').find(r => truthy_(r.啟用) && normalize_(r.Email) === normalize_(email)) || null;
  return m ? { name: String(m.姓名), title: String(m.幹部職稱 || '') } : { name: '', title: '' };
}

function adminLogin(pin, memberId) {
  requireAdmin_(pin);
  return Object.assign({ ok: true, token: pin }, cadreInfo_(memberId, ''));
}

function isCadreEmail_(em) {
  const list = String(getSetting_('adminEmails') || '').split(',').map(normalize_).filter(Boolean);
  if (list.includes(em)) return true;
  return rows_('社員名單').some(r => truthy_(r.啟用) && truthy_(r.幹部) && normalize_(r.Email) === em);
}

function sendCadreCode(email) {
  const em = normalize_(email);
  if (!em || em.indexOf('@') < 0) throw new Error('請輸入 Email');
  if (!isCadreEmail_(em)) throw new Error('這個 Email 不在幹部名單內（請幹部到「系統設定」的 adminEmails 加入）');
  const cache = CacheService.getScriptCache();
  if (cache.get('sent_' + em)) throw new Error('驗證碼剛寄出，請 1 分鐘後再試');
  const code = String(100000 + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 900000));
  cache.put('code_' + em, code, 600);
  cache.put('sent_' + em, '1', 60);
  cache.remove('try_' + em);
  const club = getSetting_('clubName') || '成大單車社';
  MailApp.sendEmail({ to: em, subject: '【' + club + '】幹部登入驗證碼', body: '你的驗證碼是 ' + code + '（10 分鐘內有效）。\n如果不是你本人操作，請忽略這封信。' });
  return { ok: true, message: '驗證碼已寄到 ' + em };
}

function verifyCadreCode(email, code, memberId) {
  const em = normalize_(email), cache = CacheService.getScriptCache();
  const tries = Number(cache.get('try_' + em) || 0);
  if (tries >= 5) { cache.remove('code_' + em); throw new Error('錯誤次數太多，請重新寄送驗證碼'); }
  const real = cache.get('code_' + em);
  if (!real || String(code || '').trim() !== real) {
    cache.put('try_' + em, String(tries + 1), 600);
    throw new Error('驗證碼錯誤或已過期');
  }
  cache.remove('code_' + em); cache.remove('try_' + em);
  const token = 'TOK_' + Utilities.getUuid().replace(/-/g, '');
  cache.put('tok_' + token, em, 21600);
  if (memberId) {
    const m = findMemberById_(memberId);
    if (m) {
      const u = { 幹部: true, 是否社員: true, 最後更新: new Date() };
      if (!m.Email) u.Email = em;
      setRow_('社員名單', m._row, u);
    }
  }
  return Object.assign({ ok: true, token }, cadreInfo_(memberId, em));
}

// ================= 幹部後台 =================

function getAdminSummary(auth) {
  requireAdmin_(auth);
  return ser_({
    today: today_(),
    activities: listActivities_(null, true),
    loans: rows_('借車紀錄').filter(r => String(r.狀態) === '借出中').map(clean_),
    reports: rows_('車況回報').filter(r => String(r.處理狀態) === '待處理').map(clean_),
    members: rows_('社員名單').filter(r => truthy_(r.啟用)).map(clean_),
    bikes: listBikes_('', true)
  });
}

// 單一活動：所有報名／取消的社員、繳費、租借、出席
function getRoster(auth, activityId) {
  requireAdmin_(auth);
  const a = findActivity_(activityId);
  const f = r => String(r.activityId) === String(activityId);
  const mem = {}; rows_('社員名單').forEach(m => mem[String(m.memberId)] = m);
  const checked = {}; rows_('簽到紀錄').filter(f).forEach(c => checked[String(c.memberId)] = true);
  const rsv = {}; rows_('社車預約').filter(r => f(r) && String(r.狀態) !== '已取消').forEach(r => rsv[String(r.memberId)] = r);
  const all = rows_('活動報名').filter(f);
  const activeIds = {}; all.forEach(r => { if (String(r.狀態) !== '已取消') activeIds[String(r.memberId)] = true; });

  const regs = all.filter(r => String(r.狀態) !== '已取消' || !activeIds[String(r.memberId)]).map(r => {
    const id = String(r.memberId), x = rsv[id], mm = mem[id] || {};
    return {
      memberId: r.memberId, 姓名: r.姓名, 學號: String(r.學號), 電話: String(r.電話 || mm.電話 || ''),
      FB: mm.FB名稱 || '', 經驗: mm.經驗里程 || '', 身分: r.身分 || '',
      應繳金額: numOrBlank_(r.應繳金額), 已繳費: truthy_(r.已繳費),
      helmet: truthy_(r.借安全帽), light: truthy_(r.借車燈), bag: truthy_(r.借攜車袋),
      是否借車: truthy_(r.是否借車), 身高: String(r.身高 || ''),
      租借費用: numOrBlank_(r.租借費用), 租借費已繳: truthy_(r.租借費已繳),
      checked: !!checked[id], bike: x ? x.車名 : '', bikeStatus: x ? x.狀態 : '', bikeId: x ? x.bikeId : '',
      words: String(r.想說的話 || ''),
      cancelled: String(r.狀態) === '已取消', 取消原因: String(r.取消原因 || ''), 取消備註: String(r.取消備註 || ''), 取消時間: fmt_(r.取消時間)
    };
  });
  return ser_({
    activity: { name: a.活動名稱, date: dateStr_(a.日期) },
    regs, freeBikes: availableBikes_(activityId, '')
  });
}

// 單一活動的社車分配板：誰需要車、每台車在這場活動的狀態
function getBikeBoard(auth, activityId) {
  requireAdmin_(auth);
  const a = findActivity_(activityId);
  const f = r => String(r.activityId) === String(activityId);
  const checked = {}; rows_('簽到紀錄').filter(f).forEach(c => checked[String(c.memberId)] = true);
  const byBike = {}, byMem = {};
  rows_('社車預約').filter(r => f(r) && String(r.狀態) !== '已取消').forEach(r => { byBike[String(r.bikeId)] = r; byMem[String(r.memberId)] = r; });
  const loans = {}; rows_('借車紀錄').forEach(l => { if (String(l.狀態) === '借出中') loans[String(l.bikeId)] = l; });

  const people = rows_('活動報名').filter(r => f(r) && String(r.狀態) !== '已取消').map(r => {
    const id = String(r.memberId), x = byMem[id];
    return {
      memberId: r.memberId, 姓名: r.姓名, 學號: String(r.學號), 電話: String(r.電話 || ''), 身高: String(r.身高 || ''),
      needBike: truthy_(r.是否借車), checked: !!checked[id],
      bike: x ? x.車名 : '', bikeId: x ? x.bikeId : '', bikeStatus: x ? x.狀態 : ''
    };
  });
  const bikes = rows_('社車名單').filter(b => truthy_(b.啟用)).map(b => {
    const id = String(b.bikeId), R = byBike[id], L = loans[id];
    let state = 'free', who = '';
    if (R) { state = String(R.狀態) === '已借出' ? 'out' : 'assigned'; who = R.姓名; }
    else if (L) { state = 'loaned'; who = L.姓名; }
    else if (String(b.狀態 || '可借') !== '可借') { state = 'unavailable'; who = String(b.狀態); }
    return { bikeId: b.bikeId, 車名: b.車名, 尺寸: b.尺寸 || '', 類型: b.類型 || '', 顏色: b.顏色 || '', state, who };
  });
  return ser_({ activity: { name: a.活動名稱, date: dateStr_(a.日期) }, people, bikes });
}

function adminAssignBike(auth, activityId, memberId, bikeId) {
  requireAdmin_(auth);
  return withLock_(() => {
    const m = findMemberById_(memberId);
    if (!m) throw new Error('找不到社員');
    findActivity_(activityId);
    const reg = findReg_(activityId, memberId);
    if (!reg) throw new Error('這位社員沒有報名這場活動');
    const bike = availableBikes_(activityId, memberId).find(b => String(b.bikeId) === String(bikeId));
    if (!bike) throw new Error('這台車目前不能分配（已被分配、借出中或不可借）');
    assignBike_(activityId, m, bike, '幹部分配');
    setRow_('活動報名', reg._row, { 是否借車: true });
    return { ok: true, message: m.姓名 + ' → ' + bike.車名 };
  });
}

function adminUnassignBike(auth, activityId, memberId) {
  requireAdmin_(auth);
  return withLock_(() => {
    const rsv = findRsv_(activityId, memberId);
    if (!rsv) throw new Error('沒有分配紀錄');
    if (String(rsv.狀態) === '已借出') throw new Error('已經領車了，請先歸還');
    setRow_('社車預約', rsv._row, { 狀態: '已取消', 取消時間: new Date() });
    return { ok: true, message: '已取消分配' };
  });
}

// kind：'fee'＝活動費、'rent'＝租借費
function setPaid(auth, activityId, memberId, kind, paid) {
  requireAdmin_(auth);
  const reg = findReg_(activityId, memberId);
  if (!reg) throw new Error('找不到報名');
  setRow_('活動報名', reg._row, kind === 'rent' ? { 租借費已繳: !!paid } : { 已繳費: !!paid });
  return { ok: true };
}

// 幹部代為標記到場／取消到場
function adminSetAttendance(auth, activityId, memberId, present) {
  requireAdmin_(auth);
  return withLock_(() => {
    const m = findMemberById_(memberId);
    if (!m) throw new Error('找不到社員');
    if (present) return doCheckIn_(activityId, m, '幹部');
    const c = rows_('簽到紀錄').find(r => String(r.activityId) === String(activityId) && String(r.memberId) === String(memberId));
    if (c) sheet_('簽到紀錄').deleteRow(c._row);
    return { ok: true, message: '已取消簽到' };
  });
}

function saveActivity(auth, p) {
  requireAdmin_(auth);
  if (!p.name || !p.date) throw new Error('活動名稱與日期為必填');
  const dn = Math.round(Number(p.difficulty));
  const rec = {
    活動名稱: p.name, 類型: p.type || '例行活動', 日期: p.date, 集合時間: p.meetTime || '', 預計結束: p.endTime || '',
    報名截止: p.regDeadline || '', 最晚還車時間: p.returnTime || getSetting_('defaultReturnTime') || '23:59',
    集合地點: p.place || '', 路線連結: p.route || '', 距離km: p.distance || '', 難度: dn >= 1 && dn <= 5 ? dn : '',
    領騎: p.leader || '', 領騎電話: String(p.leaderPhone || ''), 押後: p.tail || '', 押後電話: String(p.tailPhone || ''),
    人數上限: p.capacity || '', 一般價: p.priceGeneral === '' ? '' : p.priceGeneral, 社員價: p.priceMember === '' ? '' : p.priceMember,
    幹部價: p.priceCadre === '' ? '' : p.priceCadre, 開放報名: !!p.openReg, 開放借車: !!p.openBike,
    活動說明: p.desc || '', 注意事項: p.notice || '', 備註: p.note || '', 活動照片URL: p.photo || ''
  };
  ['一般價', '社員價', '幹部價'].forEach(k => { if (rec[k] === undefined || rec[k] === null) rec[k] = ''; });
  return withLock_(() => {
    if (p.activityId) {
      const a = findActivity_(p.activityId);
      setRow_('活動', a._row, rec);
      return { ok: true, message: '活動已更新' };
    }
    rec.activityId = id_('ACT');
    rec.建立時間 = new Date();
    appendObj_('活動', rec);
    return { ok: true, message: '活動已建立' };
  });
}

function toggleActivityOpen(auth, activityId, open) {
  requireAdmin_(auth);
  const a = findActivity_(activityId);
  setRow_('活動', a._row, { 開放報名: !!open });
  return { ok: true, message: open ? '已開放報名' : '已關閉報名' };
}

function saveBike(auth, p) {
  requireAdmin_(auth);
  if (!p.name) throw new Error('請輸入車名');
  const rec = {
    車名: p.name, 類型: p.type || '', 尺寸: p.size || '', 顏色: p.color || '#64748b', 照片URL: p.photo || '',
    狀態: p.status || '可借', 啟用: !!p.active, 備註: p.note || '', 最後更新: new Date()
  };
  return withLock_(() => {
    if (p.bikeId) {
      const b = rows_('社車名單').find(x => String(x.bikeId) === String(p.bikeId));
      if (!b) throw new Error('找不到社車');
      setRow_('社車名單', b._row, rec);
      return { ok: true, message: '社車已更新' };
    }
    rec.bikeId = id_('BIKE');
    appendObj_('社車名單', rec);
    return { ok: true, message: '社車已新增' };
  });
}

function resolveReport(auth, reportId) {
  requireAdmin_(auth);
  return withLock_(() => {
    const r = rows_('車況回報').find(x => String(x.reportId) === String(reportId));
    if (!r) throw new Error('找不到回報');
    setRow_('車況回報', r._row, { 處理狀態: '已處理' });
    const b = rows_('社車名單').find(x => String(x.bikeId) === String(r.bikeId));
    if (b) setRow_('社車名單', b._row, { 狀態: '可借', 最後更新: new Date() });
    return { ok: true, message: '已標記處理完成，社車恢復可借' };
  });
}

function forceReturn(auth, loanId) {
  requireAdmin_(auth);
  return withLock_(() => {
    const l = rows_('借車紀錄').find(x => String(x.loanId) === String(loanId) && String(x.狀態) === '借出中');
    if (!l) throw new Error('找不到借出中的紀錄');
    setRow_('借車紀錄', l._row, { 歸還時間: new Date(), 狀態: '已歸還', 備註: '幹部代為歸還' });
    return { ok: true, message: '已代為歸還' };
  });
}

function setMemberFlags(auth, memberId, flags) {
  requireAdmin_(auth);
  const m = findMemberById_(memberId);
  if (!m) throw new Error('找不到社員');
  const u = { 最後更新: new Date() };
  if (flags.isMember !== undefined) u.是否社員 = !!flags.isMember;
  if (flags.cadre !== undefined) u.幹部 = !!flags.cadre;
  if (flags.title !== undefined) u.幹部職稱 = String(flags.title).trim();
  if (flags.feePaid !== undefined) {
    u.社費已繳 = !!flags.feePaid;
    if (flags.feePaid) u.社費年度 = String(new Date().getFullYear());
  }
  setRow_('社員名單', m._row, u);
  return { ok: true };
}

// ---- 給幹部在 Excel 看的「出席總表」：每位社員 × 每場活動 ----
function adminRebuildAttendance(auth) { requireAdmin_(auth); return { ok: true, message: rebuildAttendance() }; }

function rebuildAttendance() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('出席總表') || ss.insertSheet('出席總表');
  const acts = rows_('活動').sort((a, b) => dateStr_(a.日期).localeCompare(dateStr_(b.日期)));
  const members = rows_('社員名單').filter(m => truthy_(m.啟用));
  const cset = {}, rset = {};
  rows_('簽到紀錄').forEach(c => cset[c.memberId + '|' + c.activityId] = true);
  rows_('活動報名').filter(r => String(r.狀態) !== '已取消').forEach(r => rset[r.memberId + '|' + r.activityId] = true);

  const header = ['姓名', '學號', '系級', '身分', '出席次數'].concat(acts.map(a => dateStr_(a.日期).slice(5) + ' ' + a.活動名稱));
  const out = members.map(m => {
    let n = 0;
    const cells = acts.map(a => {
      const k = m.memberId + '|' + a.activityId;
      if (cset[k]) { n++; return '✓'; }
      return rset[k] ? '報名' : '';
    });
    return [m.姓名, String(m.學號), m.系級, tierOf_(m), n].concat(cells);
  }).sort((x, y) => y[4] - x[4]);

  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#ede9fe');
  if (out.length) sh.getRange(2, 1, out.length, header.length).setValues(out);
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  return '出席總表已更新（' + out.length + ' 位社員、' + acts.length + ' 場活動）';
}

// ================= 內部工具 =================

function listActivities_(member, includeAll) {
  const today = today_();
  const regs = rows_('活動報名').filter(r => String(r.狀態) !== '已取消');
  const checks = rows_('簽到紀錄');
  const regCount = {}, checkCount = {}, mine = {};
  const mid = member ? String(member.memberId) : '';
  regs.forEach(r => {
    const aid = String(r.activityId);
    regCount[aid] = (regCount[aid] || 0) + 1;
    if (mid && String(r.memberId) === mid) mine[aid] = true;
  });
  checks.forEach(r => {
    const aid = String(r.activityId);
    checkCount[aid] = (checkCount[aid] || 0) + 1;
  });
  return rows_('活動')
    .filter(a => includeAll || (truthy_(a.開放報名) && dateStr_(a.日期) >= today))
    .sort((a, b) => dateStr_(a.日期).localeCompare(dateStr_(b.日期)))
    .map(a => {
      const o = cleanActivity_(a, member), id = String(a.activityId);
      o.regCount = regCount[id] || 0;
      o.checkCount = checkCount[id] || 0;
      o.isToday = o.日期 === today;
      o.isPast = !!o.日期 && o.日期 < today;
      o.myRegistration = !!mine[id];
      return o;
    });
}

function tierOf_(m) { return truthy_(m.幹部) ? '幹部' : truthy_(m.是否社員) ? '社員' : '一般'; }

function priceFor_(a, m) {
  const order = { '幹部': ['幹部價', '社員價', '一般價'], '社員': ['社員價', '一般價'], '一般': ['一般價'] }[tierOf_(m)];
  for (let i = 0; i < order.length; i++) {
    const v = numOrBlank_(a[order[i]]);
    if (v !== '') return v;
  }
  return '';
}

function numOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

// 難度：統一轉成 1~5 的數字（舊資料「★★☆☆☆」也看得懂）
function diffNum_(v) {
  if (typeof v === 'number') return v >= 1 && v <= 5 ? Math.round(v) : '';
  const s = String(v || ''), st = (s.match(/★/g) || []).length;
  if (st) return Math.min(5, st);
  const n = parseInt(s, 10);
  return n >= 1 && n <= 5 ? n : '';
}

function findMemberById_(id) {
  const cid = normalize_(id);
  if (!cid) return null;
  return rows_('社員名單').find(r => truthy_(r.啟用) && normalize_(r.memberId) === cid) || null;
}
function findActivity_(id) {
  const a = rows_('活動').find(r => String(r.activityId) === String(id));
  if (!a) throw new Error('找不到活動');
  return a;
}
function findReg_(activityId, memberId) {
  return rows_('活動報名').find(r => String(r.activityId) === String(activityId) &&
    String(r.memberId) === String(memberId) && String(r.狀態) !== '已取消') || null;
}
function findRsv_(activityId, memberId) {
  return rows_('社車預約').find(r => String(r.activityId) === String(activityId) &&
    String(r.memberId) === String(memberId) && String(r.狀態) !== '已取消') || null;
}

function deadlinePassed_(a) {
  const d = dateStr_(a.報名截止);
  return !!d && today_() > d;
}
function computeDue_(a) {
  const d = dateStr_(a.日期);
  if (!d) return '';
  const t = timeStr_(a.最晚還車時間) || '23:59';
  const dp = d.split('-').map(Number), tp = t.split(':').map(Number);
  return new Date(dp[0], dp[1] - 1, dp[2], tp[0], tp[1]);
}
function settingsMap_() {
  const c = CacheService.getScriptCache(), ck = 'settings_map_v5speed';
  const hit = c.get(ck);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) {}
  }
  const out = {};
  rows_('系統設定').forEach(r => { out[String(r.key)] = r.value; });
  try { c.put(ck, JSON.stringify(out), 120); } catch (e) {}
  return out;
}
function getSetting_(key) {
  const m = settingsMap_();
  return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : '';
}
function settingNum_(key, def) {
  const v = getSetting_(key);
  return v === '' || isNaN(Number(v)) ? def : Number(v);
}

// ---- 試算表讀寫（全部用欄位名稱對應，欄位順序改了也不會壞） ----

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('找不到工作表「' + name + '」，請先在 Apps Script 執行 setup');
  return sh;
}

let READ_CACHE_ = null;
function withReadCache_(fn) {
  const prev = READ_CACHE_;
  READ_CACHE_ = {};
  try { return fn(); }
  finally { READ_CACHE_ = prev; }
}
function rows_(name) {
  if (READ_CACHE_ && Object.prototype.hasOwnProperty.call(READ_CACHE_, name)) return READ_CACHE_[name];
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) {
    if (READ_CACHE_) READ_CACHE_[name] = [];
    return [];
  }
  const v = sh.getDataRange().getValues();
  const h = v[0].map(String);
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (!v[i].some(x => x !== '')) continue;
    const o = { _row: i + 1 };
    h.forEach((k, j) => { if (k) o[k] = v[i][j]; });
    out.push(o);
  }
  if (READ_CACHE_) READ_CACHE_[name] = out;
  return out;
}

// 寫入紀錄時，自動帶上「活動日期、活動名稱」，Excel 就不必靠 ID 認活動
function appendObj_(name, obj) {
  if (obj.activityId && obj.活動名稱 === undefined) {
    const a = rows_('活動').find(r => String(r.activityId) === String(obj.activityId));
    if (a) { obj.活動名稱 = a.活動名稱; obj.活動日期 = dateStr_(a.日期); }
  }
  const sh = sheet_(name);
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = h.map(k => obj[k] === undefined ? '' : obj[k]);
  sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setValues([row]);
  if (READ_CACHE_) delete READ_CACHE_[name];
}

function setRow_(name, rowNo, updates) {
  const sh = sheet_(name);
  const lastCol = sh.getLastColumn();
  const h = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const rg = sh.getRange(rowNo, 1, 1, lastCol);
  const row = rg.getValues()[0];
  let changed = false;
  Object.keys(updates).forEach(k => {
    const c = h.indexOf(k);
    if (c >= 0) { row[c] = updates[k]; changed = true; }
  });
  if (changed) rg.setValues([row]);
  if (READ_CACHE_) delete READ_CACHE_[name];
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---- 資料格式（google.script.run 不能回傳 Date，所以一律轉字串） ----

function fmt_(v) {
  if (!(v instanceof Date)) return v;
  if (v.getFullYear() < 1950) return Utilities.formatDate(v, TZ, 'HH:mm');
  const s = Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  return s.endsWith(' 00:00') ? s.slice(0, 10) : s;
}
function clean_(o) {
  const out = {};
  Object.keys(o).forEach(k => { if (k !== '_row') out[k] = fmt_(o[k]); });
  return out;
}
function cleanActivity_(a, m) {
  const o = clean_(a);
  o.日期 = dateStr_(a.日期);
  o.報名截止 = dateStr_(a.報名截止);
  ['集合時間', '預計結束', '最晚還車時間'].forEach(k => o[k] = timeStr_(a[k]));
  o.開放報名 = truthy_(a.開放報名);
  o.開放借車 = truthy_(a.開放借車);
  o.類型 = a.類型 || '例行活動';
  o.難度 = diffNum_(a.難度);
  ['領騎電話', '押後電話', '領騎', '押後', '路線連結', '活動說明', '注意事項', '備註'].forEach(k => o[k] = String(a[k] === undefined ? '' : a[k]));
  ['一般價', '社員價', '幹部價'].forEach(k => o[k] = numOrBlank_(a[k]));
  o.活動照片URL = a.活動照片URL || '';
  o.我的身分 = m ? tierOf_(m) : '';
  o.我的價格 = m ? priceFor_(a, m) : '';
  return o;
}
function ser_(x) { return JSON.parse(JSON.stringify(x)); }

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = String(v || '').match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function timeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function id_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function normalize_(v) { return String(v === undefined || v === null ? '' : v).trim().toLowerCase(); }
function truthy_(v) {
  if (v === true) return true;
  return ['true', '1', 'yes', 'y', '是', '已繳', '啟用'].includes(String(v || '').trim().toLowerCase());
}
