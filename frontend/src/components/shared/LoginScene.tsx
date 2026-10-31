/**
 * "First light" scene for the SuryaOps sign-in page. Full-bleed.
 * Main sequence (about 8 s, plays once): night with lit houses, hills rise, a sun climbs from behind
 * the ridge, thin beams reach the rooftop panels, the panels switch on and the house lights go out.
 * After that (from about 9 s) the scene responds to the pointer:
 *   - hover a house: its panel brightens, the windows glow, a small "3 kW rooftop" label appears
 *   - hover the sun: it swells slightly
 * Colours are fixed hex values (deep teal night, pale gold sun, slate-green hills). Edit them freely.
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

const CSS = `
.ls-star{animation:ls-star 5.5s ease-in 1.4s both}
.ls-dawn{transform-box:fill-box;transform-origin:50% 100%;animation:ls-dawn 6.5s cubic-bezier(.25,.6,.3,1) 1.2s both}
.ls-glow{transform-box:fill-box;transform-origin:50% 100%;animation:ls-glow 6.5s ease-out 1.6s both}
.ls-up{animation:ls-up 1.7s cubic-bezier(.2,.7,.2,1) both}
.ls-sunup{animation:ls-sunup 5.2s cubic-bezier(.22,.6,.25,1) 1.8s both}
.ls-beam{stroke-dasharray:100;stroke-dashoffset:100;animation:ls-beam 1.5s ease-out both}
.ls-win{animation:ls-win 7s ease-in-out both}
.ls-pv{animation:ls-pv 2.2s ease-out both}
.ls-cloud{animation:ls-drift 90s linear infinite alternate}
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
@keyframes ls-beam{to{stroke-dashoffset:0}}
@keyframes ls-win{0%{opacity:0}14%{opacity:1}68%{opacity:1}100%{opacity:0}}
@keyframes ls-pv{from{fill:#1F3B3B}to{fill:#5C9A98}}
@keyframes ls-drift{from{transform:translateX(-70px)}to{transform:translateX(150px)}}
@media (prefers-reduced-motion:reduce){.login-scene *{animation-delay:0s!important;animation-iteration-count:1!important}}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function geo(h: House) {
  const ax = h.x + h.w / 2, ay = h.y - h.roof, ex = h.x + h.w + 6, ey = h.y;
  const s0 = [lerp(ax, ex, 0.15), lerp(ay, ey, 0.15)], s1 = [lerp(ax, ex, 0.85), lerp(ay, ey, 0.85)];
  return { ax, ay, ex, ey, panel: `${s0[0]},${s0[1]} ${s1[0]},${s1[1]} ${s1[0] - 2},${s1[1] + 9} ${s0[0] - 2},${s0[1] + 9}`,
    target: [(s0[0] + s1[0]) / 2 - 1, (s0[1] + s1[1]) / 2 + 4] };
}

function HouseShape({ h, i }: { h: House; i: number }) {
  const g = geo(h);
  const win = (fx: number) => (
    <g key={fx}>
      <rect className="ls-win" x={h.x + h.w * fx} y={h.y + h.h * 0.3} width={h.w * 0.2} height={h.h * 0.22} rx="1.5" fill="#F0CB7E"
        style={{ animationDelay: `${0.5 + i * 0.35 + fx}s` }} />
      <rect className="ls-wh" x={h.x + h.w * fx} y={h.y + h.h * 0.3} width={h.w * 0.2} height={h.h * 0.22} rx="1.5" fill="#F0CB7E" />
    </g>
  );
  return (
    <g className="ls-house">
      <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="#0E2625" />
      <polygon points={`${h.x - 6},${h.y} ${g.ax},${g.ay} ${g.ex},${g.ey}`} fill="#0A1C1C" />
      {win(0.18)}{win(0.6)}
      <polygon className="ls-pv" points={g.panel} fill="#1F3B3B" style={{ animationDelay: `${6.3 + i * 0.3}s` }} />
      <polygon className="ls-ph" points={g.panel} fill="#BFE6DE" />
      <g className="ls-tip">
        <rect x={g.ax - 41} y={g.ay - 36} width="82" height="22" rx="11" fill="#0A1C1C" fillOpacity=".88" stroke="#F0CB7E" strokeOpacity=".45" />
        <text x={g.ax} y={g.ay - 21} textAnchor="middle" fontSize="12" fontWeight="500" fill="#F4E3B8">{h.kw} kW rooftop</text>
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
            <stop offset="0" stopColor="#09171D" /><stop offset="1" stopColor="#12303A" />
          </linearGradient>
          <linearGradient id="ls-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E9C98F" stopOpacity="0" />
            <stop offset="0.6" stopColor="#E3B97E" stopOpacity="0.3" />
            <stop offset="1" stopColor="#F1D9A8" stopOpacity="0.7" />
          </linearGradient>
          <radialGradient id="ls-halo">
            <stop offset="0" stopColor="#F2D49B" stopOpacity="0.55" /><stop offset="1" stopColor="#F2D49B" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ls-disc" cx="45%" cy="40%">
            <stop offset="0" stopColor="#FBEBC0" /><stop offset="1" stopColor="#EDC26A" />
          </radialGradient>
        </defs>

        <rect width="1000" height="720" fill="url(#ls-night)" />
        {STARS.map(([x, y, r], i) => <circle key={i} className="ls-star" cx={x} cy={y} r={r} fill="#DCE8E4" />)}

        <rect className="ls-dawn" x="0" y="170" width="1000" height="350" fill="url(#ls-band)" />
        <ellipse className="ls-glow" cx="700" cy="470" rx="420" ry="170" fill="url(#ls-halo)" />

        <g opacity=".12" fill="#CFDCD8">
          <g className="ls-cloud"><ellipse cx="260" cy="190" rx="120" ry="12" /><ellipse cx="330" cy="178" rx="70" ry="10" /></g>
          <g className="ls-cloud" style={{ animationDuration: "120s" }}><ellipse cx="540" cy="130" rx="110" ry="10" /></g>
        </g>

        {/* the sun rises from behind the far ridge */}
        <g className="ls-sunup">
          <g className="ls-sunhover">
            <circle cx={SUN.x} cy={SUN.y} r="120" fill="url(#ls-halo)" style={{ pointerEvents: "none" }} />
            <circle cx={SUN.x} cy={SUN.y} r={SUN.r + 12} fill="none" stroke="#F3D48E" strokeOpacity=".3" style={{ pointerEvents: "none" }} />
            <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="url(#ls-disc)" />
          </g>
        </g>

        <path className="ls-up" style={{ animationDelay: ".2s" }} fill="#1D3E3D" d="M0 450C120 420 260 440 400 452S700 420 1000 440V720H0Z" />
        <path className="ls-up" style={{ animationDelay: ".55s" }} fill="#14302F" d="M0 500C150 470 300 490 460 500S780 470 1000 485V720H0Z" />

        {/* beams from the sun to each rooftop array */}
        <g stroke="#F3D48E" strokeOpacity=".28" strokeWidth="1.2" fill="none" style={{ pointerEvents: "none" }}>
          {HOUSES.map((h, i) => {
            const t = geo(h).target;
            return <line key={i} className="ls-beam" pathLength={100} x1={SUN.x} y1={SUN.y + SUN.r} x2={t[0]} y2={t[1]} style={{ animationDelay: `${5 + i * 0.3}s` }} />;
          })}
        </g>

        <g className="ls-up" style={{ animationDelay: ".9s" }}>{HOUSES.map((h, i) => <HouseShape key={i} h={h} i={i} />)}</g>
        <path className="ls-up" style={{ animationDelay: ".8s", pointerEvents: "none" }} fill="#0A1B1B" d="M0 560C200 535 380 548 520 545S840 530 1000 548V720H0Z" />
      </svg>
    </>
  );
}