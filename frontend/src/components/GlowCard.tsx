import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  holo?: boolean;
  delay?: number;
}

export function GlowCard({ children, className = '', holo = false, delay = 0 }: GlowCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
      className={`relative rounded-xl border transition-all duration-300 ${
        holo ? 'holo-border' : ''
      } ${className}`}
      style={{
        background: 'rgba(13,17,23,0.85)',
        borderColor: 'rgba(0,229,255,0.10)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.30)';
        (e.currentTarget as HTMLElement).style.boxShadow  = '0 0 28px rgba(0,229,255,0.12), 0 0 60px rgba(0,229,255,0.05)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.10)';
        (e.currentTarget as HTMLElement).style.boxShadow  = 'none';
      }}
    >
      {children}
    </motion.div>
  );
}
