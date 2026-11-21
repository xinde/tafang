// 战场原生画幅 320 × 192，单格 16 像素。静态地形在进入关卡时绘制一次。
import { CONFIG } from '../config.js';
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
  meadow: {
    grass: ['#968143','#a49048','#b19b4f','#c0a655'], sprig: '#e1c873', shade: '#857c42',
    tree: ['#5b573a','#86743d','#ae9142','#d8b653','#f5d781'],
    water: ['#3d655e','#53847b','#69a098','#a8c5af'], bank: '#b9a773',
    road: ['#776446','#aa8f62','#c9ad7b','#dcc399','#f0d5a4'], bloom: '#de8051',
  },
  coast: {
    grass: ['#ad9d72','#c5b584','#d5c28e','#dfcd9b'], sprig: '#e8dba9', shade: '#a59770',
    tree: ['#33594f','#437565','#59977a','#83af7b','#aed08b'],
    water: ['#367d84','#399d9f','#65bfc0','#c5ebe0'], bank: '#f1e1aa',
    road: ['#7a6657','#986f56','#b58b65','#cda075','#e7b384'], bloom: '#e4a28c', waterWidth: 17,
  },
  marsh: {
    grass: ['#455c52','#506756','#59745a','#65805d'], sprig: '#83a369', shade: '#394f4d',
    tree: ['#2c4648','#385d53','#4a7658','#77965c','#a7b96b'],
    water: ['#2e525b','#36696d','#4a8381','#7da29a'], bank: '#88916c',
    road: ['#5b5744','#978260','#b09671','#c7b18a','#e0c497'], bloom: '#e6d674', waterWidth: 14,
  },
  bamboo: {
    grass: ['#527657','#5c815b','#668d60','#719966'], sprig: '#9bbd77', shade: '#46674d',
    tree: ['#2a5146','#3c6a4a','#548651','#83a95d','#b4cc78'],
    water: ['#3b6d6a','#498783','#63a49b','#9ac7ae'], bank: '#acab78',
    road: ['#675f4d','#97876c','#b8a67e','#cebb94','#e3d0a2'], bloom: '#ebcb8c',
  },
  desert: {
    grass: ['#bf8356','#ce925c','#d69d65','#dfaa70'], sprig: '#ead193', shade: '#af7851',
    tree: ['#485349','#536b56','#6c8764','#92a577','#bfbd84'],
    water: ['#895a49','#9a6953','#af7a58','#ce9264'], bank: '#edbf85',
    road: ['#816451','#a67e62','#c69f76','#e1c194','#f3d8a4'], bloom: '#c96b54', waterWidth: 8,
  },
  crystal: {
    grass: ['#423e53','#4a465b','#524c62','#5c546a'], sprig: '#81758e', shade: '#373849',
    tree: ['#423754','#675180','#8a659d','#bb91cb','#efcbe8'],
    water: ['#383d5b','#46517b','#6075a0','#99a5d0'], bank: '#827b99',
    road: ['#504755','#7d6e78','#a39797','#beafa4','#dac8af'], bloom: '#d6b1dc', waterWidth: 8,
  },
  cliff: {
    grass: ['#7f8e7c','#899b81','#96a88b','#a0ae8e'], sprig: '#becc9c', shade: '#737f73',
    tree: ['#596f72','#778e8a','#97a69a','#bbc2aa','#e1ddc4'],
    water: ['#728e9c','#99b5c2','#bcd2d7','#e4e8df'], bank: '#ddd7b8',
    road: ['#676c60','#918c75','#b0a58a','#c9b99a','#e6d4ae'], bloom: '#eee5ac', waterWidth: 15,
  },
  ruins: {
    grass: ['#424c5c','#495465','#535e70','#5b6577'], sprig: '#818f9c', shade: '#37414f',
    tree: ['#404657','#5b6479','#7b8494','#a8afba','#d0d3cd'],
    water: ['#353e5b','#435779','#5a7091','#96a4bd'], bank: '#8a8f98',
    road: ['#50525e','#807981','#a89a96','#c2b4a6','#d9cbb4'], bloom: '#ded499',
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

const WHEAT = [
  '..4...4....','..34.43..4.','..43434.43.','.4.323.434.',
  '.34323.32..','..3232.32.4','...22223243','..33223232.',
  '...122232..','....12120..','.....110...',
];
const BALE = [
  '....1111111.....','..12333333311...','.1234343343211..','123443443432231.',
  '123223333332231.','123323333332321.','122232323332221.','.1222232222211..','..01111111110...',
];
const PALM = [
  '...023210..012...','..13443210123210.','.13...12334333210','......1234332..10',
  '..01233221343210.','.12321..b1..23210','0121...ab....3310',
  '01.....ab......10','......abb........','......ab.........','.....abb.........','.....ab..........',
  '....abb..........','...0bbb0.........',
];
const REEDS = [
  '...a.....a..','...b..4..b..','..4b..34.b.4','..32.432.b32',
  '.432.432432.','.232.23232..','..23222232..','..12222120..','...012110...',
];
const WILLOW = [
  '.....011110....','...012333210...','..12343433221..','.1233334333221.',
  '.1323233323212.','13212323232122.','12.1221b3212.2.','12.1.2ab21.2.1.',
  '.1...2ab1..1...','.....abb.......','....aabb.......','...0bbbb0......',
];
const BAMBOO = [
  '....43.....32..','....32..3..32..','.43232.32..43..','..2332.43..32..',
  '....43.32.2332.','....32.32..232.','..2332.432..32.','.32143.32..43..',
  '....32.32..3234','....32.43..322.','..2343.32..32..','....32.32..43..',
  '....32.432.32..','....21021..21..',
];
const CACTUS = [
  '.....121.....','....13421....','....13421.12.','.12.13421.32.',
  '.32.13421.32.','.32.13421232.','.23213422321.','..122342111..',
  '...113421....','....13421....','....12321....','....01210....',
];
const SPIRE = [
  '......01.....','......321....','.....13421...','.....13421...',
  '....1234321..','....1233321..','...01233321..','...123323221.',
  '..01233222321','..12322322221','.012222211110','..011111110..',
];
const COLUMN = [
  '...1221..11..','..134421321..','..122332221..','...132321....',
  '...132321....','...122331....','...132321....','...132321....',
  '..12333221...','.1344433221..','.1222222211..','..01111110...',
];
const ARCH = [
  '...01111111....','..1234423321...','.134332233321..','132210..12321..',
  '1321.....1321..','1231.....1231..','1321.....121...','1321.....11....',
  '1231.....121...','12321...12321..','01110...01110..',
];
const SEA_ROCK = ['#526966','#596c66','#77877b','#acaa8e','#dad0a1'];
const SAND_ROCK = ['#875c4d','#8d5e4e','#b07855','#d49767','#e9b882'];
const CAVE_ROCK = ['#403b50','#4d455b','#695a78','#877390','#a78eae'];
const SCENERY = {
  forest: {main: PINE, accent: OAK}, autumn: {main: PINE, accent: OAK, accentChance: .65},
  frost: {main: PINE, accent: CRYSTAL, rock: FROST_ROCK}, ember: {main: SNAG, accent: OAK, rock: EMBER_ROCK},
  meadow: {main: WHEAT, accent: BALE, accentChance: .16},
  coast: {main: PALM, accent: REEDS, rock: SEA_ROCK, density: .57},
  marsh: {main: REEDS, accent: WILLOW, accentChance: .27},
  bamboo: {main: BAMBOO, accent: OAK, accentChance: .12},
  desert: {main: CACTUS, accent: SPIRE, accentColors: SAND_ROCK, rock: SAND_ROCK, density: .50},
  crystal: {main: CRYSTAL, accent: SPIRE, accentColors: CAVE_ROCK, rock: CAVE_ROCK},
  cliff: {main: SPIRE, accent: PINE, accentColors: BIOMES.forest.tree, rock: FROST_ROCK, density: .67},
  ruins: {main: COLUMN, accent: ARCH, accentChance: .28, rock: CAVE_ROCK, density: .56},
};

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

// 地图册只需要看清路线、塔位和终点，无须为每张缩略图绘制完整战场。
export function paintRoutePreview(stage) {
  const tile = 5, canvas = document.createElement('canvas');
  canvas.width = CONFIG.COLS * tile; canvas.height = CONFIG.ROWS * tile;
  const ctx = canvas.getContext('2d'), colors = BIOMES[stage.biome];
  ctx.fillStyle = colors.grass[1]; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colors.water[1];
  for (let y = 0; y < canvas.height; y++) {
    const center = riverCenter(y * TILE / tile, CONFIG.ROWS * TILE, stage.river) * tile / TILE;
    ctx.fillRect(Math.round(center) - 3, y, 7, 1);
  }
  ctx.beginPath();
  for (const [i, p] of stage.waypoints.entries()) {
    const x = p.col * tile + 2.5, y = p.row * tile + 2.5;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineJoin = 'round'; ctx.strokeStyle = colors.road[0]; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = colors.road[3]; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fbdd96';
  for (const [col,row] of stage.sites) ctx.fillRect(col * tile + 1, row * tile + 1, 3, 3);
  ctx.fillStyle = '#bc563f'; ctx.fillRect(0, stage.waypoints[0].row * tile, 3, 5);
  const bx = stage.baseCell.col * tile, by = stage.baseCell.row * tile;
  ctx.fillStyle = '#25363b'; ctx.fillRect(bx - 1, by - 1, 7, 7);
  ctx.fillStyle = '#e7e9cd'; ctx.fillRect(bx, by, 5, 4);
  return canvas;
}

const GROUND_TEXTURE = {
  meadow: (x, y) => ((x + Math.floor(y / 20) * 3) % 6 < 2 ? -.95 : .15),
  desert: (x, y) => .9 * Math.sin(y / 3 + 2 * Math.sin(x / 26)),
  crystal: (x, y) => .8 * Math.sin((x - y * 1.7) / 5),
  cliff: (x, y) => .65 * Math.sin(x / 4 + Math.floor(y / 6) * .55),
  ruins: (x, y) => (y % 7 === 0 || (x + Math.floor(y / 7) * 5) % 13 === 0 ? -1.4 : .1),
};

export function paintTerrain(map, stage) {
  const canvas = document.createElement('canvas');
  canvas.width = map.cols * TILE;
  canvas.height = map.rows * TILE;
  const ctx = canvas.getContext('2d');
  const {width, height} = canvas;
  const colors = BIOMES[stage.biome];
  const props = SCENERY[stage.biome];
  const rockColors = props.rock || BOULDER_COLORS;
  const texture = GROUND_TEXTURE[stage.biome];
  const random = seededRandom([...stage.id].reduce((n, c) => n * 31 + c.charCodeAt(0), 13));
  const points = map.waypoints.map(p => ({x: (p.col + .5) * TILE, y: (p.row + .5) * TILE}));
  const sites = stage.sites.map(([col, row]) => ({x: (col + .5) * TILE, y: (row + .5) * TILE}));
  const pixels = ctx.createImageData(width, height);
  const bridge = ['ember','ruins','crystal','desert'].includes(stage.biome)
    ? ['#4c424c', '#aa8882', '#66535b', '#a38783', '#867077']
    : ['#614939', '#ecc184', '#7b5844', '#c69564', '#a87954'];
  const vertical = new Uint8Array(map.cols * map.rows);
  for (let i = 1; i < map.waypoints.length; i++) {
    const a = map.waypoints[i - 1], b = map.waypoints[i];
    if (a.col === b.col) {
      for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) vertical[row * map.cols + a.col] = 1;
    }
  }
  const rgb = Object.fromEntries([...colors.grass, ...colors.water, ...colors.road, colors.bank, colors.sprig, colors.shade]
    .map(hex => [hex, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))]));
  const channel = Array.from({length: height}, (_, y) => ({
    center: riverCenter(y, height, stage.river),
    width: (colors.waterWidth || 9) + Math.round(2 * Math.sin(y / 11)),
  }));
  const shore = stage.biome === 'coast'
    ? Array.from({length: width}, (_, x) => height - 9 + Math.round(4 * Math.sin(x / 13) + 2 * Math.sin(x / 6)))
    : null;
  const waterDistance = (x, y) => {
    const band = channel[Math.max(0, Math.min(height - 1, y))];
    const river = Math.abs(x - band.center) - band.width;
    return shore && x >= 0 && x < width ? Math.min(river, shore[x] - y) : river;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = Math.sin(x / 29 + Math.cos(y / 18)) + Math.sin(y / 13 + x / 34) + Math.cos(x / 11 - y / 15) * .35 +
        (texture ? texture(x, y) : 0);
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
          const plank = (vertical[Math.floor(y / TILE) * map.cols + Math.floor(x / TILE)] ? y : x) % 4;
          color = bridge[d > 6.3 ? 0 : d > 5.5 ? 1 : plank === 0 ? 2 : plank === 1 ? 3 : 4];
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
    if (stage.biome === 'marsh' && i % 7 === 0 && waterDistance(x, y) < -3 && distanceToRoad(x, y, points) > 11) {
      ctx.fillStyle = colors.tree[2]; ctx.fillRect(x, y, 4, 2);
      ctx.fillStyle = colors.tree[4]; ctx.fillRect(x, y, 2, 1);
    }
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
      if (random() < (edge < 18 ? .91 : grove > .1 ? .65 : .15) * (props.density || 1)) {
        scenery.push({x: cx, y: cy, tree: true, accent: random() < (props.accentChance || .2), flip: random() < .45});
      } else if (random() < .22) scenery.push({x: cx, y: cy, tree: false});
    }
  }
  for (const prop of scenery.sort((a, b) => a.y - b.y)) {
    const {x, y} = prop;
    ctx.fillStyle = colors.shade; ctx.fillRect(x - 4, y - 1, 13, 3);
    if (prop.tree) {
      const art = prop.accent ? props.accent : props.main;
      const palette = prop.accent && props.accentColors ? props.accentColors : colors.tree;
      stamp(ctx, art, x - Math.floor(art[0].length / 2), y - art.length + 1, palette, prop.flip);
    } else {
      stamp(ctx, ROCK, x - 5, y - 6, rockColors);
    }
  }
  for (const p of sites) {
    if (waterDistance(p.x, p.y) < 7) {
      stamp(ctx, ROCK, p.x - 10, p.y + 2, rockColors);
      stamp(ctx, ROCK, p.x + 1, p.y + 3, rockColors, true);
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
