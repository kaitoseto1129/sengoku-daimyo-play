// 確かめ用の入力。本番と同じ解除処理を持ち、兵の操作用の k・e も同じ集合を使う。
export function botInput() {
  const keys = new Set(), edge = new Set();
  return {
    keys, edge, k: keys, e: edge,
    dx: 0, dy: 0, touchDx: 0, touchDy: 0, wheel: 0,
    mouseL: false, mouseR: false, padL: false, padR: false,
    leftPressed: false, rightPressed: false, axis: null, lockPressed: false, quickCmd: null,
    runHeld: false, guardHold: false, chargeHold: false,
    get left() { return this.mouseL || this.padL; },
    get right() { return this.mouseR || this.padR || this.guardHold; },
    key(c) { return this.keys.has(c); }, pressed(c) { return this.edge.has(c); },
    endFrame() {
      this.edge.clear(); this.dx = this.dy = this.touchDx = this.touchDy = this.wheel = 0;
      this.leftPressed = this.rightPressed = this.lockPressed = false; this.quickCmd = null;
    },
    clear() {
      this.keys.clear(); this.mouseL = this.mouseR = this.padL = this.padR = false;
      this.runHeld = this.guardHold = this.chargeHold = false; this.axis = null; this.endFrame();
    },
  };
}
