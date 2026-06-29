"use client";

function isUrl(value?: string | null): boolean {
  return !!value && /^https?:\/\//i.test(value);
}

export function Logo({
  value,
  alt,
  size = 28,
  fallback = "⚽",
  className = "",
}: {
  value?: string | null;
  alt: string;
  size?: number;
  fallback?: string;
  className?: string;
}) {
  if (isUrl(value)) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white/5 overflow-hidden shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value!}
          alt={alt}
          width={size}
          height={size}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) parent.textContent = fallback;
          }}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(14, size * 0.75) }}
      aria-label={alt}
    >
      {value || fallback}
    </span>
  );
}
