'use strict';
/* ═══════════════════════════════════════════════════════
   BrawlNet — fully self-contained client
   Training & Demo work with NO server.
   Multiplayer activates automatically when server runs.
═══════════════════════════════════════════════════════ */

// ── PHYSICS CONSTANTS (mirrored server-side) ──────────
const AW = 1200, AH = 600, GY = 510, PH = 64, PW = 28;
const GRAV = 0.55, HURT_INV = 28;

// ── CHARACTER STATS ───────────────────────────────────
const CHAR_STATS = {
  striker: { maxHp:100, spd:5.0, atk:12, jmp:-14, rng:85,  cd:28 },
  titan:   { maxHp:150, spd:3.2, atk:20, jmp:-11, rng:100, cd:40 },
  phantom: { maxHp:75,  spd:7.5, atk:9,  jmp:-17, rng:70,  cd:18 },
  bruiser: { maxHp:120, spd:4.0, atk:17, jmp:-12, rng:95,  cd:34 },
};

// ── DISPLAY DEFINITIONS ───────────────────────────────
const CHARS = {
  striker:{ label:'STRIKER', color:'#FF6B6B', desc:'Balanced speed & power — the classic fighter.',   stats:{POWER:60,SPEED:80,DEFENSE:50,REACH:55} },
  titan:  { label:'TITAN',   color:'#4ECDC4', desc:'Slow but devastating. Built like a fortress.',     stats:{POWER:90,SPEED:30,DEFENSE:85,REACH:75} },
  phantom:{ label:'PHANTOM', color:'#A855F7', desc:'Ghostly speed, vanishing strikes. High risk.',    stats:{POWER:40,SPEED:95,DEFENSE:25,REACH:40} },
  bruiser:{ label:'BRUISER', color:'#FF9F43', desc:'Raw street power. Sends foes flying.',            stats:{POWER:85,SPEED:45,DEFENSE:65,REACH:70} },
};
const PALETTE = ['#FF6B6B','#FF9F43','#FFE66D','#A8E063','#4ECDC4','#48DBFB','#A855F7','#FF6B9D'];

// ── AUDIO ─────────────────────────────────────────────
let _ac = null;
const ac = () => { if (!_ac) try { _ac = new (window.AudioContext||window.webkitAudioContext)(); } catch(_){} return _ac; };
function tone(type, f1, f2, dur, vol=0.22) {
  const a = ac(); if (!a) return;
  try {
    const o=a.createOscillator(), g=a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type=type; o.frequency.setValueAtTime(f1,a.currentTime);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2,a.currentTime+dur);
    g.gain.setValueAtTime(vol,a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+dur);
    o.start(); o.stop(a.currentTime+dur);
  } catch(_){}
}
const SFX = {
  hit:    ()=>tone('square',220,55,.15,.28),
  bigHit: ()=>tone('square',180,40,.2,.4),
  jump:   ()=>tone('sine',200,600,.12,.14),
  attack: ()=>tone('sawtooth',380,90,.09,.17),
  win: ()=>{
    [523,659,784,1047].forEach((f,i)=>{
      const a=ac(); if(!a) return;
      try {
        const o=a.createOscillator(),g=a.createGain();
        o.connect(g);g.connect(a.destination);
        o.type='triangle';o.frequency.value=f;
        const t=a.currentTime+i*.16;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.26,t+.04);
        g.gain.exponentialRampToValueAtTime(.001,t+.4);
        o.start(t);o.stop(t+.4);
      } catch(_){}
    });
  },
};

// ── DOM ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const SCREENS = ['menu','char','diff','lobby','game'];
function show(name) {
  SCREENS.forEach(s => $(`screen-${s}`).classList.toggle('active', s===name));
}

// ── PLAYER FACTORY ────────────────────────────────────
let _uid = 0;
function makeP(id, name, cls, color, x, isBot=false) {
  const s = CHAR_STATS[cls] || CHAR_STATS.striker;
  return {
    id, name:String(name).slice(0,16), charClass:cls, color,
    x, y:GY-PH, vx:0, vy:0, onGround:true, facing:1,
    hp:s.maxHp, maxHp:s.maxHp,
    spd:s.spd, atk:s.atk, jmp:s.jmp, rng:s.rng, cd:s.cd,
    state:'idle', attackCooldown:0, invincible:0, kills:0,
    isBot, input:{},
  };
}

// ── PHYSICS TICK ──────────────────────────────────────
function tick(p, all, fx) {
  const i = p.input||{};
  if (i.left)       { p.vx=-p.spd; p.facing=-1; }
  else if (i.right) { p.vx= p.spd; p.facing= 1; }
  else { p.vx*=0.72; if(Math.abs(p.vx)<0.2) p.vx=0; }

  if (p.state!=='attack'&&p.state!=='hurt') {
    if (!p.onGround)           p.state='jump';
    else if (Math.abs(p.vx)>0.5) p.state='walk';
    else                       p.state='idle';
  }
  if (i.jump&&p.onGround) { p.vy=p.jmp; p.onGround=false; p.state='jump'; }

  p.vy+=GRAV; p.x+=p.vx; p.y+=p.vy;
  if (p.y>=GY-PH) { p.y=GY-PH; p.vy=0; p.onGround=true; }
  p.x=Math.max(PW, Math.min(AW-PW, p.x));

  if (i.attack&&p.attackCooldown<=0) {
    p.attackCooldown=p.cd; p.state='attack';
    for (const o of all) {
      if (o.id===p.id||o.hp<=0||o.invincible>0) continue;
      const dx=o.x-p.x, dy=Math.abs((o.y+PH/2)-(p.y+PH/2));
      if (Math.abs(dx)<p.rng&&dy<PH&&Math.sign(dx)===p.facing) {
        const dmg=p.atk+Math.floor(Math.random()*6);
        o.hp=Math.max(0,o.hp-dmg);
        o.invincible=HURT_INV; o.vx=p.facing*7; o.vy=-4.5; o.state='hurt';
        fx.push({x:o.x, y:o.y+PH*.3, color:p.color, dmg});
      }
    }
  }
  if (p.attackCooldown>0){p.attackCooldown--;if(p.attackCooldown===0&&p.state==='attack')p.state=p.onGround?'idle':'jump';}
  if (p.invincible>0)    {p.invincible--;    if(p.invincible===0&&p.state==='hurt')  p.state=p.onGround?'idle':'jump';}
}

// ── AI BOT ────────────────────────────────────────────
class Bot {
  constructor(id, diff) {
    this.id=id;
    const c={easy:{delay:55,acc:.30,aggr:.25,jp:.02,wr:.65},
              normal:{delay:24,acc:.65,aggr:.60,jp:.08,wr:.15},
              hard:  {delay:6, acc:.93,aggr:.92,jp:.20,wr:.00}}[diff]
             ||{delay:24,acc:.65,aggr:.60,jp:.08,wr:.15};
    Object.assign(this,c);
    this.diff=diff; this.timer=Math.floor(Math.random()*this.delay);
    this.cached={}; this.wd=1; this.wt=0;
  }
  input(self, all) {
    if(--this.timer>0) return this.cached;
    this.timer=this.delay+Math.floor(Math.random()*8);
    const alive=all.filter(t=>t.id!==self.id&&t.hp>0);
    if(!alive.length) return(this.cached={});
    const tgt=alive.reduce((c,t)=>Math.abs(t.x-self.x)<Math.abs(c.x-self.x)?t:c);
    const dx=tgt.x-self.x, adx=Math.abs(dx), inRng=adx<self.rng+15;
    return (this.cached = this[`_${this.diff}`](self,tgt,dx,adx,inRng));
  }
  _easy(self,tgt,dx,adx,inRng) {
    const i={left:false,right:false,jump:false,attack:false};
    if(Math.random()<this.wr){if(--this.wt<=0){this.wd=Math.random()<.5?-1:1;this.wt=40+Math.random()*50;}i.left=this.wd<0;i.right=this.wd>0;}
    else if(Math.random()<this.aggr){i.left=dx<-60;i.right=dx>60;}
    if(inRng&&Math.random()<this.acc&&self.attackCooldown===0)i.attack=true;
    if(self.onGround&&Math.random()<this.jp)i.jump=true;
    return i;
  }
  _normal(self,tgt,dx,adx,inRng) {
    const i={left:dx<-25,right:dx>25,jump:false,attack:false};
    if(inRng&&self.attackCooldown===0&&Math.random()<this.acc)i.attack=true;
    if(self.onGround&&Math.random()<this.jp)i.jump=true;
    return i;
  }
  _hard(self,tgt,dx,adx,inRng) {
    const i={left:false,right:false,jump:false,attack:false};
    if(tgt.state==='attack'&&adx<130){i.left=dx>0;i.right=dx<0;if(self.onGround&&Math.random()<.5)i.jump=true;return i;}
    i.left=dx<0;i.right=dx>0;
    if(inRng&&self.attackCooldown===0)i.attack=true;
    if(self.onGround&&!inRng&&Math.random()<this.jp)i.jump=true;
    return i;
  }
}

// ── LOCAL ROOM (solo game — no server) ────────────────
let room = null;

function resetRoom(r) {
  const list=Object.values(r.players);
  list.forEach((p,i)=>{ p.x=280+i*640; p.y=GY-PH; p.vx=p.vy=0; p.onGround=true; p.hp=p.maxHp; p.state='idle'; p.attackCooldown=p.invincible=0; p.input={}; p.facing=i===0?1:-1; });
  r.phase='fighting';
}

function startRoom(r) {
  clearInterval(r.iv);
  resetRoom(r);
  let prev={};
  r.iv=setInterval(()=>{
    if(r.phase!=='fighting')return;
    const list=Object.values(r.players), fx=[];
    list.forEach(p=>{
      if(p.hp<=0){p.state='dead';return;}
      if(p.isBot){const b=r.bots.get(p.id);if(b)p.input=b.input(p,list);}
      tick(p,list,fx);
    });
    // sync to render
    players={};
    for(const[id,p] of Object.entries(r.players)) players[id]={...p};
    // sfx
    for(const[id,p] of Object.entries(players)){
      const os=prev[id];
      if(os&&os!==p.state){
        if(p.state==='jump')SFX.jump();
        if(p.state==='attack')SFX.attack();
        if(p.state==='hurt')  SFX.hit();
      }
      prev[id]=p.state;
    }
    // effects
    fx.forEach(e=>{burst(e.x,e.y,16,e.color);dmgNum(e.x,e.y-20,e.dmg,e.color);if(e.dmg>=18)shake(8,12);else shake(4,7);});
    // win check
    const alive=list.filter(p=>p.hp>0);
    if(alive.length<=1&&list.length>=2) endRoom(r,alive[0]||null);
  },1000/60);
}

function endRoom(r,winner) {
  if(r.phase==='roundEnd')return;
  r.phase='roundEnd'; clearInterval(r.iv); r.iv=null;
  if(winner)winner.kills++;
  gameMode='roundEnd';
  if(winner){
    if(!winner.isBot){SFX.win();flashMsg('YOU WIN!',2200);}
    else{SFX.hit();flashMsg(`${winner.name} WINS`,2200);}
    burst(winner.x||600,280,60,winner.color);
  } else { flashMsg('DRAW',2000); }
  const delay=appMode==='demo'?3500:5000;
  const hint=appMode==='demo'?'Rematch starting…':'Rematch in 5s…';
  setTimeout(()=>showEnd(winner,hint),2400);
  setTimeout(()=>{if(!room)return;hideEnd();gameMode='fighting';startRoom(r);flashMsg('FIGHT!',1600);},delay);
}

function launchTraining(name,cls,color,diff) {
  stopRoom();
  gameMode='fighting'; appMode='training';
  const r={players:{},bots:new Map(),phase:'idle',iv:null};
  const me=makeP('p1',name,cls,color,280,false); r.players['p1']=me;
  const bCls=['striker','titan','phantom','bruiser'][Math.floor(Math.random()*4)];
  const bClr=['#4ECDC4','#FF9F43','#A855F7','#FF6B9D'][Math.floor(Math.random()*4)];
  const bot=makeP('bot',`AI [${diff.toUpperCase()}]`,bCls,bClr,920,true);
  r.players['bot']=bot; r.bots.set('bot',new Bot('bot',diff));
  room=r; myId='p1';
  startRoom(r);
  show('game');
  $('mode-ribbon').textContent=`🥊 TRAINING — ${diff.toUpperCase()}`;
  $('mode-ribbon').classList.remove('hidden');
  $('btn-exit').classList.remove('hidden');
  hideEnd(); flashMsg('FIGHT!',1800);
}

function launchDemo() {
  stopRoom();
  gameMode='fighting'; appMode='demo';
  const r={players:{},bots:new Map(),phase:'idle',iv:null};
  [['da','APEX','striker','#FF6B6B',280],['db','NEXUS','bruiser','#4ECDC4',920]].forEach(([id,nm,cl,co,x],i)=>{
    const p=makeP(id,nm,cl,co,x,true); p.facing=i===0?1:-1;
    r.players[id]=p; r.bots.set(id,new Bot(id,'hard'));
  });
  room=r;
  startRoom(r);
  show('game');
  $('mode-ribbon').textContent='⚡ DEMO MODE — Click EXIT to return';
  $('mode-ribbon').classList.remove('hidden');
  $('btn-exit').classList.remove('hidden');
  hideEnd(); flashMsg('DEMO',1600);
}

function stopRoom() {
  if(room){clearInterval(room.iv);room=null;}
  gameMode='lobby';
}

// ── SOCKET.IO (multiplayer — optional) ───────────────
let socket = null;
let serverOK = false;
let myId = 'local';
let mpPlayers = {};   // server-driven player map
let appMode = 'menu'; // menu|training|demo|multiplayer
let gameMode = 'lobby';
let joined = false;

// players rendered — points to local room copy OR server map
let players = {};

function initSocket() {
  if (typeof io === 'undefined') { markOffline(); return; }
  try {
    socket = io({ transports:['websocket','polling'], timeout:5000, reconnectionAttempts:3 });
    socket.on('connect', ()=>{ serverOK=true; myId=socket.id; markOnline(); });
    socket.on('disconnect', ()=>{ serverOK=false; markOffline(); });
    socket.on('connect_error', ()=>{ serverOK=false; markOffline(); });

    socket.on('init', d=>{
      mpPlayers=d.players||{}; gameMode=d.phase;
      $('net-addr').textContent=`http://${d.serverIP}:${d.port}`;
      refreshLobby();
    });
    socket.on('playerJoined', p=>{ mpPlayers[p.id]=p; if(p.id===myId)joined=true; refreshLobby(); });
    socket.on('playersSync',  ps=>{ mpPlayers=ps; refreshLobby(); });
    socket.on('playerLeft',   id=>{ delete mpPlayers[id]; refreshLobby(); });
    socket.on('roundStart', d=>{ mpPlayers=d.players; gameMode='fighting'; players=mpPlayers; hideEnd(); flashMsg('FIGHT!',1800); show('game'); $('mode-ribbon').textContent='⚔ MULTIPLAYER'; $('mode-ribbon').classList.remove('hidden'); $('btn-exit').classList.add('hidden'); });
    socket.on('roundEnd',   d=>{ mpPlayers=d.players; players=mpPlayers; gameMode='roundEnd'; if(d.winner){SFX.win();flashMsg(`${d.winner.name} WINS!`,2300);burst(600,280,70,d.winner.color);}else flashMsg('DRAW',2000); setTimeout(()=>showEnd(d.winner,'Next round starting…'),2500); });
    socket.on('tick',       d=>{ if(appMode!=='multiplayer')return; mpPlayers=d.players; players=mpPlayers; (d.effects||[]).forEach(e=>{burst(e.x,e.y,16,e.color);dmgNum(e.x,e.y-20,e.dmg,e.color);if(e.dmg>=18)shake(8,12);else shake(4,7);}); });
    socket.on('backToLobby', d=>{ mpPlayers=d.players; gameMode='lobby'; players={}; hideEnd(); show('lobby'); refreshLobby(); });
    socket.on('joinError',   m=>alert('⚠ '+m));
  } catch(e){ markOffline(); }
}

function markOnline()  { const d=$('menu-net-text'); if(d) d.textContent='Server connected — Multiplayer available!'; const dot=document.querySelector('.net-dot'); if(dot) dot.style.background='#00f5d4'; }
function markOffline() { const d=$('menu-net-text'); if(d) d.textContent='No server — Training & Demo work offline. Start server for Multiplayer.'; const dot=document.querySelector('.net-dot'); if(dot) dot.style.background='#ef233c'; }

function safeEmit(ev, data) { if(socket&&serverOK) socket.emit(ev, data); }

// ── INPUT ─────────────────────────────────────────────
const keys={};
document.addEventListener('keydown',e=>{keys[e.code]=true; if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();});
document.addEventListener('keyup',  e=>keys[e.code]=false);
function readInput() {
  return { left:!!(keys.ArrowLeft||keys.KeyA), right:!!(keys.ArrowRight||keys.KeyD), jump:!!(keys.ArrowUp||keys.KeyW||keys.Space), attack:!!(keys.KeyZ||keys.KeyJ) };
}
setInterval(()=>{
  if(gameMode==='fighting'&&appMode==='multiplayer') safeEmit('input',readInput());
  if(gameMode==='fighting'&&room&&!room.players['p1']?.isBot) {
    if(room.players['p1']) room.players['p1'].input=readInput();
  }
},1000/60);

// ── PARTICLES ─────────────────────────────────────────
const parts=[], dnums=[];
function burst(x,y,n,color){ for(let i=0;i<n;i++){const a=(Math.PI*2*i/n)+Math.random()*.5,s=2+Math.random()*7;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2.5,life:1,decay:.022+Math.random()*.028,r:1.5+Math.random()*5,color});}}
function dmgNum(x,y,v,color){ dnums.push({x,y,vy:-3.5-Math.random()*2,life:1,decay:.018,v,color}); }

// ── SCREEN SHAKE ──────────────────────────────────────
let shX=0,shY=0,shT=0;
function shake(m,f){if(m>shT*.5){shX=m;shY=m;shT=f;}}

// ── CANVAS ────────────────────────────────────────────
const cv=$('c'), ctx=cv.getContext('2d');

// Stars
const STARS=Array.from({length:90},()=>({x:Math.random()*AW,y:Math.random()*(GY-60),r:Math.random()<.2?1.5:.8,ph:Math.random()*Math.PI*2}));

let tick_n=0;

// ── ARENA ─────────────────────────────────────────────
function drawArena() {
  const sky=ctx.createLinearGradient(0,0,0,GY);
  sky.addColorStop(0,'#050710'); sky.addColorStop(1,'#0d1428');
  ctx.fillStyle=sky; ctx.fillRect(0,0,AW,AH);
  STARS.forEach(s=>{ctx.save();ctx.globalAlpha=.3+.45*Math.sin(s.ph+tick_n*.013);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();});
  // nebula
  const nb=ctx.createRadialGradient(260,200,0,260,200,280); nb.addColorStop(0,'rgba(114,9,183,.13)');nb.addColorStop(1,'transparent'); ctx.fillStyle=nb; ctx.fillRect(0,0,AW,AH);
  const nb2=ctx.createRadialGradient(940,320,0,940,320,240); nb2.addColorStop(0,'rgba(0,245,212,.09)');nb2.addColorStop(1,'transparent'); ctx.fillStyle=nb2; ctx.fillRect(0,0,AW,AH);
  // ground
  const gnd=ctx.createLinearGradient(0,GY,0,AH); gnd.addColorStop(0,'#141830');gnd.addColorStop(1,'#07080e'); ctx.fillStyle=gnd; ctx.fillRect(0,GY,AW,AH-GY);
  ctx.save(); ctx.shadowColor='#00f5d4';ctx.shadowBlur=18;ctx.strokeStyle='#00f5d4';ctx.lineWidth=2; ctx.beginPath();ctx.moveTo(0,GY);ctx.lineTo(AW,GY);ctx.stroke(); ctx.restore();
  ctx.strokeStyle='rgba(0,245,212,.05)';ctx.lineWidth=1;
  for(let x=0;x<AW;x+=80){ctx.beginPath();ctx.moveTo(x,GY);ctx.lineTo(x-50,AH);ctx.stroke();}
  const wl=ctx.createLinearGradient(0,0,70,0); wl.addColorStop(0,'rgba(114,9,183,.18)');wl.addColorStop(1,'transparent'); ctx.fillStyle=wl;ctx.fillRect(0,0,70,AH);
  const wr=ctx.createLinearGradient(AW-70,0,AW,0); wr.addColorStop(0,'transparent');wr.addColorStop(1,'rgba(114,9,183,.18)'); ctx.fillStyle=wr;ctx.fillRect(AW-70,0,70,AH);
}

// ── CHARACTER RENDERER ────────────────────────────────
const ghostT={};
function drawChar(p) {
  const {x,y,color,state,facing,invincible,hp,charClass}=p;
  if(charClass==='phantom'&&(state==='walk'||state==='jump')){
    const tr=ghostT[p.id]||(ghostT[p.id]=[]);
    tr.unshift({x,y}); if(tr.length>6)tr.pop();
    tr.forEach((g,i)=>{ctx.save();ctx.globalAlpha=(i/tr.length)*.15;ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(g.x-13,g.y+PH*.1,26,PH*.7,7);ctx.fill();ctx.restore();});
  }
  if(invincible>0&&Math.floor(tick_n/3)%2===0)return;
  if(hp<=0||state==='dead'){ctx.save();ctx.globalAlpha=.4;ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x-28,y+PH-12,56,18,6);ctx.fill();ctx.restore();return;}
  const bob=state==='idle'?Math.sin(tick_n*.07)*2.5:0;
  const swing=state==='walk'?Math.sin(tick_n*.21):0;
  const sqX=charClass==='titan'?1.28:charClass==='phantom'?.82:charClass==='bruiser'?1.1:1;
  const sqY=state==='jump'?.87:state==='hurt'?1.06:1;
  ctx.save();
  ctx.translate(x,y+PH);
  ctx.scale(facing*sqX,sqY);
  // shadow
  ctx.save();ctx.scale(1,.2);ctx.beginPath();ctx.arc(0,-3,20,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fill();ctx.restore();
  if(state==='attack'){ctx.shadowColor=color;ctx.shadowBlur=26;}
  const bw=charClass==='titan'?28:charClass==='phantom'?20:charClass==='bruiser'?26:24;
  // legs
  ctx.strokeStyle=color;ctx.lineWidth=charClass==='titan'?11:8;ctx.lineCap='round';
  if(state==='walk'){ctx.beginPath();ctx.moveTo(6,-8+bob);ctx.lineTo(9+swing*12,bob);ctx.stroke();ctx.beginPath();ctx.moveTo(-6,-8+bob);ctx.lineTo(-9-swing*12,bob);ctx.stroke();}
  else if(state==='jump'){ctx.beginPath();ctx.moveTo(7,-8+bob);ctx.lineTo(16,-2+bob);ctx.stroke();ctx.beginPath();ctx.moveTo(-7,-8+bob);ctx.lineTo(-16,-2+bob);ctx.stroke();}
  else{ctx.beginPath();ctx.moveTo(6,-8+bob);ctx.lineTo(6,bob);ctx.stroke();ctx.beginPath();ctx.moveTo(-6,-8+bob);ctx.lineTo(-6,bob);ctx.stroke();}
  // body
  ctx.fillStyle=color;
  ctx.beginPath();ctx.roundRect(-bw/2,-PH*.74+bob,bw,38,charClass==='titan'?3:7);ctx.fill();
  if(charClass==='titan'){ctx.fillStyle='rgba(255,255,255,.14)';ctx.beginPath();ctx.roundRect(-bw/2+3,-PH*.7+bob,bw-6,12,2);ctx.fill();ctx.beginPath();ctx.roundRect(-bw/2+3,-PH*.52+bob,bw-6,10,2);ctx.fill();}
  if(charClass==='bruiser'){ctx.fillStyle=color;[-8,0,8].forEach(ox=>{ctx.beginPath();ctx.moveTo(ox,-PH*.74+bob);ctx.lineTo(ox-4,-PH*.74+bob-10);ctx.lineTo(ox+4,-PH*.74+bob-10);ctx.closePath();ctx.fill();});}
  if(charClass==='phantom'){ctx.fillStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.roundRect(-bw/2,-PH*.74+bob,bw,38,7);ctx.fill();}
  // arms
  const aw=charClass==='titan'?10:charClass==='bruiser'?9:8;
  ctx.strokeStyle=color;ctx.lineWidth=aw;ctx.lineCap='round';
  if(state==='attack'){
    const pl=charClass==='titan'?58:charClass==='bruiser'?62:50;
    ctx.beginPath();ctx.moveTo(bw/2-2,-PH*.56+bob);ctx.lineTo(bw/2+pl,-PH*.56+bob);ctx.stroke();
    ctx.save();ctx.shadowColor='#fff';ctx.shadowBlur=24;ctx.fillStyle=color;
    const fr=charClass==='bruiser'?13:charClass==='titan'?12:10;
    ctx.beginPath();ctx.arc(bw/2+pl+fr-2,-PH*.56+bob,fr,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1.5;
    for(let k=0;k<6;k++){const a=(k/6)*Math.PI*2;ctx.beginPath();ctx.moveTo(bw/2+pl+fr-2+Math.cos(a)*(fr+4),-PH*.56+bob+Math.sin(a)*(fr+4));ctx.lineTo(bw/2+pl+fr-2+Math.cos(a)*(fr+11),-PH*.56+bob+Math.sin(a)*(fr+11));ctx.stroke();}
    ctx.restore();
    ctx.strokeStyle=color;ctx.lineWidth=aw;
    ctx.beginPath();ctx.moveTo(-bw/2+2,-PH*.56+bob);ctx.lineTo(-bw/2-22,-PH*.42+bob);ctx.stroke();
  } else if(state==='jump'){
    ctx.beginPath();ctx.moveTo(bw/2,-PH*.56+bob);ctx.lineTo(bw/2+22,-PH*.78+bob);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-bw/2,-PH*.56+bob);ctx.lineTo(-bw/2-22,-PH*.78+bob);ctx.stroke();
  } else {
    const sw=state==='walk'?-swing*14:Math.sin(tick_n*.065)*4;
    ctx.beginPath();ctx.moveTo(bw/2,-PH*.56+bob);ctx.lineTo(bw/2+22,-PH*.42+bob+sw);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-bw/2,-PH*.56+bob);ctx.lineTo(-bw/2-22,-PH*.42+bob-sw);ctx.stroke();
  }
  // head
  const hr=charClass==='titan'?18:charClass==='bruiser'?17:15;
  ctx.fillStyle=color;ctx.shadowBlur=state==='attack'?20:0;
  ctx.beginPath();ctx.arc(0,-PH*.87+bob,hr,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  if(state==='hurt'){ctx.fillStyle='rgba(255,30,30,.55)';ctx.beginPath();ctx.arc(0,-PH*.87+bob,hr,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(6,-PH*.89+bob,5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.arc(7.5,-PH*.89+bob,2.8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(8.6,-PH*.92+bob,1.1,0,Math.PI*2);ctx.fill();
  if(charClass==='titan'){ctx.fillStyle=color;ctx.shadowBlur=0;[-bw/2-2,bw/2+2].forEach(ox=>{ctx.beginPath();ctx.arc(ox,-PH*.68+bob,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,.2)';ctx.beginPath();ctx.arc(ox,-PH*.68+bob,4,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;});}
  if(charClass==='phantom'){ctx.save();ctx.globalAlpha=.15+Math.sin(tick_n*.15)*.06;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-PH*.4+bob,PH*.6,0,Math.PI*2);ctx.stroke();ctx.restore();}
  ctx.restore();
  // name tag
  ctx.save();ctx.font='bold 11px Segoe UI,sans-serif';ctx.textAlign='center';
  const tag=(p.id===myId?'★ ':'')+p.name+(p.isBot?' 🤖':'');
  const tw=ctx.measureText(tag).width;
  ctx.fillStyle='rgba(0,0,0,.62)';ctx.beginPath();ctx.roundRect(x-tw/2-7,y-92,tw+14,20,4);ctx.fill();
  ctx.fillStyle=p.id===myId?'#ffd60a':p.isBot?'#aaa':'#e2e8f0';
  ctx.fillText(tag,x,y-76);ctx.restore();
}

// ── HUD ───────────────────────────────────────────────
function drawHUD() {
  const list=Object.values(players); if(!list.length)return;
  const bw=Math.min(185,(AW-40)/list.length-10);
  let bx=(AW-list.length*(bw+10)+10)/2;
  list.forEach(p=>{
    ctx.fillStyle='rgba(7,8,14,.8)';ctx.beginPath();ctx.roundRect(bx,12,bw,46,8);ctx.fill();
    ctx.strokeStyle=p.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(bx,12,bw,46,8);ctx.stroke();
    ctx.font='bold 10px Segoe UI';ctx.textAlign='left';
    ctx.fillStyle=p.id===myId?'#ffd60a':p.isBot?'#aaa':'#e2e8f0';
    ctx.fillText((p.id===myId?'★ ':'')+p.name.slice(0,12),bx+8,26);
    ctx.fillStyle=p.color;ctx.textAlign='right';ctx.fillText(`${p.kills||0} KO`,bx+bw-8,26);
    ctx.fillStyle='rgba(255,0,0,.18)';ctx.beginPath();ctx.roundRect(bx+8,30,bw-16,13,4);ctx.fill();
    const ratio=Math.max(0,(p.hp||0)/(p.maxHp||100));
    const hc=ratio>.5?'#00f5d4':ratio>.25?'#ffd60a':'#ef233c';
    ctx.save();ctx.shadowColor=hc;ctx.shadowBlur=6;ctx.fillStyle=hc;ctx.beginPath();ctx.roundRect(bx+8,30,(bw-16)*ratio,13,4);ctx.fill();ctx.restore();
    ctx.fillStyle='rgba(255,255,255,.8)';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText(Math.ceil(Math.max(0,p.hp||0)),bx+bw/2,41);
    ctx.fillStyle='rgba(255,255,255,.22)';ctx.font='7px monospace';ctx.textAlign='left';ctx.fillText((p.charClass||'').toUpperCase(),bx+8,52);
    bx+=bw+10;
  });
}

// ── RENDER LOOP ───────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  tick_n++;

  if(!$('screen-game').classList.contains('active')){
    drawMenuBg(); animatePreviews(); return;
  }
  let sx=0,sy=0;
  if(shT>0){sx=(Math.random()-.5)*shX;sy=(Math.random()-.5)*shY;shT--;if(shT===0){shX=shY=0;}}
  ctx.save(); ctx.translate(sx,sy); ctx.clearRect(-20,-20,AW+40,AH+40);
  drawArena();
  Object.values(players).forEach(p=>drawChar(p));
  // particles
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.28;p.vx*=.95;p.life-=p.decay;if(p.life<=0)parts.splice(i,1);}
  parts.forEach(p=>{ctx.save();ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();});
  // dmg nums
  for(let i=dnums.length-1;i>=0;i--){const d=dnums[i];d.y+=d.vy;d.vy*=.9;d.life-=d.decay;if(d.life<=0){dnums.splice(i,1);continue;}ctx.save();ctx.globalAlpha=Math.min(1,d.life*2);ctx.font=`bold ${d.v>=18?22:15}px Segoe UI`;ctx.fillStyle=d.v>=18?'#ff3030':d.color;ctx.shadowColor=d.color;ctx.shadowBlur=10;ctx.textAlign='center';ctx.fillText(`-${d.v}`,d.x,d.y);ctx.restore();}
  if(appMode==='demo'){ctx.save();ctx.globalAlpha=.1+Math.sin(tick_n*.04)*.06;ctx.font=`bold ${Math.floor(AW/8)}px Segoe UI`;ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('DEMO',AW/2,AH/2);ctx.restore();}
  drawHUD();
  if(appMode!=='demo'){ctx.save();ctx.fillStyle='rgba(7,8,14,.6)';ctx.beginPath();ctx.roundRect(10,AH-30,340,20,4);ctx.fill();ctx.fillStyle='rgba(0,245,212,.6)';ctx.font='10.5px monospace';ctx.textAlign='left';ctx.fillText('← →/AD Move   ↑/W/Space Jump   Z/J Attack',18,AH-15);ctx.restore();}
  ctx.restore();
}

// ── MENU BACKGROUND ───────────────────────────────────
const mbCv=$('menu-bg');
mbCv.width=window.innerWidth; mbCv.height=window.innerHeight;
const mbCtx=mbCv.getContext('2d');
const mbP=Array.from({length:30},()=>({x:Math.random()*mbCv.width,y:Math.random()*mbCv.height,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,r:Math.random()*2+.5,life:Math.random(),color:['#00f5d4','#7209b7','#f72585','#ffd60a'][Math.floor(Math.random()*4)]}));
function drawMenuBg(){
  if(!$('screen-menu').classList.contains('active'))return;
  const mw=mbCv.width,mh=mbCv.height;
  mbCtx.clearRect(0,0,mw,mh);
  const bg=mbCtx.createLinearGradient(0,0,0,mh);bg.addColorStop(0,'#05060d');bg.addColorStop(1,'#0a0e1e');mbCtx.fillStyle=bg;mbCtx.fillRect(0,0,mw,mh);
  mbP.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life+=.005;if(p.x<0)p.x=mw;if(p.x>mw)p.x=0;if(p.y<0)p.y=mh;if(p.y>mh)p.y=0;const a=.3+Math.sin(p.life*2)*.2;mbCtx.save();mbCtx.globalAlpha=a;mbCtx.fillStyle=p.color;mbCtx.shadowColor=p.color;mbCtx.shadowBlur=8;mbCtx.beginPath();mbCtx.arc(p.x,p.y,p.r,0,Math.PI*2);mbCtx.fill();mbCtx.restore();});
}

// ── CHARACTER SELECT CARDS ────────────────────────────
const prevCvs={};
let selClass='striker', selColor='#FF6B6B';

function buildCards(){
  const cont=$('char-cards'); cont.innerHTML='';
  Object.entries(CHARS).forEach(([cls,def])=>{
    const card=document.createElement('div');
    card.className='char-card'+(cls===selClass?' active':'');
    card.dataset.class=cls;
    card.style.setProperty('--card-color',cls===selClass?selColor:def.color);
    const cvs=document.createElement('canvas');cvs.className='char-preview';cvs.width=120;cvs.height=140;
    prevCvs[cls]=cvs;
    const stats=Object.entries(def.stats).map(([k,v])=>`<div class="stat-row"><span class="stat-label">${k}</span><div class="stat-bar"><div class="stat-fill" style="width:${v}%"></div></div></div>`).join('');
    card.innerHTML=`<h3 class="char-class-name">${def.label}</h3><p class="char-desc">${def.desc}</p><div class="char-stats">${stats}</div>`;
    card.insertBefore(cvs,card.firstChild);
    card.addEventListener('click',()=>{selClass=cls;selColor=def.color;buildCards();});
    cont.appendChild(card);
  });
  const pal=$('color-palette');pal.innerHTML='';
  PALETTE.forEach(hex=>{
    const sw=document.createElement('div');sw.className='color-swatch'+(hex===selColor?' active':'');sw.style.background=hex;sw.style.setProperty('--swatch-color',hex);sw.title=hex;
    sw.addEventListener('click',()=>{selColor=hex;document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));sw.classList.add('active');});
    pal.appendChild(sw);
  });
  const ci=document.createElement('input');ci.type='color';ci.className='color-custom';ci.value=selColor;ci.addEventListener('input',e=>selColor=e.target.value);pal.appendChild(ci);
}

function animatePreviews(){
  if(!$('screen-char').classList.contains('active'))return;
  Object.entries(CHARS).forEach(([cls,def])=>{
    const cvs=prevCvs[cls];if(!cvs)return;
    const c=cvs.getContext('2d');
    c.clearRect(0,0,120,140);
    const color=cls===selClass?selColor:def.color;
    const bob=Math.sin(tick_n*.07)*2;
    // ground
    c.fillStyle='rgba(0,245,212,.08)';c.fillRect(0,118,120,2);
    // shadow
    c.save();c.scale(1,.2);c.beginPath();c.arc(60,585,16,0,Math.PI*2);c.fillStyle='rgba(0,0,0,.3)';c.fill();c.restore();
    const bw=cls==='titan'?26:cls==='phantom'?18:cls==='bruiser'?24:22;
    // legs
    c.strokeStyle=color;c.lineWidth=cls==='titan'?8:6;c.lineCap='round';
    const ls=Math.sin(tick_n*.1)*4;
    c.beginPath();c.moveTo(63,84+bob);c.lineTo(66+ls,116+bob);c.stroke();
    c.beginPath();c.moveTo(57,84+bob);c.lineTo(54-ls,116+bob);c.stroke();
    // body
    c.fillStyle=color;c.beginPath();c.roundRect(60-bw/2,50+bob,bw,34,cls==='titan'?2:6);c.fill();
    if(cls==='titan'){c.fillStyle='rgba(255,255,255,.15)';c.beginPath();c.roundRect(60-bw/2+2,52+bob,bw-4,10,2);c.fill();}
    if(cls==='phantom'){c.save();c.globalAlpha=.18+Math.sin(tick_n*.15)*.06;c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(60,67+bob,38,0,Math.PI*2);c.stroke();c.restore();}
    if(cls==='bruiser'){c.fillStyle=color;[-6,0,6].forEach(ox=>{c.beginPath();c.moveTo(60+ox,50+bob);c.lineTo(60+ox-3,41+bob);c.lineTo(60+ox+3,41+bob);c.closePath();c.fill();});}
    // arms
    const sw=Math.sin(tick_n*.12)*5;
    c.strokeStyle=color;c.lineWidth=cls==='titan'?9:7;
    c.beginPath();c.moveTo(60+bw/2,62+bob);c.lineTo(60+bw/2+18,70+bob+sw);c.stroke();
    c.beginPath();c.moveTo(60-bw/2,62+bob);c.lineTo(60-bw/2-18,70+bob-sw);c.stroke();
    // titan shoulder pads
    if(cls==='titan'){c.fillStyle=color;[-bw/2-2,bw/2+2].forEach(ox=>{c.beginPath();c.arc(60+ox,62+bob,8,0,Math.PI*2);c.fill();});}
    // head
    const hr=cls==='titan'?14:cls==='bruiser'?13:12;
    c.fillStyle=color;c.beginPath();c.arc(60,38+bob,hr,0,Math.PI*2);c.fill();
    c.fillStyle='#fff';c.beginPath();c.arc(64,36+bob,4,0,Math.PI*2);c.fill();
    c.fillStyle='#111';c.beginPath();c.arc(65,36+bob,2,0,Math.PI*2);c.fill();
    c.fillStyle='#fff';c.beginPath();c.arc(65.8,35.2+bob,.9,0,Math.PI*2);c.fill();
  });
}

// ── LOBBY UI ──────────────────────────────────────────
function refreshLobby(){
  const list=Object.values(mpPlayers);
  $('panel-count').textContent=`${list.length} / 8`;
  const sl=$('player-slots');sl.innerHTML='';
  if(!list.length){sl.innerHTML='<p class="empty-hint">No fighters yet — be first!</p>';}
  else list.forEach(p=>{const el=document.createElement('div');el.className='player-slot';el.innerHTML=`<div class="slot-dot" style="background:${p.color}"></div><span class="slot-name">${esc(p.name)}</span><span class="slot-class">${(p.charClass||'?').toUpperCase()}</span>${p.id===myId?'<span class="slot-you">YOU</span>':'<span class="slot-ready">READY</span>'}`;sl.appendChild(el);});
  const btn=$('btn-start');
  if(list.length>=2&&joined){btn.disabled=false;btn.classList.add('ready');btn.textContent=`⚔ START GAME — ${list.length} PLAYERS`;}
  else{btn.disabled=true;btn.classList.remove('ready');btn.textContent=list.length>=2?'Join first':'Need at least 2 players';}
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── OVERLAYS ──────────────────────────────────────────
let msgT=null;
function flashMsg(txt,ms){$('overlay-text').textContent=txt;$('overlay-msg').classList.remove('hidden');clearTimeout(msgT);msgT=setTimeout(()=>$('overlay-msg').classList.add('hidden'),ms);}
function showEnd(winner,hint){
  $('overlay-end').classList.remove('hidden');
  $('end-title').textContent=winner?(winner.isBot?`${winner.name} wins!`:'You win the round!'):'Draw!';
  $('end-hint').textContent=hint||'Next round starting…';
  $('end-scores').innerHTML='';
}
function hideEnd(){$('overlay-end').classList.add('hidden');$('overlay-msg').classList.add('hidden');}

// ── BUTTON WIRING ─────────────────────────────────────
let pendingMode='training';

$('btn-multiplayer').addEventListener('click',()=>{
  ac(); pendingMode='multiplayer';
  if(serverOK){ buildCards(); show('char'); return; }
  // Lazy-load socket.io only when multiplayer is clicked
  const existing=document.querySelector('script[data-sio]');
  if(existing){ alert('⚠ Still connecting to server…\nMake sure START-GAME.bat is running, then try again.'); return; }
  const s=document.createElement('script');
  s.dataset.sio='1';
  s.src='http://localhost:3000/socket.io/socket.io.js';
  s.onload=()=>{
    initSocket();
    setTimeout(()=>{
      if(serverOK){ buildCards(); show('char'); }
      else { alert('⚠ Server not responding.\n\nSetup:\n1. Install Node.js from nodejs.org\n2. Double-click START-GAME.bat'); }
    },1500);
  };
  s.onerror=()=>alert('⚠ No server found.\n\nSetup:\n1. Install Node.js from nodejs.org\n2. Double-click START-GAME.bat');
  document.head.appendChild(s);
});
$('btn-training').addEventListener('click',()=>{ac();pendingMode='training';buildCards();show('char');});
$('btn-demo').addEventListener('click',()=>{ac();launchDemo();});

$('char-back').addEventListener('click',()=>show('menu'));
$('char-continue').addEventListener('click',()=>{
  if(pendingMode==='multiplayer') goLobby();
  else show('diff');
});
$('char-name').addEventListener('keydown',e=>{if(e.key==='Enter')$('char-continue').click();});

$('diff-back').addEventListener('click',()=>show('char'));
document.querySelectorAll('.diff-card').forEach(card=>{
  card.addEventListener('click',()=>{
    const diff=card.dataset.diff;
    const name=$('char-name').value.trim()||'Fighter';
    launchTraining(name,selClass,selColor,diff);
  });
});

$('lobby-back').addEventListener('click',()=>{joined=false;show('menu');});
$('btn-start').addEventListener('click',()=>safeEmit('startGame'));

$('btn-exit').addEventListener('click',()=>{
  stopRoom(); appMode='menu'; players={};
  safeEmit('exitSolo');
  hideEnd(); show('menu');
  $('mode-ribbon').classList.add('hidden');
  $('btn-exit').classList.add('hidden');
});


// Auto-join when navigating to lobby
function goLobby(){
  show('lobby');
  if(!joined&&serverOK){
    const name=$('char-name').value.trim()||'Fighter';
    appMode='multiplayer';
    safeEmit('join',{name,charClass:selClass,color:selColor});
  }
}

// ── INIT ──────────────────────────────────────────────
buildCards();
markOffline();   // Training & Demo work offline; server needed for Multiplayer
loop();          // start render loop immediately
