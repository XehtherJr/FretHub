import { SVGProps } from 'react';

type IconName = 'search' | 'play' | 'sound' | 'mute' | 'menu' | 'close' | 'arrow' | 'sliders';

/** Small, consistent interface icons; labels belong on their parent controls. */
export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {name === 'search' && <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4 4" /></>}
      {name === 'play' && <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />}
      {name === 'sound' && <><path d="M4 10v4h3l4 3V7l-4 3H4z" /><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" /></>}
      {name === 'mute' && <><path d="M4 10v4h3l4 3V7l-4 3H4z" /><path d="m16 9 4 6m0-6-4 6" /></>}
      {name === 'menu' && <><path d="M4 8h16M4 16h16" /></>}
      {name === 'close' && <path d="M6 6l12 12M18 6 6 18" />}
      {name === 'arrow' && <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>}
      {name === 'sliders' && <><path d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>}
    </svg>
  );
}
