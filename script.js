// Mafya Sığınak Radar v2.1 — konsol sürümü
// racon.city sayfasında F12 > Konsol'a yapıştırıp Enter'a bas.
// Ayarlar localStorage'da saklanır (anahtarlar "mmr_" ile başlar).
(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('mmr-host')) { console.log('[Radar] zaten çalışıyor'); return; }

  // ───────────── Userscript API'leri yerine tarayıcı karşılıkları ─────────────
  const memStore = {};
  function GM_getValue(k) {
    try { const v = localStorage.getItem('mmr_' + k); return v === null ? undefined : v; }
    catch (e) { return memStore[k]; }
  }
  function GM_setValue(k, v) {
    try { localStorage.setItem('mmr_' + k, v); } catch (e) { memStore[k] = v; }
  }
  function GM_notification(o) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        const n = new Notification(o.title, { body: o.text });
        setTimeout(() => { try { n.close(); } catch (e) {} }, o.timeout || 10000);
      } else if (Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
  }
  // bildirim iznini ilk tıklamada iste
  addEventListener('pointerdown', function askPerm() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
    removeEventListener('pointerdown', askPerm, true);
  }, true);

  // ───────────── Ayarlar ─────────────
  const DEF = {
    url: '/onlinesiginak.php', // Sığınak Takibi sayfasının adresi
    interval: 500,             // tarama aralığı (ms) — en düşük 100
    mute: false,
    speak: true,               // alarmda ismi sesli söyle
    soundAll: false,           // gizli olmayan HER çıkışta kısa bip
    repeat: true,              // alarm "Sustur"a basana kadar tekrar etsin
    notif: true,               // masaüstü bildirimi
    guard: true,               // KORUMA: ben dışardayken sığınaktan çıkan herkes için alarm
    guardLogin: false,         // koruma: online olanlar için de
    alarmLogin: true,          // hedef ismi online olunca da alarm
    showInside: true,
    compact: true,             // oyundaki gibi küçük, virgüllü isim listesi
    sort: 'new',               // 'new' = yeni çıkan üstte, 'level' = oyundaki sıra
    opacity: 1,
    me: '',                    // benim oyun adım
    paused: false,
    snoozeUntil: 0,
    rules: [],                 // [{name,color,hide,alarm}]
    pos: null,
    min: false,
    evOpen: true,
    inOpen: true,
  };
  const ME = Math.random().toString(36).slice(2);
  let rawState = '', rawCfg = '', rawAck = '';
  let cfg, state = null, ack = 0;

  function load(k, d) { try { const s = GM_getValue(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
  function saveKey(k, v) {
    const s = JSON.stringify(v);
    GM_setValue(k, s);
    if (k === 'state') rawState = s; else if (k === 'cfg') rawCfg = s; else if (k === 'ack') rawAck = s;
  }
  cfg = Object.assign({}, DEF, load('cfg', {}));
  if (cfg.interval < 50) cfg.interval = Math.round(cfg.interval * 1000);
  state = load('state', null);
  ack = load('ack', 0);
  rawState = GM_getValue('state') || ''; rawCfg = GM_getValue('cfg') || ''; rawAck = GM_getValue('ack') || '';

  const lower = (s) => String(s || '').toLocaleLowerCase('tr');
  const ruleOf = (name) => cfg.rules.find((r) => lower(r.name) === lower(name));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const hms = (sec) => pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
  const clock = (t) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  function dur(s) {
    s = Math.max(0, Math.floor(s));
    if (s < 60) return s + 'sn';
    if (s < 3600) return Math.floor(s / 60) + 'dk ' + pad(s % 60) + 'sn';
    return Math.floor(s / 3600) + 'sa ' + pad(Math.floor((s % 3600) / 60)) + 'dk';
  }
  function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function shortT(s) {
    if (!s) return '';
    if (parseInt(s, 10) >= 10000) return '—';
    const map = { Saat: 'sa', Dakika: 'dk', Saniye: 'sn' };
    return Array.from(s.matchAll(/(\d+)\s*(Saat|Dakika|Saniye)/g)).slice(0, 2).map((x) => x[1] + map[x[2]]).join(' ');
  }

  // <parse>
  function decode(buf, ct) {
    const cs = (/charset=([^;\s]+)/i.exec(ct || '') || [])[1];
    if (cs) { try { return new TextDecoder(cs).decode(buf); } catch (e) {} }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1254').decode(buf); }
  }
  function parseTakip(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = { active: false, found: false, endTs: 0, outside: [], inside: [] };
    const m = html.match(/bitisZamani\s*=\s*(\d+)/);
    if (m) out.endTs = +m[1];
    let st = 0;
    const seen = new Set();
    for (const n of doc.querySelectorAll('img, a[href*="viewuser="]')) {
      if (n.tagName === 'IMG') {
        const src = n.getAttribute('src') || '';
        if (/(^|\/)1\.png(\?|$)/.test(src)) {
          if (st === 0) {
            const s1 = n.nextSibling, s2 = s1 && s1.nextSibling;
            const t = ((s1 && s1.textContent) || '') + ((s2 && s2.textContent) || '');
            if (/D.{1,12}ndakiler/.test(t)) { st = 1; out.found = true; }
          } else break; // "Online Takibi" bölümü başladı
        } else if (/(^|\/)2\.png(\?|$)/.test(src) && st === 1) st = 2;
        continue;
      }
      if (st < 1 || st > 2) continue;
      const href = n.getAttribute('href') || '';
      const i = href.indexOf('viewuser=');
      if (i < 0) continue;
      let name;
      try { name = decodeURIComponent(href.slice(i + 9).split('&')[0]).trim(); } catch (e) { name = href.slice(i + 9).split('&')[0].trim(); }
      const sec = st === 1 ? 'outside' : 'inside';
      if (!name || seen.has(sec + name)) continue;
      seen.add(sec + name);
      const tip = n.getAttribute('onmouseover') || '';
      out[sec].push({
        name,
        on: (tip.match(/re:\\u003Cbr\\u003E\s*(.*?)\s*\\u003Cbr/) || [])[1] || '',
        fam: ((tip.match(/Aile:\s*(.*?)\\u003Cbr/) || [])[1] || '').trim(),
        fab: ((tip.match(/Fabrika:\s*([^"\\]*)/) || [])[1] || '').trim(),
      });
    }
    out.active = out.found;
    return out;
  }
  // </parse>

  // ───────────── Ses / Konuşma ─────────────
  let ac = null;
  function audio() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) { try { ac = new C(); } catch (e) {} } }
    return ac;
  }
  ['pointerdown', 'keydown'].forEach((ev) =>
    addEventListener(ev, () => { const a = audio(); if (a && a.state === 'suspended') a.resume(); }, true));
  const quiet = () => cfg.mute || Date.now() < (cfg.snoozeUntil || 0);
  function tone(freq, t0, d, vol, type) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + d + 0.03);
  }
  function siren() { // hedef alarmı
    const a = audio(); if (!a || quiet()) return;
    const t = a.currentTime + 0.02;
    for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 990, t + i * 0.28, 0.26, 0.28, 'square');
  }
  function guardSound() { // "arkanda biri çıktı" alarmı (hedef sirenden farklı)
    const a = audio(); if (!a || quiet()) return;
    const t = a.currentTime + 0.02;
    for (let i = 0; i < 3; i++) tone(1400, t + i * 0.15, 0.09, 0.28, 'square');
    tone(620, t + 0.5, 0.22, 0.28, 'sawtooth');
  }
  function beep() {
    const a = audio(); if (!a || quiet()) return;
    const t = a.currentTime + 0.02;
    tone(880, t, 0.14, 0.2, 'sine'); tone(1175, t + 0.16, 0.14, 0.2, 'sine');
  }
  function say(text) {
    if (!cfg.speak || quiet() || !text) return;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = 'tr-TR'; u.rate = 1.1; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
  }
  let alarmTimer = null;
  function stopAlarm() { clearTimeout(alarmTimer); alarmTimer = null; try { speechSynthesis.cancel(); } catch (e) {} }
  function startAlarm(id, kind, text) {
    stopAlarm();
    const t0 = Date.now();
    const step = () => {
      kind === 'guard' ? guardSound() : siren();
      say(text);
      if (!cfg.repeat) return;
      alarmTimer = setTimeout(() => { if (ack === id || Date.now() - t0 > 30000) return; step(); }, 2200);
    };
    step();
  }
  function notify(title, text) {
    if (!cfg.notif) return;
    try { GM_notification({ title, text, timeout: 10000, highlight: true }); } catch (e) {}
  }

  // ───────────── Tarama (sadece lider sekme) ─────────────
  let polling = false, lastPollStart = 0, leader = false, lastBeat = 0, lastLeaderChk = 0, lastSync = 0;
  let lastSig = '', lastSave = 0, errCount = 0, backoff = 0, pingEMA = 0;
  const pollTimes = [];

  const EMPTY = { ok: true, ts: 0, active: false, endTs: 0, outside: [], inside: [], events: [], alert: null, track: {}, since: {}, err: '' };

  function handleResult(r, now, ping) {
    const prev = state;
    const L = lower;
    const st = Object.assign({}, EMPTY, {
      ok: true, ts: now, active: r.active, endTs: r.endTs, outside: r.outside, inside: r.inside,
      events: (prev && prev.events) || [], alert: (prev && prev.alert) || null, ping, rate: pollTimes.length,
    });
    const cOut = new Map(r.outside.map((x) => [L(x.name), x]));
    const cIn = new Map(r.inside.map((x) => [L(x.name), x]));
    const meK = L(cfg.me);
    const items = [];
    let beepOnly = false, enteredTarget = false;

    const prevSince = (prev && prev.since) || {};
    st.since = {};
    for (const k of cOut.keys()) if (prevSince[k]) st.since[k] = prevSince[k];

    const canDiff = prev && prev.active && st.active && Array.isArray(prev.outside) && now - prev.ts < 20000;
    if (canDiff) {
      const pOut = new Map(prev.outside.map((x) => [L(x.name), x]));
      const pIn = new Map(prev.inside.map((x) => [L(x.name), x]));
      const newcomers = [];
      for (const [k, x] of cOut) if (!pOut.has(k)) newcomers.push({ name: x.name, type: pIn.has(k) ? 'out' : 'on' });
      const evs = [];
      newcomers.forEach((n) => { evs.push({ t: now, name: n.name, type: n.type }); st.since[L(n.name)] = now; });
      for (const [k, x] of pOut) if (!cOut.has(k)) evs.push({ t: now, name: x.name, type: cIn.has(k) ? 'in' : 'off' });
      for (const [k, x] of pIn) if (!cIn.has(k) && !cOut.has(k)) evs.push({ t: now, name: x.name, type: 'off' });
      st.events = st.events.concat(evs).slice(-60);

      for (const n of newcomers) {
        const k = L(n.name);
        if (k === meK) continue;
        const rule = ruleOf(n.name);
        if (rule && rule.hide) continue;
        if (rule && rule.alarm && (n.type === 'out' || cfg.alarmLogin)) items.push({ name: n.name, kind: 'target', type: n.type });
        else if (cfg.guard && meK && cOut.has(meK) && (n.type === 'out' || cfg.guardLogin)) items.push({ name: n.name, kind: 'guard', type: n.type });
        else if (cfg.soundAll) beepOnly = true;
      }
      evs.forEach((e) => { if (e.type === 'in') { const rule = ruleOf(e.name); if (rule && rule.alarm && !rule.hide) enteredTarget = true; } });
    }

    // hedefler + ben için durum takibi
    const watch = new Set(cfg.rules.filter((x) => x.alarm && !x.hide).map((x) => L(x.name)));
    if (meK) watch.add(meK);
    st.track = {};
    for (const k of watch) {
      const s = cOut.has(k) ? 'out' : cIn.has(k) ? 'in' : 'off';
      const old = prev && prev.track && prev.track[k];
      st.track[k] = old && old.st === s ? old : { st: s, t: old ? now : 0 };
    }

    if (items.length) st.alert = { id: now, items };

    const sig = [st.active, r.outside.map((x) => x.name).join(','), r.inside.map((x) => x.name).join(',')].join('|');
    const changed = sig !== lastSig || items.length > 0;
    lastSig = sig;
    state = st;
    if (changed || now - lastSave > 1000) { saveKey('state', st); lastSave = now; }
    if (changed) render();

    if (items.length) {
      const hasTarget = items.some((i) => i.kind === 'target');
      const label = (i) => (i.kind === 'guard' ? 'Arkanda ' + i.name + ' çıktı' : i.name + (i.type === 'on' ? ' online oldu' : ' sığınaktan çıktı'));
      const text = items.slice(0, 3).map(label).join('. ');
      startAlarm(st.alert.id, hasTarget ? 'target' : 'guard', text);
      notify(hasTarget ? '🚨 Hedef çıktı!' : '🛡 Arkanda biri çıktı!', items.map(label).join(' · '));
    } else if (beepOnly) beep();
    else if (enteredTarget) beep();

    // erişim bitmek üzere uyarısı (tek sefer)
    if (st.active && st.endTs) {
      const left = st.endTs - now / 1000;
      if (left < 300 && left > 0 && load('warnedEnd', 0) !== st.endTs) {
        GM_setValue('warnedEnd', JSON.stringify(st.endTs));
        beep();
        notify('⏳ Takip erişimi bitiyor', 'Kalan: ' + hms(Math.floor(left)));
      }
    }
  }

  async function poll() {
    if (polling) return;
    polling = true;
    const t0 = performance.now();
    const now = Date.now();
    try {
      const url = new URL(cfg.url, location.origin);
      url.searchParams.set('_t', String(now));
      const res = await fetch(url.href, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
      const html = decode(await res.arrayBuffer(), res.headers.get('content-type'));
      const r = parseTakip(html);
      const ms = performance.now() - t0;
      pingEMA = pingEMA ? pingEMA * 0.8 + ms * 0.2 : ms;
      pollTimes.push(now);
      while (pollTimes.length && pollTimes[0] < now - 1000) pollTimes.shift();
      errCount = 0; backoff = 0;
      handleResult(r, now, Math.round(pingEMA));
    } catch (e) {
      errCount++;
      const s = e && e.status;
      backoff = (s === 429 || s === 403 || s === 503 || s === 520 || s === 522)
        ? Math.min(30000, 2000 * Math.pow(2, Math.min(errCount, 4)))
        : Math.min(10000, 500 * Math.pow(2, Math.min(errCount, 5)));
      const msg = String((e && e.message) || e) + ' · ' + (backoff / 1000).toFixed(1) + ' sn beklenip yeniden denenecek';
      state = Object.assign({}, EMPTY, state || {}, { ok: false, err: msg });
      const n = Date.now();
      if (n - lastSave > 1000) { saveKey('state', state); lastSave = n; }
      render();
    } finally {
      polling = false;
    }
  }

  function electLeader(now) {
    const l = load('leader', null);
    const was = leader;
    if (!l || l.id === ME || now - l.ts > 5000) {
      if (!l || l.id !== ME || now - lastBeat > 1000) { GM_setValue('leader', JSON.stringify({ id: ME, ts: now })); lastBeat = now; }
      leader = true;
    } else leader = false;
    if (!was && leader) { const s = GM_getValue('state') || ''; rawState = s; try { state = s ? JSON.parse(s) : state; } catch (e) {} }
  }
  function syncFromStore() {
    if (!leader) {
      const s = GM_getValue('state') || '';
      if (s !== rawState) { rawState = s; try { state = s ? JSON.parse(s) : null; } catch (e) {} render(); }
    }
    const c = GM_getValue('cfg') || '';
    if (c !== rawCfg) { rawCfg = c; try { cfg = Object.assign({}, DEF, JSON.parse(c)); } catch (e) {} render(); renderRules(); syncSettings(); }
    const a = GM_getValue('ack') || '';
    if (a !== rawAck) { rawAck = a; try { ack = JSON.parse(a); } catch (e) {} if (state && state.alert && ack === state.alert.id) stopAlarm(); render(); }
  }
  function tick() {
    const now = Date.now();
    if (now - lastLeaderChk >= 500) { lastLeaderChk = now; electLeader(now); }
    if (now - lastSync >= (leader ? 500 : 250)) { lastSync = now; syncFromStore(); }
    if (leader && !polling && !cfg.paused) {
      const wait = Math.max(100, +cfg.interval || 500, backoff);
      if (now - lastPollStart >= wait) { lastPollStart = now; poll(); }
    }
  }
  function startTicker(fn, ms) {
    let fb = false;
    const useInterval = () => { if (!fb) { fb = true; setInterval(fn, ms); } };
    try {
      const blob = new Blob(['setInterval(function(){postMessage(0)},' + ms + ')'], { type: 'text/javascript' });
      const w = new Worker(URL.createObjectURL(blob));
      w.onmessage = fn;
      w.onerror = () => { try { w.terminate(); } catch (e) {} useInterval(); };
    } catch (e) { useInterval(); }
  }
  addEventListener('pagehide', () => { if (leader) GM_setValue('leader', JSON.stringify({ id: ME, ts: 0 })); });

  // ───────────── Arayüz ─────────────
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }

  // Oyunun kendi teması: lacivert zemin, mavi gradyanlı başlık çubukları,
  // serif küçük-büyük harf başlıklar, yeşil çerçeveli erişim kutusu.
  const css = `
:host{all:initial}
*{box-sizing:border-box;font-family:Lato,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.panel{position:fixed;width:330px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;
  background:#0c1830;
  color:#e6ebf6;border:1px solid #223559;border-radius:10px;
  box-shadow:0 14px 40px rgba(0,0,0,.6);
  font-size:13px;user-select:none;opacity:var(--op,1);transition:border-color .2s}
.panel.alert{border-color:#ff4d5e;animation:pulse .7s infinite alternate}
.panel.guardOn{border-color:#d8a23a}
@keyframes pulse{from{box-shadow:0 0 0 0 rgba(255,77,94,0),0 14px 40px rgba(0,0,0,.6)}to{box-shadow:0 0 26px 6px rgba(255,77,94,.75),0 14px 40px rgba(0,0,0,.6)}}

/* başlık çubuğu (oyundaki "SIĞINAK TAKİBİ" çubuğu gibi) */
.hd{display:flex;align-items:center;gap:7px;padding:9px 10px;cursor:grab;touch-action:none;
  background:linear-gradient(90deg,#0d1a33 0%,#1a3563 50%,#0d1a33 100%);
  border-bottom:1px solid #223559}
.hd:active{cursor:grabbing}
.dot{position:relative;width:10px;height:10px;border-radius:50%;background:#7b8196;flex:none}
.dot.ok{background:#3ddc84}.dot.stale{background:#ffb84d}.dot.bad{background:#ff4d5e}
.dot.ok::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid #3ddc84;opacity:0;animation:ring 1.6s infinite}
@keyframes ring{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.5);opacity:0}}
.ttl{font-family:Cinzel,Georgia,"Times New Roman",serif;font-weight:700;letter-spacing:1.2px;font-size:13px;text-transform:uppercase;color:#dfe7f7;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.chip{background:rgba(0,0,0,.35);border:1px solid #2a4170;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;color:#cbd6ee}
.sp{flex:1}
button{background:#17294d;color:#dbe4f6;border:1px solid #2c4377;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;transition:background .15s}
button:hover{background:#244274}
.hd button{padding:2px 7px}
.panel.min{width:auto;border-radius:999px;background:#0c1830}
.panel.min .hd{border-bottom:none;border-radius:999px;background:#0c1830;padding:7px 9px}
.panel.min .bd,.panel.min .ttl,.panel.min .hbtn{display:none}
.bd{padding:8px;overflow:auto;scrollbar-width:thin;scrollbar-color:#2a4170 transparent}

/* alarm bandı */
.ban{display:none;background:linear-gradient(135deg,#6b1220,#3b0b14);border:1px solid #ff4d5e;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-weight:700}
.ban.on{display:flex;align-items:center;gap:8px}
.ban span{flex:1;word-break:break-word}

/* ben kartı */
.me{display:flex;align-items:center;gap:6px;background:#0f1f3d;border:1px solid #1f3257;border-radius:8px;padding:6px 9px;margin-bottom:8px;font-size:12px}
.me.out{border-color:#b98a2f;background:rgba(216,162,58,.1)}
.me .st{font-weight:900}
.me .st.out{color:#ffb84d}.me .st.in{color:#3ddc84}.me .st.off{color:#8a91a8}

/* Takip Erişimi kutusu: oyundaki yeşil çerçeveli kutu */
.info{color:#9fb0cf;font-size:11.5px;margin-bottom:8px;line-height:1.45;text-align:center;
  background:#0f1f3d;border:1px solid #1f3257;border-radius:8px;padding:8px}
.info b{color:#e6ebf6}.info .warn{color:#ffb84d}.info .bad{color:#ff6b7b}
.info.okbox{background:linear-gradient(160deg,#10331f,#0a1f14);border:1px solid #3ddc84;border-radius:12px;
  box-shadow:0 0 14px rgba(61,220,132,.18)}
.info .acc{font-size:12.5px;color:#e6f7ec}
.info .clk{font-family:Lato,"Segoe UI",sans-serif;font-weight:900;font-size:26px;letter-spacing:1.5px;color:#3ddc84;line-height:1.25;text-shadow:0 0 10px rgba(61,220,132,.35)}
.info .clk.bad{color:#ff6b7b;text-shadow:none}
.info .sub{font-size:11px;color:#a8c5b3}

/* bölümler */
.sec{margin-top:8px;background:#0e1c38;border:1px solid #1d3055;border-radius:8px;overflow:hidden}
.sh{display:flex;align-items:center;gap:7px;padding:7px 10px;font-size:12.5px;font-weight:700;color:#e6ebf6;
  background:linear-gradient(90deg,#0d1a33,#16305c 50%,#0d1a33);border-bottom:1px solid #1d3055}
.sh.click{cursor:pointer}
.sh .ic{font-weight:900;font-size:14px;line-height:1}
.sh .ic.x{color:#ff3b3b}.sh .ic.v{color:#35c25a}.sh .ic.t{color:#ffcc00}.sh .ic.h{color:#7fb8ff}
.pill{background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:0 7px;font-size:11px}
.pill.red{background:#d63b4a}.pill.green{background:#1fae6b}
.list{display:flex;flex-direction:column;gap:1px;padding:4px}
.row{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:6px;transition:background .15s}
.row:hover{background:rgba(255,255,255,.07)}
.row.dim{opacity:.75}
.row.me{background:rgba(216,162,58,.12);border:none;margin:0;padding:4px 6px}
.row.new{animation:flash 1s 3}
@keyframes flash{0%,100%{background:rgba(255,77,94,.28)}50%{background:rgba(255,77,94,.6)}}
.av{width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none;font-weight:700;color:#f1f4fb;max-width:125px}
.nm:hover{text-decoration:underline}
.bdg{display:flex;gap:4px;align-items:center;flex:1;min-width:0}
.tag{font-size:10px;font-weight:900;padding:0 6px;border-radius:999px;background:#1d3055;color:#cdd8ee;white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis}
.tag.me{background:#ffb84d;color:#2a1c00}
.tm{color:#8c9bba;font-size:11px;white-space:nowrap}
.tm.hot{color:#ff8a97;font-weight:700}
.acts{display:none;gap:3px}
.row:hover .acts{display:flex}
.row:hover .tm{display:none}
.acts button{padding:0 5px;font-size:11px}
.empty{color:#6f7f9f;padding:6px 6px;font-size:12px}

/* küçük liste: oyundaki "isim , isim , isim" görünümü */
.names{padding:4px 6px 6px;line-height:1.75;font-size:12.5px;color:#cfd8ec;word-break:break-word}
.cn{color:#f1f4fb;text-decoration:none;font-weight:700;cursor:pointer;border-radius:4px;padding:0 1px}
.cn:hover{text-decoration:underline}
.cn.me{color:#ffb84d}
.cn.new{animation:flash 1s 3}
.names.dim .cn{font-weight:400;color:#bcc8e0}
.sep{color:#6f7f9f;margin:0 1px}

/* sağ tık menüsü */
.ctx{display:none;position:fixed;z-index:10;min-width:150px;background:#0c1830;border:1px solid #2c4377;border-radius:8px;
  box-shadow:0 10px 30px rgba(0,0,0,.6);padding:4px}
.ctx.on{display:block}
.ctx .ctxh{padding:4px 8px;font-family:Cinzel,Georgia,serif;font-size:12px;font-weight:700;color:#8fa2c8;border-bottom:1px solid #1d3055;margin-bottom:3px}
.ctx button{display:block;width:100%;text-align:left;border:none;background:none;padding:5px 8px;border-radius:5px}
.ctx button:hover{background:#244274}
.badge{font-size:10px;font-weight:900;padding:1px 7px;border-radius:999px;white-space:nowrap}
.badge.out{background:rgba(255,77,94,.2);color:#ff8a97}
.badge.in{background:rgba(61,220,132,.18);color:#5eeaa2}
.badge.off{background:rgba(255,255,255,.1);color:#9aa8c4}
.evt{font-size:11.5px;color:#a9b6d0;line-height:1.55;padding:6px 10px}
.evt .o{color:#ff8a97}.evt .i{color:#5eeaa2}.evt .f{color:#7f8da9}.evt .n{color:#7fb8ff}

/* ayarlar */
.set{display:none;margin-top:8px;background:#0e1c38;border:1px solid #1d3055;border-radius:8px;padding:8px 10px}
.set.on{display:block}
.set label{display:flex;align-items:center;gap:7px;margin:5px 0;color:#c9d3e8;font-size:12px}
.set input[type=text],.set input[type=number],.set select,.set textarea{background:#08122a;border:1px solid #2a4170;color:#e6ebf6;border-radius:6px;padding:3px 6px;font-size:12px;min-width:0}
.set input[type=color]{width:26px;height:22px;padding:0;border:none;background:none}
.set h4{margin:10px 0 3px;font-family:Cinzel,Georgia,serif;font-size:11px;color:#8fa2c8;letter-spacing:1px}
.speed{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
.speed button.on{background:#2f5fd0;border-color:#4a7bff;color:#fff}
.add{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:6px 0}
.add input[type=text]{flex:1;min-width:90px}
.rr{display:flex;align-items:center;gap:5px;margin:3px 0}
.rr .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.hint{color:#6f7f9f;font-size:11px;line-height:1.4}
.tools{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}
textarea{width:100%;height:54px;resize:vertical;user-select:text}
`;

  const host = el('div', { id: 'mmr-host', style: 'all:initial;position:fixed;top:0;left:0;z-index:2147483647' });
  const root = host.attachShadow({ mode: 'open' });
  // Stil: önce constructable stylesheet (sayfa CSP'sinden etkilenmez), olmazsa <style>
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch (e) {
    root.append(el('style', null, css));
  }
  // Oyun temasındaki yazı tipleri (engellenirse yedek yazı tipleri kullanılır)
  try {
    root.append(el('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Lato:wght@400;700;900&display=swap' }));
  } catch (e) {}

  const dot = el('span', { class: 'dot' });
  const speedChip = el('span', { class: 'chip', title: 'Saniyedeki tarama sayısı · ortalama yanıt süresi' }, '—');
  const btnPause = el('button', { class: 'hbtn', title: 'Taramayı duraklat/başlat', onclick: (e) => { e.stopPropagation(); cfg.paused = !cfg.paused; commitCfg(); } }, '⏸');
  const btnSet = el('button', { class: 'hbtn', title: 'Ayarlar', onclick: (e) => { e.stopPropagation(); setBox.classList.toggle('on'); if (setBox.classList.contains('on')) { renderRules(); syncSettings(); } } }, '⚙');
  const btnMin = el('button', { title: 'Küçült / Aç  (Alt+R)', onclick: (e) => { e.stopPropagation(); toggleMin(); } }, '–');
  const hd = el('div', { class: 'hd' }, dot, el('span', { class: 'ttl' }, 'Sığınak Radar'), speedChip, el('span', { class: 'sp' }), btnPause, btnSet, btnMin);

  const ban = el('div', { class: 'ban' });
  const meCard = el('div', { class: 'me' });
  const info = el('div', { class: 'info' });

  const tgPill = el('span', { class: 'pill' }, '0');
  const tgList = el('div', { class: 'list' });
  const tgSec = el('div', { class: 'sec' }, el('div', { class: 'sh' }, el('span', { class: 'ic t' }, '★'), 'Hedefler', tgPill), tgList);

  const outPill = el('span', { class: 'pill red' }, '0');
  const sortBtn = el('button', { style: 'margin-left:auto;padding:0 6px;font-size:10px', title: 'Sıralama', onclick: () => { cfg.sort = cfg.sort === 'new' ? 'level' : 'new'; commitCfg(); } });
  const outList = el('div', { class: 'list' });
  const outSec = el('div', { class: 'sec' }, el('div', { class: 'sh' }, el('span', { class: 'ic x' }, '✖'), 'Sığınak Dışındakiler', outPill, sortBtn), outList);

  const inPill = el('span', { class: 'pill green' }, '0');
  const inArrow = el('span', { style: 'font-size:10px;color:#8fa2c8' }, '▾');
  const inList = el('div', { class: 'list' });
  const inSec = el('div', { class: 'sec' }, el('div', { class: 'sh click', onclick: () => { cfg.inOpen = !cfg.inOpen; commitCfg(); } }, el('span', { class: 'ic v' }, '✔'), 'Sığınaktakiler', inPill, el('span', { class: 'sp' }), inArrow), inList);

  const evBody = el('div', { class: 'evt' });
  const evArrow = el('span', { style: 'font-size:10px;color:#8fa2c8' }, '▾');
  const evSec = el('div', { class: 'sec' }, el('div', { class: 'sh click', onclick: () => { cfg.evOpen = !cfg.evOpen; commitCfg(); } }, el('span', { class: 'ic h' }, '⏱'), 'Son Hareketler', el('span', { class: 'sp' }), evArrow), evBody);

  // Ayar paneli
  const fUrl = el('input', { type: 'text', style: 'flex:1', onchange: () => { cfg.url = fUrl.value.trim() || DEF.url; commitCfg(); } });
  const fInt = el('input', { type: 'number', min: 100, step: 50, style: 'width:70px', onchange: () => { cfg.interval = Math.max(100, +fInt.value || 500); commitCfg(); } });
  const fMe = el('input', { type: 'text', style: 'flex:1', placeholder: 'oyundaki adın', onchange: () => { cfg.me = fMe.value.trim(); commitCfg(); } });
  const fOp = el('input', { type: 'range', min: 0.4, max: 1, step: 0.05, style: 'flex:1', oninput: () => { cfg.opacity = +fOp.value; panel.style.setProperty('--op', cfg.opacity); }, onchange: () => commitCfg() });
  const speedBox = el('div', { class: 'speed' });
  const mkCb = (key, text) => { const c = el('input', { type: 'checkbox', onchange: () => { cfg[key] = c.checked; commitCfg(); } }); c._key = key; return [c, el('label', null, c, text)]; };
  const cbs = [
    mkCb('guard', '🛡 Koruma: ben dışardayken sığınaktan çıkan HERKES için alarm'),
    mkCb('guardLogin', '🛡 …online olanlar için de'),
    mkCb('alarmLogin', '🎯 Hedef online olunca da alarm'),
    mkCb('speak', '🗣 Alarmda ismi sesli söyle'),
    mkCb('repeat', '🔁 Alarm Sustur\'a basana kadar tekrar etsin'),
    mkCb('soundAll', '🔔 Her çıkışta kısa bip (gizli olmayanlar)'),
    mkCb('notif', '🖥 Masaüstü bildirimi'),
    mkCb('showInside', '🏠 Sığınaktakileri göster'),
    mkCb('compact', '▭ Küçük liste (oyundaki gibi virgüllü isimler)'),
    mkCb('mute', '🔇 Sesi kapat'),
  ];
  const nName = el('input', { type: 'text', placeholder: 'İsim (virgülle birden çok)' });
  const nColor = el('input', { type: 'color', value: '#ffcc00' });
  const nAlarm = el('input', { type: 'checkbox', checked: true });
  const nHide = el('input', { type: 'checkbox' });
  const rulesBox = el('div');
  const ioBox = el('textarea', { placeholder: 'Kuralları yedeklemek/aktarmak için' });
  const setBox = el('div', { class: 'set' },
    el('h4', null, 'TARAMA HIZI'),
    speedBox,
    el('label', null, 'Özel (ms):', fInt, el('span', { class: 'hint' }, 'en düşük 100')),
    el('div', { class: 'hint' }, 'Yanıt, aralıktan yavaşsa hız kendiliğinden düşer. Sunucu hata verirse otomatik beklenir.'),
    el('h4', null, 'BEN'),
    el('label', null, 'Adım:', fMe),
    el('div', { class: 'hint' }, 'Listede ismin üstüne gelip 👤\'e basarak da seçebilirsin.'),
    el('h4', null, 'UYARILAR'),
    cbs.map((x) => x[1]),
    el('div', { class: 'tools' },
      el('button', { onclick: () => { const a = audio(); if (a) a.resume(); siren(); say('Test. Amiral sığınaktan çıktı'); } }, '🔊 Hedef alarmı'),
      el('button', { onclick: () => { const a = audio(); if (a) a.resume(); guardSound(); say('Arkanda biri çıktı'); } }, '🛡 Koruma alarmı'),
      el('button', { onclick: () => { cfg.snoozeUntil = Date.now() + 5 * 60000; commitCfg(); } }, '😴 5 dk sessiz'),
      el('button', { onclick: () => { cfg.snoozeUntil = 0; commitCfg(); } }, 'Sessizi kaldır')),
    el('h4', null, 'GÖRÜNÜM'),
    el('label', null, 'Saydamlık:', fOp),
    el('label', null, 'Sayfa:', fUrl),
    el('h4', null, 'İSİM KURALLARI'),
    el('div', { class: 'add' }, nName, nColor,
      el('label', { style: 'margin:0' }, nAlarm, '🔔'), el('label', { style: 'margin:0' }, nHide, '🚫'),
      el('button', { onclick: addRule }, 'Ekle')),
    el('div', { class: 'hint' }, '🔔 = hedef (çıkınca alarm, panelde takip edilir) · 🚫 = listede gösterme · renk = ismin rengi'),
    rulesBox,
    el('h4', null, 'YEDEK'),
    ioBox,
    el('div', { class: 'tools' },
      el('button', { onclick: () => { ioBox.value = JSON.stringify({ rules: cfg.rules, me: cfg.me }); } }, 'Dışa aktar'),
      el('button', { onclick: () => { try { const o = JSON.parse(ioBox.value); if (Array.isArray(o.rules)) cfg.rules = o.rules; if (typeof o.me === 'string') cfg.me = o.me; commitCfg(); renderRules(); syncSettings(); } catch (e) { ioBox.value = 'Geçersiz veri'; } } }, 'İçe aktar')));

  const body = el('div', { class: 'bd' }, ban, meCard, info, tgSec, outSec, inSec, evSec, setBox);
  const panel = el('div', { class: 'panel', lang: 'tr' }, hd, body);
  root.append(panel);

  function commitCfg() { saveKey('cfg', cfg); render(); }
  function syncSettings() {
    fUrl.value = cfg.url; fInt.value = cfg.interval; fMe.value = cfg.me; fOp.value = cfg.opacity;
    cbs.forEach(([c]) => { c.checked = !!cfg[c._key]; });
    renderSpeed();
  }
  function renderSpeed() {
    speedBox.textContent = '';
    [[100, '⚡ 100ms'], [250, '250ms'], [500, '500ms'], [1000, '1sn'], [3000, '3sn']].forEach(([v, t]) =>
      speedBox.append(el('button', { class: cfg.interval === v ? 'on' : '', onclick: () => { cfg.interval = v; commitCfg(); syncSettings(); } }, t)));
  }
  function upsertRule(name, patch) {
    let r = ruleOf(name);
    if (!r) { r = { name, color: '#ffcc00', hide: false, alarm: false }; cfg.rules.push(r); }
    Object.assign(r, patch);
    commitCfg(); renderRules();
  }
  function addRule() {
    nName.value.split(',').map((s) => s.trim()).filter(Boolean)
      .forEach((n) => upsertRule(n, { color: nColor.value, alarm: nAlarm.checked, hide: nHide.checked }));
    nName.value = '';
  }
  function renderRules() {
    rulesBox.textContent = '';
    cfg.rules.forEach((r) => {
      rulesBox.append(el('div', { class: 'rr' },
        el('span', { class: 'n', style: 'color:' + r.color }, r.name),
        el('input', { type: 'color', value: r.color, onchange: (e) => { r.color = e.target.value; commitCfg(); } }),
        el('label', { style: 'margin:0', title: 'Hedef / alarm' }, el('input', { type: 'checkbox', checked: !!r.alarm, onchange: (e) => { r.alarm = e.target.checked; commitCfg(); } }), '🔔'),
        el('label', { style: 'margin:0', title: 'Gizle' }, el('input', { type: 'checkbox', checked: !!r.hide, onchange: (e) => { r.hide = e.target.checked; commitCfg(); } }), '🚫'),
        el('button', { title: 'Sil', onclick: () => { cfg.rules = cfg.rules.filter((x) => x !== r); commitCfg(); renderRules(); } }, '✕')));
    });
  }

  // konum / küçültme / sürükleme
  function place() {
    const w = panel.offsetWidth || 330;
    let p = cfg.pos || { x: Math.max(8, innerWidth - 346), y: 70 };
    p = { x: Math.min(Math.max(0, p.x), Math.max(0, innerWidth - w)), y: Math.min(Math.max(0, p.y), Math.max(0, innerHeight - 40)) };
    panel.style.left = p.x + 'px'; panel.style.top = p.y + 'px';
    return p;
  }
  function toggleMin() { cfg.min = !cfg.min; commitCfg(); place(); }
  (function drag() {
    let sx, sy, ox, oy, moved, down = false;
    hd.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      down = true; moved = false; sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      try { hd.setPointerCapture(e.pointerId); } catch (x) {}
    });
    hd.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) { cfg.pos = { x: ox + dx, y: oy + dy }; place(); }
    });
    hd.addEventListener('pointerup', () => {
      if (!down) return; down = false;
      if (moved) { cfg.pos = place(); saveKey('cfg', cfg); }
      else if (cfg.min) toggleMin();
    });
  })();
  addEventListener('resize', place);

  function ackNow() {
    if (state && state.alert) { ack = state.alert.id; saveKey('ack', ack); stopAlarm(); render(); }
  }
  addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); toggleMin(); }
    else if (k === 's') { e.preventDefault(); ackNow(); }
  }, true);

  // ── sağ tık menüsü (küçük liste için) ──
  const ctx = el('div', { class: 'ctx' });
  root.append(ctx);
  function closeCtx() { ctx.classList.remove('on'); }
  addEventListener('pointerdown', (e) => { if (!e.composedPath().includes(ctx)) closeCtx(); }, true);
  addEventListener('blur', closeCtx);
  function openCtx(e, x) {
    e.preventDefault();
    const r = ruleOf(x.name);
    ctx.textContent = '';
    ctx.append(
      el('div', { class: 'ctxh' }, x.name),
      el('button', { onclick: () => { cfg.me = x.name; commitCfg(); syncSettings(); closeCtx(); } }, '👤 Bu benim'),
      el('button', { onclick: () => { upsertRule(x.name, { alarm: !(r && r.alarm), color: (r && r.color) || '#ff5252' }); closeCtx(); } }, r && r.alarm ? '🔔 Hedeften çıkar' : '🔔 Hedef yap (alarm)'),
      el('button', { onclick: () => { upsertRule(x.name, { hide: true }); closeCtx(); } }, '🚫 Gizle'),
      el('button', { onclick: () => { window.open('/profile.php?viewuser=' + encodeURIComponent(x.name), '_blank'); closeCtx(); } }, '↗ Profili aç'));
    ctx.classList.add('on');
    const w = ctx.offsetWidth || 160, h = ctx.offsetHeight || 140;
    ctx.style.left = Math.max(4, Math.min(e.clientX, innerWidth - w - 4)) + 'px';
    ctx.style.top = Math.max(4, Math.min(e.clientY, innerHeight - h - 4)) + 'px';
  }

  // ── küçük liste: "isim , isim , isim" ──
  function mkNames(list, zone, st, recent) {
    const box = el('div', { class: 'names' + (zone === 'in' ? ' dim' : '') });
    list.forEach((x, i) => {
      const r = ruleOf(x.name), k = lower(x.name);
      const isMe = !!cfg.me && k === lower(cfg.me);
      const since = st.since && st.since[k];
      const tip = [x.name,
        since ? 'dışarıda: ' + dur((Date.now() - since) / 1000) : (x.on ? 'online: ' + shortT(x.on) : ''),
        x.fam && x.fam !== '0' ? 'aile: ' + x.fam : '',
        'sağ tık: menü'].filter(Boolean).join(' · ');
      box.append(
        el('a', {
          class: 'cn' + (isMe ? ' me' : '') + (recent.has(k) ? ' new' : ''),
          href: '/profile.php?viewuser=' + encodeURIComponent(x.name),
          target: '_blank', title: tip,
          style: r && r.color ? 'color:' + r.color : '',
          oncontextmenu: (e) => openCtx(e, x),
        }, (r && r.alarm ? '🔔' : '') + x.name + (x.fab && x.fab !== '0' ? '🏭' : '')),
        i < list.length - 1 ? el('span', { class: 'sep' }, ' , ') : null);
    });
    return box;
  }

  // ── satırlar ──
  function mkRow(x, zone, st, recent) {
    const r = ruleOf(x.name), k = lower(x.name);
    const isMe = !!cfg.me && k === lower(cfg.me);
    const col = r && r.color ? r.color : 'hsl(' + hue(x.name) + ' 55% 48%)';
    const since = st.since && st.since[k];
    const tm = since
      ? el('span', { class: 'tm hot dur', 'data-since': since }, dur((Date.now() - since) / 1000))
      : el('span', { class: 'tm', title: 'Oyundaki online süresi' }, shortT(x.on));
    return el('div', { class: 'row' + (zone === 'in' ? ' dim' : '') + (recent.has(k) ? ' new' : '') + (isMe ? ' me' : '') },
      el('span', { class: 'av', style: 'background:' + col }, (x.name[0] || '?').toUpperCase()),
      el('a', { class: 'nm', href: '/profile.php?viewuser=' + encodeURIComponent(x.name), target: '_blank', style: r && r.color ? 'color:' + r.color : '' }, x.name),
      el('span', { class: 'bdg' },
        isMe ? el('span', { class: 'tag me' }, 'SEN') : null,
        r && r.alarm ? '🔔' : null,
        x.fam && x.fam !== '0' ? el('span', { class: 'tag', title: 'Aile' }, x.fam) : null,
        x.fab && x.fab !== '0' ? el('span', { title: 'Mermi fabrikası: ' + x.fab }, '🏭') : null),
      tm,
      el('span', { class: 'acts' },
        el('button', { title: 'Bu benim', onclick: () => { cfg.me = x.name; commitCfg(); syncSettings(); } }, '👤'),
        el('button', { title: 'Hedef yap / çıkar (alarm)', onclick: () => upsertRule(x.name, { alarm: !(r && r.alarm), color: (r && r.color) || '#ff5252' }) }, '🔔'),
        el('button', { title: 'Bu ismi gizle', onclick: () => upsertRule(x.name, { hide: true }) }, '🚫')));
  }

  let lastAlertSeen = 0;
  function render() {
    const now = Date.now();
    const iv = Math.max(100, +cfg.interval || 500);
    const st = state || EMPTY;
    const hidden = (n) => { const r = ruleOf(n); return r && r.hide; };
    const meK = lower(cfg.me);
    const active = !!(state && st.active);

    panel.classList.toggle('min', !!cfg.min);
    panel.style.setProperty('--op', cfg.opacity);
    btnMin.textContent = cfg.min ? '▢' : '–';
    btnPause.textContent = cfg.paused ? '▶' : '⏸';
    sortBtn.textContent = cfg.sort === 'new' ? 'yeni üstte' : 'seviye sırası';

    const outs = active ? st.outside.filter((x) => !hidden(x.name) || lower(x.name) === meK) : [];
    const ins = active ? st.inside.filter((x) => !hidden(x.name) || lower(x.name) === meK) : [];

    // durum noktası
    let cls = 'dot';
    if (!state) cls += '';
    else if (!st.ok || !st.active) cls += ' bad';
    else cls += cfg.paused ? ' stale' : (now - st.ts < Math.max(3000, iv * 3 + 1500) ? ' ok' : ' stale');
    dot.className = cls;
    speedChip.textContent = !state ? '—' : cfg.paused ? 'duraklatıldı' : ('⚡ ' + (st.rate || 0) + '/sn · ' + (st.ping || 0) + 'ms');
    panel.classList.toggle('guardOn', !!(cfg.guard && meK && active && st.outside.some((x) => lower(x.name) === meK)));

    // alarm bandı
    const un = !!(st.alert && ack !== st.alert.id);
    panel.classList.toggle('alert', un);
    ban.className = 'ban' + (un ? ' on' : '');
    ban.textContent = '';
    if (un) {
      const items = st.alert.items || [];
      ban.append(el('span', null, items.map((i) => (i.kind === 'guard' ? '🛡 ARKANDA: ' : '🎯 ') + i.name + (i.type === 'on' ? ' online oldu' : ' çıktı')).join(' · ')),
        el('button', { onclick: ackNow, title: 'Alt+S' }, 'Sustur'));
      if (st.alert.id !== lastAlertSeen) { lastAlertSeen = st.alert.id; if (cfg.min) { panel.classList.remove('min'); place(); } }
    }

    // ben kartı
    meCard.textContent = '';
    if (!meK) {
      meCard.className = 'me';
      meCard.append('👤 Kendini seç: listede ismine gelip 👤 butonuna bas');
    } else {
      const tr = st.track && st.track[meK];
      const s = !active ? 'off' : (tr ? tr.st : (st.outside.some((x) => lower(x.name) === meK) ? 'out' : st.inside.some((x) => lower(x.name) === meK) ? 'in' : 'off'));
      meCard.className = 'me' + (s === 'out' ? ' out' : '');
      meCard.append('👤 ' + cfg.me, el('span', { class: 'st ' + s }, s === 'out' ? 'DIŞARIDA' : s === 'in' ? 'SIĞINAKTA' : 'LİSTEDE YOK'),
        tr && tr.t ? el('span', { class: 'tdur hint', 'data-t': tr.t }, dur((now - tr.t) / 1000)) : null,
        el('span', { class: 'sp', style: 'flex:1' }),
        s === 'out' && cfg.guard ? el('span', { class: 'tag me', title: 'Sığınaktan çıkan herkes için alarm' }, '🛡 KORUMA') : null);
    }

    renderInfo();

    // hedefler
    const targets = cfg.rules.filter((r) => r.alarm && !r.hide);
    tgSec.style.display = targets.length ? '' : 'none';
    tgPill.textContent = targets.length;
    tgList.textContent = '';
    targets.forEach((r) => {
      const k = lower(r.name);
      const tr = st.track && st.track[k];
      const s = !active ? 'off' : (st.outside.some((x) => lower(x.name) === k) ? 'out' : st.inside.some((x) => lower(x.name) === k) ? 'in' : 'off');
      tgList.append(el('div', { class: 'row' },
        el('span', { class: 'av', style: 'background:' + r.color }, (r.name[0] || '?').toUpperCase()),
        el('span', { class: 'nm', style: 'color:' + r.color }, r.name),
        el('span', { class: 'bdg' }, el('span', { class: 'badge ' + s }, s === 'out' ? 'DIŞARIDA' : s === 'in' ? 'SIĞINAKTA' : 'ÇEVRİMDIŞI')),
        tr && tr.t ? el('span', { class: 'tm tdur', 'data-t': tr.t }, dur((now - tr.t) / 1000)) : null));
    });

    // dışarıdakiler
    outPill.textContent = outs.length;
    outList.textContent = '';
    if (!state) outList.append(el('div', { class: 'empty' }, 'İlk tarama bekleniyor…'));
    else if (!st.active) outList.append(el('div', { class: 'empty' }, 'Takip erişimi yok.'));
    else if (!outs.length) outList.append(el('div', { class: 'empty' }, 'Şu an dışarıda (gösterilecek) kimse yok.'));
    const recent = new Set((st.events || []).filter((e) => (e.type === 'out' || e.type === 'on') && now - e.t < 60000).map((e) => lower(e.name)));
    let sorted = outs.slice();
    if (cfg.sort === 'new') {
      const sn = st.since || {};
      sorted = sorted.map((x, i) => ({ x, i })).sort((a, b) => ((sn[lower(b.x.name)] || 0) - (sn[lower(a.x.name)] || 0)) || (a.i - b.i)).map((o) => o.x);
    }
    if (cfg.compact) { if (sorted.length) outList.append(mkNames(sorted, 'out', st, recent)); }
    else sorted.forEach((x) => outList.append(mkRow(x, 'out', st, recent)));

    // sığınaktakiler
    inSec.style.display = cfg.showInside ? '' : 'none';
    inPill.textContent = ins.length;
    inArrow.textContent = cfg.inOpen ? '▾' : '▸';
    inList.style.display = cfg.inOpen ? '' : 'none';
    inList.textContent = '';
    if (active && !ins.length) inList.append(el('div', { class: 'empty' }, 'Sığınakta kimse yok.'));
    if (cfg.compact) { if (ins.length) inList.append(mkNames(ins, 'in', st, recent)); }
    else ins.forEach((x) => inList.append(mkRow(x, 'in', st, recent)));

    // hareketler
    evArrow.textContent = cfg.evOpen ? '▾' : '▸';
    evBody.style.display = cfg.evOpen ? '' : 'none';
    evBody.textContent = '';
    const evs = (st.events || []).filter((e) => !hidden(e.name)).slice(-8).reverse();
    if (!evs.length) evBody.append(el('div', { class: 'hint' }, 'Henüz hareket yok.'));
    const T = { out: ['o', '▲', 'sığınaktan çıktı'], on: ['n', '●', 'online oldu'], in: ['i', '▼', 'sığınağa girdi'], off: ['f', '○', 'çevrimdışı'] };
    evs.forEach((e) => { const t = T[e.type] || T.off; evBody.append(el('div', { class: t[0] }, clock(e.t) + ' ' + t[1] + ' ' + e.name + ' ' + t[2])); });
    place();
  }

  function renderInfo() {
    const st = state, now = Date.now();
    info.textContent = '';
    info.className = 'info';
    if (!st) { info.textContent = 'Taranıyor…'; return; }
    const parts = [];
    if (!st.ok) parts.push(el('div', { class: 'bad' }, '⚠ Bağlantı hatası: ' + st.err));
    if (!st.active) {
      parts.push(el('div', { class: 'warn' }, '⚠ Takip erişimi yok / süresi bitmiş (veya giriş yapılmamış). Sığınak Takibi sayfasından süre ekle.'));
    } else {
      const left = st.endTs ? Math.max(0, Math.floor(st.endTs - now / 1000)) : null;
      if (st.ok) info.className = 'info okbox';
      parts.push(el('div', null,
        el('div', { class: 'acc' }, '✔ Takip Erişimi Aktif'),
        left !== null ? el('div', { class: 'clk' + (left < 300 ? ' bad' : '') }, hms(left)) : null,
        el('div', { class: 'sub' }, 'Veri: ' + Math.max(0, ((now - st.ts) / 1000)).toFixed(1) + ' sn önce')));
    }
    if (cfg.paused) parts.push(el('div', { class: 'warn' }, '⏸ Tarama duraklatıldı'));
    if (now < (cfg.snoozeUntil || 0)) parts.push(el('div', { class: 'warn' }, '😴 Sessiz mod: ' + dur((cfg.snoozeUntil - now) / 1000)));
    if (!cfg.mute && (!ac || ac.state !== 'running')) parts.push(el('div', { class: 'warn' }, '🔇 Ses kilitli — sayfada bir yere tıklayınca açılır'));
    if (!leader) parts.push(el('div', { class: 'hint' }, 'Tarama başka sekmede yapılıyor'));
    info.append(...parts);
  }
  function tickTimes() {
    const now = Date.now();
    root.querySelectorAll('.dur').forEach((n) => { n.textContent = dur((now - +n.getAttribute('data-since')) / 1000); });
    root.querySelectorAll('.tdur').forEach((n) => { n.textContent = dur((now - +n.getAttribute('data-t')) / 1000); });
  }

  const origTitle = document.title; let flip = false;
  setInterval(() => {
    renderInfo(); tickTimes();
    if (state) {
      const iv = Math.max(100, +cfg.interval || 500);
      const age = Date.now() - state.ts;
      const want = !state.ok || !state.active ? 'bad' : (cfg.paused || age >= Math.max(3000, iv * 3 + 1500) ? 'stale' : 'ok');
      dot.className = 'dot ' + want;
      speedChip.textContent = cfg.paused ? 'duraklatıldı' : ('⚡ ' + (state.rate || 0) + '/sn · ' + (state.ping || 0) + 'ms');
    }
    const un = state && state.alert && ack !== state.alert.id;
    if (un) {
      flip = !flip;
      const nm = (state.alert.items || []).map((i) => i.name).join(', ');
      document.title = flip ? '🚨 ' + nm : origTitle;
    } else if (/^🚨/.test(document.title)) document.title = origTitle;
    if (!host.isConnected) document.documentElement.appendChild(host);
  }, 1000);

  document.documentElement.appendChild(host);
  syncSettings(); renderRules(); render(); place();
  tick();
  startTicker(tick, 25);
  console.log('[Radar] başlatıldı');
})();
