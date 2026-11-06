import { localDate } from './dates.js';
import { validateWorkspace } from './model.js';
import { MENU } from './extras.js';
import { BEANS_VISIT, beanBalance, buy, favourite, greeting, setCozy, visit } from './cafe.js';

const byId = (id) => document.getElementById(id);
const SOUND_KEY = 'daybook.cafe.sound';
const TITLE = document.title;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function soundOn() {
  try { return window.localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; }
}

let audio = null;
function tone(notes, volume = 0.05) {
  if (!soundOn()) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    let at = audio.currentTime;
    for (const [freq, length] of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + length);
      at += length * 0.7;
    }
  } catch {
    // Sound is optional.
  }
}
export const sounds = {
  clink: () => tone([[1760, 0.12], [2349, 0.2]]),
  chime: () => tone([[784, 0.3], [988, 0.3], [1319, 0.5]], 0.07),
};

export function createCafeUi({ getWorkspace, commit, showError, announce, refresh, openGames }) {
  let timerEnd = 0;
  let timer = null;
  let ordered = null;
  let note = '';

  function apply(change, message) {
    try {
      commit(validateWorkspace(change(getWorkspace())));
      refresh();
      if (message) announce(message);
      return true;
    } catch (error) {
      note = error.message;
      render();
      return false;
    }
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
    timerEnd = 0;
  }

  function tickTimer() {
    const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    const label = byId('cafe-timer');
    if (!label) return;
    label.textContent = timerEnd ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'No break running';
    if (timerEnd && left === 0) {
      stopTimer();
      label.textContent = 'Break is over. Welcome back!';
      document.title = '\u2615 Break over! - Daybook';
      sounds.chime();
      announce('Break is over. Welcome back!');
    }
  }

  function startTimer(minutes) {
    stopTimer();
    timerEnd = Date.now() + minutes * 60_000;
    timer = setInterval(tickTimer, 500);
    document.title = TITLE;
    tickTimer();
  }

  function renderScene(root, workspace) {
    const { cafe } = workspace;
    const hour = new Date().getHours();
    const usual = favourite(cafe);
    const scene = el('div', `cafe-scene${cafe.cozy ? ' cozy' : ''}`);
    const shelf = el('div', 'cafe-shelf');
    for (const item of MENU.filter((entry) => entry.kind === 'decor')) {
      const spot = el('span', `shelf-spot${cafe.purchases.includes(item.id) ? ' owned' : ''}`, cafe.purchases.includes(item.id) ? item.icon : '\u00B7');
      spot.setAttribute('aria-label', cafe.purchases.includes(item.id) ? item.label : `${item.label} not bought yet`);
      shelf.append(spot);
    }
    const barista = el('div', 'barista');
    barista.append(el('span', 'barista-face', '\uD83E\uDDD1\u200D\uD83C\uDF73'), el('p', 'speech', greeting(hour, usual)));
    const counter = el('div', 'cafe-counter');
    counter.append(el('span', `tray${ordered ? ' served' : ''}`, ordered ? ordered.icon : '\u2615'));
    if (ordered) counter.append(el('span', 'order-note', `Enjoy your ${ordered.label.toLowerCase()}!`));
    scene.append(shelf, barista, counter);
    root.append(scene);
  }

  function renderMenu(root, workspace) {
    const balance = beanBalance(workspace);
    const menu = el('div', 'cafe-menu');
    menu.append(el('h3', '', `Menu \u00B7 ${balance} \uD83E\uDED8 beans`));
    for (const kind of ['drink', 'pastry', 'decor']) {
      const group = el('div', 'menu-group');
      group.append(el('h4', '', { drink: 'Drinks', pastry: 'Pastries', decor: 'Decorations' }[kind]));
      for (const item of MENU.filter((entry) => entry.kind === kind)) {
        const owned = kind === 'decor' && workspace.cafe.purchases.includes(item.id);
        const button = el('button', 'menu-item secondary', `${item.icon} ${item.label} \u00B7 ${item.cost}`);
        button.type = 'button';
        button.dataset.item = item.id;
        if (owned) { button.disabled = true; button.textContent = `${item.icon} ${item.label} \u00B7 owned`; }
        button.addEventListener('click', () => {
          note = '';
          if (apply((ws) => buy(ws, item.id), `${item.label} ordered.`)) {
            ordered = kind === 'decor' ? null : item;
            sounds.clink();
            render();
          }
        });
        group.append(button);
      }
      menu.append(group);
    }
    root.append(menu);
  }

  function renderTools(root, workspace) {
    const tools = el('div', 'cafe-tools');
    const timerBox = el('div', 'timer-box');
    const label = el('strong', '', 'No break running');
    label.id = 'cafe-timer';
    label.setAttribute('role', 'timer');
    timerBox.append(el('span', '', 'Take a break:'));
    for (const minutes of [5, 10, 15]) {
      const button = el('button', 'secondary', `${minutes} min`);
      button.type = 'button';
      button.addEventListener('click', () => { startTimer(minutes); sounds.clink(); });
      timerBox.append(button);
    }
    const stop = el('button', 'quiet', 'Stop');
    stop.type = 'button';
    stop.addEventListener('click', () => { stopTimer(); tickTimer(); document.title = TITLE; });
    timerBox.append(stop, label);
    const cozy = el('button', 'secondary', workspace.cafe.cozy ? 'Cozy mode: on' : 'Cozy mode: off');
    cozy.type = 'button';
    cozy.setAttribute('aria-pressed', String(workspace.cafe.cozy));
    cozy.addEventListener('click', () => apply((ws) => setCozy(ws, !ws.cafe.cozy)));
    const sound = el('button', 'secondary', soundOn() ? 'Sound: on' : 'Sound: off');
    sound.type = 'button';
    sound.setAttribute('aria-pressed', String(soundOn()));
    sound.addEventListener('click', () => {
      try { window.localStorage.setItem(SOUND_KEY, soundOn() ? 'off' : 'on'); } catch (error) { showError(error); }
      render();
      sounds.clink();
    });
    const games = el('button', 'secondary', '\uD83C\uDFB2 Play a board game');
    games.type = 'button';
    games.addEventListener('click', openGames);
    tools.append(timerBox, cozy, sound, games);
    root.append(tools);
  }

  function render() {
    const workspace = getWorkspace();
    const root = byId('cafe-root');
    if (!workspace || !root) return;
    root.replaceChildren();
    renderScene(root, workspace);
    renderTools(root, workspace);
    if (note) {
      const message = el('p', 'message error', note);
      message.setAttribute('role', 'alert');
      root.append(message);
    }
    renderMenu(root, workspace);
    tickTimer();
  }

  return {
    render,
    enter() {
      const workspace = getWorkspace();
      note = '';
      ordered = null;
      document.title = TITLE;
      if (workspace && !workspace.cafe.visits.includes(localDate())) {
        try {
          commit(validateWorkspace(visit(workspace, localDate())));
          refresh();
          announce(`Welcome to the break room! +${BEANS_VISIT} bean for visiting today.`);
        } catch (error) { showError(error); }
      }
      render();
    },
    leave() {},
  };
}
