/* ============================================================
   TALON Rescue Simulator
   A maritime-search optimization game.
   Model: Koopman random-search theory  ·  POD = 1 - e^(-C)
   ============================================================ */
(function () {
"use strict";

/* ---------------------------------------------------------- *
 *  1. CATALOG — tuned so each scenario has a real best buy
 * ---------------------------------------------------------- */
const DRONES = {
  scout: {
    key:"scout", name:"SCOUT-S", cls:"Micro tube drone", cost:9,
    speed:60, endur:65, color:"#8fc7ff",
    sar:{ thermal:0.55, eo:0.80 },
    asw:{ sono:0, mad:0, radar:0.65 },
    sarNote:"EO + lite thermal · short legs",
    aswNote:"Periscope radar only · short legs"
  },
  ranger: {
    key:"ranger", name:"RANGER-M", cls:"Medium SAR/ISR", cost:26,
    speed:78, endur:105, color:"#ffb020",
    sar:{ thermal:1.00, eo:0.88 },
    asw:{ sono:1.7, mad:0, radar:0.75 },
    sarNote:"Gimbal thermal + EO · good legs",
    aswNote:"Sonobuoy field · good legs"
  },
  sentinel: {
    key:"sentinel", name:"SENTINEL-L", cls:"Long-range wide-area", cost:60,
    speed:100, endur:205, color:"#ff6a3d",
    sar:{ thermal:1.45, eo:0.95 },
    asw:{ sono:2.0, mad:0.34, radar:0.95 },
    sarNote:"Wide thermal + radar · reaches anything",
    aswNote:"MAD + sonobuoys · localizes quiet boats"
  }
};
const ORDER = ["scout","ranger","sentinel"];
const SHORE_CUT = 18, SHORE_COST = 22;
const EFF = 0.75;                 // search pattern efficiency
const MAXN = { scout:18, ranger:10, sentinel:5 };

/* ---------------------------------------------------------- *
 *  2. MODEL
 * ---------------------------------------------------------- */
function reachOneway(d){ return d.speed * d.endur / 60; }     // NM a drone can fly out

function sweepWidth(d, mode, c){
  if(mode === "sar"){
    const base = c.night ? d.sar.thermal : Math.max(d.sar.eo, d.sar.thermal*0.6);
    const seaPen = 1 - (c.sea - 1) * 0.12;                     // sea state 1..5
    return Math.max(0.05, base * seaPen);
  } else {
    const sonoMul = (c.posture==="quiet" ? 0.55 : 1) * (c.deepLayer ? 1.15 : 0.8);
    const radar   = c.posture==="snorkel" ? d.asw.radar : d.asw.radar*0.15;
    return Math.max(0.02, d.asw.sono*sonoMul + d.asw.mad*1.0 + radar);
  }
}

function effDist(c, shore){ return Math.max(8, c.dist - (shore ? SHORE_CUT : 0)); }

function searchRadiusAt(c, frac){ return c.r0 + c.grow * (c.window*frac/60); }

// returns full plan analytics for a loadout
function analyze(loadout, mode, c, shore){
  const D = effDist(c, shore);
  const Rmid = c.r0 + c.grow*(c.window/60)/2;
  const A = Math.PI*Rmid*Rmid;
  let swept=0, reachable=0, total=0, cost = shore ? SHORE_COST : 0;
  const perType = {};
  for(const k of ORDER){
    const n = loadout[k]||0; if(!n) continue;
    const d = DRONES[k]; total += n; cost += d.cost*n;
    perType[k] = { reach: reachOneway(d) >= D, sweep: sweepWidth(d,mode,c) };
    if(reachOneway(d) < D) continue;
    const transit = D/d.speed*60;
    const tos = Math.min(d.endur - transit, c.window);
    if(tos <= 0) continue;
    reachable += n;
    swept += n * (perType[k].sweep * d.speed * (tos/60) * EFF);
  }
  const C = swept / A;
  const POD = 1 - Math.exp(-C);
  return { D, A, Rmid, C, POD, cost, reachable, total, perType };
}

// brute-force best achievable POD within budget — used to grade the player
function bestPlan(mode, c){
  let best = { POD:0, cost:0, loadout:{scout:0,ranger:0,sentinel:0}, shore:false };
  for(let shore=0; shore<2; shore++){
    for(let s=0; s<=MAXN.scout; s++)
    for(let r=0; r<=MAXN.ranger; r++)
    for(let n=0; n<=MAXN.sentinel; n++){
      const lo = {scout:s, ranger:r, sentinel:n};
      const a = analyze(lo, mode, c, !!shore);
      if(a.cost > c.budget) continue;
      if(a.POD > best.POD + 1e-9 || (Math.abs(a.POD-best.POD)<1e-9 && a.cost<best.cost)){
        best = { POD:a.POD, cost:a.cost, loadout:lo, shore:!!shore };
      }
    }
  }
  return best;
}

/* ---------------------------------------------------------- *
 *  3. SCENARIO GENERATION
 * ---------------------------------------------------------- */
function rnd(a,b){ return a + Math.random()*(b-a); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function genScenario(mode){
  if(mode === "sar"){
    const far = Math.random() < 0.5;
    const night = Math.random() < 0.62;
    const sea = Math.round(rnd(2, far?4.4:3.4));
    const c = {
      mode, far, night, sea,
      dist: far ? rnd(58,72) : rnd(28,40),
      r0: far ? rnd(5,7) : rnd(3,5),
      grow: far ? rnd(5.5,6.8) : rnd(4,5.5),
      window: rnd(70,82),
      budget: far ? 175 : 130,
      cutterEta: 0
    };
    c.cutterEta = Math.round(c.dist/20*60);             // 20 kn cutter, minutes
    c.label = (far?"Open-ocean datum":"Near-shore datum") + (night?" · night":" · daylight");
    c.targetName = "lost sailor";
    placeTarget(c);
    return c;
  } else {
    const posture = pick(["quiet","quiet","transit","snorkel"]); // quiet most common
    const deepLayer = Math.random() < 0.5;
    const c = {
      mode, posture, deepLayer, sea: Math.round(rnd(1,3)),
      dist: rnd(38,52),
      r0: rnd(4,6),
      grow: rnd(8,11),                                   // sub runs — area grows fast
      window: rnd(82,96),
      budget: 155,
      cutterEta: 0
    };
    c.cutterEta = Math.round(rnd(140,200));              // surface escort far off
    const postureTxt = { quiet:"running silent", transit:"in transit", snorkel:"snorkeling" };
    c.label = "Datum " + Math.round(c.dist) + " NM · contact " + postureTxt[posture];
    c.targetName = "submarine";
    placeTarget(c);
    return c;
  }
}

function placeTarget(c){
  // hidden true position, within the FINAL drift circle
  const Rmax = searchRadiusAt(c, 1);
  const ang = rnd(0, Math.PI*2);
  const rad = Rmax * (0.25 + Math.random()*0.7);
  c.tgt = { ang, rad };          // polar offset from datum, in NM
}

/* ---------------------------------------------------------- *
 *  4. STATE
 * ---------------------------------------------------------- */
const state = {
  mode: "sar",
  c: null,
  loadout: { scout:0, ranger:0, sentinel:0 },
  shore: false,
  phase: "plan",        // plan | running | done
  anim: null
};

/* ---------------------------------------------------------- *
 *  5. DOM
 * ---------------------------------------------------------- */
const $ = id => document.getElementById(id);
const canvas = $("stage"), ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

/* ---------------------------------------------------------- *
 *  6. UI RENDERING
 * ---------------------------------------------------------- */
function fmtClock(min){
  const m = Math.max(0, Math.floor(min));
  return "T+" + String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");
}

function renderBrief(){
  const c = state.c;
  $("briefMode").textContent = state.mode.toUpperCase();
  const rows = [];
  const target = state.mode==="sar" ? "Lost sailor" : "Submarine";
  rows.push(["Target", target]);
  rows.push(["Datum distance", Math.round(c.dist)+" NM" + (state.shore?" ("+effDist(c,true)+" via shore)":"")]);
  rows.push(["Initial uncertainty", "±"+c.r0.toFixed(1)+" NM"]);
  rows.push(["Drift / spread", "+"+c.grow.toFixed(1)+" NM/hr"]);
  if(state.mode==="sar"){
    rows.push(["Light", c.night ? "Night" : "Daylight", c.night?"warn":"good"]);
    rows.push(["Sea state", String(c.sea) + (c.sea>=4?" (rough)":""), c.sea>=4?"bad":""]);
    rows.push(["Survival window", "~"+Math.round(c.window)+" min", "warn"]);
    rows.push(["Cutter ETA", Math.round(c.cutterEta)+" min", "bad"]);
  } else {
    const pTxt = {quiet:"Running silent", transit:"In transit", snorkel:"Snorkeling"};
    const pCls = {quiet:"bad", transit:"warn", snorkel:"good"};
    rows.push(["Contact posture", pTxt[c.posture], pCls[c.posture]]);
    rows.push(["Sonar layer", c.deepLayer ? "Deep (good)" : "Shallow", c.deepLayer?"good":"warn"]);
    rows.push(["Prosecution window", "~"+Math.round(c.window)+" min", "warn"]);
    rows.push(["Surface escort ETA", Math.round(c.cutterEta)+" min", "bad"]);
  }
  $("briefBody").innerHTML = rows.map(([k,v,cls]) =>
    `<div class="brief-row"><span class="k">${k}</span><span class="v ${cls||""}">${v}</span></div>`).join("");
  $("budget").textContent = "/ $"+c.budget+"k budget";
  $("shoreNote").textContent = "−"+SHORE_CUT+" NM to datum · +$"+SHORE_COST+"k";
}

function renderFleet(){
  const c = state.c, mode = state.mode, D = effDist(c, state.shore);
  const html = ORDER.map(k => {
    const d = DRONES[k];
    const n = state.loadout[k];
    const reach = reachOneway(d);
    const canReach = reach >= D;
    const note = mode==="sar" ? d.sarNote : d.aswNote;
    const sw = sweepWidth(d, mode, c).toFixed(2);
    const reachFlag = canReach ? "" :
      `<span class="reach-flag"> · ✕ range ${Math.round(reach)} NM &lt; ${Math.round(D)} NM</span>`;
    return `<div class="drone ${canReach?'':'reachable-no'}" data-k="${k}">
      <div class="dname"><span class="swatch" style="background:${d.color}"></span>${d.name}<span class="muted" style="font-weight:400;font-size:.78rem">· ${d.cls}</span></div>
      <div class="dcost">$${d.cost}k</div>
      <div class="stepper">
        <button data-act="dec" data-k="${k}" aria-label="remove ${d.name}">–</button>
        <span class="count" id="cnt-${k}">${n}</span>
        <button data-act="inc" data-k="${k}" aria-label="add ${d.name}">+</button>
      </div>
      <div class="dspec">${d.speed} kn · ${d.endur} min · reach ${Math.round(reach)} NM · sweep ${sw} NM · ${note}${reachFlag}</div>
    </div>`;
  }).join("");
  $("fleet").innerHTML = html;
}

function renderPlan(){
  const a = analyze(state.loadout, state.mode, state.c, state.shore);
  const c = state.c;
  // budget
  const pct = Math.min(100, a.cost/c.budget*100);
  const over = a.cost > c.budget;
  const fill = $("budgetFill"); fill.style.width = pct+"%"; fill.classList.toggle("over", over);
  const spent = $("spent"); spent.textContent = "$"+a.cost+"k"; spent.classList.toggle("over", over);
  // readout
  $("roC").textContent = a.C.toFixed(2);
  const roPod = $("roPod"); roPod.textContent = Math.round(a.POD*100)+"%";
  roPod.className = "val pod";
  // advisory
  const adv = $("advisory");
  let msg = "", good = false;
  const unreachable = ORDER.filter(k => (state.loadout[k]||0) && a.perType[k] && !a.perType[k].reach);
  if(a.total === 0){
    msg = "Select drones to build a plan. Watch the detection estimate climb as you add coverage.";
  } else if(over){
    msg = "✕ Over budget by $"+(a.cost-c.budget)+"k. Trim the swarm or drop a forward shore launch.";
  } else if(unreachable.length){
    const d = DRONES[unreachable[0]];
    msg = "⚠ "+d.name+" can't reach the datum (range "+Math.round(reachOneway(d))+" NM < "+a.D+" NM). " +
          (state.shore ? "Even with shore launch — pick longer-legged drones." : "Add a forward shore launch, or pick longer-legged drones.");
  } else if(a.POD >= 0.8){
    msg = "✓ Strong plan — "+Math.round(a.POD*100)+"% detection probability with $"+(c.budget-a.cost)+"k to spare."; good = true;
  } else if(a.POD >= 0.55){
    msg = "Workable, but coverage is thin for this area. More sweep would lift the odds — if the budget allows.";
  } else {
    msg = "Coverage is low for a "+a.A.toFixed(0)+" NM² search box. You need more swept area over the drift circle.";
    if(state.mode==="asw" && c.posture==="quiet") msg += " A silent boat needs MAD — that's SENTINEL-L.";
    if(state.mode==="sar" && c.night) msg += " At night, thermal beats EO — lean on RANGER/SENTINEL.";
  }
  adv.textContent = msg; adv.classList.toggle("good", good);
  if(state.phase==="plan"){ drawPlanning(); updateHud(0, a); }
  return a;
}

function updateHud(clockMin, a){
  $("hudClock").textContent = fmtClock(clockMin);
  $("hudPod").textContent = a ? Math.round(a.POD*100)+"%" : "—";
  $("hudArea").textContent = a ? a.A.toFixed(0)+" NM²" : "—";
  $("hudTgtLbl").textContent = "Search area";
}

/* ---------------------------------------------------------- *
 *  7. CANVAS — world mapping + drawing
 * ---------------------------------------------------------- */
let MAP = { s:1, ship:{x:0,y:0}, datum:{x:0,y:0} };

function computeMap(){
  const c = state.c;
  const margin = 120;
  const Rmax = searchRadiusAt(c, 1);
  const D = effDist(c, state.shore);
  const sx = (W - 2*margin) / (D + Rmax);
  const sy = (H/2 - margin) / (Rmax + 4);
  const s = Math.min(sx, sy);
  const ship = { x: margin, y: H/2 };
  const datum = { x: margin + D*s, y: H/2 };
  MAP = { s, ship, datum, Rmax };
}

function nm(v){ return v * MAP.s; }
function tgtScreen(){
  const c = state.c;
  return {
    x: MAP.datum.x + Math.cos(c.tgt.ang)*nm(c.tgt.rad),
    y: MAP.datum.y + Math.sin(c.tgt.ang)*nm(c.tgt.rad)
  };
}

function clearStage(){
  ctx.clearRect(0,0,W,H);
  // ocean gradient
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#06131f"); g.addColorStop(1,"#03090f");
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  // faint range rings around ship
  ctx.save();
  ctx.strokeStyle = "rgba(120,170,210,0.07)"; ctx.lineWidth = 1;
  for(let r=1; r<=6; r++){ ctx.beginPath(); ctx.arc(MAP.ship.x, MAP.ship.y, nm(15*r), 0, Math.PI*2); ctx.stroke(); }
  ctx.restore();
}

function drawShip(){
  const {x,y} = MAP.ship;
  ctx.save();
  ctx.translate(x,y);
  // hull
  ctx.fillStyle = "#bcdcff";
  ctx.beginPath();
  ctx.moveTo(-16,-7); ctx.lineTo(14,-7); ctx.lineTo(22,0); ctx.lineTo(14,7); ctx.lineTo(-16,7); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0a1626"; ctx.fillRect(-8,-3,10,6);
  ctx.restore();
  label(x, y+26, state.mode==="sar"?"CUTTER":"DESTROYER", "#8fc7ff");
}

function drawDatum(frac){
  const {x,y} = MAP.datum;
  const R = nm(searchRadiusAt(state.c, frac));
  // drift circle
  ctx.save();
  ctx.setLineDash([8,7]);
  ctx.strokeStyle = "rgba(255,176,32,0.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,176,32,0.05)";
  ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.fill();
  // datum cross
  ctx.strokeStyle = "rgba(255,176,32,0.8)"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x-10,y); ctx.lineTo(x+10,y); ctx.moveTo(x,y-10); ctx.lineTo(x,y+10); ctx.stroke();
  ctx.restore();
  label(x, y - R - 14, state.mode==="sar"?"LAST KNOWN POSITION":"LAST CONTACT", "#ffb020");
}

function label(x,y,txt,color){
  ctx.save();
  ctx.font = "600 19px 'JetBrains Mono', monospace";
  ctx.textAlign = "center"; ctx.fillStyle = color || "#aebfd2";
  ctx.fillText(txt, x, y);
  ctx.restore();
}

// dashed transit line ship -> datum
function drawTransitGuides(){
  ctx.save();
  ctx.setLineDash([4,8]); ctx.strokeStyle = "rgba(143,199,255,0.18)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(MAP.ship.x, MAP.ship.y); ctx.lineTo(MAP.datum.x, MAP.datum.y); ctx.stroke();
  ctx.restore();
}

function drawPlanning(){
  if(!state.c) return;
  computeMap();
  clearStage();
  drawTransitGuides();
  drawDatum(1);                 // show the worst-case (final) drift circle while planning
  drawShip();
  // ghost a few drones at the ship to suggest the swarm
  const total = ORDER.reduce((s,k)=>s+(state.loadout[k]||0),0);
  let i=0;
  for(const k of ORDER){
    for(let j=0;j<(state.loadout[k]||0) && i<14;j++,i++){
      const a = (i/Math.max(1,Math.min(total,14)))*Math.PI*2;
      drawDrone(MAP.ship.x + Math.cos(a)*34, MAP.ship.y + Math.sin(a)*34, a, DRONES[k].color, 0.6);
    }
  }
}

function drawDrone(x,y,heading,color,scale){
  scale = scale||1;
  ctx.save();
  ctx.translate(x,y); ctx.rotate(heading);
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 8*scale;
  ctx.beginPath();
  ctx.moveTo(11*scale,0); ctx.lineTo(-7*scale,-6*scale); ctx.lineTo(-3*scale,0); ctx.lineTo(-7*scale,6*scale);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------- *
 *  8. DEPLOY + ANIMATION
 * ---------------------------------------------------------- */
let drones = [];      // active drone visual agents
let buoys = [];       // ASW sonobuoys
let detectAt = null;  // mission minute of detection (or null)
let detected = false;

function buildDrones(){
  computeMap();
  drones = []; buoys = [];
  const list = [];
  for(const k of ORDER){ for(let j=0;j<(state.loadout[k]||0);j++) list.push(k); }
  const reachable = list.filter(k => reachOneway(DRONES[k]) >= effDist(state.c, state.shore));
  const nR = Math.max(1, reachable.length);
  const Rmax = searchRadiusAt(state.c, 1);
  reachable.forEach((k, idx) => {
    const d = DRONES[k];
    // assign a horizontal band across the drift circle
    const band = (idx + 0.5)/nR;                       // 0..1
    const yOff = (band - 0.5) * 2 * Rmax * 0.92;        // NM offset from datum centre
    const launchAng = (idx/nR - 0.5) * 1.2;
    drones.push({
      k, color:d.color, speed:d.speed,
      x: MAP.ship.x, y: MAP.ship.y,
      phase:"transit",
      heading: 0,
      yOff, band, sweepDir: 1,
      transitDur: effDist(state.c,state.shore)/d.speed,  // hours -> we map via clock
      launchDelay: idx * 0.5,                            // staggered launch (sim minutes-ish)
      dropTimer: 0,
      entryX: MAP.datum.x - nm(Rmax*0.92),
      sweepX: MAP.datum.x - nm(Rmax*0.92)
    });
  });
}

function sampleDetection(a){
  detected = Math.random() < a.POD;
  if(detected){
    const minTransit = state.c.dist / 100 * 60;          // fastest drone transit, min
    // higher coverage -> earlier detection; bias with C
    let frac = 0.25 + 0.6*Math.pow(Math.random(), 1 + Math.min(2,a.C)*0.5);
    detectAt = Math.max(minTransit + 4, state.c.window*frac*0.7);
    detectAt = Math.min(detectAt, state.c.window*0.96);
  } else {
    detectAt = null;
  }
}

function deploy(){
  const a = analyze(state.loadout, state.mode, state.c, state.shore);
  if(a.total === 0){ flashAdvisory("Field at least one drone first."); return; }
  if(a.cost > state.c.budget){ flashAdvisory("Over budget — trim the swarm."); return; }
  if(a.reachable === 0){ flashAdvisory("None of your drones can reach the datum."); return; }

  state.phase = "running";
  state.planAtDeploy = a;
  $("deploy").disabled = true; $("newScenario").disabled = true;
  buildDrones();
  sampleDetection(a);

  const ANIM_MS = 15000;
  const window = state.c.window;
  let start = null;
  detected = detected && detectAt!==null;
  let detectionShown = false;

  function frame(ts){
    if(start===null) start = ts;
    let p = (ts - start)/ANIM_MS;                 // 0..1 over animation
    if(p>1) p = 1;
    const clock = p * window;                     // mission minutes

    computeMap();
    clearStage();
    drawTransitGuides();
    drawDatum(p);                                 // circle grows with time
    drawShip();

    // advance + draw drones
    const Rmax = searchRadiusAt(state.c, 1);
    const airborne = updateDrones(clock, p, Rmax);

    // sonobuoys (ASW)
    drawBuoys(clock);

    // detection event
    if(detected && !detectionShown && clock >= detectAt){
      detectionShown = true;
      revealTarget();
    }
    if(detectionShown) drawTarget();

    // HUD
    $("hudClock").textContent = fmtClock(clock);
    $("hudClock").className = "big clk";
    $("hudPod").textContent = Math.round(state.planAtDeploy.POD*100)+"%";
    $("hudArea").textContent = (Math.PI*Math.pow(searchRadiusAt(state.c,p),2)).toFixed(0)+" NM²";
    $("hudDrones").textContent = airborne;

    if(p < 1 && !(detectionShown && clock > detectAt + 12)){
      state.anim = requestAnimationFrame(frame);
    } else {
      finishMission();
    }
  }
  state.anim = requestAnimationFrame(frame);
}

function updateDrones(clock, p, Rmax){
  let airborne = 0;
  const c = state.c;
  const transitClock = k => effDist(c,state.shore)/DRONES[k].speed*60; // minutes to datum
  for(const dr of drones){
    const tMin = transitClock(dr.k);
    const launchT = dr.launchDelay;
    if(clock < launchT){ continue; }                 // not yet launched
    airborne++;
    const flyT = clock - launchT;
    if(flyT < tMin){
      // transit: interpolate ship -> entry point of its band
      const f = flyT / tMin;
      const ex = dr.entryX, ey = MAP.datum.y + nm(dr.yOff);
      dr.x = MAP.ship.x + (ex - MAP.ship.x)*ease(f);
      dr.y = MAP.ship.y + (ey - MAP.ship.y)*ease(f);
      dr.heading = Math.atan2(ey-MAP.ship.y, ex-MAP.ship.x);
      dr.phase = "transit";
    } else {
      // searching: lawnmower sweep across its band within the circle
      dr.phase = "search";
      const ey = MAP.datum.y + nm(dr.yOff);
      // horizontal extent of circle at this band's y
      const dy = (ey - MAP.datum.y)/MAP.s;             // NM from centre line
      const half = Math.sqrt(Math.max(0, Math.pow(searchRadiusAt(c,p),2) - dy*dy));
      const left = MAP.datum.x - nm(half), right = MAP.datum.x + nm(half);
      const sweepSpeed = (right-left) / 5.5;           // px per sim-min-ish
      dr.sweepX += dr.sweepDir * (DRONES[dr.k].speed/60) * MAP.s * 0.9;
      if(dr.sweepX > right){ dr.sweepX = right; dr.sweepDir = -1; }
      if(dr.sweepX < left){ dr.sweepX = left; dr.sweepDir = 1; }
      if(dr.sweepX < left+1) dr.sweepX = left;
      dr.x = Math.max(left, Math.min(right, dr.sweepX));
      dr.y = ey;
      dr.heading = dr.sweepDir>0 ? 0 : Math.PI;
      // draw sensor footprint
      drawFootprint(dr, c);
      // ASW: drop sonobuoys periodically
      if(state.mode==="asw" && (DRONES[dr.k].asw.sono>0)){
        dr.dropTimer += 1;
        if(dr.dropTimer > 26){ dr.dropTimer = 0; buoys.push({x:dr.x,y:dr.y,t0:clock}); }
      }
    }
    drawDrone(dr.x, dr.y, dr.heading, dr.color, 1);
  }
  return airborne;
}

function drawFootprint(dr, c){
  const w = sweepWidth(DRONES[dr.k], state.mode, c);
  const r = nm(w)*0.5;
  ctx.save();
  const col = state.mode==="sar" ? "255,106,61" : "52,226,160";
  ctx.fillStyle = `rgba(${col},0.10)`;
  ctx.strokeStyle = `rgba(${col},0.28)`;
  ctx.beginPath(); ctx.arc(dr.x, dr.y, Math.max(6,r), 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawBuoys(clock){
  ctx.save();
  for(const b of buoys){
    const age = clock - b.t0;
    ctx.fillStyle = "rgba(52,226,160,0.9)";
    ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    const ring = (age*1.4) % 22;
    ctx.strokeStyle = `rgba(52,226,160,${Math.max(0,0.4-ring/55)})`;
    ctx.beginPath(); ctx.arc(b.x,b.y, nm(0.4)+ring, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

let targetPos = null;
function revealTarget(){ targetPos = tgtScreen(); }
function drawTarget(){
  if(!targetPos) return;
  const {x,y} = targetPos;
  const sar = state.mode==="sar";
  const col = sar ? "#ff6a3d" : "#34e2a0";
  ctx.save();
  // pulse ring
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x,y, 26, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fill();
  ctx.restore();
  label(x, y-36, sar ? "★ SAILOR LOCATED" : "★ CONTACT — TRACK HELD", col);
}

function ease(t){ return t<0.5 ? 2*t*t : -1+(4-2*t)*t; }

function flashAdvisory(msg){
  const adv = $("advisory"); const prev = adv.textContent;
  adv.textContent = "✕ "+msg; adv.style.color = "#ff6a3d";
  setTimeout(()=>{ adv.style.color=""; renderPlan(); }, 1800);
}

/* ---------------------------------------------------------- *
 *  9. DEBRIEF
 * ---------------------------------------------------------- */
function finishMission(){
  state.phase = "done";
  showBanner(detected, state.mode);
  setTimeout(()=> debrief(), 1100);
}

function showBanner(found, mode){
  const b = $("banner");
  if(found){
    $("bannerHead").textContent = mode==="sar" ? "SAILOR RECOVERED" : "CONTACT HELD";
    $("bannerHead").style.color = mode==="sar" ? "#ff6a3d" : "#34e2a0";
    $("bannerSub").textContent = mode==="sar" ? "GPS marker dropped · helo vectored in" : "Track established · destroyer cued";
  } else {
    $("bannerHead").textContent = mode==="sar" ? "SEARCH SUSPENDED" : "CONTACT LOST";
    $("bannerHead").style.color = "#ff6a3d";
    $("bannerSub").textContent = mode==="sar" ? "The drift circle outran your coverage" : "The boat slipped the sensor field";
  }
  b.classList.add("show");
}

function debrief(){
  const a = state.planAtDeploy, c = state.c;
  const best = bestPlan(state.mode, c);
  const found = detected;

  $("verdict").textContent = found ? "FOUND" : "NOT FOUND";
  $("verdict").className = "verdict " + (found ? "found" : "lost");
  $("verdictSub").textContent = found
    ? (state.mode==="sar"
        ? "Your swarm located the sailor and marked the position for recovery."
        : "Your sensor field held track on the submarine.")
    : (state.mode==="sar"
        ? "Time ran out before coverage was enough. In cold water, that is the difference."
        : "The contact evaded the field. Awareness range was too thin.");

  $("sTime").textContent = found ? fmtClock(detectAt).replace("T+","") : "—";
  $("sTimeLbl").textContent = state.mode==="sar" ? "Time to find" : "Time to track";
  $("sCost").textContent = "$"+a.cost+"k";
  $("sPod").textContent = Math.round(a.POD*100)+"%";

  // grade against budget-constrained optimum
  const eff = best.POD>0 ? a.POD/best.POD : 0;
  const g = $("grade");
  let cls, txt;
  const tip = coachTip(a, best, c);
  if(eff >= 0.9 && a.cost <= best.cost*1.15 + 1){
    cls="a"; txt = `<span class="badge">◆ OPTIMAL BUY.</span> You hit ${Math.round(a.POD*100)}% detection — within reach of the best plan for this scenario (${Math.round(best.POD*100)}%). ${tip}`;
  } else if(eff >= 0.65){
    cls="b"; txt = `<span class="badge">◆ SOLID, NOT OPTIMAL.</span> Best achievable here was ~${Math.round(best.POD*100)}% for $${best.cost}k. ${tip}`;
  } else {
    cls="c"; txt = `<span class="badge">◆ UNDER-RESOURCED.</span> A smarter buy reached ~${Math.round(best.POD*100)}% within the same $${c.budget}k budget. ${tip}`;
  }
  g.className = "grade "+cls; g.innerHTML = txt;

  $("modalBack").classList.add("show");
}

function coachTip(a, best, c){
  // contextual one-liner
  const had = state.loadout, opt = best.loadout;
  const unreachableSpend = ORDER.some(k => (had[k]||0) && reachOneway(DRONES[k]) < a.D);
  if(unreachableSpend)
    return "You spent on drones that couldn't reach the datum — wasted budget. Check the range flag before deploying.";
  if(state.mode==="asw" && c.posture==="quiet" && (had.sentinel||0) < (opt.sentinel||0))
    return "Against a silent boat, sonobuoys go deaf — the MAD boom on SENTINEL-L is what closes the gap.";
  if(state.mode==="asw" && c.posture==="snorkel" && (had.sentinel||0) > (opt.sentinel||0))
    return "A snorkeling boat is exposed to radar — cheaper RANGER swarms cover more water per dollar than premium MAD.";
  if(state.mode==="sar" && c.night && (had.scout||0) > (opt.scout||0))
    return "At night, EO-heavy SCOUT-S sees little — the budget buys more probability as thermal sweep on RANGER/SENTINEL.";
  if(c.far && (had.scout||0) > (opt.scout||0))
    return "On a far datum, short-legged scouts can't get on station — long range is worth the unit cost here.";
  if(a.cost < best.cost*0.8)
    return "You left budget on the table — more sweep area was affordable and would have lifted the odds.";
  if(best.shore && !state.shore)
    return "A forward shore launch would have shortened the transit and freed endurance for searching.";
  return "Balance reach, sweep width, and quantity against the area — that trade is the whole game.";
}

/* ---------------------------------------------------------- *
 *  10. CONTROL FLOW
 * ---------------------------------------------------------- */
function newScenario(keepMode){
  if(state.anim) cancelAnimationFrame(state.anim);
  state.c = genScenario(state.mode);
  state.loadout = { scout:0, ranger:0, sentinel:0 };
  state.shore = false; $("shore").checked = false;
  state.phase = "plan";
  $("banner").classList.remove("show");
  $("deploy").disabled = false; $("newScenario").disabled = false;
  $("hudDrones").textContent = "0";
  renderBrief(); renderFleet(); renderPlan();
}

function setMode(mode){
  state.mode = mode;
  $("modeSar").classList.toggle("active", mode==="sar");
  $("modeAsw").classList.toggle("active", mode==="asw");
  newScenario();
}

/* ---------------------------------------------------------- *
 *  11. EVENTS
 * ---------------------------------------------------------- */
$("fleet").addEventListener("click", e => {
  const btn = e.target.closest("button[data-act]");
  if(!btn || state.phase==="running") return;
  const k = btn.dataset.k, act = btn.dataset.act;
  const cur = state.loadout[k]||0;
  state.loadout[k] = act==="inc" ? Math.min(MAXN[k], cur+1) : Math.max(0, cur-1);
  $("cnt-"+k).textContent = state.loadout[k];
  renderPlan();
});

$("shore").addEventListener("change", e => {
  state.shore = e.target.checked;
  renderBrief(); renderFleet(); renderPlan();
});

$("deploy").addEventListener("click", deploy);
$("newScenario").addEventListener("click", ()=>{ if(state.phase!=="running") newScenario(); });
$("modeSar").addEventListener("click", ()=> setMode("sar"));
$("modeAsw").addEventListener("click", ()=> setMode("asw"));

$("replay").addEventListener("click", ()=>{
  $("modalBack").classList.remove("show");
  $("banner").classList.remove("show");
  state.phase = "plan";
  $("deploy").disabled = false; $("newScenario").disabled = false;
  renderPlan();
});
$("nextScenario").addEventListener("click", ()=>{
  $("modalBack").classList.remove("show");
  newScenario();
});

/* ---------------------------------------------------------- *
 *  12. BOOT
 * ---------------------------------------------------------- */
setMode("sar");

})();
