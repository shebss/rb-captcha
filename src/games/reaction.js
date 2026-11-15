(function () {
  // ---------------------------------------------------------------------------
  // Reaction Time — rb-captcha game
  //
  // Win condition: land N reactions inside a specific ms window.
  //   - too fast  (< minMs)  -> "suspiciously robot"   -> fail
  //   - in window (minMs-ms) -> success, streak + 1
  //   - too slow  (> maxMs)  -> "are you asleep?"      -> fail
  //   - click before GO      -> early / fakeout fail    -> fail
  //   - no click in 1500ms after GO -> too slow         -> fail
  //
  // A fail calls onFail({ mistakes }) like the other games, and restarts
  // the current trial (streak is kept — change RESET_STREAK_ON_FAIL to true
  // if you want a fail to wipe the streak). A win calls onComplete() once.
  //
  // Round scaling — tune here, nowhere else.
  // The win window is RANDOMISED EVERY TRIAL, inside these bounds,
  // so it can't be memorised / gamed by timing a fixed window:
  //   round 1: min 160-200ms, max 550-700ms, 1 fakeout,  2 good hits
  //   round 2: min 170-210ms, max 450-600ms, 2 fakeouts, 3 good hits
  //   round 3: min 190-230ms, max 380-500ms, 3 fakeouts, 3 good hits
  // The window for the current trial is shown in the HUD, and updated
  // on every startTrial(). A new window is rolled even after a fail.
  // ---------------------------------------------------------------------------

  const CONFIG_BY_ROUND = {
    1: { minRange: [160, 200], maxRange: [550, 700], fakeouts: 1, targetHits: 2 },
    2: { minRange: [170, 210], maxRange: [450, 600], fakeouts: 2, targetHits: 3 },
    3: { minRange: [190, 230], maxRange: [380, 500], fakeouts: 3, targetHits: 3 },
  };
  const MIN_WINDOW_WIDTH_MS = 200; // maxMs - minMs is always at least this
  const RESET_STREAK_ON_FAIL = false;
  const GO_TIMEOUT_MS = 1500;

  const FAKEOUTS = [
    {
      label: "WAIT…",
      sub: "Almost. Not yet. Definitely not yet.",
      cls: "is-fakeout-amber",
    },
    {
      label: "GO!",
      sub: "Just kidding. The panel is still red. You fell for text.",
      cls: "is-fakeout-text",
    },
    {
      label: "GO?",
      sub: "That green looks… off. Because it is. It's lime. Nice try.",
      cls: "is-fakeout-lime",
    },
  ];

  function mount({ element, round, onComplete, onFail }) {
    const config = CONFIG_BY_ROUND[round] || CONFIG_BY_ROUND[3];
    const timers = new Set();
    let finished = false;
    let mistakes = 0;
    let hits = 0;
    let state = "waiting"; // waiting | fakeout | go | result
    let goAt = 0;
    let fakeoutsLeft = 0;
    let fakeoutIndex = 0;
    let currentWindow = { minMs: 180, maxMs: 600 };

    function randomInt(min, max) {
      return Math.floor(min + Math.random() * (max - min + 1));
    }

    // Roll a fresh win window for this trial, inside the round's bounds.
    function pickWindow() {
      const minMs = randomInt(config.minRange[0], config.minRange[1]);
      let maxMs = randomInt(config.maxRange[0], config.maxRange[1]);
      if (maxMs - minMs < MIN_WINDOW_WIDTH_MS) {
        maxMs = minMs + MIN_WINDOW_WIDTH_MS + randomInt(0, 100);
      }
      currentWindow = { minMs, maxMs };
      return currentWindow;
    }

    element.innerHTML = `
      <div class="reaction-game">
        <div class="reaction-hud">
          <span id="reaction-status">GET READY…</span>
          <span id="reaction-hits">0 / ${config.targetHits} GOOD</span>
        </div>
        <button class="reaction-panel is-waiting" id="reaction-panel" type="button" aria-label="Reaction test area">
          <span class="reaction-big" id="reaction-big">WAIT FOR GREEN</span>
          <span class="reaction-sub" id="reaction-sub">Clicking early is a mistake. The system remembers.</span>
          <span class="reaction-ms" id="reaction-ms"></span>
        </button>
        <div class="reaction-window" id="reaction-window">
          WIN WINDOW: ???–??? ms &nbsp;·&nbsp; RANDOMISED EVERY TRIAL
        </div>
      </div>
    `;

    const panel = element.querySelector("#reaction-panel");
    const big = element.querySelector("#reaction-big");
    const sub = element.querySelector("#reaction-sub");
    const msLabel = element.querySelector("#reaction-ms");
    const status = element.querySelector("#reaction-status");
    const hitsLabel = element.querySelector("#reaction-hits");
    const windowLabel = element.querySelector("#reaction-window");

    function updateWindowDisplay() {
      windowLabel.textContent =
        `WIN WINDOW: ${currentWindow.minMs}–${currentWindow.maxMs} ms · FAKEOUTS: ${config.fakeouts} · TOO FAST < ${currentWindow.minMs} ms = ROBOT`;
    }

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

    function setPanel(cls, bigText, subText) {
      panel.className = `reaction-panel ${cls}`;
      big.textContent = bigText;
      sub.textContent = subText;
    }

    function fail(reason, detail) {
      if (finished) return;
      mistakes += 1;
      if (RESET_STREAK_ON_FAIL) hits = 0;
      hitsLabel.textContent = `${hits} / ${config.targetHits} GOOD`;
      onFail({ mistakes, gameId: "reaction-time" });
      state = "result";
      setPanel("is-fail", reason, detail);
      msLabel.textContent = "";
      status.textContent = `MISTAKE ${mistakes} — TRY AGAIN`;
      schedule(startTrial, 1100);
    }

    function startTrial() {
      if (finished) return;
      clearTimers();
      state = "waiting";
      pickWindow();
      updateWindowDisplay();
      fakeoutsLeft = config.fakeouts;
      // Shuffle fakeout order each trial so it can't be memorised.
      fakeoutIndex = Math.floor(Math.random() * FAKEOUTS.length);
      setPanel(
        "is-waiting",
        "WAIT FOR GREEN",
        "Do not click. Seriously. The panel is red for a reason."
      );
      msLabel.textContent = "";
      status.textContent = `HIT ${hits + 1} OF ${config.targetHits} — WAIT…`;
      schedule(runFakeoutOrGo, 1100 + Math.random() * 1400);
    }

    function runFakeoutOrGo() {
      if (finished) return;
      if (fakeoutsLeft > 0) {
        fakeoutsLeft -= 1;
        const fake = FAKEOUTS[fakeoutIndex % FAKEOUTS.length];
        fakeoutIndex += 1;
        state = "fakeout";
        setPanel(fake.cls, fake.label, fake.sub);
        status.textContent = "FAKEOUT — DO NOT CLICK";
        // Fakeout lasts 450–800ms, then back to waiting, then eventually GO.
        schedule(() => {
          if (finished || state !== "fakeout") return;
          state = "waiting";
          setPanel(
            "is-waiting",
            "WAIT FOR GREEN",
            "See? That wasn't real either. Keep waiting."
          );
          schedule(runFakeoutOrGo, 500 + Math.random() * 900);
        }, 450 + Math.random() * 350);
        return;
      }
      // Real GO.
      state = "go";
      goAt = performance.now();
      setPanel("is-go", "CLICK NOW!", "True green. This is the one. Be fast, but not *too* fast.");
      status.textContent = "GO — CLICK!";
      schedule(() => {
        if (finished || state !== "go") return;
        fail(
          "TOO SLOW",
          `No click in ${GO_TIMEOUT_MS} ms. Are you asleep, or just very relaxed?`
        );
      }, GO_TIMEOUT_MS);
    }

    function onPanelClick() {
      if (finished) return;

      if (state === "waiting" || state === "fakeout") {
        fail(
          "TOO EARLY",
          state === "fakeout"
            ? "That was a fakeout. The text lied to you and you believed it."
            : "You clicked before green. Impatience is not a human trait. Allegedly."
        );
        return;
      }

      if (state === "result") return;

      // state === "go" — judged against THIS trial's randomised window
      const ms = Math.round(performance.now() - goAt);
      if (ms < currentWindow.minMs) {
        fail(
          "TOO FAST",
          `${ms} ms. Window was ${currentWindow.minMs}–${currentWindow.maxMs} ms. No human reacts that fast. That is robot speed. Suspicious.`
        );
        return;
      }
      if (ms > currentWindow.maxMs) {
        fail(
          "TOO SLOW",
          `${ms} ms. The window was ${currentWindow.minMs}–${currentWindow.maxMs} ms. You missed it.`
        );
        return;
      }

      // In window — a good hit.
      hits += 1;
      hitsLabel.textContent = `${hits} / ${config.targetHits} GOOD`;
      msLabel.textContent = `${ms} ms — IN WINDOW ✓`;
      status.textContent = `${ms} ms — GOOD. ${hits} / ${config.targetHits}`;
      if (hits >= config.targetHits) {
        finished = true;
        clearTimers();
        setPanel("is-go", "PASSED", `${ms} ms on the last one. Suspiciously human.`);
        onComplete({ gameId: "reaction-time", mistakes, bestMs: ms });
        return;
      }
      state = "result";
      setPanel("is-good", "GOOD HIT", `${ms} ms — in window. ${hits} / ${config.targetHits}. Again.`);
      schedule(startTrial, 800);
    }

    panel.addEventListener("click", onPanelClick);
    schedule(startTrial, 600);

    return function cleanup() {
      finished = true;
      clearTimers();
      panel.removeEventListener("click", onPanelClick);
      element.replaceChildren();
    };
  }

  window.CaptchaGames.register({
    id: "reaction-time",
    type: "reaction",
    title: "Click when it turns green. Only when it turns green.",
    description:
      "React inside the ms window. Too fast is suspicious. Too slow is also suspicious. Fakeouts are lying to you.",
    mount,
  });
})();
