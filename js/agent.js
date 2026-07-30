/* =========================================================================
 * agent.js — DQN 智能体
 * 经验回放 / 目标网络 / ε-greedy / Double DQN / 势函数塑形
 * ========================================================================= */

class DQNAgent {
  constructor(opts = {}) {
    this.stateSize = opts.stateSize ?? 5;
    this.actionSize = opts.actionSize ?? 2;
    const hidden = opts.hidden ?? [64, 64];
    const sizes = [this.stateSize, ...hidden, this.actionSize];

    this.lr = opts.lr ?? 0.0005;
    this.gamma = opts.gamma ?? 0.95;
    this.epsilon = opts.epsilon ?? 0.01;
    this.epsilonMin = opts.epsilonMin ?? 0.01;
    this.epsilonDecay = opts.epsilonDecay ?? 0.995;
    this.batchSize = opts.batchSize ?? 64;
    this.bufferSize = opts.bufferSize ?? 200000;
    this.targetSync = opts.targetSync ?? 300;
    this.trainEvery = opts.trainEvery ?? 4;

    this.useShaping = opts.useShaping ?? true;
    this.shapeC = opts.shapeC ?? 3.0;

    this.net = new NeuralNetwork(sizes, { lr: this.lr });
    this.target = new NeuralNetwork(sizes, { lr: this.lr });
    this.net.copyTo(this.target);

    this.buffer = [];
    this.bufferPos = 0;
    this.trainSteps = 0;
    this.lastLoss = 0;
  }

  act(state, epsilon = null) {
    const eps = epsilon ?? this.epsilon;
    if (Math.random() < eps) return Math.floor(Math.random() * this.actionSize);
    const q = this.net.predict(state);
    let best = 0;
    for (let i = 1; i < q.length; i++) if (q[i] > q[best]) best = i;
    return best;
  }

  actGreedy(state) {
    const q = this.net.predict(state);
    let best = 0;
    for (let i = 1; i < q.length; i++) if (q[i] > q[best]) best = i;
    return best;
  }

  _potential(s) {
    const proximity = 1 - Math.max(0, Math.min(1, s[2]));
    const misalign = Math.abs(s[6]);
    const yDev = Math.max(0, Math.abs(s[0] - 0.5) - 0.15);
    const survivalWeight = (1 - proximity) * 0.8;
    return -this.shapeC * (misalign * proximity + yDev * survivalWeight);
  }

  remember(s, a, r, sNext, done) {
    let storedR = r;
    if (this.useShaping) {
      const phiS = this._potential(s);
      const phiSNext = done ? 0 : this._potential(sNext);
      storedR = r + this.gamma * phiSNext - phiS;
    }
    const exp = { s, a, r: storedR, sNext, done };
    if (this.buffer.length < this.bufferSize) {
      this.buffer.push(exp);
    } else {
      this.buffer[this.bufferPos] = exp;
      this.bufferPos = (this.bufferPos + 1) % this.bufferSize;
    }
  }

  _sample(n) {
    const out = [];
    const len = this.buffer.length;
    for (let i = 0; i < n; i++) {
      out.push(this.buffer[Math.floor(Math.random() * len)]);
    }
    return out;
  }

  trainStep() {
    if (this.buffer.length < this.batchSize) return;
    const batch = this._sample(this.batchSize);

    const sNextList = batch.map(e => e.sNext);
    const qNextMainAll = this.net.predictBatch(sNextList);
    const qNextTargetAll = this.target.predictBatch(sNextList);

    const trainBatch = [];
    for (let i = 0; i < batch.length; i++) {
      const e = batch[i];
      const qPred = this.net.predict(e.s);
      const target = Array.from(qPred);
      let qTargetVal = 0;
      if (!e.done) {
        const qNextMain = qNextMainAll[i];
        let bestA = 0;
        for (let j = 1; j < qNextMain.length; j++) {
          if (qNextMain[j] > qNextMain[bestA]) bestA = j;
        }
        const qNextTarget = qNextTargetAll[i];
        qTargetVal = e.r + this.gamma * qNextTarget[bestA];
      } else {
        qTargetVal = e.r;
      }
      target[e.a] = qTargetVal;
      trainBatch.push({ input: e.s, target });
    }
    this.lastLoss = this.net.trainBatch(trainBatch, this.lr);
    this.trainSteps++;
    if (this.trainSteps % this.targetSync === 0) {
      this.net.copyTo(this.target);
    }
  }

  decayEpsilon() {
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
  }

  setHyper(p) {
    if (p.lr !== undefined) { this.lr = p.lr; this.net.lr = p.lr; }
    if (p.gamma !== undefined) this.gamma = p.gamma;
    if (p.epsilon !== undefined) this.epsilon = p.epsilon;
    if (p.batchSize !== undefined) this.batchSize = p.batchSize;
    if (p.epsilonMin !== undefined) this.epsilonMin = p.epsilonMin;
    if (p.epsilonDecay !== undefined) this.epsilonDecay = p.epsilonDecay;
    if (p.useShaping !== undefined) this.useShaping = p.useShaping;
    if (p.shapeC !== undefined) this.shapeC = p.shapeC;
  }

  serialize() {
    return {
      stateSize: this.stateSize,
      actionSize: this.actionSize,
      lr: this.lr, gamma: this.gamma,
      epsilon: this.epsilon, epsilonMin: this.epsilonMin,
      epsilonDecay: this.epsilonDecay,
      batchSize: this.batchSize, bufferSize: this.bufferSize,
      targetSync: this.targetSync, trainEvery: this.trainEvery,
      trainSteps: this.trainSteps,
      useShaping: this.useShaping,
      shapeC: this.shapeC,
      net: this.net.serialize()
    };
  }

  static deserialize(data) {
    const a = new DQNAgent({
      stateSize: data.stateSize, actionSize: data.actionSize,
      lr: data.lr, gamma: data.gamma,
      epsilon: data.epsilon, epsilonMin: data.epsilonMin,
      epsilonDecay: data.epsilonDecay,
      batchSize: data.batchSize, bufferSize: data.bufferSize,
      targetSync: data.targetSync, trainEvery: data.trainEvery,
      useShaping: data.useShaping ?? true, shapeC: data.shapeC ?? 3.0
    });
    a.net = NeuralNetwork.deserialize(data.net);
    a.net.copyTo(a.target);
    a.trainSteps = data.trainSteps || 0;
    return a;
  }
}

window.DQNAgent = DQNAgent;