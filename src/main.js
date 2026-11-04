import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const $ = (id) => document.getElementById(id);
const WORLD = $("world");
const WEAPONS = [
  {id:"ranger",name:"RANGER AR",role:"ASSAULT RIFLE / PRIMARY",desc:"A reliable service rifle with a fast reflex optic, moderate recoil and a balanced fire rate.",damage:34,rpm:520,mag:30,reserve:150,optic:"REFLEX 1.5X",opticStyle:"reflex",opticDesc:"Wide sight picture for close and mid-range engagements.",spread:0.012,range:85,color:0x46534c},
  {id:"vulture",name:"VULTURE DMR",role:"DESIGNATED MARKSMAN / PRECISION",desc:"A heavier precision platform with a high-magnification glass optic and deliberate follow-up shots.",damage:76,rpm:165,mag:12,reserve:72,optic:"VARIABLE 4X",opticStyle:"scope",opticDesc:"Long tube optic with a fine crosshair for accurate long-range shots.",spread:0.0025,range:110,color:0x555b50},
  {id:"breach",name:"BREACH SMG",role:"SUBMACHINE GUN / CLOSE QUARTERS",desc:"Compact and quick to handle, fitted with a holographic sight for fast target transitions.",damage:22,rpm:860,mag:36,reserve:180,optic:"HOLO 2X",opticStyle:"holo",opticDesc:"Open holographic window with a bright center reticle.",spread:0.019,range:62,color:0x3f4d48}
];
const state = {
  renderer:null, scene:null, camera:null, clock:new THREE.Clock(),
  running:false, paused:false, gameOver:false, mode:"solo", peer:null, conn:null, connections:new Map(),
  networkPlayers:new Map(), remoteMeshes:new Map(), enemies:new Map(), weaponModels:new Map(),
  keys:Object.create(null), yaw:0, pitch:0, pointerLocked:false, aiming:false, firing:false, lastShot:0,
  wave:0, wavePhase:"IDLE", spawnLeft:0, spawnTimer:0, intermission:0, waveElapsed:0,
  player:{x:0,y:0,z:0,hp:100,maxHp:100,credits:500,speed:5.2,vy:0,onGround:true},
  playerId:"HOST", selectedWeapon:0, ammo:{}, reloadUntil:0, lastSync:0, lastNetworkSend:0, nextId:1,
  bossId:null, nextEnemyAt:0, mobile:{x:0,z:0,lookId:null,lastX:0,lastY:0}, toastUntil:0, preview:null
};

const makeMat = (color,roughness=0.8,metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
function addBox(parent,w,h,d,material,x=0,y=0,z=0,cast=true,receive=true){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material); mesh.position.set(x,y,z); mesh.castShadow=cast; mesh.receiveShadow=receive; parent.add(mesh); return mesh;
}
function makeCanvasTexture(base="#3a443b",seed=1){
  const canvas=document.createElement("canvas"); canvas.width=128; canvas.height=128;
  const ctx=canvas.getContext("2d"); ctx.fillStyle=base; ctx.fillRect(0,0,128,128);
  let n=seed>>>0; const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
  for(let i=0;i<1800;i++){const v=Math.floor(rand()*70);ctx.fillStyle="rgba("+v+","+v+","+v+","+(.03+rand()*.12)+")";ctx.fillRect(rand()*128,rand()*128,1+rand()*3,1+rand()*3);}
  const t=new THREE.CanvasTexture(canvas); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const clothTexture=makeCanvasTexture("#374238",17);
const rustyTexture=makeCanvasTexture("#343b36",42);
function makeConcrete(){
  const m=makeMat(0x555d55,.96);m.map=makeCanvasTexture("#505750",9);m.map.needsUpdate=true;return m;
}
function createWeaponModel(def){
  const group=new THREE.Group();
  const dark=makeMat(0x171e1b,.45,.65),steel=makeMat(0x56615b,.35,.8),poly=makeMat(def.color,.7,.15),rubber=makeMat(0x202723,.94),glass=new THREE.MeshStandardMaterial({color:0x8ba78c,metalness:.6,roughness:.13,transparent:true,opacity:.5,emissive:0x14251a,emissiveIntensity:.35});
  addBox(group,.25,.2,.65,poly,0,0,0);
  addBox(group,.22,.15,.22,dark,0,.015,-.38);
  addBox(group,.19,.19,.29,rubber,0,-.015,.45);
  addBox(group,.17,.27,.2,poly,0,-.2,.17);
  const grip=addBox(group,.12,.35,.15,rubber,0,-.29,.23);grip.rotation.x=-.18;
  addBox(group,.28,.28,.14,poly,0,-.16,-.29);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.037,.045,.76,12),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.015,-.68);group.add(barrel);
  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.055,.045,.12,12),dark);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.015,-1.08);group.add(muzzle);
  const frontSight=addBox(group,.06,.11,.05,dark,0,.12,-.78);
  const rearSight=addBox(group,.07,.1,.05,dark,0,.13,-.2);
  // Rails, fasteners, side ejection port and magazine add visual definition.
  addBox(group,.22,.035,.5,dark,0,.12,-.02);
  addBox(group,.08,.09,.2,steel,.14,.015,-.05);
  addBox(group,.025,.05,.12,dark,.14,-.04,-.08);
  for(let i=0;i<5;i++){const screw=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.012,8),steel);screw.rotation.z=Math.PI/2;screw.position.set(.13,.055,.18-i*.07);group.add(screw);}
  for(let i=0;i<4;i++)addBox(group,.018,.023,.03,steel,-.12,.12,.16-i*.09);
  // Distinct magazine profile per platform.
  const magH=def.id==="vulture"?.37:.42, magW=def.id==="breach"?.13:.18;
  const mag=addBox(group,magW,magH,.22,rubber,0,-.31,-.08);mag.rotation.x=def.id==="vulture"?-.08:-.13;
  for(let i=0;i<5;i++)addBox(group,magW+.006,.018,.014,steel,0,-.17-i*.055,-.2);
  const scope=new THREE.Group();scope.position.set(0,.23,-.13);group.add(scope);
  const scopeBody=new THREE.Mesh(new THREE.CylinderGeometry(def.opticStyle==="scope"?.075:.062,def.opticStyle==="scope"?.075:.062,def.opticStyle==="scope"?.42:.25,16),dark);
  scopeBody.rotation.x=Math.PI/2;scope.add(scopeBody);
  const ringGeo=new THREE.TorusGeometry(def.opticStyle==="scope"?.09:.085,.018,8,20);
  const backRing=new THREE.Mesh(ringGeo,steel);backRing.position.z=.16;scope.add(backRing);
  const frontRing=new THREE.Mesh(ringGeo,steel);frontRing.position.z=-.18;scope.add(frontRing);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(def.opticStyle==="scope"?.072:.065,24),glass);lens.position.z=-.19;scope.add(lens);
  if(def.opticStyle==="reflex"){
    const hood=addBox(scope,.2,.14,.04,steel,0,.015,.02);addBox(scope,.14,.09,.03,dark,0,.015,-.005);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.012,8,8),new THREE.MeshBasicMaterial({color:0xff5148}));dot.position.set(0,.015,-.025);scope.add(dot);
  }else if(def.opticStyle==="holo"){
    addBox(scope,.19,.17,.07,dark,0,.015,0);addBox(scope,.13,.11,.012,glass,0,.02,-.04);
    const dot=new THREE.Mesh(new THREE.RingGeometry(.016,.021,20),new THREE.MeshBasicMaterial({color:0xff655d}));dot.position.set(0,.02,-.05);scope.add(dot);
  }else{
    addBox(scope,.13,.045,.12,steel,0,-.08,.02);
    const focus=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.035,16),dark);focus.rotation.x=Math.PI/2;focus.position.z=.24;scope.add(focus);
  }
  // Sling and rail ribs.
  const sling=new THREE.Mesh(new THREE.TorusGeometry(.24,.018,6,24,Math.PI),rubber);sling.rotation.z=Math.PI/2;sling.position.set(.12,-.04,.25);group.add(sling);
  group.userData.optic=scope;
  return group;
}
function createInfected(isBoss=false){
  const root=new THREE.Group();
  const skin=makeMat(isBoss?0x4c5548:0x66735b,.94),skinDark=makeMat(0x384239,.9),shirt=new THREE.MeshStandardMaterial({color:isBoss?0x292d27:0x3a463a,roughness:.96,map:clothTexture}),pants=new THREE.MeshStandardMaterial({color:0x252e2a,roughness:1,map:rustyTexture}),bone=makeMat(0x9b9d79,.9),eye=new THREE.MeshStandardMaterial({color:0xb8d56a,emissive:0x627e30,emissiveIntensity:1.1,roughness:.3});
  const torso=addBox(root,isBoss?.83:.6,isBoss?1.05:.78,isBoss?.4:.31,shirt,0,1.12,0);torso.rotation.z=-.06;
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.2,8),skin);neck.position.set(0,1.65,0);root.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(isBoss?.31:.235,14,12),skin);head.scale.set(1,.95,.86);head.position.set(.02,1.88,.015);head.castShadow=true;root.add(head);
  const jaw=addBox(root,isBoss?.32:.24,.13,.2,skinDark,0,1.72,-.055);jaw.rotation.x=-.15;
  const eyeL=new THREE.Mesh(new THREE.SphereGeometry(.035,8,8),eye);eyeL.position.set(-.085,1.91,.208);root.add(eyeL);
  const eyeR=eyeL.clone();eyeR.position.x=.105;root.add(eyeR);
  const armL=new THREE.Group();armL.position.set(-.38,1.43,0);root.add(armL);
  const armR=new THREE.Group();armR.position.set(.38,1.43,0);root.add(armR);
  for(const [arm,sign] of [[armL,-1],[armR,1]]){
    const upper=new THREE.Mesh(new THREE.CapsuleGeometry(isBoss?.16:.11,.38,4,8),shirt);upper.position.y=-.25;upper.rotation.z=sign*.13;arm.add(upper);
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),skin);elbow.position.set(sign*.035,-.49,0);arm.add(elbow);
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.35,4,8),skin);fore.position.set(sign*.05,-.7,.02);fore.rotation.z=-sign*.16;arm.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.105,8,7),skinDark);hand.position.set(sign*.08,-.91,.04);arm.add(hand);
    for(let f=0;f<3;f++){const claw=addBox(arm,.027,.1,.035,bone,sign*(.04+f*.04),-1.005,.07);}
  }
  const legL=new THREE.Group();legL.position.set(-.17,.78,0);root.add(legL);const legR=new THREE.Group();legR.position.set(.17,.78,0);root.add(legR);
  for(const [leg,sign] of [[legL,-1],[legR,1]]){
    const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.43,4,8),pants);thigh.position.y=-.22;leg.add(thigh);
    const shin=new THREE.Mesh(new THREE.CapsuleGeometry(.09,.39,4,8),skinDark);shin.position.set(0,-.58,.015);leg.add(shin);
    const boot=addBox(leg,.19,.12,.31,rubberMat(),0,-.82,-.07);boot.rotation.x=-.05;
  }
  function rubberMat(){return makeMat(0x1c2420,.95);}
  // Torn fabric strips, shoulder straps and weathered armor give silhouette variation.
  for(let i=0;i<(isBoss?5:3);i++){const strip=addBox(root,.07+Math.random()*.06,.21+Math.random()*.13,.025,skinDark,(Math.random()-.5)*.42,.92+Math.random()*.15,.19);strip.rotation.z=(Math.random()-.5)*.7;}
  if(isBoss){
    const plate=addBox(root,.94,.24,.46,makeMat(0x353b31,.65,.35),0,1.45,-.02);plate.rotation.z=-.12;
    for(let i=0;i<3;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.09,.32,6),bone);spike.position.set(-.3+i*.3,1.72,.08);spike.rotation.z=(i-1)*.25;root.add(spike);}
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.25,10,8),skinDark);shoulder.position.set(-.48,1.49,0);root.add(shoulder);
  }
  root.userData={armL,armR,legL,legR,isBoss,phase:Math.random()*6,parts:[torso,head]};
  return root;
}
function makeRemoteOperator(){
  const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.25,.7,4,8),makeMat(0x53665b,.86));body.position.y=1.05;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),makeMat(0xb7b9a1,.85));head.position.y=1.62;g.add(head);const tag=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),new THREE.MeshBasicMaterial({color:0xbde68a}));tag.position.y=2.05;g.add(tag);return g;
}
function clearScene(){
  if(!state.scene)return;
  while(state.scene.children.length){const c=state.scene.children[0];state.scene.remove(c);disposeObject(c);}
  state.enemies.clear();state.remoteMeshes.clear();state.weaponModels.clear();state.bossId=null;
}
function disposeObject(obj){
  obj.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});
}
function addArena(){
  const scene=state.scene;
  scene.background=new THREE.Color(0x101815);scene.fog=new THREE.FogExp2(0x101815,.012);
  scene.add(new THREE.HemisphereLight(0x9eae9d,0x242d27,1.2));
  const moon=new THREE.DirectionalLight(0xc3d4bd,2.2);moon.position.set(-8,16,7);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.camera.left=-35;moon.shadow.camera.right=35;moon.shadow.camera.top=35;moon.shadow.camera.bottom=-35;scene.add(moon);
  const greenLight=new THREE.PointLight(0x8eae75,30,25,2);greenLight.position.set(0,5,-12);scene.add(greenLight);
  const redLight=new THREE.PointLight(0x9c3e35,24,19,2);redLight.position.set(13,4,9);scene.add(redLight);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),makeConcrete());ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(100,50,0x354238,0x29332e);grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.12;scene.add(grid);
  const wallMat=makeMat(0x26302c,.92),stripe=makeMat(0x8d9a6b,.82),metal=makeMat(0x3b4741,.46,.68),dark=makeMat(0x161d1a,.9);
  function wall(x,y,z,w,h,d){const m=addBox(scene,w,h,d,wallMat,x,y,z);m.receiveShadow=true;addBox(scene,w,.08,d+.025,stripe,x,y-h/2+.04,z,false,false);return m;}
  wall(0,3,-31,62,6,1);wall(0,3,31,62,6,1);wall(-31,3,0,1,6,62);wall(31,3,0,1,6,62);
  // Industrial bulkheads and containers create lanes and sight lines.
  for(let i=0;i<5;i++){
    const x=-21+i*10.5;const box=addBox(scene,5,3.2,2.1,metal,x,1.6,-17);box.castShadow=true;
    for(let s=-1;s<=1;s++)addBox(scene,.05,2.8,.035,dark,x+s*1.45,1.6,-15.91);
    addBox(scene,5.2,.12,2.3,stripe,x,3.2,-17);
  }
  for(let i=0;i<4;i++){const x=-19+i*12.5;addBox(scene,3.8,2.7,3.7,wallMat,x,1.35,15);addBox(scene,3.9,.09,3.8,stripe,x,2.72,15);for(let j=0;j<4;j++)addBox(scene,.05,2.45,.04,dark,x-1.5+j,1.35,16.88);}
  // Crates, drums, rubble and overhead lights.
  for(let i=0;i<16;i++){
    const x=(Math.random()-.5)*46,z=(Math.random()-.5)*46;
    if(Math.abs(x)<5&&Math.abs(z)<7)continue;
    if(i%3===0){const drum=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1.1,12),makeMat(0x4a574d,.8,.2));drum.position.set(x,.55,z);drum.castShadow=true;scene.add(drum);const rim=new THREE.Mesh(new THREE.TorusGeometry(.41,.035,6,16),metal);rim.rotation.x=Math.PI/2;rim.position.set(x,1.02,z);scene.add(rim);}
    else{const size=.8+Math.random()*.6;const crate=addBox(scene,size,size,size,dark,x,size/2,z);crate.castShadow=true;addBox(scene,size+.015,.05,size+.015,metal,x,size*.72,z);}
  }
  // Suspended pipes and lamps.
  for(let z=-20;z<=20;z+=20){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,54,10),metal);pipe.rotation.z=Math.PI/2;pipe.position.set(0,5.7,z);scene.add(pipe);
    for(let x=-20;x<=20;x+=20){const lamp=new THREE.PointLight(0xc7d3ab,13,12,2);lamp.position.set(x,5.25,z);scene.add(lamp);const shade=new THREE.Mesh(new THREE.BoxGeometry(.65,.12,.38),dark);shade.position.set(x,5.8,z);scene.add(shade);}
  }
  // Hazard markings around objective lane.
  for(let i=0;i<12;i++){const line=addBox(scene,.12,.02,1.4,stripe,-5+i*.9,.025,0);line.rotation.y=.2;}
}
function initRenderer(){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  WORLD.appendChild(renderer.domElement);
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(76,window.innerWidth/window.innerHeight,.08,160);camera.rotation.order="YXZ";camera.position.set(0,1.65,7);
  state.renderer=renderer;state.scene=scene;state.camera=camera;
  renderer.domElement.addEventListener("click",()=>{if(state.running&&!state.paused&&!state.pointerLocked&&!isTouch())renderer.domElement.requestPointerLock?.();});
  document.addEventListener("pointerlockchange",()=>{state.pointerLocked=document.pointerLockElement===renderer.domElement;if(state.pointerLocked&&state.paused)resumeGame();});
  document.addEventListener("mousemove",e=>{if(!state.pointerLocked||!state.running||state.paused)return;state.yaw-=e.movementX*.0022;state.pitch-=e.movementY*.0022;state.pitch=THREE.MathUtils.clamp(state.pitch,-1.42,1.42);});
  window.addEventListener("resize",onResize);
  addArena();state.player.x=0;state.player.z=7;state.camera.position.set(0,1.65,7);
}
function onResize(){if(!state.renderer)return;state.camera.aspect=window.innerWidth/window.innerHeight;state.camera.updateProjectionMatrix();state.renderer.setSize(window.innerWidth,window.innerHeight);if(state.preview)resizePreview();}
function isTouch(){return window.matchMedia("(pointer:coarse)").matches||"ontouchstart"in window;}
function setView(screen){
  $("main-menu").classList.toggle("hidden",screen!=="menu");
  $("armory-screen").classList.toggle("hidden",screen!=="armory");
  $("intel-screen").classList.toggle("hidden",screen!=="intel");
}
function showToast(message){
  const t=$("toast");t.textContent=message;t.classList.remove("hidden");state.toastUntil=performance.now()+2300;
}
function setNetworkStatus(message){$("network-status").textContent=message;}
function updateWeaponInfo(){
  const w=WEAPONS[state.selectedWeapon];$("weapon-class").textContent=w.role;$("weapon-name").textContent=w.name;$("weapon-description").textContent=w.desc;
  $("stat-damage").textContent=String(w.damage);$("stat-rate").textContent=String(w.rpm);$("stat-mag").textContent=String(w.mag);
  $("optic-name").textContent=w.optic;$("optic-desc").textContent=w.opticDesc;$("preview-optic").textContent=w.optic;$("equip-status").textContent="SELECTED LOADOUT";
  document.querySelectorAll(".weapon-option").forEach((el,i)=>el.classList.toggle("active",i===state.selectedWeapon));
}
function setupWeaponList(){
  const list=$("weapon-list");list.innerHTML="";
  WEAPONS.forEach((w,i)=>{const b=document.createElement("button");b.className="weapon-option";b.innerHTML="<b>"+w.name+"</b><span>"+w.optic+"</span>";b.addEventListener("click",()=>{state.selectedWeapon=i;updateWeaponInfo();buildPreviewWeapon();});list.appendChild(b);});
}
function buildPreviewWeapon(){
  const p=state.preview;if(!p)return;
  while(p.scene.children.length){const child=p.scene.children[0];p.scene.remove(child);disposeObject(child);}
  p.scene.add(new THREE.HemisphereLight(0xb8cbbb,0x19221d,2));
  const light=new THREE.DirectionalLight(0xe1e9da,2.5);light.position.set(3,5,4);p.scene.add(light);
  const rim=new THREE.PointLight(0x9cb977,17,8);rim.position.set(-3,1,1);p.scene.add(rim);
  const grid=new THREE.GridHelper(8,20,0x647763,0x293b31);grid.position.y=-.75;grid.material.transparent=true;grid.material.opacity=.2;p.scene.add(grid);
  const model=createWeaponModel(WEAPONS[state.selectedWeapon]);model.rotation.set(.17,-.18,-.08);model.position.set(0,-.05,0);model.scale.setScalar(1.45);p.scene.add(model);p.model=model;
}
function initPreview(){
  const canvas=$("preview-canvas");const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(38,1,.1,30);camera.position.set(0,.35,4.2);camera.lookAt(0,0,0);
  state.preview={renderer,scene,camera,model:null,drag:false,lastX:0,lastY:0};
  canvas.addEventListener("pointerdown",e=>{state.preview.drag=true;state.preview.lastX=e.clientX;state.preview.lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{const p=state.preview;if(!p.drag||!p.model)return;p.model.rotation.y+=(e.clientX-p.lastX)*.009;p.model.rotation.x+=(e.clientY-p.lastY)*.006;p.lastX=e.clientX;p.lastY=e.clientY;});
  canvas.addEventListener("pointerup",()=>state.preview.drag=false);canvas.addEventListener("pointercancel",()=>state.preview.drag=false);
  canvas.addEventListener("wheel",e=>{e.preventDefault();camera.position.z=THREE.MathUtils.clamp(camera.position.z+e.deltaY*.004,2.4,6);},{passive:false});
  buildPreviewWeapon();resizePreview();
}
function resizePreview(){const p=state.preview;if(!p)return;const rect=$("preview-canvas").getBoundingClientRect();const w=Math.max(1,rect.width),h=Math.max(1,rect.height);p.renderer.setSize(w,h,false);p.camera.aspect=w/h;p.camera.updateProjectionMatrix();}
function equipWeaponInHands(){
  const camera=state.camera;if(state.weaponModels.get("hands")){const old=state.weaponModels.get("hands");camera.remove(old);disposeObject(old);}
  const w=WEAPONS[state.selectedWeapon],model=createWeaponModel(w);model.scale.setScalar(.56);model.position.set(.3,-.27,-.52);model.rotation.set(0,Math.PI,0);camera.add(model);state.weaponModels.set("hands",model);
  state.ammo[w.id]??={mag:w.mag,reserve:w.reserve};updateAmmoHud();
}
function updateAmmoHud(){
  const w=WEAPONS[state.selectedWeapon],a=state.ammo[w.id]||{mag:w.mag,reserve:w.reserve};
  $("ammo-current").textContent=String(a.mag);$("ammo-reserve").textContent=String(a.reserve);$("weapon-hud-name").textContent=w.name;$("weapon-hud-optic").textContent=w.optic;
}
function switchWeapon(index){
  if(!state.running||state.paused||index<0||index>=WEAPONS.length||index===state.selectedWeapon)return;
  state.selectedWeapon=index;state.aiming=false;$("aim-overlay").classList.add("hidden");state.camera.fov=76;state.camera.updateProjectionMatrix();
  equipWeaponInHands();showToast("LOADOUT: "+WEAPONS[index].name);
}
function setAim(value){
  if(!state.running||state.paused)return;state.aiming=value;
  const w=WEAPONS[state.selectedWeapon];$("aim-overlay").classList.toggle("hidden",!value);
  $("scope-label").textContent=w.optic;$("crosshair").classList.toggle("hidden",value);
  state.camera.fov=value?(w.opticStyle==="scope"?29:w.opticStyle==="holo"?43:49):76;state.camera.updateProjectionMatrix();
  const model=state.weaponModels.get("hands");if(model){model.position.x=value?.04:.3;model.position.y=value?-.22:-.27;}
}
function resetPlayer(startX=0,startZ=7){
  state.player={x:startX,y:0,z:startZ,hp:100,maxHp:100,credits:500,speed:5.2,vy:0,onGround:true};
  state.yaw=0;state.pitch=0;state.camera.position.set(startX,1.65,startZ);state.camera.rotation.set(0,0,0);
  state.ammo={};WEAPONS.forEach(w=>state.ammo[w.id]={mag:w.mag,reserve:w.reserve});
  state.selectedWeapon=0;state.aiming=false;state.reloadUntil=0;state.wave=0;state.wavePhase="IDLE";state.spawnLeft=0;state.bossId=null;
  $("boss-bar").classList.add("hidden");$("game-over").classList.add("hidden");$("pause-menu").classList.add("hidden");
  updateWeaponInfo();equipWeaponInHands();updatePlayerHud();
}
function startGame(mode="solo"){
  cleanupNetwork();state.mode=mode;state.running=true;state.paused=false;state.gameOver=false;
  clearScene();addArena();resetPlayer(mode==="guest"?2.5:0,mode==="guest"?7:7);
  $("main-menu").classList.add("hidden");$("armory-screen").classList.add("hidden");$("intel-screen").classList.add("hidden");$("hud").classList.remove("hidden");
  $("network-mode").textContent=mode==="solo"?"SOLO SESSION":mode==="host"?"HOST / SQUAD LINK":"CONNECTED GUEST";
  $("connection-label").textContent=mode==="solo"?"LOCAL SESSION":mode==="host"?"HOST SIGNAL ONLINE":"SQUAD LINK ONLINE";
  updateSquadHud();beginNextWave();
  if(!isTouch())state.renderer.domElement.requestPointerLock?.();
}
function beginNextWave(){
  if(state.mode==="guest")return;
  state.wave++;state.wavePhase="INCOMING";state.intermission=3;state.waveElapsed=0;
  state.spawnLeft=state.wave%5===0?1:Math.min(4+state.wave*2,28);
  if(state.wave%5===0)state.spawnLeft+=Math.min(3+Math.floor(state.wave/5),8);
  $("wave-number").textContent=String(state.wave).padStart(2,"0");$("wave-phase").textContent="INCOMING";$("objective-text").textContent=state.wave%5===0?"BOSS SIGNATURE DETECTED":"PREPARE FOR CONTACT";
  if(state.wave%5===0){$("boss-bar").classList.remove("hidden");$("boss-name").textContent=state.wave===5?"THE WARDEN":"THE ABOMINATION";$("boss-fill").style.width="100%";showToast("WARNING: BOSS CONTACT — WAVE "+state.wave);}
  else{$("boss-bar").classList.add("hidden");showToast("WAVE "+state.wave+" INCOMING");}
  updateWaveHud();
}
function spawnEnemy(boss=false){
  const angle=Math.random()*Math.PI*2,dist=17+Math.random()*10;
  let x=Math.cos(angle)*dist,z=Math.sin(angle)*dist;
  x=THREE.MathUtils.clamp(x,-27,27);z=THREE.MathUtils.clamp(z,-27,27);
  const mesh=createInfected(boss);mesh.position.set(x,0,z);mesh.scale.setScalar(boss?1.48:1);state.scene.add(mesh);
  const id="infected-"+(state.nextId++);
  const maxHp=boss?1250+state.wave*130:70+state.wave*13;
  const enemy={id,mesh,x,z,hp:maxHp,maxHp,speed:(boss?1.25:1.55)+Math.min(state.wave*.045,.8),damage:boss?22:9+Math.floor(state.wave*.8),boss,attackAt:0,phase:Math.random()*6};
  state.enemies.set(id,enemy);if(boss)state.bossId=id;
}
function updateWaves(dt){
  if(state.mode==="guest")return;
  if(state.wavePhase==="INCOMING"){
    state.intermission-=dt;if(state.intermission<=0){state.wavePhase="ACTIVE";state.nextEnemyAt=0;$("wave-phase").textContent="ACTIVE";$("objective-text").textContent="ELIMINATE ALL HOSTILES";}
    return;
  }
  if(state.wavePhase==="ACTIVE"){
    state.spawnTimer-=dt;
    if(state.spawnLeft>0&&state.spawnTimer<=0){
      const isBoss=state.wave%5===0&&state.spawnLeft===Math.min(4+state.wave*2,28)+1;
      // The first spawn in a boss wave is always the boss. Remaining enemies follow.
      const bossSpawn=state.wave%5===0&&state.spawnLeft>0&&(state.spawnLeft===Math.min(4+state.wave*2,28)+1);
      spawnEnemy(bossSpawn);state.spawnLeft--;state.spawnTimer=bossSpawn?3.8:Math.max(.65,1.55-state.wave*.035);
    }
    if(state.spawnLeft<=0&&state.enemies.size===0){
      state.wavePhase="CLEAR";$("wave-phase").textContent="SECTOR CLEAR";$("objective-text").textContent="SECTOR SECURED — REARM";
      state.player.credits+=120+state.wave*15;showToast("SECTOR SECURED // +"+(120+state.wave*15)+" CREDITS");
      state.intermission=4;
    }
    return;
  }
  if(state.wavePhase==="CLEAR"){state.intermission-=dt;if(state.intermission<=0)beginNextWave();}
}
function getTargetPlayers(){
  const all=[{id:"HOST",x:state.player.x,z:state.player.z,hp:state.player.hp}];
  for(const [id,p] of state.networkPlayers)all.push({id,x:p.x,z:p.z,hp:p.hp});
  return all.filter(p=>p.hp>0);
}
function updateEnemies(dt,time){
  const targets=getTargetPlayers();
  for(const [id,e] of [...state.enemies]){
    const target=targets.reduce((best,p)=>{const d=Math.hypot(p.x-e.x,p.z-e.z);return !best||d<best.d?{...p,d}:best;},null);
    if(!target)continue;
    const dx=target.x-e.x,dz=target.z-e.z,d=Math.hypot(dx,dz);
    if(d>1.35){e.x+=(dx/d)*e.speed*dt;e.z+=(dz/d)*e.speed*dt;e.mesh.position.set(e.x,0,e.z);e.mesh.rotation.y=Math.atan2(dx,dz);}
    const parts=e.mesh.userData;
    if(parts){const swing=Math.sin(time*7+e.phase)*.48;parts.armL.rotation.x=swing-.25;parts.armR.rotation.x=-swing-.25;parts.legL.rotation.x=-swing*.62;parts.legR.rotation.x=swing*.62;}
    if(d<1.65&&time>e.attackAt){
      e.attackAt=time+(e.boss?1.2:1.45);
      if(target.id==="HOST")damageLocalPlayer(e.damage);
      else{
        const p=state.networkPlayers.get(target.id);if(p){p.hp=Math.max(0,p.hp-e.damage);const c=state.connections.get(target.id);if(c?.open)c.send({type:"damage",hp:p.hp,amount:e.damage});}
      }
    }
  }
  updateBossHud();
}
function damageLocalPlayer(amount){
  if(state.player.hp<=0)return;state.player.hp=Math.max(0,state.player.hp-amount);updatePlayerHud();
  $("damage-vignette").classList.add("active");setTimeout(()=>$("damage-vignette").classList.remove("active"),170);
  if(state.player.hp<=0)checkSquadEliminated();
}
function checkSquadEliminated(){
  if(state.mode==="guest")return;
  const liveGuests=[...state.networkPlayers.values()].some(p=>p.hp>0);
  if(state.player.hp<=0&&!liveGuests){endGame();}
}
function updateBossHud(){
  if(!state.bossId)return;const e=state.enemies.get(state.bossId);if(!e){$("boss-bar").classList.add("hidden");state.bossId=null;return;}
  $("boss-fill").style.width=(Math.max(0,e.hp/e.maxHp)*100)+"%";
}
function updateWaveHud(){$("enemy-count").textContent="HOSTILES: "+state.enemies.size;}
function updatePlayerHud(){
  $("player-health").textContent=String(Math.ceil(state.player.hp));$("health-fill").style.width=(state.player.hp/state.player.maxHp*100)+"%";
  $("squad-count").textContent=String(1+state.networkPlayers.size).padStart(2,"0")+" / 04";updateAmmoHud();
}
function updateSquadHud(){$("squad-count").textContent=String(1+state.networkPlayers.size).padStart(2,"0")+" / 04";}
function getDirection(){
  const d=new THREE.Vector3();state.camera.getWorldDirection(d);return d.normalize();
}
function raycastEnemy(origin,direction){
  const ray=new THREE.Raycaster(origin,direction,0,WEAPONS[state.selectedWeapon].range);
  const objects=[];for(const e of state.enemies.values())objects.push(e.mesh);
  const hits=ray.intersectObjects(objects,true);if(!hits.length)return null;
  let obj=hits[0].object;while(obj&& !obj.userData?.isEnemy)obj=obj.parent;
  // Resolve by walking up to the enemy root, which has an ID in the lookup map.
  let root=hits[0].object;while(root&&![...state.enemies.values()].some(e=>e.mesh===root))root=root.parent;
  return root?[...state.enemies.values()].find(e=>e.mesh===root):null;
}
function fireShot(origin=null,direction=null,fromNetwork=false){
  if(!state.running||state.paused||state.gameOver)return;
  const w=WEAPONS[state.selectedWeapon],ammo=state.ammo[w.id];if(!ammo)return;
  const now=performance.now();if(now-state.lastShot<60000/w.rpm)return;state.lastShot=now;
  if(state.reloadUntil>now)return;
  if(ammo.mag<=0){reloadWeapon();return;}
  ammo.mag--;updateAmmoHud();
  const o=origin?new THREE.Vector3(origin.x,origin.y,origin.z):state.camera.position.clone();
  const d=direction?new THREE.Vector3(direction.x,direction.y,direction.z).normalize():getDirection();
  const model=state.weaponModels.get("hands");if(model){model.position.z=-.46;model.rotation.x=.035;setTimeout(()=>{if(model){model.position.z=-.52;model.rotation.x=0;}},65);}
  if(state.mode==="guest"&&!fromNetwork){state.conn?.send({type:"shot",origin:{x:o.x,y:o.y,z:o.z},direction:{x:d.x,y:d.y,z:d.z},weapon:state.selectedWeapon});}
  else{
    const enemy=raycastEnemy(o,d);
    if(enemy){applyDamageToEnemy(enemy,w.damage);$("hit-marker").classList.remove("hidden");setTimeout(()=>$("hit-marker").classList.add("hidden"),100);}
  }
  if(state.mode==="host"&&!fromNetwork)broadcastSnapshot();
}
function remoteShot(packet,peerId){
  const w=WEAPONS[Math.max(0,Math.min(WEAPONS.length-1,packet.weapon||0))];
  const origin=new THREE.Vector3(packet.origin.x,packet.origin.y,packet.origin.z),dir=new THREE.Vector3(packet.direction.x,packet.direction.y,packet.direction.z).normalize();
  let best=null,bestDist=Infinity;
  for(const e of state.enemies.values()){
    const target=new THREE.Vector3(e.x,1.1,e.z),to=target.clone().sub(origin),along=to.dot(dir);if(along<0||along>w.range)continue;
    const closest=origin.clone().addScaledVector(dir,along),perp=closest.distanceTo(target);
    if(perp<(e.boss?1.5:.9)&&along<bestDist){best=e;bestDist=along;}
  }
  if(best)applyDamageToEnemy(best,w.damage);
}
function applyDamageToEnemy(e,damage){
  e.hp-=damage;
  if(e.hp<=0){
    state.scene.remove(e.mesh);disposeObject(e.mesh);state.enemies.delete(e.id);
    if(e.boss)state.bossId=null;
    if(state.mode!=="guest")state.player.credits+=e.boss?600:25;
  }
  updateWaveHud();updateBossHud();
}
function reloadWeapon(){
  if(!state.running||state.paused)return;const w=WEAPONS[state.selectedWeapon],a=state.ammo[w.id];
  if(!a||a.mag>=w.mag||a.reserve<=0||state.reloadUntil>performance.now())return;
  state.reloadUntil=performance.now()+(w.id==="vulture"?1900:1450);showToast("RELOADING "+w.name);
  setTimeout(()=>{if(!state.running)return;const amount=Math.min(w.mag-a.mag,a.reserve);a.mag+=amount;a.reserve-=amount;state.reloadUntil=0;updateAmmoHud();},w.id==="vulture"?1900:1450);
}
function movePlayer(dt){
  const p=state.player;let mx=0,mz=0;
  if(state.keys.KeyW||state.keys.ArrowUp)mz-=1;if(state.keys.KeyS||state.keys.ArrowDown)mz+=1;
  if(state.keys.KeyA||state.keys.ArrowLeft)mx-=1;if(state.keys.KeyD||state.keys.ArrowRight)mx+=1;
  mx+=state.mobile.x;mz+=state.mobile.z;
  const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
  const forward=new THREE.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
  const right=new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw));
  const wish=forward.multiplyScalar(-mz).add(right.multiplyScalar(mx));
  const sprint=!!(state.keys.ShiftLeft||state.keys.ShiftRight);const speed=p.speed*(sprint?1.42:1);
  p.x+=wish.x*speed*dt;p.z+=wish.z*speed*dt;p.x=THREE.MathUtils.clamp(p.x,-29,29);p.z=THREE.MathUtils.clamp(p.z,-29,29);
  if((state.keys.Space||state.mobile.jump)&&p.onGround){p.vy=5.3;p.onGround=false;state.mobile.jump=false;}
  p.y+=p.vy*dt;if(!p.onGround){p.vy-=14*dt;if(p.y<=0){p.y=0;p.vy=0;p.onGround=true;}}
  state.camera.position.set(p.x,1.65+p.y,p.z);state.camera.rotation.set(state.pitch,state.yaw,0,"YXZ");
}
function updateRemoteMeshes(players){
  const keep=new Set();
  for(const p of players){
    if(p.id===state.playerId)continue;keep.add(p.id);
    let mesh=state.remoteMeshes.get(p.id);if(!mesh){mesh=makeRemoteOperator();state.scene.add(mesh);state.remoteMeshes.set(p.id,mesh);}
    mesh.position.set(p.x,0,p.z);mesh.rotation.y=p.yaw||0;
  }
  for(const [id,mesh] of state.remoteMeshes){if(!keep.has(id)){state.scene.remove(mesh);disposeObject(mesh);state.remoteMeshes.delete(id);}}
}
function syncGuestEnemies(list){
  const keep=new Set();
  for(const data of list){
    keep.add(data.id);let e=state.enemies.get(data.id);
    if(!e){const mesh=createInfected(data.boss);mesh.scale.setScalar(data.boss?1.48:1);state.scene.add(mesh);e={...data,mesh};state.enemies.set(data.id,e);}
    Object.assign(e,{x:data.x,z:data.z,hp:data.hp,maxHp:data.maxHp,boss:data.boss});e.mesh.position.set(data.x,0,data.z);e.mesh.rotation.y=data.rotation||0;
  }
  for(const [id,e] of state.enemies){if(!keep.has(id)){state.scene.remove(e.mesh);disposeObject(e.mesh);state.enemies.delete(id);}}
}
function sendGuestPose(){
  if(state.mode!=="guest"||!state.conn?.open)return;
  state.conn.send({type:"pose",x:state.player.x,z:state.player.z,yaw:state.yaw});
}
function broadcastSnapshot(){
  if(state.mode!=="host")return;
  const enemies=[...state.enemies.values()].map(e=>({id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,boss:e.boss,rotation:e.mesh.rotation.y}));
  const players=[{id:"HOST",x:state.player.x,z:state.player.z,yaw:state.yaw,hp:state.player.hp}];
  for(const [id,p] of state.networkPlayers)players.push({id,x:p.x,z:p.z,yaw:p.yaw,hp:p.hp});
  const packet={type:"snapshot",wave:state.wave,phase:state.wavePhase,hostiles:state.enemies.size, enemies,players,hostHp:state.player.hp,bossId:state.bossId};
  for(const c of state.connections.values())if(c.open)c.send(packet);
}
function applySnapshot(packet){
  if(state.mode!=="guest")return;
  if(!state.running)startGuestWorld();
  state.wave=packet.wave;state.wavePhase=packet.phase;$("wave-number").textContent=String(packet.wave).padStart(2,"0");$("wave-phase").textContent=packet.phase;$("enemy-count").textContent="HOSTILES: "+packet.hostiles;
  $("objective-text").textContent=packet.phase==="ACTIVE"?"ELIMINATE ALL HOSTILES":packet.phase==="INCOMING"?"PREPARE FOR CONTACT":"SECTOR SECURED — REARM";
  syncGuestEnemies(packet.enemies||[]);updateRemoteMeshes(packet.players||[]);
  const boss=(packet.enemies||[]).find(e=>e.boss);if(boss){$("boss-bar").classList.remove("hidden");$("boss-name").textContent=state.wave===5?"THE WARDEN":"THE ABOMINATION";$("boss-fill").style.width=(boss.hp/boss.maxHp*100)+"%";}else $("boss-bar").classList.add("hidden");
  const me=(packet.players||[]).find(p=>p.id===state.playerId);if(me){/* Host tracks the guest's health; guest receives exact HP through damage packets. */}
  updateSquadHud();
}
function startGuestWorld(){
  state.running=true;state.paused=false;clearScene();addArena();resetPlayer(2.5,7);
  $("main-menu").classList.add("hidden");$("hud").classList.remove("hidden");$("network-mode").textContent="CONNECTED GUEST";$("connection-label").textContent="SQUAD LINK ONLINE";
}
function setupHostPeer(){
  if(!window.Peer){setNetworkStatus("PeerJS failed to load. Try reloading the page.");return;}
  const room="dead-signal-"+Math.random().toString(36).slice(2,10);
  const peer=new window.Peer(room,{debug:0});state.peer=peer;
  setNetworkStatus("Opening secure peer room…");
  peer.on("open",id=>{
    $("host-room").classList.remove("hidden");$("host-code").textContent=id;setNetworkStatus("Room ready. Share this code with up to three squad members.");
    startGame("host");
  });
  peer.on("connection",conn=>{
    if(state.connections.size>=3){conn.on("open",()=>conn.send({type:"full"}));conn.close();return;}
    conn.on("open",()=>{state.connections.set(conn.peer,conn);state.networkPlayers.set(conn.peer,{x:2,z:7,yaw:0,hp:100});updateSquadHud();broadcastSnapshot();showToast("SQUAD MEMBER CONNECTED");});
    conn.on("data",data=>handleHostData(conn.peer,data));
    conn.on("close",()=>{state.connections.delete(conn.peer);state.networkPlayers.delete(conn.peer);updateSquadHud();broadcastSnapshot();});
    conn.on("error",()=>{state.connections.delete(conn.peer);state.networkPlayers.delete(conn.peer);});
  });
  peer.on("error",err=>{setNetworkStatus("Network issue: "+err.type+". Solo play remains available.");if(!state.running)showToast("ROOM ERROR // "+err.type);});
}
function handleHostData(peerId,data){
  if(!data||typeof data!=="object")return;
  if(data.type==="pose"){
    const p=state.networkPlayers.get(peerId);if(p){p.x=THREE.MathUtils.clamp(Number(data.x)||0,-29,29);p.z=THREE.MathUtils.clamp(Number(data.z)||0,-29,29);p.yaw=Number(data.yaw)||0;}
  }else if(data.type==="shot"){
    if(state.mode==="host")remoteShot(data,peerId);
  }
}
function joinPeerRoom(code){
  if(!window.Peer){setNetworkStatus("PeerJS failed to load. Try reloading the page.");return;}
  const peer=new window.Peer(undefined,{debug:0});state.peer=peer;setNetworkStatus("Connecting to squad host…");
  peer.on("open",()=>{const conn=peer.connect(code.trim(),{reliable:true});state.conn=conn;
    conn.on("open",()=>{state.playerId=peer.id;setNetworkStatus("Connected. Loading shared battlefield…");$("main-menu").classList.add("hidden");});
    conn.on("data",data=>{
      if(data.type==="full"){setNetworkStatus("This squad room already has four operators.");conn.close();return;}
      if(data.type==="snapshot")applySnapshot(data);
      if(data.type==="damage"){state.player.hp=data.hp;updatePlayerHud();$("damage-vignette").classList.add("active");setTimeout(()=>$("damage-vignette").classList.remove("active"),160);if(state.player.hp<=0)showToast("OPERATOR DOWN // WAIT FOR SQUAD");}
    });
    conn.on("close",()=>{showToast("HOST CONNECTION LOST");state.running=false;$("hud").classList.add("hidden");setView("menu");});
    conn.on("error",()=>setNetworkStatus("Could not connect. Check the room code and try again."));
  });
  peer.on("error",err=>setNetworkStatus("Connection failed: "+err.type+". Verify the room code and retry."));
}
function cleanupNetwork(){
  if(state.conn){try{state.conn.close();}catch{}state.conn=null;}
  for(const c of state.connections.values())try{c.close();}catch{}
  state.connections.clear();state.networkPlayers.clear();
  if(state.peer){try{state.peer.destroy();}catch{}state.peer=null;}
  $("host-room").classList.add("hidden");
}
function endGame(){
  if(state.gameOver)return;state.gameOver=true;state.running=false;document.exitPointerLock?.();
  $("final-stats").textContent="You reached wave "+state.wave+" and secured "+state.player.credits+" field credits.";
  $("game-over").classList.remove("hidden");
  if(state.mode==="host"){for(const c of state.connections.values())if(c.open)c.send({type:"gameover",wave:state.wave});}
}
function pauseGame(){
  if(!state.running||state.gameOver||state.paused)return;state.paused=true;document.exitPointerLock?.();$("pause-menu").classList.remove("hidden");
}
function resumeGame(){
  if(!state.running||!state.paused)return;state.paused=false;$("pause-menu").classList.add("hidden");if(!isTouch())state.renderer.domElement.requestPointerLock?.();
}
function returnToMenu(){
  state.running=false;state.paused=false;state.gameOver=false;document.exitPointerLock?.();cleanupNetwork();clearScene();addArena();
  $("hud").classList.add("hidden");$("main-menu").classList.remove("hidden");$("pause-menu").classList.add("hidden");$("game-over").classList.add("hidden");$("connection-label").textContent="SYSTEM STANDBY";setView("menu");
}
function bindControls(){
  document.addEventListener("keydown",e=>{
    state.keys[e.code]=true;
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    if(e.code==="Escape"&&state.running&&!state.paused)pauseGame();
    if(e.code==="KeyR")reloadWeapon();
    if(e.code==="Digit1")switchWeapon(0);if(e.code==="Digit2")switchWeapon(1);if(e.code==="Digit3")switchWeapon(2);
  });
  document.addEventListener("keyup",e=>state.keys[e.code]=false);
  document.addEventListener("mousedown",e=>{
    if(e.button===0){if(state.running&&!state.paused){if(!state.pointerLocked&&!isTouch())state.renderer.domElement.requestPointerLock?.();state.firing=true;fireShot();}}
    if(e.button===2)setAim(true);
  });
  document.addEventListener("mouseup",e=>{if(e.button===0)state.firing=false;if(e.button===2)setAim(false);});
  document.addEventListener("contextmenu",e=>e.preventDefault());
  $("reload-button").addEventListener("click",reloadWeapon);$("mobile-reload").addEventListener("click",reloadWeapon);
  $("mobile-fire").addEventListener("pointerdown",e=>{e.preventDefault();state.firing=true;fireShot();});
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>$("mobile-fire").addEventListener(ev,()=>state.firing=false));
  $("mobile-aim").addEventListener("pointerdown",e=>{e.preventDefault();setAim(true);});
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>$("mobile-aim").addEventListener(ev,()=>setAim(false)));
  const stick=$("move-stick"),knob=$("stick-knob");
  stick.addEventListener("pointerdown",e=>{stick.setPointerCapture(e.pointerId);updateStick(e);});
  stick.addEventListener("pointermove",e=>{if(e.buttons)updateStick(e);});
  ["pointerup","pointercancel"].forEach(ev=>stick.addEventListener(ev,()=>{state.mobile.x=0;state.mobile.z=0;knob.style.transform="translate(0,0)";}));
  function updateStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),scale=Math.min(1,42/(len||1));state.mobile.x=dx/42*scale;state.mobile.z=dy/42*scale;knob.style.transform="translate("+(dx*scale)+"px,"+(dy*scale)+"px)";}
  const look=$("look-zone");look.addEventListener("pointerdown",e=>{look.setPointerCapture(e.pointerId);state.mobile.lookId=e.pointerId;state.mobile.lastX=e.clientX;state.mobile.lastY=e.clientY;});
  look.addEventListener("pointermove",e=>{if(state.mobile.lookId!==e.pointerId)return;state.yaw-=(e.clientX-state.mobile.lastX)*.006;state.pitch-=(e.clientY-state.mobile.lastY)*.006;state.pitch=THREE.MathUtils.clamp(state.pitch,-1.35,1.35);state.mobile.lastX=e.clientX;state.mobile.lastY=e.clientY;});
  ["pointerup","pointercancel"].forEach(ev=>look.addEventListener(ev,e=>{if(state.mobile.lookId===e.pointerId)state.mobile.lookId=null;}));
}
function bindMenu(){
  $("play-solo").addEventListener("click",()=>{startGame("solo");});
  $("nav-deploy").addEventListener("click",()=>$("play-solo").click());
  $("host-game").addEventListener("click",setupHostPeer);
  $("join-game").addEventListener("click",()=>{const code=$("room-code").value.trim();if(!code){setNetworkStatus("Enter the host room code first.");return;}joinPeerRoom(code);});
  $("copy-code").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("host-code").textContent);setNetworkStatus("Room code copied. Send it to your squad.");}catch{setNetworkStatus("Select and copy the room code manually.");}});
  $("nav-arsenal").addEventListener("click",()=>{setView("armory");updateWeaponInfo();resizePreview();});
  $("nav-intel").addEventListener("click",()=>setView("intel"));
  document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",()=>setView("menu")));
  $("equip-weapon").addEventListener("click",()=>{setView("menu");showToast(WEAPONS[state.selectedWeapon].name+" READY FOR DEPLOYMENT");});
  $("resume-button").addEventListener("click",resumeGame);$("leave-button").addEventListener("click",returnToMenu);
  $("retry-button").addEventListener("click",()=>{const mode=state.mode;cleanupNetwork();startGame(mode==="guest"?"solo":mode);});
  $("menu-button").addEventListener("click",returnToMenu);
}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(state.clock.getDelta(),.05),now=performance.now()/1000;
  if(state.running&&!state.paused&&!state.gameOver){
    movePlayer(dt);
    if(state.firing&&now*1000-state.lastShot>=60000/WEAPONS[state.selectedWeapon].rpm)fireShot();
    if(state.mode!=="guest"){
      updateWaves(dt);updateEnemies(dt,now);
      if(state.mode==="host"&&performance.now()-state.lastSync>120){state.lastSync=performance.now();broadcastSnapshot();}
    }else if(performance.now()-state.lastNetworkSend>80){state.lastNetworkSend=performance.now();sendGuestPose();}
    updatePlayerHud();
  }
  if(state.preview&&state.preview.model&&!state.preview.drag)state.preview.model.rotation.y+=dt*.32;
  if(state.preview)state.preview.renderer.render(state.preview.scene,state.preview.camera);
  if(state.renderer)state.renderer.render(state.scene,state.camera);
  if(state.toastUntil&&performance.now()>state.toastUntil){$("toast").classList.add("hidden");state.toastUntil=0;}
}
function boot(){
  initRenderer();initPreview();setupWeaponList();updateWeaponInfo();bindControls();bindMenu();
  setTimeout(()=>{$("loading-screen").style.opacity="0";setTimeout(()=>$("loading-screen").remove(),420);},850);
  animate();
}
boot();
