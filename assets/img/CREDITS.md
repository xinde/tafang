# 余烬守卫美术素材

画面和音效都随仓库分发，游戏运行时从本地加载。

| 素材 | 用途与来源 |
| --- | --- |
| `turret_*.svg` | 七种守卫的像素精灵，战场与工坊使用同一幅画。角色转向时水平翻转。 |
| `monster_*.svg` | 八种敌方精灵，按轮廓和配色区分。波次预告直接使用对应敌人的精灵。 |
| `base.svg`、`icons.svg` | 城堡、金币、耐久、旗帜与界面按钮的像素图形。 |
| `emberwatch.webp` | 用内置 ImageGen 为本项目生成的战役横幅。画面设定为 16 位像素黄昏山谷、暖光石塔、金色燕尾旗与分层松林，左侧给关卡标题留空。 |
| `assets/img/scenes/*.webp` | 其余十一关的独立远景。内置 ImageGen 绘制 3 列 4 行的像素风景图集，按场景裁切、压缩，进入哪一关就下载哪一幅。 |
| `js/engine/terrain.js` | 战场的麦垄、棕榈、芦苇、竹丛、仙人掌、晶簇、岩柱与古迹按关卡种子绘制。战场和地图册预览使用相同的路线与塔位。 |

SVG 素材沿用项目的 [CC0 1.0 声明](https://creativecommons.org/publicdomain/zero/1.0/)。

<details>
<summary>横幅的 ImageGen 生成提示词</summary>

```text
Use case: stylized-concept. Create an original horizontal panoramic 3:1 pixel art key visual for a retro Chinese-language tower defense game Emberwatch. Authentic deliberate 16-bit SNES landscape, as if the native resolution were 480 by 160, sharply defined chunky square 3–4 px clusters, carefully placed limited 24-color ramps, absolutely no smooth painted shading, no blur. Look across a forested valley at dusk. A solitary great square, warmly lit medieval stone watchtower with battlements, light glowing lantern windows, saffron swallowtail pennant, tall evergreen trees and a rocky outcrop is at 65 percent of the width; keep all important features within central half of the image height, fort seen from the side in the middle distance. The sky is peach apricot, terracotta, muted gold, with a few long horizontal clouds. Desaturated blue teal mountain silhouettes layer into middle distance, bleached sun, dark pine and indigo foreground trees frame edges. Leftmost 30 percent is quieter and darker, for an interface title to be overlaid separately. Screenprint-like composition, beautiful old game box illustration but physically pixelled at low resolution. Full bleed edge to edge. No lettering, text, seals, panels, UI, logo, borders or watermarks.
```

</details>

<details>
<summary>新场景远景的图集设定</summary>

内置 ImageGen 绘制统一的 16 位像素全景图集，三列四行，无字无边框。第一行依次是黄昏林哨、金色麦田风车、红白灯塔与潮港。第二行是秋枫石桥、萤火柳泽、翠竹与朱桥。第三行是冰川哨所、砂岩驿站、紫晶矿井。第四行是熔岩城堡、云海吊桥、月下断拱。每格的地标靠右，保留地平线和清晰的建筑剪影。苔桥前哨继续使用原有横幅，其余十一格分别编码成 WebP。

</details>
