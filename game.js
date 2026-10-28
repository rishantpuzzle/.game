import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const ui = {
  loading: $('loading'), menu: $('menu'), hud: $('hud'), pause: $('pause-menu'), result: $('result-menu'),
  play: $('play-btn'), pauseBtn: $('pause-btn'), resume: $('resume-btn'), restart: $('restart-btn'), home: $('home-btn'),
  again: $('again-btn'), resultHome: $('result-home-btn'), healthFill: $('health-fill'), healthText: $('health-text'),
  botsLeft: $('bots-left'), toast: $('toast'), resultTitle: $('result-title'), resultCopy: $('result-copy'),
  joystickZone: $('joystick-zone'), joystickBase: $('joystick-base'), joystickKnob: $('joystick-knob'),
  fire: $('fire-btn'), jump: $('jump-btn')
};

let scene, camera, renderer, clock, player, ground, raycaster;
let bots = [], obstacles = [], bullets = [], decorations = [];
let running = false, gameOver = false, paused = false, started = false;
let health = 100, kills = 0, lastShot = 0, toastTimer = null;
let yaw = 0, pitch = -0.15, cameraDistance = 6.5, velocityY = 0, grounded = true;
const keys = Object.create(null);
const moveInput = new THREE.Vector2();
const lookInput = { active: false, lastX: 0, lastY: 0, pointerId: null };
let joystickPointer = null, joystickOrigin = {x:0,y:0};
const WORLD = 115;

function makeMaterial(color, roughness=0.9) { return new THREE.MeshStandardMaterial({ color, roughness }); }
function addBox(x,y,z,sx,sy,sz,material,cast=true,receive=true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), material);
  mesh.position.set(x,y,z); mesh.castShadow=cast; mesh.receiveShadow=receive; scene.add(mesh);
  obstacles.push({mesh, box:new THREE.Box3().setFromObject(mesh)}); return mesh;
}
function makeBuilding(x,z,w,d,h,color) {
  const wall = makeMaterial(color), roof = makeMaterial(0x66584a), dark = makeMaterial(0x343d3a);
  addBox(x,h/2,z,w,h,d,wall);
  const top = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*0.78, h*0.42, 4), roof);
  top.rotation.y=Math.PI/4; top.position.set(x,h+h*0.18,z); top.castShadow=true; scene.add(top);
  const door = new THREE.Mesh(new THREE.BoxGeometry(w*0.18,h*0.52,0.12),dark); door.position.set(x,h*0.26,z+d/2+0.07); scene.add(door);
  const windowMat = new THREE.MeshStandardMaterial({color:0x8db5b6, roughness:0.3, metalness:0.2});
  for (const side of [-1,1]) { const win=new THREE.Mesh(new THREE.BoxGeometry(w*0.17,h*0.18,0.08),windowMat);win.position.set(x+side*w*0.29,h*0.63,z+d/2+0.07);scene.add(win); }
}
function makeTree(x,z,scale=1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18*scale,.27*scale,1.8*scale,7),makeMaterial(0x72533a));
  trunk.position.set(x,.9*scale,z); trunk.castShadow=true; scene.add(trunk);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.05*scale,8,7),makeMaterial([0x365b36,0x426c3b,0x567c42][Math.floor(Math.random()*3)]));
  leaves.position.set(x,2.05*scale,z); leaves.castShadow=true; leaves.receiveShadow=true; scene.add(leaves);
  decorations.push({x,z,r:.7*scale});
}
function makeRock(x,z,s=1) {
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),makeMaterial(0x777e75));rock.position.set(x,s*.55,z);rock.scale.y=.65;rock.rotation.set(Math.random(),Math.random(),Math.random());rock.castShadow=true;scene.add(rock);decorations.push({x,z,r:s*.7});
}
function createWorld() {
  scene.background = new THREE.Color(0x9dbeb2);
  scene.fog = new THREE.Fog(0x9dbeb2, 52, 150);
  const hemi = new THREE.HemisphereLight(0xe7f5ed,0x63714d,2.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d3,3.1); sun.position.set(-28,48,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=75;sun.shadow.camera.bottom=-75;sun.shadow.bias=-0.0002;scene.add(sun);
  const groundMat=makeMaterial(0x708b55); ground=new THREE.Mesh(new THREE.PlaneGeometry(WORLD,WORLD),groundMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  // Sandy practice roads
  const roadMat=makeMaterial(0xb8a77d);
  const road1=new THREE.Mesh(new THREE.PlaneGeometry(15,WORLD),roadMat);road1.rotation.x=-Math.PI/2;road1.position.y=.012;road1.position.x=4;scene.add(road1);
  const road2=new THREE.Mesh(new THREE.PlaneGeometry(WORLD,12),roadMat);road2.rotation.x=-Math.PI/2;road2.position.y=.014;road2.position.z=-7;scene.add(road2);
  // A shallow river and banks
  const bankMat=makeMaterial(0x9b9a6b), waterMat=new THREE.MeshStandardMaterial({color:0x4d9fba,roughness:.25,metalness:.1,transparent:true,opacity:.92});
  const bank=new THREE.Mesh(new THREE.PlaneGeometry(12,WORLD),bankMat);bank.rotation.x=-Math.PI/2;bank.position.set(-31,.025,0);scene.add(bank);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(7,WORLD),waterMat);water.rotation.x=-Math.PI/2;water.position.set(-31,.04,0);scene.add(water);
  const roadEdge=makeMaterial(0xd0bd8c);
  for(let z=-WORLD/2;z<WORLD/2;z+=8){let dash=new THREE.Mesh(new THREE.BoxGeometry(.22,.03,3),roadEdge);dash.position.set(4,.035,z);scene.add(dash)}
  // Training village buildings
  const houses=[[-20,-19,8,7,4.2,0xc6b38d],[-8,-24,7,8,4.5,0xd1c39f],[17,-21,9,7,4.4,0xbca681],[24,-5,8,8,4.7,0xd3c49e],[17,19,8,7,4.1,0xb8a17b],[-13,21,10,8,4.5,0xc7b993],[-25,7,7,9,4,0xb9ad8e],[1,28,8,7,4.2,0xd4c6a4]];
  houses.forEach(h=>makeBuilding(...h));
  // low walls and cover barriers
  const wallMat=makeMaterial(0x827d69);
  for(const [x,z,rot] of [[-7,5,0],[11,6,.2],[27,9,.1],[-20,-4,0],[9,-31,.1]]){
    const wall=addBox(x,.65,z,5,1.3,.45,wallMat);wall.rotation.y=rot;
  }
  // trees around the perimeter and scattered cover
  for(let i=0;i<58;i++){
    let x=(Math.random()-.5)*105,z=(Math.random()-.5)*105;
    if(Math.abs(x)<34 && Math.abs(z)<36) continue;
    if(x>-38&&x<-24)continue;
    makeTree(x,z,.75+Math.random()*.65);
  }
  for(let i=0;i<23;i++){
    const x=(Math.random()-.5)*85,z=(Math.random()-.5)*85;
    if(Math.abs(x)<12&&Math.abs(z)<12)continue;
    makeRock(x,z,.45+Math.random()*.7);
  }
  // Distant hills
  const hillMat=makeMaterial(0x71886b);
  for(let i=0;i<18;i++){
    const a=i/18*Math.PI*2,r=73+Math.random()*12,s=7+Math.random()*11;
    const hill=new THREE.Mesh(new THREE.SphereGeometry(s,9,7),hillMat);hill.scale.y=.55;hill.position.set(Math.cos(a)*r,s*.2,Math.sin(a)*r);scene.add(hill);
  }
  // simple training range target boards
  for(const [x,z] of [[-7,-39],[5,-42],[17,-38]]){
    const post= new THREE.Mesh(new THREE.BoxGeometry(.16,2,.16),makeMaterial(0x654a32));post.position.set(x,1,z);scene.add(post);
    const board=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.15,.15),makeMaterial(0xd4d0b5));board.position.set(x,1.7,z);scene.add(board);
    const bull=new THREE.Mesh(new THREE.CircleGeometry(.24,16),makeMaterial(0xb94b3f));bull.position.set(x,1.7,z+.09);scene.add(bull);
  }
}
function makePlayer() {
  const group=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.8,5,8),makeMaterial(0x354d43));body.position.y=1.2;body.castShadow=true;group.add(body);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(.67,.52,.42),makeMaterial(0x776f48));vest.position.set(0,1.25,0);vest.castShadow=true;group.add(vest);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,10),makeMaterial(0xc58e68));head.position.y=1.92;head.castShadow=true;group.add(head);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.3,12,8,0,Math.PI*2,0,Math.PI*.58),makeMaterial(0x4b634b));helmet.position.y=2.03;helmet.castShadow=true;group.add(helmet);
  const gun=new THREE.Mesh(new THREE.BoxGeometry(.14,.16,1.05),makeMaterial(0x222a28,.45));gun.position.set(.42,1.42,-.5);gun.castShadow=true;group.add(gun);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.5,8),makeMaterial(0x141918,.45));barrel.rotation.x=Math.PI/2;barrel.position.set(.42,1.43,-1.18);group.add(barrel);
  group.position.set(0,0,0);scene.add(group);return group;
}
function makeBot(index) {
  const group=new THREE.Group();
  const palette=[0x7c493a,0x435c73,0x75613c,0x684e72,0x536a47,0x785b4a];
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.75,4,7),makeMaterial(palette[index%palette.length]));body.position.y=1.15;body.castShadow=true;group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.25,10,8),makeMaterial(0xb98261));head.position.y=1.85;head.castShadow=true;group.add(head);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.27,10,7,0,Math.PI*2,0,Math.PI*.55),makeMaterial(0x343c35));helmet.position.y=1.96;group.add(helmet);
  const gun=new THREE.Mesh(new THREE.BoxGeometry(.12,.13,.8),makeMaterial(0x252a27));gun.position.set(.32,1.35,-.35);group.add(gun);
  const hpbg=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.1),new THREE.MeshBasicMaterial({color:0x291f1c,side:THREE.DoubleSide}));hpbg.position.y=2.45;group.add(hpbg);
  const hpfill=new THREE.Mesh(new THREE.PlaneGeometry(.98,.055),new THREE.MeshBasicMaterial({color:0xc9f45b,side:THREE.DoubleSide}));hpfill.position.set(0,2.45,.012);group.add(hpfill);
  const bot={group,body,head,hpfill,hp:100,maxHp:100,speed:1.1+Math.random()*.35,attack:0,alive:true,phase:Math.random()*10,index};
  const positions=[[-17,2],[18,1],[-2,-18],[26,18],[-23,17],[11,-29]];
  group.position.set(positions[index][0],0,positions[index][1]);scene.add(group);return bot;
}
function resetGame() {
  bots.forEach(b=>scene.remove(b.group));bots=[];
  bullets.forEach(b=>scene.remove(b.mesh));bullets=[];
  health=100;kills=0;gameOver=false;paused=false;yaw=0;pitch=-.12;velocityY=0;grounded=true;
  player.position.set(0,0,0);player.rotation.y=0;
  bots=Array.from({length:6},(_,i)=>makeBot(i));
  ui.healthFill.style.width='100%';ui.healthText.textContent='100 / 100';ui.botsLeft.textContent='6';
  ui.result.classList.add('hidden');ui.pause.classList.add('hidden');ui.hud.classList.remove('hidden');ui.menu.classList.add('hidden');
  running=true;started=true;showToast('TRAINING STARTED — GOOD LUCK');clock.getDelta();
}
function showToast(message) {
  ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1900);
}
function pauseGame() {if(!started||gameOver)return;paused=true;running=false;ui.pause.classList.remove('hidden');}
function resumeGame() {if(gameOver)return;paused=false;running=true;ui.pause.classList.add('hidden');clock.getDelta();}
function goHome() {running=false;paused=false;started=false;ui.hud.classList.add('hidden');ui.pause.classList.add('hidden');ui.result.classList.add('hidden');ui.menu.classList.remove('hidden');}
function endGame(won) {running=false;gameOver=true;ui.resultTitle.textContent=won?'TRAINING COMPLETE':'MISSION FAILED';ui.resultCopy.textContent=won?`All training bots eliminated. Score: ${kills} / 6.`:'Your health reached zero. Head back in and try again.';ui.result.classList.remove('hidden');}
function clampWorld(obj) {obj.position.x=THREE.MathUtils.clamp(obj.position.x,-WORLD/2+3,WORLD/2-3);obj.position.z=THREE.MathUtils.clamp(obj.position.z,-WORLD/2+3,WORLD/2-3);}
function updatePlayer(dt) {
  let forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+moveInput.y;
  let side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+moveInput.x;
  const inputLen=Math.hypot(forward,side);if(inputLen>1){forward/=inputLen;side/=inputLen;}
  const dirForward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const dirRight=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const speed=(keys.ShiftLeft||keys.ShiftRight)?9:6.2;
  const delta=dirForward.multiplyScalar(forward).add(dirRight.multiplyScalar(side)).multiplyScalar(speed*dt);
  const next=player.position.clone().add(delta);
  // Approximate obstacle collision for player against building/wall boxes
  const pbox=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(next.x,1,next.z),new THREE.Vector3(.75,1.8,.75));
  let blocked=false;
  for(const o of obstacles){if(o.box.intersectsBox(pbox)){blocked=true;break;}}
  if(!blocked){player.position.x=next.x;player.position.z=next.z;}
  clampWorld(player);
  if(inputLen>.08){player.rotation.y=yaw;}
  if(!grounded){velocityY-=18*dt;player.position.y+=velocityY*dt;if(player.position.y<=0){player.position.y=0;velocityY=0;grounded=true;}}
  // camera follows behind and above player
  const target=new THREE.Vector3(player.position.x,player.position.y+1.55,player.position.z);
  const horizontal=Math.cos(pitch)*cameraDistance;
  const desired=new THREE.Vector3(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(-pitch)*cameraDistance,target.z+Math.cos(yaw)*horizontal);
  camera.position.lerp(desired,1-Math.exp(-dt*9));camera.lookAt(target);
}
function shoot() {
  if(!running||gameOver)return;
  const now=performance.now();if(now-lastShot<210)return;lastShot=now;
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const targets=[];
  bots.filter(b=>b.alive).forEach(b=>{targets.push(b.head,b.body)});
  const hits=raycaster.intersectObjects(targets,false);
  const origin=new THREE.Vector3(player.position.x,player.position.y+1.45,player.position.z);
  let end=raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(55));
  if(hits.length){end.copy(hits[0].point);const bot=bots.find(b=>b.alive&&(b.head===hits[0].object||b.body===hits[0].object));if(bot)damageBot(bot,34);}
  // short visible tracer
  const points=[origin,end];const geo=new THREE.BufferGeometry().setFromPoints(points);const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xd9ff83,transparent:true,opacity:.9}));scene.add(line);bullets.push({mesh:line,life:.075});
  // small muzzle flash at player's gun
  showToast(hits.length?'HIT CONFIRMED':'');
}
function damageBot(bot,amount) {
  bot.hp-=amount;bot.hpfill.scale.x=Math.max(0,bot.hp/bot.maxHp);bot.hpfill.position.x=-(1-Math.max(0,bot.hp/bot.maxHp))*.49;
  if(bot.hp<=0){bot.alive=false;scene.remove(bot.group);kills++;ui.botsLeft.textContent=String(bots.filter(b=>b.alive).length);showToast('BOT ELIMINATED');if(kills===6)endGame(true);}
}
function updateBots(dt) {
  const playerPos=player.position;
  bots.forEach(bot=>{
    if(!bot.alive)return;
    const pos=bot.group.position;const dx=playerPos.x-pos.x,dz=playerPos.z-pos.z;const dist=Math.hypot(dx,dz);
    bot.phase+=dt;
    if(dist>4.2){const speed=bot.speed*(dist>18?1.15:.75);pos.x+=(dx/(dist||1))*speed*dt;pos.z+=(dz/(dist||1))*speed*dt;bot.group.rotation.y=Math.atan2(-dx,-dz);}
    else {bot.group.rotation.y=Math.atan2(-dx,-dz);bot.attack+=dt;if(bot.attack>1.35){bot.attack=0;if(Math.random()<.6){health=Math.max(0,health-5);ui.healthFill.style.width=health+'%';ui.healthText.textContent=`${health} / 100`;if(health<35)ui.healthFill.style.background='var(--red)';if(health===0)endGame(false);}}}
    // Keep bots inside the playable field and outside river
    pos.x=THREE.MathUtils.clamp(pos.x,-WORLD/2+4,WORLD/2-4);pos.z=THREE.MathUtils.clamp(pos.z,-WORLD/2+4,WORLD/2-4);
    if(pos.x<-26&&pos.x>-36)pos.x=pos.x<-31?-36:-26;
    bot.group.position.y=Math.abs(Math.sin(bot.phase*4))*.025;
    bot.group.children.forEach(child=>{if(child.geometry.type==='PlaneGeometry')child.lookAt(camera.position);});
  });
}
function updateBullets(dt) {for(let i=bullets.length-1;i>=0;i--){bullets[i].life-=dt;if(bullets[i].life<=0){scene.remove(bullets[i].mesh);bullets.splice(i,1);}}}
function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  if(running){updatePlayer(dt);updateBots(dt);updateBullets(dt);}
  else if(player&&camera&&started&&!gameOver){camera.lookAt(player.position.x,player.position.y+1.5,player.position.z);}
  if(renderer)renderer.render(scene,camera);
}
function setLookFromPointer(dx,dy){yaw-=dx*.003;pitch-=dy*.0025;pitch=THREE.MathUtils.clamp(pitch,-.65,.38);}
function bindControls() {
  window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&running&&grounded){velocityY=7.2;grounded=false;}if(e.code==='Escape'&&started&&!gameOver){paused?resumeGame():pauseGame();}});
  window.addEventListener('keyup',e=>keys[e.code]=false);
  renderer.domElement.addEventListener('click',()=>{if(running&&!isTouchDevice()&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.();});
  document.addEventListener('mousemove',e=>{if(running&&document.pointerLockElement===renderer.domElement)setLookFromPointer(e.movementX,e.movementY);});
  renderer.domElement.addEventListener('mousedown',e=>{if(e.button===0&&running&&!isTouchDevice())shoot();});
  renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  ui.play.addEventListener('click',resetGame);ui.pauseBtn.addEventListener('click',pauseGame);ui.resume.addEventListener('click',resumeGame);ui.restart.addEventListener('click',resetGame);ui.home.addEventListener('click',goHome);ui.again.addEventListener('click',resetGame);ui.resultHome.addEventListener('click',goHome);
  ui.fire.addEventListener('pointerdown',e=>{e.preventDefault();shoot();});ui.jump.addEventListener('pointerdown',e=>{e.preventDefault();if(running&&grounded){velocityY=7.2;grounded=false;}});
  // Touch joystick
  ui.joystickZone.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;ui.joystickZone.setPointerCapture?.(e.pointerId);const rect=ui.joystickBase.getBoundingClientRect();joystickOrigin={x:rect.left+rect.width/2,y:rect.top+rect.height/2};updateJoystick(e.clientX,e.clientY);});
  ui.joystickZone.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer){e.preventDefault();updateJoystick(e.clientX,e.clientY);}});
  const releaseJoy=e=>{if(e.pointerId===joystickPointer){joystickPointer=null;moveInput.set(0,0);ui.joystickKnob.style.transform='translate(0px,0px)';}};
  ui.joystickZone.addEventListener('pointerup',releaseJoy);ui.joystickZone.addEventListener('pointercancel',releaseJoy);
  // Drag on the right side to rotate the camera
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.clientX>window.innerWidth*.38){lookInput.active=true;lookInput.pointerId=e.pointerId;lookInput.lastX=e.clientX;lookInput.lastY=e.clientY;}});
  renderer.domElement.addEventListener('pointermove',e=>{if(lookInput.active&&e.pointerId===lookInput.pointerId){const dx=e.clientX-lookInput.lastX,dy=e.clientY-lookInput.lastY;setLookFromPointer(dx,dy);lookInput.lastX=e.clientX;lookInput.lastY=e.clientY;}});
  const stopLook=e=>{if(e.pointerId===lookInput.pointerId){lookInput.active=false;lookInput.pointerId=null;}};
  renderer.domElement.addEventListener('pointerup',stopLook);renderer.domElement.addEventListener('pointercancel',stopLook);
  window.addEventListener('resize',onResize);
}
function updateJoystick(x,y){const dx=x-joystickOrigin.x,dy=y-joystickOrigin.y;const max=33;const len=Math.hypot(dx,dy)||1;const nx=dx/len*Math.min(max,len),ny=dy/len*Math.min(max,len);ui.joystickKnob.style.transform=`translate(${nx}px,${ny}px)`;moveInput.set(nx/max,-ny/max);}
function isTouchDevice(){return window.matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;}
function onResize(){if(!camera||!renderer)return;camera.aspect=window.innerWidth/window.innerHeight;camera.fov=window.innerWidth<650?68:60;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);if(isTouchDevice())document.body.classList.add('mobile');else document.body.classList.remove('mobile');}
function init() {
  try {
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,.1,240);camera.position.set(0,5,8);
    renderer=new THREE.WebGLRenderer({antialias:!isTouchDevice(),powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.setSize(window.innerWidth,window.innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    $('game-root').insertBefore(renderer.domElement,$('game-root').firstChild);clock=new THREE.Clock();raycaster=new THREE.Raycaster();raycaster.far=65;
    createWorld();player=makePlayer();
    camera.position.set(0,4.2,7);camera.lookAt(0,1.4,0);
    bindControls();onResize();ui.loading.classList.add('hidden');animate();
  } catch(err) {console.error(err);ui.loading.innerHTML='<span>Unable to load the 3D engine. Check your internet connection and refresh.</span>';}
}
init();
