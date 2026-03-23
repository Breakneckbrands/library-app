import { useState } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Progress } from './ui/progress';

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

function getChartingPercent(docs: DocumentationItem[]): number {
  let done = 0, total = 0;
  docs.forEach(d => {
    total++; if (d.completed) done++;
    d.subItems?.forEach(s => { total++; if (s.completed) done++; });
  });
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function getNextPendingTask(docs: DocumentationItem[]): string | null {
  for (const d of docs) {
    if (!d.completed) return d.label;
    if (d.subItems) {
      for (const s of d.subItems) {
        if (!s.completed) return `${d.label} → ${s.label}`;
      }
    }
  }
  return null;
}

function getCompletedCount(docs: DocumentationItem[]): { done: number; total: number } {
  let done = 0, total = 0;
  docs.forEach(d => {
    total++; if (d.completed) done++;
    d.subItems?.forEach(s => { total++; if (s.completed) done++; });
  });
  return { done, total };
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

  const chartingPercent = getChartingPercent(room.documentation);
  const nextTask = getNextPendingTask(room.documentation);
  const { done, total } = getCompletedCount(room.documentation);

  const handleQuickAddSubmit = () => {
    if (!quickAddText.trim()) return;
    const newDoc: DocumentationItem = {
      id: `custom-${Date.now()}`,
      label: quickAddText.trim(),
      completed: false,
    };
    onUpdateRoom(room.id, {
      documentation: [...room.documentation, newDoc],
    });
    setQuickAddText('');
    setShowQuickAdd(false);
  };

  const progressColor = chartingPercent === 100
    ? 'bg-green-500'
    : chartingPercent >= 50
      ? 'bg-indigo-500'
      : 'bg-orange-500';

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* ── Collapsed Header (always visible) ─────────────────────────── */}
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors select-none">

            {/* Room badge */}
            <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-indigo-50 border border-indigo-200 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-indigo-400 uppercase leading-none">Room</span>
              <span className="text-lg font-black text-indigo-700 leading-tight">
                {room.roomNumber || '—'}
              </span>
            </div>

            {/* Progress info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                    style={{ width: `${chartingPercent}%` }}
                  />
                </div>
                <span className={`text-xs font-bold whitespace-nowrap ${
                  chartingPercent === 100 ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {done}/{total}
                </span>
              </div>
              {nextTask ? (
                <p className="text-xs text-gray-400 truncate">
                  Next: <span className="text-gray-600 font-medium">{nextTask}</span>
                </p>
              ) : (
                <p className="text-xs text-green-500 font-semibold">All tasks complete</p>
              )}
            </div>

            {/* Quick-add button */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowQuickAdd(prev => !prev); }}
              className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 flex items-center justify-center transition-colors"
              title="Quick add task"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Remove button */}
            {canRemoveRoom && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveRoom(room.id); }}
                className="flex-shrink-0 w-9 h-9 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors"
                title="Remove room"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Expand chevron */}
            <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>

        {/* ── Quick Add Inline (outside collapsible content) ────────────── */}
        {showQuickAdd && (
          <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 pt-3">
              <input
                autoFocus
                type="text"
                value={quickAddText}
                onChange={e => setQuickAddText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickAddSubmit(); if (e.key === 'Escape') setShowQuickAdd(false); }}
                placeholder="New task name..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={handleQuickAddSubmit}
                className="px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setShowQuickAdd(false); setQuickAddText(''); }}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Expanded Content ──────────────────────────────────────────── */}
        <CollapsibleContent>
          <div className="border-t border-gray-100">

            {/* Room Number Input */}
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

            {/* Documentation Checklist */}
            <div className="px-4 pb-4">
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

            {/* Hourly Observations */}
            <div className="px-4 pb-4 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Hourly Observations</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {hourlySlots.map(slot => (
                  <div key={slot.key} className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-500 mb-1 text-center">{slot.label}</label>
                    <input
                      type="text"
                      value={room.hourlyData[slot.key] ?? ''}
                      onChange={e => onUpdateHourlyData(room.id, slot.key, e.target.value)}
                      placeholder="—"
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Intake / Output */}
            <div className="px-4 pb-4 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Intake</label>
                  <textarea
                    value={room.intake}
                    onChange={e => onUpdateRoom(room.id, { intake: e.target.value })}
                    placeholder="Record intake..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Output</label>
                  <textarea
                    value={room.output}
                    onChange={e => onUpdateRoom(room.id, { output: e.target.value })}
                    placeholder="Record output..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
