/**
 * Input：处理画布上的鼠标/触摸输入，并把屏幕坐标换算成网格坐标。
 * 通过回调把事件暴露给游戏层，游戏层决定如何响应（如放置士兵）。
 */
export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{cellSize:number, cols:number, rows:number}} grid
   */
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.cellSize = grid.cellSize;
    this.cols = grid.cols;
    this.rows = grid.rows;

    /** 鼠标当前所在的网格单元 {col,row}，不在画布内为 null */
    this.hoverCell = null;

    // 视口变换（与 Renderer 共享）：屏幕像素 -> 逻辑坐标
    this.viewScale = 1;
    this.viewOriginX = 0;
    this.viewOriginY = 0;

    this._onClick = null;
    this._onRightClick = null;
    this._onMove = null;

    canvas.addEventListener('click', (e) => this._handleClick(e));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // 屏蔽系统右键菜单，用于"出售士兵"
      this._handleRightClick(e);
    });
    canvas.addEventListener('mousemove', (e) => this._handleMove(e));
    canvas.addEventListener('mouseleave', () => {
      this.hoverCell = null;
      // 同步通知订阅方悬停已清空（接口承诺回调可收 null）
      if (this._onMove) this._onMove(null);
    });
  }

  /** 注册点击回调，参数为网格坐标 {col,row} */
  onCellClick(fn) { this._onClick = fn; }

  /** 注册右键回调，参数为网格坐标 {col,row} */
  onCellRightClick(fn) { this._onRightClick = fn; }

  /** 注册移动回调，参数为网格坐标 {col,row} 或 null */
  onCellMove(fn) { this._onMove = fn; }

  /** 由 main 在 resize 时注入：与 Renderer 一致的等比缩放与居中偏移 */
  setViewport(scale, originX, originY) {
    this.viewScale = scale || 1;
    this.viewOriginX = originX || 0;
    this.viewOriginY = originY || 0;
  }

  /** 把鼠标事件换算为网格坐标；越界返回 null */
  _eventToCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    // canvas CSS 尺寸与实际分辨率（含 DPR）的比例
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    // 先到画布像素坐标，再反推逻辑坐标（扣除居中偏移、除以等比缩放）
    const dx = (e.clientX - rect.left) * scaleX;
    const dy = (e.clientY - rect.top) * scaleY;
    const x = (dx - this.viewOriginX) / this.viewScale;
    const y = (dy - this.viewOriginY) / this.viewScale;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  _handleClick(e) {
    const cell = this._eventToCell(e);
    if (cell && this._onClick) this._onClick(cell);
  }

  _handleRightClick(e) {
    const cell = this._eventToCell(e);
    if (cell && this._onRightClick) this._onRightClick(cell);
  }

  _handleMove(e) {
    this.hoverCell = this._eventToCell(e);
    if (this._onMove) this._onMove(this.hoverCell);
  }
}
