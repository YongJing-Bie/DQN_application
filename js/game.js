/* =========================================================================
 * game.js — Flappy Bird 游戏引擎
 * 状态空间 10 维：鸟Y、速度、管道距离、下1管(上/下/中心/相对)、下2管(上/下/中心)
 * ========================================================================= */

class FlappyGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.debugOverlay = false;

    this.cfg = {
      birdX: 90,
      birdR: 13,
      gravity: 0.225,
      flapImpulse: -3.8,
      maxVel: 5,
      pipeWidth: 62,
      pipeGap: 190,
      pipeSpeed: 1.0,
      pipeInterval: 240,
      groundH: 80,
      maxVelNorm: 6,
      rewardSurvive: 0.001,
      rewardDeath: -1.0,
      gapRewardCoeff: 0.000001,
      gapPenaltyBelow: -0.05,
      gapPenaltyAbove: -0.05,
    };

    this.reset();
  }

  reset() {
    const c = this.cfg;
    this.bird = { x: c.birdX, y: this.H * 0.45, vel: 0 };
    this.pipes = [];
    this.frame = 0;
    this.score = 0;
    this.dead = false;
    this.rewardStats = { survive: 0, gapReward: 0, gapPenalty: 0, gapPenaltyAbove: 0, death: 0, total: 0 };
    this._spawnPipe(this.W + 60);
    this.pipePassedFlag = false;
    return this.getState();
  }

  _spawnPipe(x) {
    const c = this.cfg;
    const margin = 70;
    const gapCenter = margin + Math.random() * (this.H - c.groundH - 2 * margin - c.pipeGap + c.pipeGap / 2);
    this.pipes.push({
      x: x,
      gapCenter: gapCenter,
      gapTop: gapCenter - c.pipeGap / 2,
      gapBottom: gapCenter + c.pipeGap / 2,
      passed: false
    });
  }

  getState() {
    const c = this.cfg;
    const next = this._nextPipe();
    const second = this._secondPipe();
    const distX = next ? (next.x + c.pipeWidth - this.bird.x) : this.W;
    const gapC = next ? next.gapCenter : this.H * 0.5;
    const gapT = next ? next.gapTop : 0;
    const gapB = next ? next.gapBottom : this.H;
    const sGapC = second ? second.gapCenter : this.H * 0.5;
    const sGapT = second ? second.gapTop : 0;
    const sGapB = second ? second.gapBottom : this.H;
    return [
      this.bird.y / this.H,
      Math.max(-c.maxVelNorm, Math.min(c.maxVelNorm, this.bird.vel)) / c.maxVelNorm,
      distX / this.W,
      gapT / this.H,
      gapB / this.H,
      gapC / this.H,
      (gapC - this.bird.y) / this.H,
      sGapT / this.H,
      sGapB / this.H,
      sGapC / this.H
    ];
  }

  _nextPipe() {
    for (const p of this.pipes) {
      if (p.x + this.cfg.pipeWidth > this.bird.x - this.cfg.birdR) return p;
    }
    return this.pipes[this.pipes.length - 1] || null;
  }

  _secondPipe() {
    let foundFirst = false;
    for (const p of this.pipes) {
      if (p.x + this.cfg.pipeWidth > this.bird.x - this.cfg.birdR) {
        if (foundFirst) return p;
        foundFirst = true;
      }
    }
    return this.pipes[this.pipes.length - 1] || null;
  }

  step(action) {
    const c = this.cfg;
    this.frame++;

    if (action === 1) this.bird.vel = c.flapImpulse;
    this.bird.vel += c.gravity;
    if (this.bird.vel > c.maxVel) this.bird.vel = c.maxVel;
    this.bird.y += this.bird.vel;

    for (const p of this.pipes) p.x -= c.pipeSpeed;
    if (this.pipes.length && this.pipes[0].x + c.pipeWidth < 0) this.pipes.shift();
    if (this.frame % c.pipeInterval === 0) this._spawnPipe(this.W + 10);

    for (const p of this.pipes) {
      if (!p.passed && p.x + c.pipeWidth < this.bird.x) {
        p.passed = true;
        this.score++;
        this.pipePassedFlag = true;
      }
    }

    const groundY = this.H - c.groundH;
    let done = false;
    let reward = 0;

    if (this.bird.y + c.birdR >= groundY) { this.bird.y = groundY - c.birdR; done = true; }
    if (this.bird.y - c.birdR <= 0) { this.bird.y = c.birdR; this.bird.vel = 0; }

    for (const p of this.pipes) {
      if (this.bird.x + c.birdR > p.x && this.bird.x - c.birdR < p.x + c.pipeWidth) {
        if (this.bird.y - c.birdR < p.gapTop || this.bird.y + c.birdR > p.gapBottom) {
          done = true;
        }
      }
    }

    const rs = this.rewardStats;

    reward += c.rewardSurvive;
    rs.survive += c.rewardSurvive;

    const next = this._nextPipe();
    if (next && !done) {
      const H_ymax = next.gapTop;
      const H_bottom = next.gapBottom;
      const H_B0 = this.bird.y + c.birdR;

      if (H_B0 < H_ymax) {
        reward += c.gapPenaltyAbove;
        rs.gapPenaltyAbove += c.gapPenaltyAbove;
      } else if (H_B0 < H_bottom) {
        const gapReward = c.gapRewardCoeff * Math.pow(H_ymax - H_B0, 2);
        reward += gapReward;
        rs.gapReward += gapReward;
      } else {
        reward += c.gapPenaltyBelow;
        rs.gapPenalty += c.gapPenaltyBelow;
      }
    }

    if (done) {
      reward += c.rewardDeath;
      rs.death += c.rewardDeath;
    }

    rs.total += reward;
    this.dead = done;
    return { state: this.getState(), reward, done, extra: { score: this.score, rewardStats: { ...rs } } };
  }

  render() {
    const ctx = this.ctx, c = this.cfg, W = this.W, H = this.H;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4ec0ca');
    sky.addColorStop(1, '#bfe6e9');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    this._cloud(70, 90, 26);
    this._cloud(W - 90, 150, 22);

    ctx.fillStyle = '#5b8bb0';
    for (let i = 0; i < 8; i++) {
      const bx = i * (W / 8);
      const bh = 40 + (i % 3) * 22;
      ctx.fillRect(bx, H - c.groundH - bh, W / 8 + 1, bh);
    }

    const nextPipe = this._nextPipe();
    for (const p of this.pipes) this._drawPipe(p, p === nextPipe);

    this._renderGapGuide();

    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, H - c.groundH, W, c.groundH);
    ctx.fillStyle = '#5ac85a';
    ctx.fillRect(0, H - c.groundH, W, 14);

    ctx.fillStyle = '#caa0';
    ctx.strokeStyle = '#b8c06a';
    ctx.lineWidth = 2;
    for (let x = -((this.frame * c.pipeSpeed) % 24); x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, H - c.groundH + 14);
      ctx.lineTo(x + 12, H - c.groundH + c.groundH);
      ctx.stroke();
    }

    this._drawBird();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px Arial';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(this.score, W / 2, 64);
    ctx.fillText(this.score, W / 2, 64);

    this._renderDebug();
  }

  _cloud(x, y, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y + 6, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r, y + 6, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawPipe(p, highlight) {
    const ctx = this.ctx, c = this.cfg, H = this.H;
    const grad = ctx.createLinearGradient(p.x, 0, p.x + c.pipeWidth, 0);
    grad.addColorStop(0, '#5cb85c');
    grad.addColorStop(0.5, '#7ed87e');
    grad.addColorStop(1, '#3e9c3e');
    ctx.fillStyle = grad;
    ctx.fillRect(p.x, 0, c.pipeWidth, p.gapTop);
    ctx.fillRect(p.x - 4, p.gapTop - 26, c.pipeWidth + 8, 26);
    ctx.fillRect(p.x, p.gapBottom, c.pipeWidth, H - c.groundH - p.gapBottom);
    ctx.fillRect(p.x - 4, p.gapBottom, c.pipeWidth + 8, 26);
    ctx.strokeStyle = highlight ? '#e67e22' : '#2f7a2f';
    ctx.lineWidth = highlight ? 3 : 2;
    ctx.strokeRect(p.x, 0, c.pipeWidth, p.gapTop);
    ctx.strokeRect(p.x - 4, p.gapTop - 26, c.pipeWidth + 8, 26);
    ctx.strokeRect(p.x, p.gapBottom, c.pipeWidth, H - c.groundH - p.gapBottom);
    ctx.strokeRect(p.x - 4, p.gapBottom, c.pipeWidth + 8, 26);
  }

  _drawBird() {
    const ctx = this.ctx, c = this.cfg, b = this.bird;
    ctx.save();
    ctx.translate(b.x, b.y);
    const tilt = Math.max(-0.5, Math.min(1.2, b.vel / 8));
    ctx.rotate(tilt);
    ctx.fillStyle = '#f7d51d';
    ctx.beginPath();
    ctx.arc(0, 0, c.birdR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e0a800';
    ctx.beginPath();
    ctx.ellipse(-3, 3, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(7, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f15a24';
    ctx.beginPath();
    ctx.moveTo(c.birdR - 2, -2);
    ctx.lineTo(c.birdR + 8, 0);
    ctx.lineTo(c.birdR - 2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _renderGapGuide() {
    const ctx = this.ctx, c = this.cfg, W = this.W;
    const next = this._nextPipe();
    if (!next) return;

    const H_ymax = next.gapTop;
    const H_bottom = next.gapBottom;
    const H_B0 = this.bird.y + c.birdR;
    const birdX = c.birdX;
    const rightEdge = next.x + c.pipeWidth;

    ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(next.x, H_bottom);
    ctx.lineTo(rightEdge, H_bottom);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 200, 0, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(next.x, H_ymax);
    ctx.lineTo(rightEdge, H_ymax);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(birdX, H_B0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (H_B0 < H_ymax) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(birdX, H_B0);
      ctx.lineTo(birdX, H_ymax);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = `超出H_ymax! ${c.gapPenaltyAbove}/帧`;
      ctx.strokeText(label, birdX + 8, H_B0 - 8);
      ctx.fillText(label, birdX + 8, H_B0 - 8);
    } else if (H_B0 < H_bottom) {
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
      const distStr = `ΔBottom=${(H_bottom - H_B0).toFixed(0)}px`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(birdX, H_B0);
      ctx.lineTo(birdX, H_bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.fillStyle = '#00ff00';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.strokeText(distStr, birdX + 8, (H_B0 + H_bottom) / 2);
      ctx.fillText(distStr, birdX + 8, (H_B0 + H_bottom) / 2);
      const rewardBase = H_ymax - H_B0;
      const gapReward = c.gapRewardCoeff * Math.pow(rewardBase, 2);
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.strokeText(`H_ymax-B0=${rewardBase.toFixed(0)} → +${gapReward.toFixed(1)}`, birdX + 8, H_B0 + 4);
      ctx.fillText(`H_ymax-B0=${rewardBase.toFixed(0)} → +${gapReward.toFixed(1)}`, birdX + 8, H_B0 + 4);
    } else {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(birdX, H_B0);
      ctx.lineTo(birdX, H_bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = `低于H_bottom! ${c.gapPenaltyBelow}/帧`;
      ctx.strokeText(label, birdX + 8, H_B0 + 8);
      ctx.fillText(label, birdX + 8, H_B0 + 8);
    }
  }

  _renderDebug() {
    if (!this.debugOverlay) return;
    const ctx = this.ctx, c = this.cfg, W = this.W, H = this.H;
    const b = this.bird;
    const groundY = H - c.groundH;
    const next = this._nextPipe();

    if (next) {
      const pts = [
        { x: next.x, y: next.gapTop, label: 'P1', color: '#ff4444' },
        { x: next.x + c.pipeWidth, y: next.gapTop, label: 'P2', color: '#ff6644' },
        { x: next.x, y: next.gapBottom, label: 'P3', color: '#44ff44' },
        { x: next.x + c.pipeWidth, y: next.gapBottom, label: 'P4', color: '#66ff44' },
        { x: next.x + c.pipeWidth / 2, y: next.gapCenter, label: 'P5', color: '#ffaa00' }
      ];
      ctx.strokeStyle = 'rgba(255,165,0,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(next.x, next.gapCenter);
      ctx.lineTo(next.x + c.pipeWidth, next.gapCenter);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.textBaseline = 'middle';
      for (const pt of pts) {
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(pt.x - 3, pt.y - 3, 6, 6);
        ctx.fillStyle = pt.color;
        ctx.textAlign = 'left';
        ctx.fillText(`${pt.label}(${pt.x.toFixed(0)},${pt.y.toFixed(0)})`, pt.x + c.pipeWidth + 6, pt.y);
      }
      ctx.strokeStyle = 'rgba(255,170,0,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(next.x + c.pipeWidth / 2, next.gapCenter);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = 'rgba(255,255,0,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, b.y);
    ctx.lineTo(W, b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillStyle = '#ffe600';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const birdLabel = `鸟(${b.x.toFixed(0)}, ${b.y.toFixed(0)}) v=${b.vel.toFixed(2)}`;
    ctx.strokeText(birdLabel, b.x + c.birdR + 4, b.y - 2);
    ctx.fillText(birdLabel, b.x + c.birdR + 4, b.y - 2);

    const state = this.getState();
    const labels = ['鸟Y/H', '速度', '管道距离', '下1上管Y', '下1下管Y', '下1中心Y', '下1相对', '下2上管Y', '下2下管Y', '下2中心Y'];
    const panelX = 8, panelY = groundY + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(panelX - 4, panelY - 2, 146, labels.length * 12 + 6);
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < labels.length; i++) {
      ctx.fillStyle = (i >= 7) ? '#00ffff' : 'rgba(255,255,255,0.85)';
      ctx.fillText(`s[${i}] ${labels[i]}: ${state[i].toFixed(3)}`, panelX, panelY + i * 12);
    }

    if (next) {
      const H_ymax = next.gapTop;
      const H_bottom = next.gapBottom;
      const H_B0 = b.y + c.birdR;
      const aboveGap = H_B0 >= H_ymax && H_B0 < H_bottom;
      const overTop = H_B0 < H_ymax;
      const rewardBase = H_ymax - H_B0;
      const gapReward = aboveGap ? c.gapRewardCoeff * Math.pow(rewardBase, 2) : 0;

      const gapPanelX = W - 150, gapPanelY = groundY + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(gapPanelX - 4, gapPanelY - 2, 146, 74);
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#00ffff';
      ctx.fillText(`H_ymax=${H_ymax.toFixed(0)} H_bottom=${H_bottom.toFixed(0)}`, gapPanelX, gapPanelY);
      ctx.fillStyle = '#ff4444';
      const zone = overTop ? '超出上边界' : (aboveGap ? '间隙内' : '超出下边界');
      ctx.fillText(`B0=${H_B0.toFixed(0)} (${zone})`, gapPanelX, gapPanelY + 12);
      if (aboveGap) {
        ctx.fillStyle = '#00ff00';
        ctx.fillText(`奖励=${gapReward.toFixed(2)}`, gapPanelX, gapPanelY + 24);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`base=${rewardBase.toFixed(0)} coeff=${c.gapRewardCoeff}`, gapPanelX, gapPanelY + 36);
      } else if (overTop) {
        ctx.fillStyle = '#ff6666';
        ctx.fillText(`惩罚=${c.gapPenaltyAbove}/帧`, gapPanelX, gapPanelY + 24);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`above=${c.gapPenaltyAbove}`, gapPanelX, gapPanelY + 36);
      } else {
        ctx.fillStyle = '#ff6666';
        ctx.fillText(`惩罚=${c.gapPenaltyBelow}/帧`, gapPanelX, gapPanelY + 24);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`below=${c.gapPenaltyBelow}`, gapPanelX, gapPanelY + 36);
      }
      ctx.fillStyle = '#ffe600';
      ctx.fillText(`存活+${c.rewardSurvive}/帧`, gapPanelX, gapPanelY + 48);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`Δbottom=${Math.abs(H_bottom - H_B0).toFixed(0)}px`, gapPanelX, gapPanelY + 60);
    }
  }
}

window.FlappyGame = FlappyGame;