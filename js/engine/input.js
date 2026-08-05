/**
 * Input：处理画布上的鼠标/触摸输入，并把屏幕坐标换算成网格坐标。
 * 通过回调把事件暴露给游戏层，游戏层决定如何响应（如放置士兵）。
 *
 * 桌面端：左键放置、右键出售、mousemove 悬停预览。
 * 移动端：tap 放置、long-press 出售、touchmove 悬停预览。
 * 触摸时阻止合成鼠标事件，避免双触发。
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

    /** 鼠标/触摸当前所在的网格单元 {col,row}，不在画布内为 null */
    this.hoverCell = null;

    // 视口变换（与 Renderer 共享）：屏幕像素 -> 逻辑坐标
    this.viewScale = 1;
    this.viewOriginX = 0;
    this.viewOriginY = 0;

    this._onClick = null;
    this._onRightClick = null;
    this._onMove = null;

    // ---- 触摸状态 ----
    this._touchStartCell = null;     // touchstart 时的网格
    this._touchStartPos = null;      // touchstart 屏幕坐标 {x,y}
    this._longPressTimer = null;     // long-press 定时器
    this._longPressFired = false;    // long-press 已触发标志（防 tap 双触发）
    this._LONG_PRESS_MS = 450;       // long-press 阈值
    this._MOVE_TOLERANCE = 12;       // tap/long-press 允许的移动容差（像素）

    canvas.addEventListener('click', (e) => this._handleClick(e));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._handleRightClick(e);
    });
    canvas.addEventListener('mousemove', (e) => this._handleMove(e));
    canvas.addEventListener('mouseleave', () => {
      this.hoverCell = null;
      if (this._onMove) this._onMove(null);
    });

    // ---- 触摸事件 ----
    canvas.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', () => this._handleTouchCancel());
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

  /** 把事件换算为网格坐标；越界返回 null */
  _eventToCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const dx = (e.clientX - rect.left) * scaleX;
    const dy = (e.clientY - rect.top) * scaleY;
    const x = (dx - this.viewOriginX) / this.viewScale;
    const y = (dy - this.viewOriginY) / this.viewScale;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  _clientToCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const dx = (clientX - rect.left) * scaleX;
    const dy = (clientY - rect.top) * scaleY;
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

  // ---- 触摸处理 ----

  _handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault(); // 阻止滚动/缩放
    const t = e.touches[0];
    const cell = this._clientToCell(t.clientX, t.clientY);
    this._touchStartCell = cell;
    this._touchStartPos = { x: t.clientX, y: t.clientY };
    this._longPressFired = false;

    // 立即更新 hover（触摸位置即"悬停"位置，供放置预览）
    this.hoverCell = cell;
    if (this._onMove) this._onMove(cell);

    // 启动 long-press 定时器
    if (cell) {
      this._longPressTimer = setTimeout(() => {
        this._longPressFired = true;
        // long-press = 出售（右键语义）
        if (this._onRightClick) this._onRightClick(cell);
        // 触觉反馈（支持的设备）
        if (navigator.vibrate) navigator.vibrate(30);
      }, this._LONG_PRESS_MS);
    }
  }

  _handleTouchMove(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];

    // 移动超过容差则取消 long-press
    if (this._touchStartPos) {
      const dx = t.clientX - this._touchStartPos.x;
      const dy = t.clientY - this._touchStartPos.y;
      if (Math.hypot(dx, dy) > this._MOVE_TOLERANCE) {
        this._clearLongPress();
      }
    }

    // 更新 hover（拖动时实时预览攻击范围）
    const cell = this._clientToCell(t.clientX, t.clientY);
    this.hoverCell = cell;
    if (this._onMove) this._onMove(cell);
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    this._clearLongPress();

    // long-press 已触发则不重复 tap
    if (this._longPressFired) {
      this._longPressFired = false;
      this._touchStartCell = null;
      return;
    }

    // tap = 放置（左键语义），仅当起始位置有效且未移动太远
    if (this._touchStartCell && this._onClick) {
      this._onClick(this._touchStartCell);
    }
    this._touchStartCell = null;
  }

  _handleTouchCancel() {
    this._clearLongPress();
    this._touchStartCell = null;
    this.hoverCell = null;
    if (this._onMove) this._onMove(null);
  }

  _clearLongPress() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }
}
