#!/usr/bin/env python3
# 生成坦克大战关卡地图（26x26），输出可直接粘进 index.html 的 JS 数组
# 图例: . 空  B 砖墙  # 钢墙  ~ 水  T 树  I 冰  H 老巢
N = 26
BASE = (12, 24)  # 老巢 2x2 占位


def blank():
    return [['.'] * N for _ in range(N)]


def rect(g, x0, y0, w, h, ch):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if 0 <= x < N and 0 <= y < N:
                g[y][x] = ch


def symmetrize(g):
    """左右镜像（x -> 25-x），只在左半边画，保证经典对称观感"""
    for y in range(N):
        for x in range(N // 2):
            g[y][N - 1 - x] = g[y][x]


def finish(g, trees=()):
    """统一补：老巢 + 保护砖墙 + 出生点留空"""
    for (x, y) in trees:
        rect(g, x, y, 1, 1, 'T')
    symmetrize(g)
    # 保护老巢的砖（8 面：北侧两层，两侧各两层高）
    rect(g, 12, 22, 2, 1, 'B')
    rect(g, 12, 23, 2, 1, 'B')
    rect(g, 11, 24, 1, 2, 'B')
    rect(g, 14, 24, 1, 2, 'B')
    # 老巢本体
    rect(g, BASE[0], BASE[1], 2, 2, 'H')
    # 清空出生点周边：敌 3 个(2,0)(12,0)(22,0)，玩家 (8,24)
    for (cx, cy) in ((2, 0), (12, 0), (22, 0), (8, 24)):
        for y in range(max(0, cy - 1), min(N, cy + 2)):
            for x in range(max(0, cx - 1), min(N, cx + 2)):
                if g[y][x] in 'B#~I':
                    g[y][x] = '.'
    return [''.join(row) for row in g]


# ---------- 第 1 关：稀疏，教会玩家基本走位 ----------
L1 = blank()
for r in [(2, 3, 4, 1), (2, 3, 1, 4), (6, 6, 3, 3), (2, 9, 6, 1), (9, 10, 1, 4),
          (2, 14, 1, 4), (3, 17, 4, 1), (2, 20, 5, 1), (10, 16, 2, 2)]:
    rect(L1, *r, 'B')
rect(L1, 10, 16, 2, 2, '#')
levels1 = finish(L1, trees=[(7, 12), (8, 12), (17, 12), (18, 12), (6, 20), (19, 20)])

# ---------- 第 2 关：水塘 + 更多钢墙 ----------
L2 = blank()
for r in [(2, 4, 3, 4), (2, 11, 3, 1), (5, 5, 2, 2), (5, 5, 2, 2), (9, 3, 1, 6),
          (2, 15, 1, 5), (4, 18, 3, 3), (6, 20, 1, 4), (9, 13, 2, 1)]:
    rect(L2, *r, 'B')
rect(L2, 10, 8, 2, 2, '#')
rect(L2, 3, 8, 3, 2, '~')
rect(L2, 6, 14, 3, 2, '~')
levels2 = finish(L2, trees=[(4, 2), (21, 2), (11, 18), (14, 18)])

# ---------- 第 3 关：树丛掩护 + 冰面 ----------
L3 = blank()
for r in [(1, 6, 2, 5), (4, 3, 1, 6), (4, 11, 4, 1), (7, 13, 1, 5), (2, 16, 5, 1),
          (2, 20, 2, 4), (9, 8, 1, 4), (10, 18, 1, 5), (5, 9, 2, 2)]:
    rect(L3, *r, 'B')
rect(L3, 11, 6, 1, 1, '#')
rect(L3, 1, 18, 4, 2, '~')
for r in [(4, 14, 3, 3), (2, 8, 2, 2)]:   # 冰面
    rect(L3, *r, 'I')
levels3 = finish(L3, trees=[(6, 4), (7, 4), (8, 4), (6, 5), (7, 5),
                            (15, 4), (16, 4), (17, 4), (15, 5), (16, 5),
                            (5, 16), (20, 16), (11, 11), (14, 11)])

# ---------- 第 4 关：钢墙要塞 ----------
L4 = blank()
for r in [(2, 3, 2, 3), (2, 8, 5, 1), (3, 11, 1, 4), (6, 4, 1, 4), (6, 8, 3, 3),
          (2, 15, 2, 4), (4, 19, 2, 3), (8, 20, 1, 4), (9, 6, 1, 3), (9, 12, 2, 1)]:
    rect(L4, *r, 'B')
rect(L4, 11, 9, 1, 3, '#')
rect(L4, 12, 13, 1, 1, '#')
rect(L4, 12, 5, 1, 3, '#')
rect(L4, 2, 12, 3, 2, '~')
rect(L4, 6, 16, 3, 2, '~')
rect(L4, 3, 15, 2, 3, 'I')
levels4 = finish(L4, trees=[(4, 7), (21, 7), (5, 12), (20, 12), (11, 17), (14, 17)])

# ---------- 第 5 关：迷宫 ----------
L5 = blank()
for r in [(1, 2, 1, 8), (3, 2, 1, 8), (5, 2, 1, 6), (1, 4, 4, 1), (1, 8, 4, 1),
          (7, 4, 2, 4), (7, 10, 2, 5), (2, 13, 4, 1), (2, 17, 1, 6), (5, 18, 4, 1),
          (9, 18, 1, 5), (6, 15, 3, 2), (1, 12, 1, 3)]:
    rect(L5, *r, 'B')
rect(L5, 12, 4, 1, 4, '#')
rect(L5, 12, 11, 1, 3, '#')
rect(L5, 4, 10, 2, 2, '~')
rect(L5, 8, 12, 2, 2, '~')
rect(L5, 2, 20, 3, 1, 'I')
levels5 = finish(L5, trees=[(3, 5), (22, 5), (10, 8), (15, 8), (4, 15), (21, 15)])

out = []
for i, lv in enumerate([levels1, levels2, levels3, levels4, levels5], 1):
    assert len(lv) == N, f'L{i} 行数 {len(lv)}'
    for y, row in enumerate(lv):
        assert len(row) == N, f'L{i} 第 {y} 行宽度 {len(row)}'
    out.append(lv)
    print(f'--- L{i} ---')
    for y, row in enumerate(lv):
        print(f'{y:2d} {row}')

with open('/tmp/levels.js', 'w', encoding='utf-8') as f:
    f.write('const LEVELS = [\n')
    for i, lv in enumerate(out):
        f.write('  [\n')
        for row in lv:
            f.write(f"    '{row}',\n")
        f.write('  ],\n')
    f.write('];\n')
print('\nwrote /tmp/levels.js')
