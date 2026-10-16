/* 第253巡（作り手：管理画面を見なくても、毎朝クロードが数を読んで、自分で手を打てるように）
   admin/stats.json から「読み取れること・次の一手」を出す。admin/index.html の同じ規則を
   ここに写してある（どちらかを直したら、もう一方も直すこと）。
   使い方: node admin/insight.mjs [d1|d7|d30|d90|all] [--json] */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));

// 第260巡：ev/review 専用。同じ集計を管理画面と毎朝の読み取りに使う。
export function reviewMetrics(hits){
  const counts={}, scenes={}, houses={}, tails=[]; let starts=0,leaves=0,returns=0,dominance=0;
  for(const h of hits){if(!h.event||!String(h.path||'').startsWith('ev/review/'))continue;
    const a=h.path.slice(10).split('/'),cl=a.pop(),sc=a.pop();if(!['nagashino','sekigahara'].includes(sc)||!cl)continue;
    const n=(h.stats||[]).reduce((s,d)=>s+(Number(d.daily)||0),0),key=sc+'/'+cl;
    const home=houses[key]||(houses[key]={starts:0,unify:0,replay:0});
    if(a[0]==='count'){
      const delta=Number(a.pop());if(!Number.isSafeInteger(delta)||delta<=0)continue;
      const k=a.slice(1).join('/');counts[k]=(counts[k]||0)+delta*n;
    }else if(a[0]==='start'){starts+=n;home.starts+=n;}
    else if(a[0]==='unify')home.unify+=n;
    else if(a[0]==='replay')home.replay+=n;
    else if(a[0]==='dominance')dominance+=n;
    else if(a[0]==='early-leave'){leaves+=n;const k=a.slice(1).join('/');scenes[k]=(scenes[k]||0)+n;}
    else if(a[0]==='early-return')returns+=n;
    else if(a[0]==='tail-days'){const days=Number(a[1]);if(Number.isSafeInteger(days)&&days>=0)tails.push({days,n,house:key});}
  }
  const sum=p=>Object.entries(counts).filter(([k])=>k===p||k.startsWith(p+'/')).reduce((s,[,n])=>s+n,0);
  const manual=sum('battle/manual'),auto=sum('battle/auto'),tailN=tails.reduce((s,t)=>s+t.n,0);
  return {starts,leaves,returns,scenes,counts,houses,dominance,tails,bulk:sum('bulk'),manual,auto,
    manualPct:manual+auto?Math.round(manual/(manual+auto)*100):null,
    noticeShow:sum('notice-show'),noticeClose:sum('notice-close'),faults:sum('fault'),recovery:sum('recovery'),resume:sum('resume'),
    tailN,tailDays:tailN?tails.reduce((s,t)=>s+t.days*t.n,0)/tailN:null};
}

// アプリ印だけを正規化する。端末不明の旧記録とウェブ印は補完しない。
export function appHits(hits){
  return (hits||[]).filter(h=>h.event&&/^ev\/plat\/(app|ios)\//.test(String(h.path||'')))
    .map(h=>({...h,path:h.path.replace(/^ev\/plat\/(app|ios)\//,'ev/')}))
    .filter(h=>{const sc=h.path.split('/').find(x=>['oke','honnoji','kiyosu','shizugatake','komaki','koshu','sekigahara','osaka','hoi','mikata','nagashino','kyushu','odawara','ishiyama'].includes(x));return !sc||['nagashino','sekigahara'].includes(sc);});
}
export function derive(DATA, RANGE='d7'){
  const R=DATA.ranges?.[RANGE];if(!R)return null;
  const hits=appHits(R.hits),sum=h=>(h.stats||[]).reduce((s,d)=>s+(Number(d.daily)||0),0);
  const matches=(h,p)=>h.path==='ev/'+p||h.path.startsWith('ev/'+p+'/');
  const ev=p=>hits.filter(h=>matches(h,p)).reduce((s,h)=>s+sum(h),0);
  const has=p=>hits.some(h=>matches(h,p));
  const byPrefix=p=>hits.filter(h=>matches(h,p)).map(h=>[h.path.slice(('ev/'+p+'/').length),sum(h)]).sort((a,b)=>b[1]-a[1]);
  // 旧版の初戦完了と新しい漏斗は同じ到達点。足し合わせない。
  const first=has('funnel/first-end')?'funnel/first-end':'activation/first-battle-complete';
  return {hits,ev,has,byPrefix,starts:has('start')?ev('start'):null,act:has(first)?ev(first):null,
    unified:has('result/天下統一')?ev('result/天下統一'):null,review:reviewMetrics(hits),
    loadSlow:ev('load/8s')+ev('load/slow'),loadTot:ev('load'),first};
}
export function insights(c){
  const out=[],add=(lv,t,why,how,key)=>out.push({lv,t,why,how,key});
  if(!c.hits.length){add('急','アプリ内の計測がまだありません','アプリと確認できる出来事が届いていません。旧記録は端末不明です','端末の印を付けた版を配信し、実機で開始・初戦完了・統一・離脱の到着を確認する','app-measure');return out;}
  if(c.act===null||c.unified===null)add('中','アプリの漏斗に未計測の段があります','印がない段をゼロや離脱と断定できません','端末の印が付いた版と到達時の送信を確認する','app-stages');
  if(c.starts>=20&&c.act!==null&&c.act/c.starts<.4)add('急',`アプリの初戦完了が少ない（${Math.round(c.act/c.starts*100)}％）`,'アプリの遊び始めに比べ初戦完了の記録が少ない','初戦の操作説明と自動で戦う導線を実機で確かめる','firstbattle');
  if(c.loadTot>=20&&c.loadSlow/c.loadTot>=.35)add('急','アプリの起動が遅い','八秒以上の読み込みが35％以上','実機で起動時間を測り、読み込みを軽くする','load');
  const errs=c.byPrefix('err').filter(([k])=>!/postMessa|Script error|ResizeObserver|fbclid|instantMessag|invoking/i.test(k));
  if(errs.length||c.review.faults)add('急',`アプリの不具合が ${errs.reduce((s,[,n])=>s+n,0)+c.review.faults}回`,'アプリ由来の不具合印があります（重複送信を含む回数）','場面と版を確認して実機で再現する','err');
  const scenes=Object.entries(c.review.scenes).sort((a,b)=>b[1]-a[1]);
  if(scenes[0]?.[1]>=5)add('急',`アプリの早い離脱候補が ${scenes[0][1]}回`,'三十分未満で裏へ移動した場面があります','離脱が多い場面と直後の復帰を見て、操作と知らせを確かめる','early');
  if(!out.length)add('良','アプリの数を継続して見る','急ぎの指摘はありません','初戦完了と場面ごとの離脱を翌週も比べる','app-watch');
  return out;
}

export function read(range='d7'){
  const DATA=JSON.parse(fs.readFileSync(path.join(HERE,'stats.json'),'utf8'));
  const c=derive(DATA,range); if(!c) return {generated:DATA.generated, range, items:[]};
  return {generated:DATA.generated, range, scope:"アプリのみ", starts:c.starts, act:c.act, unified:c.unified, review:c.review, items:insights(c)};
}

if(process.argv[1] && process.argv[1].endsWith('insight.mjs')){
  const range=process.argv.find(a=>/^(d1|d7|d30|d90|all)$/.test(a))||'d7';
  const r=read(range);
  if(process.argv.includes('--json')) console.log(JSON.stringify(r,null,1));
  else {
    console.log(`== 数の読み取り（${r.range}／更新 ${r.generated}）　アプリのみ　遊び始め ${r.starts??"未計測"}／初戦を終えた ${r.act??"未計測"}／統一 ${r.unified??"未計測"}`);
    for(const a of r.items) console.log(`【${a.lv}】${a.t}\n    なぜ：${a.why}\n    どうする：${a.how}\n    印：${a.key}`);
  }
}
