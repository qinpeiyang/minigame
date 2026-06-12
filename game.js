/* 巨物清洁工 - 微信小游戏 V1.0 原型
 * 休闲解压 + 模拟经营 + 收集成长
 * 按住喷水，拖动清洗污渍；100% 清洁通关，金币升级水枪，解锁 20 个巨物关卡。
 */
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

function sys() { try { return wx.getSystemInfoSync() || {} } catch (e) { return {} } }
function raf(cb) {
  const f = (typeof requestAnimationFrame === 'function' && requestAnimationFrame)
    || (canvas && typeof canvas.requestAnimationFrame === 'function' && canvas.requestAnimationFrame.bind(canvas))
    || (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function' && wx.requestAnimationFrame.bind(wx))
  return f ? f(cb) : setTimeout(cb, 1000 / 60)
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function rand(a, b) { return a + Math.random() * (b - a) }
function dist(ax, ay, bx, by) { const x = ax - bx, y = ay - by; return Math.sqrt(x * x + y * y) }
function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(Math.floor(n)) }

let W = 375, H = 667, DPR = 1, frame = 0
let page = 'home' // home | levels | equip | tasks | rank | shop | game | result
let activeTab = 'home'
let touches = []
let spraying = false
let sprayX = 0, sprayY = 0
let water = []
let foamZones = []
let tornado = null
let result = null
let startedAt = 0
let gameTime = 0
let currentLevel = 0
let dirt = []
let cleanRatio = 0
let buttons = []

const levels = [
  ['自行车', '街头清洁', 'bike', 1, 1], ['电动车', '街头清洁', 'scooter', 1.12, 1], ['摩托车', '街头清洁', 'motor', 1.22, 2], ['汽车', '街头清洁', 'car', 1.35, 2], ['公交车', '街头清洁', 'bus', 1.55, 3],
  ['小卖部', '建筑清洁', 'shop', 1.45, 2], ['别墅', '建筑清洁', 'villa', 1.6, 3], ['写字楼', '建筑清洁', 'office', 1.78, 3], ['商场', '建筑清洁', 'mall', 1.9, 4], ['摩天大楼', '建筑清洁', 'tower', 2.15, 4],
  ['挖掘机', '工业清洁', 'excavator', 1.9, 4], ['集装箱', '工业清洁', 'container', 2.05, 4], ['港口吊机', '工业清洁', 'crane', 2.25, 5], ['游轮', '工业清洁', 'ship', 2.45, 5], ['飞机', '工业清洁', 'plane', 2.6, 5],
  ['狮身人面像', '世界奇观', 'sphinx', 2.5, 5], ['金字塔', '世界奇观', 'pyramid', 2.65, 5], ['长城', '世界奇观', 'wall', 2.8, 6], ['埃菲尔铁塔', '世界奇观', 'eiffel', 3.0, 6], ['空间站', '世界奇观', 'station', 3.2, 6]
]
const stainTypes = [
  { name: '灰尘', hp: 1.0, color: 'rgba(80,87,92,.68)', reward: 1 },
  { name: '泥巴', hp: 1.55, color: 'rgba(116,74,37,.75)', reward: 2 },
  { name: '油污', hp: 2.3, color: 'rgba(34,31,29,.78)', reward: 3 },
  { name: '青苔', hp: 2.0, color: 'rgba(33,121,66,.72)', reward: 3 },
  { name: '涂鸦', hp: 2.7, color: 'rgba(224,55,143,.68)', reward: 4 },
  { name: '顽固污垢', hp: 3.5, color: 'rgba(55,37,28,.85)', reward: 6 }
]
const gunNames = ['普通喷枪', '强压喷枪', '涡轮喷枪', '激光水炮', '超级银河喷枪']
const gunMilestones = [1, 5, 10, 20, 30]
const gunColors = ['#4FC3FF', '#35DDA2', '#FFB33D', '#9F7CFF', '#FF68D2']
let data = {
  coins: 800, diamonds: 20, playerLv: 1, xp: 0, gunLv: 1, unlocked: 1, totalArea: 0,
  finished: {}, daily: { clean3: 0, area500: 0, ad: 0 }, skin: 0
}

function load() {
  try { const d = wx.getStorageSync('giantCleaner'); if (d) data = Object.assign(data, d) } catch (e) {}
}
function save() { try { wx.setStorageSync('giantCleaner', data) } catch (e) {} }
function resize() {
  const s = sys(); W = s.windowWidth || W; H = s.windowHeight || H; DPR = Math.max(1, s.pixelRatio || 1)
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR)
  if (canvas.style) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px' }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
}

function gunTier() { let t = 0; for (let i = 0; i < gunMilestones.length; i++) if (data.gunLv >= gunMilestones[i]) t = i; return t }
function gunRange() { return 20 + gunTier() * 9 + data.gunLv * .8 }
function gunPower() { return .045 + gunTier() * .026 + data.gunLv * .004 }
function upgradeCost() { return Math.floor(180 * Math.pow(1.18, data.gunLv - 1)) }
function addXP(x) {
  data.xp += x
  while (data.xp >= data.playerLv * 120) { data.xp -= data.playerLv * 120; data.playerLv++; data.coins += 120 + data.playerLv * 30; data.diamonds += data.playerLv % 5 === 0 ? 5 : 0 }
}

function resetButtons() { buttons = [] }
function btn(id, x, y, w, h, text, onTap, tone = 'primary') { buttons.push({ id, x, y, w, h, text, onTap, tone }); drawButton(x, y, w, h, text, tone) }
function hitButton(x, y) { for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b } return null }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath() }
function drawButton(x, y, w, h, text, tone) {
  const grad = ctx.createLinearGradient(x, y, x, y+h)
  if (tone === 'green') { grad.addColorStop(0, '#73F5A6'); grad.addColorStop(1, '#27C86D') }
  else if (tone === 'orange') { grad.addColorStop(0, '#FFD36A'); grad.addColorStop(1, '#FF8B2E') }
  else if (tone === 'blue') { grad.addColorStop(0, '#70D7FF'); grad.addColorStop(1, '#2388FF') }
  else if (tone === 'ghost') { grad.addColorStop(0, 'rgba(255,255,255,.22)'); grad.addColorStop(1, 'rgba(255,255,255,.12)') }
  else { grad.addColorStop(0, '#A98BFF'); grad.addColorStop(1, '#615DFF') }
  ctx.save(); ctx.shadowColor = 'rgba(37,77,130,.22)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4
  ctx.fillStyle = grad; roundRect(x, y, w, h, h / 2); ctx.fill(); ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + w / 2, y + h / 2 + 1); ctx.restore()
}

function bg() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#7DE3FF'); g.addColorStop(.46, '#EAFEFF'); g.addColorStop(1, '#F7FFF2')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = .35
  ctx.fillStyle = '#FFFFFF'; for (let i = 0; i < 8; i++) { const x = (i * 111 + frame * .25) % (W + 140) - 70, y = 50 + (i % 4) * 55; cloud(x, y, .55 + (i % 3) * .2) }
  ctx.restore()
  const shine = ctx.createRadialGradient(W * .78, 62, 4, W * .78, 62, 120)
  shine.addColorStop(0, 'rgba(255,229,120,.55)'); shine.addColorStop(1, 'rgba(255,229,120,0)')
  ctx.fillStyle = shine; ctx.fillRect(0, 0, W, H)
}
function cloud(x, y, s) { ctx.beginPath(); ctx.arc(x, y, 22*s, 0, Math.PI*2); ctx.arc(x+26*s, y-10*s, 28*s, 0, Math.PI*2); ctx.arc(x+58*s, y, 21*s, 0, Math.PI*2); ctx.fill() }
function card(x, y, w, h, alpha = .72) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${alpha})`; roundRect(x, y, w, h, 22); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore() }
function topBar() {
  card(12, 10, W - 24, 70, .62)
  ctx.fillStyle = '#195078'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('🧼 清洁工 Lv.' + data.playerLv, 26, 38)
  ctx.font = 'bold 13px sans-serif'; ctx.fillText('🪙 ' + fmt(data.coins), W - 150, 34); ctx.fillText('💎 ' + fmt(data.diamonds), W - 150, 58)
  const need = data.playerLv * 120; ctx.fillStyle = 'rgba(20,92,140,.16)'; roundRect(26, 51, 140, 10, 5); ctx.fill(); ctx.fillStyle = '#4AD6FF'; roundRect(26, 51, 140 * clamp(data.xp / need, 0, 1), 10, 5); ctx.fill()
}
function bottomNav() {
  const tabs = [['home','首页','🏠'], ['equip','装备','🔫'], ['tasks','任务','📋'], ['rank','排行','🏆'], ['shop','商店','🛒']]
  card(10, H - 76, W - 20, 62, .72)
  const w = (W - 24) / tabs.length
  tabs.forEach((t, i) => {
    const x = 12 + i * w, active = activeTab === t[0]
    if (active) { ctx.fillStyle = 'rgba(53,166,255,.18)'; roundRect(x + 4, H - 68, w - 8, 46, 16); ctx.fill() }
    ctx.fillStyle = active ? '#168DFF' : '#5D7890'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t[2], x + w/2, H - 46)
    ctx.font = '11px sans-serif'; ctx.fillText(t[1], x + w/2, H - 27)
    buttons.push({ id: 'tab_' + t[0], x, y: H - 74, w, h: 60, text: t[1], onTap: () => { activeTab = t[0]; page = t[0] === 'home' ? 'home' : t[0] } })
  })
}

function drawObject(kind, x, y, s, clean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  function rr(x,y,w,h,r,c,st='#236') { ctx.fillStyle=c; roundRect(x,y,w,h,r); ctx.fill(); ctx.strokeStyle=st; ctx.lineWidth=3; ctx.stroke() }
  function wheel(cx, cy, r) { ctx.fillStyle='#243B53'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#BEEFFF'; ctx.beginPath(); ctx.arc(cx,cy,r*.45,0,Math.PI*2); ctx.fill() }
  const shine = clean > .85 ? Math.sin(frame*.18)*.18 + .3 : 0
  if (kind === 'bike') { ctx.strokeStyle='#208DEB'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(-80,30); ctx.lineTo(-20,-35); ctx.lineTo(45,30); ctx.lineTo(-80,30); ctx.lineTo(45,30); ctx.moveTo(-20,-35); ctx.lineTo(78,-35); ctx.stroke(); wheel(-92,40,32); wheel(88,40,32) }
  else if (kind === 'scooter') { rr(-80,-8,150,54,18,'#35DDA2'); rr(-25,-60,48,58,18,'#6EE7FF'); wheel(-58,54,22); wheel(64,54,22); ctx.fillStyle='#FFD75A'; ctx.fillRect(60,-28,55,10) }
  else if (kind === 'motor') { rr(-105,-20,190,66,22,'#FF8B2E'); rr(-35,-66,70,42,18,'#63D5FF'); wheel(-78,56,28); wheel(78,56,28); ctx.strokeStyle='#333'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(70,-50); ctx.lineTo(112,-72); ctx.stroke() }
  else if (kind === 'car') { rr(-120,-30,240,76,22,'#FF6B6B'); rr(-55,-86,112,62,20,'#76DFFF'); wheel(-74,54,27); wheel(76,54,27); ctx.fillStyle='#FFE66D'; ctx.fillRect(92,-12,24,14) }
  else if (kind === 'bus') { rr(-150,-62,300,120,18,'#FFD04C'); for(let i=-2;i<=2;i++) rr(i*48-18,-42,36,32,7,'#82E7FF'); wheel(-98,68,28); wheel(102,68,28) }
  else if (['shop','villa','office','mall','tower'].includes(kind)) drawBuilding(kind)
  else if (kind === 'excavator') { rr(-120,0,145,55,18,'#F6B536'); rr(-80,-58,90,60,16,'#FFD75A'); ctx.strokeStyle='#D8891D'; ctx.lineWidth=15; ctx.beginPath(); ctx.moveTo(20,-20); ctx.lineTo(92,-70); ctx.lineTo(132,-20); ctx.stroke(); rr(105,-14,60,28,8,'#C87921'); rr(-140,54,260,32,16,'#394B59') }
  else if (kind === 'container') { rr(-150,-65,300,130,12,'#E45454'); ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=4; for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*45,-55);ctx.lineTo(i*45,55);ctx.stroke()} }
  else if (kind === 'crane') { ctx.strokeStyle='#F5B642'; ctx.lineWidth=13; ctx.beginPath(); ctx.moveTo(-20,90); ctx.lineTo(-20,-110); ctx.lineTo(140,-110); ctx.moveTo(-20,-80); ctx.lineTo(110,-110); ctx.stroke(); rr(-55,80,70,32,8,'#F5B642'); ctx.strokeStyle='#333'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(110,-110); ctx.lineTo(110,-20); ctx.stroke(); rr(92,-20,36,28,5,'#E85D5D') }
  else if (kind === 'ship') { rr(-150,0,300,75,28,'#5AA9FF'); rr(-80,-74,145,75,12,'#FFFFFF'); rr(-30,-116,54,44,9,'#FF8B2E'); for(let i=-2;i<=2;i++) rr(i*34-10,-52,20,20,5,'#7EE7FF') }
  else if (kind === 'plane') { rr(-140,-22,280,48,24,'#EAF7FF'); ctx.fillStyle='#55B5FF'; ctx.beginPath(); ctx.moveTo(-20,-15); ctx.lineTo(-105,-95); ctx.lineTo(30,-24); ctx.fill(); ctx.beginPath(); ctx.moveTo(-10,15); ctx.lineTo(-95,86); ctx.lineTo(38,24); ctx.fill(); ctx.beginPath(); ctx.moveTo(104,-18); ctx.lineTo(150,-62); ctx.lineTo(134,0); ctx.fill() }
  else if (kind === 'sphinx') { rr(-135,28,270,48,20,'#D8AA54'); rr(-48,-60,96,90,26,'#C89542'); ctx.fillStyle='#D8AA54'; ctx.beginPath(); ctx.moveTo(-50,28); ctx.lineTo(-140,96); ctx.lineTo(110,96); ctx.lineTo(50,28); ctx.fill() }
  else if (kind === 'pyramid') { ctx.fillStyle='#D9B567'; ctx.beginPath(); ctx.moveTo(0,-135); ctx.lineTo(-165,95); ctx.lineTo(165,95); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#8B6B33'; ctx.lineWidth=3; ctx.stroke(); ctx.strokeStyle='rgba(255,255,255,.25)'; for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(-130+i*38,40-i*20);ctx.lineTo(130-i*10,40-i*20);ctx.stroke()} }
  else if (kind === 'wall') { for(let i=-4;i<=4;i++) rr(i*42, Math.sin(i)*18, 48, 46, 6, '#B88D55'); rr(-150,-45,55,70,8,'#9F7442'); rr(95,-55,65,85,8,'#9F7442') }
  else if (kind === 'eiffel') { ctx.strokeStyle='#66584E'; ctx.lineWidth=10; ctx.beginPath(); ctx.moveTo(-110,110);ctx.lineTo(0,-135);ctx.lineTo(110,110);ctx.moveTo(-72,30);ctx.lineTo(72,30);ctx.moveTo(-48,-38);ctx.lineTo(48,-38);ctx.moveTo(-24,-90);ctx.lineTo(24,-90);ctx.stroke() }
  else if (kind === 'station') { rr(-75,-24,150,48,16,'#EAF7FF'); rr(-135,-55,45,110,8,'#3D8DFF'); rr(90,-55,45,110,8,'#3D8DFF'); ctx.strokeStyle='#B8C9D8'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(-90,0);ctx.lineTo(90,0);ctx.stroke(); ctx.fillStyle='#FFD75A'; ctx.beginPath(); ctx.arc(0,0,28,0,Math.PI*2);ctx.fill() }
  function drawBuilding(k) { const col = k==='shop'?'#FFB24A':k==='villa'?'#FFFFFF':k==='office'?'#79C7FF':k==='mall'?'#B896FF':'#62D0FF'; const ww = k==='tower'?150:k==='mall'?260:k==='office'?190:k==='villa'?230:230; const hh = k==='tower'?260:k==='mall'?160:k==='office'?230:k==='villa'?155:130; rr(-ww/2,-hh/2,ww,hh,16,col); for(let yy=-hh/2+25; yy<hh/2-15; yy+=38) for(let xx=-ww/2+24; xx<ww/2-20; xx+=42) rr(xx,yy,24,22,5,'#BDF3FF'); if(k==='villa'){ctx.fillStyle='#EF5C5C';ctx.beginPath();ctx.moveTo(-135,-78);ctx.lineTo(0,-155);ctx.lineTo(135,-78);ctx.fill()} }
  if (shine) { ctx.globalAlpha = shine; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(-40, -40, 90, 18, -.3, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1 }
  ctx.restore()
}

function objectBox() { const size = Math.min(W * .82, H * .36); return { x: W/2, y: H*.45, s: size / 330, size } }
function playArea() { return { x: 14, y: 94, w: W - 28, h: H - 214 } }
function levelTheme(idx) {
  const lv = levels[idx]
  if (idx < 5) return { base1: '#F7FBFF', base2: '#E9F1F7', line: '#DCE6EE', stain: '#E92020', accent: '#9EA9B4', title: lv[0] + '表面' }
  if (idx < 10) return { base1: '#FDFDFD', base2: '#F0F4F7', line: '#E1E7EC', stain: '#E51D1D', accent: '#B7C1C8', title: lv[0] + '外墙' }
  if (idx < 15) return { base1: '#F1F5F7', base2: '#DDE6EC', line: '#C8D4DC', stain: '#F01818', accent: '#8898A7', title: lv[0] + '机身' }
  return { base1: '#F5F1E8', base2: '#E7DAC6', line: '#D1BEA0', stain: '#E91515', accent: '#A1845D', title: lv[0] + '巨像' }
}
function makeDirtPatch(x, y, r, hp, typeIndex, style, text) {
  return { x, y, r, hp, max: hp, type: typeIndex, style, text: text || '', wob: rand(0, 99), rot: rand(-.35, .35), w: rand(.9, 1.8), h: rand(.42, 1.05) }
}
function generateSurfaceDirt(idx) {
  const area = playArea(), lv = levels[idx]
  const count = Math.floor(70 + lv[3] * 45)
  dirt = []
  for (let i = 0; i < count; i++) {
    const typeIndex = clamp(Math.floor(rand(0, lv[4] + 1)), 0, stainTypes.length - 1)
    const st = stainTypes[typeIndex]
    const x = rand(area.x + 28, area.x + area.w - 28)
    const y = rand(area.y + 34, area.y + area.h - 34)
    const r = rand(9, 27) * (1 + lv[3] * .05)
    const style = Math.random() < .44 ? 'stroke' : Math.random() < .72 ? 'splash' : 'graffiti'
    const words = ['重污', '油污', '泥', '清洗', '脏', '污渍', 'NO', '99%', '灰尘', '顽固']
    dirt.push(makeDirtPatch(x, y, r, st.hp * lv[3] * rand(.85, 1.35), typeIndex, style, words[Math.floor(rand(0, words.length))]))
  }
  // 大的广告涂鸦/红色喷漆，制造截图里那种“满屏脏”的爽感
  const big = Math.floor(4 + idx / 3)
  for (let i = 0; i < big; i++) {
    const x = rand(area.x + area.w * .18, area.x + area.w * .82)
    const y = rand(area.y + area.h * .18, area.y + area.h * .78)
    dirt.push(makeDirtPatch(x, y, rand(42, 76), 4.5 * lv[3], clamp(lv[4],0,5), 'bigGraffiti', ['脏', '污', '洗', '乱', '旧'][i % 5]))
  }
}
function startLevel(idx) {
  currentLevel = idx; page = 'game'; activeTab = 'home'; startedAt = Date.now(); gameTime = 0; cleanRatio = 0; water = []; foamZones = []; tornado = null; spraying = false
  generateSurfaceDirt(idx)
}

function updateClean() { const sum = dirt.reduce((a, d) => a + Math.max(0, d.hp), 0), max = dirt.reduce((a, d) => a + d.max, 0); cleanRatio = max ? 1 - sum / max : 1 }
function cleanAt(x, y, radius, power, kind = 'water') {
  const p = power * (kind === 'foam' ? .42 : 1)
  dirt.forEach(d => { const dd = dist(x, y, d.x, d.y); if (dd < radius + d.r) { const k = 1 - dd / (radius + d.r); d.hp = Math.max(0, d.hp - p * (0.35 + k * 1.35)) } })
}
function finishLevel() {
  const sec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
  const base = 120 + currentLevel * 28
  const speedBonus = Math.max(0, 90 - sec) * 2
  const reward = Math.floor(base + speedBonus + levels[currentLevel][3] * 80)
  data.coins += reward; addXP(50 + currentLevel * 8); data.totalArea += Math.floor(100 * levels[currentLevel][3])
  data.daily.clean3 = (data.daily.clean3 || 0) + 1; data.daily.area500 = (data.daily.area500 || 0) + Math.floor(100 * levels[currentLevel][3])
  data.finished[currentLevel] = true; if (data.unlocked <= currentLevel + 1 && data.unlocked < levels.length) data.unlocked = currentLevel + 2
  save(); result = { sec, reward, level: currentLevel }; page = 'result'; spraying = false
}
function useSkill(name) {
  if (page !== 'game') return
  const box = playArea(); const cx = box.x + box.w/2, cy = box.y + box.h/2
  if (name === 'shock') { cleanAt(sprayX || cx, sprayY || cy, 90 + gunTier() * 16, 8, 'water'); popText('冲击波！', sprayX || cx, sprayY || cy); splash(sprayX || cx, sprayY || cy, '#C9F8FF', 36) }
  if (name === 'foam') { foamZones.push({ x: sprayX || cx, y: sprayY || cy, r: 95, life: 600 }); popText('泡沫清洁', sprayX || cx, sprayY || cy) }
  if (name === 'tornado') { tornado = { x: cx, y: cy, a: 0, life: 300 }; popText('超级水龙卷！', cx, cy) }
  if (name === 'purify' && cleanRatio >= .9) { dirt.forEach(d => d.hp = 0); popText('一键净化！', cx, cy); updateClean(); finishLevel() }
}
function splash(x, y, c, n) { for (let i=0;i<n;i++) water.push({ x, y, vx: rand(-3,3), vy: rand(-5,1), r: rand(2,5), life: rand(18,38), max: 38, c }) }
function popText(text, x, y) { water.push({ text, x, y, vx:0, vy:-1.2, r:0, life:55, max:55, c:'#fff' }) }

function updateGame() {
  if (page === 'game') {
    gameTime = Math.floor((Date.now() - startedAt) / 1000)
    if (spraying) {
      const radius = gunRange(), power = gunPower()
      cleanAt(sprayX, sprayY, radius, power, 'water')
      const nozzle = { x: W/2, y: H - 88 }
      for (let i=0;i<5;i++) water.push({ x: nozzle.x + rand(-8,8), y: nozzle.y + rand(-4,4), vx: (sprayX-nozzle.x)/22 + rand(-1.2,1.2), vy: (sprayY-nozzle.y)/22 + rand(-1.2,1.2), r: rand(2,5), life: rand(18,30), max: 30, c: '#78DFFF' })
    }
    foamZones.forEach(f => { f.life--; cleanAt(f.x + Math.sin(frame*.04)*18, f.y + Math.cos(frame*.035)*18, f.r, gunPower()*.6, 'foam') })
    foamZones = foamZones.filter(f => f.life > 0)
    if (tornado) { tornado.life--; tornado.a += .16; const area = playArea(); const x = area.x + area.w/2 + Math.cos(tornado.a)*90, y = area.y + area.h/2 + Math.sin(tornado.a*1.4)*65; cleanAt(x, y, 76, gunPower()*2.7); if (frame%3===0) splash(x,y,'#BDF7FF',3); if (tornado.life <= 0) tornado = null }
    updateClean(); if (cleanRatio >= .995) finishLevel()
  }
  water.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .05; p.life-- })
  water = water.filter(p => p.life > 0)
}

function drawSurfaceScene() {
  const area = playArea(), theme = levelTheme(currentLevel)
  ctx.save()
  // 主清洁面板：占满屏幕中间，像参考图那样是巨物表面而不是小图标
  const g = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h)
  g.addColorStop(0, theme.base1); g.addColorStop(1, theme.base2)
  ctx.fillStyle = g; roundRect(area.x, area.y, area.w, area.h, 18); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke()

  // 砖缝/金属板缝
  ctx.save(); ctx.beginPath(); roundRect(area.x, area.y, area.w, area.h, 18); ctx.clip()
  ctx.strokeStyle = theme.line; ctx.lineWidth = 1
  const tile = currentLevel < 10 ? 64 : currentLevel < 15 ? 82 : 72
  for (let x = area.x - ((frame * .08) % tile); x < area.x + area.w + tile; x += tile) { ctx.beginPath(); ctx.moveTo(x, area.y); ctx.lineTo(x, area.y + area.h); ctx.stroke() }
  for (let y = area.y + 32; y < area.y + area.h; y += tile * .74) { ctx.beginPath(); ctx.moveTo(area.x, y); ctx.lineTo(area.x + area.w, y); ctx.stroke() }
  // 几个凸起零件/窗口，增强巨物感
  ctx.fillStyle = 'rgba(255,255,255,.58)'
  for (let i=0;i<8;i++) { const x=area.x+22+(i%2)*(area.w-88)+Math.sin(i)*14, y=area.y+70+i*58; if(y<area.y+area.h-42){ roundRect(x,y,64,34,8); ctx.fill() } }
  ctx.fillStyle = theme.accent + '55'
  roundRect(area.x + area.w*.34, area.y + area.h*.48, area.w*.32, 28, 12); ctx.fill()
  ctx.restore()

  // 远景巨物轮廓，仅作“当前关卡物体”的提示，不抢清洁表面主视觉
  ctx.save(); ctx.globalAlpha = .13; drawObject(levels[currentLevel][2], area.x + area.w*.5, area.y + area.h*.55, Math.min(area.w*.8, 290)/330, .95); ctx.restore()
  ctx.restore()
}
function drawDirtPatch(d) {
  if (d.hp <= 0) return
  const theme = levelTheme(currentLevel)
  const st = stainTypes[d.type]
  const a = clamp(d.hp / d.max, 0, 1) * .96
  ctx.save(); ctx.globalAlpha = a; ctx.translate(d.x, d.y); ctx.rotate(d.rot)
  const red = d.type >= 4 ? 'rgba(232,16,24,.92)' : d.type === 2 ? 'rgba(42,34,28,.85)' : d.type === 3 ? 'rgba(39,132,67,.78)' : theme.stain
  if (d.style === 'stroke') {
    ctx.strokeStyle = red; ctx.lineWidth = Math.max(5, d.r * .36); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(-d.r*d.w, rand(-2,2)); ctx.bezierCurveTo(-d.r*.45, -d.r*.9*d.h, d.r*.45, d.r*.75*d.h, d.r*d.w, rand(-2,2)); ctx.stroke()
  } else if (d.style === 'graffiti') {
    ctx.fillStyle = red; ctx.font = 'bold ' + Math.floor(d.r*1.25) + 'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(d.text, 0, 0)
    ctx.strokeStyle = red; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, d.r*.86, .2, Math.PI*1.55); ctx.stroke()
  } else if (d.style === 'bigGraffiti') {
    ctx.strokeStyle = red; ctx.lineWidth = Math.max(12, d.r*.34); ctx.lineCap='round'; ctx.lineJoin='round'
    ctx.beginPath(); ctx.moveTo(-d.r*.9, -d.r*.5); ctx.lineTo(-d.r*.1, d.r*.15); ctx.lineTo(d.r*.8, -d.r*.65); ctx.moveTo(-d.r*.6, d.r*.62); ctx.lineTo(d.r*.7, d.r*.45); ctx.stroke()
    ctx.fillStyle = red; ctx.font = '900 ' + Math.floor(d.r*1.05) + 'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(d.text, 0, 0)
  } else {
    const g = ctx.createRadialGradient(-d.r*.2, -d.r*.2, 1, 0, 0, d.r*1.45)
    g.addColorStop(0, red); g.addColorStop(.75, red); g.addColorStop(1, 'rgba(255,0,0,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, d.r*d.w, d.r*d.h, 0, 0, Math.PI*2); ctx.fill()
    for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(rand(-d.r,d.r),rand(-d.r*.6,d.r*.6),rand(2,d.r*.22),0,Math.PI*2);ctx.fill()}
  }
  ctx.restore()
}
function renderGame() {
  bg()
  topGameUI()
  drawSurfaceScene()
  dirt.forEach(drawDirtPatch)
  foamZones.forEach(f => { ctx.globalAlpha = clamp(f.life/80,0,.55); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha=1 })
  if (tornado) { const area=playArea(); ctx.save(); ctx.strokeStyle='#7EE7FF'; ctx.lineWidth=8; ctx.globalAlpha=.65; ctx.beginPath(); for(let a=0;a<Math.PI*4;a+=.25){ const r=8+a*8, x=area.x+area.w/2+Math.cos(a+tornado.a)*r, y=area.y+area.h/2+Math.sin(a+tornado.a)*r*.55; if(a===0)ctx.moveTo(x,y); else ctx.lineTo(x,y)} ctx.stroke(); ctx.restore() }
  drawSpray()
  water.forEach(p => { ctx.save(); ctx.globalAlpha = clamp(p.life/p.max,0,1); if (p.text) { ctx.fillStyle='#2388FF'; ctx.font='bold 20px sans-serif'; ctx.textAlign='center'; ctx.fillText(p.text,p.x,p.y) } else { ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill() } ctx.restore() })
  bottomGameUI()
}

function topGameUI() {
  card(12, 12, W-24, 66, .68)
  ctx.fillStyle = '#164A72'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign='left'; ctx.fillText('Level ' + (currentLevel+1) + '  ' + levelTheme(currentLevel).title, 26, 35)
  ctx.font = '12px sans-serif'; ctx.fillText(levels[currentLevel][1] + ' · ' + stainTypes[clamp(levels[currentLevel][4]-1,0,5)].name + '挑战', 26, 58)
  ctx.fillStyle='rgba(22,93,150,.14)'; roundRect(W-142, 28, 102, 14, 7); ctx.fill(); ctx.fillStyle='#39D98A'; roundRect(W-142, 28, 102*cleanRatio, 14, 7); ctx.fill()
  ctx.fillStyle='#164A72'; ctx.font='bold 13px sans-serif'; ctx.textAlign='right'; ctx.fillText(Math.floor(cleanRatio*100)+'%', W-22, 40); ctx.fillText('⏱ '+gameTime+'s', W-22, 62)
}
function drawSpray() {
  const nozzle = { x: W/2, y: H-88 }
  ctx.save()
  // 水枪
  const tier = gunTier(); ctx.translate(nozzle.x, nozzle.y)
  ctx.fillStyle = gunColors[tier]; ctx.strokeStyle='#13527E'; ctx.lineWidth=3; roundRect(-34, -12, 68, 24, 10); ctx.fill(); ctx.stroke(); roundRect(8, 8, 20, 34, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle='#DDF8FF'; roundRect(28,-6,42,12,6); ctx.fill(); ctx.stroke()
  ctx.restore()
  if (!spraying) return
  const g = ctx.createLinearGradient(nozzle.x, nozzle.y, sprayX, sprayY); g.addColorStop(0,'rgba(255,255,255,.75)'); g.addColorStop(1,'rgba(71,199,255,.22)')
  ctx.strokeStyle=g; ctx.lineWidth=gunRange()*.55; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(nozzle.x+28,nozzle.y-2); ctx.lineTo(sprayX,sprayY); ctx.stroke()
  ctx.strokeStyle='rgba(255,255,255,.82)'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(nozzle.x+28,nozzle.y-2); ctx.lineTo(sprayX,sprayY); ctx.stroke()
  ctx.fillStyle='rgba(104,221,255,.3)'; ctx.beginPath(); ctx.arc(sprayX,sprayY,gunRange(),0,Math.PI*2); ctx.fill()
}
function bottomGameUI() {
  card(12, H-116, W-24, 100, .65)
  const skills = [['shock','冲击波'], ['foam','泡沫'], ['tornado','龙卷'], ['purify','净化']]
  const w = (W-44)/4
  skills.forEach((s,i)=>btn('skill_'+s[0], 22+i*w, H-101, w-8, 42, s[1], () => useSkill(s[0]), s[0]==='purify'&&cleanRatio<.9?'ghost':'blue'))
  ctx.fillStyle='#486C82'; ctx.font='12px sans-serif'; ctx.textAlign='center'; ctx.fillText('按住屏幕持续喷水，拖动清洗污渍', W/2, H-28)
}

function homePage() {
  bg(); topBar()
  const idx = Math.min(data.unlocked - 1, levels.length - 1), lv = levels[idx]
  ctx.fillStyle = '#195078'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign='center'; ctx.fillText('巨物清洁工', W/2, 116)
  ctx.font='13px sans-serif'; ctx.fillStyle='#5B7D93'; ctx.fillText('把脏兮兮的巨物洗到闪闪发光', W/2, 139)
  card(28, 160, W-56, H-285, .68)
  const box = { x: W/2, y: H*.42, s: Math.min(W*.74, H*.28)/330 }
  drawObject(lv[2], box.x, box.y, box.s, .96)
  ctx.fillStyle='#164A72'; ctx.font='bold 20px sans-serif'; ctx.fillText('当前关卡：Level '+(idx+1), W/2, H*.62)
  ctx.font='bold 16px sans-serif'; ctx.fillText(lv[1]+' · '+lv[0], W/2, H*.62+28)
  btn('start', W/2-92, H*.62+48, 184, 48, '开始清洁', () => startLevel(idx), 'orange')
  btn('levels', W/2-70, H*.62+108, 140, 38, '关卡选择', () => { page='levels' }, 'blue')
  bottomNav()
}
function levelsPage() {
  bg(); topBar(); ctx.fillStyle='#164A72'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('关卡选择', W/2, 118)
  const startY = 142, cols=2, gap=10, bw=(W-42)/2, bh=72
  levels.forEach((lv,i)=>{ const x=16+(i%cols)*(bw+gap), y=startY+Math.floor(i/cols)*(bh+8); if(y>H-92) return; card(x,y,bw,bh,.62); ctx.fillStyle=i<data.unlocked?'#164A72':'#94A5B2'; ctx.font='bold 13px sans-serif'; ctx.textAlign='left'; ctx.fillText('Lv.'+(i+1)+' '+lv[0],x+12,y+24); ctx.font='11px sans-serif'; ctx.fillText(lv[1],x+12,y+45); ctx.textAlign='right'; ctx.fillText(data.finished[i]?'✅':i<data.unlocked?'▶':'🔒',x+bw-12,y+45); buttons.push({id:'lv'+i,x,y,w:bw,h:bh,onTap:()=>{if(i<data.unlocked)startLevel(i)}}) })
  bottomNav()
}
function equipPage() {
  bg(); topBar(); ctx.fillStyle='#164A72'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('装备升级', W/2, 118)
  card(26, 150, W-52, 290, .7); const tier=gunTier()
  ctx.save(); ctx.translate(W/2,230); ctx.scale(1.25,1.25); ctx.fillStyle=gunColors[tier]; ctx.strokeStyle='#13527E'; ctx.lineWidth=4; roundRect(-70,-18,118,36,16); ctx.fill(); ctx.stroke(); roundRect(10,16,32,58,12); ctx.fill(); ctx.stroke(); ctx.fillStyle='#DDF8FF'; roundRect(44,-9,76,18,9); ctx.fill(); ctx.stroke(); ctx.restore()
  ctx.fillStyle='#164A72'; ctx.font='bold 19px sans-serif'; ctx.fillText(gunNames[tier]+' Lv.'+data.gunLv, W/2, 326)
  ctx.font='14px sans-serif'; ctx.fillText('喷射范围 '+Math.round(gunRange())+'  压力 '+Math.round(gunPower()*2200), W/2, 354)
  const cost=upgradeCost(); btn('upgrade', W/2-96, 382, 192, 46, data.coins>=cost?'升级 '+cost+'金币':'金币不足 '+cost, () => { if(data.coins>=cost&&data.gunLv<30){data.coins-=cost;data.gunLv++;save()} }, data.coins>=cost?'orange':'ghost')
  card(26, 462, W-52, 72, .58); ctx.fillStyle='#51748C'; ctx.font='13px sans-serif'; ctx.fillText('Lv5 强压 · Lv10 涡轮 · Lv20 激光 · Lv30 银河全屏', W/2, 505)
  bottomNav()
}
function tasksPage() {
  bg(); topBar(); ctx.fillStyle='#164A72'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('每日任务', W/2, 118)
  const tasks=[['完成3次清洁',data.daily.clean3||0,3,'金币500'],['清洁面积500㎡',data.daily.area500||0,500,'钻石10'],['观看1次广告',data.daily.ad||0,1,'金币1000']]
  tasks.forEach((t,i)=>{ const y=152+i*94; card(24,y,W-48,74,.68); ctx.fillStyle='#164A72'; ctx.font='bold 15px sans-serif'; ctx.textAlign='left'; ctx.fillText(t[0],42,y+28); ctx.font='12px sans-serif'; ctx.fillStyle='#607D91'; ctx.fillText('进度 '+Math.min(t[1],t[2])+'/'+t[2]+' · 奖励 '+t[3],42,y+52) })
  bottomNav()
}
function rankPage() { bg(); topBar(); ctx.fillStyle='#164A72'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('排行榜', W/2, 118); card(28,150,W-56,270,.7); const rows=[['今日清洁面积',Math.floor((data.daily.area500||0))+'㎡'],['历史清洁面积',fmt(data.totalArea)+'㎡'],['好友排名','开发中'],['清洁大师称号',Object.keys(data.finished).length+' / 20关']]; rows.forEach((r,i)=>{ctx.fillStyle=i===1?'#FF8B2E':'#164A72';ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.fillText((i+1)+'. '+r[0],54,195+i*52);ctx.textAlign='right';ctx.fillText(r[1],W-54,195+i*52)}); bottomNav() }
function shopPage() { bg(); topBar(); ctx.fillStyle='#164A72'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('商店', W/2, 118); card(26,150,W-52,300,.7); const items=['火焰喷枪','冰霜喷枪','雷电喷枪','彩虹喷枪','银河喷枪']; items.forEach((it,i)=>{const y=178+i*48;ctx.fillStyle=gunColors[i];ctx.beginPath();ctx.arc(54,y,15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#164A72';ctx.font='bold 14px sans-serif';ctx.textAlign='left';ctx.fillText(it,78,y+5);ctx.textAlign='right';ctx.fillText(i<data.skin+1?'已拥有':'皮肤券',W-48,y+5)}); bottomNav() }
function resultPage() { bg(); card(28, H*.2, W-56, 330, .78); ctx.fillStyle='#164A72'; ctx.font='bold 30px sans-serif'; ctx.textAlign='center'; ctx.fillText('清洁完成！', W/2, H*.2+58); drawObject(levels[result.level][2], W/2, H*.2+145, Math.min(W*.62,180)/330, 1); ctx.font='bold 17px sans-serif'; ctx.fillText('用时 '+result.sec+' 秒', W/2, H*.2+220); ctx.fillText('获得金币 +' + result.reward, W/2, H*.2+250); btn('double', W/2-105, H*.2+274, 100, 42, '双倍金币', () => { data.coins += result.reward; save(); page='home' }, 'orange'); btn('next', W/2+5, H*.2+274, 100, 42, result.level+1<levels.length?'下一关':'回首页', () => { if(result.level+1<levels.length) startLevel(result.level+1); else page='home' }, 'blue') }

function render() {
  frame++; resetButtons(); updateGame()
  if (page==='home') homePage(); else if(page==='levels') levelsPage(); else if(page==='equip') equipPage(); else if(page==='tasks') tasksPage(); else if(page==='rank') rankPage(); else if(page==='shop') shopPage(); else if(page==='game') renderGame(); else if(page==='result') resultPage()
}
function touchPos(t) { return { x: t.clientX, y: t.clientY } }
wx.onTouchStart(e => {
  const list = e.changedTouches || e.touches || []
  for (let i=0;i<list.length;i++) {
    const p = touchPos(list[i]); const b = hitButton(p.x, p.y)
    if (b) { b.onTap && b.onTap(); return }
    if (page === 'game') { spraying = true; sprayX = p.x; sprayY = p.y; touches[0] = list[i].identifier }
  }
})
wx.onTouchMove(e => { const list=e.changedTouches||e.touches||[]; for(let i=0;i<list.length;i++){ if(page==='game' && (touches[0]===undefined || touches[0]===list[i].identifier)){ const p=touchPos(list[i]); sprayX=p.x; sprayY=p.y } } })
wx.onTouchEnd(e => { if (page==='game') { spraying=false; touches=[] } })
wx.onTouchCancel(e => { spraying=false; touches=[] })
function loop() { render(); raf(loop) }
load(); resize(); try { wx.onWindowResize(resize) } catch(e) {}; loop()
