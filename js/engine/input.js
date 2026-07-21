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

  /** 把鼠标事件换算为网格坐标；越界返回 null */
  _eventToCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    // 处理 canvas CSS 尺寸与实际分辨率不一致的情况
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
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
