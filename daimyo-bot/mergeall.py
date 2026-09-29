# 第257巡（作り手：試遊者を一万人に。ギット上で回す）
# 各組が書き出した JSON を集めて、一つの報告書（日本語）にまとめる。
# つかいかた: python3 tools/test/mergeall.py <集める所> [出す報告書.md] [出す findings.json]
import sys, os, json, glob, datetime, collections

SRC=sys.argv[1] if len(sys.argv)>1 else '/tmp/p100'
MD=sys.argv[2] if len(sys.argv)>2 else os.path.join(SRC,'REPORT.md')
FJ=sys.argv[3] if len(sys.argv)>3 else os.path.join(SRC,'findings.json')

# 直す順番（上から重い）
ORDER=["落ちた","記録","詰まり","決まらない","数がおかしい","辻褄","矛盾","決まりに反する","携帯で崩れる",
       "使いづらい","見やすさ","遊びやすさ","不快","理不尽","待たされる","重い","退屈","起きない","驚く","文の粗","終わり"]
def rank(k):
    return ORDER.index(k) if k in ORDER else len(ORDER)

files=sorted(glob.glob(os.path.join(SRC,'**','*.json'), recursive=True))
files=[f for f in files if os.path.basename(f) not in ('findings.json','personas.json')]
people=[]
for f in files:
    try: d=json.load(open(f,encoding='utf-8'))
    except Exception: continue
    if isinstance(d,dict) and 'runs' in d: people.append(d)

by=collections.OrderedDict()        # (kind,title) -> 件数・言った人・例
per_base=collections.Counter()      # 性格ごとの件数
per_view=collections.Counter()      # 画面の寸法ごとの件数
per_person=[]                       # 一人ずつの成績
nrun=nfatal=0; days=battles=stalls=0; ends=collections.Counter()

for p in people:
    pid=p.get('persona','?'); nm=p.get('name',pid); base=p.get('base') or pid.split('_')[0]
    v=p.get('view') or []; vs=f"{v[0]}×{v[1]}" if len(v)==2 else "?"
    cnt=0; fat=0
    for d in p.get('runs',[]):
        nrun+=1
        days+=int(d.get('days') or 0); battles+=int(d.get('battles') or 0); stalls+=int(d.get('stalls') or 0)
        if d.get('result'): ends[str(d['result'])]+=1
        if d.get('fatal'): nfatal+=1; fat+=1
        for f in d.get('findings',[]):
            k=(f.get('kind'),f.get('title')); cnt+=1
            e=by.setdefault(k,{'n':0,'who':set(),'ex':[],'fix':''})
            e['n']+=1; e['who'].add(nm)
            if f.get('fix') and not e['fix']: e['fix']=f['fix']
            if len(e['ex'])<5: e['ex'].append({**f,'who':nm})
            per_base[base]+=1; per_view[vs]+=1
    per_person.append({'id':pid,'name':nm,'view':vs,'n':cnt,'fatal':fat,'runs':len(p.get('runs',[]))})

today=datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
out=[]
out.append(f"# 戦国大名　試遊の報告（{today}）")
out.append("")
out.append(f"**{len(people)}人**が遊びました（合わせて {nrun} 回・のべ {days} 日ぶん）。"
           f"合戦 {battles}（決まらなかった合戦 {stalls}）。途中で落ちた回 {nfatal}。")
if ends:
    out.append("結末：" + "、".join(f"{k} {n}回" for k,n in ends.most_common()))
out.append("")
kinds=collections.Counter(k[0] for k in by)
out.append(f"見つかった所は **{len(by)}種・{sum(v['n'] for v in by.values())}件**"
           + ("（" + "、".join(f"{k} {n}" for k,n in sorted(kinds.items(), key=lambda x:rank(x[0]))) + "）" if kinds else "") + "。")
out.append("")

# 第257巡（kaito：詰まる所・苛々する所を突き詰めて全部消す）：遊び手が困った声だけを先に出す
IRA=["詰まり","決まらない","使いづらい","待たされる","理不尽","不快","退屈","起きない","見やすさ","遊びやすさ","携帯で崩れる"]
ira=[(k,v) for k,v in by.items() if k[0] in IRA]
if ira:
    out.append("## 遊び手が困った所（人の多い順）\n")
    for (kind,title),v in sorted(ira, key=lambda x:(-len(x[1]['who']), -x[1]['n']))[:12]:
        out.append(f"- **{len(v['who'])}人**【{kind}】{title}" + (f"　→ {v['fix']}" if v['fix'] else ""))
    out.append("")
if not by:
    out.append("## 見つかった所\n\nなし。この遊び方では、おかしな所は出ませんでした。\n")
else:
    out.append("## 見つかった所（重い順・言った人の多い順）\n")
    for (kind,title),v in sorted(by.items(), key=lambda x:(rank(x[0][0]), -len(x[1]['who']), -x[1]['n'])):
        out.append(f"### 【{kind}】{title}")
        out.append(f"{len(v['who'])}人が言った・{v['n']}件" + (f"／直し方：{v['fix']}" if v['fix'] else ""))
        for f in v['ex']:
            det=(f.get('detail') or '').replace('\n',' ')
            out.append(f"- {f.get('who','')}　{f.get('sc','')}／{f.get('stage') or '―'}　{f.get('when','')}　{det}")
        out.append("")

out.append("## 性格ごとの声の多さ\n")
for k,n in per_base.most_common(): out.append(f"- {k}：{n}件")
out.append("")
out.append("## 画面の寸法ごとの声の多さ（横持ち・幅×高さ）\n")
for k,n in per_view.most_common(): out.append(f"- {k}：{n}件")
out.append("")
out.append("## 一人ずつ\n")
out.append("| 試遊者 | 画面 | 回 | 声 | 落ちた |")
out.append("|---|---|---|---|---|")
for q in sorted(per_person, key=lambda x:(-x['fatal'],-x['n'])):
    out.append(f"| {q['name']}（{q['id']}） | {q['view']} | {q['runs']} | {q['n']} | {q['fatal'] or ''} |")
out.append("")

open(MD,'w',encoding='utf-8').write("\n".join(out)+"\n")
json.dump({'at':today,'people':len(people),'runs':nrun,'fatal':nfatal,
           'findings':[{'kind':k[0],'title':k[1],'n':v['n'],'who':sorted(v['who']),'fix':v['fix'],'ex':v['ex']}
                       for k,v in sorted(by.items(), key=lambda x:(rank(x[0][0]),-len(x[1]['who'])))],
           'per_person':per_person},
          open(FJ,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"まとめた：{len(people)}人・{nrun}回・{len(by)}種の声 → {MD}")
