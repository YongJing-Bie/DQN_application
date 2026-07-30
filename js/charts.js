/* =========================================================================
 * charts.js — 轻量折线图（局数 × 近100局平均分）
 *   X 轴：训练局数 episode（从 0 起）
 *   Y 轴：近 100 局平均分
 *   两轴均 5 个刻度，坐标轴范围按数据扩展（nice 对齐）
 * ========================================================================= */

function niceNumber(x, round) {
  if (x <= 0) x = 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}

function niceRange(min, max, ticks = 5) {
  const range = niceNumber(max - min, false);
  const tickSpacing = niceNumber(range / (ticks - 1), true);
  const niceMin = Math.floor(min / tickSpacing) * tickSpacing;
  const niceMax = Math.ceil(max / tickSpacing) * tickSpacing;
  return { min: niceMin, max: niceMax, tickSpacing };
}

class LineChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = [];                  // [{x:episode, y:近100平均分}]
    this.currentMaxX = 0;            // 数据里最后一个点的 x
    this.xMax = 0;                   // 外部指定：X 轴右端到当前局（>= 数据最后点 x）
    this.title = '近100局平局分曲线';
    this._TICKS = 5;
  }

  _syncCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.round(rect.width) || 420;
    const cssH = Math.round(rect.height) || 200;

    if (this._cssW === cssW && this._cssH === cssH && this._dpr === dpr) return;

    this._dpr = dpr;
    this._cssW = cssW;
    this._cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
  }

  /** 外部调用：设置 X 轴右端当前局数（哪怕还没死亡、没新点，轴也会向右推进） */
  setXMax(episodeCount) {
    this.xMax = Math.max(this.xMax, episodeCount | 0, 0);
    this.draw();
  }

  setData(data) {
    this.data = data || [];
    if (this.data.length > 0) {
      this.currentMaxX = this.data[this.data.length - 1].x;
    }
    this.draw();
  }

  draw() {
    this._syncCanvas();
    const ctx = this.ctx;
    const dpr = this._dpr;
    const W = this._cssW, H = this._cssH;

    const padL = Math.max(30, Math.round(W * 0.10));
    const padR = Math.max(8, Math.round(W * 0.03));
    const padT = Math.max(32, Math.round(H * 0.17));
    const padB = Math.max(28, Math.round(H * 0.17));
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(15, 27, 39, 0.4)';
    ctx.fillRect(0, 0, W, H);

    if (!this.data.length) {
      ctx.fillStyle = '#7f9db5';
      ctx.font = '13px "Microsoft YaHei", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无数据（训练开始后自动更新）', W / 2, H / 2);
      return;
    }

    // —— 轴范围：X 从 0 到当前局（没死亡时也会推进）；Y 从 0 到 nice 最大值 ——
    const xmin = 0;
    const xmax = Math.max(this.currentMaxX, this.xMax, 1);
    const ys = this.data.map(d => d.y);
    const rawYmax = Math.max(...ys, 1);
    const nice = niceRange(0, rawYmax * 1.05, this._TICKS);
    const ymin = 0;
    const ymax = Math.max(nice.max + nice.tickSpacing, 1);

    const x2p = x => padL + ((x - xmin) / (xmax - xmin)) * plotW;
    const y2p = y => padT + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

    // —— Y 轴网格 + 标签（5 刻度）——
    ctx.strokeStyle = 'rgba(90, 120, 150, 0.3)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#90adc2';
    ctx.font = '11px "Consolas", "Microsoft YaHei", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yStep = nice.tickSpacing;
    let tv = nice.min;
    while (tv <= ymax + 1e-9) {
      const py = y2p(tv);
      if (py >= padT - 1 && py <= padT + plotH + 1) {
        ctx.beginPath();
        ctx.moveTo(padL, py);
        ctx.lineTo(padL + plotW, py);
        ctx.stroke();
        const label = (tv % 1 === 0) ? tv.toFixed(0) : tv.toFixed(1);
        ctx.fillText(label, padL - 6, py);
      }
      tv += yStep;
    }

    // —— X 轴刻度（5 等分，episode 整数）——
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= this._TICKS; i++) {
      const v = xmin + (xmax - xmin) * i / this._TICKS;
      const px = padL + plotW * i / this._TICKS;
      ctx.fillText(Math.round(v).toString(), px, padT + plotH + 5);
    }

    // 坐标轴
    ctx.strokeStyle = '#4a7a9a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // 折线 + 渐变填充
    if (this.data.length > 0) {
      ctx.strokeStyle = '#3f9ed6';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < this.data.length; i++) {
        const px = x2p(this.data[i].x);
        const py = y2p(this.data[i].y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      const lastX = x2p(this.data[this.data.length - 1].x);
      const firstX = x2p(this.data[0].x);
      ctx.lineTo(lastX, padT + plotH);
      ctx.lineTo(firstX, padT + plotH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, 'rgba(63, 158, 214, 0.3)');
      grad.addColorStop(1, 'rgba(63, 158, 214, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // 数据点
      ctx.fillStyle = '#ffd66b';
      for (let i = 0; i < this.data.length; i++) {
        const px = x2p(this.data[i].x);
        const py = y2p(this.data[i].y);
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 标题
    ctx.fillStyle = '#b8d0df';
    ctx.font = 'bold 12px "Microsoft YaHei", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const titleY = Math.max(6, Math.round(padT * 0.18));
    ctx.fillText(this.title, padL, titleY);
  }
}

window.LineChart = LineChart;
