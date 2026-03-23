import { useState, useEffect } from 'react';
import { X, Plus, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';

export interface DocumentationItem {
  id: string;
  label: string;
  completed: boolean;
  subItems?: DocumentationItem[];
}

export interface RoomData {
  id: string;
  roomNumber: string;
  hourlyData: { [key: string]: string };
  completedSlots: { [key: string]: boolean };
  intake: string;
  output: string;
  documentation: DocumentationItem[];
}

interface RoomPanelProps {
  room: RoomData;
  hourlySlots: Array<{ key: string; label: string }>;
  onToggleDoc: (roomId: string, docId: string, parentId?: string) => void;
  onUpdateRoom: (id: string, updates: Partial<RoomData>) => void;
  onUpdateHourlyData: (roomId: string, key: string, value: string) => void;
  onRemoveRoom: (id: string) => void;
  canRemoveRoom: boolean;
}

function getChartingCounts(docs: DocumentationItem[]): { done: number; total: number } {
  let done = 0, total = 0;
  docs.forEach(d => {
    total++; if (d.completed) done++;
    d.subItems?.forEach(s => { total++; if (s.completed) done++; });
  });
  return { done, total };
}

// Only slots that have text AND are not marked complete
function getPendingSlots(
  hourlySlots: Array<{ key: string; label: string }>,
  hourlyData: { [key: string]: string },
  completedSlots: { [key: string]: boolean }
): Array<{ key: string; label: string }> {
  return hourlySlots.filter(
    s => !!hourlyData[s.key]?.trim() && !completedSlots[s.key]
  );
}

export function RoomPanel({
  room,
  hourlySlots,
  onToggleDoc,
  onUpdateRoom,
  onUpdateHourlyData,
  onRemoveRoom,
  canRemoveRoom,
}: RoomPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');

  const completedSlots = room.completedSlots ?? {};

  const toggleSlotComplete = (key: string) => {
    onUpdateRoom(room.id, {
      completedSlots: {
        ...completedSlots,
        [key]: !completedSlots[key],
      },
    });
  };

  const { done, total } = getChartingCounts(room.documentation);
  const chartingPercent = total === 0 ? 0 : Math.round((done / total) * 100);
  const pendingSlots = getPendingSlots(hourlySlots, room.hourlyData, completedSlots);

  const handleQuickAddSubmit = () => {
    if (!quickAddText.trim()) return;
    const newDoc: DocumentationItem = {
      id: `custom-${Date.now()}`,
      label: quickAddText.trim(),
      completed: false,
    };
    onUpdateRoom(room.id, { documentation: [...room.documentation, newDoc] });
    setQuickAddText('');
    setShowQuickAdd(false);
  };

  const chartBarColor =
    chartingPercent === 100 ? 'bg-green-500' :
    chartingPercent >= 50 ? 'bg-indigo-500' : 'bg-orange-400';

  const hasPending = pendingSlots.length > 0;
  const cardBorder = hasPending ? 'border-orange-300' : 'border-gray-200';
  const cardHeaderBg = hasPending ? 'bg-orange-50' : 'bg-white';

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden ${cardBorder}`}>

        {/* ── Collapsed Header ──────────────────────────────────────────── */}
        <CollapsibleTrigger asChild>
          <div className={`flex items-center gap-3 p-3 cursor-pointer transition-colors select-none ${cardHeaderBg} hover:brightness-95 active:brightness-90`}>

            {/* Room badge */}
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-white border border-gray-200 shadow-sm flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-gray-400 uppercase leading-none">Rm</span>
              <span className="text-base font-black text-gray-800 leading-tight">
                {room.roomNumber || '—'}
              </span>
            </div>

            {/* Info columns */}
            <div className="flex-1 min-w-0 space-y-1.5">

              {/* Pending hourly slots */}
              {hasPending ? (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {pendingSlots.length} PENDING
                  </span>
                  <span className="text-xs font-semibold text-orange-700 truncate">
                    {pendingSlots.map(s => s.label).join(', ')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-green-600">Hourly on track</span>
                </div>
              )}

              {/* I/O tally */}
              {(room.intake.trim() || room.output.trim()) && (
                <div className="flex items-center gap-3 text-[11px] text-gray-500">
                  {room.intake.trim() && (
                    <span><span className="font-bold text-blue-500">I:</span> {room.intake.trim()}</span>
                  )}
                  {room.output.trim() && (
                    <span><span className="font-bold text-purple-500">O:</span> {room.output.trim()}</span>
                  )}
                </div>
              )}

              {/* Charting progress */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${chartBarColor}`}
                    style={{ width: `${chartingPercent}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold whitespace-nowrap ${chartingPercent === 100 ? 'text-green-600' : 'text-gray-400'}`}>
                  {done}/{total} charted
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowQuickAdd(prev => !prev); }}
                className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center transition-colors"
                title="Quick add task"
              >
                <Plus className="w-4 h-4" />
              </button>
              {canRemoveRoom && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveRoom(room.id); }}
                  className="w-8 h-8 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-400 flex items-center justify-center transition-colors"
                  title="Remove room"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>

        {/* ── Quick Add ─────────────────────────────────────────────────── */}
        {showQuickAdd && (
          <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={quickAddText}
                onChange={e => setQuickAddText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleQuickAddSubmit();
                  if (e.key === 'Escape') setShowQuickAdd(false);
                }}
                placeholder="New task name..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button onClick={handleQuickAddSubmit} className="px-3 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-lg hover:bg-indigo-600">Add</button>
              <button onClick={() => { setShowQuickAdd(false); setQuickAddText(''); }} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-lg">✕</button>
            </div>
          </div>
        )}

        {/* ── Expanded Content ──────────────────────────────────────────── */}
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

            {/* Hourly Observations — tap-to-complete */}
            <div className="px-4 pb-4 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Hourly Observations</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {hourlySlots.map(slot => {
                  const isComplete = !!completedSlots[slot.key];
                  const hasText = !!room.hourlyData[slot.key]?.trim();

                  return (
                    <div key={slot.key} className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-gray-500 text-center">{slot.label}</label>
                      <input
                        type="text"
                        value={room.hourlyData[slot.key] ?? ''}
                        onChange={e => onUpdateHourlyData(room.id, slot.key, e.target.value)}
                        placeholder="—"
                        disabled={isComplete}
                        className={`text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center transition-colors ${
                          isComplete
                            ? 'border-green-200 bg-green-50 text-green-600 line-through cursor-not-allowed'
                            : hasText
                              ? 'border-orange-300 bg-orange-50'
                              : 'border-gray-200'
                        }`}
                      />
                      {/* Tap to complete — only show if there's text */}
                      {hasText && (
                        <button
                          onClick={() => toggleSlotComplete(slot.key)}
                          className={`flex items-center justify-center gap-1 text-[9px] font-bold py-0.5 rounded transition-colors ${
                            isComplete
                              ? 'text-green-500 hover:text-gray-400'
                              : 'text-orange-500 hover:text-green-500'
                          }`}
                        >
                          {isComplete
                            ? <><CheckCircle2 className="w-3 h-3" /> Done</>
                            : <><Circle className="w-3 h-3" /> Mark done</>
                          }
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
                      <input
                        type="checkbox"
                        checked={doc.completed}
                        onChange={() => onToggleDoc(room.id, doc.id)}
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 flex-shrink-0"
                      />
                      <span className={doc.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}>
                        {doc.label}
                      </span>
                    </label>
                    {doc.subItems && (
                      <div className="ml-7 border-l-2 border-gray-100 pl-2 space-y-0.5">
                        {doc.subItems.map(sub => (
                          <label key={sub.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-xs">
                            <input
                              type="checkbox"
                              checked={sub.completed}
                              onChange={() => onToggleDoc(room.id, sub.id, doc.id)}
                              className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 flex-shrink-0"
                            />
                            <span className={sub.completed ? 'text-gray-400 line-through' : 'text-gray-600'}>
                              {sub.label}
                            </span>
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
                  <textarea
                    value={room.intake}
                    onChange={e => onUpdateRoom(room.id, { intake: e.target.value })}
                    placeholder="e.g. 250 mL NS, 120 mL PO"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-purple-500 uppercase tracking-wide mb-2">Output</label>
                  <textarea
                    value={room.output}
                    onChange={e => onUpdateRoom(room.id, { output: e.target.value })}
                    placeholder="e.g. 200 mL urine, 50 mL drain"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              </div>
            </div>

          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
