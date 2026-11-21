# 余烬守卫美术素材

画面和音效都随仓库分发，游戏运行时从本地加载。

| 素材 | 用途与来源 |
| --- | --- |
| `turret_*.svg` | 七种守卫的像素精灵，战场与工坊使用同一幅画。角色转向时水平翻转。 |
| `monster_*.svg` | 八种敌方精灵，按轮廓和配色区分。波次预告直接使用对应敌人的精灵。 |
| `base.svg`、`icons.svg` | 城堡、金币、耐久、旗帜与界面按钮的像素图形。 |
| `emberwatch.webp` | 用内置 ImageGen 为本项目生成的战役横幅。画面设定为 16 位像素黄昏山谷、暖光石塔、金色燕尾旗与分层松林，左侧给关卡标题留空。 |
| `js/engine/terrain.js` | 森林、石台、河流、木桥与道路的像素绘制。地形使用关卡种子，塔位和道路取自游戏地图。 |

SVG 素材沿用项目的 [CC0 1.0 声明](https://creativecommons.org/publicdomain/zero/1.0/)。

<details>
<summary>横幅的 ImageGen 生成提示词</summary>

```text
Use case: stylized-concept. Create an original horizontal panoramic 3:1 pixel art key visual for a retro Chinese-language tower defense game Emberwatch. Authentic deliberate 16-bit SNES landscape, as if the native resolution were 480 by 160, sharply defined chunky square 3–4 px clusters, carefully placed limited 24-color ramps, absolutely no smooth painted shading, no blur. Look across a forested valley at dusk. A solitary great square, warmly lit medieval stone watchtower with battlements, light glowing lantern windows, saffron swallowtail pennant, tall evergreen trees and a rocky outcrop is at 65 percent of the width; keep all important features within central half of the image height, fort seen from the side in the middle distance. The sky is peach apricot, terracotta, muted gold, with a few long horizontal clouds. Desaturated blue teal mountain silhouettes layer into middle distance, bleached sun, dark pine and indigo foreground trees frame edges. Leftmost 30 percent is quieter and darker, for an interface title to be overlaid separately. Screenprint-like composition, beautiful old game box illustration but physically pixelled at low resolution. Full bleed edge to edge. No lettering, text, seals, panels, UI, logo, borders or watermarks.
```

</details>
