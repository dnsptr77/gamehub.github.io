/*!
 * app.js — UI Pengambil Akun VMess / VLESS / Trojan (khusus WS + TLS)
 * Bergantung pada parser.js (window.SubParser) & qrcode.min.js.
 */
(function () {
  'use strict';

  var DEFAULT_SUB_URL = 'https://www.v2nodes.com/subscriptions/country/sg/?key=ABD45A65D74F1DC';
  var AUTO_INTERVAL_MS = 5 * 60 * 1000;

  /* ---------- elemen ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    subUrl: $('subUrl'), fetchBtn: $('fetchBtn'),
    togglePaste: $('togglePaste'), pasteWrap: $('pasteWrap'),
    pasteArea: $('pasteArea'), pasteBtn: $('pasteBtn'),
    status: $('status'), results: $('results'), stats: $('stats'),
    search: $('search'), protoChips: $('protoChips'),
    refreshBtn: $('refreshBtn'), copyAllBtn: $('copyAllBtn'),
    dlTxtBtn: $('dlTxtBtn'), dlB64Btn: $('dlB64Btn'), autoChk: $('autoChk'),
    cards: $('cards'), emptyMsg: $('emptyMsg'),
    excludedWrap: $('excludedWrap'), excluded: $('excluded'), excCount: $('excCount'),
    qrModal: $('qrModal'), qrClose: $('qrClose'), qrName: $('qrName'),
    qrBox: $('qrBox'), qrCopy: $('qrCopy'), toast: $('toast')
  };

  var state = {
    result: null,       // hasil parser terakhir
    via: '',            // metode fetch yang berhasil
    protos: { vmess: true, vless: true, trojan: true },
    autoTimer: null,
    qrCurrent: null
  };

  /* ---------- util ---------- */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, type) {
    el.toast.textContent = msg;
    el.toast.className = 'toast ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.add('hidden'); }, 2600);
  }

  function copyText(text, okMsg) {
    var done = function (ok) {
      toast(ok ? (okMsg || '✅ Tersalin ke clipboard') : '❌ Gagal menyalin', ok ? 'ok' : 'err');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
        done(legacyCopy(text));
      });
    } else {
      done(legacyCopy(text));
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function b64encodeUtf8(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function setStatus(kind, html) {
    el.status.className = 'status ' + kind;
    el.status.innerHTML = html;
  }

  /* ---------- fetch subscription (beberapa metode berurutan) ---------- */

  var FETCHERS = [
    { label: 'langsung', url: function (u) { return u; } },
    { label: 'proxy lokal', url: function (u) { return '/api/sub?url=' + encodeURIComponent(u); } },
    { label: 'allorigins', url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
    { label: 'corsproxy.io', url: function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } },
    { label: 'codetabs', url: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } },
    { label: 'cors.lol', url: function (u) { return 'https://api.cors.lol/?url=' + encodeURIComponent(u); } }
  ];

  function looksValid(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    if (/^\s*<(!doctype|html)/i.test(t)) return false;         // halaman HTML
    if (/(vmess|vless|trojan|ss|ssr):\/\//i.test(t)) return true; // daftar URI
    return /^[A-Za-z0-9+/=\s_-]+$/.test(t) && t.length > 40;    // kemungkinan base64
  }

  function fetchSubscription(url) {
    var errors = [];
    var i = 0;
    function tryNext() {
      if (i >= FETCHERS.length) {
        return Promise.reject(new Error('SEMUA_GAGAL:' + errors.join(' · ')));
      }
      var f = FETCHERS[i++];
      var opts = { cache: 'no-store', redirect: 'follow' };
      return fetch(f.url(url), opts).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function (text) {
        if (!looksValid(text)) throw new Error('respons bukan subscription');
        return { text: text, via: f.label };
      }).catch(function (e) {
        errors.push(f.label + ' (' + (e && e.message ? e.message : 'gagal') + ')');
        return tryNext();
      });
    }
    return tryNext();
  }

  /* ---------- render ---------- */

  function protoBadge(p) {
    return '<span class="badge ' + p + '">' + p.toUpperCase() + '</span>';
  }

  function renderStats(res) {
    var count = function (proto) {
      return res.matched.filter(function (c) { return c.protocol === proto; }).length;
    };
    var chips = [
      { num: res.total, lbl: 'Total', cls: '' },
      { num: res.matched.length, lbl: 'WS + TLS', cls: 'hl' },
      { num: count('vmess'), lbl: 'VMess', cls: '' },
      { num: count('vless'), lbl: 'VLESS', cls: '' },
      { num: count('trojan'), lbl: 'Trojan', cls: '' },
      { num: res.excluded.length, lbl: 'Dilewati', cls: '' }
    ];
    el.stats.innerHTML = chips.map(function (c) {
      return '<div class="stat ' + c.cls + '"><div class="num">' + c.num + '</div><div class="lbl">' + c.lbl + '</div></div>';
    }).join('');
  }

  function field(dt, dd, dim) {
    if (dd === '' || dd == null) return '';
    return '<dt>' + dt + '</dt><dd' + (dim ? ' class="dim"' : '') + '>' + escapeHtml(dd) + '</dd>';
  }

  function cardHtml(c, idx) {
    var creds = c.protocol === 'trojan' ? 'Password' : 'UUID';
    var fields = [
      field('Host', c.address),
      field('Port', c.port),
      field(creds, c.uuid),
      field('Network', c.network),
      field('Security', c.security),
      field('SNI', c.sni || c.host),
      field('WS Host', c.host),
      field('Path', c.path, !c.path),
      field('Fingerprint', c.fp, !c.fp),
      c.protocol === 'vmess' ? field('AlterID', c.aid) : '',
      c.protocol === 'vless' ? field('Flow', c.flow, !c.flow) : ''
    ].join('');

    return (
      '<div class="card" data-idx="' + idx + '">' +
        '<div class="card-top">' +
          protoBadge(c.protocol) +
          '<div class="card-name" title="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</div>' +
          '<span class="wstls">WS + TLS ✓</span>' +
        '</div>' +
        '<dl class="card-fields">' + fields + '</dl>' +
        '<div class="card-actions">' +
          '<button class="btn small" data-act="copy" data-idx="' + idx + '">📋 Salin Link</button>' +
          '<button class="btn small" data-act="qr" data-idx="' + idx + '">📱 QR</button>' +
          '<button class="btn small" data-act="json" data-idx="' + idx + '">🧩 Salin JSON</button>' +
        '</div>' +
        '<details class="uri"><summary>URI lengkap</summary><pre>' + escapeHtml(c.rawUri) + '</pre></details>' +
      '</div>'
    );
  }

  function visibleMatched() {
    var res = state.result;
    if (!res) return [];
    var q = el.search.value.trim().toLowerCase();
    return res.matched.filter(function (c) {
      if (!state.protos[c.protocol]) return false;
      if (!q) return true;
      return (c.name + ' ' + c.address + ' ' + c.host + ' ' + c.sni + ' ' + c.port).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderCards() {
    var list = visibleMatched();
    el.cards.innerHTML = list.map(function (c) {
      return cardHtml(c, state.result.matched.indexOf(c));
    }).join('');

    var noneVisible = list.length === 0;
    var anyProto = state.protos.vmess || state.protos.vless || state.protos.trojan;
    if (noneVisible) {
      var msg;
      if (state.result.matched.length === 0) {
        msg = '😔 <b>Tidak ada akun WS+TLS</b> yang ditemukan pada subscription ini saat ini.<br>' +
              'Coba lagi nanti (server berganti), ganti negara, atau lihat daftar yang dilewati di bawah.';
      } else if (!anyProto) {
        msg = '🤷 Semua filter protokol dimatikan. Aktifkan minimal satu chip protokol di atas.';
      } else {
        msg = '🔍 Tidak ada hasil untuk pencarian <b>' + escapeHtml(el.search.value) + '</b>.';
      }
      el.emptyMsg.innerHTML = msg;
      el.emptyMsg.classList.remove('hidden');
    } else {
      el.emptyMsg.classList.add('hidden');
    }
  }

  function renderExcluded() {
    var res = state.result;
    if (!res || res.excluded.length === 0) {
      el.excludedWrap.classList.add('hidden');
      return;
    }
    el.excCount.textContent = res.excluded.length;
    el.excluded.innerHTML = res.excluded.map(function (c) {
      var shortName = c.name.length > 60 ? c.name.slice(0, 60) + '…' : c.name;
      return (
        '<div class="exc-row">' +
          protoBadge(c.protocol) +
          '<span class="exc-name" title="' + escapeHtml(c.name) + '">' + escapeHtml(shortName) + '</span>' +
          '<span class="exc-reason">' + escapeHtml(c.reason) + '</span>' +
        '</div>'
      );
    }).join('');
    el.excludedWrap.classList.remove('hidden');
  }

  function renderChips() {
    el.protoChips.innerHTML = ['vmess', 'vless', 'trojan'].map(function (p) {
      return '<button type="button" class="chip' + (state.protos[p] ? ' on' : '') + '" data-proto="' + p + '">' + p.toUpperCase() + '</button>';
    }).join('');
  }

  function applyResult(res, via) {
    state.result = res;
    state.via = via || '';
    el.results.classList.remove('hidden');
    renderStats(res);
    renderChips();
    renderCards();
    renderExcluded();
  }

  /* ---------- QR ---------- */

  // Teks QR harus ASCII-murni agar kompatibel: fragment di-encode percent.
  function qrSafeUri(uri) {
    var hashIdx = uri.indexOf('#');
    if (hashIdx === -1) return uri;
    var base = uri.slice(0, hashIdx);
    var frag = uri.slice(hashIdx + 1);
    try { frag = decodeURIComponent(frag); } catch (e) { /* biarkan */ }
    return base + '#' + encodeURIComponent(frag);
  }

  function openQr(cfg) {
    state.qrCurrent = cfg;
    el.qrName.textContent = cfg.name;
    el.qrBox.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(el.qrBox, {
          text: qrSafeUri(cfg.rawUri),
          width: 232, height: 232,
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        el.qrBox.innerHTML = '<p style="color:#333;font-size:12px;padding:20px">QR gagal dibuat</p>';
      }
    } else {
      el.qrBox.innerHTML = '<p style="color:#333;font-size:12px;padding:20px">Library QR tidak termuat</p>';
    }
    el.qrModal.classList.remove('hidden');
    el.qrModal.setAttribute('aria-hidden', 'false');
  }

  function closeQr() {
    el.qrModal.classList.add('hidden');
    el.qrModal.setAttribute('aria-hidden', 'true');
    state.qrCurrent = null;
  }

  /* ---------- aksi utama ---------- */

  function load() {
    var url = el.subUrl.value.trim();
    if (!url) { setStatus('err', '❌ Masukkan link subscription terlebih dahulu.'); return; }
    try { new URL(url); } catch (e) { setStatus('err', '❌ Link tidak valid — harus diawali http:// atau https://'); return; }

    localStorage.setItem('wstls_suburl', url);
    el.fetchBtn.disabled = true;
    setStatus('info', '<span class="spin"></span>Mengambil subscription…');

    fetchSubscription(url).then(function (r) {
      var res = SubParser.parseSubscription(r.text);
      if (res.total === 0) {
        setStatus('err', '❌ Subscription terambil, tetapi tidak ada akun yang bisa dibaca. ' +
                         'Coba metode manual (Tempel isi subscription).');
      } else {
        setStatus('ok', '✅ Berhasil diambil via <b>' + escapeHtml(r.via) + '</b> — ' +
          res.total + ' akun ditemukan, <b>' + res.matched.length + '</b> di antaranya WS+TLS.');
      }
      applyResult(res, r.via);
    }).catch(function (e) {
      var msg = String(e && e.message || e);
      if (msg.indexOf('SEMUA_GAGAL:') === 0) {
        setStatus('err',
          '❌ Semua metode pengambilan gagal (CORS/jaringan).<br>' +
          '💡 Gunakan <b>Tempel isi subscription manual</b> — buka link subscription di tab browser, salin isinya, lalu tempel di sini.' +
          '<pre>' + escapeHtml(msg.slice(11)) + '</pre>');
      } else {
        setStatus('err', '❌ ' + escapeHtml(msg));
      }
    }).finally(function () {
      el.fetchBtn.disabled = false;
    });
  }

  function processPaste() {
    var text = el.pasteArea.value;
    if (!text.trim()) { toast('Tempel isi subscription dulu', 'err'); return; }
    var res = SubParser.parseSubscription(text);
    if (res.total === 0) {
      setStatus('err', '❌ Teks tidak dikenali sebagai subscription (harus base64 atau daftar link vmess/vless/trojan).');
      return;
    }
    setStatus('ok', '✅ Diproses dari teks manual — ' + res.total + ' akun, <b>' + res.matched.length + '</b> WS+TLS.');
    applyResult(res, 'tempel manual');
  }

  /* ---------- event ---------- */

  function bindEvents() {
    el.fetchBtn.addEventListener('click', load);
    el.subUrl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') load();
    });

    el.togglePaste.addEventListener('click', function () {
      var open = el.pasteWrap.classList.toggle('hidden');
      if (!open) el.pasteArea.focus();
    });
    el.pasteBtn.addEventListener('click', processPaste);

    el.refreshBtn.addEventListener('click', load);

    el.search.addEventListener('input', renderCards);

    el.protoChips.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var p = btn.dataset.proto;
      state.protos[p] = !state.protos[p];
      btn.classList.toggle('on', state.protos[p]);
      renderCards();
    });

    el.cards.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var idx = parseInt(btn.dataset.idx, 10);
      var cfg = state.result && state.result.matched[idx];
      if (!cfg) return;
      var act = btn.dataset.act;
      if (act === 'copy') {
        copyText(cfg.rawUri, '✅ Link ' + cfg.protocol.toUpperCase() + ' tersalin');
      } else if (act === 'qr') {
        openQr(cfg);
      } else if (act === 'json') {
        copyText(SubParser.toV2rayOutbound(cfg), '✅ Config JSON V2Ray/Xray tersalin');
      }
    });

    el.copyAllBtn.addEventListener('click', function () {
      var list = visibleMatched();
      if (!list.length) { toast('Tidak ada akun untuk disalin', 'err'); return; }
      copyText(list.map(function (c) { return c.rawUri; }).join('\n'),
               '✅ ' + list.length + ' link WS+TLS tersalin');
    });

    el.dlTxtBtn.addEventListener('click', function () {
      var list = visibleMatched();
      if (!list.length) { toast('Tidak ada akun untuk diunduh', 'err'); return; }
      download('akun-ws-tls.txt', list.map(function (c) { return c.rawUri; }).join('\n'));
      toast('💾 akun-ws-tls.txt diunduh (' + list.length + ' akun)', 'ok');
    });

    el.dlB64Btn.addEventListener('click', function () {
      var list = visibleMatched();
      if (!list.length) { toast('Tidak ada akun untuk diunduh', 'err'); return; }
      var txt = list.map(function (c) { return c.rawUri; }).join('\n');
      download('sub-ws-tls.txt', b64encodeUtf8(txt));
      toast('📦 sub-ws-tls.txt diunduh — siap diimpor sebagai subscription file', 'ok');
    });

    el.autoChk.addEventListener('change', function () {
      if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
      if (el.autoChk.checked) {
        state.autoTimer = setInterval(function () {
          if (el.subUrl.value.trim()) load();
        }, AUTO_INTERVAL_MS);
        toast('🔄 Auto-refresh aktif tiap 5 menit', 'ok');
      } else {
        toast('Auto-refresh dimatikan');
      }
    });

    el.qrClose.addEventListener('click', closeQr);
    el.qrCopy.addEventListener('click', function () {
      if (state.qrCurrent) copyText(state.qrCurrent.rawUri, '✅ Link tersalin');
    });
    el.qrModal.addEventListener('click', function (e) {
      if (e.target === el.qrModal) closeQr();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeQr();
    });
  }

  /* ---------- init ---------- */

  function init() {
    var saved = localStorage.getItem('wstls_suburl');
    var qs = new URLSearchParams(location.search).get('url');
    el.subUrl.value = qs || saved || DEFAULT_SUB_URL;
    if (qs) localStorage.setItem('wstls_suburl', qs);
    bindEvents();
    // Ambil otomatis saat pertama kali dibuka
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
