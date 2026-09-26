/* 第253巡（作り手：管理画面を見なくても、毎朝クロードが数を読んで、自分で手を打てるように）
   admin/stats.json から「読み取れること・次の一手」を出す。admin/index.html の同じ規則を
   ここに写してある（どちらかを直したら、もう一方も直すこと）。
   使い方: node admin/insight.mjs [d1|d7|d30|d90|all] [--json] */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));

export function derive(DATA, RANGE='d7'){
  const R=(DATA.ranges||{})[RANGE]; if(!R) return null;
  const hits=R.hits||[], tot=R.total||{};
  const sumStats=h=>(h.stats||[]).reduce((s,d)=>s+(d.daily||0),0);
  let days=(tot.stats||[]).map(d=>({day:d.day,n:d.daily||0}));
  if(!days.length){ const m={}; for(const h of hits){ if(h.event) continue; for(const d of (h.stats||[])) m[d.day]=(m[d.day]||0)+(d.daily||0); } days=Object.keys(m).sort().map(k=>({day:k,n:m[k]})); }
  const evTot=+(tot.total_events||0), rawTot=days.reduce((s,d)=>s+d.n,0);
  const evByDay={}; for(const h of hits){ if(!h.event) continue; for(const d of (h.stats||[])) evByDay[d.day]=(evByDay[d.day]||0)+(d.daily||0); }
  days=days.map(d=>({day:d.day,n:Math.max(0,d.n-(evByDay[d.day]||0))}));
  const visits=(rawTot&&evTot)?Math.max(0,rawTot-evTot):days.reduce((s,d)=>s+d.n,0);
  const ev=p=>hits.filter(h=>h.event&&h.path.startsWith('ev/'+p)).reduce((s,h)=>s+sumStats(h),0);
  const byPrefix=p=>{ const m={}; for(const h of hits){ if(!h.event||!h.path.startsWith('ev/'+p+'/')) continue; const rest=h.path.slice(('ev/'+p+'/').length); m[rest]=(m[rest]||0)+sumStats(h); } return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const systems=((DATA.breakdown||{}).systems||{}).stats||[];
  return {
    days, visits, ev, byPrefix, systems,
    starts:ev('start'), act:ev('activation/first-battle-complete'),
    results:ev('result'), fundOpen:ev('fund/open'), fundClick:ev('fund-click'),
    adClicks: byPrefix('src').filter(([k])=>/^meta/.test(k)).reduce((a,[,n])=>a+n,0)||ev('src/meta'),
    loadFast:ev('load/1s'), load3:ev('load/3s'), loadSlow:ev('load/8s')+ev('load/slow'),
    get loadTot(){ return this.loadFast+this.load3+this.loadSlow; },
  };
}

export function insights(c){
  const out=[]; const add=(lv,t,why,how,key)=>out.push({lv,t,why,how,key});
  const pct0=(a,b)=>b?Math.round(a/b*100):0;
  const startPct=pct0(c.starts,c.visits), actPct=pct0(c.act,c.starts), lateSlow=pct0(c.loadSlow,c.loadTot||1);
  const lpv=c.byPrefix('lp/view').reduce((a,[,n])=>a+n,0), fromLp=c.ev('from/lp');
  const appClicks=c.byPrefix('lp').filter(([k])=>/appstore_click$/.test(k)).reduce((a,[,n])=>a+n,0);
  const iosShare=(()=>{ const tot=c.systems.reduce((a,x)=>a+x.count,0)||1; const ios=(c.systems.find(x=>/iOS/i.test(x.name||x.id||''))||{}).count||0; return Math.round(ios/tot*100); })();
  const errRows=c.byPrefix('err').concat(c.byPrefix('err-ext'));
  const isExt=k=>/postMessa|Script error|ResizeObserver|fbclid|instantMessag|invoking/i.test(k);
  const ownErr=errRows.filter(([k])=>!isExt(k)).reduce((a,[,n])=>a+n,0);
  const ownErrTop=errRows.filter(([k])=>!isExt(k)).slice(0,5);
  const ret=c.ev('user/return'), neu=c.ev('user/new');
  /* 第253巡：アプリとウェブの内訳（この版から分かれる） */
  const appStart=c.ev('plat/app/start'), webStart=c.ev('plat/web/start');
  if(appStart+webStart>=20 && appStart>0 && appStart<(appStart+webStart)*0.15)
    add('中',`遊び始めのうちアプリは ${Math.round(appStart/(appStart+webStart)*100)}％`,'ほとんどがブラウザ版で、アプリに来ていない','紹介ページと本編で App Store の札を上に','plat-app');
  if(c.loadTot>=20&&lateSlow>=35) add('急',`開くのが遅い（八秒以上が ${lateSlow}％）`,'広告から来た人は数秒で去る。ここが一番大きな漏れ口','本編の読み込みを軽くする（絵と台本の後回し）。広告の行き先は紹介ページ（/lp/）に','load');
  if(c.visits>=80&&startPct<20) add('急',`遊び始めが少ない（訪問の ${startPct}％）`,'表紙で止まっている。何のゲームか、一目で分からない恐れ','表紙の一文と絵を見直す。〈ゲームをはじめる〉までの手数を増やさない','start');
  else if(c.visits>=80&&startPct>=35) add('良',`入口は通っている（訪問の ${startPct}％が遊び始め）`,'表紙は効いている','この率を保ったまま人を増やす','start-ok');
  if(c.starts>=20&&actPct<40) add('急',`最初の合戦を終えた人が少ない（遊び始めの ${actPct}％）`,'最初の戦で躓いている。操作か難しさ','長篠の最初の戦を易しく。〈自動で戦う〉を目立たせる。手引きの一行を戦の始めに','firstbattle');
  else if(c.starts>=20&&actPct>=60) add('良',`最初の合戦まで届いている（${actPct}％）`,'合戦は伝わっている','次は二戦目・筋書きの続きへ','firstbattle-ok');
  if(c.adClicks>=50&&lpv<c.adClicks*0.3) add('中',`広告が本編に直行している（紹介ページの表示 ${lpv}／広告 ${c.adClicks}）`,'重い本編に直接落としている','広告の行き先を /lp/ に変える（作り手の手元の作業）','ad-lp');
  if(fromLp>0) add('良',`紹介ページから本編へ ${fromLp}人`,'導線は働いている','LP 経由と直行の遊び始め率を見比べる','lp-ok');
  if(iosShare>=60&&appClicks===0&&lpv>=10) add('中',`iPhone の人が ${iosShare}％なのに App Store が押されていない`,'ブラウザ版で完結している','紹介ページの App Store の札を上に。本編にも「アプリなら続きが残る」の一行を','appstore');
  if(c.fundOpen>=10&&c.fundClick===0) add('中',`軍資金の札は ${c.fundOpen}回開かれたが、額を押した人は 0`,'札の一枚目で金額に届いていない','一枚目に大きな〈軍資金を出す〉があるか確かめる','fund');
  if(neu>=30&&ret/Math.max(1,neu)<0.12) add('中',`戻って来る人が少ない（新しい人 ${neu}／戻って来た人 ${ret}）`,'一度きりで終わっている','〈つづきから〉を表紙で目立たせる。一戦終えた人に「続きは残ります」と一言','return');
  if(ownErr>0) add('急',`こちらの不具合が ${ownErr}件`,'ゲームの中で落ちている','どの画面で出たかを見て直す：'+ownErrTop.map(([k,n])=>`${k}(${n})`).join('、'),'err');
  if(c.results===0&&c.starts>=20) add('良','結びが 0 なのは普通','一つの筋書きを最後まで遊ぶには何時間もかかる','日ごとの手応えは「初戦を終えた」で見る','result');
  if(!out.length) add('良','まだ数が少ない','読み取るには人が足りない','人を増やしてから見る','few');
  return out;
}

export function read(range='d7'){
  const DATA=JSON.parse(fs.readFileSync(path.join(HERE,'stats.json'),'utf8'));
  const c=derive(DATA,range); if(!c) return {generated:DATA.generated, range, items:[]};
  return {generated:DATA.generated, range, visits:c.visits, starts:c.starts, act:c.act, items:insights(c)};
}

if(process.argv[1] && process.argv[1].endsWith('insight.mjs')){
  const range=process.argv.find(a=>/^(d1|d7|d30|d90|all)$/.test(a))||'d7';
  const r=read(range);
  if(process.argv.includes('--json')) console.log(JSON.stringify(r,null,1));
  else {
    console.log(`== 数の読み取り（${r.range}／更新 ${r.generated}）　訪問 ${r.visits}／遊び始め ${r.starts}／初戦を終えた ${r.act}`);
    for(const a of r.items) console.log(`【${a.lv}】${a.t}\n    なぜ：${a.why}\n    どうする：${a.how}\n    印：${a.key}`);
  }
}
