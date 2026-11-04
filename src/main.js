import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const $ = (id) => document.getElementById(id);
const WORLD = $("world");
const TOOLS = [
  {id:"pulse",name:"PULSE GAUNTLET",category:"FIELD TOOL / PRIMARY",description:"A focused resonance pulse that destabilizes nearby infected and briefly staggers anything in its path.",range:"32m",cooldown:"0.45s",charge:"∞",func:"DIRECT DISRUPTION",note:"Aim toward an infected and release a concentrated resonance wave. Boss targets require repeated pulses.",cooldownMs:450},
  {id:"beacon",name:"LURE BEACON",category:"FIELD DEVICE / DISTRACTION",description:"A deployable signal beacon that attracts infected away from your squad for a short time.",range:"10m",cooldown:"16s",charge:"1",func:"DISTRACTION FIELD",note:"Place the beacon ahead of you. Nearby infected change course and gather around its signal.",cooldownMs:16000},
  {id:"barrier",name:"BARRIER FIELD",category:"DEFENSIVE DEVICE / AREA CONTROL",description:"A temporary energy screen that slows infected trying to cross its projected field.",range:"5m",cooldown:"18s",charge:"1",func:"AREA DEFENCE",note:"Project the barrier between your squad and the infected. The field fades after a short duration.",cooldownMs:18000}
];

const state = {
  renderer:null,scene:null,camera:null,clock:new THREE.Clock(),running:false,paused:false,gameOver:false,
  mode:"solo",peer:null,conn:null,connections:new Map(),players:new Map(),remoteMeshes:new Map(),
  enemies:new Map(),keys:Object.create(null),yaw:0,pitch:0,pointerLocked:false,scanning:false,
  wave:0,phase:"IDLE",spawnLeft:0,spawnPendingBoss:false,spawnTimer:0,intermission:0,
  player:{x:0,y:0,z:7,hp:100,maxHp:100,credits:0,vy:0,onGround:true},
  selectedTool:0,lastUse:0,cooldowns:{pulse:0,beacon:0,barrier:0},beacon:null,barrier:null,
  nextId:1,bossId:null,lastSync:0,lastPose:0,toastUntil:0,preview:null,
  mobile:{x:0,z:0,lookId:null,lastX:0,lastY:0},lastDamage:0
};

const mat = (color,roughness=0.8,metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
function box(parent,w,h,d,material,x=0,y=0,z=0,cast=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;
}
function glowMat(color){return new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.3,roughness:.35});}
function dispose(obj){obj.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}
function seededTexture(base,seed){
  const c=document.createElement("canvas");c.width=128;c.height=128;const g=c.getContext("2d");g.fillStyle=base;g.fillRect(0,0,128,128);
  let n=seed>>>0;const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
  for(let i=0;i<1700;i++){const v=Math.floor(rand()*75);g.fillStyle="rgba("+v+","+v+","+v+","+(0.025+rand()*.12)+")";g.fillRect(rand()*128,rand()*128,1+rand()*3,1+rand()*3);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const concrete=mat(0x545d54,.96);concrete.map=seededTexture("#505750",9);
const clothTex=seededTexture("#374238",17),rustTex=seededTexture("#303a34",42);

function createToolModel(toolIndex){
  const root=new THREE.Group();
  const dark=mat(0x18211d,.43,.55),metal=mat(0x66746b,.34,.72),poly=mat(0x46564a,.67,.18),rubber=mat(0x202a24,.95),energy=glowMat(0xb9eb91);
  if(toolIndex===0){
    // Forearm-mounted resonance gauntlet with ceramic plates and a luminous emitter.
    const cuff= new THREE.Mesh(new THREE.CylinderGeometry(.19,.2,.48,16),rubber);cuff.rotation.z=Math.PI/2;root.add(cuff);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.2,18,14),energy);core.position.set(0,.02,-.08);root.add(core);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.27,.035,8,32),metal);ring.position.set(0,.02,-.08);root.add(ring);
    const plate=box(root,.35,.14,.38,poly,0,-.19,.04);plate.rotation.x=-.12;
    for(let i=0;i<3;i++){const rib=box(root,.045,.06,.24,metal,-.12+i*.12,-.12,.25);rib.rotation.x=.2;}
    const emitter=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.18,16),dark);emitter.rotation.x=Math.PI/2;emitter.position.set(0,.03,-.34);root.add(emitter);
    const lens=new THREE.Mesh(new THREE.CircleGeometry(.105,20),energy);lens.position.set(0,.03,-.435);root.add(lens);
    const side=new THREE.Mesh(new THREE.TorusGeometry(.08,.012,6,18),metal);side.position.set(.19,.04,.05);side.rotation.y=Math.PI/2;root.add(side);
  }else if(toolIndex===1){
    // Handheld lure beacon: compact industrial housing with a floating signal crystal.
    const body=box(root,.32,.4,.3,poly,0,0,0);body.rotation.x=.06;
    box(root,.36,.08,.33,dark,0,.23,0);box(root,.26,.08,.28,metal,0,-.23,0);
    const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.17,1),energy);crystal.position.set(0,.37,0);root.add(crystal);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.23,.018,8,24),metal);halo.position.y=.35;root.add(halo);
    for(let i=0;i<4;i++){const pin=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.12,8),metal);pin.position.set(i%2?.19:-.19,.02,i<2?.17:-.17);root.add(pin);}
    const handle=box(root,.13,.22,.14,rubber,0,-.29,.04);
  }else{
    // Folded barrier projector with paired emitter fins.
    box(root,.32,.28,.34,poly,0,0,0);
    box(root,.36,.08,.38,metal,0,.17,0);
    box(root,.12,.3,.12,rubber,0,-.25,.04);
    for(const side of [-1,1]){
      const fin=box(root,.1,.52,.12,metal,side*.22,.08,-.02);fin.rotation.z=side*.16;
      const lens=new THREE.Mesh(new THREE.SphereGeometry(.065,12,10),energy);lens.position.set(side*.23,.33,-.03);root.add(lens);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.09,.014,6,18),dark);ring.position.copy(lens.position);root.add(ring);
    }
    const core=new THREE.Mesh(new THREE.SphereGeometry(.11,14,12),energy);core.position.set(0,.02,-.2);root.add(core);
  }
  root.userData.toolIndex=toolIndex;
  return root;
}

function createInfected(boss=false){
  const root=new THREE.Group();
  const skin=mat(boss?0x535c49:0x68745e,.95),shadowSkin=mat(0x38443b,.9);
  const shirt=new THREE.MeshStandardMaterial({color:boss?0x30372f:0x3a493d,roughness:.96,map:clothTex});
  const pants=new THREE.MeshStandardMaterial({color:0x252f2a,roughness:1,map:rustTex});
  const bone=mat(0x9ca47e,.9),eye=new THREE.MeshStandardMaterial({color:0xc7ed77,emissive:0x657f32,emissiveIntensity:1.1,roughness:.25});
  const scale=boss?1.22:1;
  const torso=box(root,boss?.78:.59,boss?1.0:.78,boss?.4:.32,shirt,0,1.13,0);torso.rotation.z=-.045;
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.2,9),skin);neck.position.set(0,1.63,0);root.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(boss?.3:.23,15,12),skin);head.scale.set(1,.97,.88);head.position.set(.02,1.86,.015);head.castShadow=true;root.add(head);
  const jaw=box(root,boss?.3:.23,.12,.2,shadowSkin,0,1.7,-.05);jaw.rotation.x=-.15;
  const eyeL=new THREE.Mesh(new THREE.SphereGeometry(.034,8,8),eye);eyeL.position.set(-.085,1.9,.205);root.add(eyeL);
  const eyeR=eyeL.clone();eyeR.position.x=.1;root.add(eyeR);
  const arms=[];
  for(const sign of [-1,1]){
    const arm=new THREE.Group();arm.position.set(sign*.36,1.42,0);root.add(arm);arms.push(arm);
    const upper=new THREE.Mesh(new THREE.CapsuleGeometry(boss?.15:.105,.36,4,8),shirt);upper.position.y=-.24;upper.rotation.z=sign*.13;arm.add(upper);
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(.11,9,8),skin);elbow.position.set(sign*.03,-.47,0);arm.add(elbow);
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.34,4,8),skin);fore.position.set(sign*.05,-.68,.02);fore.rotation.z=-sign*.14;arm.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.1,9,8),shadowSkin);hand.position.set(sign*.07,-.9,.04);arm.add(hand);
    for(let f=0;f<3;f++){const finger=box(arm,.025,.085,.03,bone,sign*(.035+f*.04),-.985,.065);finger.rotation.z=sign*.12;}
  }
  const legs=[];
  for(const sign of [-1,1]){
    const leg=new THREE.Group();leg.position.set(sign*.16,.78,0);root.add(leg);legs.push(leg);
    const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.4,4,8),pants);thigh.position.y=-.2;leg.add(thigh);
    const shin=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.38,4,8),shadowSkin);shin.position.set(0,-.56,.02);leg.add(shin);
    const boot=box(leg,.18,.12,.3,rubberMat(),0,-.81,-.065);
  }
  function rubberMat(){return mat(0x1b2520,.96);}
  for(let i=0;i<(boss?5:3);i++){
    const strip=box(root,.07+Math.random()*.05,.18+Math.random()*.16,.025,shadowSkin,(Math.random()-.5)*.4,.9+Math.random()*.18,.18);
    strip.rotation.z=(Math.random()-.5)*.7;
  }
  if(boss){
    const plate=box(root,.9,.22,.47,mat(0x303a31,.65,.32),0,1.44,-.015);plate.rotation.z=-.1;
    for(let i=0;i<3;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.085,.28,6),bone);spike.position.set(-.29+i*.29,1.69,.08);spike.rotation.z=(i-1)*.22;root.add(spike);}
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.22,11,9),shadowSkin);shoulder.position.set(-.44,1.48,0);root.add(shoulder);
  }
  root.scale.setScalar(scale);
  root.userData={arms,legs,phase:Math.random()*6,boss};
  return root;
}

function makeRemoteOperator(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.24,.72,4,8),mat(0x526458,.85));body.position.y=1.03;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),mat(0xb5b99f,.84));head.position.y=1.57;g.add(head);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(.045,8,8),glowMat(0xb9eb91));beacon.position.y=1.93;g.add(beacon);
  return g;
}

function setupArena(){
  const s=state.scene;s.background=new THREE.Color(0x101913);s.fog=new THREE.FogExp2(0x101913,.0125);
  s.add(new THREE.HemisphereLight(0xb7c8b5,0x1b271f,1.35));
  const sun=new THREE.DirectionalLight(0xd6e2cd,2);sun.position.set(-9,17,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=34;sun.shadow.camera.bottom=-34;s.add(sun);
  const green=new THREE.PointLight(0x9abd78,28,25,2);green.position.set(0,5,-12);s.add(green);
  const red=new THREE.PointLight(0x8b4b37,22,19,2);red.position.set(14,4,9);s.add(red);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),concrete);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;s.add(ground);
  const grid=new THREE.GridHelper(100,50,0x3c4c3d,0x29352d);grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.14;s.add(grid);
  const wallMat=mat(0x29362e,.94),metal=mat(0x46554a,.48,.62),dark=mat(0x171f19,.92),hazard=mat(0x9b9b61,.8);
  function wall(x,y,z,w,h,d){box(s,w,h,d,wallMat,x,y,z);box(s,w,.075,d+.03,hazard,x,y-h/2+.04,z,false);}
  wall(0,3,-31,62,6,1);wall(0,3,31,62,6,1);wall(-31,3,0,1,6,62);wall(31,3,0,1,6,62);
  // Reinforced containers and maintenance lanes.
  for(let i=0;i<5;i++){
    const x=-21+i*10.5;box(s,5,3.1,2.2,metal,x,1.55,-17);
    for(let j=-1;j<=1;j++)box(s,.045,2.7,.035,dark,x+j*1.45,1.55,-15.85,false);
    box(s,5.2,.1,2.28,hazard,x,3.1,-17,false);
  }
  for(let i=0;i<4;i++){
    const x=-19+i*12.5;box(s,3.8,2.7,3.7,wallMat,x,1.35,15);box(s,3.9,.09,3.8,hazard,x,2.72,15,false);
    for(let j=0;j<4;j++)box(s,.05,2.45,.04,dark,x-1.5+j,1.35,16.88,false);
  }
  // Supplies, cable drums, rubble, and floor fixtures.
  for(let i=0;i<20;i++){
    const x=(Math.random()-.5)*48,z=(Math.random()-.5)*48;if(Math.abs(x)<5&&Math.abs(z)<7)continue;
    if(i%3===0){
      const drum=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,1.04,14),mat(0x49584b,.78,.18));drum.position.set(x,.52,z);drum.castShadow=true;s.add(drum);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.4,.028,6,16),metal);rim.rotation.x=Math.PI/2;rim.position.set(x,.99,z);s.add(rim);
    }else{
      const size=.65+Math.random()*.75;box(s,size,size,size,dark,x,size/2,z);box(s,size+.02,.045,size+.02,metal,x,size*.72,z);
    }
  }
  // Overhead conduit and work lamps.
  for(let z=-20;z<=20;z+=20){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,54,10),metal);pipe.rotation.z=Math.PI/2;pipe.position.set(0,5.7,z);s.add(pipe);
    for(let x=-20;x<=20;x+=20){
      const lamp=new THREE.PointLight(0xc7d9ad,12,12,2);lamp.position.set(x,5.2,z);s.add(lamp);box(s,.62,.12,.35,dark,x,5.75,z,false);
    }
  }
  // Quarantine markings.
  for(let i=0;i<14;i++){const stripe=box(s,.13,.018,1.3,hazard,-6+i*.9,.025,0,false);stripe.rotation.y=.18;}
  // Relay terminal in the far end of the room.
  box(s,1.25,2.25,.75,dark,0,1.12,-27);
  const screen=box(s,.82,.58,.045,glowMat(0x718f5d),0,1.55,-26.6,false);
  const screenLight=new THREE.PointLight(0x93bf71,10,8,2);screenLight.position.set(0,1.8,-25);s.add(screenLight);
}

function initRenderer(){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  WORLD.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(76,window.innerWidth/window.innerHeight,.08,160);
  camera.rotation.order="YXZ";camera.position.set(0,1.65,7);
  state.renderer=renderer;state.scene=scene;state.camera=camera;setupArena();
  renderer.domElement.addEventListener("click",()=>{if(state.running&&!state.paused&&!state.pointerLocked&&!isTouch())renderer.domElement.requestPointerLock?.();});
  document.addEventListener("pointerlockchange",()=>{state.pointerLocked=document.pointerLockElement===renderer.domElement;if(state.pointerLocked&&state.paused)resumeGame();});
  document.addEventListener("mousemove",e=>{if(!state.pointerLocked||!state.running||state.paused)return;state.yaw-=e.movementX*.0022;state.pitch-=e.movementY*.0022;state.pitch=THREE.MathUtils.clamp(state.pitch,-1.4,1.4);});
  window.addEventListener("resize",resizeAll);
}
function isTouch(){return window.matchMedia("(pointer:coarse)").matches||"ontouchstart"in window;}
function resizeAll(){
  if(state.renderer){state.camera.aspect=window.innerWidth/window.innerHeight;state.camera.updateProjectionMatrix();state.renderer.setSize(window.innerWidth,window.innerHeight);}
  if(state.preview)resizePreview();
}
function clearArenaDynamic(){
  for(const e of state.enemies.values()){state.scene.remove(e.mesh);dispose(e.mesh);}
  state.enemies.clear();state.remoteMeshes.forEach(m=>{state.scene.remove(m);dispose(m);});state.remoteMeshes.clear();
  if(state.beacon){state.scene.remove(state.beacon.mesh);dispose(state.beacon.mesh);state.beacon=null;}
  if(state.barrier){state.scene.remove(state.barrier.mesh);dispose(state.barrier.mesh);state.barrier=null;}
}
function setScreen(name){
  $("main-menu").classList.toggle("hidden",name!=="menu");
  $("armory-screen").classList.toggle("hidden",name!=="armory");
  $("log-screen").classList.toggle("hidden",name!=="log");
}
function toast(message){
  const el=$("toast");el.textContent=message;el.classList.remove("hidden");state.toastUntil=performance.now()+2200;
}
function setNetworkStatus(message){$("network-status").textContent=message;}

function updateGearInfo(){
  const t=TOOLS[state.selectedTool];
  $("gear-category").textContent=t.category;$("gear-name").textContent=t.name;$("gear-desc").textContent=t.description;
  $("gear-range").textContent=t.range;$("gear-cooldown").textContent=t.cooldown;$("gear-charge").textContent=t.charge;
  $("gear-function").textContent=t.func;$("gear-note").textContent=t.note;$("preview-mode").textContent=t.name;$("gear-status").textContent="SELECTED FIELD TOOL";
  document.querySelectorAll(".gear-option").forEach((el,i)=>el.classList.toggle("active",i===state.selectedTool));
}
function buildGearList(){
  const list=$("gear-list");list.innerHTML="";
  TOOLS.forEach((t,i)=>{
    const b=document.createElement("button");b.className="gear-option";
    const n=document.createElement("b"),d=document.createElement("span");n.textContent=t.name;d.textContent=t.func;b.append(n,d);
    b.addEventListener("click",()=>{state.selectedTool=i;updateGearInfo();buildPreviewModel();});list.appendChild(b);
  });
}
function initPreview(){
  const canvas=$("preview-canvas"),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,30);camera.position.set(0,.35,4.2);camera.lookAt(0,0,0);
  state.preview={renderer,scene,camera,model:null,drag:false,lastX:0,lastY:0};
  canvas.addEventListener("pointerdown",e=>{state.preview.drag=true;state.preview.lastX=e.clientX;state.preview.lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{const p=state.preview;if(!p.drag||!p.model)return;p.model.rotation.y+=(e.clientX-p.lastX)*.009;p.model.rotation.x+=(e.clientY-p.lastY)*.006;p.lastX=e.clientX;p.lastY=e.clientY;});
  ["pointerup","pointercancel"].forEach(ev=>canvas.addEventListener(ev,()=>state.preview.drag=false));
  canvas.addEventListener("wheel",e=>{e.preventDefault();camera.position.z=THREE.MathUtils.clamp(camera.position.z+e.deltaY*.004,2.2,6);},{passive:false});
  buildPreviewModel();resizePreview();
}
function resizePreview(){
  const p=state.preview;if(!p)return;const r=$("preview-canvas").getBoundingClientRect();const w=Math.max(1,r.width),h=Math.max(1,r.height);
  p.renderer.setSize(w,h,false);p.camera.aspect=w/h;p.camera.updateProjectionMatrix();
}
function buildPreviewModel(){
  const p=state.preview;if(!p)return;
  while(p.scene.children.length){const child=p.scene.children[0];p.scene.remove(child);dispose(child);}
  p.scene.add(new THREE.HemisphereLight(0xb8cbbb,0x19221d,2));
  const light=new THREE.DirectionalLight(0xe1e9da,2.4);light.position.set(3,5,4);p.scene.add(light);
  const rim=new THREE.PointLight(0x9cbe77,15,8);rim.position.set(-3,1,1);p.scene.add(rim);
  const grid=new THREE.GridHelper(8,20,0x647763,0x293b31);grid.position.y=-.72;grid.material.transparent=true;grid.material.opacity=.2;p.scene.add(grid);
  const model=createToolModel(state.selectedTool);model.position.y=-.02;model.scale.setScalar(1.45);model.rotation.set(.12,-.2,.08);p.scene.add(model);p.model=model;
}
function equipToolModel(){
  const old=state.camera.getObjectByName("active-field-tool");if(old){state.camera.remove(old);dispose(old);}
  const model=createToolModel(state.selectedTool);model.name="active-field-tool";model.scale.setScalar(.62);
  model.position.set(.34,-.3,-.58);model.rotation.set(.04,0,0);state.camera.add(model);
  updateToolHud();
}
function updateToolHud(){
  const t=TOOLS[state.selectedTool];$("active-tool").textContent=t.name;$("tool-function").textContent=t.func;
  const ready=state.cooldowns[t.id]||0;$("tool-charge").textContent=ready<=performance.now()?"READY":"CHARGING";
  $("tool-charge").style.color=ready<=performance.now()?"var(--green)":"var(--amber)";
}
function chooseTool(i){
  if(i<0||i>=TOOLS.length||i===state.selectedTool)return;
  state.selectedTool=i;equipToolModel();updateGearInfo();toast(TOOLS[i].name+" ACTIVE");
}
function resetPlayer(x=0,z=7){
  state.player={x,y:0,z,hp:100,maxHp:100,credits:0,vy:0,onGround:true};
  state.yaw=0;state.pitch=0;state.camera.position.set(x,1.65,z);state.player.x=x;state.player.z=z;state.camera.rotation.set(0,0,0);
  state.wave=0;state.phase="IDLE";state.spawnLeft=0;state.spawnPendingBoss=false;state.spawnTimer=0;state.intermission=0;state.bossId=null;
  state.cooldowns={pulse:0,beacon:0,barrier:0};state.lastUse=0;state.selectedTool=0;state.scanning=false;
  clearArenaDynamic();$("boss-bar").classList.add("hidden");$("pause-menu").classList.add("hidden");$("game-over").classList.add("hidden");$("scan-overlay").classList.add("hidden");
  equipToolModel();updatePlayerHud();
}
function startGame(mode){
  if(mode==="solo")cleanupNetwork();
  state.mode=mode;state.running=true;state.paused=false;state.gameOver=false;
  resetPlayer(mode==="guest"?2.5:0,7);
  $("main-menu").classList.add("hidden");$("armory-screen").classList.add("hidden");$("log-screen").classList.add("hidden");$("hud").classList.remove("hidden");
  $("network-mode").textContent=mode==="solo"?"SOLO SESSION":mode==="host"?"HOST / SQUAD LINK":"CONNECTED GUEST";
  $("connection-label").textContent=mode==="solo"?"LOCAL SESSION":mode==="host"?"HOST SIGNAL ONLINE":"SQUAD LINK ONLINE";
  updateSquadHud();
  if(mode!=="guest")startNextWave();
  if(!isTouch())state.renderer.domElement.requestPointerLock?.();
}
function startNextWave(){
  if(state.mode==="guest")return;
  state.wave++;state.phase="INCOMING";state.intermission=3;
  const count=Math.min(4+state.wave*2,26);
  state.spawnPendingBoss=state.wave%5===0;
  state.spawnLeft=count+(state.spawnPendingBoss?Math.min(1+Math.floor(state.wave/5),4):0);
  $("wave-number").textContent=String(state.wave).padStart(2,"0");$("wave-phase").textContent="INCOMING";
  $("objective-text").textContent=state.spawnPendingBoss?"BOSS SIGNATURE DETECTED":"PREPARE FOR CONTACT";
  if(state.spawnPendingBoss){
    $("boss-bar").classList.remove("hidden");$("boss-name").textContent=state.wave===5?"THE WARDEN":"THE COLOSSUS";$("boss-fill").style.width="100%";
    toast("WARNING // BOSS CONTACT — WAVE "+state.wave);
  }else{$("boss-bar").classList.add("hidden");toast("WAVE "+state.wave+" INCOMING");}
  updateWaveHud();
}
function spawnInfected(boss=false){
  const angle=Math.random()*Math.PI*2,dist=18+Math.random()*8;
  const x=THREE.MathUtils.clamp(Math.cos(angle)*dist,-27,27),z=THREE.MathUtils.clamp(Math.sin(angle)*dist,-27,27);
  const mesh=createInfected(boss);mesh.position.set(x,0,z);state.scene.add(mesh);
  const id="hollowed-"+(state.nextId++);
  const max=boss?980+state.wave*145:72+state.wave*15;
  const enemy={id,mesh,x,z,stability:max,maxStability:max,boss,speed:(boss?1.28:1.55)+Math.min(state.wave*.04,.75),damage:boss?19:7+Math.floor(state.wave*.65),nextAttack:0,phase:Math.random()*6};
  state.enemies.set(id,enemy);if(boss)state.bossId=id;
}
function updateWaveDirector(dt){
  if(state.mode==="guest")return;
  if(state.phase==="INCOMING"){
    state.intermission-=dt;
    if(state.intermission<=0){state.phase="ACTIVE";state.spawnTimer=0;$("wave-phase").textContent="ACTIVE";$("objective-text").textContent="DISRUPT THE INFECTED";}
    return;
  }
  if(state.phase==="ACTIVE"){
    state.spawnTimer-=dt;
    if(state.spawnLeft>0&&state.spawnTimer<=0){
      const boss=state.spawnPendingBoss;spawnInfected(boss);if(boss)state.spawnPendingBoss=false;
      state.spawnLeft--;state.spawnTimer=boss?4.2:Math.max(.72,1.48-state.wave*.027);
    }
    if(state.spawnLeft===0&&state.enemies.size===0){
      state.phase="CLEAR";state.intermission=4;$("wave-phase").textContent="SECTOR CLEAR";$("objective-text").textContent="SECTOR SECURED — REPOSITION";
      state.player.credits+=100+state.wave*20;toast("SECTOR SECURED // +"+(100+state.wave*20)+" FIELD CREDITS");
    }
    return;
  }
  if(state.phase==="CLEAR"){state.intermission-=dt;if(state.intermission<=0)startNextWave();}
}
function getTargets(){
  const out=[{id:"HOST",x:state.player.x,z:state.player.z,hp:state.player.hp}];
  for(const [id,p] of state.players)out.push({id,x:p.x,z:p.z,hp:p.hp});
  return out.filter(p=>p.hp>0);
}
function currentBeaconTarget(){
  if(state.beacon&&state.beacon.expires>performance.now())return state.beacon;
  return null;
}
function barrierSlowAt(x,z){
  if(!state.barrier||state.barrier.expires<performance.now())return false;
  const dx=x-state.barrier.x,dz=z-state.barrier.z;
  const along=dx*state.barrier.nx+dz*state.barrier.nz;
  const across=dx*state.barrier.nz-dz*state.barrier.nx;
  return Math.abs(along)<1.35&&Math.abs(across)<state.barrier.width/2;
}
function updateInfected(dt,time){
  const targets=getTargets(),beacon=currentBeaconTarget();
  for(const [id,e] of [...state.enemies]){
    let target;
    if(beacon&&Math.hypot(beacon.x-e.x,beacon.z-e.z)<18){target={id:"BEACON",x:beacon.x,z:beacon.z};}
    else target=targets.reduce((best,p)=>{const d=Math.hypot(p.x-e.x,p.z-e.z);return !best||d<best.d?{...p,d}:best;},null);
    if(!target)continue;
    const dx=target.x-e.x,dz=target.z-e.z,d=Math.hypot(dx,dz)||.001;
    const slow=barrierSlowAt(e.x,e.z)?0.38:1;
    const beaconSlow=beacon&&target.id==="BEACON"&&d<2.3?0.12:1;
    if(d>(target.id==="BEACON"?1.5:1.25)){
      e.x+=(dx/d)*e.speed*dt*slow*beaconSlow;e.z+=(dz/d)*e.speed*dt*slow*beaconSlow;
      e.mesh.position.set(e.x,0,e.z);e.mesh.rotation.y=Math.atan2(dx,dz);
    }else if(target.id==="BEACON"){
      // Beacon proximity briefly disrupts the infected animation and keeps it busy.
      e.mesh.rotation.y+=Math.sin(time*6+e.phase)*.01;
    }
    const parts=e.mesh.userData,walk=Math.sin(time*6+e.phase)*.42;
    if(parts){parts.arms[0].rotation.x=walk-.2;parts.arms[1].rotation.x=-walk-.2;parts.legs[0].rotation.x=-walk*.62;parts.legs[1].rotation.x=walk*.62;}
    if(target.id!=="BEACON"&&d<1.55&&time>e.nextAttack){
      e.nextAttack=time+(e.boss?1.4:1.65);
      if(target.id==="HOST")damageHost(e.damage);
      else{
        const p=state.players.get(target.id);if(p){p.hp=Math.max(0,p.hp-e.damage);const c=state.connections.get(target.id);if(c?.open)c.send({type:"damage",hp:p.hp,amount:e.damage});checkSquadLoss();}
      }
    }
  }
  if(state.beacon&&performance.now()>state.beacon.expires){state.scene.remove(state.beacon.mesh);dispose(state.beacon.mesh);state.beacon=null;}
  if(state.barrier&&performance.now()>state.barrier.expires){state.scene.remove(state.barrier.mesh);dispose(state.barrier.mesh);state.barrier=null;}
  updateBossHud();
}
function updateBossHud(){
  if(!state.bossId)return;const e=state.enemies.get(state.bossId);
  if(!e){$("boss-bar").classList.add("hidden");state.bossId=null;return;}
  $("boss-fill").style.width=(Math.max(0,e.stability/e.maxStability)*100)+"%";
}
function updateWaveHud(){$("enemy-count").textContent="HOSTILES: "+state.enemies.size;}
function updatePlayerHud(){
  $("player-health").textContent=String(Math.ceil(state.player.hp));$("health-fill").style.width=(state.player.hp/state.player.maxHp*100)+"%";updateSquadHud();updateToolHud();
}
function updateSquadHud(){$("squad-count").textContent=String(1+state.players.size).padStart(2,"0")+" / 04";}
function damageHost(amount){
  if(state.player.hp<=0)return;state.player.hp=Math.max(0,state.player.hp-amount);state.lastDamage=performance.now();
  $("damage-vignette").classList.add("active");setTimeout(()=>$("damage-vignette").classList.remove("active"),180);updatePlayerHud();checkSquadLoss();
}
function checkSquadLoss(){
  if(state.mode==="guest")return;
  const guestAlive=[...state.players.values()].some(p=>p.hp>0);
  if(state.player.hp<=0&&!guestAlive)endGame();
}
function spawnPulseEffect(position){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.25,.035,8,24),glowMat(0xb9eb91));ring.position.copy(position);ring.rotation.x=Math.PI/2;state.scene.add(ring);
  const start=performance.now();function animateRing(){
    if(!ring.parent)return;const t=(performance.now()-start)/360;ring.scale.setScalar(1+t*5);ring.material.opacity=1-t;ring.material.transparent=true;
    if(t>=1){state.scene.remove(ring);dispose(ring);}else requestAnimationFrame(animateRing);
  }animateRing();
}
function findPulseTarget(origin,dir,range=32){
  let best=null,bestT=Infinity;
  for(const e of state.enemies.values()){
    const center=new THREE.Vector3(e.x,1.05*(e.boss?1.22:1),e.z),to=center.clone().sub(origin),along=to.dot(dir);
    if(along<0||along>range)continue;
    const closest=origin.clone().addScaledVector(dir,along),distance=closest.distanceTo(center);
    if(distance<(e.boss?1.35:.82)&&along<bestT){best=e;bestT=along;}
  }
  return best;
}
function applyPulse(origin,dir,sourceId="HOST"){
  const hit=findPulseTarget(origin,dir);
  if(!hit)return false;
  hit.stability-=hit.boss?76:42;
  spawnPulseEffect(new THREE.Vector3(hit.x,1.15,hit.z));
  if(hit.stability<=0){
    state.scene.remove(hit.mesh);dispose(hit.mesh);state.enemies.delete(hit.id);if(hit.boss)state.bossId=null;
    if(state.mode!=="guest"&&sourceId==="HOST")state.player.credits+=hit.boss?500:20;
  }
  updateWaveHud();updateBossHud();return true;
}
function placeBeacon(origin,dir){
  const pos=origin.clone().addScaledVector(dir,10);pos.y=0;
  if(state.beacon){state.scene.remove(state.beacon.mesh);dispose(state.beacon.mesh);}
  const g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,.24,16),mat(0x414d43,.65,.5));g.add(base);
  const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,2),glowMat(0xc3ef86));orb.position.y=.5;g.add(orb);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.65,.025,8,30),glowMat(0xa9dc7c));halo.rotation.x=Math.PI/2;halo.position.y=.12;g.add(halo);
  for(let i=0;i<3;i++){const rod=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.5,7),mat(0x667a59,.6,.4));rod.position.set(Math.cos(i*2.1)*.3,.2,Math.sin(i*2.1)*.3);g.add(rod);}
  g.position.set(pos.x,.16,pos.z);state.scene.add(g);
  state.beacon={mesh:g,x:pos.x,z:pos.z,expires:performance.now()+10000};
  toast("LURE BEACON DEPLOYED");
}
function placeBarrier(origin,dir){
  const pos=origin.clone().addScaledVector(dir,4.3);pos.y=0;
  if(state.barrier){state.scene.remove(state.barrier.mesh);dispose(state.barrier.mesh);}
  const g=new THREE.Group();
  const frame=mat(0x758c70,.44,.65),field=new THREE.MeshStandardMaterial({color:0xa9df89,emissive:0x6c9954,emissiveIntensity:.8,transparent:true,opacity:.22,side:THREE.DoubleSide});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(5.2,2.8),field);panel.position.y=1.4;g.add(panel);
  for(const x of [-2.65,2.65]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,3,10),frame);p.position.set(x,1.45,0);g.add(p);const cap=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),glowMat(0xc4f49a));cap.position.set(x,2.95,0);g.add(cap);}
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,5.3,8),frame);top.rotation.z=Math.PI/2;top.position.y=2.9;g.add(top);
  const bottom=top.clone();bottom.position.y=.05;g.add(bottom);
  g.position.set(pos.x,0,pos.z);g.rotation.y=Math.atan2(dir.x,dir.z);state.scene.add(g);
  state.barrier={mesh:g,x:pos.x,z:pos.z,nx:dir.x,nz:dir.z,width:5.2,expires:performance.now()+8500};
  toast("BARRIER FIELD ONLINE");
}
function useActiveTool(originOverride=null,dirOverride=null,sourceId="HOST"){
  if(!state.running||state.paused||state.gameOver)return;
  const tool=TOOLS[state.selectedTool],now=performance.now();
  if((state.cooldowns[tool.id]||0)>now){return;}
  state.cooldowns[tool.id]=now+tool.cooldownMs;state.lastUse=now;updateToolHud();
  const origin=originOverride?new THREE.Vector3(originOverride.x,originOverride.y,originOverride.z):state.camera.position.clone();
  const dir=dirOverride?new THREE.Vector3(dirOverride.x,dirOverride.y,dirOverride.z).normalize():new THREE.Vector3();if(!dirOverride)state.camera.getWorldDirection(dir);
  if(tool.id==="pulse"){
    const hit=applyPulse(origin,dir,sourceId);
    if(hit){$("hit-marker").classList.remove("hidden");setTimeout(()=>$("hit-marker").classList.add("hidden"),140);}
  }else if(tool.id==="beacon")placeBeacon(origin,dir);
  else if(tool.id==="barrier")placeBarrier(origin,dir);
  const held=state.camera.getObjectByName("active-field-tool");if(held){held.position.z=-.48;held.rotation.x=.08;setTimeout(()=>{if(held){held.position.z=-.58;held.rotation.x=.04;}},90);}
}
function movePlayer(dt){
  const p=state.player;let mx=0,mz=0;
  if(state.keys.KeyW||state.keys.ArrowUp)mz-=1;if(state.keys.KeyS||state.keys.ArrowDown)mz+=1;
  if(state.keys.KeyA||state.keys.ArrowLeft)mx-=1;if(state.keys.KeyD||state.keys.ArrowRight)mx+=1;
  mx+=state.mobile.x;mz+=state.mobile.z;const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
  const forward=new THREE.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw)),right=new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw));
  const move=forward.multiplyScalar(-mz).add(right.multiplyScalar(mx));
  const sprint=!!(state.keys.ShiftLeft||state.keys.ShiftRight),speed=sprint?7.2:5.1;
  p.x=THREE.MathUtils.clamp(p.x+move.x*speed*dt,-29,29);p.z=THREE.MathUtils.clamp(p.z+move.z*speed*dt,-29,29);
  if((state.keys.Space||state.mobile.jump)&&p.onGround){p.vy=5.3;p.onGround=false;state.mobile.jump=false;}
  p.y+=p.vy*dt;if(!p.onGround){p.vy-=14*dt;if(p.y<=0){p.y=0;p.vy=0;p.onGround=true;}}
  state.camera.position.set(p.x,1.65+p.y,p.z);state.camera.rotation.set(state.pitch,state.yaw,0,"YXZ");
}
function scanToggle(on){
  state.scanning=on;$("scan-overlay").classList.toggle("hidden",!on);$("crosshair").classList.toggle("hidden",on);
  state.camera.fov=on?66:76;state.camera.updateProjectionMatrix();
}
function endGame(){
  if(state.gameOver)return;state.gameOver=true;state.running=false;document.exitPointerLock?.();
  $("final-stats").textContent="Your squad reached wave "+state.wave+" and secured "+state.player.credits+" field credits.";
  $("game-over").classList.remove("hidden");
  if(state.mode==="host")for(const c of state.connections.values())if(c.open)c.send({type:"gameover",wave:state.wave});
}
function pauseGame(){
  if(!state.running||state.paused||state.gameOver)return;state.paused=true;document.exitPointerLock?.();$("pause-menu").classList.remove("hidden");
}
function resumeGame(){
  if(!state.running||!state.paused)return;state.paused=false;$("pause-menu").classList.add("hidden");if(!isTouch())state.renderer.domElement.requestPointerLock?.();
}
function returnToBase(){
  state.running=false;state.paused=false;state.gameOver=false;document.exitPointerLock?.();cleanupNetwork();
  clearArenaDynamic();$("hud").classList.add("hidden");$("pause-menu").classList.add("hidden");$("game-over").classList.add("hidden");$("connection-label").textContent="SYSTEM STANDBY";setScreen("menu");
}
