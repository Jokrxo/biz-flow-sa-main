export default function StellaLumenLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#g)" />
      <path d="M12 5l1.6 3.7 4 .4-3 2.6.9 3.9-3.5-2-3.5 2 .9-3.9-3-2.6 4-.4L12 5z" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

