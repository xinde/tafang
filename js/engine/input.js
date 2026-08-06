/**
 * Input：处理画布上的鼠标/触摸输入，并把屏幕坐标换算成网格坐标。
 *
 * 桌面端：左键放置、右键出售、mousemove 悬停预览。
 * 移动端：拖拽放置 -- touchstart 开始预览，touchmove 实时跟踪格子，
 *   touchend 确认放置。long-press 出售。吸格判定：靠近已有塔时吸附到该格。
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

    /** 当前悬停/预览的网格单元 {col,row}，不在画布内为 null */
    this.hoverCell = null;

    // 视口变换（与 Renderer 共享）：屏幕像素 -> 逻辑坐标
    this.viewScale = 1;
    this.viewOriginX = 0;
    this.viewOriginY = 0;

    this._onClick = null;
    this._onRightClick = null;
    this._onMove = null;

    // ---- 触摸状态 ----
    this._touchActive = false;       // 是否正在触摸拖拽
    this._touchStartCell = null;     // touchstart 时的网格
    this._touchStartPos = null;      // touchstart 屏幕坐标 {x,y}
    this._longPressTimer = null;
    this._longPressFired = false;
    this._LONG_PRESS_MS = 450;
    this._MOVE_TOLERANCE = 12;

    // ---- 吸格配置 ----
    this._snapTargets = [];          // 吸附目标格子 [{col,row}]，由 main.js 注入
    this._SNAP_RADIUS = 1.5;         // 吸格检测半径（格数）

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
  /** 注册右键回调 */
  onCellRightClick(fn) { this._onRightClick = fn; }
  /** 注册移动/预览回调 */
  onCellMove(fn) { this._onMove = fn; }

  /** 由 main 在 resize 时注入视口变换 */
  setViewport(scale, originX, originY) {
    this.viewScale = scale || 1;
    this.viewOriginX = originX || 0;
    this.viewOriginY = originY || 0;
  }

  /** 由 main.js 注入吸附目标（已放置士兵的格子，用于出售吸附） */
  setSnapTargets(targets) {
    this._snapTargets = targets || [];
  }

  /** 屏幕坐标 -> 网格坐标，越界返回 null */
  _clientToCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const dx = (clientX - rect.left) * scaleX;
    const dy = (clientY - rect.top) * scaleY;
    const x = (dx - this.viewOriginX) / this.viewScale;
    const y = (dy - this.viewOriginY) / this.viewScale;
    let col = Math.floor(x / this.cellSize);
    let row = Math.floor(y / this.cellSize);

    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      // 允许超出边缘半格的容差（手指在格子边缘时仍可命中）
      const fracCol = x / this.cellSize;
      const fracRow = y / this.cellSize;
      if (fracCol < -0.5 || fracCol >= this.cols + 0.5 || fracRow < -0.5 || fracRow >= this.rows + 0.5) return null;
      col = Math.max(0, Math.min(this.cols - 1, col));
      row = Math.max(0, Math.min(this.rows - 1, row));
    }

    // 吸格：如果附近有吸附目标，吸附过去
    const snapped = this._snapToTarget(col, row, x, y);
    return snapped || { col, row };
  }

  /** 检查是否应该吸附到某个目标格子（基于像素距离） */
  _snapToTarget(col, row, x, y) {
    if (this._snapTargets.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const t of this._snapTargets) {
      const cx = t.col * this.cellSize + this.cellSize / 2;
      const cy = t.row * this.cellSize + this.cellSize / 2;
      const d = Math.hypot(x - cx, y - cy);
      const limit = this.cellSize * this._SNAP_RADIUS;
      if (d < limit && d < bestDist) {
        best = { col: t.col, row: t.row };
        bestDist = d;
      }
    }
    return best;
  }

  // ---- 鼠标处理 ----

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

  _eventToCell(e) {
    return this._clientToCell(e.clientX, e.clientY);
  }

  // ---- 触摸处理 ----

  _handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const cell = this._clientToCell(t.clientX, t.clientY);
    this._touchActive = true;
    this._touchStartCell = cell;
    this._touchStartPos = { x: t.clientX, y: t.clientY };
    this._longPressFired = false;

    // 立即更新 hover（实时预览放置位置）
    this.hoverCell = cell;
    if (this._onMove) this._onMove(cell);

    // 启动 long-press 定时器（在已有塔上长按 = 出售）
    if (cell) {
      this._longPressTimer = setTimeout(() => {
        this._longPressFired = true;
        if (this._onRightClick) this._onRightClick(cell);
        if (navigator.vibrate) navigator.vibrate(30);
      }, this._LONG_PRESS_MS);
    }
  }

  _handleTouchMove(e) {
    if (!this._touchActive || e.touches.length !== 1) return;
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

    // 实时更新预览位置
    const cell = this._clientToCell(t.clientX, t.clientY);
    this.hoverCell = cell;
    if (this._onMove) this._onMove(cell);
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    this._clearLongPress();

    if (!this._touchActive) return;
    this._touchActive = false;

    // long-press 已触发则不重复 tap
    if (this._longPressFired) {
      this._longPressFired = false;
      this._touchStartCell = null;
      return;
    }

    // tap = 放置，使用松手时的格子（更准确反映用户意图）
    const cell = this.hoverCell;
    if (cell && this._onClick) {
      this._onClick(cell);
    }
    this._touchStartCell = null;
  }

  _handleTouchCancel() {
    this._clearLongPress();
    this._touchActive = false;
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
