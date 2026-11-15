# Adding a game

Each game is an independent script that registers one definition with `window.CaptchaGames`. The host populates the game selector from registered definitions; game-specific markup, state, and rules stay in the game's own module.

```js
window.CaptchaGames.register({
  id: "unique-game-id",
  type: "memory",
  title: "A short prompt",
  description: "One sentence of instructions.",
  mount({ element, round, onComplete, onFail }) {
    // Render into element and attach game-specific listeners.
    // Call onComplete() when won and onFail({ mistakes }) when missed.
    // Optional: call onOffer() to ask the host to show its paid-skip offer.
    // Return a cleanup function to remove listeners and timers.
    return () => element.replaceChildren();
  }
});
```

Add the script to `index.html` after `src/registry.js` and before `src/app.js`. Keep round orchestration, progress, and payment in `src/app.js`; a game should not depend on those host details.