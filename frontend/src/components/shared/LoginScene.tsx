/**
 * "First light" scene for the Rayora sign-in page. Full-bleed.
 * Timeline (plays once, about 13 s):
 *   0 to 5 s    deep blue night, lit houses, hills rise, a golden sun climbs from behind the ridge
 *   5 to 10 s   a short orange sunrise glow while the sun's rays fade in and the beams reach the panels
 *   6 to 13 s   the whole scene turns to DAY, gradually: bright warm sky, green hills, sunlit houses, white clouds
 * From about 9 s the scene responds to the pointer:
 *   - hover a house: its panel brightens, the windows glow, a small "3 kW rooftop" label appears
 *   - hover the sun: it swells slightly
 * Every "night" layer has a matching "day" layer (class ls-day) that fades in on top of it.
 * Change the day look by editing the day colours below, and the timing in .ls-day.
 */
type House = { x: number; y: number; w: number; h: number; roof: number; kw: number };
const HOUSES: House[] = [
  { x: 470, y: 470, w: 70, h: 80, roof: 34, kw: 2 },
  { x: 610, y: 455, w: 90, h: 95, roof: 40, kw: 3 },
  { x: 770, y: 480, w: 64, h: 70, roof: 30, kw: 3 },
  { x: 880, y: 462, w: 76, h: 88, roof: 34, kw: 5 },
];
const SUN = { x: 700, y: 250, r: 30 };
const STARS: [number, number, number][] = [
  [80, 60, 1.6], [190, 120, 1.2], [300, 50, 1.8], [420, 150, 1.2], [520, 70, 1.5], [640, 110, 1.2],
  [760, 40, 1.8], [880, 95, 1.4], [950, 170, 1.2], [140, 210, 1.3], [360, 230, 1.1], [700, 200, 1.2],
];

/** 16 rounded rays around the sun, long and short alternating. */
const RAYS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const r1 = SUN.r + 12, r2 = SUN.r + (i % 2 === 0 ? 40 : 28);
  return { x1: SUN.x + Math.cos(a) * r1, y1: SUN.y + Math.sin(a) * r1, x2: SUN.x + Math.cos(a) * r2, y2: SUN.y + Math.sin(a) * r2 };
});

const CSS = `
.ls-star{animation:ls-star 5.5s ease-in 1.4s both}
.ls-dawn{transform-box:fill-box;transform-origin:50% 100%;animation:ls-dawn 6.5s cubic-bezier(.25,.6,.3,1) 1.2s both}
.ls-glow{transform-box:fill-box;transform-origin:50% 100%;animation:ls-glow 6.5s ease-out 1.6s both}
.ls-up{animation:ls-up 1.7s cubic-bezier(.2,.7,.2,1) both}
.ls-sunup{animation:ls-sunup 5.2s cubic-bezier(.22,.6,.25,1) 1.8s both}
.ls-rays{animation:ls-rays 2.4s ease-out 5.6s both}
.ls-spin{transform-box:fill-box;transform-origin:50% 50%;animation:ls-spin 90s linear infinite}
.ls-pulse{transform-box:fill-box;transform-origin:50% 50%;animation:ls-pulse 5s ease-in-out 8s infinite}
.ls-beam{stroke-dasharray:100;stroke-dashoffset:100;animation:ls-beam 1.5s ease-out both}
.ls-win{animation:ls-win 7s ease-in-out both}
.ls-pv{animation:ls-pv 2.2s ease-out both}
.ls-cloud{animation:ls-drift 90s linear infinite alternate}
/* sunrise glow: orange rises, then melts into daylight */
.ls-sky{animation:ls-sky 5.5s ease-in-out 5s both}
/* daylight: every day layer fades in slowly on top of its night twin */
.ls-day{animation:ls-day 7s ease-in-out 6s both}
/* brand text at the top-left turns dark so it stays readable on the bright sky */
.ls-ink{animation:ls-ink 7s ease-in-out 6s both}
.ls-ink2{animation:ls-ink2 7s ease-in-out 6s both}
/* hover layer: switched on after the intro so it never fights the animation */
.ls-house,.ls-sunhover{pointer-events:none;animation:ls-on 0s 9s forwards}
.ls-sunhover{transform-box:fill-box;transform-origin:50% 50%;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.ls-sunhover:hover{transform:scale(1.08)}
.ls-wh,.ls-ph{opacity:0;transition:opacity .35s ease}
.ls-house:hover .ls-wh{opacity:.95}
.ls-house:hover .ls-ph{opacity:.6}
.ls-tip{opacity:0;transform:translateY(5px);transition:opacity .3s ease,transform .3s ease;pointer-events:none}
.ls-house:hover .ls-tip{opacity:1;transform:none}
@keyframes ls-on{to{pointer-events:auto}}
@keyframes ls-star{from{opacity:.85}to{opacity:0}}
@keyframes ls-dawn{from{transform:scaleY(.12);opacity:0}to{transform:scaleY(1);opacity:1}}
@keyframes ls-glow{from{transform:scale(.35);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ls-up{from{transform:translateY(110px);opacity:0}to{transform:none;opacity:1}}
@keyframes ls-sunup{from{transform:translateY(240px);opacity:0}12%{opacity:1}to{transform:none;opacity:1}}
@keyframes ls-rays{from{opacity:0}to{opacity:1}}
@keyframes ls-spin{to{transform:rotate(360deg)}}
@keyframes ls-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes ls-beam{to{stroke-dashoffset:0}}
@keyframes ls-win{0%{opacity:0}14%{opacity:1}68%{opacity:1}100%{opacity:0}}
@keyframes ls-pv{from{fill:#1C3A5E}to{fill:#3F7CB5}}
@keyframes ls-drift{from{transform:translateX(-70px)}to{transform:translateX(150px)}}
@keyframes ls-sky{0%{opacity:0}40%{opacity:1}100%{opacity:0}}
@keyframes ls-day{from{opacity:0}to{opacity:1}}
@keyframes ls-ink{to{color:#283618}}
@keyframes ls-ink2{to{color:#4B5B2A}}
@media (prefers-reduced-motion:reduce){.login-scene *{animation-delay:0s!important;animation-iteration-count:1!important}.ls-ink,.ls-ink2{animation-delay:0s!important}}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function geo(h: House) {
  const ax = h.x + h.w / 2, ay = h.y - h.roof, ex = h.x + h.w + 6, ey = h.y;
  const s0 = [lerp(ax, ex, 0.15), lerp(ay, ey, 0.15)], s1 = [lerp(ax, ex, 0.85), lerp(ay, ey, 0.85)];
  return { ax, ay, ex, ey, panel: `${s0[0]},${s0[1]} ${s1[0]},${s1[1]} ${s1[0] - 2},${s1[1] + 9} ${s0[0] - 2},${s0[1] + 9}`,
    target: [(s0[0] + s1[0]) / 2 - 1, (s0[1] + s1[1]) / 2 + 4] };
}

function HouseShape({ h, i }: { h: House; i: number }) {
  const g = geo(h);
  const roofPts = `${h.x - 6},${h.y} ${g.ax},${g.ay} ${g.ex},${g.ey}`;
  const wy = h.y + h.h * 0.3, ww = h.w * 0.2, wh = h.h * 0.22;
  const win = (fx: number) => (
    <g key={fx}>
      <rect className="ls-win" x={h.x + h.w * fx} y={wy} width={ww} height={wh} rx="1.5" fill="#F6CF7A"
        style={{ animationDelay: `${0.5 + i * 0.35 + fx}s` }} />
      <rect className="ls-wh" x={h.x + h.w * fx} y={wy} width={ww} height={wh} rx="1.5" fill="#F6CF7A" />
      {/* daytime glass */}
      <rect className="ls-day" x={h.x + h.w * fx} y={wy} width={ww} height={wh} rx="1.5" fill="#6E5A34" fillOpacity=".45" />
    </g>
  );
  return (
    <g className="ls-house">
      {/* night body and roof, then sunlit body and roof fading in on top */}
      <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="#0C1F38" />
      <polygon points={roofPts} fill="#071426" />
      <rect className="ls-day" x={h.x} y={h.y} width={h.w} height={h.h} fill="#F5E9C9" />
      <polygon className="ls-day" points={roofPts} fill="#B0642F" />
      {win(0.18)}{win(0.6)}
      <polygon className="ls-pv" points={g.panel} fill="#1C3A5E" style={{ animationDelay: `${6.3 + i * 0.3}s` }} />
      <polygon className="ls-ph" points={g.panel} fill="#FFF1B8" />
      <g className="ls-tip">
        <rect x={g.ax - 41} y={g.ay - 36} width="82" height="22" rx="11" fill="#071426" fillOpacity=".88" stroke="#F6CF7A" strokeOpacity=".5" />
        <text x={g.ax} y={g.ay - 21} textAnchor="middle" fontSize="12" fontWeight="500" fill="#FFF0C8">{h.kw} kW rooftop</text>
      </g>
    </g>
  );
}

export function LoginScene() {
  return (
    <>
      <style>{CSS}</style>
      <svg viewBox="0 0 1000 720" preserveAspectRatio="xMidYMax slice" className="login-scene absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="ls-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#06122A" /><stop offset="0.6" stopColor="#123A6B" /><stop offset="1" stopColor="#2A6AA8" />
          </linearGradient>
          <linearGradient id="ls-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8EC5F5" stopOpacity="0" />
            <stop offset="0.6" stopColor="#8EC5F5" stopOpacity="0.35" />
            <stop offset="1" stopColor="#CDE6FB" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="ls-orange" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF9A3C" stopOpacity="0" />
            <stop offset="0.45" stopColor="#FF8A3D" stopOpacity="0.28" />
            <stop offset="0.8" stopColor="#FFA24A" stopOpacity="0.7" />
            <stop offset="1" stopColor="#FFC27A" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="ls-orangehalo">
            <stop offset="0" stopColor="#FF9F43" stopOpacity="0.75" /><stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ls-daysky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF8E6" /><stop offset="0.6" stopColor="#FFEFC8" /><stop offset="1" stopColor="#FFDDA3" />
          </linearGradient>
          <radialGradient id="ls-dayhalo">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" /><stop offset="0.35" stopColor="#FFF3C4" stopOpacity="0.55" /><stop offset="1" stopColor="#FFE9A8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ls-halo">
            <stop offset="0" stopColor="#FFE7A3" stopOpacity="0.6" /><stop offset="1" stopColor="#FFE7A3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ls-disc" cx="42%" cy="38%">
            <stop offset="0" stopColor="#FFF6CF" /><stop offset="0.6" stopColor="#FFD35E" /><stop offset="1" stopColor="#F5A52E" />
          </radialGradient>
        </defs>

        {/* night sky */}
        <rect width="1000" height="720" fill="url(#ls-night)" />
        {STARS.map(([x, y, r], i) => <circle key={i} className="ls-star" cx={x} cy={y} r={r} fill="#DCE9F8" />)}
        <rect className="ls-dawn" x="0" y="170" width="1000" height="350" fill="url(#ls-band)" />
        <ellipse className="ls-glow" cx="700" cy="470" rx="420" ry="170" fill="url(#ls-halo)" />

        {/* sunrise glow: orange for a moment, then it melts into day */}
        <g className="ls-sky" style={{ pointerEvents: "none" }}>
          <rect x="0" y="0" width="1000" height="560" fill="url(#ls-orange)" />
          <ellipse cx="700" cy="430" rx="520" ry="260" fill="url(#ls-orangehalo)" />
        </g>

        {/* daylight sky: bright, warm and airy, fades in gradually */}
        <g className="ls-day" style={{ pointerEvents: "none" }}>
          <rect width="1000" height="720" fill="url(#ls-daysky)" />
          <ellipse cx={SUN.x} cy={SUN.y} rx="460" ry="340" fill="url(#ls-dayhalo)" />
        </g>

        {/* clouds: faint at night, bright white by day */}
        <g opacity=".14" fill="#DCEBFA">
          <g className="ls-cloud"><ellipse cx="260" cy="190" rx="120" ry="12" /><ellipse cx="330" cy="178" rx="70" ry="10" /></g>
          <g className="ls-cloud" style={{ animationDuration: "120s" }}><ellipse cx="540" cy="130" rx="110" ry="10" /></g>
        </g>
        <g opacity=".9" fill="#FFFFFF" style={{ pointerEvents: "none" }}>
          <g className="ls-day">
            <g className="ls-cloud"><ellipse cx="260" cy="190" rx="120" ry="16" /><ellipse cx="330" cy="174" rx="70" ry="14" /><ellipse cx="205" cy="180" rx="55" ry="11" /></g>
            <g className="ls-cloud" style={{ animationDuration: "120s" }}><ellipse cx="540" cy="130" rx="110" ry="14" /><ellipse cx="600" cy="118" rx="60" ry="12" /></g>
            <g className="ls-cloud" style={{ animationDuration: "150s" }}><ellipse cx="880" cy="215" rx="90" ry="12" /><ellipse cx="840" cy="203" rx="50" ry="10" /></g>
          </g>
        </g>

        {/* the sun rises from behind the far ridge: soft glow, turning rays, golden disc */}
        <g className="ls-sunup">
          <g className="ls-sunhover">
            <circle cx={SUN.x} cy={SUN.y} r="130" fill="url(#ls-halo)" style={{ pointerEvents: "none" }} />
            <g className="ls-rays" style={{ pointerEvents: "none" }}>
              <g className="ls-spin">
                <g className="ls-pulse" stroke="#F9B233" strokeWidth="3.4" strokeLinecap="round" strokeOpacity=".95">
                  {RAYS.map((r, i) => <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />)}
                </g>
              </g>
            </g>
            <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="url(#ls-disc)" />
          </g>
        </g>

        {/* hills: blue at night, green by day */}
        <g className="ls-up" style={{ animationDelay: ".2s" }}>
          <path fill="#1E4A78" d="M0 450C120 420 260 440 400 452S700 420 1000 440V720H0Z" />
          <path className="ls-day" fill="#A3B861" d="M0 450C120 420 260 440 400 452S700 420 1000 440V720H0Z" />
        </g>
        <g className="ls-up" style={{ animationDelay: ".55s" }}>
          <path fill="#153A60" d="M0 500C150 470 300 490 460 500S780 470 1000 485V720H0Z" />
          <path className="ls-day" fill="#7A9647" d="M0 500C150 470 300 490 460 500S780 470 1000 485V720H0Z" />
        </g>

        {/* beams from the sun to each rooftop array */}
        <g stroke="#F6B445" strokeOpacity=".4" strokeWidth="1.2" fill="none" style={{ pointerEvents: "none" }}>
          {HOUSES.map((h, i) => {
            const t = geo(h).target;
            return <line key={i} className="ls-beam" pathLength={100} x1={SUN.x} y1={SUN.y + SUN.r} x2={t[0]} y2={t[1]} style={{ animationDelay: `${5 + i * 0.3}s` }} />;
          })}
        </g>

        <g className="ls-up" style={{ animationDelay: ".9s" }}>{HOUSES.map((h, i) => <HouseShape key={i} h={h} i={i} />)}</g>

        {/* foreground: dark blue at night, deep green by day (keeps the white text readable) */}
        <g className="ls-up" style={{ animationDelay: ".8s", pointerEvents: "none" }}>
          <path fill="#081A30" d="M0 560C200 535 380 548 520 545S840 530 1000 548V720H0Z" />
          <path className="ls-day" fill="#3E5A26" d="M0 560C200 535 380 548 520 545S840 530 1000 548V720H0Z" />
        </g>
      </svg>
    </>
  );
}