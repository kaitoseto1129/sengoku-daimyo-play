// 内陣境の角柱（奥行き十二センチ）と丸柱（半径十四センチ）を重ねない柱芯。
export const HIEI_NAIJIN_POST_SETBACK = .20;

// 外壁の内寸から間取りを作る。局所の＋奥行きが戸口。設営時だけ呼ぶ。
export function interiorLayout(kind, w, d, { oku = .4, side = 1, profile = null, entryX = 0 } = {}) {
  const hw = w / 2, hd = d / 2;
  // 宿は泊まる座敷、問屋は荷を扱う土間、使者の間は応対の座敷を広く取る。
  const hall = kind === 'toiya' ? Math.min(3, w * .34)
    : kind === 'inn' ? Math.min(1.5, w * .18)
    : kind === 'shisha' ? Math.min(1.2, w * .18) : Math.min(1.5, w * .24);
  const rooms = [], walls = [], props = [], portals = [];
  const room = (name, x0, x1, z0, z1, floor = 'tatami') => rooms.push({ name, x0, x1, z0, z1, floor });
  const cross = (z, x0, x1, door, paper = true) => {
    const hieiSliding = profile === 'hieizan' && ['chudo', 'hondo', 'sobo'].includes(kind);
    // 小堂の脇戸・僧坊の襖と障子は、左右へ滑る戸と戸当たりまで柱間へ納める。
    // 狭い僧坊でも敷居・鴨居を側壁へ突き込まず、偏った戸口は引き込み幅を残して寄せる。
    // 二枚建ての全開幅と、敷居・鴨居の端（各五センチ）を含めて割る。
    // 間取りの段階で揃え、描く溝・動く戸・当たりへ同じ開口を渡す。
    const gap = Math.min(profile === 'council' ? 2.1 : 1.05,
      hieiSliding ? (x1 - x0 - .2) / 4 : (x1 - x0) * .25);
    const pocket = hieiSliding ? gap * 2 + .05 : gap;
    door = Math.max(x0 + pocket, Math.min(x1 - pocket, door));
    portals.push({ x: door, z, axis: 'z' });
    if (door - gap > x0) walls.push({ ax: x0, az: z, bx: door - gap, bz: z, paper });
    if (door + gap < x1) walls.push({ ax: door + gap, az: z, bx: x1, bz: z, paper });
  };
  const prop = (part, x, z) => props.push({ part, x, z });
  if (profile === 'iga' && ['nagaya', 'bansho', 'yashiki'].includes(kind)) {
    // 個別の室内図は不明。陣の宿と番所は板間、城館は畳の取次と奥座敷で復元する。
    const entry = hd - Math.min(1.1, d * .24);
    if (kind === 'yashiki') {
      const cut = -hd + d * .42;
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
      props.push({ part: 'desk', x: -hw + .8, z: -hd + .7, w: 1, d: .6, h: .4 });
    } else {
      room(kind === 'bansho' ? '番の控えの板間' : '兵の休む板間', -hw, hw, -hd, entry, 'boards');
      room('入口の土間', -hw, hw, entry, hd, 'earth');
      cross(entry, -hw + .1, hw - .1, entryX, false);
      if (kind === 'bansho') props.push({ part: 'desk', x: -hw + .8, z: -hd + .7, w: 1, d: .6, h: .4 });
      else for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
    }
    props.push({ part: 'storage', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: .6 });
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
  } else if (profile === 'takato' && kind === 'hondo') {
    // 法幢院の堂は炊事の庫裏と分け、須弥壇のある内陣と参拝する外陣を設ける。
    const cut = -hd + d * .48;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0);
    prop('altar', 0, -hd + .8);
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
  } else if (profile === 'inabayama' && ['kura', 'bansho', 'tamari'].includes(kind)) {
    // 稲葉山の蔵・番所・遠侍は主殿と分ける。中央の戸口と入口を空けた推定の間取り。
    const cut = hd - Math.min(1.1, d * .25);
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '侍の控え', -hw, hw, -hd, cut, kind === 'tamari' ? 'tatami' : 'boards');
    room(kind === 'tamari' ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, kind === 'tamari' ? 'boards' : 'earth');
    cross(cut, -hw + .1, hw - .1, 0, kind !== 'kura');
    props.push({ part: 'chest', x: -hw + .7, z: -hd + .65, w: .8, d: .6, h: .65 });
    if (kind === 'bansho') props.push({ part: 'desk', x: hw - .8, z: -hd + .65, w: 1.2, d: .7, h: .46 });
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
    const cut = -hd + d * oku, entry = hd - Math.min(1.5, d * .2);
    room('上段の間', -hw, hw, -hd, cut);
    rooms[0].y = .16;
    room('広間', -hw, hw, cut, entry);
    room('廊下と縁側', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, profile === 'council' ? 0 : hw * .45);
    cross(entry, -hw + .1, hw - .1, entryX);
    // 浜松の屋形：縁側から広間へは明かり障子、奥の座敷との境は襖。
    if (['mikatagahara', 'iwamura', 'takato'].includes(profile)) {
      portals[portals.length - 1].kind = 'shoji';
      if (profile === 'takato') for (const v of walls) if (v.az === entry && v.bz === entry) v.kind = 'shoji';
    }
    prop('alcove', hw - 1.4, -hd + .55);
    prop('desk', -hw + .85, -hd + 1.15);
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
      props.push({ part: 'offering', x: 0, z: -hd + 1.65, w: 1.2, d: .45, h: .55 });
      // 本尊へ向かう僧の礼盤。前卓と内陣境の柱の間に納め、左右の脇口を空ける。
      // 焼失前の配置の復元とは断定せず、収まる奥行きの堂だけに置く。
      // 中央柱の実際の柱芯・半径から、礼盤の前に五センチの余白を残す。
      const pillarBack = cut - HIEI_NAIJIN_POST_SETBACK - .14, raibanDepth = .65, clearance = .05;
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
  } else if (kind === 'nagaya') {
    const cut = hd - Math.min(1.4, d * .3);
    room('兵の寝る間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
    prop('chest', -hw + .6, cut - .5);
  } else if (kind === 'shrine') {
    room('神前', -hw, hw, -hd, 0, 'boards');
    room('拝む所', -hw, hw, 0, hd, 'boards');
    props.push({ part: 'offering', x: 0, z: -hd + .65, w: 1.2, d: .5, h: .65 });
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
  if (['temple', 'machiya', 'inn', 'toiya', 'shisha', 'yashiki'].includes(kind) && profile !== 'anegawa' && profile !== 'iwamura_yashiki' && profile !== 'iga') {
    if (d > 4) walls.push({ ax: hw - hall, az: -hd + 1.5, bx: hw - hall, bz: hd - 1.5, paper: kind !== 'temple' });
  }
  // 指定の山城の室内は推定復元。土の曲輪に平屋の館を置き、中央を戦える広さに残す。
  if (profile && profile !== 'council' && profile !== 'nodafukushima' && kind === 'goten') {
    // 木ノ芽峠の陣城も板床の詰所。狭い奥の襖口に床の間を置かない。
    const military = profile === 'odani_kyogoku' || profile === 'mitsukuri' || profile === 'kinome' || profile === 'usayama';
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
      if (profile !== 'odani_hall') props.push({ part: 'chest', x: hw - .75, z: hd - .7, w: 1.1, d: .6, h: .75 });
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
    p.x = Math.max(-hw + .2 + p.w / 2, Math.min(hw - .2 - p.w / 2, p.x));
    p.z = Math.max(-hd + .2 + p.d / 2, Math.min(hd - .2 - p.d / 2, p.z));
  }
  // 襖の口と前後の立ち所を全ての建物で空ける。調度の絵と当たりは同じ並びを使う。
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (portals.some(v => Math.abs(p.x - v.x) < p.w / 2 + .45
      && Math.abs(p.z - v.z) < p.d / 2 + 1.05)) props.splice(i, 1);
  }
  if (side < 0) {
    for (const r of rooms) { const a = r.z0; r.z0 = -r.z1; r.z1 = -a; }
    for (const v of walls) { v.az *= -1; v.bz *= -1; }
    for (const p of props) { p.z *= -1; p.rot = Math.PI; }
    for (const p of portals) p.z *= -1;
  }
  return { kind, profile, rooms, walls, props, portals, dim: kind === 'tenshu' || kind === 'yagura' || kind === 'gate' ? .42 : .68 };
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

export function prepareInteriorPaths(layout, w, d) {
  const rects = [], nodes = [], margin = .36;
  for (const p of layout.props) rects.push({ x0: p.x - p.w / 2 - margin, x1: p.x + p.w / 2 + margin, z0: p.z - p.d / 2 - margin, z1: p.z + p.d / 2 + margin });
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
