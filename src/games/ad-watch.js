(function () {
  const AD_SECONDS = 20 * 60;
  const SKIP_PENALTY_SECONDS = 60;
  const SLIDE_SECONDS = 9;

  // Made-up products only. Each slide rotates while the ad "plays".
  const slides = [
    { brand: "CloudSock™", line: "Socks. But in the cloud.", sub: "Your feet, synced across all devices.", bg: "#2f6fde", fg: "#fff" },
    { brand: "Hydr8", line: "Water, now with a subscription.", sub: "Cancel anytime. (You can't.)", bg: "#0f9d8a", fg: "#fff" },
    { brand: "NapFlix Pro", line: "Watch other people sleep.", sub: "4K. HDR. Snoring in Dolby Atmos.", bg: "#232331", fg: "#f6d36b" },
    { brand: "Toast.ai", line: "Bread, disrupted.", sub: "Our model has read every toaster manual.", bg: "#e58a2e", fg: "#2a1600" },
    { brand: "Rock™", line: "It's a rock.", sub: "Limited edition. Ships in 6–8 geological eras.", bg: "#8a8f98", fg: "#fff" },
    { brand: "Chair+", line: "Sit premium.", sub: "Unlock the fourth leg for $4.99/mo.", bg: "#b8325b", fg: "#fff" }
  ];

  const format = (seconds) => {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function mount({ element, onComplete, onFail }) {
    let remaining = AD_SECONDS;
    let total = AD_SECONDS;
    let mistakes = 0;
    let finished = false;
    let lastTick = performance.now();
    let slideIndex = Math.floor(Math.random() * slides.length);
    let slideClock = 0;

    element.innerHTML = `
      <div class="ad-game">
        <div class="ad-player" aria-label="Advertisement">
          <div class="ad-slide" id="ad-slide">
            <strong class="ad-brand" id="ad-brand"></strong>
            <span class="ad-line" id="ad-line"></span>
            <span class="ad-sub" id="ad-sub"></span>
          </div>
          <div class="ad-badge">Ad · <span id="ad-time">${format(remaining)}</span></div>
          <button class="ad-skip" id="ad-skip" type="button">Skip Ad <span aria-hidden="true">▸</span></button>
          <div class="ad-paused" id="ad-paused" hidden>
            <strong>Ad paused</strong>
            <span>We noticed you looked away. Come back to keep watching.</span>
          </div>
          <div class="ad-progress"><span id="ad-progress"></span></div>
        </div>
      </div>
    `;

    const slide = element.querySelector("#ad-slide");
    const brand = element.querySelector("#ad-brand");
    const line = element.querySelector("#ad-line");
    const sub = element.querySelector("#ad-sub");
    const time = element.querySelector("#ad-time");
    const skip = element.querySelector("#ad-skip");
    const paused = element.querySelector("#ad-paused");
    const progress = element.querySelector("#ad-progress");

    function showSlide() {
      const s = slides[slideIndex];
      slide.style.background = s.bg;
      slide.style.color = s.fg;
      brand.textContent = s.brand;
      line.textContent = s.line;
      sub.textContent = s.sub;
      slide.classList.remove("is-entering");
      void slide.offsetWidth; // restart the entrance animation
      slide.classList.add("is-entering");
    }

    function isWatching() {
      return document.visibilityState === "visible" && document.hasFocus();
    }

    function render() {
      time.textContent = format(remaining);
      progress.style.width = `${(100 * (total - remaining)) / total}%`;
    }

    function tick() {
      const now = performance.now();
      const dt = Math.min((now - lastTick) / 1000, 1); // never credit more than 1s per tick
      lastTick = now;
      if (finished) return;
      const watching = isWatching();
      paused.hidden = watching;
      if (!watching) return;

      remaining -= dt;
      slideClock += dt;
      if (slideClock >= SLIDE_SECONDS) {
        slideClock = 0;
        slideIndex = (slideIndex + 1) % slides.length;
        showSlide();
      }
      render();
      if (remaining <= 0) {
        finished = true;
        window.clearInterval(timer);
        skip.textContent = "Ad complete";
        skip.disabled = true;
        onComplete({ gameId: "ad-watch", mistakes });
      }
    }

    skip.addEventListener("click", () => {
      if (finished) return;
      mistakes += 1;
      remaining += SKIP_PENALTY_SECONDS;
      total += SKIP_PENALTY_SECONDS;
      skip.classList.remove("is-denied");
      void skip.offsetWidth;
      skip.classList.add("is-denied");
      render();
      onFail({ mistakes, gameId: "ad-watch" });
    });

    showSlide();
    render();
    const timer = window.setInterval(tick, 250);

    return function cleanup() {
      finished = true;
      window.clearInterval(timer);
      element.replaceChildren();
    };
  }

  window.CaptchaGames.register({
    id: "ad-watch",
    type: "patience",
    title: "Watch this short ad.",
    description: "",
    mount
  });
})();
