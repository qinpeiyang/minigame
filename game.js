/* 巨物清洁工 WebGL 真 3D 版
 * 横屏第一人称 WebGL：左摇杆移动，右侧拖动视角/喷水，底部切换道具。
 */
const canvas = wx.createCanvas()
let gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl')
if (!gl) throw new Error('WebGL not supported')

function sys(){try{return wx.getSystemInfoSync()||{}}catch(e){return {}}}
function raf(cb){const f=(typeof requestAnimationFrame==='function'&&requestAnimationFrame)||(canvas&&canvas.requestAnimationFrame&&canvas.requestAnimationFrame.bind(canvas))||(wx&&wx.requestAnimationFrame&&wx.requestAnimationFrame.bind(wx));return f?f(cb):setTimeout(cb,1000/60)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rand(a,b){return a+Math.random()*(b-a)}
function dist2(ax,az,bx,bz){const x=ax-bx,z=az-bz;return Math.sqrt(x*x+z*z)}
function normAng(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}

let W=667,H=375,DPR=1,frame=0,state='home'
let buttons=[], water=[], dirt=[], props=[]
let moveTouch=null, lookTouch=null, lastLook={x:0,y:0}, spraying=false
let joystick={x:90,y:0,dx:0,dy:0,active:false}
let currentTool=0, cleanPct=0, coins=0, level=1, seconds=0, startTime=0
const player={x:0,y:1.25,z:5.2,yaw:Math.PI,pitch:0}
const tools=[
  {name:'WATER', range:10, power:.018, color:[0.45,0.9,1]},
  {name:'FOAM', range:7, power:.010, color:[1,1,1]},
  {name:'BRUSH', range:3.2, power:.045, color:[1,.82,.25]},
  {name:'TURBO', range:12, power:.032, color:[.65,.95,1]}
]

function resize(){const s=sys();W=s.windowWidth||W;H=s.windowHeight||H;DPR=Math.max(1,s.pixelRatio||1);canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);if(canvas.style){canvas.style.width=W+'px';canvas.style.height=H+'px'}gl.viewport(0,0,canvas.width,canvas.height);joystick.y=H-86}
function load(){try{const d=wx.getStorageSync('giantCleanerGL');if(d){coins=d.coins||0;level=d.level||1}}catch(e){}}
function save(){try{wx.setStorageSync('giantCleanerGL',{coins,level})}catch(e){}}

// ---------- math ----------
function m4(){return new Float32Array(16)}
function ident(o){o[0]=1;o[1]=0;o[2]=0;o[3]=0;o[4]=0;o[5]=1;o[6]=0;o[7]=0;o[8]=0;o[9]=0;o[10]=1;o[11]=0;o[12]=0;o[13]=0;o[14]=0;o[15]=1;return o}
function perspective(o,fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);o[0]=f/aspect;o[1]=0;o[2]=0;o[3]=0;o[4]=0;o[5]=f;o[6]=0;o[7]=0;o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0;return o}
function lookAt(o,eye,center,up){let x0,x1,x2,y0,y1,y2,z0,z1,z2,len;z0=eye[0]-center[0];z1=eye[1]-center[1];z2=eye[2]-center[2];len=Math.hypot(z0,z1,z2)||1;z0/=len;z1/=len;z2/=len;x0=up[1]*z2-up[2]*z1;x1=up[2]*z0-up[0]*z2;x2=up[0]*z1-up[1]*z0;len=Math.hypot(x0,x1,x2)||1;x0/=len;x1/=len;x2/=len;y0=z1*x2-z2*x1;y1=z2*x0-z0*x2;y2=z0*x1-z1*x0;o[0]=x0;o[1]=y0;o[2]=z0;o[3]=0;o[4]=x1;o[5]=y1;o[6]=z1;o[7]=0;o[8]=x2;o[9]=y2;o[10]=z2;o[11]=0;o[12]=-(x0*eye[0]+x1*eye[1]+x2*eye[2]);o[13]=-(y0*eye[0]+y1*eye[1]+y2*eye[2]);o[14]=-(z0*eye[0]+z1*eye[1]+z2*eye[2]);o[15]=1;return o}
function mul(o,a,b){const r=m4();for(let i=0;i<4;i++)for(let j=0;j<4;j++)r[i*4+j]=a[i*4+0]*b[0*4+j]+a[i*4+1]*b[1*4+j]+a[i*4+2]*b[2*4+j]+a[i*4+3]*b[3*4+j];o.set(r);return o}
function model(o,tx,ty,tz,sx,sy,sz,ry=0){ident(o);const c=Math.cos(ry),s=Math.sin(ry);o[0]=c*sx;o[2]=-s*sx;o[5]=sy;o[8]=s*sz;o[10]=c*sz;o[12]=tx;o[13]=ty;o[14]=tz;return o}

// ---------- GL ----------
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function program(vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}
const p3=program(`
attribute vec3 aPos;attribute vec3 aNor;attribute vec2 aUv;
uniform mat4 uMVP;uniform mat4 uM;varying vec3 vN;varying vec3 vW;varying vec2 vUv;
void main(){vec4 w=uM*vec4(aPos,1.0);vW=w.xyz;vN=mat3(uM)*aNor;vUv=aUv;gl_Position=uMVP*vec4(aPos,1.0);}
`, `
precision mediump float;varying vec3 vN;varying vec3 vW;varying vec2 vUv;uniform vec3 uColor;uniform float uKind;uniform float uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} 
void main(){vec3 n=normalize(vN);vec3 light=normalize(vec3(-.45,.9,.35));float d=max(dot(n,light),0.0);float amb=.30;vec3 col=uColor;
float grid=0.0; if(uKind<1.5){vec2 g=abs(fract(vUv*8.0)-.5);grid=smoothstep(.47,.5,max(g.x,g.y));col*=1.0-grid*.18;col*=.92+hash(floor(vUv*40.0))*.08;}
if(uKind>1.5&&uKind<2.5){col*=.80+hash(floor(vUv*18.0+uTime*.02))*.20;}
float fog=clamp(length(vW.xz)/18.0,0.0,.58);vec3 lit=col*(amb+d*.86)+vec3(.08,.11,.12)*max(n.y,0.0);lit=mix(lit,vec3(.34,.40,.42),fog);gl_FragColor=vec4(lit,1.0);}
`)
const pDecal=program(`
attribute vec3 aPos;attribute vec2 aUv;uniform mat4 uMVP;varying vec2 vUv;void main(){vUv=aUv;gl_Position=uMVP*vec4(aPos,1.0);}
`, `
precision mediump float;varying vec2 vUv;uniform vec4 uColor;uniform float uStyle;uniform float uAlpha;
void main(){vec2 p=vUv*2.0-1.0;float a=0.0;if(uStyle<.5){a=smoothstep(1.0,.15,length(p*vec2(.72,1.15)));}else{float l=abs(p.y+sin(p.x*5.0)*.18);a=smoothstep(.34,.05,l)*(1.0-smoothstep(.75,1.05,abs(p.x)));}gl_FragColor=vec4(uColor.rgb,uColor.a*a*uAlpha);}
`)
const p2=program(`attribute vec2 aPos;uniform vec2 uRes;void main(){vec2 p=aPos/uRes*2.0-1.0;gl_Position=vec4(p.x,-p.y,0,1);}`,`precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}`)
function locs(p,names){const o={};names.forEach(n=>o[n]=gl.getUniformLocation(p,n));return o}
const l3=locs(p3,['uMVP','uM','uColor','uKind','uTime']), ld=locs(pDecal,['uMVP','uColor','uStyle','uAlpha']), l2=locs(p2,['uRes','uColor'])
const a3={pos:gl.getAttribLocation(p3,'aPos'),nor:gl.getAttribLocation(p3,'aNor'),uv:gl.getAttribLocation(p3,'aUv')}
const ad={pos:gl.getAttribLocation(pDecal,'aPos'),uv:gl.getAttribLocation(pDecal,'aUv')}
const a2={pos:gl.getAttribLocation(p2,'aPos')}

function makeMesh(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return{b,count:data.length/8}}
function cube(){const v=[];function face(n,pts){const uv=[[0,0],[1,0],[1,1],[0,1]],idx=[0,1,2,0,2,3];idx.forEach(i=>v.push(...pts[i],...n,...uv[i]))}face([0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]);face([0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]);face([1,0,0],[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]);face([-1,0,0],[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]);face([0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]);face([0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]);return makeMesh(v)}
function quad(){return makeMesh([-.5,-.5,0,0,0,1,0,0,.5,-.5,0,0,0,1,1,0,.5,.5,0,0,0,1,1,1,-.5,-.5,0,0,0,1,0,0,.5,.5,0,0,0,1,1,1,-.5,.5,0,0,0,1,0,1])}
const cubeMesh=cube(), quadMesh=quad()
let proj=m4(), view=m4(), vp=m4(), mm=m4(), mvp=m4()
function bind3(mesh){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.b);gl.enableVertexAttribArray(a3.pos);gl.vertexAttribPointer(a3.pos,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(a3.nor);gl.vertexAttribPointer(a3.nor,3,gl.FLOAT,false,32,12);gl.enableVertexAttribArray(a3.uv);gl.vertexAttribPointer(a3.uv,2,gl.FLOAT,false,32,24)}
function drawMesh(mesh,tx,ty,tz,sx,sy,sz,ry,color,kind=0){gl.useProgram(p3);bind3(mesh);model(mm,tx,ty,tz,sx,sy,sz,ry);mul(mvp,vp,mm);gl.uniformMatrix4fv(l3.uMVP,false,mvp);gl.uniformMatrix4fv(l3.uM,false,mm);gl.uniform3fv(l3.uColor,new Float32Array(color));gl.uniform1f(l3.uKind,kind);gl.uniform1f(l3.uTime,frame);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}
function drawDecal(d){const p=wallPoint(d);let ry=0,tx=p.x,ty=1.0+d.v*1.9,tz=p.z,eps=.012;if(d.side==='N'){tz-=eps;ry=0}else if(d.side==='S'){tz+=eps;ry=Math.PI}else if(d.side==='E'){tx+=eps;ry=Math.PI/2}else{tx-=eps;ry=-Math.PI/2}gl.useProgram(pDecal);gl.bindBuffer(gl.ARRAY_BUFFER,quadMesh.b);gl.enableVertexAttribArray(ad.pos);gl.vertexAttribPointer(ad.pos,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(ad.uv);gl.vertexAttribPointer(ad.uv,2,gl.FLOAT,false,32,24);model(mm,tx,ty,tz,d.r*2.4,d.r*2.0,1,ry);mul(mvp,vp,mm);gl.uniformMatrix4fv(ld.uMVP,false,mvp);const col=d.type===3?[.05,.34,.12,.9]:d.type===1?[.33,.20,.11,.9]:[.015,.015,.012,.92];gl.uniform4fv(ld.uColor,new Float32Array(col));gl.uniform1f(ld.uStyle,d.type===4?1:0);gl.uniform1f(ld.uAlpha,clamp(d.hp/d.max,0,1));gl.drawArrays(gl.TRIANGLES,0,quadMesh.count)}
function wallPoint(d){const x=d.cellX,z=d.cellY,u=d.u;if(d.side==='N')return{x:x+u-6,z:z-6};if(d.side==='S')return{x:x+u-6,z:z+1-6};if(d.side==='W')return{x:x-6,z:z+u-6};return{x:x+1-6,z:z+u-6}}

function initLevel(){dirt=[];props=[];player.x=-3.8;player.z=-3.8;player.yaw=.78;player.pitch=0;startTime=Date.now();seconds=0;cleanPct=0;spraying=false;water=[]
  const walls=[];for(let i=-6;i<=6;i++){walls.push([i,-6,'N'],[i,6,'S'],[-6,i,'W'],[6,i,'E'])}walls.push([-2,-2,'S'],[-1,-2,'S'],[0,-2,'S'],[2,1,'W'],[2,2,'W'],[2,3,'W'],[-4,2,'E'],[-4,3,'E'])
  walls.forEach(w=>{for(let k=0;k<4;k++)if(Math.random()<.8)dirt.push({cellX:w[0]+6,cellY:w[1]+6,side:w[2],u:rand(.12,.88),v:rand(.08,.85),r:rand(.18,.45),hp:rand(.8,2.2)+level*.1,max:0,type:Math.floor(rand(0,5))})})
  dirt.forEach(d=>d.max=d.hp)
  props.push(['barrel',-2.2,-2.8],['bucket',1.5,-3.5],['cone',3.5,1.5],['cart',-3.2,2.4],['pipe',0,-5.8],['pipe',4.5,-5.8],['sign',-1.5,3.5])
}
function isBlocked(x,z){return x<-5.65||x>5.65||z<-5.65||z>5.65||(x>-2.2&&x<.8&&z>-2.25&&z<-1.75)||(x>1.75&&x<2.25&&z>.8&&z<3.3)||(x>-4.25&&x<-3.75&&z>1.8&&z<3.3)}
function rayHit(){const dx=Math.sin(player.yaw),dz=Math.cos(player.yaw);let last={x:player.x,z:player.z};for(let t=.1;t<tools[currentTool].range;t+=.08){const x=player.x+dx*t,z=player.z+dz*t;if(isBlocked(x,z)){return{x,z,t}}last={x,z}}return{x:player.x+dx*tools[currentTool].range,z:player.z+dz*tools[currentTool].range,t:tools[currentTool].range}}
function updateClean(){const max=dirt.reduce((a,d)=>a+d.max,0),left=dirt.reduce((a,d)=>a+Math.max(0,d.hp),0);cleanPct=max?1-left/max:1;if(cleanPct>.995&&state==='game'){coins+=150+level*30;level++;save();state='result'}}
function clean(){const h=rayHit(), t=tools[currentTool];dirt.forEach(d=>{const p=wallPoint(d);const dd=dist2(h.x,h.z,p.x,p.z);if(dd<.75){const k=1-dd/.75;d.hp=Math.max(0,d.hp-t.power*(.5+k*1.8))}});water.push({life:30,max:30})}
function update(){frame++;if(state==='game'){seconds=Math.floor((Date.now()-startTime)/1000);const sp=.055;const f=-joystick.dy,st=joystick.dx;const sx=Math.sin(player.yaw),sz=Math.cos(player.yaw),rx=Math.sin(player.yaw+Math.PI/2),rz=Math.cos(player.yaw+Math.PI/2);const nx=player.x+(sx*f+rx*st)*sp,nz=player.z+(sz*f+rz*st)*sp;if(!isBlocked(nx,player.z))player.x=nx;if(!isBlocked(player.x,nz))player.z=nz;if(spraying){clean();}updateClean()}water.forEach(w=>w.life--);water=water.filter(w=>w.life>0)}
function render3D(){
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(.08,.11,.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)
  perspective(proj,Math.PI/3,canvas.width/canvas.height,.05,60);const dir=[Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),Math.cos(player.yaw)*Math.cos(player.pitch)];lookAt(view,[player.x,1.25,player.z],[player.x+dir[0],1.25+dir[1],player.z+dir[2]],[0,1,0]);mul(vp,proj,view)
  // room shell and real objects
  drawMesh(cubeMesh,0,-.05,0,12,.1,12,0,[.55,.66,.62],2) // floor
  drawMesh(cubeMesh,0,3.05,0,12,.1,12,0,[.15,.18,.18],2) // ceiling
  drawMesh(cubeMesh,0,1.5,-6,12,3,.12,0,[.66,.72,.69],0);drawMesh(cubeMesh,0,1.5,6,12,3,.12,0,[.60,.67,.66],0);drawMesh(cubeMesh,-6,1.5,0,.12,3,12,0,[.38,.55,.58],0);drawMesh(cubeMesh,6,1.5,0,.12,3,12,0,[.68,.70,.66],0)
  drawMesh(cubeMesh,-.7,1.5,-2,3,.12,.12,0,[.7,.75,.72],0);drawMesh(cubeMesh,2,1.5,2,.12,3,2.7,0,[.65,.70,.68],0);drawMesh(cubeMesh,-4,1.5,2.6,.12,3,1.6,0,[.42,.62,.68],0)
  // blue wall belt
  drawMesh(cubeMesh,0,1.45,-5.93,12,.12,.04,0,[.02,.35,.65],1);drawMesh(cubeMesh,5.93,1.45,0,.04,.12,12,0,[.02,.35,.65],1)
  props.forEach(sp=>{const [type,x,z]=sp;if(type==='barrel'){drawMesh(cubeMesh,x,.45,z,.55,.9,.55,0,[.72,.22,.12],1)}else if(type==='bucket'){drawMesh(cubeMesh,x,.25,z,.45,.5,.45,0,[.55,.68,.74],1)}else if(type==='cone'){drawMesh(cubeMesh,x,.35,z,.45,.7,.45,0,[1,.38,.08],1)}else if(type==='cart'){drawMesh(cubeMesh,x,.45,z,1,.55,.55,0,[.18,.28,.32],1)}else if(type==='pipe'){drawMesh(cubeMesh,x,2.75,z,1.8,.09,.09,0,[.28,.32,.34],1)}else if(type==='sign'){drawMesh(cubeMesh,x,.6,z,.7,1,.08,0,[1,.82,.22],1)}})
  dirt.forEach(d=>{if(d.hp>0)drawDecal(d)})
  // water impact and stream as translucent 3D-ish quads in front of camera not needed; overlay below
  drawOverlay3D();drawGun()
}
function drawOverlay3D(){
  // fake volumetric mist in screen-space WebGL rectangles
  gl.disable(gl.DEPTH_TEST);gl.useProgram(p2);gl.uniform2f(l2.uRes,canvas.width,canvas.height);const arr=[];function rect(x,y,w,h){arr.push(x,y,x+w,y,x+w,y+h,x,y,x+w,y+h,x,y+h)}
  if(spraying){gl.uniform4f(l2.uColor,.85,.96,1,.20);rect(W*.46*DPR,H*.43*DPR,W*.12*DPR,H*.14*DPR);gl.uniform4f(l2.uColor,.95,1,1,.60);rect(W*.50*DPR,H*.49*DPR,W*.018*DPR,H*.018*DPR)}
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STREAM_DRAW);gl.enableVertexAttribArray(a2.pos);gl.vertexAttribPointer(a2.pos,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,arr.length/2);gl.deleteBuffer(b);gl.enable(gl.DEPTH_TEST)
}
function drawGun(){
  const f=[Math.sin(player.yaw),0,Math.cos(player.yaw)], r=[Math.sin(player.yaw+Math.PI/2),0,Math.cos(player.yaw+Math.PI/2)]
  const bx=player.x+f[0]*.72+r[0]*.38, bz=player.z+f[2]*.72+r[2]*.38, by=.82
  const ry=player.yaw
  drawMesh(cubeMesh,bx,by,bz,.18,.18,.78,ry,[.75,.82,.86],1)
  drawMesh(cubeMesh,bx+r[0]*.16,by+.05,bz+r[2]*.16,.34,.24,.38,ry,[.92,.96,.98],1)
  drawMesh(cubeMesh,bx-f[0]*.42,by,bz-f[2]*.42,.12,.12,.52,ry,[.85,.92,.96],1)
  drawMesh(cubeMesh,bx-r[0]*.08,by-.28,bz-r[2]*.08,.16,.45,.18,ry,[.12,.18,.22],1)
  drawMesh(cubeMesh,bx+f[0]*.05,by+.2,bz+f[2]*.05,.22,.05,.24,ry,tools[currentTool].color,1)
}
function rect2(x,y,w,h,c){gl.disable(gl.DEPTH_TEST);gl.useProgram(p2);gl.uniform2f(l2.uRes,canvas.width,canvas.height);gl.uniform4f(l2.uColor,c[0],c[1],c[2],c[3]);const X=x*DPR,Y=y*DPR,Wp=w*DPR,Hp=h*DPR;const arr=[X,Y,X+Wp,Y,X+Wp,Y+Hp,X,Y,X+Wp,Y+Hp,X,Y+Hp];const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STREAM_DRAW);gl.enableVertexAttribArray(a2.pos);gl.vertexAttribPointer(a2.pos,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6);gl.deleteBuffer(b);gl.enable(gl.DEPTH_TEST)}
function btn(id,x,y,w,h,fn,color=[.1,.45,.9,.75]){buttons.push({id,x,y,w,h,fn});rect2(x,y,w,h,color)}
function hitBtn(x,y){for(let i=buttons.length-1;i>=0;i--){const b=buttons[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)return b}return null}
function resetButtons(){buttons=[]}
function drawUI(){
  // progress ring substitute: bars and color blocks (WebGL has no font atlas here)
  rect2(18,16,150,16,[0,0,.05,.55]); rect2(18,16,150*cleanPct,16,[.4,.95,1,.9])
  rect2(W-152,16,132,24,[0,.25,.48,.75])
  // crosshair
  rect2(W/2-16,H/2-1,12,2,[1,1,1,.9]);rect2(W/2+4,H/2-1,12,2,[1,1,1,.9]);rect2(W/2-1,H/2-16,2,12,[1,1,1,.9]);rect2(W/2-1,H/2+4,2,12,[1,1,1,.9])
  // joystick
  rect2(joystick.x-56,joystick.y-56,112,112,[1,1,1,joystick.active?.16:.07]);rect2(joystick.x+joystick.dx*28-18,joystick.y+joystick.dy*28-18,36,36,[1,1,1,.38])
  // tools
  const bw=84,bh=36,sy=H-48;tools.forEach((t,i)=>btn('tool'+i,W/2-178+i*(bw+8),sy,bw,bh,()=>{currentTool=i},i===currentTool?[1,.55,.08,.82]:[1,1,1,.16]))
}
function renderHome(){
  gl.disable(gl.DEPTH_TEST);gl.clearColor(.04,.10,.14,1);gl.clear(gl.COLOR_BUFFER_BIT);resetButtons()
  rect2(0,0,W,H,[.05,.16,.22,1]);rect2(W*.18,H*.22,W*.64,H*.16,[1,1,1,.10]);btn('start',W/2-110,H*.58,220,58,()=>{initLevel();state='game'},[1,.52,.12,.9]);btn('dummy',W/2-72,H*.58+72,144,40,()=>{},[1,1,1,.16])
}
function renderResult(){render3D();rect2(0,0,W,H,[0,0,0,.55]);btn('next',W/2-110,H*.56,220,58,()=>{initLevel();state='game'},[1,.52,.12,.9])}
function render(){frame++;resetButtons();update();if(state==='home')renderHome();else if(state==='game'){render3D();drawUI()}else if(state==='result')renderResult()}
function pos(t){return{x:t.clientX,y:t.clientY}}
wx.onTouchStart(e=>{const list=e.changedTouches||e.touches||[];for(let i=0;i<list.length;i++){const p=pos(list[i]);const b=hitBtn(p.x,p.y);if(b){b.fn&&b.fn();return}if(state==='game'&&p.x<W*.38){moveTouch=list[i].identifier;joystick.active=true;joystick.x=p.x;joystick.y=p.y;joystick.dx=0;joystick.dy=0}else if(state==='game'){lookTouch=list[i].identifier;lastLook=p;spraying=true}}})
wx.onTouchMove(e=>{const list=e.changedTouches||e.touches||[];for(let i=0;i<list.length;i++){const t=list[i],p=pos(t);if(t.identifier===moveTouch){const dx=p.x-joystick.x,dy=p.y-joystick.y,l=Math.max(1,Math.sqrt(dx*dx+dy*dy));const m=clamp(l/54,0,1);joystick.dx=dx/l*m;joystick.dy=dy/l*m}else if(t.identifier===lookTouch){const dx=p.x-lastLook.x,dy=p.y-lastLook.y;player.yaw=normAng(player.yaw+dx*.006);player.pitch=clamp(player.pitch-dy*.004,-.55,.55);lastLook=p}}})
wx.onTouchEnd(e=>{const list=e.changedTouches||[];for(let i=0;i<list.length;i++){const id=list[i].identifier;if(id===moveTouch){moveTouch=null;joystick.active=false;joystick.dx=0;joystick.dy=0;joystick.x=90;joystick.y=H-86}if(id===lookTouch){lookTouch=null;spraying=false}}})
wx.onTouchCancel(()=>{moveTouch=null;lookTouch=null;spraying=false;joystick.active=false;joystick.dx=0;joystick.dy=0})
function loop(){render();raf(loop)}
load();resize();try{wx.onWindowResize(resize)}catch(e){};loop()
