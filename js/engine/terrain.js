// 原生画幅 320 × 192，单格 16 像素。静态地形离屏绘制一次，战斗和预览共用它。
const TILE = 16;
const BIOMES = {
  forest: {
    grass: ['#608c56', '#68965b', '#729e5e', '#7ea660'], sprig: '#8fb769', shade: '#4d794e',
    tree: ['#243e3a', '#315744', '#417454', '#60925d', '#86b568'],
    water: ['#305f68', '#387f87', '#49969b', '#77b6ab'], bank: '#afac73',
    road: ['#6f6448', '#a58a57', '#c7a469', '#d7b87d', '#ebcc91'], bloom: '#f6c781',
  },
  autumn: {
    grass: ['#a48c52', '#ac9458', '#af975b', '#b69c5d'], sprig: '#d4b56c', shade: '#93834f',
    tree: ['#503f37', '#794e3e', '#a65e3c', '#cd803e', '#edaa51'],
    water: ['#365c60', '#437a7c', '#579293', '#98b6a0'], bank: '#b8a06c',
    road: ['#786648', '#a88f60', '#ccb482', '#dcc18b', '#efce97'], bloom: '#efdb8e',
  },
  frost: {
    grass: ['#9cbab8', '#a7c3bd', '#b1cac1', '#bcd2c9'], sprig: '#e3e5ce', shade: '#88aaa9',
    tree: ['#364c59', '#426575', '#638a94', '#95b8b6', '#dae4d3'],
    water: ['#41687b', '#59889b', '#76adbb', '#bfdfd9'], bank: '#d7dfc9',
    road: ['#69787c', '#96a19a', '#bba88c', '#d1bda1', '#e5d4b6'], bloom: '#fbde97',
  },
  ember: {
    grass: ['#65585a', '#705d5d', '#79635f', '#806764'], sprig: '#9e7970', shade: '#5d5155',
    tree: ['#383344', '#504052', '#695263', '#926566', '#ba7b6d'],
    water: ['#6d343b', '#ab4e3e', '#e87a48', '#ffca63'], bank: '#ab775a',
    road: ['#514748', '#8e7263', '#ac8a6c', '#bd9c7a', '#d7b38b'], bloom: '#ffa95b',
  },
};

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const PINE = [
  '.......01.......','......0121......','......1321......','.....143321.....',
  '....13443210....','...123433210....','....1223210.....','...013443210....',
  '..01344332210...', '.0123433322100..','...123322210....','..01343332210...',
  '.0134443332210..','013443333222110.','012333222221110.','..01122211110...',
  '....0111110.....','......abb.......','......abb.......','.....0bbb0......',
];
const OAK = [
  '.....011100.....','...012332110....','..01344333210...','.0134433343210..',
  '.13443334433210.','013332233433210.','0133233333322100','0123333223322110',
  '.012233322222110','..0112222222110.','...00111111100..','......bab.......',
  '.....0aabb......','....0bbbbb0.....',
];
const ROCK = ['...1111...','..134431..','.13443321.','1343333221','1233322221','.12222211.','..111111..'];
const CRYSTAL = [
  '.....01......','....0431.....','....0431..01.','.01.0431.031.',
  '.03103210331.','.04303210321.','..0323210321.','..0323213210.',
  '...022213210.','....1222210..','...01121110..',
];
const SNAG = [
  '.......02.....','.......12..01.','..01...12..10.','..12...12.10..',
  '...12.01210...','...0121220....','....01210.....','.....1220..01.',
  '.01..1220.110.','..111222110...','....012210....','.....1220.....',
  '.....1220.....','....012210....','...01122110...',
];
const BOULDER_COLORS = ['#495950', '#465650', '#68766a', '#91a08a', '#b1b8a0'];
const FROST_ROCK = ['#546b72', '#526b72', '#738e94', '#a5bbbc', '#d0dbd1'];
const EMBER_ROCK = ['#413c48', '#413c48', '#655462', '#926c72', '#bc8a80'];

function stamp(ctx, rows, x, y, palette, flip = false) {
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const key = line[col];
      if (key === '.') continue;
      ctx.fillStyle = key === 'a' ? '#96704c' : key === 'b' ? '#614f42' : palette[Number(key)];
      ctx.fillRect(Math.floor(x) + (flip ? line.length - col - 1 : col), Math.floor(y) + row, 1, 1);
    }
  });
}

function distanceToRoad(x, y, points) {
  let closest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = x - Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), x));
    const dy = y - Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), y));
    closest = Math.min(closest, dx * dx + dy * dy);
  }
  return Math.sqrt(closest);
}

function riverCenter(y, height, bends) {
  const t = Math.max(0, Math.min(bends.length - 1, y / height * (bends.length - 1)));
  const i = Math.floor(t), f = t - i;
  return TILE * (bends[i] + (bends[Math.min(bends.length - 1, i + 1)] - bends[i]) * f)
    + Math.round(2.5 * Math.sin(y / 7) + 3 * Math.sin(y / 19));
}

function drawPad(ctx, x, y) {
  // 倒角台基在塔的轮廓外保留一圈，建造后仍可辨认原塔位。
  const slab = (color, dx, dy, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx + 2, y + dy, w - 4, h);
    ctx.fillRect(x + dx, y + dy + 2, w, h - 4);
    ctx.fillRect(x + dx + 1, y + dy + 1, w - 2, h - 2);
  };
  slab('#516449', 0, 3, 16, 12);
  slab('#44574a', 0, 1, 16, 13);
  slab('#a79b72', 1, 1, 14, 11);
  slab('#e9d397', 1, 0, 14, 10);
  slab('#a69970', 2, 2, 12, 9);
  slab('#837f60', 3, 3, 10, 7);
  ctx.fillStyle = '#fff0ac';
  ctx.fillRect(x + 7, y + 4, 2, 5); ctx.fillRect(x + 5, y + 6, 6, 1);
  ctx.fillStyle = '#756f55';
  ctx.fillRect(x + 4, y + 12, 2, 1); ctx.fillRect(x + 11, y + 11, 2, 1);
}

export function paintTerrain(map, stage) {
  const canvas = document.createElement('canvas');
  canvas.width = map.cols * TILE;
  canvas.height = map.rows * TILE;
  const ctx = canvas.getContext('2d');
  const {width, height} = canvas;
  const colors = BIOMES[stage.biome];
  const random = seededRandom([...stage.id].reduce((n, c) => n * 31 + c.charCodeAt(0), 13));
  const points = map.waypoints.map(p => ({x: (p.col + .5) * TILE, y: (p.row + .5) * TILE}));
  const sites = stage.sites.map(([col, row]) => ({x: (col + .5) * TILE, y: (row + .5) * TILE}));
  const pixels = ctx.createImageData(width, height);
  const bridge = stage.biome === 'ember'
    ? ['#4c424c', '#aa8882', '#66535b', '#a38783', '#867077']
    : ['#614939', '#ecc184', '#7b5844', '#c69564', '#a87954'];
  const rgb = Object.fromEntries([...colors.grass, ...colors.water, ...colors.road, colors.bank, colors.sprig, colors.shade]
    .map(hex => [hex, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))]));
  const waterDistance = (x, y) => Math.abs(x - riverCenter(y, height, stage.river)) - (9 + Math.round(2 * Math.sin(y / 11)));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = Math.sin(x / 29 + Math.cos(y / 18)) + Math.sin(y / 13 + x / 34) + Math.cos(x / 11 - y / 15) * .35;
      let color = colors.grass[n < -.85 ? 0 : n < .1 ? 1 : n < 1.1 ? 2 : 3];
      const water = waterDistance(x, y);
      if (water < 2) {
        color = water < -4 ? colors.water[1] : water < -2 ? colors.water[2] :
          water < 0 ? colors.water[0] : colors.bank;
        if (water < -3 && (y + Math.floor(x / 13)) % 9 === 0 && (x + y * 2) % 17 < 6) color = colors.water[3];
      }
      const d = distanceToRoad(x, y, points) + .45 * Math.sin(x * .68 + Math.floor(y / 2));
      if (d < 7.9) {
        color = d > 7.1 ? colors.road[0] : d > 6 ? colors.road[1] : d > 4.7 ? colors.road[2] : colors.road[3];
        if (d < 6 && random() < .055) color = random() < .55 ? colors.road[2] : colors.road[4];
        if (water < 3) {
          color = bridge[d > 6.3 ? 0 : d > 5.5 ? 1 : x % 4 === 0 ? 2 : x % 4 === 1 ? 3 : 4];
        }
      }
      const i = (y * width + x) * 4;
      if (!rgb[color]) rgb[color] = [1, 3, 5].map(j => parseInt(color.slice(j, j + 2), 16));
      pixels.data.set(rgb[color], i); pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);

  const clearLand = (x, y, radius) => waterDistance(x, y) > radius &&
    distanceToRoad(x, y, points) > 8 + radius &&
    sites.every(p => Math.abs(p.x - x) > radius + 8 || Math.abs(p.y - y) > radius + 7);

  // 草簇、野花与叠石留出路面和石座，林缘按纵深绘制。
  for (let i = 0; i < 1700; i++) {
    const x = Math.floor(random() * width), y = Math.floor(random() * height);
    if (!clearLand(x, y, 1)) continue;
    ctx.fillStyle = random() > .45 ? colors.sprig : colors.shade;
    ctx.fillRect(x, y, 2, 1);
    if (random() > .4) { ctx.fillRect(x + 2, y - 2, 1, 2); ctx.fillRect(x + 4, y - 1, 1, 1); }
    if (random() > .95) { ctx.fillStyle = colors.bloom; ctx.fillRect(x + 1, y - 2, 2, 2); }
  }
  const scenery = [];
  for (let y = 0; y < height + 9; y += 9) {
    for (let x = -4; x < width + 8; x += 10) {
      const cx = Math.floor(x + random() * 8), cy = Math.floor(y + random() * 8);
      if (!clearLand(cx, cy - 5, 6) || !clearLand(cx, cy - 12, 3)) continue;
      const grove = Math.sin(cx / 22 + cy / 37) + Math.cos(cy / 12 - cx / 39);
      const edge = Math.min(cx, cy, width - cx, height - cy);
      if (random() < (edge < 18 ? .91 : grove > .1 ? .65 : .15)) {
        scenery.push({x: cx, y: cy, tree: true, oak: random() < (stage.biome === 'autumn' ? .65 : .2), flip: random() < .45});
      } else if (random() < .22) scenery.push({x: cx, y: cy, tree: false});
    }
  }
  for (const prop of scenery.sort((a, b) => a.y - b.y)) {
    const {x, y} = prop;
    ctx.fillStyle = colors.shade; ctx.fillRect(x - 4, y - 1, 13, 3);
    if (prop.tree) {
      let art = prop.oak ? OAK : PINE;
      if (stage.biome === 'frost' && prop.oak) art = CRYSTAL;
      if (stage.biome === 'ember' && !prop.oak) art = SNAG;
      stamp(ctx, art, x - 7, y - art.length + 1, colors.tree, prop.flip);
    } else {
      const palette = stage.biome === 'frost' ? FROST_ROCK : stage.biome === 'ember' ? EMBER_ROCK : BOULDER_COLORS;
      stamp(ctx, ROCK, x - 5, y - 6, palette);
    }
  }
  for (const p of sites) {
    if (waterDistance(p.x, p.y) < 7) {
      const palette = stage.biome === 'ember' ? EMBER_ROCK : BOULDER_COLORS;
      stamp(ctx, ROCK, p.x - 10, p.y + 2, palette);
      stamp(ctx, ROCK, p.x + 1, p.y + 3, palette, true);
    }
    drawPad(ctx, p.x - 8, p.y - 6);
  }

  // 路口的两面朱旗与基地旗帜呼应。箭头始终朝向第一段路线。
  const entranceY = points[0].y;
  for (const offset of [-10, 10]) {
    ctx.fillStyle = '#4a4537'; ctx.fillRect(4, entranceY + offset - 6, 2, 8);
    ctx.fillStyle = '#eab575'; ctx.fillRect(4, entranceY + offset - 6, 1, 7);
    ctx.fillStyle = '#a75140'; ctx.fillRect(6, entranceY + offset - 6, 6, 4);
    ctx.fillStyle = '#ed9360'; ctx.fillRect(6, entranceY + offset - 6, 5, 1);
  }
  ctx.fillStyle = '#866845';
  for (const x of [4, 9]) {
    ctx.fillRect(x, entranceY - 2, 2, 1); ctx.fillRect(x + 2, entranceY - 1, 1, 3);
    ctx.fillRect(x, entranceY + 2, 2, 1);
  }
  return canvas;
}
