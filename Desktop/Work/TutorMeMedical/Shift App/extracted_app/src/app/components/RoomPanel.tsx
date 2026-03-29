import { useState, useRef } from 'react';
import { Plus, ChevronDown, CheckCircle2, Circle, Trash2, FileText, Clock, StickyNote } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';

export interface DocumentationItem {
  id: string;
  label: string;
  completed: boolean;
  subItems?: DocumentationItem[];
  /** Hourly slot key (e.g. "2P") — set when task is added with a time; used for bidirectional sync */
  hourKey?: string;
}

export interface ShiftNote {
  id: string;
  text: string;
  enteredAt: string; // ISO timestamp
  hourKey: string;   // slot key the note belongs to (e.g. "1P")
}

export interface RoomData {
  id: string;
  roomNumber: string;
  hourlyData: { [key: string]: string };
  completedSlots: { [key: string]: boolean };
  intake: string;
  output: string;
  documentation: DocumentationItem[];
  notes: ShiftNote[];
}

interface RoomPanelProps {
  room: RoomData;
  hourlySlots: Array<{ key: string; label: string }>;
  shiftStartHour: number;
  onToggleDoc: (roomId: string, docId: string, parentId?: string) => void;
  onUpdateRoom: (id: string, updates: Partial<RoomData>) => void;
  onUpdateHourlyData: (roomId: string, key: string, value: string) => void;
  onToggleSlotComplete: (roomId: string, key: string) => void;
  onRemoveRoom: (id: string) => void;
  onAddNote: (roomId: string, text: string, timeOverride?: string) => void;
}

// Convert slot key like "1P", "6A", "12P" → 24h hour
function slotKeyTo24h(key: string): number {
  const isPM = key.endsWith('P');
  const h12 = parseInt(key);
  return isPM ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
}

// Returns 'overdue' | 'current' | 'future' for a slot
function slotUrgency(key: string, shiftStartHour: number): 'overdue' | 'current' | 'future' {
  const slotH24 = slotKeyTo24h(key);
  const now = new Date();
  const currentH = now.getHours();

  // For night shifts (start ≥ 18), slots that wrap midnight (h24 < 12) are the next calendar day
  // from the perspective of time comparison, treat those as +24 h when shift is still in its first half
  let effectiveSlotH = slotH24;
  if (shiftStartHour >= 18 && slotH24 < 12) {
    // If current time is still in the night (≥ shiftStartHour), this slot is tomorrow → future
    if (currentH >= shiftStartHour) return 'future';
    effectiveSlotH = slotH24; // early morning, compare normally
  }

  if (effectiveSlotH < currentH) return 'overdue';
  if (effectiveSlotH === currentH) return 'current';
  return 'future';
}

function getChartingCounts(docs: DocumentationItem[]): { done: number; total: number } {
  let done = 0, total = 0;
  docs.forEach(d => {
    total++; if (d.completed) done++;
    d.subItems?.forEach(s => { total++; if (s.completed) done++; });
  });
  return { done, total };
}

function getPendingSlots(
  hourlySlots: Array<{ key: string; label: string }>,
  hourlyData: { [key: string]: string },
  completedSlots: { [key: string]: boolean }
): Array<{ key: string; label: string }> {
  return hourlySlots.filter(s => !!hourlyData[s.key]?.trim() && !completedSlots[s.key]);
}

// Most urgent colour of pending slots for the card border
function cardUrgencyColor(pendingSlots: Array<{ key: string }>, shiftStartHour: number) {
  if (pendingSlots.length === 0) return { border: 'border-gray-200', header: 'bg-white', badge: 'bg-green-500', badgeText: 'text-green-700', text: 'text-green-600' };
  const urgencies = pendingSlots.map(s => slotUrgency(s.key, shiftStartHour));
  if (urgencies.includes('overdue'))  return { border: 'border-red-300',    header: 'bg-red-50',    badge: 'bg-red-500',    badgeText: 'text-red-700',    text: 'text-red-600' };
  if (urgencies.includes('current'))  return { border: 'border-yellow-300', header: 'bg-yellow-50', badge: 'bg-yellow-500', badgeText: 'text-yellow-700', text: 'text-yellow-600' };
  return                                      { border: 'border-green-300',  header: 'bg-green-50',  badge: 'bg-green-500',  badgeText: 'text-green-700',  text: 'text-green-600' };
}

export function RoomPanel({
  room,
  hourlySlots,
  shiftStartHour,
  onToggleDoc,
  onUpdateRoom,
  onUpdateHourlyData,
  onToggleSlotComplete,
  onRemoveRoom,
  onAddNote,
}: RoomPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Collapsed quick-add task (with optional time)
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddTime, setQuickAddTime] = useState('');

  // Collapsed quick-note
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');

  // Expanded note input
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Swipe-to-delete
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeRevealed, setSwipeRevealed] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) * 1.5) { // horizontal swipe
      if (dx < -60) setSwipeRevealed(true);
      if (dx > 40)  setSwipeRevealed(false);
    }
  };

  const nowTimeStr = () => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  };

  const completedSlots = room.completedSlots ?? {};
  const notes = room.notes ?? [];

  const { done, total } = getChartingCounts(room.documentation);
  const chartingPercent = total === 0 ? 0 : Math.round((done / total) * 100);
  const pendingSlots = getPendingSlots(hourlySlots, room.hourlyData, completedSlots);
  const colors = cardUrgencyColor(pendingSlots, shiftStartHour);

  // Sort pending slots by urgency (overdue first, then current, then future) for display
  const sortedPending = [...pendingSlots].sort((a, b) => {
    const order = { overdue: 0, current: 1, future: 2 };
    return order[slotUrgency(a.key, shiftStartHour)] - order[slotUrgency(b.key, shiftStartHour)];
  });
  const nextSlot = sortedPending[0];
  const nextSlotText = nextSlot ? room.hourlyData[nextSlot.key]?.trim() : null;
  const hasPending = pendingSlots.length > 0;

  const chartBarColor =
    chartingPercent === 100 ? 'bg-green-500' :
    chartingPercent >= 50  ? 'bg-indigo-500' : 'bg-orange-400';

  const handleQuickAddSubmit = () => {
    if (!quickAddText.trim()) return;
    const label = quickAddText.trim();
    const timeStr = quickAddTime;

    // Compute the hourly slot key from the time, for bidirectional sync
    let taskHourKey: string | undefined;
    if (timeStr) {
      const h24 = parseInt(timeStr.split(':')[0]);
      const slot = hourlySlots.find(s => {
        const isPM = s.key.endsWith('P');
        const h12 = parseInt(s.key);
        const slotH24 = isPM ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
        return slotH24 === h24;
      });
      taskHourKey = slot?.key;
    }

    const newDoc = {
      id: `custom-${Date.now()}`,
      label: timeStr ? `${label} @ ${timeStr}` : label,
      completed: false,
      hourKey: taskHourKey,
    };
    // If the linked slot is already marked done, reset it — the new task is independent
    const slotReset = taskHourKey && room.completedSlots?.[taskHourKey]
      ? { completedSlots: { ...room.completedSlots, [taskHourKey]: false } }
      : {};
    onUpdateRoom(room.id, { documentation: [...room.documentation, newDoc], ...slotReset });
    // If a time was set, also log it as a timestamped note in the right hourly slot
    if (timeStr) {
      onAddNote(room.id, `[Task added] ${label}`, timeStr);
    }
    setQuickAddText(''); setQuickAddTime(''); setShowQuickAdd(false);
  };

  const handleQuickNoteSubmit = () => {
    if (!quickNoteText.trim()) return;
    onAddNote(room.id, quickNoteText.trim());
    setQuickNoteText(''); setShowQuickNote(false);
  };

  const handleNoteSubmit = () => {
    if (!noteText.trim()) return;
    onAddNote(room.id, noteText.trim());
    setNoteText(''); setShowNoteInput(false);
  };

  // Group notes by hour slot for display
  const notesBySlot: Record<string, ShiftNote[]> = {};
  notes.forEach(n => {
    if (!notesBySlot[n.hourKey]) notesBySlot[n.hourKey] = [];
    notesBySlot[n.hourKey].push(n);
  });

  return (
    <Collapsible open={isExpanded} onOpenChange={(open) => { setIsExpanded(open); if (!open) setSwipeRevealed(false); }}>
      <div className={`rounded-xl shadow-sm border-2 overflow-hidden ${colors.border}`}>

        {/* Swipe container */}
        <div className="relative overflow-hidden">
          {/* Delete button revealed by swipe */}
          <div
            className={`absolute right-0 top-0 bottom-0 w-20 bg-red-500 flex flex-col items-center justify-center gap-1 transition-all duration-200 ${swipeRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <button
              onClick={() => onRemoveRoom(room.id)}
              className="flex flex-col items-center gap-1 text-white"
            >
              <Trash2 className="w-5 h-5" />
              <span className="text-[10px] font-bold">Delete</span>
            </button>
          </div>

          {/* Card content (slides left on swipe) */}
          <div
            className={`transition-transform duration-200 bg-white ${swipeRevealed ? '-translate-x-20' : 'translate-x-0'}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* ── Collapsed Header ──────────────────────────────────── */}
            <CollapsibleTrigger asChild>
              <div
                className={`flex items-center gap-3 p-3 cursor-pointer select-none transition-colors ${colors.header} hover:brightness-95 active:brightness-90`}
                onClick={() => swipeRevealed && setSwipeRevealed(false)}
              >
                {/* Room badge */}
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase leading-none">Rm</span>
                  <span className="text-base font-black font-accent text-gray-800 leading-tight">
                    {room.roomNumber || '—'}
                  </span>
                </div>

                {/* Info columns */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {hasPending ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 ${colors.badge} text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0`}>
                          {pendingSlots.length} PENDING
                        </span>
                        <span className={`text-[10px] font-semibold ${colors.badgeText} truncate`}>
                          {sortedPending.map(s => s.label).join(', ')}
                        </span>
                      </div>
                      {nextSlotText && (
                        <p className={`text-xs ${colors.text} truncate leading-tight pl-0.5`}>
                          <span className="font-bold">{nextSlot!.label}:</span> {nextSlotText}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-green-600">Hourly on track</span>
                    </div>
                  )}

                  {(room.intake.trim() || room.output.trim()) && (
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      {room.intake.trim() && <span><span className="font-bold text-blue-500">I:</span> {room.intake.trim()}</span>}
                      {room.output.trim() && <span><span className="font-bold text-purple-500">O:</span> {room.output.trim()}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${chartBarColor}`} style={{ width: `${chartingPercent}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold whitespace-nowrap ${chartingPercent === 100 ? 'text-green-600' : 'text-gray-400'}`}>
                      {done}/{total} charted
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Quick note */}
                  <button
                    onClick={e => { e.stopPropagation(); setShowQuickNote(p => !p); setShowQuickAdd(false); }}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-teal-600 hover:border-teal-300 flex items-center justify-center transition-colors"
                    title="Add timestamped note"
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>
                  {/* Quick add task */}
                  <button
                    onClick={e => { e.stopPropagation(); setShowQuickAdd(p => !p); setShowQuickNote(false); }}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center transition-colors"
                    title="Quick add task"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CollapsibleTrigger>

            {/* ── Quick Note (collapsed) ─────────────────────────────── */}
            {showQuickNote && (
              <div className="px-3 pb-3 pt-2 border-t border-teal-100 bg-teal-50" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Note — auto-stamped to current time & slot
                </p>
                <div className="flex items-center gap-2">
                  <input autoFocus type="text" value={quickNoteText}
                    onChange={e => setQuickNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleQuickNoteSubmit(); if (e.key === 'Escape') setShowQuickNote(false); }}
                    placeholder="e.g. pt pulled out IV, MD notified..."
                    className="flex-1 border border-teal-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <button onClick={handleQuickNoteSubmit} className="px-3 py-2 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600">Save</button>
                  <button onClick={() => { setShowQuickNote(false); setQuickNoteText(''); }} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-lg">✕</button>
                </div>
              </div>
            )}

            {/* ── Quick Add Task (collapsed) ─────────────────────────── */}
            {showQuickAdd && (
              <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Add Task — optional time links it to the timeline
                </p>
                <div className="flex items-center gap-2">
                  <input autoFocus type="text" value={quickAddText}
                    onChange={e => setQuickAddText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleQuickAddSubmit(); if (e.key === 'Escape') setShowQuickAdd(false); }}
                    placeholder="Task name..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <input
                    type="time"
                    value={quickAddTime}
                    onChange={e => setQuickAddTime(e.target.value)}
                    onClick={e => { if (!quickAddTime) setQuickAddTime(nowTimeStr()); e.stopPropagation(); }}
                    placeholder="Time"
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-28 text-gray-600"
                  />
                  <button onClick={handleQuickAddSubmit} className="px-3 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-lg hover:bg-indigo-600">Add</button>
                  <button onClick={() => { setShowQuickAdd(false); setQuickAddText(''); setQuickAddTime(''); }} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-lg">✕</button>
                </div>
              </div>
            )}

            {/* ── Expanded Content ───────────────────────────────────── */}
            <CollapsibleContent>
              <div className="border-t border-gray-100 bg-white">

                {/* Room Number */}
                <div className="px-4 pt-4 pb-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Room Number</label>
                  <input
                    type="text"
                    value={room.roomNumber}
                    onChange={e => onUpdateRoom(room.id, { roomNumber: e.target.value })}
                    placeholder="e.g. 401, 402B"
                    className="w-full max-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                {/* Hourly Activities */}
                <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Hourly Activities</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {hourlySlots.map(slot => {
                      const isComplete = !!completedSlots[slot.key];
                      const hasText = !!room.hourlyData[slot.key]?.trim();
                      const urgency = hasText && !isComplete ? slotUrgency(slot.key, shiftStartHour) : null;

                      const inputColor = isComplete
                        ? 'border-green-200 bg-green-50 text-green-600 line-through cursor-not-allowed'
                        : urgency === 'overdue'  ? 'border-red-300 bg-red-50 text-red-700'
                        : urgency === 'current'  ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                        : urgency === 'future'   ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-gray-200';

                      const markColor = urgency === 'overdue'  ? 'text-red-500 hover:text-green-500'
                                      : urgency === 'current'  ? 'text-yellow-500 hover:text-green-500'
                                      : urgency === 'future'   ? 'text-green-500 hover:text-green-600'
                                      : 'text-green-500 hover:text-gray-400';

                      return (
                        <div key={slot.key} className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-gray-500 text-center">{slot.label}</label>
                          <textarea
                            rows={2}
                            value={room.hourlyData[slot.key] ?? ''}
                            onChange={e => onUpdateHourlyData(room.id, slot.key, e.target.value)}
                            placeholder="—"
                            disabled={isComplete}
                            className={`text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center resize-none w-full transition-colors ${inputColor}`}
                          />
                          {hasText && (
                            <button
                              onClick={() => onToggleSlotComplete(room.id, slot.key)}
                              className={`flex items-center justify-center gap-1 text-[9px] font-bold py-0.5 rounded transition-colors ${isComplete ? 'text-green-500 hover:text-gray-400' : markColor}`}
                            >
                              {isComplete
                                ? <><CheckCircle2 className="w-3 h-3" /> Done</>
                                : <><Circle className="w-3 h-3" /> Mark done</>}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Documentation Checklist */}
                <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Documentation Checklist</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {room.documentation.map(doc => (
                      <div key={doc.id}>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded text-sm">
                          <input type="checkbox" checked={doc.completed}
                            onChange={() => onToggleDoc(room.id, doc.id)}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 flex-shrink-0" />
                          <span className={doc.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}>{doc.label}</span>
                        </label>
                        {doc.subItems && (
                          <div className="ml-7 border-l-2 border-gray-100 pl-2 space-y-0.5">
                            {doc.subItems.map(sub => (
                              <label key={sub.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-xs">
                                <input type="checkbox" checked={sub.completed}
                                  onChange={() => onToggleDoc(room.id, sub.id, doc.id)}
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 flex-shrink-0" />
                                <span className={sub.completed ? 'text-gray-400 line-through' : 'text-gray-600'}>{sub.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Intake / Output */}
                <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-blue-500 uppercase tracking-wide mb-2">Intake</label>
                      <textarea value={room.intake}
                        onChange={e => onUpdateRoom(room.id, { intake: e.target.value })}
                        placeholder="e.g. 250 mL NS, 120 mL PO"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-purple-500 uppercase tracking-wide mb-2">Output</label>
                      <textarea value={room.output}
                        onChange={e => onUpdateRoom(room.id, { output: e.target.value })}
                        placeholder="e.g. 200 mL urine, 50 mL drain"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-purple-300" />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Notes
                    </h3>
                    <button
                      onClick={() => setShowNoteInput(p => !p)}
                      className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Note
                    </button>
                  </div>

                  {showNoteInput && (
                    <div className="mb-3 flex items-start gap-2">
                      <textarea
                        autoFocus
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNoteSubmit(); } if (e.key === 'Escape') setShowNoteInput(false); }}
                        placeholder="Enter note (Enter to save, Shift+Enter for new line)..."
                        rows={2}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <button onClick={handleNoteSubmit} className="px-3 py-1.5 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-600">Save</button>
                        <button onClick={() => { setShowNoteInput(false); setNoteText(''); }} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  )}

                  {Object.keys(notesBySlot).length === 0 && !showNoteInput && (
                    <p className="text-xs text-gray-400 italic">No notes yet for this room.</p>
                  )}

                  {/* Notes grouped by hourly slot */}
                  {hourlySlots.filter(s => notesBySlot[s.key]).map(slot => (
                    <div key={slot.key} className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase">{slot.label}</span>
                      </div>
                      <div className="space-y-1.5 ml-4 border-l-2 border-gray-100 pl-3">
                        {notesBySlot[slot.key].map(note => (
                          <div key={note.id} className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(note.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-sm text-gray-700">{note.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delete Room button at bottom of expanded card */}
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 flex justify-end">
                  <button
                    onClick={() => onRemoveRoom(room.id)}
                    className="flex items-center gap-2 text-sm font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Remove Room
                  </button>
                </div>

              </div>
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
  );
}
