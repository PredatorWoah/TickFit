// restalert.js
// Android app: the rest timer keeps working with the screen off or the app in the background.
// The page's own timer pauses there (Android freezes hidden web pages), so while a rest is running and the
// app is hidden, a phone notification is scheduled for the moment the rest ends ("Rest is over"), with sound
// and vibration. Back in the app it is cancelled again, so you never get two alerts.
//
// Uses Capacitor's Local Notifications plugin. Nothing leaves the phone.

import { getState } from './store.js';
import { isNative, nativePlugin } from './platform.js';

const ID = 4201; // one notification id, so a new rest always replaces the old one
const CHANNEL = 'tickfit-rest';
let rest = null; // { endAt, label } while a rest is running
let armed = false;
let setUp = false;

export const restAlertOn = () => isNative() && getState().settings.restAlert !== false && !!nativePlugin('LocalNotifications');

/** The text of the notification. Pure, so it can be tested. */
export function restAlertText(label) {
  return { title: 'Rest is over', body: label ? `${label}. Time for the next set.` : 'Time for the next set.' };
}

async function setup(LN) {
  if (setUp) return true;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LN.createChannel({ id: CHANNEL, name: 'Rest timer', description: 'Tells you when your rest between sets is over', importance: 5, visibility: 1, vibration: true }).catch(() => {});
    setUp = true;
    return true;
  } catch {
    return false;
  }
}

async function arm() {
  const LN = nativePlugin('LocalNotifications');
  if (!rest || !restAlertOn() || !LN || rest.endAt - Date.now() < 1500) return;
  if (!(await setup(LN))) return;
  const { title, body } = restAlertText(rest.label);
  try {
    await LN.schedule({ notifications: [{ id: ID, title, body, channelId: CHANNEL, schedule: { at: new Date(rest.endAt), allowWhileIdle: true }, autoCancel: true }] });
    armed = true;
  } catch {
    armed = false;
  }
}

function disarm() {
  if (!armed) return;
  armed = false;
  const LN = nativePlugin('LocalNotifications');
  if (LN) LN.cancel({ notifications: [{ id: ID }] }).catch(() => {});
}

/** The rest timer tells us about every change (start, +15s) and when it stops. */
export function restChanged(endAt, label) {
  rest = endAt ? { endAt, label } : null;
  if (!rest) return disarm();
  if (armed) arm(); // moved by +15s while hidden: move the notification too
}

/** Ask for the notification permission now (from a tap), so the first rest does not interrupt with a dialog. */
export async function prepareRestAlert() {
  const LN = nativePlugin('LocalNotifications');
  return restAlertOn() && LN ? setup(LN) : false;
}

let listening = false;
export function startRestAlerts() {
  if (listening || !isNative()) return;
  listening = true;
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? arm() : disarm()));
  const App = nativePlugin('App');
  if (App && App.addListener) {
    Promise.resolve(App.addListener('pause', arm)).catch(() => {});
    Promise.resolve(App.addListener('resume', disarm)).catch(() => {});
  }
}
