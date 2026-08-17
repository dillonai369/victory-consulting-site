/* Victory Consulting — Motion (Studio Seven shared library pattern) */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme (light/dark test toggle) ---------- */
  try {
    if (localStorage.getItem('vc-theme') === 'dark') document.body.classList.add('theme-dark');
  } catch (e) {}
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var dark = document.body.classList.toggle('theme-dark');
      try { localStorage.setItem('vc-theme', dark ? 'dark' : 'light'); } catch (e) {}
    });
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal, .reveal-mask').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal, .reveal-mask').forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---------- Scrim header ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var ticking = false;
    var heroDark = document.body.classList.contains('hero-dark');
    var onScroll = function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          var threshold = 40;
          header.classList.toggle('is-scrolled', window.scrollY > threshold);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Count-up stats ---------- */
  var counters = document.querySelectorAll('.big-stat .num[data-count]');
  if (counters.length && !reduced && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var el = e.target;
        var target = parseInt(el.getAttribute('data-count'), 10);
        var suffix = el.getAttribute('data-suffix') || '';
        var start = null, dur = 1600;
        function step(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString('en-US') + (p === 1 ? suffix : '');
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- Team flip cards ---------- */
  document.querySelectorAll('.team-grid .person').forEach(function (card) {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('click', function () { card.classList.toggle('flipped'); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('flipped'); }
    });
  });

  /* ---------- Mobile menu ---------- */
  var toggle = document.getElementById('menuToggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }
})();
