/* =========================================================================
 * nn.js — 轻量神经网络 (Float64Array 扁平存储 + Adam)
 * ========================================================================= */

class NeuralNetwork {
  constructor(sizes, opts = {}) {
    this.sizes = sizes.slice();
    this.lr = opts.lr ?? 0.001;
    this.beta1 = opts.beta1 ?? 0.9;
    this.beta2 = opts.beta2 ?? 0.999;
    this.eps = opts.eps ?? 1e-8;
    this.t = 0;

    this.weights = [];
    this.biases = [];
    this.mW = [];
    this.vW = [];
    this.mB = [];
    this.vB = [];
    this._init();
  }

  _init() {
    for (let i = 0; i < this.sizes.length - 1; i++) {
      const fanIn = this.sizes[i];
      const scale = Math.sqrt(2.0 / fanIn);
      const rows = this.sizes[i + 1];
      const cols = this.sizes[i];
      const total = rows * cols;

      const W = new Float64Array(total);
      for (let j = 0; j < total; j++) W[j] = this._gaussian() * scale;

      this.weights.push(W);
      this.biases.push(new Float64Array(rows));
      this.mW.push(new Float64Array(total));
      this.vW.push(new Float64Array(total));
      this.mB.push(new Float64Array(rows));
      this.vB.push(new Float64Array(rows));
    }
  }

  _gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  _relu(x) { return x > 0 ? x : 0; }
  _reluD(x) { return x > 0 ? 1 : 0; }

  forward(input) {
    this.activations = [input.slice()];
    this.zs = [];
    let a = input;
    const L = this.weights.length;
    for (let l = 0; l < L; l++) {
      const W = this.weights[l],
        b = this.biases[l];
      const isLast = l === L - 1;
      const cols = this.sizes[l];
      const rows = this.sizes[l + 1];
      const z = new Float64Array(rows);
      const aNext = new Float64Array(rows);
      for (let j = 0; j < rows; j++) {
        let sum = b[j];
        const base = j * cols;
        for (let k = 0; k < cols; k++) sum += W[base + k] * a[k];
        z[j] = sum;
        aNext[j] = isLast ? sum : this._relu(sum);
      }
      this.zs.push(z);
      this.activations.push(aNext);
      a = aNext;
    }
    return a;
  }

  predict(input) {
    let a = input;
    const L = this.weights.length;
    for (let l = 0; l < L; l++) {
      const W = this.weights[l],
        b = this.biases[l];
      const isLast = l === L - 1;
      const cols = this.sizes[l];
      const rows = this.sizes[l + 1];
      const aNext = new Float64Array(rows);
      for (let j = 0; j < rows; j++) {
        let sum = b[j];
        const base = j * cols;
        for (let k = 0; k < cols; k++) sum += W[base + k] * a[k];
        aNext[j] = isLast ? sum : this._relu(sum);
      }
      a = aNext;
    }
    return a;
  }

  predictBatch(inputs) {
    const results = new Array(inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      results[i] = this.predict(inputs[i]);
    }
    return results;
  }

  trainBatch(batch, lr) {
    if (batch.length === 0) return 0;
    this.t++;
    const L = this.weights.length;
    const n = batch.length;

    const gW = [],
      gB = [];
    for (let l = 0; l < L; l++) {
      const cols = this.sizes[l];
      const rows = this.sizes[l + 1];
      gW.push(new Float64Array(rows * cols));
      gB.push(new Float64Array(rows));
    }

    let totalLoss = 0;

    for (const s of batch) {
      const out = this.forward(s.input);

      let delta = new Float64Array(out.length);
      for (let j = 0; j < out.length; j++) {
        const e = out[j] - s.target[j];
        delta[j] = e;
        totalLoss += e * e;
      }

      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.activations[l];
        const cols = this.sizes[l];
        const rows = this.sizes[l + 1];
        const gw = gW[l],
          gb = gB[l];

        for (let j = 0; j < rows; j++) {
          const base = j * cols;
          const dj = delta[j];
          for (let k = 0; k < cols; k++) {
            gw[base + k] += dj * aPrev[k];
          }
          gb[j] += dj;
        }

        if (l > 0) {
          const wl = this.weights[l];
          const prevRows = this.sizes[l];
          const newDelta = new Float64Array(prevRows);
          for (let k = 0; k < prevRows; k++) {
            let sum = 0;
            for (let j = 0; j < rows; j++) {
              sum += wl[j * cols + k] * delta[j];
            }
            newDelta[k] = sum * this._reluD(this.zs[l - 1][k]);
          }
          delta = newDelta;
        }
      }
    }

    const bc1 = 1 - Math.pow(this.beta1, this.t);
    const bc2 = 1 - Math.pow(this.beta2, this.t);
    for (let l = 0; l < L; l++) {
      const cols = this.sizes[l];
      const rows = this.sizes[l + 1];
      const gw = gW[l],
        gb = gB[l];
      const w = this.weights[l],
        b = this.biases[l];
      const mw = this.mW[l],
        vw = this.vW[l];
      const mb = this.mB[l],
        vb = this.vB[l];

      for (let j = 0; j < rows; j++) {
        const base = j * cols;
        for (let k = 0; k < cols; k++) {
          const idx = base + k;
          const grad = gw[idx] / n;
          mw[idx] = this.beta1 * mw[idx] + (1 - this.beta1) * grad;
          vw[idx] = this.beta2 * vw[idx] + (1 - this.beta2) * grad * grad;
          const mHat = mw[idx] / bc1;
          const vHat = vw[idx] / bc2;
          w[idx] -= lr * mHat / (Math.sqrt(vHat) + this.eps);
        }
        const grad = gb[j] / n;
        mb[j] = this.beta1 * mb[j] + (1 - this.beta1) * grad;
        vb[j] = this.beta2 * vb[j] + (1 - this.beta2) * grad * grad;
        const mHat = mb[j] / bc1;
        const vHat = vb[j] / bc2;
        b[j] -= lr * mHat / (Math.sqrt(vHat) + this.eps);
      }
    }
    return totalLoss / n;
  }

  copyTo(other) {
    for (let l = 0; l < this.weights.length; l++) {
      other.weights[l].set(this.weights[l]);
      other.biases[l].set(this.biases[l]);
      other.mW[l].fill(0);
      other.vW[l].fill(0);
      other.mB[l].fill(0);
      other.vB[l].fill(0);
    }
    other.t = 0;
  }

  serialize() {
    return {
      sizes: this.sizes.slice(),
      lr: this.lr,
      weights: this.weights.map(w => Array.from(w)),
      biases: this.biases.map(b => Array.from(b))
    };
  }

  static deserialize(data) {
    const net = new NeuralNetwork(data.sizes, { lr: data.lr });
    for (let l = 0; l < data.weights.length; l++) {
      net.weights[l] = new Float64Array(data.weights[l]);
      net.biases[l] = new Float64Array(data.biases[l]);
    }
    return net;
  }
}

window.NeuralNetwork = NeuralNetwork;