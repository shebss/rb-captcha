(function () {
  const randomPosition = (size, padding) => Math.round(padding + Math.random() * (size - padding * 2));

  function mount({ element, round, onComplete, onFail }) {
    const dodgeLimit = 12 + round * 4;
    let dodges = 0;
    let mistakes = 0;
    let finished = false;
    let moving = true;

    element.innerHTML = `
      <div class="arena" aria-label="Game area">
        <div class="arena-grid" aria-hidden="true"></div>
        <div class="arena-status"><span class="arena-pulse"></span><span id="arena-message"></span></div>
        <button class="dot-target" type="button" aria-label="Green dot"></button>
        <button class="dot-decoy decoy-one" type="button" aria-label="Blue decoy"></button>
        <button class="dot-decoy decoy-two" type="button" aria-label="Orange decoy"></button>
        <button class="dot-decoy decoy-three" type="button" aria-label="Lime decoy"></button>
        <button class="dot-decoy decoy-four" type="button" aria-label="Dark green decoy"></button>
        <div class="arena-coordinates" aria-hidden="true">X: ??? &nbsp; Y: ???</div>
      </div>
    `;

    const arena = element.querySelector(".arena");
    const target = element.querySelector(".dot-target");
    const decoys = element.querySelectorAll(".dot-decoy");
    const message = element.querySelector("#arena-message");

    function place(button) {
      const bounds = arena.getBoundingClientRect();
      const edgeX = Math.max(38, bounds.width - 38);
      const edgeY = Math.max(75, bounds.height - 38);
      button.style.left = `${randomPosition(edgeX, 38)}px`;
      button.style.top = `${randomPosition(edgeY, 75)}px`;
    }

    function resetTargets() {
      place(target);
      decoys.forEach(place);
    }

    function dodge() {
      if (!moving || finished) return;
      dodges += 1;
      resetTargets();
      message.textContent = dodges >= dodgeLimit - 1 ? "ALMOST DONE DODGING. ALMOST." : "TARGET RELOCATED. VERY NORMAL.";
      if (dodges >= dodgeLimit) {
        moving = false;
        message.textContent = "TARGET HAS GIVEN UP. YOUR TURN.";
        target.classList.add("is-still");
      }
    }

    function miss() {
      if (finished) return;
      mistakes += 1;
      target.classList.remove("is-still");
      moving = true;
      dodges = 0;
      resetTargets();
      message.textContent = "THAT WAS NOT THE DOT. START OVER.";
      onFail({ mistakes, gameId: "precision-dot" });
    }

    target.addEventListener("pointerenter", dodge);
    target.addEventListener("click", () => {
      if (finished) return;
      if (moving) {
        dodge();
        return;
      }
      finished = true;
      message.textContent = "A HUMAN WOULD CALL THAT A WIN.";
      onComplete({ gameId: "precision-dot", mistakes, dodges });
    });
    decoys.forEach((decoy) => decoy.addEventListener("click", miss));

    resetTargets();

    return function cleanup() {
      finished = true;
      element.replaceChildren();
    };
  }

  window.CaptchaGames.register({
    id: "precision-dot",
    type: "precision",
    title: "Locate the green dot.",
    description: "",
    mount
  });
})();