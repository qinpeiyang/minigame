/* 鱼吃鱼：进化生存大作战 - 微信小游戏
 * 拖动左下摇杆移动，按右下按钮加速；吃小鱼成长，躲开大鱼和河豚。
 */
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

function sysInfo() {
  try { return wx.getSystemInfoSync() || {} } catch (e) { return {} }
}
function nextFrame(cb) {
  const raf = (typeof requestAnimationFrame === 'function' && requestAnimationFrame)
    || (canvas && typeof canvas.requestAnimationFrame === 'function' && canvas.requestAnimationFrame.bind(canvas))
    || (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function' && wx.requestAnimationFrame.bind(wx))
  if (raf) return raf(cb)
  return setTimeout(cb, 1000 / 60)
}

let W = 0, H = 0, DPR = 1
let state = 'ready'
let frame = 0
let score = 0
let best = 0
let level = 1
let exp = 0
let expNeed = 90
let timeLeft = 180
let lastTick = Date.now()
let world = { w: 2600, h: 1800 }
let camera = { x: 0, y: 0 }
let fishes = []
let foods = []
let bubbles = []
let particles = []
let props = []
let touchMoveId = null
let touchBoostId = null
let joystick = { active: false, x: 82, y: 0, dx: 0, dy: 0, mag: 0 }
let boost = false
let invincible = 0
let slowTimer = 0
let doubleTimer = 0
let magnetTimer = 0
let propCooldown = 0

const colors = {
  ink: '#DDF6FF', gold: '#FFD75A', orange: '#FF8B2D', blue: '#1FA6FF', panel: 'rgba(8,45,103,.72)',
  panel2: 'rgba(21,93,166,.72)', red: '#FF5C65', green: '#64F58A', purple: '#9D7CFF'
}
const evoNames = ['小丑鱼', '热带鱼', '河豚', '魔鬼鱼', '鲨鱼', '远古巨鲨']
const evoColors = ['#FF8B2D', '#30D5FF', '#F0D96B', '#9D7CFF', '#5B87A8', '#3E556B']

const player = {
  x: 0, y: 0, r: 24, vx: 0, vy: 0, face: 1, hp: 3, maxHp: 3, name: '玩家肥鲨', blink: 0
}

function rand(a, b) { return a + Math.random() * (b - a) }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function dist(a, b, c, d) { const x = a - c, y = b - d; return Math.sqrt(x * x + y * y) }
function worldToScreenX(x) { return x - camera.x }
function worldToScreenY(y) { return y - camera.y }

function resize() {
  const info = sysInfo()
  DPR = Math.max(1, info.pixelRatio || 1)
  W = info.windowWidth || 375
  H = info.windowHeight || 667
  canvas.width = Math.floor(W * DPR)
  canvas.height = Math.floor(H * DPR)
  if (canvas.style) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px' }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  joystick.y = H - 86
  if (!player.x) reset()
}

function reset() {
  state = 'ready'
  frame = 0; score = 0; level = 1; exp = 0; expNeed = 90; timeLeft = 180
  lastTick = Date.now(); invincible = 90; slowTimer = 0; doubleTimer = 0; magnetTimer = 0; propCooldown = 0
  player.x = world.w * 0.5; player.y = world.h * 0.5; player.r = 24; player.vx = 0; player.vy = 0; player.hp = 3; player.maxHp = 3; player.face = 1
  fishes = []; foods = []; bubbles = []; particles = []; props = []
  joystick.active = false; joystick.dx = 0; joystick.dy = 0; joystick.mag = 0; boost = false
  for (let i = 0; i < 130; i++) spawnFood()
  for (let i = 0; i < 42; i++) spawnFish()
  for (let i = 0; i < 70; i++) bubbles.push({ x: rand(0, world.w), y: rand(0, world.h), r: rand(2, 8), v: rand(.25, 1.2), a: rand(.18, .55) })
  for (let i = 0; i < 6; i++) spawnProp()
  updateCamera(true)
}

function startGame() {
  state = 'playing'
  lastTick = Date.now()
  invincible = 100
}

function spawnFood() {
  foods.push({ x: rand(40, world.w - 40), y: rand(80, world.h - 80), r: rand(4, 8), v: rand(0, Math.PI * 2), color: Math.random() < .5 ? '#FFE66D' : '#8EF7FF' })
}
function spawnFish() {
  const tierRoll = Math.random()
  let tier = tierRoll < .32 ? Math.max(1, level - 1) : tierRoll < .74 ? level : Math.min(6, level + Math.ceil(rand(0, 2.2)))
  tier = clamp(tier, 1, 6)
  const r = 15 + tier * 8 + rand(-3, 6)
  const side = Math.floor(rand(0, 4))
  const f = {
    x: side === 0 ? -80 : side === 1 ? world.w + 80 : rand(0, world.w),
    y: side === 2 ? -80 : side === 3 ? world.h + 80 : rand(0, world.h),
    r, tier, face: Math.random() < .5 ? -1 : 1, turn: rand(0, 100), speed: rand(.6, 1.25) + tier * .08,
    vx: rand(-1, 1), vy: rand(-.45, .45), angry: tier > level + 1, hit: 0
  }
  fishes.push(f)
}
function spawnProp() {
  const types = ['bolt', 'shield', 'magnet', 'double', 'ghost']
  props.push({ x: rand(80, world.w - 80), y: rand(80, world.h - 80), r: 17, type: types[Math.floor(rand(0, types.length))], spin: rand(0, Math.PI * 2) })
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: rand(-3, 3), vy: rand(-3, 3), r: rand(2, 5), life: rand(18, 38), max: 38, color })
}

function updateCamera(force) {
  const tx = clamp(player.x - W / 2, 0, world.w - W)
  const ty = clamp(player.y - H / 2, 0, world.h - H)
  if (force) { camera.x = tx; camera.y = ty } else { camera.x += (tx - camera.x) * .1; camera.y += (ty - camera.y) * .1 }
}

function evolve() {
  while (exp >= expNeed && level < 6) {
    exp -= expNeed
    level++
    expNeed = Math.floor(expNeed * 1.45 + 60)
    player.r += 8
    player.maxHp = Math.min(6, player.maxHp + 1)
    player.hp = player.maxHp
    invincible = 150
    score += 50 * level
    burst(player.x, player.y, colors.gold, 34)
    try { wx.vibrateShort({ type: 'medium' }) } catch (e) {}
  }
}

function eatReward(base) {
  const mul = doubleTimer > 0 ? 2 : 1
  score += base * mul
  exp += base * 3 * mul
}

function hitPlayer(damage, fromX, fromY) {
  if (invincible > 0) return
  player.hp -= damage
  invincible = 95
  const ang = Math.atan2(player.y - fromY, player.x - fromX)
  player.vx += Math.cos(ang) * 7
  player.vy += Math.sin(ang) * 7
  burst(player.x, player.y, colors.red, 22)
  try { wx.vibrateShort({ type: 'heavy' }) } catch (e) {}
  if (player.hp <= 0) gameOver()
}

function gameOver() {
  state = 'gameover'
  best = Math.max(best, score)
  try { wx.setStorageSync('fishBestScore', best) } catch (e) {}
}

function useProp(type) {
  if (type === 'bolt') slowTimer = 0, player.vx *= 1.5, player.vy *= 1.5, score += 20
  if (type === 'shield') invincible = 520
  if (type === 'magnet') magnetTimer = 520
  if (type === 'double') doubleTimer = 600
  if (type === 'ghost') slowTimer = 420
  burst(player.x, player.y, '#B8F7FF', 20)
}

function update() {
  frame++
  const now = Date.now()
  const dt = Math.min(60, now - lastTick)
  lastTick = now
  if (state === 'playing') timeLeft -= dt / 1000
  if (state === 'playing' && timeLeft <= 0) gameOver()
  if (invincible > 0) invincible--
  if (slowTimer > 0) slowTimer--
  if (doubleTimer > 0) doubleTimer--
  if (magnetTimer > 0) magnetTimer--
  if (propCooldown > 0) propCooldown--

  bubbles.forEach(b => { b.y -= b.v; b.x += Math.sin((frame + b.y) * .01) * .12; if (b.y < -20) { b.y = world.h + 20; b.x = rand(0, world.w) } })
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96; p.life-- })
  particles = particles.filter(p => p.life > 0)

  if (state !== 'playing') { updateCamera(false); return }

  const speed = (boost ? 5.2 : 3.1) + level * .18
  const drain = boost && joystick.mag > .1 ? .18 : 0
  if (drain && exp > 0) exp = Math.max(0, exp - drain)
  player.vx += joystick.dx * speed * .18
  player.vy += joystick.dy * speed * .18
  player.vx *= .88
  player.vy *= .88
  player.x += player.vx
  player.y += player.vy
  player.x = clamp(player.x, player.r, world.w - player.r)
  player.y = clamp(player.y, player.r, world.h - player.r)
  if (Math.abs(player.vx) > .15) player.face = player.vx >= 0 ? 1 : -1

  if (magnetTimer > 0) {
    foods.forEach(o => {
      const d = dist(player.x, player.y, o.x, o.y)
      if (d < 210) { o.x += (player.x - o.x) / Math.max(16, d) * 5; o.y += (player.y - o.y) / Math.max(16, d) * 5 }
    })
  }

  for (let i = foods.length - 1; i >= 0; i--) {
    const o = foods[i]
    o.x += Math.cos(o.v + frame * .01) * .12
    o.y += Math.sin(o.v + frame * .013) * .1
    if (dist(player.x, player.y, o.x, o.y) < player.r + o.r) {
      foods.splice(i, 1); eatReward(2); burst(o.x, o.y, o.color, 5); spawnFood()
    }
  }

  fishes.forEach(f => {
    f.turn--
    if (f.turn <= 0) {
      f.turn = rand(45, 135)
      const d = dist(player.x, player.y, f.x, f.y)
      if (d < 360 && f.tier > level) {
        f.vx = (player.x - f.x) / d * f.speed * 2.2
        f.vy = (player.y - f.y) / d * f.speed * 2.2
      } else if (d < 280 && f.tier < level) {
        f.vx = (f.x - player.x) / d * f.speed * 2.0
        f.vy = (f.y - player.y) / d * f.speed * 2.0
      } else {
        f.vx += rand(-1, 1); f.vy += rand(-.75, .75)
      }
    }
    const slow = slowTimer > 0 && f.tier >= level ? .42 : 1
    const len = Math.max(.1, Math.sqrt(f.vx * f.vx + f.vy * f.vy))
    const max = f.speed * slow
    f.vx = f.vx / len * max; f.vy = f.vy / len * max
    f.x += f.vx; f.y += f.vy
    if (f.x < -100) f.x = world.w + 80; if (f.x > world.w + 100) f.x = -80
    if (f.y < 30 || f.y > world.h - 30) f.vy *= -1
    if (Math.abs(f.vx) > .05) f.face = f.vx > 0 ? 1 : -1
    if (f.hit > 0) f.hit--
  })

  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i]
    const d = dist(player.x, player.y, f.x, f.y)
    if (d < player.r + f.r * .72) {
      if (level >= f.tier || player.r > f.r * 1.08) {
        fishes.splice(i, 1)
        eatReward(10 + f.tier * 8)
        burst(f.x, f.y, evoColors[f.tier - 1], 18)
        spawnFish()
      } else {
        hitPlayer(f.tier >= 3 ? 2 : 1, f.x, f.y)
      }
    }
  }

  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i]
    p.spin += .04
    if (dist(player.x, player.y, p.x, p.y) < player.r + p.r) {
      useProp(p.type); props.splice(i, 1); propCooldown = 120
    }
  }
  if (props.length < 6 && propCooldown <= 0) { spawnProp(); propCooldown = 180 }

  evolve()
  updateCamera(false)
}

function bg() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#073D89'); g.addColorStop(.45, '#086DB3'); g.addColorStop(1, '#02295C')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = .16; ctx.strokeStyle = '#BDF4FF'; ctx.lineWidth = 1
  for (let y = -((camera.y * .22) % 44); y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * .25, y + 14, W * .7, y - 14, W, y + 5); ctx.stroke() }
  ctx.restore()
  drawCorals()
}

function drawCorals() {
  const baseY = world.h - camera.y - 18
  if (baseY < -120 || baseY > H + 80) return
  for (let i = 0; i < 18; i++) {
    const x = (i * 157 - camera.x * .7) % (W + 180) - 90
    const h = 24 + (i % 5) * 12
    ctx.fillStyle = i % 3 === 0 ? '#FF786B' : i % 3 === 1 ? '#33CCAA' : '#FFB84A'
    ctx.beginPath(); ctx.ellipse(x, baseY, 16, h, 0, Math.PI, 0); ctx.fill()
  }
}

function fishShape(x, y, r, face, color, tier, label) {
  const invBlink = label === player.name && invincible > 0 && Math.floor(frame / 6) % 2 === 0
  const swim = Math.sin(frame * .12 + x * .03) * r * .06
  ctx.save()
  ctx.translate(x, y + swim)
  ctx.scale(face, 1)
  ctx.globalAlpha = invBlink ? .55 : 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  function fin(px, py, points, fill) {
    ctx.fillStyle = fill
    ctx.strokeStyle = 'rgba(5,27,60,.36)'
    ctx.lineWidth = Math.max(1.2, r * .055)
    ctx.beginPath()
    ctx.moveTo(px + points[0][0] * r, py + points[0][1] * r)
    for (let i = 1; i < points.length; i++) ctx.lineTo(px + points[i][0] * r, py + points[i][1] * r)
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  function bodyGradient(c1, c2, c3) {
    const g = ctx.createLinearGradient(-r * 1.2, -r, r * 1.45, r)
    g.addColorStop(0, c1); g.addColorStop(.55, c2); g.addColorStop(1, c3)
    return g
  }
  function eye(ex, ey, er) {
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#082554'; ctx.beginPath(); ctx.arc(ex + er * .28, ey - er * .05, er * .42, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ex + er * .43, ey - er * .28, er * .16, 0, Math.PI * 2); ctx.fill()
  }
  function shine() {
    ctx.fillStyle = 'rgba(255,255,255,.28)'
    ctx.beginPath(); ctx.ellipse(-r * .22, -r * .34, r * .7, r * .18, -.22, 0, Math.PI * 2); ctx.fill()
  }

  if (tier === 3) {
    // 河豚：参考图那种圆滚滚卡通鱼，刺和嘴都更明显
    ctx.fillStyle = bodyGradient('#FFF18A', '#E6C55C', '#B49438')
    ctx.strokeStyle = 'rgba(40,45,35,.45)'; ctx.lineWidth = Math.max(2, r * .08)
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.08, r * .96, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    fin(-r * .95, 0, [[0,0],[-.72,-.45],[-.52,0],[-.72,.45]], '#D7B144')
    fin(-r * .18, -r * .7, [[0,0],[-.38,-.46],[.28,-.22]], '#F5D264')
    ctx.fillStyle = '#FFF6B3'
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2
      const px = Math.cos(a) * r * .78, py = Math.sin(a) * r * .68
      ctx.beginPath(); ctx.arc(px, py, r * .055, 0, Math.PI * 2); ctx.fill()
    }
    eye(r * .42, -r * .22, r * .16)
    ctx.strokeStyle = '#6A4B22'; ctx.lineWidth = Math.max(1.5, r * .045)
    ctx.beginPath(); ctx.arc(r * .72, r * .14, r * .16, .15, Math.PI * 1.85); ctx.stroke()
  } else if (tier === 4) {
    // 魔鬼鱼：扁平的大翼，比普通椭圆好看很多
    ctx.fillStyle = bodyGradient('#C8B8FF', '#8266E8', '#4E399B')
    ctx.strokeStyle = 'rgba(22,20,70,.45)'; ctx.lineWidth = Math.max(2, r * .075)
    ctx.beginPath()
    ctx.moveTo(r * 1.35, 0)
    ctx.bezierCurveTo(r * .6, -r * 1.0, -r * .75, -r * .9, -r * 1.45, -r * .1)
    ctx.bezierCurveTo(-r * .52, -r * .25, -r * .52, r * .25, -r * 1.45, r * .1)
    ctx.bezierCurveTo(-r * .75, r * .9, r * .6, r * 1.0, r * 1.35, 0)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    shine(); eye(r * .46, -r * .18, r * .12)
    ctx.strokeStyle = 'rgba(235,245,255,.55)'; ctx.lineWidth = Math.max(1, r * .035)
    ctx.beginPath(); ctx.moveTo(-r * .2, -r * .16); ctx.quadraticCurveTo(r * .3, 0, -r * .2, r * .16); ctx.stroke()
  } else if (tier >= 5) {
    // 鲨鱼/巨鲨：尖头、背鳍、牙齿和鳃线
    const dark = tier === 6 ? '#2F4358' : '#5B87A8'
    const mid = tier === 6 ? '#55718A' : '#7FB2D0'
    ctx.fillStyle = bodyGradient(mid, dark, '#20364D')
    ctx.strokeStyle = 'rgba(3,18,38,.55)'; ctx.lineWidth = Math.max(2, r * .075)
    ctx.beginPath()
    ctx.moveTo(r * 1.7, 0)
    ctx.bezierCurveTo(r * 1.18, -r * .58, r * .18, -r * .82, -r * 1.08, -r * .6)
    ctx.bezierCurveTo(-r * 1.55, -r * .42, -r * 1.55, r * .42, -r * 1.08, r * .6)
    ctx.bezierCurveTo(r * .18, r * .82, r * 1.18, r * .58, r * 1.7, 0)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    fin(-r * 1.05, 0, [[0,0],[-.78,-.66],[-.58,0],[-.78,.66]], '#41647D')
    fin(-r * .08, -r * .68, [[0,0],[-.28,-.78],[.44,-.2]], '#41647D')
    fin(r * .1, r * .55, [[0,0],[-.18,.48],[.48,.14]], '#41647D')
    ctx.fillStyle = 'rgba(255,255,255,.68)'
    ctx.beginPath(); ctx.ellipse(r * .56, r * .28, r * .62, r * .22, -.08, 0, Math.PI * 2); ctx.fill()
    eye(r * .75, -r * .22, r * .13)
    ctx.strokeStyle = '#21384D'; ctx.lineWidth = Math.max(1, r * .035)
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(r * .34 - i * r * .12, -r * .08); ctx.lineTo(r * .25 - i * r * .12, r * .15); ctx.stroke() }
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r * .94 + i * r * .08, r * .16); ctx.lineTo(r * 1.0 + i * r * .08, r * .31); ctx.lineTo(r * 1.08 + i * r * .08, r * .15); ctx.fill() }
  } else {
    // 小丑鱼/热带鱼：大色块、白边、条纹，贴近参考图的Q版风格
    const palette = tier === 1
      ? ['#FF9B2F', '#FF6E1F', '#D74E18', '#FFFFFF']
      : ['#39E4FF', '#208DFF', '#1A56C8', '#FFE66D']
    fin(-r * 1.04, 0, [[0,0],[-.72,-.55],[-.55,0],[-.72,.55]], palette[2])
    fin(-r * .16, -r * .7, [[0,0],[-.32,-.48],[.36,-.2]], palette[2])
    fin(-r * .03, r * .66, [[0,0],[-.18,.4],[.45,.12]], palette[2])
    ctx.fillStyle = bodyGradient(palette[0], palette[1], palette[2])
    ctx.strokeStyle = 'rgba(5,27,60,.45)'; ctx.lineWidth = Math.max(2, r * .08)
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.38, r * .82, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (tier === 1) {
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = r * .24
      ;[-.48, .16].forEach(px => { ctx.beginPath(); ctx.moveTo(px * r, -r * .68); ctx.quadraticCurveTo((px + .08) * r, 0, px * r, r * .68); ctx.stroke() })
      ctx.strokeStyle = 'rgba(8,29,55,.5)'; ctx.lineWidth = r * .045
      ;[-.62, -.34, .02, .28].forEach(px => { ctx.beginPath(); ctx.moveTo(px * r, -r * .67); ctx.quadraticCurveTo((px + .08) * r, 0, px * r, r * .67); ctx.stroke() })
    } else {
      ctx.fillStyle = palette[3]
      ctx.beginPath(); ctx.moveTo(-r * .05, -r * .75); ctx.lineTo(r * .32, 0); ctx.lineTo(-r * .05, r * .75); ctx.lineTo(-r * .42, 0); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = r * .055
      for (let i = -2; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * .28, -r * .55); ctx.lineTo(i * r * .28 + r * .18, r * .55); ctx.stroke() }
    }
    shine(); eye(r * .72, -r * .2, r * .18)
    ctx.fillStyle = 'rgba(7,31,68,.22)'; ctx.beginPath(); ctx.ellipse(-r * .15, r * .1, r * .17, r * .48, .15, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  if (label) {
    ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#E9FCFF'; ctx.strokeStyle = 'rgba(4,20,50,.8)'; ctx.lineWidth = 3
    ctx.strokeText(label, x, y - r - 16); ctx.fillText(label, x, y - r - 16); ctx.restore()
  }
}

function drawProp(p) {
  const x = worldToScreenX(p.x), y = worldToScreenY(p.y)
  if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.spin)
  const map = { bolt: ['⚡', '#FFD84D'], shield: ['🛡️', '#7EE7FF'], magnet: ['🧲', '#FF6B6B'], double: ['2x', '#FFD37B'], ghost: ['👻', '#C8BAFF'] }
  const m = map[p.type]
  ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = m[1]; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill()
  ctx.rotate(-p.spin); ctx.fillStyle = '#07346E'; ctx.font = p.type === 'double' ? 'bold 13px sans-serif' : '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m[0], 0, 1)
  ctx.restore()
}

function render() {
  bg()
  bubbles.forEach(b => { const x = worldToScreenX(b.x), y = worldToScreenY(b.y); if (x > -20 && x < W + 20 && y > -20 && y < H + 20) { ctx.globalAlpha = b.a; ctx.strokeStyle = '#C9F8FF'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1 } })
  foods.forEach(o => { const x = worldToScreenX(o.x), y = worldToScreenY(o.y); if (x > -20 && x < W + 20 && y > -20 && y < H + 20) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(x, y, o.r, 0, Math.PI * 2); ctx.fill() } })
  props.forEach(drawProp)
  fishes.forEach(f => { const x = worldToScreenX(f.x), y = worldToScreenY(f.y); if (x > -120 && x < W + 120 && y > -80 && y < H + 80) fishShape(x, y, f.r, f.face, evoColors[f.tier - 1], f.tier, f.tier > level ? evoNames[f.tier - 1] : '') })
  particles.forEach(p => { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(worldToScreenX(p.x), worldToScreenY(p.y), p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 })
  fishShape(worldToScreenX(player.x), worldToScreenY(player.y), player.r, player.face, evoColors[level - 1], level, player.name)
  drawUI()
}

function pill(x, y, w, h, color) { ctx.fillStyle = color; roundRect(x, y, w, h, h / 2); ctx.fill() }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() }

function drawUI() {
  ctx.save()
  roundRect(12, 12, 152, 82, 16); ctx.fillStyle = colors.panel; ctx.fill()
  ctx.fillStyle = '#E9FCFF'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('当前得分：' + score, 24, 38)
  ctx.font = '13px sans-serif'; ctx.fillText('等级：' + level + '  ' + evoNames[level - 1], 24, 60); ctx.fillText('最高：' + best, 24, 80)
  roundRect(W - 104, 16, 88, 38, 18); ctx.fillStyle = colors.panel; ctx.fill(); ctx.fillStyle = '#E9FCFF'; ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('⏱ ' + Math.max(0, Math.ceil(timeLeft)), W - 60, 40)
  ctx.textAlign = 'left'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#BEEFFF'; ctx.fillText('成长', 20, 116)
  pill(62, 104, 135, 14, 'rgba(255,255,255,.18)'); pill(62, 104, 135 * clamp(exp / expNeed, 0, 1), 14, colors.green)
  for (let i = 0; i < player.maxHp; i++) { ctx.fillStyle = i < player.hp ? colors.red : 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(24 + i * 18, 138, 6, 0, Math.PI * 2); ctx.fill() }
  if (doubleTimer > 0 || magnetTimer > 0 || slowTimer > 0 || invincible > 120) {
    let x = 18, y = 154; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'
    function tag(t, c) { roundRect(x, y, 54, 22, 11); ctx.fillStyle = c; ctx.fill(); ctx.fillStyle = '#062B60'; ctx.fillText(t, x + 10, y + 15); x += 60 }
    if (doubleTimer > 0) tag('双倍', '#FFD76A'); if (magnetTimer > 0) tag('磁铁', '#83F7FF'); if (slowTimer > 0) tag('隐身', '#C8BAFF'); if (invincible > 120) tag('护盾', '#8EF7A0')
  }
  drawControls()
  if (state === 'ready') modal('鱼吃鱼', '进化生存大作战', '拖动摇杆吃小鱼，避开大鱼和河豚\n收集道具，进化成远古巨鲨！', '点击开始')
  if (state === 'gameover') modal('挑战结束', '得分 ' + score + ' · 最高 ' + best, '继续吞噬进化，冲击排行榜第一', '点一下重开')
  ctx.restore()
}

function drawControls() {
  const bx = joystick.x, by = joystick.y
  ctx.save()
  ctx.globalAlpha = joystick.active ? .78 : .34
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(bx, by, 48, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(210,250,255,.55)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.52)'; ctx.beginPath(); ctx.arc(bx + joystick.dx * 27, by + joystick.dy * 27, 22, 0, Math.PI * 2); ctx.fill()
  if (!joystick.active) { ctx.fillStyle = 'rgba(235,252,255,.8)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('全屏拖动控制方向', bx, by + 66) }
  ctx.globalAlpha = 1
  const ax = W - 72, ay = H - 80
  const rg = ctx.createRadialGradient(ax - 12, ay - 14, 4, ax, ay, 46)
  rg.addColorStop(0, boost ? '#FFF3A2' : '#FFD08A'); rg.addColorStop(1, boost ? '#FFB82E' : 'rgba(255,139,45,.9)')
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ax, ay, 42, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = '#08346D'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('加速', ax, ay + 5)
  ctx.restore()
}

function modal(title, sub, body, btn) {
  const w = Math.min(330, W - 36), h = 245, x = (W - w) / 2, y = H * .22
  ctx.save(); ctx.fillStyle = 'rgba(5,35,86,.88)'; roundRect(x, y, w, h, 22); ctx.fill(); ctx.strokeStyle = 'rgba(157,226,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.textAlign = 'center'; ctx.fillStyle = colors.gold; ctx.font = 'bold 34px sans-serif'; ctx.fillText(title, W / 2, y + 50)
  ctx.fillStyle = '#BFF4FF'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(sub, W / 2, y + 80)
  ctx.fillStyle = '#E9FCFF'; ctx.font = '15px sans-serif'; body.split('\n').forEach((line, i) => ctx.fillText(line, W / 2, y + 122 + i * 25))
  ctx.fillStyle = colors.orange; roundRect(W / 2 - 82, y + 186, 164, 38, 19); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(btn, W / 2, y + 211)
  ctx.restore()
}

function touchPos(t) { return { x: t.clientX, y: t.clientY } }
function inBoostButton(p) { return dist(p.x, p.y, W - 72, H - 80) < 54 }
function resetJoystickBase() { joystick.x = 82; joystick.y = H - 86 }
function updateJoystick(x, y) {
  const dx = x - joystick.x, dy = y - joystick.y
  const len = Math.sqrt(dx * dx + dy * dy)
  joystick.mag = clamp(len / 48, 0, 1)
  joystick.dx = len > 0 ? dx / len * joystick.mag : 0
  joystick.dy = len > 0 ? dy / len * joystick.mag : 0
}
function startMoveTouch(t) {
  const p = touchPos(t)
  touchMoveId = t.identifier
  joystick.active = true
  // 动态摇杆：手指按在屏幕任意位置，那里就是方向控制起点。
  joystick.x = clamp(p.x, 52, W - 52)
  joystick.y = clamp(p.y, 86, H - 52)
  joystick.dx = 0; joystick.dy = 0; joystick.mag = 0
}

wx.onTouchStart(e => {
  if (state !== 'playing') { reset(); startGame(); return }
  const list = e.changedTouches || e.touches || []
  for (let i = 0; i < list.length; i++) {
    const t = list[i], p = touchPos(t)
    if (inBoostButton(p)) { touchBoostId = t.identifier; boost = true; continue }
    if (touchMoveId === null) startMoveTouch(t)
  }
})
wx.onTouchMove(e => {
  const list = e.changedTouches || e.touches || []
  for (let i = 0; i < list.length; i++) { const t = list[i]; if (t.identifier === touchMoveId) { const p = touchPos(t); updateJoystick(p.x, p.y) } }
})
wx.onTouchEnd(e => {
  const list = e.changedTouches || []
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (t.identifier === touchMoveId) { touchMoveId = null; joystick.active = false; joystick.dx = 0; joystick.dy = 0; joystick.mag = 0; resetJoystickBase() }
    if (t.identifier === touchBoostId) { touchBoostId = null; boost = false }
  }
})
wx.onTouchCancel(e => { touchMoveId = null; touchBoostId = null; boost = false; joystick.active = false; joystick.dx = 0; joystick.dy = 0; joystick.mag = 0; resetJoystickBase() })

function loop() { update(); render(); nextFrame(loop) }
try { best = Number(wx.getStorageSync('fishBestScore') || 0) } catch (e) { best = 0 }
resize()
try { wx.onWindowResize(resize) } catch (e) {}
loop()
