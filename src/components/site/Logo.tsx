import { useId } from "react";

/**
 * Loadline mark: a load line (Plimsoll) disc, the ring-and-bar a ship wears to show
 * its maximum safe load, with a live mint status dot.
 */
export function LogoMark({ className = "h-6 w-6 shrink-0" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}g`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c4b5ff" />
          <stop offset="1" stopColor="#6c4bff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="10" fill="none" stroke={`url(#${id}g)`} strokeWidth="3" />
      <rect x="1.5" y="14.5" width="29" height="3" rx="1.5" fill={`url(#${id}g)`} />
      <circle cx="24.6" cy="7.6" r="2.7" fill="#3cffc2" />
    </svg>
  );
}

/** Mark plus wordmark. */
export function LogoLockup({ className = "", markClassName = "h-6 w-6 shrink-0" }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span className="text-[1.15rem] font-semibold tracking-[-0.03em] text-text-primary">Loadline</span>
    </span>
  );
}
