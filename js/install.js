// install.js
// "Install TickFit" support. Chrome and Edge fire a `beforeinstallprompt` event when the app can be
// installed; we keep it so a button can open the install dialog later. Safari (iPhone) has no such
// event, so there the person uses Share > Add to Home Screen.

let saved = null; // the install prompt event, once the browser offers it

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // stop the browser's own mini bar, we show our button instead
  saved = event;
});
window.addEventListener('appinstalled', () => (saved = null));

/** Can we show an "Install TickFit" button right now? */
export const canPromptInstall = () => saved !== null;

/** Open the browser's install dialog. Returns true if the person accepted. */
export async function promptInstall() {
  if (!saved) return false;
  const event = saved;
  saved = null; // an install prompt can only be used once
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === 'accepted';
  } catch {
    return false;
  }
}

/** Running as an installed app (home screen icon, or the Android app)? Then we do not need to offer install. */
export const isInstalledApp = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
