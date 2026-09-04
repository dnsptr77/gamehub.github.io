/*!
 * parser.js — Parser & filter subscription V2Ray (VMess / VLESS / Trojan)
 * Fokus: hanya akun dengan network = WS dan security = TLS.
 * Kompatibel browser & Node.js (untuk pengujian).
 */
(function (global) {
  'use strict';

  var SUPPORTED = ['vmess', 'vless', 'trojan'];

  /* ---------- helpers ---------- */

  function b64decode(input) {
    var s = String(input || '').replace(/\s+/g, '');
    if (!s) return '';
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    var bin;
    if (typeof atob === 'function') {
      bin = atob(s);
    } else if (typeof Buffer !== 'undefined') {
      bin = Buffer.from(s, 'base64').toString('binary');
    } else {
      throw new Error('Tidak ada decoder base64');
    }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  function decodeSafe(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function baseCfg(protocol, rawUri) {
    return {
      protocol: protocol,
      rawUri: rawUri,
      name: '',
      address: '',
      port: '',
      uuid: '',          // uuid (vmess/vless) atau password (trojan)
      network: 'tcp',
      security: 'none',
      sni: '',
      host: '',
      path: '',
      fp: '',
      alpn: '',
      flow: '',
      aid: '',
      scy: '',
      pbk: '',
      sid: '',
      encryption: '',
      headerType: '',
      skipCertVerify: false,
      parseError: null,
      matched: false,
      reason: null
    };
  }

  /* ---------- parser per protokol ---------- */

  function parseVmess(raw) {
    var cfg = baseCfg('vmess', raw);
    try {
      var json = JSON.parse(b64decode(raw.replace(/^vmess:\/\//i, '')));
      cfg.name = json.ps != null ? String(json.ps) : '';
      cfg.address = json.add != null ? String(json.add) : '';
      cfg.port = json.port != null ? String(json.port) : '';
      cfg.uuid = json.id != null ? String(json.id) : '';
      cfg.aid = json.aid != null ? String(json.aid) : '0';
      cfg.scy = json.scy || 'auto';
      cfg.network = String(json.net || 'tcp').toLowerCase();
      cfg.headerType = json.type || 'none';
      cfg.host = json.host || '';
      cfg.path = json.path || '';
      cfg.sni = json.sni || '';
      cfg.fp = json.fp || '';
      cfg.alpn = json.alpn || '';

      var tls = json.tls;
      if (tls === 'tls' || tls === true || tls === 'true' || tls === 1 || tls === '1') {
        cfg.security = 'tls';
      } else if (tls && String(tls).toLowerCase() !== 'none' && String(tls) !== '') {
        cfg.security = String(tls).toLowerCase();
      } else {
        cfg.security = 'none';
      }
      cfg.skipCertVerify = !!json['skip-cert-verify'];
    } catch (e) {
      cfg.parseError = 'JSON vmess tidak valid';
    }
    return cfg;
  }

  function parseShareUri(raw, protocol) {
    var cfg = baseCfg(protocol, raw);
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      cfg.parseError = 'Format URI tidak valid';
      return cfg;
    }
    cfg.uuid = decodeSafe(u.username || '');
    if (protocol === 'trojan' && u.password) {
      cfg.uuid = decodeSafe(u.password);
      if (u.username) cfg.uuid = decodeSafe(u.username) + ':' + cfg.uuid;
    }
    cfg.address = (u.hostname || '').replace(/^\[|\]$/g, '');
    cfg.port = u.port || '';

    var q = u.searchParams;
    cfg.network = String(q.get('type') || 'tcp').toLowerCase();
    var sec = String(q.get('security') || '').toLowerCase();
    cfg.security = sec || 'none';
    cfg.sni = q.get('sni') || '';
    cfg.host = q.get('host') || '';
    cfg.path = decodeSafe(q.get('path') || '');
    cfg.fp = q.get('fp') || '';
    cfg.alpn = q.get('alpn') || '';
    cfg.flow = q.get('flow') || '';
    cfg.pbk = q.get('pbk') || '';
    cfg.sid = q.get('sid') || '';
    cfg.encryption = q.get('encryption') || '';
    cfg.headerType = q.get('headerType') || 'none';
    var ins = q.get('insecure') || q.get('allowInsecure') || '';
    cfg.skipCertVerify = ins === '1' || ins === 'true';
    cfg.name = u.hash ? decodeSafe(u.hash.slice(1)) : '';
    return cfg;
  }

  function parseUri(rawLine) {
    // Satu baris = satu URI (spasi di dalam fragment nama tetap dipertahankan;
    // URL() otomatis meng-encode-nya saat parsing).
    var uri = String(rawLine || '').trim();
    var m = uri.match(/^(vmess|vless|trojan|ss|ssr|tuic|hysteria2?|socks):\/\//i);
    if (!m) return null;
    var proto = m[1].toLowerCase();
    var cfg;
    if (proto === 'vmess') {
      cfg = parseVmess(uri);
    } else if (proto === 'vless' || proto === 'trojan') {
      cfg = parseShareUri(uri, proto);
    } else {
      // protokol lain (ss/ssr/dll) — tidak didukung, tapi tetap dihitung
      cfg = baseCfg(proto, uri);
      var hashIdx = uri.indexOf('#');
      cfg.name = hashIdx >= 0 ? decodeSafe(uri.slice(hashIdx + 1)) : '';
      var atIdx = uri.indexOf('@');
      if (atIdx > 0) cfg.address = uri.slice(atIdx + 1).split(/[:\/?#]/)[0];
    }
    if (cfg && !cfg.parseError) {
      if (!cfg.name) cfg.name = cfg.protocol.toUpperCase() + '-' + (cfg.address || 'tanpa-nama');
    }
    return cfg;
  }

  /* ---------- filter WS + TLS ---------- */

  function evaluate(cfg) {
    if (SUPPORTED.indexOf(cfg.protocol) === -1) {
      cfg.reason = 'protokol ' + cfg.protocol.toUpperCase();
      return cfg;
    }
    var netOk = cfg.network === 'ws' || cfg.network === 'websocket';
    var tlsOk = cfg.security === 'tls';
    if (netOk && tlsOk) {
      cfg.matched = true;
      cfg.reason = null;
    } else if (!netOk && !tlsOk) {
      cfg.reason = 'network: ' + cfg.network + ' · tanpa TLS';
    } else if (!netOk) {
      cfg.reason = 'network: ' + cfg.network;
    } else {
      cfg.reason = 'security: ' + cfg.security;
    }
    return cfg;
  }

  /* ---------- normalisasi isi subscription ---------- */

  function parseSubscription(text) {
    var t = String(text || '').replace(/\r/g, '').trim();
    if (!t) return { configs: [], matched: [], excluded: [], errors: [], total: 0 };

    // Jika teks belum berupa daftar URI, coba decode base64
    if (!/(vmess|vless|trojan|ss|ssr):\/\//i.test(t)) {
      try {
        var decoded = b64decode(t);
        if (/(vmess|vless|trojan|ss|ssr):\/\//i.test(decoded)) t = decoded;
      } catch (e) { /* abaikan */ }
    }

    var seen = {};
    var configs = [], errors = [];
    var lines = t.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('://') === -1) continue;
      var uri = line;
      if (seen[uri]) continue;
      seen[uri] = true;
      var cfg = parseUri(uri);
      if (!cfg) continue;
      if (cfg.parseError) { errors.push(cfg); continue; }
      configs.push(evaluate(cfg));
    }

    var matched = configs.filter(function (c) { return c.matched; });
    var excluded = configs.filter(function (c) { return !c.matched; });

    return {
      configs: configs,
      matched: matched,
      excluded: excluded,
      errors: errors,
      total: configs.length
    };
  }

  /* ---------- generator config V2Ray/Xray (bonus) ---------- */

  function toV2rayOutbound(cfg) {
    var stream = {
      network: 'ws',
      security: 'tls',
      wsSettings: { path: cfg.path || '/' }
    };
    if (cfg.host) stream.wsSettings.headers = { Host: cfg.host };
    if (cfg.sni || cfg.fp || cfg.alpn) {
      stream.tlsSettings = {};
      if (cfg.sni) stream.tlsSettings.serverName = cfg.sni;
      if (cfg.fp) stream.tlsSettings.fingerprint = cfg.fp;
      if (cfg.alpn) stream.tlsSettings.alpn = cfg.alpn.split(',');
      if (cfg.skipCertVerify) stream.tlsSettings.allowInsecure = true;
    }
    var out = {
      tag: 'proxy-' + cfg.protocol,
      protocol: cfg.protocol,
      streamSettings: stream,
      mux: { enabled: false, concurrency: -1 }
    };
    if (cfg.protocol === 'vmess') {
      out.settings = {
        vnext: [{
          address: cfg.address,
          port: parseInt(cfg.port, 10) || 443,
          users: [{
            id: cfg.uuid,
            alterId: parseInt(cfg.aid, 10) || 0,
            security: cfg.scy || 'auto'
          }]
        }]
      };
    } else if (cfg.protocol === 'vless') {
      var user = { id: cfg.uuid, encryption: cfg.encryption || 'none' };
      if (cfg.flow) user.flow = cfg.flow;
      out.settings = { vnext: [{ address: cfg.address, port: parseInt(cfg.port, 10) || 443, users: [user] }] };
    } else { // trojan
      out.settings = {
        servers: [{
          address: cfg.address,
          port: parseInt(cfg.port, 10) || 443,
          password: cfg.uuid
        }]
      };
    }
    return JSON.stringify({ outbounds: [out] }, null, 2);
  }

  var api = {
    parseSubscription: parseSubscription,
    parseUri: parseUri,
    evaluate: evaluate,
    toV2rayOutbound: toV2rayOutbound,
    b64decode: b64decode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SubParser = api;

})(typeof window !== 'undefined' ? window : globalThis);
