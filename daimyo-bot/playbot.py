# 第253巡：テストプレイの bot を何回か走らせ、日本語の報告書にまとめる
# 使い方: python3 tools/test/playbot.py [回数] [一回の日数]   例: python3 tools/test/playbot.py 5 200
import sys, os, json, time, subprocess, datetime, urllib.request
HERE=os.path.dirname(os.path.abspath(__file__)); SRC=os.path.join(HERE,'..','..')
sys.path.insert(0, HERE)
from cdp import CDP
MOBILE=os.environ.get('MOBILE')   # 第253巡：狭い画面（iPhone の幅）で遊ばせる
PERSONA=os.environ.get('PERSONA')   # 第256巡：五人の試遊者（性格ごとに画面も我慢も違う）
# 第256巡（作り手：画面はみんなスマホで）：五人とも携帯の寸法。機種の幅だけ変える
# 第256巡（作り手：携帯は横画面で見る）：十人とも横持ち
PERSONA_VIEW={'hajime':(844,390,3),'sekkachi':(852,393,3),'rekishi':(932,430,3),'kouritsu':(874,402,3),'keitai':(667,375,3),
  'ui':(896,414,3),'ux':(844,390,3),'futsuu_ikusa':(852,393,3),'futsuu_sodate':(932,430,3),'futsuu_kachi':(874,402,3)}
# 第257巡（作り手：試遊者を一万人に）：名簿は personas.json（十の性格×十の変わり種×十の癖×十の気分）
P100={}
try:
    import json as _j
    _pf=os.path.join(HERE,'personas.json')
    if not os.path.exists(_pf):
        subprocess.run(['python3',os.path.join(HERE,'genpersonas.py')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    P100=_j.load(open(_pf,encoding='utf-8'))
except Exception: P100={}
BPORT=int(os.environ.get('BPORT','8732'))   # 頁を出す口（並べて回す時に変える）
BASEURL="http://localhost:%d"%BPORT
def newCDP():
    if PERSONA and PERSONA in PERSONA_VIEW:
        w,h,d=PERSONA_VIEW[PERSONA]; return CDP(w,h,d)
    if PERSONA and PERSONA in P100:
        v=P100[PERSONA].get('view') or [844,390]; return CDP(int(v[0]),int(v[1]),3)
    return CDP(390,844,2) if MOBILE else CDP()
def persona_js():
    """試遊者の性格を頁に流し込む。百人の名簿にいればその一人分だけを渡す"""
    if not PERSONA: return None
    if PERSONA in P100:
        import json as _j
        one=_j.dumps({PERSONA:P100[PERSONA]},ensure_ascii=False)
        return "window.__PERSONA=%r; window.PERSONAS=Object.assign(window.PERSONAS||{}, %s); 1" % (PERSONA, one)
    return "window.__PERSONA=%r; " % PERSONA + "fetch('/tools/test/persona.js').then(r=>r.text()).then(eval)"
def inject(c):
    j=persona_js()
    if not j: return
    c.js(j)
    if PERSONA not in P100: time.sleep(1.2)
N=int(sys.argv[1]) if len(sys.argv)>1 else 3
DAYS=int(sys.argv[2]) if len(sys.argv)>2 else 200
SCS=os.environ.get('SC','').split(',') if os.environ.get('SC') else [None]*N
if len(SCS)==1 and N>1: SCS=SCS*N   # 第253巡：筋書きを一つだけ渡したら、全部その筋書きで遊ぶ
CLANS=os.environ.get('CLANS','').split(',') if os.environ.get('CLANS') else None   # 第253巡：家を名指しで（ALL=1 なら筋書きの全大名）
ALL=os.environ.get('ALL')
try: urllib.request.urlopen(BASEURL+"/tenkafubu.html")
except Exception:
    subprocess.Popen(['python3',os.path.join(SRC,'srv.py')],env=dict(os.environ,PORT=str(BPORT)),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.0)
js=open(os.path.join(HERE,'playbot.js'),encoding='utf-8').read()
ALLSC=os.environ.get('ALLSC')   # 第253巡：全ての筋書き × 全ての大名
def clans_of(sc_):
    c=newCDP(); c.goto(BASEURL+"/tenkafubu.html?shot=2")
    c.js("fetch('/harness.js').then(r=>r.text()).then(eval)")
    inject(c)
    c.js("(()=>{ H.install(); window.drawMap=function(){}; return 1; })()")
    r=c.js("(()=>{ try{ buildWorld(0,'%s'); return JSON.stringify(Object.values(W.clans).filter(k=>!k.dead&&Object.values(W.castles).some(x=>x.clan===k.id)).map(k=>k.name)); }catch(e){ return '[]'; } })()" % sc_)
    c.close()
    try: return json.loads(r)
    except Exception: return []
def scenarios_all():
    c=newCDP(); c.goto(BASEURL+"/tenkafubu.html?shot=2")
    c.js("fetch('/harness.js').then(r=>r.text()).then(eval)")
    inject(c)
    r=c.js("(()=>{ try{ return JSON.stringify(Object.keys(SCENARIO_DEFS).filter(k=>SCENARIO_DEFS[k]&&SCENARIO_DEFS[k].shown!==false)); }catch(e){ return '[]'; } })()")
    c.close()
    try: return json.loads(r)
    except Exception: return []
if ALLSC:
    SCS=[]; CLANS=[]
    only=os.environ.get('SC')
    for sc_ in (only.split(',') if only else scenarios_all()):
        cs=clans_of(sc_)
        print(f"== {sc_}：大名 {len(cs)} 家", flush=True)
        for cn in cs: SCS.append(sc_); CLANS.append(cn)
    N=len(SCS)
    print(f"合わせて {N} 回遊びます", flush=True)
    ALL=None
if ALL:
    sc0=(SCS[0] or 'nagashino')
    c=newCDP(); c.goto(BASEURL+"/tenkafubu.html?shot=2")
    c.js("fetch('/harness.js').then(r=>r.text()).then(eval)")
    inject(c)
    c.js("(()=>{ H.install(); window.drawMap=function(){}; return 1; })()")
    r=c.js("(()=>{ try{ buildWorld(0,'%s'); return JSON.stringify(Object.values(W.clans).filter(k=>!k.dead&&Object.values(W.castles).some(x=>x.clan===k.id)).map(k=>k.name)); }catch(e){ return '[]'; } })()" % sc0)
    c.close()
    try: CLANS=json.loads(r)
    except Exception: CLANS=[]
    N=len(CLANS); SCS=[sc0]*N
    print(f"{sc0} の大名 {N} 家：{'、'.join(CLANS)}")
runs=[]
for i in range(N):
    c=newCDP(); c.goto(BASEURL+"/tenkafubu.html?shot=2")
    c.js("fetch('/harness.js').then(r=>r.text()).then(eval)")
    inject(c)
    cfg={"days":DAYS,"seed":(i+1)*7919,"battles":16}
    if i < len(SCS) and SCS[i]: cfg["sc"]=SCS[i]
    if CLANS and i < len(CLANS) and CLANS[i]: cfg["clan"]=CLANS[i]
    c.js("window.__K="+json.dumps(cfg,ensure_ascii=False)+";1")
    r=c.js("(async()=>{ try{ "+js+" }catch(e){ return JSON.stringify({fatal:(e&&e.message)||String(e)}); } })()")
    try: d=json.loads(r) if isinstance(r,str) else r
    except Exception: d={"fatal":str(r)[:300]}
    runs.append(d); c.close()
    print(f"[{i+1}/{N}] {d.get('sc','?')} / {d.get('clan','?')} 見つけた所 {len(d.get('findings',[]))}", flush=True)
# まとめ
by={}
for d in runs:
    for f in d.get('findings',[]):
        k=(f.get('kind'),f.get('title'))
        by.setdefault(k,{'n':0,'ex':[]})
        by[k]['n']+=1
        if len(by[k]['ex'])<4: by[k]['ex'].append(f)
today=datetime.date.today().isoformat()
out=[f"# 戦国大名　テストプレイの報告（{today}）","",
     f"bot が {len(runs)} 回遊びました（一回 {DAYS} 日ぶん）。",""]
out.append("## 遊んだ筋書き")
for d in runs:
    out.append(f"- {d.get('sc','?')}／{d.get('clan','?')}　{d.get('days',0)}日　合戦 {d.get('battles',0)}（決まらなかった合戦 {d.get('stalls',0)}）　{d.get('end','')}　城 {d.get('castles','?')}"+(f"　※途中で落ちた：{d['fatal']}" if d.get('fatal') else ""))
out.append("")
if not by:
    out.append("## 見つかった所\n\nなし。今回の遊び方では、おかしな所は出ませんでした。")
else:
    out.append("## 見つかった所（多い順）\n")
    for (kind,title),v in sorted(by.items(), key=lambda x:-x[1]['n']):
        out.append(f"### 【{kind}】{title}（{v['n']}件）")
        for f in v['ex']:
            out.append(f"- {f.get('sc','')}／{f.get('stage','') or '―'}　{f.get('when','')}　{f.get('detail','')}")
        out.append("")
# 第253巡（作り手：報告はデスクトップに貼らず、そのまま Claude へ）：報告は画面に出すだけ
print("\n".join(out))
# 第257巡：百人分をまとめられるように、そのままの中身も書き出す
OUTJSON=os.environ.get('OUTJSON')
if OUTJSON:
    rec={"persona":PERSONA or "bot","name":(P100.get(PERSONA,{}) or {}).get("name") or (PERSONA or "bot"),
         "view":(P100.get(PERSONA,{}) or {}).get("view"),"base":(P100.get(PERSONA,{}) or {}).get("base"),
         "days":DAYS,"runs":runs,"at":datetime.datetime.now().isoformat(timespec='seconds')}
    with open(OUTJSON,'w',encoding='utf-8') as f: json.dump(rec,f,ensure_ascii=False)
    print("書き出した:",OUTJSON)
