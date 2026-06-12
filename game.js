/* 巨物清洁工 FPS 版
 * 横屏第一人称 2.5D 清洁模拟：左摇杆移动，右侧拖动视角并喷水，底部切换道具。
 */
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

function sys(){try{return wx.getSystemInfoSync()||{}}catch(e){return {}}}
function raf(cb){const f=(typeof requestAnimationFrame==='function'&&requestAnimationFrame)||(canvas&&canvas.requestAnimationFrame&&canvas.requestAnimationFrame.bind(canvas))||(wx&&wx.requestAnimationFrame&&wx.requestAnimationFrame.bind(wx));return f?f(cb):setTimeout(cb,1000/60)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rand(a,b){return a+Math.random()*(b-a)}
function dist(ax,ay,bx,by){const x=ax-bx,y=ay-by;return Math.sqrt(x*x+y*y)}
function normAng(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}

let W=667,H=375,DPR=1,frame=0
let state='home'
let buttons=[]
let spraying=false
let lookTouch=null, moveTouch=null
let lastLook={x:0,y:0}
let joystick={x:90,y:0,dx:0,dy:0,active:false}
let water=[]
let foam=[]
let cleanFx=[]
let tool=0
let cleanPct=0
let coins=0
let seconds=0
let startTime=0
let level=1

const tools=[
  {name:'高压水枪', icon:'💦', range:3.2, power:.030, color:'#73E4FF'},
  {name:'泡沫喷枪', icon:'🫧', range:2.2, power:.012, color:'#FFFFFF'},
  {name:'旋转刷头', icon:'🧽', range:1.35, power:.065, color:'#FFD96A'},
  {name:'强力冲洗', icon:'⚡', range:4.2, power:.045, color:'#A7F3FF'}
]
const MAP=[
  '############',
  '#..........#',
  '#..##......#',
  '#..........#',
  '#.....#....#',
  '#.....#....#',
  '#..........#',
  '#...###....#',
  '#..........#',
  '#......##..#',
  '#..........#',
  '############'
]
const player={x:2.2,y:2.2,a:.12,vx:0,vy:0}
const fov=Math.PI/3
let dirt=[]
let zbuf=[]

function resize(){const s=sys();W=s.windowWidth||W;H=s.windowHeight||H;DPR=Math.max(1,s.pixelRatio||1);canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);if(canvas.style){canvas.style.width=W+'px';canvas.style.height=H+'px'}ctx.setTransform(DPR,0,0,DPR,0,0);joystick.y=H-86}
function isWall(x,y){const ix=Math.floor(x),iy=Math.floor(y);return iy<0||iy>=MAP.length||ix<0||ix>=MAP[0].length||MAP[iy][ix]==='#'}
function cellCenterKey(x,y,side){return x+','+y+','+side}
function save(){try{wx.setStorageSync('giantCleanerFPS',{coins,level})}catch(e){}}
function load(){try{const d=wx.getStorageSync('giantCleanerFPS');if(d){coins=d.coins||0;level=d.level||1}}catch(e){}}

function resetLevel(){
  player.x=2.2;player.y=2.2;player.a=.12;player.vx=0;player.vy=0
  water=[];foam=[];cleanFx=[];spraying=false;seconds=0;startTime=Date.now();cleanPct=0
  dirt=[]
  for(let y=0;y<MAP.length;y++)for(let x=0;x<MAP[y].length;x++)if(MAP[y][x]==='#'){
    const sides=[['N',0,-.501],['S',0,.501],['W',-.501,0],['E',.501,0]]
    sides.forEach((s,i)=>{
      const nx=x+.5+s[1],ny=y+.5+s[2]
      const bx=x+.5,by=y+.5
      const outx=bx+s[1]*1.2,outy=by+s[2]*1.2
      if(!isWall(outx,outy)&&Math.random()<.72){
        const patches=2+Math.floor(rand(0,4)+level*.15)
        for(let k=0;k<patches;k++)dirt.push({cellX:x,cellY:y,side:s[0],u:rand(.12,.88),v:rand(.18,.82),r:rand(.045,.12),hp:rand(.75,1.9)+level*.08,max:0,type:Math.floor(rand(0,5)),seed:rand(0,99)})
      }
    })
  }
  dirt.forEach(d=>d.max=d.hp)
}
function finish(){const reward=120+level*35+Math.max(0,180-seconds);coins+=reward;level++;save();state='result'}

function rayCast(a){
  const step=.025,max=16,cs=Math.cos(a),sn=Math.sin(a)
  let lx=player.x,ly=player.y
  for(let t=0;t<max;t+=step){const x=player.x+cs*t,y=player.y+sn*t;if(isWall(x,y)){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy
    let side='N',u=fx
    const e=.055
    if(fx<e){side='W';u=fy}else if(fx>1-e){side='E';u=fy}else if(fy<e){side='N';u=fx}else if(fy>1-e){side='S';u=fx}
    return {dist:t,x,y,ix,iy,side,u}
  }lx=x;ly=y}
  return {dist:max,x:player.x+cs*max,y:player.y+sn*max,ix:-1,iy:-1,side:'',u:0}
}
function wallPoint(d){
  const x=d.cellX,y=d.cellY,u=d.u
  if(d.side==='N')return{x:x+u,y:y-.002,nx:0,ny:-1}
  if(d.side==='S')return{x:x+u,y:y+1.002,nx:0,ny:1}
  if(d.side==='W')return{x:x-.002,y:y+u,nx:-1,ny:0}
  return{x:x+1.002,y:y+u,nx:1,ny:0}
}
function project(wx,wy,v=0.5){
  const dx=wx-player.x,dy=wy-player.y
  const ca=Math.cos(-player.a),sa=Math.sin(-player.a)
  const rx=dx*ca-dy*sa, rz=dx*sa+dy*ca
  if(rz<=.05)return null
  const sx=W/2+(rx/rz)*(W/(2*Math.tan(fov/2)))
  const wallH=H/rz
  const sy=H/2+(v-.5)*wallH
  return {x:sx,y:sy,z:rz,scale:wallH}
}
function updateCleanPct(){const max=dirt.reduce((a,d)=>a+d.max,0),left=dirt.reduce((a,d)=>a+Math.max(0,d.hp),0);cleanPct=max?1-left/max:1;if(cleanPct>.995&&state==='game')finish()}
function cleanCenter(){
  const hit=rayCast(player.a)
  const t=tools[tool]
  if(hit.dist>t.range)return
  dirt.forEach(d=>{
    if(d.hp<=0)return
    const p=wallPoint(d)
    const dd=dist(hit.x,hit.y,p.x,p.y)
    if(dd<.46){const k=1-dd/.46;d.hp=Math.max(0,d.hp-t.power*(.45+k*1.4)*(tool===1?.65:1))}
  })
  cleanFx.push({x:hit.x,y:hit.y,life:45,max:45})
}
function update(){
  frame++; if(state==='game')seconds=Math.floor((Date.now()-startTime)/1000)
  if(state==='game'){
    const speed=.055
    const fwd=joystick.dy*-1, str=joystick.dx
    const ca=Math.cos(player.a),sa=Math.sin(player.a)
    const nx=player.x+(ca*fwd-sa*str)*speed, ny=player.y+(sa*fwd+ca*str)*speed
    if(!isWall(nx,player.y))player.x=nx
    if(!isWall(player.x,ny))player.y=ny
    if(spraying){cleanCenter();const hit=rayCast(player.a);for(let i=0;i<5;i++)water.push({x:W*.73+rand(-8,8),y:H*.76+rand(-8,8),tx:W/2+rand(-22,22),ty:H/2+rand(-22,22),life:rand(12,22),max:22,c:tools[tool].color})}
    if(tool===1&&spraying&&frame%8===0){const hit=rayCast(player.a);foam.push({x:hit.x,y:hit.y,life:160})}
    foam.forEach(f=>{f.life--;dirt.forEach(d=>{const p=wallPoint(d);if(dist(f.x,f.y,p.x,p.y)<.75)d.hp=Math.max(0,d.hp-.006)})});foam=foam.filter(f=>f.life>0)
    cleanFx.forEach(f=>f.life--);cleanFx=cleanFx.filter(f=>f.life>0)
    updateCleanPct()
  }
  water.forEach(w=>w.life--);water=water.filter(w=>w.life>0)
}

function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function btn(id,x,y,w,h,text,fn,tone='blue'){buttons.push({id,x,y,w,h,fn});const g=ctx.createLinearGradient(x,y,x,y+h);if(tone==='orange'){g.addColorStop(0,'#FFD36A');g.addColorStop(1,'#FF842E')}else if(tone==='ghost'){g.addColorStop(0,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,.09)')}else{g.addColorStop(0,'#58D7FF');g.addColorStop(1,'#177DFF')}ctx.fillStyle=g;rr(x,y,w,h,h/2);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x+w/2,y+h/2+1)}
function hitBtn(x,y){for(let i=buttons.length-1;i>=0;i--){const b=buttons[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)return b}return null}
function resetButtons(){buttons=[]}

function render3D(){
  // sky/ceiling + floor
  const sky=ctx.createLinearGradient(0,0,0,H/2);sky.addColorStop(0,'#192329');sky.addColorStop(1,'#526B72');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H/2)
  const floor=ctx.createLinearGradient(0,H/2,0,H);floor.addColorStop(0,'#8EA9A7');floor.addColorStop(1,'#D7E2D9');ctx.fillStyle=floor;ctx.fillRect(0,H/2,W,H/2)
  // floor grid
  ctx.strokeStyle='rgba(65,115,120,.32)';ctx.lineWidth=1
  for(let i=0;i<18;i++){const y=H/2+Math.pow(i/18,1.8)*H/2;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  for(let i=-10;i<=10;i++){const x=W/2+i*W/18;ctx.beginPath();ctx.moveTo(W/2,H/2);ctx.lineTo(x,H);ctx.stroke()}
  zbuf=[]
  const step=2
  for(let sx=0;sx<W;sx+=step){const a=player.a-fov/2+(sx/W)*fov;const hit=rayCast(a);const corrected=hit.dist*Math.cos(a-player.a);zbuf[sx]=corrected;const h=Math.min(H*1.6,H/corrected);const y=H/2-h/2;const shade=clamp(1-corrected/12,.18,1);const sideDark=(hit.side==='N'||hit.side==='S')?.82:1;ctx.fillStyle=`rgb(${Math.floor(175*shade*sideDark)},${Math.floor(190*shade*sideDark)},${Math.floor(185*shade*sideDark)})`;ctx.fillRect(sx,y,step+1,h);ctx.fillStyle='rgba(26,105,155,.55)';ctx.fillRect(sx,y+h*.48,step+1,Math.max(2,h*.055));if(sx%24<step){ctx.fillStyle='rgba(0,0,0,.08)';ctx.fillRect(sx,y,1,h)}}
  // clean marks projected as bright wet spots
  cleanFx.forEach(f=>{const p=project(f.x,f.y,.5);if(!p)return;const a=clamp(f.life/f.max,0,1);const r=clamp(p.scale*.085,12,80);const g=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,r);g.addColorStop(0,`rgba(240,255,255,${.42*a})`);g.addColorStop(.75,`rgba(190,245,255,${.16*a})`);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill()})
  // dirt patches
  dirt.forEach(d=>{if(d.hp<=0)return;const wp=wallPoint(d);const p=project(wp.x,wp.y,d.v);if(!p||p.x<-80||p.x>W+80||p.z>12)return;const alpha=clamp(d.hp/d.max,0,1);const size=clamp(p.scale*d.r,8,92);ctx.save();ctx.globalAlpha=alpha*.95;ctx.translate(p.x,p.y);ctx.rotate(Math.sin(d.seed)*.5);const c=d.type===3?'rgba(22,90,45,.78)':d.type===4?'rgba(10,10,10,.9)':d.type===1?'rgba(91,61,38,.78)':'rgba(8,10,10,.82)';if(d.type===4){ctx.strokeStyle=c;ctx.lineWidth=size*.28;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-size,-size*.25);ctx.lineTo(size*.8,size*.18);ctx.moveTo(-size*.5,size*.55);ctx.lineTo(size*.7,-size*.55);ctx.stroke()}else{const g=ctx.createRadialGradient(-size*.2,-size*.2,1,0,0,size*1.25);g.addColorStop(0,c);g.addColorStop(.7,c);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,size*1.25,size*.75,0,0,Math.PI*2);ctx.fill()}ctx.restore()})
  // water stream
  if(spraying){const g=ctx.createLinearGradient(W*.73,H*.76,W/2,H/2);g.addColorStop(0,'rgba(255,255,255,.92)');g.addColorStop(.4,'rgba(160,230,255,.55)');g.addColorStop(1,'rgba(255,255,255,.1)');ctx.strokeStyle=g;ctx.lineWidth=18;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(W*.73,H*.76);ctx.lineTo(W/2,H/2);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(W*.73,H*.76);ctx.lineTo(W/2,H/2);ctx.stroke();const fog=ctx.createRadialGradient(W/2,H/2,2,W/2,H/2,80);fog.addColorStop(0,'rgba(255,255,255,.48)');fog.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=fog;ctx.beginPath();ctx.arc(W/2,H/2,80,0,Math.PI*2);ctx.fill()}
  water.forEach(w=>{ctx.globalAlpha=clamp(w.life/w.max,0,1);ctx.fillStyle=w.c;ctx.beginPath();ctx.arc(w.tx+rand(-2,2),w.ty+rand(-2,2),rand(2,5),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1})
  drawGun()
}
function drawGun(){ctx.save();ctx.translate(W*.76,H*.79);ctx.rotate(-.18);ctx.fillStyle='#B7C2CE';ctx.strokeStyle='#4C5B68';ctx.lineWidth=3;rr(-20,-22,132,46,17);ctx.fill();ctx.stroke();ctx.fillStyle='#EEF3F7';rr(44,-54,116,76,22);ctx.fill();ctx.stroke();ctx.fillStyle='#7E8B9A';rr(70,-28,88,10,5);ctx.fill();rr(66,-5,88,10,5);ctx.fill();ctx.fillStyle=tools[tool].color;rr(-8,-30,48,13,7);ctx.fill();ctx.fillStyle='#DCE8F0';rr(-96,-8,86,16,8);ctx.fill();ctx.stroke();ctx.restore()}
function drawUI(){
  // progress + money
  ctx.fillStyle='rgba(0,82,145,.88)';ctx.beginPath();ctx.arc(52,44,34,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#54D7FF';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText(Math.floor(cleanPct*100)+'%',52,42);ctx.font='9px sans-serif';ctx.fillText('CLEAN',52,57)
  ctx.fillStyle='rgba(0,70,120,.72)';rr(96,16,150,18,9);ctx.fill();ctx.fillStyle='#DDF8FF';rr(96,16,150*cleanPct,18,9);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.textAlign='left';ctx.fillText('Level '+level+'  '+seconds+'s',100,52)
  ctx.fillStyle='rgba(0,82,145,.86)';rr(W-142,14,126,34,9);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('金币 '+coins,W-79,36)
  // crosshair
  ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W/2-12,H/2);ctx.lineTo(W/2-4,H/2);ctx.moveTo(W/2+4,H/2);ctx.lineTo(W/2+12,H/2);ctx.moveTo(W/2,H/2-12);ctx.lineTo(W/2,H/2-4);ctx.moveTo(W/2,H/2+4);ctx.lineTo(W/2,H/2+12);ctx.stroke()
  // left joystick
  ctx.save();ctx.globalAlpha=joystick.active?.72:.32;ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.arc(joystick.x,joystick.y,54,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.5)';ctx.stroke();ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(joystick.x+joystick.dx*28,joystick.y+joystick.dy*28,22,0,Math.PI*2);ctx.fill();ctx.restore()
  // tool switch
  const bw=96,bh=38,sy=H-50;tools.forEach((t,i)=>btn('tool'+i,W/2-202+i*(bw+8),sy,bw,bh,(i===tool?'✓ ':'')+t.icon+t.name.slice(0,2),()=>{tool=i},i===tool?'orange':'ghost'))
  ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='12px sans-serif';ctx.textAlign='right';ctx.fillText('左摇杆移动 · 右侧拖动转向/按住清洗',W-18,H-64)
}
function renderHome(){const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#12202A');g.addColorStop(.55,'#1E6F91');g.addColorStop(1,'#D9F7FF');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(255,255,255,.12)';for(let i=0;i<12;i++){ctx.beginPath();ctx.arc(rand(0,W),rand(0,H),rand(18,60),0,Math.PI*2);ctx.fill()}ctx.fillStyle='#fff';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.fillText('巨物清洁工',W/2,H*.28);ctx.font='bold 20px sans-serif';ctx.fillText('横屏第一人称 3D 清洗模拟',W/2,H*.28+42);ctx.font='15px sans-serif';ctx.fillText('左摇杆移动，右侧拖动视角并按住喷水，底部切换道具',W/2,H*.28+78);btn('start',W/2-100,H*.62,200,54,'开始清洁',()=>{resetLevel();state='game'},'orange');btn('level',W/2-75,H*.62+70,150,42,'关卡 '+level,()=>{},'ghost')}
function renderResult(){render3D();ctx.fillStyle='rgba(0,20,40,.62)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.fillText('清洁完成！',W/2,H*.32);ctx.font='bold 20px sans-serif';ctx.fillText('获得金币，解锁下一处巨物空间',W/2,H*.32+48);btn('next',W/2-100,H*.55,200,52,'下一关',()=>{resetLevel();state='game'},'orange')}
function render(){frame++;resetButtons();update();if(state==='home')renderHome();else if(state==='game'){render3D();drawUI()}else if(state==='result')renderResult()}

function pos(t){return{x:t.clientX,y:t.clientY}}
wx.onTouchStart(e=>{const list=e.changedTouches||e.touches||[];for(let i=0;i<list.length;i++){const p=pos(list[i]);const b=hitBtn(p.x,p.y);if(b){b.fn&&b.fn();return}if(state==='game'&&p.x<W*.38){moveTouch=list[i].identifier;joystick.active=true;joystick.x=p.x;joystick.y=p.y;joystick.dx=0;joystick.dy=0}else if(state==='game'){lookTouch=list[i].identifier;lastLook=p;spraying=true}}})
wx.onTouchMove(e=>{const list=e.changedTouches||e.touches||[];for(let i=0;i<list.length;i++){const t=list[i],p=pos(t);if(t.identifier===moveTouch){const dx=p.x-joystick.x,dy=p.y-joystick.y,l=Math.max(1,Math.sqrt(dx*dx+dy*dy));const m=clamp(l/54,0,1);joystick.dx=dx/l*m;joystick.dy=dy/l*m}else if(t.identifier===lookTouch){const dx=p.x-lastLook.x;player.a=normAng(player.a+dx*.006);lastLook=p}}})
wx.onTouchEnd(e=>{const list=e.changedTouches||[];for(let i=0;i<list.length;i++){const id=list[i].identifier;if(id===moveTouch){moveTouch=null;joystick.active=false;joystick.dx=0;joystick.dy=0;joystick.x=90;joystick.y=H-86}if(id===lookTouch){lookTouch=null;spraying=false}}})
wx.onTouchCancel(()=>{moveTouch=null;lookTouch=null;spraying=false;joystick.active=false;joystick.dx=0;joystick.dy=0})
function loop(){render();raf(loop)}
load();resize();try{wx.onWindowResize(resize)}catch(e){};loop()
