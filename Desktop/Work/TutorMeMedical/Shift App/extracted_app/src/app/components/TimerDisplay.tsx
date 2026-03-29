import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export interface CustomTimer {
  id: string;
  label: string;
  startTime: Date;
  type: 'countup' | 'countdown';
  targetSeconds?: number;
  alarmFired?: boolean;
  nativeId?: number;
}

interface TimerDisplayProps {
  timer: CustomTimer;
  onRemove: (id: string) => void;
  onAlarmFire: (id: string, label: string) => void;
}

export function TimerDisplay({ timer, onRemove, onAlarmFire }: TimerDisplayProps) {
  const [display, setDisplay] = useState('0:00');
  const [urgent, setUrgent] = useState(false);
  const [done, setDone] = useState(false);
  const firedRef = useRef(false);

  const handleAlarmFire = useCallback(() => {
    firedRef.current = true;
    onAlarmFire(timer.id, timer.label);
  }, [timer.id, timer.label, onAlarmFire]);

  useEffect(() => {
    const update = () => {
      const elapsed = Date.now() - timer.startTime.getTime();
      const fmt = (ms: number) => {
        const totalS = Math.floor(ms / 1000);
        const h = Math.floor(totalS / 3600);
        const m = Math.floor((totalS % 3600) / 60);
        const s = totalS % 60;
        const ss = String(s).padStart(2, '0');
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
        return `${m}:${ss}`; // No leading zero on the first unit
      };
      if (timer.type === 'countup') {
        setDisplay(fmt(elapsed));
      } else {
        const remaining = (timer.targetSeconds! * 1000) - elapsed;
        if (remaining <= 0) {
          setDisplay('0:00');
          setUrgent(true);
          setDone(true);
          if (!firedRef.current && !timer.alarmFired) {
            handleAlarmFire();
          }
        } else {
          setDisplay(fmt(remaining));
          setUrgent(remaining < 60000);
        }
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timer, handleAlarmFire]);

  const bg = done ? 'bg-red-100' : urgent ? 'bg-orange-100' : timer.type === 'countdown' ? 'bg-yellow-50' : 'bg-purple-50';
  const textColor = done ? 'text-red-600' : urgent ? 'text-orange-600' : timer.type === 'countdown' ? 'text-yellow-700' : 'text-purple-600';

  return (
    <div className={`${bg} px-4 py-2 rounded-lg flex items-center gap-2 group`}>
      <div>
        <p className="text-xs text-gray-600">
          {timer.label} {timer.type === 'countdown' ? '⏳' : '▶'}
        </p>
        <p className={`text-lg font-bold ${textColor} ${done ? 'animate-pulse' : ''}`}>{display}</p>
      </div>
      <button
        onClick={() => onRemove(timer.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all ml-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
