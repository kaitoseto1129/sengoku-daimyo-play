import { S as SETTINGS } from './settings.js';

// 設楽原の入口板戸の引き込み位置。建具と置き畳で同じ寸法を使う。
export function shitaragaharaEntryInset(kind) {
  return kind === 'hondo' ? .64 : .36;
}

// 設楽原の低い民家・小堂は、梁や格天井まで戸を伸ばさない。枠と動く戸で共有する。
export function interiorPartitionHeight(layout, h) {
  if (layout.profile === 'shitaragahara') {
    if (layout.kind === 'minka') return Math.min(1.8, h - .3);
    if (layout.kind === 'hondo') return Math.min(1.95, h - .3);
  }
  return h > 3 ? 2.3 : h;
}

// 小堂の内陣境は鴨居・長押・連子欄間の木がある所だけを塞ぐ。
// 固定建具の上と開く格子戸の上で共用し、設営時だけ当たりを作る。
export function interiorPartitionHeaders(layout, h, ax, bx, fixed = false) {
  const ph = interiorPartitionHeight(layout, h);
  if (SETTINGS.quality === 'high' && layout.profile === 'shitaragahara'
      && layout.kind === 'minka' && fixed) {
    return [{ ax: ax + .09, bx: bx - .09, y0: ph, y1: ph + .1, r: .09 },
      { ax, bx, y0: ph + .1, y1: h, r: .08 }];
  }
  if (SETTINGS.quality !== 'high' || layout.profile !== 'shitaragahara'
      || layout.kind !== 'hondo' || h - ph - .1 <= .18 || bx - ax <= .68)
    return [{ ax, bx, y0: ph, y1: h, r: .08 }];
  const pieces = [], low = ph + .1;
  const add = (a, b, y0, y1, r) => pieces.push({ ax: a, bx: b, y0, y1, r });
  add(ax, bx, ph, low, .06); // 鴨居
  const railY = Math.min(ph + .42, h - .22);
  add(ax, bx, railY - .06, railY + .06, .11); // 長押
  if (fixed) {
    // 固定格子の欄間は柱間ごとに納める。中央の丸柱を連子や小壁で貫かない。
    // 鴨居と長押は通し、欄間だけ下の建具と同じ柱割りにする。
    for (const span of interiorPartitionSpans(ax, bx)) {
      if (span.bx - span.ax <= .68)
        add(span.ax, span.bx, low, h, .03);
      else pieces.push(...interiorPartitionHeaders(layout, h, span.ax, span.bx).slice(2));
    }
    return pieces;
  }
  const left = ax + .24, right = bx - .24;
  // 欄間の上框は格天井の回縁の下へ納め、当たりも見える木部へ揃える。
  const top = h - .08, frameBottom = top - .04;
  add(ax, left, low, top, .03);
  add(right, bx, low, top, .03);
  add(left, right, frameBottom, top, .03);
  add(ax, bx, top, h, .04); // 内陣境を通る格天井の回縁
  const bays = Math.max(2, Math.round((right - left) / .16));
  // 欄間の連子は長押の上下へ分け、絵と同じ木部だけを射線の当たりにする。
  for (const [a, b] of [[low, Math.min(frameBottom, railY - .06)],
    [Math.max(low, railY + .06), frameBottom]]) {
    if (b <= a) continue;
    for (let i = 0; i <= bays; i++) {
      // 端の連子も半幅を内側へ納め、小壁へ木を食い込ませない。
      const x = left + .0125 + (right - left - .025) * i / bays;
      add(x - .0125, x + .0125, a, b, .0175);
    }
  }
  return pieces;
}

// 固定建具の柱の内面。設営時に絵と当たりで共有する。
export function interiorPartitionSpans(ax, bx) {
  const left = Math.min(ax, bx), len = Math.abs(bx - ax);
  const bays = Math.max(1, Math.round(len / 1.8)), spans = [];
  for (let i = 0; i < bays; i++) {
    const a = left + len * i / bays + (i ? .06 : .12);
    const b = left + len * (i + 1) / bays - (i + 1 < bays ? .06 : .12);
    if (b > a) spans.push({ ax: a, bx: b });
  }
  return spans;
}

// 設楽原の民家の固定襖・障子も二本の溝へ納め、召し合わせを三センチ重ねる。
// 柱の内面と戸口は広げず、設営時に見た目と当たりで同じ割りを使う。
export function shitaragaharaHomePanels(ax, bx) {
  const panels = [];
  for (const span of interiorPartitionSpans(ax, bx)) {
    const count = Math.max(1, Math.ceil((span.bx - span.ax) / .9));
    const pitch = (span.bx - span.ax) / count;
    for (let i = 0; i < count; i++) {
      panels.push({ ax: span.ax + i * pitch - (i ? .015 : 0),
        bx: span.ax + (i + 1) * pitch + (i + 1 < count ? .015 : 0),
        offset: i % 2 ? .04 : -.04, right: i % 2 === 1 });
    }
  }
  return panels;
}
// 内陣境の角柱（奥行き十二センチ）と丸柱（半径十四センチ）を重ねない柱芯。
export const HIEI_NAIJIN_POST_SETBACK = .20;

// 館の固定襖・障子は、戸口側の方立（幅十二センチ）の内面で止める。
// 描く割付と木枠の当たりで共用する。開口と動く戸の引きしろは変えない。
export function igaFixedPanelRange(layout, v) {
  const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
  const portal = layout.profile === 'iga' && layout.kind === 'yashiki' && v.paper
    && layout.portals.find(p => Math.abs(p.z - v.az) < .01 && Math.abs(p.z - v.bz) < .01);
  if (!portal) return { start: 0, end: len };
  const trim = Math.min(.12, len / 4);
  return Math.abs(v.ax - portal.x) < Math.abs(v.bx - portal.x)
    ? { start: trim, end: len } : { start: 0, end: len - trim };
}

// 外壁の内寸から間取りを作る。局所の＋奥行きが戸口。設営時だけ呼ぶ。
export function interiorLayout(kind, w, d, { oku = .4, side = 1, profile = null, entryX = 0, entryDepth = null, entryW = 0, raisedTatami = false, slidingClearance = 0 } = {}) {
  const hw = w / 2, hd = d / 2;
  // 宿は泊まる座敷、問屋は荷を扱う土間、使者の間は応対の座敷を広く取る。
  const hall = kind === 'toiya' ? Math.min(3, w * .34)
    : kind === 'inn' ? Math.min(1.5, w * .18)
    : kind === 'shisha' ? Math.min(1.2, w * .18) : Math.min(1.5, w * .24);
  const rooms = [], walls = [], props = [], portals = [];
  const room = (name, x0, x1, z0, z1, floor = 'tatami') => rooms.push({ name, x0, x1, z0, z1, floor });
  const cross = (z, x0, x1, door, paper = true, openingW = 0) => {
    // 小祠は戸を引いた端と妻壁の柱の間にも余地を残す。
    const sliding = profile === 'inabayama' && slidingClearance > 0;
    const hieiSliding = profile === 'hieizan' && ['chudo', 'hondo', 'sobo'].includes(kind);
    // 左右へ開いた戸は開口の倍の幅を使う。小さな番所でも戸尻と長い敷居を
    // 妻壁・隅柱へ埋めず、動く戸の当たりまで含めた余白を残す。
    // 高画質の稲葉山は表口から続く障子口・内陣口も同じ幅にする。
    // 引き先と柱際の余白で上限を取り、狭い建物では戸尻を壁へ出さない。
    const gap = Math.min(sliding && openingW > 0 ? openingW / 2 : profile === 'council' ? 2.1 : profile === 'inabayama' && kind === 'shrine' ? .75 : 1.05,
      (x1 - x0 - (sliding ? slidingClearance * 2 : hieiSliding ? .2 : 0)) * .25);
    const margin = sliding ? gap * 2 + slidingClearance : hieiSliding ? gap * 2 + .05 : gap;
    door = Math.max(x0 + margin, Math.min(x1 - margin, door));
    portals.push({ x: door, z, axis: 'z' });
    if (door - gap > x0) walls.push({ ax: x0, az: z, bx: door - gap, bz: z, paper });
    if (door + gap < x1) walls.push({ ax: door + gap, az: z, bx: x1, bz: z, paper });
  };
  const prop = (part, x, z) => props.push({ part, x, z });
  if (profile === 'shitaragahara' && kind === 'minka') {
    // 集落の民家の推定復元。屋敷の式台・上段・床の間や軍の寝具は持ち込まない。
    const entry = hd - (entryDepth ?? Math.min(1.3, d * .27)), back = -hd + d * .37;
    room('奥の小座敷', -hw, hw, -hd, back);
    room('暮らしの板間', -hw, hw, back, entry, 'boards');
    room('入口の土間', -hw, hw, entry, hd, 'earth');
    // 高画質の民家は土間を板間より低くする。入口側の収納も土の床に据える。
    const earthY = entryDepth != null ? -.12 : 0;
    rooms[rooms.length - 1].y = earthY;
    cross(back, -hw + .1, hw - .1, 0);
    portals[portals.length - 1].kind = 'fusuma';
    for (const v of walls) v.kind = 'fusuma';
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    // 高画質の襖・障子は間仕切りより二十センチ土間側を滑る。
    // 炉もその二本の敷居の中間へ寄せ、浅い民家で炉縁と襖の引き込み端を重ねない。
    // 炉の絵・床の切り欠き・当たりは、この位置を共用する。裏向きは末尾で一緒に反転する。
    const hearthZ = (back + entry) / 2 + (entryDepth != null ? .2 : 0);
    props.push({ part: 'hearth', x: -hw + 1, z: hearthZ, w: .85, d: .7, h: .3 });
    props.push({ part: 'storage', x: hw - .7, z: hd - .65, w: .8, d: .6, h: .7, y: earthY });
    // 高画質の土間に炊事用の竈を補う推定復元。中央の入口と障子の引き込み先は空ける。
    if (entryDepth != null) {
      // 炊事の水甕を竈と壁の間へ据える推定のしつらえ。
      // 二つの外寸を離し、板戸・障子の溝と中央の立ち所へは張り出さない。
      // 側柱の内面（二十四センチ）から四センチ離す。
      // 甕の胴だけでなく、竈との六・五センチの隙間も保って絵と当たりを一緒に寄せる。
      const jarW = .44, stoveW = .85;
      const jarX = -hw + .24 + .04 + jarW / 2;
      const stoveX = jarX + jarW / 2 + .065 + stoveW / 2;
      props.push({ part: 'stove', x: stoveX, z: hd - .65,
        w: .85, d: .7, h: .9, y: earthY, rot: Math.PI });
      props.push({ part: 'waterJar', x: jarX, z: hd - .65,
        w: jarW, d: jarW, h: .62, y: earthY });
    }
  } else if (profile === 'shitaragahara' && kind === 'hondo') {
    // 村外れの小堂の推定。須弥壇の前に立てる内陣を取り、中央の格子戸から拝む。
    // 須弥壇だけで埋めず、前卓と、その前に立って供える場所を内陣に確保する。
    const cut = -hd + d * .58;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0);
    portals[portals.length - 1].kind = 'koshi';
    prop('altar', 0, -hd + .8);
    props.push({ part: 'offering', x: 0, z: -hd + 1.6, w: 1.2, d: .45, h: .65 });
    // 読経のしつらえは推定。須弥壇の脇に経机を置き、中央の参道と格子戸の引き込み先を空ける。
    if (SETTINGS.quality === 'high' && w >= 7 && d >= 5.5) {
      props.push({ part: 'sutraDesk', x: -hw + 1.1, z: -hd + 1.5, w: 1, d: .42, h: .36 });
      // 経巻を湿気から守る蓋付きの経箱を反対側へ据える推定のしつらえ。
      // 須弥壇の脇と背面の窓下へ納め、中央の参道・僧座・格子戸の溝を空ける。
      props.push({ part: 'sutraChest', x: hw - 1.1, z: -hd + 1,
        w: .95, d: .55, h: .52 });
    }
  } else if (profile === 'moribe' && kind === 'hondo') {
    // 小堂の室内図は不明。須弥壇を内陣へ収め、壇の前と格子戸の前後を空けた推定復元。
    // 戸板は入口側へ約二十センチ出る。閉じた二組の戸の間にも立ち所を残す。
    const cut = -hd + d * .55, entry = hd - 1.2;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, entry, 'boards');
    room('堂の入口', -hw, hw, entry, hd, 'boards');
    // 間仕切りの端は側壁の通し柱の芯へそろえ、別の柱を六センチずらして重ねない。
    cross(cut, -hw + .16, hw - .16, entryX);
    // 外陣の手前を板戸で閉じる。内陣の格子戸とは別に開け閉めできる。
    cross(entry, -hw + .16, hw - .16, entryX, false);
    portals[portals.length - 1].kind = 'itado';
    // 須弥壇と手前の前卓を合わせた寸法。格子戸の前の立ち所を残す。
    // 壇の後端は中心から六十五センチ奥。背面の地覆（二十六センチ）へ
    // 食い込ませず、四センチ離す。描画・体と手の当たりはこの位置を共用する。
    props.push({ part: 'altar', x: 0, z: -hd + .95, w: 2.1, d: 1.3, h: 1.5 });
  } else if (profile === 'moribe' && kind === 'yashiki') {
    // 狭い在所の屋敷に大きな床の間を置かず、畳の座敷・取次と板敷きの入口で復元。
    // 障子の二本の溝と外壁の柱を除いても、板間に人が通れる幅を残す。
    const entry = hd - Math.min(1.3, d * .25);
    // 取次側へ張り出す敷居（二十七センチ）を除いて、二室の畳の奥行きをそろえる。
    // 奥の地覆（二十六センチ）も除き、畳寄せの内側で二室の奥行きをそろえる。
    const cut = (-hd + .26 + entry - .27) / 2;
    room('奥の座敷', -hw, hw, -hd, cut);
    room('取次の座敷', -hw, hw, cut, entry);
    room('板敷きの入口', -hw, hw, entry, hd, 'boards');
    // 堂と同じく側壁の通し柱を共用し、固定の建具も柱の内面へ納める。
    cross(cut, -hw + .16, hw - .16, entryX);
    portals[portals.length - 1].kind = 'fusuma';
    for (const v of walls) v.kind = 'fusuma';
    const first = walls.length;
    cross(entry, -hw + .16, hw - .16, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    // 畳の上端へ脚と底を載せる。見た目だけでなく調度の当たりにも同じ高さを渡す。
    // 地覆二十六センチと畳寄せ十センチを避け、畳の端から四センチ離す。
    // 座卓の天板と木櫃の底を畳寄せへまたがせず、絵と当たりを同じ位置へ納める。
    const furnishingInset = .26 + .1 + .04;
    props.push({ part: 'desk', x: -hw + furnishingInset + .6, z: -hd + furnishingInset + .35,
      w: 1.2, d: .7, h: .46, y: .066 });
    props.push({ part: 'storage', x: hw - furnishingInset - .35, z: -hd + furnishingInset + .3,
      w: .7, d: .6, h: .6, y: .066 });
  } else if (profile === 'iga' && ['nagaya', 'bansho', 'yashiki', 'minka'].includes(kind)) {
    // 個別の室内図は不明。陣の宿と番所は板間、城館は畳の取次と奥座敷で復元する。
    // 民家は炊事の土間を深く取る。従来の九十センチほどの土間では、
    // 開け切った板戸が壁際の竈へ食い込む。二本の溝と戸厚の分も離し、
    // 炉のある板間を残したまま、竈の前を土間として使えるようにする。
    const entry = hd - (kind === 'minka' ? Math.min(1.35, d * .36) : Math.min(1.1, d * .24));
    if (kind === 'yashiki') {
      // 文机の座の背後に、襖の鴨居まで通る柱の見込みと人の幅を残す。
      // 従来はむしろの後端から敷居の縁まで約八センチしかなく、座が間仕切りへ詰まっていた。
      const cut = -hd + d * .42 + .2;
      room('奥の座敷', -hw, hw, -hd, cut);
      room('取次の座敷', -hw, hw, cut, entry);
      room('板敷きの入口', -hw, hw, entry, hd, 'boards');
      cross(cut, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'fusuma';
      for (const v of walls) v.kind = 'fusuma';
      const first = walls.length;
      cross(entry, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'shoji';
      for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
      // 館の執務の座は敷きむしろで推定復元する。文机と同じ軸へ置き、
      // 壁際の灯明台から離す。奥座敷の襖と床の間へ続く中央の道は空ける。
      // 机だけを奥へ十二センチ寄せ、むしろとの間に膝を入れる余白を取る。
      // 奥壁の柱面からも四センチ離し、座と机の軸はそろえたままにする。
      props.push({ part: 'desk', x: -hw + 1.1, z: -hd + .58, w: 1, d: .6, h: .4 });
      props.push({ part: 'seatMat', x: -hw + 1.1, z: -hd + 1.4, w: .6, d: .6, h: .02 });
      // 取次で扱う荷の置き場は、蓋付きの木櫃で推定復元する。
      // 奥の執務机・床の間とは分け、襖と障子の中間の壁際へ寄せる。
      // 陣小屋と同じ木櫃を使い、戸の引きしろと中央の通路を空ける。
      props.push({ part: 'chest', x: hw - .85, z: (cut + entry) / 2,
        w: .7, d: .6, h: .6 });
    } else {
      room(kind === 'minka' ? '炉のある板間' : kind === 'bansho' ? '番の控えの板間' : '兵の休む板間', -hw, hw, -hd, entry, 'boards');
      room('入口の土間', -hw, hw, entry, hd, 'earth');
      cross(entry, -hw + .1, hw - .1, entryX, false);
      if (kind === 'minka') {
        props.push({ part: 'hearth', x: -hw + 1, z: -hd + 1, w: .85, d: .8, h: .45 });
        // 炉端の座は推定復元。手前の座を炉と敷居の間へ詰めると、
        // 炉縁との隙間が五センチほどになり、足を置く板間が残らない。
        // 手前の一枚は戸口の通路を空ける処理で消えていた。
        // 二枚とも炉の右側の奥へ横に並べ、炉縁から二十七センチ以上、
        // むしろ同士も十五センチ離す。上がり框と板戸の引きしろは空ける。
        for (const x of [-hw + 2, -hw + 2.75]) props.push({
          part: 'seatMat', x, z: -hd + 1, w: .6, d: .6, h: .02 });
        // 炉のある板間と炊事の土間を使い分ける推定復元。
        // 焚口は土間の中央へ向け、入口・板戸の引きしろ・上がり框を空ける。
        props.push({ part: 'stove', x: -hw + .65, z: hd - .55,
          w: .7, d: .7, h: .8, y: 0, rot: Math.PI / 2 });
        // 炊事の水は土間の甕へ置く推定復元。竈の焚口と中央の戸口を空け、
        // 反対の壁際へ寄せる。板間の収納や引き戸の引きしろとは重ねない。
        props.push({ part: 'waterJar', x: hw - .65, z: hd - .65,
          w: .55, d: .55, h: .65, y: .0255 });
      }
      else if (kind === 'bansho') {
        // 板間で文机に向かう座は敷きむしろで推定復元する。
        // 左壁の槍掛けと座の縁が二・五センチしか離れていなかった。
        // 机と座を同じ軸で四十センチ内側へ寄せ、座の脇と中央の戸口を空ける。
        const deskX = -hw + 1.5;
        props.push({ part: 'desk', x: deskX, z: -hd + .7, w: 1, d: .6, h: .4 });
        props.push({ part: 'seatMat', x: deskX, z: -hd + 1.45, w: .6, d: .6, h: .02 });
      }
      else {
        // 枕を含めて一・五メートルでは兵が横になれない。寝むしろを一・八メートルにし、
        // 奥壁から二十センチ離す。中央の板戸と木櫃の前の通路は空ける推定復元。
        // 奥の槍掛けと寝床の間は従来八十八・五センチで、両側の当たりを
        // 含めると徒歩の幅九十センチを通せない。寝床を壁側へ十五センチ寄せ、
        // 柱の内面を避けながら両脇に一〇三・五センチの通路を残す。
        for (const x of [-hw + .75, hw - .75]) props.push({ part: 'bedding', x,
          z: -hd + 1.1, w: .75, d: 1.8, h: .12 });
        // 陣小屋にも武具の置き場を設ける推定復元。寝床の間の奥壁へ横掛けを寄せる。
        // 窓の敷居より低くし、入口の板戸・木櫃・中央の通路を空ける。
        // 外寸は回した後の幅と奥行き。絵と当たりで同じ範囲を使う。
        props.push({ part: 'spearRack', x: 0, z: -hd + .55,
          w: 2.5, d: .45, h: 1.2, across: true, rot: Math.PI / 2 });
      }
    }
    // 館の奥座敷は小さな床の間、番所は矢の箱にして、民家の収納と用途を分ける。
    // 室内図のない館の床の間は推定。奥の隅へ造り付け、中央の襖と机の前を空ける。
    // 外周柱の室内面は壁際から二十四センチ。床の間の背と脇を
    // 一センチだけ柱面へ掛け、床柱や掛物を外壁の中へ埋めない。
    // 畳・天井の切り欠きと当たりも、この共通の外寸から追従する。
    if (kind === 'yashiki') props.push({ part: 'alcove', x: hw - .83, z: -hd + .48, w: 1.2, d: .5, h: 2 });
    // 矢は短い棒を箱の上に寝かせず、矢櫃へ立てる。羽根まで含む高さを当たりにも渡す。
    else if (kind === 'bansho') {
      props.push({ part: 'ammo', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: 1.1 });
      // 武具置きは反対の壁へ寄せる推定復元。左では文机の角との間が
      // 約五十センチしかなく、人が机の脇へ回れない。
      // 矢櫃の前にも九十センチを残し、上がり框・板戸の引きしろから離す。
      props.push({ part: 'spearRack', x: hw - .55, z: .25, w: .45, d: 2.5, h: 1.2 });
    }
    // 陣小屋の箱は寝床の足元へ離す。奥の隅では右の寝床と絵も当たりも重なっていた。
    // 敷居は境から二十四センチ張り出す。箱の半奥行き三十センチと
    // 余白二十センチを引き、木櫃が上がり框へ食い込まない位置に置く。
    else props.push({ part: kind === 'nagaya' ? 'chest' : 'storage', x: hw - .65,
      z: kind === 'nagaya' ? entry - .24 - .3 - .2 : -hd + .65, w: .7, d: .6, h: .6 });
    // 館も入口から座敷へ上がる。畳下の板床と畳厚を分け、敷居と調度は畳の上端へそろえる。
    if (kind === 'yashiki') {
      const boardY = .12, tatamiTop = boardY + .06, sillThickness = .04;
      rooms[0].y = rooms[1].y = boardY;
      // 戸の基準高は敷居の下面。四センチの敷居を足した上端を畳へ合わせる。
      // 共通の建具・間仕切り・足場もこの高さを使い、座敷の境に余分な段差を作らない。
      for (const p of portals) p.y = tatamiTop - sillThickness;
      for (const p of props) p.y = tatamiTop;
    } else {
      // 小屋の板間は土間より一段上げる。調度も同じ床高に置く。
      const boardY = .12, sillThickness = .04;
      rooms[0].y = boardY;
      // 戸の基準は敷居の下面。厚みを引いて、上端を板間へそろえる。
      // 板戸の下框・溝・歩く足場もこの値を使い、上がり口だけ高くしない。
      portals[0].y = boardY - sillThickness;
      for (const p of props) p.y ??= boardY;
    }
  } else if (profile === 'tottori' && ['kura', 'bansho', 'nagaya', 'tamari'].includes(kind)) {
    // 個別の室内図は不明。空蔵・番所・長屋・本陣の控えを用途で分けた推定復元。
    const cut = hd - Math.min(1, d * .25), tatami = kind === 'tamari';
    room(kind === 'kura' ? '空の板倉' : kind === 'bansho' ? '番の控え' : tatami ? '下知を受ける座敷' : '兵の休む板間', -hw, hw, -hd, cut, tatami ? 'tatami' : 'boards');
    room(tatami ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, tatami ? 'boards' : 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, tatami);
    if (tatami) {
      portals[portals.length - 1].kind = 'shoji';
      for (const v of walls) v.kind = 'shoji';
    }
    // 飢えた城の蔵に米俵や炊事道具を置かず、戸口から奥まで中央を空ける。
    if (kind === 'bansho' || tatami) props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .4 });
    if (kind === 'nagaya') for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
  } else if (profile === 'takato' && ['bansho', 'kura', 'nagaya'].includes(kind)) {
    // 番所を寝室、兵糧蔵を問屋にしない。入口と奥の板間を板戸で分ける。
    const cut = hd - Math.min(1.1, d * .25);
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の休む板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    if (kind === 'kura') {
      for (const x of [-hw + .65, hw - .65]) props.push({ part: 'storage', x, z: -hd + .75, w: .8, d: .9, h: .8 });
    } else if (kind === 'bansho') {
      props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .46 });
      props.push({ part: 'ammo', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: .55 });
    } else {
      for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1.1, w: .75, d: 1.5, h: .12 });
    }
  } else if (['takato', 'inabayama'].includes(profile) && kind === 'hondo') {
    // 堂は炊事の庫裏と分け、須弥壇のある内陣と参拝する外陣を設ける推定の間取り。
    // 中央の格子戸を左右へ引く余地と、本尊の前に立つ奥行きを確保する。
    // 稲葉山の内陣は須弥壇・礼盤・格子戸前の立ち所を納める。
    // 従来の配分では壇と礼盤が九センチほどまで詰まり、足元を置けなかった。
    const inabaHall = profile === 'inabayama' && raisedTatami;
    const cut = -hd + d * (inabaHall ? .53 : .48);
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0, true, entryW);
    prop('altar', 0, -hd + .8);
    if (profile === 'inabayama') {
      // 内陣を一段上げる推定復元。須弥壇・格子戸・敷居も同じ床高へ揃える。
      rooms[0].y = .16;
      props[0].y = .16;
      portals[0].sill = .16;
      for (const v of walls) v.sill = .16;
      if (raisedTatami) {
        // 本尊の光背の上端までを須弥壇の高さに含め、絵と当たりを揃える。
        props[0].h = 1.75;
        // 読経のしつらえは推定。経机は内陣の脇へ寄せ、須弥壇の前と
        // 中央の格子戸・引き込んだ戸の前後を歩けるまま残す。
        props.push({ part: 'sutraDesk', x: -hw + .85, z: -hd + 1,
          w: .95, d: .5, h: .4, y: .16 });
        // 経典を納める経箱は内陣の右奥へ置く推定のしつらえ。
        // 左の経机・中央の須弥壇と礼盤・格子戸の引き先を空け、
        // 板床と同じ高さへ既存の被せ蓋の箱を納める。
        if (w >= 6 && cut + hd >= 2.4)
          props.push({ part: 'chest', x: hw - .8, z: -hd + .65,
            w: .85, d: .55, h: .4, y: .16 });
        // 須弥壇の前に導師の礼盤を置く推定のしつらえ。
        // 壇との間と格子戸の手前を空けられる堂だけに納める。
        // 礼盤の用途・箱形の参考：https://www.narahaku.go.jp/collection/1061-0.html
        const seatD = .6, doorClear = .75, altarClear = .3;
        const altarFront = props[0].z + .5;
        if (cut - altarFront >= seatD + doorClear + altarClear) {
          props.push({ part: 'raiban', x: 0, z: cut - doorClear - seatD / 2,
            w: .8, d: seatD, h: .28, y: .16 });
          // 礼盤前の読経用の経机も推定で補う。脇の経机とは分け、
          // 須弥壇と礼盤の間に両端四センチ以上の余白を取れる時だけ置く。
          // 中央の既存の仏具の幅へ納め、左右の通路と格子戸前は保つ。
          const seatBack = cut - doorClear - seatD;
          const deskD = .28, margin = .04;
          if (seatBack - altarFront >= deskD + margin * 2)
            props.push({ part: 'sutraDesk', x: 0, z: (altarFront + seatBack) / 2,
              w: .8, d: deskD, h: .68, y: .16 });
        }
      }
    }
  } else if (['echizen_ikko', 'hieizan'].includes(profile) && kind === 'sobo') {
    // 個別の室内図は不明。僧坊は畳の座敷と板敷きの入口を持つ推定の間取り。
    // 比叡山は正面戸と座敷の障子の間に、人が立てる板間を残す。
    const entry = hd - (profile === 'hieizan' ? Math.min(1.5, d * .3) : Math.min(1, d * .22));
    if (d >= 4.5) {
      const cut = -hd + d * .42;
      room('僧の奥の座敷', -hw, hw, -hd, cut);
      room('僧の控えの座敷', -hw, hw, cut, entry);
      cross(cut, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = profile === 'hieizan' ? 'fusumaPlain' : 'fusuma';
    } else room('僧の座敷', -hw, hw, -hd, entry);
    room('板敷きの入口', -hw, hw, entry, hd, 'boards');
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    // 比叡山の明かり障子は壁の内側三十六センチの二本溝を滑る。
    // 机・経巻棚の背と側面を壁から六十センチ以上離し、開いた戸が
    // 天板や棚を貫かないようにする。間仕切りの脇口は従来どおり空ける。
    // 調度の位置をここで直し、描画と当たりに同じ寸法を渡す。
    const setback = profile === 'hieizan' ? .3 : 0;
    props.push({ part: 'desk', x: -hw + .8 + setback, z: -hd + .7 + setback, w: 1, d: .6, h: .4 });
    props.push({ part: 'storage', x: hw - .65 - setback, z: -hd + .7 + setback, w: .7, d: .6, h: .65 });
    // 畳の厚み六センチの上へ机と経巻棚を載せ、脚を板床まで沈めない。
    if (profile === 'hieizan') for (const p of props) p.y = .06;
    // 閉めた襖の奥でも経巻を扱えるよう、文机の脇に置き灯明を据える。
    // 配置は推定。机から八センチ離し、座る手前・明かり障子の溝を空ける。
    // 畳上の高さと台の当たりを共有し、入口と同じ形・材質を使い回す。
    if (profile === 'hieizan') {
      const desk = props.find(p => p.part === 'desk'), room = rooms[0];
      const x = desk.x + desk.w / 2 + .08 + .16, z = desk.z;
      if (x + .16 < room.x1 - .6 && z - .16 > room.z0 + .6 && z + .16 < room.z1 - .3) {
        props.push({ part: 'tomyo', x, z, y: .06, w: .32, d: .32, h: .97 });
      }
      // 襖と障子を閉めた控えの座敷にも灯明を据える。個別の配置は推定。
      // 畳寄せ・敷居と、間仕切りの手前へ滑る戸の溝を避けた畳上へ納める。
      // 側窓の障子からも離し、奥の座敷と同じ灯具・床高・当たりを使う。
      const waiting = rooms.find(r => r.name === '僧の控えの座敷');
      if (waiting) {
        const front = waiting.z0 + .44 + .16, back = waiting.z1 - .12 - .16;
        const lampX = waiting.x0 + .8, lampZ = (front + back) / 2;
        if (back - front > .42 && lampX + .16 < waiting.x1 - .6
          && portals.every(p => Math.abs(lampX - p.x) >= .61 || Math.abs(lampZ - p.z) >= 1.21)) {
          props.push({ part: 'tomyo', x: lampX, z: lampZ, y: .06, w: .32, d: .32, h: .97 });
        }
      }
    }
    // 入口の置き灯明も調度として登録し、木の台を人がすり抜けないようにする。
    // 板間へ据え、戸口と障子の引き込み先を空ける。油皿・火先まで同じ外寸で扱う。
    if (profile === 'hieizan') for (const x of [-hw + .5, hw - .5]) {
      props.push({ part: 'tomyo', x, z: hd - .75, w: .32, d: .32, h: .97 });
    }
  } else if (profile === 'echizen_ikko' && kind === 'bansho') {
    // 番所には寝具でなく、板間の控えと戸で区切った入口、矢の箱を置く。
    const cut = hd - Math.min(1, d * .25);
    room('寺の番の控え', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    props.push({ part: 'ammo', x: -hw + .65, z: -hd + .65, w: .7, d: .6, h: .55 });
    props.push({ part: 'desk', x: hw - .8, z: -hd + .65, w: 1, d: .6, h: .4 });
  } else if (profile === 'nagashima' && ['nagaya', 'bansho', 'kura'].includes(kind)) {
    // 輪中の砦の推定内装。番所の畳、長屋の板間、蔵の荷置きを分け、中央の動線を空ける。
    const cut = hd - Math.min(1.1, d * .28);
    room(kind === 'bansho' ? '番の座敷' : kind === 'kura' ? '兵糧の板倉' : '兵の寝る板間', -hw, hw, -hd, cut, kind === 'bansho' ? 'tatami' : 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, kind === 'bansho');
    if (kind === 'bansho') props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .46 });
    else if (kind === 'kura') {
      for (const x of [-hw + .7, hw - .7]) props.push({ part: 'storage', x, z: -hd + .75, w: .9, d: .8, h: .8 });
    } else for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
  } else if (profile === 'nodafukushima' && ['goten', 'nagaya', 'bansho', 'kura'].includes(kind)) {
    // 河川砦の推定復元。番所・板倉・長屋と、畳で下知を受ける詰所を分ける。
    const cut = hd - Math.min(1.1, d * .28);
    room(kind === 'goten' ? '下知の座敷' : kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の寝る間', -hw, hw, -hd, cut, kind === 'goten' ? 'tatami' : 'boards');
    room(kind === 'goten' ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, kind === 'goten' ? 'boards' : 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, kind !== 'kura');
    if (kind !== 'nagaya') props.push({ part: kind === 'kura' ? 'storage' : 'chest', x: -hw + .65, z: -hd + .65, w: .8, d: .7, h: .7 });
    if (kind === 'goten' || kind === 'bansho') props.push({ part: 'desk', x: hw - .8, z: -hd + .65, w: 1.2, d: .7, h: .46 });
    if (kind === 'nagaya') for (const x of [-hw + .8, hw - .8]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
  } else if ((profile === 'usayama' || profile === 'iwamura_' + kind) && ['kura', 'bansho', 'nagaya'].includes(kind)) {
    // 宇佐山の蔵・番所・長屋は用途を分けた推定復元。戸口から奥まで中央を空ける。
    const cut = hd - Math.min(1.1, d * .25);
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の休む板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, kind !== 'kura' && !profile.startsWith('iwamura_'));
    if (kind === 'kura') {
      for (const x of [-hw + .65, hw - .65]) props.push({ part: 'storage', x, z: -hd + .75, w: .8, d: .9, h: .8 });
    } else if (kind === 'bansho') {
      props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .46 });
      props.push({ part: 'ammo', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: .55 });
    } else {
      for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1.1, w: .75, d: 1.5, h: .12 });
      props.push({ part: 'chest', x: -hw + .65, z: 0, w: .8, d: .6, h: .65 });
    }
  } else if (profile === 'inabayama' && ['kura', 'bansho', 'tamari', 'nagaya'].includes(kind)) {
    // 稲葉山の実務の板間と遠侍の畳を分ける。中央の戸口と入口を空けた推定の間取り。
    // 浅い板倉は玄関の板戸だけにする。内戸を置くと玄関の溝と重なる。
    const shallowStore = kind === 'kura' && d < 2.3;
    // 玄関の内寄りの溝と内戸の手前の溝の間にも、人が立てる幅を残す。
    // 高画質の戸は壁より室内へ出るため、元の入口幅では両方の戸に体が重なる。
    const cut = hd - (raisedTatami && !shallowStore ? Math.min(1.3, d * .4) : Math.min(1.1, d * .25));
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : kind === 'nagaya' ? '兵の休む板間' : '侍の控え', -hw, hw, -hd, cut, kind === 'tamari' ? 'tatami' : 'boards');
    room(kind === 'tamari' ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, kind === 'tamari' ? 'boards' : 'earth');
    if (!shallowStore) cross(cut, -hw + .1, hw - .1, entryX, kind === 'tamari');
    // 兵糧蔵も土間から一段上げ、米俵を置く板床と入口を分ける推定復元。
    // 床・荷・引き戸で同じ高さを使う。
    // 遠侍の畳座敷も板敷きの入口から一段上げる推定。高画質の設営だけで指定する。
    const raised = ['kura', 'bansho', 'nagaya'].includes(kind) || kind === 'tamari' && raisedTatami;
    if (raised) {
      rooms[0].y = .16;
      if (!shallowStore) portals[portals.length - 1].sill = .16;
      for (const v of walls) v.sill = .16;
    }
    if (kind === 'tamari') {
      portals[portals.length - 1].kind = 'shoji';
      for (const v of walls) v.kind = 'shoji';
      if (raisedTatami) {
        // 遠侍の文机は推定のしつらえ。蓋箱と反対の右脇へ寄せる。
        // 二室に分ける時は、下で入口側の取次の間へ移す。
        // 既存の硯・紙付きの低い机を使い、畳面と絵・当たりの高さを揃える。
        props.push({ part: 'desk', x: hw - .8, z: -hd + .65,
          w: 1, d: .6, h: .4 });
        // 遠侍で控える侍の武具は奥壁の槍掛けへ納める推定のしつらえ。
        // 左の蓋箱の脇に収め、中央の障子口と裏の連子窓を空ける。
        props.push({ part: 'spearRack', x: -hw + 1.9, z: -hd + .35,
          w: .6, d: .3, h: 2.1 });
      }
      if (raisedTatami && cut + hd >= 3.4) {
        // 遠侍は入口の取次と奥の控えを襖で分ける推定復元。
        // 障子の入口は残し、両室とも同じ高さの畳座敷にする。
        // 等分すると取次が浅く、文机前の座が入口障子の溝へ寄りすぎる。
        // 奥の控えは一・四歩以上残し、取次に二十五センチを回す推定の間取り。
        const split = -hd + Math.max(1.4, (cut + hd) / 2 - .25), back = rooms[0];
        back.name = '奥の控え'; back.z1 = split;
        rooms.splice(1, 0, { ...back, name: '取次の間', z0: split, z1: cut });
        // 取次の文机を奥の控えに取り残さず、入口側の右脇へ納める。
        // 浅い机にして手前に座る余地を残し、前後の戸の溝と中央の通路を空ける。
        // 既存の文机を動かすだけにし、絵と当たりは同じ寸法を使う。
        const receptionDesk = props.find(p => p.part === 'desk');
        if (receptionDesk) {
          receptionDesk.d = .45;
          // 襖の二本の溝と当たりから机の背を三十センチ離す。
          // 手前には七十センチの座と、入口障子を開く余白を残す。
          receptionDesk.z = split + .3 + receptionDesk.d / 2;
        }
        const first = walls.length;
        cross(split, -hw + .1, hw - .1, entryX);
        portals[portals.length - 1].kind = 'fusuma';
        portals[portals.length - 1].sill = .16;
        for (let i = first; i < walls.length; i++) {
          walls[i].kind = 'fusuma'; walls[i].sill = .16;
        }
      }
    }
    if (kind === 'nagaya') {
      // 高画質の寝所は一人が横になれる長さを取り、奥壁から二十センチ控える。
      // 狭い板間では入口側の框まで二十センチ残し、寝具を土間や板戸へ出さない。
      // 敷物・木枕・掛け布と通路の当たりに同じ外寸を渡す。
      const beddingD = raisedTatami ? Math.min(1.8, cut + hd - .4) : 1.5;
      const beddingZ = raisedTatami ? -hd + .2 + beddingD / 2 : -hd + 1;
      for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: beddingZ, w: .75, d: beddingD, h: .12 });
      if (raisedTatami && w >= 8 && cut + hd >= 2.3) {
        // 長屋の私物の置き場は寝所脇の小さな蓋箱とする推定のしつらえ。
        // 寝具・奥壁の武具・中央の板戸から離し、床高と当たりも共有する。
        for (const x of [-hw + 1.95, hw - 1.95]) props.push({ part: 'chest',
          x, z: -hd + 1.25, w: .6, d: .45, h: .4 });
      }
      // 兵の宿の推定配置。矢箱は寝所の脇の奥壁へ寄せ、中央の通路と板戸の引き先を空ける。
      props.push({ part: 'ammo', x: hw - 2, z: -hd + .4, w: .8, d: .45, h: .35 });
    } else if (kind !== 'kura') {
      // 小さな番所は奥壁の矢箱と槍掛けが重なっていた。
      // 高画質では矢箱を左壁へ寄せ、隣の槍掛けと別々に納める。
      const compactAmmo = raisedTatami && kind === 'bansho';
      // 二室に分けた遠侍は蓋箱の前が襖まで五十センチしかない。
      // 浅い箱を奥壁から二十センチ控えて納め、開いた襖の前に立てる幅を取る。
      const compactChest = raisedTatami && kind === 'tamari' && rooms.length === 3;
      props.push({ part: kind === 'bansho' ? 'ammo' : 'chest',
        x: -hw + (compactAmmo ? .5 : .7), z: -hd + (compactChest ? .425 : .65),
        w: compactAmmo ? .6 : .8, d: compactChest ? .45 : .6, h: .65 });
    }
    // 高画質の蔵は米俵も間取りへ登録し、板床・当たり・兵の通路を揃える。
    // 米俵は左右の壁際へ一段ずつ納め、中央を荷運びの通路にする推定配置。
    if (kind === 'kura' && raisedTatami) {
      // 合図の小屋ほど浅い板倉は蓋箱だけにし、俵を戸の溝へはみ出させない。
      // 小屋でも中央と板戸の引き先を空ける。
      if (cut + hd < 2) props.push({ part: 'chest',
        x: hw - .55, z: -hd + .4, w: .65, d: .45, h: .5 });
      else for (const side of [-1, 1]) {
        // 狭い蔵は片側だけにし、俵の間に一・二歩以上の通路を保つ。
        if (side < 0 && w - 2 * (.7 + .75 / 2) < 1.2) continue;
        // 浅い蔵では三俵の列と開いた板戸の間が狭い。俵を潰して縮めず、
        // 二俵（さらに浅ければ一俵）の列にし、奥壁に二十センチ、手前に八十センチ取る。
        const boardDepth = cut + hd;
        const bales = boardDepth >= 2.64 ? 3 : boardDepth >= 2.1 ? 2 : 1;
        const baleDepth = .56 + (bales - 1) * .54;
        // 俵の下に湿気避けの敷木を八センチ取り、絵と当たりへ同じ高さを渡す。
        props.push({ part: 'riceBales',
          x: side * (hw - .7), z: -hd + .2 + baleDepth / 2,
          w: .75, d: baleDepth, h: .62, bales });
      }
    }
    if (kind === 'bansho') {
      // 小番所では大きな文机の前が板戸の溝へ重なり、座る薄縁を置けなかった。
      // 浅い文机を奥壁へ寄せ、座る場所と開いた板戸の間を空ける推定の納まり。
      // 建物全体の奥行きでなく、土間を除いた板間で判断する。
      // 通常の文机の前端から十センチ離して七十センチの座を取り、
      // その先にも板戸を扱う七十五センチを残せない時は浅い机にする。
      const deskFront = .65 + .7 / 2;
      const compactDesk = raisedTatami && cut + hd < deskFront + .1 + .7 + .75;
      // 小番所は奥行き三十五センチの文机へ納める。後ろの二十センチは
      // 保ち、手前に座る薄縁と板戸を扱う場所を取る。
      props.push({ part: 'desk', x: hw - (compactDesk ? .7 : .8),
        z: -hd + (compactDesk ? .375 : .65),
        w: compactDesk ? .9 : 1.2, d: compactDesk ? .35 : .7, h: .46 });
    }
    if (raisedTatami && ['bansho', 'nagaya'].includes(kind)) {
      // 武具は奥壁の浅い槍掛けへ寄せる推定配置。入口・板戸の引き先と寝所を空ける。
      // 同じ寸法を調度の絵と当たりへ渡し、兵が掛け台をすり抜けないようにする。
      // 番所は矢箱との間を空けた小幅の台。裏の連子窓（左右三十九センチ）も避ける。
      // 長屋の台は寝所から離した元の位置と幅を保つ。
      // 小番所では固定位置だと矢箱との隙間が十センチしかない。
      // 裏窓へ台を寄せず、矢箱の幅を詰めて二十五センチの余地を取る。
      // 箱の絵と当たりは同じ寸法を使う。
      const ammo = kind === 'bansho' ? props.find(p => p.part === 'ammo') : null;
      if (ammo) ammo.w = Math.min(ammo.w, Math.max(.3, 2 * (hw - 1.9)));
      props.push({ part: 'spearRack', x: kind === 'bansho' ? -.85 : -1.15,
        z: -hd + .35, w: kind === 'bansho' ? .6 : .8, d: .3, h: 2.1 });
    }
    if (raised) for (const p of props) p.y = .16;
  } else if (profile === 'okehazama' && kind === 'bansho') {
    // 桶狭間の詰所の室内図は残らない。兵の控えと小さな座敷を推定し、御殿の床の間・台所は置かない。
    const cut = -hd + d * .55;
    room('詰める座敷', -hw, hw, -hd, cut);
    room('板敷きの控え', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, entryX);
    props.push({ part: 'chest', x: -hw + .55, z: -hd + .45, w: .6, d: .4, h: .55 });
  } else if (kind === 'tenshu' || kind === 'yagura' || kind === 'gate') {
    room('武具の間', -hw, hw - hall, -hd, hd, 'boards');
    room('狭い廊下', hw - hall, hw, -hd, hd, 'boards');
    if (profile === 'yagura') {
      // 井楼の床は一間半ほど。箱を小さくし、中央と梯子の上り口を空ける。
      const narrow = w < 4 || d < 3;
      props.push({ part: 'ammo', x: -hw + .55, z: hd * .3, w: narrow ? .5 : .85, d: narrow ? .4 : .7, h: .55 });
      if (!narrow) props.push({ part: 'stones', x: -hw + .55, z: -hd + .6, w: .7, d: .6, h: .75 });
    } else {
      prop('ammo', -hw + .65, hd * .3);
      prop('stones', -hw + .65, -hd + .7);
    }
  } else if (kind === 'goten') {
    const cut = -hd + d * oku;
    // 稲葉山の縁側は玄関と広間の障子の溝の間に立てる幅を取る。
    // 高画質の戸は柱の内側を通るため、奥行きの二割だけでは浅くなる。
    const entryDepth = profile === 'inabayama' && raisedTatami
      ? Math.max(1.3, Math.min(1.5, d * .2)) : Math.min(1.5, d * .2);
    const entry = hd - entryDepth;
    room('上段の間', -hw, hw, -hd, cut);
    rooms[0].y = .16;
    room('広間', -hw, hw, cut, entry);
    room('廊下と縁側', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, profile === 'council' ? 0 : hw * .45);
    if (profile === 'inabayama') {
      // 上段の畳に襖を埋めず、敷居と戸の下端を上段の高さへ揃える。
      portals[portals.length - 1].sill = .16;
      for (const v of walls) v.sill = .16;
      if (raisedTatami) {
        // 主殿・山麓館の個別の襖絵は不明。金砂子の共通絵を復元扱いにせず、
        // 無地の和紙で推定する。固定戸と動く戸へ同じ種類を渡す。
        portals[portals.length - 1].kind = 'fusuma';
        for (const v of walls) v.kind = 'fusuma';
      }
    }
    cross(entry, -hw + .1, hw - .1, entryX, true, entryW);
    // 屋形の縁側から広間へは明かり障子、奥の座敷との境は襖。
    if (['mikatagahara', 'nagashima', 'iwamura', 'takato', 'inabayama', 'tottori'].includes(profile)) {
      portals[portals.length - 1].kind = 'shoji';
      if (['nagashima', 'takato', 'inabayama', 'tottori'].includes(profile)) for (const v of walls) if (v.az === entry && v.bz === entry) v.kind = 'shoji';
    }
    prop('alcove', hw - 1.4, -hd + .55);
    prop('desk', -hw + .85, -hd + 1.15);
    if (profile === 'inabayama' && raisedTatami && w >= 8 && cut + hd >= 2) {
      // 執務の文机の背後に、文書を納める素木の二段棚を補う推定。
      // 引き出し箪笥を流用せず、机の背から三十センチ空け、奥壁際へ納める。
      props.push({ part: 'documentShelf', x: -hw + .85, z: -hd + .35,
        w: 1, d: .3, h: 1.05 });
    }
    if (profile === 'inabayama' && raisedTatami && w >= 8 && cut + hd >= 2) {
      // 主殿・山麓館の執務の場に、文書を納める蓋箱を添える推定のしつらえ。
      // 文机の右脇の奥壁へ寄せ、机前の座と上段への襖口を空ける。
      // 既存の蓋箱を使い、畳面と絵・当たりの高さを揃える。
      props.push({ part: 'chest', x: -hw + 2.1, z: -hd + .55,
        w: .7, d: .6, h: .45 });
    }
    for (const p of props) p.y = .16;
  } else if (kind === 'chudo' || kind === 'hondo') {
    // 個別の室内図は残らない。板敷きの外陣と灯明のある内陣を推定し、左右に戦える口を残す。
    const cut = -hd + d * .38;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    if (profile === 'hieizan') {
      // 中央は本尊に向き合う格子の間仕切り。左右の脇口から内陣へ入れる。
      cross(cut, -hw + .1, 0, -hw * .55);
      cross(cut, 0, hw - .1, hw * .55);
    } else cross(cut, -hw + .1, hw - .1, hw * .5);
    prop('altar', 0, -hd + .85);
    if (profile === 'hieizan') {
      // 個別の荘厳は断定せず、須弥壇の手前に供物を供える前卓を置く。
      // 脇口からの通路は空け、寸法を描画と調度の当たりで共有する。
      // 奥行き五・五メートルの小堂では、共通の前卓が内陣境の丸柱へ食い込む。
      // 須弥壇の前に七・五センチ、柱の背面に五センチを空けて奥行きを納める。
      // 香炉と四脚が収まる二十五センチ未満なら卓を置かず、須弥壇は残す。
      // 寸法は見た目と当たりで共有し、開いた脇戸の通路も保つ。
      const pillarBack = cut - HIEI_NAIJIN_POST_SETBACK - .14, raibanDepth = .65, clearance = .05;
      const offeringBack = -hd + 1.425;
      const offeringDepth = Math.min(.45, pillarBack - clearance - offeringBack);
      if (offeringDepth >= .25) props.push({
        part: 'offering', x: 0, z: offeringBack + offeringDepth / 2, w: 1.2, d: offeringDepth, h: .55,
      });
      // 本尊へ向かう僧の礼盤。前卓と内陣境の柱の間に納め、左右の脇口を空ける。
      // 焼失前の配置の復元とは断定せず、収まる奥行きの堂だけに置く。
      // 中央柱の実際の柱芯・半径から、礼盤の前に五センチの余白を残す。
      if (-hd + 2.3 + raibanDepth / 2 + clearance <= pillarBack) {
        // 奥行きのある堂は礼盤の前に経机を納める。前卓との間と左右の脇口を空ける。
        // 個別の配置は推定。狭い堂へ無理に足さず、描画と当たりに同じ寸法を渡す。
        // 固定の礼盤位置では、この戦の中堂にも経机が一つも置かれなかった。
        // 前卓から五センチ、経机と礼盤も五センチ離し、柱前の余白を保って納める。
        const deskDepth = .4, deskZ = -hd + 1.65 + .45 / 2 + .05 + deskDepth / 2;
        const seatZ = deskZ + deskDepth / 2 + .05 + raibanDepth / 2;
        const readingDesk = seatZ + raibanDepth / 2 + clearance <= pillarBack;
        props.push({ part: 'raiban', x: 0, z: readingDesk ? seatZ : -hd + 2.3, w: .8, d: raibanDepth, h: .28 });
        if (readingDesk) props.push({ part: 'kyozukue', x: 0, z: deskZ, w: .8, d: deskDepth, h: .5 });
      }
    }
  } else if (kind === 'kuri') {
    const hx = hw - Math.min(2.6, w * .38);
    room('炊事の土間', -hw, hx, -hd, hd, 'earth');
    room('食事の間', hx, hw, -hd, hd);
    if (d > 4) walls.push({ ax: hx, az: -hd + 1.5, bx: hx, bz: hd - 1.5, paper: false });
    prop('stove', -hw + .8, -hd + .85);
    prop('storage', hw - .65, -hd + .7);
    // 比叡山の庫裏の収納は食事の間の畳上へ載せる。土間の竈は上げない。
    // 描画と調度の当たりで同じ床高を使う。
    if (profile === 'hieizan') {
      props[props.length - 1].y = .06;
      // 灯明を床高・当たりと共有し、畳側の台を六センチ沈めない。
      for (const x of [-hw + .5, hw - .5]) props.push({
        part: 'tomyo', x, z: hd - .75, y: x > hx ? .06 : 0, w: .32, d: .32, h: .97,
      });
    }
  } else if (kind === 'sobo') {
    const cut = hd - Math.min(1.8, d * .3);
    room('僧の座敷', -hw, hw, -hd, cut);
    room('板敷きの入口', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0);
    prop('desk', -hw + .8, -hd + .8);
    prop('storage', hw - .65, -hd + .7);
  } else if (kind === 'temple') {
    const cut = hd - d * .3;
    room('本堂', -hw, hw - hall, -hd, cut, 'boards');
    room('庫裏', -hw, hw - hall, cut, hd, 'earth');
    room('回廊', hw - hall, hw, -hd, hd, 'boards');
    cross(cut, -hw, hw - hall, 0);
    prop('altar', 0, -hd + .75);
    prop('stove', -hw + .7, hd - .65);
  } else if (profile === 'kanegasaki' && ['bansho', 'kura', 'nagaya'].includes(kind)) {
    // 金ヶ崎の小屋は用途別の推定復元。中央の戸と通り道の両側へ荷・寝具を収める。
    const cut = hd - Math.min(.9, d * .3), sleeping = kind === 'nagaya', storage = kind === 'kura';
    room(sleeping ? '兵の寝る間' : storage ? '兵糧を置く間' : '番兵の控え', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, sleeping);
    for (const sign of [-1, 1]) {
      const width = sleeping ? .75 : .65, depth = sleeping ? 1.5 : .5;
      props.push({ part: sleeping ? 'bedding' : storage ? 'storage' : sign < 0 ? 'ammo' : 'chest',
        x: sign * (hw - .2 - width / 2), z: -hd + .2 + depth / 2, w: width, d: depth, h: sleeping ? .12 : .65 });
    }
  } else if (kind === 'nagaya') {
    const cut = hd - Math.min(1.4, d * .3);
    room('兵の寝る間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
    prop('chest', -hw + .6, cut - .5);
  } else if (kind === 'shrine') {
    const inabaShrine = profile === 'inabayama' && raisedTatami;
    // 小祠の玄関は室内側へ三十四センチ引いた溝を通る。
    // 拝所を深くし、閉じた玄関と神前の格子戸の間にも一人立てる幅を残す。
    const cut = profile === 'inabayama' && !inabaShrine ? .35 : 0;
    room('神前', -hw, hw, -hd, cut, 'boards');
    room('拝む所', -hw, hw, cut, hd, 'boards');
    if (profile === 'inabayama') {
      // 小祠の細かな姿は推定。神前を格子で区切り、中央の引き戸から手入れに入れる。
      cross(cut, -hw + .1, hw - .1, 0);
      portals[portals.length - 1].kind = 'koshi';
      for (const v of walls) v.kind = 'koshi';
    }
    // 小祠の供物台は浅くして奥へ寄せ、格子戸の前に立つ場所を残す。
    props.push({ part: 'offering', x: 0, z: -hd + (inabaShrine ? .35 : profile === 'inabayama' ? .45 : .65),
      w: 1.2, d: inabaShrine ? .3 : profile === 'inabayama' ? .35 : .5, h: inabaShrine ? 1.65 : .65 });
    if (profile === 'inabayama' && raisedTatami) {
      // 神前を拝所より一段上げる推定の納まり。供物台・格子戸・床で同じ高さを使う。
      rooms[0].y = .16;
      props[0].y = .16;
      portals[0].sill = .16;
      for (const v of walls) v.sill = .16;
    }
  } else if (['machiya', 'inn', 'toiya', 'shisha'].includes(kind)) {
    const front = kind === 'inn' ? .24 : kind === 'toiya' ? .55 : kind === 'shisha' ? .2 : .36;
    const cut = hd - d * front, hx = hw - hall;
    room(kind === 'inn' ? '泊まる座敷' : kind === 'toiya' ? '帳場の座敷' : kind === 'shisha' ? '使者の座敷' : '奥の間', -hw, hx, -hd, cut);
    room(kind === 'inn' ? '宿の入口' : kind === 'toiya' ? '荷の土間' : kind === 'shisha' ? '控えの間' : '店の間', -hw, hx, cut, hd, kind === 'toiya' ? 'earth' : 'boards');
    room('通り庭', hx, hw, -hd, hd, 'earth');
    cross(cut, -hw, hx, Math.min(0, hx - 1.1));
    prop('counter', -hw + .7, hd - .75);
    if (kind === 'shisha') prop('desk', -hw + .8, -hd + .8);
    else prop('stove', hw - hall / 2, -hd + .65);
  } else {
    const cut = hd - d * .3, hx = hw - hall;
    room('座敷', -hw, hx, -hd, cut);
    room('玄関と式台', -hw, hx, cut, hd, 'boards');
    room('台所の土間', hx, hw, -hd, hd, 'earth');
    cross(cut, -hw, hx, Math.min(0, hx - 1.1));
    prop('alcove', -hw + 1.4, -hd + .55);
    prop('stove', hw - hall / 2, -hd + .65);
  }
  // 三田村氏館と岩村の侍屋敷は、奥の襖と入口の障子で座敷・取次・板間を分ける推定復元。
  if (profile === 'anegawa' || profile === 'iwamura_yashiki') {
    if (kind === 'yashiki') {
      rooms.length = walls.length = props.length = portals.length = 0;
      const cut = -hd + d * .42, entry = hd - 1.3;
      room('奥の座敷', -hw, hw, -hd, cut);
      room('取次の座敷', -hw, hw, cut, entry);
      room('板敷きの入口', -hw, hw, entry, hd, 'boards');
      cross(cut, -hw + .1, hw - .1, 0);
      cross(entry, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'shoji';
      prop('alcove', -hw + 1.4, -hd + .65);
      prop('desk', hw - .9, -hd + 1.1);
    } else if (kind === 'nagaya') {
      cross(rooms[0].z1, -hw + .1, hw - .1, entryX, false);
    }
  }
  // 土間と回廊を区切る。前後に通れる口を残す。
  if (['temple', 'machiya', 'inn', 'toiya', 'shisha', 'yashiki'].includes(kind) && profile !== 'anegawa' && profile !== 'iwamura_yashiki' && profile !== 'iga' && profile !== 'moribe') {
    if (d > 4) walls.push({ ax: hw - hall, az: -hd + 1.5, bx: hw - hall, bz: hd - 1.5, paper: kind !== 'temple' });
  }
  // 指定の山城の室内は推定復元。土の曲輪に平屋の館を置き、中央を戦える広さに残す。
  if (profile && profile !== 'council' && profile !== 'nodafukushima' && kind === 'goten') {
    // 木ノ芽峠の陣城も板床の詰所。狭い奥の襖口に床の間を置かない。
    const military = profile === 'odani_kyogoku' || profile === 'mitsukuri' || profile === 'kinome' || profile === 'usayama' || profile === 'kanegasaki';
    rooms[0].raised = !military;
    rooms[0].y = military ? 0 : .16;
    rooms[0].name = military ? '控えの間' : '奥の座敷';
    if (military) {
      rooms[1].floor = 'boards'; rooms[1].name = '兵の広間';
      props.length = 0;
      props.push({ part: profile === 'usayama' ? 'desk' : 'ammo', x: -hw + .8, z: -hd + .65 });
      // 小さな詰所でも襖の奥に人一人ぶんの通り道を残す。箱の絵と当たりを同じ幅で縮める。
      const chestW = Math.min(1.1, Math.max(.1, hw - .2 - portals[0].x - .55));
      props.push({ part: 'chest', x: chestW < 1.1 ? hw - .2 - chestW / 2 : hw - .8, z: -hd + .65, w: chestW, d: .6, h: .75 });
    } else {
      for (const p of props) p.y = .16;
      // 大広間は集まる場所。屋敷には壁際の小さな炉と収納を置く。
      if (profile === 'odani_onogi' || profile === 'odani_akao') {
        props.push({ part: 'hearth', x: -hw + 1, z: hd - .75, w: .9, d: .8, h: .45 });
      }
      if (profile === 'inabayama' && raisedTatami) {
        // 主殿・山麓館の蓋箱は玄関障子の内側の溝から離す。
        // 元の奥行き六十センチでは、左右へ引いた戸が箱の前面へ食い込む。
        // 縁側と広間の障子の溝の間へ浅い箱を納め、絵と当たりを揃える。
        const entry = rooms[2];
        const back = entry.z0 + .12 + .06 + .08;
        const front = hd - .34 - .04 - .06 - .08;
        const depth = Math.min(.45, front - back);
        if (depth >= .25) props.push({ part: 'chest', x: hw - .75,
          z: (back + front) / 2, w: 1.1, d: depth, h: .75 });
      } else if (profile !== 'odani_hall') props.push({ part: 'chest', x: hw - .75, z: hd - .7, w: 1.1, d: .6, h: .75 });
    }
  }
  // 箕作の小さな番所と蔵に屋敷の床の間を置くと、襖の奥の通路を塞ぐ。
  // 用途に合う小さな荷を両脇に収め、襖を前後に通れる幅を残す。
  if (profile === 'mitsukuri' && (kind === 'bansho' || kind === 'kura')) {
    props.length = 0;
    props.push({ part: kind === 'kura' ? 'storage' : 'ammo', x: -hw + .65, z: -hd + .65, w: .8, d: .7, h: .7 });
    props.push({ part: 'chest', x: hw - .65, z: -hd + .65, w: .8, d: .7, h: .7 });
  }
  // 対象の城の調度も残す。鳥取には満ちた米俵を置かない。
  if (profile) {
    if (['arioka', 'miki', 'tottori', 'takato', 'iwamura'].includes(profile) && kind === 'goten' && w >= 9 && d >= 6) prop('chest', -hw + .65, hd - .7);
    if (kind === 'machiya') prop('chest', -hw + .6, -hd + .65);
    if (profile === 'tottori') for (const p of props) if (p.part === 'ammo') p.part = 'chest';
  }
  if (profile === 'inabayama' && raisedTatami && kind === 'goten' && w >= 8) {
    // 主殿・山麓館の広間に、控える者の短槍を預ける場所を補う推定のしつらえ。
    // 奥座敷の執務道具とは分け、襖の手前の左脇へ既存の槍掛けを納める。
    // 玄関と障子口を結ぶ中央・戸の引き先を空け、上段でない畳面へ載せる。
    const hallRoom = rooms[1];
    if (hallRoom.z1 - hallRoom.z0 >= 1.7) props.push({ part: 'spearRack',
      x: -hw + .85, z: hallRoom.z0 + .6,
      w: .8, d: .3, h: 2.1, y: hallRoom.y || 0 });
  }
  // 調度の寸法は見た目・当たり・通路の判断で共有する。
  for (const p of props) {
    // 比叡山の須弥壇は天蓋までを当たりに含める。描く時もこの高さへ揃える。
    if (profile === 'hieizan' && p.part === 'altar') p.h ??= 2.27;
    p.w ??= p.part === 'alcove' ? 2.3 : p.part === 'altar' ? 2.1 : p.part === 'desk' ? 1.2 : p.part === 'counter' ? 1.1 : .85;
    p.d ??= p.part === 'alcove' ? .85 : p.part === 'altar' ? 1 : .7;
    p.h ??= p.part === 'alcove' ? 2.5 : p.part === 'altar' ? 1.5 : p.part === 'desk' ? .46 : p.part === 'stove' ? .9 : p.part === 'storage' ? .8 : p.part === 'chest' ? .7 : .55;
    if (profile === 'hieizan' && p.part === 'altar') {
      // 瑠璃堂・恵心堂は幅六メートル。共通幅の壇では脇口の立ち所へ
      // 張り出し、下の通路整理で本尊ごと消えていた。左右各五センチの
      // 余白を残す幅へ納め、描く壇・天蓋・当たりにも同じ寸法を渡す。
      for (const v of portals) {
        if (Math.abs(p.z - v.z) >= p.d / 2 + 1.05) continue;
        p.w = Math.min(p.w, Math.max(.1, (Math.abs(p.x - v.x) - .5) * 2));
      }
    }
    // 狭い建物でも家具の外側を壁の中へ収める。寸法は絵と当たりの両方へ渡す。
    p.w = Math.min(p.w, Math.max(.1, w - .4));
    p.d = Math.min(p.d, Math.max(.1, d - .4));
    // 伊賀の床の間は家具の離隔を取らず、外周の内壁へ接続する。
    const margin = profile === 'iga' && p.part === 'alcove' ? .06 : .2;
    p.x = Math.max(-hw + margin + p.w / 2, Math.min(hw - margin - p.w / 2, p.x));
    p.z = Math.max(-hd + margin + p.d / 2, Math.min(hd - margin - p.d / 2, p.z));
    // 主殿・山麓館の床の間は据え付け。家具用の二十センチの余白を
    // 奥へ残すと床柱と背板が室内に浮くため、背面を奥壁の内面へ合わせる。
    // 奥壁の厚さ六センチの半分だけ控え、絵と当たりを一緒に動かす。
    if (profile === 'inabayama' && raisedTatami && kind === 'goten' && p.part === 'alcove') {
      // 脇も壁へ納め、床柱の外側に家具用の隙間を残さない。
      p.x = hw - .03 - p.w / 2;
      p.z = -hd + .03 + p.d / 2;
    }
  }
  // 襖の口と前後の立ち所を全ての建物で空ける。調度の絵と当たりは同じ並びを使う。
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    // 浅い小祠は供物台を奥壁へ寄せた実寸で見る。格子戸の溝と人の幅を
    // 空けた台まで、広い堂用の余白で消さない。絵と当たりは同じ台を使う。
    const clearance = profile === 'inabayama' && raisedTatami && kind === 'hondo' && p.part === 'raiban' ? .7
      : profile === 'inabayama' && raisedTatami && kind === 'shrine' && p.part === 'offering' ? .8 : 1.05;
    if (portals.some(v => Math.abs(p.x - v.x) < p.w / 2 + .45
      && Math.abs(p.z - v.z) < p.d / 2 + clearance)) props.splice(i, 1);
  }
  if (side < 0) {
    for (const r of rooms) { const a = r.z0; r.z0 = -r.z1; r.z1 = -a; }
    for (const v of walls) { v.az *= -1; v.bz *= -1; }
    for (const p of props) { p.z *= -1; p.rot = (p.rot || 0) + Math.PI; }
    for (const p of portals) p.z *= -1;
  }
  return { kind, profile, rooms, walls, props, portals, dim: kind === 'tenshu' || kind === 'yagura' || kind === 'gate' ? .42 : .68 };
}

// 設楽原の小堂の置き畳。見た目と歩行面で、位置・向き・置けない条件まで共有する。
// 設営時だけ呼び、中央の参道と格子戸の引き込み先を空ける。
export function shitaragaharaTempleMats(layout) {
  const mats = [];
  if (layout.profile !== 'shitaragahara' || layout.kind !== 'hondo') return mats;
  // 回転した置き畳と調度の外寸で判定する。絵と足場は採用した畳だけを共用する。
  const extent = (w, d, rot = 0) => {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    return { x: (w * c + d * s) / 2, z: (w * s + d * c) / 2 };
  };
  const put = (m, room, skip = null) => {
    const e = extent(m.w, m.d, m.rot);
    if (m.x - e.x < room.x0 + .1 || m.x + e.x > room.x1 - .1
        || m.z - e.z < room.z0 + .3 || m.z + e.z > room.z1 - .3) return;
    if (layout.props.some(p => {
      if (p === skip) return false;
      const f = extent(p.w, p.d, p.rot);
      return Math.abs(m.x - p.x) < e.x + f.x + .08
        && Math.abs(m.z - p.z) < e.z + f.z + .08;
    })) return;
    // 格子戸の前と引き込み先には畳を置かず、敷居の脇を板床のまま通れるようにする。
    if ((layout.portals || []).some(p => Math.abs(m.x - p.x) < e.x + 2.1
      && Math.abs(m.z - p.z) < e.z + .31)) return;
    mats.push(m);
  };
  const inner = layout.rooms.find(r => r.name === '内陣');
  const desk = layout.props.find(p => p.part === 'sutraDesk');
  if (inner && desk) {
    const rot = desk.rot || 0, half = .45, offset = desk.d / 2 + .08 + half;
    const x = desk.x + Math.sin(rot) * offset, z = desk.z + Math.cos(rot) * offset;
    put({ x, z, w: half * 2, d: half * 2, rot, y: inner.y || 0, name: '内陣の僧座の畳' }, inner, desk);
  }
  const outer = layout.rooms.find(r => r.name === '外陣');
  if (outer && outer.x1 - outer.x0 >= 6 && outer.z1 - outer.z0 >= 2.2) {
    const cx = (outer.x0 + outer.x1) / 2, centerZ = (outer.z0 + outer.z1) / 2;
    // 入口の板戸は外壁より内側へ引く。中央寄せの畳では、開いた戸と敷居へ
    // 角が食い込むため、溝の見込み十一センチと八センチの余白を空ける。
    // 入口が裏向きでも同じ側へ寄せ、絵と歩行面でこの位置を共用する。
    const side = inner && centerZ < (inner.z0 + inner.z1) / 2 ? -1 : 1;
    const front = side > 0 ? outer.z1 : -outer.z0;
    const cz = side * Math.min(side * centerZ,
      front - shitaragaharaEntryInset(layout.kind) - .11 - .08 - .45);
    for (const side of [-1, 1]) put({ x: cx + side * 1.9, z: cz,
      w: .9, d: 1.8, rot: Math.PI / 2, y: outer.y || 0, name: '外陣の拝礼畳' }, outer);
  }
  return mats;
}

export function interiorFloorAt(layout, x, z) {
  for (const r of layout.rooms) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.floor;
  return 'boards';
}

// 壁と家具の周りの通路を設営時に作る。毎コマは既存の点と距離だけを使う。
function pathClear(rects, x, z, tx, tz) {
  const dx = tx - x, dz = tz - z;
  for (const r of rects) {
    let lo = 0, hi = 1;
    if (Math.abs(dx) < 1e-8) { if (x <= r.x0 || x >= r.x1) continue; }
    else { const a = (r.x0 - x) / dx, b = (r.x1 - x) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (Math.abs(dz) < 1e-8) { if (z <= r.z0 || z >= r.z1) continue; }
    else { const a = (r.z0 - z) / dz, b = (r.z1 - z) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (lo < hi && hi > 0 && lo < 1) return false;
  }
  return true;
}

// 伊賀の薄い敷きむしろ・寝むしろは床として踏める。机や炉と同じ障害物にしない。
// 絵は残し、体の当たり・兵の通路・立ち位置で同じ判断を使う。
export function interiorPropBlocksWalk(layout, p) {
  return !(layout.profile === 'iga' && (p.part === 'seatMat' && p.h <= .03
    || layout.kind === 'nagaya' && p.part === 'bedding' && p.h <= .12));
}

export function prepareInteriorPaths(layout, w, d) {
  const rects = [], nodes = [], margin = .36;
  for (const p of layout.props) if (interiorPropBlocksWalk(layout, p)) rects.push({ x0: p.x - p.w / 2 - margin, x1: p.x + p.w / 2 + margin, z0: p.z - p.d / 2 - margin, z1: p.z + p.d / 2 + margin });
  for (const v of layout.walls) rects.push({ x0: Math.min(v.ax, v.bx) - margin, x1: Math.max(v.ax, v.bx) + margin, z0: Math.min(v.az, v.bz) - margin, z1: Math.max(v.az, v.bz) + margin });
  for (const r of rects) for (const x of [r.x0 - .08, r.x1 + .08]) for (const z of [r.z0 - .08, r.z1 + .08]) {
    if (Math.abs(x) > w / 2 - .4 || Math.abs(z) > d / 2 - .4 || rects.some(v => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1)) continue;
    nodes.push({ x, z });
  }
  const n = nodes.length, distances = new Float32Array(n * n);
  distances.fill(Infinity);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = nodes[i], b = nodes[j];
    if (i === j || pathClear(rects, a.x, a.z, b.x, b.z)) distances[i * n + j] = Math.hypot(a.x - b.x, a.z - b.z);
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = distances[i * n + k] + distances[k * n + j];
    if (v < distances[i * n + j]) distances[i * n + j] = v;
  }
  layout.paths = { rects, nodes, distances, from: new Float32Array(n), to: new Float32Array(n) };
}

// 廊下の端・襖の開いた口へ回る。行き先の箱は呼び出し側が使い回す。
export function interiorWaypoint(layout, x, z, tx, tz, out) {
  out.x = tx; out.z = tz;
  const nav = layout.paths;
  if (nav) {
    // 家具の中を目的地にしない。同じ部屋で、壁の口を越えない最寄りの縁へ寄せる。
    const room = layout.rooms.find(r => tx >= r.x0 && tx <= r.x1 && tz >= r.z0 && tz <= r.z1);
    for (const r of nav.rects) {
      if (tx <= r.x0 || tx >= r.x1 || tz <= r.z0 || tz >= r.z1) continue;
      let best = Infinity, bx = tx, bz = tz;
      for (let k = 0; k < 4; k++) {
        const px = k === 0 ? r.x0 - .04 : k === 1 ? r.x1 + .04 : tx;
        const pz = k === 2 ? r.z0 - .04 : k === 3 ? r.z1 + .04 : tz;
        if (room && (px < room.x0 + .36 || px > room.x1 - .36 || pz < room.z0 + .36 || pz > room.z1 - .36)) continue;
        if (nav.rects.some(v => px > v.x0 && px < v.x1 && pz > v.z0 && pz < v.z1)) continue;
        const d = Math.hypot(px - tx, pz - tz);
        if (d < best) { best = d; bx = px; bz = pz; }
      }
      tx = bx; tz = bz;
    }
    out.x = tx; out.z = tz;
    if (pathClear(nav.rects, x, z, tx, tz)) return out;
    const n = nav.nodes.length;
    for (let i = 0; i < n; i++) {
      const q = nav.nodes[i];
      nav.from[i] = pathClear(nav.rects, x, z, q.x, q.z) ? Math.hypot(x - q.x, z - q.z) : Infinity;
      nav.to[i] = pathClear(nav.rects, q.x, q.z, tx, tz) ? Math.hypot(tx - q.x, tz - q.z) : Infinity;
    }
    let best = Infinity, first = -1;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(nav.from[i]) || nav.from[i] < .12) continue;
      for (let j = 0; j < n; j++) {
        const cost = nav.from[i] + nav.distances[i * n + j] + nav.to[j];
        if (cost < best) { best = cost; first = i; }
      }
    }
    if (first >= 0) { out.x = nav.nodes[first].x; out.z = nav.nodes[first].z; }
    else { out.x = x; out.z = z; }
    return out;
  }
  let first = 2, wall = null;
  for (const v of layout.walls) {
    const dx = tx - x, dz = tz - z, sx = v.bx - v.ax, sz = v.bz - v.az, den = dx * sz - dz * sx;
    if (Math.abs(den) < .00001) continue;
    const ax = v.ax - x, az = v.az - z;
    const t = (ax * sz - az * sx) / den, u = (ax * dz - az * dx) / den;
    if (t >= 0 && t < first && t <= 1 && u >= 0 && u <= 1) { first = t; wall = v; }
  }
  if (!wall) return out;
  if (Math.abs(wall.az - wall.bz) < .01) {
    const portal = layout.portals.find((p) => Math.abs(p.z - wall.az) < .01);
    if (portal) { out.x = portal.x; out.z = portal.z + (Math.abs(x - portal.x) < .45 ? Math.sign(tz - portal.z) || 1 : Math.sign(z - portal.z) || -Math.sign(tz - portal.z) || 1) * .9; }
    else {
      const left = Math.min(wall.ax, wall.bx) - .85, right = Math.max(wall.ax, wall.bx) + .85;
      out.x = Math.abs(x - left) + Math.abs(tx - left) <= Math.abs(x - right) + Math.abs(tx - right) ? left : right;
      out.z = Math.abs(x - out.x) < .4 ? tz : z;
    }
  } else {
    const front = Math.max(wall.az, wall.bz) + .85, back = Math.min(wall.az, wall.bz) - .85;
    out.z = Math.abs(z - front) + Math.abs(tz - front) <= Math.abs(z - back) + Math.abs(tz - back) ? front : back;
    out.x = Math.abs(z - out.z) < .4 ? tx : x;
  }
  return out;
}
