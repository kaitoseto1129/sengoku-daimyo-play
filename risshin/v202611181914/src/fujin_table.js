// 布陣の表（自動で作る。手で直さない）：prototype/tools/fujin_table_build.mjs が docs/fujin/<戦id>.md の表から作る（束A・docs/ledger_plan_1114.md）
// FUJIN_TABLE[戦id] = { line, src, title, sides: [{ side（見出し）, rows: [{ tai, taisho, hei, n, pos, xz?, note?, house?, mon?（flagTexture の名）, flag?{ ground, fig, color }, jinkei（推定）, w?・d?（塊の幅と奥行き m） }] }], zukan?: [{ side, n }]（図鑑の総数） }
export const FUJIN_TABLE = {
 "inou": {
  "line": "oda",
  "src": "docs/fujin/inou.md",
  "title": "稲生の戦い（弘治二年・1556年八月二十四日）の布陣",
  "sides": [
   {
    "side": "信長方（南・＋z）約七百",
    "rows": [
     {
      "tai": "前の列（中）",
      "taisho": "―",
      "hei": "250",
      "n": 250,
      "pos": "街道の北向き。本物の組",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 35,
      "d": 18
     },
     {
      "tai": "前の列（左・右）",
      "taisho": "―",
      "hei": "120・120",
      "n": 240,
      "pos": "同じ列の両の端",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 35,
      "d": 17
     },
     {
      "tai": "旗本",
      "taisho": "織田信長",
      "hei": "60",
      "n": 60,
      "pos": "列の後ろ。のち自ら前へ出て一喝",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 12,
      "d": 12
     },
     {
      "tai": "名塚の砦",
      "taisho": "佐久間盛重",
      "hei": "100",
      "n": 100,
      "pos": "右の後ろ（東）。動かない",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "後詰",
      "taisho": "―",
      "hei": "50",
      "n": 50,
      "pos": "列の後ろ",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 9,
      "d": 14
     }
    ]
   },
   {
    "side": "信勝方（北・−z）約千七百",
    "rows": [
     {
      "tai": "先手",
      "taisho": "柴田勝家",
      "hei": "700＋300（右の端）",
      "n": 1000,
      "pos": "街道筋の正面。南向き",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "一の備（左）",
      "taisho": "林美作守（通具）",
      "hei": "700",
      "n": 700,
      "pos": "西の田から南へ",
      "house": "織田（信勝方）",
      "mon": "nobukatsu",
      "flag": {
       "ground": "白",
       "fig": "黒の織田木瓜",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 50,
      "d": 35
     },
     {
      "tai": "控え",
      "taisho": "林秀貞・津々木蔵人",
      "hei": "150・100",
      "n": 250,
      "pos": "奥。出ない",
      "house": "織田（信勝方）",
      "mon": "nobukatsu",
      "flag": {
       "ground": "白",
       "fig": "黒の織田木瓜",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 20,
      "d": 32
     },
     {
      "tai": "本陣",
      "taisho": "織田信勝",
      "hei": "200",
      "n": 200,
      "pos": "末森の方（さらに奥）。信勝は出陣せず",
      "house": "織田（信勝方）",
      "mon": "nobukatsu",
      "flag": {
       "ground": "白",
       "fig": "黒の織田木瓜",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 22,
      "d": 22
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "信長方",
    "n": 700
   },
   {
    "side": "信行方",
    "n": 1700
   }
  ]
 },
 "okehazama": {
  "line": "oda",
  "src": "docs/fujin/okehazama.md",
  "title": "桶狭間の戦い（永禄三年・1560年五月十九日）の布陣",
  "sides": [
   {
    "side": "織田（二千足らず）",
    "rows": [
     {
      "tai": "先の組（三つ）",
      "taisho": "―",
      "hei": "100×3",
      "n": 300,
      "pos": "谷の出口。本物",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 39,
      "d": 19
     },
     {
      "tai": "本隊・馬廻",
      "taisho": "織田信長（毛利新介・服部小平太）",
      "hei": "1400",
      "n": 1400,
      "pos": "その後ろ。本物は一部",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "騎馬の塊（楔）",
      "w": 76,
      "d": 46
     },
     {
      "tai": "善照寺砦",
      "taisho": "佐久間信盛",
      "hei": "450",
      "n": 450,
      "pos": "遠景（左）",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   },
   {
    "side": "今川（本陣の周りで六千ほど、全軍二万五千前後）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "松井宗信",
      "hei": "600",
      "n": 600,
      "pos": "本陣の前の坂",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 39,
      "d": 39
     },
     {
      "tai": "前の備え",
      "taisho": "―",
      "hei": "500・500",
      "n": 1000,
      "pos": "坂の下",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "備え",
      "taisho": "井伊直盛",
      "hei": "500",
      "n": 500,
      "pos": "左",
      "house": "今川（井伊）",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "今川の二引両（この頃の井伊は今川の家臣）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "旗本",
      "taisho": "今川義元",
      "hei": "3900",
      "n": 3900,
      "pos": "桶狭間山の本陣",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 99,
      "d": 99
     },
     {
      "tai": "鷲津",
      "taisho": "朝比奈泰朝",
      "hei": "2000",
      "n": 2000,
      "pos": "遠景・出ない",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     },
     {
      "tai": "鳴海城",
      "taisho": "岡部元信",
      "hei": "700",
      "n": 700,
      "pos": "遠景・出ない",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "大高城",
      "taisho": "松平元康",
      "hei": "2500",
      "n": 2500,
      "pos": "遠景・出ない",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "今川",
    "n": 25000
   },
   {
    "side": "織田",
    "n": 2000
   }
  ]
 },
 "moribe": {
  "line": "oda",
  "src": "docs/fujin/moribe.md",
  "title": "森部の戦い（永禄四年・1561年五月）の布陣",
  "sides": [
   {
    "side": "織田（約千五百）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "柴田勝家",
      "hei": "300",
      "n": 300,
      "pos": "",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 39,
      "d": 19
     },
     {
      "tai": "本備え",
      "taisho": "―",
      "hei": "300",
      "n": 300,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "左",
      "taisho": "森可成",
      "hei": "200",
      "n": 200,
      "pos": "",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 27,
      "d": 19
     },
     {
      "tai": "右",
      "taisho": "―",
      "hei": "150",
      "n": 150,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "旗本",
      "taisho": "織田信長",
      "hei": "200",
      "n": 200,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 22,
      "d": 22
     },
     {
      "tai": "後詰",
      "taisho": "丹羽長秀・佐久間信盛",
      "hei": "200・200",
      "n": 400,
      "pos": "",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 25,
      "d": 40
     }
    ]
   },
   {
    "side": "斎藤（約六千）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "―",
      "hei": "600",
      "n": 600,
      "pos": "",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 55,
      "d": 27
     },
     {
      "tai": "一の備え",
      "taisho": "日比野下野守・長井甲斐守の手",
      "hei": "1200・1200",
      "n": 2400,
      "pos": "",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 93,
      "d": 65
     },
     {
      "tai": "旗本",
      "taisho": "日比野下野守・長井甲斐守",
      "hei": "400・400",
      "n": 800,
      "pos": "",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 45,
      "d": 45
     },
     {
      "tai": "控え",
      "taisho": "―",
      "hei": "600・600",
      "n": 1200,
      "pos": "",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 43,
      "d": 69
     },
     {
      "tai": "後ろ",
      "taisho": "―",
      "hei": "1500",
      "n": 1500,
      "pos": "",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 48,
      "d": 77
     }
    ]
   }
  ]
 },
 "sunomata": {
  "line": "oda",
  "src": "docs/fujin/sunomata.md",
  "title": "墨俣（永禄九年・1566年九月）の布陣",
  "sides": [
   {
    "side": "織田（砦の内）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "木下藤吉郎",
      "hei": "60",
      "n": 60,
      "pos": "",
      "house": "羽柴",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "五三桐（推定・この頃は織田の永楽銭）",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 12,
      "d": 12
     },
     {
      "tai": "柵の守り",
      "taisho": "前野長康（川並衆・蜂須賀正勝）",
      "hei": "120",
      "n": 120,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "後詰（川向こう・遠景）",
      "taisho": "織田信長",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     }
    ]
   },
   {
    "side": "斎藤（寄せ手）",
    "rows": [
     {
      "tai": "一の手・二の手・三の手",
      "taisho": "―",
      "hei": "300・400・500",
      "n": 1200,
      "pos": "",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "寄せ大将の備",
      "taisho": "斎藤方の寄せ大将（名は伝わらない）",
      "hei": "400",
      "n": 400,
      "pos": "",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 38,
      "d": 26
     },
     {
      "tai": "本陣（稲葉山の方・遠景）",
      "taisho": "斎藤龍興",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     }
    ]
   }
  ]
 },
 "inabayama": {
  "line": "oda",
  "src": "docs/fujin/inabayama.md",
  "title": "稲葉山城（永禄十年・1567）の布陣",
  "sides": [
   {
    "side": "織田（総勢 約一万二千〜一万五千・仮の数）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "織田信長",
      "hei": "3000",
      "n": 3000,
      "pos": "瑞龍寺山（ZUI）・城へ向く",
      "note": "3D：陣幕と旗本・軽い大軍 二塊",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "裏手の仕寄り",
      "taisho": "木下藤吉郎",
      "hei": "1500",
      "n": 1500,
      "pos": "井口の町の北（28,104）",
      "xz": [
       28,
       104
      ],
      "note": "3D：本物の隊（kino）＋厚みの表",
      "house": "羽柴",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "五三桐（推定・この頃は織田の永楽銭）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "大手の仕寄り",
      "taisho": "柴田勝家",
      "hei": "2000",
      "n": 2000,
      "pos": "町の東（52,96）",
      "xz": [
       52,
       96
      ],
      "note": "3D：本物の隊（shiba）",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "大手の控え",
      "taisho": "丹羽長秀",
      "hei": "1500",
      "n": 1500,
      "pos": "町の西寄り（8,116）",
      "xz": [
       8,
       116
      ],
      "note": "3D：本物の隊（niwa）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 48,
      "d": 77
     },
     {
      "tai": "大手左の囲み",
      "taisho": "森可成",
      "hei": "1200",
      "n": 1200,
      "pos": "西の山裾（MORI_YOSE）",
      "note": "3D：部隊（名目 180）",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "大手右の囲み",
      "taisho": "坂井政尚",
      "hei": "1000",
      "n": 1000,
      "pos": "SAKAI_YOSE",
      "note": "3D：部隊（名目 180）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "南の控え",
      "taisho": "佐久間信盛",
      "hei": "1500",
      "n": 1500,
      "pos": "SAKUMA_YOSE",
      "note": "3D：部隊（名目 220）",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 48,
      "d": 77
     },
     {
      "tai": "東の山裾の控え",
      "taisho": "池田恒興",
      "hei": "1000",
      "n": 1000,
      "pos": "IKEDA_YOSE",
      "note": "3D：部隊（弓・名目 160）",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "西麓の控え",
      "taisho": "稲葉良通・氏家直元・安藤守就",
      "hei": "2300",
      "n": 2300,
      "pos": "MINO_YOSE",
      "note": "3D：翌日の囲みで参着（部隊 名目 240）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 60,
      "d": 96
     }
    ]
   },
   {
    "side": "斎藤（城兵 約四千・仮の数）",
    "rows": [
     {
      "tai": "大手の曲輪",
      "taisho": "日根野弘就",
      "hei": "1000",
      "n": 1000,
      "pos": "大手の木戸（OTE）",
      "note": "3D：部隊＋打って出る本物の隊（ote・ote2）",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "東の尾根道の守り",
      "taisho": "長井道利",
      "hei": "800",
      "n": 800,
      "pos": "NAGAI_MAMORI",
      "note": "3D：部隊（弓）",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "西の裏道の曲輪",
      "taisho": "名は伝わらない",
      "hei": "400",
      "n": 400,
      "pos": "KOSHI_MAMORI",
      "note": "3D：部隊",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "二の丸",
      "taisho": "名は伝わらない",
      "hei": "600",
      "n": 600,
      "pos": "NI_MAMORI",
      "note": "3D：部隊",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "本陣",
      "taisho": "斎藤龍興",
      "hei": "1200",
      "n": 1200,
      "pos": "本丸（HON）",
      "note": "3D：本物の旗本・馬廻（tatsu・hata）",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 55,
      "d": 55
     }
    ]
   }
  ]
 },
 "mitsukuri": {
  "line": "oda",
  "src": "docs/fujin/mitsukuri.md",
  "title": "箕作城（永禄十一年・1568）の布陣",
  "sides": [
   {
    "side": "織田（四手の寄せ）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "織田信長",
      "hei": "3000（仮）",
      "n": 3000,
      "pos": "麓の陣（CAMP の南）",
      "note": "3D：陣と軽い大軍",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "大手の仕寄り",
      "taisho": "木下藤吉郎",
      "hei": "2300",
      "n": 2300,
      "pos": "大手道の下（CAMP）",
      "note": "3D：本物の隊（kino）",
      "house": "羽柴",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "五三桐（推定・この頃は織田の永楽銭）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 91,
      "d": 63
     },
     {
      "tai": "西の仕寄り",
      "taisho": "浅井新八",
      "hei": "1700（仮）",
      "n": 1700,
      "pos": "西の谷",
      "note": "3D：本物の隊（niwa の名で持つ手）",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 78,
      "d": 55
     },
     {
      "tai": "大手の控え",
      "taisho": "佐久間信盛",
      "hei": "2000（仮）",
      "n": 2000,
      "pos": "CAMP の東",
      "note": "3D：本物の隊（saku）・後詰で登る",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     },
     {
      "tai": "東の仕寄り",
      "taisho": "丹羽長秀",
      "hei": "3000",
      "n": 3000,
      "pos": "東の口（58,-70）",
      "xz": [
       58,
       -70
      ],
      "note": "3D：軽い大軍（遠景）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     }
    ]
   },
   {
    "side": "六角（城兵 約三千・後の書き物）",
    "rows": [
     {
      "tai": "外の小曲輪",
      "taisho": "名は伝わらない",
      "hei": "800",
      "n": 800,
      "pos": "SAN_C",
      "house": "六角",
      "mon": "rokkaku",
      "flag": {
       "ground": "白",
       "fig": "黒の隅立四つ目（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "二の丸",
      "taisho": "名は伝わらない",
      "hei": "900",
      "n": 900,
      "pos": "NI_C",
      "house": "六角",
      "mon": "rokkaku",
      "flag": {
       "ground": "白",
       "fig": "黒の隅立四つ目（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 57,
      "d": 40
     },
     {
      "tai": "東の曲輪",
      "taisho": "名は伝わらない",
      "hei": "600",
      "n": 600,
      "pos": "(48,-103)",
      "xz": [
       48,
       -103
      ],
      "house": "六角",
      "mon": "rokkaku",
      "flag": {
       "ground": "白",
       "fig": "黒の隅立四つ目（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "本陣",
      "taisho": "吉田出雲守",
      "hei": "700",
      "n": 700,
      "pos": "HON_C",
      "house": "六角",
      "mon": "rokkaku",
      "flag": {
       "ground": "白",
       "fig": "黒の隅立四つ目（推定）",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 42,
      "d": 42
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 60000
   },
   {
    "side": "六角",
    "n": 11000
   }
  ]
 },
 "okawachi": {
  "line": "oda",
  "src": "docs/fujin/okawachi.md",
  "title": "大河内城（永禄十二年・1569）の布陣",
  "sides": [
   {
    "side": "織田（総勢 約五万を目安・方面別の内訳は不明）",
    "rows": [
     {
      "tai": "",
      "taisho": "織田信長",
      "hei": "推定 1万",
      "n": 10000,
      "pos": "城の東の山（HONJIN）",
      "note": "手：本陣",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "",
      "taisho": "斎藤新五・坂井政尚・蜂屋頼隆・簗田弥次右衛門・中条将監・磯野丹波・中条又衛門",
      "hei": "推定 1万",
      "n": 10000,
      "pos": "SIEGE.north",
      "note": "手：北大手の陣",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "",
      "taisho": "柴田勝家・長谷川与次・森可成・不破河内・佐々成政ほか",
      "hei": "推定 1万",
      "n": 10000,
      "pos": "SIEGE.east",
      "note": "手：東の囲み",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "",
      "taisho": "木下藤吉郎・氏家卜全・伊賀伊賀守・飯沼勘平・佐久間信盛・塚本小大膳・市橋九郎右衛門",
      "hei": "推定 1万",
      "n": 10000,
      "pos": "SIEGE.west",
      "note": "手：西の囲み",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "",
      "taisho": "丹羽長秀・池田恒興・稲葉良通・滝川一益・津田掃部・蒲生右兵衛大輔",
      "hei": "推定 1万",
      "n": 10000,
      "pos": "SIEGE.south",
      "note": "手：南の山の陣と封鎖",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "",
      "taisho": "廻番衆（推定）",
      "hei": "推定 300",
      "n": 300,
      "pos": "SOUTH_BLOCK",
      "note": "手：南の通路の番",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     }
    ]
   }
  ]
 },
 "kanegasaki": {
  "line": "oda",
  "src": "docs/fujin/kanegasaki.md",
  "title": "金ヶ崎の退き口（元亀元年・1570）の布陣",
  "sides": [
   {
    "side": "織田（殿の横備え・殿 約三千は仮の数）",
    "rows": [
     {
      "tai": "殿の大将",
      "taisho": "木下藤吉郎",
      "hei": "1000",
      "n": 1000,
      "pos": "金ヶ崎の麓の一の備（LINES[0]）",
      "note": "3D：本物の隊（kino）",
      "house": "羽柴",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "五三桐（推定・この頃は織田の永楽銭）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "川の砦へ助勢",
      "taisho": "池田勝正",
      "hei": "1500",
      "n": 1500,
      "pos": "笙の川の砦（LINES[1]）",
      "note": "3D：本物の隊（ikeda）",
      "house": "池田",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "狭路の砦へ助勢",
      "taisho": "明智光秀",
      "hei": "500",
      "n": 500,
      "pos": "狭路の砦（LINES[2]）",
      "note": "3D：本物の隊（akechi）",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "同盟軍",
      "taisho": "徳川家康",
      "hei": "5000（仮）",
      "n": 5000,
      "pos": "退き道の後ろ",
      "note": "3D：本物の隊（ieyasu）・厚みの表",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 88,
      "d": 141
     },
     {
      "tai": "本隊（朽木越えで退く）",
      "taisho": "織田信長",
      "hei": "3000（仮）",
      "n": 3000,
      "pos": "南の退き道（-36,162。11/18：後ろの列が戦場の端の外へ出たので (-50,172) から道の東へ寄せた）",
      "xz": [
       -36,
       162
      ],
      "note": "3D：厚みの表（自分からは出ない）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "荷駄",
      "taisho": "—",
      "hei": "800（仮）",
      "n": 800,
      "pos": "(-34,140)",
      "xz": [
       -34,
       140
      ],
      "note": "3D：厚みの表",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     }
    ]
   },
   {
    "side": "朝倉（追手 約一万六千は仮の数）",
    "rows": [
     {
      "tai": "北の先手",
      "taisho": "名は伝わらない",
      "hei": "6000",
      "n": 6000,
      "pos": "(-4,-168)",
      "xz": [
       -4,
       -168
      ],
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 173,
      "d": 87
     },
     {
      "tai": "西の追手",
      "taisho": "朝倉景健（厚みの表の先鋒）",
      "hei": "6000",
      "n": 6000,
      "pos": "(-14,-150)",
      "xz": [
       -14,
       -150
      ],
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "疋田方面の追手",
      "taisho": "名は伝わらない",
      "hei": "4000",
      "n": 4000,
      "pos": "(78,-24)",
      "xz": [
       78,
       -24
      ],
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "本隊",
      "taisho": "朝倉義景",
      "hei": "後方",
      "n": null,
      "pos": "(-8,-160)・前線へは出ない",
      "xz": [
       -8,
       -160
      ],
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 30000
   }
  ]
 },
 "anegawa": {
  "line": "oda",
  "src": "docs/fujin/anegawa.md",
  "title": "姉川の戦い（元亀元年・1570年六月二十八日）の布陣",
  "sides": [
   {
    "side": "織田（約二万三千・丹羽の加勢を含む）",
    "rows": [
     {
      "tai": "一の段",
      "taisho": "坂井政尚",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 100,
      "d": 50
     },
     {
      "tai": "二の段",
      "taisho": "池田恒興",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "中の段",
      "taisho": "柴田勝家・森可成",
      "hei": "3000・3000",
      "n": 6000,
      "pos": "",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "後ろの段",
      "taisho": "佐久間信盛",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "本陣（陣杭の柳の伝承）",
      "taisho": "織田信長",
      "hei": "5000",
      "n": 5000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 112,
      "d": 112
     },
     {
      "tai": "東の備え",
      "taisho": "稲葉良通・氏家卜全・安藤守就",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "横山城の囲み（北・南）",
      "taisho": "木下藤吉郎の手",
      "hei": "600・600",
      "n": 1200,
      "pos": "",
      "house": "羽柴",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "五三桐（推定・この頃は織田の永楽銭）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   },
   {
    "side": "徳川（三千とも五千とも）＋織田の加勢",
    "rows": [
     {
      "tai": "先手",
      "taisho": "酒井忠次・本多忠勝",
      "hei": "2200",
      "n": 2200,
      "pos": "",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 105,
      "d": 52
     },
     {
      "tai": "織田の加勢",
      "taisho": "丹羽長秀",
      "hei": "800",
      "n": 800,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "三の手",
      "taisho": "石川数正",
      "hei": "1000",
      "n": 1000,
      "pos": "",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "本陣（岡山）",
      "taisho": "徳川家康",
      "hei": "1300",
      "n": 1300,
      "pos": "",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 57,
      "d": 57
     },
     {
      "tai": "西南の別手",
      "taisho": "榊原康政",
      "hei": "500",
      "n": 500,
      "pos": "",
      "house": "榊原",
      "mon": "sakakibara",
      "flag": {
       "ground": "白",
       "fig": "源氏車",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     }
    ]
   },
   {
    "side": "浅井（約五千・書状は五六千）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "磯野員昌",
      "hei": "1000",
      "n": 1000,
      "pos": "",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "二の手〜五の手",
      "taisho": "浅井政澄・阿閉貞征・新庄直頼・遠藤直経",
      "hei": "800 ずつ",
      "n": 800,
      "pos": "",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "本陣（野村）",
      "taisho": "浅井長政",
      "hei": "800",
      "n": 800,
      "pos": "",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 45,
      "d": 45
     }
    ]
   },
   {
    "side": "朝倉（約八千・書状は一万五千）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "名は伝わらない",
      "hei": "2500",
      "n": 2500,
      "pos": "",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 112,
      "d": 56
     },
     {
      "tai": "二の手",
      "taisho": "前波新八",
      "hei": "2500",
      "n": 2500,
      "pos": "",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 94,
      "d": 66
     },
     {
      "tai": "本陣（三田村氏館）",
      "taisho": "朝倉景健",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田・徳川",
    "n": 25000
   },
   {
    "side": "浅井",
    "n": 5000
   },
   {
    "side": "朝倉",
    "n": 8000
   }
  ]
 },
 "nodafukushima": {
  "line": "oda",
  "src": "docs/fujin/nodafukushima.md",
  "title": "野田・福島（nodafukushima）の布陣図",
  "sides": [
   {
    "side": "水路を挟む攻めの陣（織田方・表の合計 32,000）",
    "rows": [
     {
      "tai": "南東の本陣・退き口",
      "taisho": "織田信長",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "西の仕寄り（配置は推定）",
      "taisho": "柴田勝家",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "東の仕寄り・鉄砲衆",
      "taisho": "根来・雑賀の衆（将の名は不明）",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 141,
      "d": 71
     },
     {
      "tai": "後ろの備え・退き口",
      "taisho": "佐久間信盛",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 112,
      "d": 179
     },
     {
      "tai": "竹束の仕寄り",
      "taisho": "前田利家",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "海老江の詰陣（二城の北）",
      "taisho": "足利義昭",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   },
   {
    "side": "二つの砦と後ろからの寄せ（敵方・表の合計 8,000）",
    "rows": [
     {
      "tai": "本陣・福島砦の奥",
      "taisho": "三好長逸",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "house": "三好",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "黒の三階菱",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "福島砦の岸の曲輪",
      "taisho": "三好長逸の手",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "house": "三好",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "三階菱（砦の主の三好三人衆）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "野田砦の曲輪",
      "taisho": "三好宗渭の手",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "house": "三好",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "三階菱（砦の主の三好三人衆）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "野田砦の岸の鉄砲",
      "taisho": "将の名は不明",
      "hei": "500",
      "n": 500,
      "pos": "",
      "house": "三好",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "三階菱（砦の主の三好三人衆）",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 50,
      "d": 25
     },
     {
      "tai": "浅瀬に向く外の備え",
      "taisho": "岩成友通の手",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "house": "三好",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "黒の三階菱",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     }
    ]
   }
  ]
 },
 "shiga": {
  "line": "oda",
  "src": "docs/fujin/shiga.md",
  "title": "志賀（shiga）の布陣図",
  "sides": [
   {
    "side": "町口と三つの曲輪の守り（配分は推定）（織田方・表の合計 950）",
    "rows": [
     {
      "tai": "坂本の町口・中央",
      "taisho": "森可成",
      "hei": "400",
      "n": 400,
      "pos": "",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 38,
      "d": 26
     },
     {
      "tai": "坂本の町口・湖側",
      "taisho": "織田信治",
      "hei": "250",
      "n": 250,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 30,
      "d": 21
     },
     {
      "tai": "坂本の町口・山側",
      "taisho": "青地茂綱",
      "hei": "150",
      "n": 150,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "三の丸の木戸",
      "taisho": "武藤五郎右衛門",
      "hei": "60",
      "n": 60,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 15,
      "d": 10
     },
     {
      "tai": "本丸の守り",
      "taisho": "肥田彦左衛門",
      "hei": "60",
      "n": 60,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "三の丸の大手木戸",
      "taisho": "将の名は不明",
      "hei": "30",
      "n": 30,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 10,
      "d": 7
     }
    ]
   },
   {
    "side": "朝倉の縦に続く備え（配分は推定）（敵方・表の合計 20,000）",
    "rows": [
     {
      "tai": "本陣（位置は推定）",
      "taisho": "将の名は不明",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     },
     {
      "tai": "街道の先手",
      "taisho": "朝倉の衆（将の名は不明）",
      "hei": "7,000",
      "n": 7000,
      "pos": "",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 187,
      "d": 94
     },
     {
      "tai": "街道の二の備え",
      "taisho": "朝倉の衆（将の名は不明）",
      "hei": "7,000",
      "n": 7000,
      "pos": "",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 158,
      "d": 111
     }
    ]
   },
   {
    "side": "浅井の山側の備え（配分は推定）（敵方・表の合計 10,000）",
    "rows": [
     {
      "tai": "本陣（位置は推定）",
      "taisho": "将の名は不明",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 100,
      "d": 100
     },
     {
      "tai": "山側の先手",
      "taisho": "浅井の衆（将の名は不明）",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 173,
      "d": 87
     }
    ]
   }
  ]
 },
 "hieizan": {
  "line": "oda",
  "src": "docs/fujin/hieizan.md",
  "title": "比叡山攻め（hieizan）の布陣図",
  "sides": [
   {
    "side": "織田勢（およそ 30,000）",
    "rows": [
     {
      "tai": "坂本口の先手",
      "taisho": "明智光秀の手",
      "hei": "本物の組＋軽い軍勢 120 体",
      "n": 120,
      "pos": "",
      "note": "置き場（ゲームの座標）：本坂の下",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 24,
      "d": 12
     },
     {
      "tai": "麓の囲み 北",
      "taisho": "織田の諸将",
      "hei": "軽い軍勢 220 体 ×2",
      "n": 220,
      "pos": "",
      "note": "置き場（ゲームの座標）：(104, −50)・(70, −90)",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 28,
      "d": 20
     },
     {
      "tai": "麓の囲み 南",
      "taisho": "織田の諸将",
      "hei": "軽い軍勢 220 体 ×2",
      "n": 220,
      "pos": "",
      "note": "置き場（ゲームの座標）：(100, 60)・(74, 100)",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 28,
      "d": 20
     },
     {
      "tai": "信長の本陣（永楽銭の旗）",
      "taisho": "織田信長",
      "hei": "軽い軍勢 220 体 ×2",
      "n": 220,
      "pos": "",
      "note": "置き場（ゲームの座標）：(140, −20)・(136, 40)",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 23,
      "d": 23
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 30000
   }
  ]
 },
 "mikatagahara": {
  "line": "oda",
  "src": "docs/fujin/mikatagahara.md",
  "title": "三方ヶ原の戦い（元亀三年 1572 十二月二十二日）布陣図の表",
  "sides": [
   {
    "side": "武田（魚鱗・約二万七千）",
    "rows": [
     {
      "tai": "先鋒",
      "taisho": "小山田信茂",
      "hei": "2,000",
      "n": 2000,
      "pos": "前 38・右 0",
      "note": "役：最初に寄せる",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "第二陣右翼",
      "taisho": "山県昌景（赤備え）",
      "hei": "3,500",
      "n": 3500,
      "pos": "前 25・右 19",
      "note": "役：右の森から横合いを突く",
      "house": "武田（山県）",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "赤備え・白の桔梗",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 112,
      "d": 78
     },
     {
      "tai": "第二陣左翼",
      "taisho": "小幡信貞",
      "hei": "2,500",
      "n": 2500,
      "pos": "前 25・左 28",
      "note": "役：鶴翼の端を押す",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 94,
      "d": 66
     },
     {
      "tai": "第二陣中翼",
      "taisho": "内藤昌豊",
      "hei": "2,500",
      "n": 2500,
      "pos": "前 25・左 16",
      "note": "役：後から続く",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 94,
      "d": 66
     },
     {
      "tai": "第三陣左翼",
      "taisho": "馬場信春",
      "hei": "3,000",
      "n": 3000,
      "pos": "前 12・左 22",
      "note": "役：平手を包む",
      "house": "武田（馬場）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の山道",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "第三陣右翼",
      "taisho": "武田勝頼",
      "hei": "2,500",
      "n": 2500,
      "pos": "前 12・右 19",
      "note": "役：平手を包む",
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 94,
      "d": 66
     },
     {
      "tai": "第三陣中翼",
      "taisho": "高坂昌信",
      "hei": "2,000",
      "n": 2000,
      "pos": "前 12・左 3",
      "note": "役：控え",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     },
     {
      "tai": "旗本衆",
      "taisho": "武田信豊・穴山信君",
      "hei": "3,500",
      "n": 3500,
      "pos": "前 5・左右 16",
      "note": "役：本陣の前",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 94,
      "d": 94
     },
     {
      "tai": "脇備え",
      "taisho": "武田信廉・旗本",
      "hei": "3,000",
      "n": 3000,
      "pos": "前 5・左右 36",
      "note": "役：本陣の脇",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "本陣",
      "taisho": "武田信玄",
      "hei": "2,500",
      "n": 2500,
      "pos": "本陣（台地の奥）",
      "note": "役：床几に座る",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 79,
      "d": 79
     }
    ]
   },
   {
    "side": "徳川・織田（鶴翼・約一万一千）",
    "rows": [
     {
      "tai": "先鋒",
      "taisho": "榊原康政",
      "hei": "800",
      "n": 800,
      "pos": "鶴翼の真ん中の前",
      "house": "榊原",
      "mon": "sakakibara",
      "flag": {
       "ground": "白",
       "fig": "源氏車",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "左翼の端",
      "taisho": "石川数正",
      "hei": "1,200",
      "n": 1200,
      "pos": "翼の端（一番前）",
      "note": "役：最初に崩れる",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "左翼",
      "taisho": "本多忠勝",
      "hei": "1,000",
      "n": 1000,
      "pos": "翼",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "左翼",
      "taisho": "松平家忠",
      "hei": "1,000",
      "n": 1000,
      "pos": "翼",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "左翼",
      "taisho": "小笠原長忠",
      "hei": "1,000",
      "n": 1000,
      "pos": "翼の内",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "右翼",
      "taisho": "酒井忠次",
      "hei": "1,500",
      "n": 1500,
      "pos": "反対の翼",
      "note": "役：浜松城の太鼓（伝え）",
      "house": "徳川（酒井）",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "赤い丸を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "織田の加勢",
      "taisho": "佐久間信盛",
      "hei": "1,000",
      "n": 1000,
      "pos": "織田の持ち場",
      "note": "役：生き延びる",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "織田の加勢",
      "taisho": "平手汎秀",
      "hei": "1,000",
      "n": 1000,
      "pos": "織田の持ち場（主人公の持ち場）",
      "note": "役：討死",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "織田の加勢",
      "taisho": "水野信元",
      "hei": "1,000",
      "n": 1000,
      "pos": "東の端",
      "house": "水野",
      "mon": "mizuno",
      "flag": {
       "ground": "白",
       "fig": "沢瀉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "本陣",
      "taisho": "徳川家康",
      "hei": "1,500",
      "n": 1500,
      "pos": "鶴翼の後ろ",
      "note": "役：浜松城へ退く",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 61,
      "d": 61
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "武田",
    "n": 27000
   },
   {
    "side": "徳川・織田",
    "n": 11000
   }
  ]
 },
 "tonezaka": {
  "line": "oda",
  "src": "docs/fujin/tonezaka.md",
  "title": "刀根坂の戦い（天正元年 1573 八月十三日）布陣図の表",
  "sides": [
   {
    "side": "朝倉（約二万。退く縦列）",
    "rows": [
     {
      "tai": "一の殿",
      "taisho": "河合吉統",
      "hei": "800",
      "n": 800,
      "pos": "坂の下",
      "note": "役：討死",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "二の殿",
      "taisho": "山崎吉家",
      "hei": "1,000",
      "n": 1000,
      "pos": "坂の中ほど",
      "note": "役：討死",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "二の殿の後詰",
      "taisho": "斎藤龍興（客将）",
      "hei": "600",
      "n": 600,
      "pos": "山崎の真後ろ",
      "note": "役：討死",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 31,
      "d": 49
     },
     {
      "tai": "三の殿",
      "taisho": "詫美越後守",
      "hei": "800",
      "n": 800,
      "pos": "峠口",
      "note": "役：逃れる",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "本隊",
      "taisho": "朝倉義景・旗本",
      "hei": "8,000",
      "n": 8000,
      "pos": "峠の先（北西）",
      "note": "役：一乗谷へ逃れる",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     },
     {
      "tai": "荷駄と後備え",
      "taisho": "朝倉景健ほか",
      "hei": "5,000",
      "n": 5000,
      "pos": "本隊の後ろ",
      "note": "役：荷を捨てる",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 112,
      "d": 112
     },
     {
      "tai": "退く人夫・荷",
      "taisho": "—",
      "hei": "—",
      "n": null,
      "pos": "道の各所",
      "note": "役：戦わない",
      "house": "朝倉",
      "mon": "asakura",
      "flag": {
       "ground": "白",
       "fig": "赤の三つ盛木瓜を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   },
   {
    "side": "織田（約三万。追う側）",
    "rows": [
     {
      "tai": "馬廻",
      "taisho": "織田信長",
      "hei": "1,000",
      "n": 1000,
      "pos": "先頭（自ら先駆け）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "騎馬の塊（楔）",
      "w": 65,
      "d": 39
     },
     {
      "tai": "先手",
      "taisho": "柴田勝家",
      "hei": "3,000",
      "n": 3000,
      "pos": "馬廻の後ろ（主人公の持ち場）",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "後続の先手",
      "taisho": "佐久間信盛・丹羽長秀・羽柴秀吉・滝川一益",
      "hei": "各 3,000 前後",
      "n": 3000,
      "pos": "坂の下の後ろ（遅れて追い付く）",
      "note": "役：叱られる",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     }
    ]
   }
  ]
 },
 "odani": {
  "line": "oda",
  "src": "docs/fujin/odani.md",
  "title": "小谷城の戦い（天正元年 1573 八月二十七日夜〜九月一日）布陣図の表",
  "sides": [
   {
    "side": "浅井（約五千）",
    "rows": [
     {
      "tai": "",
      "taisho": "浅井長政・旗本",
      "hei": "1,500",
      "n": 1500,
      "pos": "尾根の南（京極丸の南）",
      "note": "曲輪：本丸／役：最後の抵抗・赤尾屋敷で自害",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "",
      "taisho": "浅井久政",
      "hei": "800",
      "n": 800,
      "pos": "尾根の北（京極丸の北）",
      "note": "曲輪：小丸／役：自害",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "",
      "taisho": "守りの兵",
      "hei": "500",
      "n": 500,
      "pos": "尾根の真ん中",
      "note": "曲輪：京極丸／役：羽柴に取られて父子が分かれる",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "",
      "taisho": "赤尾清綱",
      "hei": "300",
      "n": 300,
      "pos": "本丸の東下",
      "note": "曲輪：赤尾屋敷／役：討たれる",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "",
      "taisho": "大野木秀俊",
      "hei": "300",
      "n": 300,
      "pos": "清水谷",
      "note": "曲輪：大野木屋敷／役：最初の拠点",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "",
      "taisho": "守り",
      "hei": "1,000",
      "n": 1000,
      "pos": "南の尾根",
      "note": "曲輪：番所・大手／役：柴田・丹羽の寄せを受ける",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "",
      "taisho": "守り",
      "hei": "600",
      "n": 600,
      "pos": "尾根の北の端",
      "note": "曲輪：山王丸",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     }
    ]
   },
   {
    "side": "織田（約三万）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "織田信長",
      "hei": "3,000",
      "n": 3000,
      "pos": "虎御前山（のち京極丸へ上がる）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "清水谷の手",
      "taisho": "羽柴秀吉・小一郎・蜂須賀・浅野",
      "hei": "3,000",
      "n": 3000,
      "pos": "清水谷から京極丸へ（主人公の持ち場）",
      "note": "役：京極丸を取る",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "大手",
      "taisho": "柴田勝家・丹羽長秀",
      "hei": "各 3,000 前後",
      "n": 3000,
      "pos": "南の尾根の番所",
      "note": "役：城の目を南へ引く",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "囲み",
      "taisho": "滝川・佐久間ほか",
      "hei": "残り",
      "n": null,
      "pos": "山の周り",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 30000
   },
   {
    "side": "浅井",
    "n": 5000
   }
  ]
 },
 "nagashima": {
  "line": "oda",
  "src": "docs/fujin/nagashima.md",
  "title": "長島一向一揆（天正二年 1574 七月〜九月二十九日）布陣図の表",
  "sides": [
   {
    "side": "一揆（門徒・家族を含む）",
    "rows": [
     {
      "tai": "",
      "taisho": "下間頼旦・願証寺顕忍",
      "hei": "不明（戦う者は千余）",
      "n": 1000,
      "pos": "手前の中洲",
      "note": "砦：長島城／役：九月二十九日に降り、退く舟から斬り込む",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "船団"
     },
     {
      "tai": "",
      "taisho": "門徒",
      "hei": "男女あわせて二万（二砦で）",
      "n": 20000,
      "pos": "東",
      "note": "砦：屋長島／役：柵で囲まれ焼かれる",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "",
      "taisho": "門徒",
      "hei": "（同上）",
      "n": null,
      "pos": "西",
      "note": "砦：中江／役：柵で囲まれ焼かれる",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     },
     {
      "tai": "",
      "taisho": "門徒",
      "hei": "不明（推定 5千：一揆十万余の割り振り）",
      "n": 5000,
      "pos": "上流",
      "note": "砦：大鳥居／役：八月、嵐の夜に逃げ出し討たれる",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "",
      "taisho": "門徒",
      "hei": "不明（推定 5千：同）",
      "n": 5000,
      "pos": "上流",
      "note": "砦：篠橋／役：八月に降る",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     }
    ]
   },
   {
    "side": "織田（約八万・図鑑 11/14 も約8万）",
    "rows": [
     {
      "tai": "",
      "taisho": "織田信長",
      "hei": "不明（推定 1万：総数約八万の割り振り）",
      "n": 10000,
      "pos": "後ろの本陣",
      "note": "口：早尾口（本陣）／役：床几に座る",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "",
      "taisho": "柴田勝家・前田利家",
      "hei": "不明（推定 2万：同）",
      "n": 20000,
      "pos": "岸の柵（主人公の持ち場）",
      "note": "口：早尾口の先陣",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "",
      "taisho": "織田信忠（織田秀成ら）",
      "hei": "不明（推定 2万：同）",
      "n": 20000,
      "pos": "東の岸",
      "note": "口：市江口",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "",
      "taisho": "稲葉一鉄・蜂屋頼隆",
      "hei": "不明（推定 2万：同）",
      "n": 20000,
      "pos": "西の岸",
      "note": "口：賀鳥口",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "",
      "taisho": "九鬼嘉隆・滝川一益",
      "hei": "不明（推定 1万：同）",
      "n": 10000,
      "pos": "川の上（安宅船）",
      "note": "口：船の衆／役：川を塞ぐ",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "船団"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 80000
   },
   {
    "side": "一揆",
    "n": 100000
   }
  ]
 },
 "shitaragahara": {
  "line": "oda",
  "src": "docs/fujin/shitaragahara.md",
  "title": "設楽原の決戦（天正三年・1575年五月二十一日）の布陣",
  "sides": [
   {
    "side": "織田・徳川（西・−x、東を向く）約三万八千",
    "rows": [
     {
      "tai": "鉄砲（柵の際）",
      "taisho": "佐々・前田・野々村・福富・塙",
      "hei": "千挺",
      "n": 1000,
      "pos": "柵の内の三列（本物の組と軽い列。すでに置いてある）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "最前線（北）",
      "taisho": "佐久間信盛",
      "hei": "3000",
      "n": 3000,
      "pos": "−28, −440",
      "xz": [
       -28,
       -440
      ],
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "柵の内（北）の後ろ",
      "taisho": "羽柴秀吉",
      "hei": "2500",
      "n": 2500,
      "pos": "−300, −320",
      "xz": [
       -300,
       -320
      ],
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 63,
      "d": 100
     },
     {
      "tai": "柵の内（北・大宮前）",
      "taisho": "滝川一益",
      "hei": "2500",
      "n": 2500,
      "pos": "−55, −340",
      "xz": [
       -55,
       -340
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 112,
      "d": 56
     },
     {
      "tai": "柵の内（北）の後ろ",
      "taisho": "丹羽長秀",
      "hei": "2500",
      "n": 2500,
      "pos": "−240, −230",
      "xz": [
       -240,
       -230
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 63,
      "d": 100
     },
     {
      "tai": "天神山",
      "taisho": "織田信忠",
      "hei": "4000",
      "n": 4000,
      "pos": "−240, −420",
      "xz": [
       -240,
       -420
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "茶臼山 本陣",
      "taisho": "織田信長",
      "hei": "6000",
      "n": 6000,
      "pos": "−486, −100",
      "xz": [
       -486,
       -100
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     },
     {
      "tai": "後詰",
      "taisho": "池田恒興・水野信元ほか",
      "hei": "4000",
      "n": 4000,
      "pos": "−430, 120",
      "xz": [
       -430,
       120
      ],
      "house": "水野",
      "mon": "mizuno",
      "flag": {
       "ground": "白",
       "fig": "沢瀉",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 79,
      "d": 126
     },
     {
      "tai": "徳川 柵の外（竹広）",
      "taisho": "大久保忠世・忠佐",
      "hei": "500",
      "n": 500,
      "pos": "40, 410",
      "xz": [
       40,
       410
      ],
      "house": "大久保",
      "mon": "okubo",
      "flag": {
       "ground": "白",
       "fig": "上り藤",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "徳川 柵の内",
      "taisho": "本多忠勝・榊原康政ほか",
      "hei": "3500",
      "n": 3500,
      "pos": "−65, 440・−65, 240",
      "xz": [
       -65,
       440
      ],
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 112,
      "d": 78
     },
     {
      "tai": "弾正山 本陣",
      "taisho": "徳川家康",
      "hei": "3000",
      "n": 3000,
      "pos": "−80, 350",
      "xz": [
       -80,
       350
      ],
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "徳川 後ろ",
      "taisho": "松平信康",
      "hei": "1000",
      "n": 1000,
      "pos": "−250, 450",
      "xz": [
       -250,
       450
      ],
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     }
    ]
   },
   {
    "side": "武田（東・＋x、西を向く）約一万二千（設楽原へ出た数）",
    "rows": [
     {
      "tai": "右翼（北）",
      "taisho": "馬場信春",
      "hei": "1200",
      "n": 1200,
      "pos": "250, −440",
      "xz": [
       250,
       -440
      ],
      "house": "武田（馬場）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の山道",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "右翼",
      "taisho": "真田信綱・昌輝",
      "hei": "1000",
      "n": 1000,
      "pos": "本物の寄せ（大宮前）",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "右翼",
      "taisho": "土屋昌次",
      "hei": "1000",
      "n": 1000,
      "pos": "105, −340",
      "xz": [
       105,
       -340
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "右翼の後ろ",
      "taisho": "一条信龍・穴山信君",
      "hei": "1500",
      "n": 1500,
      "pos": "260, −380",
      "xz": [
       260,
       -380
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 48,
      "d": 77
     },
     {
      "tai": "中央",
      "taisho": "内藤昌豊",
      "hei": "1000",
      "n": 1000,
      "pos": "本物の寄せ（柳田前）・控え 105, −30",
      "xz": [
       105,
       -30
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "中央",
      "taisho": "原昌胤",
      "hei": "800",
      "n": 800,
      "pos": "本物の寄せ（柳田前）・控え 140, 70",
      "xz": [
       140,
       70
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 35,
      "d": 57
     },
     {
      "tai": "中央の後ろ（南寄り）",
      "taisho": "武田信廉（逍遥軒）",
      "hei": "1000",
      "n": 1000,
      "pos": "210, 130",
      "xz": [
       210,
       130
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "左翼（南）",
      "taisho": "山県昌景（赤備え）",
      "hei": "1500",
      "n": 1500,
      "pos": "45, 350",
      "xz": [
       45,
       350
      ],
      "house": "武田（山県）",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "赤備え・白の桔梗",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "左翼",
      "taisho": "小幡信貞（西上野・赤武者）",
      "hei": "1000",
      "n": 1000,
      "pos": "200, 230",
      "xz": [
       200,
       230
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "左翼の後ろ",
      "taisho": "武田信豊（典厩・黒武者）",
      "hei": "1000",
      "n": 1000,
      "pos": "240, 400",
      "xz": [
       240,
       400
      ],
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "本陣 才ノ神",
      "taisho": "武田勝頼（旗本）",
      "hei": "2000",
      "n": 2000,
      "pos": "430, 10",
      "xz": [
       430,
       10
      ],
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 71,
      "d": 71
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田・徳川",
    "n": 38000
   },
   {
    "side": "武田",
    "n": 15000
   }
  ]
 },
 "echizen": {
  "line": "oda",
  "src": "docs/fujin/echizen.md",
  "title": "越前一向一揆・木ノ芽峠（天正三年・1575年八月十五日）の布陣",
  "sides": [
   {
    "side": "織田（峠口・北を向く）",
    "rows": [
     {
      "tai": "峠口の後詰・本陣",
      "taisho": "丹羽長秀",
      "hei": "―",
      "n": null,
      "pos": "KZ −214（本物）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）"
     },
     {
      "tai": "峠口の仕寄り",
      "taisho": "織田の将",
      "hei": "320",
      "n": 320,
      "pos": "観音丸の木戸の前（本物）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 34,
      "d": 24
     },
     {
      "tai": "東尾根の別手",
      "taisho": "織田の将",
      "hei": "150",
      "n": 150,
      "pos": "東の尾根（本物）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "西尾根の仕寄り",
      "taisho": "明智の配下",
      "hei": "150",
      "n": 150,
      "pos": "西の尾根（本物）",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "後備え・陣所",
      "taisho": "明智の配下",
      "hei": "120",
      "n": 120,
      "pos": "本道の下（本物）",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 21,
      "d": 14
     },
     {
      "tai": "尾根道の合流",
      "taisho": "前田利家・佐々成政・不破光治",
      "hei": "各五",
      "n": 5,
      "pos": "観音丸の後に合流（echizen/goryu.js）",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 4,
      "d": 3
     },
     {
      "tai": "本道を上がる",
      "taisho": "柴田勝家",
      "hei": "七",
      "n": 7,
      "pos": "四城を押さえた後（本物）",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 5,
      "d": 4
     }
    ]
   },
   {
    "side": "一向一揆（四城・南を向く）",
    "rows": [
     {
      "tai": "観音丸城",
      "taisho": "西光寺の衆徒",
      "hei": "24",
      "n": 24,
      "pos": "KZ −105",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "木ノ芽峠城（木戸内・副郭・主郭）",
      "taisho": "西光寺の衆徒・西光寺真敬",
      "hei": "28・15・36",
      "n": 79,
      "pos": "KZ −18・7・31",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "西光寺丸城（前郭・本郭）",
      "taisho": "本覚寺・西光寺の衆徒",
      "hei": "28・32",
      "n": 60,
      "pos": "東の尾根",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "鉢伏城（柵口・詰の郭）",
      "taisho": "専修寺の衆徒・阿波賀三郎",
      "hei": "18・27",
      "n": 45,
      "pos": "西の尾根",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "東尾根の伏せ勢",
      "taisho": "一揆の将",
      "hei": "20",
      "n": 20,
      "pos": "東の尾根",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 8,
      "d": 6
     },
     {
      "tai": "峠道の殿",
      "taisho": "西光寺真敬",
      "hei": "28",
      "n": 28,
      "pos": "観音丸の北口の先",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 10,
      "d": 7
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 30000
   },
   {
    "side": "朝倉",
    "n": 20000
   }
  ]
 },
 "echizen_ikko": {
  "line": "oda",
  "src": "docs/fujin/echizen_ikko.md",
  "title": "越前・大滝寺の山狩り（天正三年・1575年八月十六〜十七日）の布陣",
  "sides": [
   {
    "side": "織田（麓・北を向く）",
    "rows": [
     {
      "tai": "麓の陣所と旗本",
      "taisho": "滝川一益",
      "hei": "30",
      "n": 30,
      "pos": "−16, −200（本物）",
      "xz": [
       -16,
       -200
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 9,
      "d": 9
     },
     {
      "tai": "参道の物見",
      "taisho": "滝川の配下",
      "hei": "14",
      "n": 14,
      "pos": "0, −162",
      "xz": [
       0,
       -162
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 7,
      "d": 5
     },
     {
      "tai": "参道の仕寄り（竹束）",
      "taisho": "滝川の配下",
      "hei": "150",
      "n": 150,
      "pos": "0, −188",
      "xz": [
       0,
       -188
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "参道の鉄砲",
      "taisho": "滝川の配下",
      "hei": "50",
      "n": 50,
      "pos": "14, −200",
      "xz": [
       14,
       -200
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 16,
      "d": 8
     },
     {
      "tai": "谷道の別手・弓",
      "taisho": "滝川の配下",
      "hei": "100・40",
      "n": 140,
      "pos": "30〜44, −188",
      "xz": [
       44,
       -188
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 22,
      "d": 16
     },
     {
      "tai": "麓の後備え",
      "taisho": "滝川の配下",
      "hei": "30",
      "n": 30,
      "pos": "−10, −192",
      "xz": [
       -10,
       -192
      ],
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 10,
      "d": 7
     }
    ]
   },
   {
    "side": "一向一揆（寺・南を向く）",
    "rows": [
     {
      "tai": "麓・参道・惣門前の見張り",
      "taisho": "見張り役",
      "hei": "6ずつ",
      "n": 6,
      "pos": "0, −174・−138・−102",
      "xz": [
       0,
       -174
      ],
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 5,
      "d": 3
     },
     {
      "tai": "外堂の薙刀・弓",
      "taisho": "衆徒の大将",
      "hei": "46・16",
      "n": 62,
      "pos": "0〜10, −58",
      "xz": [
       10,
       -58
      ],
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 15,
      "d": 10
     },
     {
      "tai": "本堂・本堂の鉄砲",
      "taisho": "衆徒の大将",
      "hei": "60・16",
      "n": 76,
      "pos": "0, 4・−10, 24",
      "xz": [
       0,
       4
      ],
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 19,
      "d": 10
     },
     {
      "tai": "奥の院",
      "taisho": "衆徒の大将",
      "hei": "42",
      "n": 42,
      "pos": "0, 49",
      "xz": [
       0,
       49
      ],
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 12,
      "d": 9
     },
     {
      "tai": "山道の守り・後備え",
      "taisho": "衆徒の頭",
      "hei": "6・8・8",
      "n": 22,
      "pos": "−14〜−26, 86〜110",
      "xz": [
       -26,
       86
      ],
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "谷道の伏せ勢",
      "taisho": "衆徒の大将",
      "hei": "26",
      "n": 26,
      "pos": "30, −70",
      "xz": [
       30,
       -70
      ],
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 10,
      "d": 7
     },
     {
      "tai": "森・谷に潜む残党（山狩りの段）",
      "taisho": "―",
      "hei": "7・8",
      "n": 15,
      "pos": "森の小道・右の谷筋（echizen_ikko/yamagari.js）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 7,
      "d": 5
     }
    ]
   }
  ]
 },
 "iwamura": {
  "line": "oda",
  "src": "docs/fujin/iwamura.md",
  "title": "岩村城の囲み・水晶山の夜討ち（天正三年・1575年十一月）の布陣",
  "sides": [
   {
    "side": "織田（水晶山・南を向く）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "織田信忠",
      "hei": "8000",
      "n": 8000,
      "pos": "0, 44（本物）",
      "xz": [
       0,
       44
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     },
     {
      "tai": "水晶山の仕寄り",
      "taisho": "河尻秀隆",
      "hei": "5000",
      "n": 5000,
      "pos": "−14, 16（本物）",
      "xz": [
       -14,
       16
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "水晶山の仕寄り",
      "taisho": "毛利長秀（秀頼）",
      "hei": "5000",
      "n": 5000,
      "pos": "20, 16（本物）",
      "xz": [
       20,
       16
      ],
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "仕寄り（西）",
      "taisho": "浅野左近",
      "hei": "1000",
      "n": 1000,
      "pos": "−42, 24",
      "xz": [
       -42,
       24
      ],
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "仕寄り（東）",
      "taisho": "猿荻甚太郎",
      "hei": "1000",
      "n": 1000,
      "pos": "46, 24",
      "xz": [
       46,
       24
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "本陣の左右",
      "taisho": "森長可・団忠正",
      "hei": "各1000",
      "n": 1000,
      "pos": "∓30, 62",
      "xz": [
       30,
       62
      ],
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 50,
      "d": 50
     },
     {
      "tai": "城の南の尾根の囲み",
      "taisho": "織田の衆",
      "hei": "5000",
      "n": 5000,
      "pos": "−170, −235",
      "xz": [
       -170,
       -235
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "城の北の兵糧道の囲み",
      "taisho": "織田の衆",
      "hei": "5000",
      "n": 5000,
      "pos": "190, −205",
      "xz": [
       190,
       -205
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "登城道の仕寄り",
      "taisho": "河尻の配下",
      "hei": "2000",
      "n": 2000,
      "pos": "24, −64",
      "xz": [
       24,
       -64
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   },
   {
    "side": "武田（岩村城・北を向く）約三千",
    "rows": [
     {
      "tai": "本丸",
      "taisho": "秋山虎繁（おつやの方）",
      "hei": "500",
      "n": 500,
      "pos": "本丸（本物）",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "三の丸・八幡曲輪・二の丸・主郭・帯曲輪・出丸",
      "taisho": "秋山の配下（名は不明。大島杢之助・座光寺為清は城の将）",
      "hei": "300〜500ずつ",
      "n": 300,
      "pos": "各曲輪",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "夜討ちの寄せ",
      "taisho": "城方",
      "hei": "本物の六手",
      "n": 6,
      "pos": "柵の口・北の脇口",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 5,
      "d": 3
     }
    ]
   }
  ]
 },
 "tennoji": {
  "line": "oda",
  "src": "docs/fujin/tennoji.md",
  "title": "天王寺の戦い（天正四年五月七日）の布陣図",
  "sides": [
   {
    "side": "織田方（赤）　南から北を向く",
    "rows": [
     {
      "tai": "一段目",
      "taisho": "佐久間信盛・松永久秀・細川藤孝・若江衆",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "-8,72",
      "xz": [
       -8,
       72
      ],
      "note": "3D：本物の隊＋軽い軍勢 160",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "二段目",
      "taisho": "滝川一益・蜂屋頼隆・羽柴秀吉・丹羽長秀・稲葉・氏家・安藤",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "16,98",
      "xz": [
       16,
       98
      ],
      "note": "3D：本物の隊＋軽い軍勢 160",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "三段目の馬廻",
      "taisho": "織田信長の馬廻",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "8,126",
      "xz": [
       8,
       126
      ],
      "note": "3D：本陣の旗本＋軽い軍勢 80",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "騎馬の塊（楔）",
      "w": 65,
      "d": 39
     },
     {
      "tai": "大将",
      "taisho": "織田信長",
      "hei": "―",
      "n": null,
      "pos": "4,80（先手の足軽に交じる）",
      "xz": [
       4,
       80
      ],
      "note": "3D：本物",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     },
     {
      "tai": "天王寺砦の守備",
      "taisho": "明智光秀・佐久間信栄・猪子兵介・大津伝十郎・江州衆",
      "hei": "不明",
      "n": null,
      "pos": "砦",
      "note": "3D：本物の隊",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "木津口の押さえ",
      "taisho": "荒木村重",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "-190,-140",
      "xz": [
       -190,
       -140
      ],
      "note": "3D：遠い備（寄れば本物）",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     }
    ]
   },
   {
    "side": "本願寺方（青）　砦を囲む",
    "rows": [
     {
      "tai": "城戸口の控え",
      "taisho": "下間頼廉（推定）",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "城戸口の後ろ",
      "note": "3D：軽い軍勢 260",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "砦の西の囲みの二の手",
      "taisho": "本願寺の将",
      "hei": "推定 2,000",
      "n": 2000,
      "pos": "-118,-80",
      "xz": [
       -118,
       -80
      ],
      "note": "3D：遠い備（寄れば本物）",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "砦の東の囲みの二の手",
      "taisho": "本願寺の将",
      "hei": "推定 2,000",
      "n": 2000,
      "pos": "118,-90",
      "xz": [
       118,
       -90
      ],
      "note": "3D：遠い備（寄れば本物）",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "砦の北の囲みの二の手",
      "taisho": "本願寺の将",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "10,-215",
      "xz": [
       10,
       -215
      ],
      "note": "3D：遠い備（寄れば本物）",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "西の鉄砲の備え",
      "taisho": "鈴木孫一",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "-125,-25",
      "xz": [
       -125,
       -25
      ],
      "note": "3D：遠い備（鉄砲・寄れば本物）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "城戸口の前の後備え",
      "taisho": "本願寺の将",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "0,-640",
      "xz": [
       0,
       -640
      ],
      "note": "3D：遠い備（寄れば本物）",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "東の脇備え",
      "taisho": "本願寺の将",
      "hei": "推定 1,500",
      "n": 1500,
      "pos": "140,25",
      "xz": [
       140,
       25
      ],
      "note": "3D：遠い備（寄れば本物）",
      "house": "本願寺・一揆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無阿弥陀仏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田（信長の後詰）",
    "n": 3000
   },
   {
    "side": "本願寺",
    "n": 15000
   }
  ]
 },
 "saika": {
  "line": "oda",
  "src": "docs/fujin/saika.md",
  "title": "雑賀攻め・小雑賀川（天正五年二月）の布陣図",
  "sides": [
   {
    "side": "織田方（山手の勢・赤）　東岸・西を向く",
    "rows": [
     {
      "tai": "渡河の先手",
      "taisho": "堀秀政",
      "hei": "推定 2,000",
      "n": 2000,
      "pos": "26,0",
      "xz": [
       26,
       0
      ],
      "note": "3D：本物の隊（24人）＋杭の組・東岸の鉄砲",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 100,
      "d": 50
     },
     {
      "tai": "後陣",
      "taisho": "佐久間勢の組頭",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "72,0",
      "xz": [
       72,
       0
      ],
      "note": "3D：本物の旗本",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "佐久間信盛の陣",
      "taisho": "佐久間信盛",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "100,0",
      "xz": [
       100,
       0
      ],
      "note": "3D：本物の隊",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "川上の控え",
      "taisho": "羽柴勢",
      "hei": "推定 6,000",
      "n": 6000,
      "pos": "50,-70",
      "xz": [
       50,
       -70
      ],
      "note": "3D：軽い軍勢 120",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 97,
      "d": 155
     },
     {
      "tai": "川下の控え",
      "taisho": "荒木勢",
      "hei": "推定 6,000",
      "n": 6000,
      "pos": "50,70",
      "xz": [
       50,
       70
      ],
      "note": "3D：軽い軍勢 120",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 97,
      "d": 155
     },
     {
      "tai": "後方の控え",
      "taisho": "別所勢",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "110,0",
      "xz": [
       110,
       0
      ],
      "note": "3D：軽い軍勢 60",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "明智・滝川・丹羽の備え（浜手から見える旗）",
      "taisho": "明智光秀・滝川一益・丹羽長秀",
      "hei": "推定 各 3,000",
      "n": 3000,
      "pos": "120〜146",
      "note": "3D：将と旗本（invuln）",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     }
    ]
   },
   {
    "side": "雑賀方（青）　西岸・東を向く",
    "rows": [
     {
      "tai": "柵の鉄砲の小組×5",
      "taisho": "雑賀の将（名は不明）",
      "hei": "推定 各 100",
      "n": 100,
      "pos": "-47, -24〜24",
      "xz": [
       -47,
       -24
      ],
      "note": "3D：本物の鉄砲（各5人）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 22,
      "d": 11
     },
     {
      "tai": "柵の控え",
      "taisho": "同",
      "hei": "推定 500",
      "n": 500,
      "pos": "-57,0",
      "xz": [
       -57,
       0
      ],
      "note": "3D：本物（20人）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 28,
      "d": 45
     },
     {
      "tai": "川上の柵と林",
      "taisho": "同",
      "hei": "推定 1,500",
      "n": 1500,
      "pos": "-57,-64",
      "xz": [
       -57,
       -64
      ],
      "note": "3D：軽い軍勢 72（鉄砲）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 87,
      "d": 43
     },
     {
      "tai": "川下の柵と家",
      "taisho": "同",
      "hei": "推定 1,500",
      "n": 1500,
      "pos": "-57,64",
      "xz": [
       -57,
       64
      ],
      "note": "3D：軽い軍勢 72（鉄砲）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 87,
      "d": 43
     },
     {
      "tai": "西岸の後備え",
      "taisho": "同",
      "hei": "推定 2,000",
      "n": 2000,
      "pos": "-110,0",
      "xz": [
       -110,
       0
      ],
      "note": "3D：軽い軍勢 100",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "鈴木孫一の陣",
      "taisho": "鈴木孫一",
      "hei": "推定 500",
      "n": 500,
      "pos": "-96,46",
      "xz": [
       -96,
       46
      ],
      "note": "3D：将と鉄砲（invuln）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 50,
      "d": 25
     },
     {
      "tai": "土橋守重の陣",
      "taisho": "土橋守重",
      "hei": "推定 500",
      "n": 500,
      "pos": "-100,-52",
      "xz": [
       -100,
       -52
      ],
      "note": "3D：将と鉄砲（invuln）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 50,
      "d": 25
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 100000
   },
   {
    "side": "雑賀衆",
    "n": 2000
   }
  ]
 },
 "tedorigawa": {
  "line": "oda",
  "src": "docs/fujin/tedorigawa.md",
  "title": "手取川の戦い（天正五年九月二十三日）の布陣図",
  "sides": [
   {
    "side": "織田方（赤）　北岸・北を向き、南へ退く",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "柴田勝家",
      "hei": "推定 8,000",
      "n": 8000,
      "pos": "0,-66",
      "xz": [
       0,
       -66
      ],
      "note": "3D：本物の隊",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     },
     {
      "tai": "西の備え",
      "taisho": "丹羽長秀",
      "hei": "推定 5,000",
      "n": 5000,
      "pos": "-30,-60",
      "xz": [
       -30,
       -60
      ],
      "note": "3D：本物の隊",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "東の備え",
      "taisho": "前田利家",
      "hei": "推定 4,000",
      "n": 4000,
      "pos": "32,-62",
      "xz": [
       32,
       -62
      ],
      "note": "3D：本物の隊",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "西の渡河列",
      "taisho": "稲葉良通・氏家直昌・安藤守就",
      "hei": "推定 7,000",
      "n": 7000,
      "pos": "-8,-80 から南へ",
      "xz": [
       -8,
       -80
      ],
      "note": "3D：軽い軍勢 120（縦の列）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 158,
      "d": 111
     },
     {
      "tai": "東の渡河列",
      "taisho": "佐々成政・不破光治・金森長近",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "8,-110 から南へ",
      "xz": [
       8,
       -110
      ],
      "note": "3D：軽い軍勢 100（縦の列）",
      "house": "金森",
      "mon": "kanamori",
      "flag": {
       "ground": "白",
       "fig": "裏梅鉢",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "殿",
      "taisho": "柴田の殿",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "0,-52",
      "xz": [
       0,
       -52
      ],
      "note": "3D：本物の隊（主人公の組）",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "離陣する羽柴の手",
      "taisho": "羽柴秀吉",
      "hei": "推定 2,000",
      "n": 2000,
      "pos": "16,-64 → 南",
      "xz": [
       16,
       -64
      ],
      "note": "3D：将と手勢（去る）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "南岸の受け取り",
      "taisho": "滝川一益",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "34,104",
      "xz": [
       34,
       104
      ],
      "note": "3D：本陣（陣幕・旗本）",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     }
    ]
   },
   {
    "side": "上杉方（青）　北・南を向く",
    "rows": [
     {
      "tai": "本陣・馬廻",
      "taisho": "上杉謙信",
      "hei": "推定 2,000",
      "n": 2000,
      "pos": "20,-100（馬廻）／64,-206（陣幕）",
      "xz": [
       20,
       -100
      ],
      "note": "3D：本物の馬廻＋本陣",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "騎馬の塊（楔）",
      "w": 91,
      "d": 55
     },
     {
      "tai": "先手",
      "taisho": "上杉の将（名は不明）",
      "hei": "推定 6,000",
      "n": 6000,
      "pos": "-6,-150",
      "xz": [
       -6,
       -150
      ],
      "note": "3D：軽い軍勢 180",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 173,
      "d": 87
     },
     {
      "tai": "東の脇備え",
      "taisho": "同",
      "hei": "推定 4,000",
      "n": 4000,
      "pos": "96,-160",
      "xz": [
       96,
       -160
      ],
      "note": "3D：軽い軍勢 120",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "後備え",
      "taisho": "同",
      "hei": "推定 5,000",
      "n": 5000,
      "pos": "0,-190",
      "xz": [
       0,
       -190
      ],
      "note": "3D：軽い軍勢 140",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "西の脇備え",
      "taisho": "同",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "-70,-180",
      "xz": [
       -70,
       -180
      ],
      "note": "3D：軽い軍勢 100",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "景勝の備え",
      "taisho": "上杉景勝",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "-46,-150",
      "xz": [
       -46,
       -150
      ],
      "note": "3D：将と旗（invuln）",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "直江の備え",
      "taisho": "直江景綱",
      "hei": "推定 1,000",
      "n": 1000,
      "pos": "44,-146",
      "xz": [
       44,
       -146
      ],
      "note": "3D：将と旗（invuln）",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     }
    ]
   }
  ]
 },
 "shigisan": {
  "line": "oda",
  "src": "docs/fujin/shigisan.md",
  "title": "信貴山城の戦い（天正五年十月）の布陣図",
  "sides": [
   {
    "side": "織田方（赤）　麓・北（山頂）を向く",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "織田信忠",
      "hei": "推定 8,000",
      "n": 8000,
      "pos": "0,142",
      "xz": [
       0,
       142
      ],
      "note": "3D：本陣（陣幕・旗本）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     },
     {
      "tai": "大手の仕寄り",
      "taisho": "筒井順慶",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "筒井の陣",
      "note": "3D：本物の隊",
      "house": "筒井",
      "mon": "umebachi",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "東の寺側の仕寄り",
      "taisho": "明智光秀",
      "hei": "推定 5,000",
      "n": 5000,
      "pos": "70,10",
      "xz": [
       70,
       10
      ],
      "note": "3D：軽い軍勢 200",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "西尾根の囲み",
      "taisho": "羽柴秀吉",
      "hei": "推定 5,000",
      "n": 5000,
      "pos": "-70,20",
      "xz": [
       -70,
       20
      ],
      "note": "3D：軽い軍勢 200",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "東の仕寄り",
      "taisho": "細川藤孝",
      "hei": "推定 3,000",
      "n": 3000,
      "pos": "60,120",
      "xz": [
       60,
       120
      ],
      "note": "3D：軽い軍勢 220",
      "house": "細川",
      "mon": "kuyo",
      "flag": {
       "ground": "白",
       "fig": "黒の九曜",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "西の攻め口",
      "taisho": "佐久間信盛",
      "hei": "推定 5,000",
      "n": 5000,
      "pos": "-106,-12",
      "xz": [
       -106,
       -12
      ],
      "note": "3D：軽い軍勢 160",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "東の攻め口",
      "taisho": "丹羽長秀",
      "hei": "推定 5,000",
      "n": 5000,
      "pos": "106,-12",
      "xz": [
       106,
       -12
      ],
      "note": "3D：軽い軍勢 160",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "西の後備え",
      "taisho": "信忠の配下",
      "hei": "推定 6,000",
      "n": 6000,
      "pos": "-60,120",
      "xz": [
       -60,
       120
      ],
      "note": "3D：軽い軍勢 220",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     }
    ]
   },
   {
    "side": "松永方（青）　尾根と曲輪・南を向く",
    "rows": [
     {
      "tai": "本丸（天守）",
      "taisho": "松永久秀",
      "hei": "推定 2,200",
      "n": 2200,
      "pos": "山頂",
      "note": "3D：本物の隊",
      "house": "松永",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "蔦（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "城内の鉄砲組",
      "taisho": "森好久",
      "hei": "推定 200",
      "n": 200,
      "pos": "山頂の脇",
      "note": "3D：本物の隊（内通）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 32,
      "d": 16
     },
     {
      "tai": "大手の木戸",
      "taisho": "松永の配下",
      "hei": "推定 1,600",
      "n": 1600,
      "pos": "木戸",
      "note": "3D：本物の隊",
      "house": "松永",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "蔦（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 76,
      "d": 53
     },
     {
      "tai": "北尾根の下・上の曲輪",
      "taisho": "同",
      "hei": "推定 1,600・800",
      "n": 2400,
      "pos": "尾根",
      "note": "3D：本物の隊",
      "house": "松永",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "蔦（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "松永屋敷",
      "taisho": "同",
      "hei": "推定 1,600",
      "n": 1600,
      "pos": "屋敷",
      "note": "3D：本物の隊",
      "house": "松永",
      "mon": "miyoshi",
      "flag": {
       "ground": "白",
       "fig": "蔦（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 76,
      "d": 53
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 40000
   },
   {
    "side": "松永",
    "n": 8000
   }
  ]
 },
 "kizugawa": {
  "line": "oda",
  "src": "docs/fujin/kizugawa.md",
  "title": "第二次木津川口の戦い（天正六年・1578年十一月六日）の布陣",
  "sides": [
   {
    "side": "織田（九鬼水軍・約八百二十）",
    "rows": [
     {
      "tai": "大将船（安宅船）",
      "taisho": "九鬼嘉隆",
      "hei": "120",
      "n": 120,
      "pos": "",
      "house": "九鬼",
      "mon": "kuki",
      "flag": {
       "ground": "上赤・下紺",
       "fig": "白の三つ巴",
       "color": 10889759
      },
      "jinkei": "船団"
     },
     {
      "tai": "大船五艘（供の安宅船）",
      "taisho": "九鬼の将（名は不明）",
      "hei": "600",
      "n": 600,
      "pos": "",
      "house": "九鬼",
      "mon": "kuki",
      "flag": {
       "ground": "上赤・下紺",
       "fig": "白の三つ巴",
       "color": 10889759
      },
      "jinkei": "船団"
     },
     {
      "tai": "白船",
      "taisho": "滝川一益の手の者",
      "hei": "100",
      "n": 100,
      "pos": "",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "船団"
     }
    ]
   },
   {
    "side": "毛利・村上水軍（約四千八百・六百余艘）",
    "rows": [
     {
      "tai": "先手の関船・小早",
      "taisho": "毛利・村上の将（名は不明）",
      "hei": "1200",
      "n": 1200,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "船団"
     },
     {
      "tai": "西から包む手",
      "taisho": "同",
      "hei": "1200",
      "n": 1200,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "南から包む手",
      "taisho": "同",
      "hei": "1200",
      "n": 1200,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "兵糧船と後備え",
      "taisho": "毛利方の将（名は不明）",
      "hei": "1200",
      "n": 1200,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "船団"
     }
    ]
   }
  ]
 },
 "miki": {
  "line": "oda",
  "src": "docs/fujin/miki.md",
  "title": "三木城・平田と大村の合戦（天正七年・1579年九月十日）の布陣",
  "sides": [
   {
    "side": "羽柴（約二万）",
    "rows": [
     {
      "tai": "平井山の本陣",
      "taisho": "羽柴秀吉の陣（留守役は不明）",
      "hei": "14400",
      "n": 14400,
      "pos": "",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 190,
      "d": 190
     },
     {
      "tai": "大村への手",
      "taisho": "羽柴秀吉（千余騎）",
      "hei": "1000",
      "n": 1000,
      "pos": "",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "平田の付城",
      "taisho": "谷大膳（谷衛好）",
      "hei": "200",
      "n": 200,
      "pos": "",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "大村道・城下・平井山道・東の付城",
      "taisho": "羽柴の配下（名は不明）",
      "hei": "各150",
      "n": 150,
      "pos": "",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "本陣の後備え",
      "taisho": "羽柴の配下",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 71,
      "d": 71
     },
     {
      "tai": "道を押さえる手",
      "taisho": "羽柴の配下",
      "hei": "1800",
      "n": 1800,
      "pos": "",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 80,
      "d": 56
     }
    ]
   },
   {
    "side": "別所・毛利（約八千）",
    "rows": [
     {
      "tai": "本丸",
      "taisho": "別所長治",
      "hei": "1000",
      "n": 1000,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "二の丸・新城・鷹尾山城・宮の上要害",
      "taisho": "別所の配下",
      "hei": "各375",
      "n": 375,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "城からの出撃（平田・大村）",
      "taisho": "別所吉親（三太夫・甚太夫）",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "兵糧隊の護衛",
      "taisho": "搬入側の将（名は不明）",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     }
    ]
   }
  ]
 },
 "arioka": {
  "line": "oda",
  "src": "docs/fujin/arioka.md",
  "title": "有岡城の戦い（天正七年・1579年十月十五日）の布陣",
  "sides": [
   {
    "side": "織田（約二万五千のうち上臈塚口）",
    "rows": [
     {
      "tai": "先鋒（上臈塚の木戸）",
      "taisho": "滝川一益",
      "hei": "600",
      "n": 600,
      "pos": "",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "第一線 左",
      "taisho": "丹羽長秀",
      "hei": "1500",
      "n": 1500,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "第一線 右",
      "taisho": "蜂屋頼隆",
      "hei": "1200",
      "n": 1200,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "第二線・後詰",
      "taisho": "滝川の後詰",
      "hei": "400",
      "n": 400,
      "pos": "",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 25,
      "d": 40
     },
     {
      "tai": "予備",
      "taisho": "―",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "本陣",
      "taisho": "織田信忠",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "後詰",
      "taisho": "―",
      "hei": "2000",
      "n": 2000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     }
    ]
   },
   {
    "side": "荒木（約五千）",
    "rows": [
     {
      "tai": "上臈塚の木戸",
      "taisho": "―",
      "hei": "150",
      "n": 150,
      "pos": "",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "侍町の辻",
      "taisho": "―",
      "hei": "300",
      "n": 300,
      "pos": "",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "侍町から寄せ返す手",
      "taisho": "―",
      "hei": "200",
      "n": 200,
      "pos": "",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 27,
      "d": 19
     },
     {
      "tai": "荒木久左衛門の手",
      "taisho": "―",
      "hei": "400",
      "n": 400,
      "pos": "",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 38,
      "d": 26
     },
     {
      "tai": "本丸",
      "taisho": "荒木久左衛門",
      "hei": "1500",
      "n": 1500,
      "pos": "",
      "house": "荒木",
      "mon": "kiri53",
      "flag": {
       "ground": "白",
       "fig": "黒の紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田",
    "n": 50000
   },
   {
    "side": "荒木",
    "n": 10000
   }
  ]
 },
 "iga": {
  "line": "oda",
  "src": "docs/fujin/iga.md",
  "title": "天正伊賀の乱・比自山城（天正九年・1581年九月）の布陣",
  "sides": [
   {
    "side": "織田（比自山を囲む手）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "堀秀政",
      "hei": "3000",
      "n": 3000,
      "pos": "",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "南の仕寄り",
      "taisho": "丹羽の先手",
      "hei": "1000",
      "n": 1000,
      "pos": "",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "東の包囲陣",
      "taisho": "蒲生の手（蒲生忠三郎）",
      "hei": "4000",
      "n": 4000,
      "pos": "",
      "house": "蒲生",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "對い鶴・金の三階傘の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "長岡山の陣",
      "taisho": "筒井順慶",
      "hei": "4000",
      "n": 4000,
      "pos": "",
      "house": "筒井",
      "mon": "umebachi",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "遅れて着く本隊",
      "taisho": "丹羽長秀・滝川一益",
      "hei": "660（遠景）",
      "n": 660,
      "pos": "",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 41,
      "d": 41
     }
    ]
   },
   {
    "side": "伊賀衆（比自山城）",
    "rows": [
     {
      "tai": "主郭の南辺",
      "taisho": "名は伝わらない",
      "hei": "1500",
      "n": 1500,
      "pos": "",
      "house": "伊賀衆",
      "mon": "maru",
      "flag": {
       "ground": "白",
       "fig": "無地（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "北の尾根曲輪",
      "taisho": "名は伝わらない",
      "hei": "800",
      "n": 800,
      "pos": "",
      "house": "伊賀衆",
      "mon": "maru",
      "flag": {
       "ground": "白",
       "fig": "無地（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "北外郭の退き口",
      "taisho": "名は伝わらない",
      "hei": "500",
      "n": 500,
      "pos": "",
      "house": "伊賀衆",
      "mon": "maru",
      "flag": {
       "ground": "白",
       "fig": "無地（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "東の脇曲輪",
      "taisho": "名は伝わらない",
      "hei": "700",
      "n": 700,
      "pos": "",
      "house": "伊賀衆",
      "mon": "maru",
      "flag": {
       "ground": "白",
       "fig": "無地（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田（信雄）",
    "n": 50000
   },
   {
    "side": "伊賀",
    "n": 9000
   }
  ]
 },
 "tottori": {
  "line": "oda",
  "src": "docs/fujin/tottori.md",
  "title": "鳥取城の戦い（天正九年 1581 七月〜十月二十五日）布陣図の表",
  "sides": [
   {
    "side": "羽柴（約二万）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "羽柴秀吉（黒田官兵衛が軍略）",
      "hei": "6,000",
      "n": 6000,
      "pos": "太閤ヶ平（東の本陣山）",
      "note": "役：囲みの司令",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     },
     {
      "tai": "丸山方面の囲み",
      "taisho": "羽柴秀長",
      "hei": "4,000",
      "n": 4000,
      "pos": "西北の丸山城の向かい",
      "note": "役：丸山城と雁金山を断つ",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "雁金山の備え",
      "taisho": "宮部継潤（垣屋ら）",
      "hei": "3,000",
      "n": 3000,
      "pos": "久松山と丸山の間",
      "note": "役：城と丸山のつなぎを断つ（開城後の城代）",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "栗谷側の付城",
      "taisho": "名は伝わらない",
      "hei": "4,000",
      "n": 4000,
      "pos": "城の南の麓・千代川の岸",
      "note": "役：主人公の持ち場（米舟・柵の口）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "船団"
     },
     {
      "tai": "円護寺側の付城",
      "taisho": "名は伝わらない",
      "hei": "3,000",
      "n": 3000,
      "pos": "久松山の北",
      "note": "役：北の囲み",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "河口の舟手",
      "taisho": "松井康之",
      "hei": "—",
      "n": null,
      "pos": "千代川の河口",
      "note": "役：兵糧舟を止める（台詞と遠景）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "船団"
     }
    ]
   },
   {
    "side": "吉川・毛利（城兵 約千四百・籠った民を合わせ約四千）",
    "rows": [
     {
      "tai": "本陣",
      "taisho": "吉川経家",
      "hei": "500",
      "n": 500,
      "pos": "久松山の山上",
      "note": "役：開城・自害",
      "house": "毛利（吉川）",
      "mon": "mori",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 35,
      "d": 35
     },
     {
      "tai": "麓の木戸と兵糧の番",
      "taisho": "森下道誉",
      "hei": "500",
      "n": 500,
      "pos": "麓の木戸",
      "note": "役：打って出る城兵",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "山上の曲輪の控え",
      "taisho": "中村春続",
      "hei": "400",
      "n": 400,
      "pos": "山上",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "丸山城",
      "taisho": "奈佐日本之介・塩冶高清",
      "hei": "不明",
      "n": null,
      "pos": "西北の丸山",
      "note": "役：自害",
      "house": "毛利（吉川）",
      "mon": "mori",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "後詰（来ない）",
      "taisho": "吉川元春",
      "hei": "—",
      "n": null,
      "pos": "伯耆",
      "note": "役：使番の知らせだけ",
      "house": "毛利（吉川）",
      "mon": "mori",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "控えの縦隊"
     }
    ]
   }
  ]
 },
 "takato": {
  "line": "oda",
  "src": "docs/fujin/takato.md",
  "title": "高遠城の戦い（天正十年 1582 三月二日）布陣図の表",
  "sides": [
   {
    "side": "織田（信忠の手 約三万）",
    "rows": [
     {
      "tai": "本陣・搦手",
      "taisho": "織田信忠",
      "hei": "10,000",
      "n": 10000,
      "pos": "西の搦手口",
      "note": "役：自ら塀に上がる（公記）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "大手の仕寄り",
      "taisho": "森長可",
      "hei": "5,000",
      "n": 5000,
      "pos": "東の大手道（主人公の持ち場）",
      "note": "役：大手門を破る",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "大手の控え",
      "taisho": "河尻秀隆",
      "hei": "5,000",
      "n": 5000,
      "pos": "大手の後ろ",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 88,
      "d": 141
     },
     {
      "tai": "大手の第二陣",
      "taisho": "団忠正",
      "hei": "4,000",
      "n": 4000,
      "pos": "大手の北寄り",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "大手の南脇",
      "taisho": "毛利長秀",
      "hei": "3,000",
      "n": 3000,
      "pos": "大手の南",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "大手の北脇・案内",
      "taisho": "小笠原信嶺",
      "hei": "3,000",
      "n": 3000,
      "pos": "大手の北",
      "note": "役：夜の浅瀬の案内",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     }
    ]
   },
   {
    "side": "武田（仁科盛信 約三千）",
    "rows": [
     {
      "tai": "本丸",
      "taisho": "仁科盛信",
      "hei": "900",
      "n": 900,
      "pos": "本丸",
      "note": "役：最後の抵抗・自害",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 57,
      "d": 40
     },
     {
      "tai": "三の丸と大手",
      "taisho": "諏訪勝右衛門",
      "hei": "960",
      "n": 960,
      "pos": "大手門の内",
      "note": "役：打って出る（妻はなは本丸で戦う）",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 59,
      "d": 41
     },
     {
      "tai": "二の丸",
      "taisho": "小山田昌行（昌成）",
      "hei": "540",
      "n": 540,
      "pos": "二の丸",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 44,
      "d": 31
     },
     {
      "tai": "西の搦手",
      "taisho": "名は伝わらない",
      "hei": "420",
      "n": 420,
      "pos": "法幢院・搦手",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 39,
      "d": 27
     },
     {
      "tai": "二の丸の控え",
      "taisho": "名は伝わらない",
      "hei": "180",
      "n": 180,
      "pos": "二の丸",
      "house": "武田",
      "mon": "takeda",
      "flag": {
       "ground": "赤",
       "fig": "黒の花菱（紺地の孫子の旗）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 17,
      "d": 27
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "織田（信忠）",
    "n": 30000
   },
   {
    "side": "高遠城",
    "n": 3000
   }
  ]
 },
 "tano": {
  "line": "oda",
  "src": "docs/fujin/tano.md",
  "title": "田野の戦い・天目山（天正十年 1582 三月十一日）布陣図の表",
  "sides": [
   {
    "side": "織田（滝川一益の手 約四千）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "滝川益重・篠岡平右衛門",
      "hei": "1,000",
      "n": 1000,
      "pos": "谷道の先",
      "note": "役：主人公の持ち場",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "本隊",
      "taisho": "滝川一益",
      "hei": "3,000",
      "n": 3000,
      "pos": "谷の入口（陣幕）",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "降った小山田",
      "taisho": "小山田信茂",
      "hei": "少数",
      "n": null,
      "pos": "谷の入口の脇",
      "note": "役：勝頼を拒んだ",
      "house": "滝川",
      "mon": "takigawa",
      "flag": {
       "ground": "白（赤い縁）",
       "fig": "丸に木瓜・金の三つ団子の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   },
   {
    "side": "武田（勝頼の供 約百・侍四十一）",
    "rows": [
     {
      "tai": "谷道の殿",
      "taisho": "名は伝わらない",
      "hei": "14",
      "n": 14,
      "pos": "四郎作の下手",
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 7,
      "d": 5
     },
     {
      "tai": "崖道",
      "taisho": "小宮山友晴",
      "hei": "9",
      "n": 9,
      "pos": "四郎作の崖道",
      "note": "役：討死",
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 6,
      "d": 4
     },
     {
      "tai": "鳥居畑の柵",
      "taisho": "名は伝わらない",
      "hei": "10",
      "n": 10,
      "pos": "鳥居畑",
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 6,
      "d": 4
     },
     {
      "tai": "屋敷の奥",
      "taisho": "土屋昌恒",
      "hei": "6",
      "n": 6,
      "pos": "平屋敷",
      "note": "役：最後の抵抗",
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 5,
      "d": 3
     },
     {
      "tai": "主",
      "taisho": "武田勝頼・信勝・北条夫人",
      "hei": "—",
      "n": null,
      "pos": "平屋敷",
      "note": "役：自害",
      "house": "武田（勝頼）",
      "mon": "takeda",
      "flag": {
       "ground": "白",
       "fig": "黒の「大」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   }
  ]
 },
 "honnoji": {
  "line": "oda",
  "src": "docs/fujin/honnoji.md",
  "title": "本能寺の変（天正十年 1582 六月二日）布陣図の表",
  "sides": [
   {
    "side": "明智（約一万三千）",
    "rows": [
     {
      "tai": "本隊",
      "taisho": "明智光秀",
      "hei": "3,000",
      "n": 3000,
      "pos": "本能寺の南（四条）",
      "note": "役：下知",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "先手",
      "taisho": "明智秀満",
      "hei": "3,000",
      "n": 3000,
      "pos": "表門（東）",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "先手",
      "taisho": "斎藤利三",
      "hei": "3,000",
      "n": 3000,
      "pos": "寺の北",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗（明智の家臣）",
       "color": 8368852
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "一門",
      "taisho": "明智光忠",
      "hei": "2,000",
      "n": 2000,
      "pos": "二条御所へ",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "寄せの頭",
      "taisho": "藤田伝五・溝尾茂朝",
      "hei": "各 1,000",
      "n": 1000,
      "pos": "寺の西・裏門",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "寄せ手の侍",
      "taisho": "安田作兵衛",
      "hei": "—",
      "n": null,
      "pos": "御殿の広間",
      "note": "役：蘭丸を討つ伝え",
      "house": "豊臣（寄せ手）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   },
   {
    "side": "織田（本能寺 約百・二条御所 約五百〜千五百）",
    "rows": [
     {
      "tai": "御殿",
      "taisho": "織田信長",
      "hei": "小姓衆と近臣 約百",
      "n": 100,
      "pos": "本能寺の御殿",
      "note": "役：弓・槍で戦い自害",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 19,
      "d": 13
     },
     {
      "tai": "小姓衆",
      "taisho": "森蘭丸・坊丸・力丸・湯浅直宗ら",
      "hei": "—",
      "n": null,
      "pos": "御殿・広間",
      "note": "役：討死",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     },
     {
      "tai": "厩",
      "taisho": "矢代勝介ら中間衆",
      "hei": "少数",
      "n": null,
      "pos": "厩",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     },
     {
      "tai": "二条御所",
      "taisho": "織田信忠",
      "hei": "500〜1,500",
      "n": 500,
      "pos": "二条新御所",
      "note": "役：自害",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "二条の侍",
      "taisho": "村井貞勝・斎藤利治・福富秀勝・菅屋長頼",
      "hei": "—",
      "n": null,
      "pos": "御所の門",
      "note": "役：討死",
      "house": "斎藤",
      "mon": "saito",
      "flag": {
       "ground": "白",
       "fig": "黒の二頭立波",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "明智",
    "n": 13000
   },
   {
    "side": "信長方",
    "n": 100
   }
  ]
 },
 "t01_yamazaki": {
  "line": "toyotomi",
  "src": "docs/fujin/t01_yamazaki.md",
  "title": "山崎（t01_yamazaki）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（およそ 40,000）",
    "rows": [
     {
      "tai": "先鋒 中央",
      "taisho": "高山右近",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物（川の南の岸）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "一の備 左",
      "taisho": "中川清秀",
      "hei": "2,500",
      "n": 2500,
      "pos": "",
      "note": "置き場：本物",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 94,
      "d": 66
     },
     {
      "tai": "一の備 右（川手）",
      "taisho": "池田恒興",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：本物（主人公の隊）",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "一の備 左（山手・天王山）",
      "taisho": "羽柴秀長",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：遠景の取り合い",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 79,
      "d": 126
     },
     {
      "tai": "予備 左",
      "taisho": "黒田官兵衛",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備（秀長と天王山の手）",
      "house": "黒田",
      "mon": "kuroda",
      "flag": {
       "ground": "上白・下黒",
       "fig": "藤巴",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "二の備 中央",
      "taisho": "堀秀政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二の備 右",
      "taisho": "加藤光泰",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場：本物",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "予備",
      "taisho": "丹羽長秀",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備（後ろ）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "予備",
      "taisho": "織田信孝",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：軽い備（後ろ）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 79,
      "d": 126
     },
     {
      "tai": "後詰",
      "taisho": "中村一氏・堀尾吉晴",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "堀尾",
      "mon": "horio",
      "flag": {
       "ground": "白",
       "fig": "分銅",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "旗本",
      "taisho": "羽柴秀吉",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     }
    ]
   },
   {
    "side": "明智勢（およそ 16,000）",
    "rows": [
     {
      "tai": "先鋒 中央",
      "taisho": "斎藤利三",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗（明智の家臣）",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "一の備 左（中川へ）",
      "taisho": "伊勢貞興",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗（明智の家臣）",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "一の備 左（天王山）",
      "taisho": "松田政近・並河易家",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物と遠景",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗（明智の家臣）",
       "color": 8368852
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     },
     {
      "tai": "一の備 右（淀川側）",
      "taisho": "津田信春",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗（明智の家臣）",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "二の備",
      "taisho": "阿閉貞征",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備（段5 は本物）。11/18 訳：山崎では討たれず、敗れて後に捕らえられ一族と斬られた＝野では傷で下がる",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗（明智の家臣）",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "予備",
      "taisho": "溝尾茂朝",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：本物（反撃の段）。11/18 訳：野を生きて退き、その夜 小栗栖で光秀の最期に付き従った＝野では傷で下がる",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "予備",
      "taisho": "御牧兼顕",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場：本物（殿の段）",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "後詰",
      "taisho": "勝竜寺城の留守（名を付けない）",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備（勝竜寺の後ろ）。11/18 訳：明智秀満はこの日安土城の守りで山崎にいない（敗報で坂本へ・打出浜で堀秀政と戦う）ので名を外した",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     },
     {
      "tai": "旗本",
      "taisho": "明智光秀",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：御坊塚の本陣",
      "house": "明智",
      "mon": "akechi",
      "flag": {
       "ground": "水色",
       "fig": "白の桔梗",
       "color": 8368852
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 71,
      "d": 71
     }
    ]
   }
  ]
 },
 "t02_shizugatake": {
  "line": "toyotomi",
  "src": "docs/fujin/t02_shizugatake.md",
  "title": "賤ヶ岳（t02_shizugatake）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（およそ 50,000）",
    "rows": [
     {
      "tai": "賤ヶ岳砦",
      "taisho": "桑山重晴",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場：本物（主人公の砦）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "岩崎山",
      "taisho": "高山右近",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "堂木山",
      "taisho": "木下一元",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "神明山",
      "taisho": "木村隼人正",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "東野山",
      "taisho": "堀秀政",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "丹羽の加勢",
      "taisho": "丹羽長秀",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "七本槍の小姓衆",
      "taisho": "加藤清正ら",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場：本物",
      "house": "加藤（清正）",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の南無妙法蓮華経",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "秀吉の先手（大垣から）",
      "taisho": "―",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：本物と軽い備",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 158,
      "d": 79
     },
     {
      "tai": "田上山",
      "taisho": "羽柴秀長",
      "hei": "15,000",
      "n": 15000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 231,
      "d": 162
     },
     {
      "tai": "旗本（大垣から）",
      "taisho": "羽柴秀吉",
      "hei": "15,000",
      "n": 15000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 194,
      "d": 194
     }
    ]
   },
   {
    "side": "柴田勢（およそ 30,000）",
    "rows": [
     {
      "tai": "行市山→大岩山",
      "taisho": "佐久間盛政",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場：本物",
      "house": "佐久間",
      "mon": "sakuma",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 169,
      "d": 118
     },
     {
      "tai": "飯浦の切通し",
      "taisho": "柴田勝政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "茂山",
      "taisho": "前田利家",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "別所山",
      "taisho": "前田利長",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "中谷山",
      "taisho": "不破勝光",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "林谷山",
      "taisho": "金森長近",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "金森",
      "mon": "kanamori",
      "flag": {
       "ground": "白",
       "fig": "裏梅鉢",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "予備",
      "taisho": "徳山則秀",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "予備",
      "taisho": "原長頼",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "内中尾山の本陣",
      "taisho": "柴田勝家",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "柴田",
      "mon": "kari",
      "flag": {
       "ground": "白",
       "fig": "二つ雁金・金の御幣の馬印",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     }
    ]
   }
  ]
 },
 "t03_komaki": {
  "line": "toyotomi",
  "src": "docs/fujin/t03_komaki.md",
  "title": "小牧の対陣（t03_komaki）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（およそ 70,000。十万とも）",
    "rows": [
     {
      "tai": "二重堀の砦",
      "taisho": "日根野弘就",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "小松寺山",
      "taisho": "堀秀政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備（夜は中入りへ）",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "岩崎山",
      "taisho": "池田恒興",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "note": "置き場：軽い備（夜は本物の列）",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "森の陣",
      "taisho": "森長可",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備（夜は本物の列）",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二の備",
      "taisho": "池田元助",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "二の備",
      "taisho": "三好信吉（秀次）",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場：軽い備（夜は中入りの大将）",
      "house": "羽柴",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "五三桐（秀吉の甥）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 169,
      "d": 118
     },
     {
      "tai": "予備",
      "taisho": "羽柴秀長",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "予備",
      "taisho": "蒲生氏郷",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "蒲生",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "對い鶴・金の三階傘の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "予備",
      "taisho": "加藤光泰",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "予備",
      "taisho": "細川忠興",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "細川",
      "mon": "kuyo",
      "flag": {
       "ground": "白",
       "fig": "黒の九曜",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "後詰",
      "taisho": "丹羽長重",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "楽田の本陣",
      "taisho": "羽柴秀吉",
      "hei": "30,000",
      "n": 30000,
      "pos": "",
      "note": "置き場：本陣と遠景の軍勢",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 274,
      "d": 274
     }
    ]
   },
   {
    "side": "徳川・信雄勢（およそ 30,000）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "酒井忠次",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "徳川（酒井）",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "赤い丸を縦に三つ",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 158,
      "d": 79
     },
     {
      "tai": "一の備",
      "taisho": "本多忠勝",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "一の備",
      "taisho": "榊原康政",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "榊原",
      "mon": "sakakibara",
      "flag": {
       "ground": "白",
       "fig": "源氏車",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "二の備",
      "taisho": "井伊直政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "井の字（赤備え）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "信雄の本陣",
      "taisho": "織田信雄",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "小牧山の本陣",
      "taisho": "徳川家康",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     }
    ]
   }
  ]
 },
 "t03b_nagakute": {
  "line": "toyotomi",
  "src": "docs/fujin/t03b_nagakute.md",
  "title": "小牧・長久手 二（t03b_nagakute）の布陣図",
  "sides": [
   {
    "side": "羽柴の別働隊（およそ 20,000）",
    "rows": [
     {
      "tai": "最後尾",
      "taisho": "三好信吉（秀次）",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場：本物（白山林）",
      "house": "羽柴",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "五三桐（秀吉の甥）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 169,
      "d": 118
     },
     {
      "tai": "秀次の陣の守り",
      "taisho": "―",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "豊臣（秀次）",
      "mon": "toyotomi",
      "flag": {
       "ground": "赤",
       "fig": "白の五三桐",
       "color": 10889759
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "三番手",
      "taisho": "堀秀政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物（檜ヶ根）",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二番手",
      "taisho": "森長可",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "森",
      "mon": "tsuru",
      "flag": {
       "ground": "白",
       "fig": "鶴の丸",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "先手",
      "taisho": "池田元助",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 100,
      "d": 50
     },
     {
      "tai": "先手の大将",
      "taisho": "池田恒興",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：本物",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 141,
      "d": 71
     }
    ]
   },
   {
    "side": "徳川・信雄勢（およそ 9,000〜15,000）",
    "rows": [
     {
      "tai": "先手（赤備え）",
      "taisho": "井伊直政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "井の字（赤備え）",
       "color": 10889759
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "一の備",
      "taisho": "水野忠重",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "水野",
      "mon": "mizuno",
      "flag": {
       "ground": "白",
       "fig": "沢瀉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "二の備（白山林を突く）",
      "taisho": "大須賀康高",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "小牧山から駆けつけ",
      "taisho": "本多忠勝",
      "hei": "500",
      "n": 500,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "信雄の本陣",
      "taisho": "織田信雄",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "家康の本陣（色金山・御旗山）",
      "taisho": "徳川家康",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     }
    ]
   }
  ]
 },
 "t04a_sengokubori": {
  "line": "toyotomi",
  "src": "docs/fujin/t04a_sengokubori.md",
  "title": "千石堀城（t04a_sengokubori）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（およそ十万のうち、この城と周りに出た手）",
    "rows": [
     {
      "tai": "先鋒",
      "taisho": "羽柴秀次",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場（ゲームの座標）：土橋の前（本物の隊に結ぶ）",
      "house": "羽柴",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "五三桐（秀吉の甥）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "第一線 左",
      "taisho": "筒井定次",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場（ゲームの座標）：秀次の左後ろ（本物）",
      "house": "筒井",
      "mon": "umebachi",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "第一線 右",
      "taisho": "堀秀政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場（ゲームの座標）：秀次の右後ろ（本物）",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "第二線",
      "taisho": "長谷川秀一",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場（ゲームの座標）：本丸攻めで来る（本物）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "畠中城の寄せ",
      "taisho": "中村一氏",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場（ゲームの座標）：東 (92, −44)",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "積善寺城の寄せ",
      "taisho": "仙石秀久",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場（ゲームの座標）：西 (−88, −52)",
      "house": "仙石",
      "mon": "eiraku",
      "flag": {
       "ground": "白",
       "fig": "黒の「無」",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "第二線 左",
      "taisho": "小西行長",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場（ゲームの座標）：西の奥 (−96, −110)",
      "house": "小西",
      "mon": "konishi",
      "flag": {
       "ground": "白",
       "fig": "黒の太い横帯と中結祇園守",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "第二線 右",
      "taisho": "蜂須賀正勝",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場（ゲームの座標）：東の奥 (96, −112)",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "予備",
      "taisho": "羽柴秀長",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場（ゲームの座標）：北東の奥 (34, −150)",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "旗本",
      "taisho": "羽柴秀吉",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場（ゲームの座標）：北の本陣 (−18, −142)（11/18：陣幕の後ろの幕に当たって重なるので −132 から下げた）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     },
     {
      "tai": "小荷駄",
      "taisho": "—",
      "hei": "800",
      "n": 800,
      "pos": "",
      "note": "置き場（ゲームの座標）：(−44, −160)",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     }
    ]
   },
   {
    "side": "根来衆（城兵 およそ1,500。城主 大谷左大仁と伝わる）",
    "rows": [
     {
      "tai": "土橋の前の手",
      "taisho": "",
      "hei": "150",
      "n": 150,
      "pos": "",
      "note": "置き場：本物の隊に結ぶ",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 27,
      "d": 14
     },
     {
      "tai": "虎口の手",
      "taisho": "",
      "hei": "300",
      "n": 300,
      "pos": "",
      "note": "置き場：本物",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "本丸から下りた手",
      "taisho": "",
      "hei": "150",
      "n": 150,
      "pos": "",
      "note": "置き場：本物",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 23,
      "d": 16
     },
     {
      "tai": "本丸の守り",
      "taisho": "",
      "hei": "600",
      "n": 600,
      "pos": "",
      "note": "置き場：(0, 41)",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "二の丸の虎口の内",
      "taisho": "",
      "hei": "300",
      "n": 300,
      "pos": "",
      "note": "置き場：(4, −16)（11/18 K281：竹束から見える所へ。元は二の丸の東 (15, −12)）",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "積善寺城の城兵",
      "taisho": "",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：南西 (−92, −6)",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "畠中城の城兵",
      "taisho": "",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：南東 (96, 2)",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ]
 },
 "t04_negoro": {
  "line": "toyotomi",
  "src": "docs/fujin/t04_negoro.md",
  "title": "根来寺（t04_negoro）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（谷の道に沿う長蛇）",
    "rows": [
     {
      "tai": "先鋒",
      "taisho": "羽柴秀次",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：参道の竹束（本物）",
      "house": "羽柴",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "五三桐（秀吉の甥）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "第一線 右",
      "taisho": "筒井定次",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "筒井",
      "mon": "umebachi",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "第一線 左",
      "taisho": "堀秀政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "第二線",
      "taisho": "仙石秀久",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "仙石",
      "mon": "eiraku",
      "flag": {
       "ground": "白",
       "fig": "黒の「無」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "第二線 左",
      "taisho": "中村一氏",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：谷の左の山裾",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "予備",
      "taisho": "蜂須賀正勝",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：谷の右の山裾",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "予備",
      "taisho": "羽柴秀長",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：谷の口の後ろ",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 125,
      "d": 200
     },
     {
      "tai": "旗本",
      "taisho": "羽柴秀吉",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：谷の口（本陣）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     }
    ]
   },
   {
    "side": "根来衆（寺に残った行人方と雑賀の加勢 およそ1,500）",
    "rows": [
     {
      "tai": "大門の内の行人方",
      "taisho": "",
      "hei": "300",
      "n": 300,
      "pos": "",
      "note": "置き場（谷の向きの座標 P(x, z)）：本物に結ぶ",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "雑賀の鉄砲衆",
      "taisho": "",
      "hei": "500",
      "n": 500,
      "pos": "",
      "note": "置き場（谷の向きの座標 P(x, z)）：門前の左の奥 P(−52, −22)",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 50,
      "d": 25
     },
     {
      "tai": "奥の院の行人方",
      "taisho": "",
      "hei": "700",
      "n": 700,
      "pos": "",
      "note": "置き場（谷の向きの座標 P(x, z)）：寺の奥 P(−40, 108)",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 50,
      "d": 35
     },
     {
      "tai": "坊舎・楼・縁の鉄砲",
      "taisho": "",
      "hei": "本物の兵のみ",
      "n": null,
      "pos": "",
      "note": "置き場（谷の向きの座標 P(x, z)）：参道ぞい",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）"
     }
    ]
   }
  ]
 },
 "t04b_ota": {
  "line": "toyotomi",
  "src": "docs/fujin/t04b_ota.md",
  "title": "太田城（t04b_ota）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（輪の囲み）",
    "rows": [
     {
      "tai": "築堤の軍団",
      "taisho": "羽柴秀長",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "note": "置き場：堤の北西（本物）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "東北",
      "taisho": "中村一氏",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：(128, −44)",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "東南",
      "taisho": "小西行長",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：(118, 92)",
      "house": "小西",
      "mon": "konishi",
      "flag": {
       "ground": "白",
       "fig": "黒の太い横帯と中結祇園守",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "南",
      "taisho": "浅野長政",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：(−8, 138)",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "西南",
      "taisho": "仙石秀久",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：(−130, 62)",
      "house": "仙石",
      "mon": "eiraku",
      "flag": {
       "ground": "白",
       "fig": "黒の「無」",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "西北",
      "taisho": "蜂須賀正勝",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：(−126, −72)",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "旗本",
      "taisho": "羽柴秀吉",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：北の本陣 (−18, −126)",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "小荷駄",
      "taisho": "—",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：(−60, −132)",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     }
    ]
   },
   {
    "side": "雑賀衆（城主 太田左近宗正、城兵 およそ5,000。地侍と百姓を合わせて）",
    "rows": [
     {
      "tai": "本丸の手（太田左近）",
      "taisho": "",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場（城の中）：(−12, 17)",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "北の門の内",
      "taisho": "",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場（城の中）：(−5, −17)（11/18 K281：築堤の場の正面へ。元は (9, −15)）",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "東の手",
      "taisho": "",
      "hei": "1,200",
      "n": 1200,
      "pos": "",
      "note": "置き場（城の中）：(14, 2)",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "西の手",
      "taisho": "",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場（城の中）：(−14, 5)",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "南の手",
      "taisho": "",
      "hei": "800",
      "n": 800,
      "pos": "",
      "note": "置き場（城の中）：(10, 19)",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "塀の鉄砲・打って出る手",
      "taisho": "",
      "hei": "本物の兵",
      "n": null,
      "pos": "",
      "note": "置き場（城の中）：北の塀・小舟・堤",
      "house": "雑賀衆",
      "mon": "namu",
      "flag": {
       "ground": "白",
       "fig": "黒の八咫烏",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）"
     }
    ]
   }
  ]
 },
 "t05_ichinomiya": {
  "line": "toyotomi",
  "src": "docs/fujin/t05_ichinomiya.md",
  "title": "一宮城（t05_ichinomiya）の布陣図",
  "sides": [
   {
    "side": "羽柴勢（およそ五万のうち一宮城を囲む手）",
    "rows": [
     {
      "tai": "先鋒",
      "taisho": "蜂須賀正勝",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：本物",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "第一線",
      "taisho": "黒田官兵衛",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：水の手の前（本物）",
      "house": "黒田",
      "mon": "kuroda",
      "flag": {
       "ground": "上白・下黒",
       "fig": "藤巴",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "第一線",
      "taisho": "蜂須賀家政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：水の手の前（本物）",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "東の大手",
      "taisho": "—",
      "hei": "15,000",
      "n": 15000,
      "pos": "",
      "note": "置き場：(150, −10)",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 231,
      "d": 162
     },
     {
      "tai": "第二線",
      "taisho": "藤堂高虎",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：(230, −120)",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "予備",
      "taisho": "増田長盛",
      "hei": "9,000",
      "n": 9000,
      "pos": "",
      "note": "置き場：(250, −200)",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 179,
      "d": 125
     },
     {
      "tai": "本陣",
      "taisho": "羽柴秀長",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場：北の河原（本物）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     }
    ]
   },
   {
    "side": "長宗我部方（城将 谷忠澄・江村親俊、城兵 およそ9,000）",
    "rows": [
     {
      "tai": "小倉丸",
      "taisho": "江村親俊",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：本物に結ぶ",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "黄",
       "fig": "黒い丸を縦に三つ",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "本丸",
      "taisho": "谷忠澄",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：城山の頂 (6, 124)",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "黄",
       "fig": "黒い丸を縦に三つ",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "東の曲輪",
      "taisho": "—",
      "hei": "2,500",
      "n": 2500,
      "pos": "",
      "note": "置き場：(52, 112)",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "東の大手の口",
      "taisho": "—",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場：組み合いの後ろ (160, 92)",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 56,
      "d": 89
     },
     {
      "tai": "麓の砦・谷の伏兵・水の手の番",
      "taisho": "—",
      "hei": "本物の兵",
      "n": null,
      "pos": "",
      "note": "置き場：段ごとに",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ]
 },
 "t06_hetsugi": {
  "line": "toyotomi",
  "src": "docs/fujin/t06_hetsugi.md",
  "title": "布陣図：戸次川の戦い（天正十四年十二月十二日・1587年1月）　t06_hetsugi",
  "sides": [
   {
    "side": "豊臣方（青・北の岸）　総勢およそ六千",
    "rows": [
     {
      "tai": "先陣",
      "taisho": "仙石秀久（軍監）",
      "hei": "2,000",
      "n": 2000,
      "pos": "浅瀬の手前 (−64, 46)",
      "xz": [
       -64,
       46
      ],
      "note": "向き：南",
      "house": "仙石",
      "mon": "eiraku",
      "flag": {
       "ground": "白",
       "fig": "黒の「無」",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 100,
      "d": 50
     },
     {
      "tai": "左",
      "taisho": "長宗我部信親",
      "hei": "2,000",
      "n": 2000,
      "pos": "(−100, 58)",
      "xz": [
       -100,
       58
      ],
      "note": "向き：南",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "右",
      "taisho": "十河存保",
      "hei": "1,000",
      "n": 1000,
      "pos": "(−84, 76)",
      "xz": [
       -84,
       76
      ],
      "note": "向き：南",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "後ろ（渡らず残る）",
      "taisho": "長宗我部元親",
      "hei": "1,000",
      "n": 1000,
      "pos": "(−142, 98)",
      "xz": [
       -142,
       98
      ],
      "note": "向き：南",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "陣（加勢）",
      "taisho": "大友義統の手（戸次統常ほか）",
      "hei": "—",
      "n": null,
      "pos": "鏡城の下の陣 (−170, 84)",
      "xz": [
       -170,
       84
      ],
      "note": "向き：南",
      "house": "大友",
      "mon": "otomo",
      "flag": {
       "ground": "白",
       "fig": "杏葉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   },
   {
    "side": "島津方（赤・南の岸）　総勢およそ一万二千",
    "rows": [
     {
      "tai": "先手（鶴賀城の囲み）",
      "taisho": "伊集院久宣",
      "hei": "2,000",
      "n": 2000,
      "pos": "(40, −72)",
      "xz": [
       40,
       -72
      ],
      "note": "備考：始めから見える。偽りに退く",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "西の林の伏せ",
      "taisho": "新納大膳亮",
      "hei": "5,000",
      "n": 5000,
      "pos": "(−60, −88)",
      "xz": [
       -60,
       -88
      ],
      "note": "備考：**伏せ**：伊集院が退いた後に出る",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "東の林の伏せ",
      "taisho": "島津豊久（本庄ほか）",
      "hei": "2,000",
      "n": 2000,
      "pos": "(108, −100)",
      "xz": [
       108,
       -100
      ],
      "note": "備考：**伏せ**",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "本隊・本陣",
      "taisho": "島津家久",
      "hei": "3,000",
      "n": 3000,
      "pos": "尾根の陰 (0, −182)・床几 (10, −158)",
      "xz": [
       0,
       -182
      ],
      "note": "備考：本陣は陣幕と幟",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "城の囲み",
      "taisho": "鶴賀城の城兵（利光宗魚・大友方）",
      "hei": "—",
      "n": null,
      "pos": "鶴賀城",
      "note": "備考：囲まれている",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ]
 },
 "t07_ganjaku": {
  "line": "toyotomi",
  "src": "docs/fujin/t07_ganjaku.md",
  "title": "布陣図：岩石城攻め（天正十五年四月一日・1587年）　t07_ganjaku",
  "sides": [
   {
    "side": "寄せ手（豊臣・青・麓）",
    "rows": [
     {
      "tai": "大手の先手",
      "taisho": "蒲生氏郷（蒲生郷成・本人の組）",
      "hei": "6千",
      "n": 6000,
      "pos": "坂の下 (−196, 120)",
      "xz": [
       -196,
       120
      ],
      "note": "備考：本物の兵と軽い大軍 420",
      "house": "蒲生",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "對い鶴・金の三階傘の馬印",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 173,
      "d": 87
     },
     {
      "tai": "大手の後ろ",
      "taisho": "蒲生の手",
      "hei": "4千",
      "n": 4000,
      "pos": "(−236, 96)",
      "xz": [
       -236,
       96
      ],
      "note": "備考：軽い大軍 300",
      "house": "蒲生",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "對い鶴・金の三階傘の馬印",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 79,
      "d": 126
     },
     {
      "tai": "搦手",
      "taisho": "前田利長（利勝）",
      "hei": "5千",
      "n": 5000,
      "pos": "(−170, 228)",
      "xz": [
       -170,
       228
      ],
      "note": "備考：軽い大軍 400",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "総大将の本陣",
      "taisho": "羽柴秀勝",
      "hei": "6千",
      "n": 6000,
      "pos": "(−214, 214)",
      "xz": [
       -214,
       214
      ],
      "note": "備考：陣幕・幟・軽い大軍 380",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     },
     {
      "tai": "秀吉の本隊の後ろの備",
      "taisho": "豊臣",
      "hei": "6千",
      "n": 6000,
      "pos": "(−118, 206)・(−92, 228)",
      "xz": [
       -118,
       206
      ],
      "note": "備考：軽い大軍 460・320",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     },
     {
      "tai": "東の尾根",
      "taisho": "羽柴秀勝の手",
      "hei": "2千",
      "n": 2000,
      "pos": "(54, 46)",
      "xz": [
       54,
       46
      ],
      "note": "備考：押し合い（tahoumen.js）240",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "西の尾根→北曲輪",
      "taisho": "蒲生の手",
      "hei": "1千",
      "n": 1000,
      "pos": "(−74, −26)",
      "xz": [
       -74,
       -26
      ],
      "note": "備考：押し合い 200",
      "house": "蒲生",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "對い鶴・金の三階傘の馬印",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   },
   {
    "side": "城方（秋月・赤・山の上）　およそ三千",
    "rows": [
     {
      "tai": "大手の門",
      "taisho": "芥田悪六兵衛",
      "hei": "600",
      "n": 600,
      "pos": "二の丸の門 (−56, 56) と坂",
      "xz": [
       -56,
       56
      ],
      "house": "秋月",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "撫子（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "二の丸",
      "taisho": "二の丸の城兵",
      "hei": "800",
      "n": 800,
      "pos": "(−32, 32)",
      "xz": [
       -32,
       32
      ],
      "house": "秋月",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "撫子（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "本丸",
      "taisho": "熊井越中守",
      "hei": "1000",
      "n": 1000,
      "pos": "(0, 0)",
      "xz": [
       0,
       0
      ],
      "house": "秋月",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "撫子（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "東・西の尾根の塀",
      "taisho": "城兵",
      "hei": "600",
      "n": 600,
      "pos": "押し合いの B（110 ずつ）",
      "house": "秋月",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "撫子（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     }
    ]
   }
  ]
 },
 "t08_nejirozaka": {
  "line": "toyotomi",
  "src": "docs/fujin/t08_nejirozaka.md",
  "title": "布陣図：根白坂の戦い（天正十五年四月十七日・1587年）　t08_nejirozaka",
  "sides": [
   {
    "side": "豊臣方（青・北）",
    "rows": [
     {
      "tai": "砦の守り",
      "taisho": "宮部継潤",
      "hei": "およそ一万",
      "n": 10000,
      "pos": "塀の内 (0, −5)",
      "xz": [
       0,
       -5
      ],
      "note": "備考：本人はここ",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "後詰（東から）",
      "taisho": "藤堂高虎",
      "hei": "五百ほど（先手）",
      "n": 500,
      "pos": "東の口 (36, −4)",
      "xz": [
       36,
       -4
      ],
      "note": "備考：史実で最初に駆け付けた",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "控えの縦隊",
      "w": 28,
      "d": 45
     },
     {
      "tai": "後詰",
      "taisho": "小早川隆景・黒田孝高",
      "hei": "数千",
      "n": 1000,
      "pos": "北東・北西の後ろ",
      "note": "備考：夜明けに着く",
      "house": "小早川",
      "mon": "kobayakawa",
      "flag": {
       "ground": "白",
       "fig": "違い鎌",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "総大将の本陣",
      "taisho": "羽柴秀長（尾藤知宣が軍監）",
      "hei": "数万",
      "n": 10000,
      "pos": "(14, −96)",
      "xz": [
       14,
       -96
      ],
      "note": "備考：秀長は後詰を出し渋った",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "後詰",
      "taisho": "宇喜多秀家",
      "hei": "—（推定 1万：総勢八万余の割り振り）",
      "n": 10000,
      "pos": "北の後ろ",
      "house": "宇喜多",
      "mon": "ukita",
      "flag": {
       "ground": "紺",
       "fig": "白の「児」",
       "color": 2042439
      },
      "jinkei": "控えの縦隊",
      "w": 125,
      "d": 200
     }
    ]
   },
   {
    "side": "島津方（赤・南）",
    "rows": [
     {
      "tai": "先手（猿渡の寄せ）",
      "taisho": "猿渡信光ほか",
      "hei": "3千",
      "n": 3000,
      "pos": "坂の下 (0, 40 前後)",
      "xz": [
       0,
       40
      ],
      "note": "備考：一の寄せ",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "本陣",
      "taisho": "島津義久",
      "hei": "5千",
      "n": 5000,
      "pos": "(−30, 158)",
      "xz": [
       -30,
       158
      ],
      "note": "備考：陣幕・幟",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 112,
      "d": 112
     },
     {
      "tai": "本陣",
      "taisho": "島津家久",
      "hei": "4千",
      "n": 4000,
      "pos": "(38, 156)",
      "xz": [
       38,
       156
      ],
      "note": "備考：陣幕・幟",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 100,
      "d": 100
     },
     {
      "tai": "寄せの大軍",
      "taisho": "島津義弘ほか",
      "hei": "8千",
      "n": 8000,
      "pos": "坂の下の左右",
      "note": "備考：軽い作り",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 169,
      "d": 118
     }
    ]
   }
  ]
 },
 "t09_yamanaka": {
  "line": "toyotomi",
  "src": "docs/fujin/t09_yamanaka.md",
  "title": "布陣図：山中城攻め（天正十八年三月二十九日・1590年）　t09_yamanaka",
  "sides": [
   {
    "side": "寄せ手（豊臣・青・南の坂）　およそ七万",
    "rows": [
     {
      "tai": "総大将",
      "taisho": "豊臣秀次",
      "hei": "2万",
      "n": 20000,
      "pos": "坂の下の奥（遠景）",
      "note": "備考：軽い大軍",
      "house": "羽柴",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "五三桐（秀吉の甥）",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 177,
      "d": 283
     },
     {
      "tai": "先手（出丸の東の口）",
      "taisho": "中村一氏（渡辺勘兵衛）",
      "hei": "5千",
      "n": 5000,
      "pos": "出丸の東 (−12, 172)",
      "xz": [
       -12,
       172
      ],
      "note": "備考：本物の兵",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 158,
      "d": 79
     },
     {
      "tai": "先手（出丸の東の口）",
      "taisho": "一柳直末（討死の後は直盛）",
      "hei": "3千",
      "n": 3000,
      "pos": "(−20, 180)",
      "xz": [
       -20,
       180
      ],
      "note": "備考：本物の兵",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "先手の後ろの支え",
      "taisho": "竹束の後ろの鉄砲組（先手から出す）",
      "hei": "8人（ゲーム）",
      "n": 8,
      "pos": "竹束の四m 後ろ (−17, 194)・出丸を向く",
      "xz": [
       -17,
       194
      ],
      "note": "備考：本物の兵。持ち場を離れず撃つ（11/18 持ち主 クラウド kaito2・K355）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 6,
      "d": 3
     },
     {
      "tai": "二陣",
      "taisho": "山内一豊",
      "hei": "3千",
      "n": 3000,
      "pos": "街道 (12, 194)",
      "xz": [
       12,
       194
      ],
      "note": "備考：本物の兵",
      "house": "山内",
      "mon": "kashiwa",
      "flag": {
       "ground": "上黒・下白",
       "fig": "三つ柏",
       "color": 1841688
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "堀の手",
      "taisho": "堀秀政",
      "hei": "8千",
      "n": 8000,
      "pos": "障子堀の東",
      "note": "備考：本物の兵",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 169,
      "d": 118
     },
     {
      "tai": "坂の下の本隊",
      "taisho": "秀次の手",
      "hei": "1万6千",
      "n": 16000,
      "pos": "(16, 340)・(−60, 320) ほか",
      "xz": [
       16,
       340
      ],
      "note": "備考：軽い大軍 700・500",
      "house": "豊臣（秀次）",
      "mon": "toyotomi",
      "flag": {
       "ground": "赤",
       "fig": "白の五三桐",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 200,
      "d": 200
     },
     {
      "tai": "南の尾根",
      "taisho": "徳川家康の手",
      "hei": "1万5千",
      "n": 15000,
      "pos": "遠景",
      "note": "備考：軽い大軍（shoshou.js）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 153,
      "d": 245
     }
    ]
   },
   {
    "side": "城方（北条・赤・山の上）　およそ四千",
    "rows": [
     {
      "tai": "岱崎出丸",
      "taisho": "間宮康俊",
      "hei": "200",
      "n": 200,
      "pos": "(−46, 176)",
      "xz": [
       -46,
       176
      ],
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 27,
      "d": 19
     },
     {
      "tai": "障子堀の縁",
      "taisho": "堀の縁の鉄砲",
      "hei": "300",
      "n": 300,
      "pos": "障子堀の北の縁",
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "三の丸の大手",
      "taisho": "三の丸の守り・馬出しの隊",
      "hei": "1000",
      "n": 1000,
      "pos": "(10, 48)",
      "xz": [
       10,
       48
      ],
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "二の丸",
      "taisho": "北条氏勝",
      "hei": "1500",
      "n": 1500,
      "pos": "(16, −46)",
      "xz": [
       16,
       -46
      ],
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "本丸",
      "taisho": "松田康長（弟の康郷）",
      "hei": "1000",
      "n": 1000,
      "pos": "(25, −106)",
      "xz": [
       25,
       -106
      ],
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "豊臣（秀次）",
    "n": 70000
   },
   {
    "side": "北条",
    "n": 4000
   }
  ]
 },
 "t10_oshi": {
  "line": "toyotomi",
  "src": "docs/fujin/t10_oshi.md",
  "title": "忍城攻め（t10_oshi）の布陣図",
  "sides": [
   {
    "side": "寄せ手（およそ 23,000〜24,000）",
    "rows": [
     {
      "tai": "先手（堤の守り）",
      "taisho": "―",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：本物",
      "house": "豊臣（寄せ手）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "一の備 左",
      "taisho": "佐竹義宣",
      "hei": "6,000",
      "n": 6000,
      "pos": "",
      "note": "置き場：本物と軽い備",
      "house": "佐竹",
      "mon": "satake",
      "flag": {
       "ground": "紺",
       "fig": "金の日の丸扇",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "一の備 右",
      "taisho": "長束正家",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "長束",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の花菱（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二の備",
      "taisho": "大谷吉継",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：本物",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "丸墓山の本陣（後に浅野長政・真田昌幸らが加わる）",
      "taisho": "石田三成",
      "hei": "12,000",
      "n": 12000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 173,
      "d": 173
     }
    ]
   },
   {
    "side": "成田方（城兵と籠った百姓・町人 およそ 2,600〜3,000）",
    "rows": [
     {
      "tai": "本丸",
      "taisho": "成田長親",
      "hei": "2,600",
      "n": 2600,
      "pos": "",
      "note": "置き場：本物の隊に結ぶ",
      "house": "成田",
      "mon": "narita",
      "flag": {
       "ground": "白",
       "fig": "竪三引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 96,
      "d": 67
     }
    ]
   }
  ]
 },
 "t11_hachioji": {
  "line": "toyotomi",
  "src": "docs/fujin/t11_hachioji.md",
  "title": "八王子城（t11_hachioji）の布陣図",
  "sides": [
   {
    "side": "前田・上杉勢（およそ 35,000。一万五千とも）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "前田の先手",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：本物",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 158,
      "d": 79
     },
     {
      "tai": "一の備",
      "taisho": "前田の侍衆",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：本物（主人公の組）",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "一の備 右（搦手）",
      "taisho": "上杉勢（藤田信吉）",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場：本物と軽い備",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "二の備",
      "taisho": "前田の二陣",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場：本物",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "予備",
      "taisho": "前田利長",
      "hei": "1,000",
      "n": 1000,
      "pos": "",
      "note": "置き場：本物",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "後詰",
      "taisho": "前田の後備え",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 68,
      "d": 110
     },
     {
      "tai": "本陣",
      "taisho": "前田利家",
      "hei": "8,000",
      "n": 8000,
      "pos": "",
      "note": "置き場：本陣",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     }
    ]
   }
  ]
 },
 "t12_odawara": {
  "line": "toyotomi",
  "src": "docs/fujin/t12_odawara.md",
  "title": "小田原征伐（t12_odawara）の布陣図",
  "sides": [
   {
    "side": "豊臣方の徳川の受け持ち（およそ 30,000。全軍は二十二万）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "井伊直政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：本物",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "井の字（赤備え）",
       "color": 10889759
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 122,
      "d": 61
     },
     {
      "tai": "一の備 右",
      "taisho": "松平康頼",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場：本物",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "一の備 左",
      "taisho": "本多忠勝",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二の備",
      "taisho": "徳川の二陣",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "旗本",
      "taisho": "徳川家康",
      "hei": "18,500",
      "n": 18500,
      "pos": "",
      "note": "置き場：本陣",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 215,
      "d": 215
     }
    ]
   },
   {
    "side": "北条方（城の東の受け持ち。城の中の総勢は五万余り）",
    "rows": [
     {
      "tai": "山王口",
      "taisho": "―",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "北の口",
      "taisho": "―",
      "hei": "4,000",
      "n": 4000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "海の側",
      "taisho": "―",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場：軽い備",
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "本丸",
      "taisho": "北条氏直",
      "hei": "16,000",
      "n": 16000,
      "pos": "",
      "note": "置き場：本物の隊に結ぶ",
      "house": "北条",
      "mon": "hojo",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ鱗",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 239,
      "d": 167
     }
    ]
   },
   {
    "side": "囲みの全国の大名（11/9 豊臣D。prototype/src/t12_odawara/hojin.js）",
    "rows": [
     {
      "tai": "",
      "taisho": "豊臣秀吉",
      "hei": "26,000",
      "n": 26000,
      "pos": "南西・石垣山（六月まで箱根湯本の早雲寺）",
      "note": "3D：遠景の軍勢・陣幕",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 202,
      "d": 322
     },
     {
      "tai": "",
      "taisho": "堀秀政（陣中で病死）",
      "hei": "8,000",
      "n": 8000,
      "pos": "石垣山の東の麓・海蔵寺",
      "note": "3D：遠景の軍勢・陣幕",
      "house": "堀",
      "mon": "hori",
      "flag": {
       "ground": "白",
       "fig": "黒の釘抜（推定）",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 112,
      "d": 179
     },
     {
      "tai": "",
      "taisho": "小早川隆景",
      "hei": "8,000",
      "n": 8000,
      "pos": "堀の陣の西（池田輝政・吉川広家らと）",
      "note": "3D：遠景の軍勢・陣幕",
      "house": "小早川",
      "mon": "kobayakawa",
      "flag": {
       "ground": "白",
       "fig": "違い鎌",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 112,
      "d": 179
     },
     {
      "tai": "",
      "taisho": "宇喜多秀家",
      "hei": "8,000",
      "n": 8000,
      "pos": "西・早川口の外",
      "note": "3D：遠景の軍勢・陣幕",
      "house": "宇喜多",
      "mon": "ukita",
      "flag": {
       "ground": "紺",
       "fig": "白の「児」",
       "color": 2042439
      },
      "jinkei": "控えの縦隊",
      "w": 112,
      "d": 179
     },
     {
      "tai": "",
      "taisho": "織田信雄",
      "hei": "15,000",
      "n": 15000,
      "pos": "北西の口の外",
      "note": "3D：遠景の軍勢・陣幕",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 153,
      "d": 245
     },
     {
      "tai": "",
      "taisho": "羽柴秀次",
      "hei": "17,000",
      "n": 17000,
      "pos": "北の口（蒲生氏郷・細川忠興らと）",
      "note": "3D：遠景の軍勢・陣幕（戦場の北の外を北西で代えて見せる）",
      "house": "羽柴",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "五三桐（秀吉の甥）",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 163,
      "d": 261
     },
     {
      "tai": "",
      "taisho": "徳川家康",
      "hei": "30,000",
      "n": 30000,
      "pos": "東・山王口から酒匂川",
      "note": "3D：上の表（本物の隊と def.depth）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 327,
      "d": 229
     },
     {
      "tai": "",
      "taisho": "長宗我部元親・九鬼嘉隆・脇坂安治・加藤嘉明の水軍",
      "hei": "10,000余",
      "n": 10000,
      "pos": "相模の海",
      "note": "3D：船（fleet）",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "船団"
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "豊臣",
    "n": 200000
   }
  ]
 },
 "k01_fushimi": {
  "line": "tokugawa",
  "src": "docs/fujin/k01_fushimi.md",
  "title": "伏見城の戦い　布陣図（慶長五年七月十九日〜八月一日）",
  "sides": [
   {
    "side": "城方（徳川・赤）千八百　— 本物の隊に結ぶ",
    "rows": [
     {
      "tai": "",
      "taisho": "鳥居元忠（総大将）",
      "hei": "600",
      "n": 600,
      "pos": "本丸",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "",
      "taisho": "松平家忠",
      "hei": "400",
      "n": 400,
      "pos": "三の丸の虎口",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 38,
      "d": 26
     },
     {
      "tai": "",
      "taisho": "松平近正",
      "hei": "300",
      "n": 300,
      "pos": "三の丸の東",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "",
      "taisho": "内藤家長",
      "hei": "300",
      "n": 300,
      "pos": "西の丸",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "",
      "taisho": "上林竹庵",
      "hei": "100",
      "n": 100,
      "pos": "太鼓の丸",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 19,
      "d": 13
     }
    ]
   },
   {
    "side": "寄せ手（西軍・青）四万　— 軽い備（army_depth）",
    "rows": [
     {
      "tai": "",
      "taisho": "宇喜多秀家（総大将）先手・二の手・旗本",
      "hei": "4000・4000・2000",
      "n": 10000,
      "pos": "南の大手 (0, 140)・(-8, 196)・本陣 (0, 222〜236)",
      "xz": [
       0,
       140
      ],
      "house": "宇喜多",
      "mon": "ukita",
      "flag": {
       "ground": "紺",
       "fig": "白の「児」",
       "color": 2042439
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "",
      "taisho": "鍋島勝茂",
      "hei": "6000",
      "n": 6000,
      "pos": "南東 (62, 176)",
      "xz": [
       62,
       176
      ],
      "house": "鍋島",
      "mon": "kuginuki",
      "flag": {
       "ground": "紺",
       "fig": "白の杏葉",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "",
      "taisho": "長宗我部盛親",
      "hei": "2000",
      "n": 2000,
      "pos": "南の奥 (40, 222)",
      "xz": [
       40,
       222
      ],
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "",
      "taisho": "長束正家",
      "hei": "1500",
      "n": 1500,
      "pos": "南西の奥 (-62, 214)（本物の陣は (-46, 186)）",
      "xz": [
       -62,
       214
      ],
      "house": "長束",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の花菱（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "",
      "taisho": "小西行長",
      "hei": "3000",
      "n": 3000,
      "pos": "南西 (-112, 128)",
      "xz": [
       -112,
       128
      ],
      "house": "小西",
      "mon": "konishi",
      "flag": {
       "ground": "白",
       "fig": "黒の太い横帯と中結祇園守",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "",
      "taisho": "小早川秀秋 先手・本隊",
      "hei": "3000・5000",
      "n": 8000,
      "pos": "西 (-118, 22)・(-150, 60)",
      "xz": [
       -118,
       22
      ],
      "house": "小早川",
      "mon": "kobayakawa",
      "flag": {
       "ground": "白",
       "fig": "違い鎌",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 169,
      "d": 118
     },
     {
      "tai": "",
      "taisho": "毛利秀元",
      "hei": "5000",
      "n": 5000,
      "pos": "東 (136, 12)",
      "xz": [
       136,
       12
      ],
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "",
      "taisho": "吉川広家",
      "hei": "3000",
      "n": 3000,
      "pos": "北東 (158, -36)",
      "xz": [
       158,
       -36
      ],
      "house": "毛利（吉川）",
      "mon": "mori",
      "flag": {
       "ground": "白",
       "fig": "三つ引両",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "",
      "taisho": "島津義弘",
      "hei": "1000",
      "n": 1000,
      "pos": "南東の大手寄り (112, 112)",
      "xz": [
       112,
       112
      ],
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     }
    ]
   }
  ]
 },
 "k02_kawada": {
  "line": "tokugawa",
  "src": "docs/fujin/k02_kawada.md",
  "title": "河田・米野の戦い　布陣図（慶長五年八月二十二日）",
  "sides": [
   {
    "side": "東軍（赤）",
    "rows": [
     {
      "tai": "",
      "taisho": "手勢",
      "hei": "300",
      "n": 300,
      "pos": "先頭",
      "note": "作り：本物の隊",
      "house": "徳川（東軍）",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "",
      "taisho": "一柳直盛",
      "hei": "400＋1000",
      "n": 1400,
      "pos": "左・(-205, 72)",
      "xz": [
       -205,
       72
      ],
      "note": "作り：本物＋軽い備",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 71,
      "d": 49
     },
     {
      "tai": "",
      "taisho": "池田長吉",
      "hei": "800",
      "n": 800,
      "pos": "中",
      "note": "作り：本物の隊",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白黒の段だら",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "",
      "taisho": "浅野幸長",
      "hei": "1500",
      "n": 1500,
      "pos": "左",
      "note": "作り：本物の隊",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "",
      "taisho": "山内一豊",
      "hei": "1000＋1000＋1000",
      "n": 3000,
      "pos": "右・(30, -26) 北岸へ後から・(122, 112)",
      "xz": [
       30,
       -26
      ],
      "note": "作り：本物＋軽い備",
      "house": "山内",
      "mon": "kashiwa",
      "flag": {
       "ground": "上黒・下白",
       "fig": "三つ柏",
       "color": 1841688
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "",
      "taisho": "池田の二陣・三陣",
      "hei": "2500・3000",
      "n": 5500,
      "pos": "(-22, -32) 北岸へ後から・(62, 128)",
      "xz": [
       -22,
       -32
      ],
      "note": "作り：軽い備",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白黒の段だら",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 140,
      "d": 98
     },
     {
      "tai": "",
      "taisho": "池田輝政（照政）本陣",
      "hei": "2000",
      "n": 2000,
      "pos": "(-24, 132)",
      "xz": [
       -24,
       132
      ],
      "note": "作り：本物の隊",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     }
    ]
   },
   {
    "side": "岐阜方（織田・青）",
    "rows": [
     {
      "tai": "",
      "taisho": "北岸の鉄砲",
      "hei": "600",
      "n": 600,
      "pos": "北岸の柵",
      "note": "作り：本物の隊",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "",
      "taisho": "木造長政",
      "hei": "800",
      "n": 800,
      "pos": "北岸",
      "note": "作り：本物の隊",
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "",
      "taisho": "東の浅瀬の手",
      "hei": "400",
      "n": 400,
      "pos": "東",
      "note": "作り：本物の隊",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 38,
      "d": 26
     },
     {
      "tai": "",
      "taisho": "後詰",
      "hei": "2000",
      "n": 2000,
      "pos": "(-8, -196)",
      "xz": [
       -8,
       -196
      ],
      "note": "作り：軽い備（新加納の段で岐阜へ退く）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "",
      "taisho": "織田秀信（旗本）",
      "hei": "3000",
      "n": 3000,
      "pos": "(-40, -206)",
      "xz": [
       -40,
       -206
      ],
      "note": "作り：軽い備（同上）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     }
    ]
   }
  ]
 },
 "k03_gifu": {
  "line": "tokugawa",
  "src": "docs/fujin/k03_gifu.md",
  "title": "岐阜城の戦い　布陣図（慶長五年八月二十三日）",
  "sides": [
   {
    "side": "東軍（赤）およそ三万四千",
    "rows": [
     {
      "tai": "",
      "taisho": "池田長吉（先手）",
      "hei": "1500",
      "n": 1500,
      "pos": "城下の西 (-184, 3)",
      "xz": [
       -184,
       3
      ],
      "note": "作り：本物の隊",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白黒の段だら",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "",
      "taisho": "池田の二の備",
      "hei": "2500",
      "n": 2500,
      "pos": "(-232, -26)",
      "xz": [
       -232,
       -26
      ],
      "note": "作り：軽い備",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白黒の段だら",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 94,
      "d": 66
     },
     {
      "tai": "",
      "taisho": "池田輝政（本陣）",
      "hei": "1500",
      "n": 1500,
      "pos": "(-214, 10)",
      "xz": [
       -214,
       10
      ],
      "note": "作り：本物の隊",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "",
      "taisho": "浅野幸長",
      "hei": "3000＋3500",
      "n": 6500,
      "pos": "瑞龍寺山 (-140, 150)・(-150, 182)",
      "xz": [
       -140,
       150
      ],
      "note": "作り：本物＋軽い備",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 152,
      "d": 107
     },
     {
      "tai": "",
      "taisho": "福島正則",
      "hei": "3000＋3000",
      "n": 6000,
      "pos": "南の大手 (18, 66)・(20, 110)",
      "xz": [
       18,
       66
      ],
      "note": "作り：本物＋軽い備",
      "house": "福島",
      "mon": "ichimonji",
      "flag": {
       "ground": "黒",
       "fig": "白の山道",
       "color": 1841688
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "",
      "taisho": "細川忠興",
      "hei": "5000",
      "n": 5000,
      "pos": "南 (-40, 136)",
      "xz": [
       -40,
       136
      ],
      "note": "作り：軽い備",
      "house": "細川",
      "mon": "kuyo",
      "flag": {
       "ground": "白",
       "fig": "黒の九曜",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "",
      "taisho": "加藤嘉明",
      "hei": "3000",
      "n": 3000,
      "pos": "南東 (60, 138)",
      "xz": [
       60,
       138
      ],
      "note": "作り：軽い備",
      "house": "加藤（嘉明）",
      "mon": "sagarifuji",
      "flag": {
       "ground": "白",
       "fig": "黒の十文字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "",
      "taisho": "京極高知",
      "hei": "3000",
      "n": 3000,
      "pos": "南西 (-96, 176)",
      "xz": [
       -96,
       176
      ],
      "note": "作り：軽い備",
      "house": "京極",
      "mon": "kyogoku",
      "flag": {
       "ground": "赤",
       "fig": "白の四つ目結",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "",
      "taisho": "井伊直政（目付）",
      "hei": "3600",
      "n": 3600,
      "pos": "西 (-230, 60)",
      "xz": [
       -230,
       60
      ],
      "note": "作り：軽い備",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "井の字（赤備え）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 113,
      "d": 79
     },
     {
      "tai": "",
      "taisho": "本多忠勝（目付）",
      "hei": "500",
      "n": 500,
      "pos": "西 (-250, 34)",
      "xz": [
       -250,
       34
      ],
      "note": "作り：軽い備",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     }
    ]
   },
   {
    "side": "城方（織田・青）およそ六千五百　— 本物の守りに結ぶ",
    "rows": [
     {
      "tai": "",
      "taisho": "津田藤三郎",
      "hei": "1200",
      "n": 1200,
      "pos": "城下の総門口 (-166, 4)",
      "xz": [
       -166,
       4
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 65,
      "d": 46
     },
     {
      "tai": "",
      "taisho": "百々綱家",
      "hei": "1200＋1200",
      "n": 2400,
      "pos": "居館 (-132, 0)・百曲りの砦 (-92, -6)",
      "xz": [
       -132,
       0
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 93,
      "d": 65
     },
     {
      "tai": "",
      "taisho": "木造長政",
      "hei": "1300",
      "n": 1300,
      "pos": "二の丸の櫓門 (-66, -2)",
      "xz": [
       -66,
       -2
      ],
      "house": "浅井",
      "mon": "azai",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ盛亀甲（井桁）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 68,
      "d": 48
     },
     {
      "tai": "",
      "taisho": "織田秀信（旗本）",
      "hei": "1600",
      "n": 1600,
      "pos": "上台所の先・本丸 (-20, 0)",
      "xz": [
       -20,
       0
      ],
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 76,
      "d": 53
     }
    ]
   }
  ]
 },
 "k04_kuisegawa": {
  "line": "tokugawa",
  "src": "docs/fujin/k04_kuisegawa.md",
  "title": "杭瀬川の戦い　布陣図（慶長五年九月十四日）",
  "sides": [
   {
    "side": "東軍（赤）",
    "rows": [
     {
      "tai": "",
      "taisho": "中村一栄（中村勢の先手）",
      "hei": "1500",
      "n": 1500,
      "pos": "T(84, 2)",
      "xz": [
       84,
       2
      ],
      "note": "作り：本物の隊",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 73,
      "d": 51
     },
     {
      "tai": "",
      "taisho": "野一色頼母",
      "hei": "500",
      "n": 500,
      "pos": "T(76, -8)",
      "xz": [
       76,
       -8
      ],
      "note": "作り：本物の隊",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "",
      "taisho": "有馬豊氏",
      "hei": "2000",
      "n": 2000,
      "pos": "T(80, -26)",
      "xz": [
       80,
       -26
      ],
      "note": "作り：本物の隊",
      "house": "有馬",
      "mon": "katabami",
      "flag": {
       "ground": "紺",
       "fig": "金の有馬瓜",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "",
      "taisho": "中村勢の二の備",
      "hei": "2000",
      "n": 2000,
      "pos": "T(132, 10)",
      "xz": [
       132,
       10
      ],
      "note": "作り：軽い備",
      "house": "豊臣の大名",
      "mon": "toyotomi",
      "flag": {
       "ground": "白",
       "fig": "家ごとの紋（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "",
      "taisho": "福島正則",
      "hei": "6000",
      "n": 6000,
      "pos": "T(170, -50)",
      "xz": [
       170,
       -50
      ],
      "note": "作り：軽い備（この日は動かない）",
      "house": "福島",
      "mon": "ichimonji",
      "flag": {
       "ground": "黒",
       "fig": "白の山道",
       "color": 1841688
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 146,
      "d": 102
     },
     {
      "tai": "",
      "taisho": "池田輝政",
      "hei": "4500",
      "n": 4500,
      "pos": "T(165, 100)",
      "xz": [
       165,
       100
      ],
      "note": "作り：軽い備（この日は動かない）",
      "house": "池田",
      "mon": "ageha",
      "flag": {
       "ground": "白",
       "fig": "揚羽蝶",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 127,
      "d": 89
     },
     {
      "tai": "",
      "taisho": "徳川家康（岡山の本陣・旗本）",
      "hei": "600",
      "n": 600,
      "pos": "T(205, -146)",
      "xz": [
       205,
       -146
      ],
      "note": "作り：本物の隊",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     }
    ]
   },
   {
    "side": "西軍（青）",
    "rows": [
     {
      "tai": "",
      "taisho": "蒲生郷舎（刈田の誘い）",
      "hei": "200",
      "n": 200,
      "pos": "T(62, 4)",
      "xz": [
       62,
       4
      ],
      "note": "作り：本物の隊",
      "house": "蒲生",
      "mon": "oda",
      "flag": {
       "ground": "白",
       "fig": "對い鶴・金の三階傘の馬印",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 27,
      "d": 19
     },
     {
      "tai": "",
      "taisho": "島左近",
      "hei": "300",
      "n": 300,
      "pos": "林の陰 T(-60, -52)",
      "xz": [
       -60,
       -52
      ],
      "note": "作り：本物の隊（出てから）",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "",
      "taisho": "明石全登（伏兵）",
      "hei": "800",
      "n": 800,
      "pos": "葦の中",
      "note": "作り：本物の隊。伏兵なので布陣図には出さない",
      "house": "宇喜多（明石）",
      "mon": "ukita",
      "flag": {
       "ground": "白",
       "fig": "黒の花クルス（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "",
      "taisho": "石田の備",
      "hei": "3000",
      "n": 3000,
      "pos": "T(-170, -70)",
      "xz": [
       -170,
       -70
      ],
      "note": "作り：軽い備",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "",
      "taisho": "宇喜多秀家・二の備",
      "hei": "8000・6000",
      "n": 14000,
      "pos": "T(-180, 40)・T(-204, 70)",
      "xz": [
       -180,
       40
      ],
      "note": "作り：軽い備",
      "house": "宇喜多",
      "mon": "ukita",
      "flag": {
       "ground": "紺",
       "fig": "白の「児」",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 224,
      "d": 157
     },
     {
      "tai": "",
      "taisho": "石田三成（後方の本陣）",
      "hei": "3000",
      "n": 3000,
      "pos": "T(-214, -46)（陣幕は T(-228, -40)）",
      "xz": [
       -214,
       -46
      ],
      "note": "作り：軽い備",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     }
    ]
   }
  ]
 },
 "k05_ueda": {
  "line": "tokugawa",
  "src": "docs/fujin/k05_ueda.md",
  "title": "第二次上田（k05_ueda）の布陣図　11/9 徳川B",
  "sides": [
   {
    "side": "真田（青・城方）",
    "rows": [
     {
      "tai": "本丸・大手",
      "taisho": "真田昌幸",
      "hei": "約一千七百",
      "n": 1000,
      "pos": "",
      "note": "置き場：上田城／作り：本物（旗本・大手門と隅櫓の鉄砲・弓）",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "伏兵",
      "taisho": "真田信繁",
      "hei": "約八百",
      "n": 800,
      "pos": "",
      "note": "置き場：虚空蔵山の麓／作り：本物（信繁の手・打って出る兵）",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     }
    ]
   },
   {
    "side": "徳川（赤・攻め方）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "本多忠政",
      "hei": "約一千九百",
      "n": 1000,
      "pos": "",
      "note": "置き場：城下の前／作り：本物",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "刈田の手",
      "taisho": "牧野康成",
      "hei": "約一千九百",
      "n": 1000,
      "pos": "",
      "note": "置き場：城の東の田／作り：本物",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "一の手",
      "taisho": "大久保忠隣",
      "hei": "約三千二百",
      "n": 3000,
      "pos": "",
      "note": "置き場：城下の北／作り：本物",
      "house": "大久保",
      "mon": "okubo",
      "flag": {
       "ground": "白",
       "fig": "上り藤",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二の手",
      "taisho": "榊原康政",
      "hei": "約三千八百",
      "n": 3000,
      "pos": "",
      "note": "置き場：本陣の前／作り：本物",
      "house": "榊原",
      "mon": "sakakibara",
      "flag": {
       "ground": "白",
       "fig": "源氏車",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 87,
      "d": 87
     },
     {
      "tai": "本陣",
      "taisho": "徳川秀忠",
      "hei": "約一万",
      "n": 10000,
      "pos": "",
      "note": "置き場：染屋台／作り：本物の本陣＋染屋台の軽い大軍（約一千人の塊）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "控え",
      "taisho": "仙石秀久・森忠政・酒井家次・菅沼忠政",
      "hei": "約九千五百",
      "n": 9000,
      "pos": "",
      "note": "置き場：染屋台の前の左右／作り：軽い備（hold）",
      "house": "仙石",
      "mon": "eiraku",
      "flag": {
       "ground": "白",
       "fig": "黒の「無」",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 119,
      "d": 190
     },
     {
      "tai": "後詰",
      "taisho": "奥平家昌・本多康重・戸田一西",
      "hei": "約五千三百",
      "n": 5000,
      "pos": "",
      "note": "置き場：染屋台の奥／作り：軽い備（hold）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 88,
      "d": 141
     },
     {
      "tai": "砥石城",
      "taisho": "真田信幸",
      "hei": "約一千",
      "n": 1000,
      "pos": "",
      "note": "置き場：北東の奥／作り：軽い備（六文銭・hold）",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ]
 },
 "k06_sekigahara": {
  "line": "tokugawa",
  "src": "docs/fujin/k06_sekigahara.md",
  "title": "関ヶ原（k06_sekigahara）の布陣図　11/9 徳川B",
  "sides": [
   {
    "side": "西軍（青）",
    "rows": [
     {
      "tai": "石田本陣",
      "taisho": "石田三成",
      "hei": "約六千（旗本二千・島左近一千・蒲生郷舎二千ほか）",
      "n": 6000,
      "pos": "",
      "note": "置き場：笹尾山／作り：本物（mitsu・sakon）＋軽い備（gamou）",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     },
     {
      "tai": "織田信高",
      "taisho": "織田信高",
      "hei": "五百",
      "n": 500,
      "pos": "",
      "note": "置き場：笹尾山のそば／作り：軽い備（hold）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "島津",
      "taisho": "島津義弘",
      "hei": "一千五百",
      "n": 1000,
      "pos": "",
      "note": "置き場：石田の南／作り：退き口まで見せない（約束）",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "小西",
      "taisho": "小西行長",
      "hei": "四千",
      "n": 4000,
      "pos": "",
      "note": "置き場：北天満山／作り：本物＋軽い二の備（konishi2）",
      "house": "小西",
      "mon": "konishi",
      "flag": {
       "ground": "白",
       "fig": "黒の太い横帯と中結祇園守",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "宇喜多",
      "taisho": "宇喜多秀家・明石全登",
      "hei": "一万七千",
      "n": 17000,
      "pos": "",
      "note": "置き場：天満山／作り：本物（明石・旗本）＋軽い二の備五千",
      "house": "宇喜多（明石）",
      "mon": "ukita",
      "flag": {
       "ground": "白",
       "fig": "黒の花クルス（推定）",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 206,
      "d": 206
     },
     {
      "tai": "大谷・平塚・戸田",
      "taisho": "大谷吉継・吉治・平塚為広",
      "hei": "約四千",
      "n": 4000,
      "pos": "",
      "note": "置き場：中山道の南の山中／作り：本物（平塚）＋軽い備（大谷吉治二千）",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "松尾山の麓",
      "taisho": "赤座・小川・朽木・脇坂",
      "hei": "約四千二百",
      "n": 4000,
      "pos": "",
      "note": "置き場：松尾山の北の麓に一列／作り：軽い大軍（jindate.js・寝返りで側が替わる）",
      "house": "脇坂",
      "mon": "wakisaka",
      "flag": {
       "ground": "白",
       "fig": "輪違い",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "小早川",
      "taisho": "小早川秀秋",
      "hei": "一万五千",
      "n": 15000,
      "pos": "",
      "note": "置き場：松尾山の上／作り：軽い大軍二つ（jindate.js）",
      "house": "小早川",
      "mon": "kobayakawa",
      "flag": {
       "ground": "白",
       "fig": "違い鎌",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 231,
      "d": 162
     },
     {
      "tai": "南宮山",
      "taisho": "毛利秀元・吉川広家・安国寺・長束・長宗我部",
      "hei": "約二万八千",
      "n": 28000,
      "pos": "",
      "note": "置き場：東の奥の南宮山／作り：軽い備（hold・一日動かない）",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 316,
      "d": 221
     }
    ]
   },
   {
    "side": "東軍（赤）",
    "rows": [
     {
      "tai": "北の前列",
      "taisho": "黒田長政・細川忠興・加藤嘉明・田中吉政",
      "hei": "一万六千四百",
      "n": 16000,
      "pos": "",
      "note": "置き場：笹尾山の前／作り：本物（黒田・細川・加藤）＋軽い（黒田二の備・田中）",
      "house": "細川",
      "mon": "kuyo",
      "flag": {
       "ground": "白",
       "fig": "黒の九曜",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 283,
      "d": 141
     },
     {
      "tai": "北の後ろ",
      "taisho": "古田重然・織田長益・金森長近・生駒一正",
      "hei": "四千四百",
      "n": 4000,
      "pos": "",
      "note": "置き場：北の前列の後ろ／作り：本物（金森）＋軽い",
      "house": "金森",
      "mon": "kanamori",
      "flag": {
       "ground": "白",
       "fig": "裏梅鉢",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 79,
      "d": 126
     },
     {
      "tai": "中央の前",
      "taisho": "福島正則",
      "hei": "六千",
      "n": 6000,
      "pos": "",
      "note": "置き場：宇喜多の前／作り：本物（可児才蔵を含む）＋軽い二陣",
      "house": "福島",
      "mon": "ichimonji",
      "flag": {
       "ground": "黒",
       "fig": "白の山道",
       "color": 1841688
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 173,
      "d": 87
     },
     {
      "tai": "福島の後ろと南",
      "taisho": "井伊直政・松平忠吉・藤堂高虎・京極高知・寺沢広高",
      "hei": "一万四千五百",
      "n": 14000,
      "pos": "",
      "note": "置き場：福島の後ろ・大谷に向く／作り：本物（井伊・藤堂）＋軽い（忠吉・京極・寺沢）",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "井の字（赤備え）",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 148,
      "d": 237
     },
     {
      "tai": "後方",
      "taisho": "本多忠勝",
      "hei": "五百（＋本多の手）",
      "n": 500,
      "pos": "",
      "note": "置き場：中央の後ろ／作り：本物＋軽い",
      "house": "本多",
      "mon": "honda",
      "flag": {
       "ground": "白",
       "fig": "立葵",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 28,
      "d": 45
     },
     {
      "tai": "本陣",
      "taisho": "徳川家康",
      "hei": "三万",
      "n": 30000,
      "pos": "",
      "note": "置き場：桃配山／作り：本物の本陣＋軽い旗本（一番大きい塊）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 274,
      "d": 274
     },
     {
      "tai": "南宮山の押さえ",
      "taisho": "浅野幸長・池田輝政・山内一豊",
      "hei": "約一万三千",
      "n": 13000,
      "pos": "",
      "note": "置き場：南宮山の麓／作り：軽い備（hold）",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 215,
      "d": 151
     }
    ]
   }
  ],
  "zukan": [
   {
    "side": "東軍",
    "n": 70000
   },
   {
    "side": "西軍",
    "n": 80000
   }
  ]
 },
 "k07_sawayama": {
  "line": "tokugawa",
  "src": "docs/fujin/k07_sawayama.md",
  "title": "佐和山城（k07_sawayama）の布陣図　11/9 徳川B",
  "sides": [
   {
    "side": "城方（青）",
    "rows": [
     {
      "tai": "本丸",
      "taisho": "石田正継",
      "hei": "約一千",
      "n": 1000,
      "pos": "",
      "note": "置き場：山頂／作り：本物（段ごとの守り）",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "大手・三の丸",
      "taisho": "石田正澄・山田上野之助",
      "hei": "約一千八百",
      "n": 1000,
      "pos": "",
      "note": "置き場：大手の口・三の丸／作り：本物（大手の守り・山田の手・櫓と隅櫓の番）",
      "house": "石田",
      "mon": "ishida",
      "flag": {
       "ground": "白",
       "fig": "黒の大一大万大吉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     }
    ]
   },
   {
    "side": "寄せ手（赤）",
    "rows": [
     {
      "tai": "小早川",
      "taisho": "小早川秀秋",
      "hei": "約八千",
      "n": 8000,
      "pos": "",
      "note": "置き場：大手の外の田／作り：本物の本陣＋軽い大軍二つ（四千五百・三千五百）",
      "house": "小早川",
      "mon": "kobayakawa",
      "flag": {
       "ground": "白",
       "fig": "違い鎌",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 141,
      "d": 141
     },
     {
      "tai": "脇坂",
      "taisho": "脇坂安治",
      "hei": "約一千",
      "n": 1000,
      "pos": "",
      "note": "置き場：大手の北の尾根／作り：本物の先手＋軽い後備え",
      "house": "脇坂",
      "mon": "wakisaka",
      "flag": {
       "ground": "白",
       "fig": "輪違い",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "朽木・赤座",
      "taisho": "朽木元綱・赤座直保",
      "hei": "約一千二百",
      "n": 1000,
      "pos": "",
      "note": "置き場：大手の北と南／作り：本物の陣",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "小川",
      "taisho": "小川祐忠",
      "hei": "約二千",
      "n": 2000,
      "pos": "",
      "note": "置き場：南の尾根／作り：本物（段の後で寄せる）",
      "house": "大谷と寄騎",
      "mon": "otani",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "井伊",
      "taisho": "井伊直政",
      "hei": "約三千六百",
      "n": 3000,
      "pos": "",
      "note": "置き場：南（正法山の側）／作り：本物の陣＋軽い大軍",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "井の字（赤備え）",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "田中",
      "taisho": "田中吉政",
      "hei": "約三千",
      "n": 3000,
      "pos": "",
      "note": "置き場：西の湖の側（搦手）／作り：本物の手＋軽い大軍",
      "house": "田中",
      "mon": "kuki",
      "flag": {
       "ground": "白",
       "fig": "黒の左三つ巴",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     }
    ]
   }
  ]
 },
 "k08_osaka_kizu": {
  "line": "tokugawa",
  "src": "docs/fujin/k08_osaka_kizu.md",
  "title": "木津川口（k08_osaka_kizu）の布陣図　11/9 徳川C",
  "sides": [
   {
    "side": "徳川（攻め方）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "蜂須賀の先手",
      "hei": "約九百",
      "n": 900,
      "pos": "",
      "note": "置き場：入り江の南岸／作り：本物（bind）",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 67,
      "d": 34
     },
     {
      "tai": "東の手",
      "taisho": "蜂須賀の別手",
      "hei": "約六百",
      "n": 600,
      "pos": "",
      "note": "置き場：砦の東／作り：本物（bind）",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "遊撃",
      "taisho": "池田忠雄",
      "hei": "約一千五百",
      "n": 1000,
      "pos": "",
      "note": "置き場：西／作り：本物（bind）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "搦手",
      "taisho": "浅野長晟",
      "hei": "約二千",
      "n": 2000,
      "pos": "",
      "note": "置き場：東から／作り：本物（bind）",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "予備",
      "taisho": "蜂須賀の二陣",
      "hei": "約九百",
      "n": 900,
      "pos": "",
      "note": "置き場：本陣の前／作り：軽い備",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 47,
      "d": 47
     },
     {
      "tai": "本陣",
      "taisho": "蜂須賀至鎮",
      "hei": "約六百",
      "n": 600,
      "pos": "",
      "note": "置き場：南の陣幕／作り：本物（bind）",
      "house": "蜂須賀",
      "mon": "hachisuka",
      "flag": {
       "ground": "白",
       "fig": "卍",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 39,
      "d": 39
     },
     {
      "tai": "西の衆",
      "taisho": "森忠政・石川忠総・鍋島勝茂・松平忠明・山内忠義・稲葉典通",
      "hei": "約二万（目安）",
      "n": 20000,
      "pos": "",
      "note": "置き場：砦と城の間（城の西の堀の外）／作り：軽い備（hold）と陣幕・篝火（k08/iriguchi.js。森・稲葉・葵の幕）",
      "house": "山内",
      "mon": "kashiwa",
      "flag": {
       "ground": "上黒・下白",
       "fig": "三つ柏",
       "color": 1841688
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "南の衆",
      "taisho": "前田利常・井伊直孝・松平忠直・藤堂高虎・伊達政宗",
      "hei": "約四万",
      "n": 40000,
      "pos": "",
      "note": "置き場：遠くの城の南（真田丸の前）／作り：軽い備（hold）",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "赤備え",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 378,
      "d": 265
     },
     {
      "tai": "本陣",
      "taisho": "徳川家康（茶臼山）・徳川秀忠（岡山）",
      "hei": "三万・二万",
      "n": 30000,
      "pos": "",
      "note": "置き場：遠くの城の南西・南東／作り：軽い備（hold）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 274,
      "d": 274
     }
    ]
   },
   {
    "side": "豊臣（砦）",
    "rows": [
     {
      "tai": "砦の守り",
      "taisho": "明石全延",
      "hei": "約八百（前・門・内・旗本）",
      "n": 800,
      "pos": "",
      "note": "置き場：砦／作り：本物",
      "house": "宇喜多（明石）",
      "mon": "ukita",
      "flag": {
       "ground": "白",
       "fig": "黒の花クルス（推定）",
       "color": 15130832
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "博労淵",
      "taisho": "薄田兼相",
      "hei": "約七百",
      "n": 700,
      "pos": "",
      "note": "置き場：砦の北西／作り：軽い備（hold）",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 50,
      "d": 35
     },
     {
      "tai": "城の西の堀ぞい",
      "taisho": "毛利勝永・後藤基次・大野治房",
      "hei": "四千・三千・五千",
      "n": 4000,
      "pos": "",
      "note": "置き場：遠くの城の西の縁／作り：軽い備（hold）",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   }
  ]
 },
 "k09_imafuku": {
  "line": "tokugawa",
  "src": "docs/fujin/k09_imafuku.md",
  "title": "今福（k09_imafuku）の布陣図　11/9 徳川C",
  "sides": [
   {
    "side": "佐竹（攻め方）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "梅津憲忠",
      "hei": "約四百",
      "n": 400,
      "pos": "",
      "note": "作り：本物（主人公の隊）",
      "house": "佐竹",
      "mon": "satake",
      "flag": {
       "ground": "紺",
       "fig": "金の日の丸扇",
       "color": 2042439
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 45,
      "d": 22
     },
     {
      "tai": "一の手",
      "taisho": "渋江政光",
      "hei": "約四百",
      "n": 400,
      "pos": "",
      "note": "作り：本物（討死）",
      "house": "佐竹",
      "mon": "satake",
      "flag": {
       "ground": "紺",
       "fig": "金の日の丸扇",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 38,
      "d": 26
     },
     {
      "tai": "二の手",
      "taisho": "戸村義国",
      "hei": "約三百",
      "n": 300,
      "pos": "",
      "note": "作り：本物",
      "house": "佐竹",
      "mon": "satake",
      "flag": {
       "ground": "紺",
       "fig": "金の日の丸扇",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 33,
      "d": 23
     },
     {
      "tai": "後備・荷駄",
      "taisho": "―",
      "hei": "約五百",
      "n": 500,
      "pos": "",
      "note": "作り：堤の東の奥（見せない）",
      "house": "佐竹",
      "mon": "satake",
      "flag": {
       "ground": "紺",
       "fig": "金の日の丸扇",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     },
     {
      "tai": "本陣",
      "taisho": "佐竹義宣",
      "hei": "約四百",
      "n": 400,
      "pos": "",
      "note": "作り：本物",
      "house": "佐竹",
      "mon": "satake",
      "flag": {
       "ground": "紺",
       "fig": "金の日の丸扇",
       "color": 2042439
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 32,
      "d": 32
     }
    ]
   },
   {
    "side": "豊臣",
    "rows": [
     {
      "tai": "砦の守り",
      "taisho": "矢野正倫・飯田家貞",
      "hei": "約六百",
      "n": 600,
      "pos": "",
      "note": "作り：本物",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     },
     {
      "tai": "反撃",
      "taisho": "木村重成（本隊・二の手）",
      "hei": "約二千五百",
      "n": 2000,
      "pos": "",
      "note": "作り：本物",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "加勢",
      "taisho": "後藤又兵衛",
      "hei": "約一千五百",
      "n": 1000,
      "pos": "",
      "note": "作り：本物（舟の鉄砲を含む）",
      "house": "後藤",
      "mon": "sagarifuji",
      "flag": {
       "ground": "白",
       "fig": "無地・銀の三日月の指物",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 71,
      "d": 35
     }
    ]
   }
  ]
 },
 "k10_shigino": {
  "line": "tokugawa",
  "src": "docs/fujin/k10_shigino.md",
  "title": "鴫野（k10_shigino）の布陣図　11/9 徳川C",
  "sides": [
   {
    "side": "上杉（攻め方）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "須田長義",
      "hei": "約一千",
      "n": 1000,
      "pos": "",
      "note": "作り：本物",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "一の手",
      "taisho": "安田能元",
      "hei": "約八百",
      "n": 800,
      "pos": "",
      "note": "作り：本物",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "二の手",
      "taisho": "水原親憲（鉄砲）",
      "hei": "約六百",
      "n": 600,
      "pos": "",
      "note": "作り：本物",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "後備",
      "taisho": "―",
      "hei": "約一千二百",
      "n": 1000,
      "pos": "",
      "note": "作り：軽い備（毘の旗）",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "本陣",
      "taisho": "上杉景勝・直江兼続",
      "hei": "約一千",
      "n": 1000,
      "pos": "",
      "note": "作り：本物",
      "house": "上杉",
      "mon": "uesugi",
      "flag": {
       "ground": "紺",
       "fig": "赤の日の丸・白地に毘",
       "color": 2042439
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 50,
      "d": 50
     },
     {
      "tai": "後詰",
      "taisho": "榊原康勝",
      "hei": "約一千五百",
      "n": 1000,
      "pos": "",
      "note": "作り：本物",
      "house": "榊原",
      "mon": "sakakibara",
      "flag": {
       "ground": "白",
       "fig": "源氏車",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "後詰",
      "taisho": "堀尾忠晴",
      "hei": "約一千五百",
      "n": 1000,
      "pos": "",
      "note": "作り：軽い備（hold）",
      "house": "堀尾",
      "mon": "horio",
      "flag": {
       "ground": "白",
       "fig": "分銅",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     },
     {
      "tai": "後詰",
      "taisho": "丹羽長重",
      "hei": "約一千五百",
      "n": 1000,
      "pos": "",
      "note": "作り：軽い備（hold・11/9 足した）",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 40,
      "d": 63
     }
    ]
   },
   {
    "side": "豊臣",
    "rows": [
     {
      "tai": "一・二の柵",
      "taisho": "―",
      "hei": "約六百",
      "n": 600,
      "pos": "",
      "note": "作り：本物",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "三の柵",
      "taisho": "井上頼次",
      "hei": "約一千四百",
      "n": 1000,
      "pos": "",
      "note": "作り：本物",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "救援",
      "taisho": "渡辺糺・木村宗明・大野治長",
      "hei": "約一万一千",
      "n": 11000,
      "pos": "",
      "note": "作り：本物（前の組）＋数の比",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 198,
      "d": 139
     },
     {
      "tai": "奥",
      "taisho": "大野治房",
      "hei": "約二千",
      "n": 2000,
      "pos": "",
      "note": "作り：軽い備（hold）",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     }
    ]
   }
  ]
 },
 "k11_sanadamaru": {
  "line": "tokugawa",
  "src": "docs/fujin/k11_sanadamaru.md",
  "title": "真田丸（k11_sanadamaru）の布陣図　11/9 徳川C",
  "sides": [
   {
    "side": "徳川",
    "rows": [
     {
      "tai": "先手",
      "taisho": "山崎長徳",
      "hei": "約六百",
      "n": 600,
      "pos": "",
      "note": "作り：本物（主人公の組）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 55,
      "d": 27
     },
     {
      "tai": "二の手",
      "taisho": "本多政重",
      "hei": "約八百",
      "n": 800,
      "pos": "",
      "note": "作り：本物",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 53,
      "d": 37
     },
     {
      "tai": "前田の本隊",
      "taisho": "前田利常",
      "hei": "約一万六百",
      "n": 10000,
      "pos": "",
      "note": "作り：軽い備（hold）",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 158,
      "d": 158
     },
     {
      "tai": "左",
      "taisho": "井伊直孝・松平忠直",
      "hei": "四千・一万",
      "n": 4000,
      "pos": "",
      "note": "作り：軽い備（hold。寄せの段で本物の寄せ手も出る）",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "赤備え",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "右",
      "taisho": "藤堂高虎・伊達政宗",
      "hei": "四千・一万",
      "n": 4000,
      "pos": "",
      "note": "作り：軽い備（hold）",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 120,
      "d": 84
     },
     {
      "tai": "岡山（南東）",
      "taisho": "徳川秀忠",
      "hei": "約二万",
      "n": 20000,
      "pos": "",
      "note": "作り：軽い備（hold）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "本陣",
      "taisho": "徳川家康（茶臼山）",
      "hei": "約三万",
      "n": 30000,
      "pos": "",
      "note": "作り：見せない（戦場の外。使番で下知）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 274,
      "d": 274
     }
    ]
   },
   {
    "side": "豊臣",
    "rows": [
     {
      "tai": "丸の塀",
      "taisho": "―",
      "hei": "約四千",
      "n": 4000,
      "pos": "",
      "note": "作り：本物（塀の上の鉄砲）",
      "house": "豊臣",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 141,
      "d": 71
     },
     {
      "tai": "丸の本陣",
      "taisho": "真田信繁",
      "hei": "約一千",
      "n": 1000,
      "pos": "",
      "note": "作り：本物",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 50,
      "d": 50
     },
     {
      "tai": "南の堀ぞい（西から）",
      "taisho": "後藤又兵衛・長宗我部盛親・木村重成・明石全登（黒門口）",
      "hei": "二千・三千・三千・二千",
      "n": 2000,
      "pos": "",
      "note": "作り：軽い備（hold。kaito の冬の陣の布陣図の並び）",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     }
    ]
   }
  ]
 },
 "k12_kashii": {
  "line": "tokugawa",
  "src": "docs/fujin/k12_kashii.md",
  "title": "樫井の布陣図（慶長二十年四月二十九日・泉州樫井）",
  "sides": [
   {
    "side": "浅野（徳川方・赤）　およそ五千",
    "rows": [
     {
      "tai": "先手",
      "taisho": "亀田高綱（大隅）",
      "hei": "300",
      "n": 300,
      "pos": "樫井の村の北の口（安松から退きつつ受ける）",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 39,
      "d": 19
     },
     {
      "tai": "一陣",
      "taisho": "上田宗箇・浅野知近",
      "hei": "700・700",
      "n": 1400,
      "pos": "村の中と東",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 71,
      "d": 49
     },
     {
      "tai": "二陣",
      "taisho": "（浅野の侍）",
      "hei": "1200・600",
      "n": 1800,
      "pos": "村の南",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 80,
      "d": 56
     },
     {
      "tai": "旗本",
      "taisho": "浅野長晟",
      "hei": "1000",
      "n": 1000,
      "pos": "街道の南・本陣 {6,120}",
      "xz": [
       6,
       120
      ],
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 50,
      "d": 50
     },
     {
      "tai": "後備え",
      "taisho": "",
      "hei": "500",
      "n": 500,
      "pos": "さらに南",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 42,
      "d": 30
     }
    ]
   },
   {
    "side": "豊臣（青）　前に出た手は千に足りず、後ろに大野治房の本隊（数千・貝塚）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "塙団右衛門",
      "hei": "300（伝え 二〜三百）",
      "n": 300,
      "pos": "街道を南へ突き出る",
      "house": "織田",
      "mon": "eiraku",
      "flag": {
       "ground": "黄",
       "fig": "黒の永楽通宝を縦に三つ（本陣は金の唐傘の馬印）",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 39,
      "d": 19
     },
     {
      "tai": "先手",
      "taisho": "岡部則綱",
      "hei": "300",
      "n": 300,
      "pos": "塙と先を争い、横（東）から寄せる",
      "house": "今川",
      "mon": "imagawa",
      "flag": {
       "ground": "白",
       "fig": "黒の二引両と五七桐",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 39,
      "d": 19
     },
     {
      "tai": "一陣",
      "taisho": "淡輪重政",
      "hei": "200",
      "n": 200,
      "pos": "塙の後ろ",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 18,
      "d": 28
     },
     {
      "tai": "本隊",
      "taisho": "大野治房",
      "hei": "3000＋1500",
      "n": 4500,
      "pos": "北の貝塚の方（{26,−200}）。樫井には来ず",
      "xz": [
       26,
       -200
      ],
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 106,
      "d": 106
     },
     {
      "tai": "本隊の横・後ろ",
      "taisho": "大野治胤（道犬）ほか・荷駄",
      "hei": "2000・2000・500",
      "n": 4500,
      "pos": "治房の東と後ろ（徳川C 11/9 が足した。治房の軍を二万ほどとする伝えによる。場所は補完）",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 106,
      "d": 106
     }
    ]
   }
  ]
 },
 "k13_domyoji": {
  "line": "tokugawa",
  "src": "docs/fujin/k13_domyoji.md",
  "title": "道明寺の布陣図（慶長二十年五月六日・河内国分〜道明寺〜誉田）",
  "sides": [
   {
    "side": "徳川・大和口（赤）　およそ三万四千六百",
    "rows": [
     {
      "tai": "先手",
      "taisho": "松倉重政・堀直寄",
      "hei": "500・500",
      "n": 1000,
      "pos": "小松山の東の麓",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 71,
      "d": 35
     },
     {
      "tai": "一番",
      "taisho": "水野勝成",
      "hei": "2000＋800（大和組と合わせ 3800）",
      "n": 6600,
      "pos": "小松山の東",
      "house": "水野",
      "mon": "mizuno",
      "flag": {
       "ground": "白",
       "fig": "沢瀉",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 154,
      "d": 107
     },
     {
      "tai": "二番",
      "taisho": "本多忠政",
      "hei": "3500＋1500（5000）",
      "n": 10000,
      "pos": "小松山の北東",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "三番",
      "taisho": "松平忠明",
      "hei": "2500＋1300（3800）",
      "n": 7600,
      "pos": "小松山の南東",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 165,
      "d": 115
     },
     {
      "tai": "四番",
      "taisho": "伊達政宗（片倉重綱を先に）",
      "hei": "4000＋1000＋2000＋3000（10000）",
      "n": 20000,
      "pos": "国分の西・誉田へ向かう",
      "house": "伊達",
      "mon": "date",
      "flag": {
       "ground": "紺",
       "fig": "金の日輪",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 267,
      "d": 187
     },
     {
      "tai": "五番",
      "taisho": "松平忠輝",
      "hei": "2000＋10000（12000）",
      "n": 24000,
      "pos": "国分の奥・峠の口",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 293,
      "d": 205
     }
    ]
   },
   {
    "side": "豊臣（青）　およそ一万八千（後藤が先に着き、ほかは霧で遅れる）",
    "rows": [
     {
      "tai": "先手",
      "taisho": "後藤又兵衛",
      "hei": "2000＋800（2800）",
      "n": 5600,
      "pos": "小松山の頂",
      "house": "後藤",
      "mon": "sagarifuji",
      "flag": {
       "ground": "白",
       "fig": "無地・銀の三日月の指物",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 167,
      "d": 84
     },
     {
      "tai": "二番",
      "taisho": "薄田兼相",
      "hei": "1500＋1500",
      "n": 3000,
      "pos": "石川の西・道明寺",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "二番",
      "taisho": "明石全登",
      "hei": "2000",
      "n": 2000,
      "pos": "道明寺の南",
      "house": "宇喜多（明石）",
      "mon": "ukita",
      "flag": {
       "ground": "白",
       "fig": "黒の花クルス（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "後詰",
      "taisho": "毛利勝永・真田信繁",
      "hei": "4000・3500",
      "n": 7500,
      "pos": "藤井寺〜誉田（遅れて着き、誉田で伊達と当たる）",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "控えの縦隊",
      "w": 108,
      "d": 173
     },
     {
      "tai": "後備え",
      "taisho": "",
      "hei": "3000",
      "n": 3000,
      "pos": "藤井寺の奥",
      "house": "後藤",
      "mon": "sagarifuji",
      "flag": {
       "ground": "白",
       "fig": "無地・銀の三日月の指物",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     }
    ]
   }
  ]
 },
 "k14_yao_wakae": {
  "line": "tokugawa",
  "src": "docs/fujin/k14_yao_wakae.md",
  "title": "八尾・若江の布陣図（慶長二十年五月六日・河内の八尾と若江）",
  "sides": [
   {
    "side": "徳川（赤）",
    "rows": [
     {
      "tai": "若江・先手",
      "taisho": "川手良列",
      "hei": "500",
      "n": 500,
      "pos": "若江の東の堤",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 50,
      "d": 25
     },
     {
      "tai": "若江・一陣",
      "taisho": "庵原朝昌",
      "hei": "500",
      "n": 500,
      "pos": "先手の後ろ",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 28,
      "d": 45
     },
     {
      "tai": "若江・二陣",
      "taisho": "安藤重勝・井伊の二陣",
      "hei": "200・800",
      "n": 1000,
      "pos": "南の田",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "赤備え",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 60,
      "d": 42
     },
     {
      "tai": "若江・予備",
      "taisho": "",
      "hei": "600",
      "n": 600,
      "pos": "東",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "若江・旗本",
      "taisho": "井伊直孝",
      "hei": "600",
      "n": 600,
      "pos": "本陣 {122,−104}（井伊 合わせて 3200）",
      "xz": [
       122,
       -104
      ],
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "赤備え",
       "color": 10889759
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 39,
      "d": 39
     },
     {
      "tai": "八尾・先手",
      "taisho": "藤堂高刑",
      "hei": "900",
      "n": 900,
      "pos": "八尾の東の堤",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 67,
      "d": 34
     },
     {
      "tai": "八尾・一陣",
      "taisho": "桑名吉成",
      "hei": "600",
      "n": 600,
      "pos": "先手の南",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "八尾・二陣",
      "taisho": "藤堂氏勝（鉄砲）・二陣",
      "hei": "500・1200",
      "n": 1700,
      "pos": "八尾の東",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 78,
      "d": 55
     },
     {
      "tai": "八尾・予備・旗本",
      "taisho": "藤堂高虎",
      "hei": "1000・800",
      "n": 1800,
      "pos": "東（藤堂 合わせて 5000）",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 67,
      "d": 67
     },
     {
      "tai": "後詰",
      "taisho": "前田利常・松平忠直",
      "hei": "3000・3000",
      "n": 6000,
      "pos": "遠くの東（河内口の本隊の先。出ない）",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 122,
      "d": 122
     }
    ]
   },
   {
    "side": "大坂（青）",
    "rows": [
     {
      "tai": "若江・先手",
      "taisho": "山口弘定・内藤長秋",
      "hei": "800・800",
      "n": 1600,
      "pos": "若江の南と北の田",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 89,
      "d": 45
     },
     {
      "tai": "若江・本隊",
      "taisho": "木村重成",
      "hei": "1500＋900＋700",
      "n": 3100,
      "pos": "若江（木村 合わせて 4700）",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 88,
      "d": 88
     },
     {
      "tai": "八尾・先手",
      "taisho": "長宗我部の先手・増田盛次",
      "hei": "1200・600",
      "n": 1800,
      "pos": "長瀬川の東",
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 95,
      "d": 47
     },
     {
      "tai": "八尾・伏せ",
      "taisho": "堤の伏せ槍",
      "hei": "600",
      "n": 600,
      "pos": "堤の陰",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 46,
      "d": 32
     },
     {
      "tai": "八尾・二陣・予備",
      "taisho": "",
      "hei": "1200・900",
      "n": 2100,
      "pos": "長瀬川の西",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 87,
      "d": 61
     },
     {
      "tai": "八尾・旗本",
      "taisho": "長宗我部盛親",
      "hei": "800",
      "n": 800,
      "pos": "本陣 {−84,108}（長宗我部 合わせて 5300）",
      "xz": [
       -84,
       108
      ],
      "house": "長宗我部",
      "mon": "chosokabe",
      "flag": {
       "ground": "白",
       "fig": "七つ酢漿草",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 45,
      "d": 45
     }
    ]
   }
  ]
 },
 "k15_tennoji_okayama": {
  "line": "tokugawa",
  "src": "docs/fujin/k15_tennoji_okayama.md",
  "title": "天王寺・岡山（k15_tennoji_okayama）の布陣表　11/9 天王寺係",
  "sides": [
   {
    "side": "豊臣（北・負の z）",
    "rows": [
     {
      "tai": "最前・西",
      "taisho": "真田信繁",
      "hei": "3,500",
      "n": 3500,
      "pos": "",
      "note": "置き場 (x, z)：茶臼山（−106, 4）／作り：本物（sanada・nobu）",
      "house": "真田",
      "mon": "sanada",
      "flag": {
       "ground": "赤",
       "fig": "金の六連銭",
       "color": 10889759
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 132,
      "d": 66
     },
     {
      "tai": "最前・東",
      "taisho": "毛利勝永",
      "hei": "6,500（木村・後藤の残兵を含む）",
      "n": 6500,
      "pos": "",
      "note": "置き場 (x, z)：四天王寺の南門の前（−46, −14）／作り：本物（mori）＋軽い",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 180,
      "d": 90
     },
     {
      "tai": "その後ろ・西寄り",
      "taisho": "木村宗明",
      "hei": "1,500",
      "n": 1500,
      "pos": "",
      "note": "置き場 (x, z)：今宮の東（−80, −50）／作り：本物（kimura・①で出る）＋軽い",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "控えの縦隊",
      "w": 48,
      "d": 77
     },
     {
      "tai": "奥・中央",
      "taisho": "大野治長",
      "hei": "13,000（七手組を含む）",
      "n": 13000,
      "pos": "",
      "note": "置き場 (x, z)：城寄り（−20, −110）／作り：軽い（動かない）",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 215,
      "d": 151
     },
     {
      "tai": "奥・東",
      "taisho": "大野治房",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場 (x, z)：真田丸跡のそば（40, −90）。正午に岡山口（44, 40）へ出る／作り：岡山口で本物（ono・onoB）＋軽い",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 189,
      "d": 132
     },
     {
      "tai": "城",
      "taisho": "豊臣秀頼・淀殿",
      "hei": "城内",
      "n": null,
      "pos": "",
      "note": "置き場 (x, z)：大坂城／作り：出さない（終わりの炎上だけ）",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "籠城（曲輪の内）"
     }
    ]
   },
   {
    "side": "徳川（南・正の z）",
    "rows": [
     {
      "tai": "西の列・前",
      "taisho": "伊達政宗（片倉重長）",
      "hei": "10,000",
      "n": 10000,
      "pos": "",
      "note": "置き場 (x, z)：紀州街道（−150, 60）／作り：軽い",
      "house": "伊達",
      "mon": "date",
      "flag": {
       "ground": "紺",
       "fig": "金の日輪",
       "color": 2042439
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 224,
      "d": 112
     },
     {
      "tai": "西の列・後ろ",
      "taisho": "松平忠輝",
      "hei": "12,000",
      "n": 12000,
      "pos": "",
      "note": "置き場 (x, z)：紀州街道（−150, 110）／作り：軽い",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "控えの縦隊",
      "w": 137,
      "d": 219
     },
     {
      "tai": "中央・一",
      "taisho": "本多忠朝・小笠原秀政",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場 (x, z)：天王寺口の先手（−46, 40）／作り：本物（honda）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "中央・二",
      "taisho": "浅野長重（榊原康勝の二陣を含む）",
      "hei": "3,000",
      "n": 3000,
      "pos": "",
      "note": "置き場 (x, z)：（−46, 80）／作り：本物（nijin）＋軽い",
      "house": "浅野",
      "mon": "asano",
      "flag": {
       "ground": "白",
       "fig": "違い鷹の羽",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 104,
      "d": 72
     },
     {
      "tai": "中央・三",
      "taisho": "松平忠直（越前勢）",
      "hei": "15,000",
      "n": 15000,
      "pos": "",
      "note": "置き場 (x, z)：（−70, 100）。茶臼山の正面（−98, 54）へ出て真田と向き合う／作り：本物（echizen）＋軽い",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 231,
      "d": 162
     },
     {
      "tai": "中央・奥",
      "taisho": "徳川家康（旗本）",
      "hei": "15,000",
      "n": 15000,
      "pos": "",
      "note": "置き場 (x, z)：阿倍野（−40, 130）／作り：本物（hon・hata2）＋軽い（一番大きい塊）",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 231,
      "d": 162
     },
     {
      "tai": "東・前",
      "taisho": "前田利常",
      "hei": "15,000",
      "n": 15000,
      "pos": "",
      "note": "置き場 (x, z)：岡山口の前（44, 40）／作り：軽い（岡山口で clash）",
      "house": "前田",
      "mon": "maeda",
      "flag": {
       "ground": "白",
       "fig": "黒の梅鉢を縦に三つ",
       "color": 15130832
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 274,
      "d": 137
     },
     {
      "tai": "東・右",
      "taisho": "藤堂高虎",
      "hei": "5,000",
      "n": 5000,
      "pos": "",
      "note": "置き場 (x, z)：平野川ぞい（86, 52）／作り：軽い",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 134,
      "d": 94
     },
     {
      "tai": "東・中",
      "taisho": "細川忠興",
      "hei": "2,000",
      "n": 2000,
      "pos": "",
      "note": "置き場 (x, z)：（60, 70）／作り：軽い",
      "house": "細川",
      "mon": "kuyo",
      "flag": {
       "ground": "白",
       "fig": "黒の九曜",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 85,
      "d": 59
     },
     {
      "tai": "東・手前",
      "taisho": "井伊直孝",
      "hei": "3,200",
      "n": 3200,
      "pos": "",
      "note": "置き場 (x, z)：（34, 74）／作り：本物（岡山口の ii） ＋軽い",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "赤備え",
       "color": 10889759
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 126,
      "d": 63
     },
     {
      "tai": "東・奥",
      "taisho": "徳川秀忠（将軍の旗本）",
      "hei": "20,000",
      "n": 20000,
      "pos": "",
      "note": "置き場 (x, z)：奈良街道の側（40, 120）。本陣の幕は（30, 86）／作り：本物（岡山口の hon）＋軽い",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 224,
      "d": 224
     },
     {
      "tai": "後詰",
      "taisho": "水野勝成・本多忠政・浅野長晟・黒田長政",
      "hei": "合わせて 25,000",
      "n": 25000,
      "pos": "",
      "note": "置き場 (x, z)：本陣の後ろと左右（−90〜20, 140〜176）／作り：軽い（本陣が崩れた時に出る）",
      "house": "水野",
      "mon": "mizuno",
      "flag": {
       "ground": "白",
       "fig": "沢瀉",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 250,
      "d": 250
     }
    ]
   }
  ]
 },
 "k16_secret": {
  "line": "tokugawa",
  "src": "docs/fujin/k16_secret.md",
  "title": "元和天下返し（k16_secret）の布陣表",
  "sides": [
   {
    "side": "主人公の連合軍（南・北向き）",
    "rows": [
     {
      "tai": "左の備",
      "taisho": "毛利秀元の手",
      "hei": "30（侍4・足軽20・鉄砲6）",
      "n": 30,
      "pos": "（−16, 52）",
      "xz": [
       -16,
       52
      ],
      "note": "備考：初めは z＝42 へ前進。大将本人の兵は置かない",
      "house": "毛利",
      "mon": "mori",
      "flag": {
       "ground": "赤",
       "fig": "白の一文字三星",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 10,
      "d": 7
     },
     {
      "tai": "右の備",
      "taisho": "島津家久の手",
      "hei": "28（侍4・足軽18・騎馬6）",
      "n": 28,
      "pos": "（22, 52）",
      "xz": [
       22,
       52
      ],
      "note": "備考：初めは z＝42 へ前進。大将本人の兵は置かない",
      "house": "島津",
      "mon": "shimazu",
      "flag": {
       "ground": "白",
       "fig": "黒の丸に十の字",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 10,
      "d": 7
     },
     {
      "tai": "自分の組",
      "taisho": "主人公",
      "hei": "12〜16（身分による）＋主人公",
      "n": 12,
      "pos": "（4, 64）、主人公は（4, 70）から",
      "xz": [
       4,
       64
      ],
      "note": "備考：丸の旗",
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 7,
      "d": 5
     },
     {
      "tai": "参謀",
      "taisho": "明石全登",
      "hei": "独立した隊の人数は未設定",
      "n": null,
      "pos": "声で下知",
      "note": "備考：架空の生還・参戦。別の軍勢として加算しない",
      "house": "宇喜多（明石）",
      "mon": "ukita",
      "flag": {
       "ground": "白",
       "fig": "黒の花クルス（推定）",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）"
     }
    ]
   },
   {
    "side": "徳川（北・基本は南向き）",
    "rows": [
     {
      "tai": "京街道の先手",
      "taisho": "渡辺勘兵衛",
      "hei": "35（将1・侍6・足軽22・鉄砲6）",
      "n": 35,
      "pos": "（0, −4）",
      "xz": [
       0,
       -4
      ],
      "note": "向き・備考：南。初めは z＝4 へ押し出す",
      "house": "豊臣（大坂方）",
      "mon": "toyotomi",
      "flag": {
       "ground": "金",
       "fig": "千成瓢箪の馬印・五三桐",
       "color": 14069050
      },
      "jinkei": "先手の横隊（槍衾）",
      "w": 13,
      "d": 7
     },
     {
      "tai": "先手の後ろ西",
      "taisho": "藤堂高虎",
      "hei": "9（将1・侍8）",
      "n": 9,
      "pos": "（−44, −44）",
      "xz": [
       -44,
       -44
      ],
      "note": "向き・備考：南。床几の本陣",
      "house": "藤堂",
      "mon": "todo",
      "flag": {
       "ground": "紺",
       "fig": "白い丸を縦に三つ",
       "color": 2042439
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 5,
      "d": 5
     },
     {
      "tai": "東の林の赤備え",
      "taisho": "井伊直孝",
      "hei": "24（将1・騎馬7・侍4・足軽12）",
      "n": 24,
      "pos": "（96, −50）",
      "xz": [
       96,
       -50
      ],
      "note": "向き・備考：西寄り。後に（8, −26）へ横槍。初期は林の陰",
      "house": "井伊",
      "mon": "ii",
      "flag": {
       "ground": "赤",
       "fig": "赤備え",
       "color": 10889759
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 9,
      "d": 6
     },
     {
      "tai": "丘の下の鉄砲",
      "taisho": "徳川の衆（将の割当なし）",
      "hei": "24（侍2・足軽8・鉄砲14）",
      "n": 24,
      "pos": "（0, −96）",
      "xz": [
       0,
       -96
      ],
      "note": "向き・備考：南。馬防柵の後ろ",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "鉄砲の横列（柵・塀の際）",
      "w": 11,
      "d": 5
     },
     {
      "tai": "本陣前の旗本",
      "taisho": "本多正純",
      "hei": "24（将1・侍20・騎馬3）",
      "n": 24,
      "pos": "（0, −134）",
      "xz": [
       0,
       -134
      ],
      "note": "向き・備考：南",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 8,
      "d": 8
     },
     {
      "tai": "陣幕の口の旗本",
      "taisho": "徳川の衆（将の割当なし）",
      "hei": "20（侍15・騎馬5）",
      "n": 20,
      "pos": "家康の本陣（0, −165）の南口周辺",
      "xz": [
       0,
       -165
      ],
      "note": "向き・備考：南。`camp` の護衛",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 7,
      "d": 7
     },
     {
      "tai": "陣幕の内",
      "taisho": "徳川家康",
      "hei": "12（将1・侍9・鉄砲2）",
      "n": 12,
      "pos": "（0, −166）",
      "xz": [
       0,
       -166
      ],
      "note": "向き・備考：南。床几。自動の馬印持ちは生成後に除く",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "備の塊（槍・弓・鉄砲の段）",
      "w": 7,
      "d": 5
     },
     {
      "tai": "本陣の後ろ東",
      "taisho": "徳川秀忠",
      "hei": "11（将1・侍8・鉄砲2）",
      "n": 11,
      "pos": "（58, −195）",
      "xz": [
       58,
       -195
      ],
      "note": "向き・備考：南。家康が討たれるまで動かない。自動の馬印持ちは除く",
      "house": "徳川",
      "mon": "tokugawa",
      "flag": {
       "ground": "白",
       "fig": "黒の三つ葉葵を縦に三つ・厭離穢土欣求浄土の大幟",
       "color": 15130832
      },
      "jinkei": "本陣の方陣（旗本が囲む）",
      "w": 5,
      "d": 5
     }
    ]
   }
  ]
 },
 "k17_shuumaku": {
  "line": "tokugawa",
  "src": null,
  "sides": []
 },
 "x15_sanada": {
  "line": "tokugawa",
  "src": null,
  "sides": []
 }
};
