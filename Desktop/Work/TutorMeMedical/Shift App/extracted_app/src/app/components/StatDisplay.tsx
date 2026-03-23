export function Stat({ label, value, color }: { label: string; value: string; color: 'indigo' | 'green' | 'orange' }) {
  const styles = {
    indigo: { bg: 'bg-indigo-50 border-indigo-100', text: 'text-indigo-600' },
    green: { bg: 'bg-green-50 border-green-100', text: 'text-green-600' },
    orange: { bg: 'bg-orange-50 border-orange-100', text: 'text-orange-600' },
  };
  const { bg, text } = styles[color];
  return (
    <div className={`${bg} border px-2.5 py-1.5 rounded-lg flex-shrink-0`}>
      <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
      <p className={`text-base font-bold ${text} leading-tight`}>{value}</p>
    </div>
  );
}
