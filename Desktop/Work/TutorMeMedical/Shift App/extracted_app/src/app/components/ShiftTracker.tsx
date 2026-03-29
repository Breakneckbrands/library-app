import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clock, Plus, X, Timer, ChevronDown, AlarmClock, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  fireAllNotifications,
  requestNotificationPermission,
  scheduleNativeAlert,
  cancelNativeAlert,
  cancelAllNativeAlerts,
  initAudioContext,
  DEFAULT_PREFS
} from '@/utils/notifications';
import { RoomPanel, type DocumentationItem, type RoomData, type ShiftNote } from './RoomPanel';
import { Stat } from './StatDisplay';
import { TimerDisplay, type CustomTimer } from './TimerDisplay';
import { SettingsModal, type AppSettings } from './SettingsModal';

interface ScheduledAlert {
  id: string;
  label: string;
  scheduledTime: Date;
  fired: boolean;
  nativeId?: number; // native iOS notification ID for cancellation
}

interface ShiftData {
  startTime: string;
  rooms: RoomData[];
  customTimers: Array<Omit<CustomTimer, 'startTime'> & { startTime: string }>;
  lunchStartTime?: string;
  scheduledAlerts: Array<Omit<ScheduledAlert, 'scheduledTime'> & { scheduledTime: string }>;
}

const INITIAL_DOCS: DocumentationItem[] = [
  { id: 'print-strip', label: 'Print Strip', completed: false },
  { id: 'assess', label: 'Assess', completed: false },
  { id: 'focused', label: 'Focused', completed: false },
  { id: 'safety', label: 'Safety', completed: false },
  { id: 'pain', label: 'Pain', completed: false },
  { id: 'routine', label: 'Routine', completed: false },
  {
    id: 'hygiene', label: 'Hygiene', completed: false,
    subItems: [
      { id: 'chg', label: 'CHG', completed: false },
      { id: 'foley', label: 'Foley', completed: false },
    ],
  },
  { id: 'lines-drains', label: 'Lines/Drains', completed: false },
  { id: 'teach', label: 'Teach', completed: false },
  { id: 'poc', label: 'POC', completed: false },
  { id: 'am-note', label: 'AM Note', completed: false },
  { id: 'pm-note', label: 'PM Note', completed: false },
];

function generateHourlySlots(startHour: number) {
  const slots = [];
  for (let i = 0; i < 14; i++) {
    const h24 = (startHour + i) % 24;
    const isPM = h24 >= 12;
    const h12 = h24 % 12 || 12;
    slots.push({ key: `${h12}${isPM ? 'P' : 'A'}`, label: `${h12} ${isPM ? 'PM' : 'AM'}` });
  }
  return slots;
}

// Deterministic native notification ID for a room's hourly slot
function slotNotifId(roomId: string, slotKey: string): number {
  let h = 0;
  const s = roomId + '|' + slotKey;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) + 1;
}

// Convert slot key ("1P", "6A", "12P") to a Date object for today/tomorrow
function slotKeyToDate(key: string, shiftStartHour: number): Date {
  const isPM = key.endsWith('P');
  const h12 = parseInt(key);
  const h24 = isPM ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
  const d = new Date();
  d.setHours(h24, 0, 0, 0);
  // Night shift: slots crossing midnight are scheduled for next calendar day
  if (shiftStartHour >= 18 && h24 < 12 && new Date().getHours() >= shiftStartHour) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ShiftTracker() {
  // Settings
  const [settings, setSettings] = useState<AppSettings>({
    notifications: DEFAULT_PREFS,
    shiftStartHour: 6,
    defaultDocs: INITIAL_DOCS,
    hourlyReminder: false,
    hourlySlot30MinReminder: false,
    lunchBreakMinutes: 30,
    addNotesToHourlyActivities: true,
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Load/Save settings
  useEffect(() => {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
  }, [settings]);

  // Request native notification permission on startup (iOS requires an explicit prompt)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      requestNotificationPermission().then(perm => {
        setNotificationPermission(perm);
      });
    } else if ('Notification' in window && Notification.permission !== 'default') {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const HOURLY_SLOTS = generateHourlySlots(settings.shiftStartHour);
  const freshDocs = useCallback(() => JSON.parse(JSON.stringify(settings.defaultDocs)) as DocumentationItem[], [settings.defaultDocs]);

  // Shift state
  const [shiftStarted, setShiftStarted] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [lastReminderHour, setLastReminderHour] = useState<number | null>(null);

  // Rooms
  const [rooms, setRooms] = useState<RoomData[]>([]);

  const [lunchNativeId] = useState<number>(999999998); // fixed deterministic ID for lunch alarm

  // Timers & Alerts
  const [showTimersMenu, setShowTimersMenu] = useState(false);
  const [customTimers, setCustomTimers] = useState<CustomTimer[]>([]);
  const [lunchStartTime, setLunchStartTime] = useState<Date | null>(null);
  const [lunchElapsed, setLunchElapsed] = useState('00:00');
  const [scheduledAlerts, setScheduledAlerts] = useState<ScheduledAlert[]>([]);

  // Modal state
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerLabel, setTimerLabel] = useState('');
  const [timerType, setTimerType] = useState<'countup' | 'countdown'>('countdown');
  const [cdMinutes, setCdMinutes] = useState('');
  const [cdSeconds, setCdSeconds] = useState('');

  const [showUnnamedConfirm, setShowUnnamedConfirm] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertLabel, setAlertLabel] = useState('');
  const [alertDateTime, setAlertDateTime] = useState('');

  // Add Room modal
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');

  // Load shift data
  useEffect(() => {
    const saved = localStorage.getItem('shiftData');
    if (saved) {
      try {
        const data: ShiftData = JSON.parse(saved);
        if (data.startTime) {
          setShiftStarted(true);
          setStartTime(new Date(data.startTime));
          setRooms((data.rooms || []).map(r => ({ ...r, documentation: r.documentation || freshDocs(), notes: r.notes || [] })));
          setCustomTimers((data.customTimers || []).map(t => ({ ...t, startTime: new Date(t.startTime) })));
          if (data.lunchStartTime) setLunchStartTime(new Date(data.lunchStartTime));
          setScheduledAlerts((data.scheduledAlerts || []).map(a => ({ ...a, scheduledTime: new Date(a.scheduledTime) })));
        }
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save shift data
  useEffect(() => {
    if (!shiftStarted || !startTime) return;
    const data: ShiftData = {
      startTime: startTime.toISOString(), rooms,
      customTimers: customTimers.map(t => ({ ...t, startTime: t.startTime.toISOString() })) as ShiftData['customTimers'],
      lunchStartTime: lunchStartTime?.toISOString(),
      scheduledAlerts: scheduledAlerts.map(a => ({ ...a, scheduledTime: a.scheduledTime.toISOString() })) as ShiftData['scheduledAlerts'],
    };
    localStorage.setItem('shiftData', JSON.stringify(data));
  }, [shiftStarted, startTime, rooms, customTimers, lunchStartTime, scheduledAlerts]);

  // Timers
  useEffect(() => {
    if (!shiftStarted || !startTime) return;
    const id = setInterval(() => {
      const d = Date.now() - startTime.getTime();
      const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000);
      setElapsedTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
  }, [shiftStarted, startTime]);

  useEffect(() => {
    if (!lunchStartTime) return;
    const id = setInterval(() => {
      const breakMs = (settings.lunchBreakMinutes ?? 30) * 60 * 1000;
      const remaining = Math.max(0, breakMs - (Date.now() - lunchStartTime.getTime()));
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setLunchElapsed(`${m}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
  }, [lunchStartTime, settings.lunchBreakMinutes]);

  // Hourly reminder
  useEffect(() => {
    if (!shiftStarted || !settings.hourlyReminder || !startTime) return;
    const id = setInterval(() => {
      const now = new Date();
      const hoursElapsed = Math.floor((now.getTime() - startTime.getTime()) / 3600000);
      if (hoursElapsed > 0 && now.getHours() !== lastReminderHour) {
        setLastReminderHour(now.getHours());
        let done = 0, total = 0;
        rooms.forEach(r => r.documentation.forEach(d => {
          total++; if (d.completed) done++;
          d.subItems?.forEach(s => { total++; if (s.completed) done++; });
        }));
        const msg = `${done}/${total} documentation items complete`;
        fireAllNotifications('Hourly Reminder', msg, 'reminder', settings.notifications);
        if (settings.notifications.visual) toast.info('Hourly Reminder', { description: msg });
      }
    }, 60000);
    return () => clearInterval(id);
  }, [shiftStarted, settings.hourlyReminder, startTime, lastReminderHour, settings.notifications, rooms]);

  // Scheduled alerts
  useEffect(() => {
    if (!shiftStarted) return;
    const id = setInterval(() => {
      const now = new Date();
      setScheduledAlerts(prev => {
        let changed = false;
        const next = prev.map(a => {
          if (!a.fired && now >= a.scheduledTime) {
            fireAllNotifications('⏰ Scheduled Alert', a.label, 'alarm', settings.notifications);
            if (settings.notifications.visual) toast.error(`⏰ ${a.label}`, { description: 'Scheduled alert fired!', duration: Infinity });
            changed = true;
            return { ...a, fired: true };
          }
          return a;
        });
        return changed ? next : prev;
      });
    }, 15000);
    return () => clearInterval(id);
  }, [shiftStarted, settings.notifications]);

  // Handlers
  const startShift = useCallback(() => {
    initAudioContext();
    setShiftStarted(true);
    setStartTime(new Date());
    setLastReminderHour(null);
    toast.success('Shift started!');
  }, []);

  const endShift = useCallback(() => {
    if (!window.confirm('End this shift? All data will be cleared.')) return;
    cancelAllNativeAlerts(); // clear any pre-scheduled lock screen notifications
    setShiftStarted(false);
    setStartTime(null);
    setElapsedTime('00:00');
    setLastReminderHour(null);
    setRooms([]);
    setCustomTimers([]);
    setLunchStartTime(null);
    setScheduledAlerts([]);
    localStorage.removeItem('shiftData');
    toast.success('Shift ended. Stay safe!');
  }, [freshDocs]);

  const toggleDoc = useCallback((roomId: string, docId: string, parentId?: string) => {
    setRooms(rooms => rooms.map(room => {
      if (room.id !== roomId) return room;
      let newCompletedSlots = { ...room.completedSlots };
      const affectedHourKeys = new Set<string>();

      const newDocs = room.documentation.map(doc => {
        if (parentId && doc.id === parentId && doc.subItems) {
          const newSubItems = doc.subItems.map(s => {
            if (s.id !== docId) return s;
            const newCompleted = !s.completed;
            if (s.hourKey) affectedHourKeys.add(s.hourKey);
            return { ...s, completed: newCompleted };
          });
          return { ...doc, subItems: newSubItems };
        }
        if (doc.id === docId) {
          if (doc.hourKey) affectedHourKeys.add(doc.hourKey);
          return { ...doc, completed: !doc.completed };
        }
        return doc;
      });

      // A slot is done only when ALL docs/subItems linked to it are done
      for (const hk of affectedHourKeys) {
        const allDone = newDocs.every(d => {
          if (d.hourKey === hk) return d.completed;
          if (d.subItems?.some(s => s.hourKey === hk)) {
            return d.subItems!.every(s => s.hourKey !== hk || s.completed);
          }
          return true;
        });
        newCompletedSlots[hk] = allDone;
      }

      return { ...room, documentation: newDocs, completedSlots: newCompletedSlots };
    }));
  }, []);

  const addRoom = useCallback(() => {
    setNewRoomNumber('');
    setShowAddRoomModal(true);
  }, []);

  const submitAddRoom = useCallback(() => {
    setRooms(prev => [...prev, {
      id: Date.now().toString(),
      roomNumber: newRoomNumber.trim(),
      hourlyData: {}, completedSlots: {}, intake: '', output: '',
      documentation: freshDocs(),
      notes: [],
    }]);
    setShowAddRoomModal(false);
  }, [newRoomNumber, freshDocs]);

  const removeRoom = useCallback((id: string) => {
    setRooms(rooms => rooms.filter(r => r.id !== id));
  }, []);

  const updateRoom = useCallback((id: string, updates: Partial<RoomData>) =>
    setRooms(rooms => rooms.map(r => r.id === id ? { ...r, ...updates } : r)), []);

  // Schedule / cancel native notification for a filled hourly slot
  const scheduleSlotNotif = useCallback(async (roomId: string, slotKey: string, roomNumber: string) => {
    if (notificationPermission !== 'granted') return;
    const slotDate = slotKeyToDate(slotKey, settings.shiftStartHour);
    if (slotDate <= new Date()) return; // Already past
    const id = slotNotifId(roomId, slotKey);
    await scheduleNativeAlert(id, '⏰ Hourly Check Due', `Room ${roomNumber || roomId} — check ${slotKey} observation`, slotDate);
    if (settings.hourlySlot30MinReminder) {
      const earlyDate = new Date(slotDate.getTime() - 30 * 60 * 1000);
      if (earlyDate > new Date()) {
        await scheduleNativeAlert(slotNotifId(roomId, slotKey + '_30'), '⏰ Upcoming Hourly', `Room ${roomNumber || roomId} — 30 min until ${slotKey}`, earlyDate);
      }
    }
  }, [notificationPermission, settings.shiftStartHour, settings.hourlySlot30MinReminder]);

  const cancelSlotNotif = useCallback(async (roomId: string, slotKey: string) => {
    await cancelNativeAlert(slotNotifId(roomId, slotKey));
    await cancelNativeAlert(slotNotifId(roomId, slotKey + '_30'));
  }, []);

  const updateHourlyData = useCallback(async (roomId: string, key: string, value: string) => {
    setRooms(rooms => {
      const room = rooms.find(r => r.id === roomId);
      if (value.trim()) {
        scheduleSlotNotif(roomId, key, room?.roomNumber ?? '');
      } else {
        cancelSlotNotif(roomId, key);
      }
      return rooms.map(r => r.id === roomId ? { ...r, hourlyData: { ...r.hourlyData, [key]: value } } : r);
    });
  }, [scheduleSlotNotif, cancelSlotNotif]);

  const toggleSlotComplete = useCallback((roomId: string, key: string) => {
    setRooms(rooms => rooms.map(r => {
      if (r.id !== roomId) return r;
      const nowComplete = !r.completedSlots[key];
      if (nowComplete) cancelSlotNotif(roomId, key);

      // Bidirectional sync: mirror completion state to any doc items linked to this slot
      const updatedDocs = r.documentation.map(doc => {
        if (doc.hourKey === key) return { ...doc, completed: nowComplete };
        if (doc.subItems) {
          return {
            ...doc,
            subItems: doc.subItems.map(s => s.hourKey === key ? { ...s, completed: nowComplete } : s),
          };
        }
        return doc;
      });

      return { ...r, completedSlots: { ...r.completedSlots, [key]: nowComplete }, documentation: updatedDocs };
    }));
  }, [cancelSlotNotif]);

  const addNote = useCallback((roomId: string, text: string, timeOverride?: string) => {
    const now = new Date();
    // If a HH:MM override is provided, use that hour for slot bucketing
    const h24 = timeOverride
      ? parseInt(timeOverride.split(':')[0])
      : now.getHours();
    const enteredAt = timeOverride
      ? (() => { const d = new Date(now); d.setHours(parseInt(timeOverride.split(':')[0]), parseInt(timeOverride.split(':')[1]), 0, 0); return d.toISOString(); })()
      : now.toISOString();
    const slot = HOURLY_SLOTS.find(s => {
      const isPM = s.key.endsWith('P');
      const h12 = parseInt(s.key);
      const slotH24 = isPM ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
      return slotH24 === h24;
    });
    const hourKey = slot?.key ?? `${h24}`;
    const note: ShiftNote = {
      id: Date.now().toString(),
      text,
      enteredAt,
      hourKey,
    };
    setRooms(rooms => rooms.map(r => {
      if (r.id !== roomId) return r;
      const updatedNotes = [...(r.notes || []), note];
      // If setting enabled, also append the note text to the hourly activity box
      if (settings.addNotesToHourlyActivities ?? true) {
        const existing = r.hourlyData[hourKey]?.trim() ?? '';
        const timeLabel = new Date(enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const newEntry = `${timeLabel}: ${text}`;
        const updatedHourlyData = {
          ...r.hourlyData,
          [hourKey]: existing ? `${existing}\n${newEntry}` : newEntry,
        };
        return { ...r, notes: updatedNotes, hourlyData: updatedHourlyData };
      }
      return { ...r, notes: updatedNotes };
    }));
  }, [HOURLY_SLOTS, settings.addNotesToHourlyActivities]);

  const openTimerModal = useCallback(() => {
    initAudioContext();
    setTimerLabel('');
    setTimerType('countdown');
    setCdMinutes('');
    setCdSeconds('');
    setShowUnnamedConfirm(false);
    setShowTimersMenu(false);
    setShowTimerModal(true);
  }, []);

  const submitTimer = useCallback(async (forceName?: string) => {
    const resolvedLabel = forceName ?? (timerLabel.trim() || '');
    if (!resolvedLabel && !showUnnamedConfirm) { setShowUnnamedConfirm(true); return; }
    const finalLabel = resolvedLabel || 'Unnamed Timer';
    const mins = parseInt(cdMinutes) || 0;
    const secVal = Math.min(59, parseInt(cdSeconds) || 0);
    const secs = timerType === 'countdown' ? mins * 60 + secVal : undefined;
    if (timerType === 'countdown' && (!secs || secs <= 0)) { toast.error('Set a duration > 0'); return; }
    const startTime = new Date();
    let nativeId: number | undefined;
    if (timerType === 'countdown' && secs && notificationPermission === 'granted') {
      nativeId = Math.floor(Math.random() * 2000000000);
      const firesAt = new Date(startTime.getTime() + secs * 1000);
      await scheduleNativeAlert(nativeId, `⏰ Timer Done`, finalLabel, firesAt);
    }
    setCustomTimers(prev => [...prev, {
      id: Date.now().toString(), label: finalLabel,
      startTime, type: timerType, targetSeconds: secs, alarmFired: false, nativeId,
    }]);
    setShowUnnamedConfirm(false);
    setShowTimerModal(false);
    toast.success(`Timer "${finalLabel}" started`);
  }, [timerLabel, timerType, cdMinutes, cdSeconds, notificationPermission, showUnnamedConfirm]);

  const removeTimer = useCallback((id: string) => {
    setCustomTimers(prev => {
      const timer = prev.find(t => t.id === id);
      if (timer?.nativeId) cancelNativeAlert(timer.nativeId);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const handleAlarmFire = useCallback((id: string, label: string) => {
    setCustomTimers(prev => prev.map(t => t.id === id ? { ...t, alarmFired: true } : t));
    fireAllNotifications('⏰ Timer Done', label, 'alarm', settings.notifications);
    if (settings.notifications.visual) {
      toast.error(`⏰ Timer done: ${label}`, { description: 'Countdown finished.', duration: Infinity });
    }
  }, [settings.notifications]);

  const clockOutForLunch = useCallback(async () => {
    if (lunchStartTime) {
      // Clock back in: cancel the lunch alarm
      await cancelNativeAlert(lunchNativeId);
      setLunchStartTime(null);
      toast.success('Clocked back in');
    } else {
      const mins = settings.lunchBreakMinutes ?? 30;
      const alarmAt = new Date(Date.now() + mins * 60 * 1000);
      if (notificationPermission === 'granted') {
        await scheduleNativeAlert(lunchNativeId, '🍽 Lunch Break Over', `Your ${mins}-minute lunch break has ended`, alarmAt);
      }
      setLunchStartTime(new Date());
      setShowTimersMenu(false);
      toast.success(`Clocked out for lunch — ${mins} min alarm set`);
    }
  }, [lunchStartTime, lunchNativeId, settings.lunchBreakMinutes, notificationPermission]);

  const openAlertModal = useCallback(() => {
    setAlertLabel('');
    setAlertDateTime(toDatetimeLocal(new Date(Date.now() + 5 * 60 * 1000)));
    setShowTimersMenu(false);
    setShowAlertModal(true);
  }, []);

  const submitAlert = useCallback(async () => {
    if (!alertLabel.trim()) { toast.error('Enter an alert name'); return; }
    if (!alertDateTime) { toast.error('Set an alert time'); return; }
    const scheduledTime = new Date(alertDateTime);
    if (scheduledTime <= new Date()) { toast.error('Alert time must be in the future'); return; }
    let perm = notificationPermission;
    if (perm !== 'granted') {
      perm = await requestNotificationPermission();
      setNotificationPermission(perm);
    }
    // Use a numeric ID for native notification (iOS requires int)
    const nativeId = Math.floor(Math.random() * 2000000000);
    // Pre-schedule with iOS so it fires even when app is backgrounded/locked
    if (perm === 'granted') {
      await scheduleNativeAlert(nativeId, `⏰ ${alertLabel.trim()}`, 'Scheduled alert', scheduledTime);
    }
    setScheduledAlerts(prev => [...prev, {
      id: Date.now().toString(), label: alertLabel.trim(), scheduledTime, fired: false, nativeId,
    }]);
    setShowAlertModal(false);
    toast.success(`Alert set for ${scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }, [alertLabel, alertDateTime, notificationPermission]);

  const removeAlert = useCallback((id: string) => {
    setScheduledAlerts(prev => {
      const alert = prev.find(a => a.id === id);
      if (alert?.nativeId) cancelNativeAlert(alert.nativeId);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  // Computed
  const { completedDocs, totalDocs } = rooms.reduce(
    (acc, room) => {
      room.documentation?.forEach(d => {
        acc.totalDocs++; if (d.completed) acc.completedDocs++;
        d.subItems?.forEach(s => { acc.totalDocs++; if (s.completed) acc.completedDocs++; });
      });
      return acc;
    },
    { completedDocs: 0, totalDocs: 0 },
  );

  const pendingAlerts = scheduledAlerts.filter(a => !a.fired);

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">

      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onSave={(s) => { setSettings(s); setShowSettingsModal(false); }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Add Timer Modal */}
      {showTimerModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Timer className="w-5 h-5 text-purple-600" /> Add Timer
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timer Name</label>
              <input autoFocus type="text" value={timerLabel} onChange={e => setTimerLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitTimer()}
                placeholder="e.g. IV antibiotic, Wound check"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Timer Type</label>
              <div className="flex gap-2">
                {(['countup', 'countdown'] as const).map(t => (
                  <button key={t} onClick={() => setTimerType(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${timerType === t ? t === 'countup' ? 'bg-purple-500 text-white border-purple-500' : 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                    {t === 'countup' ? '▶ Count Up' : '⏳ Count Down'}
                  </button>
                ))}
              </div>
            </div>
            {timerType === 'countdown' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Minutes</label>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      placeholder="0"
                      value={cdMinutes}
                      onChange={e => { const v = e.target.value.replace(/\D/g, ''); setCdMinutes(v); }}
                      onFocus={e => e.target.select()}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <span className="pb-2 font-bold text-gray-400 text-2xl">:</span>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Seconds</label>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      placeholder="00"
                      value={cdSeconds}
                      onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setCdSeconds(v); }}
                      onFocus={e => e.target.select()}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                </div>
              </div>
            )}
            {showUnnamedConfirm && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                No name entered. Continue as <strong>"Unnamed Timer"</strong>?
                <div className="flex gap-2 mt-2">
                  <button onClick={() => submitTimer('Unnamed Timer')}
                    className="flex-1 bg-yellow-500 text-white py-1.5 rounded-lg text-sm font-semibold hover:bg-yellow-600">Yes, continue</button>
                  <button onClick={() => setShowUnnamedConfirm(false)}
                    className="flex-1 border border-gray-300 text-gray-600 py-1.5 rounded-lg text-sm hover:bg-gray-50">Add a name</button>
                </div>
              </div>
            )}
            {!showUnnamedConfirm && (
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowTimerModal(false); setShowUnnamedConfirm(false); }}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={() => submitTimer()}
                  className={`flex-1 text-white py-2 rounded-lg text-sm font-semibold ${timerType === 'countdown' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-500 hover:bg-purple-600'}`}>
                  Start Timer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <AlarmClock className="w-5 h-5 text-indigo-600" /> Schedule Alert
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alert Name</label>
              <input autoFocus type="text" value={alertLabel} onChange={e => setAlertLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitAlert()}
                placeholder="e.g. Check BP, Med due, Follow-up"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alert Date & Time</label>
              <input type="datetime-local" value={alertDateTime} onChange={e => setAlertDateTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <p className="text-xs text-gray-400">Fires browser popup, alarm sound, vibration, and visual alert based on your settings.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAlertModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={submitAlert}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold">
                Set Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {showAddRoomModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Add Room</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={newRoomNumber}
                onChange={e => setNewRoomNumber(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitAddRoom(); if (e.key === 'Escape') setShowAddRoomModal(false); }}
                placeholder="e.g. 401, 402B"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAddRoomModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={submitAddRoom}
                className="flex-1 bg-indigo-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-600">
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header — safe-area-inset-top + extra breathing room below iOS status bar */}
      <div className="bg-white border-b border-gray-200 px-3 sticky top-0 z-10 shadow-sm"
        style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 20px)' }}>
        <div className="pb-2 space-y-2">

          {/* Top row: logo + actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-indigo-100 p-1.5 rounded-lg flex items-center justify-center w-8 h-8 flex-shrink-0">
                <img src="/logo.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden') }} />
                <Clock className="w-4 h-4 text-indigo-600 hidden" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold font-heading text-gray-800 leading-tight truncate">Medical Shift Tracker</h1>
                {shiftStarted && startTime && (
                  <p className="text-[11px] text-gray-400">
                    Started {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setShowSettingsModal(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors" title="Settings">
                <Settings className="w-5 h-5" />
              </button>

              {shiftStarted && (
                <>
                  <div className="relative">
                    <button onClick={() => setShowTimersMenu(m => !m)}
                      className="flex items-center gap-1 bg-purple-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-purple-600 transition-all text-xs font-medium">
                      <Timer className="w-3.5 h-3.5" /> <ChevronDown className="w-3 h-3" />
                    </button>
                    {showTimersMenu && (
                      <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg py-2 w-52 z-20">
                        <button onClick={openTimerModal}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm">
                          <Plus className="w-4 h-4 text-purple-500" /> Add Timer
                        </button>
                        <button onClick={openAlertModal}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm">
                          <AlarmClock className="w-4 h-4 text-indigo-500" /> Schedule Alert
                        </button>
                        <hr className="my-1 border-gray-100" />
                        <button onClick={clockOutForLunch}
                          className={`w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm ${lunchStartTime ? 'text-orange-600 font-semibold' : ''}`}>
                          <Clock className="w-4 h-4" />
                          {lunchStartTime ? 'Clock In from Lunch' : 'Clock Out for Lunch'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={endShift}
                    className="bg-red-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-600 transition-all text-xs font-medium">
                    End Shift
                  </button>
                </>
              )}
              {!shiftStarted && (
                <button onClick={startShift}
                  className="bg-indigo-500 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-600 transition-all font-semibold text-sm">
                  Start Shift
                </button>
              )}
            </div>
          </div>

          {/* Stats row (only when shift active) */}
          {shiftStarted && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <Stat label="Duration" value={elapsedTime} color="indigo" />
              <Stat label="Docs" value={`${completedDocs}/${totalDocs}`} color="green" />
              {lunchStartTime && <Stat label="Lunch left" value={lunchElapsed} color="orange" />}
              {pendingAlerts.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 px-2.5 py-1.5 rounded-lg flex-shrink-0">
                  <p className="text-[10px] text-gray-500 leading-tight">Alerts</p>
                  <p className="text-base font-bold text-yellow-600 leading-tight">{pendingAlerts.length}</p>
                </div>
              )}
              {customTimers.map(t => (
                <TimerDisplay key={t.id} timer={t} onRemove={removeTimer} onAlarmFire={handleAlarmFire} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showTimersMenu && <div className="fixed inset-0 z-0" onClick={() => setShowTimersMenu(false)} />}

      {/* Main Content */}
      {shiftStarted && (
        <div className="max-w-[1800px] mx-auto px-3 sm:px-6 py-4 space-y-4">

          {scheduledAlerts.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <AlarmClock className="w-4 h-4 text-indigo-500" /> Scheduled Alerts
              </h2>
              <div className="flex flex-wrap gap-3">
                {scheduledAlerts.map(a => (
                  <div key={a.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${a.fired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-indigo-50 border-indigo-200'}`}>
                    <div>
                      <p className={`font-medium ${a.fired ? 'text-gray-400 line-through' : 'text-indigo-800'}`}>{a.label}</p>
                      <p className="text-xs text-gray-500">
                        {a.scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {a.fired ? ' · Fired' : ''}
                      </p>
                    </div>
                    <button onClick={() => removeAlert(a.id)} className="text-gray-300 hover:text-red-400 ml-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={openAlertModal}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-400 hover:border-indigo-500 hover:text-indigo-600 text-sm transition-colors">
                  <Plus className="w-4 h-4" /> Add Alert
                </button>
              </div>
            </div>
          )}

          {/* Rooms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Patient Rooms</h2>
              <button onClick={addRoom}
                className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-all">
                <Plus className="w-4 h-4" /> Add Room
              </button>
            </div>
            <div className="space-y-3">
              {rooms.map(room => (
                <RoomPanel
                  key={room.id}
                  room={room}
                  hourlySlots={HOURLY_SLOTS}
                  shiftStartHour={settings.shiftStartHour}
                  onToggleDoc={toggleDoc}
                  onUpdateRoom={updateRoom}
                  onUpdateHourlyData={updateHourlyData}
                  onToggleSlotComplete={toggleSlotComplete}
                  onRemoveRoom={removeRoom}
                  onAddNote={addNote}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer - No Shift */}
      {!shiftStarted && (
        <footer className="mt-20 py-8 text-center border-t border-gray-200">
          <p className="text-sm text-gray-500">Click "Start Shift" to begin your shift tracking</p>
        </footer>
      )}
    </div>
  );
}
