// 検査の道具。ページに読み込んで window.H から使う
window.H = {
  errs: [],
  install(){ if(this._on) return; this._on=true; window.addEventListener("error",e=>H.errs.push(e.message+" @"+(e.lineno||"")));
    window.addEventListener("unhandledrejection",e=>H.errs.push("promise: "+(e.reason&&e.reason.message||e.reason))); },
  clean(){ const ov=document.querySelector(".overlay"); if(ov){ ov.remove(); overlayEl=null; } pendingAlert=null; encounterQueue.length=0; if(pendingEncounter) resolveEncounter("自動"); },
  start(sid, clanName_){
    buildWorld(0, sid||"oke"); bakeMinimap(); rebuildDevOverlay();
    /* 第253巡：同じ名の家が二つある筋書きがある（宇喜多・波多野・山名・加藤…）。城を持つ生きた家を選ぶ */
    const k = clanName_ ? (Object.values(W.clans).find(c=>c.name===clanName_ && !c.dead && Object.values(W.castles).some(x=>x.clan===c.id))
                        || Object.values(W.clans).find(c=>c.name===clanName_ && !c.dead)
                        || Object.values(W.clans).find(c=>c.name===clanName_)) : W.clans[0];
    beginGame(k.id); setSpeed(0); autoBattleMode=true; W.opening=null;
    return k.id;
  },
  run(days){ for(let i=0;i<days;i++){ stepDay(); this.clean(); } },
  // 世の辻褄
  audit(){
    const bad={}; const K=(x)=>{ bad[x]=(bad[x]||0)+1; };
    const live=cl=>!cl.dead&&myCastles(cl.id).length>0;
    for(const c of Object.values(W.castles)){
      if(c.clan!==null&&!W.clans[c.clan]) K("城:家なし");
      if(c.clan===null) K("城:無主");
      if(!isLand(tileAt(W.tile[c.id].c,W.tile[c.id].r))) K("城:海上");
      if(!(c.koku>=0)||!(c.com>=0)||!(c.pop>=0)) K("城:負の数");
      if(!Number.isFinite(c.food)||c.food<0) K("城:兵糧NaN/負");
      if(c.food>foodCap(c)*1.02) K("城:兵糧超過");
      if(c.defense>maxDefense(c)+1) K("城:耐久超過");
      if(c.defense<0) K("城:耐久負");
      if(c.lord!=null&&!W.generals[c.lord]) K("城:城主ghost");
      if(c.lord!=null&&W.generals[c.lord]&&W.generals[c.lord].clan!==c.clan) K("城:城主が他家");
      if(c.lord!=null&&W.generals[c.lord]&&W.generals[c.lord].status==="死亡") K("城:城主が死者");
      if(c.lv<60||c.lv>800) K("城:Lv範囲外");
      if(c.buildings.length>c.slots) K("城:建物超過");
      if(new Set(c.buildings).size!==c.buildings.length) K("城:建物重複");
      if(c.minchu<0||c.minchu>100||c.chian<0||c.chian>100) K("城:民忠治安範囲外");
      if(c.quality.some(q=>q<0||q>100||!Number.isFinite(q))) K("城:兵質範囲外");
      if(!c.neighbors.length) K("城:道なし");
      if(c.koku>kokuCap(c)*1.05) K("城:石高が上限超");
      if(c.pop>popCap(c)*1.05) K("城:人口が上限超");
    }
    const names={}; for(const c of Object.values(W.castles)) names[c.name]=(names[c.name]||0)+1;
    for(const [n,v] of Object.entries(names)) if(v>1) K("城:名の重複");
    for(const g of Object.values(W.generals)){
      if(g.clan!==null&&!W.clans[g.clan]) K("将:家なし");
      if(g.castle!=null&&!W.castles[g.castle]) K("将:城ghost");
      if(g.army&&!W.armies[g.army]) K("将:軍ghost");
      if(g.castle!=null&&W.castles[g.castle]&&g.clan!=null&&W.castles[g.castle].clan!==g.clan&&!g.army&&g.status!=="捕虜"&&g.status!=="死亡") K("将:敵城に在城");
      if(!(g.troops>=0)||!Number.isFinite(g.troops)) K("将:兵NaN");
      if(g.troops>troopCapOf(g)+1 && !(g.army&&W.armies[g.army]&&(W.armies[g.army].script||W.armies[g.army].oke))) K("将:兵が上限超");
      if(g.loyalty<0||g.loyalty>100) K("将:忠誠範囲外");
      if(g.morale<0||g.morale>100) K("将:士気範囲外");
      if(g.status==="家臣"&&g.castle===null&&!g.army) K("将:城のない家臣");
      if(g.status==="大名"&&(g.clan===null||W.clans[g.clan].daimyo!==g.id)) K("将:大名なのに当主でない");
      if(g.status==="捕虜"&&(g.captor==null||!W.clans[g.captor]||W.clans[g.captor].dead)) K("将:捕らえ手のいない捕虜");
      if(g.task&&g.army) K("将:仕事と出陣が同時");
      if(!g.name||/undefined|NaN/.test(g.name)) K("将:名がおかしい");
      if(g.status!=="死亡"&&g.death&&g.death<W.date.y-2&&g.clan!==null) K("将:没年を過ぎて生存");
    }
    for(const a of Object.values(W.armies)){
      if(!W.clans[a.clan]) K("軍:家なし");
      if(!a.gens.length) K("軍:将なし");
      for(const gid of a.gens){ const g=W.generals[gid]; if(!g) K("軍:将ghost"); else if(g.army!==a.id) K("軍:将の紐付け違い"); }
      if(!a.gens.includes(a.commander)) K("軍:大将が名簿にない");
      if(a.target!=null&&!W.castles[a.target]) K("軍:目標ghost");
      if(!Number.isFinite(a.x)||!Number.isFinite(a.y)) K("軍:座標NaN");
      if(a.mission==="包囲"){ const t=W.castles[a.target]; if(t&&t.clan!==null&&!hostile(a.clan,t.clan)) K("軍:敵でない城を包囲"); }
      if(a.food<0||!Number.isFinite(a.food)) K("軍:兵糧NaN");
    }
    for(const cl of Object.values(W.clans)){
      if(!Number.isFinite(cl.money)||cl.money<0) K("家:資金NaN/負");
      if(!live(cl)) continue;
      const d=W.generals[cl.daimyo];
      if(!d) K("家:当主なし"); else if(d.clan!==cl.id) K("家:当主が他家"); else if(d.status!=="大名") K("家:当主の身分が大名でない");
      for(const w of cl.war){ const o=W.clans[w]; if(!o) K("家:戦の相手が消滅"); else if(live(o)&&!o.war.has(cl.id)) K("家:戦の片手落ち"); }
      for(const w of cl.allies){ const o=W.clans[w]; if(!o) K("家:盟の相手が消滅"); else if(live(o)&&!o.allies.has(cl.id)) K("家:盟の片手落ち"); if(cl.war.has(w)) K("家:戦と盟が同時"); }
      for(const v of cl.vassals){ const o=W.clans[v]; if(o&&live(o)&&o.suzerain!==cl.id) K("家:従属の片手落ち"); }
      if(cl.suzerain!==null){ const o=W.clans[cl.suzerain]; if(!o||!live(o)) K("家:主家が消滅"); else if(!o.vassals.has(cl.id)) K("家:主家側に記録なし"); }
      if(bordersOn && cl.id!==W.player && [...cl.war].some(w=>w!==W.player&&W.clans[w]&&live(W.clans[w])&&!bordersOn(cl.id,w)&&!Object.values(W.armies).some(a=>a.clan===cl.id||a.clan===w))) K("家:接していない相手と戦（注意）");
    }
    // 第90巡で足した検め
    for(const cl of Object.values(W.clans)){
      if(cl.dead){ if(myCastles(cl.id).length) K("家:死んだ家に城"); if(Object.values(W.generals).some(g=>g.clan===cl.id&&g.status!=="死亡")) K("家:死んだ家に将"); continue; }
      if(cl.suzerain!==null&&cl.suzerain!==undefined&&cl.vassals.size) K("家:傘下の傘下");
      for(const v of cl.vassals){ if(cl.war.has(v)) K("家:傘下と戦"); if(cl.allies.has(v)) K("家:傘下と盟"); }
      if(cl.suzerain!==null&&cl.suzerain!==undefined&&(cl.war.has(cl.suzerain)||cl.allies.has(cl.suzerain))) K("家:主家と戦か盟");
      if(cl.allies.has(cl.id)||cl.war.has(cl.id)||cl.suzerain===cl.id) K("家:自分と縁");
      for(const [k,v] of Object.entries(cl.truce||{})) if(cl.war.has(+k)&&v>dayNumber()) K("家:休戦中なのに戦");
    }
    const alive={};
    for(const g of Object.values(W.generals)){
      if(g.status!=="死亡") alive[g.name]=(alive[g.name]||0)+1;
      if(g.status==="死亡"&&(g.army||g.task||g.captor!=null)) K("将:死者に軍・仕事・捕らえ手");
      if((g.status==="捕虜"||g.status==="人質")&&(g.army||g.task)) K("将:捕虜に軍か仕事");
      if(g.captor!=null&&g.status!=="捕虜"&&g.status!=="人質"&&g.status!=="死亡") K("将:捕らえ手が残っている");
      if(g.clan!==null&&W.clans[g.clan]&&W.clans[g.clan].dead&&g.status!=="死亡") K("将:死んだ家に属す");
      if(g.birth>W.date.y) K("将:未生まれ");
      if(g.task&&g.task.castle!=null&&W.castles[g.task.castle]&&W.castles[g.task.castle].clan!==g.clan&&g.task.kind!=="親善"&&g.task.kind!=="調略") K("将:他家の城で仕事");
      if(g.task&&!g.task.travel&&g.task.kind!=="配置換え"&&g.castle!==g.task.castle) K("将:仕事の城にいない");
      if(g.status==="大名"&&g.clan!==null&&W.clans[g.clan]&&W.clans[g.clan].daimyo!==g.id) K("将:当主でない大名");
    }
    for(const [n,v] of Object.entries(alive)) if(v>1) K("将:同名が生存");
    for(const c of Object.values(W.castles)){
      if(c.hq&&c.clan===null) K("城:無主の本拠");
      if(c.clan!==null&&W.clans[c.clan]&&W.clans[c.clan].dead) K("城:死んだ家の城");
      if(c.neighbors.some(n=>!W.castles[n])) K("城:隣にghost"); else if(c.neighbors.some(n=>!W.castles[n].neighbors.includes(c.id))) K("城:道の片手落ち");
      if(!Number.isFinite(c.food)||c.food<0) K("城:兵糧NaN/負");
    }
    for(const cl of Object.values(W.clans)){ if(cl.dead) continue; const cs=myCastles(cl.id); if(cs.length&&cs.filter(c=>c.hq).length!==1) K("家:本拠が"+cs.filter(c=>c.hq).length+"つ"); }
    for(const a of Object.values(W.armies)){
      if(a.mission==="包囲"&&W.castles[a.target]&&W.castles[a.target].clan===a.clan) K("軍:自城を包囲");
      if(a.gens.some(id=>W.generals[id]&&W.generals[id].status==="死亡")) K("軍:死者を率いる");
      if(W.clans[a.clan]&&W.clans[a.clan].dead) K("軍:死んだ家の軍");
      if(a.path&&a.path.some(id=>!W.castles[id])) K("軍:道にghost");
    }
    return bad;
  },
  // 15年まわして、年ごとの要約と辻褄を返す
  soak(sid, clan, years){
    this.install(); this.errs.length=0;
    const id=this.start(sid, clan);
    const rows=[]; let audits={};
    for(let y=0;y<years;y++){
      this.run(365);
      const a=this.audit(); for(const [k,v] of Object.entries(a)) audits[k]=(audits[k]||0)+v;
      const live=Object.values(W.clans).filter(c=>!c.dead&&myCastles(c.id).length);
      const mon=live.map(c=>c.money);
      const top=[...live].sort((x,y2)=>myCastles(y2.id).length-myCastles(x.id).length)[0];
      rows.push({y:W.date.y, live:live.length, castles:Object.keys(W.castles).length, gens:Object.keys(W.generals).length,
        moneyM:+(mon.reduce((s,m)=>s+m,0)/1e6).toFixed(2), broke:mon.filter(m=>m<2000).length,
        troops:Object.values(W.generals).filter(g=>g.clan!==null&&g.status!=="死亡").reduce((s,g)=>s+g.troops,0),
        top:top?top.name+" "+myCastles(top.id).length:"—", me:myCastles(id).length});
    }
    return {errs:[...new Set(this.errs)].slice(0,8), audits, rows:rows.filter((_,i)=>i%3===0||i===rows.length-1)};
  },
  // 保存往復で何が変わるか
  saveRound(){
    const before=serialize();
    saveGame(); loadGame();
    const after=serialize();
    const a=JSON.parse(before), b=JSON.parse(after);
    const diff=[];
    for(const k of Object.keys(a)) if(k!=="savedAt"&&JSON.stringify(a[k])!==JSON.stringify(b[k])) diff.push(k);
    return diff;
  },
  // 全ての札を開いて落ちないか
  panels(){
    const out={};
    const c=myCastles(W.player)[0]; const g=Object.values(W.generals).find(x=>x.clan===W.player&&!isChild(x));
    const foe=Object.values(W.castles).find(x=>x.clan!==null&&x.clan!==W.player);
    const tries={
      openCastle:()=>openCastle(c.id), openCastleFoe:()=>openCastle(foe.id), openDispatch:()=>openDispatch(c.id),
      openConscript:()=>openConscript(c.id), openCouncil:()=>openCouncil(c.id), openFound:()=>openFound(c.id),
      openGeneral:()=>openGeneral(g.id), openTransfer:()=>openTransfer(g.id), openAttackFrom:()=>openAttackFrom(foe.id),
      openArmyList:()=>openArmyList(), openPeople:()=>openPeople(), openFinance:()=>openFinance(), openDiplomacy:()=>openDiplomacy(),
      openPolicy:()=>openPolicy(), openConcerns:()=>openConcerns(), openVassals:()=>openVassals(), openShogunate:()=>openShogunate(),
      openChronicle:()=>openChronicle(), openNotices:()=>openNotices(), openStrategist:()=>openStrategist(), openIdle:()=>openIdle(),
      openCourt:()=>openCourt(), openMarriage:()=>openMarriage(), openHelp:()=>openHelp(), openFoodPanel:()=>openFoodPanel(c.id),
      openDelegate:()=>openDelegate(c.id), openRecord:()=>openRecord&&openRecord(), openBattleLog:()=>openBattleLog&&openBattleLog(),
    };
    for(const [n,f] of Object.entries(tries)){ try{ f(); const t=(document.querySelector("#panel")?.innerText||""); if(/undefined|NaN|\[object/.test(t)) out[n]="表示に undefined/NaN"; else out[n]="ok"; closePanel(); }catch(e){ out[n]="ERR "+e.message; } }
    return out;
  },
  // 合戦を実際に回す
  battle(){
    const my=myCastles(W.player)[0];
    const foe=W.castles[my.neighbors.find(n=>W.castles[n].clan!==W.player&&W.castles[n].clan!==null)]||Object.values(W.castles).find(x=>x.clan!==null&&x.clan!==W.player);
    const gens=Object.values(W.generals).filter(g=>g.clan===W.player&&!g.army&&g.castle===my.id&&!isChild(g)&&!g.task).slice(0,4);
    if(!gens.length) return {skip:"no gens"};
    autoBattleMode=false;
    const r=dispatch(my.id,gens.map(g=>g.id),foe.id,0); if(r) return {skip:r};
    const a=W.armies[W.nextArmy-1]; a.mission="包囲"; a.target=foe.id; a.path=[]; a.x=W.tile[foe.id].c; a.y=W.tile[foe.id].r;
    startBattle({army:a.id,foeArmy:null,castle:foe.id,playerAttacks:true});
    if(!B) return {skip:"no B"};
    const t0=B.units.length;
    B.opening=0; renderBattleFoot(); document.getElementById("bAllCharge")?.click();
    let steps=0; while(B&&B.over===null&&steps<30000){ updateBattle(0.016); steps++; }
    const res={units:t0, steps, over:B?B.over:"cleared", sec:B?Math.round(B.elapsed):0};
    try{ drawBattle(); res.draw="ok"; }catch(e){ res.draw="ERR "+e.message; }
    if(B){ try{ finishBattle(); }catch(e){ res.finish="ERR "+e.message; } }
    res.armyAfter=W.armies[a.id]?W.armies[a.id].mission:"消滅";
    autoBattleMode=true;
    return res;
  }
};
"H loaded";
// 人が遊ぶように動かす（人側の道筋を通すため）
H.autoplay=function(days, opts){
  opts=opts||{};
  const me=W.player; const stats={dispatched:0, orders:0, conscripts:0, builds:0, envoys:0, battles:0, captures:0, errs:[]};
  const T=(n,f)=>{ try{ f(); }catch(e){ stats.errs.push(n+": "+e.message); } };
  const origCap=captureCastle; captureCastle=function(cid,clan,a){ if(clan===me) stats.captures++; return origCap(cid,clan,a); };
  for(let d=0; d<days; d++){
    stepDay();
    if(pendingEncounter){ stats.battles++; resolveEncounter("自動"); }
    encounterQueue.length=0; pendingAlert=null;
    if(pendingEnvoy){ stats.envoys++; T("envoy",()=>{ if(typeof answerEnvoy==="function") answerEnvoy(Math.random()<0.5); else pendingEnvoy=null; }); }
    const ov=document.querySelector(".overlay"); if(ov){ ov.remove(); overlayEl=null; }
    if(W.result) break;
    if(d%5!==0) continue;
    const mine=myCastles(me); if(!mine.length) break;
    for(const c of mine){
      // 手空きに内政
      const idle=Object.values(W.generals).filter(g=>g.clan===me&&g.castle===c.id&&!g.army&&!g.task&&!isChild(g)&&g.status!=="捕虜");
      if(idle.length>1){ const g=idle[0]; const job=["新田開発","商業投資","城の強化","施し","軍事訓練"][d/5%5|0]; T("order",()=>{ const r=order(job,g.id,c.id); if(!r) stats.orders++; }); }
      // 徴兵
      if(d%30===0){ const g=idle[1]||idle[0]; if(g) T("conscript",()=>{ const r=conscript(g.id,0,400); if(!r) stats.conscripts++; }); }
      // 建てる
      if(d%60===0 && W.clans[me].money>40000 && c.buildings.length<c.slots) T("build",()=>{ const i=[4,6,8,13][c.buildings.length%4]; const r=order("建設",idle[0]?idle[0].id:null,c.id,i); if(!r) stats.builds++; });
      // 攻める：隣の敵城で守兵がこちらの半分以下
      if(d%20===0 && !opts.peaceful){
        const home=garrisonTroops(c.id);
        for(const n of c.neighbors){
          const o=W.castles[n]; if(!o||o.clan===null||o.clan===me) continue;
          if(!hostile(me,o.clan) && !W.clans[me].war.has(o.clan)){ if(!bordersOn(me,o.clan)) continue; if(Math.random()<0.8) continue; declareWar(me,o.clan); }
          const def=garrisonTroops(n);
          if(home>def*2.2 && home>3000){
            const gens=Object.values(W.generals).filter(g=>g.clan===me&&g.castle===c.id&&!g.army&&!g.task&&!isChild(g)&&g.troops>0).sort((a,b)=>b.troops-a.troops);
            const force=gens.slice(0, Math.max(1, Math.floor(gens.length*0.6))).map(g=>g.id);
            if(force.length<gens.length){ T("dispatch",()=>{ const r=dispatch(c.id,force,n,0); if(!r) stats.dispatched++; }); }
            break;
          }
        }
      }
    }
    // 長い囲みは引き返す
    for(const a of Object.values(W.armies)) if(a.clan===me&&a.mission==="包囲"&&a.siegeDays>150) T("recall",()=>recallArmy(a.id));
  }
  captureCastle=origCap;
  stats.result=W.result; stats.castles=myCastles(me).length; stats.troops=totalTroops(me); stats.money=Math.round(W.clans[me].money);
  return stats;
};
// 手当たり次第に押す（落ちる筋を洗う）
H.fuzz=function(rounds){
  const me=W.player; const errs={}; const E=(n,e)=>{ const k=n+": "+String(e&&e.message||e).slice(0,80); errs[k]=(errs[k]||0)+1; };
  const R=n=>Math.floor(Math.random()*n); const pick=a=>a[R(a.length)];
  W.clans[me].money=Math.max(W.clans[me].money, 400000);
  for(let i=0;i<rounds;i++){
    const mine=myCastles(me); if(!mine.length||W.result) break;
    const c=pick(mine); const all=Object.values(W.castles); const o=pick(all);
    const gens=Object.values(W.generals).filter(g=>g.clan===me&&!g.army&&!g.task&&!isChild(g)&&g.status==="家臣"); const g=pick(gens);
    const k=R(43);
    try{
      switch(k){
        case 0: openCastle(c.id); break;
        case 1: openCastle(o.id); break;
        case 2: if(g) order(pick(["新田開発","商業投資","城の強化","軍事訓練","施し","検地","治水","鉱山探し","人材登用"]),g.id,c.id); break;
        case 3: upgradeCastle(c.id); break;
        case 4: if(g) order("建設",g.id,c.id,R(BUILDINGS.length)); break;
        case 5: if(g) conscript(g.id,R(4),500); break;
        case 6: if(o.clan!=null&&o.clan!==me) diplomacy(pick(["贈物","同盟","停戦","威圧","資金要請","同盟破棄","和睦金"]),me,o.clan); break;
        case 7: if(o.clan!==me) spyOn(o.id); break;
        case 8: if(o.clan!=null&&o.clan!==me) doSubvert(o.id); break;
        case 9: { const st=buildSites(c.id); if(st.length) foundCastle(c.id,R(st.length)); } break;
        case 10: openCouncil(c.id); break;
        case 11: c.delegate = R(2)?null:R(5); break;
        case 12: for(let d=0;d<5;d++){ stepDay(); this.clean(); } break;
        case 13: openPeople(); break;
        case 14: { const gs=gens.slice(0,1+R(3)).map(x=>x.id); const n=pick(c.neighbors); if(gs.length&&n!==undefined) dispatch(c.id,gs,n,R(2)); } break;
        case 15: { const a=pick(Object.values(W.armies).filter(x=>x.clan===me)); if(a) recallArmy(a.id); } break;
        case 16: { const a=pick(Object.values(W.armies).filter(x=>x.clan===me)); if(a) disbandArmy(a); } break;
        case 17: if(g) giveReward(g.id,pick([3000,8000])); break;
        case 18: if(g){ const o2=pick(mine); transferGeneral(g.id,o2.id); } break;
        case 19: buyFood(c.id,1000); break;
        case 20: sellFood(c.id,500); break;
        case 21: { const o2=pick(mine); moveFood(c.id,o2.id,300); } break;
        case 22: { const nb=[...adjacentClans(me)]; if(nb.length) proposeMarriage(pick(nb)); } break;
        case 23: { const nb=[...adjacentClans(me)]; if(nb.length) sendHostage(pick(nb)); } break;
        case 24: doPolicy(R(POLICIES.length)); break;
        case 25: if(g) appointStrategist(g.id); break;
        case 26: { const r=pick(Object.values(W.generals).filter(x=>x.clan===null&&x.status!=="死亡")); if(r&&g) hireRonin(g.id,R(4),300); } break;
        case 27: if(c.buildings.length) demolish(c.id,c.buildings[0]); break;
        case 28: { const cap=pick(Object.values(W.generals).filter(x=>x.status==="捕虜"&&x.captor===me)); if(cap) handleCaptive(cap.id,pick(["登用","解放","身代金","斬首"])); } break;
        case 29: { const a=pick(Object.values(W.armies).filter(x=>x.clan===me&&x.mission==="包囲")); if(a) a.mode=R(2); } break;
        case 30: { openGather(c.id); const others=mine.filter(x=>x.id!==c.id); gatherSel=new Set(others.slice(0,2).map(x=>x.id)); doGather(c.id); } break;
        case 31: { const vs=[...W.clans[me].vassals]; if(vs.length){ const v=pick(vs); openVassalAttack(v); const t=pick([...adjacentClans(v)]); if(t!==undefined) vassalAttack(v,t); vassalOrder(v,pick(["貢","兵"])); } } break;
        case 32: { const a=pick(Object.values(W.armies).filter(x=>x.clan===me)); if(a){ openArmy(a.id); retarget(a.id,o.id); } } break;
        case 33: { const a=pick(Object.values(W.armies).filter(x=>x.clan!==me)); if(a) openFoeArmy(a.id); } break;
        case 34: { sallyOut(c.id); toggleHoldOut(c.id); } break;
        case 35: { if(g) hireRonin(g.id,R(4),300); if(g) switchArm(g.id,R(4)); } break;
        case 36: { openSuccession(); if(g) handOver(g.id); } break;
        case 37: { if(g) grantRank(g.id); donate(5000,8); } break;
        case 38: { if(o.clan!=null&&o.clan!==me) issueSubjugation(o.clan); openShogunate&&openShogunate(); } break;
        case 39: { openStanding(); openChronicle(); openBattleLog(); openFinance(); openMarriage(); openVassals(); openStrategist(); openCourt(); openRecord(); openCastleList(); openOfficers(); openIdle(); openConcerns(); openDiplomacy(); openPolicy(); openHelp(); openGuide(); openLegend(); openNotices(); openSearch(); } break;
        case 40: { skipToEvent(); } break;
        case 41: { if(g) openGeneral(g.id); if(g) openTransfer(g.id); openFoodPanel(c.id); openArms(c.id); openRelief(c.id); openHelpRequest(c.id); openConscript(c.id); openDispatch(c.id); openFound(c.id); openAttackFrom(o.id); openDelegate(c.id); } break;
        case 42: { const x=W.tile[c.id]; showMapTip&&showMapTip(100,100); hideMapTip&&hideMapTip(); pickAt&&pickAt(200,200); } break;
      }
      closePanel();
      const ov=document.querySelector(".overlay"); if(ov){ ov.remove(); overlayEl=null; }
      pendingEnvoy=null;
    }catch(e){ E("k"+k,e); }
  }
  return {errs, castles:myCastles(me).length, date:{...W.date}, audit:this.audit()};
};
