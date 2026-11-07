/**
 * Layers behind the Statistics page. Layer 1 is a fixed gradient. Layers 2 and 3 are decorative
 * shapes that drift with the scroll position through a CSS scroll-driven animation, so no script
 * runs while scrolling. Browsers without that feature, phones and reduced motion get a still page.
 */
export function Backdrop() {
  return (
    <div className="st-bg" aria-hidden="true">
      <div className="st-bg-base" />
      <div className="st-bg-grid" />
      <svg className="st-par st-par-slow" viewBox="0 0 1600 3000" preserveAspectRatio="xMidYMin slice">
        <path d="M-40 760 C 340 120, 760 120, 1180 700" className="st-curve" />
        <path d="M1680 1500 C 1300 980, 900 980, 520 1500" className="st-curve" />
        <path d="M-60 2460 C 380 1880, 820 1880, 1240 2380" className="st-curve" />
        <circle cx="1300" cy="360" r="210" className="st-disc" />
        <circle cx="240" cy="1840" r="260" className="st-disc" />
      </svg>
      <svg className="st-par st-par-fast" viewBox="0 0 1600 3000" preserveAspectRatio="xMidYMin slice">
        <path d="M1320 520 l150 150 l-150 150 l-150 -150 z" className="st-diamond" />
        <path d="M170 1320 l115 115 l-115 115 l-115 -115 z" className="st-diamond" />
        <path d="M1380 2240 l130 130 l-130 130 l-130 -130 z" className="st-diamond" />
        <g className="st-contour">
          <path d="M-20 1000 C 300 930, 560 1070, 900 1000 S 1400 930, 1640 1010" />
          <path d="M-20 1040 C 300 970, 560 1110, 900 1040 S 1400 970, 1640 1050" />
          <path d="M-20 1080 C 300 1010, 560 1150, 900 1080 S 1400 1010, 1640 1090" />
          <path d="M-20 2700 C 300 2630, 560 2770, 900 2700 S 1400 2630, 1640 2710" />
          <path d="M-20 2740 C 300 2670, 560 2810, 900 2740 S 1400 2670, 1640 2750" />
        </g>
      </svg>
    </div>
  );
}
