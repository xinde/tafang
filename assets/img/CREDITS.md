# 图片素材来源与协议（assets/img/CREDITS.md）

本项目所有图片均为**本地 SVG 文件**，运行时不引用任何远程 URL，避免网络问题导致游戏故障。

## 协议

全部图片文件以 **CC0 1.0 Universal (Public Domain Dedication)** 发布。
可自由复制、修改、发布、商用，无需署名。
https://creativecommons.org/publicdomain/zero/1.0/

## 来源说明

这些图片**未从外部素材站下载**，而是为本项目手工编写的 SVG（矢量图，纯文本 XML）。
之所以采用手写 SVG 而非从 opengameart / kenney.nl 等站点下载位图：
- 外部位图素材 URL 多有热链保护或需登录鉴权，无法在构建期可靠地程序化下载；
- 手写 SVG 可离线维护、许可清晰（CC0 自有）、矢量缩放无锯齿（canvas drawImage 任意尺寸清晰）；
- 可针对每种武器/怪兽定制视觉，与现有配色（weapon/monster color）保持一致。

如需替换为下载的真实位图：将同名文件覆盖到本目录（支持 PNG/SVG，文件名保持一致即可），代码通过 js/engine/assets.js 的 manifest 映射引用，无需改业务代码。

## 图片清单

| 文件 | 用途 | 绘制位置 |
|---|---|---|
| turret_sword.svg | 近战剑塔（朝右） | renderer.drawSoldier 旋转绘制 |
| turret_arrow.svg | 弓箭塔（朝右） | renderer.drawSoldier 旋转绘制 |
| turret_cannon.svg | 炮塔（朝右） | renderer.drawSoldier 旋转绘制 |
| turret_magic.svg | 魔法塔（朝右） | renderer.drawSoldier 旋转绘制 |
| monster_normal.svg | 普通怪兽 | renderer.drawMonster |
| monster_fast.svg | 快速怪兽 | renderer.drawMonster |
| monster_tank.svg | 坦克怪兽 | renderer.drawMonster |
| base.svg | 基地城堡 | renderer.drawBase |

## 约定

- 塔/炮塔 SVG 默认朝右（+x，angle=0 朝东），由 renderer 按 Soldier.angle 旋转后绘制，实现"随发射方向旋转"。
- 怪兽 SVG 不旋转（对称造型，任意朝向均可读）。
- 所有 SVG 均为 100x100 viewBox，含显式 width/height，确保 canvas drawImage 跨浏览器一致缩放。
