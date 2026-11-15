(function () {
  function mount({ element, round, onComplete, onFail }) {
    const requiredDodges = 3 + round;
    const timers = new Set();
    const obstacles = [];
    let animationFrame = 0;
    let lastFrame = 0;
    let nextObstacleAt = 0;
    let score = 0;
    let mistakes = 0;
    let jumpUntil = 0;
    let inputPending = false;
    let finished = false;

    element.innerHTML = `
      <div class="dino-game lebron-game">
        <div class="dino-hud"><span id="dino-status">DEFENDER APPROACHING.</span><span id="dino-score">0 / ${requiredDodges}</span></div>
        <div class="dino-track" role="img" aria-label="LeBron basketball runner game">
          <div class="dino-skyline" aria-hidden="true"></div>
          <div class="dino-sprite lebron-player" id="dino-sprite" aria-label="LeBron, number 23">
            <span class="lebron-head"></span>
            <span class="lebron-body"><span>23</span></span>
            <span class="lebron-arm"></span>
            <span class="lebron-leg lebron-leg-front"></span>
            <span class="lebron-leg lebron-leg-back"></span>
          </div>
          <div class="dino-ground" aria-hidden="true"></div>
        </div>
        <div class="dino-controls"><button class="dino-jump" id="dino-jump" type="button">JUMP <span aria-hidden="true">↑</span></button><span class="dino-key-hint">OR PRESS SPACE</span></div>
      </div>
    `;

    const track = element.querySelector(".dino-track");
    const player = element.querySelector("#dino-sprite");
    const status = element.querySelector("#dino-status");
    const scoreDisplay = element.querySelector("#dino-score");
    const jumpButton = element.querySelector("#dino-jump");
    const speed = 185 + round * 24;
    const jumpDuration = 720;
    const maxInputDelayMs = 500;
    const hitboxInset = 5;

    function schedule(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!finished) callback();
      }, delay);
      timers.add(timer);
    }

    function requestJump() {
      if (finished || inputPending) return;
      inputPending = true;
      jumpButton.disabled = true;
      status.textContent = "JUMP!";
      const inputDelay = Math.random() * maxInputDelayMs;
      schedule(() => {
        inputPending = false;
        jumpButton.disabled = false;
        jumpUntil = performance.now() + jumpDuration;
        player.classList.add("is-airborne");
        status.textContent = "NICE HOP.";
        schedule(() => player.classList.remove("is-airborne"), jumpDuration);
      }, inputDelay);
    }

    function spawnObstacle(now) {
      const obstacle = document.createElement("span");
      obstacle.className = "dino-obstacle lebron-defender";
      obstacle.setAttribute("aria-hidden", "true");
      obstacle.textContent = "🏀";
      track.append(obstacle);
      obstacles.push({ element: obstacle, x: track.clientWidth + 18, counted: false });
      nextObstacleAt = now + 1450 + Math.random() * 650;
    }

    function handleCollision(now) {
      mistakes += 1;
      score = 0;
      scoreDisplay.textContent = `0 / ${requiredDodges}`;
      status.textContent = "MISSED THE JUMP. TRY AGAIN.";
      obstacles.forEach(({ element: item }) => item.remove());
      obstacles.length = 0;
      onFail({ mistakes, gameId: "lebron-runner" });
      nextObstacleAt = now + 1250;
    }

    function frame(now) {
      if (finished) return;
      if (!lastFrame) {
        lastFrame = now;
        nextObstacleAt = now + 500;
      }
      const delta = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      if (now >= nextObstacleAt) spawnObstacle(now);

      const playerBounds = player.getBoundingClientRect();
      const playerHitbox = {
        left: playerBounds.left + hitboxInset,
        right: playerBounds.right - hitboxInset,
        top: playerBounds.top + hitboxInset,
        bottom: playerBounds.bottom - hitboxInset
      };
      for (let index = obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacles[index];
        obstacle.x -= speed * delta;
        obstacle.element.style.left = `${obstacle.x}px`;
        const obstacleBounds = obstacle.element.getBoundingClientRect();
        const overlaps = obstacleBounds.left + hitboxInset < playerHitbox.right &&
          obstacleBounds.right - hitboxInset > playerHitbox.left &&
          obstacleBounds.top + hitboxInset < playerHitbox.bottom &&
          obstacleBounds.bottom - hitboxInset > playerHitbox.top;
        if (overlaps) {
          handleCollision(now);
          break;
        }
        if (!obstacle.counted && obstacleBounds.right < playerHitbox.left) {
          obstacle.counted = true;
          score += 1;
          scoreDisplay.textContent = `${score} / ${requiredDodges}`;
          status.textContent = "DEFENDER CLEARED.";
          if (score >= requiredDodges) {
            finished = true;
            status.textContent = "AND-ONE. LEVEL COMPLETE.";
            onComplete({ gameId: "lebron-runner", mistakes, dodges: score });
            return;
          }
        }
        if (obstacle.x < -30) {
          obstacle.element.remove();
          obstacles.splice(index, 1);
        }
      }
      if (!finished) animationFrame = window.requestAnimationFrame(frame);
    }

    function onKeyDown(event) {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      requestJump();
    }

    jumpButton.addEventListener("click", requestJump);
    window.addEventListener("keydown", onKeyDown);
    animationFrame = window.requestAnimationFrame(frame);

    return function cleanup() {
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", onKeyDown);
      timers.forEach(window.clearTimeout);
      timers.clear();
      obstacles.forEach(({ element: obstacle }) => obstacle.remove());
      element.replaceChildren();
    };
  }

  window.CaptchaGames.register({
    id: "lebron-runner",
    type: "runner",
    title: "Help LeBron clear the court.",
    description: "Jump past the defenders and make it to the other end.",
    mount
  });
})();