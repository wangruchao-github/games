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
    if (k === 'canvas') return undefined;
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => { ctxCalls.count++; return { addColorStop(){} }; };
    return (...a) => { ctxCalls.count++; return { addColorStop(){} }; };
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const el = () => ({
  textContent: '', value: '', checked: false, style: {}, dataset: {},
  classList: { _s: new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} },
  addEventListener(){}, getContext(){ return ctx2d }, width: 480, height: 480,
});
const nodes = {};
globalThis.document = {
  getElementById: id => (nodes[id] ||= el()),
  querySelectorAll: () => [],
  addEventListener(){},
};
globalThis.window = { addEventListener(){} };
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
let rafCalls = 0;
globalThis.requestAnimationFrame = () => { rafCalls++; return 1; };

// ---------- 探针注入到 IIFE 内部 ----------
const probe = `
;globalThis.__probe = () => ({ state, score, best, stepMs, snake, food, queue, dir,
    get stepCount() { return score; },
    setFood: (x, y) => { food = { x, y }; },
    setSnake: arr => { snake = arr; prev = snake.map(s => ({ ...s })); },
    setDir: (x, y) => { dir = { x, y }; queue = []; },
    setScore: n => { score = n; },
    step, start, turn, over, move, draw });
`;
const idx = jsRaw.lastIndexOf('})();');
if (idx < 0) throw new Error('IIFE tail not found');
new Function(jsRaw.slice(0, idx) + probe + jsRaw.slice(idx))();
const P = globalThis.__probe;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ok    ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); fail++; } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b))
  throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (v, m = '') => { if (!v) throw new Error(m || 'assert false'); };
const W = document.getElementById('wrap');
const head = () => ({ ...P().snake[0] });

console.log('\n[1] 初始状态');
t('ready / 蛇长 3 / 食物在 20x20 内 / 分数 0 / 初始速度 145ms', () => {
  const s = P();
  eq(s.state, 'ready');
  eq(s.snake.length, 3);
  ok(s.food.x >= 0 && s.food.x < 20 && s.food.y >= 0 && s.food.y < 20, 'food out of board');
  eq(s.score, 0);
  eq(s.stepMs, 145);
});

console.log('\n[2] 移动与转向');
t('向右走一格，第二节补位到原头位', () => {
  P().start();
  const h = head(); P().step();
  eq(head(), { x: h.x + 1, y: h.y });
  eq(P().snake[1].x, h.x);
});
t('禁止 180° 掉头（右→上→左，末尾的「下」被丢弃）', () => {
  P().start();
  P().turn(0, -1); P().turn(-1, 0); P().turn(0, 1);
  eq(P().queue.map(d => `${d.x},${d.y}`), ['0,-1', '-1,0']);
  P().step(); eq([P().dir.x, P().dir.y], [0, -1]);
  P().step(); eq([P().dir.x, P().dir.y], [-1, 0]);
});
t('同向重复输入不入队', () => { P().start(); P().turn(1, 0); P().turn(1, 0); eq(P().queue.length, 0); });
t('方向队列最多缓冲 2 个', () => {
  P().start(); P().turn(0, -1); P().turn(-1, 0); P().turn(0, 1);
  ok(P().queue.length <= 2, 'len=' + P().queue.length);
});

console.log('\n[3] 吃食物：计分 / 加长 / 提速 / 最高分');
t('吃食物 +1 分、加长一节、提速、最高分同步', () => {
  P().start();
  const h = head(), before = P().stepMs;
  P().setFood(h.x + 1, h.y); P().step();
  eq(P().score, 1);
  eq(P().snake.length, 4);
  ok(P().stepMs < before, '应提速');
  eq(P().best, 1);
});
t('最高分持久化到 localStorage', () => ok(store.get('snake.best') === '1', 'got ' + store.get('snake.best')));
t('不吃食物则不长不加分', () => {
  P().start();
  const n = P().snake.length, s = P().score;
  P().setFood(0, 19); P().step();
  eq(P().snake.length, n); eq(P().score, s);
});
t('线性提速：得分 11 → 145-11*3 = 112ms', () => {
  P().start(); P().setScore(10);
  const h = head(); P().setFood(h.x + 1, h.y); P().step();
  eq(P().score, 11);
  eq(P().stepMs, 112);
});
t('速度封顶 MIN_STEP=65（高分不越界）', () => {
  P().start(); P().setScore(40);
  const h = head(); P().setFood(h.x + 1, h.y); P().step();
  eq(P().score, 41);
  eq(P().stepMs, 65);
});
t('连续吃 17 个（环面直线极限）每步不变量成立', () => {
  W.checked = true; P().start(); P().setDir(1, 0);
  for (let i = 0; i < 17; i++) {
    const h = head(); P().setFood((h.x + 1) % 20, h.y);
    P().step();
    eq(P().stepMs, Math.max(65, 145 - P().score * 3), 'step ' + i);
  }
  eq(P().snake.length, 20, '环面填满一整行');
  W.checked = false;
});

console.log('\n[4] 碰撞');
t('撞右/左/上/下墙 → game over', () => {
  for (const [snake, dir] of [
    [[{x:19,y:5},{x:18,y:5},{x:17,y:5}], [1,0]],
    [[{x:0,y:5},{x:1,y:5},{x:2,y:5}], [-1,0]],
    [[{x:5,y:0},{x:5,y:1},{x:5,y:2}], [0,-1]],
    [[{x:5,y:19},{x:5,y:18},{x:5,y:17}], [0,1]],
  ]) {
    P().start(); P().setSnake(snake); P().setDir(...dir); P().step();
    eq(P().state, 'over', JSON.stringify(dir));
  }
});
t('撞自己身体 → game over', () => {
  P().start();
  P().setSnake([{x:5,y:5},{x:5,y:4},{x:6,y:4},{x:6,y:5},{x:6,y:6},{x:5,y:6}]);
  P().setDir(1, 0); P().step();
  P().setDir(0, 1); P().step();
  P().setDir(-1, 0); P().step();
  eq(P().state, 'over');
});
t('贴着自己的最后一节前进不算自杀', () => {
  // 3 节蛇 2x2 绕圈：头走到尾巴腾出的空格是合法路径
  P().start();
  P().setSnake([{x:5,y:5},{x:5,y:4},{x:6,y:4}]);
  P().setDir(1, 0); P().step();
  eq(P().state, 'running');
  eq(head(), { x: 6, y: 5 });
});

console.log('\n[5] 穿墙模式');
t('穿墙：左出右进', () => {
  W.checked = true;
  P().start();
  P().setSnake([{x:0,y:5},{x:1,y:5},{x:2,y:5}]);
  P().setDir(0, -1); P().step();
  P().setDir(-1, 0); P().step();
  eq(head(), { x: 19, y: 4 });
  eq(P().state, 'running');
  W.checked = false;
});
t('穿墙：上出下进', () => {
  W.checked = true;
  P().start();
  P().setSnake([{x:5,y:0},{x:4,y:0},{x:3,y:0}]);
  P().setDir(0, -1); P().step();
  eq(head(), { x: 5, y: 19 });
  eq(P().state, 'running');
  W.checked = false;
});
t('穿墙下撞自己的身体仍然 game over', () => {
  W.checked = true;
  P().start();
  P().setSnake([{x:0,y:5},{x:19,y:5},{x:19,y:6}]);
  P().setDir(-1, 0); P().step();
  eq(P().state, 'over', '绕回来的落点撞到身体');
  W.checked = false;
});
t('关闭穿墙后边界仍然致死', () => {
  P().start();
  P().setSnake([{x:0,y:5},{x:1,y:5},{x:2,y:5}]);
  P().setDir(-1, 0); P().step();
  eq(P().state, 'over');
});

console.log('\n[6] 食物生成');
t('300 步随机对局：食物从不生成在蛇身上', () => {
  P().start();
  for (let i = 0; i < 300; i++) {
    P().step();
    const f = P().food, s = P().snake;
    ok(!s.some(p => p.x === f.x && p.y === f.y), 'food on snake @step' + i);
    ok(f.x >= 0 && f.x < 20 && f.y >= 0 && f.y < 20, 'out of board @step' + i);
    if (P().state === 'over') P().start();
  }
});

console.log('\n[7] 状态机 & 渲染');
t('start 重置分数 / 蛇长 / 速度', () => {
  P().start(); const h = head(); P().setFood(h.x + 1, h.y); P().step();
  P().start();
  eq(P().score, 0); eq(P().snake.length, 3); eq(P().stepMs, 145);
});
t('game over 后按方向键自动重开', () => {
  P().start(); P().setSnake([{x:19,y:5},{x:18,y:5},{x:17,y:5}]);
  P().setDir(1, 0); P().step(); eq(P().state, 'over');
  P().move('up');
  eq(P().state, 'running'); eq(P().score, 0);
});
t('requestAnimationFrame 循环已启动', () => ok(rafCalls > 0, 'raf not called'));
t('渲染 draw() 不抛异常（含蛇头眼睛 / 渐变 / 插值 t=0~1）', () => {
  P().start();
  const before = ctxCalls.count;
  P().draw(0); P().draw(0.5); P().draw(1);
  ok(ctxCalls.count > before, '渲染应真的调用了 canvas 指令');
  P().step(); P().draw(0.5);
  ok(ctxCalls.count > before, '移动后渲染应仍可用');
});
t('渲染在短蛇/长蛇/边缘蛇下都安全', () => {
  for (const arr of [
    [{x:0,y:0}],
    [{x:19,y:19},{x:18,y:19},{x:17,y:19}],
    Array.from({ length: 30 }, (_, i) => ({ x: i % 20, y: (i * 7) % 20 })),
  ]) { P().start(); P().setSnake(arr); P().draw(0.5); }
  ok(true);
});

console.log(`\n结果: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
