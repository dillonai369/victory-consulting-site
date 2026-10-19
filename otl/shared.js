/* OTL shared logic: calendar, slot IDs, response codes, eligibility. Pure functions, no DOM. */
(function (root) {
  'use strict';
  var OTL = {};
  var ZONES = ['ET', 'CT', 'MT', 'PT'];
  var ZOFF = { ET: 0, CT: 60, MT: 120, PT: 180 };
  var ZNAME = { ET: 'Eastern', CT: 'Central', MT: 'Mountain', PT: 'Pacific' };
  var DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  var DOFF = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4 };
  var DSHORT = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri' };
  var DLONG = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  OTL.ZONES = ZONES; OTL.ZOFF = ZOFF; OTL.ZNAME = ZNAME; OTL.DAYS = DAYS; OTL.DSHORT = DSHORT; OTL.DLONG = DLONG;

  OTL.defaults = function () {
    return {
      v: 1,
      days: ['TUE', 'WED', 'THU'],
      firstStart: 480,          // 8:00am ET, minutes after midnight
      lastStart: 1110,          // 6:30pm ET = 3:30pm PT
      interval: 30,
      prep: 15, live: 90, log: 15,
      cohortWinStart: 480,      // cohort local 8:00am
      cohortWinEnd: 1020,       // cohort local 5:00pm
      zones: { ET: 75, CT: 75, MT: 75, PT: 75 },
      retired: ['W2-THU'],
      blockedSlots: [],
      maxPerDay: 4,
      allowedMisses: 0,
      oversub: 1.5,
      minCohorts: 12, maxCohorts: 16,
      maxConcurrent: 0,
      b2bMaxHard: true,
      prefFirst: true,          // every Preferred time is used before Available ones
      weights: { scarcity: 100, preferred: 50, minimum: 25, fit: 12, tier: 6, earliest: 3, balance: 4 },
      standby: { on: false, perDay: 1 },
      blocks: [
        { id: 'S1', weeks: ['2027-01-18', '2027-01-25', '2027-02-01', '2027-02-08'] },
        { id: 'S2', weeks: ['2027-02-15', '2027-02-22', '2027-03-01', '2027-03-08'] },
        { id: 'S3', weeks: ['2027-03-15', '2027-03-22', '2027-03-29', '2027-04-05'] },
        { id: 'S4', weeks: ['2027-04-12', '2027-04-19', '2027-04-26', '2027-05-03'] },
        { id: 'S5', weeks: ['2027-05-17', '2027-05-24', '2027-06-07', '2027-06-14'] },
        { id: 'S6', weeks: ['2027-06-21', '2027-06-28', '2027-07-12', '2027-07-19'] },
        { id: 'S7', weeks: ['2027-07-26', '2027-08-02', '2027-08-09', '2027-08-16'] },
        { id: 'S8', weeks: ['2027-08-30', '2027-09-13', '2027-09-20', '2027-09-27'] },
        { id: 'S9', weeks: ['2027-10-04', '2027-10-11', '2027-10-18', '2027-10-25'] },
        { id: 'S10', weeks: ['2027-11-01', '2027-11-08', '2027-11-15', '2027-11-29'] }
      ]
    };
  };

  OTL.mergeCfg = function (saved) {
    var d = OTL.defaults();
    if (!saved || typeof saved !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (saved[k] === undefined || saved[k] === null) return;
      if (k === 'weights' || k === 'standby' || k === 'zones') {
        Object.keys(d[k]).forEach(function (kk) { if (saved[k][kk] !== undefined) d[k][kk] = saved[k][kk]; });
      } else d[k] = JSON.parse(JSON.stringify(saved[k]));
    });
    return d;
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  OTL.hhmm = function (t) { return pad2(Math.floor(t / 60)) + pad2(t % 60); };
  OTL.fmtTime = function (t, short) {
    t = ((t % 1440) + 1440) % 1440;
    var h = Math.floor(t / 60), m = t % 60, ap = h < 12 ? 'am' : 'pm', h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad2(m) + (short ? '' : ' ' + ap);
  };
  OTL.fmtRange = function (t, len) {
    var a = ((t % 1440) + 1440) % 1440, b = (((t + len) % 1440) + 1440) % 1440;
    var same = (a < 720) === (b < 720);
    return OTL.fmtTime(t, same) + '–' + OTL.fmtTime(t + len);
  };
  OTL.timeInput = function (t) { return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); };
  OTL.parseTimeInput = function (s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null;
  };

  OTL.starts = function (cfg) {
    var out = [], iv = Math.max(5, cfg.interval | 0);
    for (var t = cfg.firstStart; t <= cfg.lastStart; t += iv) out.push(t);
    return out;
  };
  OTL.blockLen = function (cfg) { return cfg.prep + cfg.live + cfg.log; };
  OTL.orderedDays = function (cfg) { return DAYS.filter(function (d) { return cfg.days.indexOf(d) >= 0; }); };
  OTL.weekDays = function (cfg) {
    var out = [], days = OTL.orderedDays(cfg);
    for (var w = 1; w <= 4; w++) days.forEach(function (d) {
      var key = 'W' + w + '-' + d;
      if (cfg.retired.indexOf(key) < 0) out.push({ w: w, d: d, key: key });
    });
    return out;
  };
  OTL.slotId = function (w, d, t) { return 'W' + w + '-' + d + '-' + OTL.hhmm(t); };
  OTL.parseSlot = function (id) {
    var m = /^W([1-4])-([A-Z]{3})-(\d{2})(\d{2})$/.exec(String(id || '').trim().toUpperCase());
    return m && DOFF[m[2]] !== undefined ? { w: +m[1], d: m[2], t: (+m[3]) * 60 + (+m[4]), key: 'W' + m[1] + '-' + m[2] } : null;
  };

  OTL.addDays = function (iso, n) {
    var p = iso.split('-'), dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  };
  OTL.fmtDate = function (iso, withDay) {
    var p = iso.split('-'), dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
    return (withDay === false ? '' : dn + ' ') + MON[+p[1] - 1] + ' ' + (+p[2]);
  };
  OTL.datesFor = function (cfg, w, d) {
    return cfg.blocks.map(function (b) { return OTL.addDays(b.weeks[w - 1], DOFF[d]); });
  };
  /* Every delivery date in the program, in calendar order, skipping retired week-days. */
  OTL.allDates = function (cfg) {
    var out = [];
    cfg.blocks.forEach(function (b, bi) {
      OTL.weekDays(cfg).forEach(function (wd) {
        out.push({ iso: OTL.addDays(b.weeks[wd.w - 1], DOFF[wd.d]), b: bi, w: wd.w, d: wd.d, key: wd.key });
      });
    });
    out.sort(function (a, c) { return a.iso < c.iso ? -1 : a.iso > c.iso ? 1 : 0; });
    return out;
  };
  /* Which cohort time zones can meet at ET start t (session inside the cohort's local hours). */
  OTL.zonesFor = function (cfg, t) {
    return ZONES.filter(function (z) {
      var local = t - ZOFF[z];
      return local >= cfg.cohortWinStart && local + cfg.live <= cfg.cohortWinEnd;
    });
  };

  /* ---------- responses ---------- */
  OTL.blankGrid = function (cfg) {
    var n = OTL.starts(cfg).length, g = {};
    DAYS.forEach(function (d) { g[d] = new Array(n + 1).join('0'); });
    return g;
  };
  OTL.blankResponse = function (cfg) {
    return {
      v: 1, name: '', tz: 'ET', min: cfg.minCohorts, max: cfg.maxCohorts, maxDay: Math.min(3, cfg.maxPerDay),
      b2bMin: 1, b2bMax: 2, weeks: [1, 1, 1, 1], shape: 'none', byWeek: false,
      fs: cfg.firstStart, iv: cfg.interval,
      grid: OTL.blankGrid(cfg), grids: null, blackouts: [], unknown: '', unknownBy: '',
      standby: null, notes: '', first: '', updated: ''
    };
  };
  OTL.gridRating = function (resp, w, d, t) {
    var g = resp.byWeek && resp.grids ? resp.grids[w - 1] : resp.grid;
    if (!g || !g[d]) return 0;
    var idx = (t - resp.fs) / resp.iv;
    if (idx < 0 || idx !== Math.floor(idx) || idx >= g[d].length) return 0;
    return +g[d].charAt(idx) || 0;
  };
  /* A planning stand-in for a facilitator who has not answered: Available 8:00am-5:00pm in their own time zone. */
  OTL.openResponse = function (cfg, tz, maxDay) {
    var r = OTL.blankResponse(cfg), off = ZOFF[tz] || 0, st = OTL.starts(cfg);
    r.tz = tz; r.maxDay = maxDay || cfg.maxPerDay; r.b2bMin = 1; r.b2bMax = r.maxDay;
    var row = st.map(function (t) { var l = t - off; return l >= 480 && l + cfg.live <= 1020 ? '1' : '0'; }).join('');
    DAYS.forEach(function (d) { r.grid[d] = row; });
    r.assumed = true;
    return r;
  };
  function blackoutMap(resp) {
    var m = {};
    (resp.blackouts || []).forEach(function (b) { (m[b.d] = m[b.d] || []).push(b); });
    return m;
  }
  /* Standing slots this response can hold: rated, week rated, and clear on every one of the block dates. */
  OTL.eligible = function (cfg, resp) {
    var st = OTL.starts(cfg), bm = blackoutMap(resp), slots = {}, lost = {};
    OTL.weekDays(cfg).forEach(function (wd) {
      var wr = +(resp.weeks || [])[wd.w - 1] || 0;
      var dates = OTL.datesFor(cfg, wd.w, wd.d);
      st.forEach(function (t) {
        var r = OTL.gridRating(resp, wd.w, wd.d, t);
        if (!r || !wr) return;
        var a = t - cfg.prep, b = t + cfg.live + cfg.log, miss = [];
        dates.forEach(function (iso) {
          var list = bm[iso]; if (!list) return;
          for (var i = 0; i < list.length; i++) {
            var x = list[i];
            if (x.from === null || x.from === undefined || (x.from < b && x.to > a)) { miss.push(iso); break; }
          }
        });
        var id = OTL.slotId(wd.w, wd.d, t);
        if (miss.length > cfg.allowedMisses) lost[id] = miss;
        else slots[id] = { r: r, wr: wr, miss: miss };
      });
    });
    return { slots: slots, lost: lost };
  };
  /* How many cohorts this response has room for: non-overlapping blocks per week-day, capped at maxDay. */
  OTL.capacity = function (cfg, resp, maxDay) {
    var el = OTL.eligible(cfg, resp), st = OTL.starts(cfg), BL = OTL.blockLen(cfg);
    var perDay = {}, lostDays = {}, room = 0, clear = Object.keys(el.slots).length;
    maxDay = Math.max(1, Math.min(cfg.maxPerDay, maxDay || resp.maxDay || cfg.maxPerDay));
    OTL.weekDays(cfg).forEach(function (wd) {
      var n = 0, last = -1e9, lostSet = {};
      st.forEach(function (t) {
        var id = OTL.slotId(wd.w, wd.d, t);
        if (el.slots[id]) { if (t - last >= BL) { n++; last = t; } }
        else if (el.lost[id]) el.lost[id].forEach(function (iso) { lostSet[iso] = 1; });
      });
      n = Math.min(n, maxDay);
      perDay[wd.key] = n; room += n;
      lostDays[wd.key] = Object.keys(lostSet).sort();
    });
    return { clear: clear, room: room, perDay: perDay, lostDays: lostDays };
  };
  OTL.required = function (cfg, resp) { return Math.ceil((+resp.max || 0) * cfg.oversub); };

  /* ---------- response codes ---------- */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function utf8(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function unutf8(b) {
    var s = '', i = 0, c;
    while (i < b.length) {
      c = b[i++];
      if (c < 0x80) { }
      else if (c < 0xe0) c = ((c & 31) << 6) | (b[i++] & 63);
      else if (c < 0xf0) { c = ((c & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63); i += 2; }
      else { c = ((c & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; }
      s += String.fromCodePoint(c);
    }
    return s;
  }
  function b64e(bytes) {
    var s = '', i, n;
    for (i = 0; i < bytes.length; i += 3) {
      n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
      if (i + 2 < bytes.length) s += B64[n & 63];
    }
    return s;
  }
  function b64d(s) {
    var out = [], i, n, k, c, buf = 0, bits = 0;
    for (i = 0; i < s.length; i++) {
      c = B64.indexOf(s[i]); if (c < 0) throw new Error('bad');
      buf = (buf << 6) | c; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }
  function check(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  OTL.encode = function (resp) {
    var p = b64e(utf8(JSON.stringify(resp)));
    return 'OTL1.' + p + '.' + check(p);
  };
  /* Returns {ok:true, resp} or {ok:false, error}. */
  OTL.decode = function (code) {
    var m = /OTL1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})/.exec(String(code || '').replace(/\s+/g, ''));
    if (!m) return { ok: false, error: 'This does not look like a response code. It should start with OTL1.' };
    if (check(m[1]) !== m[2]) return { ok: false, error: 'This code is incomplete. Ask for it to be copied and sent again.' };
    try {
      var r = JSON.parse(unutf8(b64d(m[1])));
      if (!r || typeof r !== 'object' || !r.grid) throw new Error('shape');
      return { ok: true, resp: r };
    } catch (e) { return { ok: false, error: 'This code could not be read. Ask for it to be copied and sent again.' }; }
  };
  /* Pull every code out of a pasted blob of text. */
  /* Spaces and line breaks are removed first, because email programs often wrap a long code across lines. */
  OTL.findCodes = function (text) {
    return String(text || '').replace(/(^|\n)[ \t]*(>[ \t]*)+/g, '$1').replace(/\s+/g, '').match(/OTL1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}/g) || [];
  };
  OTL.normName = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };

  OTL.placeholderCohorts = function (cfg) {
    var out = [];
    ZONES.forEach(function (z) {
      for (var i = 1; i <= (cfg.zones[z] | 0); i++) out.push({ id: z + '-' + ('00' + i).slice(-3), tz: z });
    });
    return out;
  };

  root.OTL = OTL;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* OTL shared interface pieces: element helper, rating control, weekly grid, blackout dates. */
(function (root) {
  'use strict';
  var OTL = root.OTL, ui = {};
  var RLAB = ['Not available', 'Available', 'Preferred'], RSHORT = ['–', 'A', 'P'];
  ui.RLAB = RLAB;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') n[k] = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids === undefined || kids === null ? [] : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return n;
  }
  ui.el = el;
  ui.clear = function (n) { n.textContent = ''; return n; };

  /* Segmented choice. options: [{v, label, cls}] */
  ui.seg = function (opts) {
    var box = el('div', { class: 'seg', role: 'group', 'aria-label': opts.label || '' });
    function paint() {
      Array.prototype.forEach.call(box.children, function (b) { b.setAttribute('aria-pressed', String(String(opts.get()) === b.dataset.v)); });
    }
    opts.options.forEach(function (o) {
      box.appendChild(el('button', { type: 'button', id: opts.id ? opts.id + '-' + o.v : null, class: o.cls || 'on', 'data-v': String(o.v), text: o.label,
        onclick: function () { opts.set(o.v); paint(); } }));
    });
    paint(); box.paint = paint;
    return box;
  };
  ui.ratingSeg = function (id, label, get, set) {
    return ui.seg({ id: id, label: label, get: get, set: set, options: [
      { v: 2, label: 'Preferred', cls: 'v2' }, { v: 1, label: 'Available', cls: 'v1' }, { v: 0, label: 'Not available', cls: 'v0' }] });
  };

  function setChar(s, i, ch) { return s.slice(0, i) + ch + s.slice(i + 1); }

  /* Weekly grid editor. state: {cfg, resp, onChange, id} */
  ui.grid = function (host, st) {
    var cfg = st.cfg, brush = 2, week = 1, painting = false;
    function resp() { return st.resp; }
    function g() { var r = resp(); return r.byWeek ? r.grids[week - 1] : r.grid; }
    function render() {
      var r = resp(), off = OTL.ZOFF[r.tz] || 0, starts = OTL.starts(cfg), days = OTL.orderedDays(cfg);
      ui.clear(host);
      var tools = el('div', { class: 'row' }, [
        el('div', { class: 'stack', style: 'gap:4px' }, [
          el('span', { class: 'small muted', text: 'Pick a rating, then click or drag across times' }),
          ui.seg({ id: st.id + '-brush', label: 'Rating to paint', get: function () { return brush; }, set: function (v) { brush = v; },
            options: [{ v: 2, label: 'Preferred', cls: 'v2' }, { v: 1, label: 'Available', cls: 'v1' }, { v: 0, label: 'Not available', cls: 'v0' }] })
        ]),
        el('button', { type: 'button', class: 'btn ghost small', id: st.id + '-clear', text: 'Clear this grid', onclick: function () {
          var gg = g(); OTL.DAYS.forEach(function (d) { gg[d] = gg[d].replace(/./g, '0'); }); changed(); render();
        } })
      ]);
      host.appendChild(tools);
      var bw = el('label', { class: 'small', style: 'display:flex;gap:8px;align-items:center' }, [
        el('input', { type: 'checkbox', id: st.id + '-byweek', checked: r.byWeek, onchange: function (e) {
          if (e.target.checked) { r.grids = [1, 2, 3, 4].map(function () { return JSON.parse(JSON.stringify(r.grid)); }); r.byWeek = true; }
          else { r.grid = JSON.parse(JSON.stringify(r.grids[week - 1])); r.byWeek = false; r.grids = null; }
          changed(); render();
        } }),
        'My times differ from week to week within a block'
      ]);
      host.appendChild(bw);
      if (r.byWeek) {
        host.appendChild(ui.seg({ id: st.id + '-wk', label: 'Week of the block', get: function () { return week; }, set: function (v) { week = v; render(); },
          options: [1, 2, 3, 4].map(function (w) { return { v: w, label: 'Week ' + w }; }) }));
      }
      var gg = g();
      var head = el('tr', null, [el('th', { class: 'time', text: (OTL.ZNAME[r.tz] || 'Eastern') + ' time' })].concat(days.map(function (d) {
        var retired = r.byWeek && cfg.retired.indexOf('W' + week + '-' + d) >= 0;
        return el('th', null, [OTL.DLONG[d], retired ? el('small', { class: 'muted', style: 'display:block;font-weight:400', text: 'No sessions' }) :
          el('button', { type: 'button', class: 'fill', id: st.id + '-fill-' + d, text: 'fill column', onclick: function () {
            gg[d] = gg[d].replace(/./g, String(brush)); changed(); render();
          } })]);
      })));
      var body = el('tbody');
      starts.forEach(function (t, i) {
        var tr = el('tr', null, [el('th', { class: 'time', scope: 'row' }, [OTL.fmtRange(t - off, cfg.live),
          off ? el('small', { text: OTL.fmtTime(t) + ' ET' }) : null])]);
        days.forEach(function (d) {
          var retired = r.byWeek && cfg.retired.indexOf('W' + week + '-' + d) >= 0;
          var v = +gg[d].charAt(i) || 0;
          var b = el('button', { type: 'button', class: 'cell r' + v, id: st.id + '-c-' + d + '-' + i, disabled: retired,
            'aria-label': OTL.DLONG[d] + ' ' + OTL.fmtTime(t - off) + ': ' + RLAB[v] }, [
            el('span', { class: 'w', text: v ? RLAB[v] : '' }), el('span', { class: 'n', text: v ? RSHORT[v] : '' })]);
          function apply() {
            if (retired) return;
            var cur = +gg[d].charAt(i) || 0; if (cur === brush) return;
            gg[d] = setChar(gg[d], i, String(brush));
            b.className = 'cell r' + brush; b.firstChild.textContent = brush ? RLAB[brush] : ''; b.lastChild.textContent = brush ? RSHORT[brush] : '';
            b.setAttribute('aria-label', OTL.DLONG[d] + ' ' + OTL.fmtTime(t - off) + ': ' + RLAB[brush]);
            changed();
          }
          b.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') { painting = true; apply(); e.preventDefault(); } });
          b.addEventListener('pointerenter', function () { if (painting) apply(); });
          b.addEventListener('click', apply);
          tr.appendChild(el('td', null, b));
        });
        body.appendChild(tr);
      });
      host.appendChild(el('table', { class: 'tgrid' }, [el('thead', null, head), body]));
    }
    function changed() { if (st.onChange) st.onChange(); }
    window.addEventListener('pointerup', function () { painting = false; });
    render();
    return { render: render };
  };

  /* Blackout date editor. state: {cfg, resp, onChange, id} */
  ui.blackouts = function (host, st) {
    var cfg = st.cfg, mode = 'full', from = 480, to = 720, rFrom = '', rTo = '';
    function r() { return st.resp; }
    function off() { return OTL.ZOFF[r().tz] || 0; }
    function find(iso) { var list = r().blackouts; for (var i = 0; i < list.length; i++) if (list[i].d === iso) return i; return -1; }
    function entry(iso) { return mode === 'full' ? { d: iso, from: null, to: null } : { d: iso, from: from + off(), to: to + off() }; }
    function label(b) { return b.from === null || b.from === undefined ? '' : ' ' + OTL.fmtRange(b.from - off(), b.to - b.from); }
    function changed() { r().blackouts.sort(function (a, b) { return a.d < b.d ? -1 : 1; }); if (st.onChange) st.onChange(); }
    function render() {
      ui.clear(host);
      var partRow = el('div', { class: 'row', hidden: mode !== 'part' }, [
        el('label', { class: 'field' }, ['From', el('input', { type: 'time', id: st.id + '-from', step: 900, value: OTL.timeInput(from), onchange: function (e) { var v = OTL.parseTimeInput(e.target.value); if (v !== null) from = v; } })]),
        el('label', { class: 'field' }, ['To', el('input', { type: 'time', id: st.id + '-to', step: 900, value: OTL.timeInput(to), onchange: function (e) { var v = OTL.parseTimeInput(e.target.value); if (v !== null) to = v; } })]),
        el('span', { class: 'small muted', text: (OTL.ZNAME[r().tz] || 'Eastern') + ' time' })
      ]);
      host.appendChild(el('div', { class: 'stack' }, [
        el('div', { class: 'row' }, [
          el('div', { class: 'stack', style: 'gap:4px' }, [el('span', { class: 'small muted', text: 'Mark dates as' }),
            ui.seg({ id: st.id + '-mode', label: 'Blackout type', get: function () { return mode; }, set: function (v) { mode = v; partRow.hidden = v !== 'part'; },
              options: [{ v: 'full', label: 'Out all day' }, { v: 'part', label: 'Out part of the day' }] })]),
        ]),
        partRow,
        el('div', { class: 'row' }, [
          el('label', { class: 'field' }, ['Away from', el('input', { type: 'date', id: st.id + '-rfrom', value: rFrom, min: '2027-01-01', max: '2027-12-31', onchange: function (e) { rFrom = e.target.value; } })]),
          el('label', { class: 'field' }, ['Through', el('input', { type: 'date', id: st.id + '-rto', value: rTo, min: '2027-01-01', max: '2027-12-31', onchange: function (e) { rTo = e.target.value; } })]),
          el('button', { type: 'button', class: 'btn ghost', id: st.id + '-radd', text: 'Mark every date in this range', onclick: function () {
            if (!rFrom) return; var end = rTo || rFrom; if (mode === 'part' && to <= from) return;
            OTL.allDates(cfg).forEach(function (d) {
              if (d.iso < rFrom || d.iso > end) return;
              var i = find(d.iso); if (i >= 0) r().blackouts.splice(i, 1);
              r().blackouts.push(entry(d.iso));
            });
            changed(); render();
          } })
        ]),
        el('p', { class: 'small muted', text: 'Or click single dates below. Click a marked date again to clear it.' })
      ]));
      var byBlock = {};
      OTL.allDates(cfg).forEach(function (d) { (byBlock[d.b] = byBlock[d.b] || []).push(d); });
      var list = el('div');
      cfg.blocks.forEach(function (b, bi) {
        var chips = el('div', { class: 'chips' });
        (byBlock[bi] || []).forEach(function (d) {
          var i = find(d.iso), cur = i >= 0 ? r().blackouts[i] : null;
          chips.appendChild(el('button', { type: 'button', id: st.id + '-d-' + d.iso,
            class: 'chip' + (cur ? (cur.from === null || cur.from === undefined ? ' full' : ' part') : ''),
            'aria-pressed': String(!!cur), text: OTL.fmtDate(d.iso) + (cur ? label(cur) : ''),
            onclick: function () {
              var j = find(d.iso);
              if (j >= 0) r().blackouts.splice(j, 1);
              else { if (mode === 'part' && to <= from) return; r().blackouts.push(entry(d.iso)); }
              changed(); render();
            } }));
        });
        list.appendChild(el('div', { class: 'blk' }, [el('b', { text: b.id }), chips]));
      });
      host.appendChild(list);
    }
    render();
    return { render: render };
  };

  ui.copy = function (text, btn, area) {
    function done(ok) { var t = btn.textContent; btn.textContent = ok ? 'Copied' : 'Select the text and copy it'; setTimeout(function () { btn.textContent = t; }, 2200); }
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { if (area) { area.focus(); area.select(); } done(false); });
    } catch (e) { if (area) { area.focus(); area.select(); } done(false); }
  };

  OTL.ui = ui;
})(typeof globalThis !== 'undefined' ? globalThis : this);
