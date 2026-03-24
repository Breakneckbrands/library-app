import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export interface NotificationPreferences {
  browser: boolean;
  audio: boolean;
  vibrate: boolean;
  visual: boolean;
  tabFlash: boolean;
}

export const DEFAULT_PREFS: NotificationPreferences = {
  browser: true,
  audio: true,
  vibrate: true,
  visual: true,
  tabFlash: true,
};

let _audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!_audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    _audioCtx = new Ctor();
  }
  return _audioCtx;
}

export function initAudioContext(): void {
  if (!Capacitor.isNativePlatform()) getAudioContext();
}

export async function playAlarmSound(type: 'alarm' | 'reminder' = 'alarm'): Promise<void> {
  // On native iOS, LocalNotifications handles the sound. Only play Web Audio if running on web.
  if (Capacitor.isNativePlatform()) return;
  
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const beeps = type === 'alarm' ? [880, 660, 880, 660, 1100] : [440, 550];
    let t = ctx.currentTime;
    for (const freq of beeps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.26);
      t += 0.3;
    }
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

export async function triggerVibration(type: 'alarm' | 'reminder' = 'alarm'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: type === 'alarm' ? ImpactStyle.Heavy : ImpactStyle.Medium });
      if (type === 'alarm') {
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 200);
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 400);
      }
    } catch { /* ignore */ }
  } else {
    if (!('vibrate' in navigator)) return;
    navigator.vibrate(type === 'alarm' ? [300, 100, 300, 100, 300] : [200, 100, 200]);
  }
}

export async function showBrowserNotification(title: string, body: string, type: 'alarm' | 'reminder' = 'alarm'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'granted') {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 2147483647),
              // 1 second delay gives iOS time to process and ensures Watch mirrors it
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default',
              // Group notifications by thread so Watch shows them together
              threadIdentifier: 'shift-tracker-alerts',
              // Summaryable grouping for notification center
              summaryArgument: 'Shift Tracker',
            }
          ]
        });
      } catch (e) {
        console.warn('Failed to show native notification:', e);
      }
    }
  } else {
    // Web fallback
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '🏥', requireInteraction: true });
    }
  }
}

let _flashInterval: ReturnType<typeof setInterval> | null = null;
const _origTitle = document.title;

export function flashTabTitle(msg: string, durationMs = 12000): void {
  if (Capacitor.isNativePlatform()) return; // Don't flash tabs natively
  if (_flashInterval) clearInterval(_flashInterval);
  let on = true;
  _flashInterval = setInterval(() => {
    document.title = on ? `⏰ ${msg}` : _origTitle;
    on = !on;
  }, 700);
  setTimeout(() => {
    if (_flashInterval) clearInterval(_flashInterval);
    document.title = _origTitle;
    _flashInterval = null;
  }, durationMs);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'granted' : 'denied';
  } else {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
  }
}

/** Fire ALL notification channels based on user preferences */
export function fireAllNotifications(
  title: string, 
  body: string, 
  type: 'alarm' | 'reminder' = 'alarm',
  prefs: NotificationPreferences = DEFAULT_PREFS
): void {
  // Capacitor LocalNotifications merges browser popup & sound
  if (prefs.browser || prefs.audio) { showBrowserNotification(title, body, type); }
  if (prefs.audio && !Capacitor.isNativePlatform()) { playAlarmSound(type); }
  if (prefs.vibrate) { triggerVibration(type); }
  if (prefs.tabFlash && !Capacitor.isNativePlatform()) { flashTabTitle(title); }
}
