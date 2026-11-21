/**
 * Renderer：所有 Canvas 绘制的唯一入口。
 * 游戏层只调用这里的高层绘制方法，不直接操作 ctx，便于后续替换/扩展渲染。
 */
export class Renderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{cellSize:number, cols:number, rows:number}} grid
   */
  constructor(ctx, grid) {
    this.ctx = ctx;
    this.cellSize = grid.cellSize;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.width = grid.cols * grid.cellSize;   // 逻辑宽度（固定 960）
    this.height = grid.rows * grid.cellSize;  // 逻辑高度（固定 576）
    // 视口变换：把逻辑 960×576 居中、等比缩放进实际画布尺寸
    this.viewScale = 1;
    this.viewOriginX = 0;
    this.viewOriginY = 0;
  }

  /** 由 main 在 resize 时注入：逻辑坐标 -> 画布像素坐标的等比缩放与居中偏移 */
  setViewport(scale, originX, originY) {
    this.viewScale = scale || 1;
    this.viewOriginX = originX || 0;
    this.viewOriginY = originY || 0;
  }

  clear() {
    const { ctx } = this;
    // 先重置变换，清空并填满整个画布（含等比缩放后的留白区域），避免残影
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#223634';
    ctx.imageSmoothingEnabled = false;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // 再应用逻辑->显示变换，后续所有绘制使用逻辑坐标
    ctx.setTransform(this.viewScale, 0, 0, this.viewScale, this.viewOriginX, this.viewOriginY);
  }

  /** 网格单元格像素坐标 */
  cellToPx(col, row) {
    return { x: col * this.cellSize, y: row * this.cellSize };
  }

  /** 网格单元格中心像素坐标 */
  cellCenter(col, row) {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2,
    };
  }

  drawTerrain(terrain) {
    this.ctx.drawImage(terrain, 0, 0, this.width, this.height);
  }

  drawRoadCoverage(parts) {
    if (!parts.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of parts) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.lineWidth = 13;
    ctx.strokeStyle = '#224c43cf';
    ctx.stroke();
    ctx.setLineDash([9, 5]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#baf6bf';
    ctx.stroke();
    ctx.restore();
  }

  /** 在指定网格绘制基地 */
  drawBase(col, row, opts = {}) {
    const { ctx, cellSize } = this;
    const { x, y } = this.cellToPx(col, row);
    if (opts.image) {
      const size = cellSize + 12;
      const left = Math.max(0, Math.min(this.width - size, x - 6));
      const top = Math.max(0, Math.min(this.height - size, y - 15));
      ctx.drawImage(opts.image, left, top, size, size);
      return;
    }
    const pad = cellSize * 0.1;
    ctx.fillStyle = '#3b6ea5';
    ctx.fillRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
    ctx.strokeStyle = '#9fc4e8';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
    // 简单标记
    ctx.fillStyle = '#fff';
    ctx.font = `${cellSize * 0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('基', x + cellSize / 2, y + cellSize / 2);
  }

  /** 在指定网格绘制士兵（颜色按武器区分），可选显示攻击范围 */
  drawSoldier(col, row, opts = {}) {
    const { ctx, cellSize } = this;
    const c = this.cellCenter(col, row);
    const color = opts.color || '#4caf50';

    // 攻击范围指示（悬停/选中时）
    if (opts.showRange && opts.range) {
      ctx.fillStyle = 'rgba(221,241,176,0.14)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, opts.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f5e8b2';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 侧视像素单位只左右转身，保持角色直立。
    if (opts.image) {
      const size = cellSize;
      ctx.save();
      ctx.translate(c.x, c.y - 5);
      if (Math.cos(opts.angle ?? 0) < 0) ctx.scale(-1, 1);
      if (opts.ghost) ctx.globalAlpha = .65;
      ctx.drawImage(opts.image, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }

    // 回退：程序化底座 + 炮管（图片未就绪时）
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, cellSize * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 炮管：按 opts.angle 朝向绘制（底座固定、炮塔随发射方向旋转）
    if (opts.angle != null) {
      ctx.save();
      const len = cellSize * 0.42;
      const bx = c.x + Math.cos(opts.angle) * len;
      const by = c.y + Math.sin(opts.angle) * len;
      ctx.strokeStyle = 'rgba(20,20,30,0.85)';
      ctx.lineWidth = Math.max(3, cellSize * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // 炮口
      ctx.fillStyle = 'rgba(20,20,30,0.85)';
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(2, cellSize * 0.07), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 绘制怪兽：有图片则 drawImage，否则回退到 drawCircle；被减速时加一圈寒冰外环 */
  drawMonster(x, y, radius, opts = {}) {
    if (opts.image) {
      const d = Math.round(radius * 2.4);
      const bob = Math.floor((opts.distance || 0) / 7) % 2 * 2;
      this.ctx.drawImage(opts.image, Math.round(x - d / 2), Math.round(y - d / 2) - bob, d, d);
    } else {
      this.drawCircle(x, y, radius, opts.color);
    }
    if (opts.slowed) {
      const { ctx } = this;
      ctx.strokeStyle = 'rgba(95,208,232,0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** 通用线段（弹道轨迹/连线） */
  drawLine(x1, y1, x2, y2, color = '#fff', width = 2) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** 通用血条，x,y 为血条中心，w 为总宽 */
  drawHealthBar(x, y, w, pct, color = '#99d482') {
    const { ctx } = this;
    const h = 5;
    const left = x - w / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.fillStyle = pct > 0.5 ? color : (pct > 0.25 ? '#f0a030' : '#e05555');
    ctx.fillRect(left, y - h / 2, w * Math.max(0, pct), h);
  }

  /** 悬停高亮某个网格 */
  drawHover(col, row, valid = true) {
    const { ctx, cellSize } = this;
    const { x, y } = this.cellToPx(col, row);
    ctx.fillStyle = valid ? 'rgba(255,255,255,0.15)' : 'rgba(255,80,80,0.2)';
    ctx.fillRect(x, y, cellSize, cellSize);
  }

  /** 通用圆形实体绘制，供 monster/combat 模块复用 */
  drawCircle(x, y, radius, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 居中横幅覆盖层（游戏结束/胜利等提示），subtitle 可省略 */
  drawCenterText(title, subtitle) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(title, this.width / 2, this.height / 2 - (subtitle ? 24 : 0));
    if (subtitle) {
      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#cfcfcf';
      ctx.fillText(subtitle, this.width / 2, this.height / 2 + 28);
    }
  }
}
