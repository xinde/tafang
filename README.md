# 余烬守卫 · Emberwatch

[手机或电脑直接玩](https://xinde.github.io/tafang/)

一款复古像素塔防游戏。敌人从红旗出发，沿土路攻向城堡。你可以先看下一波的敌人，再决定把金币花在新守卫、全局强化，还是留到下一波。

## 开局与换关

打开试玩首页会从 **12 张地图**里随机抽一张。同一浏览器标签页会记住本轮已经出现的地图，抽完一轮再洗牌。通关后点「随机下一关」继续，想自己挑场景可打开「战役地图」。重试会保留原地图。要分享指定关卡，可以复制下表中的链接。

1. 在「部署守卫」选弩手，点弯道内侧带加号的石台。一座塔就能照顾两段路。手机按住空石台可以预览射程，松手部署。
2. 点「开始第 1 波」。击败敌人会获得金币和技能能量。两波之间可以整备，也可以提前迎战，最多多拿 8 金币。
3. 想提高全队攻击力、攻速或射程时，打开「全局强化」。城堡还有耐久并守住最后一波，就能进入下一关。

| 战役（点击直达） | 波数 | 布防思路 |
| --- | ---: | --- |
| [苔桥前哨](https://xinde.github.io/tafang/?stage=moss) | 5 | 在桥头与折角练习布塔。 |
| [风车麦田](https://xinde.github.io/tafang/?stage=mill) | 5 | 弩手守麦垄内弯，重炮守长直道。 |
| [潮汐灯港](https://xinde.github.io/tafang/?stage=tide) | 5 | 在浅滩拦住快狼，保留灯塔前的补防点。 |
| [琥珀回廊](https://xinde.github.io/tafang/?stage=amber) | 6 | 用重炮或雷塔覆盖两段折返路。 |
| [萤火湿地](https://xinde.github.io/tafang/?stage=fen) | 6 | 雷塔清理蝠群，后排守卫对付巫师。 |
| [翠竹山径](https://xinde.github.io/tafang/?stage=bamboo) | 6 | 在竹溪转角布置重炮，掩护前排。 |
| [霜隙古道](https://xinde.github.io/tafang/?stage=frost) | 7 | 霜晶拦快狼，穿甲弩对付铁卫。 |
| [赤砂驿道](https://xinde.github.io/tafang/?stage=dunes) | 7 | 减速领头的重甲，截住后面的快狼。 |
| [紫晶矿脉](https://xinde.github.io/tafang/?stage=quartz) | 7 | 在矿道内环部署能多次命中同一敌人的穿甲弩。 |
| [烬火要塞](https://xinde.github.io/tafang/?stage=cinder) | 8 | 前排会遭到反击，末波有两名领主。 |
| [云崖栈桥](https://xinde.github.io/tafang/?stage=cliff) | 8 | 守住跨云谷的两个折口，给蝠群留一座雷塔。 |
| [月蚀遗庭](https://xinde.github.io/tafang/?stage=moon) | 8 | 在两段长廊分开布防，为第二名领主留好技能。 |

手机长按已部署的守卫，或开启「出售守卫」后点它，可收回一半造价。电脑可用数字键 `1` 至 `7` 选守卫，`Q`、`W`、`E` 释放技能，`P` 暂停。战役地图会显示当前浏览器保存的各关最佳通关评级。

## 答题强化

题库面向小学四至六年级，共 **180 道纯文字四选一**。12 个主题覆盖历史、文学、汉字、运算、几何、逻辑与数据、英语、地理、生态、物理实验、地球与太空、音乐与美术。看图例、辨方向、读统计数据的题也会把所需条件写进题干。

答题时战斗暂停。每题有 20 至 35 秒，答对才扣金币并强化全队，答错或超时可以再试。同一关内抽完整个题库才开启下一轮，换关或刷新会重新抽题。

## 本地试玩

游戏源码和测试在 `main`，线上版本从 `gh-pages` 发布。在本机试玩只需要 Git 和 Python 3。

```sh
git clone https://github.com/xinde/tafang.git tafang-play
cd tafang-play
python3 -m http.server 4178 --bind 127.0.0.1
```

服务启动后打开[本地游戏](http://127.0.0.1:4178/)。

## 维护题库

题目都在 [config/quiz.json](config/quiz.json)。每组的 `timeLimit` 是默认答题秒数，单题可以覆盖。写题时把条件写全，准备四个不同的选项，把唯一正确选项的下标填入 `answer`。下标从 0 开始，下面这个例子中「8 页」是第二项，所以填 1。

```json
{
  "q": "从第 18 页读到第 25 页，两端都读，一共读了几页？",
  "options": ["7 页", "8 页", "9 页", "6 页"],
  "answer": 1
}
```

测试放在 `main` 分支。修改题库后，可用 Node.js 22 或更新版本运行 `npm test`，再将验证过的题库同步到 `gh-pages`。
