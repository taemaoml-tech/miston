// Малюк вбудованих стікерів (машкотний кіт Miston) у форматі SVG.
const INK = '#25213A';
const WHITE = '#FFFFFF';

export const ANIMS = {
  bounce: '@keyframes miston{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}',
  wiggle: '@keyframes miston{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}',
  float: '@keyframes miston{0%,100%{transform:translateY(-7px)}50%{transform:translateY(7px)}}',
  pulse: '@keyframes miston{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}',
  spin: '@keyframes miston{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
  shake: '@keyframes miston{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}',
  heartbeat: '@keyframes miston{0%,100%{transform:scale(1)}15%{transform:scale(1.12)}30%{transform:scale(1)}45%{transform:scale(1.08)}}',
  swing: '@keyframes miston{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}',
  flash: '@keyframes miston{0%,100%{opacity:1}50%{opacity:0.45}}',
};

const n = (value) => Number(value.toFixed(2)).toString();

function starPath(cx, cy, diameter, points = 5, innerRatio = 0.45) {
  const outer = diameter / 2;
  const inner = outer * innerRatio;
  const parts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? outer : inner;
    parts.push(`${i === 0 ? 'M' : 'L'} ${n(cx + Math.cos(angle) * radius)} ${n(cy + Math.sin(angle) * radius)}`);
  }
  return `${parts.join(' ')} Z`;
}

function heartPath(fill = '#EF4444', stroke = INK) {
  return `<path d="M 0 7 C -12 -3 -5 -13 0 -3 C 5 -13 12 -3 0 7 Z" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>`;
}

function sparklePath(cx, cy, r) {
  return `M ${cx} ${n(cy - r)} Q ${cx + r * 0.22} ${n(cy - r * 0.22)} ${n(cx + r)} ${cy} Q ${cx + r * 0.22} ${n(cy + r * 0.22)} ${cx} ${n(cy + r)} Q ${cx - r * 0.22} ${n(cy + r * 0.22)} ${n(cx - r)} ${cy} Q ${cx - r * 0.22} ${n(cy - r * 0.22)} ${cx} ${n(cy - r)} Z`;
}

function eyeGlyph(kind, side) {
  const x = side === 'l' ? 128 : 192;
  const m = side === 'l' ? -1 : 1;
  switch (kind) {
    case 'happy': return `<path d="M ${x - 17} 162 q 17 -24 34 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'closed': return `<path d="M ${x - 17} 154 q 17 22 34 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'wide': return `<circle cx="${x}" cy="158" r="17" fill="${WHITE}" stroke="${INK}" stroke-width="6"/><circle cx="${x}" cy="160" r="8" fill="${INK}"/><circle cx="${n(x + 5 * m)}" cy="153" r="3.5" fill="${WHITE}"/>`;
    case 'dots': return `<circle cx="${x}" cy="158" r="7" fill="${INK}"/>`;
    case 'sleepy': return `<path d="M ${x - 16} 158 q 16 14 32 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'star': return `<path d="${starPath(x, 158, 40, 5)}" fill="#FACC15" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    case 'heart': return `<g transform="translate(${x} 158) scale(2.4)">${heartPath()}</g>`;
    case 'sparkle': return `<path d="${sparklePath(x, 158, 22)}" fill="${WHITE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    case 'swirl': return `<circle cx="${x}" cy="158" r="16" fill="${WHITE}" stroke="${INK}" stroke-width="5"/><path d="M ${x} 158 m 0 -10 a 10 10 0 1 1 -10 10" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    case 'laser': return `<path d="M ${x - 17} 148 l 34 10 -34 12 z" fill="#F97316" stroke="#B45309" stroke-width="4" stroke-linejoin="round"/>`;
    case 'side': return `<circle cx="${x}" cy="158" r="15" fill="${WHITE}" stroke="${INK}" stroke-width="6"/><circle cx="${n(x + 8 * m)}" cy="161" r="7" fill="${INK}"/>`;
    case 'flat': return `<path d="M ${x - 15} 158 h 30" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'wink': return side === 'l'
      ? `<path d="M ${x - 17} 162 q 17 -24 34 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`
      : `<path d="M ${x - 15} 158 h 30" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'cyclops': return side === 'l'
      ? `<circle cx="160" cy="156" r="24" fill="${WHITE}" stroke="${INK}" stroke-width="6"/><circle cx="160" cy="158" r="10" fill="${INK}"/>`
      : '';
    default: throw new Error(`Невідомий тип очей: ${kind}`);
  }
}

function browGlyph(kind, side) {
  if (kind === 'none') return '';
  const x = side === 'l' ? 128 : 192;
  switch (kind) {
    case 'angry': return side === 'l'
      ? `<path d="M 106 126 l 40 14" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`
      : `<path d="M 214 126 l -40 14" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'raised': return `<path d="M ${x - 17} 126 q 17 -14 34 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    case 'worried': return side === 'l'
      ? `<path d="M 108 132 q 18 -12 36 -4" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`
      : `<path d="M 212 128 q 18 -8 36 4" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    case 'flat': return `<path d="M ${x - 16} 128 h 32" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    default: throw new Error(`Невідомий тип брів: ${kind}`);
  }
}

function mouthGlyph(kind) {
  switch (kind) {
    case 'smile': return `<path d="M 138 200 q 22 24 44 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'grin': return `<path d="M 126 192 q 34 48 68 0 z" fill="${WHITE}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/><path d="M 140 196 q 6 12 4 22 M 160 198 v 24 M 180 196 q -6 12 -4 22" fill="none" stroke="${INK}" stroke-width="4"/>`;
    case 'bigsmile': return `<path d="M 124 192 q 36 56 72 0 z" fill="#8C3A46" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/><path d="M 146 226 q 14 14 28 -2 q -12 -8 -28 2 z" fill="#F472B6" stroke="${INK}" stroke-width="4"/>`;
    case 'flat': return `<path d="M 140 208 h 40" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'open': return `<ellipse cx="160" cy="208" rx="20" ry="17" fill="#8C3A46" stroke="${INK}" stroke-width="6"/>`;
    case 'pout': return `<circle cx="160" cy="206" r="11" fill="#8C3A46" stroke="${INK}" stroke-width="6"/>`;
    case 'tongue': return `<path d="M 132 198 q 28 36 56 0 z" fill="#8C3A46" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><path d="M 152 218 q 14 24 24 4 q -8 -14 -24 -10 z" fill="#F472B6" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    case 'catw': return `<path d="M 140 200 q 10 16 20 2 q 10 14 20 -2" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    case 'wavy': return `<path d="M 136 208 q 12 -12 24 0 q 12 12 24 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    case 'scream': return `<ellipse cx="160" cy="212" rx="26" ry="24" fill="#8C3A46" stroke="${INK}" stroke-width="7"/><ellipse cx="160" cy="226" rx="12" ry="8" fill="#F472B6"/>`;
    case 'fang': return `<path d="M 134 198 q 26 36 52 0 z" fill="#8C3A46" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><path d="M 146 202 l 6 13 6 -13 z M 170 202 l 6 13 6 -13 z" fill="${WHITE}"/>`;
    case 'bite': return `<path d="M 138 208 q 22 18 44 -2" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><rect x="148" y="196" width="24" height="14" rx="5" fill="${WHITE}" stroke="${INK}" stroke-width="4"/>`;
    default: throw new Error(`Невідомий тип рота: ${kind}`);
  }
}

function propGlyph(kind) {
  switch (kind) {
    case 'heart': return `<g transform="translate(240 96) rotate(-14) scale(3)">${heartPath()}</g><g transform="translate(74 236) rotate(12) scale(2)">${heartPath('#F87171')}</g>`;
    case 'hearts': return `<g transform="translate(232 92) scale(2.6)">${heartPath()}</g><g transform="translate(160 54) scale(1.8)">${heartPath('#FB7185')}</g><g transform="translate(90 96) scale(1.4)">${heartPath('#FDA4AF')}</g>`;
    case 'tears': return `<path d="M 118 178 q -12 34 2 48 q 14 -14 2 -48 z" fill="#38BDF8" stroke="#0EA5E9" stroke-width="4"/><path d="M 202 178 q 12 34 -2 48 q -14 -14 -2 -48 z" fill="#38BDF8" stroke="#0EA5E9" stroke-width="4"/>`;
    case 'waterfall': return `<path d="M 112 174 q -16 62 4 96 q 22 -36 4 -96 z" fill="#38BDF8" stroke="#0EA5E9" stroke-width="4"/><path d="M 208 174 q 16 62 -4 96 q -22 -36 -4 -96 z" fill="#38BDF8" stroke="#0EA5E9" stroke-width="4"/>`;
    case 'sweat': return `<path d="M 246 100 q 20 32 0 48 q -20 -16 0 -48 z" fill="#7DD3FC" stroke="#0284C7" stroke-width="5"/>`;
    case 'sparkles': return `<path d="${sparklePath(246, 92, 26)}" fill="#FDE047" stroke="#CA8A04" stroke-width="4"/><path d="${sparklePath(84, 120, 16)}" fill="#FDE047" stroke="#CA8A04" stroke-width="4"/><path d="${sparklePath(228, 224, 14)}" fill="#FFF" stroke="#CA8A04" stroke-width="4"/>`;
    case 'zzz': return `<text x="226" y="92" font-family="Verdana,sans-serif" font-size="34" font-weight="bold" fill="${INK}">z</text><text x="254" y="64" font-family="Verdana,sans-serif" font-size="26" font-weight="bold" fill="${INK}">z</text><text x="276" y="42" font-family="Verdana,sans-serif" font-size="18" font-weight="bold" fill="${INK}">z</text>`;
    case 'crown': return `<path d="M 106 66 l 18 22 36 -32 36 32 18 -22 8 42 h -124 z" fill="#FACC15" stroke="#B45309" stroke-width="5" stroke-linejoin="round"/>`;
    case 'halo': return `<ellipse cx="160" cy="50" rx="54" ry="14" fill="none" stroke="#FDE047" stroke-width="9"/>`;
    case 'headphones': return `<path d="M 62 158 a 98 98 0 0 1 196 0" fill="none" stroke="${INK}" stroke-width="12"/><rect x="36" y="146" width="34" height="54" rx="15" fill="#A78BFA" stroke="${INK}" stroke-width="6"/><rect x="250" y="146" width="34" height="54" rx="15" fill="#A78BFA" stroke="${INK}" stroke-width="6"/>`;
    case 'partyhat': return `<path d="M 160 20 l 46 76 h -92 z" fill="#F472B6" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><circle cx="160" cy="18" r="12" fill="#FACC15" stroke="${INK}" stroke-width="5"/>`;
    case 'snowflake': return `<g transform="translate(246 94)" stroke="#BAE6FD" stroke-width="8" stroke-linecap="round"><path d="M 0 -28 v 56"/><path d="M -24 -14 l 48 28"/><path d="M -24 14 l 48 -28"/></g>`;
    case 'fire': return `<path d="M 126 274 q 10 -36 34 -46 q -4 26 18 34 q 16 -10 14 -36 q 24 26 12 56 q -10 22 -40 22 q -34 -2 -38 -30 z" fill="#FB923C" stroke="#C2410C" stroke-width="5" stroke-linejoin="round"/>`;
    case 'bomb': return `<circle cx="248" cy="112" r="27" fill="#475569" stroke="${INK}" stroke-width="5"/><path d="M 248 84 q 12 -18 26 -12" fill="none" stroke="#B45309" stroke-width="6"/><circle cx="276" cy="70" r="8" fill="#FDBA74"/>`;
    case 'sword': return `<path d="M 56 254 l 88 -88 18 18 -88 88 z" fill="#CBD5E1" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M 138 156 l 26 26" stroke="#94A3B8" stroke-width="12" stroke-linecap="round"/>`;
    case 'wand': return `<path d="M 72 258 l 74 -74" stroke="#F59E0B" stroke-width="11" stroke-linecap="round"/><path d="${starPath(158, 74, 56, 5)}" fill="#FDE047" stroke="#B45309" stroke-width="5" stroke-linejoin="round"/>`;
    case 'cup': return `<rect x="214" y="196" width="68" height="58" rx="14" fill="${WHITE}" stroke="${INK}" stroke-width="6"/><path d="M 282 212 q 28 10 0 32" fill="none" stroke="${INK}" stroke-width="6"/><path d="M 234 186 q 8 -14 0 -28 M 258 186 q 8 -14 0 -28" fill="none" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/>`;
    case 'ball': return `<circle cx="248" cy="102" r="31" fill="#F87171" stroke="${INK}" stroke-width="6"/><path d="M 217 102 h 62 M 248 71 v 62" stroke="${INK}" stroke-width="5"/>`;
    case 'moon': return `<path d="M 252 62 a 36 36 0 1 0 0 66 a 28 28 0 1 1 0 -66 z" fill="#FEF08A" stroke="#CA8A04" stroke-width="5"/>`;
    case 'star': return `<path d="${starPath(246, 96, 72, 5)}" fill="#FACC15" stroke="#B45309" stroke-width="6" stroke-linejoin="round"/>`;
    case 'ghost': return `<path d="M 62 216 q -8 -74 44 -80 q 52 -6 44 80 v 20 q -12 -13 -24 0 q -12 -13 -24 0 q -12 -13 -24 0 z" fill="#E2E8F0" stroke="${INK}" stroke-width="5"/><circle cx="90" cy="176" r="7" fill="${INK}"/><circle cx="118" cy="176" r="7" fill="${INK}"/>`;
    case 'note': return `<path d="M 236 150 v -58 l 36 -12 v 58" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><ellipse cx="228" cy="154" rx="17" ry="13" fill="${INK}"/><ellipse cx="264" cy="144" rx="17" ry="13" fill="${INK}"/>`;
    case 'paw': return `<g fill="#F472B6" stroke="${INK}" stroke-width="4"><ellipse cx="246" cy="116" rx="14" ry="16"/><circle cx="226" cy="94" r="8"/><circle cx="246" cy="88" r="8"/><circle cx="266" cy="94" r="8"/></g>`;
    case 'skull': return `<path d="M 226 84 a 32 32 0 1 1 62 14 l -8 20 h -46 z" fill="#F1F5F9" stroke="${INK}" stroke-width="5"/><circle cx="244" cy="102" r="8" fill="${INK}"/><circle cx="268" cy="102" r="8" fill="${INK}"/>`;
    case 'bolt': return `<path d="M 250 58 l -32 58 h 24 l -8 48 42 -62 h -24 z" fill="#FDE047" stroke="#CA8A04" stroke-width="5" stroke-linejoin="round"/>`;
    case 'arrows': return `<path d="M 54 104 h 48 M 94 86 l 18 18 -18 18" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M 266 144 h -48 M 226 126 l -18 18 18 18" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`;
    case 'pills': return `<rect x="218" y="92" width="56" height="26" rx="13" transform="rotate(-18 246 105)" fill="#FCA5A5" stroke="${INK}" stroke-width="5"/><rect x="218" y="132" width="56" height="26" rx="13" transform="rotate(14 246 145)" fill="#BAE6FD" stroke="${INK}" stroke-width="5"/>`;
    case 'gift': return `<rect x="212" y="86" width="70" height="56" rx="10" fill="#F472B6" stroke="${INK}" stroke-width="5"/><path d="M 247 86 v 56 M 212 110 h 70" stroke="${INK}" stroke-width="5"/><path d="M 247 86 q -24 -24 -36 -6 M 247 86 q 24 -24 36 -6" fill="none" stroke="#FDE047" stroke-width="8"/>`;
    case 'book': return `<path d="M 206 92 h 78 v 56 h -78 z" fill="#93C5FD" stroke="${INK}" stroke-width="5"/><path d="M 245 92 v 56 M 206 92 q 39 -20 78 0" fill="none" stroke="${INK}" stroke-width="5"/>`;
    case 'xmark': return `<path d="M 234 74 l 44 44 M 278 74 l -44 44" stroke="#EF4444" stroke-width="13" stroke-linecap="round"/>`;
    case 'check': return `<path d="M 230 104 l 22 24 38 -46" fill="none" stroke="#22C55E" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'brokenheart': return `<g transform="translate(240 96) scale(2.8)">${heartPath('#EF4444')}</g><path d="M 240 82 l -8 16 12 6 -10 14" fill="none" stroke="${WHITE}" stroke-width="4"/>`;
    case 'music': return `<path d="M 214 160 v -60 l 56 -14 v 60" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><ellipse cx="206" cy="164" rx="16" ry="12" fill="${INK}"/><ellipse cx="262" cy="150" rx="16" ry="12" fill="${INK}"/><path d="M 232 82 q 18 -18 36 -6" fill="none" stroke="#A78BFA" stroke-width="6"/>`;
    case 'candy': return `<path d="M 232 108 a 20 20 0 1 1 40 0 a 20 20 0 1 1 -40 0 z" fill="#F472B6" stroke="${INK}" stroke-width="5"/><path d="M 232 108 l -20 -12 v 24 z M 272 108 l 20 -12 v 24 z" fill="#FDA4AF" stroke="${INK}" stroke-width="4"/>`;
    case 'trophy': return `<path d="M 138 250 h 44 l -6 -34 h -32 z" fill="#FACC15" stroke="#B45309" stroke-width="5"/><path d="M 128 216 h 64 v 22 h -64 z" fill="#FDE047" stroke="#B45309" stroke-width="5"/><path d="M 128 218 q -22 4 -12 22 M 192 218 q 22 4 12 22" fill="none" stroke="#B45309" stroke-width="5"/>`;
    default: throw new Error(`Невідомий реквізит: ${kind}`);
  }
}

function bodyGlyph(kind, hue) {
  if (kind === 'none') return '';
  if (kind === 'paws') {
    return `<ellipse cx="122" cy="272" rx="27" ry="19" fill="${hue}" stroke="${INK}" stroke-width="6"/><ellipse cx="198" cy="272" rx="27" ry="19" fill="${hue}" stroke="${INK}" stroke-width="6"/>`;
  }
  if (kind === 'sit') {
    return `<path d="M 92 244 q 68 46 136 0 q 14 46 -68 48 q -82 -2 -68 -48 z" fill="${hue}" stroke="${INK}" stroke-width="6"/>`;
  }
  if (kind === 'dance') {
    return `<path d="M 72 232 q -30 -22 -18 -52" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M 248 232 q 30 -22 18 -52" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><ellipse cx="126" cy="278" rx="25" ry="17" fill="${hue}" stroke="${INK}" stroke-width="6"/><ellipse cx="194" cy="278" rx="25" ry="17" fill="${hue}" stroke="${INK}" stroke-width="6"/>`;
  }
  if (kind === 'shrug') {
    return `<path d="M 66 224 q -24 8 -26 -20" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M 254 224 q 24 8 26 -20" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`;
  }
  throw new Error(`Невідома поза: ${kind}`);
}

export function stickerSvg(spec) {
  const hue = spec.hue || '#FDE68A';
  const anim = spec.anim && ANIMS[spec.anim] ? spec.anim : '';
  const eyes = spec.eyes;
  const inner = [
    spec.bg ? `<circle cx="160" cy="164" r="146" fill="${spec.bg}" opacity="0.32"/>` : '',
    bodyGlyph(spec.body || 'none', hue),
    `<g${spec.tilt ? ` transform="rotate(${spec.tilt} 160 170)"` : ''}>
      <path d="M 84 106 L 92 34 L 148 76 Z" fill="${hue}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M 236 106 L 228 34 L 172 76 Z" fill="${hue}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M 96 94 L 100 52 L 132 74 Z" fill="#F9A8D4" opacity="0.7"/>
      <path d="M 224 94 L 220 52 L 188 74 Z" fill="#F9A8D4" opacity="0.7"/>
      <rect x="58" y="78" width="204" height="184" rx="88" fill="${hue}" stroke="${INK}" stroke-width="8"/>
      ${browGlyph(spec.brows || 'none', 'l')}${browGlyph(spec.brows || 'none', 'r')}
      ${eyeGlyph(eyes, 'l')}${eyes === 'cyclops' ? '' : eyeGlyph(eyes === 'wink' ? 'wink' : eyes, 'r')}
      ${spec.blush ? `<ellipse cx="102" cy="198" rx="19" ry="12" fill="#FB7185" opacity="0.5"/><ellipse cx="218" cy="198" rx="19" ry="12" fill="#FB7185" opacity="0.5"/>` : ''}
      ${mouthGlyph(spec.mouth)}
    </g>`,
    spec.prop ? propGlyph(spec.prop) : '',
  ].join('');
  const style = anim
    ? `<style>${ANIMS[anim]}.m{animation:miston 1.4s ease-in-out infinite;transform-origin:160px 170px}@media (prefers-reduced-motion:reduce){.m{animation:none}}</style>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="${spec.label}">${style}${anim ? `<g class="m">${inner}</g>` : inner}</svg>\n`;
}
