"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

type HeartBurstProps = {
  visible: boolean;
  onDone: () => void;
};

/**
 * Animated heart that appears on double-tap like.
 * CSS animation only — no JS spring libraries.
 */
export default function HeartBurst({ visible, onDone }: HeartBurstProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setShow(true);
    const timer = setTimeout(() => {
      setShow(false);
      onDone();
    }, 900);
    return () => clearTimeout(timer);
  }, [visible, onDone]);

  if (!show) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      aria-hidden="true"
    >
      <Heart
        size={80}
        fill="#ef4444"
        stroke="#ef4444"
        strokeWidth={1}
        className="animate-heart-burst"
      />
      <style>{`
        @keyframes heart-burst {
          0% { opacity: 0; transform: scale(0.3); }
          15% { opacity: 1; transform: scale(1.2); }
          30% { transform: scale(0.95); }
          45% { transform: scale(1.05); }
          60% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.3); }
        }
        .animate-heart-burst {
          animation: heart-burst 0.9s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
