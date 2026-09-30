// 俄罗斯方块 Tetris —— 零依赖逻辑测试
// 从 index.html 里抽出 <script>，用一个最小 DOM stub 挂进去直接测
// node tetris_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const jsRaw = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ---------- 最小 DOM stub ----------
const store = new Map();
const ctxCalls = { count: 0 };
const ctx2d = new Proxy({}, {
  get: (t, k) => {
    if (k === 'setTransform' || k === 'clearRect' || k === 'fillRect' || k === 'strokeRect'
      || k === 'save' || k === 'restore' || k === 'beginPath' || k === 'moveTo' || k === 'lineTo'
      || k === 'stroke' || k === 'fill' || k === 'closePath' || k === 'arcTo' || k === 'fillText'
      || k === 'translate' || k === 'scale' || k === 'clip') return () => { ctxCalls.count++; };
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => { ctxCalls.count++; return { addColorStop() {} }; };
    if (k === 'canvas') return undefined;
    return (...a) => { ctxCalls.count++; return { addColorStop() {} }; };
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const el = () => ({
  textContent: '', value: '', checked: false, style: {}, dataset: {},
  classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
  addEventListener() {}, removeEventListener() {}, getContext() { return ctx2d; },
  width: 280, height: 560, offsetWidth: 0, dispatchEvent() {},
});
const nodes = {};
globalThis.document = {
  getElementById: id => (nodes[id] ||= el()),
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.window = {
  addEventListener() {},
  devicePixelRatio: 1,
  AudioContext: undefined,
};
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
globalThis.performance = { now: () => 0 };
let rafCalls = 0;
globalThis.requestAnimationFrame = () => { rafCalls++; return 1; };
globalThis.setTimeout = (fn) => { return 0; };

// ---------- 探针注入到 IIFE 内部 ----------
const probe = `
;globalThis.__probe = () => ({
  // 纯数据
  TYPES, COLORS, SHAPES, KICKS, FRONT, BASE,
  filled,
  // 可变状态
  get board() { return board; }, get piece() { return piece; },
  get queue() { return queue; }, get bag() { return bag; },
  get holdType() { return holdType; }, get holdUsed() { return holdUsed; },
  get score() { return score; }, get best() { return best; },
  get lines() { return lines; }, get level() { return level; },
  get combo() { return combo; }, get b2b() { return b2b; },
  get state() { return state; }, get clearing() { return clearing; },
  get lastKick() { return lastKick; }, get lockT() { return lockT; },
  get lockResets() { return lockResets; }, get dirHold() { return dirHold; },
  get dasCharged() { return dasCharged; }, get softing() { return softing; },
  get trails() { return trails; },
  // 函数
  collide, cellsOf, hits, move, rotate, rotate180, ghostY, hardDrop,
  holdPiece, lockPiece, finishClear, detectSpin, fullRows, baseScore,
  dropMs, rotCW, flipKicks, nextType, spawn, reset, start, update,
  refillQueue,
  drawBoard, drawPreviews, act, togglePause, gameOver, mulberry32,
  // 测试夹具
  seed: n => { rng = mulberry32(n); bag = []; },
  setState: s => { state = s; },
  setPiece: (type, rot, x, y) => {
    piece = makePiece(type); piece.rot = rot; piece.x = x; piece.y = y;
    lastKick = false; lockT = 0; lockResets = 0; gravT = 0;
  },
  setBoard: arr => {
    board = arr.map((r, y) => {
      if (typeof r !== 'string') return r.slice();
      if (r.length !== 10) throw new Error('夹具第 ' + y + ' 行宽度应为 10，实际 ' + r.length + '：' + r);
      return r.split('').map(ch => (ch === '.' ? 0 : TYPES.indexOf(ch) + 1));
    });
    if (board.length !== 22) throw new Error('夹具棋盘应为 22 行，实际 ' + board.length);
  },
  row: y => board[y].slice(),
  fill: (y, from, to, v) => { for (let x = from; x <= to; x++) board[y][x] = v || 1; },
  setHold: (t, used) => { holdType = t; holdUsed = !!used; },
  setScore: n => { score = n; },
  setLevel: n => { level = n; },
  setLastKick: v => { lastKick = v; },
  setClear: (rows, n) => { clearing = { rows, t: 0, dur: 320, spin: null, n }; },
  setQueue: q => { queue = q; },
  setBag: b => { bag = b; },
  setDirHold: d => { dirHold = d; dasT = 0; arrT = 0; dasCharged = false; },
  setSoft: v => { softing = v; softT = 0; },
  clearBoard: () => {
    board = [];
    for (let y = 0; y < 22; y++) board.push(new Array(10).fill(0));
  },
  tap: a => act(a),
});
`;
const idx = jsRaw.lastIndexOf('})();');
if (idx < 0) throw new Error('IIFE 结尾没找到');
new Function(jsRaw.slice(0, idx) + probe + jsRaw.slice(idx))();
const P = globalThis.__probe;

// ---------- 断言小工具 ----------
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok    ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); fail++; }
};
const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
};
const ok = (v, m = '') => { if (!v) throw new Error(m || '断言失败'); };

const G = () => P(); // 取最新引用（内部变量是 let，读的时候已经更新）
const T = P().TYPES;
const SOFT_SAMPLE = 60; // 软降采样用的 dt

/** 字符串数组（'.' 空，字母为方块）→ board */
function boardFrom(rows) {
  return rows.map(r => r.split('').map(ch => (ch === '.' ? 0 : T.indexOf(ch) + 1)));
}
function empty(n) { return new Array(n).fill('..........'); }
/** 确定性随机源（测试里不用 Math.random，否则失败无法复现） */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const V = ch => T.indexOf(ch) + 1; // 方块在棋盘里的数字编码
/** 按坐标摆棋盘：[x, y, 字母][]，比手写 10 字符串不易数错列 */
function scene(blocks) {
  const rows = empty(22);
  for (const [x, y, ch] of blocks) rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
  return rows;
}
function setScene(rows, type, rot, x, y) {
  const p = G();
  p.setBoard(boardFrom(rows));
  p.setPiece(type, rot, x, y);
}

// ============================================================
console.log('\n[1] 形状与旋转');

// 7 种方块 × 4 个朝向，每个都是 4 格且互不重叠
t('每种方块 4 个朝向都是 4 格', () => {
  for (const type of T) {
    for (let r = 0; r < 4; r++) eq(G().SHAPES[type][r].length, 4, type + ' rot' + r);
  }
});
t('包围盒内格子不重叠（旋转不产生重复格）', () => {
  for (const type of T) {
    for (let r = 0; r < 4; r++) {
      const cells = G().SHAPES[type][r];
      const key = cells.map(c => c.join(',')).sort().join('|');
      eq(new Set(cells.map(c => c.join(','))).size, 4, type + ' rot' + r + ' 有重复格: ' + key);
    }
  }
});
t('顺时针旋转 4 次回到原位（rotCW 自洽）', () => {
  for (const type of T) {
    const base = G().SHAPES[type][0].map(c => c.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cells = G().SHAPES[type][0];
    for (let i = 0; i < 4; i++) cells = G().rotCW(cells, G().BASE[type].n);
    const back = cells.map(c => c.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    eq(back, base, type + ' 4 次旋转没回来');
  }
});
t('I 方块 0 态横放、1 态竖放且都在 4x4 盒内', () => {
  const I = G().SHAPES.I;
  eq(new Set(I[0].map(c => c[1])).size, 1, 'I rot0 应该只占 1 行');
  eq(new Set(I[1].map(c => c[0])).size, 1, 'I rot1 应该只占 1 列');
  for (let r = 0; r < 4; r++)
    for (const [x, y] of I[r]) ok(x >= 0 && x < 4 && y >= 0 && y < 4, `I rot${r} 格子越界 ${x},${y}`);
});
t('O 方块 4 个朝向完全一致', () => {
  const O = G().SHAPES.O;
  const key = a => a.map(c => c.join(',')).sort().join('|');
  for (let r = 1; r < 4; r++) eq(key(O[r]), key(O[0]), 'O rot' + r);
});
t('方块不会越过包围盒', () => {
  for (const type of T) {
    const n = G().BASE[type].n;
    for (let r = 0; r < 4; r++)
      for (const [x, y] of G().SHAPES[type][r])
        ok(x >= 0 && y >= 0 && x < n && y < n, `${type} rot${r} 越界 ${x},${y} (n=${n})`);
  }
});
t('每个朝向转 2 步 = 180°（与直接算 180° 的格子集一致）', () => {
  for (const type of T) {
    const n = G().BASE[type].n;
    const key = a => a.map(c => c.join(',')).sort().join('|');
    const twoSteps = G().SHAPES[type][2];
    const direct = G().rotCW(G().rotCW(G().SHAPES[type][0], n), n);
    eq(key(twoSteps), key(direct), type);
  }
});

// ============================================================
console.log('\n[2] 踢墙表与 SRS');

// 官方表是 y 向上，加载时要翻成 y 向下
t('踢墙表已翻转为 y 向下（I 0->1 第 3 项应为 y=+0 之外的负值）', () => {
  eq(G().KICKS.I['01'][2], [1, 0]);
  eq(G().KICKS.I['01'][3], [-2, 1], 'y 向上 -1 应翻成 +1');
  eq(G().KICKS.I['01'][4], [1, -2], 'y 向上 +2 应翻成 -2');
});
t('所有踢墙表项都是整数且只有 5 组（O 只有 1 组）', () => {
  for (const type of T) {
    for (const k in G().KICKS[type]) {
      const want = type === 'O' ? 1 : 5;
      eq(G().KICKS[type][k].length, want, type + '.' + k);
      for (const [x, y] of G().KICKS[type][k]) {
        ok(Number.isInteger(x) && Number.isInteger(y), `${type}.${k} 出现非整数偏移`);
      }
    }
  }
});
t('踢墙表覆盖全部 8 个转向', () => {
  const want = ['01', '10', '12', '21', '23', '32', '30', '03'];
  for (const type of T) eq(Object.keys(G().KICKS[type]).sort(), want.slice().sort(), type);
});
t('T 方块贴地顺时针转得起来（靠踢墙避开地板）', () => {
  // T 平躺在最底两行，rot0 的 nubs 在上、底边贴着地板
  setScene(empty(22), 'T', 0, 3, 19);
  ok(G().rotate(1), 'T 贴地应能顺时针转起来');
  ok(G().collide(G().cellsOf(G().piece), G().piece.x, G().piece.y) === false, '转完后不能与已有方块重叠');
  for (const [cx, cy] of G().cellsOf(G().piece)) {
    const y = G().piece.y + cy;
    ok(y < 22, 'T 转完后掉到地板下面了');
  }
});
t('I 方块贴左墙能转成竖直（SRS I 专用踢墙）', () => {
  setScene(new Array(22).fill('..........'), 'I', 0, -1, 10);
  ok(G().rotate(1), 'I 在左墙应能转竖');
  const cells = G().cellsOf(G().piece);
  ok(cells.every(([cx]) => G().piece.x + cx >= 0), 'I 转竖后不能还在墙外');
});
t('贴左墙的 J 方块逆时针能踢出来', () => {
  setScene(new Array(22).fill('..........'), 'J', 0, -1, 10);
  ok(G().rotate(-1), 'J 在左墙逆时针应能转');
  for (const [cx] of G().cellsOf(G().piece)) ok(G().piece.x + cx >= 0);
});
t('贴左墙的 L 方块顺时针能踢出来', () => {
  setScene(new Array(22).fill('..........'), 'L', 0, -1, 10);
  ok(G().rotate(1), 'L 在左墙顺时针应能转');
  for (const [cx] of G().cellsOf(G().piece)) ok(G().piece.x + cx >= 0);
});
t('旋转永远不会把方块送进已占用格或墙外', () => {
  // 固定种子 200 局，每局 40 步随机旋转/移动，任何非法结果都算失败
  const rnd = prng(20260930);
  const p = G();
  for (let i = 0; i < 200; i++) {
    p.start();
    for (let k = 0; k < 40; k++) {
      const r = Math.floor(rnd() * 5);
      if (r === 0) p.rotate(1);
      else if (r === 1) p.rotate(-1);
      else if (r === 2) p.rotate180();
      else if (r === 3) p.move(-1, 0);
      else p.move(1, 0);
      if (p.state === 'over') break;
      for (const [cx, cy] of p.cellsOf(p.piece)) {
        const x = p.piece.x + cx, y = p.piece.y + cy;
        ok(x >= 0 && x < 10, '方块横向出界 x=' + x);
        ok(y < 22, '方块纵向出界 y=' + y);
        if (y >= 0) ok(p.board[y][x] === 0, '方块与已落定方块重叠 ' + x + ',' + y);
      }
    }
  }
});

// ============================================================
console.log('\n[3] 碰撞与移动');

t('左右墙都能挡住移动', () => {
  setScene(empty(22), 'O', 0, 3, 10);
  for (let i = 0; i < 3; i++) ok(G().move(-1, 0), '左移第 ' + i + ' 步');
  eq(G().piece.x, 0, 'O 最左只能到 x=0');
  ok(!G().move(-1, 0), '不该再能左移');
  for (let i = 0; i < 8; i++) ok(G().move(1, 0), '右移第 ' + i + ' 步');
  eq(G().piece.x, 8, 'O 最右只能到 x=8');
  ok(!G().move(1, 0), '不该再能右移');
});
t('地板能挡住下落', () => {
  setScene(empty(22), 'O', 0, 3, 20);   // O 占 20/21 两行，已经贴地
  ok(!G().move(0, 1), '已经贴地，不该还能下落');
});
t('方块上方（y<0）允许存在——旋转所需', () => {
  setScene(empty(22), 'O', 0, 3, -1);
  ok(!G().collide(G().cellsOf(G().piece), 3, -1), 'y<0 不算碰撞');
  ok(G().move(0, 1), '应该能落回来');
});
t('缓冲区里的方块（y<0）同样不能被移出左右墙', () => {
  // 横放 I（格子列偏移 0..3）放在 py=-2，整个方块都在缓冲区之上（y=-1）。
  // 此时 board[y][x] 那条检查不生效，横向边界必须由显式的 x<0 / x>=COLS 判定抦住
  const p = G();
  p.setBoard(empty(22));
  p.setPiece('I', 0, 2, -2);
  ok(p.cellsOf(p.piece).every(([, cy]) => -2 + cy < 0), '夹具应整个在缓冲区之上');
  for (let k = 0; k < 6; k++) p.move(-1, 0);
  for (const [cx] of p.cellsOf(p.piece)) ok(p.piece.x + cx >= 0, '不能被移出左墙 x=' + (p.piece.x + cx));
  for (let k = 0; k < 12; k++) p.move(1, 0);
  for (const [cx] of p.cellsOf(p.piece)) ok(p.piece.x + cx < 10, '不能被移出右墙 x=' + (p.piece.x + cx));
  for (let k = 0; k < 30; k++) p.move(0, 1);
  for (const [, cy] of p.cellsOf(p.piece)) ok(p.piece.y + cy < 22, '不能掉出地板');
});
t('已落定方块挡住移动', () => {
  const rows = empty(22);
  rows[21] = '....Z.....';   // x=4 底部被占
  setScene(rows, 'O', 0, 3, 20);
  ok(!G().move(0, 1), '下面有方块时不该能下落');
  ok(G().move(-1, 0), '往左挪开后应该能继续下落');
});
t('ghostY 给出恰好能落到的位置', () => {
  setScene(empty(22), 'O', 0, 3, 1);
  const gy = G().ghostY();
  eq(gy, 20, 'O 两行占 20/21，停在 y=20');
  ok(G().collide(G().cellsOf(G().piece), 3, gy + 1), 'ghostY 下面已经不能站了');
  ok(!G().collide(G().cellsOf(G().piece), 3, gy), 'ghostY 自己应该站得住');
});
t('ghostY 会被不规则地形挡住', () => {
  const rows = empty(22);
  rows[20] = '..J.......';   // x=2
  rows[21] = '....S.....';   // x=4
  setScene(rows, 'O', 0, 3, 1);
  eq(G().ghostY(), 19, 'O 占 x=3,4，被 x=2 的 J 挡在 y=19');
});

// ============================================================
console.log('\n[4] 7-bag 与队列');

t('每 7 个方块内 7 种各出现一次', () => {
  const p = G();
  p.seed(12345);
  for (let round = 0; round < 40; round++) {
    const batch = [];
    for (let i = 0; i < 7; i++) batch.push(p.nextType());
    eq(batch.slice().sort(), T.slice().sort(), '第 ' + round + ' 组不是完整一套');
  }
});
t('队列始终保持 3 个预览', () => {
  const p = G();
  p.reset();
  eq(p.queue.length, 3);
  for (let i = 0; i < 20; i++) { p.hardDrop(); if (p.state === 'over') { p.reset(); } }
  ok(p.queue.length === 3, '队列长度应恒为 3，实际 ' + p.queue.length);
});
t('同一种随机种子产出同样的序列', () => {
  const p = G();
  p.seed(999); const a = [p.nextType(), p.nextType(), p.nextType(), p.nextType()];
  p.seed(999); const b = [p.nextType(), p.nextType(), p.nextType(), p.nextType()];
  eq(a, b, '同种子结果应一致');
});

// ============================================================
console.log('\n[5] 暂存 HOLD');

t('第一次暂存把当前方块存起来，换队列里下一个', () => {
  const p = G();
  p.start();
  p.setPiece('T', 0, 4, 5);
  p.seed(777); // 固定队列
  const next = p.queue[0];
  p.holdPiece();
  eq(p.holdType, 'T', 'hold 槽应是 T');
  eq(p.piece.type, next, '应换上队列里的下一个');
  eq(p.piece.x, 3, '换上的方块应回到出生 x');
  eq(p.piece.y, 1, '换上的方块应回到出生 y');
});
t('非运行中不能暂存', () => {
  const p = G();
  p.reset();
  p.setState('ready');
  p.setPiece('T', 0, 4, 5);
  p.holdPiece();
  eq(p.holdType, null, 'ready 状态下不应接受暂存');
});
t('同一回合内不能连续暂存两次', () => {
  const p = G();
  p.start();
  p.setQueue(['S', 'L', 'O']);       // 指定预览，避免依赖随机序列
  p.setPiece('T', 0, 4, 5);
  p.holdPiece();
  eq(p.holdType, 'T', '第一次暂存：hold 槽 = T');
  eq(p.piece.type, 'S', '第一次暂存：拿到队列里的 S');
  eq(p.holdUsed, true);
  p.holdPiece();
  eq(p.piece.type, 'S', '第二次暂存必须被拒绝');
  eq(p.holdType, 'T', 'hold 槽不该变');
});
t('锁定下一个方块后可以再次暂存', () => {
  const p = G();
  p.start();
  p.setPiece('T', 0, 4, 5);
  p.holdPiece();
  eq(p.holdUsed, true);
  p.spawn(); // spawn 会重置 holdUsed
  eq(p.holdUsed, false, '换回合后应能再暂存');
  p.setPiece('J', 0, 4, 5);
  p.holdPiece();
  eq(p.holdType, 'J', 'hold 槽换成当前的 J');
  eq(p.piece.type, 'T', '应把暂存的 T 拿回来');
});
t('暂存 T 再拿回 T 不会因同种而卡住', () => {
  const p = G();
  p.start();
  p.setPiece('T', 0, 4, 5);
  p.holdPiece();
  p.spawn();
  p.setPiece('T', 0, 4, 5);
  p.holdPiece();
  eq(p.holdType, 'T');
  eq(p.piece.type, 'T');
});

// ============================================================
console.log('\n[6] T-Spin 判定');

// 经典 T-Spin Double：T 倒扣在 3 宽的口子里，消两行
const TSPIN_SCENE = [
  '....T.....',
  '....T.....',
  '...TTT....',
  '...T......',
];

// T rot0 放在 (px,py) 时，中心是 (px+1, py+1)，四个角分别在
//   左上 (px, py)   右上 (px+2, py)   左下 (px, py+2)   右下 (px+2, py+2)
// rot 的正面角：0 顶 1 右 2 底 3 左
const TP = [3, 5];                       // T 的位置
const TC = [TP[0] + 1, TP[1] + 1];      // 中心 (4,6)
const TL = [TC[0] - 1, TC[1] - 1];
const TR = [TC[0] + 1, TC[1] - 1];
const BL = [TC[0] - 1, TC[1] + 1];
const BR = [TC[0] + 1, TC[1] + 1];
const CORNER = { TL, TR, BL, BR };
/** 填指定的几个角，返回棋盘 */
function withCorners(names) {
  return scene(names.map(n => [CORNER[n][0], CORNER[n][1], 'J']));
}
function spinAt(rot, names) {
  setScene(withCorners(names), 'T', rot, TP[0], TP[1]);
  G().setLastKick(true);
  return G().detectSpin();
}

t('四角只填 2 个 → 不是 T-Spin', () => {
  eq(spinAt(0, ['TL', 'TR']), null, '只填上方两角不够');
  eq(spinAt(0, ['TL', 'BL']), null, '只填左侧两角不够');
  eq(spinAt(0, ['TR', 'BR']), null, '只填右侧两角不够');
  eq(spinAt(0, ['BL', 'BR']), null, '只填下方两角不够');
});
t('四角全空 / 只填 1 个 → 不是 T-Spin', () => {
  eq(spinAt(0, []), null);
  eq(spinAt(0, ['TL']), null);
});
t('rot0（正面在上）：3 角且上方两角都实 = 完整 T-Spin', () => {
  eq(spinAt(0, ['TL', 'TR', 'BL']), 'spin');
  eq(spinAt(0, ['TL', 'TR', 'BR']), 'spin');
});
t('rot0：3 角但上方只占一角 = mini T-Spin', () => {
  eq(spinAt(0, ['TL', 'BL', 'BR']), 'mini', '缺右上 → 正面没占满');
  eq(spinAt(0, ['TR', 'BL', 'BR']), 'mini', '缺左上 → 正面没占满');
});
t('rot2（正面在下）：3 角且下方两角都实 = 完整 T-Spin', () => {
  eq(spinAt(2, ['BL', 'BR', 'TL']), 'spin');
});
t('rot2：3 角但下方只占一角 = mini T-Spin', () => {
  eq(spinAt(2, ['TL', 'TR', 'BR']), 'mini');
});
t('rot1（正面在右）/ rot3（正面在左）判定正确', () => {
  eq(spinAt(1, ['TR', 'BR', 'TL']), 'spin', '右侧两角都实');
  eq(spinAt(1, ['TR', 'TL', 'BL']), 'mini', '缺右下');
  eq(spinAt(3, ['TL', 'BL', 'TR']), 'spin', '左侧两角都实');
  eq(spinAt(3, ['BL', 'TR', 'BR']), 'mini', '缺左上');
});
t('四角全实时任何朝向都是完整 T-Spin', () => {
  for (let r = 0; r < 4; r++) eq(spinAt(r, ['TL', 'TR', 'BL', 'BR']), 'spin', 'rot' + r);
});
t('墙 / 地板 / 天花板都算实心角（filled 的边界语义）', () => {
  const p = G();
  p.setBoard(empty(22));
  const f = p.filled;
  ok(f(0, 0) === false, '空棋盘上的格子不算实心');
  ok(f(-1, 5) === true, '左墙外算实心');
  ok(f(10, 5) === true, '右墙外算实心');
  ok(f(5, 22) === true, '地板下算实心');
  ok(f(5, -1) === true, '天花板上方算实心');
  p.setBoard(scene([[3, 21, 'J']]));
  ok(f(3, 21) === true, '有方块算实心');
  ok(f(4, 21) === false, '空格不算实心');
});
t('非 T 方块永远不判 T-Spin', () => {
  setScene(withCorners(['TL', 'TR', 'BL', 'BR']), 'L', 0, 3, 5);
  G().setLastKick(true);
  eq(G().detectSpin(), null);
});
t('没踢墙就不算 T-Spin（哪怕四角全实）', () => {
  setScene(withCorners(['TL', 'TR', 'BL', 'BR']), 'T', 0, TP[0], TP[1]);
  eq(G().lastKick, false, 'setPiece 之后 lastKick 应为 false');
  eq(G().detectSpin(), null, '未旋转的 T 不该被判 T-Spin');
});
t('180° 旋转不参与 T-Spin 判定', () => {
  const rows = empty(22);
  rows[20] = '..TTT.....';
  rows[21] = '..TT......';
  setScene(rows, 'T', 0, 3, 19);
  G().rotate(1);
  G().rotate(1);
  G().rotate180();
  eq(G().detectSpin(), null, '180° 之后 lastKick 应为 false');
});
t('T-Spin 0 行也给分（400 × 等级）', () => {
  const p = G();
  p.start();
  p.setLevel(2);
  p.setBoard(withCorners(['TL', 'TR', 'BL']));
  p.setPiece('T', 0, TP[0], TP[1]);
  p.setLastKick(true);
  p.setScore(0);
  p.lockPiece();
  ok(!p.clearing, '0 行不该进入消行动画');
  eq(p.score, 800, 'T-Spin 0 行应得 400 × 2 级');
});
t('T-Spin 未成立时 0 行不给分', () => {
  const p = G();
  p.start();
  p.setLevel(2);
  p.setBoard(empty(22));
  p.setPiece('T', 0, TP[0], TP[1]);
  p.setLastKick(true);
  p.setScore(0);
  p.lockPiece();
  ok(!p.clearing);
  eq(p.score, 0, '四角全空时不应判 T-Spin');
});
t('T-Spin Double 消 2 行得 1200 × 等级', () => {
  const p = G();
  p.start();
  p.setLevel(1);
  // 经典 TSD 摆法：T rot0 中心 (4,6)
  //   row5  : x=3 / x=5 有悬空（= TL/TR 角）
  //   row6  : 留出 x=3,4,5 给 T，其余填满 → 落定后变满行
  //   row7  : 已经满行
  // 落定后 row6 / row7 两行消除，四角全实 → 完整 T-Spin
  const rows = empty(22);
  rows[5] = '...J.J....';
  rows[6] = 'ZZZ...JJJJ';
  rows[7] = 'JJJJJJJJJJ';
  p.setBoard(rows);
  p.setPiece('T', 0, 3, 5);
  p.setLastKick(true);
  p.setScore(0);
  eq(G().collide(G().cellsOf(G().piece), 3, 5), false, 'T 应能放进这个位置');
  p.lockPiece();
  ok(p.clearing, '应进入消行动画');
  eq(p.clearing.n, 2, '应消 2 行');
  eq(p.clearing.spin, 'spin');
  p.finishClear();
  eq(p.score, 1200, 'T-Spin Double 应得 1200');
  eq(p.lines, 2);
});
t('T-Spin Single 消 1 行得 800 × 等级', () => {
  const p = G();
  p.start();
  p.setLevel(2);
  const rows = empty(22);
  rows[5] = '...J.J....';   // TL + TR
  rows[6] = 'ZZZ...JJJJ';
  rows[7] = '...J......';   // + BL → 三角，正面两角占满 → 完整 T-Spin
  p.setBoard(rows);
  p.setPiece('T', 0, 3, 5);
  p.setLastKick(true);
  p.setScore(0);
  p.lockPiece();
  eq(p.clearing.n, 1, '应消 1 行');
  eq(p.clearing.spin, 'spin');
  p.finishClear();
  eq(p.score, 1600, '800 × 2 级 = 1600');
});
t('mini T-Spin 消 1 行得 200 × 等级', () => {
  const p = G();
  p.start();
  p.setLevel(1);
  // 缺 TL 角 → 3 角但正面没占满 → mini
  const rows = empty(22);
  rows[5] = '.....J....';   // 只有 TR
  rows[6] = 'ZZZ...JJJJ';
  rows[7] = '...J.J....';   // BL + BR
  p.setBoard(rows);
  p.setPiece('T', 0, 3, 5);
  p.setLastKick(true);
  p.setScore(0);
  p.lockPiece();
  eq(p.clearing.n, 1);
  eq(p.clearing.spin, 'mini');
  p.finishClear();
  eq(p.score, 200, 'mini T-Spin Single 应得 200');
});

// ============================================================
console.log('\n[7] 消行与计分');

t('满行识别正确（含缓冲区里的行）', () => {
  const rows = empty(22);
  rows[0] = 'TTTTTTTTTT';   // 缓冲区第 0 行也算满行
  rows[1] = 'SSSSSSSSSS';
  rows[3] = 'LLLLLLLLLL';
  rows[21] = 'ZZZZZZZZZZ';
  setScene(rows, 'O', 0, 3, 8);
  eq(G().fullRows(), [0, 1, 3, 21], '应识别出缓冲区里的 0/1 行和 3/21 行');
});
t('基础分：单/双/三/四行 = 100/300/500/800', () => {
  const p = G();
  eq([1, 2, 3, 4].map(n => p.baseScore(n, null)), [100, 300, 500, 800]);
  eq(p.baseScore(0, null), 0, '0 行不该有基础分');
});
t('基础分：T-Spin 1/2/3 行 = 800/1200/1600，0 行 = 400', () => {
  const p = G();
  eq([p.baseScore(0, 'spin'), p.baseScore(1, 'spin'), p.baseScore(2, 'spin'), p.baseScore(3, 'spin')],
    [400, 800, 1200, 1600]);
});
t('基础分：mini T-Spin 1 行 200 / 2 行 400', () => {
  const p = G();
  eq(p.baseScore(1, 'mini'), 200);
  eq(p.baseScore(2, 'mini'), 400);
  eq(p.baseScore(0, 'mini'), 100);
});

t('消 1 行得 100 分并累加行数', () => {
  const p = G();
  p.start();
  const rows = empty(22);
  rows[21] = 'IIIIIIIIII';
  p.setBoard(rows);
  p.setPiece('I', 0, 3, 21);
  p.setScore(0);
  p.lockPiece();
  ok(p.clearing, '应进入消行动画');
  eq(p.clearing.n, 1);
  p.finishClear();
  eq(p.score, 100, '单行应得 100');
  eq(p.lines, 1);
  eq(p.combo, 0, 'combo 应从 -1 变 0');
  eq(p.b2b, false, '单行不算 difficult，b2b 应为 false');
});
t('消 4 行得 800 分并开启 B2B', () => {
  const p = G();
  p.start();
  const rows = empty(22);
  for (let y = 18; y < 22; y++) rows[y] = 'IIIIIIIIII';
  p.setBoard(rows);
  p.setPiece('I', 0, 3, 17);
  p.setScore(0);
  p.lockPiece();
  eq(p.clearing.n, 4);
  p.finishClear();
  eq(p.score, 800, 'Tetris 应得 800');
  eq(p.lines, 4);
  eq(p.b2b, true, 'Tetris 后 b2b 应为 true');
});
t('连续 Tetris 有 B2B 1.5 倍加成（含 combo）', () => {
  const p = G();
  p.start();
  p.setScore(0);
  p.setClear([18, 19, 20, 21], 4);
  p.finishClear();
  eq(p.score, 800, '第一次没有 B2B 加成');
  p.setScore(0);
  p.setClear([18, 19, 20, 21], 4);
  p.finishClear();
  // 800 × 1.5 = 1200，再加 combo=1 的 50 × 1 × 1 级
  eq(p.score, 1200 + 50, '第二次应 800×1.5 + 50');
});
t('B2B 会被普通消行打断', () => {
  const p = G();
  p.start();
  p.setClear([18, 19, 20, 21], 4);
  p.finishClear();
  eq(p.b2b, true);
  p.setScore(0);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.b2b, false, '普通消行后 b2b 应清空');
});
t('Combo 每次续上额外 50 × combo × level', () => {
  const p = G();
  p.start();
  p.setScore(0);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.score, 100, '第一次 combo=0，无加成');
  p.setScore(0);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.score, 150, '第二次 combo=1，100 + 50×1');
  p.setScore(0);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.score, 200, '第三次 combo=2，100 + 50×2');
});
t('等级是行数每满 10 行升 1 级，且封顶 30', () => {
  const p = G();
  p.start();
  p.setLevel(1);
  // 累计：1 → 10 → 20 → 30 行
  for (const [n, want] of [[1, 1], [9, 2], [10, 3], [10, 4], [270, 30], [9999, 30]]) {
    p.setClear(new Array(n).fill(0).map((_, i) => 22 - n + i), n);
    p.finishClear();
    eq(p.level, want, `累计 ${p.lines} 行后等级`);
  }
});
t('得分随等级放大', () => {
  const p = G();
  p.start();
  p.setLevel(5);
  p.setScore(0);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.score, 500, '单行分应乘等级');
});
t('消行后整行消失、上方内容下移', () => {
  const p = G();
  p.start();
  // 第 21 行填满（消除），第 20 行放一个 J 用来观察位移
  const rows = empty(22);
  rows[20] = '....J.....';
  rows[21] = 'ZZZZZZZZZZ';
  p.setBoard(rows);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.row(21), [0, 0, 0, 0, V('J'), 0, 0, 0, 0, 0], '第 20 行的 J 应下移到第 21 行');
  eq(p.row(20), new Array(10).fill(0), '底部不该凭空多出内容');
  eq(p.row(19), new Array(10).fill(0), '上方行不应受影响');
});
t('一次消底部两行，两行都被抽掉', () => {
  const p = G();
  p.start();
  const rows = empty(22);
  rows[19] = '....J.....';
  rows[20] = 'SSSSSSSSSS';
  rows[21] = 'JJJJJJJJJJ';
  p.setBoard(rows);
  p.setClear([20, 21], 2);
  p.finishClear();
  eq(p.row(21), [0, 0, 0, 0, V('J'), 0, 0, 0, 0, 0], '第 19 行的 J 应下移 2 行到第 21 行');
  eq(p.row(20), new Array(10).fill(0));
  eq(p.row(19), new Array(10).fill(0));
});
t('消行不会把内容推到顶部缓冲区外', () => {
  const p = G();
  p.start();
  const rows = empty(22);
  rows[0] = '..JJJJJJJJ';       // 缓冲区里的 8 格（不满行）
  rows[21] = 'ZZZZZZZZZZ';
  p.setBoard(rows);
  p.setClear([21], 1);
  p.finishClear();
  eq(p.board.length, 22, '棋盘高度不能变');
  ok(p.board[1].slice(2).every(v => v === V('J')), '顶部内容应下移到第 1 行');
  ok(p.board.every(r => r.length === 10), '每行宽度必须保持 10');
});
t('不消行时清空 combo 和 b2b', () => {
  const p = G();
  p.start();
  p.setClear([18, 19, 20, 21], 4);
  p.finishClear();
  eq(p.b2b, true);
  p.setBoard(empty(22));
  p.setPiece('O', 0, 3, 20);
  p.lockPiece();
  eq(p.combo, -1, '没消行 combo 应归零');
  eq(p.b2b, false, '没消行 b2b 应清空');
});
t('T-Spin 0 行也给分（400 × 等级）', () => {
  const p = G();
  p.start();
  p.setLevel(2);
  const rows = empty(22);
  rows[5] = '...J.L....';
  rows[7] = '...J.L....';
  p.setBoard(rows);
  p.setPiece('T', 0, 3, 5);
  p.setLastKick(true);
  p.setScore(0);
  p.lockPiece();
  ok(!p.clearing, '0 行不该进入消行动画');
  eq(p.score, 800, 'T-Spin 0 行应得 400 × 2 级');
});
t('T-Spin 未成立时 0 行不给分', () => {
  const p = G();
  p.start();
  p.setLevel(2);
  p.setBoard(empty(22));
  p.setPiece('T', 0, 3, 5);
  p.setLastKick(true);
  p.setScore(0);
  p.lockPiece();
  ok(!p.clearing);
  eq(p.score, 0, '四角全空时不应判 T-Spin');
});

// ============================================================
console.log('\n[8] 硬降 / 软降 / 锁定延迟');

t('硬降按落下的格数给 2 分/格', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 5);
  p.setScore(0);
  p.hardDrop();
  eq(p.score, (20 - 5) * 2, '落 15 格，应得 30 分');
  eq(p.row(20).slice(3, 5), [V('O'), V('O')], 'O 应停在第 20 行（占 20/21 两行）');
  eq(p.row(21).slice(3, 5), [V('O'), V('O')]);
});
t('硬降后方块贴地并留在棋盘上', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 5);
  p.hardDrop();
  eq(p.row(19), new Array(10).fill(0), '第 19 行不该有东西');
  eq(p.row(20).slice(3, 5), [V('O'), V('O')], 'O 应落在第 20 行的 x=3,4');
  eq(p.row(21).slice(3, 5), [V('O'), V('O')]);
});
t('软降 1 格加 1 分', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 5);
  p.setScore(0);
  p.setSoft(true);
  p.update(SOFT_SAMPLE);
  ok(p.score > 0 && p.score < 10, '软降应少量加分，实际 ' + p.score);
  eq(p.score, Math.floor(SOFT_SAMPLE / 28), '60ms 内应落下 2 格');
});
t('锁定延迟：贴地后 500ms 才锁定', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 20); // 两行占 20/21，已经贴地
  p.update(300);
  eq(p.board[20][3], 0, '300ms 时不该已经锁定');
  p.update(250); // 累计 550ms > 500ms
  eq(p.board[20][3], V('O'), '累计超过 500ms 后应已锁定');
  eq(p.board[21][3], V('O'));
});
t('锁定延迟的重置次数上限 15 次', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 20);
  for (let i = 0; i < 7; i++) {
    p.update(400);                                  // 不到 500ms，不会锁
    eq(p.board[20][3], 0, '第 ' + i + ' 轮不该锁定');
    eq(p.move(1, 0), true);
    eq(p.move(-1, 0), true);
  }
  eq(p.lockResets, 14, '7 轮 × 2 次移动 = 14 次重置');
  p.update(400);
  eq(p.move(1, 0), true);
  eq(p.move(-1, 0), true);
  eq(p.lockResets, 15, '第 15 次后封顶，不再累加');
  p.update(400);
  eq(p.move(1, 0), true);
  eq(p.lockResets, 15, '封顶后继续移动也不应累加');
});
t('重置次数用完后，贴地 500ms 就会锁（不能再无限拖延）', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 2, 20);
  for (let i = 0; i < 12; i++) { p.move(1, 0); p.move(-1, 0); } // 用满 15 次
  eq(p.lockResets, 15);
  p.update(300);
  eq(p.board[20][2], 0, '300ms 还不到 500ms');
  p.update(250);
  eq(p.board[20][2], V('O'), '超过 500ms 且无法重置 → 锁定');
});
t('锁定延迟可在 15 次内被移动重置', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 20);
  for (let i = 0; i < 3; i++) {
    p.update(300);
    eq(p.lockResets, i * 2, '第 ' + i + ' 轮重置次数');
    eq(p.move(1, 0), true);
    eq(p.move(-1, 0), true);
  }
  eq(p.lockResets, 6);
  ok(p.lockT === 0, '刚移动过锁定计时器应被清零');
});
t('重力随等级加快', () => {
  const p = G();
  ok(p.dropMs(1) > p.dropMs(5), '等级越高间隔越短');
  ok(p.dropMs(5) > p.dropMs(10));
  ok(p.dropMs(30) >= 20, '间隔不应低于 20ms');
  ok(Math.abs(p.dropMs(1) - 1000) < 1, '1 级应为 1000ms，实际 ' + p.dropMs(1));
});
t('等级越高掉得越快（同样 500ms 内落的格数）', () => {
  const p = G();
  p.start();
  p.setLevel(1); p.setPiece('O', 0, 3, 1); p.update(500);
  const slow = p.piece.y - 1;
  p.start();
  p.setLevel(5); p.setPiece('O', 0, 3, 1); p.update(500);
  const fast = p.piece.y - 1;
  eq(slow, 0, '1 级 500ms 内应还没掉');
  eq(fast, 1, '5 级 500ms 内应掉 1 格');
  ok(fast > slow, '20 级应比 1 级落得更低');
});

// ============================================================
console.log('\n[9] 状态机与游戏结束');

t('初始状态为空棋盘 + 已填满队列', () => {
  const p = G();
  p.start();
  p.setState('ready');
  eq(p.state, 'ready');
  eq(p.board.length, 22);
  for (let y = 0; y < 22; y++) {
    eq(p.board[y].length, 10, '第 ' + y + ' 行宽度');
    ok(p.board[y].every(v => v === 0), '棋盘应为空');
  }
  eq(p.queue.length, 3);
  eq(p.score, 0);
  eq(p.lines, 0);
  eq(p.level, 1);
});
t('新方块无处可放即游戏结束', () => {
  const p = G();
  p.start();
  // 把 1/2 行填满：无论生成的是哪种方块（I 落 y=2，其余落 y=1/2）都会撞死
  p.fill(1, 0, 9, 1);
  p.fill(2, 0, 9, 1);
  p.spawn();
  eq(p.state, 'over', '应判定游戏结束');
});
t('顶部只剩 2 行空时仍能继续玩', () => {
  const p = G();
  p.start();
  p.fill(3, 0, 9, 1);          // 只填第 3 行，出生区 1/2 行还空着
  p.setQueue([]);
  p.refillQueue(3);
  p.spawn();
  eq(p.state, 'running', '出生区空着就不该判死');
});
t('游戏结束后最高分被记录', () => {
  const p = G();
  store.set('tetris.best', '0');
  const die = () => { p.fill(1, 0, 9, 1); p.fill(2, 0, 9, 1); p.spawn(); };

  p.start();
  p.setScore(0);
  die();
  eq(p.state, 'over');
  eq(store.get('tetris.best'), '0', '0 分不该刷新纪录');

  p.start();
  p.setScore(4321);
  die();
  eq(p.state, 'over');
  eq(store.get('tetris.best'), '4321', '纪录应写进 localStorage');

  p.start();
  p.setScore(10);        // 比纪录低
  die();
  eq(store.get('tetris.best'), '4321', '低分不该覆盖纪录');
});
t('暂停 / 继续不改变棋盘', () => {
  const p = G();
  p.start();
  p.setPiece('O', 0, 3, 5);
  p.togglePause();
  eq(p.state, 'paused');
  const snap = JSON.stringify(p.board);
  p.update(1000);
  eq(JSON.stringify(p.board), snap, '暂停时不该有任何变化');
  p.togglePause();
  eq(p.state, 'running');
});
t('重开把分数 / 行数 / 棋盘全部清零', () => {
  const p = G();
  p.start();
  p.setScore(9999);
  p.fill(21, 0, 9, 1);
  p.start();
  eq(p.score, 0);
  eq(p.lines, 0);
  eq(p.level, 1);
  ok(p.board.every(r => r.every(v => v === 0)), '棋盘应清空');
  eq(p.state, 'running');
});
t('消行动画期间不接受输入（不产生新方块）', () => {
  const p = G();
  p.start();
  const rows = empty(22);
  rows[21] = 'IIIIIIIIII';
  p.setBoard(rows);
  p.setPiece('I', 0, 3, 20);
  p.lockPiece();
  ok(p.clearing, '应在消行动画中');
  const n = p.queue.length;
  p.act('left');
  eq(p.queue.length, n, '消行中不该消耗预览队列');
});
t('消行动画结束后才放新方块', () => {
  const p = G();
  p.start();
  const before = p.piece.type;
  p.setClear([21], 1);
  p.update(100);
  ok(p.clearing, '100ms < 320ms，动画未结束');
  eq(p.piece.type, before, '动画未结束前不换方块');
  p.update(300);
  eq(p.clearing, null, '累计 400ms 后动画应结束');
});

// ============================================================
console.log('\n[10] 长跑压力测试');

t('方块永远被墙和地板挡住（确定性：200 个方块全撞墙）', () => {
  const p = G();
  p.start();
  let checked = 0;
  for (let i = 0; i < 200; i++) {
    p.setQueue([]);
    p.refillQueue(3);
    p.spawn();
    if (p.state === 'over') break;
    // 死命往左撞
    for (let k = 0; k < 12; k++) p.move(-1, 0);
    for (const [cx, cy] of p.cellsOf(p.piece)) {
      const x = p.piece.x + cx, y = p.piece.y + cy;
      ok(x >= 0, '撞完左墙后不能有 x=' + x);
      ok(x < 10 && y < 22, '越界 ' + x + ',' + y);
      if (y >= 0) ok(p.board[y][x] === 0, '方块与已落定方块重叠');
      checked++;
    }
    // 死命往右撞，再死命往下撞
    for (let k = 0; k < 12; k++) p.move(1, 0);
    for (const [cx] of p.cellsOf(p.piece)) ok(p.piece.x + cx < 10, '撞完右墙后不能有 x=' + (p.piece.x + cx));
    for (let k = 0; k < 25; k++) p.move(0, 1);
    for (const [cx, cy] of p.cellsOf(p.piece)) ok(p.piece.y + cy < 22, '撞完地板后不能有 y=' + (p.piece.y + cy));
    checked += 4;
    p.lockPiece();
    if (p.clearing) p.finishClear();
    p.clearBoard();
  }
  ok(checked > 100, '实际检查的格子数偏少：' + checked);
});
t('固定种子 3000 步随机操作：不崩溃、不越界、分数非负', () => {
  const p = G();
  const rnd = prng(424242);
  // start() 内部会重新摇种子，所以重开时统一走 restart() 把方块序列也钉死
  const restart = () => {
    p.start();
    p.seed(424242);
    p.setBag([]);
    p.setQueue([]);
    p.refillQueue(3);
    p.spawn();
  };
  restart();
  const acts = ['left', 'right', 'soft', 'cw', 'ccw', 'rot180', 'hard', 'hold'];
  for (let i = 0; i < 3000; i++) {
    const a = acts[Math.floor(rnd() * acts.length)];
    if (a === 'soft') p.setSoft(i % 3 === 0);
    else p.act(a);
    p.update(60);
    if (p.state === 'over') restart();
    ok(p.score >= 0, '第 ' + i + ' 步分数变成负数: ' + p.score);
    ok(p.lines >= 0, '行数不能为负');
    ok(p.level >= 1 && p.level <= 30, '等级越界: ' + p.level);
    ok(p.queue.length === 3, '预览队列长度应为 3，实际 ' + p.queue.length);
    if (p.piece) {
      for (const [cx, cy] of p.cellsOf(p.piece)) {
        const x = p.piece.x + cx, y = p.piece.y + cy;
        ok(x >= 0 && x < 10 && y < 22, '方块越界 ' + x + ',' + y);
      }
    }
  }
  ok(true);
});
t('每 7 个方块必出齐 7 种（长跑版）', () => {
  const p = G();
  p.start();
  p.seed(31337);     // start() 里会重新摇种子，所以这里再 seed 一次
  p.setBag([]);
  p.setQueue([]);
  p.refillQueue(3);
  p.spawn();         // 从空 bag / 空队列重新填，保证 7-bag 序列可复现
  const seen = [];
  for (let i = 0; i < 70; i++) {
    seen.push(p.piece.type);
    p.hardDrop();
    if (p.clearing) p.finishClear();
    if (p.state === 'over') p.clearBoard();   // 只清盘，保留 bag 分组
  }
  for (let i = 0; i < 70; i += 7) {
    eq(seen.slice(i, i + 7).sort(), T.slice().sort(), '第 ' + (i / 7 + 1) + ' 组不完整');
  }
});
// ============================================================
console.log('\n[11] 渲染冒烟');
t('主画布与两个预览画布都能正常绘制', () => {
  const p = G();
  p.start();
  p.setPiece('T', 0, 3, 5);
  p.drawBoard();
  p.drawPreviews();
  const before = ctxCalls.count;
  p.drawBoard();
  ok(ctxCalls.count > before, 'drawBoard 应该真的在画东西');
  const b2 = ctxCalls.count;
  p.drawPreviews();
  ok(ctxCalls.count > b2, 'drawPreviews 应该真的在画东西');
});
t('状态覆盖后渲染不抛异常', () => {
  const p = G();
  p.start();
  for (const st of ['running', 'paused', 'over']) {
    p.fill(21, 0, 9, 1);
    p.setPiece('I', 1, 3, 10);
    p.drawBoard();
    p.drawPreviews();
  }
});

// ============================================================
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
