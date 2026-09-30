import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const jsRaw = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ---------- 最小 DOM stub ----------
const store = new Map();
const ctxCalls = { n: 0 };
const ctx2d = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return undefined;
    if (k === 'measureText') return () => ({ width: 10 });
    return (...a) => { ctxCalls.n++; return { addColorStop() {} }; };
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const el = () => ({
  textContent: '', value: '', checked: false, style: {}, dataset: {},
  classList: { _s: new Set(), add(c) { this._s.add(c) }, remove(c) { this._s.delete(c) }, contains(c) { return this._s.has(c) } },
  addEventListener() {}, getContext() { return ctx2d }, width: 520, height: 520,
});
const nodes = {};
globalThis.document = {
  getElementById: id => (nodes[id] ||= el()),
  createElement: () => el(),
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
let rafCalls = 0;
globalThis.requestAnimationFrame = () => { rafCalls++; return 1; };

// ---------- 探针注入到 IIFE 内部 ----------
const probe = `
;globalThis.__probe = () => ({
    get state() { return state; }, get grid() { return grid; },
    get player() { return player; }, get enemies() { return enemies; },
    get bullets() { return bullets; }, get drops() { return drops; },
    get fx() { return fx; }, get level() { return level; }, get lives() { return lives; },
    get score() { return score; }, get best() { return best; }, get baseAlive() { return baseAlive; },
    get spawnQueue() { return spawnQueue; }, get frame() { return frame; },
    get freezeTimer() { return freezeTimer; }, get shieldTimer() { return shieldTimer; },
    get shovelTimer() { return shovelTimer; },
    get enemiesLeft() { return enemies.length + spawnQueue.length; },
    EMPTY, BRICK, STEEL, WATER, TREE, ICE, BASE, BROKEN, T, TANK, COLS, ROWS, MAX_ENEMY,
    LEVELS, KINDS, DROPS, BASE_TX, BASE_TY, SPAWN_TX,
    tileAt, setTile, blocked, moveTank, canMove, fire, tick, loadLevel, startGame,
    nextLevel, endGame, chip, hitTile, killPlayer, killEnemy, setBaseArmor, spawnEnemy, makeTank,
    checkClear, updateEnemies, updateBullets, updateDrops, spawnPlayer, addFx, boom,
    render, syncHUD, paintBG, tick, DIRS, UP, DOWN, LEFT, RIGHT,
    setState: s => { state = s; },
    setPlayer: o => { Object.assign(player, o); },
    putEnemy: (o) => { const e = makeTank(o.kind, o.x, o.y, o.dir); Object.assign(e, o); e.w = TANK; e.h = TANK; enemies.push(e); return e; },
    clearEnemies: () => { enemies = []; spawnQueue = []; },
    clearSquad: () => { enemies = []; },
    clearField: () => { enemies = []; bullets = []; drops = []; fx = []; score = 0; },
    setQueue: n => { spawnQueue = Array.from({ length: n }, () => 'basic'); },
    hold: k => { keys.clear(); if (k) keys.add(k); },
    setGrid: rows => { grid = rows.map(r => Array.from(r, c => ({ '.': 0, B: 1, '#': 2, '~': 3, T: 4, I: 5, H: 6 }[c] ?? 0))); bgDirty = true; },
    pushBullet: b => bullets.push(b),
    setShield: n => { shieldTimer = n; }, setFreeze: n => { freezeTimer = n; },
    setLives: n => { lives = n; }, setScore: n => { score = n; },
    setPlayerLevel: n => { player.level = n; },
  });
`;
const idx = jsRaw.lastIndexOf('})();');
if (idx < 0) throw new Error('IIFE 尾部没找到');
new Function(jsRaw.slice(0, idx) + probe + jsRaw.slice(idx))();
// 探针返回的是活对象：getter 每次读的都是闭包里的实时值
const P = globalThis.__probe();

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ok    ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' -> ' + e.message); fail++; }
};
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`); };
const ok = (v, m = '') => { if (!v) throw new Error(m || '断言失败'); };
const near = (a, b, m = '') => { if (Math.abs(a - b) > 1e-6) throw new Error(`${m} 期望 ${b} 实际 ${a}`); };

// 空地图：构造干净局面用
// 队列里留 12 个敌人：既能阻止 checkClear 误判通关，又贴近真实对局
function openField() {
  P.setState('playing');
  P.setGrid(Array.from({ length: P.ROWS }, () => '.'.repeat(P.COLS)));
  P.clearField();
  P.setQueue(12);
  P.setFreeze(0);
  P.setShield(0);
  P.setLives(3);
  P.spawnPlayer();
  P.setPlayer({ x: 100, y: 100, dir: { x: 1, y: 0 }, flash: 0, onIce: false, cooldown: 0, alive: true, level: 0 });
}

console.log('\n[1] 关卡地图');
t('5 张关卡，每张 26 行 × 26 列', () => {
  eq(P.LEVELS.length, 5);
  for (const [i, lv] of P.LEVELS.entries())
    for (const [y, row] of lv.entries()) {
      ok(row.length === 26, `第 ${i + 1} 关第 ${y} 行宽度 ${row.length}`);
      ok(!/[^.#~TIBH]/.test(row), `非法字符: ${row}`);
    }
});
t('每张地图都有完整的老巢（2x2）与 8 块保护砖', () => {
  for (const [i, lv] of P.LEVELS.entries()) {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++)
      ok(lv[24 + y][12 + x] === 'H', `第 ${i + 1} 关老巢缺失 @${12 + x},${24 + y}`);
    for (const [x, y] of [[12, 22], [13, 22], [12, 23], [13, 23], [11, 24], [14, 24], [11, 25], [14, 25]])
      ok(lv[y][x] === 'B', `第 ${i + 1} 关保护砖缺失 @${x},${y}`);
  }
});
t('玩家出生点和 3 个敌军出生点所在格子都是空地', () => {
  for (const [i, lv] of P.LEVELS.entries()) {
    ok(lv[24][8] === '.', `第 ${i + 1} 关玩家点被占`);
    for (const tx of P.SPAWN_TX) ok(lv[0][tx] === '.', `第 ${i + 1} 关敌军点 @${tx} 被占`);
  }
});
t('loadLevel 解析字符 → 地形，老巢标记为 BASE', () => {
  P.loadLevel(1);
  eq(P.grid.length, 26);
  eq(P.grid[24][12], P.BASE);
  eq(P.grid[3][2], P.BRICK);
  eq(P.grid[16][10], P.STEEL);
  ok(P.baseAlive, '老巢应为存活');
  eq(P.level, 1);
  eq(P.enemiesLeft, 12, '第 1 关应有 12 个敌人');
});

console.log('\n[2] 地形碰撞');
t('砖墙/钢墙/水/老巢挡坦克，树和冰不挡', () => {
  openField(P);
  ok(P.blocked(0, 0, 16, 16) === false, '空地不该挡');
  P.setTile(3, 3, P.BRICK);
  ok(P.blocked(60, 60, 16, 16) === true, '砖墙应挡');
  ok(P.blocked(0, 0, 16, 16) === false, '远处不该挡');
  P.setTile(3, 3, P.WATER);
  ok(P.blocked(60, 60, 16, 16) === true, '水应挡坦克');
  P.setTile(3, 3, P.TREE);
  ok(P.blocked(60, 60, 16, 16) === false, '树不该挡');
  P.setTile(3, 3, P.ICE);
  ok(P.blocked(60, 60, 16, 16) === false, '冰不该挡');
  P.setTile(3, 3, P.BASE);
  ok(P.blocked(60, 60, 16, 16) === true, '老巢应挡');
});
t('地图边界天然封死（界外当钢墙）', () => {
  openField(P);
  ok(P.blocked(-2, 100, 16, 16) === true, '左侧界外应挡');
  ok(P.blocked(100, -2, 16, 16) === true, '上侧界外应挡');
  ok(P.blocked(100, 505, 16, 16) === true, '跨出下界应挡');
  ok(P.blocked(100, 504, 16, 16) === false, '贴下边 16px 仍算界内');
  // 坦克 16px 宽，贴到右边界时正好卡在 x=504，再往右 1px 就跨出第 26 列
  ok(P.blocked(504, 100, 16, 16) === false, '贴边 16px 仍算界内');
  ok(P.blocked(505, 100, 16, 16) === true, '跨出右界应挡');
  const p = P.player;
  p.x = 480; p.y = 100;
  while (P.moveTank(p, 1.5, 0)) { ok(p.x <= 505, '坦克穿出了右边界 x=' + p.x); }
  near(p.x, 504, '应正好停在右边界:');
});

console.log('\n[3] 坦克移动');
t('向右移动 1.5px，坐标连续变化', () => {
  openField(P);
  const p = P.player, x0 = p.x;
  ok(P.moveTank(p, 1.5, 0) === true);
  near(p.x, x0 + 1.5, 'x 没按速度推进:');
  near(p.y, 100, 'y 不该变:');
});
t('会滑到墙前停住，且报告 false', () => {
  openField(P);
  P.setTile(6, 5, P.STEEL);          // 坦克 16px 贴在 20px 格左上，先有 4px 富余
  const p = P.player;
  p.x = 100; p.y = 100;
  let steps = 0;
  while (P.moveTank(p, 1.5, 0) && steps < 20) steps++;
  ok(steps > 0, '到墙前应该能滑行');
  ok(steps < 20, '应该能滑到墙前');
  ok(p.x <= 120, '坦克不能钻进钢墙格子 x=' + p.x);
  const xStop = p.x;
  ok(P.moveTank(p, 1.5, 0) === false, '贴墙时应报告没移动');
  near(p.x, xStop, '贴墙后不该再推进:');
});
t('坦克 16px < 格子 20px，1 格宽走廊里能自由走（不吸附也不卡）', () => {
  openField(P);
  P.setGrid(Array.from({ length: 26 }, () => ' '.repeat(26).split('').map((c, x) => (x === 0 || x === 1 || x === 2) ? '.' : '#').join('')));
  const p = P.player;
  p.x = 20 + 3; p.y = 100;   // 故意不对齐格子
  ok(P.moveTank(p, 1.5, 0) === true, '走廊里应能走');
  ok(P.moveTank(p, 0, 1.5) === true, '走廊里应能转向');
  ok(p.x < 60, '不该穿墙: x=' + p.x);
});
t('对角移动两轴分别判定（斜向蹭墙也能走）', () => {
  openField(P);
  P.setTile(5, 5, P.BRICK);
  const p = P.player;
  p.x = 80; p.y = 100;
  P.moveTank(p, 1.5, 1.5);
  ok(p.x > 80 && p.y > 100 && p.y < 100 + P.T, '应贴着墙走');
});

console.log('\n[4] 子弹');
t('开火：子弹从炮口生成，方向=车头方向，冷却生效', () => {
  openField(P);
  P.setPlayer({ dir: { x: 1, y: 0 } });
  ok(P.fire(P.player) === true);
  eq(P.bullets.length, 1);
  const b = P.bullets[0];
  eq({ x: b.dx, y: b.dy }, { x: 1, y: 0 });
  ok(b.x > P.player.x + 8, '子弹应在炮口前方');
  near(b.x, P.player.x + 8 + P.TANK / 2 + 2 - 2, '炮口位置:');
  ok(P.fire(P.player) === false, '冷却期间不能再开火');
  P.player.cooldown = 0;
  ok(P.fire(P.player) === false, '场上还有一发，应受同屏上限限制');
  P.bullets.length = 0;
  ok(P.fire(P.player) === true, '冷却结束且无弹时可再开火');
});
t('默认同时最多 1 发子弹，2 星后 2 发', () => {
  openField(P);
  P.fire(P.player); P.player.cooldown = 0;
  ok(P.fire(P.player) === false, '0 星应只有 1 发');
  P.setPlayerLevel(2); P.player.cooldown = 0;
  ok(P.fire(P.player) === true, '2 星应有第 2 发');
  eq(P.bullets.length, 2);
  P.player.cooldown = 0;
  ok(P.fire(P.player) === false, '2 星最多 2 发');
});
t('子弹打掉砖墙，出界或撞墙后消失', () => {
  openField(P);
  P.setTile(8, 5, P.BRICK);
  const b = P.pushBullet({ x: 100, y: 102, w: 4, h: 4, dx: 1, dy: 0, speed: 4, owner: P.player.id, isPlayer: true, dead: false });
  P.updateBullets();
  eq(P.bullets.length, 1, '砖还在 1 格外，不该立刻命中');
  P.bullets[0].x = 156;               // 贴到第 8 格
  P.updateBullets();
  eq(P.grid[5][8], P.EMPTY, '砖墙应被击碎');
  eq(P.bullets.length, 0, '子弹应消失');
  P.bullets.length = 0;
  P.pushBullet({ x: 20, y: 106, w: 4, h: 4, dx: -1, dy: 0, speed: 4, owner: P.player.id, isPlayer: true, dead: false });
  for (let i = 0; i < 20; i++) P.updateBullets();
  eq(P.bullets.length, 0, '飞出边界应被回收');
});
t('钢墙默认打不动，3 星才能打穿', () => {
  openField(P);
  P.setTile(8, 5, P.STEEL);
  P.setPlayer({ dir: { x: 1, y: 0 } });
  P.player.cooldown = 0;
  P.fire(P.player);
  P.bullets[0].x = 158;
  P.updateBullets();
  eq(P.grid[5][8], P.STEEL, '0 星不该打穿钢墙');
  eq(P.bullets.length, 0, '子弹仍应被弹掉');

  P.setTile(9, 5, P.STEEL);
  P.setPlayerLevel(3);
  P.player.cooldown = 0;
  P.fire(P.player);
  P.bullets[0].x = 158;
  P.updateBullets();
  eq(P.grid[5][8], P.EMPTY, '3 星应能打穿钢墙');
});
t('2 星以上一次打掉 2x2 砖墙', () => {
  openField(P);
  for (const [x, y] of [[8, 5], [9, 5], [8, 6], [9, 6]]) P.setTile(x, y, P.BRICK);
  P.setPlayerLevel(2);
  P.hitTile(8, 5, true);
  for (const [x, y] of [[8, 5], [9, 5], [8, 6], [9, 6]])
    eq(P.grid[y][x], P.EMPTY, `@${x},${y} 未清除`);
});
t('敌弹不会打穿友军（友伤免疫）', () => {
  openField(P);
  // 把 A、B 两辆敌坦克并排堵在弹道上，只有前后方向能走
  for (const [x, y] of [[6, 4], [7, 4], [8, 4], [6, 6], [7, 6], [8, 6], [6, 5], [8, 5]])
    P.setTile(x, y, P.STEEL);
  const a = P.putEnemy({ kind: 'basic', x: 100, y: 108, dir: { x: 1, y: 0 }, flash: 0, shoot: 999, think: 999 });
  const b = P.putEnemy({ kind: 'basic', x: 140, y: 108, dir: { x: 1, y: 0 }, flash: 0, shoot: 999, think: 999 });
  a.cooldown = 0;
  P.fire(a);
  for (let i = 0; i < 12; i++) P.updateBullets();
  eq(P.enemies.length, 2, '友军不该被误伤');
  eq(b.hp, 1, 'B 不该掉血');
  eq(P.score, 0, '不该计分');
});
t('玩家子弹能打敌军；敌弹不会伤到玩家以外的己方', () => {
  openField(P);
  P.player.dir = { x: 1, y: 0 };
  P.putEnemy({ kind: 'basic', x: 150, y: 100, dir: { x: -1, y: 0 }, flash: 0 });
  P.fire(P.player);
  P.bullets[0].x = 144;
  P.updateBullets();
  eq(P.enemies.length, 0, '敌人应被击毁');
  eq(P.score, 100, '普通坦克 100 分');
});
t('敌弹打玩家 → 掉命，重生后无敌闪烁', () => {
  openField(P);
  P.setLives(3);
  P.player.flash = 0;
  P.pushBullet({ x: 104, y: 102, w: 4, h: 4, dx: 0, dy: 1, speed: 3, owner: 999, isPlayer: false, dead: false });
  P.updateBullets();
  eq(P.lives, 2, '应掉 1 条命');
  ok(!P.player.alive, '玩家应阵亡');
  eq(P.state, 'dead', '应进入死亡暂停');
  for (let i = 0; i < 60; i++) P.tick();
  ok(P.player.alive, '应自动重生');
  eq(P.state, 'playing', '应恢复游戏');
  ok(P.player.flash > 0, '重生后应有无敌帧');
});
t('护盾生效时子弹被吸收，不掉命', () => {
  openField(P);
  P.setLives(3);
  P.setShield(500);
  P.player.flash = 0;
  P.pushBullet({ x: 104, y: 102, w: 4, h: 4, dx: 0, dy: 1, speed: 3, owner: 999, isPlayer: false, dead: false });
  P.updateBullets();
  eq(P.lives, 3, '有护盾不该掉命');
  ok(P.player.alive, '玩家不该死');
  eq(P.bullets.length, 0, '子弹应被吸收');
});
t('双方子弹对撞互相抵消', () => {
  openField(P);
  P.player.dir = { x: 1, y: 0 };
  const e = P.putEnemy({ kind: 'basic', x: 200, y: 100, dir: { x: -1, y: 0 }, flash: 0 });
  e.cooldown = 0;
  P.fire(P.player);
  P.bullets[0].x = 160;
  P.pushBullet({ x: 170, y: P.bullets[0].y, w: 4, h: 4, dx: -1, dy: 0, speed: 3, owner: e.id, isPlayer: false, dead: false });
  P.updateBullets();
  eq(P.bullets.length, 0, '两发子弹应互相抵消');
  eq(P.enemies.length, 1, '不该有伤害');
});

console.log('\n[5] 敌军');
t('敌坦克可以穿过己方坦克（经典设定）', () => {
  openField(P);
  const e = P.putEnemy({ kind: 'basic', x: 116, y: 100, dir: { x: -1, y: 0 }, flash: 0 });
  ok(P.moveTank(e, -1.5, 0) === true, '坦克之间不应互相阻挡');
  ok(e.x < 116, '应能穿过');
});
t('重甲坦克挨 3 发才死，第 4 发才计分', () => {
  openField(P);
  const e = P.putEnemy({ kind: 'armor', x: 150, y: 100, dir: { x: 0, y: 0 }, flash: 0, hp: 4, maxHp: 4 });
  P.player.dir = { x: 1, y: 0 };
  for (let i = 1; i <= 3; i++) {
    P.player.cooldown = 0; P.fire(P.player);
    P.bullets[0].x = 146; P.updateBullets();
    eq(P.enemies.length, 1, `第 ${i} 发不该打死重甲`);
    eq(P.score, 0, `第 ${i} 发不该计分`);
  }
  P.player.cooldown = 0; P.fire(P.player);
  P.bullets[0].x = 146; P.updateBullets();
  eq(P.enemies.length, 0, '第 4 发应击毁');
  eq(P.score, 400, '重甲 400 分');
});
t('各类敌人血量/速度/分值符合设定', () => {
  eq([P.KINDS.basic.hp, P.KINDS.basic.speed, P.KINDS.basic.score], [1, 1, 100]);
  eq([P.KINDS.fast.hp, P.KINDS.fast.speed, P.KINDS.fast.score], [1, 2, 200]);
  eq([P.KINDS.power.hp, P.KINDS.power.speed, P.KINDS.power.score], [1, 1, 300]);
  eq([P.KINDS.armor.hp, P.KINDS.armor.speed, P.KINDS.armor.score], [4, 1, 400]);
});
t('出场闪烁期内无敌，闪完就能被打死', () => {
  openField(P);
  const ex = 148, ey = 108;
  // 把敌人困在钢墙小坑里，保证它不会走位，测试可重现
  for (const [x, y] of [[6, 4], [6, 5], [6, 6], [8, 4], [8, 5], [8, 6], [7, 4], [7, 6]])
    P.setTile(x, y, P.STEEL);
  P.putEnemy({ kind: 'basic', x: ex, y: ey, dir: { x: 0, y: -1 }, flash: 5, think: 999, shoot: 999 });
  P.setPlayer({ x: ex, y: 220, dir: { x: 0, y: -1 } });
  P.player.cooldown = 0;
  P.fire(P.player); P.bullets[0].y = ey + 8;
  for (let i = 0; i < 6; i++) P.updateBullets();
  eq(P.enemies.length, 1, '闪烁期应免疫');
  eq(P.bullets.length, 0, '子弹应被上方钢墙弹掉');
  for (let i = 0; i < 6; i++) P.updateEnemies();
  eq(P.enemies.length, 1, '还在');
  eq(P.enemies[0].flash, 0, '闪烁应结束');
  P.player.cooldown = 0;
  P.fire(P.player); P.bullets[0].y = ey + 8; P.updateBullets();
  eq(P.enemies.length, 0, '闪完后应能被击毁');
});
t('敌军每 tick 递减冷却，不会卡住只能开一枪', () => {
  openField(P);
  const e = P.putEnemy({ kind: 'basic', x: 300, y: 100, dir: { x: 1, y: 0 }, flash: 0, cooldown: 5 });
  const seen = [];
  for (let i = 0; i < 8; i++) { P.updateEnemies(); seen.push(e.cooldown); }
  ok(seen[0] < 5, '冷却应递减, got ' + seen[0]);
  ok(seen.includes(0), '冷却应能归零: ' + seen.join(','));
});
t('同屏敌军不超过 4 辆', () => {
  P.loadLevel(3);
  P.setState('playing');
  P.clearSquad();
  for (let i = 0; i < 500; i++) {
    P.tick();
    ok(P.enemies.length <= P.MAX_ENEMY, '同屏 ' + P.enemies.length + ' 辆，超上限');
  }
  ok(P.enemies.length > 0, '应该有敌人生成');
  ok(P.spawnQueue.length > 0, '第 3 关 18 个敌人不该 500 帧就打完');
});
t('敌军出生点固定在顶部三处，且不会被墙卡住', () => {
  P.loadLevel(1);
  P.setState('playing');
  P.clearEnemies();
  P.spawnPlayer();
  for (let i = 0; i < 200; i++) P.tick();
  const xs = new Set(P.enemies.map(e => Math.floor((e.x - 2) / 20)));
  for (const x of xs) ok(P.SPAWN_TX.includes(x), '敌军出现在非法出生点 x=' + x);
});
t('打光一关所有敌人 → 通关，奖励 1 条命', () => {
  P.loadLevel(1);
  P.setState('playing');
  P.clearEnemies();
  P.spawnPlayer();
  P.setLives(2);
  const before = P.lives;
  P.checkClear();
  eq(P.state, 'clear', '应进入通关状态');
  eq(P.lives, before + 1, '应奖励 1 条命');
});

console.log('\n[6] 道具');
t('6 种道具都在', () => {
  eq(Object.keys(P.DROPS).sort(), ['clock', 'grenade', 'helmet', 'life', 'shovel', 'star']);
});
t('星星升级提升火力（0→3 封顶）', () => {
  openField(P);
  P.setPlayerLevel(0);
  for (let i = 0; i < 5; i++) P.DROPS.star.apply();
  eq(P.player.level, 3, '火力应封顶 3 星');
});
t('头盔给护盾、定时冻结敌军', () => {
  openField(P);
  P.DROPS.helmet.apply(); ok(P.shieldTimer > 0, '应有护盾');
  P.DROPS.clock.apply(); ok(P.freezeTimer > 0, '应冻结');
});
t('铁锹把老巢 8 块围墙砖全变钢墙', () => {
  openField(P);
  P.setTile(12, 23, P.BRICK);
  P.DROPS.shovel.apply();
  for (const [x, y] of [[12, 22], [13, 22], [12, 23], [13, 23], [11, 24], [14, 24], [11, 25], [14, 25]])
    eq(P.grid[y][x], P.STEEL, `@${x},${y} 未变钢墙`);
});
t('手雷清光全屏敌军并计分', () => {
  openField(P);
  for (let i = 0; i < 3; i++) P.putEnemy({ kind: 'basic', x: 200 + i * 20, y: 100, dir: { x: 0, y: 0 }, flash: 0 });
  P.DROPS.grenade.apply();
  eq(P.enemies.length, 0, '应清场');
  eq(P.score, 300, '3 个普通坦克 = 300 分');
});
t('加命道具增加生命', () => {
  openField(P);
  P.setLives(2);
  P.DROPS.life.apply();
  eq(P.lives, 3);
});
t('玩家开到道具上即拾取，道具有时限', () => {
  openField(P);
  P.setPlayer({ x: 300, y: 300, flash: 0 });
  P.drops.push({ kind: 'star', x: 300, y: 300, life: 500 });
  const lv0 = P.player.level;
  P.updateDrops();
  eq(P.player.level, lv0 + 1, '应拾取升级');
  eq(P.drops.length, 0, '道具应被消耗');
  P.drops.push({ kind: 'star', x: 500, y: 500, life: 1 });
  P.updateDrops();
  eq(P.drops.length, 0, '过期道具应消失');
});
t('冻结期间敌军不动，但玩家能动', () => {
  openField(P);
  const e = P.putEnemy({ kind: 'basic', x: 300, y: 100, dir: { x: 1, y: 0 }, flash: 0, think: 99, shoot: 99 });
  P.setFreeze(50);
  const ex = e.x;
  for (let i = 0; i < 10; i++) P.tick();
  near(e.x, ex, '冻结时敌军不该移动:');
  P.setFreeze(0);
  for (let i = 0; i < 10; i++) P.tick();
  ok(e.x !== ex, '解冻后敌军应恢复移动');
});

console.log('\n[7] 老巢与失败条件');
t('老巢被打 → 立即结束，砖墙变废墟', () => {
  P.loadLevel(1);
  P.setState('playing');
  P.clearEnemies();
  P.spawnPlayer();
  P.setScore(250);
  P.pushBullet({ x: 12 * 20 + 4, y: 24 * 20 + 4, w: 4, h: 4, dx: 0, dy: 1, speed: 3, owner: 999, isPlayer: false, dead: false });
  P.updateBullets();
  eq(P.baseAlive, false, '老巢应被摧毁');
  eq(P.state, 'gameover', '应立即游戏结束');
  for (let y = 24; y < 26; y++) for (let x = 12; x < 14; x++) eq(P.grid[y][x], P.BROKEN, '@' + x + ',' + y);
});
t('生命耗尽 → 游戏结束，最高分落盘', () => {
  P.loadLevel(1);
  P.setState('playing');
  P.clearEnemies();
  P.spawnPlayer();
  P.setLives(1);
  P.setScore(800);
  P.player.flash = 0;
  P.killPlayer();
  eq(P.lives, 0);
  eq(P.state, 'gameover');
  eq(P.best, 800, '最高分应更新');
  eq(localStorage.getItem('tank.best'), '800', '最高分应写进 localStorage');
});
t('重开：分数/生命/关卡全部复位', () => {
  P.loadLevel(3);
  P.setScore(5000); P.setLives(1);
  P.startGame();
  eq(P.score, 0); eq(P.lives, 3); eq(P.level, 1); eq(P.state, 'playing');
  eq(P.enemiesLeft, 12, '应重置第 1 关敌人队列');
  ok(P.player.alive, '玩家应存活');
});

console.log('\n[8] 冰面与边界');
t('冰面上松开方向仍会继续滑行，直到撞墙', () => {
  openField(P);
  P.setFreeze(99999);            // 冻住敌军，隔离变量
  P.setTile(5, 5, P.ICE); P.setTile(6, 5, P.STEEL);
  const p = P.player;
  p.x = 100; p.y = 100; p.onIce = true; p.dir = { x: 1, y: 0 }; p.flash = 0;
  const x0 = p.x;
  P.tick();
  ok(p.x > x0, '冰面应继续滑行');
  for (let i = 0; i < 60; i++) P.tick();
  ok(p.x < 6 * 20, '应被钢墙拦下, x=' + p.x);
  ok(!p.onIce, '撞墙后应停止滑行');
  const xStop = p.x;
  for (let i = 0; i < 10; i++) P.tick();
  near(p.x, xStop, '停下后不该再动:');
});

console.log('\n[9] 渲染与主循环');
t('render 不抛异常，且真的画了东西', () => {
  P.loadLevel(2);
  P.setState('playing');
  P.spawnEnemy('power');
  P.player.dir = { x: 1, y: 0 };
  P.fire(P.player);
  P.addFx({ type: 'boom', x: 100, y: 100, r: 20, life: 20 });
  P.addFx({ type: 'text', x: 100, y: 100, text: '+100', life: 20 });
  P.addFx({ type: 'spark', x: 100, y: 100, life: 20 });
  P.addFx({ type: 'debris', x: 100, y: 100, life: 20 });
  P.drops.push({ kind: 'star', x: 200, y: 200, life: 100 });
  const before = ctxCalls.n;
  P.setShield(100);
  P.render();
  ok(ctxCalls.n - before > 30, '应发生足量绘制调用, 只调了 ' + (ctxCalls.n - before));
});
t('老巢被毁后渲染也不炸', () => {
  P.loadLevel(1);
  P.setState('gameover');
  P.setTile(12, 24, P.BROKEN);
  P.render();
  ok(true);
});
t('主循环注册了 requestAnimationFrame（游戏能跑起来）', () => {
  ok(rafCalls > 0, '应至少请求过一帧');
});
t('长时间空跑 600 帧不抛异常、不卡死（性能/稳定性）', () => {
  P.startGame();
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) P.tick();
  const ms = Date.now() - t0;
  ok(ms < 3000, '600 帧耗时 ' + ms + 'ms，太慢');
  ok(P.state === 'playing' || P.state === 'dead' || P.state === 'gameover' || P.state === 'clear', '状态异常: ' + P.state);
});

console.log('\n[10] 平衡回归');
t('玩家阵亡后残余敌军退场，且不计入得分', () => {
  openField();
  const refs = [0, 1, 2].map(i => P.putEnemy({ kind: 'basic', x: 300 + i * 20, y: 100, dir: { x: 0, y: 0 }, flash: 0, retreat: 0 }));
  P.setScore(0);
  P.setLives(3);
  P.player.flash = 0;
  P.killPlayer();
  ok(refs.every(e => e.retreat > 0), '敌军应被标记退场');
  for (let i = 0; i < 500; i++) P.tick();
  eq(P.score, 0, '退场不该计分');
  ok(refs.every(e => P.enemies.indexOf(e) === -1), '原有 3 辆敌军应全部退场');
});
t('无人操作时老巢至少撑住 8 秒（回归：中间路不能秒推老巢）', () => {
  let worst = Infinity;
  for (let run = 0; run < 6; run++) {
    P.startGame();
    let t = 0;
    for (; t < 1800; t++) {
      P.tick();
      if (!P.baseAlive || P.state === 'gameover') break;
    }
    worst = Math.min(worst, t);
  }
  ok(worst >= 480, `最短只撑了 ${(worst / 60).toFixed(1)} 秒（要求 ≥ 8 秒）`);
});
t('关卡结构上可通关：不死瞄准 bot 多次尝试能清空第 1 关', () => {
  const V = { arrowup: { x: 0, y: -1 }, arrowdown: { x: 0, y: 1 }, arrowleft: { x: -1, y: 0 }, arrowright: { x: 1, y: 0 } };
  const names = Object.keys(V);
  let cleared = 0;
  for (let run = 0; run < 10; run++) {
    P.startGame();
    for (let i = 0; i < 300 * 60; i++) {
      P.setLives(9);                       // 不死，只验证「能不能清场」
      const p = P.player, es = P.enemies;
      if (p && p.alive && es.length) {
        let best = null, bd = 1e9;
        for (const e of es) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y); if (d < bd) { bd = d; best = e; } }
        const dx = best.x - p.x, dy = best.y - p.y;
        const sameRow = Math.abs(dy) < 10 && Math.abs(dx) > 12;
        const sameCol = Math.abs(dx) < 10 && Math.abs(dy) > 12;
        if (sameRow || sameCol) {
          P.hold(sameRow ? (dx > 0 ? 'arrowright' : 'arrowleft') : (dy > 0 ? 'arrowdown' : 'arrowup'));
          p.cooldown = 0; P.fire(p);
        } else {
          const want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'arrowright' : 'arrowleft') : (dy > 0 ? 'arrowdown' : 'arrowup');
          P.hold([want, ...names.filter(k => k !== want)].find(k => P.canMove(p, V[k])) ?? want);
        }
      } else P.hold(null);
      P.tick();
      if (P.state === 'clear' || P.state === 'win') { cleared++; break; }
      if (P.state === 'gameover') break;
    }
  }
  ok(cleared >= 1, `10 次尝试 0 次通关（第 1 关结构可能有问题）`);
  console.log('        （bot 通关 ' + cleared + '/10）');
});

console.log(`\n结果: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
