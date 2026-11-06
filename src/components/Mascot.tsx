import { useId } from 'react';

interface MascotProps {
  size?: number;
  className?: string;
  withBook?: boolean;
}

export function Mascot({ size = 180, className, withBook = true }: MascotProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 200 180"
      className={className}
      role="img"
      aria-label="丘丘小鸟"
    >
      <defs>
        <linearGradient id={`body-${uid}`} x1="70" y1="40" x2="130" y2="150" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFEEBE" />
          <stop offset="1" stopColor="#F8DCA1" />
        </linearGradient>
        <linearGradient id={`wing-${uid}`} x1="50" y1="100" x2="150" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE8B1" />
          <stop offset="1" stopColor="#F4D090" />
        </linearGradient>
        <linearGradient id={`bow-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#F3B9C2" />
          <stop offset="1" stopColor="#E7A0AD" />
        </linearGradient>
      </defs>

      <ellipse cx="100" cy="162" rx="56" ry="9" fill="#8A6A58" opacity=".09" />

      <g className="mascot__sparkles">
        <path d="M38 58c1.6 5.6 3.8 7.8 9.4 9.4-5.6 1.6-7.8 3.8-9.4 9.4-1.6-5.6-3.8-7.8-9.4-9.4 5.6-1.6 7.8-3.8 9.4-9.4Z" fill="#EBC98A" opacity=".8" />
        <path d="M166 84c1.1 3.9 2.6 5.4 6.5 6.5-3.9 1.1-5.4 2.6-6.5 6.5-1.1-3.9-2.6-5.4-6.5-6.5 3.9-1.1 5.4-2.6 6.5-6.5Z" fill="#CFE5D6" />
        <circle cx="158" cy="46" r="3.4" fill="#EFC2C8" />
        <circle cx="48" cy="108" r="2.5" fill="#D9CEEF" />
      </g>

      <g className="mascot__body">
        <path d="M73 130c-12-4-19-14-18-26 1-13 11-20 22-18l11 43-15 1Z" fill={`url(#wing-${uid})`} />
        <path d="M127 130c12-4 19-14 18-26-1-13-11-20-22-18l-11 43 15 1Z" fill={`url(#wing-${uid})`} />
        <ellipse cx="100" cy="105" rx="55" ry="49" fill={`url(#body-${uid})`} />
        <path
          d="M100 32c-4.4 7.6-12.2 7.2-12.2 11.8 0 3.1 5 5.2 12.2 5.2s12.2-2.1 12.2-5.2c0-4.6-7.8-4.2-12.2-11.8Z"
          fill="#F0D2A0"
        />

        <g className="mascot__bow">
          <path d="M84 47c-7-8-17-8-18 0-1 7 8 11 18 6Z" fill={`url(#bow-${uid})`} />
          <path d="M116 47c7-8 17-8 18 0 1 7-8 11-18 6Z" fill={`url(#bow-${uid})`} />
          <circle cx="100" cy="49" r="5.5" fill="#E49AA7" />
        </g>

        <ellipse cx="78" cy="106" rx="7.5" ry="4.8" fill="#F4B7B7" opacity=".7" />
        <ellipse cx="122" cy="106" rx="7.5" ry="4.8" fill="#F4B7B7" opacity=".7" />

        <g className="mascot__face">
          <path d="M77 97c2.6 3 7.4 3 10 0" stroke="#6A5147" strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M113 97c2.6 3 7.4 3 10 0" stroke="#6A5147" strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M95 108c2.7 3.2 7.3 3.2 10 0" stroke="#6A5147" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>

        {withBook ? (
          <g className="mascot__book">
            <path d="M64 145c13-5 25-4 36 2 11-6 23-7 36-2l-4 14c-11-4-22-3-32 2-10-5-21-6-32-2l-4-14Z" fill="#D6EADD" />
            <path d="M100 147v14" stroke="#B9D8C6" strokeWidth="2" />
            <path d="M73 148c8-2.5 16-2 23 1.8M127 148c-8-2.5-16-2-23 1.8" stroke="#A9CBBA" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M84 57c-2 3.4-5.4 3.2-5.4 5.2 0 1.4 2.2 2.3 5.4 2.3s5.4-.9 5.4-2.3c0-2-3.4-1.8-5.4-5.2Z" fill="#F7F1E5" opacity=".001" />
          </g>
        ) : (
          <path d="M75 145c8 4 17 4 25 0M100 147c8 4 17 4 25 0" stroke="#E8C88F" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        )}
      </g>
    </svg>
  );
}

export function TinyMascot({ size = 34 }: { size?: number }) {
  return <Mascot size={size} withBook={false} className="tiny-mascot" />;
}
