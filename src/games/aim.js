(function () {
  // ---------------------------------------------------------------------------
  // Aim Trainer — rb-captcha game, after Human Benchmark's Aim Trainer
  // (https://humanbenchmark.com/tests/aim)
  //
  // Human Benchmark: hit targets as quickly as you can; your score is
  // the AVERAGE time per target. This is the CAPTCHA version: far fewer
  // targets, and the average is the win condition — hit every target with
  // an average at or under the round's limit.
  //
  // ONE round only — no round 1/2/3 scaling. The difficulty is RANDOMISED
  // every time the game is mounted (every attempt), so it can't be
  // memorised: target count, average limit, target lifetime, decoys,
  // movers, target size and miss limit are all rolled fresh, and shown
  // in the HUD for that attempt.
  //
  // Win: hit every target, average ms per target <= avgLimitMs.
  // Fail: click a decoy, click empty space too many times, let a target
  //   dodge away too many times, or finish with an average over the limit.
  // A fail calls onFail({ mistakes }) like the other games, and restarts
  // the round from 0 hits with a FRESH randomised difficulty.
  // A win calls onComplete() once.
  // ---------------------------------------------------------------------------

  function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  // Roll one randomised difficulty for this attempt.
  function rollDifficulty() {
    const targets = randomInt(5, 10);
    const avgLimitMs = randomInt(650, 1100);
    const targetTimeoutMs = randomInt(1100, 1900);
    const decoys = randomInt(0, 2);
    const moverChance = [0.15, 0.3, 0.5][randomInt(0, 2)];
    const sizeStart = randomInt(44, 60);
    const missLimit = randomInt(2, 3);
    const label =
      avgLimitMs <= 750 && targets >= 9
        ? "BRUTAL"
        : avgLimitMs >= 950 && targets <= 6
          ? "CHILL"
          : "SPICY";
    return {
      targets, avgLimitMs, targetTimeoutMs, decoys, moverChance,
      sizeStart, sizeShrink: 4, sizeMin: 26, missLimit, label,
    };
  }

  const ARENA_FALLBACK_W = 560;
  const ARENA_FALLBACK_H = 260;

  function mount({ element, round, onComplete, onFail }) {
    // `round` is deliberately ignored: this game is one round only,
    // with randomised difficulty, every time it mounts.
    let config = rollDifficulty();
    const timers = new Set();
    let finished = false;
    let mistakes = 0;
    let hits = 0;
    let misses = 0;
    let totalMs = 0;
    let decoysLeft = config.decoys;
    let targetBornAt = 0;
    let targetIsDecoy = false;
    let targetMoved = false;
    let targetSize = config.sizeStart;

    element.innerHTML = `
      <div class="aim-game">
        <div class="aim-hud">
          <span id="aim-status">CLICK THE TARGET TO BEGIN</span>
          <span id="aim-hits">0 / ${config.targets} HIT</span>
        </div>
        <div class="aim-arena" id="aim-arena" aria-label="Aim trainer area">
          <button class="aim-start" id="aim-start" type="button">CLICK TO START<br><span>${config.targets} targets. Hit them all.</span></button>
        </div>
        <div class="aim-window" id="aim-window"></div>
      </div>
    `;

    const arena = element.querySelector("#aim-arena");
    const startBtn = element.querySelector("#aim-start");
    const status = element.querySelector("#aim-status");
    const hitsLabel = element.querySelector("#aim-hits");
    const windowLabel = element.querySelector("#aim-window");

    function schedule(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!finished) callback();
      }, delay);
      timers.add(timer);
      return timer;
    }

    function clearTimers() {
      timers.forEach(window.clearTimeout);
      timers.clear();
    }

    function avgMs() {
      return hits === 0 ? 0 : Math.round(totalMs / hits);
    }

    function updateHud() {
      hitsLabel.textContent = `${hits} / ${config.targets} HIT`;
      status.textContent =
        hits === 0
          ? "CLICK THE TARGETS — FAST"
          : `AVG ${avgMs()} ms / TARGET — LIMIT ${config.avgLimitMs} ms`;
      windowLabel.textContent =
        `DIFFICULTY: ${config.label} · AVG LIMIT: ${config.avgLimitMs} ms · TARGETS: ${config.targets} · MISSES: ${misses}/${config.missLimit}`;
    }

    function arenaSize() {
      const w = arena.clientWidth || ARENA_FALLBACK_W;
      const h = arena.clientHeight || ARENA_FALLBACK_H;
      return { w, h };
    }

    function placeTarget(el) {
      const { w, h } = arenaSize();
      const maxX = Math.max(0, w - targetSize - 8);
      const maxY = Math.max(0, h - targetSize - 8);
      el.style.width = `${targetSize}px`;
      el.style.height = `${targetSize}px`;
      el.style.left = `${4 + Math.random() * maxX}px`;
      el.style.top = `${4 + Math.random() * maxY}px`;
    }

    function spawnTarget() {
      if (finished) return;
      clearTimers();
      // A decoy replaces a real target, at most `decoys` times per attempt.
      const isDecoy = decoysLeft > 0 && Math.random() < 0.3;
      if (isDecoy) decoysLeft -= 1;
      targetIsDecoy = isDecoy;
      targetMoved = false;
      targetNoRegged = false;
      targetBornAt = performance.now();

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isDecoy ? "aim-target is-decoy" : "aim-target";
      btn.setAttribute("aria-label", isDecoy ? "Decoy target, do not click" : "Target");
      btn.textContent = isDecoy ? "✕" : "◎";
      btn.dataset.kind = isDecoy ? "decoy" : "target";
      placeTarget(btn);
      arena.replaceChildren(btn);

      if (!isDecoy && Math.random() < config.moverChance) {
        // Mover: teleports once if you hesitate.
        schedule(() => {
          if (finished || targetIsDecoy || targetMoved) return;
          const live = arena.querySelector(".aim-target");
          if (!live) return;
          targetMoved = true;
          placeTarget(live);
          status.textContent = "IT MOVED. RUDE.";
        }, 650);
      }

      schedule(() => {
        if (finished) return;
        const live = arena.querySelector(".aim-target");
        if (!live) return;
        if (targetIsDecoy) {
          // Decoy ignored: it gives up and a real target follows.
          spawnTarget();
          return;
        }
        // Real target dodged away — counts as a miss.
        miss("TARGET ESCAPED", "You let it sit there for " + config.targetTimeoutMs + " ms and it left.");
      }, targetIsDecoy ? 900 : config.targetTimeoutMs);
    }

    function fail(reason, detail) {
      if (finished) return;
      mistakes += 1;
      onFail({ mistakes, gameId: "aim-trainer" });
      arena.replaceChildren();
      const again = document.createElement("div");
      again.className = "aim-result is-fail";
      again.innerHTML = `<strong>${reason}</strong><span>${detail}</span>`;
      arena.appendChild(again);
      status.textContent = `MISTAKE ${mistakes} — RESTARTING WITH A NEW DIFFICULTY`;
      // Fresh randomised difficulty for the retry.
      config = rollDifficulty();
      hits = 0;
      misses = 0;
      totalMs = 0;
      decoysLeft = config.decoys;
      targetSize = config.sizeStart;
      updateHud();
      schedule(() => {
        if (finished) return;
        arena.replaceChildren(startBtn);
        startBtn.innerHTML = `CLICK TO START<br><span>${config.targets} targets this time. Difficulty: ${config.label}.</span>`;
        status.textContent = "CLICK THE TARGET TO BEGIN";
      }, 1400);
    }

    function miss(reason, detail) {
      misses += 1;
      if (misses >= config.missLimit) {
        fail("TOO MANY MISSES", `${reason}. ${misses} misses is the limit here.`);
        return;
      }
      status.textContent = `${reason} — MISS ${misses}/${config.missLimit}`;
      spawnTarget();
    }

    function onArenaClick(event) {
      if (finished) return;
      const t = event.target.closest ? event.target.closest(".aim-target, .aim-start") : null;
      if (t && t.classList.contains("aim-start")) {
        spawnTarget();
        return;
      }
      if (!t) {
        // Clicked empty arena.
        miss("MISSED THE ARENA", "You clicked nothing. The nothing was not a target.");
        return;
      }
      if (t.dataset.kind === "decoy") {
        fail("DECOY!", "That grey one with the ✕ was a decoy. You clicked the decoy.");
        return;
      }
      // Real target hit.
      const ms = Math.round(performance.now() - targetBornAt);
      totalMs += ms;
      hits += 1;
      targetSize = Math.max(config.sizeMin, targetSize - config.sizeShrink);
      updateHud();
      if (hits >= config.targets) {
        const avg = avgMs();
        if (avg > config.avgLimitMs) {
          fail(
            "TOO SLOW ON AVERAGE",
            `You hit all ${config.targets}, but your average was ${avg} ms — the limit was ${config.avgLimitMs} ms. Human Benchmark would be disappointed.`
          );
          return;
        }
        finished = true;
        clearTimers();
        arena.replaceChildren();
        const done = document.createElement("div");
        done.className = "aim-result is-good";
        done.innerHTML = `<strong>PASSED</strong><span>${config.targets} targets · average ${avg} ms / target. Suspiciously human.</span>`;
        arena.appendChild(done);
        status.textContent = `PASSED — AVG ${avg} ms`;
        onComplete({ gameId: "aim-trainer", mistakes, avgMs: avg });
        return;
      }
      spawnTarget();
    }

    arena.addEventListener("click", onArenaClick);
    updateHud();

    return function cleanup() {
      finished = true;
      clearTimers();
      arena.removeEventListener("click", onArenaClick);
      element.replaceChildren();
    };
  }

  window.CaptchaGames.register({
    id: "aim-trainer",
    type: "aim",
    title: "Hit the targets. All of them. Fast.",
    description:
      "Human Benchmark Aim Trainer, but CAPTCHA: one round, randomised difficulty, hit every target under the average limit.",
    mount,
  });
})();
