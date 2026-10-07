const S = {boot:null, member:null, dash:null, pin:'', adminData:null, editId:'', editBikeId:'', actPhoto:'', bikePhoto:'', rental:null, who:null};
const LS = 'nckuCyclingMemberId';
const EXP = ['無經驗','1-3km','3-20km','20-50km','50km以上'];
const DEFAULT_NOTICE = '1. 請攜帶安全帽、零錢、開水。\n2. 有需要借用社上物品者，記得在報名時勾選，以免發生多搶一的情況。\n3. 社車數量有限，先報先得，借完為止！\n4. 此活動無保險，有需求者請自行投保。\n5. 出發前記得先吃點東西。\n6. 請加入 Line 群組來聯繫我們。';
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const tj = v => v === true || String(v).toLowerCase() === 'true';
const chk = id => !!($(id) && $(id).checked);
const starStr = n => n ? '<span class="stars">' + '★'.repeat(n) + '☆'.repeat(5-n) + '</span>' : '—';
const safeUrl = u => /^https?:\/\//i.test(String(u||'').trim()) ? String(u).trim() : '';

function lsGet(){ try{ return localStorage.getItem(LS)||''; }catch(e){ return ''; } }
function lsSet(v){ try{ if(v) localStorage.setItem(LS,v); else localStorage.removeItem(LS); }catch(e){} }
async function call(fn, ...args){
  const api = String((window.APP_CONFIG && window.APP_CONFIG.API_URL) || '').trim();
  if(!api || api.includes('YOUR-WORKER')){
    throw new Error('尚未設定 API_URL，請先修改 config.js');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try{
    const res = await fetch(api, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fn, args}),
      signal:controller.signal,
      cache:'no-store'
    });
    const data = await res.json().catch(() => null);
    if(!res.ok) throw new Error((data && data.error) || ('API 錯誤 HTTP '+res.status));
    if(!data || data.ok !== true) throw new Error((data && data.error) || 'API 回傳格式錯誤');
    return data.result;
  }catch(e){
    if(e && e.name === 'AbortError') throw new Error('伺服器回應逾時，請稍後再試');
    throw e;
  }finally{
    clearTimeout(timer);
  }
}
let toastTimer;
function toast(msg, bad){
  const t = $('toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', 3600);
}
function showModal(html){
  $('overlay').innerHTML = '<div class="card sheet">' + html + '<button class="btn ghost" onclick="closeModal()">關閉</button></div>';
  $('overlay').classList.remove('hide');
}
function closeModal(){ $('overlay').classList.add('hide'); $('overlay').innerHTML = ''; }
function goPage(p){
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === p));
  window.scrollTo(0,0);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => goPage(b.dataset.page));
function needMember(){
  if(!S.member){ toast('請先建立或登入社員資料', true); goPage('member'); return false; }
  return true;
}

// ---------- 圖片：Drive 照片由後端讀取後回傳（社員不需要 Drive 權限） ----------
function driveId(u){
  u = String(u||'').trim();
  if(!/drive\.google\.com|googleusercontent\.com/.test(u)) return '';
  const m = u.match(/\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/);
  return m ? m[1] : '';
}
const imgCache = {};
const imgPending = {};
let imgBatchTimer = 0;
function imgTag(u, cls){
  u = String(u||'').trim(); if(!u) return '';
  const fid = driveId(u);
  return fid ? `<img class="${cls}" loading="lazy" data-fid="${esc(fid)}" alt="">`
             : `<img class="${cls}" loading="lazy" alt="" src="${esc(u)}" onerror="this.style.display='none'">`;
}
function hydrateImgs(){
  document.querySelectorAll('img[data-fid]:not([data-done])').forEach(img => {
    img.dataset.done = '1';
    const id = img.dataset.fid;
    if(imgCache[id] !== undefined){ if(imgCache[id]) img.src = imgCache[id]; else img.style.display='none'; return; }
    (imgPending[id] = imgPending[id] || []).push(img);
  });
  if(Object.keys(imgPending).length && !imgBatchTimer) imgBatchTimer = setTimeout(flushImgBatch, 35);
}
async function flushImgBatch(){
  imgBatchTimer = 0;
  const ids = Object.keys(imgPending).slice(0, 30);
  if(!ids.length) return;
  const wait = {};
  ids.forEach(id => { wait[id] = imgPending[id] || []; delete imgPending[id]; });
  try{
    const map = await call('getImages', ids);
    ids.forEach(id => {
      const d = (map && map[id]) || '';
      imgCache[id] = d;
      wait[id].forEach(img => { if(d) img.src = d; else img.style.display = 'none'; });
    });
  }catch(e){
    ids.forEach(id => wait[id].forEach(img => img.style.display = 'none'));
  }
  if(Object.keys(imgPending).length && !imgBatchTimer) imgBatchTimer = setTimeout(flushImgBatch, 35);
}
new MutationObserver(hydrateImgs).observe(document.body, {childList:true, subtree:true});

// ---------- 載入 ----------
async function init(){
  try{
    const d = await call('getAppData', lsGet());
    S.boot = d.boot;
    S.member = S.boot.member;
    S.dash = d.dash || null;
    if(S.member) lsSet(S.member.memberId);
    $('clubName').textContent = S.boot.clubName;
    renderAll();
    hydrateImgs();
  }catch(e){
    $('profileSummary').innerHTML = '<b class="bad">資料載入失敗</b><div class="muted">'+esc(e.message)+'</div><button class="btn sec" onclick="init()">重試</button>';
  }
}
async function loadDash(){
  if(!S.member) return;
  try{ S.dash = await call('getMyDashboard', S.member.memberId); }catch(e){}
}
function renderAll(){ renderHome(); renderActivities(); renderBikes(); renderDash(); renderMember(); }

// ---------- 活動卡片 ----------
function priceHtml(a){
  const arr = [['一般',a.一般價],['社員',a.社員價],['幹部',a.幹部價]].filter(x => x[1] !== '' && x[1] != null);
  if(!arr.length) return '';
  let h = '<div class="meta">費用：' + arr.map(x => x[0] + ' $' + x[1]).join('｜') + '</div>';
  if(a.我的價格 !== '' && a.我的價格 != null) h += '<div class="meta ok"><b>你的價格（' + esc(a.我的身分) + '）：$' + a.我的價格 + '</b></div>';
  return h;
}
function contact(label, name, phone){
  if(!name && !phone) return '';
  return `<span>${label} ${esc(name)}${phone?' <a href="tel:'+esc(phone)+'">'+esc(phone)+'</a>':''}</span> `;
}
function actCard(a){
  return `<div class="item">
    ${imgTag(a.活動照片URL,'banner')}
    <div class="between"><b>${esc(a.活動名稱)}</b><span>${a.類型==='大型活動'?'<span class="pill big2">大型活動</span>':''}${a.isToday?'<span class="pill warn">今天</span>':''}${a.myRegistration?'<span class="pill ok">已報名</span>':''}</span></div>
    <div class="meta">${esc(a.日期)} ${esc(a.集合時間)}｜${esc(a.集合地點)}</div>
    <div class="meta">${esc(a.距離km)} km｜難度 ${starStr(a.難度)}｜報名 ${a.regCount}${a.人數上限?' / '+esc(a.人數上限):''} 人</div>
    ${priceHtml(a)}
    <button class="btn sec" onclick="openActivity('${esc(a.activityId)}')">查看 / 報名</button>
  </div>`;
}

// ---------- 首頁 ----------
function renderHome(){
  const m = S.member, acts = (S.boot && S.boot.activities) || [];
  if(m){
    const tag = tj(m.幹部) ? '<span class="pill ok">'+esc(m.幹部職稱||'幹部')+'</span>' : tj(m.是否社員) ? '<span class="pill ok">社員</span>' : '<span class="pill">尚未登記為社員</span>';
    $('profileSummary').innerHTML = `<div class="big">${esc(m.姓名)}</div>
      <div class="meta">${esc(m.系級)}　${tag}${tj(m.社費已繳)?'<span class="pill ok">社費已繳</span>':''}</div>
      <button class="btn ghost small" onclick="logout()">不是我？切換帳號</button>`;
  }else{
    $('profileSummary').innerHTML = '<div class="big">第一次使用 👋</div><div class="muted">請先建立社員資料（只要填一次），或用學號登入。</div><button class="btn" onclick="goPage(\'member\')">建立 / 登入</button>';
  }
  $('homeActs').innerHTML = acts.length ? acts.map(actCard).join('') : '<div class="muted">目前沒有開放中的活動</div>';
  renderCheckin();
}
function renderCheckin(){
  const acts = ((S.boot && S.boot.activities) || []).filter(a => a.myRegistration);
  if(!S.member){ $('checkinBox').innerHTML = '<div class="muted">登入後才能簽到</div>'; return; }
  if(!acts.length){ $('checkinBox').innerHTML = '<div class="muted">你目前沒有已報名的活動，要先報名才能簽到喔！</div>'; return; }
  const def = (acts.find(a => a.isToday) || acts[0]).activityId;
  $('checkinBox').innerHTML = `<div class="muted">簽到成功後，如果你有分配到社車，會直接跳出領車畫面。</div>
    <select id="ciAct" style="margin-top:8px">${acts.map(a => `<option value="${esc(a.activityId)}" ${a.activityId===def?'selected':''}>${esc(a.日期)}　${esc(a.活動名稱)}</option>`).join('')}</select>
    <button class="btn" onclick="doCheckin(this)">確認簽到</button>`;
}
async function doCheckin(btn){
  if(!needMember()) return;
  const id = $('ciAct').value;
  btn.disabled = true;
  try{
    const r = await call('checkIn', {activityId:id, memberId:S.member.memberId});
    toast(r.message);
    await init();
    const rsv = ((S.dash && S.dash.reservations) || []).find(x => String(x.activityId) === String(id));
    if(rsv) showPickup(rsv);
    else{
      const h = ((S.dash && S.dash.history) || []).find(x => String(x.activityId) === String(id));
      if(h && h.needBike && !h.bike) showModal('<h2>✓ 簽到成功</h2><p>你有申請社車，但幹部還沒有分配車輛，請現場找幹部。</p>');
    }
  }catch(e){ toast(e.message, true); }
  btn.disabled = false;
}
function showPickup(r){
  showModal(`<h2>🚲 請領車</h2><div class="meta">${esc(r.活動名稱)}</div>
    <div class="item">${imgTag(r.照片URL,'bikeimg')}<b>${esc(r.車名)}</b><div class="meta">${esc(r.尺寸||'')}</div></div>
    <button class="btn" onclick="doBorrow('${esc(r.activityId)}',this,true)">確認領車</button>`);
}

// ---------- 活動 ----------
function renderActivities(){
  const acts = (S.boot && S.boot.activities) || [];
  $('actList').innerHTML = acts.length ? acts.map(actCard).join('') : '<div class="muted">目前沒有開放中的活動</div>';
}

// 租借：社車／安全帽／車燈／攜車袋
function rentParts(f, o){
  if(!f || f.tier !== '一般') return [];
  const p = [];
  if(o.bike) p.push(['社車（含安全帽、車燈）', f.bike]);
  else if(o.helmet || o.light) p.push([o.helmet && o.light ? '安全帽＋車燈' : (o.helmet ? '安全帽' : '車燈'), f.gear]);
  if(o.bag) p.push(['攜車袋', f.bag]);
  return p;
}
function rentUpd(){
  const bike = chk('rBike');
  ['rHelmet','rLight'].forEach(i => { $(i).disabled = bike; if(bike) $(i).checked = true; }); // 社車已含安全帽、車燈
  const o = {bike, helmet:chk('rHelmet'), light:chk('rLight'), bag:chk('rBag')};
  const parts = rentParts(S.rental, o), total = parts.reduce((t, x) => t + x[1], 0);
  let msg = '';
  if(S.rental.tier !== '一般') msg = Object.values(o).some(Boolean) ? '<span class="ok">繳費社員／幹部：免費</span>' : '';
  else if(parts.length) msg = parts.map(x => x[0] + ' $' + x[1]).join(' ＋ ') + ' ＝ <b>$' + total + '</b>（到場繳給幹部）';
  $('rFee').innerHTML = msg ? '預估租借費：' + msg : '';
  $('rHeightWrap').classList.toggle('hide', !bike);
}
let closeTimer;
function successClose(msg){
  $('overlay').innerHTML = '<div class="card sheet"><div class="ok" style="font-size:16px;font-weight:800;text-align:center;padding:14px 0 4px">✓ ' + esc(msg) + '</div><div class="muted" style="text-align:center;padding-bottom:6px">視窗即將自動關閉…</div></div>';
  $('overlay').classList.remove('hide');
  clearTimeout(closeTimer); closeTimer = setTimeout(closeModal, 1500);
}
function rentalBox(d, reg){
  const r = reg || {}, f = d.rental;
  const tip = f.tier === '一般'
    ? `你目前是非繳費社員：社車＋安全帽＋車燈 $${f.bike}；單借安全帽＋車燈 $${f.gear}；攜車袋 $${f.bag}`
    : '繳費社員／幹部借用免費';
  return `<h3>租借（社車／裝備）</h3><div class="meta">${esc(tip)}</div>
    <div class="meta">需提早 20 分鐘到社辦領取。</div>
    <label class="chk"><input type="checkbox" id="rBike" ${tj(r.是否借車)?'checked':''} onchange="rentUpd()"> 社車（含安全帽、車燈）</label>
    <label class="chk"><input type="checkbox" id="rHelmet" ${tj(r.借安全帽)?'checked':''} onchange="rentUpd()"> 安全帽</label>
    <label class="chk"><input type="checkbox" id="rLight" ${tj(r.借車燈)?'checked':''} onchange="rentUpd()"> 車燈</label>
    <label class="chk"><input type="checkbox" id="rBag" ${tj(r.借攜車袋)?'checked':''} onchange="rentUpd()"> 攜車袋</label>
    <div id="rHeightWrap"><label>身高 cm（借社車必填）</label><input id="rHeight" inputmode="numeric" value="${esc(r.身高||'')}"></div>
    <div class="meta" id="rFee"></div>`;
}

async function openActivity(id){
  if(!needMember()) return;
  try{
    const d = await call('getActivityDetail', id, S.member.memberId);
    const a = d.activity, ID = esc(id), reg = d.registration, rsv = d.reservation;
    S.rental = d.rental;
    const past = a.日期 && a.日期 < S.boot.today;
    const route = safeUrl(a.路線連結);
    let h = `${imgTag(a.活動照片URL,'banner')}<h2>${esc(a.活動名稱)}</h2>
      <div class="meta">${esc(a.類型)}｜${esc(a.日期)} ${esc(a.集合時間)}${a.預計結束?' ～ '+esc(a.預計結束):''}｜${esc(a.集合地點)}</div>
      <div class="meta">${esc(a.距離km)} km｜難度 ${starStr(a.難度)}｜最晚還車 ${esc(a.最晚還車時間)}</div>
      ${(a.領騎||a.領騎電話||a.押後||a.押後電話)?'<div class="meta">'+contact('領騎',a.領騎,a.領騎電話)+contact('押後',a.押後,a.押後電話)+'</div>':''}
      ${route?'<div class="meta">路線圖：<a href="'+esc(route)+'" target="_blank" rel="noopener">開啟路線</a></div>':''}
      ${a.報名截止?'<div class="meta">報名截止：'+esc(a.報名截止)+'</div>':''}
      ${priceHtml(a)}
      ${a.活動說明?'<h3>活動介紹</h3><div class="pre">'+esc(a.活動說明)+'</div>':''}
      ${a.注意事項?'<h3>注意事項</h3><div class="pre">'+esc(a.注意事項)+'</div>':''}
      ${a.備註?'<div class="pre muted">'+esc(a.備註)+'</div>':''}`;

    if(!reg){
      if(a.開放借車) h += rentalBox(d, null);
      const zh = safeUrl(d.rules.zh), en = safeUrl(d.rules.en);
      h += `<h3>團騎公約 *</h3>
        <div class="meta">如果這是你第一次參加我們的活動，請先閱讀團騎公約：
        ${zh?'<a href="'+esc(zh)+'" target="_blank" rel="noopener">中文版</a>':''} ${en?'｜ <a href="'+esc(en)+'" target="_blank" rel="noopener">English version</a>':''}</div>
        <label class="chk"><input type="checkbox" id="rRules" ${d.memberRead?'checked':''}> 我已閱讀團騎公約 I have read it.</label>
        <label>想說的話（選填）</label><input id="rWords">
        <div class="notice">⚠ 報名後如果不能來，請務必回來「取消報名」並填寫原因，把名額與社車留給別人。</div>
        <button class="btn" onclick="doRegister('${ID}')">報名</button>`;
    }else{
      h += '<div class="ok"><b>✓ 你已報名</b></div>';
      if(Number(reg.應繳金額) > 0) h += `<div class="meta">活動費 $${esc(reg.應繳金額)}（${esc(reg.身分)}價）｜${tj(reg.已繳費)?'<span class="ok">幹部已確認收費</span>':'<span class="warn">尚未繳費</span>'}</div>`;
      if(Number(reg.租借費用) > 0) h += `<div class="meta">租借費 $${esc(reg.租借費用)}｜${tj(reg.租借費已繳)?'<span class="ok">幹部已確認收費</span>':'<span class="warn">尚未繳費</span>'}</div>`;
      if(a.開放借車){
        if(!past){
          h += rentalBox(d, reg) + `<button class="btn sec" onclick="doUpdateRental('${ID}')">修改租借</button>`;
        }
        if(rsv){
          h += `<h3>分配的社車</h3><div class="item mine">${imgTag(rsv.照片URL,'bikeimg')}<b>已分配：${esc(rsv.車名)}</b><div class="meta">${esc(rsv.尺寸||'')}｜${esc(rsv.狀態)}</div></div>`;
        }
        if(d.selfReserve){
          if(!rsv || rsv.狀態 === '已預約'){
            h += `<select id="mBike"><option value="">請選擇可用社車</option>${d.availableBikes.map(b => `<option value="${esc(b.bikeId)}">${esc(b.車名)}｜${esc(b.尺寸)}</option>`).join('')}</select>
              <label>原因 / 優先序（選填）</label><input id="mPri" placeholder="例如：沒有自己的車">
              <button class="btn" onclick="doReserve('${ID}')">${rsv?'更換社車':'確認預約'}</button>`;
          }
        }else if(!rsv && tj(reg.是否借車)){
          h += `<div class="item"><b>已申請社車</b><div class="meta">等待幹部分配，分配後會顯示在這裡，活動當天簽到後就能領車。</div></div>`;
        }
      }
      h += `<div class="notice">⚠ 如果不能來，請務必取消報名（需填原因）。</div>
        <button class="btn danger" onclick="askCancel('${ID}')">取消報名</button>`;
    }
    showModal(h);
    if($('rFee')) rentUpd();
  }catch(e){ toast(e.message, true); }
}
async function doRegister(id){
  const rules = chk('rRules') ? '已閱讀' : '';
  if(!rules) return toast('請選擇是否已閱讀團騎公約', true);
  try{
    const r = await call('registerActivity', {activityId:id, memberId:S.member.memberId,
      needBike:chk('rBike'), helmet:chk('rHelmet'), light:chk('rLight'), bag:chk('rBag'),
      height:$('rHeight') ? $('rHeight').value : '', rules, words:$('rWords').value});
    successClose(r.message); init();
  }catch(e){ toast(e.message, true); }
}
async function doUpdateRental(id){
  try{
    const r = await call('updateRental', {activityId:id, memberId:S.member.memberId,
      bike:chk('rBike'), helmet:chk('rHelmet'), light:chk('rLight'), bag:chk('rBag'), height:$('rHeight').value});
    successClose(r.message); init();
  }catch(e){ toast(e.message, true); }
}
async function doReserve(id){
  const bike = $('mBike').value;
  if(!bike) return toast('請先選擇社車', true);
  try{
    const r = await call('reserveBike', {activityId:id, memberId:S.member.memberId, bikeId:bike, priority:$('mPri').value});
    toast(r.message); init(); openActivity(id);
  }catch(e){ toast(e.message, true); }
}
function askCancel(id){
  showModal(`<h2>取消報名</h2>
    <div class="notice">不能來請一定要取消，名額與社車才能讓給其他人。社車分配也會一起取消。</div>
    <label>取消原因 *</label>
    <select id="cxR"><option value="">請選擇</option><option>臨時有事</option><option>身體不適／生病</option><option>天氣不佳</option><option>時間衝突</option><option>其他</option></select>
    <label>補充說明（選「其他」必填）</label><textarea id="cxN"></textarea>
    <button class="btn danger" onclick="doCancel('${esc(id)}')">確認取消報名</button>`);
}
async function doCancel(id){
  const reason = $('cxR').value, note = $('cxN').value;
  if(!reason) return toast('請選擇取消原因', true);
  try{ const r = await call('cancelRegistration', id, S.member.memberId, reason, note); toast(r.message); closeModal(); init(); }
  catch(e){ toast(e.message, true); }
}

// ---------- 回饋 ----------
function renderFeedback(){
  const box = $('fbBox');
  if(!S.member){ box.innerHTML = '<div class="muted">登入後才能填回饋</div>'; return; }
  const list = ((S.dash && S.dash.history) || []).filter(x => x.checkedIn && !x.feedbackDone);
  if(!list.length){ box.innerHTML = '<div class="muted">有簽到、且還沒填過回饋的活動會出現在這裡</div>'; return; }
  const opts = '<option value="">請選擇</option>' + [1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('');
  box.innerHTML = `<label>活動</label><select id="fbAct">${list.map(x => `<option value="${esc(x.activityId)}">${esc(x.date)}　${esc(x.name)}</option>`).join('')}</select>
    <div class="row"><div><label>難度（1 輕鬆～5 很硬）</label><select id="fbDiff">${opts}</select></div>
    <div><label>路線喜歡程度</label><select id="fbRoute">${opts}</select></div></div>
    <label>節奏</label><select id="fbPace"><option>剛好</option><option>偏慢</option><option>偏快</option></select>
    <label>想說的話（選填）</label><textarea id="fbText"></textarea>
    <button class="btn" onclick="doFeedback(this)">送出回饋</button>`;
}
async function doFeedback(btn){
  btn.disabled = true;
  try{
    const r = await call('submitFeedback', {activityId:$('fbAct').value, memberId:S.member.memberId,
      difficulty:$('fbDiff').value, route:$('fbRoute').value, pace:$('fbPace').value, text:$('fbText').value});
    toast(r.message); init();
  }catch(e){ toast(e.message, true); btn.disabled = false; }
}

// ---------- 社車 ----------
function statusPill(s){
  const cls = s === '可借' ? 'ok' : (s.indexOf('預約') >= 0 ? 'warn' : (s === '借出中' ? 'bad' : ''));
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}
function renderBikes(){
  const arr = (S.boot && S.boot.bikes) || [];
  $('bikeList').innerHTML = arr.length ? arr.map(b => `<div class="item ${b.mine?'mine':''}">
    <div class="between"><div><span class="dot" style="background:${esc(b.顏色||'#64748b')}"></span><b>${esc(b.車名)}</b>${b.mine?' <span class="pill big2">我的</span>':''}</div>${statusPill(b.顯示狀態)}</div>
    <div class="meta">${esc(b.類型)}｜${esc(b.尺寸)}${b.說明?'｜'+esc(b.說明):''}</div>
    ${imgTag(b.照片URL,'bikeimg')}
  </div>`).join('') : '<div class="muted">尚未建立社車資料</div>';
}
function renderDash(){
  const d = S.dash;
  if(!S.member){
    $('myRes').innerHTML = $('myLoans').innerHTML = '<div class="muted">登入後才看得到</div>';
  }else{
    const res = (d && d.reservations) || [];
    $('myRes').innerHTML = res.length ? res.map(r => `<div class="item mine">${imgTag(r.照片URL,'bikeimg')}<b>${esc(r.車名)}</b>
      <div class="meta">${esc(r.活動名稱)}</div>
      ${r.checkedIn
        ? `<button class="btn" onclick="doBorrow('${esc(r.activityId)}',this,false)">領車</button>`
        : '<div class="meta warn">到首頁完成活動簽到後，就能領車</div>'}</div>`).join('') : '<div class="muted">目前沒有分配給你的社車</div>';

    const loans = (d && d.loans) || [];
    $('myLoans').innerHTML = loans.length ? loans.map(l => `<div class="item mine">${imgTag(l.照片URL,'bikeimg')}<b>${esc(l.車名)}</b>
      <div class="meta">借出：${esc(l.借出時間)}｜應還：${esc(l.應還時間)}</div>
      <select id="cond_${esc(l.loanId)}" style="margin-top:8px"><option>正常</option><option>爆胎</option><option>異音</option><option>需維修</option><option>煞車問題</option><option>變速問題</option><option>其他</option></select>
      <input id="note_${esc(l.loanId)}" placeholder="車況補充（選填）" style="margin-top:8px">
      <button class="btn" onclick="doReturn('${esc(l.loanId)}',this)">歸還社車</button></div>`).join('') : '<div class="muted">目前沒有借出的社車</div>';
  }
  renderFeedback();
}
async function doBorrow(activityId, btn, fromModal){
  btn.disabled = true;
  try{
    const r = await call('borrowReservedBike', {activityId, memberId:S.member.memberId});
    toast(r.message); if(fromModal) closeModal(); await init(); goPage('bikes');
  }catch(e){ toast(e.message, true); btn.disabled = false; }
}
async function doReturn(loanId, btn){
  btn.disabled = true;
  try{
    const r = await call('returnBike', {memberId:S.member.memberId, loanId, condition:$('cond_'+loanId).value, note:$('note_'+loanId).value});
    toast(r.message); init();
  }catch(e){ toast(e.message, true); btn.disabled = false; }
}

// ---------- 社員空間 ----------
function profileIncomplete(m){ return !m.經驗里程 || !m.性別 || !m.FB名稱 || !m.電話 || !m.系級; }
function profileForm(m){
  m = m || {};
  const sel = (id, list, cur, ph) => `<select id="${id}"><option value="">${ph}</option>${list.map(x => `<option ${x===cur?'selected':''}>${esc(x)}</option>`).join('')}</select>`;
  return `<label>姓名 Name *</label><input id="pName" value="${esc(m.姓名)}">
    <label>FB 名稱 FB name *</label><input id="pFb" value="${esc(m.FB名稱)}">
    <label>性別 Gender *</label>${sel('pGender',['男','女','不透露'],m.性別,'請選擇')}
    <label>學號 Student ID *</label><input id="pSid" value="${esc(m.學號)}" ${m.學號?'readonly':''}>
    <label>系級 Department（例：統計110）*</label><input id="pDept" value="${esc(m.系級)}">
    <label>電話 Phone *</label><input id="pPhone" inputmode="tel" value="${esc(m.電話)}">
    <label>Email（幹部登入用，一般社員可不填）</label><input id="pEmail" value="${esc(m.Email)}">
    <label>騎行經驗 *（你曾在校園附近騎過的最長距離）</label>${sel('pExp',EXP,m.經驗里程,'請選擇')}
    <div class="muted">參加活動簽到後，系統會依活動里程自動更新你的騎行經驗。</div>
    <button class="btn" onclick="saveProfile(this)">儲存</button>`;
}
function renderMember(){
  const m = S.member, box = $('memberBox');
  if(m){
    const st = (S.dash && S.dash.stats) || {attended:0, registered:0};
    const bad = profileIncomplete(m);
    box.innerHTML = `${bad?'<div class="notice">⚠ 你的資料還不完整（需補 FB 名稱、性別、系級、電話、騎行經驗），補齊後才能報名。</div>':''}
      <div class="stats"><div class="stat" style="cursor:pointer" onclick="showHist('att')"><b>${st.attended}</b>參加過（已簽到）<div class="muted">點開看細項 ›</div></div><div class="stat" style="cursor:pointer" onclick="showHist('reg')"><b>${st.registered}</b>目前報名中的活動<div class="muted">點開看細項 ›</div></div></div>
      <div class="item"><div><b>姓名：</b>${esc(m.姓名)}</div><div><b>FB：</b>${esc(m.FB名稱)}</div><div><b>性別：</b>${esc(m.性別)}</div>
      <div><b>學號：</b>${esc(m.學號)}</div><div><b>系級：</b>${esc(m.系級)}</div><div><b>電話：</b>${esc(m.電話)}</div>
      <div><b>Email：</b>${esc(m.Email)}</div>
      <div><b>騎行經驗：</b>${esc(m.經驗里程||'未填')}（${esc(m.騎行經驗||'—')}）｜累計里程 ${esc(m.累計里程km||0)} km</div>
      <div><b>身分：</b>${tj(m.幹部)?esc(m.幹部職稱||'幹部'):tj(m.是否社員)?'社員':'一般'}</div></div>
      <button class="btn sec" onclick="document.getElementById('editWrap').classList.toggle('hide')">修改資料</button>
      <div id="editWrap" class="${bad?'':'hide'}">${profileForm(m)}</div>
      <button class="btn ghost" onclick="logout()">切換帳號 / 登出</button>`;
    $('historyCard').classList.remove('hide');
    const hist = (S.dash && S.dash.history) || [];
    $('historyBox').innerHTML = hist.length ? hist.map(h => `<div class="item">
      <div class="between"><b>${esc(h.name)}</b>${h.checkedIn?'<span class="pill ok">已簽到</span>':'<span class="pill warn">'+(h.isPast?'未出席':'已報名')+'</span>'}</div>
      <div class="meta">${esc(h.date)}${h.type?'｜'+esc(h.type):''}${h.bike?'｜社車 '+esc(h.bike):''}${h.amount>0?'｜活動費 $'+h.amount+(h.paid?'（已繳）':'（未繳）'):''}${h.rentFee>0?'｜租借費 $'+h.rentFee+(h.rentPaid?'（已繳）':'（未繳）'):''}</div>
      ${h.checkedIn&&!h.feedbackDone?'<div class="meta warn">還沒填行程回饋</div>':''}</div>`).join('') : '<div class="muted">還沒有參加紀錄，去報名第一場活動吧！</div>';
  }else{
    $('historyCard').classList.add('hide');
    box.innerHTML = `<h3>已經建立過資料？直接登入</h3>
      <label>學號</label><input id="lgSid"><label>姓名</label><input id="lgName">
      <button class="btn" onclick="doLogin(this)">登入</button>
      <hr><h3>第一次使用？建立資料（只要填這一次）</h3>${profileForm(null)}`;
  }
}
function histItem(h){
  const money = (v, p) => v > 0 ? ' $' + v + (p ? '（已繳）' : '（未繳）') : '';
  return `<div class="item">
    <div class="between"><b>${esc(h.name)}</b>${h.checkedIn?'<span class="pill ok">已簽到</span>':'<span class="pill warn">'+(h.isPast?'未出席':'已報名')+'</span>'}</div>
    <div class="meta">${esc(h.date)} ${esc(h.meet||'')}${h.type?'｜'+esc(h.type):''}</div>
    <div class="meta">${esc(h.place||'')}${h.dist?'｜'+esc(h.dist)+' km':''}｜難度 ${starStr(h.diff)}</div>
    <div class="meta">${h.bike?'社車 '+esc(h.bike):(h.needBike?'已申請社車（待分配）':'未借社車')}${h.amount>0?'｜活動費'+money(h.amount,h.paid):''}${h.rentFee>0?'｜租借費'+money(h.rentFee,h.rentPaid):''}</div>
    ${h.checkedIn&&!h.feedbackDone?'<div class="meta warn">還沒填行程回饋</div>':''}
    ${h.registered&&!h.isPast?`<button class="btn small sec" onclick="openActivity('${esc(h.activityId)}')">查看 / 修改租借 / 取消</button>`:''}
  </div>`;
}
function showHist(kind){
  const all = (S.dash && S.dash.history) || [];
  const list = kind === 'att' ? all.filter(h => h.checkedIn) : all.filter(h => h.registered && !h.isPast);
  showModal('<h2>' + (kind === 'att' ? '我參加過的活動' : '目前報名中的活動') + '</h2>' + (list.length ? list.map(histItem).join('') : '<div class="muted">目前沒有紀錄</div>'));
}
async function doLogin(btn){
  btn.disabled = true;
  try{ const m = await call('loginMember', $('lgSid').value, $('lgName').value); lsSet(m.memberId); toast('登入成功'); await init(); goPage('home'); }
  catch(e){ toast(e.message, true); }
  btn.disabled = false;
}
async function saveProfile(btn){
  btn.disabled = true;
  try{
    const m = await call('saveMemberProfile', {name:$('pName').value, fb:$('pFb').value, gender:$('pGender').value, studentId:$('pSid').value,
      department:$('pDept').value, phone:$('pPhone').value, email:$('pEmail').value, exp:$('pExp').value});
    lsSet(m.memberId); toast('已儲存'); await init(); goPage('home');
  }catch(e){ toast(e.message, true); }
  btn.disabled = false;
}
function logout(){ lsSet(''); S.member = null; S.dash = null; init(); goPage('member'); }

// ---------- 幹部登入 ----------
async function sendCode(btn){
  btn.disabled = true;
  try{ const r = await call('sendCadreCode', $('cadreEmail').value); toast(r.message); $('codeWrap').classList.remove('hide'); }
  catch(e){ toast(e.message, true); }
  btn.disabled = false;
}
async function verifyCode(btn){
  btn.disabled = true;
  try{
    const r = await call('verifyCadreCode', $('cadreEmail').value, $('cadreCode').value, S.member ? S.member.memberId : '');
    enterAdmin(r.token, r); toast('幹部登入成功'); init();
  }catch(e){ toast(e.message, true); }
  btn.disabled = false;
}
async function adminLogin(){
  const pin = $('adminPin').value.trim();
  try{ const r = await call('adminLogin', pin, S.member ? S.member.memberId : ''); enterAdmin(pin, r); }
  catch(e){ toast(e.message, true); }
}
function enterAdmin(auth, who){
  S.pin = auth; S.who = who || {};
  $('adminWho').innerHTML = S.who.name
    ? `目前登入：<b>${esc(S.who.name)}</b> <span class="pill ok">${esc(S.who.title || '幹部')}</span>`
    : '目前登入：<b>幹部</b> <span class="muted">（密碼登入；若先在「我的」登入社員帳號，這裡會顯示你的名字）</span>';
  $('adminLoginBox').classList.add('hide'); $('adminContent').classList.remove('hide');
  if(!$('aNotice').value) $('aNotice').value = DEFAULT_NOTICE;
  loadAdmin();
}
async function loadAdmin(){
  try{ S.adminData = await call('getAdminSummary', S.pin); renderAdmin(); }
  catch(e){ toast(e.message, true); }
}
async function rebuildAttendance(btn){
  btn.disabled = true;
  try{ const r = await call('adminRebuildAttendance', S.pin); toast(r.message); }catch(e){ toast(e.message, true); }
  btn.disabled = false;
}

// ---------- 幹部後台 ----------
function renderAdmin(){
  const s = S.adminData; if(!s) return;
  const showPast = $('showPast').checked;
  const acts = s.activities.filter(a => showPast || !a.isPast);
  $('adminActs').innerHTML = acts.length ? acts.map(a => `<div class="item">
    <div class="between"><b>${esc(a.活動名稱)}</b><span>${a.isPast?'<span class="pill">已結束</span>':''}<span class="pill ${a.開放報名?'ok':''}">${a.開放報名?'開放中':'已關閉'}</span></span></div>
    <div class="meta">${esc(a.日期)} ${esc(a.集合時間)}｜${esc(a.類型)}｜難度 ${starStr(a.難度)}｜報名 ${a.regCount}｜簽到 ${a.checkCount}</div>
    <button class="btn small sec" onclick="editActivity('${esc(a.activityId)}')">編輯</button>
    <button class="btn small sec" onclick="showRoster('${esc(a.activityId)}')">參加名單 / 繳費 / 出席</button>
    <button class="btn small" onclick="showBikeBoard('${esc(a.activityId)}')">🚲 社車分配</button>
    <button class="btn small ghost" onclick="toggleOpen('${esc(a.activityId)}',${!a.開放報名})">${a.開放報名?'關閉報名':'開放報名'}</button>
  </div>`).join('') : '<div class="muted">沒有活動</div>';

  $('adminBikes').innerHTML = s.bikes.length ? s.bikes.map(b => `<div class="item">
    <div class="between"><div><span class="dot" style="background:${esc(b.顏色||'#64748b')}"></span><b>${esc(b.車名)}</b> <span class="muted">${esc(b.尺寸)}</span></div>${b.啟用?statusPill(b.顯示狀態):'<span class="pill">已停用</span>'}</div>
    ${b.使用者?'<div class="meta">'+esc(b.使用者)+'</div>':''}
    ${imgTag(b.照片URL,'prev')}
    <button class="btn small sec" onclick="editBike('${esc(b.bikeId)}')">編輯</button>
  </div>`).join('') : '<div class="muted">還沒有社車</div>';

  $('adminLoans').innerHTML = s.loans.length ? s.loans.map(l => `<div class="item">${esc(l.車名)}｜${esc(l.姓名)}
    <div class="meta">${esc(l.活動名稱)}｜應還 ${esc(l.應還時間)}</div>
    <button class="btn small ghost" onclick="forceReturn('${esc(l.loanId)}')">代為歸還</button></div>`).join('') : '<div class="muted">無</div>';

  $('adminReports').innerHTML = s.reports.length ? s.reports.map(r => `<div class="item"><b>${esc(r.車名)}</b>｜${esc(r.車況)}｜${esc(r.姓名)}
    <div class="meta">${esc(r.說明)}</div>
    <button class="btn small sec" onclick="resolveReport('${esc(r.reportId)}')">已處理，恢復可借</button></div>`).join('') : '<div class="muted">無</div>';

  const flagBtn = (m, key, cur, on, off) => `<button class="btn small ${cur?'sec':'ghost'}" onclick="setFlag('${esc(m.memberId)}','${key}',${!cur})">${cur?on:off}</button>`;
  const role = m => tj(m.幹部) ? '<b class="warn">'+esc(m.幹部職稱||'幹部')+'</b>' : tj(m.是否社員) ? '社員' : '一般';
  $('adminMembers').innerHTML = s.members.length ? `<table><tr><th>姓名</th><th>學號</th><th>社員</th><th>幹部</th><th>社費</th></tr>${s.members.map(m => `<tr>
    <td>${esc(m.姓名)}<div class="muted">${role(m)}｜${esc(m.經驗里程||'—')}${tj(m.幹部)?` <a href="#" onclick="setTitle('${esc(m.memberId)}','${esc(m.幹部職稱||'')}');return false">改職稱</a>`:''}</div></td><td>${esc(m.學號)}</td>
    <td>${flagBtn(m,'isMember',tj(m.是否社員),'是','否')}</td>
    <td>${flagBtn(m,'cadre',tj(m.幹部),'是','否')}</td>
    <td>${flagBtn(m,'feePaid',tj(m.社費已繳),'已繳','未繳')}</td></tr>`).join('')}</table>` : '<div class="muted">還沒有社員</div>';
}

// 圖片：先在手機縮圖再上傳
function readImage(file, maxW){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxW / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => rej(new Error('讀不到這張圖片'));
      img.src = fr.result;
    };
    fr.onerror = () => rej(new Error('讀取圖片失敗'));
    fr.readAsDataURL(file);
  });
}
async function doUpload(input, kind, setter){
  const f = input.files && input.files[0]; if(!f) return;
  toast('上傳中…');
  try{ const d = await readImage(f, 900); const r = await call('uploadImage', S.pin, d, kind); setter(r.url); toast('照片已上傳，記得按儲存'); }
  catch(e){ toast(e.message, true); }
}
function setPrev(id, url){
  const e = $(id);
  e.removeAttribute('data-done'); e.removeAttribute('data-fid'); e.removeAttribute('src'); e.style.display = '';
  if(!url){ e.classList.add('hide'); return; }
  const fid = driveId(url);
  if(fid) e.dataset.fid = fid; else e.src = url;
  e.classList.remove('hide'); hydrateImgs();
}
function upActPhoto(el){ doUpload(el, 'activity', u => { S.actPhoto = u; setPrev('aPhotoPrev', u); }); }
function upBikePhoto(el){ doUpload(el, 'bike', u => { S.bikePhoto = u; setPrev('bPhotoPrev', u); }); }

function resetActForm(){
  S.editId = ''; S.actPhoto = ''; $('aFormTitle').textContent = '新增活動';
  ['aName','aDate','aDeadline','aMeet','aEnd','aPlace','aRoute','aDist','aCap','aDiff','aLeader','aLeaderTel','aTail','aTailTel','aDesc','aNote','aPG','aPM','aPC'].forEach(i => $(i).value = '');
  $('aNotice').value = DEFAULT_NOTICE;
  $('aType').value = '例行活動'; $('aReturn').value = '23:59'; $('aOpenReg').checked = true; $('aOpenBike').checked = true;
  $('aPhotoFile').value = ''; setPrev('aPhotoPrev', '');
}
function editActivity(id){
  const a = S.adminData.activities.find(x => x.activityId === id); if(!a) return;
  S.editId = id; S.actPhoto = a.活動照片URL || ''; $('aFormTitle').textContent = '編輯活動：' + a.活動名稱;
  $('aName').value = a.活動名稱; $('aType').value = a.類型; $('aDate').value = a.日期; $('aDeadline').value = a.報名截止;
  $('aMeet').value = a.集合時間; $('aEnd').value = a.預計結束; $('aReturn').value = a.最晚還車時間 || '23:59';
  $('aPlace').value = a.集合地點; $('aRoute').value = a.路線連結; $('aDist').value = a.距離km; $('aCap').value = a.人數上限;
  $('aDiff').value = a.難度; $('aLeader').value = a.領騎; $('aLeaderTel').value = a.領騎電話;
  $('aTail').value = a.押後; $('aTailTel').value = a.押後電話;
  $('aDesc').value = a.活動說明; $('aNotice').value = a.注意事項; $('aNote').value = a.備註;
  $('aPG').value = a.一般價; $('aPM').value = a.社員價; $('aPC').value = a.幹部價;
  $('aOpenReg').checked = a.開放報名; $('aOpenBike').checked = a.開放借車;
  setPrev('aPhotoPrev', S.actPhoto);
  $('aName').scrollIntoView({behavior:'smooth'});
}
async function saveActivity(){
  const df = $('aDiff').value;
  if(df !== '' && (Number(df) < 1 || Number(df) > 5)) return toast('難度請輸入 1~5', true);
  try{
    const r = await call('saveActivity', S.pin, {
      activityId:S.editId, name:$('aName').value.trim(), type:$('aType').value, date:$('aDate').value, regDeadline:$('aDeadline').value,
      meetTime:$('aMeet').value, endTime:$('aEnd').value, returnTime:$('aReturn').value, place:$('aPlace').value, route:$('aRoute').value.trim(),
      distance:$('aDist').value, capacity:$('aCap').value, difficulty:df,
      leader:$('aLeader').value, leaderPhone:$('aLeaderTel').value, tail:$('aTail').value, tailPhone:$('aTailTel').value,
      priceGeneral:$('aPG').value, priceMember:$('aPM').value, priceCadre:$('aPC').value,
      desc:$('aDesc').value, notice:$('aNotice').value, note:$('aNote').value, photo:S.actPhoto,
      openReg:$('aOpenReg').checked, openBike:$('aOpenBike').checked
    });
    toast(r.message); resetActForm(); loadAdmin(); init();
  }catch(e){ toast(e.message, true); }
}
async function toggleOpen(id, open){
  try{ const r = await call('toggleActivityOpen', S.pin, id, open); toast(r.message); loadAdmin(); init(); }
  catch(e){ toast(e.message, true); }
}

function resetBikeForm(){
  S.editBikeId = ''; S.bikePhoto = ''; $('bFormTitle').textContent = '新增社車';
  ['bName','bType','bSize','bNote'].forEach(i => $(i).value = '');
  $('bColor').value = '#64748b'; $('bStatus').value = '可借'; $('bActive').checked = true;
  $('bPhotoFile').value = ''; setPrev('bPhotoPrev', '');
}
function editBike(id){
  const b = S.adminData.bikes.find(x => x.bikeId === id); if(!b) return;
  S.editBikeId = id; S.bikePhoto = b.照片URL || ''; $('bFormTitle').textContent = '編輯社車：' + b.車名;
  $('bName').value = b.車名; $('bType').value = b.類型; $('bSize').value = b.尺寸; $('bNote').value = b.備註 || '';
  $('bColor').value = /^#[0-9a-f]{6}$/i.test(b.顏色) ? b.顏色 : '#64748b';
  $('bStatus').value = ['可借','待檢修','維修中'].includes(b.狀態) ? b.狀態 : '可借';
  $('bActive').checked = b.啟用; setPrev('bPhotoPrev', S.bikePhoto);
  $('bName').scrollIntoView({behavior:'smooth'});
}
async function saveBike(){
  try{
    const r = await call('saveBike', S.pin, {bikeId:S.editBikeId, name:$('bName').value.trim(), type:$('bType').value, size:$('bSize').value,
      color:$('bColor').value, status:$('bStatus').value, note:$('bNote').value, photo:S.bikePhoto, active:$('bActive').checked});
    toast(r.message); resetBikeForm(); loadAdmin(); init();
  }catch(e){ toast(e.message, true); }
}

// 單一活動：所有參加者的租借、繳費、出席、取消（請假）
async function showRoster(id){
  try{
    const d = await call('getRoster', S.pin, id);
    const AID = esc(id);
    const past = d.activity.date && d.activity.date < S.adminData.today;
    const act = d.regs.filter(r => !r.cancelled), can = d.regs.filter(r => r.cancelled);
    const sum = (list, k) => list.reduce((t, r) => t + (Number(r[k]) || 0), 0);
    const feeAll = sum(act, '應繳金額'), feeIn = sum(act.filter(r => r.已繳費), '應繳金額');
    const rentAll = sum(act, '租借費用'), rentIn = sum(act.filter(r => r.租借費已繳), '租借費用');
    const opts = '<option value="">選擇社車</option>' + d.freeBikes.map(b => `<option value="${esc(b.bikeId)}">${esc(b.車名)}｜${esc(b.尺寸)}</option>`).join('');
    const n = k => act.filter(r => r[k]).length;
    const tags = r => [r.needBike?'社車':'', r.helmet?'安全帽':'', r.light?'車燈':'', r.bag?'攜車袋':''].filter(Boolean);

    let h = `<h2>${esc(d.activity.name)}</h2><div class="meta">${esc(d.activity.date)}</div>
      <div class="item">
        <div>報名 <b>${act.length}</b> 人｜已簽到 <b>${n('checked')}</b>｜${past?'未出席':'未簽到'} <b>${act.length-n('checked')}</b>｜取消／請假 <b>${can.length}</b></div>
        <div class="meta">借：社車 ${n('needBike')}｜安全帽 ${n('helmet')}｜車燈 ${n('light')}｜攜車袋 ${n('bag')}</div>
        <div class="meta">活動費 已收 $${feeIn} / 應收 $${feeAll}｜租借費 已收 $${rentIn} / 應收 $${rentAll}</div>
      </div>`;

    h += act.length ? act.map(r => {
      const t = tags(r), MID = esc(r.memberId);
      return `<div class="item ${r.checked?'mine':''}">
        <div class="between"><b>${esc(r.姓名)}</b><span>${r.checked?'<span class="pill ok">已簽到</span>':'<span class="pill '+(past?'bad':'')+'">'+(past?'未出席':'未簽到')+'</span>'}<span class="pill">${esc(r.身分)}</span></span></div>
        <div class="meta">${esc(r.學號)}｜${r.電話?'<a href="tel:'+esc(r.電話)+'">'+esc(r.電話)+'</a>':'—'}｜FB ${esc(r.FB||'—')}｜經驗 ${esc(r.經驗||'—')}</div>
        <div class="meta">租借：${t.length?t.map(x => '<span class="pill big2">'+x+'</span>').join(''):'無'}${r.身高?'｜身高 '+esc(r.身高)+' cm':''}</div>
        ${r.應繳金額 > 0 ? `<div class="meta">活動費 $${r.應繳金額}｜<button class="btn small ${r.已繳費?'sec':'ghost'}" onclick="togglePaid('${AID}','${MID}','fee',${!r.已繳費})">${r.已繳費?'✓ 已繳費':'標記已繳'}</button></div>` : ''}
        ${r.租借費用 > 0 ? `<div class="meta">租借費 $${r.租借費用}｜<button class="btn small ${r.租借費已繳?'sec':'ghost'}" onclick="togglePaid('${AID}','${MID}','rent',${!r.租借費已繳})">${r.租借費已繳?'✓ 已繳費':'標記已繳'}</button></div>` : ''}
        ${r.words ? `<div class="meta">想說的話：${esc(r.words)}</div>` : ''}
        <div class="meta">出席：<button class="btn small ${r.checked?'sec':'ghost'}" onclick="toggleAttend('${AID}','${MID}',${!r.checked})">${r.checked?'✓ 已到（點擊取消）':'標記到場'}</button></div>
        <div class="meta">社車：${r.bike ? '<b>'+esc(r.bike)+'</b>（'+esc(r.bikeStatus)+'）' : (r.needBike ? '<span class="warn">申請中，尚未分配</span>' : '不需要')}</div>
        ${r.bikeStatus === '已借出' ? '' : `<div class="row"><select id="rb_${MID}">${opts}</select>
          <button class="btn small" style="margin-top:0;flex:0 0 auto" onclick="assignBike('${AID}','${MID}')">${r.bike?'更換':'分配'}</button>
          ${r.bike ? `<button class="btn small danger" style="margin-top:0;flex:0 0 auto" onclick="unassignBike('${AID}','${MID}')">取消</button>` : ''}</div>`}
      </div>`;
    }).join('') : '<div class="muted">還沒有人報名</div>';

    if(can.length) h += '<h3>已取消 / 請假</h3>' + can.map(r => `<div class="item gone">
      <div class="between"><b>${esc(r.姓名)}</b><span class="pill">已取消</span></div>
      <div class="meta">${esc(r.學號)}｜${r.電話?esc(r.電話):'—'}｜${esc(r.取消時間)}</div>
      <div class="meta">原因：<b>${esc(r.取消原因||'—')}</b>${r.取消備註?'｜'+esc(r.取消備註):''}</div></div>`).join('');
    showModal(h);
  }catch(e){ toast(e.message, true); }
}
// 單一活動的社車分配板
async function showBikeBoard(id){
  try{
    const d = await call('getBikeBoard', S.pin, id);
    const AID = esc(id);
    const free = d.bikes.filter(b => b.state === 'free');
    const need = d.people.filter(p => p.needBike && !p.bike);
    const got = d.people.filter(p => p.bike);
    const others = d.people.filter(p => !p.needBike && !p.bike);
    const sel = mid => `<select id="bb_${esc(mid)}"><option value="">選擇社車（${free.length} 台可分配）</option>${free.map(b => `<option value="${esc(b.bikeId)}">${esc(b.車名)}｜${esc(b.尺寸)}</option>`).join('')}</select>`;
    const pRow = p => `<div class="item"><div class="between"><b>${esc(p.姓名)}</b>${p.checked?'<span class="pill ok">已簽到</span>':''}</div>
      <div class="meta">身高 ${esc(p.身高||'—')} cm｜${esc(p.電話||'')}</div>
      <div class="row">${sel(p.memberId)}<button class="btn small" style="margin-top:0;flex:0 0 auto" onclick="boardAssign('${AID}','${esc(p.memberId)}')">分配</button></div></div>`;
    const stateTxt = b => ({free:'<span class="pill ok">可分配</span>', assigned:'<span class="pill warn">已分配：'+esc(b.who)+'</span>',
      out:'<span class="pill bad">借出中：'+esc(b.who)+'</span>', loaned:'<span class="pill bad">他場借出中：'+esc(b.who)+'</span>',
      unavailable:'<span class="pill">'+esc(b.who)+'</span>'}[b.state]);

    showModal(`<h2>🚲 社車分配</h2><div class="meta">${esc(d.activity.name)}｜${esc(d.activity.date)}</div>
      <div class="item">需要社車 <b>${d.people.filter(p=>p.needBike||p.bike).length}</b> 人｜已分配 <b>${got.length}</b>｜<span class="${need.length?'warn':''}">待分配 <b>${need.length}</b></span>｜可分配車輛 <b>${free.length}</b> 台</div>
      <h3>待分配（有勾社車）</h3>${need.length ? need.map(pRow).join('') : '<div class="muted">沒有人在等社車</div>'}
      <h3>已分配</h3>${got.length ? got.map(p => `<div class="item mine"><div class="between"><b>${esc(p.姓名)}</b><span class="pill big2">${esc(p.bike)}</span></div>
        <div class="meta">身高 ${esc(p.身高||'—')} cm｜${esc(p.bikeStatus)}</div>
        ${p.bikeStatus === '已借出' ? '' : `<button class="btn small danger" onclick="boardUnassign('${AID}','${esc(p.memberId)}')">取消分配</button>`}</div>`).join('') : '<div class="muted">還沒有分配</div>'}
      <h3>社車狀態（這場活動）</h3>${d.bikes.length ? d.bikes.map(b => `<div class="item"><div class="between"><div><span class="dot" style="background:${esc(b.顏色||'#64748b')}"></span><b>${esc(b.車名)}</b> <span class="muted">${esc(b.尺寸)}</span></div>${stateTxt(b)}</div></div>`).join('') : '<div class="muted">還沒有社車</div>'}
      ${others.length ? `<details style="margin-top:10px"><summary class="muted">其他報名者（沒勾社車，${others.length} 人）— 需要時可直接幫他分配</summary>${others.map(pRow).join('')}</details>` : ''}`);
  }catch(e){ toast(e.message, true); }
}
async function boardAssign(aid, mid){
  const bid = $('bb_' + mid).value;
  if(!bid) return toast('請先選擇一台社車', true);
  try{ const r = await call('adminAssignBike', S.pin, aid, mid, bid); toast(r.message); showBikeBoard(aid); loadAdmin(); }
  catch(e){ toast(e.message, true); }
}
async function boardUnassign(aid, mid){
  try{ const r = await call('adminUnassignBike', S.pin, aid, mid); toast(r.message); showBikeBoard(aid); loadAdmin(); }
  catch(e){ toast(e.message, true); }
}
async function assignBike(aid, mid){
  const bid = $('rb_' + mid).value;
  if(!bid) return toast('請先選擇一台社車', true);
  try{ const r = await call('adminAssignBike', S.pin, aid, mid, bid); toast(r.message); showRoster(aid); loadAdmin(); }
  catch(e){ toast(e.message, true); }
}
async function unassignBike(aid, mid){
  try{ const r = await call('adminUnassignBike', S.pin, aid, mid); toast(r.message); showRoster(aid); loadAdmin(); }
  catch(e){ toast(e.message, true); }
}
async function togglePaid(aid, mid, kind, paid){
  try{ await call('setPaid', S.pin, aid, mid, kind, paid); showRoster(aid); }catch(e){ toast(e.message, true); }
}
async function toggleAttend(aid, mid, present){
  try{ const r = await call('adminSetAttendance', S.pin, aid, mid, present); toast(r.message); showRoster(aid); loadAdmin(); }
  catch(e){ toast(e.message, true); }
}
async function resolveReport(id){
  try{ const r = await call('resolveReport', S.pin, id); toast(r.message); loadAdmin(); init(); } catch(e){ toast(e.message, true); }
}
async function forceReturn(id){
  if(!confirm('確定代為歸還？')) return;
  try{ const r = await call('forceReturn', S.pin, id); toast(r.message); loadAdmin(); init(); } catch(e){ toast(e.message, true); }
}
async function setFlag(memberId, key, val){
  try{ const f = {}; f[key] = val; await call('setMemberFlags', S.pin, memberId, f); loadAdmin(); init(); } catch(e){ toast(e.message, true); }
}
async function setTitle(memberId, cur){
  const t = prompt('幹部職稱（例：社長、器材長、公關）', cur || '');
  if(t === null) return;
  try{ await call('setMemberFlags', S.pin, memberId, {title:t}); loadAdmin(); init(); } catch(e){ toast(e.message, true); }
}

init();
