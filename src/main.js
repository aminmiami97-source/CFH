import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const $ = id => document.getElementById(id);
const WORLD = $("world");

const WEAPONS = [
  {id:"ranger",name:"RANGER AR",role:"ASSAULT RIFLE / PRIMARY",description:"Balanced automatic platform with a clear reflex optic and dependable handling.",damage:34,rpm:520,mag:30,reserve:150,optic:"REFLEX 1.5X",zoom:1.5,opticType:"reflex",spread:.012,color:0x46564b,platform:"rifle"},
  {id:"vulture",name:"VULTURE DMR",role:"DESIGNATED MARKSMAN / PRECISION",description:"A precision platform with a long-range variable optic and deliberate semi-automatic fire.",damage:108,rpm:165,mag:12,reserve:72,optic:"VARIABLE 4X",zoom:4,opticType:"scope",spread:.002,color:0x555d51,platform:"dmr"},
  {id:"breach",name:"BREACH SMG",role:"SUBMACHINE GUN / CLOSE QUARTERS",description:"Compact, fast handling and fitted with a wide holographic sight for quick target changes.",damage:23,rpm:860,mag:36,reserve:180,optic:"HOLO 2X",zoom:2,opticType:"holo",spread:.019,color:0x3d4b45,platform:"smg"},
  {id:"wraith",name:"WRAITH 12G",role:"PUMP SHOTGUN / CLOSE DEFENCE",description:"A heavy close-range platform with a compact prism optic and a wide, deliberate shot.",damage:92,rpm:92,mag:8,reserve:64,optic:"PRISM 1.25X",zoom:1.25,opticType:"prism",spread:.055,color:0x514b3d,platform:"shotgun"},
  {id:"titan",name:"TITAN LMG",role:"LIGHT MACHINE GUN / SUPPORT",description:"A support weapon with a high-capacity feed and a rugged low-profile combat optic.",damage:27,rpm:690,mag:75,reserve:300,optic:"COMBAT 1.8X",zoom:1.8,opticType:"combat",spread:.022,color:0x414b43,platform:"lmg"},
  {id:"nova",name:"NOVA 9",role:"COMPACT SIDEARM / SECONDARY",description:"A light secondary with a compact micro optic and quick handling.",damage:29,rpm:410,mag:17,reserve:102,optic:"MICRO DOT 1X",zoom:1,opticType:"micro",spread:.014,color:0x555d57,platform:"pistol"},
  {id:"phantom",name:"PHANTOM CARBINE",role:"TACTICAL CARBINE / VERSATILE",description:"A short tactical carbine with a low-power variable optic for flexible mid-range play.",damage:31,rpm:640,mag:24,reserve:144,optic:"LPVO 2.5X",zoom:2.5,opticType:"lpvo",spread:.009,color:0x48564c,platform:"carbine"}
];

const state = {
  renderer:null,scene:null,camera:null,clock:new THREE.Clock(),running:false,paused:false,gameOver:false,
  mode:"solo",peer:null,conn:null,connections:new Map(),players:new Map(),remoteMeshes:new Map(),enemies:new Map(),
  keys:Object.create(null),yaw:0,pitch:0,pointerLocked:false,aiming:false,firing:false,
  wave:0,phase:"IDLE",spawnLeft:0,spawnBossPending:false,spawnTimer:0,intermission:0,
  player:{x:0,y:0,z:7,hp:100,maxHp:100,credits:0,vy:0,onGround:true},
  selectedWeapon:0,ammo:{},reloadUntil:0,lastShot:0,weaponModel:null,preview:null,
  nextId:1,bossId:null,lastSync:0,lastPose:0,toastUntil:0,
  mobile:{x:0,z:0,lookId:null,lastX:0,lastY:0}
};

const material=(color,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function box(parent,w,h,d,mat,x=0,y=0,z=0,cast=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;
}
function dispose(obj){
  obj.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});
}
function texture(base,seed){
  const c=document.createElement("canvas");c.width=128;c.height=128;const g=c.getContext("2d");g.fillStyle=base;g.fillRect(0,0,128,128);
  let n=seed>>>0;const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
  for(let i=0;i<1600;i++){const v=Math.floor(rand()*60);g.fillStyle="rgba("+v+","+v+","+v+","+(0.025+rand()*.12)+")";g.fillRect(rand()*128,rand()*128,1+rand()*3,1+rand()*3);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const concrete=material(0x545d54,.96);concrete.map=texture("#505750",9);
const cloth=texture("#374238",17),pantsTexture=texture("#303a34",42);

function createWeapon(def){
  const g=new THREE.Group();
  const receiver=material(def.color,.53,.4),dark=material(0x171f1b,.72,.4),steel=material(0x7a857d,.32,.82),rubber=material(0x202723,.95);
  const lens=new THREE.MeshStandardMaterial({color:0x91bdab,metalness:.65,roughness:.12,transparent:true,opacity:.62,emissive:0x183a2a,emissiveIntensity:.45});
  const isPistol=def.platform==="pistol",isShotgun=def.platform==="shotgun",isLMG=def.platform==="lmg",isDMR=def.platform==="dmr",isSMG=def.platform==="smg",isCarbine=def.platform==="carbine";
  const bodyLength=isPistol?.38:isShotgun?.78:isLMG?.78:isDMR?.68:isSMG?.52:isCarbine?.55:.63;
  const bodyHeight=isPistol?.17:isLMG?.24:.2;
  // Each platform has a distinct silhouette: compact sidearm, tube-fed shotgun,
  // box-fed support weapon, long marksman frame, SMG receiver or carbine.
  box(g,isPistol?.19:isLMG?.3:.24,bodyHeight,bodyLength,receiver,0,0,0);
  box(g,isPistol?.18:.23,isPistol?.1:.13,isPistol?.14:.3,dark,0,.11,-.16);
  box(g,isPistol?.18:.22,isPistol?.13:.18,isPistol?.13:.22,receiver,0,-.02,isPistol?.2:.42);
  if(!isPistol){
    const stockLen=isShotgun?.45:isLMG?.38:isDMR?.43:.34;
    box(g,.19,.16,stockLen,dark,0,.01,.55+stockLen*.25);
    box(g,.22,.22,.07,rubber,0,-.015,.78+stockLen*.25);
  }else{
    box(g,.18,.1,.16,rubber,0,.005,.31);
    box(g,.12,.08,.08,dark,0,.09,.22);
  }
  const grip=box(g,isPistol?.12:.13,isPistol?.28:.34,.16,rubber,0,-.21,.2);grip.rotation.x=-.18;
  if(isShotgun){
    // Broad pump for the shotgun silhouette and a long auxiliary tube under the barrel.
    box(g,.22,.16,.5,receiver,0,-.01,-.48);
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.78,12),dark);tube.rotation.x=Math.PI/2;tube.position.set(0,-.13,-.82);g.add(tube);
    for(let i=0;i<4;i++)box(g,.24,.035,.045,steel,0,-.02,-.34-i*.105,false);
  }else if(isLMG){
    // Wider feed cover and a large side box magazine.
    box(g,.31,.16,.42,dark,0,.12,-.12);
    box(g,.27,.39,.28,rubber,.2,-.25,.02);
    for(let i=0;i<4;i++)box(g,.018,.04,.2,steel,.342,-.12+i*.07,.02,false);
  }else{
    const magH=isPistol?.3:isDMR?.43:isSMG?.32:isCarbine?.34:.38,magW=isPistol?.12:isSMG?.14:.18;
    const mag=box(g,magW,magH,.22,dark,0,-.29,-.08);mag.rotation.x=-.12;
    for(let i=0;i<5;i++)box(g,magW+.01,.014,.012,steel,0,-.13-i*.054,-.195,false);
  }
  // Forward shroud and a unique length for each platform.
  const forwardLen=isPistol?.25:isShotgun?.78:isDMR?.66:isLMG?.62:isSMG?.4:isCarbine?.42:.48;
  box(g,isPistol?.17:.2,.15,forwardLen,receiver,0,.015,-.47-forwardLen*.17);
  const barrelLen=isPistol?.36:isShotgun?.88:isDMR?.92:isLMG?.82:isSMG?.5:isCarbine?.58:.7;
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,barrelLen,14),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.02,-.68-barrelLen*.5);g.add(barrel);
  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.052,.04,.13,14),dark);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.02,-.68-barrelLen-.04);g.add(muzzle);
  if(isShotgun){
    const front=new THREE.Mesh(new THREE.CylinderGeometry(.062,.062,.85,12),rubber);front.rotation.x=Math.PI/2;front.position.set(0,-.12,-.95);g.add(front);
    for(let i=0;i<3;i++)box(g,.26,.04,.04,dark,0,-.03,-.66-i*.13);
  }
  if(isPistol){
    box(g,.17,.07,.28,dark,0,.13,-.12);
    box(g,.035,.045,.07,steel,0,.19,-.19);
  }else{
    box(g,.27,.06,.16,dark,0,.13,-.54);
    box(g,.22,.035,.74,dark,0,.14,-.08);
    for(let i=0;i<7;i++)box(g,.23,.012,.035,steel,0,.165,.18-i*.09,false);
  }
  for(const side of [-1,1]){
    box(g,.025,.07,.27,dark,side*.13,.02,-.58);
    for(let i=0;i<(isPistol?3:5);i++){const screw=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.012,8),steel);screw.rotation.z=Math.PI/2;screw.position.set(side*.145,.035,.14-i*.07);g.add(screw);}
    for(let i=0;i<4;i++)box(g,.012,.045,.025,steel,side*.133,.04,-.36-i*.06,false);
  }
  // Individual optic assemblies. The armory and ADS overlay use the same optic profile.
  const sight=new THREE.Group();sight.position.set(0,isPistol?.17:.23,-.1);g.add(sight);g.userData.sight=sight;
  const makeRing=(radius,tube,z=0)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,24),steel);m.position.z=z;sight.add(m);return m;};
  if(def.opticType==="reflex"){
    box(sight,.19,.14,.05,dark,0,0,0);box(sight,.135,.085,.012,lens,0,.012,-.03);makeRing(.08,.012,-.04);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.011,8,8),new THREE.MeshBasicMaterial({color:0xff5e54}));dot.position.set(0,.012,-.049);sight.add(dot);
  }else if(def.opticType==="holo"){
    box(sight,.2,.18,.065,dark,0,0,0);box(sight,.14,.125,.012,lens,0,.015,-.04);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.026,.032,24),new THREE.MeshBasicMaterial({color:0xff6256}));ring.position.set(0,.015,-.05);sight.add(ring);
    const dot=new THREE.Mesh(new THREE.CircleGeometry(.007,12),new THREE.MeshBasicMaterial({color:0xff6256}));dot.position.set(0,.015,-.052);sight.add(dot);
  }else if(def.opticType==="scope"||def.opticType==="lpvo"){
    const len=def.opticType==="scope"?.5:.37;
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,len,18),dark);tube.rotation.x=Math.PI/2;sight.add(tube);
    makeRing(.078,.018,-len*.5);makeRing(.078,.018,len*.5);
    const glass=new THREE.Mesh(new THREE.CircleGeometry(.062,24),lens);glass.position.z=-len*.5-.01;sight.add(glass);
    const turret=box(sight,.1,.1,.12,steel,0,.08,0);turret.rotation.z=.2;
    if(def.opticType==="lpvo"){const adjust=box(sight,.16,.065,.1,dark,0,-.075,.05);adjust.rotation.z=.1;}
  }else if(def.opticType==="prism"){
    box(sight,.22,.2,.25,dark,0,0,0);
    box(sight,.16,.13,.012,lens,0,.015,-.13);
    makeRing(.085,.012,-.145);
    const chevron=new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.025,-.015,-.15),new THREE.Vector3(0,.025,-.15),new THREE.Vector3(.025,-.015,-.15)]),new THREE.LineBasicMaterial({color:0xff6457}));sight.add(chevron);
  }else if(def.opticType==="combat"){
    box(sight,.22,.17,.16,dark,0,0,0);box(sight,.16,.1,.012,lens,0,.015,-.09);makeRing(.084,.014,-.1);
    const guard=box(sight,.025,.23,.08,steel,0,.01,.02);guard.position.x=-.12;
  }else if(def.opticType==="micro"){
    box(sight,.13,.095,.085,dark,0,0,0);box(sight,.085,.052,.012,lens,0,.01,-.05);
    makeRing(.045,.009,-.055);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.008,8,8),new THREE.MeshBasicMaterial({color:0xff6657}));dot.position.set(0,.01,-.06);sight.add(dot);
  }
  // Handguard attachment and sling details.
  if(!isPistol){
    const sling=new THREE.Mesh(new THREE.TorusGeometry(.2,.014,6,24,Math.PI),rubber);sling.position.set(.11,-.09,.36);sling.rotation.z=Math.PI/2;g.add(sling);
  }
  return g;
}
function createInfected(boss=false){
  const root=new THREE.Group(),skin=material(boss?0x515a48:0x68745e,.95),darkSkin=material(0x354239,.9);
  const shirt=new THREE.MeshStandardMaterial({color:boss?0x30372f:0x3a493d,roughness:.96,map:cloth});
  const trousers=new THREE.MeshStandardMaterial({color:0x252f2a,roughness:1,map:pantsTexture});
  const bone=material(0x9ca47e,.9),eyes=new THREE.MeshStandardMaterial({color:0xc7ed77,emissive:0x657f32,emissiveIntensity:1.1,roughness:.25});
  box(root,boss?.78:.59,boss?1:.78,boss?.4:.32,shirt,0,1.13,0);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.2,9),skin);neck.position.set(0,1.63,0);root.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(boss?.3:.23,15,12),skin);head.scale.set(1,.97,.88);head.position.set(.02,1.86,.015);root.add(head);
  box(root,boss?.3:.23,.12,.2,darkSkin,0,1.7,-.05);
  for(const x of [-.085,.1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.034,8,8),eyes);eye.position.set(x,1.9,.205);root.add(eye);}
  const arms=[],legs=[];
  for(const sign of [-1,1]){
    const arm=new THREE.Group();arm.position.set(sign*.36,1.42,0);root.add(arm);arms.push(arm);
    const upper=new THREE.Mesh(new THREE.CapsuleGeometry(boss?.15:.105,.36,4,8),shirt);upper.position.y=-.24;upper.rotation.z=sign*.13;arm.add(upper);
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(.11,9,8),skin);elbow.position.set(sign*.03,-.47,0);arm.add(elbow);
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.34,4,8),skin);fore.position.set(sign*.05,-.68,.02);fore.rotation.z=-sign*.14;arm.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.1,9,8),darkSkin);hand.position.set(sign*.07,-.9,.04);arm.add(hand);
    const leg=new THREE.Group();leg.position.set(sign*.16,.78,0);root.add(leg);legs.push(leg);
    const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.4,4,8),trousers);thigh.position.y=-.2;leg.add(thigh);
    const shin=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.38,4,8),darkSkin);shin.position.set(0,-.56,.02);leg.add(shin);
    box(leg,.18,.12,.3,darkSkin,0,-.81,-.065);
  }
  if(boss){
    const plate=box(root,.9,.22,.47,material(0x303a31,.65,.32),0,1.44,-.015);plate.rotation.z=-.1;
    for(let i=0;i<3;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.085,.28,6),bone);spike.position.set(-.29+i*.29,1.69,.08);spike.rotation.z=(i-1)*.22;root.add(spike);}
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.22,11,9),darkSkin);shoulder.position.set(-.44,1.48,0);root.add(shoulder);
  }
  root.scale.setScalar(boss?1.22:1);root.userData={arms,legs,phase:Math.random()*6,boss};return root;
}
function remoteOperator(){
  const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.24,.72,4,8),material(0x526458,.85));
  body.position.y=1.03;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),material(0xb5b99f,.84));head.position.y=1.57;g.add(head);
  const marker=new THREE.Mesh(new THREE.SphereGeometry(.045,8,8),new THREE.MeshBasicMaterial({color:0xb9eb91}));marker.position.y=1.93;g.add(marker);return g;
}

function setupArena(){
  const s=state.scene;s.background=new THREE.Color(0x101913);s.fog=new THREE.FogExp2(0x101913,.0125);
  s.add(new THREE.HemisphereLight(0xb7c8b5,0x1b271f,1.35));
  const sun=new THREE.DirectionalLight(0xd6e2cd,2);sun.position.set(-9,17,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=34;sun.shadow.camera.bottom=-34;s.add(sun);
  const green=new THREE.PointLight(0x9abd78,28,25,2);green.position.set(0,5,-12);s.add(green);
  const red=new THREE.PointLight(0x8b4b37,22,19,2);red.position.set(14,4,9);s.add(red);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),concrete);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;s.add(ground);
  const grid=new THREE.GridHelper(100,50,0x3c4c3d,0x29352d);grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.14;s.add(grid);
  const wallMat=material(0x29362e,.94),metal=material(0x46554a,.48,.62),dark=material(0x171f19,.92),hazard=material(0x9b9b61,.8);
  function wall(x,y,z,w,h,d){box(s,w,h,d,wallMat,x,y,z);box(s,w,.075,d+.03,hazard,x,y-h/2+.04,z,false);}
  wall(0,3,-31,62,6,1);wall(0,3,31,62,6,1);wall(-31,3,0,1,6,62);wall(31,3,0,1,6,62);
  for(let i=0;i<5;i++){const x=-21+i*10.5;box(s,5,3.1,2.2,metal,x,1.55,-17);for(let j=-1;j<=1;j++)box(s,.045,2.7,.035,dark,x+j*1.45,1.55,-15.85,false);box(s,5.2,.1,2.28,hazard,x,3.1,-17,false);}
  for(let i=0;i<4;i++){const x=-19+i*12.5;box(s,3.8,2.7,3.7,wallMat,x,1.35,15);box(s,3.9,.09,3.8,hazard,x,2.72,15,false);for(let j=0;j<4;j++)box(s,.05,2.45,.04,dark,x-1.5+j,1.35,16.88,false);}
  for(let i=0;i<20;i++){
    const x=(Math.random()-.5)*48,z=(Math.random()-.5)*48;if(Math.abs(x)<5&&Math.abs(z)<7)continue;
    if(i%3===0){const drum=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,1.04,14),material(0x49584b,.78,.18));drum.position.set(x,.52,z);drum.castShadow=true;s.add(drum);}
    else{const size=.65+Math.random()*.75;box(s,size,size,size,dark,x,size/2,z);box(s,size+.02,.045,size+.02,metal,x,size*.72,z);}
  }
  for(let z=-20;z<=20;z+=20){const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,54,10),metal);pipe.rotation.z=Math.PI/2;pipe.position.set(0,5.7,z);s.add(pipe);for(let x=-20;x<=20;x+=20){const lamp=new THREE.PointLight(0xc7d9ad,12,12,2);lamp.position.set(x,5.2,z);s.add(lamp);box(s,.62,.12,.35,dark,x,5.75,z,false);}}
  for(let i=0;i<14;i++){const stripe=box(s,.13,.018,1.3,hazard,-6+i*.9,.025,0,false);stripe.rotation.y=.18;}
  box(s,1.25,2.25,.75,dark,0,1.12,-27);box(s,.82,.58,.045,new THREE.MeshStandardMaterial({color:0x718f5d,emissive:0x476c38}),0,1.55,-26.6,false);
  const screenLight=new THREE.PointLight(0x93bf71,10,8,2);screenLight.position.set(0,1.8,-25);s.add(screenLight);
}
function initRenderer(){
  const r=new THREE.WebGLRenderer({antialias:true});r.setPixelRatio(Math.min(devicePixelRatio||1,1.7));r.setSize(innerWidth,innerHeight);
  r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.1;
  WORLD.appendChild(r.domElement);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.08,160);
  camera.rotation.order="YXZ";state.renderer=r;state.scene=scene;state.camera=camera;setupArena();
  r.domElement.addEventListener("click",()=>{if(state.running&&!state.paused&&!state.pointerLocked&&!isTouch())r.domElement.requestPointerLock?.();});
  document.addEventListener("pointerlockchange",()=>{state.pointerLocked=document.pointerLockElement===r.domElement;});
  document.addEventListener("mousemove",e=>{if(!state.pointerLocked||!state.running||state.paused)return;state.yaw-=e.movementX*.0022;state.pitch=THREE.MathUtils.clamp(state.pitch-e.movementY*.0022,-1.4,1.4);});
  window.addEventListener("resize",resizeAll);
}
function isTouch(){return matchMedia("(pointer:coarse)").matches||"ontouchstart"in window;}
function resizeAll(){if(state.renderer){state.camera.aspect=innerWidth/innerHeight;state.camera.updateProjectionMatrix();state.renderer.setSize(innerWidth,innerHeight);}if(state.preview)resizePreview();}
function setScreen(name){
  $("main-menu").classList.toggle("hidden",name!=="menu");$("armory-screen").classList.toggle("hidden",name!=="armory");$("log-screen").classList.toggle("hidden",name!=="log");
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.remove("hidden");state.toastUntil=performance.now()+2200;}
function status(message){$("network-status").textContent=message;}

function updateWeaponInfo(){
  const w=WEAPONS[state.selectedWeapon];
  $("gear-category").textContent=w.role;$("gear-name").textContent=w.name;$("gear-desc").textContent=w.description;
  $("gear-range").textContent=String(w.damage);$("gear-cooldown").textContent=w.rpm+" RPM";$("gear-charge").textContent=String(w.mag);
  $("gear-function").textContent=w.optic;$("gear-note").textContent=w.opticType==="scope"?"High-magnification tube optic for precise long-range viewing.":w.opticType==="holo"?"Open holographic window with a bright center reticle.":"Wide sight picture for close and mid-range engagements.";
  $("preview-mode").textContent=w.name;$("gear-status").textContent=state.selectedWeapon===0?"STARTING LOADOUT":"AVAILABLE LOADOUT";
  document.querySelectorAll(".gear-option").forEach((el,i)=>el.classList.toggle("active",i===state.selectedWeapon));
}
function buildWeaponList(){
  const list=$("gear-list");list.innerHTML="";
  WEAPONS.forEach((w,i)=>{const b=document.createElement("button");b.className="gear-option";const n=document.createElement("b"),d=document.createElement("span");n.textContent=w.name;d.textContent=w.optic;b.append(n,d);b.addEventListener("click",()=>{state.selectedWeapon=i;updateWeaponInfo();buildPreviewModel();});list.appendChild(b);});
}
function initPreview(){
  const canvas=$("preview-canvas"),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,30);camera.position.set(0,.35,4.4);camera.lookAt(0,0,0);
  state.preview={renderer,scene,camera,model:null,drag:false,lastX:0,lastY:0};
  canvas.addEventListener("pointerdown",e=>{state.preview.drag=true;state.preview.lastX=e.clientX;state.preview.lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{const p=state.preview;if(!p.drag||!p.model)return;p.model.rotation.y+=(e.clientX-p.lastX)*.009;p.model.rotation.x+=(e.clientY-p.lastY)*.006;p.lastX=e.clientX;p.lastY=e.clientY;});
  ["pointerup","pointercancel"].forEach(ev=>canvas.addEventListener(ev,()=>state.preview.drag=false));
  canvas.addEventListener("wheel",e=>{e.preventDefault();camera.position.z=THREE.MathUtils.clamp(camera.position.z+e.deltaY*.004,2.4,6);},{passive:false});
  buildPreviewModel();resizePreview();
}
function resizePreview(){const p=state.preview;if(!p)return;const r=$("preview-canvas").getBoundingClientRect();const w=Math.max(1,r.width),h=Math.max(1,r.height);p.renderer.setSize(w,h,false);p.camera.aspect=w/h;p.camera.updateProjectionMatrix();}
function buildPreviewModel(){
  const p=state.preview;if(!p)return;
  while(p.scene.children.length){const c=p.scene.children[0];p.scene.remove(c);dispose(c);}
  p.scene.add(new THREE.HemisphereLight(0xb8cbbb,0x19221d,2));const light=new THREE.DirectionalLight(0xe1e9da,2.4);light.position.set(3,5,4);p.scene.add(light);
  const rim=new THREE.PointLight(0x9cbe77,15,8);rim.position.set(-3,1,1);p.scene.add(rim);
  const grid=new THREE.GridHelper(8,20,0x647763,0x293b31);grid.position.y=-.63;grid.material.transparent=true;grid.material.opacity=.18;p.scene.add(grid);
  const model=createWeapon(WEAPONS[state.selectedWeapon]);model.scale.setScalar(1.48);model.position.y=-.05;model.rotation.set(.22,-.35,0);p.scene.add(model);p.model=model;
}
function equipWeapon(){
  if(state.weaponModel){state.camera.remove(state.weaponModel);dispose(state.weaponModel);}
  const model=createWeapon(WEAPONS[state.selectedWeapon]);model.name="held-weapon";model.scale.setScalar(.5);model.position.set(.3,-.27,-.55);model.rotation.set(0,0,0);
  state.camera.add(model);state.weaponModel=model;updateWeaponHud();
}
function updateWeaponHud(){
  const w=WEAPONS[state.selectedWeapon],a=state.ammo[w.id]||{mag:w.mag,reserve:w.reserve};
  $("active-tool").textContent=w.name;$("tool-function").textContent=w.optic;
  $("ammo-current").textContent=String(a.mag);$("ammo-reserve").textContent=String(a.reserve);
}
function switchWeapon(i){
  if(!state.running||state.paused||i<0||i>=WEAPONS.length||i===state.selectedWeapon)return;
  state.selectedWeapon=i;state.aiming=false;$("scope-overlay").classList.add("hidden");$("crosshair").classList.remove("hidden");state.camera.fov=76;state.camera.updateProjectionMatrix();
  equipWeapon();updateWeaponInfo();toast("LOADOUT // "+WEAPONS[i].name);
}
function resetPlayer(x=0,z=7){
  state.player={x,y:0,z,hp:100,maxHp:100,credits:0,vy:0,onGround:true};state.yaw=0;state.pitch=0;
  state.camera.position.set(x,1.65,z);state.camera.rotation.set(0,0,0);state.player.x=x;state.player.z=z;
  state.wave=0;state.phase="IDLE";state.spawnLeft=0;state.spawnBossPending=false;state.spawnTimer=0;state.intermission=0;state.bossId=null;
  state.ammo={};WEAPONS.forEach(w=>state.ammo[w.id]={mag:w.mag,reserve:w.reserve});
  state.selectedWeapon=0;state.reloadUntil=0;state.aiming=false;
  clearDynamic();$("boss-bar").classList.add("hidden");$("pause-menu").classList.add("hidden");$("game-over").classList.add("hidden");$("scope-overlay").classList.add("hidden");
  equipWeapon();updatePlayerHud();
}
function clearDynamic(){
  for(const e of state.enemies.values()){state.scene.remove(e.mesh);dispose(e.mesh);}state.enemies.clear();
  for(const m of state.remoteMeshes.values()){state.scene.remove(m);dispose(m);}state.remoteMeshes.clear();
}
function startGame(mode){
  if(mode==="solo")cleanupNetwork();state.mode=mode;state.running=true;state.paused=false;state.gameOver=false;
  resetPlayer(mode==="guest"?2.5:0,7);
  $("main-menu").classList.add("hidden");$("armory-screen").classList.add("hidden");$("log-screen").classList.add("hidden");$("hud").classList.remove("hidden");
  $("network-mode").textContent=mode==="solo"?"SOLO SESSION":mode==="host"?"HOST / SQUAD LINK":"CONNECTED GUEST";
  $("connection-label").textContent=mode==="solo"?"LOCAL SESSION":mode==="host"?"HOST SIGNAL ONLINE":"SQUAD LINK ONLINE";
  updateSquadHud();if(mode!=="guest")startNextWave();if(!isTouch())state.renderer.domElement.requestPointerLock?.();
}
function startNextWave(){
  if(state.mode==="guest")return;state.wave++;state.phase="INCOMING";state.intermission=3;
  const normal=Math.min(4+state.wave*2,26);state.spawnBossPending=state.wave%5===0;state.spawnLeft=normal+(state.spawnBossPending?1:0);
  $("wave-number").textContent=String(state.wave).padStart(2,"0");$("wave-phase").textContent="INCOMING";
  $("objective-text").textContent=state.spawnBossPending?"BOSS SIGNATURE DETECTED":"PREPARE FOR CONTACT";
  if(state.spawnBossPending){$("boss-bar").classList.remove("hidden");$("boss-name").textContent=state.wave===5?"THE WARDEN":"THE COLOSSUS";$("boss-fill").style.width="100%";toast("WARNING // BOSS CONTACT — WAVE "+state.wave);}
  else{$("boss-bar").classList.add("hidden");toast("WAVE "+state.wave+" INCOMING");}
}
function spawnInfected(boss=false){
  const a=Math.random()*Math.PI*2,d=18+Math.random()*8,x=THREE.MathUtils.clamp(Math.cos(a)*d,-27,27),z=THREE.MathUtils.clamp(Math.sin(a)*d,-27,27);
  const mesh=createInfected(boss);mesh.position.set(x,0,z);state.scene.add(mesh);
  const id="infected-"+(state.nextId++),hp=boss?1300+state.wave*150:90+state.wave*14;
  const e={id,mesh,x,z,hp,maxHp:hp,boss,speed:(boss?1.15:1.55)+Math.min(state.wave*.035,.7),damage:boss?18:7+Math.floor(state.wave*.7),nextAttack:0,phase:Math.random()*6};
  state.enemies.set(id,e);if(boss)state.bossId=id;
}
function updateWave(dt){
  if(state.mode==="guest")return;
  if(state.phase==="INCOMING"){state.intermission-=dt;if(state.intermission<=0){state.phase="ACTIVE";state.spawnTimer=0;$("wave-phase").textContent="ACTIVE";$("objective-text").textContent="ELIMINATE THE INFECTED";}return;}
  if(state.phase==="ACTIVE"){
    state.spawnTimer-=dt;
    if(state.spawnLeft>0&&state.spawnTimer<=0){const boss=state.spawnBossPending;if(boss)state.spawnBossPending=false;spawnInfected(boss);state.spawnLeft--;state.spawnTimer=boss?4:Math.max(.72,1.45-state.wave*.025);}
    if(state.spawnLeft===0&&state.enemies.size===0){state.phase="CLEAR";state.intermission=4;$("wave-phase").textContent="SECTOR CLEAR";$("objective-text").textContent="SECTOR SECURED — REARM";state.player.credits+=100+state.wave*20;toast("SECTOR SECURED // +"+(100+state.wave*20)+" CREDITS");}
    return;
  }
  if(state.phase==="CLEAR"){state.intermission-=dt;if(state.intermission<=0)startNextWave();}
}
function targetPlayers(){
  const out=[{id:"HOST",x:state.player.x,z:state.player.z,hp:state.player.hp}];for(const [id,p] of state.players)out.push({id,x:p.x,z:p.z,hp:p.hp});return out.filter(p=>p.hp>0);
}
function updateEnemies(dt,time){
  const targets=targetPlayers();
  for(const e of state.enemies.values()){
    const target=targets.reduce((best,p)=>{const d=Math.hypot(p.x-e.x,p.z-e.z);return !best||d<best.d?{...p,d}:best;},null);if(!target)continue;
    const dx=target.x-e.x,dz=target.z-e.z,d=Math.hypot(dx,dz)||.001;
    if(d>1.35){e.x+=dx/d*e.speed*dt;e.z+=dz/d*e.speed*dt;e.mesh.position.set(e.x,0,e.z);e.mesh.rotation.y=Math.atan2(dx,dz);}
    const ud=e.mesh.userData,swing=Math.sin(time*6+e.phase)*.42;
    if(ud.arms){ud.arms[0].rotation.x=swing-.2;ud.arms[1].rotation.x=-swing-.2;ud.legs[0].rotation.x=-swing*.6;ud.legs[1].rotation.x=swing*.6;}
    if(d<1.55&&time>e.nextAttack){e.nextAttack=time+(e.boss?1.4:1.65);if(target.id==="HOST")damagePlayer(e.damage);else{const p=state.players.get(target.id);if(p){p.hp=Math.max(0,p.hp-e.damage);const c=state.connections.get(target.id);if(c?.open)c.send({type:"damage",hp:p.hp});checkSquadLoss();}}}
  }
  updateBossHud();
}
function updateBossHud(){
  if(!state.bossId)return;const e=state.enemies.get(state.bossId);if(!e){$("boss-bar").classList.add("hidden");state.bossId=null;return;}
  $("boss-fill").style.width=(Math.max(0,e.hp/e.maxHp)*100)+"%";
}
function updatePlayerHud(){
  $("player-health").textContent=String(Math.ceil(state.player.hp));$("health-fill").style.width=(state.player.hp/state.player.maxHp*100)+"%";
  $("enemy-count").textContent="HOSTILES: "+state.enemies.size;updateSquadHud();updateWeaponHud();
}
function updateSquadHud(){$("squad-count").textContent=String(1+state.players.size).padStart(2,"0")+" / 04";}
function damagePlayer(amount){
  if(state.player.hp<=0)return;state.player.hp=Math.max(0,state.player.hp-amount);
  $("damage-vignette").classList.add("active");setTimeout(()=>$("damage-vignette").classList.remove("active"),170);updatePlayerHud();checkSquadLoss();
}
function checkSquadLoss(){if(state.mode==="guest")return;if(state.player.hp<=0&&![...state.players.values()].some(p=>p.hp>0))endGame();}
function getViewDirection(){
  const d=new THREE.Vector3();state.camera.getWorldDirection(d);return d.normalize();
}
function findHit(origin,direction,range=100){
  let best=null,bestT=Infinity;
  for(const e of state.enemies.values()){
    const center=new THREE.Vector3(e.x,e.boss?1.45:1.12,e.z),to=center.clone().sub(origin),along=to.dot(direction);
    if(along<0||along>range)continue;
    const closest=origin.clone().addScaledVector(direction,along),distance=closest.distanceTo(center);
    if(distance<(e.boss?1.35:.82)&&along<bestT){best=e;bestT=along;}
  }
  return best;
}
function tracer(origin,end){
  const geometry=new THREE.BufferGeometry().setFromPoints([origin,end]);
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xd8efb7,transparent:true,opacity:.82}));
  state.scene.add(line);setTimeout(()=>{state.scene.remove(line);dispose(line);},95);
}
function flashMuzzle(){
  if(!state.weaponModel)return;
  const flash=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),new THREE.MeshBasicMaterial({color:0xffdf9a}));
  flash.position.set(0,.035,-1.38);state.weaponModel.add(flash);
  setTimeout(()=>{state.weaponModel?.remove(flash);dispose(flash);},55);
  state.weaponModel.position.z=-.51;setTimeout(()=>{if(state.weaponModel)state.weaponModel.position.z=-.55;},65);
}
function damageEnemy(e,damage,source="HOST"){
  e.hp-=damage;
  if(e.hp<=0){
    state.scene.remove(e.mesh);dispose(e.mesh);state.enemies.delete(e.id);
    if(e.boss)state.bossId=null;
    if(state.mode!=="guest"&&source==="HOST")state.player.credits+=e.boss?550:25;
  }
  $("enemy-count").textContent="HOSTILES: "+state.enemies.size;updateBossHud();
}
function shoot(originData=null,directionData=null,remote=false){
  if(!state.running||state.paused||state.gameOver)return;
  const w=WEAPONS[state.selectedWeapon],a=state.ammo[w.id];if(!a)return;
  const now=performance.now();if(now<state.reloadUntil||now-state.lastShot<60000/w.rpm)return;
  if(a.mag<=0){reload();return;}state.lastShot=now;a.mag--;updateWeaponHud();
  const origin=originData?new THREE.Vector3(originData.x,originData.y,originData.z):state.camera.position.clone();
  let direction=directionData?new THREE.Vector3(directionData.x,directionData.y,directionData.z).normalize():getViewDirection();
  const spread=w.spread*(state.aiming?.25:1);
  direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();
  flashMuzzle();
  const hitPoint=origin.clone().addScaledVector(direction,45);
  if(state.mode==="guest"&&!remote){
    state.conn?.send({type:"shot",origin:{x:origin.x,y:origin.y,z:origin.z},direction:{x:direction.x,y:direction.y,z:direction.z},weapon:state.selectedWeapon});
  }else{
    const enemy=findHit(origin,direction,w.id==="vulture"?120:90);
    if(enemy){damageEnemy(enemy,w.damage,remote?"GUEST":"HOST");hitPoint.set(enemy.x,enemy.boss?1.4:1.1,enemy.z);$("hit-marker").classList.remove("hidden");setTimeout(()=>$("hit-marker").classList.add("hidden"),110);}
  }
  tracer(origin,hitPoint);
  if(state.mode==="host"&&!remote)broadcastSnapshot();
}
function remoteShot(data,peerId){
  const idx=Math.max(0,Math.min(WEAPONS.length-1,Number(data.weapon)||0)),w=WEAPONS[idx];
  const origin=new THREE.Vector3(data.origin.x,data.origin.y,data.origin.z),dir=new THREE.Vector3(data.direction.x,data.direction.y,data.direction.z).normalize();
  const e=findHit(origin,dir,w.id==="vulture"?120:90);if(e)damageEnemy(e,w.damage,"GUEST");
}
function reload(){
  if(!state.running||state.paused)return;const w=WEAPONS[state.selectedWeapon],a=state.ammo[w.id],now=performance.now();
  if(!a||a.mag>=w.mag||a.reserve<=0||now<state.reloadUntil)return;
  state.reloadUntil=now+(w.id==="vulture"?1750:1350);toast("RELOADING // "+w.name);
  setTimeout(()=>{if(!state.running)return;const n=Math.min(w.mag-a.mag,a.reserve);a.mag+=n;a.reserve-=n;state.reloadUntil=0;updateWeaponHud();},w.id==="vulture"?1750:1350);
}
function aim(on){
  if(!state.running||state.paused)return;state.aiming=on;
  const w=WEAPONS[state.selectedWeapon],zoom=on?w.zoom:1;
  $("scope-overlay").classList.toggle("hidden",!on);$("crosshair").classList.toggle("hidden",on);
  $("scope-label").textContent=w.optic;
  ["reflex","holo","scope","prism","combat","micro","lpvo"].forEach(type=>$("scope-overlay").classList.toggle("scope-"+type,on&&w.opticType===type));
  state.camera.fov=on?76/zoom:76;state.camera.updateProjectionMatrix();
  if(state.weaponModel){state.weaponModel.position.x=on ? 0.05 : 0.3;state.weaponModel.position.y=on ? -0.2 : -0.27;}
}
function movePlayer(dt){
  const p=state.player;let mx=0,mz=0;
  if(state.keys.KeyW||state.keys.ArrowUp)mz-=1;if(state.keys.KeyS||state.keys.ArrowDown)mz+=1;
  if(state.keys.KeyA||state.keys.ArrowLeft)mx-=1;if(state.keys.KeyD||state.keys.ArrowRight)mx+=1;
  mx+=state.mobile.x;mz+=state.mobile.z;const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
  const forward=new THREE.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw)),right=new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw));
  const move=forward.multiplyScalar(-mz).add(right.multiplyScalar(mx)),sprint=state.keys.ShiftLeft||state.keys.ShiftRight;
  const speed=sprint?7.15:5.1;p.x=THREE.MathUtils.clamp(p.x+move.x*speed*dt,-29,29);p.z=THREE.MathUtils.clamp(p.z+move.z*speed*dt,-29,29);
  if((state.keys.Space||state.mobile.jump)&&p.onGround){p.vy=5.3;p.onGround=false;state.mobile.jump=false;}
  p.y+=p.vy*dt;if(!p.onGround){p.vy-=14*dt;if(p.y<=0){p.y=0;p.vy=0;p.onGround=true;}}
  state.camera.position.set(p.x,1.65+p.y,p.z);state.camera.rotation.set(state.pitch,state.yaw,0,"YXZ");
}
function updateRemote(players){
  const keep=new Set();
  for(const p of players){if(p.id===state.playerId)continue;keep.add(p.id);let m=state.remoteMeshes.get(p.id);if(!m){m=remoteOperator();state.scene.add(m);state.remoteMeshes.set(p.id,m);}m.position.set(p.x,0,p.z);m.rotation.y=p.yaw||0;}
  for(const [id,m] of state.remoteMeshes)if(!keep.has(id)){state.scene.remove(m);dispose(m);state.remoteMeshes.delete(id);}
}
function syncEnemies(list){
  const keep=new Set();
  for(const d of list){keep.add(d.id);let e=state.enemies.get(d.id);
    if(!e){const mesh=createInfected(d.boss);state.scene.add(mesh);e={...d,mesh};state.enemies.set(d.id,e);}
    Object.assign(e,{x:d.x,z:d.z,hp:d.hp,maxHp:d.maxHp,boss:d.boss});e.mesh.position.set(d.x,0,d.z);e.mesh.rotation.y=d.rotation||0;
  }
  for(const [id,e] of state.enemies)if(!keep.has(id)){state.scene.remove(e.mesh);dispose(e.mesh);state.enemies.delete(id);}
}
function broadcastSnapshot(){
  if(state.mode!=="host")return;
  const enemies=[...state.enemies.values()].map(e=>({id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,boss:e.boss,rotation:e.mesh.rotation.y}));
  const players=[{id:"HOST",x:state.player.x,z:state.player.z,yaw:state.yaw,hp:state.player.hp}];
  for(const [id,p] of state.players)players.push({id,x:p.x,z:p.z,yaw:p.yaw,hp:p.hp});
  const packet={type:"snapshot",wave:state.wave,phase:state.phase,enemies,players,hostiles:enemies.length};
  for(const c of state.connections.values())if(c.open)c.send(packet);
}
function applySnapshot(p){
  if(state.mode!=="guest")return;if(!state.running)startGuestWorld();
  state.wave=p.wave;state.phase=p.phase;$("wave-number").textContent=String(p.wave).padStart(2,"0");$("wave-phase").textContent=p.phase;
  $("enemy-count").textContent="HOSTILES: "+p.hostiles;$("objective-text").textContent=p.phase==="ACTIVE"?"ELIMINATE THE INFECTED":p.phase==="INCOMING"?"PREPARE FOR CONTACT":"SECTOR SECURED — REARM";
  syncEnemies(p.enemies||[]);updateRemote(p.players||[]);
  const boss=(p.enemies||[]).find(e=>e.boss);
  if(boss){$("boss-bar").classList.remove("hidden");$("boss-name").textContent=p.wave===5?"THE WARDEN":"THE COLOSSUS";$("boss-fill").style.width=(boss.hp/boss.maxHp*100)+"%";}else $("boss-bar").classList.add("hidden");
}
function startGuestWorld(){startGame("guest");}
function sendPose(){if(state.mode==="guest"&&state.conn?.open)state.conn.send({type:"pose",x:state.player.x,z:state.player.z,yaw:state.yaw});}
function handleHostData(id,data){
  if(!data||typeof data!=="object")return;
  if(data.type==="pose"){const p=state.players.get(id);if(p){p.x=THREE.MathUtils.clamp(Number(data.x)||0,-29,29);p.z=THREE.MathUtils.clamp(Number(data.z)||0,-29,29);p.yaw=Number(data.yaw)||0;}}
  if(data.type==="shot")remoteShot(data,id);
}
function cleanupNetwork(){
  if(state.conn){try{state.conn.close();}catch{}state.conn=null;}
  for(const c of state.connections.values())try{c.close();}catch{}
  state.connections.clear();state.players.clear();
  if(state.peer){try{state.peer.destroy();}catch{}state.peer=null;}
}
function hostRoom(){
  cleanupNetwork();if(!window.Peer){status("PeerJS could not load. Reload the page or use solo mode.");return;}
  const id="dead-signal-"+Math.random().toString(36).slice(2,10),peer=new window.Peer(id,{debug:0});state.peer=peer;status("Opening squad room…");
  peer.on("open",roomId=>{$("host-room").classList.remove("hidden");$("host-code").textContent=roomId;status("Room ready. Share this code with up to three squad members.");startGame("host");});
  peer.on("connection",c=>{
    if(state.connections.size>=3){c.on("open",()=>c.send({type:"full"}));c.close();return;}
    c.on("open",()=>{state.connections.set(c.peer,c);state.players.set(c.peer,{x:2,z:7,yaw:0,hp:100});updateSquadHud();broadcastSnapshot();toast("SQUAD MEMBER CONNECTED");});
    c.on("data",d=>handleHostData(c.peer,d));
    c.on("close",()=>{state.connections.delete(c.peer);state.players.delete(c.peer);updateSquadHud();broadcastSnapshot();});
    c.on("error",()=>{state.connections.delete(c.peer);state.players.delete(c.peer);});
  });
  peer.on("error",e=>status("Room connection issue: "+e.type+". Solo play remains available."));
}
function joinRoom(code){
  if(!window.Peer){status("PeerJS could not load. Reload the page or use solo mode.");return;}
  const peer=new window.Peer(undefined,{debug:0});state.peer=peer;status("Connecting to host…");
  peer.on("open",()=>{const c=peer.connect(code,{reliable:true});state.conn=c;
    c.on("open",()=>{state.playerId=peer.id;status("Squad connected. Waiting for battlefield snapshot…");$("main-menu").classList.add("hidden");});
    c.on("data",d=>{
      if(d.type==="full"){status("This squad is full. Maximum is four operators.");c.close();}
      if(d.type==="snapshot")applySnapshot(d);
      if(d.type==="damage"){state.player.hp=d.hp;updatePlayerHud();$("damage-vignette").classList.add("active");setTimeout(()=>$("damage-vignette").classList.remove("active"),160);if(d.hp<=0)toast("OPERATOR DOWN // SQUAD MUST HOLD");}
      if(d.type==="gameover"){state.running=false;state.gameOver=true;document.exitPointerLock?.();$("final-stats").textContent="The squad was overrun on wave "+d.wave+".";$("game-over").classList.remove("hidden");}
    });
    c.on("close",()=>{state.running=false;$("hud").classList.add("hidden");setScreen("menu");toast("HOST CONNECTION LOST");});
    c.on("error",()=>status("Could not connect. Check the room code and try again."));
  });
  peer.on("error",e=>status("Connection failed: "+e.type+". Verify the room code and retry."));
}
function endGame(){
  if(state.gameOver)return;state.gameOver=true;state.running=false;document.exitPointerLock?.();
  $("final-stats").textContent="You reached wave "+state.wave+" and earned "+state.player.credits+" field credits.";
  $("game-over").classList.remove("hidden");if(state.mode==="host")for(const c of state.connections.values())if(c.open)c.send({type:"gameover",wave:state.wave});
}
function pauseGame(){if(!state.running||state.paused||state.gameOver)return;state.paused=true;document.exitPointerLock?.();$("pause-menu").classList.remove("hidden");}
function resumeGame(){if(!state.running||!state.paused)return;state.paused=false;$("pause-menu").classList.add("hidden");if(!isTouch())state.renderer.domElement.requestPointerLock?.();}
function returnToBase(){
  state.running=false;state.paused=false;state.gameOver=false;document.exitPointerLock?.();cleanupNetwork();clearDynamic();
  $("hud").classList.add("hidden");$("pause-menu").classList.add("hidden");$("game-over").classList.add("hidden");$("connection-label").textContent="SYSTEM STANDBY";setScreen("menu");$("host-room").classList.add("hidden");
}

function bindControls(){
  document.addEventListener("keydown",e=>{
    state.keys[e.code]=true;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    if(e.code==="Escape"&&state.running&&!state.paused)pauseGame();if(e.code==="KeyR")reload();
    if(e.code.startsWith("Digit")){const slot=Number(e.code.slice(5));if(slot>=1&&slot<=7)switchWeapon(slot-1);}
  });
  document.addEventListener("keyup",e=>state.keys[e.code]=false);
  document.addEventListener("mousedown",e=>{
    if(e.button===0&&state.running&&!state.paused){if(!state.pointerLocked&&!isTouch())state.renderer.domElement.requestPointerLock?.();state.firing=true;shoot();}
    if(e.button===2)aim(true);
  });
  document.addEventListener("mouseup",e=>{if(e.button===0)state.firing=false;if(e.button===2)aim(false);});
  document.addEventListener("contextmenu",e=>e.preventDefault());
  $("reload-button").addEventListener("click",reload);$("mobile-reload").addEventListener("click",reload);
  $("mobile-fire").addEventListener("pointerdown",e=>{e.preventDefault();state.firing=true;shoot();});
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>$("mobile-fire").addEventListener(ev,()=>state.firing=false));
  $("mobile-aim").addEventListener("pointerdown",e=>{e.preventDefault();aim(true);});
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>$("mobile-aim").addEventListener(ev,()=>aim(false)));
  const stick=$("move-stick"),knob=$("stick-knob");
  stick.addEventListener("pointerdown",e=>{stick.setPointerCapture(e.pointerId);setStick(e);});
  stick.addEventListener("pointermove",e=>{if(e.buttons)setStick(e);});
  ["pointerup","pointercancel"].forEach(ev=>stick.addEventListener(ev,()=>{state.mobile.x=0;state.mobile.z=0;knob.style.transform="translate(0,0)";}));
  function setStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),k=Math.min(1,42/(len||1));state.mobile.x=dx/42*k;state.mobile.z=dy/42*k;knob.style.transform="translate("+(dx*k)+"px,"+(dy*k)+"px)";}
  const look=$("look-zone");
  look.addEventListener("pointerdown",e=>{look.setPointerCapture(e.pointerId);state.mobile.lookId=e.pointerId;state.mobile.lastX=e.clientX;state.mobile.lastY=e.clientY;});
  look.addEventListener("pointermove",e=>{if(state.mobile.lookId!==e.pointerId)return;state.yaw-=(e.clientX-state.mobile.lastX)*.006;state.pitch=THREE.MathUtils.clamp(state.pitch-(e.clientY-state.mobile.lastY)*.006,-1.35,1.35);state.mobile.lastX=e.clientX;state.mobile.lastY=e.clientY;});
  ["pointerup","pointercancel"].forEach(ev=>look.addEventListener(ev,e=>{if(state.mobile.lookId===e.pointerId)state.mobile.lookId=null;}));
}
function bindMenu(){
  $("play-solo").addEventListener("click",()=>startGame("solo"));
  $("open-armory").addEventListener("click",()=>{setScreen("armory");updateWeaponInfo();resizePreview();});
  $("host-game").addEventListener("click",hostRoom);
  $("show-join").addEventListener("click",()=>{$("join-row").classList.remove("hidden");$("room-code").focus();});
  $("join-game").addEventListener("click",()=>{const code=$("room-code").value.trim();if(!code){status("Enter the host room code first.");return;}joinRoom(code);});
  $("copy-code").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("host-code").textContent);status("Room code copied. Send it to your squad.");}catch{status("Select and copy the room code manually.");}});
  $("open-log").addEventListener("click",()=>setScreen("log"));
  document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",()=>setScreen("menu")));
  $("equip-gear").addEventListener("click",()=>{setScreen("menu");toast(WEAPONS[state.selectedWeapon].name+" SELECTED");});
  $("resume-button").addEventListener("click",resumeGame);$("leave-button").addEventListener("click",returnToBase);
  $("retry-button").addEventListener("click",()=>{const m=state.mode;cleanupNetwork();if(m==="host")hostRoom();else startGame("solo");});
  $("menu-button").addEventListener("click",returnToBase);
}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(state.clock.getDelta(),.05),time=performance.now()/1000;
  if(state.running&&!state.paused&&!state.gameOver){
    movePlayer(dt);
    if(state.firing&&performance.now()-state.lastShot>=60000/WEAPONS[state.selectedWeapon].rpm)shoot();
    if(state.mode!=="guest"){
      updateWave(dt);updateEnemies(dt,time);
      if(state.mode==="host"&&performance.now()-state.lastSync>120){state.lastSync=performance.now();broadcastSnapshot();}
    }else if(performance.now()-state.lastPose>80){state.lastPose=performance.now();if(state.conn?.open)state.conn.send({type:"pose",x:state.player.x,z:state.player.z,yaw:state.yaw});}
    updatePlayerHud();
  }
  if(state.preview?.model&&!state.preview.drag)state.preview.model.rotation.y+=dt*.3;
  if(state.preview)state.preview.renderer.render(state.preview.scene,state.preview.camera);
  if(state.renderer)state.renderer.render(state.scene,state.camera);
  if(state.toastUntil&&performance.now()>state.toastUntil){$("toast").classList.add("hidden");state.toastUntil=0;}
}
function boot(){
  initRenderer();initPreview();buildWeaponList();updateWeaponInfo();bindControls();bindMenu();
  setTimeout(()=>{$("loading-screen").style.opacity="0";setTimeout(()=>$("loading-screen").remove(),420);},800);
  animate();
}
boot();
