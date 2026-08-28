'use strict';

// ─── 가상 키보드 (터치 환경 대비) ────────────────────────────────
// `data-vkbd="alphanumeric"` 또는 `data-vkbd="numeric"` 속성이 붙은 input에
// 자동으로 붙는다. 물리 키보드 입력은 그대로 동작하며, 포커스 시 화면 하단에
// 온스크린 키보드가 나타나는 방식으로 보조한다.

const VirtualKeyboard = (() => {
  const ALPHA_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ];
  const NUMERIC_ROWS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['0'],
  ];

  let root = null;
  let keysWrap = null;
  let activeInput = null;
  let shiftOn = false;

  function build() {
    root = document.createElement('div');
    root.id = 'vkbd-root';
    root.innerHTML = `
      <div id="vkbd-panel">
        <div id="vkbd-keys"></div>
        <div id="vkbd-actionrow">
          <button type="button" data-action="clear">전체 지우기</button>
          <button type="button" data-action="close">완료</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    keysWrap = root.querySelector('#vkbd-keys');

    root.addEventListener('mousedown', (e) => e.preventDefault());
    root.querySelector('[data-action="clear"]').addEventListener('click', () => {
      if (!activeInput) return;
      setValue('');
    });
    root.querySelector('[data-action="close"]').addEventListener('click', () => hide());
  }

  function setValue(newValue) {
    const el = activeInput;
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, newValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // <input type="number">는 selectionStart/setSelectionRange를 지원하지 않아
  // 커서 위치 대신 값 끝에 이어붙이는 방식으로 단순화한다.
  function supportsSelection(el) {
    return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text');
  }

  function insertAtCursor(text) {
    const el = activeInput;
    if (!el) return;
    if (!supportsSelection(el)) { setValue(el.value + text); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setValue(next);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
  }

  function backspace() {
    const el = activeInput;
    if (!el) return;
    if (!supportsSelection(el)) { setValue(el.value.slice(0, -1)); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start === end) {
      if (start === 0) return;
      const next = el.value.slice(0, start - 1) + el.value.slice(end);
      setValue(next);
      el.setSelectionRange(start - 1, start - 1);
    } else {
      const next = el.value.slice(0, start) + el.value.slice(end);
      setValue(next);
      el.setSelectionRange(start, start);
    }
  }

  function makeKey(label, opts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = 'vkbd-key' + (opts?.wide ? ' vkbd-key-wide' : '');
    btn.addEventListener('click', () => {
      activeInput?.focus();
      opts.onPress();
    });
    return btn;
  }

  function renderAlphaKeys() {
    keysWrap.innerHTML = '';
    keysWrap.className = 'vkbd-alpha';
    ALPHA_ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkbd-row';
      row.forEach((ch) => {
        const isLetter = /[A-Z]/.test(ch);
        const display = isLetter ? (shiftOn ? ch : ch.toLowerCase()) : ch;
        rowEl.appendChild(makeKey(display, { onPress: () => insertAtCursor(display) }));
      });
      keysWrap.appendChild(rowEl);
    });

    const bottomRow = document.createElement('div');
    bottomRow.className = 'vkbd-row';
    const shiftKey = makeKey('⇧ Shift', { onPress: () => { shiftOn = !shiftOn; renderAlphaKeys(); } });
    shiftKey.classList.toggle('vkbd-key-active', shiftOn);
    bottomRow.appendChild(shiftKey);
    bottomRow.appendChild(makeKey('Space', { onPress: () => insertAtCursor(' '), wide: true }));
    bottomRow.appendChild(makeKey('⌫', { onPress: backspace }));
    keysWrap.appendChild(bottomRow);
  }

  function renderNumericKeys() {
    keysWrap.innerHTML = '';
    keysWrap.className = 'vkbd-numeric';
    NUMERIC_ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkbd-row';
      row.forEach((ch) => rowEl.appendChild(makeKey(ch, { onPress: () => insertAtCursor(ch) })));
      keysWrap.appendChild(rowEl);
    });
    const bottomRow = document.createElement('div');
    bottomRow.className = 'vkbd-row';
    bottomRow.appendChild(makeKey('⌫', { onPress: backspace, wide: true }));
    keysWrap.appendChild(bottomRow);
  }

  // Edit 창(input) 바로 아래에 붙인다 — 아래쪽 공간이 부족하면 위로 뒤집는다.
  function positionNear(input) {
    const margin = 6;
    const rect = input.getBoundingClientRect();
    const panelRect = root.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    let left = rect.left;
    if (left + panelRect.width > vw - margin) left = vw - panelRect.width - margin;
    if (left < margin) left = margin;

    let top = rect.bottom + margin;
    if (top + panelRect.height > vh - margin) {
      top = rect.top - panelRect.height - margin;
    }
    if (top < margin) top = margin;

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }

  function show(input, mode) {
    if (!root) build();
    activeInput = input;
    shiftOn = false;
    if (mode === 'numeric') renderNumericKeys();
    else renderAlphaKeys();
    root.classList.add('vkbd-open');
    positionNear(input);
  }

  function hide() {
    if (activeInput) activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    activeInput = null;
    root?.classList.remove('vkbd-open');
  }

  window.addEventListener('resize', () => {
    if (activeInput && root?.classList.contains('vkbd-open')) positionNear(activeInput);
  });
  window.addEventListener('scroll', () => {
    if (activeInput && root?.classList.contains('vkbd-open')) positionNear(activeInput);
  }, true);

  function attach(input, mode) {
    input.addEventListener('focus', () => show(input, mode));
    input.addEventListener('mousedown', () => show(input, mode));
  }

  document.addEventListener('mousedown', (e) => {
    if (!root || !root.classList.contains('vkbd-open')) return;
    if (root.contains(e.target)) return;
    if (activeInput && e.target === activeInput) return;
    hide();
  });

  function initFromDom() {
    document.querySelectorAll('[data-vkbd]').forEach((el) => {
      const mode = el.dataset.vkbd === 'numeric' ? 'numeric' : 'alphanumeric';
      attach(el, mode);
    });
  }

  document.addEventListener('DOMContentLoaded', initFromDom);

  return { attach, show, hide };
})();
