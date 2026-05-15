interface BrandMarkProps {
  showName?: boolean;
  className?: string;
  markClassName?: string;
  nameClassName?: string;
}

export function HandshakeMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-md bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 text-white shadow-sm ${className}`}>
      <svg viewBox="0 0 32 32" fill="none" className="h-2/3 w-2/3" aria-hidden="true">
        <path
          d="M4.8 17.8 9.6 13l4.3 4.3c1.1 1.1 2.8 1.1 3.9 0l.7-.7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m27.2 17.8-4.8-4.8-4.8 4.8c-.8.8-2.1.8-2.9 0l-.8-.8 4.1-4.1c1.2-1.2 3.1-1.2 4.3 0l1 .9"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m10.8 18.1 4.9 4.9c.7.7 1.9.7 2.6 0l3-3M14 21.4l1.2 1.2M18.2 20.2l1.4 1.4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M3.8 14.7 7.2 11M28.2 14.7 24.8 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function BrandMark({
  showName = true,
  className = '',
  markClassName = 'h-10 w-10',
  nameClassName = 'text-xl font-bold text-slate-950',
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <HandshakeMark className={markClassName} />
      {showName && <span className={nameClassName}>Samvaad</span>}
    </span>
  );
}
