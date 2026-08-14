// The sprinkle of JS: one button that pours an extra ladle of gravy.
// Everything visual is CSS — this only replays an animation and drops
// another curd on the pile.
(function () {
  const scene = document.getElementById('scene');
  const pile  = scene.querySelector('.pile');
  const btn   = document.getElementById('more');
  let extra = 0;

  btn.addEventListener('click', () => {
    scene.classList.remove('saucy');
    void scene.offsetWidth;            // restart the animation
    scene.classList.add('saucy');

    if (extra < 6) {
      const curd = document.createElement('i');
      curd.className = 'curd melting';
      curd.style.cssText =
        `--x:${30 + Math.random() * 42}%;` +
        `--y:${46 + Math.random() * 26}%;` +
        `--d:${7 + Math.random() * 4};` +
        `--r:${Math.random() * 60 - 30}deg`;
      pile.appendChild(curd);
      extra++;
    }
    btn.textContent = extra < 6 ? 'Add more gravy' : "That's plenty, friend";
  });
})();
