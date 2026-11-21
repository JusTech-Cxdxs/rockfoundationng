import type { SVGProps } from 'react';

/** The footer's social-link icons, as inline SVG. */
type IconProps = SVGProps<SVGSVGElement>;

export function FacebookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} {...props}>
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H16.7V3.7C16.4 3.66 15.4 3.6 14.2 3.6c-2.4 0-4 1.46-4 4.15V9.9H7.5V13h2.7v8Z" />
    </svg>
  );
}

export function LinkedInIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} {...props}>
      <path d="M6.94 8.5H3.56V20.4h3.38ZM5.25 3.6a1.96 1.96 0 1 0 0 3.92 1.96 1.96 0 0 0 0-3.92ZM20.4 20.4h-3.37v-5.9c0-1.4-.03-3.2-1.95-3.2-1.96 0-2.26 1.53-2.26 3.1v6h-3.37V8.5h3.24v1.63h.05c.45-.86 1.56-1.77 3.2-1.77 3.43 0 4.06 2.26 4.06 5.2Z" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} {...props}>
      <path d="M13.9 10.4 21 3h-2.2l-6.1 6.4L7.9 3H3l7.4 10.1L3 21h2.2l6.5-6.9L17 21h4.9Z" />
    </svg>
  );
}

export function YouTubeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} {...props}>
      <path d="M21.6 7.4a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.5a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12a28 28 0 0 0 .4 4.6 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.6ZM10 15.2V8.8L15.5 12Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
