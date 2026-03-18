import { useEffect, useState } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;       // ms per character
  delay?: number;       // initial delay ms
  className?: string;
  cursor?: boolean;
}

export function TypewriterText({
  text,
  speed = 22,
  delay = 0,
  className = '',
  cursor = true,
}: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, speed, delay]);

  return (
    <span className={`font-mono ${className}`}>
      {displayed}
      {cursor && !done && (
        <span
          className="inline-block w-[2px] h-[1em] ml-[1px] align-middle"
          style={{
            background: 'var(--cyan)',
            animation: 'breathe 0.8s ease-in-out infinite',
          }}
        />
      )}
    </span>
  );
}
