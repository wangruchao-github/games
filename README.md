# games

三个零依赖单文件网页小游戏。每个游戏一个目录，**双击 `index.html` 就能玩** —— 没有构建、没有 npm、没有网络请求、没有第三方运行时。

| 游戏 | 一句话 | 试玩 | 测试 |
| --- | --- | --- | --- |
| [贪吃蛇 Snake](snake/) | 吃果实变长，可开穿墙模式 | [在线玩](https://wangruchao-github.github.io/games/snake/) | `node snake/snake_test.mjs` · 24 条 |
| [坦克大战 Battle City](tank/) | 守住底部老巢，5 关，逐关加兵 | [在线玩](https://wangruchao-github.github.io/games/tank/) | `node tank/tank_test.mjs` · 47 条 |
| [俄罗斯方块 Tetris](tetris/) | 完整 SRS + T-Spin + B2B + Hold | [在线玩](https://wangruchao-github.github.io/games/tetris/) | `node tetris/tetris_test.mjs` · 86 条 |

在线试玩地址由 GitHub Pages 提供（发布在 `main` 分支根目录）。

## 共同约定

- **单文件**：结构、样式、逻辑全在一个 `index.html` 里，拷走就能跑。
- **零依赖测试**：每个游戏配一个 `*_test.mjs`，只用 Node 内置模块，`node xxx_test.mjs` 直接跑。
  游戏逻辑被关在 IIFE 里，测试用一个最小 DOM stub 把 `<script>` 抠出来，在 IIFE 内部注入一个探针
  对象访问内部状态，然后驱动纯逻辑函数断言。
- **键盘 + 触屏双输入**：桌面端方向键/WASD，手机端有屏幕按钮和滑动手势，布局会按屏宽自适应。
- **作者署名**：源码统一 `@author wangrc`。

## 跑全部测试

```bash
for g in snake tank tetris; do
  echo "== $g =="
  node "$g/${g}_test.mjs" | tail -2
done
```

当前状态：**157 条用例全部通过**（24 + 47 + 86），三次连续运行结果一致（测试是确定性的，不依赖 `Math.random()`）。

各游戏的详细玩法、规则与实现要点见各自目录下的 `README.md`。

## 目录结构

```
games/
├── README.md
├── snake/          贪吃蛇
├── tank/           坦克大战
└── tetris/         俄罗斯方块
```

@author wangrc
