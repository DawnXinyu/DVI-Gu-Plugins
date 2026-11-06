// ==UserScript==
// @name         DVI · 喵言喵语
// @namespace    https://deepveinidle.com/
// @version      1.0.0
// @description  发送聊天消息时自动在结尾加「喵~」
// @author       Dawn_Xinyu
// @license      CC-BY-ND
// @match        https://deepveinidle.com/*
// @match        https://www.deepveinidle.com/*
// @match        https://cn.deepveinidle.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const SUFFIX = '喵~';
  const INPUT_SEL = 'input.chat-input';

  /** 给聊天输入框补后缀；返回是否改动 */
  function addSuffix(input) {
    if (!input) return false;
    const raw = input.value || '';
    const text = raw.replace(/\s+$/, '');
    if (!text) return false;              // 空消息不加
    if (text.endsWith(SUFFIX)) return false; // 已经带了就不重复加
    const next = text + SUFFIX;
    if (next === raw) return false;

    // 直接改 value 并派发 input，兼容 Vue/React 的受控输入
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // 光标放到末尾
    try { input.setSelectionRange(next.length, next.length); } catch { /* ignore */ }
    return true;
  }

  // 回车发送（不拦截 Shift+Enter / 输入法组合中）
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
    const input = ev.target && ev.target.closest ? ev.target.closest(INPUT_SEL) : null;
    if (!input) return;
    addSuffix(input);
  }, true);

  // 点「发送」按钮
  document.addEventListener('click', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!btn) return;
    const label = (btn.textContent || '').trim();
    if (label !== '发送') return;
    const input = document.querySelector(INPUT_SEL);
    if (input && input.getClientRects().length) addSuffix(input);
  }, true);

  // 暴露一个手动开关，方便排查
  window.__DVI_MEOW = {
    version: '1.0.0',
    suffix: SUFFIX,
    apply: () => addSuffix(document.querySelector(INPUT_SEL)),
  };
})();
