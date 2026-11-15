(function () {
  const keys = ["amber", "blue", "green"];
  const labels = { amber: "Amber", blue: "Blue", green: "Green" };

  function mount({ element, round, onComplete, onFail }) {
    const sequenceLength = 6 + round * 2;
    const sequence = Array.from({ length: sequenceLength }, () => keys[Math.floor(Math.random() * keys.length)]);
    const timers = new Set();
    let inputIndex = 0;
    let mistakes = 0;
    let replays = 2;
    let locked = true;
    let finished = false;

    element.innerHTML = `
      <div class="sequence-game">
        <div class="sequence-heading"><span class="sequence-status" id="sequence-status">WATCH CLOSELY. NO NOTES.</span><span class="sequence-count" id="sequence-count">${sequenceLength} STEPS</span></div>
        <div class="sequence-keys" role="group" aria-label="Repeat the color sequence">
          ${keys.map((key) => `<button class="sequence-key key-${key}" type="button" data-key="${key}" aria-label="${labels[key]}"><span>${labels[key]}</span></button>`).join("")}
        </div>
        <div class="sequence-footer"><span id="sequence-progress">WATCH</span><button class="sequence-replay" id="sequence-replay" type="button">REPLAY (2)</button></div>
      </div>
    `;

    const status = element.querySelector("#sequence-status");
    const progress = element.querySelector("#sequence-progress");
    const replay = element.querySelector("#sequence-replay");
    const keyButtons = [...element.querySelectorAll(".sequence-key")];

    function schedule(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!finished) callback();
      }, delay);
      timers.add(timer);
    }

    function clearTimers() {
      timers.forEach(window.clearTimeout);
      timers.clear();
      keyButtons.forEach((button) => button.classList.remove("is-lit"));
    }

    function playSequence() {
      clearTimers();
      locked = true;
      inputIndex = 0;
      replay.disabled = replays <= 0;
      status.textContent = "WATCH CLOSELY. NO NOTES.";
      progress.textContent = "WATCH";
      const beat = Math.max(260, 440 - round * 45);
      sequence.forEach((key, index) => {
        const button = keyButtons.find((candidate) => candidate.dataset.key === key);
        schedule(() => button.classList.add("is-lit"), index * (beat + 150));
        schedule(() => button.classList.remove("is-lit"), index * (beat + 150) + beat * 0.62);
      });
      schedule(() => {
        locked = false;
        status.textContent = "YOUR TURN. TRY NOT TO PANIC.";
        progress.textContent = `0 / ${sequenceLength}`;
      }, sequence.length * (beat + 150));
    }

    function choose(key) {
      if (locked || finished) return;
      if (sequence[inputIndex] !== key) {
        mistakes += 1;
        inputIndex = 0;
        onFail({ mistakes, gameId: "sequence-memory" });
        status.textContent = "NOPE. WATCH IT AGAIN.";
        schedule(playSequence, 400);
        return;
      }
      inputIndex += 1;
      progress.textContent = `${inputIndex} / ${sequenceLength}`;
      if (inputIndex === sequenceLength) {
        finished = true;
        status.textContent = "IMPRESSIVE. DEEPLY INCONVENIENT.";
        onComplete({ gameId: "sequence-memory", mistakes });
      }
    }

    keyButtons.forEach((button) => button.addEventListener("click", () => choose(button.dataset.key)));
    replay.addEventListener("click", () => {
      if (locked || replays <= 0) return;
      replays -= 1;
      replay.textContent = `REPLAY (${replays})`;
      playSequence();
    });
    playSequence();

    return function cleanup() {
      finished = true;
      clearTimers();
      element.replaceChildren();
    };
  }

  window.CaptchaGames.register({
    id: "sequence-memory",
    type: "memory",
    title: "Repeat the color sequence.",
    description: "Watch the lights, then repeat every step in the same order.",
    mount
  });
})();