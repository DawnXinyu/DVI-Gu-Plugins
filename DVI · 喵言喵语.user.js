// ==UserScript==
// @name         DVI · 喵言喵语
// @namespace    https://deepveinidle.com/
// @version      1.0.1
// @description  聊天后缀自动补全（可自定义）+ 最新玩家消息「+1」复读；设置并入游戏「设置」面板
// @author       Dawn_Xinyu
// @license      CC-BY-ND
// @match        https://deepveinidle.com/*
// @match        https://www.deepveinidle.com/*
// @match        https://cn.deepveinidle.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/605060/DVI%20%C2%B7%20%E5%96%B5%E8%A8%80%E5%96%B5%E8%AF%AD.user.js
// @updateURL https://update.greasyfork.org/scripts/605060/DVI%20%C2%B7%20%E5%96%B5%E8%A8%80%E5%96%B5%E8%AF%AD.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const VER = '1.0.1';
  const CFG_KEY = 'dvi.meow.cfg.v1';
  const LEGACY_GEO_KEY = 'dvi.meow.geo.v1';
  const DEFAULT_SUFFIX = '喵~';
  const INPUT_SEL = 'input.chat-input';
  const CHAT_LOG_SEL = '.chat-log[data-log]';
  const CHAT_TEXT_SEL = '.chat-text';
  const CHAT_NAME_SEL = '.chat-name';
  const PLUS_CLASS = 'dvi-meow-plus1';
  const SKIP_CLASSES = ['chat-notice', 'chat-global-sys', 'chat-whisper'];
  const MAX_LEN = 200;

  // 游戏「设置」面板
  const ACCOUNT_SEL = '[data-account]';
  const TABS_SEL = '[data-account-tabs]';
  const BODY_SEL = '[data-account-body]';
  const TAB_KEY = 'meow';
  const TAB_SEL = '[data-account-tab="meow"]';
  const PANE_SEL = '[data-pane="meow"]';

  // ───────────────────────── 存储 ─────────────────────────

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* 忽略 */
    }
  }

  const cfg = { suffixOn: true, plusOn: true, suffix: DEFAULT_SUFFIX };

  (function loadCfg() {
    const v = readJson(CFG_KEY, null);
    if (!v) return;
    if (typeof v.suffixOn === 'boolean') cfg.suffixOn = v.suffixOn;
    if (typeof v.plusOn === 'boolean') cfg.plusOn = v.plusOn;
    if (typeof v.suffix === 'string') cfg.suffix = v.suffix.slice(0, 32);
  })();

  function saveCfg() {
    writeJson(CFG_KEY, cfg);
  }

  function normSuffix() {
    return String(cfg.suffix == null ? '' : cfg.suffix).replace(/\s+$/, '');
  }

  // ───────────────────────── 后缀 ─────────────────────────

  function setNativeValue(input, value) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** 给聊天输入框补后缀；返回是否改动 */
  function addSuffix(input) {
    if (!cfg.suffixOn || !input) return false;
    const suffix = normSuffix();
    if (!suffix) return false;

    const raw = input.value || '';
    const text = raw.replace(/\s+$/, '');
    if (!text) return false;                 // 空消息不加
    if (text.endsWith(suffix)) return false; // 已经带了就不重复加

    const next = text + suffix;
    if (next.length > MAX_LEN) return false; // 超长会被游戏截断，宁可不加
    if (next === raw) return false;

    setNativeValue(input, next);
    // 光标放到末尾
    try { input.setSelectionRange(next.length, next.length); } catch { /* 忽略 */ }
    return true;
  }

  // 回车发送（不拦截 Shift+Enter / 输入法组合中 / 设置面板里的输入框）
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
    if (!cfg.suffixOn) return;
    const input = ev.target && ev.target.closest ? ev.target.closest(INPUT_SEL) : null;
    if (!input) return;
    addSuffix(input);
  }, true);

  // 点「发送」按钮
  document.addEventListener('click', (ev) => {
    if (!cfg.suffixOn) return;
    const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!btn) return;
    if (btn.classList.contains(PLUS_CLASS)) return;
    if (btn.hasAttribute('data-meow')) return;
    const label = (btn.textContent || '').trim();
    if (label !== '发送') return;
    const input = document.querySelector(INPUT_SEL);
    if (input && input.getClientRects().length) addSuffix(input);
  }, true);

  // ───────────────────────── 聊天 +1 ─────────────────────────

  function isPlayerLine(el) {
    if (!el || !el.classList || !el.classList.contains('chat-line')) return false;
    if (!el.querySelector(CHAT_NAME_SEL)) return false;
    if (!el.querySelector(CHAT_TEXT_SEL)) return false;
    for (const c of SKIP_CLASSES) if (el.classList.contains(c)) return false;
    return true;
  }

  function findLastPlayerRow(log) {
    if (!log) return null;
    const kids = log.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      if (isPlayerLine(kids[i])) return kids[i];
    }
    return null;
  }

  function removePlus() {
    const all = document.querySelectorAll('button.' + PLUS_CLASS);
    for (const b of all) b.remove();
  }

  function fallbackSay(text) {
    try {
      const s = window.deepvein && window.deepvein.session;
      if (s && typeof s.say === 'function') {
        s.say(text);
        return true;
      }
    } catch {
      /* 忽略 */
    }
    return false;
  }

  /** 发一条聊天：优先真实提交表单，失败再退回 session.say */
  function sendChat(text) {
    const body = String(text == null ? '' : text).slice(0, MAX_LEN);
    if (!body) return false;
    const input = document.querySelector(INPUT_SEL);
    const form = document.querySelector('form.chat-compose');
    if (input && form) {
      setNativeValue(input, body);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      // 游戏 send() 成功后会把输入框清空；没清空说明没走通，退回发包
      window.setTimeout(() => {
        if (input.value === body) {
          setNativeValue(input, '');
          fallbackSay(body);
        }
      }, 320);
      return true;
    }
    return fallbackSay(body);
  }

  function onPlusClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const btn = ev.currentTarget;
    if (btn.dataset.busy) return;
    const row = btn.closest('.chat-line');
    const textEl = row && row.querySelector(CHAT_TEXT_SEL);
    const text = textEl ? (textEl.textContent || '').trim() : '';
    if (!text) return;

    btn.dataset.busy = '1';
    btn.textContent = '…';
    const ok = sendChat(text);
    window.setTimeout(() => {
      delete btn.dataset.busy;
      btn.textContent = ok ? '已发送' : '失败';
      window.setTimeout(() => {
        if (btn.dataset.busy) return;
        btn.textContent = '+1';
      }, 1100);
    }, 160);
  }

  function makePlus() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = PLUS_CLASS;
    btn.textContent = '+1';
    btn.title = '复读这条消息（原样发送，不追加后缀）';
    btn.addEventListener('click', onPlusClick);
    return btn;
  }

  /** 让 +1 按钮跟随最新一条玩家消息 */
  function ensurePlus() {
    if (!cfg.plusOn) {
      removePlus();
      return;
    }
    const log = document.querySelector(CHAT_LOG_SEL);
    const row = findLastPlayerRow(log);
    if (!row) {
      removePlus();
      return;
    }
    let btn = document.querySelector('button.' + PLUS_CLASS);
    if (!btn) btn = makePlus();
    if (btn.parentElement !== row || row.lastElementChild !== btn) row.appendChild(btn);
  }

  // ───────────────────────── 游戏设置面板：喵言喵语页 ─────────────────────────

  // 结构与游戏原生「设置」保持一致：tab 用 data-account-tab，页用 data-pane。
  // 这样游戏自己的 showTab() 会接管显示/隐藏与 aria-pressed，不需要我们改原生逻辑。
  const PANE_HTML = [
    '<h3>喵言喵语</h3>',
    '<div class="set-row">',
    '<div class="set-text"><span class="set-label">聊天后缀</span>',
    '<small class="set-desc">按回车或点「发送」时，自动把后缀补在消息末尾（空消息、已带后缀、超过 200 字不加）。</small></div>',
    '<div class="set-ctl"><label class="forge-switch set-switch">',
    '<input type="checkbox" data-meow="suffixOn" aria-label="启用聊天后缀"><i></i></label></div>',
    '</div>',
    '<div class="set-row">',
    '<div class="set-text"><span class="set-label">聊天 +1 按钮</span>',
    '<small class="set-desc">在最新一条玩家消息后显示「+1」，点击后原样复读该消息（不追加后缀，点一次发一条）。</small></div>',
    '<div class="set-ctl"><label class="forge-switch set-switch">',
    '<input type="checkbox" data-meow="plusOn" aria-label="启用 +1 按钮"><i></i></label></div>',
    '</div>',
    '<div class="set-row">',
    '<div class="set-text"><span class="set-label">后缀内容</span>',
    '<small class="set-desc">最多 32 字，留空则不加后缀；修改后立即生效。</small></div>',
    '<div class="set-ctl"><input type="text" class="meow-input" data-meow="suffix"',
    ' maxlength="32" spellcheck="false" placeholder="' + DEFAULT_SUFFIX + '" aria-label="后缀内容"></div>',
    '</div>',
    '<div class="set-row">',
    '<div class="set-text"><span class="set-label">版本</span>',
    '<small class="set-desc">v' + VER + ' · 以上开关与后缀都保存在本机浏览器（localStorage）。</small></div>',
    '<div class="set-ctl"><button type="button" class="set-btn" data-meow="reset">恢复默认</button></div>',
    '</div>',
  ].join('');

  const CSS = [
    'button.dvi-meow-plus1{margin-left:6px;padding:0 5px;height:17px;line-height:15px;',
    'font:11px/15px inherit;color:#d8cbb0;background:#2a2620;border:1px solid #4a4335;border-radius:4px;',
    'cursor:pointer;vertical-align:baseline;}',
    'button.dvi-meow-plus1:hover{background:#3a3327;border-color:#7a6a4c;color:#f0e6cf;}',
    'button.dvi-meow-plus1[data-busy]{opacity:.75;cursor:default;}',
    '[data-pane="meow"] .meow-input{width:100%;height:36px;box-sizing:border-box;padding:0 10px;',
    'border-radius:8px;border:1px solid var(--edge-bright,#6b5535);background:var(--panel-sunken,#1b1510);',
    'color:var(--ink,#e6dcc6);font:inherit;appearance:none;}',
    '[data-pane="meow"] .meow-input:focus{outline:none;border-color:var(--brass,#c9a86a);}',
  ].join('');

  function settingsParts() {
    const root = document.querySelector(ACCOUNT_SEL);
    if (!root) return null;
    const nav = root.querySelector(TABS_SEL);
    const body = root.querySelector(BODY_SEL);
    if (!nav || !body) return null;
    return { root, nav, body };
  }

  function syncSettings(pane) {
    if (!pane) return;
    const ckSuffix = pane.querySelector('[data-meow="suffixOn"]');
    const ckPlus = pane.querySelector('[data-meow="plusOn"]');
    const suffixInput = pane.querySelector('[data-meow="suffix"]');
    if (ckSuffix) ckSuffix.checked = !!cfg.suffixOn;
    if (ckPlus) ckPlus.checked = !!cfg.plusOn;
    if (suffixInput && document.activeElement !== suffixInput) suffixInput.value = cfg.suffix;
  }

  function bindSettings(pane) {
    pane.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute) return;
      const key = el.getAttribute('data-meow');
      if (key === 'suffixOn') {
        cfg.suffixOn = !!el.checked;
        saveCfg();
      } else if (key === 'plusOn') {
        cfg.plusOn = !!el.checked;
        saveCfg();
        if (cfg.plusOn) ensurePlus();
        else removePlus();
      }
    });

    let timer = 0;
    pane.addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute || el.getAttribute('data-meow') !== 'suffix') return;
      cfg.suffix = String(el.value || '').slice(0, 32);
      window.clearTimeout(timer);
      timer = window.setTimeout(saveCfg, 250);
    });

    pane.addEventListener('blur', (ev) => {
      const el = ev.target;
      if (!el || !el.getAttribute || el.getAttribute('data-meow') !== 'suffix') return;
      window.clearTimeout(timer);
      saveCfg();
    }, true);

    pane.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('[data-meow="reset"]') : null;
      if (btn) {
        cfg.suffix = DEFAULT_SUFFIX;
        cfg.suffixOn = true;
        cfg.plusOn = true;
        saveCfg();
        syncSettings(pane);
        ensurePlus();
      }
      // 设置页内的点击不冒泡给游戏，避免触发关闭/其它委托
      ev.stopPropagation();
    });
  }

  /** 把「喵言喵语」页挂进游戏设置；返回 { tab, pane } */
  function ensureSettingsUI() {
    const parts = settingsParts();
    if (!parts) return null;

    // 先建页面再建 tab：游戏 showTab() 会用 [data-pane] 是否存在决定 tab 显示
    let pane = parts.body.querySelector(PANE_SEL);
    if (!pane) {
      pane = document.createElement('section');
      pane.className = 'guild-card set-card';
      pane.setAttribute('data-pane', TAB_KEY);
      pane.innerHTML = PANE_HTML;
      // 插入时按当前激活的 tab 决定显隐，避免在「游戏」页多出一块
      const activeTab = parts.nav.querySelector('[data-account-tab][aria-pressed="true"]');
      const activeKey = activeTab ? activeTab.getAttribute('data-account-tab') : 'game';
      pane.hidden = activeKey !== TAB_KEY;
      parts.body.appendChild(pane);
      bindSettings(pane);
    }
    syncSettings(pane);

    let tab = parts.nav.querySelector(TAB_SEL);
    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('data-account-tab', TAB_KEY);
      tab.setAttribute('aria-pressed', 'false');
      tab.textContent = '喵言喵语';
      parts.nav.appendChild(tab);
    }
    // 游戏切 tab 时会按 [data-pane] 重算 tab 显隐，这里兜一下
    if (tab.hidden && parts.body.querySelector(PANE_SEL)) tab.hidden = false;

    return { tab, pane };
  }

  // ───────────────────────── 观察与轮询 ─────────────────────────

  let debounce = 0;
  function scheduleSync() {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      try { ensurePlus(); } catch { /* 忽略 */ }
    }, 120);
  }

  function observeChat() {
    const log = document.querySelector(CHAT_LOG_SEL);
    if (!log) return false;
    if (observeChat.log === log) return true;
    if (observeChat.mo) observeChat.mo.disconnect();
    const mo = new MutationObserver(scheduleSync);
    mo.observe(log, { childList: true });
    observeChat.mo = mo;
    observeChat.log = log;
    return true;
  }

  function start() {
    // 旧版把面板位置存在这个键里，已经不用了，顺手清掉
    try { localStorage.removeItem(LEGACY_GEO_KEY); } catch { /* 忽略 */ }

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    try { ensureSettingsUI(); } catch { /* 忽略 */ }
    observeChat();
    scheduleSync();

    // 聊天面板可能重挂/换房间；设置面板可能是懒加载，都用轮询兜底
    window.setInterval(() => {
      try {
        observeChat();
        ensurePlus();
        ensureSettingsUI();
      } catch {
        /* 忽略 */
      }
    }, 1500);

    // 打开设置面板时补挂（游戏侧渲染有延迟）
    document.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t || !t.closest || !t.closest('[data-open="account"]')) return;
      window.setTimeout(() => {
        try { ensureSettingsUI(); } catch { /* 忽略 */ }
      }, 350);
      window.setTimeout(() => {
        try { ensureSettingsUI(); } catch { /* 忽略 */ }
      }, 1200);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  // 探针（排查用）
  window.__DVI_MEOW = {
    version: VER,
    cfg,
    apply: () => addSuffix(document.querySelector(INPUT_SEL)),
    send: sendChat,
    plus: () => ensurePlus(),
    settings: () => ensureSettingsUI(),
    storageKeys: { cfg: CFG_KEY },
  };
})();
