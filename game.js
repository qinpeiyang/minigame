/* 星球钩爪：单指物理攀爬小游戏
 * 拖动屏幕控制伸缩磁力钩方向和力度，钩头顶住地形会把角色反推上去；掉下去不死，但高度会丢。
 */
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

function info() { try { return wx.getSystemInfoSync() || {} } catch (e) { return {} } }
function nextFrame(cb) {
  const raf = (typeof requestAnimationFrame === 'function' && requestAnimationFrame)
    || (canvas && typeof canvas.requestAnimationFrame === 'function' && canvas.requestAnimationFrame.bind(canvas))
    || (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function' && wx.requestAnimationFrame.bind(wx))
  return raf ? raf(cb) : setTimeout(cb, 1000 / 60)
}
function rand(a, b) { return a + Math.random() * (b - a) }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function len(x, y) { return Math.sqrt(x * x + y * y) }
function dist(ax, ay, bx, by) { const x = ax - bx, y = ay - by; return Math.sqrt(x * x + y * y) }

let W = 375, H = 667, DPR = 1
let state = 'ready'
let frame = 0
let cameraY = 0
let bestHeight = 0
let lastHeight = 0
let dragging = false
let touchId = null
let target = { x: 0, y: 0 }
let particles = []
let clouds = []
let stars = []
let rocks = []
let tips = []

const world = { w: 900, h: 5200 }
const player = {
  x: 450, y: 4920, vx: 0, vy: 0, r: 22,
  hammerA: -Math.PI * .55, targetA: -Math.PI * .55, hammerLen: 94,
  grip: 0, mood: 0
}

function resize() {
  const s = info(); W = s.windowWidth || W; H = s.windowHeight || H; DPR = Math.max(1, s.pixelRatio || 1)
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR)
  if (canvas.style) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px' }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  if (!rocks.length) reset()
}

function groundY(x) {
  return world.h - 110 + Math.sin(x * .01) * 10
}

function addRock(x, y, w, h, rot = 0, kind = 'stone') {
  rocks.push({ x, y, w, h, rot, kind, seed: rand(0, 999) })
}

function buildLevel() {
  rocks = []
  // 地面和起点台阶
  addRock(450, world.h - 60, 980, 120, 0, 'ground')
  addRock(600, world.h - 190, 210, 42, -.08)
  addRock(310, world.h - 330, 160, 38, .1)
  addRock(545, world.h - 520, 165, 36, -.14)

  // 手工设计的“掘地求升”式攀爬路线：平台、尖石、烟囱、反向钩
  const plan = [
    [350, 4200, 170, 36, .2], [650, 4040, 180, 38, -.18], [420, 3860, 125, 34, .08],
    [700, 3650, 160, 42, .28], [505, 3440, 120, 35, -.25], [270, 3260, 150, 35, .12],
    [560, 3090, 260, 38, 0], [760, 2890, 130, 35, -.35], [520, 2700, 135, 35, .22],
    [260, 2520, 155, 38, -.12], [455, 2320, 120, 36, .3], [705, 2160, 180, 40, -.15],
    [555, 1950, 110, 34, .06], [330, 1760, 190, 38, .18], [655, 1580, 140, 36, -.3],
    [420, 1380, 130, 34, .1], [235, 1210, 120, 34, -.25], [525, 1060, 250, 42, .04],
    [760, 850, 130, 36, -.2], [480, 690, 160, 34, .25], [260, 520, 150, 34, -.1],
    [540, 350, 270, 45, 0], [450, 170, 230, 42, .08]
  ]
  plan.forEach(r => addRock(r[0], r[1], r[2], r[3], r[4]))

  // 左右墙上的凸起，防止无聊直线
  for (let y = 680; y < 4550; y += 360) {
    addRock(80 + rand(-10, 20), y, 120, 32, rand(-.25, .25), 'edge')
    addRock(820 + rand(-20, 10), y + 170, 130, 32, rand(-.25, .25), 'edge')
  }

  // 终点皇冠台
  addRock(450, 70, 360, 70, 0, 'finish')
}

function reset() {
  state = 'ready'; frame = 0; cameraY = world.h - H; lastHeight = 0
  player.x = 450; player.y = world.h - 210; player.vx = 0; player.vy = 0; player.hammerA = -Math.PI * .55; player.targetA = player.hammerA; player.grip = 0
  particles = []; clouds = []; stars = []; tips = []
  buildLevel()
  for (let i = 0; i < 14; i++) clouds.push({ x: rand(0, world.w), y: rand(120, world.h - 600), s: rand(.55, 1.4), v: rand(.08, .22) })
  for (let i = 0; i < 60; i++) stars.push({ x: rand(0, world.w), y: rand(0, 900), r: rand(.8, 2.2), a: rand(.25, .9) })
  addTip('拖动屏幕控制磁力钩', 450, world.h - 430)
  addTip('钩头卡住支点，把自己弹上去', 535, 3090)
  addTip('别急，慢慢找支点', 360, 1760)
  addTip('上面就是终点', 450, 390)
}

function addTip(text, x, y) { tips.push({ text, x, y }) }
function start() { if (state !== 'playing') state = 'playing' }
function heightNow() { return Math.max(0, Math.floor((world.h - 210 - player.y) / 10)) }
function hammerHead() { return { x: player.x + Math.cos(player.hammerA) * player.hammerLen, y: player.y + Math.sin(player.hammerA) * player.hammerLen } }
function screenX(x) { return x - (player.x - W / 2) }
function screenY(y) { return y - cameraY }

function pointRect(px, py, r) {
  const c = Math.cos(-r.rot), s = Math.sin(-r.rot)
  const dx = px - r.x, dy = py - r.y
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}
function collideCircleRock(cx, cy, cr, rock) {
  const p = pointRect(cx, cy, rock)
  const hw = rock.w / 2, hh = rock.h / 2
  const qx = clamp(p.x, -hw, hw), qy = clamp(p.y, -hh, hh)
  const dx = p.x - qx, dy = p.y - qy
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d >= cr) return null
  let nx, ny, depth
  if (d < .0001) {
    const left = Math.abs(p.x + hw), right = Math.abs(hw - p.x), top = Math.abs(p.y + hh), bottom = Math.abs(hh - p.y)
    const m = Math.min(left, right, top, bottom)
    if (m === left) { nx = -1; ny = 0; depth = cr + left }
    else if (m === right) { nx = 1; ny = 0; depth = cr + right }
    else if (m === top) { nx = 0; ny = -1; depth = cr + top }
    else { nx = 0; ny = 1; depth = cr + bottom }
  } else { nx = dx / d; ny = dy / d; depth = cr - d }
  const c = Math.cos(rock.rot), s = Math.sin(rock.rot)
  return { nx: nx * c - ny * s, ny: nx * s + ny * c, depth }
}

function burst(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: rand(-2, 2), vy: rand(-3, .2), r: rand(2, 4), life: rand(16, 32), max: 32, color })
}

function updateHammerTarget() {
  if (!dragging) return
  const wx = target.x + (player.x - W / 2), wy = target.y + cameraY
  const a = Math.atan2(wy - player.y, wx - player.x)
  player.targetA = a
}

function update() {
  frame++
  clouds.forEach(c => { c.x += c.v; if (c.x > world.w + 120) c.x = -120 })
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .13; p.life-- })
  particles = particles.filter(p => p.life > 0)
  if (state !== 'playing') { cameraY += (player.y - H * .58 - cameraY) * .08; return }

  updateHammerTarget()
  let da = player.targetA - player.hammerA
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2
  const oldA = player.hammerA
  player.hammerA += clamp(da, -.18, .18)
  const angular = player.hammerA - oldA

  player.vy += .42
  player.vx *= .992
  player.vy *= .995

  // 磁力钩头接触地形：越快速甩动，反推越强
  const hh = hammerHead()
  let hit = null
  for (const r of rocks) {
    const c = collideCircleRock(hh.x, hh.y, 13, r)
    if (c) { hit = { rock: r, ...c }; break }
  }
  if (hit) {
    const armX = hh.x - player.x, armY = hh.y - player.y
    const toward = (armX * hit.nx + armY * hit.ny) / Math.max(1, len(armX, armY))
    const swingPower = Math.min(8, Math.abs(angular) * 42)
    const pull = dragging ? 2.1 : .9
    player.vx -= hit.nx * (pull + swingPower * .33 + Math.max(0, toward) * 1.2)
    player.vy -= hit.ny * (pull + swingPower * .33 + Math.max(0, toward) * 1.2)
    // 把锤头推出碰撞，等价于把人往反方向挪
    player.x -= hit.nx * hit.depth * .82
    player.y -= hit.ny * hit.depth * .82
    player.grip = 8
    if (frame % 5 === 0) burst(hh.x, hh.y, '#E8D8B0', 3)
  } else if (player.grip > 0) player.grip--

  player.x += player.vx
  player.y += player.vy
  player.x = clamp(player.x, 35, world.w - 35)

  // 角色身体碰撞
  for (let iter = 0; iter < 2; iter++) {
    for (const r of rocks) {
      const c = collideCircleRock(player.x, player.y, player.r, r)
      if (!c) continue
      player.x += c.nx * c.depth
      player.y += c.ny * c.depth
      const vn = player.vx * c.nx + player.vy * c.ny
      if (vn < 0) { player.vx -= c.nx * vn * 1.25; player.vy -= c.ny * vn * 1.25 }
      if (c.ny < -.55) { player.vx *= .82; if (Math.abs(player.vy) > 5) burst(player.x, player.y + player.r, '#C8B08A', 8) }
    }
  }

  if (player.y > world.h - 130) { player.y = world.h - 130; player.vy = 0 }
  const h = heightNow(); lastHeight = Math.max(lastHeight, h); bestHeight = Math.max(bestHeight, h)
  if (player.y < 130 && player.x > 280 && player.x < 620) { state = 'win'; bestHeight = Math.max(bestHeight, 500); try { wx.setStorageSync('hammerBest', bestHeight) } catch (e) {} }
  try { if (frame % 120 === 0) wx.setStorageSync('hammerBest', bestHeight) } catch (e) {}
  cameraY += (player.y - H * .58 - cameraY) * .1
  cameraY = clamp(cameraY, 0, world.h - H)
}

function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath() }

function drawBg() {
  const t = clamp((world.h - cameraY) / world.h, 0, 1)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  if (cameraY < 1000) { g.addColorStop(0, '#111A48'); g.addColorStop(.5, '#355BA7'); g.addColorStop(1, '#8AC3FF') }
  else { g.addColorStop(0, '#7DD8FF'); g.addColorStop(.55, '#B9ECFF'); g.addColorStop(1, '#F9DCA4') }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  if (cameraY < 1200) {
    stars.forEach(s => { const x = screenX(s.x), y = screenY(s.y); if (x > -20 && x < W+20 && y > -20 && y < H+20) { ctx.globalAlpha = s.a; ctx.fillStyle = '#FFF7C6'; ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1 } })
  }
  // 太阳/月亮
  ctx.save(); ctx.globalAlpha = .9; ctx.fillStyle = cameraY < 1000 ? '#FFF4B0' : '#FFE285'; ctx.beginPath(); ctx.arc(W - 72, 82, 32, 0, Math.PI*2); ctx.fill(); ctx.restore()
  clouds.forEach(c => drawCloud(screenX(c.x), screenY(c.y), c.s))
}
function drawCloud(x, y, s) {
  if (x < -120 || x > W+120 || y < -80 || y > H+80) return
  ctx.save(); ctx.globalAlpha = .72; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x, y, 20*s, 0, Math.PI*2); ctx.arc(x+26*s, y-10*s, 27*s, 0, Math.PI*2); ctx.arc(x+58*s, y, 20*s, 0, Math.PI*2); ctx.fill(); ctx.restore()
}

function drawRock(r) {
  const x = screenX(r.x), y = screenY(r.y)
  if (x < -r.w - 80 || x > W + r.w + 80 || y < -r.h - 80 || y > H + r.h + 80) return
  ctx.save(); ctx.translate(x, y); ctx.rotate(r.rot)
  const grd = ctx.createLinearGradient(0, -r.h/2, 0, r.h/2)
  if (r.kind === 'finish') { grd.addColorStop(0, '#FFE68A'); grd.addColorStop(1, '#C9832D') }
  else if (r.kind === 'ground') { grd.addColorStop(0, '#B88355'); grd.addColorStop(1, '#6B452C') }
  else { grd.addColorStop(0, '#B8C2C8'); grd.addColorStop(.5, '#7D8C94'); grd.addColorStop(1, '#4E5961') }
  ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5
  ctx.fillStyle = grd; roundRect(-r.w/2, -r.h/2, r.w, r.h, Math.min(18, r.h/2)); ctx.fill()
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.15)'; roundRect(-r.w/2+12, -r.h/2+7, r.w*.45, 5, 3); ctx.fill()
  if (r.kind === 'finish') {
    ctx.fillStyle = '#FFF6B0'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('终点', 0, 8)
  }
  ctx.restore()
}

function drawPlayer() {
  const x = screenX(player.x), y = screenY(player.y)
  const hh = hammerHead(); const hx = screenX(hh.x), hy = screenY(hh.y)

  // 伸缩磁力钩：保留“物理支点攀爬”的类型，但视觉不照搬锤子/锅
  ctx.save()
  ctx.strokeStyle = 'rgba(12,38,76,.38)'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(hx, hy); ctx.stroke()
  const cable = ctx.createLinearGradient(x, y, hx, hy)
  cable.addColorStop(0, '#F7FAFF'); cable.addColorStop(.45, '#78D9FF'); cable.addColorStop(1, player.grip ? '#FFE36C' : '#37A8FF')
  ctx.strokeStyle = cable; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(hx, hy); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 3, y - 9); ctx.lineTo(hx + 3, hy - 3); ctx.stroke()

  // 钩头/磁吸盘
  ctx.translate(hx, hy); ctx.rotate(player.hammerA)
  const hookGlow = player.grip ? '#FFD84D' : '#69E6FF'
  ctx.shadowColor = hookGlow; ctx.shadowBlur = player.grip ? 18 : 8
  ctx.fillStyle = player.grip ? '#FFE36C' : '#8FEAFF'
  ctx.strokeStyle = '#135A96'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#1768A6'; ctx.fillRect(-4, -19, 8, 10)
  ctx.strokeStyle = player.grip ? '#FFF0A0' : '#DDFBFF'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 24, -1.05, 1.05); ctx.stroke()
  ctx.strokeStyle = '#135A96'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 24, -1.05, 1.05); ctx.stroke()
  ctx.restore()

  // 主角：小型星际维修胶囊/机器人，不再是锅和人
  ctx.save(); ctx.translate(x, y)
  // 喷气尾焰
  const thrust = Math.min(1, Math.abs(player.vx) * .04 + Math.max(0, player.vy) * .025)
  if (thrust > .08) {
    ctx.globalAlpha = .55 + thrust * .35
    ctx.fillStyle = '#FFB13B'; ctx.beginPath(); ctx.moveTo(-10, 30); ctx.quadraticCurveTo(0, 50 + thrust * 18, 10, 30); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#FFF19A'; ctx.beginPath(); ctx.moveTo(-5, 30); ctx.quadraticCurveTo(0, 42 + thrust * 12, 5, 30); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1
  }

  // 胶囊身体
  const body = ctx.createLinearGradient(-22, -30, 24, 34)
  body.addColorStop(0, '#FFFFFF'); body.addColorStop(.45, '#72D9FF'); body.addColorStop(1, '#2079D6')
  ctx.shadowColor = 'rgba(0,28,74,.28)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5
  ctx.fillStyle = body; ctx.strokeStyle = '#0B3F87'; ctx.lineWidth = 3
  roundRect(-24, -34, 48, 68, 23); ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0

  // 玻璃面罩
  const glass = ctx.createRadialGradient(-6, -13, 3, 0, -8, 24)
  glass.addColorStop(0, '#FFFFFF'); glass.addColorStop(.28, '#C8FAFF'); glass.addColorStop(1, '#1777D7')
  ctx.fillStyle = glass; ctx.strokeStyle = '#0B3F87'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(0, -10, 20, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#082B5F'; ctx.beginPath(); ctx.arc(-7, -10, 2.5, 0, Math.PI * 2); ctx.arc(7, -10, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#08356F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -4, 6, .2, Math.PI - .2); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-8, -17, 7, 3, -.3, 0, Math.PI * 2); ctx.fill()

  // 机械臂连接点
  ctx.fillStyle = '#FFE36C'; ctx.strokeStyle = '#0B3F87'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(Math.cos(player.hammerA) * 19, Math.sin(player.hammerA) * 19 - 3, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

  // 两侧小推进器
  ctx.fillStyle = '#1556A0'; ctx.strokeStyle = '#0B3F87'; ctx.lineWidth = 2
  roundRect(-34, 2, 14, 25, 7); ctx.fill(); ctx.stroke()
  roundRect(20, 2, 14, 25, 7); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#9AEFFF'; ctx.beginPath(); ctx.arc(-27, 16, 3, 0, Math.PI * 2); ctx.arc(27, 16, 3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}


function drawUI() {
  const h = heightNow()
  ctx.save()
  roundRect(12, 12, 150, 72, 16); ctx.fillStyle = 'rgba(19,39,76,.68)'; ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('高度 ' + h + 'm', 26, 40)
  ctx.font = '13px sans-serif'; ctx.fillText('最高 ' + bestHeight + 'm', 26, 64)
  const barH = Math.max(50, H - 150); ctx.fillStyle = 'rgba(255,255,255,.2)'; roundRect(W - 22, 80, 8, barH, 4); ctx.fill()
  ctx.fillStyle = '#FFD86B'; roundRect(W - 22, 80 + barH * (1 - clamp(h / 500, 0, 1)), 8, barH * clamp(h / 500, 0, 1), 4); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('500m', W - 32, 72)

  if (dragging && state === 'playing') {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(W/2, screenY(player.y)); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(target.x, target.y, 26, 0, Math.PI*2); ctx.fill()
  }
  if (state === 'ready') modal('星球钩爪', '拖动控制磁力钩，借支点向上攀爬\n掉下去也别急，重新找节奏！', '点击开始')
  if (state === 'win') modal('抵达信标！', '最高高度 ' + bestHeight + 'm\n钩爪操作拉满！', '再来一局')
  ctx.restore()
}
function modal(title, body, btn) {
  const w = Math.min(330, W - 34), h = 220, x = (W - w)/2, y = H*.26
  ctx.fillStyle = 'rgba(18,32,65,.86)'; roundRect(x, y, w, h, 24); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.textAlign = 'center'; ctx.fillStyle = '#FFE08A'; ctx.font = 'bold 32px sans-serif'; ctx.fillText(title, W/2, y+55)
  ctx.fillStyle = '#F2FAFF'; ctx.font = '15px sans-serif'; body.split('\n').forEach((line, i) => ctx.fillText(line, W/2, y+100+i*26))
  ctx.fillStyle = '#FF8B36'; roundRect(W/2-78, y+160, 156, 38, 19); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(btn, W/2, y+185)
}

function drawTips() {
  tips.forEach(t => { const x = screenX(t.x), y = screenY(t.y); if (x < -120 || x > W+120 || y < -30 || y > H+30) return; ctx.save(); ctx.globalAlpha = .82; ctx.fillStyle = 'rgba(0,0,0,.32)'; roundRect(x-86, y-18, 172, 30, 15); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t.text, x, y+2); ctx.restore() })
}

function render() {
  drawBg()
  rocks.forEach(drawRock)
  drawTips()
  particles.forEach(p => { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(screenX(p.x), screenY(p.y), p.r, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1 })
  drawPlayer()
  drawUI()
}

function pos(t) { return { x: t.clientX, y: t.clientY } }
wx.onTouchStart(e => {
  const t = (e.changedTouches || e.touches || [])[0]
  if (!t) return
  if (state === 'ready' || state === 'win') { reset(); start(); return }
  start(); dragging = true; touchId = t.identifier; target = pos(t)
})
wx.onTouchMove(e => {
  const list = e.changedTouches || e.touches || []
  for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) target = pos(list[i])
})
wx.onTouchEnd(e => { const list = e.changedTouches || []; for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) { dragging = false; touchId = null } })
wx.onTouchCancel(() => { dragging = false; touchId = null })

function loop() { update(); render(); nextFrame(loop) }
try { bestHeight = Number(wx.getStorageSync('hammerBest') || 0) } catch (e) { bestHeight = 0 }
resize(); try { wx.onWindowResize(resize) } catch (e) {}
loop()
