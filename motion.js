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
  function setFinal(el){
    var t=parseInt(el.getAttribute('data-count'),10);
    el.textContent=t.toLocaleString('en-US')+(el.getAttribute('data-suffix')||'');
  }
  if (counters.length && (reduced || !('IntersectionObserver' in window))) {
    counters.forEach(setFinal);
  }
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
        /* safety net: if the animation failed for any reason, show the real number */
        setTimeout(function(){ if(/^0?$/.test(el.textContent.trim())) setFinal(el); }, 3000);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- Team flip cards ---------- */
  document.querySelectorAll('.team-grid .person').forEach(function (card) {
    var img = card.querySelector('.photo img');
    if (!img) return;
    var slug = (img.getAttribute('src').match(/team\/([a-z-]+)\.jpg/) || [])[1];
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.style.cursor = 'pointer';
    function isMobile(){ return window.matchMedia('(max-width: 900px)').matches; }
    function act(e){
      if (isMobile() && slug) { window.location.href = 'team/' + slug + '.html'; return; }
      if (e && e.target && e.target.closest('.profile-link')) return;
      card.classList.toggle('flipped');
    }
    card.addEventListener('click', act);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); }
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

// "What's your elephant?" tooltip — tap to toggle on touch devices
document.querySelectorAll('.tip').forEach(function(t){
  t.addEventListener('click', function(e){ e.preventDefault(); t.classList.toggle('open'); });
  document.addEventListener('click', function(e){ if(!t.contains(e.target)) t.classList.remove('open'); });
});

/* ===== FORM SPAM SCORING =====
   Tags likely-spam submissions in the email subject so Victory can see at a
   glance what to ignore. Nothing is ever blocked — every submission still sends. */
(function () {
  var PHRASES = [
    // permission-to-decline closers (strongest signal — real leads never pre-apologize)
    'not interested', 'no hard feelings', 'close the loop', "isn't a priority",
    'unsubscribe', 'remove you from', 'unsolicited',
    // lending / merchant cash advance
    'hard pull', 'no pg', 'line of credit', ' loc ', 'percent a month', '% a month',
    'approved in 24', 'within 24 hours', 'funding', 'capital', 'working capital',
    // fake investor / M&A bait
    'family office', 'your vertical', 'in your industry', 'acquisition',
    'capital markets', 'investors', 'private equity',
    // generic cold outreach boilerplate
    'circling back', 'following up on my previous', 'brief conversation',
    'quick sync', 'quick chat', 'minutes of your time', 'no-commitment',
    'growth channel', 'found this email', 'found your email', 'saw your website',
    'seo', 'rank higher', 'backlinks', 'lead generation', 'cold email',
    'web design', 'guest post', 'crypto', 'bitcoin', 'loan'
  ];
  var BAD_TLD = /\.(info|top|xyz|click|buzz|cyou|shop|online|site)$/i;
  var loaded = Date.now();

  function score(form) {
    var g = function (n) { var e = form.querySelector('[name="' + n + '"]'); return e ? String(e.value || '') : ''; };
    var msg = g('message'), name = g('name'), email = g('email'), phone = g('phone');
    var blob = (name + ' ' + msg).toLowerCase();
    var s = 0;

    if (/https?:\/\/|www\./i.test(msg)) s += 3;           // links in an inquiry
    if (/<a\s|\[url|\[link/i.test(msg)) s += 4;            // markup = bot
    var hits = 0;
    for (var i = 0; i < PHRASES.length; i++) if (blob.indexOf(PHRASES[i]) !== -1) hits++;
    s += hits * 2;
    if (/@/.test(email) && BAD_TLD.test(email.split('@')[1] || '')) s += 2;
    if (msg.replace(/\s/g, '').length < 15) s += 1;        // near-empty
    if (Date.now() - loaded < 4000) s += 3;                // filled faster than a human reads
    if (/(.)\1{6,}/.test(phone.replace(/\D/g, ''))) s += 2; // 0000000000
    if (/[А-Яа-яЁё一-鿿]/.test(msg)) s += 2;        // cyrillic / CJK
    if ((msg.match(/[A-Z]/g) || []).length > msg.length * 0.5 && msg.length > 25) s += 1;
    return s;
  }

  document.querySelectorAll('form[action*="formsubmit.co"]').forEach(function (form) {
    form.addEventListener('submit', function () {
      try {
        if (score(form) < 4) return;
        var subj = form.querySelector('input[name="_subject"]');
        if (subj && subj.value.indexOf('LIKELY SPAM') === -1) {
          subj.value = '🔴 LIKELY SPAM — ' + subj.value;
        }
      } catch (e) { /* never block a real submission */ }
    }, true);
  });
})();
