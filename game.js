/* 元气小鸡跳跳 - 微信小游戏
 * 玩法：拖动/按住蓄力，松手跳跃；连续踩平台得分，收集玉米加分。
 */
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

const DPR = Math.max(1, wx.getSystemInfoSync().pixelRatio || 1)
let W = 0
let H = 0
let state = 'ready'
let score = 0
let best = 0
let frame = 0
let charge = 0
let charging = false
let cameraY = 0
let shake = 0
let combo = 0
let particles = []
let platforms = []
let corns = []
let clouds = []

const chicken = {
  x: 0, y: 0, r: 24, vx: 0, vy: 0, onGround: true, face: 1, squash: 1
}

const gravity = 0.48
const maxCharge = 62
const colors = {
  skyTop: '#9CE8FF', skyBottom: '#F8FDFF', grass: '#66D17A', grassDark: '#3CB65D',
  yellow: '#FFD84D', orange: '#FF9F2F', red: '#F35C5C', ink: '#334155', white: '#FFFFFF'
}

function resize() {
  const info = wx.getSystemInfoSync()
  W = info.windowWidth
  H = info.windowHeight
  canvas.width = Math.floor(W * DPR)
  canvas.height = Math.floor(H * DPR)
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  reset()
}

function rand(min, max) { return min + Math.random() * (max - min) }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

function reset() {
  state = 'ready'
  score = 0
  frame = 0
  charge = 0
  charging = false
  cameraY = 0
  shake = 0
  combo = 0
  particles = []
  platforms = []
  corns = []
  clouds = []
  chicken.x = W * 0.5
  chicken.y = H - 145
  chicken.vx = 0
  chicken.vy = 0
  chicken.onGround = true
  chicken.face = 1
  chicken.squash = 1

  for (let i = 0; i < 8; i++) clouds.push({ x: rand(-80, W), y: rand(25, H * 0.45), s: rand(0.6, 1.25), v: rand(0.12, 0.35) })
  platforms.push({ x: W * 0.5, y: H - 85, w: 150, h: 18, type: 'start', hit: false })
  let y = H - 185
  for (let i = 1; i < 18; i++) {
    const w = rand(88, 145)
    const x = rand(w * 0.55, W - w * 0.55)
    platforms.push({ x, y, w, h: 16, type: Math.random() < 0.18 ? 'spring' : 'normal', hit: false })
    if (Math.random() < 0.55) corns.push({ x: x + rand(-w * 0.25, w * 0.25), y: y - 42, r: 9, got: false, spin: rand(0, Math.PI) })
    y -= rand(82, 118)
  }
}

function ensurePlatforms() {
  let top = platforms.reduce((m, p) => Math.min(m, p.y), Infinity)
  while (top > cameraY - 260) {
    const lastTop = top
    const w = rand(76, 136)
    const x = rand(w * 0.55, W - w * 0.55)
    const y = lastTop - rand(86, 125)
    platforms.push({ x, y, w, h: 16, type: Math.random() < 0.2 ? 'spring' : 'normal', hit: false })
    if (Math.random() < 0.62) corns.push({ x: x + rand(-w * 0.3, w * 0.3), y: y - 42, r: 9, got: false, spin: rand(0, Math.PI) })
    top = y
  }
  platforms = platforms.filter(p => p.y - cameraY < H + 120)
  corns = corns.filter(c => !c.got && c.y - cameraY < H + 120)
}

function spawnBurst(x, y, color, n = 12) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: rand(-2.5, 2.5), vy: rand(-4, -0.5), life: rand(18, 34), max: 34, color, r: rand(2, 4) })
}

function startCharge() {
  if (state === 'ready') state = 'playing'
  if (state !== 'playing' || !chicken.onGround) return
  charging = true
  charge = 0
}

function releaseJump() {
  if (!charging || state !== 'playing' || !chicken.onGround) return
  charging = false
  const power = 0.55 + charge / maxCharge
  chicken.vy = -10.5 * power
  chicken.vx = chicken.face * (2.2 + charge / 18)
  chicken.onGround = false
  chicken.squash = 1.18
  spawnBurst(chicken.x, chicken.y + chicken.r, colors.white, 8)
}

wx.onTouchStart((e) => {
  const t = e.touches && e.touches[0]
  if (state === 'gameover') {
    reset()
    return
  }
  if (t) chicken.face = t.clientX < chicken.x ? -1 : 1
  startCharge()
})
wx.onTouchMove((e) => {
  const t = e.touches && e.touches[0]
  if (t && charging) chicken.face = t.clientX < chicken.x ? -1 : 1
})
wx.onTouchEnd(releaseJump)
wx.onShow(() => { if (state !== 'gameover') loop() })

function update() {
  frame++
  if (charging) {
    charge = Math.min(maxCharge, charge + 1.35)
    chicken.squash = 1 - Math.sin(charge / maxCharge * Math.PI) * 0.16
  } else {
    chicken.squash += (1 - chicken.squash) * 0.18
  }

  clouds.forEach(c => { c.x += c.v; if (c.x > W + 90) { c.x = -120; c.y = rand(25, H * 0.45) } })

  if (state === 'playing') {
    chicken.vy += gravity
    chicken.x += chicken.vx
    chicken.y += chicken.vy
    chicken.vx *= 0.992
    if (chicken.x < -chicken.r) chicken.x = W + chicken.r
    if (chicken.x > W + chicken.r) chicken.x = -chicken.r

    if (chicken.vy > 0) {
      for (const p of platforms) {
        const withinX = chicken.x > p.x - p.w / 2 - chicken.r * 0.55 && chicken.x < p.x + p.w / 2 + chicken.r * 0.55
        const foot = chicken.y + chicken.r
        if (withinX && foot >= p.y - 4 && foot <= p.y + p.h + chicken.vy + 4) {
          chicken.y = p.y - chicken.r
          chicken.vy = 0
          chicken.vx *= 0.35
          chicken.onGround = true
          chicken.squash = 0.78
          shake = 4
          if (!p.hit && p.type !== 'start') {
            p.hit = true
            combo++
            score += p.type === 'spring' ? 3 : 1
            spawnBurst(chicken.x, p.y, p.type === 'spring' ? colors.orange : colors.grass, 10)
          }
          if (p.type === 'spring' && !charging) {
            chicken.vy = -12.5
            chicken.onGround = false
          }
          break
        }
      }
    }

    if (!chicken.onGround) combo = 0
    for (const c of corns) {
      const d = Math.hypot(chicken.x - c.x, chicken.y - c.y)
      c.spin += 0.12
      if (d < chicken.r + c.r) {
        c.got = true
        score += 5
        spawnBurst(c.x, c.y, colors.yellow, 16)
      }
    }

    const targetCamera = Math.min(cameraY, chicken.y - H * 0.42)
    cameraY += (targetCamera - cameraY) * 0.08
    ensurePlatforms()
    if (chicken.y - cameraY > H + 90) {
      state = 'gameover'
      best = Math.max(best, score)
      try { wx.setStorageSync('bestScore', best) } catch (e) {}
      shake = 12
    }
  }

  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life-- })
  particles = particles.filter(p => p.life > 0)
  if (shake > 0) shake *= 0.82
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawCloud(c) {
  ctx.save()
  ctx.globalAlpha = 0.76
  ctx.fillStyle = colors.white
  ctx.beginPath()
  ctx.arc(c.x, c.y, 22 * c.s, 0, Math.PI * 2)
  ctx.arc(c.x + 24 * c.s, c.y - 9 * c.s, 28 * c.s, 0, Math.PI * 2)
  ctx.arc(c.x + 55 * c.s, c.y, 22 * c.s, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPlatform(p) {
  const y = p.y - cameraY
  ctx.save()
  ctx.shadowColor = 'rgba(30,90,80,.18)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 5
  roundRect(p.x - p.w / 2, y, p.w, p.h, 9)
  ctx.fillStyle = p.type === 'spring' ? colors.orange : colors.grass
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = p.type === 'spring' ? '#FFD08A' : '#A8EEA7'
  roundRect(p.x - p.w / 2 + 8, y + 3, p.w - 16, 4, 3)
  ctx.fill()
  if (p.type === 'spring') {
    ctx.strokeStyle = '#fff3c4'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(p.x - 22, y + p.h)
    ctx.lineTo(p.x - 8, y + p.h + 12)
    ctx.lineTo(p.x + 8, y + p.h)
    ctx.lineTo(p.x + 22, y + p.h + 12)
    ctx.stroke()
  }
  ctx.restore()
}

function drawCorn(c) {
  const y = c.y - cameraY
  ctx.save()
  ctx.translate(c.x, y)
  ctx.rotate(Math.sin(c.spin) * 0.18)
  ctx.fillStyle = colors.yellow
  ctx.beginPath()
  ctx.ellipse(0, 0, c.r * 0.75, c.r * 1.25, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFE985'
  for (let i = -1; i <= 1; i++) ctx.fillRect(i * 4 - 1, -7, 2, 14)
  ctx.fillStyle = colors.grassDark
  ctx.beginPath()
  ctx.moveTo(-7, 7); ctx.quadraticCurveTo(-16, 2, -10, -5); ctx.quadraticCurveTo(-4, 0, -7, 7)
  ctx.moveTo(7, 7); ctx.quadraticCurveTo(16, 2, 10, -5); ctx.quadraticCurveTo(4, 0, 7, 7)
  ctx.fill()
  ctx.restore()
}

function drawChicken() {
  const x = chicken.x
  const y = chicken.y - cameraY
  const sx = 1 + (1 - chicken.squash) * 0.7
  const sy = chicken.squash
  ctx.save()
  ctx.translate(x, y + chicken.r)
  ctx.scale(sx, sy)
  ctx.translate(0, -chicken.r)
  ctx.shadowColor = 'rgba(51,65,85,.18)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 5

  ctx.fillStyle = colors.yellow
  ctx.beginPath()
  ctx.arc(0, 0, chicken.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.fillStyle = '#FFEFA5'
  ctx.beginPath()
  ctx.arc(-6, 7, 13, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = colors.red
  ctx.beginPath()
  ctx.arc(-7, -23, 7, 0, Math.PI * 2)
  ctx.arc(1, -27, 7, 0, Math.PI * 2)
  ctx.arc(8, -22, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = colors.white
  ctx.beginPath()
  ctx.arc(8, -7, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors.ink
  ctx.beginPath()
  ctx.arc(10 + chicken.face * 2, -7, 3.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = colors.orange
  ctx.beginPath()
  ctx.moveTo(21, -1)
  ctx.lineTo(38, 5)
  ctx.lineTo(21, 11)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = colors.orange
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-8, 22); ctx.lineTo(-14, 31)
  ctx.moveTo(9, 22); ctx.lineTo(15, 31)
  ctx.stroke()
  ctx.restore()
}

function drawPower() {
  if (!charging) return
  const barW = W * 0.56
  const x = (W - barW) / 2
  const y = H - 58
  roundRect(x, y, barW, 14, 8)
  ctx.fillStyle = 'rgba(255,255,255,.65)'
  ctx.fill()
  const t = charge / maxCharge
  roundRect(x, y, barW * t, 14, 8)
  ctx.fillStyle = t > 0.82 ? colors.red : colors.orange
  ctx.fill()
  ctx.fillStyle = colors.ink
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('松手起跳！', W / 2, y - 8)
}

function drawUI() {
  ctx.fillStyle = colors.ink
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`🌽 ${score}`, 18, 38)
  ctx.font = '13px sans-serif'
  ctx.fillText(`BEST ${best}`, 20, 60)

  if (state === 'ready') {
    card('元气小鸡跳跳', '按住蓄力，松手跳跃\n踩平台、吃玉米，别掉下去！', '开始蓄力')
  }
  if (state === 'gameover') {
    card('掉下去了！', `本局 ${score} 分 · 最高 ${best} 分`, '点一下重新开始')
  }
}

function card(title, body, tip) {
  const w = Math.min(310, W - 40)
  const h = 188
  const x = (W - w) / 2
  const y = H * 0.25
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,.88)'
  ctx.strokeStyle = 'rgba(51,65,85,.12)'
  ctx.lineWidth = 1
  roundRect(x, y, w, h, 24)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = colors.ink
  ctx.textAlign = 'center'
  ctx.font = 'bold 28px sans-serif'
  ctx.fillText(title, W / 2, y + 48)
  ctx.font = '16px sans-serif'
  body.split('\n').forEach((line, i) => ctx.fillText(line, W / 2, y + 86 + i * 24))
  ctx.fillStyle = colors.orange
  roundRect(W / 2 - 78, y + 136, 156, 34, 17)
  ctx.fill()
  ctx.fillStyle = colors.white
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(tip, W / 2, y + 158)
  ctx.restore()
}

function render() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, colors.skyTop)
  g.addColorStop(1, colors.skyBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const ox = shake ? rand(-shake, shake) : 0
  const oy = shake ? rand(-shake, shake) : 0
  ctx.save()
  ctx.translate(ox, oy)
  clouds.forEach(drawCloud)

  platforms.forEach(drawPlatform)
  corns.forEach(drawCorn)
  particles.forEach(p => {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1)
    ctx.fillStyle = p.color
    ctx.beginPath(); ctx.arc(p.x, p.y - cameraY, p.r, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalAlpha = 1
  drawChicken()
  ctx.restore()
  drawPower()
  drawUI()
}

let running = false
function loop() {
  if (running) return
  running = true
  const tick = () => {
    running = false
    update()
    render()
    if (state !== 'hidden') wx.requestAnimationFrame(loop)
  }
  wx.requestAnimationFrame(tick)
}

try { best = Number(wx.getStorageSync('bestScore') || 0) } catch (e) { best = 0 }
resize()
wx.onWindowResize(resize)
loop()
