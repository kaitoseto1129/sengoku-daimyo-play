// Player の手のうち「号令と組（狙う所・組の選び・号令）」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import { weatherSees } from './weather_gameplay.js';
import * as THREE from 'three';
import { angleDiff, RIDE } from './units.js';
import { sfx } from './audio.js';
import { kamae, volley, kamaeOff, volleyRoll, ceaseFire } from './kumi.js';
import { ORDER_NAME, FORM_NAME, GROUP_KINDS, RADIAL, YARI_ITEM, FIRE_ITEM } from './player.js';

export class PlayerCommand {

  // 照準の先の地面
  aimPoint(maxD = 60) {
    const cam = this.rt.camera;
    const dir = this._apDir || (this._apDir = new THREE.Vector3());
    cam.getWorldDirection(dir);
    const p = cam.position;
    for (let s = 2; s < maxD; s += 1.2) {
      const x = p.x + dir.x * s, y = p.y + dir.y * s, z = p.z + dir.z * s;
      if (y <= this.rt.world.heightAt(x, z)) return { x, z };
    }
    const d = Math.min(maxD, 30);
    return { x: this.u.pos.x + Math.sin(this.yaw) * d, z: this.u.pos.z + Math.cos(this.yaw) * d };
  }

  // noInvuln：組に狙わせる時は、討たれない武将を外す（味方の兵は史実を崩さない）
  aimEnemy(maxD = 70, noInvuln = false, namedAllies = false) {
    const cam = this.rt.camera;
    const dir = this._aeDir || (this._aeDir = new THREE.Vector3());
    cam.getWorldDirection(dir);
    let best = null, bs = Infinity;
    const v = this._aeV || (this._aeV = new THREE.Vector3());
    for (const o of this.rt.army.units) {
      if (!o.alive || o === this.u || (o.team === this.u.team && !(namedAllies && o.name && o.invuln)) || o.noTarget || o.civ || o.type === 'dummy' || o.woundOut || (noInvuln && o.invuln) || o.fleeing) continue;
      v.set(o.pos.x - cam.position.x, o.pos.y + (o.mounted ? RIDE.y : 0) + 1.2 - cam.position.y, o.pos.z - cam.position.z);
      const d = v.length();
      if (d < 0.001 || Math.hypot(o.pos.x - this.u.pos.x, o.pos.z - this.u.pos.z) > maxD || !weatherSees(this.rt.world, this.u.pos, o.pos)) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      let score = ang * 30 + d * 0.05;
      // 味方の陰の敵は後回し（乱戦で味方越しの相手を照準にしない）
      if (ang < 0.22 && score < bs && maxD < 30 && this.allyBetween(o)) score += 6;
      if (ang < 0.22 && score < bs && this.lockVisible(o)) { bs = score; best = o; }
    }
    if (best || maxD < 30) return best;
    const p = this.aimPoint();
    let bd = 12;
    for (const o of this.rt.army.units) {
      if (!o.alive || o.team === this.u.team || o.type === 'dummy' || o.woundOut || (noInvuln && o.invuln) || o.fleeing) continue;
      if (Math.hypot(o.pos.x - this.u.pos.x, o.pos.z - this.u.pos.z) > maxD || !weatherSees(this.rt.world, this.u.pos, o.pos)) continue;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // 号令先に選べる隊の種類（組にいる隊だけ。全隊が先頭）
  groupChoices() {
    const kinds = new Set(this.rt.squadGroups.filter((g) => g.count > 0).map((g) => g.kind));
    return ['all', ...GROUP_KINDS.filter((k) => kinds.has(k))];
  }
  cycleGroup() {
    const order = this.groupChoices();
    if (order.length <= 2) { this.selGroup = 'all'; return; }
    this.selGroup = order[(order.indexOf(this.selGroup) + 1) % order.length];
    this.rt.tutMark('group');
    sfx('ui');
  }
  // 指を放した時の向きで決める。最後のなぞりが次の更新を待っていても取り落とさない。
  flickRadial(vx, vy) {
    if (Math.hypot(vx, vy) < 25) return false;
    this.syncRadial();
    const a = (Math.atan2(vx, -vy) + Math.PI * 2) % (Math.PI * 2);
    const it = RADIAL[Math.round(a / (Math.PI / 4)) % 8];
    this.radial = false;
    this.tabT = null;
    const trace = this.touchRadialTrace;
    if (trace) { trace.command = it.id; trace.decided = Math.round(a / (Math.PI / 4)) % 8; trace.rankBlocked = !!(it.min && this.G.rank < it.min); trace.t = this.rt.t; }
    if (it.min && this.G.rank < it.min) return false;
    if (it.id === 'rally') this.rally(); else this.command(it.id);
    if (this.rt.tutMark) this.rt.tutMark('radial');
    return true;
  }

  syncRadial() {
    let sh = false, gun = false, bowFire = false;
    for (const g of this.selectedGroups()) {
      if (g.count <= 0) continue;
      if (g.kind === 'gun') { sh = true; gun = true; }
      if (g.kind === 'bow') { sh = true; if (g.fire) bowFire = true; }
    }
    // 鉄砲の組がいれば「構え／放て」を出す（鉄砲を使いやすく）
    RADIAL[3] = sh ? FIRE_ITEM : YARI_ITEM;
    FIRE_ITEM.label = gun ? (this.rt.kamae ? '放て' : '構え') : bowFire ? 'やめ' : '放て';
  }
  selectedGroups() {
    const gs = this.rt.squadGroups;
    if (this.selGroup !== 'all') {
      const s = this.selectedGroupWork || (this.selectedGroupWork = []); s.length = 0;
      for (const g of gs) if (g.kind === this.selGroup) s.push(g);
      if (s.length) return s;
    }
    return gs;
  }

  // 号令「かかれ」で seekRange の中に敵がいない時、進む先を探す：一番近い敵の隊（無ければ任務の赤い印）
  farAttackTarget(from) {
    const rt = this.rt;
    const e = rt.army.nearestEnemy({ pos: from, team: this.u.team }, 400, (o) => !o.fleeing) || rt.army.nearestEnemy({ pos: from, team: this.u.team }, 400);
    if (e) return { x: e.pos.x, z: e.pos.z };
    // 雨で組の見通しが短い時も、組頭が見ている敵へ行軍できる。
    // 四百歩を指定しても nearestEnemy は天気の見通しで切られる。
    const ahead = rt.army.nearestEnemy(this.u, 38, (o) => !o.fleeing && !rt.army.wallBetween(this.u.pos, -1, o.pos));
    if (ahead) return { x: ahead.pos.x, z: ahead.pos.z };
    let best = null, bd = Infinity;
    for (const m of rt.markers || []) {
      if (!m.red) continue;
      const p = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!p) continue;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // 近くの、打ち壊せる敵の門・柵・逆茂木・竹束（石垣・土塁・築地塀など maxHp が 1e8 を超える物は対象にしない）
  nearestGate(range) {
    const u = this.u;
    let best = null, bd = range;
    for (const st of this.rt.army.structs) {
      if (!st.alive || st.team === u.team || (st.maxHp || 0) > 1e8) continue;
      const p = st.seg ? { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 } : { x: st.x, z: st.z };
      const d = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  command(id) {
    const rt = this.rt;
    const u = this.u;
    const gs = this.selectedGroups();
    if (!gs.length || !rt.squad.some((s) => s.alive)) { if (rt.squad.length) rt.hud.flash('声の届く組がいない（組は討たれたか、散った）', 'dim'); return; }
    rt.snapSquadGroups?.();   // 号令で変える前の隊の様子（使番が届くまでの間、戻しておく元）
    // 同じ号令を 4 秒のうちにもう一度押すと、取り消して前の号令に戻す（押し間違いの手直し）
    const formOrder = id === 'form' || id === 'form_line' || id === 'form_ring' || id === 'form_gyorin';
    const undoable = !formOrder && !['fire', 'roll', 'ceasefire', 'focus'].includes(id);
    if (undoable && this.lastCmd && this.lastCmd.id === id && rt.t - this.lastCmd.t < 4 && rt.restoreSquad) {
      rt.restoreSquad(this.lastCmd.before);
      this.lastCmd = null;
      rt.hud.flash(`「${ORDER_NAME[id] || id}」を取り消した（前の号令に戻す）`, 'dim');
      sfx('taiko', 0.25);
      return;
    }
    if (id === 'attack') {
      let remaining = 0, unavailable = 0, wounded = 0;
      for (const g of gs) for (const s of g.units) {
        if (!s.alive || s.gone || s.isPlayer) continue;
        remaining++;
        if (s.woundOut || s.rearWound) wounded++;
        if (g.routed || s.fleeing || s.woundOut || s.rearWound) unavailable++;
      }
      if (remaining && unavailable >= remaining * 0.7) {
        if (!(this.unfitAttackSaid > rt.t)) {
          this.unfitAttackSaid = rt.t + 8;
          rt.hud.flash(wounded >= remaining * 0.7 ? '組の多くが負傷している。「退け」で残る兵を守れ' :
            gs.some(g => g.routed) ? '組は崩れている。「退け」で残る兵を守れ' :
            '組が散っている。「退け」で旗のそばへ', 'dim');
        }
        return;
      }
    }
    const before = undoable && rt.squadSnaps ? rt.squadSnaps() : null;
    if (rt.game.haptic) rt.game.haptic('order');   // 号令の手応え（携帯：太鼓の二打の震え）
    if (!['fire', 'roll', 'ceasefire', 'form'].includes(id)) kamaeOff(rt);
    // 号令は耳でも分かるように：かかれ・進め＝法螺と陣太鼓、退け＝鉦の連打、ついて来い＝法螺二声、ほか＝太鼓一打（同じ合図は 6 秒に一度）
    const sig = { attack: 'sig_susume', move: 'sig_susume', retreat: 'sig_hike', follow: 'sig_atsumare' }[id];
    if (sig && !(this.sigT && this.sigT[sig] > rt.t)) { (this.sigT = this.sigT || {})[sig] = rt.t + 6; sfx(sig, 0.55); }
    else sfx('taiko', 0.35);
    const lines = {
      follow: '者ども、ついて来い！', hold: 'その場で待て！', attack: 'かかれっ！突っ込め！', retreat: '退けっ、退けい！',
      focus: 'あの者を狙え！', move: 'あの地点まで進め！', yari: '槍衾を組め！',
      face: 'こちらへ向き直れ！', gather: '散るな、わしの元へ集まれ！', gate: '門を打ち破れ！',
    };
    if (id === 'fire') {
      // 弓・鉄砲の射撃を切り替える（号令先が弓か鉄砲なら、その隊だけ）
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない（射撃の号令は弓・鉄砲の組に）', 'dim'); return; }
      // 鉄砲の組：一度目は前に並べて「構え」、二度目からは「放て」の一斉射（kumi.js）
      if (shooters.some((g) => g.kind === 'gun')) {
        for (const g of shooters) if (g.kind === 'bow') g.fire = true;
        if (rt.kamae) volley(rt); else kamae(rt, this);
        rt.ack(id, shooters);
        rt.tutMark('cmd_fire');
        this.syncRadial();
        return;
      }
      const on = !shooters[0].fire;
      // 号令を待つ鉄砲組（holdFire）も「放て」で撃ち始める
      for (const g of shooters) { g.fire = on; if (on) g.holdFire = false; }
      const who = shooters.every((g) => g.kind === 'gun') ? '鉄砲隊' : shooters.every((g) => g.kind === 'bow') ? '弓隊' : '弓・鉄砲';
      rt.say(this.G.name, on ? `${who}、放てっ！` : `${who}、撃ち方やめ！`, 2);
      rt.ack(id, shooters);
      rt.tutMark('cmd_fire');
      return;
    }
    if (id === 'roll') {
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない（三段撃ちは弓・鉄砲の組に）', 'dim'); return; }
      if (volleyRoll(rt, this)) { rt.ack(id, shooters); rt.tutMark('cmd_fire'); this.syncRadial(); }
      return;
    }
    if (id === 'ceasefire') {
      let shooters = gs.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) shooters = rt.squadGroups.filter((g) => g.kind === 'bow' || g.kind === 'gun');
      if (!shooters.length) { rt.hud.flash('弓・鉄砲の組がいない', 'dim'); return; }
      if (ceaseFire(rt)) { rt.ack(id, shooters); this.syncRadial(); }
      else rt.hud.flash('撃っている弓・鉄砲の組がいない', 'dim');
      return;
    }
    if (formOrder) {
      const seq = ['line', 'ring', 'gyorin'];
      const cur = gs[0].formation === 'yari' ? 'line' : gs[0].formation;
      const f = id === 'form' ? seq[(seq.indexOf(cur) + 1) % seq.length] : id.slice(5);
      kamaeOff(rt);
      this.lastCmd = null;
      for (const g of gs) {
        g.formation = f === 'line' && (g.kind === 'spear' || !g.kind) ? 'yari' : f;
        g.focus = null; g.dest = null; g.onArrive = null; g._gather = false;
        const back = g.kind === 'gun' || g.kind === 'bow' ? 5 : g.kind === 'cavalry' ? 8 : 0;
        g.anchor = { x: u.pos.x + Math.sin(this.yaw) * (2 - back), z: u.pos.z + Math.cos(this.yaw) * (2 - back) };
        if (f === 'ring') { const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z; }
        g.facing = this.yaw;
        g.order = g.formation === 'yari' ? 'yari' : 'hold';
        g.aggro = f === 'ring' ? 3 : g.kind === 'gun' || g.kind === 'bow' ? 8 : 4;
        for (const s of g.units) { s.target = null; s.atk = null; s.charging = false; s.aiT = 0.15 + Math.min(0.5, s.slot * 0.04); }
      }
      if (f === 'gyorin') this.command('attack');
      const said = this.cmdSaidT || (this.cmdSaidT = {});
      if (!(said[f] > rt.t)) { said[f] = rt.t + 8; rt.say(this.G.name, `${FORM_NAME[f]}に組め！`, 2); }
      if (f !== 'gyorin') rt.ack(id, gs);
      return;
    }
    let target = null;
    if (id === 'focus') {
      target = this.lock && this.lock.alive && !this.lock.invuln ? this.lock : this.aimEnemy(70, true);
      if (!target) { rt.hud.flash('狙う敵が見当たらない', 'dim'); return; }
    }
    // 敵の門の前で「突撃」：まわりに敵がいなければ、組は門を打ちにかかる（号令の輪に「門を破れ」が無くても門を破れる）
    if (id === 'attack') {
      const gt = this.nearestGate(16);
      // 門の内（塀の向こう）の敵は数えない：門の外向き（nx・nz）の側にいる敵だけ
      const gm = gt && gt.seg ? { x: (gt.seg[0] + gt.seg[2]) / 2, z: (gt.seg[1] + gt.seg[3]) / 2 } : null;
      // 「外」は自分のいる側（門の向きの決まりが戦ごとに違っても迷わない）
      const sg = gm && gt.nx != null ? Math.sign((u.pos.x - gm.x) * gt.nx + (u.pos.z - gm.z) * gt.nz) || 1 : 1;
      const outside = (o) => !gm || gt.nx == null || ((o.pos.x - gm.x) * gt.nx + (o.pos.z - gm.z) * gt.nz) * sg > 0.5;
      if (gt && /門|木戸/.test(gt.name || '') && !rt.army.nearestEnemy(u, 12, (o) => !o.fleeing && outside(o))) id = 'gate';
    }
    let gateTarget = null;
    if (id === 'gate') {
      gateTarget = this.nearestGate(70);
      if (!gateTarget) { rt.hud.flash('近くに打ち破れる門・柵が見当たらない', 'dim'); return; }
    }
    let point = null;
    if (id === 'move') point = this.aimPoint();
    const followVoice = id === 'follow' && gs.some((g) => !g._followSaid || g.order !== 'follow');
    let attackFar = false;
    for (const g of gs) {
      if (id !== 'follow') g._followSaid = false;
      g.focus = null;
      if (g.formation === 'yari' && id !== 'yari') g.formation = 'line';
      if (id === 'follow') {
        g._followSaid = true;
        g.order = 'follow'; g.dest = null; g.onArrive = null; g._gather = false;
        // 号令を出した時に持ち場を付け直す。兵の位置は動かさず、歩いて合流させる。
        const escort = g.kind === 'cavalry' && this.mounted && Math.abs(this.hspd || 0) > 5;
        const back = g.kind === 'bow' || g.kind === 'gun' ? 9.5 : g.kind === 'cavalry' ? (escort ? 4.2 : 8) : 7;   // 徒歩の組の前列は視点（4〜5m 後ろ）より後ろに置く。真下だと画面の隅に首だけ映る（10/28）
        const h = this.travelH ?? u.heading;
        g.anchor.x = u.pos.x - Math.sin(h) * back + (escort ? u.vel.x * 0.5 : 0);
        g.anchor.z = u.pos.z - Math.cos(h) * back + (escort ? u.vel.z * 0.5 : 0);
        g.facing = h; g._deployT = -99;
        g._catchUp = true;
      }
      else if (id === 'hold') { g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.facing = this.yaw; g.aggro = g.kind === 'bow' || g.kind === 'gun' ? 8 : 7; }
      else if (id === 'attack') {
        const c = g.center();
        c.y = rt.world.heightAt(c.x, c.z);
        // 徒歩の突撃は後列も進む。横隊のままだと後列は三〜六歩の敵しか追わない。
        if (g.kind !== 'bow' && g.kind !== 'gun' && g.kind !== 'cavalry') g.formation = 'gyorin';
        g.dest = null; g.onArrive = null; g.facing = this.yaw;
        // 古い行軍の要や、展開・集合待ちを突撃へ持ち越さない。
        g.anchor = { x: c.x, z: c.z }; g._deployT = -Infinity; g._gather = false;
        g.seekRange = 38;
        for (const s of g.units) {
          s.watch = null; s.watchT = 0; s.moveTo = null; s.pressBack = null;
          if (!s.target?.alive || rt.army.distTo(s, s.target) > 2.5) { s.target = null; s.atk = null; s.charging = false; }
        }
        // 塀の向こうの敵が近いだけで、行軍を省いて待ち続けない。
        const near = rt.army.nearestEnemy({ pos: c, team: u.team }, g.seekRange,
          (o) => !o.fleeing && Math.abs(o.pos.y - c.y) < 3 && !rt.army.wallBetween(c, -1, o.pos));
        // 間合いに敵がいなければ、突っ立たずに一番近い敵の隊（無ければ任務の赤い印）へ進み、近づいたら今の「かかれ」に移る
        const tp = near ? null : this.farAttackTarget(c);
        if (tp) {
          attackFar = true;
          g.order = 'move'; g.dest = { x: tp.x, z: tp.z }; g.speed = 3.6; g.facing = this.yaw;
          g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 38; const cc = gg.center(); gg.anchor = { x: cc.x, z: cc.z }; };
        } else { g.order = 'attack'; g.seekRange = 38; g.anchor = { x: c.x, z: c.z }; }
      }
      else if (id === 'retreat') {
        g.order = 'retreat';
        g.dest = null; g.path = null; g.onArrive = null; g._gather = false;
        g.anchor = { x: u.pos.x - Math.sin(this.yaw) * 18, z: u.pos.z - Math.cos(this.yaw) * 18 };
        g.facing = this.yaw;
        for (const s of g.units) { s.target = null; s.atk = null; }
      } else if (id === 'focus') { g.order = 'attack'; g.focus = target; g.seekRange = 20; }
      else if (id === 'gate') {
        // 敵が来れば普通に迎え討ちつつ、手が空いた者から狙った門・柵を数人がかりで打つ
        g.order = 'assault'; g.formation = 'line'; g.aggro = 3; g.seekRange = 30;
        g.assault = () => (gateTarget && gateTarget.alive ? gateTarget : null);
        const c = g.center(); g.anchor = { x: c.x, z: c.z };
      }
      else if (id === 'face') {
        // その場で踏みとどまり、照準の方へ隊の正面を向ける（横を突かれた時）
        g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.facing = this.yaw;
      } else if (id === 'gather') {
        // 散った兵を呼び戻す：いったん自分のすぐ後ろへ下がらせ、集まったら「ついて来い」に戻す（battle.js updateArmyAids）
        g.order = 'retreat'; g._gather = true;
        g.anchor = { x: u.pos.x - Math.sin(this.yaw) * 4, z: u.pos.z - Math.cos(this.yaw) * 4 };
        g.facing = this.yaw;
        for (const s of g.units) { s.target = null; s.atk = null; }
      }
      else if (id === 'move') {
        g.order = 'move';
        const bk = g.kind === 'bow' || g.kind === 'gun' ? 6 : 0;   // 飛び道具は槍の後ろに
        g.dest = { x: point.x - Math.sin(this.yaw) * bk, z: point.z - Math.cos(this.yaw) * bk };
        g.speed = 4.0;
        g.facing = this.yaw;
        g.onArrive = (gg) => { gg.order = 'hold'; gg.aggro = 7; };
      } else if (id === 'yari') {
        g.order = 'yari';
        // 槍衾は槍の隊だけ。弓・鉄砲は後ろに横陣、騎馬は脇に控える
        g.formation = g.kind === 'spear' || !g.kind ? 'yari' : 'line';
        const back = g.kind === 'bow' || g.kind === 'gun' ? 5 : g.kind === 'cavalry' ? 9 : 0;
        g.anchor = { x: u.pos.x + Math.sin(this.yaw) * (2 - back), z: u.pos.z + Math.cos(this.yaw) * (2 - back) };
        g.facing = this.yaw;
        g.aggro = g.kind === 'bow' || g.kind === 'gun' ? 8 : 4;
      }
      // 号令を確かに効かせる：ついて来い・待て・進めでは、目の前で打ち合っている者（2.5m 内）のほかは今の相手を離して号令に従う
      //   （遠くの敵を追いかけたまま、号令が効かないように見えないように）
      if (id === 'follow' || id === 'hold' || id === 'move' || id === 'yari') {
        for (const s of g.units) {
          if (!s.alive) continue;
          if (id === 'follow') {
            s.watch = null; s.moveTo = null; s.pressBack = null;
            s.settled = false; s.jammed = false; s.jamT = 0; s.nearT = 0; s.stepT = 0;
            if (!s.target) { s.atk = null; s.charging = false; }
          }
          if (!s.target) continue;
          const tp = s.target.pos;
          if (!tp || Math.hypot(tp.x - s.pos.x, tp.z - s.pos.z) > 2.5) { s.target = null; s.atk = null; s.charging = false; }
        }
      }
      // 号令 → 返事 → 組頭格が動き、兵がそれに続く（一斉にくるりと回らない）
      g.units.forEach((s, k) => { s.aiT = id === 'attack' ? 0.04 + (k % 3) * 0.03 : s === g.leader ? 0.15 : 0.35 + Math.min(0.5, k * 0.04) + Math.random() * 0.3; });
    }
    // 「ついて来い」は隊の号令が変わるまで一度。ほかの台詞は八秒あける。
    const said = this.cmdSaidT || (this.cmdSaidT = {});
    if (id === 'attack' && attackFar) { if (!(said.attackFar > rt.t)) { said.attackFar = rt.t + 8; rt.say(this.G.name, '敵は遠い。前へ出るぞ', 2); } }
    else if (lines[id] && (id === 'follow' ? followVoice : !(said[id] > rt.t))) { said[id] = rt.t + 8; rt.say(this.G.name, lines[id], 2); }
    if (id === 'attack') sfx('shout', 0.5);
    rt.ack(id);
    rt.tutMark('cmd_' + id);
    rt.onSquadCommand(id, target);
    this.lastCmd = before ? { id, t: rt.t, before } : null;
  }

  updateSquad(dt) {
    const u = this.u;
    // 歩いてきた向き（歩いている間だけ、ならして更新する）
    const vs = Math.hypot(u.vel.x, u.vel.z);
    if (vs > 1.2) { const vh = Math.atan2(u.vel.x, u.vel.z); this.travelH = this.travelH == null ? vh : this.travelH + angleDiff(this.travelH, vh) * Math.min(1, dt * 3); }
    for (const g of this.rt.squadGroups) {
      if (g.order !== 'follow' || (g.pending && g.pending.id !== 'follow')) g._followSaid = false;
      // ついて来いの間に本人が駆ける時だけ、騎馬の組の足を本人の馬に合わせる（止まる・別の号令で元の足へ）
      if (g.kind === 'cavalry') {
        const boost = g.order === 'follow' && this.mounted && u.alive && Math.abs(this.hspd || 0) > 5;
        for (const s of g.units) {
          if (!s.mounted) { s._run0 = null; continue; }   // 落馬した者は徒歩の足のまま
          if (s._run0 == null) s._run0 = s.run;
          s.run = boost ? Math.max(s._run0, Math.min(12.5, Math.abs(this.hspd) + 1)) : s._run0;
        }
      }
      if (g.order === 'follow') {
        // 馬で駆けている時の騎馬の組は、後ろと左右に詰めて一緒に駆ける（少し先を読んで置き去りにしない）
        const escort = g.kind === 'cavalry' && this.mounted && Math.abs(this.hspd || 0) > 5;
        const back = g.kind === 'bow' || g.kind === 'gun' ? 9.5 : g.kind === 'cavalry' ? (escort ? 4.2 : 8) : 7;   // 徒歩の組の前列は視点（4〜5m 後ろ）より後ろに置く。真下だと画面の隅に首だけ映る（10/28）
        // 組の行き先は「歩いてきた向き」の後ろ（敵へ振り向くたびに組が反対側へ走り回らないように）。止まっている間は動かさない
        const h = this.travelH ?? u.heading;
        const want = g._followPoint || (g._followPoint = { x: 0, z: 0 });
        want.x = u.pos.x - Math.sin(h) * back + (escort ? u.vel.x * 0.5 : 0); want.z = u.pos.z - Math.cos(h) * back + (escort ? u.vel.z * 0.5 : 0);
        // 戦っている間（突いた後も含む）は組を揺らさないが、7m より離れたら 3m まで寄せきる（その間で止まって置き去りにならないように）
        //   目の前に敵がいないのに突いているだけなら、戦っていないとみなす
        const fight = this.inCombatT > 0 && !!this.rt.army.nearestEnemy(u, 8);
        const far = Math.hypot(want.x - g.anchor.x, want.z - g.anchor.z);
        if (far > 7) g._catchUp = true; else if (far < 3) g._catchUp = false;
        if (!fight || g._catchUp) {
          g.anchor.x += (want.x - g.anchor.x) * Math.min(1, dt * (escort ? 5 : 2.5));
          g.anchor.z += (want.z - g.anchor.z) * Math.min(1, dt * (escort ? 5 : 2.5));
        }
        // 隊の正面は進む向きに。戦っている間は向きを保つ（横陣が振り向くたびに回らない）
        if (!fight || g._catchUp) g.facing += angleDiff(g.facing, h) * Math.min(1, dt * 2);
        // 自分が斬り合っている時は、組もその相手まで手を伸ばす
        g.aggro = fight ? 12 : 8;
      }
      if (g.order === 'retreat') {
        const c = g.center();
        if (Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z) < 4) { g.order = 'hold'; g.aggro = 6; }
      }
    }
    // 手勢も後ろに付く。組の号令から独立させ、崩れた時は追従を止める。
    const tegei = this.rt.realm && this.rt.realm.tegei;
    if (tegei && tegei.order === 'follow' && !tegei.routed && u.alive) {
      const h = this.travelH ?? u.heading;
      const rate = Math.min(1, dt * 2.5);
      tegei.anchor.x += (u.pos.x - Math.sin(h) * 5 - tegei.anchor.x) * rate;
      tegei.anchor.z += (u.pos.z - Math.cos(h) * 5 - tegei.anchor.z) * rate;
      tegei.facing += angleDiff(tegei.facing, h) * Math.min(1, dt * 2);
    }
    this.updateTomo(dt);
  }
}
