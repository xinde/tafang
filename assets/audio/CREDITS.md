# 音效来源与协议（assets/audio/CREDITS.md）

本项目所有音效均为**本地文件**，运行时不引用任何远程 URL，避免网络问题导致游戏故障。

## 协议

全部音效文件以 **CC0 1.0 Universal (Public Domain Dedication)** 发布。
可自由复制、修改、发布、商用，无需署名。
https://creativecommons.org/publicdomain/zero/1.0/

## 来源说明

短音效由项目内脚本 `scripts/gen-audio.mjs` 通过简单数字信号合成（正弦/三角/方波 + 白噪声 + ADSR 包络）生成，并以确定性伪随机种子保证可复现。

之所以采用程序生成而非从 freesound / opengameart / mixkit / kenney 等站点下载：
- 这些站点的素材 URL 多有热链接保护或需登录鉴权，无法在构建期可靠地程序化下载；
- 程序生成的素材可在本地完全离线复现，许可清晰（CC0 自有），无第三方署名义务；
- 可针对每种武器/事件定制明显可区分的音色，满足"不同武器不同音效"的诉求。

如需替换为从开源素材站下载的真实录音，可将对应文件覆盖到本目录同名 `.wav`，并在此补充各文件的具体来源与协议；音效清单与文件名见下表，代码引用均通过 `js/engine/audio.js` 的 manifest 映射，无需改动业务代码。

## 音效清单

| 文件 | 用途 | 触发位置 |
|---|---|---|
| fire_sword.wav | 近战剑开火（气声斩击） | soldier._fire |
| fire_arrow.wav | 弓箭开火（弦音下行） | soldier._fire |
| fire_cannon.wav | 炮击开火（低频轰鸣） | soldier._fire |
| fire_magic.wav | 魔法开火（上扬亮闪） | soldier._fire |
| hit_arrow.wav | 箭命中（短促 thunk） | projectile._hit |
| hit_cannon.wav | 炮爆炸（低频 + 噪声） | projectile._hit |
| hit_magic.wav | 魔命中（亮 ping） | projectile._hit |
| place.wav | 放置士兵（上行二音） | main.onCellClick |
| upgrade.wav | 升级/解锁（上行琶音） | main 升级购买 |
| sell.wav | 出售士兵（下行 + 金币） | main.onCellRightClick |
| wave_start.wav | 波次开始（警报双音） | wave.startNextWave |
| kill.wav | 击杀怪兽（挤压 pop） | wave.update 击杀结算 |
| leak.wav | 漏怪扣血（下行噪杂） | wave.update 漏怪结算 |
| coin.wav | 获得金币（亮双 ping） | economy.earn |
| victory.wav | 胜利（大调上行） | main.update 胜利 |
| gameover.wav | 失败（下行） | main.update 失败 |
| button.wav | 通用 UI 点击 | main.selectWeapon / 取消静音 |
| tower_down.wav | 防御塔被远程摧毁（金属垮塌 + 低频） | wave.update 塔损结算 |

## 背景音乐

[`watchfire.mp3`](watchfire.mp3) 是为《余烬守卫》创作的循环曲《城墙上的灯》。24 个小节以 112 BPM 演奏，包含芯片主旋律、拨弦、低音和轻打击乐，沿用本项目音效的 CC0 协议。网页只在开始播放时读取这首曲子。

完整乐谱与合成参数在 `scripts/gen-music.mjs`。安装 FFmpeg 后，运行 `node scripts/gen-music.mjs` 即可重新编码曲目。

## 重新生成短音效

```bash
node scripts/gen-audio.mjs
```

输出：22050 Hz 单声道 16-bit PCM WAV，写入本目录。
