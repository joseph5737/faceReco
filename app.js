const video = document.getElementById("video");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const statusEl = document.getElementById("status");
const signalEl = document.getElementById("signal");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const state = {
  running: false,
  phase: "idle",
  score: 0,
  combo: 0,
  blocks: [],
  hand: null,
  lastHitAt: 0,
  spawnTimer: 0,
  lastFrameAt: performance.now(),
};

let camera = null;
let hands = null;
const FLIP_HAND_X = true;

function toCanvasX(x) {
  const width = canvas.clientWidth;
  const rawX = x * width;
  return FLIP_HAND_X ? width - rawX : rawX;
}

function toCanvasY(y) {
  return y * canvas.clientHeight;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function resetGame() {
  state.score = 0;
  state.combo = 0;
  state.blocks = [];
  state.hand = null;
  state.lastHitAt = 0;
  state.spawnTimer = 0;
  scoreEl.textContent = "0";
  comboEl.textContent = "0";
  state.phase = state.running ? "ready" : "idle";
  statusEl.textContent = state.running ? "손을 감지하면 시작" : "카메라 준비 중";
  signalEl.textContent = "손 인식 대기 중";
}

function setStatus(text) {
  statusEl.textContent = text;
}

function startRound() {
  state.phase = "playing";
  state.score = 0;
  state.combo = 0;
  state.blocks = [];
  state.spawnTimer = 0;
  scoreEl.textContent = "0";
  comboEl.textContent = "0";
  setStatus("게임 진행 중");
  signalEl.textContent = "손을 움직여 블록을 깨세요";
}

function spawnBlock() {
  const width = canvas.clientWidth;
  const size = 42 + Math.random() * 46;
  const x = Math.max(20, Math.min(width - size - 20, Math.random() * (width - size)));
  const speed = 90 + Math.random() * 140 + state.score * 0.45;
  const colors = ["#7ef0c5", "#ffd166", "#6cc7ff", "#ff8fab"];

  state.blocks.push({
    x,
    y: -size - 10,
    size,
    speed,
    color: colors[Math.floor(Math.random() * colors.length)],
    wobble: Math.random() * Math.PI * 2,
  });
}

function drawBackground(width, height) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "rgba(8, 17, 31, 0.22)");
  grad.addColorStop(1, "rgba(8, 17, 31, 0.38)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCameraFrame(width, height) {
  if (!video.videoWidth || !video.videoHeight) return;

  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.drawImage(video, 0, 0, width, height);
  ctx.restore();
}

function drawBlock(block) {
  const pulse = 0.5 + 0.5 * Math.sin(block.wobble);
  ctx.save();
  ctx.translate(block.x + block.size / 2, block.y + block.size / 2);
  ctx.rotate(Math.sin(block.wobble * 0.7) * 0.12);
  ctx.fillStyle = block.color;
  ctx.shadowColor = block.color;
  ctx.shadowBlur = 24;
  ctx.globalAlpha = 0.8 + pulse * 0.15;
  ctx.fillRect(-block.size / 2, -block.size / 2, block.size, block.size);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.strokeRect(-block.size / 2 + 4, -block.size / 2 + 4, block.size - 8, block.size - 8);
  ctx.restore();
}

function drawHand(hand) {
  if (!hand) return;

  const points = hand.map((landmark) => ({
    x: toCanvasX(landmark.x),
    y: toCanvasY(landmark.y),
    z: landmark.z,
  }));

  const fingerTips = [8, 12, 16, 20]
    .map((index) => points[index])
    .filter(Boolean);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  ctx.strokeStyle = "rgba(126, 240, 197, 0.86)";
  ctx.lineWidth = 5;
  for (const [a, b] of connections) {
    const p1 = points[a];
    const p2 = points[b];
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (const point of points) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const tip of fingerTips) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 209, 102, 0.92)";
    ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function updateScore(delta) {
  state.score += delta;
  state.combo += 1;
  scoreEl.textContent = String(state.score);
  comboEl.textContent = String(state.combo);
}

function hitBlock(index) {
  const block = state.blocks[index];
  if (!block) return;
  state.blocks.splice(index, 1);
  updateScore(10 + Math.min(20, state.combo * 2));
  state.lastHitAt = performance.now();
  signalEl.textContent = "블록 파괴!";
}

function detectCollisions() {
  if (!state.hand) return;

  const points = state.hand.map((landmark) => ({
    x: toCanvasX(landmark.x),
    y: toCanvasY(landmark.y),
  }));

  const tips = [4, 8, 12, 16, 20].map((index) => points[index]).filter(Boolean);
  if (tips.length === 0) return;

  for (let i = state.blocks.length - 1; i >= 0; i -= 1) {
    const block = state.blocks[i];
    const left = block.x;
    const right = block.x + block.size;
    const top = block.y;
    const bottom = block.y + block.size;
    const paddedLeft = left - 18;
    const paddedRight = right + 18;
    const paddedTop = top - 18;
    const paddedBottom = bottom + 18;

    for (const tip of tips) {
      const tipRadius = 16;
      const nearestX = Math.max(paddedLeft, Math.min(tip.x, paddedRight));
      const nearestY = Math.max(paddedTop, Math.min(tip.y, paddedBottom));
      const dx = tip.x - nearestX;
      const dy = tip.y - nearestY;
      if (dx * dx + dy * dy <= tipRadius * tipRadius) {
        hitBlock(i);
        return;
      }
    }
  }
}

function update(dt) {
  if (state.phase !== "playing") return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  state.spawnTimer += dt;
  if (state.spawnTimer > 0.55) {
    state.spawnTimer = 0;
    spawnBlock();
  }

  for (let i = state.blocks.length - 1; i >= 0; i -= 1) {
    const block = state.blocks[i];
    block.y += block.speed * dt;
    block.wobble += dt * 5;
    if (block.y > height + block.size + 20) {
      state.blocks.splice(i, 1);
      state.combo = 0;
      comboEl.textContent = "0";
    }
  }

  detectCollisions();
}

function tick(now) {
  const dt = Math.min(0.033, (now - state.lastFrameAt) / 1000);
  state.lastFrameAt = now;
  if (state.phase === "playing") {
    update(dt);
  }
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawCameraFrame(canvas.clientWidth, canvas.clientHeight);
  drawBackground(canvas.clientWidth, canvas.clientHeight);
  for (const block of state.blocks) {
    drawBlock(block);
  }
  drawHand(state.hand);
  const elapsedSinceHit = performance.now() - state.lastHitAt;
  if (elapsedSinceHit < 180) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 209, 102, ${1 - elapsedSinceHit / 180})`;
    ctx.font = "900 28px 'Noto Sans KR', sans-serif";
    ctx.fillText("+점수", 24, 48);
    ctx.restore();
  }
  requestAnimationFrame(tick);
}

async function startGame() {
  if (state.running) return;

  try {
    resizeCanvas();
    resetGame();
    setStatus("카메라 권한 요청 중");
    signalEl.textContent = "카메라를 허용해 주세요";
    state.running = true;
    requestAnimationFrame(tick);

    if (!hands) {
      hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        selfieMode: false,
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults((results) => {
        const handLandmarks = results.multiHandLandmarks?.[0];
        if (handLandmarks) {
          state.hand = handLandmarks;
          signalEl.textContent = "손 감지됨";
          if (state.phase !== "playing") {
            startRound();
          }
        } else {
          state.hand = null;
          if (state.phase === "playing") {
            signalEl.textContent = "손 인식 대기 중";
          } else {
            signalEl.textContent = "손을 보여주면 시작돼요";
          }
        }
      });
    }

    if (!camera) {
      camera = new Camera(video, {
        onFrame: async () => {
          await hands.send({ image: video });
        },
        width: 1280,
        height: 720,
      });
    }

    await camera.start();
    setStatus("손을 감지하면 시작");
    signalEl.textContent = "손을 보여주면 시작돼요";
  } catch (error) {
    console.error(error);
    state.running = false;
    setStatus("카메라 시작 실패");
    signalEl.textContent = "브라우저 권한과 HTTPS/localhost를 확인하세요";
  }
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", () => {
  state.phase = state.running ? "ready" : "idle";
  resetGame();
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", () => {
  resizeCanvas();
  resetGame();
  requestAnimationFrame(tick);
});
