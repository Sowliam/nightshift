import React from 'react';

interface PingIndicatorProps {
  ping?: number | null;
  className?: string;
  showLabel?: boolean;
}

export const PingIndicator: React.FC<PingIndicatorProps> = ({
  ping,
  className = '',
  showLabel = false,
}) => {
  let colorClass = 'bg-zinc-500';
  let qualityText = 'در حال اندازه‌گیری...';

  if (typeof ping === 'number' && ping > 0) {
    if (ping < 150) {
      colorClass = 'bg-[#23a55a] shadow-[0_0_8px_rgba(35,165,90,0.6)]';
      qualityText = 'عالی';
    } else if (ping <= 350) {
      colorClass = 'bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.6)]';
      qualityText = 'متوسط';
    } else {
      colorClass = 'bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse';
      qualityText = 'پینگ بالا / ضعیف';
    }
  }

  const tooltip = typeof ping === 'number' && ping > 0 ? `${ping} ms (${qualityText})` : qualityText;

  return (
    <div
      className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}
      title={tooltip}
      aria-label={`Ping: ${tooltip}`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-help ${colorClass}`}
      />
      {showLabel && typeof ping === 'number' && ping > 0 && (
        <span className="text-[10px] font-mono text-text-muted select-none">
          {ping}ms
        </span>
      )}
    </div>
  );
};
