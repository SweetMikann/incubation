# 潜伏期 · Incubation

两个人的疫情对局：一个人当瘟疫，一个人当人类。瘟疫在迷雾里悄悄攒钱、选症状、挑传播路径；人类看不见瘟疫在哪，只能靠通报、监测和研究拨款把解药赶在崩溃之前做出来。

A two-player outbreak duel: one plays the plague, the other plays humanity. The plague grows in fog, spending DNA on symptoms and transmission; humanity only sees the daily bulletin and races the cure against collapse.

## 玩法 / How it plays
- 世界：176 个国家、51 个节点的真实经纬度地图，机场／港口／陆路三种传播路径。
- 瘟疫方：DNA 攒钱与花钱的取舍，症状树、传播树、能力树；停研、重排、后期强化。
- 人类方：14 张牌（溯源检测、全球监测网、研究拨款、应急测序、流动实验室、关闭机场／港口、公共卫生……），研究点由知晓度和已公开国家数决定。
- 迷雾：人类只看得到已公开的国家；围观视角同样隔雾。
- 一局大约 40–60 天（回合），任何一方达成条件即收局；两人到齐自动开局。

## 结构 / Layout
```
engines/plague.cjs      规则引擎（回合、卡牌、传播、研究、胜负）
data/world.cjs          由 Natural Earth 110m 生成的国家与节点表（scripts/build-world-map.cjs）
public/                 牌桌页面（game.html / js / css / 图标）
server.cjs              房间、邀请码、观战、AI 对手接口
scripts/balance.cjs     平衡审计：100 局 × 两种固定人类策略，--check 超出区间非零退出
test/                   node --test，65 条
```

## 跑起来 / Run
```sh
npm install
node scripts/build-world-map.cjs path/to/ne_110m_admin_0_countries.geojson
npm test
node server.cjs        # 默认 8085
```

## 平衡 / Balance
平衡靶子：乱花型人类胜率 25–40%，节俭型 45–60%。审计脚本与最近一次报告见 `BALANCE-*.md`。机器人只代表固定策略，不代表最优人类玩法。

## 谁做的 / Credits
- **Mikann** —— 企划、规则拍板、验收
- **Damien (Codex)** —— 引擎、平衡
- **澄澄 (Claude)** —— 房间与服务端、前端、平衡与数据验证、上线与隔离
- 桌面底盘借自 29-Cu/bisca（CC BY 4.0），见 ATTRIBUTION.md
- 地图数据：Natural Earth（公共领域）。★注意：底图国界按 Natural Earth 原样，**不是国内审图版**，与中国标准地图在部分边界上不一致；在国内平台发布截图前请自行处理（2026-09-11 一张地图截图曾被小红书判「国家误导」限流）

## 直接上手玩 / Play it now
不想自己架服务器的话，公开版就开在这儿：**https://zestparlor.win/plague/**
不用注册、不用密码，开一间房把邀请链接丢给对手（人或 AI 都行）。

## 名字 / Name
「潜伏期」——这游戏最像自己的地方就是迷雾：瘟疫那边悄悄长，人类看见的时候已经晚了。2026-09-07 定的。

## 许可 / License
MIT，见 LICENSE。对外的 AI 玩家请自带：本仓库不含任何模型密钥，也不代任何人调用模型。
