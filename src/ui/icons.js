// Inline stroke-based SVG icons, 20px grid, no emoji/dingbats.

export const ICONS = {
  jointCoverage:
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="4" height="8" rx="1"></rect><rect x="8" y="5" width="4" height="12" rx="1"></rect><rect x="13" y="2" width="4" height="15" rx="1"></rect></svg>',
  fixedGuide:
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="10" r="2.4"></circle><path d="M8.4 10h9"></path></svg>',
  manualPair:
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h6"></path><path d="M11 14h6"></path><path d="M9 6l3 4-3 4"></path></svg>',
  singlePegrna:
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h9"></path><path d="M9 6l4 4-4 4"></path></svg>',
  paste:
    '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h6l4 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"></path><path d="M12 3v4h4"></path></svg>',
  upload:
    '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13V3"></path><path d="M6 7l4-4 4 4"></path><path d="M4 13v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"></path></svg>',
  gene:
    '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"></circle><path d="M3 10h14"></path><path d="M10 3a11 11 0 0 1 0 14 11 11 0 0 1 0-14Z"></path></svg>',
  arrowRight:
    '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12"></path><path d="M11 5l5 5-5 5"></path></svg>',
  arrowLeft:
    '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10H4"></path><path d="M9 5l-5 5 5 5"></path></svg>',
  shield:
    '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V5Z"></path><path d="M7 10l2 2 4-4"></path></svg>',
  chevronDown:
    '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"></path></svg>',
};

export function logoMarkSvg(size = 26) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 34 34" fill="none">
    <rect width="34" height="34" rx="9" fill="var(--accent)"></rect>
    <path d="M13 14 C13 11 18 11 18 9 C18 7 13 7 13 5" stroke="white" stroke-width="1.4" stroke-linecap="round" fill="none"></path>
    <path d="M18 14 C18 11 13 11 13 9 C13 7 18 7 18 5" stroke="white" stroke-width="1.4" stroke-linecap="round" fill="none"></path>
    <path d="M9 16.5 H23 L21.8 24.5 C21.5 26.2 20.2 27 18.6 27 H13.4 C11.8 27 10.5 26.2 10.2 24.5 Z" fill="white"></path>
    <path d="M23.3 18.7 C27 18.7 27 23.4 23 23.4" stroke="white" stroke-width="1.7" stroke-linecap="round" fill="none"></path>
    <rect x="7.5" y="28.5" width="19" height="1.8" rx="0.9" fill="white"></rect>
  </svg>`;
}
