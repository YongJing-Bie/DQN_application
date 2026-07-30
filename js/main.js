/* =========================================================================
 * main.js — 主控制器
 * 训练循环 / 状态管理 / UI 绑定 / 模型持久化
 * ========================================================================= */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const gameCanvas = $('gameCanvas');
  const lineCanvas = $('lineCanvas');
  const logBox = $('logBox');

  const el = {
    statusBadge: $('statusBadge'),
    statusText: $('statusText'),
    curScore: $('curScore'),
    highScore: $('highScore'),
    curScore2: $('curScore2'),
    highScore2: $('highScore2'),
    statusText2: $('statusText2'),
    episodes: $('episodes'),
    epsilon: $('epsilon'),
    avgScore: $('avgScore'),
    loss: $('loss'),
    bufSize: $('bufSize'),
    btnStart: $('btnStart'),
    btnPause: $('btnPause'),
    btnReset: $('btnReset'),
    btnTest: $('btnTest'),
    btnSave: $('btnSave'),
    btnLoad: $('btnLoad'),
    btnExport: $('btnExport'),
    fileInput: $('fileInput'),
    inLr: $('inLr'),
    inGamma: $('inGamma'),
    inEps: $('inEps'),
    inBatch: $('inBatch'),
    btnApply: $('btnApply'),
    speed: $('speed'),
    speedVal: $('speedVal'),
    testSpeed: $('testSpeed'),
    testSpeedVal: $('testSpeedVal'),
    inSurviveReward: $('inSurviveReward'),
    inDeathPenalty: $('inDeathPenalty'),
    inGapRewardCoeff: $('inGapRewardCoeff'),
    inGapPenaltyBelow: $('inGapPenaltyBelow'),
    inGapPenaltyAbove: $('inGapPenaltyAbove'),
    btnApplyReward: $('btnApplyReward'),
    rewardSurvive: $('rewardSurvive'),
    rewardGapReward: $('rewardGapReward'),
    rewardGapPenalty: $('rewardGapPenalty'),
    rewardGapPenaltyAbove: $('rewardGapPenaltyAbove'),
    rewardDeath: $('rewardDeath'),
    rewardTotal: $('rewardTotal'),
    btnManual: $('btnManual'),
    chkDebug: $('chkDebug'),
    chkRender: $('chkRender'),
    fpsVal: $('fpsVal'),
    manualCount: $('manualCount'),
    // —— A3 下图：当前局未结束的实时分数条 ——
    curEpNo: $('curEpNo'),
    curEpScore: $('curEpScore'),
    curEpHigh: $('curEpHigh'),
    curEpAlive: $('curEpAlive'),
    sv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => $('sv' + i)),
    svRaw: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => $('sv' + i + 'raw')),
    svBirdX: $('svBirdX'),
    svBirdY: $('svBirdY'),
    svBirdV: $('svBirdV'),
    svP: [
      { x: $('svP1x'), y: $('svP1y') },
      { x: $('svP2x'), y: $('svP2y') },
      { x: $('svP3x'), y: $('svP3y') },
      { x: $('svP4x'), y: $('svP4y') },
      { x: $('svP5x'), y: $('svP5y') },
    ],
  };

  const game = new FlappyGame(gameCanvas);
  let agent = new DQNAgent({ stateSize: 10, actionSize: 2 });

  const lineChart = new LineChart(lineCanvas);

  /* ========================================================================
   * 训练曲线：局数 × 近100局平均分
   *   - 每死亡 3 局记录一次（鸟飞很久不死也不会额外硬塞点进曲线）
   *   - 渲染点最多保留 100 个：超过后从总点数按「均匀间隔 + 向下取整」
   *     抽样（不是桶平均，保持真实点的分布）
   *   - X 轴右端随当前局数持续推进（即使还没死亡没新点也会走），
   *     配合 A3 下图的「当前局未结束」显示，一眼能看出为什么曲线没更新
   * ====================================================================== */
  const curveData = [];          // [{x:episode, y:近100平均分}]
  const MAX_CHART_POINTS = 100;  // 渲染最多 100 个点（超过后等间隔抽样）

  /**
   * 降采样：超过 MAX_CHART_POINTS 个点时，按「等间隔 + 向下取整」抽取索引，
   * 始终包含最后一个点。例子：共 2231 个点 → 需要间隔 2231/100=22.31 →
   * 向下取整为 22 → 取第 0, 22, 44, ..., 2200, 2230 个（末尾补齐）
   */
  function downsampleUniform(data, n) {
    if (data.length <= n) return data;
    const step = Math.floor(data.length / n);  // 向下取整的间隔
    const out = [];
    for (let i = 0; i < data.length; i += step) out.push(data[i]);
    // 保证包含最后一个点（避免步长取整让最后一段丢了）
    if (out[out.length - 1] !== data[data.length - 1]) out.push(data[data.length - 1]);
    // 若还是略超 n（通常只会多 1 个），再去掉开头的冗余
    if (out.length > n) out.splice(0, out.length - n);
    return out;
  }

  /** 推入一个点（自动做去重：同一 episode 不重复写入） */
  function _pushChartPoint(ep, avg) {
    if (curveData.length && curveData[curveData.length - 1].x === ep) return;
    curveData.push({ x: ep, y: avg });
    lineChart.setData(downsampleUniform(curveData, MAX_CHART_POINTS));
  }

  /** 重置时清空曲线数据（并把 X 轴上限归零） */
  function _resetChart() {
    curveData.length = 0;
    lineChart.xMax = 0;
    lineChart.setData([]);
  }

  let recentScores = [];  // 近 100 局得分（UI 近100平均 & 曲线Y值共用）
  let curEpisodeHigh = 0; // 当前局未结束时的本局最高分（用于 A3 下图展示）

  let mode = 'idle';
  let running = false;
  let rafId = null;
  let trainTimerId = null;
  let stepsPerFrame = 4;
  let testStepsPerFrame = 2;   // 演示/测试模式速度倍数（默认2倍）
  let lastRender = 0;
  const RENDER_INTERVAL = 33;

  let manualAction = 0;
  let manualSamples = 0;
  let totalManualSamples = 0;

  let fpsFrames = 0;
  let fpsLastTime = 0;
  let fps = 0;

  let episodeCount = 0;
  let highScore = 0;
  let episodeScore = 0;
  let episodeSteps = 0;
  let currentState = null;

  // 主循环 dt 计算（可选复用；当前保底时间采样用 now 本身）
  let _lastLoopTs = 0;

  function init() {
    currentState = game.reset();
    bindEvents();
    try {
      const raw = localStorage.getItem('flappy_dqn');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.stateSize !== 10) {
          log(`检测到旧版 ${data.stateSize} 维模型，当前需要 10 维，已创建新模型。`);
        } else {
          agent = DQNAgent.deserialize(data);
          syncHyperUI();
          log('已自动加载上次保存的模型。');
        }
      } else {
        log('系统就绪，点击「开始训练」启动学习。');
      }
    } catch (e) {
      log('系统就绪，点击「开始训练」启动学习。');
    }
    renderAll();
  }

  function loop(ts) {
    if (!running) return;
    const now = ts || performance.now();
    _lastLoopTs = now;

    if (mode === 'train') {
      for (let i = 0; i < stepsPerFrame; i++) runStep(true);
    } else if (mode === 'test') {
      for (let i = 0; i < testStepsPerFrame; i++) runStep(false);
    } else if (mode === 'manual') {
      runStepManual();
      manualAction = 0;
    }

    // 训练/测试模式：让曲线 X 轴右端跟上当前局数（即使还没死亡没新点也会推进）
    if (mode === 'train' || mode === 'test') lineChart.setXMax(episodeCount);

    fpsFrames++;
    if (now - fpsLastTime >= 500) {
      fps = Math.round(fpsFrames * 1000 / (now - fpsLastTime));
      fpsFrames = 0;
      fpsLastTime = now;
      if (el.fpsVal) el.fpsVal.textContent = fps;
    }

    const renderOn = (mode === 'train') ? el.chkRender.checked : true;

    if (renderOn) {
      if (mode === 'manual' || mode === 'test' || now - lastRender > RENDER_INTERVAL) {
        game.render();
        updateStatusUI();
        lastRender = now;
      }
      rafId = requestAnimationFrame(loop);
    } else {
      if (now - fpsLastTime >= 500 || now - lastRender > RENDER_INTERVAL) {
        updateStatusUI();
        lastRender = now;
      }
      trainTimerId = setTimeout(() => loop(performance.now()), 1);
    }
  }

  function runStepManual() {
    const action = manualAction;
    const res = game.step(action);
    const nextState = res.state;
    agent.remember(currentState, action, res.reward, nextState, res.done);
    manualSamples++;
    totalManualSamples++;
    if (episodeSteps % agent.trainEvery === 0) agent.trainStep();
    currentState = nextState;
    episodeSteps++;
    episodeScore = res.extra.score;
    if (episodeScore > curEpisodeHigh) curEpisodeHigh = episodeScore;

    if (res.done) {
      episodeCount++;
      recentScores.push(episodeScore);
      if (recentScores.length > 100) recentScores.shift();
      /* —— 每 3 局记录一次曲线（手动采集模式同样生效）—— */
      if (episodeCount % 3 === 0) {
        const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        _pushChartPoint(episodeCount, avg);
      }
      if (episodeScore > highScore) {
        highScore = episodeScore;
        log(`[手动] 第 ${episodeCount} 局得分 ${episodeScore}（新纪录！）采集 ${manualSamples} 样本`, true);
      } else {
        log(`[手动] 第 ${episodeCount} 局得分 ${episodeScore}，采集 ${manualSamples} 样本`);
      }
      agent.decayEpsilon();
      manualSamples = 0;
      episodeScore = 0;
      curEpisodeHigh = 0;
      episodeSteps = 0;
      currentState = game.reset();
    }
  }

  function runStep(train) {
    const action = train ? agent.act(currentState, agent.epsilon) : agent.actGreedy(currentState);
    const res = game.step(action);
    const nextState = res.state;
    if (train) {
      agent.remember(currentState, action, res.reward, nextState, res.done);
      if (episodeSteps % agent.trainEvery === 0) agent.trainStep();
    }
    currentState = nextState;
    episodeSteps++;
    episodeScore = res.extra.score;
    if (episodeScore > curEpisodeHigh) curEpisodeHigh = episodeScore;

    if (res.done) {
      episodeCount++;
      recentScores.push(episodeScore);
      if (recentScores.length > 100) recentScores.shift();
      /* —— 每 3 局记录一次曲线（正常死亡触发）—— */
      if (episodeCount % 3 === 0) {
        const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        _pushChartPoint(episodeCount, avg);
      }
      if (episodeScore > highScore) {
        highScore = episodeScore;
        log(`第 ${episodeCount} 局得分 ${episodeScore}（新纪录！）`, true);
      } else if (episodeCount % 5 === 0 || episodeScore >= 5) {
        log(`第 ${episodeCount} 局得分 ${episodeScore}`);
      }
      if (train) {
        agent.decayEpsilon();
      }
      episodeScore = 0;
      curEpisodeHigh = 0;
      episodeSteps = 0;
      currentState = game.reset();
    }
  }

  function updateStatusUI() {
    el.curScore.textContent = game.score;
    el.highScore.textContent = highScore;
    if (el.highScore2) el.highScore2.textContent = highScore;
    if (el.statusText2) el.statusText2.textContent = el.statusText.textContent;
    el.episodes.textContent = episodeCount;
    el.epsilon.textContent = agent.epsilon.toFixed(3);
    const avg = recentScores.length ? (recentScores.reduce((a, b) => a + b, 0) / recentScores.length) : 0;
    el.avgScore.textContent = avg.toFixed(1);
    el.loss.textContent = agent.lastLoss.toFixed(4);
    el.bufSize.textContent = agent.buffer.length;

    // —— A3 下图：当前局未结束的实时分数条 ——
    if (el.curEpNo)    el.curEpNo.textContent = mode === 'idle' ? '—' : (episodeCount + 1);
    if (el.curEpScore) el.curEpScore.textContent = episodeScore | 0;
    if (el.curEpHigh)  el.curEpHigh.textContent = curEpisodeHigh | 0;
    if (el.curEpAlive) {
      if (mode === 'idle') {
        el.curEpAlive.textContent = '未开始';
        el.curEpAlive.style.background = 'rgba(127,157,181,0.12)';
        el.curEpAlive.style.color = '#8aa8c0';
        el.curEpAlive.style.borderColor = 'rgba(127,157,181,0.35)';
      } else {
        el.curEpAlive.textContent = '存活中';
        el.curEpAlive.style.background = '';
        el.curEpAlive.style.color = '';
        el.curEpAlive.style.borderColor = '';
      }
    }

    const rs = game.rewardStats;
    if (rs) {
      el.rewardSurvive.textContent = (rs.survive || 0).toFixed(2);
      el.rewardGapReward.textContent = (rs.gapReward || 0).toFixed(2);
      el.rewardGapPenalty.textContent = (rs.gapPenalty || 0).toFixed(2);
      el.rewardGapPenaltyAbove.textContent = (rs.gapPenaltyAbove || 0).toFixed(2);
      el.rewardDeath.textContent = rs.death.toFixed(2);
      el.rewardTotal.textContent = rs.total.toFixed(2);
    }

    if (el.manualCount) el.manualCount.textContent = totalManualSamples;
    updateStateVectorUI();
  }

  function updateStateVectorUI() {
    const state = game.getState();
    const b = game.bird;
    const c = game.cfg;
    const next = game._nextPipe();
    const second = game._secondPipe();

    const rawVals = [
      b.y,
      b.vel,
      next ? (next.x + c.pipeWidth - b.x) : game.W,
      next ? next.gapTop : 0,
      next ? next.gapBottom : game.H,
      next ? next.gapCenter : game.H * 0.5,
      next ? (next.gapCenter - b.y) : 0,
      second ? second.gapTop : 0,
      second ? second.gapBottom : game.H,
      second ? second.gapCenter : game.H * 0.5
    ];

    for (let i = 0; i < 10; i++) {
      if (el.sv[i]) el.sv[i].textContent = state[i].toFixed(3);
      if (el.svRaw[i]) {
        const suffix = i === 0 || i >= 3 ? 'px' : (i === 1 ? '' : 'px');
        el.svRaw[i].textContent = rawVals[i].toFixed(1) + suffix;
      }
    }

    if (el.svBirdX) el.svBirdX.textContent = b.x.toFixed(0);
    if (el.svBirdY) el.svBirdY.textContent = b.y.toFixed(1);
    if (el.svBirdV) el.svBirdV.textContent = b.vel.toFixed(2);

    if (next) {
      const pts = [
        { x: next.x, y: next.gapTop },
        { x: next.x + c.pipeWidth, y: next.gapTop },
        { x: next.x, y: next.gapBottom },
        { x: next.x + c.pipeWidth, y: next.gapBottom },
        { x: next.x + c.pipeWidth / 2, y: next.gapCenter },
      ];
      for (let i = 0; i < 5; i++) {
        if (el.svP[i].x) el.svP[i].x.textContent = pts[i].x.toFixed(0);
        if (el.svP[i].y) el.svP[i].y.textContent = pts[i].y.toFixed(0);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        if (el.svP[i].x) el.svP[i].x.textContent = '—';
        if (el.svP[i].y) el.svP[i].y.textContent = '—';
      }
    }
  }

  function setStatus(text, color) {
    el.statusText.textContent = text;
    el.statusBadge.style.background = color;
  }

  function renderAll() {
    game.render();
    lineChart.setData(curveData);
    updateStatusUI();
  }

  function startTrain() {
    mode = 'train';
    running = true;
    setStatus('训练中', '#27ae60');
    el.statusText.style.color = '#27ae60';
    if (el.chkRender.checked) {
      log('开始训练...');
      rafId = requestAnimationFrame(loop);
    } else {
      log('开始训练（后台模式）...');
      trainTimerId = setTimeout(() => loop(performance.now()), 1);
    }
  }

  function pause() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId);
      rafId = null; }
    if (trainTimerId) { clearTimeout(trainTimerId);
      trainTimerId = null; }
    setStatus('已暂停', '#e67e22');
    el.statusText.style.color = '#e67e22';
    log('已暂停。');
  }

  function startTest() {
    mode = 'test';
    running = true;
    setStatus('测试中', '#2f6fed');
    el.statusText.style.color = '#2f6fed';
    episodeScore = 0;
    episodeSteps = 0;
    currentState = game.reset();
    log('开始测试，纯贪心策略。');
    rafId = requestAnimationFrame(loop);
  }

  function startManual() {
    mode = 'manual';
    running = true;
    manualAction = 0;
    manualSamples = 0;
    setStatus('手动采集', '#8e44ad');
    el.statusText.style.color = '#8e44ad';
    episodeScore = 0;
    episodeSteps = 0;
    currentState = game.reset();
    log('手动采集模式：空格控制小鸟。');
    rafId = requestAnimationFrame(loop);
  }

  function resetAll() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId);
      rafId = null; }
    if (trainTimerId) { clearTimeout(trainTimerId);
      trainTimerId = null; }
    mode = 'idle';
    agent = new DQNAgent({ stateSize: 10, actionSize: 2 });
    syncHyperUI();
    episodeCount = 0;
    highScore = 0;
    recentScores = [];
    curEpisodeHigh = 0;
    _resetChart();
    _lastLoopTs = 0;
    manualSamples = 0;
    totalManualSamples = 0;
    episodeScore = 0;
    episodeSteps = 0;
    currentState = game.reset();
    setStatus('已重置', '#e74c3c');
    el.statusText.style.color = '#e74c3c';
    log('已重置。');
    renderAll();
  }

  function saveModel() {
    try {
      const data = agent.serialize();
      // 1) localStorage 备份
      localStorage.setItem('flappy_dqn', JSON.stringify(data));
      // 2) 触发下载到本地（固定文件名；若保存到 model/ 目录下会自动覆盖旧文件）
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flappy_model.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
      log(`模型已保存到 localStorage + flappy_model.json（训练步 ${agent.trainSteps}，ε=${agent.epsilon.toFixed(3)}）。`);
    } catch (e) { log('保存失败：' + e.message); }
  }

  function loadModel() {
    try {
      const raw = localStorage.getItem('flappy_dqn');
      if (!raw) { log('未找到已保存的模型。'); return; }
      const data = JSON.parse(raw);
      if (data.stateSize !== 10) {
        log(`模型维度不兼容：需要10维，存储为${data.stateSize}维。`);
        return;
      }
      agent = DQNAgent.deserialize(data);
      syncHyperUI();
      log(`模型已加载（训练步 ${agent.trainSteps}，ε=${agent.epsilon.toFixed(3)}）。`);
      updateStatusUI();
    } catch (e) { log('加载失败：' + e.message); }
  }

  function exportModel() {
    const data = agent.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); // 2026-07-30-14-30-22
    a.href = url;
    a.download = `flappy_model_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
    log(`已导出历史版本：flappy_model_${ts}.json（建议归档到 model/ 目录）。`);
  }

  function importModel(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.stateSize !== 10) {
          log(`导入失败：需要10维，文件为${data.stateSize}维。`);
          return;
        }
        agent = DQNAgent.deserialize(data);
        syncHyperUI();
        log(`已导入模型（训练步 ${agent.trainSteps}）。`);
        updateStatusUI();
      } catch (err) { log('导入失败：' + err.message); }
    };
    reader.readAsText(file);
  }

  function syncHyperUI() {
    el.inLr.value = agent.lr;
    el.inGamma.value = agent.gamma;
    el.inEps.value = agent.epsilon;
    el.inBatch.value = agent.batchSize;
  }

  function applyHyper() {
    const lr = parseFloat(el.inLr.value);
    const gamma = parseFloat(el.inGamma.value);
    const eps = parseFloat(el.inEps.value);
    const batch = parseInt(el.inBatch.value, 10);
    agent.setHyper({ lr, gamma, epsilon: eps, batchSize: batch });
    log(`超参数已应用：α=${lr}, γ=${gamma}, ε=${eps}, batch=${batch}`);
    updateStatusUI();
  }

  function applyReward() {
    const cfg = game.cfg;
    cfg.rewardSurvive = parseFloat(el.inSurviveReward.value);
    cfg.rewardDeath = parseFloat(el.inDeathPenalty.value);
    cfg.gapRewardCoeff = parseFloat(el.inGapRewardCoeff.value);
    cfg.gapPenaltyBelow = parseFloat(el.inGapPenaltyBelow.value);
    cfg.gapPenaltyAbove = parseFloat(el.inGapPenaltyAbove.value);
    log(`奖励参数已应用：存活=${cfg.rewardSurvive}/帧, 死亡=${cfg.rewardDeath}`);
  }

  function log(msg, highlight = false) {
    const now = new Date();
    const t = now.toLocaleTimeString('zh-CN', { hour12: false });
    const line = document.createElement('div');
    line.className = 'log-line' + (highlight ? ' log-hi' : '');
    line.textContent = `[${t}] ${msg}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
    // 限制：只保留最近 50 条
    const MAX_LOG = 50;
    while (logBox.children.length > MAX_LOG) logBox.removeChild(logBox.firstChild);
  }

  function bindEvents() {
    el.btnStart.addEventListener('click', startTrain);
    el.btnPause.addEventListener('click', pause);
    el.btnTest.addEventListener('click', startTest);
    el.btnReset.addEventListener('click', resetAll);
    el.btnManual.addEventListener('click', startManual);
    el.btnSave.addEventListener('click', saveModel);
    el.btnLoad.addEventListener('click', loadModel);
    el.btnExport.addEventListener('click', exportModel);
    el.btnApply.addEventListener('click', applyHyper);
    el.btnApplyReward.addEventListener('click', applyReward);
    el.fileInput.addEventListener('change', e => {
      if (e.target.files[0]) importModel(e.target.files[0]);
      e.target.value = '';
    });
    el.speed.addEventListener('input', e => {
      stepsPerFrame = parseInt(e.target.value, 10);
      el.speedVal.textContent = stepsPerFrame + 'x';
    });
    if (el.testSpeed) {
      testStepsPerFrame = parseInt(el.testSpeed.value, 10);
      el.testSpeed.addEventListener('input', e => {
        testStepsPerFrame = parseInt(e.target.value, 10);
        el.testSpeedVal.textContent = testStepsPerFrame + 'x';
      });
    }
    el.chkDebug.addEventListener('change', e => {
      game.debugOverlay = e.target.checked;
      if (!running) game.render();
    });
    el.chkRender.addEventListener('change', e => {
      if (running && mode === 'train') {
        if (e.target.checked) {
          log('已开启画面渲染。');
        } else {
          log('已关闭画面渲染，后台训练。');
        }
      } else if (!running) {
        game.render();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (mode === 'manual') {
          manualAction = 1;
        } else if (!running) {
          game.step(1);
          game.render();
          updateStatusUI();
        }
      }
    });
  }

  init();

  window.flappyAI = {
    fastTrain(n) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) runStep(true);
      const dt = performance.now() - t0;
      game.render();
      updateStatusUI();
      const avg = recentScores.length ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
      return {
        steps: n, timeMs: dt.toFixed(0),
        episodes: episodeCount, epsilon: agent.epsilon.toFixed(4),
        avgScore: avg.toFixed(2), highScore,
        loss: agent.lastLoss.toFixed(4), bufSize: agent.buffer.length,
        trainSteps: agent.trainSteps
      };
    },
    getStatus() {
      const avg = recentScores.length ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
      return {
        episodes: episodeCount, epsilon: agent.epsilon.toFixed(4),
        avgScore: avg.toFixed(2), highScore,
        loss: agent.lastLoss.toFixed(4), bufSize: agent.buffer.length,
        trainSteps: agent.trainSteps, mode, running
      };
    },
    getLogs() {
      const lines = logBox.querySelectorAll('.log-line');
      const n = Math.min(lines.length, 10);
      const out = [];
      for (let i = lines.length - n; i < lines.length; i++) out.push(lines[i].textContent);
      return out;
    }
  };
})();