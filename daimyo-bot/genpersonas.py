# 第257巡（作り手：試遊者を一万人に。ギット上で回す）
# 十の性格 × 十の変わり種（端末・我慢・慣れ）× 十の癖（遊び方）× 十の気分（数の揺らぎ）
# ＝ 一万人の試遊者を作り、personas.json に書き出す。
# つかいかた: python3 tools/test/genpersonas.py
import json, os
HERE=os.path.dirname(os.path.abspath(__file__))

# 元になる十の性格（tools/test/persona.js と同じ中身。ここが親）
BASE=json.loads(open(os.path.join(HERE,'persona_base.json'),encoding='utf-8').read())

# 変わり種：端末・我慢・慣れ。携帯はすべて横持ち（幅×高さ）
VAR=[
 ("a","小さい画面でせっかち",   (667,375), 0.6, 0.8, "初"),
 ("b","小さい画面でのんびり",   (667,375), 1.5, 1.4, "初"),
 ("c","よくある画面で普通",     (844,390), 1.0, 1.0, "普"),
 ("d","よくある画面で気が短い", (844,390), 0.5, 0.7, "熟"),
 ("e","大きい画面でのんびり",   (932,430), 1.6, 1.5, "普"),
 ("f","大きい画面で目が厳しい", (932,430), 1.1, 1.0, "熟"),
 ("g","細い安物の画面",         (640,360), 0.8, 0.9, "普"),
 ("h","大きめの安物の画面",     (915,412), 1.2, 1.1, "初"),
 ("i","片手で持って遊ぶ",       (852,393), 0.9, 1.0, "普"),
 ("j","じっくり突き詰める",     (874,402), 1.8, 1.6, "熟"),
]
# 慣れ（初＝説明を読まない・命じる数が少ない／熟＝手数が多い・自動に頼らない）
SKILL={"初":{"guide":False,"auto":+0.15,"orderRate":-0.15,"clickRate":+0.10},
       "普":{"guide":True, "auto":0.0,  "orderRate":0.0,  "clickRate":0.0},
       "熟":{"guide":True, "auto":-0.20,"orderRate":+0.20,"clickRate":-0.05}}
# 遊び方の癖（十通り）。同じ性格・同じ端末でも手の出し方が違う。
#   足し引き：auto/orderRate/clickRate は割合に足す。waitMs/dullDays などは倍率に足す
HABIT=[
 ("1","素直に遊ぶ",         {}),
 ("2","釦をよく押す",       {"clickRate":0.15}),
 ("3","ほとんど押さない",   {"clickRate":-0.25,"orderRate":-0.15}),
 ("4","采配を任せがち",     {"auto":0.25,"orderRate":-0.20}),
 ("5","自分で全部命じる",   {"auto":-0.30,"orderRate":0.25}),
 ("6","速さを上げて進める", {"speed":3,"mWait":-0.4}),
 ("7","一手ずつ確かめる",   {"speed":1,"mWait":0.6,"mDull":0.3}),
 ("8","合戦を長く見る",     {"mShort":0.5,"mDull":0.2}),
 ("9","すぐ次へ行く",       {"mShort":-0.3,"mStuck":-0.3,"mWait":-0.3}),
 ("0","気まぐれ",           {"clickRate":0.1,"orderRate":0.1,"auto":0.1,"mStuck":-0.2}),
]
# 気分（十通り）：同じ人でもその日の手つきは違う。数を少しずつ揺らす（決まった揺らし方）
MOOD=[("0","",0.0),("1","／今日は慎重",-0.10),("2","／今日は大胆",0.10),("3","／少し疲れ気味",-0.06),
      ("4","／乗っている",0.06),("5","／気が散る",-0.03),("6","／集中",0.03),
      ("7","／苛々",-0.08),("8","／上機嫌",0.08),("9","／いつも通り",0.0)]
def clamp(x,lo=0.05,hi=0.95): return round(max(lo,min(hi,x)),2)

out={}
for bid,b in BASE.items():
    for vk,vlabel,view,pat,wait,skill in VAR:
        s=SKILL[skill]
        for hk,hlabel,h in HABIT:
            p=dict(b)
            p["name"]=f"{b['name']}・{vlabel}・{hlabel}"
            p["view"]=[view[0],view[1]]
            p["base"]=bid; p["variant"]=vk; p["habit"]=hk; p["skill"]=skill
            p["guide"]=bool(b.get("guide")) and s["guide"]
            p["auto"]=clamp(b.get("auto",0.5)+s["auto"]+h.get("auto",0))
            p["orderRate"]=clamp(b.get("orderRate",0.5)+s["orderRate"]+h.get("orderRate",0))
            p["clickRate"]=clamp(b.get("clickRate",0.5)+s["clickRate"]+h.get("clickRate",0))
            p["dullDays"]=max(12,int(round(b.get("dullDays",40)*pat*(1+h.get("mDull",0)))))
            p["shortBattleSec"]=max(3,int(round(b.get("shortBattleSec",9)*min(1.4,pat)*(1+h.get("mShort",0)))))
            p["stuckSec"]=max(5,int(round(b.get("stuckSec",12)*pat*(1+h.get("mStuck",0)))))
            p["waitMs"]=max(200,int(round(b.get("waitMs",700)*wait*(1+h.get("mWait",0)))))
            if "speed" in h: p["speed"]=h["speed"]
            elif "speed" in b: p["speed"]=b["speed"]
            # 細い画面・片手・目が厳しい人は、携帯の崩れと決まりを厳しく見る
            if view[0]<=700 or vk in("g","i"): p["strictMobile"]=True
            if vk in("f","j") or bid in("ui","keitai"): p["strictMobile"]=True
            if vk=="f" or bid=="ui": p["strictRules"]=True
            for mk,mlabel,m in MOOD:
                q=dict(p)
                q["name"]=p["name"]+mlabel
                q["mood"]=mk
                q["auto"]=clamp(p["auto"]+m)
                q["orderRate"]=clamp(p["orderRate"]+m)
                q["clickRate"]=clamp(p["clickRate"]-m*0.5)
                q["dullDays"]=max(12,int(round(p["dullDays"]*(1+m))))
                q["stuckSec"]=max(5,int(round(p["stuckSec"]*(1+m))))
                q["waitMs"]=max(200,int(round(p["waitMs"]*(1-m))))
                out[f"{bid}_{vk}{hk}{mk}"]=q

path=os.path.join(HERE,'personas.json')
open(path,'w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=1)+"\n")
print(f"{len(out)}人 書き出した: {path}")
