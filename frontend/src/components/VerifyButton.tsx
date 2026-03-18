import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

type State = 'idle' | 'verifying' | 'verified' | 'failed';

interface VerifyButtonProps {
  pieceCid: string;
  onVerify: (pieceCid: string) => Promise<boolean>;
  initialState?: 'verified' | 'pending' | 'failed';
}

export function VerifyButton({ pieceCid, onVerify, initialState }: VerifyButtonProps) {
  const [state, setState] = useState<State>(
    initialState === 'verified' ? 'verified' : 'idle'
  );
  const [showRipple, setShowRipple] = useState(false);

  const handleClick = async () => {
    if (state !== 'idle') return;
    setState('verifying');
    try {
      const ok = await onVerify(pieceCid);
      if (ok) {
        setState('verified');
        setShowRipple(true);
        setTimeout(() => setShowRipple(false), 900);
      } else {
        setState('failed');
      }
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 92, height: 32 }}>

      {/* Ripple ring */}
      <AnimatePresence>
        {showRipple && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 2.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ background: 'rgba(34,197,94,0.25)', borderRadius: 999 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* Idle */}
        {state === 'idle' && (
          <motion.button
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18 }}
            onClick={handleClick}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{
              border: '1px solid rgba(0,229,255,0.30)',
              color: 'var(--cyan)',
              background: 'rgba(0,229,255,0.06)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            whileHover={{ background: 'rgba(0,229,255,0.14)', borderColor: 'rgba(0,229,255,0.55)' }}
            whileTap={{ scale: 0.95 }}
          >
            Verify PDP
          </motion.button>
        )}

        {/* Verifying — spinning arc */}
        {state === 'verifying' && (
          <motion.div
            key="verifying"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center"
            style={{ width: 28, height: 28 }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '2px solid rgba(0,229,255,0.15)',
                borderTopColor: 'var(--cyan)',
                animation: 'spin-arc 0.75s linear infinite',
              }}
            />
          </motion.div>
        )}

        {/* Verified — green check with bloom */}
        {state === 'verified' && (
          <motion.div
            key="verified"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.35)',
              color: 'var(--green)',
            }}
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 600 }}
            >
              ✓
            </motion.span>
            Verified
          </motion.div>
        )}

        {/* Failed */}
        {state === 'failed' && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.30)',
              color: 'var(--red)',
            }}
          >
            ✗ Failed
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
