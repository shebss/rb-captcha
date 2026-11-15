(function () {
  const games = window.CaptchaGames.list();
  const checkbox = document.querySelector("#login-captcha");
  const checkboxBox = document.querySelector(".login-captcha-box");
  const checkboxStatus = document.querySelector("#login-captcha-status");
  const challenge = document.querySelector("#login-challenge");
  const gameTitle = document.querySelector("#login-game-title");
  const gameHost = document.querySelector("#login-game-host");
  const gameStatus = document.querySelector("#login-game-status");
  const submitButton = document.querySelector("#login-submit");
  const loginNote = document.querySelector("#login-note");
  const skipButton = document.querySelector("#login-skip-button");
  const gameSelector = document.querySelector("#login-game-selector");
  const offer = document.querySelector("#login-offer");
  const offerEyebrow = document.querySelector("#login-offer-eyebrow");
  const offerCopy = document.querySelector("#login-offer-copy");
  const offerBuy = document.querySelector("#login-offer-buy");
  const offerBuyLabel = offerBuy.textContent;
  let cleanupGame = null;
  let previousGameId = "";
  let verified = false;
  let mistakes = 0;

  function openOffer(eyebrow, copy, { nag = false } = {}) {
    offer.classList.toggle("is-nag", nag);
    offerEyebrow.textContent = eyebrow;
    offerCopy.textContent = copy;
    if (!offer.open) offer.showModal();
  }

  const randomNags = [
    "Still here? You could skip this for $0.99.",
    "Real humans have better things to do. Skip verification for $0.99.",
    "This is taking a while. Want to just pay $0.99 and be done?",
    "Friendly reminder: the easy way is only $0.99.",
    "Your time is worth more than $0.99. Probably."
  ];
  let nagTimer = null;

  function stopRandomNag() {
    window.clearTimeout(nagTimer);
    nagTimer = null;
  }

  function scheduleRandomNag() {
    stopRandomNag();
    const delay = (25 + Math.random() * 35) * 1000;
    nagTimer = window.setTimeout(() => {
      if (!challenge.open || verified) return;
      if (!offer.open) {
        openOffer("Quick question", randomNags[Math.floor(Math.random() * randomNags.length)], { nag: true });
      }
      scheduleRandomNag();
    }, delay);
  }

  function markVerified(message) {
    verified = true;
    checkbox.classList.add("is-verified");
    checkbox.setAttribute("aria-pressed", "true");
    checkbox.querySelector("span:last-child").textContent = "Verified";
    checkboxStatus.textContent = message;
    submitButton.disabled = false;
    gameStatus.textContent = message;
  }

  function clearGame() {
    if (cleanupGame) cleanupGame();
    cleanupGame = null;
    gameHost.replaceChildren();
  }

  function startChallenge() {
    if (!games.length) {
      checkboxStatus.textContent = "Verification is unavailable.";
      return;
    }

    challenge.showModal();
    scheduleRandomNag();
    mountGame();
  }

  function mountGame() {
    clearGame();
    let game = gameSelector.value && games.find((candidate) => candidate.id === gameSelector.value);
    if (!game) {
      const availableGames = games.length > 1
        ? games.filter((candidate) => candidate.id !== previousGameId)
        : games;
      game = availableGames[Math.floor(Math.random() * availableGames.length)];
    }
    previousGameId = game.id;
    mistakes = 0;
    gameTitle.textContent = game.title;
    gameStatus.textContent = "Complete the challenge to continue.";
    cleanupGame = game.mount({
      element: gameHost,
      round: 1,
      onComplete: () => {
        markVerified("Verification complete.");
        stopRandomNag();
        window.setTimeout(() => challenge.close(), 650);
      },
      onOffer: () => {
        openOffer("Skip this ad?", "Pay $0.99 through Stripe Checkout to skip the ad and the CAPTCHA.");
      },
      onFail: () => {
        mistakes += 1;
        gameStatus.textContent = `Not quite. Try the challenge again. (${mistakes} ${mistakes === 1 ? "mistake" : "mistakes"})`;
        if (mistakes % 3 === 0) {
          openOffer(
            "Quick question",
            `That's ${mistakes} mistakes. Are you sure you don't want to pay? You could skip verification for $0.99.`,
            { nag: true }
          );
        }
      }
    });
  }

  // TEMP: game selector for testing. Remove before shipping.
  games.forEach((game) => gameSelector.add(new Option(`${game.title} (${game.type})`, game.id)));
  gameSelector.addEventListener("change", () => {
    if (challenge.open && !verified) mountGame();
  });

  checkbox.addEventListener("click", () => {
    if (!verified) startChallenge();
  });

  document.querySelector("#login-challenge-close").addEventListener("click", () => challenge.close());
  challenge.addEventListener("close", () => {
    stopRandomNag();
    clearGame();
    if (!verified) {
      checkboxStatus.textContent = "Verification cancelled.";
      checkbox.setAttribute("aria-pressed", "false");
    }
  });

  submitButton.addEventListener("click", () => {
    if (!verified) return;
    loginNote.textContent = "Verification passed. Authentication is not connected in this prototype.";
  });

  skipButton.addEventListener("click", () => {
    openOffer("Secure Stripe Checkout", "Continue to Stripe Checkout to pay $0.99 and skip the CAPTCHA. This does not sign you in.");
  });

  offerBuy.addEventListener("click", async () => {
    offerBuy.disabled = true;
    offerBuy.textContent = "Opening secure checkout...";
    try {
      const response = await fetch("/api/checkout-session", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Checkout could not be started.");
      }
      window.location.assign(result.url);
    } catch (error) {
      offerEyebrow.textContent = "Checkout unavailable";
      offerCopy.textContent = error.message || "Could not reach the payment server.";
      offerBuy.disabled = false;
      offerBuy.textContent = offerBuyLabel;
    }
  });

  document.querySelector("#login-offer-dismiss").addEventListener("click", () => offer.close());
  offer.addEventListener("close", () => {
    offer.classList.remove("is-nag");
    offerBuy.disabled = false;
    offerBuy.textContent = offerBuyLabel;
  });

  async function verifyCheckoutReturn() {
    const query = new URLSearchParams(window.location.search);
    const sessionId = query.get("session_id");
    if (query.get("checkout") === "cancelled") {
      history.replaceState(null, "", window.location.pathname);
      checkboxStatus.textContent = "Payment cancelled. Complete the challenge to continue.";
      return;
    }
    if (query.get("checkout") !== "success" || !sessionId) return;

    history.replaceState(null, "", window.location.pathname);
    checkboxStatus.textContent = "Confirming payment...";
    try {
      const response = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment confirmation failed.");
      if (!result.paid) throw new Error("Payment is not confirmed.");
      markVerified("Payment confirmed. CAPTCHA skipped; sign-in is still a prototype.");
    } catch (error) {
      checkboxStatus.textContent = error.message || "Could not confirm payment.";
    }
  }

  if (!games.length) {
    checkbox.disabled = true;
    checkboxStatus.textContent = "No verification games are available.";
  }
  verifyCheckoutReturn();
})();