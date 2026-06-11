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
  $("budget").textContent = "/ $"+c.budget+"k target";
  $("shoreNote").textContent = "−"+SHORE_CUT+" NM to datum · +$"+SHORE_COST+"k";
  // scenario "edge" — surface the trick up front
  $("briefEdge").innerHTML = "<b>Edge:</b> " + scenarioEdge(c, state.mode);
  // objective strip
  const obj = $("objective");
  obj.className = "objective " + state.mode;
  if(state.mode==="sar"){
    obj.innerHTML = `<span class="tag">Objective</span><span><b>Locate the lost sailor</b> before the ~${Math.round(c.window)} min survival window runs out. Spend what you need — but a lean, fast rescue near the <b>$${c.budget}k</b> target scores highest.</span>`;
  } else {
    obj.innerHTML = `<span class="tag">Objective</span><span><b>Detect and track the submarine</b> before it slips the search area (~${Math.round(c.window)} min). Field whatever it takes — efficiency near the <b>$${c.budget}k</b> target wins the leaderboard.</span>`;
  }
}

function renderFleet(){
  const c = state.c, mode = state.mode, D = effDist(c, state.shore);
  const html = ORDER.map(k => {
    const d = DRONES[k];
    const n = state.loadout[k];
    const reach = reachOneway(d);
    const canReach = reach >= D;
    const note = mode==="sar" ? d.sarNote : d.aswNote;
    const swv = sweepWidth(d, mode, c);
    const reachPct = Math.min(100, reach/350*100);
    const swPct = Math.min(100, swv/2.2*100);
    const costPct = Math.min(100, d.cost/60*100);
    const reachFlag = canReach ? "" : `<span class="reach-flag">✕ can't reach (${Math.round(reach)} &lt; ${Math.round(D)} NM)</span>`;
    return `<div class="drone ${canReach?'':'reachable-no'}" data-k="${k}">
      <div class="dname"><span class="swatch" style="background:${d.color}"></span>${d.name}<span class="muted" style="font-weight:400;font-size:.76rem">· ${d.cls}</span></div>
      <div class="dcost">$${d.cost}k</div>
      <div class="stepper">
        <button data-act="dec" data-k="${k}" aria-label="remove ${d.name}">–</button>
        <span class="count" id="cnt-${k}">${n}</span>
        <button data-act="inc" data-k="${k}" aria-label="add ${d.name}">+</button>
      </div>
      <div class="dbars">
        <div class="dbar"><span>Reach</span><div class="track"><i class="${canReach?'':'bad'}" style="width:${reachPct}%"></i></div></div>
        <div class="dbar"><span>Sweep</span><div class="track"><i class="son" style="width:${swPct}%"></i></div></div>
        <div class="dbar"><span>Cost</span><div class="track"><i class="amb" style="width:${costPct}%"></i></div></div>
      </div>
      <div class="dspec">${note}${reachFlag}</div>
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
    msg = "⚠ $"+(a.cost-c.budget)+"k over the target spend. You can still deploy — but overspending costs leaderboard points. Lean is good.";
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
  // mirror live state into the always-visible bottom dock
  $("dockPod").textContent = Math.round(a.POD*100)+"%";
  const ds = $("dockSpent"); ds.textContent = "$"+a.cost+"k"; ds.classList.toggle("over", over);
  if(state.phase==="plan"){ drawPlanning(); updateHud(0, a); }
  return a;
}

// one-line "here's the trick" for the current scenario
function scenarioEdge(c, mode){
  if(mode==="sar"){
    if(c.far && c.night) return "Far datum at night — you need long-range thermal. SENTINEL reaches it; scouts can't.";
    if(c.far) return "Far datum — short-legged scouts burn out in transit. Buy range, or add a shore launch.";
    if(c.night) return "Night search — thermal beats daylight cameras. Favor RANGER / SENTINEL.";
    if(c.sea>=4) return "Rough seas clutter every sensor — lean on the widest sweep (SENTINEL).";
    return "Close, calm datum — a cheap SCOUT swarm can blanket it for less.";
  } else {
    if(c.posture==="quiet") return "Silent boat — sonobuoys go deaf. Only SENTINEL's MAD boom reliably finds it.";
    if(c.posture==="snorkel") return "Snorkeling — it's exposed to radar. Cheap RANGER swarms cover the most water per dollar.";
    if(!c.deepLayer) return "Shallow sound layer — sonobuoys are degraded. Mix in MAD (SENTINEL).";
    return "Boat in transit with a good sound layer — sonobuoy-heavy RANGER swarms shine.";
  }
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

  const col = state.mode==="sar" ? "255,106,61" : "52,226,160";
  const Rpx = nm(searchRadiusAt(state.c, 1));
  const { lanes, unreachable } = laneLayout();

  // PAINT the coverage your current loadout would lay over the drift circle.
  // Fat stripes = wide sensors (SENTINEL); thin = SCOUT; none = can't reach.
  if(lanes.length){
    ctx.save();
    ctx.beginPath(); ctx.arc(MAP.datum.x, MAP.datum.y, Rpx, 0, Math.PI*2); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    for(const ln of lanes){
      const y = MAP.datum.y + nm(ln.yOff);
      const h = Math.max(9, nm(ln.w));
      const g = ctx.createLinearGradient(0, y-h/2, 0, y+h/2);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},0.22)`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(MAP.datum.x - Rpx, y - h/2, Rpx*2, h);
    }
    ctx.restore();
  }

  drawShip();

  // unreachable drones = wasted money: show as red stubs by the ship
  unreachable.slice(0,4).forEach((k,i)=>{
    label(MAP.ship.x, MAP.ship.y - 50 - i*22, "✕ "+DRONES[k].name+" can't reach", "#ff6a3d");
  });

  // big legible coverage readout under the circle
  const a = analyze(state.loadout, state.mode, state.c, state.shore);
  ctx.save(); ctx.textAlign = "center";
  if(a.total > 0){
    const pct = Math.round((1-Math.exp(-a.C))*100);
    ctx.font = "700 34px 'JetBrains Mono', monospace";
    ctx.fillStyle = pct>=70 ? `rgba(${col},0.95)` : (pct>=45 ? "rgba(255,176,32,0.95)" : "rgba(255,106,61,0.95)");
    ctx.fillText(pct + "% coverage", MAP.datum.x, MAP.datum.y + Rpx + 50);
    ctx.font = "400 16px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(174,191,210,0.75)";
    ctx.fillText(lanes.length + " drone" + (lanes.length===1?"":"s") + " on station   —   press DEPLOY ▸", MAP.datum.x, MAP.datum.y + Rpx + 76);
  } else {
    ctx.font = "400 17px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(174,191,210,0.6)";
    ctx.fillText("Add drones with +  to paint your search coverage", MAP.datum.x, MAP.datum.y + Rpx + 54);
  }
  ctx.restore();
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
let covCanvas = null, covCtx = null;   // persistent "where we've looked" heatmap
let catchDrone = -1;                   // index of the drone that makes the find
let shakeFrames = 0;                   // screen-shake countdown
let modeCol = "255,106,61";            // active mode rgb for paint

// shared lane layout — used by both the planning preview and the live run
function laneLayout(){
  const c = state.c, D = effDist(c, state.shore);
  const list = [];
  for(const k of ORDER){ for(let j=0;j<(state.loadout[k]||0);j++) list.push(k); }
  const reachable = list.filter(k => reachOneway(DRONES[k]) >= D);
  const unreachable = list.filter(k => reachOneway(DRONES[k]) < D);
  const nR = Math.max(1, reachable.length);
  const Rmax = searchRadiusAt(c, 1);
  const lanes = reachable.map((k, idx) => ({
    k, idx,
    yOff: ((idx + 0.5)/nR - 0.5) * 2 * Rmax * 0.92,
    w: sweepWidth(DRONES[k], state.mode, c)
  }));
  return { lanes, unreachable, nR, Rmax };
}

function buildDrones(){
  computeMap();
  drones = []; buoys = [];
  const { lanes, Rmax } = laneLayout();
  lanes.forEach(ln => {
    const d = DRONES[ln.k];
    drones.push({
      k: ln.k, color:d.color, speed:d.speed,
      x: MAP.ship.x, y: MAP.ship.y, phase:"transit", heading:0,
      yOff: ln.yOff, w: ln.w, sweepDir: 1,
      launchDelay: ln.idx * 0.5, dropTimer: 0,
      entryX: MAP.datum.x - nm(Rmax*0.92),
      sweepX: MAP.datum.x - nm(Rmax*0.92),
      minDist: Infinity
    });
  });
}

function sampleDetection(a){
  // the POD math (1 - e^-C) stays authoritative: roll the dice...
  detected = Math.random() < a.POD;
  catchDrone = -1;
  if(detected){
    // ...but make it EARNED: the find is credited to the drone whose lane is
    // nearest the (hidden) target, so the player sees a sweep pass over them.
    const tgtY = Math.sin(state.c.tgt.ang) * state.c.tgt.rad;   // NM offset from datum
    let best = Infinity;
    drones.forEach((dr, i) => { const dd = Math.abs(dr.yOff - tgtY); if(dd < best){ best = dd; catchDrone = i; } });
    const minTransit = state.c.dist / 100 * 60;          // fastest drone transit, min
    let frac = 0.30 + 0.55*Math.pow(Math.random(), 1 + Math.min(2,a.C)*0.5);
    detectAt = Math.max(minTransit + 5, state.c.window*frac);
    detectAt = Math.min(detectAt, state.c.window*0.94);
  } else {
    detectAt = null;
  }
}

function deploy(){
  const a = analyze(state.loadout, state.mode, state.c, state.shore);
  if(a.total === 0){ flashAdvisory("Field at least one drone first."); return; }
  if(a.reachable === 0){ flashAdvisory("None of your drones can reach the datum."); return; }

  state.phase = "running";
  state.planAtDeploy = a;
  setDeployEnabled(false); $("newScenario").disabled = true;
  modeCol = state.mode==="sar" ? "255,106,61" : "52,226,160";
  buildDrones();
  sampleDetection(a);

  // fresh "where we've looked" heatmap buffer
  covCanvas = document.createElement("canvas"); covCanvas.width = W; covCanvas.height = H;
  covCtx = covCanvas.getContext("2d");
  shakeFrames = 0;

  initAudio(); sfxLaunch();
  runCountdown(() => startRun(a));
}

function startRun(a){
  const ANIM_MS = 15000;
  const win = state.c.window;
  const tMin0 = state.c.dist / 100 * 60;       // fastest transit (min)
  let start = null, detectionShown = false;

  function frame(ts){
    if(start===null) start = ts;
    let p = (ts - start)/ANIM_MS; if(p>1) p = 1;
    const clock = p * win;

    computeMap();
    clearStage();                                // ocean fills full canvas (unshaken)

    // screen-shake on contact
    let sdx = 0, sdy = 0;
    if(shakeFrames > 0){ const m = shakeFrames*1.3; sdx=(Math.random()-0.5)*m; sdy=(Math.random()-0.5)*m; shakeFrames--; }
    ctx.save(); ctx.translate(sdx, sdy);

    drawTransitGuides();
    drawDatum(p);
    // composite the accumulated coverage heatmap, clipped to the current circle
    if(covCanvas){
      ctx.save();
      ctx.beginPath(); ctx.arc(MAP.datum.x, MAP.datum.y, nm(searchRadiusAt(state.c,p)), 0, Math.PI*2); ctx.clip();
      ctx.drawImage(covCanvas, 0, 0);
      ctx.restore();
    }
    drawShip();
    const airborne = updateDrones(clock, p);
    drawBuoys(clock);

    if(detected && !detectionShown && clock >= detectAt){ detectionShown = true; onContact(); }
    if(detectionShown) drawTarget(clock);
    ctx.restore();

    // HUD — detection probability CLIMBS as coverage accrues (faithful to 1-e^-C)
    const area = Math.PI*Math.pow(searchRadiusAt(state.c,p),2);
    const prog = Math.max(0, Math.min(1, (clock - tMin0)/Math.max(1, win - tMin0)));
    const podNow = detectionShown ? 100 : Math.round((1-Math.exp(-a.C*prog))*100);
    $("hudClock").textContent = fmtClock(clock);
    $("hudClock").className = "big clk";
    $("hudPod").textContent = podNow + "%";
    $("hudArea").textContent = area.toFixed(0)+" NM²";
    $("hudDrones").textContent = airborne;

    if(p < 1 && !(detectionShown && clock > detectAt + 10)){
      state.anim = requestAnimationFrame(frame);
    } else {
      finishMission();
    }
  }
  state.anim = requestAnimationFrame(frame);
}

function updateDrones(clock, p){
  let airborne = 0;
  const c = state.c;
  const tgt = tgtScreen();
  const transitClock = k => effDist(c,state.shore)/DRONES[k].speed*60;
  for(const dr of drones){
    const tMin = transitClock(dr.k);
    if(clock < dr.launchDelay){ continue; }
    airborne++;
    const flyT = clock - dr.launchDelay;
    if(flyT < tMin){
      const f = flyT / tMin;
      const ex = dr.entryX, ey = MAP.datum.y + nm(dr.yOff);
      dr.x = MAP.ship.x + (ex - MAP.ship.x)*ease(f);
      dr.y = MAP.ship.y + (ey - MAP.ship.y)*ease(f);
      dr.heading = Math.atan2(ey-MAP.ship.y, ex-MAP.ship.x);
      dr.phase = "transit";
    } else {
      dr.phase = "search";
      const ey = MAP.datum.y + nm(dr.yOff);
      const dy = (ey - MAP.datum.y)/MAP.s;
      const half = Math.sqrt(Math.max(0, Math.pow(searchRadiusAt(c,p),2) - dy*dy));
      const left = MAP.datum.x - nm(half), right = MAP.datum.x + nm(half);
      dr.sweepX += dr.sweepDir * (DRONES[dr.k].speed/60) * MAP.s * 0.9;
      if(dr.sweepX > right){ dr.sweepX = right; dr.sweepDir = -1; }
      if(dr.sweepX < left){ dr.sweepX = left; dr.sweepDir = 1; }
      dr.x = Math.max(left, Math.min(right, dr.sweepX));
      dr.y = ey;
      dr.heading = dr.sweepDir>0 ? 0 : Math.PI;
      stampCoverage(dr);                          // paint into the persistent heatmap
      if(state.mode==="asw" && DRONES[dr.k].asw.sono>0){
        dr.dropTimer += 1;
        if(dr.dropTimer > 26){ dr.dropTimer = 0; buoys.push({x:dr.x,y:dr.y,t0:clock}); }
      }
    }
    dr.minDist = Math.min(dr.minDist, Math.hypot(dr.x-tgt.x, dr.y-tgt.y));
    drawDrone(dr.x, dr.y, dr.heading, dr.color, 1);
  }
  return airborne;
}

// stamp the drone's sensor footprint into the persistent coverage buffer
function stampCoverage(dr){
  if(!covCtx) return;
  const r = Math.max(7, nm(dr.w)*0.62);
  covCtx.save();
  covCtx.globalCompositeOperation = "lighter";
  const g = covCtx.createRadialGradient(dr.x,dr.y,0, dr.x,dr.y,r);
  g.addColorStop(0, `rgba(${modeCol},0.07)`); g.addColorStop(1, `rgba(${modeCol},0)`);
  covCtx.fillStyle = g;
  covCtx.beginPath(); covCtx.arc(dr.x, dr.y, r, 0, Math.PI*2); covCtx.fill();
  covCtx.restore();
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

function onContact(){ shakeFrames = 13; sfxPing(); }

function drawTarget(clock){
  const t = tgtScreen();
  const sar = state.mode==="sar";
  const col = sar ? "#ff6a3d" : "#34e2a0";
  // link line from the drone that made the find
  if(catchDrone>=0 && drones[catchDrone]){
    const d = drones[catchDrone];
    ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(t.x,t.y); ctx.stroke(); ctx.restore();
  }
  // expanding sonar ping
  const age = Math.max(0, clock - detectAt);
  const rr = Math.min(70, age*24);
  ctx.save();
  ctx.strokeStyle = col; ctx.globalAlpha = Math.max(0, 1 - rr/70); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(t.x, t.y, 10+rr, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
  // target
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(t.x,t.y, 24, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(t.x,t.y,8,0,Math.PI*2); ctx.fill();
  ctx.restore();
  label(t.x, t.y-34, sar ? "★ SAILOR LOCATED" : "★ CONTACT — TRACK HELD", col);
}

// on a miss, show where the target was and whether you covered it or left a gap
function drawMiss(){
  const t = tgtScreen();
  let covered = false;
  if(covCtx){ try{ covered = covCtx.getImageData(Math.round(t.x), Math.round(t.y), 1, 1).data[3] > 14; }catch(e){} }
  state._missCovered = covered;
  let nd = null, best = Infinity;
  for(const d of drones){ if(d.minDist < best){ best = d.minDist; nd = d; } }
  ctx.save();
  ctx.strokeStyle = "rgba(150,162,178,0.6)"; ctx.setLineDash([3,4]); ctx.lineWidth = 1.4;
  if(nd){ ctx.beginPath(); ctx.moveTo(nd.x,nd.y); ctx.lineTo(t.x,t.y); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(160,172,188,0.9)";
  ctx.beginPath(); ctx.arc(t.x,t.y,7,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "rgba(160,172,188,0.7)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(t.x,t.y,16,0,Math.PI*2); ctx.stroke();
  ctx.restore();
  label(t.x, t.y-26, covered ? "WAS HERE — covered, but the odds missed" : "WAS HERE — a gap you never swept", "#aebfd2");
}

function ease(t){ return t<0.5 ? 2*t*t : -1+(4-2*t)*t; }

/* ---- minimal WebAudio juice (synth, no files) ---- */
let actx = null, muted = (localStorage.getItem("talon_mute")==="1");
function initAudio(){
  if(muted) return;
  if(!actx){ try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ actx=null; } }
  if(actx && actx.state==="suspended") actx.resume();
}
function tone(freq, dur, type, gain){
  if(!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type||"sine"; o.frequency.value = freq;
  o.connect(g); g.connect(actx.destination);
  const t = actx.currentTime;
  g.gain.setValueAtTime(gain||0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur);
}
function sfxLaunch(){ tone(180,0.3,"sawtooth",0.04); }
function sfxBeep(f){ tone(f,0.12,"square",0.05); }
function sfxPing(){ tone(880,0.45,"sine",0.09); tone(1320,0.5,"sine",0.035); }

function runCountdown(then){
  const el = $("countdown");
  let n = 3;
  el.classList.add("show"); el.textContent = "3"; sfxBeep(440);
  const iv = setInterval(() => {
    n--;
    if(n > 0){ el.textContent = String(n); sfxBeep(440); }
    else if(n === 0){ el.textContent = "LAUNCH"; sfxBeep(680); }
    else { clearInterval(iv); el.classList.remove("show"); then(); }
  }, 560);
}

function flashAdvisory(msg){
  const adv = $("advisory"); const prev = adv.textContent;
  adv.textContent = "✕ "+msg; adv.style.color = "#ff6a3d";
  setTimeout(()=>{ adv.style.color=""; renderPlan(); }, 1800);
}

/* ---------------------------------------------------------- *
 *  8b. SCORING + LEADERBOARD
 * ---------------------------------------------------------- */
// Set LB_API to the deployed Cloudflare Worker URL to make the board GLOBAL.
// Empty string => the board is stored locally in this browser only.
const LB_API = "https://talon-leaderboard.sariddel.workers.dev";
const LB_KEY = "talon_lb_v1";
const NAME_KEY = "talon_name";

function computeScore(){
  const a = state.planAtDeploy, c = state.c;
  // efficiency: spending under the target earns up to +2000; over it costs up to -2500
  const effFrac = (c.budget - a.cost) / c.budget;          // >0 under target, <0 over
  const effPts = Math.round(Math.max(-2500, Math.min(2000, effFrac * 2000)));
  if(detected){
    const base = 5000;
    const podPts = Math.round(a.POD*2500);
    const speedPts = Math.round(Math.max(0, 1 - detectAt/c.window) * 1800);
    return { total: Math.max(0, base+podPts+speedPts+effPts), found:true,
      parts:[["Target found",base],["Detection",podPts],["Speed",speedPts],["Efficiency",effPts]] };
  }
  const podPts = Math.round(a.POD*1200);
  return { total: Math.max(0, podPts+Math.min(0,effPts)), found:false,
    parts:[["Plan quality (not found)",podPts],["Efficiency",Math.min(0,effPts)]] };
}

function lbLocal(){ try { return JSON.parse(localStorage.getItem(LB_KEY)) || {sar:[],asw:[]}; } catch(e){ return {sar:[],asw:[]}; } }
function lbIsGlobal(){ return !!LB_API; }

async function lbGet(mode){
  if(LB_API){
    try{
      const r = await fetch(LB_API+"/board?mode="+mode, {cache:"no-store"});
      if(r.ok) return await r.json();
    }catch(e){}
  }
  return (lbLocal()[mode]||[]).slice().sort((a,b)=>b.score-a.score).slice(0,25);
}

async function lbSubmit(entry){
  if(LB_API){
    try{
      // text/plain keeps it a CORS "simple request" (no preflight)
      const r = await fetch(LB_API+"/score", {method:"POST", headers:{"Content-Type":"text/plain"}, body:JSON.stringify(entry)});
      if(r.ok) return await r.json();
    }catch(e){}
  }
  const all = lbLocal();
  all[entry.mode] = all[entry.mode]||[];
  all[entry.mode].push(entry);
  all[entry.mode].sort((a,b)=>b.score-a.score);
  all[entry.mode] = all[entry.mode].slice(0,50);
  localStorage.setItem(LB_KEY, JSON.stringify(all));
  return all[entry.mode].slice(0,25);
}

let lastScore = null, lastSubmittedTs = null;

/* ---------------------------------------------------------- *
 *  9. DEBRIEF
 * ---------------------------------------------------------- */
function setDeployEnabled(on){
  $("deploy").disabled = !on;
  const dock = $("deployDock"); if(dock) dock.disabled = !on;
}

function finishMission(){
  state.phase = "done";
  if(!detected) drawMiss();
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
    $("bannerSub").textContent = state._missCovered
      ? "You covered the spot — the odds just missed"
      : (mode==="sar" ? "A gap in coverage outran the search" : "The boat slipped through an unswept gap");
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

  // ---- star rating + your-plan-vs-optimal chips ----
  let stars = 0;
  if(found){ stars = 1; if(eff >= 0.65) stars = 2; if(eff >= 0.9 && a.cost <= c.budget + 1) stars = 3; }
  $("stars").innerHTML = [0,1,2].map(i => `<span class="star ${i<stars?'on':''}">★</span>`).join("");
  const chip = (lo, cls) => ORDER.filter(k=>lo[k]>0).map(k=>`<span class="chip ${cls}">${lo[k]}× ${DRONES[k].name.split('-')[0]}</span>`).join("") || `<span class="chip ${cls}">—</span>`;
  const shoreChip = (s) => s ? `<span class="chip">+shore</span>` : "";
  $("planChips").innerHTML =
    `<div class="chip-row"><span class="chip-lbl">You</span>${chip(state.loadout,'you')}${shoreChip(state.shore)}</div>` +
    `<div class="chip-row"><span class="chip-lbl">Optimal</span>${chip(best.loadout,'opt')}${shoreChip(best.shore)}</div>`;

  // ---- score + leaderboard submit ----
  lastScore = computeScore();
  lastSubmittedTs = null;
  animateScore(lastScore.total);
  $("scoreBreak").innerHTML = lastScore.parts
    .map(([k,v]) => {
      const sign = v < 0 ? "−" : "+";
      const cls = v < 0 ? "neg" : (v > 0 ? "pos" : "");
      return `${k} <span class="${cls}">${sign}${Math.abs(v).toLocaleString()}</span>`;
    }).join("<br>");
  const savedName = localStorage.getItem(NAME_KEY) || "";
  $("playerName").value = savedName;
  $("submitRow").style.display = "flex";
  $("submitScore").disabled = false;
  $("submitScore").textContent = "Submit score";
  $("submitStatus").textContent = "";

  $("modalBack").classList.add("show");
}

function animateScore(target){
  const el = $("missionScore");
  let cur = 0; const steps = 28, inc = target/steps; let i = 0;
  const tick = () => {
    i++; cur = Math.min(target, Math.round(inc*i));
    el.textContent = cur.toLocaleString();
    if(i < steps) requestAnimationFrame(tick);
    else el.textContent = target.toLocaleString();
  };
  tick();
}

async function submitScore(){
  if(!lastScore) return;
  let name = ($("playerName").value || "").trim().replace(/[<>]/g,"").slice(0,14);
  if(!name){ $("playerName").focus(); $("submitStatus").textContent = "enter a name"; return; }
  localStorage.setItem(NAME_KEY, name);
  const entry = {
    name, mode: state.mode, score: lastScore.total,
    found: lastScore.found, time: detected ? Math.round(detectAt) : null,
    pod: Math.round(state.planAtDeploy.POD*100), ts: Date.now()
  };
  lastSubmittedTs = entry.ts;
  $("submitScore").disabled = true; $("submitScore").textContent = "Submitting…";
  $("submitStatus").textContent = "";
  await lbSubmit(entry);
  $("submitScore").textContent = "✓ Submitted";
  $("submitStatus").textContent = "";
  openLeaderboard(state.mode);
}

function coachTip(a, best, c){
  // contextual one-liner
  const had = state.loadout, opt = best.loadout;
  const unreachableSpend = ORDER.some(k => (had[k]||0) && reachOneway(DRONES[k]) < a.D);
  if(unreachableSpend)
    return "You spent on drones that couldn't reach the datum — wasted money. Check the range flag before deploying.";
  if(a.cost > c.budget*1.15)
    return "You found them — but $"+(a.cost-c.budget)+"k over the target. The leaderboard rewards lean rescues: trim to the cheapest swarm that still covers the area.";
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
  setDeployEnabled(true); $("newScenario").disabled = false;
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
 *  10b. LEADERBOARD + HOW-TO-PLAY MODALS
 * ---------------------------------------------------------- */
let lbMode = "sar";

async function openLeaderboard(mode){
  lbMode = mode || lbMode;
  $("lbTabSar").classList.toggle("active", lbMode==="sar");
  $("lbTabAsw").classList.toggle("active", lbMode==="asw");
  $("lbScope").innerHTML = lbIsGlobal()
    ? `<span class="badge">● GLOBAL</span> — everyone who plays competes on this board.`
    : `<span class="badge local">● LOCAL</span> — saved in this browser only. (Ask Shaun to enable the global board.)`;
  $("lbBack").classList.add("show");
  $("lbBody").innerHTML = `<div class="lb-empty">Loading…</div>`;
  const rows = await lbGet(lbMode);
  renderLbTable(rows);
}

function renderLbTable(rows){
  if(!rows || !rows.length){
    $("lbBody").innerHTML = `<div class="lb-empty">No scores yet — be the first.</div>`;
    return;
  }
  const body = rows.slice(0,25).map((r,i) => {
    const you = (r.ts && r.ts===lastSubmittedTs) ? " class=\"you\"" : "";
    const res = r.found
      ? `<span class="ok">✓ ${r.time!=null?r.time+"m":"found"}</span>`
      : `<span class="no">✕ lost</span>`;
    const nm = (r.name||"ANON").replace(/[<>]/g,"");
    return `<tr${you}>
      <td class="rank">${i+1}</td>
      <td class="nm">${nm}</td>
      <td class="res">${res}</td>
      <td class="sc">${(r.score||0).toLocaleString()}</td>
    </tr>`;
  }).join("");
  $("lbBody").innerHTML = `<table class="lb-table">
    <thead><tr><th>#</th><th>Player</th><th>Result</th><th>Score</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function openHowTo(){ $("htpBack").classList.add("show"); }
function closeHowTo(){ $("htpBack").classList.remove("show"); localStorage.setItem("talon_seen_htp","1"); }

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
$("deployDock").addEventListener("click", deploy);
$("newScenario").addEventListener("click", ()=>{ if(state.phase!=="running") newScenario(); });
$("modeSar").addEventListener("click", ()=> setMode("sar"));
$("modeAsw").addEventListener("click", ()=> setMode("asw"));

// mute toggle
function renderMute(){ $("mute").textContent = muted ? "🔇 Sound off" : "🔊 Sound on"; }
$("mute").addEventListener("click", ()=>{
  muted = !muted; localStorage.setItem("talon_mute", muted?"1":"0");
  if(!muted) initAudio();
  renderMute();
});

$("replay").addEventListener("click", ()=>{
  $("modalBack").classList.remove("show");
  $("banner").classList.remove("show");
  state.phase = "plan";
  setDeployEnabled(true); $("newScenario").disabled = false;
  renderPlan();
});
$("nextScenario").addEventListener("click", ()=>{
  $("modalBack").classList.remove("show");
  newScenario();
});

// score submit + leaderboard
$("submitScore").addEventListener("click", submitScore);
$("playerName").addEventListener("keydown", e => { if(e.key==="Enter") submitScore(); });
$("showLb").addEventListener("click", ()=> openLeaderboard(state.mode));
$("lbClose").addEventListener("click", ()=> $("lbBack").classList.remove("show"));
$("lbTabSar").addEventListener("click", ()=> openLeaderboard("sar"));
$("lbTabAsw").addEventListener("click", ()=> openLeaderboard("asw"));
$("lbBack").addEventListener("click", e => { if(e.target===$("lbBack")) $("lbBack").classList.remove("show"); });

// how to play
$("howto").addEventListener("click", openHowTo);
$("howtoInline").addEventListener("click", openHowTo);
$("htpClose").addEventListener("click", closeHowTo);
$("htpStart").addEventListener("click", closeHowTo);
$("htpBack").addEventListener("click", e => { if(e.target===$("htpBack")) closeHowTo(); });

/* ---------------------------------------------------------- *
 *  12. BOOT
 * ---------------------------------------------------------- */
setMode("sar");
renderMute();
// show the rules automatically on a player's first visit
if(!localStorage.getItem("talon_seen_htp")) openHowTo();

})();
