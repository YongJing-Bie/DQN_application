# 🐤 Flappy Bird · 自主进化，点击即玩：
[https://github.com/YongJing-Bie/DQN_application](https://yongjing-bie.github.io/DQN_application/)

一个**纯前端、零依赖**的 Flappy Bird 深度强化学习项目。浏览器打开 `index.html` 即可训练，无需 Python / 服务器 / 构建工具。

![tech stack](https://img.shields.io/badge/Frontend-Vanilla%20JS-blue?logo=javascript)
![algo](https://img.shields.io/badge/Algorithm-Double%20DQN-purple)
![state](https://img.shields.io/badge/State-10D%20LookAhead-green)
![build](https://img.shields.io/badge/Build-Zero%20Dependency-brightgreen)

---

## ✨ 亮点

| 能力 | 说明 |
|---|---|
| **零依赖** | 只依赖浏览器 Canvas，`index.html` 双击即跑 |
| **Double DQN** | 经验回放 + 目标网络 + Double DQN 去高估偏差 |
| **10 维前瞻状态** | 鸟Y/速度 + 下根管道3维 + **第二根管道3维**，应对高度突变 |
| **间隙奖励塑形** | 存活奖励 + 居中引导 + 上下边界惩罚 + 死亡惩罚，可实时调参 |
| **手动采集模式** | 空格亲自玩，样本直接喂给经验池（冷启动/纠偏利器）|

---

## 🚀 快速开始

> 推荐 Chrome / Edge / Firefox 最新版。

### 方式一：直接打开（最简单）

https://github.com/YongJing-Bie/DQN_application](https://yongjing-bie.github.io/DQN_application/

### 方式二：clone后打开index.html

---

## 🎮 操作面板

顶部按钮：

- ▶ **训练**：按当前超参数开始 Double DQN 学习
- 👁 **演示**：用当前网络策略跑（不训练，ε=0）
- ⏸ **暂停**：冻结状态，可继续 / 保存
- ⟳ **重置**：清空网络、经验池、统计、曲线
- ✋ **人工采集**：空格手动玩，样本直接写入经验池

滑块：
- **训练速度**（1x~20x）：训练模式每帧跑多少步，调高性能直接起飞
- **演示速度**（1x~6x）：演示/测试模式的倍速
- **渲染**：关掉后走 `setTimeout` 纯后台训练，帧率最高
- **调试**：画状态向量、管道间隙辅助线

---

## 🧠 算法细节

### 状态向量（10 维，归一化到 [0,1]）

| 索引 | 含义 |
|---|---|
| s0 | 鸟 Y 坐标（画布高度归一化）|
| s1 | 鸟垂直速度 |
| s2 | 到下一根管道的水平距离 |
| s3 | 下管道 上管壁 Y / 间隙上沿 |
| s4 | 下管道 下管壁 Y / 间隙下沿 |
| s5 | 下管道 间隙中心 Y |
| s6 | 下管道 间隙中心 相对于 鸟Y 的偏移 |
| s7 | **第二根**管道 上管壁 Y（前瞻）|
| s8 | **第二根**管道 下管壁 Y（前瞻）|
| s9 | **第二根**管道 间隙中心 Y（前瞻）|

### 动作

- `0`：不拍翅（重力下落）
- `1`：拍翅（向上瞬时速度，受最大下落速度限制）

### Double DQN 结构

```
输入 (10) → 隐藏1 (128, ReLU) → 隐藏2 (128, ReLU) → 输出 (2, 线性)
```

- 经验回放容量：`200000`
- 批量：默认 `64`
- 目标网络更新：每 `500` 训练步把在线网络权重拷贝到目标网络
- ε 衰减：每局死亡 ε 乘 `0.995`，最低 `0.01`，但是这里默认用的0.01，尝试后发现也能行
- γ 折扣：默认 `0.95`
- 优化器：Vanilla SGD + MSE loss

### 奖励塑形（实时可调）

```
r_total = r_survive           （每帧 +0.001，让它先学会"别死"）
        + Σr_gap_reward       （越靠近间隙中心越大，系数默认 1e-6）
        + r_gap_penalty_below （在间隙下方罚 -0.05/帧，防贴底）
        + r_gap_penalty_above （在间隙上方罚 -0.05/帧，防拍翅过猛）
        + r_death              （撞墙 -1，终结信号）
```

## 📈 训练曲线

> 如果某局鸟突然特别厉害一直不死 → 上图 X 轴继续向右延伸但折线停住 → 下图分数还在涨。

---

## 📁 目录结构

```
flappy-bird-dqn/
├── index.html              # 页面入口
├── css/
│   └── style.css           # 样式（深色、紧凑、响应式）
├── js/
│   ├── nn.js               # 神经网络层 + 反向传播（无依赖）
│   ├── game.js             # Flappy 游戏引擎 + 10 维状态 + 奖励塑形
│   ├── agent.js            # Double DQN Agent（经验池、act、trainStep、序列化）
│   ├── charts.js           # 轻量折线图（等间隔 100 点抽样、Nice Scale 刻度）
│   └── main.js             # 主循环、UI 绑定、模型持久化、曲线采样
├── model/
│   └── flappy_model.json   # 默认预训练示例（不想要可以删掉）
├── .gitignore
└── README.md
```

---
---

## 🛠 常见问题

**Q：重置后模型没了？**
A：重置只清内存和 localStorage，你点过「备份」的时间戳 JSON 文件都在下载目录里，可以用「导入」恢复。

**Q：能把模型用到别的 Flappy 项目吗？**
A：可以，`agent.serialize()` 导出的 JSON 里有权重、超参、状态维度，格式见 `js/agent.js` 末尾的 serialize / deserialize。

**Q：训练多久能跑 100 分？**
A：默认参数 + 渲染关闭 + 20x 速度，通常 300 局能稳定过 50 分，偶尔能到几百。经验池越满、人工采集越对，收敛越快。

---

## 📜 License

MIT，随便用，随便改。如果你在此基础上做了更酷的版本（比如 PPO / Rainbow / 像素输入），欢迎来个 Star : )
