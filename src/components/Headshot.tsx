import { useState } from "react";

/** Player photo from ESPN, falling back to initials if it can't load. */
export function Headshot({ src, name, size, className }: { src: string | null | undefined; name: string; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (!src || broken)
    return (
      <span className={`headshot-fallback ${className ?? ""}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
        {initials}
      </span>
    );
  return <img className={className} src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}
