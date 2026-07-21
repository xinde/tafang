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
    this.width = grid.cols * grid.cellSize;
    this.height = grid.rows * grid.cellSize;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
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

  drawGrid() {
    const { ctx, cellSize } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= this.cols; c++) {
      ctx.moveTo(c * cellSize, 0);
      ctx.lineTo(c * cellSize, this.height);
    }
    for (let r = 0; r <= this.rows; r++) {
      ctx.moveTo(0, r * cellSize);
      ctx.lineTo(this.width, r * cellSize);
    }
    ctx.stroke();
  }

  /** 用一组路径点(网格坐标)绘制怪兽行进路径 */
  drawPath(waypoints) {
    const { ctx } = this;
    if (!waypoints || waypoints.length < 2) return;

    // 路径底色（加粗）
    ctx.strokeStyle = '#5a4a2f';
    ctx.lineWidth = this.cellSize * 0.7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    waypoints.forEach((wp, i) => {
      const p = this.cellCenter(wp.col, wp.row);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // 路径中线
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = this.cellSize * 0.4;
    ctx.beginPath();
    waypoints.forEach((wp, i) => {
      const p = this.cellCenter(wp.col, wp.row);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  /** 在指定网格绘制基地 */
  drawBase(col, row) {
    const { ctx, cellSize } = this;
    const { x, y } = this.cellToPx(col, row);
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
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, opts.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, cellSize * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
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
  drawHealthBar(x, y, w, pct, color = '#4caf50') {
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
