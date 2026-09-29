/* 第253巡（作り手：俺みたいにテストプレイして、バグを見つけて報告してくれる bot）
   遊び手のように遊び、おかしな所を拾って「報告」として返す。
   window.__K = {sc:"nagashino", clan:"織田家", days:240, seed:1, battles:24}  （省略可。省くと筋書きを選ぶ）*/
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const CFG=Object.assign({days:200, seed:Date.now()%99991, battles:20}, (window.__K||{}));
let seed=CFG.seed||7; const rr=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
const pick=a=>a[Math.floor(rr()*a.length)];

const F=[]; const seen=new Set();
var uxEvents=0;   /* 第253巡：log/toast の包みより先に置く（「Cannot access uxEvents before initialization」で問いが落ちていた） */
function found(kind, title, detail, fix){ try{ if(PS) detail="【"+PS.name+"】"+(detail||""); }catch(_){ } const k=kind+"|"+title; if(seen.has(k)) return; seen.add(k); F.push({kind, title, fix:String(fix||""), detail:String(detail||"").slice(0,260), when:W&&W.date?`${W.date.y}年${W.date.m}月${W.date.d}日`:"", sc:(W&&W.scenario)||"", stage:(W&&W.stage&&W.stage.key)||""}); }

H.install(); localStorage.clear();
localStorage.setItem('sengoku_lang','ja'); localStorage.setItem('sengoku_guide_done','1'); localStorage.setItem('sengoku_msim_done','1'); localStorage.setItem('sengoku_nag_tut','1');
window.addEventListener('error', e=>found("落ちた","画面が落ちる例外", (e.message||"")+" @"+(e.lineno||"")));
window.addEventListener('unhandledrejection', e=>found("落ちた","処理されない失敗", (e.reason&&e.reason.message)||String(e.reason)));
console.error=(...a)=>{ const t=String(a[0]&&a[0].stack||a[0]); if(/Error|error/.test(t)) found("落ちた","裏で出た例外", t.slice(0,200)); };

/* 文の粗（undefined・NaN・[object・空の名）を拾う */
const BAD=/undefined|NaN|\[object|null年|null月|、、|――――/;
const ODD=/起きなかった（|将が足りぬ|隊が見つからぬ/;   /* 「九州征伐は起きなかった（島津が降った）」のような筋書きの分かれ道は不具合ではない。拾うのは「将が足りぬ」で流れた戦だけ */   /* 断りの言葉（〜おりませぬ・足りませぬ）は不具合ではないので拾わない */
var lastGood=-999, lastGoodT=null;   /* 第254巡（作り手：人の気持ちを拾えるように）：最後に「良い報せ」が出た日 */
{ const ol=window.log; window.log=function(t,k,f){ try{ uxEvents++; if(typeof t==="string"){
  if(k==="growth"||/開城|平定|滅亡|勝ち|勝利|完了|成りました|加わりました|結びました/.test(t)){ try{ lastGood=dayNumber(); lastGoodT=t.slice(0,40); }catch(_){ } }
  /* 第254巡：城の名が出た知らせを控える（囲まれた・落ちた・開いた）。これがあれば「知らせも無く」ではない */
  { try{ for(const c of Object.values(W.castles)) if(c.name && t.indexOf(c.name)>=0){ warnedC[c.id]=dayNumber();
      /* 第257巡：次に「知らせも無く城を失った」が出た時に何が告げられていたか分かるよう、控えを残す */
      (warnedLog[c.id]=warnedLog[c.id]||[]).push(dayNumber()+"日「"+t.slice(0,34)+"」"); if(warnedLog[c.id].length>4) warnedLog[c.id].shift(); } }catch(_){ } }
    if(BAD.test(t)) found("文の粗","記録の文がおかしい", t.slice(0,120));
    if(HARSH.test(t)) found("不快","遊び手を責める言い回し", t.slice(0,80), "咎めずに、事実と次の手だけを書く");
    else if(ODD.test(t) && !/（IF|\(IF/.test(t)) found("起きない","起こるはずの事が起きていない", t.slice(0,120));
    if(t.length>140) found("使いづらい","記録の一行が長すぎる（読み切れない）", t.slice(0,140)+"…");
    const inB=(typeof B!=="undefined"&&B&&B.over===null);
    const bid=inB?(B._botId||0):0;   /* 第253巡：合戦をまたいで数えていた（合戦ごとに刻は0に戻る） */
    const clock=inB?B.elapsed:(W&&W.date?dayNumber():0), win=inB?25:5, lim=inB?6:4, unit=inB?"秒":"日";
    const e=seenLog[t];
    if(e&&e.inB===inB&&e.bid===bid&&clock-e.at<=win){ e.n++; if(e.n===lim) found("使いづらい","同じ報せが何度も出る", t.slice(0,90)+`（${e.n}回／${win}${unit}のうち）`); }
    else seenLog[t]={at:clock,n:1,inB,bid};
  } }catch(_){ } return ol.apply(this,arguments); }; }
{ const ot=window.toast; if(ot) window.toast=function(t){ try{ uxEvents++; if(typeof t==="string"){
    if(BAD.test(t)) found("文の粗","報せの文がおかしい", t.slice(0,120));
    if(/ませぬ|できません|足りません/.test(t)){ const d0=(W&&W.date)?dayNumber():0; refused++; if(d0!==lastRefuseDay){ lastRefuseDay=d0; refusedDays++; }
      if(t.length<26 && !/されよ|ください|まず|には|ゆえ|から|なら|要り|最中|まだ|ため|おりませぬ|足りませぬ/.test(t))
        found("使いづらい","断られたのに、どうすればよいか書いていない", t.slice(0,60), "「〜ゆえ、〜されよ」と次の道を添える"); }
    if(HARSH.test(t)) found("不快","遊び手を責める言い回し", t.slice(0,80), "咎めずに、事実と次の手だけを書く");
  } }catch(_){ } return ot.apply(this,arguments); }; }
{ const ob=window.bigNews; if(ob) window.bigNews=function(t){ try{ if(typeof t==="string"&&BAD.test(t)) found("文の粗","大きな報せの文がおかしい", t.slice(0,120)); }catch(_){ } return ob.apply(this,arguments); }; }


/* ===== 使い心地を見る目（UI/UX） =====
   第253巡（作り手の指示：遊び手が不快に感じない所まで見る bot に）。
   落ちるか・辻褄が合うかだけでなく、「読めるか・押せるか・待たされないか・
   責められないか・迷わないか」を人の目のかわりに見る。 */
const HARSH=/愚か|無能|馬鹿|阿呆|間抜け|失格|情けない/;
function uxOnTop(el){   /* 第253巡：別の札や幕が上に重なっている物は、押せる所として数えない */
  try{ const r=el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    if(cx<0||cy<0||cx>innerWidth||cy>innerHeight) return true;
    const t=document.elementFromPoint(cx,cy);
    return !t || t===el || el.contains(t) || t.contains(el);
  }catch(_){ return true; }
}
function uxVisible(el){
  if(!el||!el.getBoundingClientRect||!el.isConnected||el.hidden) return false;
  const cs=getComputedStyle(el);
  if(cs.display==="none"||cs.visibility==="hidden"||parseFloat(cs.opacity||"1")<0.08) return false;
  if(cs.pointerEvents==="none") return false;   /* 第253巡：触れない札は「押せる所」に数えない */
  const r=el.getBoundingClientRect();
  return r.width>0.5 && r.height>0.5;
}
function uxRGB(s){ const m=String(s||"").match(/rgba?\(([^)]+)\)/); if(!m) return null;
  const p=m[1].split(",").map(x=>parseFloat(x)); if(p.length>3&&p[3]<0.12) return null; return [p[0],p[1],p[2]]; }
function uxLum(c){ const f=v=>{ v=Math.max(0,Math.min(255,v))/255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); }
function uxRGBA(s){ const m=String(s||"").match(/rgba?\(([^)]+)\)/); if(!m) return null;
  const p=m[1].split(",").map(x=>parseFloat(x)); return [p[0],p[1],p[2], p.length>3?p[3]:1]; }
function uxBg(el){   /* 半透明の重ねを、下の色と混ぜて見る（小札の色をそのまま読んで「薄い」と言っていた） */
  const layers=[]; let e=el;
  for(let i=0;i<12&&e;i++){ const cs=getComputedStyle(e);
    const gi=String(cs.backgroundImage||"");   /* ぼかしの帯（gradient）は色が backgroundColor に出ない */
    if(/gradient/.test(gi)){ const ms=gi.match(/rgba?\([^)]+\)/g);
      if(ms&&ms.length){ const cs2=ms.map(uxRGBA).filter(Boolean);
        if(cs2.length){ const n=cs2.length; layers.push([cs2.reduce((s2,c)=>s2+c[0],0)/n, cs2.reduce((s2,c)=>s2+c[1],0)/n, cs2.reduce((s2,c)=>s2+c[2],0)/n, 1]); e=e.parentElement; continue; } } }
    const c=uxRGBA(cs.backgroundColor); if(c&&c[3]>0.01) layers.push(c); e=e.parentElement; }
  let out=[14,16,22];
  for(let i=layers.length-1;i>=0;i--){ const c=layers[i], a=Math.min(1,c[3]);
    out=[c[0]*a+out[0]*(1-a), c[1]*a+out[1]*(1-a), c[2]*a+out[2]*(1-a)]; }
  return out;
}
function uxRatio(a,b){ const l1=uxLum(a), l2=uxLum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }
function uxText(el){ return ((el&&el.textContent)||"").replace(/\s+/g," ").trim(); }
function uxFloating(el){ let e=el; for(let i=0;i<6&&e;i++){ const q=getComputedStyle(e).position; if(q==="sticky"||q==="fixed"||q==="absolute") return true; e=e.parentElement; } return false; }
function uxInScroll(el){   /* 巻物（送って見る一覧・帯）の中なら、画面の外にあって当たり前 */
  let e=el.parentElement;
  for(let i=0;i<10&&e;i++){ const cs=getComputedStyle(e);
    if(/auto|scroll/.test(cs.overflowY+cs.overflow) && e.scrollHeight>e.clientHeight+4) return true;
    /* 第257巡：横に送る帯（合戦の下の帯）も同じ。送れば出てくる */
    if(/auto|scroll/.test(cs.overflowX+cs.overflow) && e.scrollWidth>e.clientWidth+4) return true;
    e=e.parentElement; }
  return false;
}
/* 第255巡（作り手：iPad だと良いのに携帯だと色々でかすぎる、を bot に気づかせて）
   狭い画面（iPhone の幅）で、はみ出し・大きすぎ・高すぎ・重なりを見張る */
/* 第256巡：五人の試遊者。PERSONA で性格を切り替える（無ければ今までどおり） */
var PS = (()=>{ try{ const k=(window.__PERSONA||""); return (window.PERSONAS&&window.PERSONAS[k])||null; }catch(_){ return null; } })();
function psName(){ return PS?PS.name:"bot"; }
var mobSeen={};
/* 第255巡（作り手：UI/UX は Apple HIG・Material 3・デジタル庁デザインシステムに従う）
   数値の下限：押せる所 44px／文字 14px 未満なし（本文は16px）／行高1.5／コントラスト4.5:1 */
var gSeen={};
function lum(c){ const m=String(c).match(/[\d.]+/g); if(!m) return null; const f=x=>{ x=x/255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4); };
  return 0.2126*f(+m[0])+0.7152*f(+m[1])+0.0722*f(+m[2]); }
function bgOf(el){ let e=el; while(e && e!==document.documentElement){ const c=getComputedStyle(e).backgroundColor; const m=String(c).match(/[\d.]+/g);
    if(m && (m.length<4 || +m[3]>0.55)) return c; e=e.parentElement; } return "rgb(18,16,14)"; }
function auditRules(where){
  try{
    const once=(k,fn)=>{ if(gSeen[k]) return; gSeen[k]=1; fn(); };
    const nm=el=>{ const t=(el.textContent||"").trim().replace(/\s+/g," ").slice(0,16); return t||el.id||String(el.className||el.tagName).slice(0,16); };
    const els=[...document.querySelectorAll("#topbar *, #bhead *, #bfoot *, #panel *, .dialog *, .overlay *, #start *, #moreMenu *")]
      .filter(e=>e.getClientRects().length && (e.children.length===0) && (e.textContent||"").trim().length>0).slice(0,90);
    for(const el of els){
      const st=getComputedStyle(el); const fs=parseFloat(st.fontSize)||0; const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0) continue;
      /* 一．十四px 未満の字は使わない（デジタル庁） */
      if(fs>0 && fs<14) once("fs14|"+nm(el)+"|"+Math.round(fs),()=>found("決まりに反する","字が十四pxより小さい（デジタル庁の下限）",
        `${where}：「${nm(el)}」${fs.toFixed(1)}px`, "十四px以上に（本文とUIは十六pxが基準）"));
      /* 二．行高は一.五倍以上（本文の長さがある時） */
      const lh=parseFloat(st.lineHeight)||0;
      if(fs>=14 && lh>0 && lh < fs*1.45 && (el.textContent||"").trim().length>24) once("lh|"+nm(el),()=>found("決まりに反する","行の高さが文字の一.五倍に足りない",
        `${where}：「${nm(el)}」${fs.toFixed(0)}px に対し行高 ${lh.toFixed(0)}px`, "本文の行高は一.五倍以上に"));
      /* 三．色の対比は 4.5:1 以上 */
      let grad=false; { let e2=el; for(let k=0;k<4&&e2;k++){ const bi=getComputedStyle(e2).backgroundImage; if(bi&&bi!=="none"){ grad=true; break; } e2=e2.parentElement; } }
      const l1=grad?null:lum(st.color), l2=grad?null:lum(bgOf(el));
      if(l1!==null && l2!==null){ const hi=Math.max(l1,l2), lo=Math.min(l1,l2); const ratio=(hi+0.05)/(lo+0.05);
        if(ratio<4.5 && (el.textContent||"").trim().length>2 && fs<24) once("ct|"+nm(el),()=>found("決まりに反する","文字と背景の対比が 4.5:1 に足りない",
          `${where}：「${nm(el)}」${ratio.toFixed(1)}:1（${st.color} の上に ${bgOf(el)}）`, "色を明るく（または背景を暗く）して 4.5:1 以上に")); }
    }
    /* 四．押せる所は 44×44 px 以上（Apple HIG／Material 3） */
    const vis=(el)=>{ try{ const r=el.getBoundingClientRect(); const W0=innerWidth,H0=innerHeight;
      if(r.right<=0||r.bottom<=0||r.left>=W0||r.top>=H0) return false;
      const x=Math.min(W0-2,Math.max(2,(r.left+r.right)/2)), y=Math.min(H0-2,Math.max(2,(r.top+r.bottom)/2));
      const top=document.elementFromPoint(x,y); return !!(top && (top===el || el.contains(top) || top.contains(el))); }catch(_){ return true; } };
    for(const b of document.querySelectorAll("button, a[href], input, select, textarea, [onclick], [role=button]")){
      if(b.closest("#moreMenu")) continue;   /* 畳んだ menu の控えは数えない */
      if(!b.getClientRects().length) continue;
      const r=b.getBoundingClientRect(); if(r.width<=0||r.height<=0) continue;
      if(!vis(b)) continue;
      if(r.height<44 || r.width<44) once("tap|"+nm(b)+"|"+Math.round(r.width)+"x"+Math.round(r.height),()=>found("決まりに反する","押せる所が 44px に足りない",
        `${where}：「${nm(b)}」${Math.round(r.width)}×${Math.round(r.height)}`, "四十四px以上に（指で押せる大きさ）"));
    }
  }catch(_){ }
}
function auditMobile(where){
  try{
    const W0=window.innerWidth, H0=window.innerHeight;
    if(W0>500) return;
    const once=(k,fn)=>{ if(mobSeen[k]) return; mobSeen[k]=1; fn(); };
    /* いま本当に画面に見えている物だけを見る（閉じた menu の控えや、裏に隠れた物は数えない） */
    const shown=(el)=>{ try{ const r=el.getBoundingClientRect();
      if(r.right<=0||r.bottom<=0||r.left>=W0||r.top>=H0) return false;
      const x=Math.min(W0-2,Math.max(2,(r.left+r.right)/2)), y=Math.min(H0-2,Math.max(2,(r.top+r.bottom)/2));
      const top=document.elementFromPoint(x,y); return !!(top && (top===el || el.contains(top) || top.contains(el)));
    }catch(_){ return true; } };
    const nm=el=>{ const t=(el.textContent||"").trim().replace(/\s+/g," ").slice(0,18); return t||el.id||String(el.className||el.tagName).slice(0,18); };
    /* 一．横にはみ出して、画面が横に動く */
    const de=document.documentElement;
    if(de.scrollWidth>W0+2) once("sx|"+where,()=>found("携帯で崩れる","横にはみ出して画面が横に動く",
      `${where}：中身の幅 ${de.scrollWidth} ／画面 ${W0}`, "幅は画面に収める（max-width:100%・折り返す）"));
    /* 二．要素ごと：画面の外・字が大きすぎ・釦が画面を埋める */
    const scope=[...document.querySelectorAll("#topbar>*, #bhead>*, #bfoot>*, #panel .p-body>*, .dialog>*, .dialog .grid>*, #start .s-actions>*, #start h1, #start .s-lead")];
    for(const el of scope){
      if(!el.getClientRects().length) continue;
      const r=el.getBoundingClientRect(); if(r.width<=0||r.height<=0) continue;
      if(!shown(el)) continue;
      if(r.right>W0+2||r.left<-2) once("ov|"+where+"|"+nm(el),()=>found("携帯で崩れる","画面の外にはみ出している",
        `${where}：「${nm(el)}」が ${Math.round(r.left)}〜${Math.round(r.right)}（画面 ${W0}）`, "画面の幅に収める"));
      const fs=parseFloat(getComputedStyle(el).fontSize)||0;
      const txt=(el.textContent||"").trim();
      if(fs>30 && txt.length>8 && el.children.length===0) once("fs|"+where+"|"+nm(el),()=>found("携帯で崩れる","字が大きすぎる（携帯）",
        `${where}：「${nm(el)}」が ${Math.round(fs)}px`, "携帯では字を小さく（clamp で画面幅に合わせる）"));
      if(r.height>H0*0.42 && el.tagName==="BUTTON") once("bg|"+where+"|"+nm(el),()=>found("携帯で崩れる","釦が画面を埋めている",
        `${where}：「${nm(el)}」が高さ ${Math.round(r.height)}（画面 ${H0}）`, "釦の高さを抑える"));
    }
    /* 三．札が画面より高く、釦に届かない */
    for(const d of document.querySelectorAll(".dialog")){
      if(!d.getClientRects().length) continue;
      const r=d.getBoundingClientRect(); const st=getComputedStyle(d);
      const scroller=(()=>{ let e2=d.parentElement; for(let k=0;k<3&&e2;k++){ if(/auto|scroll/.test(getComputedStyle(e2).overflowY)) return true; e2=e2.parentElement; } return false; })();
      if(r.height>H0-6 && !/auto|scroll/.test(st.overflowY) && !scroller) once("dh|"+where,()=>found("携帯で崩れる","札が画面より高く、下の釦に届かない",
        `${where}：札の高さ ${Math.round(r.height)}（画面 ${H0}）`, "札は送れるようにする（overflow-y:auto）か、中身を減らす"));
      if(r.bottom>H0+2 && /auto|scroll/.test(st.overflowY)===false && !scroller) once("db|"+where,()=>found("携帯で崩れる","札の下が画面の外に出ている",
        `${where}：札の下端 ${Math.round(r.bottom)}（画面 ${H0}）`, "札を画面の中に収める"));
    }
    /* 四．合戦：帯が画面を食う／野が狭い */
    if(typeof B!=="undefined" && B && B.over===null){
      const f=document.getElementById("bfoot"), h=document.getElementById("bhead"), cv=document.getElementById("bcanvas");
      if(f&&f.getClientRects().length){ const r=f.getBoundingClientRect();
        if(r.height>H0*0.26) once("fh",()=>found("携帯で崩れる","下の帯が画面の四分の一より大きい",
          `合戦：帯の高さ ${Math.round(r.height)}（画面 ${H0}）`, "携帯では釦を小さく、折り返しを減らす")); }
      if(cv&&cv.getClientRects().length){ const r=cv.getBoundingClientRect(); const hh=h?h.getBoundingClientRect().height:0; const fh=f?f.getBoundingClientRect().height:0;
        if(r.height<(H0-hh-fh)*0.8) once("cv",()=>found("携帯で崩れる","野が狭い（帯に押されている）",
          `合戦：野の高さ ${Math.round(r.height)}／使える高さ ${Math.round(H0-hh-fh)}`, "野を広く取る")); }
    }
    /* 五．押せるもの同士が重なっている */
    const btns=[...document.querySelectorAll("#topbar button, #bfoot button, .dialog button, #start button")].filter(b=>b.getClientRects().length).slice(0,28);
    const vis1=btns.map(b=>shown(b));   /* 見えているかは一度だけ調べる（毎回調べると遅くて巡回が止まる） */
    for(let i=0;i<btns.length;i++) for(let j=i+1;j<btns.length;j++){
      const a=btns[i].getBoundingClientRect(), b=btns[j].getBoundingClientRect();
      const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left), oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      const sticky=(el)=>{ let e2=el; for(let k=0;k<4&&e2;k++){ const ps=getComputedStyle(e2).position; if(ps==="sticky"||ps==="fixed") return true; e2=e2.parentElement; } return false; };
      const both=vis1[i]&&vis1[j]&&!(sticky(btns[i])||sticky(btns[j]));   /* 貼り付く帯の上を通っただけ、は重なりではない */
      if(ox>6&&oy>6&&both) once("lap|"+where+"|"+nm(btns[i])+"|"+nm(btns[j]),()=>found("携帯で崩れる","押せる釦どうしが重なっている",
        `${where}：「${nm(btns[i])}」と「${nm(btns[j])}」が ${Math.round(ox)}×${Math.round(oy)} 重なる`, "並びを折り返すか、間を空ける"));
    }
  }catch(_){ }
}
/* 第256巡（作り手：遊びやすく・見やすくをモットーに）
   画面ぜんたいの具合を数で測る。横持ちの携帯で、
   ・見たい所（地図／戦場）が画面の何割か
   ・上下の帯や浮いた札が何割を覆っているか
   ・親指の届く端に、主な操作があるか */
var scrSeen={};
function auditScreen(where){
  try{
    const W0=innerWidth, H0=innerHeight;
    if(W0>1000) return;                      /* 携帯だけ見る */
    const area=W0*H0;
    const once=(k,fn)=>{ if(scrSeen[k]) return; scrSeen[k]=1; fn(); };
    const rectOf=(el)=>{ const r=el.getBoundingClientRect();
      return {x0:Math.max(0,r.left), y0:Math.max(0,r.top), x1:Math.min(W0,r.right), y1:Math.min(H0,r.bottom)}; };
    const areaOf=(el)=>{ const r=rectOf(el); const w=r.x1-r.x0, h=r.y1-r.y0; return (w>0&&h>0)?w*h:0; };
    const inBattle=(typeof B!=="undefined"&&B&&B.over===null);
    const main=document.getElementById(inBattle?"bcanvas":"map");
    if(!main||!main.getClientRects().length) return;
    const mainA=areaOf(main);
    /* 覆っている物（常に出ている帯・浮いた札） */
    const covers=[...document.querySelectorAll("#topbar,#bhead,#bfoot,#mSim,#pSim,#adviser,#bCoach,#noteStack,#feed,#minimap,#leftRail,#rightRail")]
      .filter(e=>e.getClientRects().length);
    let coverA=0; const parts=[];
    for(const e of covers){ const a=areaOf(e); if(a>0){ coverA+=a; parts.push((e.id||e.className)+":"+Math.round(a/area*100)+"%"); } }
    const mainPct=Math.round(mainA/area*100), coverPct=Math.round(coverA/area*100);
    if(mainPct<75) once("main|"+where,()=>found("見やすさ","見たい所が画面の四分の三に満たない",
      `${where}：${inBattle?"戦場":"地図"} ${mainPct}%／覆い ${coverPct}%（${parts.slice(0,5).join(" ")}）`,
      "帯を低く、浮いた札を小さく・隅へ"));
    if(coverPct>22) once("cover|"+where,()=>found("見やすさ","帯と浮いた札が画面の二割近くを覆っている",
      `${where}：覆い ${coverPct}%（${parts.slice(0,5).join(" ")}）`, "常に出す物を減らす（必要な時だけ出す）"));
    /* 親指の届く所（横持ちでは左右の端の下半分）に主な操作があるか */
    if(W0>H0){
      const zoneW=W0*0.28, zoneY=H0*0.35;
      const btns=[...document.querySelectorAll("#bfoot button,#rightRail button,#leftRail button,#topbar button")].filter(b=>b.getClientRects().length);
      const near=btns.filter(b=>{ const r=b.getBoundingClientRect(); const cx=(r.left+r.right)/2, cy=(r.top+r.bottom)/2;
        return cy>zoneY && (cx<zoneW || cx>W0-zoneW); });
      if(btns.length>=3 && near.length===0) once("thumb|"+where,()=>found("遊びやすさ","横持ちで、親指の届く端に操作が一つも無い",
        `${where}：釦 ${btns.length}個のうち、左右の端の下半分にあるのは 0`, "主な操作は左右の端（親指の下）に置く"));
    }
  }catch(_){ }
}
function auditUX(where){
  try{ auditScreen(where); }catch(_){ }
  try{ auditMobile(where); }catch(_){ }
  try{ auditRules(where); }catch(_){ }
  try{
    { const p0=document.getElementById("panel");   /* 札が滑り込んでいる最中は、位置を見ても意味がない */
      if(p0){ const tf=getComputedStyle(p0).transform; if(tf&&tf!=="none"&&!/matrix\(1, 0, 0, 1, 0, 0\)/.test(tf)) return; } }
    const VW=window.innerWidth||1280, VH=window.innerHeight||720;
    if(document.documentElement.scrollWidth>VW+6)
      found("使いづらい","画面が横にはみ出している（横に振らないと読めない）",
            `${where}：中身 ${document.documentElement.scrollWidth}px ／ 画面 ${VW}px`,
            "札の幅を画面に合わせる（折り返しと max-width）");
    for(const ov of document.querySelectorAll(".overlay")){
      if(!uxVisible(ov)) continue;
      const ttl=uxText(ov.querySelector("h3")||ov).slice(0,24);
      const btns=[...ov.querySelectorAll("button,.chip,.big,[onclick]")].filter(uxVisible);
      if(!btns.length) found("詰まり","窓に押せる手が一つも無い（閉じられない）", `${where}：${ttl}`, "どの窓にも「閉じる／次へ」を一つ置く");
      const names={};
      for(const b of btns){ let t=(b.getAttribute("aria-label")||uxText(b)).slice(0,24); if(!t) continue;
        /* 第253巡：行ごとに同じ名の釦が並ぶ表（清洲の領地の分け前）は、行が違えば別物として数える */
        try{ const d=b.dataset||{}; const key=[d.lot,d.to,d.sec,d.side].filter(Boolean).join("/"); if(key) t=t+"["+key+"]"; }catch(_){ }
        names[t]=(names[t]||0)+1;
        if(names[t]===2) found("使いづらい","同じ名の釦が一つの窓に二つある（どちらを押すか迷う）", `${where}：${ttl}／「${t}」`, "名を分けるか、一つにまとめる"); }
    }
    const roots=[...document.querySelectorAll(".overlay, #panel, #bfoot, #bhead, #topbar")].filter(uxVisible);
    const els=[]; for(const r of roots){ els.push(r); for(const e of r.querySelectorAll("*")) els.push(e); }
    const clicks=[]; let n=0;
    for(const el of els){
      if(n++>1600) break;
      if(!uxVisible(el)) continue;
      const cs=getComputedStyle(el), r=el.getBoundingClientRect(), t=uxText(el);
      const pp=el.parentElement;
      /* 本当に押せる物だけを釦と数える（指の形は受け継がれる。飾りの小札まで釦に見えていた） */
      const clickable=/^(BUTTON|A|SELECT|INPUT|TEXTAREA|SUMMARY)$/.test(el.tagName)||el.hasAttribute("onclick")||typeof el.onclick==="function";
      if(clickable && uxOnTop(el)){
        clicks.push([el,r,t]);
        if(r.height<24||r.width<24)
          found("使いづらい","押せる所が小さすぎて狙えない",
                `${where}：「${t.slice(0,16)||"（名なし）"}」${Math.round(r.width)}×${Math.round(r.height)}px［${el.tagName}.${String(el.className||"").slice(0,20)}${el.id?"#"+el.id:""}／親 ${pp?pp.tagName+"."+String(pp.className||"").slice(0,16)+(pp.id?"#"+pp.id:""):"-"}］`,
                "指で押せる大きさ（縦二十八px以上）にする");
        if(!t && !el.getAttribute("aria-label") && !el.getAttribute("title") && !el.querySelector("img,svg,canvas"))
          found("使いづらい","何の釦か分からない（名も説明も無い）", `${where}：${el.id||el.className||el.tagName}`, "名を入れるか title を添える");
        if((r.right<2||r.left>VW-2||r.bottom<2||r.top>VH-2) && !uxInScroll(el))
          found("使いづらい","押せる所が画面の外に出ている", `${where}：「${t.slice(0,16)}」`, "狭い画面でも画面の内に収める");
      }
      if(!el.children.length && t){
        const fs=parseFloat(cs.fontSize)||14;
        if(fs<10.5) found("使いづらい","文字が小さすぎて読めない", `${where}：「${t.slice(0,18)}」${fs.toFixed(1)}px［${el.tagName}.${String(el.className||"").slice(0,24)}］`, "十一px以上にする");
        const fg=uxRGB(cs.color);
        if(fg && fs<22){ const cr=uxRatio(fg, uxBg(el));
          if(cr<2.4) found("使いづらい","文字が薄くて読みにくい", `${where}：「${t.slice(0,18)}」明暗の比 ${cr.toFixed(1)}［${el.tagName}.${String(el.className||"").slice(0,24)}］`, "小さい字ほど濃く（比四・五以上）"); }
        if(el.scrollWidth>el.clientWidth+6 && /hidden|clip/.test(cs.overflow+cs.overflowX) && t.length>6)
          found("使いづらい","文字が切れて最後まで読めない", `${where}：「${t.slice(0,22)}…」`, "折り返すか札を広げる");
      }
    }
    /* 第253巡（作り手：携帯で見づらい所・おかしな所も見つけて）：狭い画面ならではの見立て */
    if(VW<=480){
      for(const [el,r,t] of clicks){
        if(t && (r.height<28||r.width<28))
          found("使いづらい","携帯では押せる所が小さい", `${where}：「${t.slice(0,14)}」${Math.round(r.width)}×${Math.round(r.height)}px`, "狭い画面では縦二十八px以上に");
      }
      /* 押す所どうしが近すぎる（指で押し間違える） */
      for(let i=0;i<clicks.length&&i<50;i++) for(let j=i+1;j<clicks.length&&j<50;j++){
        const a2=clicks[i][1], b2=clicks[j][1];
        if(clicks[i][0].contains(clicks[j][0])||clicks[j][0].contains(clicks[i][0])) continue;
        const gx=Math.max(0, Math.max(a2.left,b2.left)-Math.min(a2.right,b2.right));
        const gy=Math.max(0, Math.max(a2.top,b2.top)-Math.min(a2.bottom,b2.bottom));
        const overlapX=(a2.left<b2.right&&b2.left<a2.right), overlapY=(a2.top<b2.bottom&&b2.top<a2.bottom);
        const gap=(overlapX&&!overlapY)?gy:((overlapY&&!overlapX)?gx:Math.hypot(gx,gy));
        if(gap>0 && gap<5 && clicks[i][2] && clicks[j][2]){
          found("使いづらい","携帯で押す所どうしが近すぎる", `${where}：「${clicks[i][2].slice(0,10)}」と「${clicks[j][2].slice(0,10)}」の隙間 ${gap.toFixed(1)}px`, "隙間を八px以上に");
          i=99; break;
        }
      }
      /* 戦場が狭すぎないか（帯や札に食われていないか） */
      try{ const cv=document.getElementById("bcanvas");
        if(cv && typeof B!=="undefined" && B){ const r2=cv.getBoundingClientRect();
          if(r2.height>0 && r2.height < VH*0.42) found("使いづらい","携帯で戦場が狭い（帯と札に食われている）", `${where}：野 ${Math.round(r2.height)}px ／ 画面 ${VH}px`, "帯を畳むか、札を重ねて出す"); } }catch(_){ }
    }
    for(let i=0;i<clicks.length&&i<70;i++) for(let j=i+1;j<clicks.length&&j<70;j++){
      const A=clicks[i], Bq=clicks[j];
      if(A[0].contains(Bq[0])||Bq[0].contains(A[0])) continue;
      if(uxFloating(A[0])||uxFloating(Bq[0])) continue;   /* 浮いた帯（下の中身の上に重なる作り）は、そういう作り */
      const a=A[1], b=Bq[1];
      const w=Math.min(a.right,b.right)-Math.max(a.left,b.left), h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      if(w<=1||h<=1) continue;
      const sm=Math.min(a.width*a.height, b.width*b.height);
      if(sm>0 && (w*h)/sm>0.5)
        found("使いづらい","押せる所どうしが重なっている（押し間違える）",
              `${where}：「${A[2].slice(0,12)}」と「${Bq[2].slice(0,12)}」`, "並べ方を直して重ならないようにする");
    }
  }catch(_){ }
}
/* 手を打ってから画面が返るまでの間（固まると遊び手は壊れたと思う） */
function uxTimed(name, fn){
  const t0=performance.now(); let r;
  try{ r=fn(); }finally{
    const ms=performance.now()-t0;
    if(ms>(PS&&PS.waitMs?PS.waitMs:260)) found("待たされる","手を打ってから画面が返るまで固まる", `${name}：${Math.round(ms)}ミリ秒`, "重い仕込みは先に用意しておくか、少しずつ分けて作る");
  }
  return r;
}

/* 第253巡（作り手：バグだけでなく矛盾と「使いづらい」も拾う） */
const seenLog={};   /* 同じ報せが短い間に何度も出ていないか */
const askCount={};  /* 同じ問いが繰り返されていないか */
let refused=0, refusedDays=0, lastRefuseDay=-9, lastClickAt=0, botBattleNo=0;
/* 軍議・問いかけは、遊び手のように選ぶ（たまに二番目・三番目も選ぶ） */
const asked=[];
window.koChoice=function(title,text,opts){
  try{
    uxEvents++;
    if(typeof title==="string"&&BAD.test(title)) found("文の粗","問いの題がおかしい",title);
    if(typeof text==="string"&&BAD.test(text)) found("文の粗","問いの本文がおかしい",text.slice(0,120));
    if(!opts||!opts.length){ found("詰まり","選べる手が無い問い",title); return; }
    if(opts.length===1 && !/次へ|承知|閉じる|進む|はじめる|始める|始め|了解|承る|見る|戻る/.test(String(opts[0][1]||""))) found("使いづらい","選べる手が一つしかない問い（選ぶ意味がない）",String(title).slice(0,40));   /* 物語の札（次へ）は問いではない */
    if(String(text||"").length>260) found("使いづらい","問いの本文が長すぎる",String(title).slice(0,40)+"："+String(text).length+"字");
    for(const o of opts){ if(!o||!o[1]) found("文の粗","選べる手に名が無い",title);
      else { if(BAD.test(String(o[1])+String(o[2]||""))) found("文の粗","選べる手の文がおかしい",title+"／"+o[1]);
        if(!o[2] && opts.length>1) found("使いづらい","選べる手に、何が起きるかの説明がない",String(title).slice(0,30)+"／"+String(o[1]).slice(0,20)); } }
    if(Date.now()-lastClickAt>1500){ const k=String(title).slice(0,24); askCount[k]=(askCount[k]||0)+1; if(askCount[k]===4) found("使いづらい","同じ問いが何度も出る",k+"（4回）"); }   /* 自分で釦を押して開いた札は数えない */
    const o=pick(opts); asked.push(String(title).slice(0,24)+"→"+String(o[1]).slice(0,18));
    if(o[3]) o[3]();
  }catch(e){ found("落ちた","問いの手を選んだら落ちた",(title||"")+"：" +e.message); }
};

/* 第253巡（作り手：シミュレーションと出来事が噛み合っていない。岩村城がもう織田の城なのに「岩村城の戦い」が起きる）
   決戦が起きるたび、盤面と食い違っていないかを見る */
function decSanity(d){
  try{
    const A=(d.atkClanOf&&decClanOf(d.atkClanOf))||clanByName(d.atk)||(d.altAtk?clanByName(d.altAtk):null);
    const D=(d.defClanOf&&decClanOf(d.defClanOf))||clanByName(d.def)||(d.altDef?clanByName(d.altDef):null);
    const nm=d.name||d.key;
    if(d.castle){
      const c=Object.values(W.castles).find(x=>x.name===d.castle);
      if(!c) found("辻褄","決戦の城が盤面に無い", `${nm}：${d.castle}`, "その城が無いなら起こさない");
      else if(A && c.clan===A.id) found("辻褄","もう自分のものになっている城を攻める決戦が起きた", `${nm}：${d.castle}は既に${A.name}のもの`, "起こす前に城の主を確かめる");
      else if(D && c.clan!==D.id) found("辻褄","決戦の城が、守り手の手にない", `${nm}：${d.castle}は${(W.clans[c.clan]||{}).name||"空"}のもの（札では${D.name}）`, "同上");
    }
    if(D && (D.dead||!myCastles(D.id).length)) found("辻褄","城を持たない家との決戦が起きた", `${nm}：${D.name}`, "起こす前に家の様子を確かめる");
    if(A && (A.dead||!myCastles(A.id).length)) found("辻褄","城を持たない家が決戦を仕掛けた", `${nm}：${A.name}`, "同上");
    if(A && D && A.id===D.id) found("辻褄","同じ家どうしの決戦", nm, "攻め手と守り手を確かめる");
    const y=(W.date&&W.date.y)||0;
    if(d.y && y && y < d.y-1) found("辻褄","まだ来ていない年の決戦が起きた", `${nm}：札は${d.y}年、いまは${y}年`, "年の門を確かめる");
  }catch(_){ }
}
if(typeof fireDecisive==="function"){ const _fd=window.fireDecisive;
  window.fireDecisive=function(d){
    const b0=!!(typeof B!=="undefined"&&B), s0=!!W.stage, p0=W.decisivePending;
    const r=_fd.apply(this,arguments);
    /* ゲームが見送った決戦は数えない（見送りこそ正しい働き）。本当に始まった時だけ見る */
    const started=(!!W.stage&&!s0)||(!!(typeof B!=="undefined"&&B)&&!b0)||(W.decisivePending&&W.decisivePending!==p0);
    if(started) try{ decSanity(d); }catch(_){ }
    if(started) try{ decCast(d); }catch(_){ }
    if(started) try{ decAbrupt(d); }catch(_){ }
    return r; };
}
/* 第253巡（作り手：ボットは不満を持ちまくるボットに）――遊ぶ人の目で見る三つ */
/* ① 札に載っている大将が、その戦の総大将になっているか。札に無い将が出ていないか */
function decCast(d){
  setTimeout(()=>{ try{
    if(typeof B==="undefined"||!B||!B.ctx) return;
    const nm=u=>u?String(u.name).replace(/隊$/,""):"";
    const same=(u,want)=>{ if(!u||!want) return true; const n2=nm(u); if(n2.indexOf(want)>=0) return true;
      const al=(typeof GEN_ALIAS!=="undefined"&&GEN_ALIAS[want])||[]; return al.some(a2=>n2.indexOf(a2)>=0); };
    const ac=B.units.find(u=>u.side===0&&u.cmd), dc=B.units.find(u=>u.side===1&&u.cmd);
    if(d.atkCmd && ac && !same(ac,d.atkCmd))
      found("辻褄","決戦の総大将が、札と違う将になっている", `${d.name}：寄せ手は ${nm(ac)}（札は ${d.atkCmd}）`, "札の atkCmd の将を必ずその戦に出す");
    if(d.defCmd && dc && !same(dc,d.defCmd))
      found("辻褄","決戦の総大将が、札と違う将になっている", `${d.name}：守り手は ${nm(dc)}（札は ${d.defCmd}）`, "札の defCmd の将を必ずその戦に出す");
    /* 札に無い将が出ていないか（名指しの戦だけ） */
    if(d.strictAtk && (d.atkGens||[]).length){
      const listed=new Set([...(d.atkGens||[]),...(d.atkAllies||[])]);
      const odd=B.units.find(u=>u.side===0&&!u.cmd&&!u.ally&&u.troops>.5&&!/鉄砲|足軽|櫓|番衆|の兵/.test(nm(u)) && !listed.has(nm(u)) && !(GEN_ALIAS&&Object.keys(GEN_ALIAS).some(k=>listed.has(k)&&(GEN_ALIAS[k]||[]).includes(nm(u)))));
      if(odd) found("辻褄","その戦に出ていないはずの将が出ている", `${d.name}：${nm(odd)}`, "札の将だけを出す（strictAtk）");
    }
  }catch(_){ } }, 0);
}
/* ② 前触れのない戦――敵対していない家と、いきなり決戦が始まっていないか */
function decAbrupt(d){
  try{
    const A=(typeof clanByName==="function")&&clanByName(d.atk), Bc=(typeof clanByName==="function")&&clanByName(d.def);
    if(!A||!Bc) return;
    if(A.id!==W.player && Bc.id!==W.player) return;          /* 人が関わる戦だけ見る */
    const foe = A.id===W.player ? Bc : A;
    const atWar = (A.war&&A.war.has(Bc.id));
    if(!atWar) found("驚く","敵になってもいない家と、いきなり決戦が始まる", `${d.name}：${A.name} と ${Bc.name} はまだ戦っていない`, "まず敵対の報せ→軍の到着→囲み、と段を踏む");
  }catch(_){ }
}

/* ③ 敵の城の上を素通りする軍・命令どおり動かない隊・門を破っても入れない、を見る（毎日） */
function marchSanity(){
  try{
    for(const a of Object.values(W.armies||{})){
      if(!a||a.stage) continue;
      if(!a.path||!a.path.length) continue;   /* 止まっている軍は「素通り」ではない */
      const here=Object.values(W.castles).find(c=>W.tile[c.id] && Math.abs(W.tile[c.id].c-a.x)<0.25 && Math.abs(W.tile[c.id].r-a.y)<0.25);
      if(!here) continue;
      if(here.clan===null||here.clan===a.clan) continue;
      if(typeof hostile==="function" && !hostile(a.clan,here.clan)) continue;
      if(a.target===here.id||a.mission==="包囲") continue;   /* そこを攻めに来た軍は正しい */
      found("辻褄","敵の城の上を軍が素通りしている", `${a.name}が${here.name}（${(W.clans[here.clan]||{}).name}）の上にいる（任は${a.mission}）`, "敵の城は避けて回るか、そこで足を止める");
    }
  }catch(_){ }
}
/* 筋書きを選ぶ */
const SCS=Object.keys(typeof SCENARIO_DEFS!=="undefined"?SCENARIO_DEFS:{}).filter(k=>{ const s=SCENARIO_DEFS[k]; return s&&s.shown!==false&&!/^(sekbattle|osaka_summer)$/.test(k); });
const sc=CFG.sc||pick(SCS.length?SCS:["nagashino"]);
let clanName=CFG.clan;
if(!clanName){ try{ const def=(typeof SCENARIO_DEFS!=="undefined")&&SCENARIO_DEFS[sc]; const rec=(def&&def.recommend)||null; if(rec&&rec.length) clanName=pick(rec); }catch(_){ } }
/* 第255巡：表紙と筋書き選びも、携帯の目で見る */
try{ auditMobile("表紙"); }catch(_){ }
try{ const st=document.getElementById("start"); if(st){ st.classList.remove("hidden"); auditMobile("表紙"); const b=document.getElementById("btnGameStart"); if(b){ b.click(); await new Promise(r=>setTimeout(r,300)); auditMobile("筋書き選び"); } } }catch(_){ }
try{ H.start(sc, clanName); }catch(e){ try{ H.start(sc); }catch(e2){ found("落ちた","筋書きが始まらない",sc+"："+e2.message); } }
/* 城を持たぬ家で始まってしまったら、城の多い家から選び直す（大坂で織田家に当たって一日で終わっていた） */
for(let tries=0; tries<(CFG.clan?0:3) && !myCastles(W.player).length; tries++){
  try{ const cands=Object.values(W.clans).filter(k=>!k.dead&&myCastles(k.id).length>=2).sort((a,b)=>myCastles(b.id).length-myCastles(a.id).length);
    if(!cands.length) break; const k=(tries<2)?pick(cands.slice(0,8)):cands[0]; H.start(sc, k.name);
  }catch(_){ break; } }
autoBattleMode=false; W.opening=null; setSpeed(0); PREF.bigNews=false;
document.getElementById('start').classList.add('hidden');
document.querySelectorAll('.overlay').forEach(o=>o.remove()); overlayEl=null;
const me=W.player; clanName=W.clans[me]?W.clans[me].name:"?";
await wait(200);

/* 合戦を遊ぶ（隊を選び、敵を狙い、帯の釦を押す） */
let battles=0, stalls=0;
async function playBattle(){
  battles++; const key=(B.ctx&&B.ctx.decisive)?((DECISIVE.find(x=>x.id===B.ctx.decisive)||{}).key||"?"):(B.ctx&&B.ctx.sanadamaru?"sanadamaru":"城攻め");
  B.opening=0; const t0=Date.now(); let holdZeroAt=null;
  try{ const inf=sd=>{ const us=B.units.filter(u=>u.side===sd); return us.length+"隊"+(us.filter(u=>u.left).length)+"退"+(us.some(u=>u.cmd)?"本陣有":"本陣無")+Math.round(us.reduce((s,u)=>s+u.troops,0)); };
    B._startInfo="側0:"+inf(0)+"／側1:"+inf(1); }catch(_){ }
  const LIMIT=Math.round(((B.dayLen||300)+40)/0.05);
  for(let i=0;i<LIMIT&&B&&B.over===null;i++){
    try{ updateBattle(0.05); }catch(e){ found("落ちた","合戦の最中に落ちた",key+"："+e.message); break; }
    if(i%20===0 && B && B.over===null){
      /* 隊に命じる：手近な敵を狙う */
      try{ const mine=B.units.filter(u=>u.side===B.ctx.playerSide&&u.troops>.5&&!u.left&&u.morale>0);
        const foe=B.units.filter(u=>u.side!==B.ctx.playerSide&&u.troops>.5&&!u.left);
        if(mine.length&&foe.length&&rr()<0.5){ const u=pick(mine); const t=foe.reduce((p,q)=>Math.hypot(p.x-u.x,p.y-u.y)<Math.hypot(q.x-u.x,q.y-u.y)?p:q); try{ if(typeof handOrder==="function") handOrder(u); }catch(_){ }   /* 第257巡：人が指で命じた時と同じ道を通す（控えの縛りは解ける） */ u.order={k:"attack", id:t.id}; }
      }catch(e){ found("落ちた","隊に命じたら落ちた",key+"："+e.message); }
      /* 帯の釦（退却はたまにしか押さない） */
      if(i%1200===0) auditUX("合戦の画面");
      if(i%600===300) { try{ auditMobile("合戦の画面"); auditScreen("合戦の画面"); }catch(_){ } }
      if(i%20===0){ try{ battleWatch(key); }catch(_){ } }
      if(rr()<0.25){ try{ renderBattleFoot(); }catch(e){ found("落ちた","合戦の帯が描けない",key+"："+e.message); }
        const btns=[...document.querySelectorAll('#bfoot button, #bhead button')].filter(b=>!b.disabled&&b.offsetParent!==null&&!/退却|降伏|やめ/.test(b.textContent||""));
        if(btns.length&&rr()<0.6){ const b=pick(btns); uxClick(b,"合戦の帯"); } }
      /* 窓が出たら答える */
      const ov=document.querySelector('#battle .overlay, #stage .overlay[data-bat="1"]');
      if(ov){ const b=ov.querySelector('button'); if(b){ try{ b.click(); }catch(_){ } } else { ov.remove(); overlayEl=null; } }
      /* 「守り切れ」の刻が尽きたのに何も起きない（作り手の報せ） */
      if(B.holdLeft===0){ if(holdZeroAt===null) holdZeroAt=B.elapsed; else if(B.elapsed-holdZeroAt>25&&B.over===null){ found("決まらない","守り切れの刻が尽きても勝負が付かない",key+"：刻が尽きて"+Math.round(B.elapsed-holdZeroAt)+"秒たっても決まらない"); holdZeroAt=B.elapsed; } }
      /* 兵の数がおかしい */
      for(const u of B.units){ if(!isFinite(u.troops)||u.troops<-0.01){ found("数がおかしい","隊の兵の数が壊れている",key+"／"+u.name+"："+u.troops); break; } }
    }
    if(i%400===0){ try{ drawBattle(); }catch(e){ found("落ちた","合戦が描けない",key+"："+e.message); } }
  }
  if(B&&B.over===null){ stalls++; found("決まらない","合戦が終わらない",key+"："+Math.round(B.elapsed)+"秒（日暮れ "+(B.dayLen||300)+"秒を過ぎても終わらない）"); try{ endBattle(1-B.ctx.playerSide); }catch(_){ } }
  else if(B&&B.elapsed<(PS?PS.shortBattleSec:8)) found("使いづらい","合戦が一瞬で終わる（遊ぶ間がない）",key+"："+Math.round(B.elapsed)+"秒（始め 味方"+Math.round((B.startTroops&&B.startTroops[B.ctx.playerSide])||0)+"／敵"+Math.round((B.startTroops&&B.startTroops[1-B.ctx.playerSide])||0)+"・勝敗"+B.over+"・隊"+B.units.filter(u=>u.side===0).length+"対"+B.units.filter(u=>u.side===1).length+"・人側"+B.ctx.playerSide+"・訳"+(B._overWhy||"?")+"・"+(B._startInfo||"?")+"）");
  /* 第253巡（作り手：この武将、本当に参加していたのかな。原田直政が木津砦の大将になっていない）
     決戦の札に書かれた総大将と、野に立っている総大将が同じか */
  try{
    if(B && B.ctx && B.ctx.decisive){
      const d0=DECISIVE.find(x=>x.id===B.ctx.decisive);
      if(d0){
        const cmd0=B.units.find(u=>u.side===0&&u.cmd), cmd1=B.units.find(u=>u.side===1&&u.cmd);
        const nm=u=>u?String(u.name||"").replace(/隊$/,""):"（なし）";
        /* その将が生きて出られる時だけ言う（死んでいたり捕らわれていれば、代わりが立つのは当たり前） */
        const able=n2=>{ const g=Object.values(W.generals).find(x=>x.name===n2); return !!(g&&g.status!=="死亡"&&g.status!=="捕虜"&&g.status!=="人質"); };
        const inB=n2=>B.units.some(u=>String(u.name||"").indexOf(n2)>=0);
        if(d0.atkCmd && cmd0 && nm(cmd0).indexOf(d0.atkCmd)<0 && able(d0.atkCmd) && inB(d0.atkCmd))
          found("辻褄","決戦の総大将が、札と違う将になっている", `${d0.name}：攻め手は「${d0.atkCmd}」のはずが ${nm(cmd0)}`, "その将がいなければ、その決戦は起こさない（か、札の名を直す）");
        if(d0.defCmd && cmd1 && nm(cmd1).indexOf(d0.defCmd)<0 && able(d0.defCmd) && inB(d0.defCmd))
          found("辻褄","決戦の総大将が、札と違う将になっている（守り手）", `${d0.name}：守り手は「${d0.defCmd}」のはずが ${nm(cmd1)}`, "同上");
      }
    }
  }catch(_){ }
  const gmain=(()=>{ try{ return B?((battleGoals()||{}).main||""):""; }catch(_){ return ""; } })();   /* 第253巡：B.objective が空でも、目的の札には文が出る */
  if(B&&!gmain.trim()) found("使いづらい","合戦に目的の文が出ていない",key);
  if(B&&gmain.length>200) found("使いづらい","合戦の目的の文が長すぎる",key+"："+gmain.length+"字");
  for(let k=0;k<500&&B;k++){ try{ updateBattle(0.05); }catch(_){ break; } }
  if(B){ try{ finishBattle(); }catch(e){ found("落ちた","合戦の後始末で落ちた",key+"："+e.message); } }
  document.querySelectorAll('.overlay').forEach(o=>o.remove()); overlayEl=null;
  if(Date.now()-t0>60000) found("重い","合戦に時間がかかりすぎる",key);
}

/* 国のことをする（遊び手のように：内政・徴兵・出陣・外交の札を見る） */
function playDay(d){
  const K=W.clans[me]; if(!K||K.dead) return false;
  const mine=myCastles(me); if(!mine.length) return false;
  if(d%4===0){ const c=pick(mine); const idle=Object.values(W.generals).filter(g=>g.clan===me&&g.castle===c.id&&!g.army&&!g.task&&g.status==="家臣");
    if(idle.length>1){ try{ order(pick(["新田開発","商業投資","城の強化","施し","軍事訓練"]), idle[0].id, c.id); }catch(e){ found("落ちた","内政の命で落ちた",e.message); } } }
  if(d%8===0 && !(W.stage&&W.stage.lock)){ const c=pick(mine); const idle=Object.values(W.generals).filter(g=>g.clan===me&&g.castle===c.id&&!g.army&&!g.task&&g.status==="家臣"&&g.troops>0);
    if(idle.length>=2){ const foe=c.neighbors.map(n=>W.castles[n]).filter(o=>o&&o.clan!==null&&o.clan!==me);
      if(foe.length){ const o=pick(foe); try{ if(!K.war.has(o.clan)&&bordersOn(me,o.clan)&&rr()<0.5) declareWar(me,o.clan);
        if(K.war.has(o.clan)&&garrisonTroops(c.id)>garrisonTroops(o.id)*1.15) dispatch(c.id, idle.slice(0,Math.max(1,idle.length-1)).map(g=>g.id), o.id, 0);
      }catch(e){ found("落ちた","出陣で落ちた",e.message); } } } }
  if(d%25===0){ const c=pick(mine); const idle=Object.values(W.generals).filter(g=>g.clan===me&&g.castle===c.id&&!g.army&&!g.task&&g.status==="家臣");
    if(idle.length) try{ conscript(idle[0].id,0,400); }catch(e){ found("落ちた","徴兵で落ちた",e.message); } }
  return true;
}

/* 第254巡：気持ちの目安（bot は飽きないので、飽きる場面を数で捉える）
   ・良い報せが長く無い＝手応えが無い
   ・知らせも無く城を失った＝理不尽 */
var castlesSeen=null, warnedC={}, warnedLog={}, lastBattleDay=-999;
function auditFeel(){
  try{
    const d=dayNumber();
    const mine=myCastles(me);
    if(mine.length && lastGood>-999 && d-lastGood>=(PS?PS.dullDays:60) && !auditFeel._dull){
      auditFeel._dull=true;
      found("退屈","良い報せが六十日も無い（手応えが無い）",
        `最後の良い報せ：${lastGoodT||"？"}（${d-lastGood}日前）／城 ${mine.length}`,
        "城を取る・国を平定する以外にも、月ごとの小さな手応え（実り・人が加わる・普請が成る）を告げる");
    }
    if(d-lastGood<60) auditFeel._dull=false;
    try{ if(typeof B!=="undefined" && B) lastBattleDay=d; }catch(_){ }
    /* 囲まれた知らせを控える */
    for(const a of Object.values(W.armies)){
      if(a.mission==="包囲" && a.target!==undefined && W.castles[a.target] && W.castles[a.target].clan===me) warnedC[a.target]=d;
    }
    const now=new Set(mine.map(c=>c.id));
    if(castlesSeen){
      for(const id of castlesSeen){
        if(now.has(id)) continue;
        const w=Math.max(warnedC[id]===undefined?-999:warnedC[id], lastBattleDay);
        if((w<=-999 || d-w>3) && !auditFeel._unfair && !W.result && !(W.clans[me]&&W.clans[me].dead)){   /* 終わりの筋書き（大坂落城など）は、そこで告げられている */
          auditFeel._unfair=true;
          found("理不尽","知らせも無く城を失った", `${(W.castles[id]||{}).name||id}（囲みの知らせ ${w===undefined?"なし":(d-w)+"日前"}／その城の知らせ:${(warnedLog[id]||["無し"]).join("・")}／直近:${(W.events||[]).slice(-6).map(e=>String(e.text).slice(0,22)).join(" | ")}）`,
            "城が危ういうちに知らせる（囲まれた・落ちそう・落ちた、を必ず出す）");
        }
      }
    }
    castlesSeen=now;
  }catch(_){ }
}
/* 盤面のおかしな所 */
function auditWorld(){
  for(const c of Object.values(W.castles)){
    if(c.clan!==null&&c.clan!==undefined){ const k=W.clans[c.clan]; if(!k) found("辻褄","居ない家の城",c.name); else if(k.dead) found("辻褄","滅んだ家が城を持っている",k.name+"／"+c.name); }
    if(!isFinite(c.defense)||c.defense<0) found("数がおかしい","城の守りの数が壊れている",c.name+"："+c.defense);
  }
  for(const g of Object.values(W.generals)){ if(!isFinite(g.troops)||g.troops<0) { found("数がおかしい","将の兵の数が壊れている",g.name+"："+g.troops); break; } }
  for(const a of Object.values(W.armies)){
    if(a.clan===me){ a._botDays=(a._botDays||0)+1; if(a._botDays>200) found("詰まり","わが軍が二百日以上ただ居る",(a.name||"軍")+"／任務 "+(a.mission||"-")); }
    if(!W.clans[a.clan]||W.clans[a.clan].dead) found("辻褄","居ない家の軍がいる",(a.name||"軍"));
  }
  if(W.decisivePending&&W.decisiveAt&&dayNumber()-W.decisiveAt>60) found("詰まり","決戦が告げられたまま起きない","id "+W.decisivePending+"（"+(dayNumber()-W.decisiveAt)+"日）");
  /* 第253巡（作り手：木津川砦の戦いのはずが、明智は石山へ、本願寺は岸和田へ行って、また折り返す）
     軍が行き先を何度も変えて行ったり来たりしていないか */
  W._botArmyT=W._botArmyT||{};
  for(const a of Object.values(W.armies)){
    if(a.script||a.stage) continue;
    const h=W._botArmyT[a.id]||(W._botArmyT[a.id]={t:[],back:0});
    const t=a.target;
    if(a.mission==="帰還") continue;   /* 第254巡：城を落とせず本拠へ帰るのは、行ったり来たりではない */
    if(t!==undefined && t!==null && t!==a.origin && h.t[h.t.length-1]!==t){ h.t.push(t);
      if(h.t.length>=3 && h.t[h.t.length-1]===h.t[h.t.length-3] && !h._zig){ h._zig=true;
        found("辻褄","軍が同じ二つの城の間を行ったり来たりしている",
          `${a.name||clanName(a.clan)}：${h.t.slice(-3).map(x=>(W.castles[x]||{}).name||"?").join("→")}`,
          "行き先を決めたら、着くまでは変えない（囲みが解けた時だけ変える）"); }
      if(h.t.length>=5 && !h._many){ h._many=true;
        found("辻褄","軍が行き先を何度も変えている", `${a.name||clanName(a.clan)}：${h.t.length}回（${h.t.slice(-4).map(x=>(W.castles[x]||{}).name||"?").join("→")}）`, "行き先はそう何度も変えない"); } }
    /* 城の前まで行って、戦わずに引き返した */
    const lastT=h.t.length?h.t[h.t.length-1]:null;
    const wasFoe=lastT!==null && W.castles[lastT] && W.castles[lastT].clan!==a.clan;
    if(a.mission==="帰還" && wasFoe && !a.siegeDays && !h._noFight){ h._noFight=true;
      found("辻褄","城の前まで行って、戦わずに引き返した", `${a.name||clanName(a.clan)}（狙いは ${(W.castles[h.t[h.t.length-1]]||{}).name||"?"}）`, "寄せられないなら、はじめから出さない"); }
  }
  /* 第253巡：家同士の辻褄（作り手：矛盾点も潰せる bot に） */
  for(const k of Object.values(W.clans)){
    if(k.dead||!myCastles(k.id).length) continue;
    /* 同盟しているのに戦っている */
    for(const a of k.allies){ if(k.war.has(a)) found("矛盾","同盟している家と戦をしている",`${k.name} と ${(W.clans[a]||{}).name||"?"}`); }
    /* 属国なのに同盟を持つ・主家と戦う */
    if(k.suzerain!==null&&k.suzerain!==undefined&&W.clans[k.suzerain]){
      const lord=W.clans[k.suzerain];
      if(k.allies.size) found("矛盾","属国が同盟を持っている",`${k.name}（主家 ${lord.name}）`);
      if(k.war.has(lord.id)||lord.war.has(k.id)) found("矛盾","属国と主家が戦をしている",`${k.name} と ${lord.name}`);
      if(lord.dead) found("矛盾","滅んだ家の属国のままになっている",`${k.name}（主家 ${lord.name}）`);
    }
    /* 自分と戦争・自分と同盟 */
    if(k.war.has(k.id)||k.allies.has(k.id)) found("矛盾","自分の家と戦／同盟している",k.name);
    /* 当主が城を持たぬ家の当主として残っている */
    const t=totalTroops(k.id); if(!isFinite(t)||t<0) found("数がおかしい","家の総兵が壊れている",k.name+"："+t);
  }
  /* 城と守将の辻褄 */
  for(const c of Object.values(W.castles)){
    if(c.clan===null||c.clan===undefined) continue;
    const g=c.lord!==null&&c.lord!==undefined?W.generals[c.lord]:null;
    if(g&&g.status!=="死亡"&&g.clan!==c.clan) found("矛盾","城主が他家の将になっている",`${c.name}（${(W.clans[c.clan]||{}).name}の城／城主 ${g.name}）`);
    const gar=garrisonTroops(c.id); const tot=totalTroops(c.clan);
    if(gar>tot+1) found("数がおかしい","城の守兵が家の総兵より多い",`${c.name}：守兵 ${gar} ／ 家の総兵 ${tot}`);
  }
  /* 将の辻褄：二つの軍に同時にいる・死んだのに動いている */
  { const inArmy={}; for(const a of Object.values(W.armies)) for(const gid of (a.gens||[])){ if(inArmy[gid]) found("矛盾","同じ将が二つの軍にいる",(W.generals[gid]||{}).name||gid); inArmy[gid]=a.id; } }
  for(const g of Object.values(W.generals)){ if(g.status==="死亡"&&(g.army!==null&&g.army!==undefined)) { found("矛盾","死んだ将が軍にいる",g.name); break; } }
  /* 待ち行列に積んだ小さな決戦が、いつまでも起きない */
  if(W.sekSub&&W.sekSub.length){ for(const q of W.sekSub){ if(q&&q.at&&dayNumber()-q.at>45){ const d=DECISIVE.find(x=>x.id===q.id); found("詰まり","待ち行列の決戦が起きない",(d?d.name:("id "+q.id))+"（"+(dayNumber()-q.at)+"日待ち）"); break; } } }
  /* 大名のいない家、当主が死んでいる家 */
  for(const k of Object.values(W.clans)){ if(k.dead||!myCastles(k.id).length) continue;
    const lord=W.generals[k.daimyo];
    if(!lord||lord.status==="死亡") found("辻褄","当主のいない家が残っている",k.name);
    else if(lord.clan!==k.id) found("辻褄","当主が他家の者になっている",k.name+"／"+lord.name); }
  /* 城の守兵が負・無限 */
  for(const c of Object.values(W.castles)){ const t=garrisonTroops(c.id); if(!isFinite(t)||t<0){ found("数がおかしい","城の守兵が壊れている",c.name+"："+t); break; } }
}


/* 押した手ごたえがあるか。押しても何も変わらない釦は、遊び手を不安にさせる（作り手の指示） */
const uxDead={};
function uxDigest(){
  try{
    const p=document.getElementById("panel"), f=document.getElementById("bfoot"), h=document.getElementById("bhead"), tb=document.getElementById("topbar");
    const w=[W.speed,W.selected,W.selCastle,W.sel,W.mode,W.mapMode,W.panel,W.paused,
             W.armies?Object.keys(W.armies).length:0, W.money, W.date&&W.date.d,
             (W.logs&&W.logs.length)||0, document.querySelectorAll(".overlay").length];
    const b=(typeof B!=="undefined"&&B)?[B.sel&&B.sel.id,B.mode,B.cmd,B.autoMine,B.paused,B.speed,B.aiPolicy,
             Math.round(B.cx||0),Math.round(B.cy||0),Math.round((B.zoom||1)*100),B.formPanel,B.chargedAll,
             B.units.map(u=>(u.order&&u.order.k||"")+(u.form||"")).join("")]:[];
    const hs=x=>{ if(!x) return 0; const t=x.innerHTML||""; let h2=5381; for(let i=0;i<t.length;i+=3) h2=((h2*33)^t.charCodeAt(i))>>>0; return h2; };
    return [uxEvents, document.body.childElementCount,
            hs(p), hs(f), hs(h), tb?tb.textContent:"",
            JSON.stringify(w), JSON.stringify(b)].join("|");
  }catch(_){ return String(uxEvents); }
}
const UX_RISKY=/タイトル|やめる|終わる|消す|削除|記録を消|初めから|投了|降伏|全軍退/;
function uxClick(el, where){
  if(!el) return false;
  const t=(el.getAttribute("aria-label")||uxText(el)).slice(0,24);
  if(UX_RISKY.test(t)) return false;
  /* いま選ばれている釦を押し直しても変わらないのは当たり前（選ばれている印が出ていればよい） */
  const already=/\b(on|kin|shu|sel|selected|active|cur|now|p-close)\b/.test(String(el.className||""))||el.getAttribute("aria-pressed")==="true"||el.disabled;
  const d0=uxDigest();
  lastClickAt=Date.now();
  uxTimed("「"+(t||"名なし")+"」を押す", ()=>{ try{ el.click(); }catch(e){ found("落ちた","釦を押したら落ちた", `${where}：「${t}」${e.message}`, ""); } });
  const d1=uxDigest();
  if(d0===d1 && !already){
    const k=where+"|"+t; uxDead[k]=(uxDead[k]||0)+1;
    if(uxDead[k]===2) found("使いづらい","押しても何も起きない釦（手ごたえが無い）",
        `${where}：「${t||el.id||el.className}」［${el.tagName}.${String(el.className||"").slice(0,24)}${el.getAttribute("onclick")?"／"+el.getAttribute("onclick").slice(0,40):""}］`,
        "押したら必ず何か返す（効かない時は理由を出すか、押せない見た目にする）");
  }
  return true;
}


/* ===== 不満を持つ目（作り手：バグだけでなく「普通こうなるはずなのに、なっていない」を挙げる） =====
   第253巡：数が多い方が一方的に削られる／命じていない隊が右往左往する／同盟の隊が突っ立っている／
   隊が野の外へ飛ぶ／命じたのに動かない、を合戦の最中に見張る。 */
function battleWatch(key){
  if(!B||B.over!==null) return;
  B._w=B._w||{t:-9,u:{}};
  if(B.elapsed-B._w.t<1.0) return;
  const dt=B.elapsed-B._w.t; B._w.t=B.elapsed;
  const foesOf=u=>B.units.filter(v=>v.side!==u.side&&v.troops>.5&&!v.left);
  /* 報せの出る速さ（十秒の間に何枚出たか。続けて出ること自体はよい） */
  { const bb=(B.bigBanner&&B.bigBanner.t)||"", bn=(B.banner&&B.banner.t)||"";
    B._bw=B._bw||{last:"",lastN:"",big:[],sml:[]};
    const now=B.elapsed;
    if(bb && bb!==B._bw.last){ B._bw.last=bb; B._bw.big.push(now); B._bw.big=B._bw.big.filter(t=>now-t<=12);
      if(B._bw.big.length>=5 && !B._bw._told){ B._bw._told=true;
        found("使いづらい","大きな報せが立て続けに出る（しつこい）", `${key}／十二秒に ${B._bw.big.length} 枚（最後は「${bb.slice(0,24)}」）`, "続けて出す報せは一つにまとめるか、間を置く"); } }
    if(bn && bn!==B._bw.lastN){ B._bw.lastN=bn; B._bw.sml.push(now); B._bw.sml=B._bw.sml.filter(t=>now-t<=10);
      if(B._bw.sml.length>=6 && !B._bw._toldN){ B._bw._toldN=true;
        found("使いづらい","小さな報せが立て続けに出る（しつこい）", `${key}／十秒に ${B._bw.sml.length} 枚（最後は「${bn.slice(0,24)}」）`, "間を置く"); } } }
  for(const u of B.units){
    if(u.troops<=.5||u.left) continue;
    const h=B._w.u[u.id]||(B._w.u[u.id]={x:u.x,y:u.y,dir:0,turns:0,still:0,idle:0,troops:u.troops,hit:0,dealt:0,seen:0});
    const dx=u.x-h.x, dy=u.y-h.y, moved=Math.hypot(dx,dy);
    h.x=u.x; h.y=u.y;   /* 第253巡：前の見た所を控え直す（控え忘れて「一秒で十五歩」と誤って数えていた） */
    /* 右往左往：命じていないのに向きが何度も変わる */
    const dir=Math.abs(dx)<0.02?0:(dx>0?1:-1);
    const still=(u.order.k==="hold"||u.order.k==="guard") && !(u.engagedAt>B.elapsed-10) && !(u.gx!==undefined && Math.hypot(u.x-u.gx,u.y-u.gy)<2.2);   /* 持ち場にいる隊の揺れは押し合いの範囲 */   /* 組み合っている隊は揺れて当たり前 */
    if(still){
      if(dir&&h.dir&&dir!==h.dir) h.turns++;
      if(dir) h.dir=dir;
      h.wander=(h.wander||0)+moved;
      if(h.turns>=5 && h.wander>12 && !h._told && !u.towerGun && !u.towerFixed && !u.postHold){ h._told=true;   /* 五歩前後の揺れは押し合いの範囲。八歩より大きいものだけ */   /* 第253巡：櫓に据えた鉄砲は数えない */
        found("辻褄","命じていない隊が右往左往している", `${key}／${u.name}（${h.turns}回向きを変え、${h.wander.toFixed(1)}歩うろついた）`,
              "持ち場の隊は止める（押し合いの押し戻しを弱める）"); }
    } else { h.turns=0; h.wander=0; }
    /* 命じたのに動かない */
    if(u.order.k==="move" && u.morale>0 && !(u.engagedAt>B.elapsed-10)){ if(moved<0.05) h.still+=dt; else h.still=0;
      if(h.still>(PS?PS.stuckSec+8:20) && !h._stuck){ h._stuck=true;   /* 十秒で道を取り直す仕掛けがあるので、二十秒を目安に */   /* 第253巡：十秒で道を取り直す仕掛けが入ったので、十五秒を目安に */
        found("詰まり","命じたのに動かない隊", `${key}／${u.name}（${Math.round(h.still)}秒その場から動かない／側${u.side} ${[u.postHold&&"post",u.ally&&"ally",u.autoAI&&"auto",u.holdUntil>B.elapsed&&"hold",u.waitFence&&"fence",u.reserveHold&&"res",u.breakTo&&"break",B.autoMine&&"autoMine",u.cell?"cell":"nocell",u.onTower&&"tower",u.towerGun&&"tgun",("sT"+(u._sT===undefined?"-":Math.round(u._sT))),("sN"+(u._stuckN===undefined?"-":u._stuckN)),("el"+Math.round(B.elapsed)),("ord"+Math.round(u.order.x||0)+","+Math.round(u.order.y||0)),("at"+Math.round(u.x)+","+Math.round(u.y)),("wdN"+(u._wdN===undefined?"-":u._wdN)),("wdD"+(u._wdD===undefined?"-":Math.round(u._wdD))),("eng"+(u.engagedAt===undefined?"-":Math.round(B.elapsed-u.engagedAt))),("sim"+(B.sim?1:0)),("op"+Math.round(B.opening||0))].filter(Boolean).join(",")||"なし"}）`,
              "囲まれていても、どけて進めるようにする（押し合いで完全に固まらない）"); } }
    else h.still=0;
    /* 野の外へ飛ぶ */
    if(u.x<-4||u.x>BF.w+4||u.y<-4||u.y>BF.h+4){ if(!h._out){ h._out=true;
      found("辻褄","隊が野の外に出ている", `${key}／${u.name}（${Math.round(u.x)},${Math.round(u.y)}／野は ${Math.round(BF.w)}×${Math.round(BF.h)}）`, "野の内に収める"); } }
    if(u.sigHidden||u.tobiHide||u.left) h._hid=true;
    if(moved>14 && !h._jump && !h._hid && !u.towerGun && !u.towerFixed && !u.tobiGuard && B.elapsed>6 && !(B._warpAt!==undefined && B.elapsed-B._warpAt<3)){   /* 櫓に据える鉄砲は置き直しで飛ぶ */   /* 第253巡：陣立ての最初の数秒は、置き直しなので数えない */ h._jump=true;
      found("辻褄","隊が一息で遠くへ飛ぶ", `${key}／${u.name}（一秒で ${Math.round(moved)}歩）`, "移動は歩かせる（座標の飛びを無くす）"); }
    /* 同盟の隊が突っ立っている */
    if(u.ally && !/囲み|城兵|番衆|櫓|の鉄砲|守兵/.test(String(u.name||"")) && !u.postHold && !u.towerGun && !u.sekHold && !u.tobiHold && !u.holdUntil && !u.fortGuard && !u.reserveHold){ const near=foesOf(u).some(v=>Math.hypot(v.x-u.x,v.y-u.y)<12);   /* 第253巡：囲みの隊・城兵は持ち場を守るのが役目 */
      if(near && (u.order.k==="hold"||u.order.k==="guard")) h.idle+=dt; else h.idle=0;
      if(h.idle>25 && !h._ally){ h._ally=true;
        found("辻褄","同盟の隊が敵のそばで突っ立っている", `${key}／${u.name}（${Math.round(h.idle)}秒、敵が近いのに何もしない）`,
              "同盟の隊は機械が自分で攻めるようにする（人は動かせないのだから）"); } }
    /* 数が多い方が一方的に削られる */
    const lost=Math.max(0,h.troops-u.troops); h.troops=u.troops;
    h.hit+=lost;
    if(u.order.k==="attack"){ const t=B.units.find(v=>v.id===u.order.id);
      const lone=t?(!B.gate && !B.ck && !B.siegeWall && !B.siegeName && !(B.ctx&&B.ctx.castle) && !B.fortTowers && !/城攻め|砦|城/.test(String(key)) && foesOf(u).filter(v=>v.troops>.5&&Math.hypot(v.x-u.x,v.y-u.y)<4.5).length<=1):false;
      if(t && lone && t.troops>.5 && u.troops>t.troops*2.5 && !t.tough && !t.cmd){ h.seen+=dt;   /* 堅い隊（武田の騎馬）と本陣は、そういう作り */
        if(h.tT===undefined) h.tT=t.troops;
        const tLost=Math.max(0,(h.tId===t.id?h.tT:t.troops)-t.troops); h.tId=t.id;
        if(h.seen>12 && h.hit>u.max*0.25 && h.hit>tLost*3 && !h._odd){ h._odd=true;
          found("辻褄","数で勝る隊が、小勢に一方的に削られている", `${key}／${u.name} ${Math.round(u.troops)} 対 ${t.name} ${Math.round(t.troops)}（${Math.round(h.hit)}を失った）`,
                "兵の数の差が、削り合いに効くようにする"); } }
      else h.seen=0; }
  }
}

/* 札（画面）を開いて、描けるか見る */
async function auditPanels(){
  const fns=["openDomestic","openMarch","openDiplomacy","openAdviser","openChronicle","openRecords","openOfficers","openCastles","openStanding","openPolicy"];
  const NAME={openDomestic:"内政の札",openMarch:"出陣の札",openDiplomacy:"外交の札",openAdviser:"軍師の札",openChronicle:"できごとの札",openRecords:"記録の札",openOfficers:"家臣の札",openCastles:"城の札",openStanding:"立ち位置の札",openPolicy:"方針の札"};
  for(const n of fns){ if(typeof window[n]!=="function") continue; try{ uxTimed(NAME[n]||n, ()=>window[n]()); }catch(e){ found("落ちた","札が開けない",n+"："+e.message); continue; }
    await wait(340);   /* 札は滑り込んでくる。出切ってから見る（動いている途中は画面の外にある） */
    try{ auditUX(NAME[n]||n); const p=document.getElementById("panel"); if(p&&BAD.test(p.textContent||"")) found("文の粗","札の中に undefined / NaN が出ている",n); }catch(e){ found("落ちた","札が開けない",n+"："+e.message); } }
  /* 第253巡（作り手：押しても何も効能がない釦は困る）：札の中の釦も押して、手ごたえを見る */
  for(const n of fns){ if(typeof window[n]!=="function") continue;
    try{ window[n](); }catch(_){ continue; }
    const p=document.getElementById("panel"); if(!p) continue;
    const btns=[...p.querySelectorAll("button,summary,a[href],[onclick]")].filter(uxVisible).filter(b=>!UX_RISKY.test(uxText(b)));   /* 飾りの小札は押さない（押せる物だけ） */
    for(let i=0;i<Math.min(3,btns.length);i++){
      const b=btns[Math.floor(rr()*btns.length)];
      if(!b||!b.isConnected) continue;
      uxClick(b, NAME[n]||n);
      const ov=document.querySelector(".overlay"); if(ov){ const x=ov.querySelector("button"); if(x) try{ x.click(); }catch(_){ } }
      try{ if(!document.getElementById("panel")) window[n](); }catch(_){ }
    }
  }
  try{ closePanel(); }catch(_){ }
}

/* 遊ぶ */
let days=0;
for(let d=0; d<CFG.days; d++){
  try{ auditFeel(); }catch(_){ }
  try{ stepDay(); }catch(e){ found("落ちた","日を進めたら落ちた",e.message); break; }
  if(d%7===0) try{ marchSanity(); }catch(_){ }
  days++;
  if(pendingEncounter){ /* 出会い頭の戦は遊ぶ（たまに自動で済ます） */ try{ resolveEncounter(rr()<0.8?"会戦":"自動"); }catch(e){ found("落ちた","出会い頭の戦で落ちた",e.message); pendingEncounter=null; } }
  if(B&&!B._botId) B._botId=(++botBattleNo);
  if(B){ if(battles<CFG.battles) await playBattle(); else { try{ endBattle(B.ctx.playerSide); for(let k=0;k<500&&B;k++) updateBattle(0.05); if(B) finishBattle(); }catch(_){ } } }
  const ov=document.querySelector('.overlay'); if(ov){ const b=ov.querySelector('#dcGo')||ov.querySelector('button[data-k]')||ov.querySelector('button'); if(b){ try{ b.click(); }catch(e){ found("落ちた","窓の釦で落ちた",e.message); } } else { ov.remove(); overlayEl=null; } }
  if(!playDay(d) && d%7===0){ if(!myCastles(me).length){ found("終わり","わが家が滅びた","遊びは続かないので、ここで止める"); break; } }
  if(d%20===0) auditWorld();
  if(d%60===0) await auditPanels();
  if(d%40===0) auditUX("地図の画面");
  if(W.result) break;
  if(d%10===0) await wait(0);
}
auditWorld(); await auditPanels();

/* 記録の出し入れ（続きから、が壊れていないか） */
try{ const s=serialize(); const n=JSON.parse(s); if(!n||!n.date) found("記録","記録の中身が空","serialize");
  else { const c0=myCastles(me).length; localStorage.setItem(SAVE_KEY, s); const ok=loadGame(); const c1=myCastles(W.player).length;
    if(ok===false) found("記録","記録から戻せない","loadGame が false");
    else if(c1!==c0) found("記録","記録から戻すと城の数が変わる",`前 ${c0} → 後 ${c1}`); }
}catch(e){ found("記録","記録の出し入れで落ちた",e.message); }

if(refusedDays>=Math.max(8, Math.round(days*0.25))) found("使いづらい","命じても断られてばかりの日が多い",`${refusedDays}日（${days}日のうち）・断り ${refused}回`);
return JSON.stringify({
  sc, clan:clanName, days, battles, stalls, refused, refusedDays,
  end:W&&W.date?`${W.date.y}年${W.date.m}月`:"", result:W&&W.result||null,
  castles:myCastles(me).length, troops:totalTroops(me),
  asked:asked.slice(0,12), findings:F
});
