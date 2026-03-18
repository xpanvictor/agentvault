import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  to: number;
  duration?: number;
  className?: string;
  suffix?: string;
}

export function CountUp({ to, duration = 1200, className = '', suffix = '' }: CountUpProps) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (to === 0) { setValue(0); return; }

    const animate = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      // ease out expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.floor(eased * to));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };

    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {value.toLocaleString()}{suffix}
    </span>
  );
}
