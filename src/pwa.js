// Installable app: service worker registration, launch shortcuts and the quiet install line.
import { icon } from './icons.js';

const DAYS_KEY = 'stackpad-active-days';
const DISMISS_KEY = 'stackpad-install-dismissed';
const MIN_DAYS = 2;

let deferred = null; // the stashed beforeinstallprompt event
let slot = null;

const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Counts distinct local days the app has been opened (keeps the last few only).
function recordActiveDay() {
  const days = read(DAYS_KEY, []);
  const list = Array.isArray(days) ? days : [];
  if (!list.includes(today())) write(DAYS_KEY, [...list, today()].slice(-14));
}
const activeDays = () => { const d = read(DAYS_KEY, []); return Array.isArray(d) ? d.length : 0; };

function paint() {
  if (!slot) return;
  const show = deferred && !standalone() && !read(DISMISS_KEY, false) && activeDays() >= MIN_DAYS;
  slot.hidden = !show;
  if (!show) { slot.innerHTML = ''; return; }
  if (slot.firstChild) return;
  slot.innerHTML = `<button class="install-btn" type="button">Install Stackpad</button><button class="install-x" type="button" aria-label="Dismiss" title="Dismiss">${icon('x', 14)}</button>`;
  slot.querySelector('.install-btn').onclick = async () => {
    const ev = deferred;
    if (!ev) return;
    deferred = null;
    ev.prompt();
    try { await ev.userChoice; } catch {}
    paint();
  };
  slot.querySelector('.install-x').onclick = () => { write(DISMISS_KEY, true); paint(); };
}

/** Call once at startup, before the app has rendered. */
export function initPWA() {
  recordActiveDay();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; paint(); });
  window.addEventListener('appinstalled', () => { deferred = null; write(DISMISS_KEY, true); paint(); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
  }
}

/** Where the "Install Stackpad" line lives (an element that starts hidden). */
export function mountInstallLine(el) { slot = el; paint(); }

/** Reads and strips launch params from shortcuts: ?new=1 and ?today=1. Other params (e.g. ?code= from sign-in) are left alone. */
export function takeLaunchAction() {
  const url = new URL(location.href);
  const action = url.searchParams.has('new') ? 'new' : url.searchParams.has('today') ? 'today' : null;
  if (!action) return null;
  url.searchParams.delete('new');
  url.searchParams.delete('today');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return action;
}
