// 見えない物の行列を毎コマ計算しない（端末の重さの対策。three の標準は visible=false の下も全部たどる）。
// 隠れた子は「次に見えた時に必ず計算し直す」印だけ立てて飛ばす。見えた次のコマの描く前に、正しい場所へ直る。
import * as THREE from 'three';
import { mulMW } from './mat_mul.js';

const P = THREE.Object3D.prototype;
if (!P.__hiddenSkip) {
  P.__hiddenSkip = true;
  // 11/18 K365 iMac n-hetsugi（手取川の描く支度・長）：動かない物の行列を毎コマ作り直さない。
  //   自分の位置・向き・大きさ（TRS）が前と同じなら updateMatrix（compose）を省く。世界の行列は、作り直した時だけ前と比べ、
  //   変わった時だけ子へ force を降ろす（three の標準は舞台から下の全部へ毎コマ force を降ろし、止まった兵・柵・旗まで掛け算していた）。
  //   matrixAutoUpdate を切った子は自分で matrix を書く作りなので、今まで通り毎回 force で求める（そこから下は変わった時だけ降りる）。
  //   親が替わった物（attach・add）と初めての物は必ず求める。見た目は前と同じ（同じ値になる物の計算だけを省く）
  P.updateMatrixWorld = function (force) {
    if (this.matrixAutoUpdate) {
      const p = this.position, q = this.quaternion, s = this.scale;
      let c = this._mwTRS;
      if (!c || c[0] !== p.x || c[1] !== p.y || c[2] !== p.z || c[3] !== q._x || c[4] !== q._y || c[5] !== q._z || c[6] !== q._w ||
          c[7] !== s.x || c[8] !== s.y || c[9] !== s.z) {
        this.updateMatrix();
        if (!c) c = this._mwTRS = new Float64Array(10);
        c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q._x; c[4] = q._y; c[5] = q._z; c[6] = q._w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
      }
    }
    let changed = false;
    if (this.parent !== this._mwPar) { this._mwPar = this.parent; this.matrixWorldNeedsUpdate = true; }
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else mulMW(this.matrixWorld, this.parent.matrixWorld, this.matrix);   // 一つの形の掛け算（mat_mul.js）
      this.matrixWorldNeedsUpdate = false;
      // 子へ降ろすのは、子を最後に求めた時の世界の行列（_mwSeen）から変わった時だけ（途中で updateWorldMatrix が先に直していても子は降りる）
      //   親が動いて降りてきた物（force で自分の TRS も持つ物）は比べずに降ろす（比べても殆ど変わっている）。その時は _mwSeen を無効にし、次に比べる時は必ず降りる
      if (force === true && this.matrixAutoUpdate) { changed = true; if (this._mwSeen) this._mwSeen[0] = NaN; }   // NaN：次に比べる時は必ず「変わった」になる（古い値へ戻った時に子を取り残さない）
      else {
        const e = this.matrixWorld.elements;
        let w = this._mwSeen;
        if (!w) { w = this._mwSeen = new Float64Array(16); changed = true; }
        else for (let k = 0; k < 16; k++) if (w[k] !== e[k]) { changed = true; break; }
        if (changed) for (let k = 0; k < 16; k++) w[k] = e[k];
      }
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (!changed && (child._sf === true || child.matrixWorldAutoUpdate === false)) continue;
      // 骨（指など、下に描く物の無い骨は visible=false にして描く側の走査から外す。humans.js）は見えなくても行列を直す（皮が使う）
      if (child.visible === false && !child.isLight && !child.isCamera && !child.isBone) { child.matrixWorldNeedsUpdate = true; continue; }
      if (child.matrixWorldAutoUpdate === true || changed) child.updateMatrixWorld(child.matrixAutoUpdate === false || changed);
    }
  };
}
