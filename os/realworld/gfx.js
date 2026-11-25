/* REALWORLD · gfx — the renderer: a small WebGL 2 engine made for this one job (thousands of static triangles in a few draw calls + instanced people/cars), no libraries.
 *   const g = RealWorld.GFX.create(canvas);   g.resize(w, h);   g.begin(cam, env);   g.sky();   g.draw(handle, fade, dir);   g.actors(kind, floats, count);   g.particles(...)
 * - World meshes: 20-byte vertices (see mesh.js), hemisphere + sun lighting, glowing windows at night, exp² fog, dithered cross-fade between levels of detail (no pop).
 * - Actors (players, NPCs, cars): ONE draw call each. The walk cycle runs on the GPU (limbs swing from a per-instance phase), so animating 150 people costs the CPU only a 32-byte write each.
 * - Frustum culling is done by the caller with g.visible(handle) (box vs the 6 planes of the view-projection). */
(function(root){
  const RW = root.RealWorld = root.RealWorld || {};
  /* ---------------- maths (column-major) ---------------- */
  const m4 = {
    perspective(fovy, asp, n, f){ const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    /* camera at p looking along yaw (0 = north = -z) and pitch */
    view(p, yaw, pitch, roll){ const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), f = [sy * cp, sp, -cy * cp], r0 = [cy, 0, sy], u0 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]], o = new Float32Array(16);
      const cr = Math.cos(roll || 0), sr = Math.sin(roll || 0), r = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr], u = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr + r0[2] * sr];   // roll > 0: right side down (used by the cockpit view of a banking plane)
      o[0] = r[0]; o[4] = r[1]; o[8] = r[2]; o[12] = -(r[0] * p[0] + r[1] * p[1] + r[2] * p[2]); o[1] = u[0]; o[5] = u[1]; o[9] = u[2]; o[13] = -(u[0] * p[0] + u[1] * p[1] + u[2] * p[2]); o[2] = -f[0]; o[6] = -f[1]; o[10] = -f[2]; o[14] = f[0] * p[0] + f[1] * p[1] + f[2] * p[2]; o[15] = 1; return { m: o, f, r, u }; },
    mul(a, b){ const o = new Float32Array(16); for(let i = 0; i < 4; i++) for(let j = 0; j < 4; j++){ let s = 0; for(let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  };
  function planes(m){ const P = [], row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]]; const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    [[1, r0], [-1, r0], [1, r1], [-1, r1], [1, r2], [-1, r2]].forEach(([s, r]) => { const p = [r3[0] + s * r[0], r3[1] + s * r[1], r3[2] + s * r[2], r3[3] + s * r[3]], l = Math.hypot(p[0], p[1], p[2]) || 1; P.push([p[0] / l, p[1] / l, p[2] / l, p[3] / l]); }); return P; }

  /* ---------------- shaders ---------------- */
  const COMMON = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
uniform vec3 uCam, uSunDir, uSunCol, uSky, uGround, uFogCol; uniform float uFogD, uNight, uTime;
uniform float uQ, uShK, uSP; uniform mat4 uSMVP; uniform vec2 uSMs; uniform sampler2DShadow uSM;   // quality tier (0 low, 1 high, 2 ultra), shadow strength, shadow-pass flag, sun shadow map
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y); }
float shadowAt(vec3 wp, vec3 n){
  vec4 lp = uSMVP * vec4(wp + n * 0.12, 1.0); vec3 pc = lp.xyz / lp.w * 0.5 + 0.5;
  if(pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0 || pc.z > 1.0) return 1.0;
  float ndl = max(dot(n, uSunDir), 0.0), z = pc.z - (0.00025 + 0.0012 * (1.0 - ndl)), s = 0.0; vec2 t = uSMs;
  s += texture(uSM, vec3(pc.xy + vec2(-0.5, -0.5) * t, z)); s += texture(uSM, vec3(pc.xy + vec2(0.5, -0.5) * t, z)); s += texture(uSM, vec3(pc.xy + vec2(-0.5, 0.5) * t, z)); s += texture(uSM, vec3(pc.xy + vec2(0.5, 0.5) * t, z));
  float edge = smoothstep(0.0, 0.08, min(min(pc.x, 1.0 - pc.x), min(pc.y, 1.0 - pc.y)));   // fades out at the border of the map
  return mix(1.0, s * 0.25, edge); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 shadeIt(vec3 base, vec3 n, vec3 wp, float glow){
  float ndl = max(dot(n, uSunDir), 0.0), sh = 1.0; if(uQ > 1.5 && uShK > 0.01 && ndl > 0.0) sh = mix(1.0, shadowAt(wp, n), uShK);
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5); if(uQ > 0.5) amb *= 0.86 + 0.14 * smoothstep(-0.9, 0.4, n.y);   // faces that point down sit in the shade of what is above them
  vec3 col = base * (amb + uSunCol * ndl * sh);
  if(glow > 0.5){ float cell = floor(wp.x * 0.33) + floor(wp.z * 0.33) * 7.0 + floor(wp.y / 3.1) * 13.0; float on = step(0.32, fract(sin(cell * 12.9898) * 43758.5453)); vec3 warm = vec3(1.0, 0.74, 0.38) * (0.8 + 0.5 * fract(cell * 0.37)) * 1.5; float sat = smoothstep(0.2, 0.45, max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b))); vec3 lit = mix(warm * on + base * 0.12, base * 2.4, sat);
    col = mix(mix(col, uFogCol * 1.15 + base * 0.15, 0.3 * (1.0 - uNight)), lit, uNight * mix(0.35 + 0.65 * on, 1.0, sat)); }
  float d = length(wp - uCam); vec3 fc = uFogCol; if(uQ > 0.5){ vec3 v = (wp - uCam) / max(d, 0.001); fc += uSunCol * pow(max(dot(v, uSunDir), 0.0), 6.0) * 0.10 * (1.0 - uNight); }   // looking toward the sun the haze glows
  return mix(col, fc, 1.0 - exp(-pow(d * uFogD, 2.0))); }
vec3 outc(vec3 c){
  if(uQ > 0.5){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.16) * 1.06; c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); c += (hash21(gl_FragCoord.xy) - 0.5) / 255.0; return pow(max(c, 0.0), vec3(1.0 / 2.2)); }   // filmic curve + a touch of colour + dither (no banding in the sky haze)
  c = c / (1.0 + c * 0.12); return pow(max(c, 0.0), vec3(1.0 / 2.2)); }`;
  const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol;
uniform mat4 uVP; out vec3 vN; out vec4 vC; out vec3 vWP;
void main(){ vN = aNrm; vC = aCol; vWP = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const WORLD_FS = COMMON + `
in vec3 vN; in vec4 vC; in vec3 vWP; uniform float uFade, uFadeDir; out vec4 oCol;
float bayer(vec2 p){ ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4; float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i] + 0.5) / 16.0; }
void main(){ if(uSP > 0.5){ oCol = vec4(0.0); return; } if(uFade < 1.0){ float b = bayer(gl_FragCoord.xy); if(uFadeDir > 0.5 ? b >= uFade : b < uFade) discard; }
  vec3 n = normalize(vN), base = lin(vC.rgb); float wat = step(0.989, vC.a) * (1.0 - step(0.998, vC.a));   // alpha 253 = sea
  if(wat > 0.5){ float t = uTime; vec2 p = vWP.xz; n = normalize(vec3(0.05 * sin(p.x * 0.31 + t * 1.1) + 0.035 * sin(p.x * 0.9 - p.y * 0.4 + t * 1.7), 1.0, 0.05 * sin(p.y * 0.27 - t * 0.9) + 0.035 * sin(p.y * 0.8 + p.x * 0.5 + t * 1.4))); }
  if(uQ > 0.5 && vC.a >= 0.9 && wat < 0.5){ vec2 uv = abs(n.y) > 0.6 ? vWP.xz : vec2(vWP.x + vWP.z, vWP.y); base *= 0.93 + 0.14 * (vnoise(uv * 0.55) * 0.6 + vnoise(uv * 2.3) * 0.4); }   // large-scale tone variation: ground and walls stop looking flat
  vec3 col = shadeIt(base, n, vWP, vC.a < 0.9 ? 1.0 : 0.0);
  if(wat > 0.5){ vec3 V = normalize(uCam - vWP); float fr = pow(1.0 - max(dot(n, V), 0.0), 4.0), fogK = exp(-pow(length(vWP - uCam) * uFogD, 2.0));
    col += fogK * (uSunCol * pow(max(dot(reflect(-V, n), uSunDir), 0.0), 120.0) * 2.2 * (1.0 - uNight) + uSky * fr * 0.55); }   // sun glints + sky reflection on the sea
  oCol = vec4(outc(col), 1.0); }`;

  /* instanced props (trees, lamps, benches): per-instance x y z yaw | scale tint(packed rgb) seed 0. Foliage (vertex alpha 250) takes the instance's colour and sways in the wind; the far edge dissolves by distance (no pop). */
  const PROP_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol; layout(location=3) in vec4 iPos; layout(location=4) in vec4 iEx;
uniform mat4 uVP; uniform float uTime; out vec3 vN; out vec4 vC; out vec3 vWP; out vec3 vT;
vec3 unpackC(float p){ return vec3(floor(p / 65536.0), floor(mod(p, 65536.0) / 256.0), mod(p, 256.0)) / 255.0; }
void main(){ vec3 p = aPos * iEx.x, n = aNrm; float fol = (aCol.a > 0.95 && aCol.a < 0.995) ? 1.0 : 0.0;
  p.x += fol * sin(uTime * 1.3 + iPos.x * 0.37 + iPos.z * 0.21) * 0.028 * p.y; p.z += fol * cos(uTime * 1.1 + iPos.z * 0.33) * 0.02 * p.y;
  float th = -iPos.w, ct = cos(th), st = sin(th); p = vec3(p.x * ct + p.z * st, p.y, -p.x * st + p.z * ct); n = vec3(n.x * ct + n.z * st, n.y, -n.x * st + n.z * ct);
  vN = n; vC = aCol; vT = unpackC(iEx.y); vWP = p + iPos.xyz; gl_Position = uVP * vec4(vWP, 1.0); }`;
  const PROP_FS = COMMON + `
in vec3 vN; in vec4 vC; in vec3 vWP; in vec3 vT; uniform vec2 uFar; out vec4 oCol;
float bayer(vec2 p){ ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4; float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i] + 0.5) / 16.0; }
void main(){ if(uSP > 0.5){ oCol = vec4(0.0); return; } float f = 1.0 - smoothstep(uFar.x, uFar.y, length(vWP - uCam)); if(f < 1.0 && bayer(gl_FragCoord.xy) >= f) discard;
  bool fol = vC.a > 0.95 && vC.a < 0.995; vec3 base = fol ? vT * vC.rgb : vC.rgb;
  oCol = vec4(outc(shadeIt(lin(base), normalize(vN), vWP, vC.a < 0.9 ? 1.0 : 0.0)), 1.0); }`;
  const ACT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aMeta; layout(location=3) in vec4 iPos; layout(location=4) in vec4 iAn; layout(location=5) in vec4 aBake;
uniform mat4 uVP; uniform vec2 uPiv; uniform vec2 uVeh; out vec3 vN; out vec3 vC; out vec3 vWP; out float vG;
uniform float uTime;
vec3 unpackC(float p){ return vec3(floor(p / 65536.0), floor(mod(p, 65536.0) / 256.0), mod(p, 256.0)) / 255.0; }
void main(){ vec3 p = aPos, n = aNrm; float part = aMeta.x, sw = sin(iAn.x) * iAn.y, ang = 0.0, pv = uPiv.x;
  if(part > 7.5){ vec2 hub = vec2(aBake.r * 255.0 - 128.0, aBake.g * 255.0) / 16.0; float run = step(0.25, fract(iAn.w)); float a = run * (uTime * 52.0 + hub.x * 2.0) + (1.0 - run) * 0.5; float c = cos(a), s = sin(a); vec2 d = p.xy - hub; p.xy = hub + vec2(d.x * c - d.y * s, d.x * s + d.y * c); n.xy = vec2(n.x * c - n.y * s, n.x * s + n.y * c); }   // propeller blades (part 8): spin about the hub baked into the vertex while the engine runs
  if(part > 0.5 && part < 1.5) ang = sw * 0.75; else if(part < 2.5 && part > 1.5) ang = -sw * 0.75; else if(part < 3.5 && part > 2.5){ ang = -sw * 0.6; pv = uPiv.y; } else if(part < 4.5 && part > 3.5){ ang = sw * 0.6; pv = uPiv.y; }
  if(part > 0.5 && part < 4.5){ float c = cos(ang), s = sin(ang), y = p.y - pv; p = vec3(p.x, y * c - p.z * s + pv, y * s + p.z * c); n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c); }
  if(uVeh.x > 0.5){ float cp = cos(iAn.x), sp = sin(iAn.x), cr = cos(iAn.y), sr = sin(iAn.y); p.y -= uVeh.y; p = vec3(p.x * cr + p.y * sr, -p.x * sr + p.y * cr, p.z); n = vec3(n.x * cr + n.y * sr, -n.x * sr + n.y * cr, n.z); p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp); n = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp); p.y += uVeh.y; }   // vehicles: floats 5 / 6 are pitch (nose up +) and roll (right side down +) about the pivot height
  else p.y += abs(sin(iAn.x)) * iAn.y * 0.05 * step(part, 4.5);
  float th = -iPos.w, ct = cos(th), st = sin(th); p = vec3(p.x * ct + p.z * st, p.y, -p.x * st + p.z * ct); n = vec3(n.x * ct + n.z * st, n.y, -n.x * st + n.z * ct);
  vec3 shirt = unpackC(iAn.z), pants = unpackC(iAn.w), skin = mix(vec3(0.95, 0.76, 0.62), vec3(0.45, 0.30, 0.22), fract(iAn.z * 0.000173)); float sl = aMeta.y;
  vC = sl < 0.5 ? skin : sl < 1.5 ? shirt : sl < 2.5 ? pants : sl < 3.5 ? vec3(0.13, 0.1, 0.08) * (0.6 + fract(iAn.w * 0.00031)) : sl < 4.5 ? vec3(0.07) : sl < 5.5 ? shirt : vec3(0.3, 0.42, 0.55);
  if(sl > 6.5) vC = aBake.rgb;   /* slot 7 = a baked model colour (Kenney people) */
  vG = uVeh.x > 0.5 ? (sl > 5.5 && sl < 6.5 ? 1.0 : ((sl > 1.5 && sl < 2.5) || (sl > 4.5 && sl < 5.5) ? 0.65 : 0.0)) : 0.0;   // glossy paint + glass on vehicles
  vC *= aMeta.z / 255.0; vN = n; vWP = p + iPos.xyz; gl_Position = uVP * vec4(vWP, 1.0); }`;
  const ACT_FS = COMMON + `
in vec3 vN; in vec3 vC; in vec3 vWP; in float vG; out vec4 oCol;
void main(){ if(uSP > 0.5){ oCol = vec4(0.0); return; } vec3 n = normalize(vN), col = shadeIt(lin(vC), n, vWP, 0.0);
  if(uQ > 0.5 && vG > 0.01){ vec3 V = normalize(uCam - vWP), H = normalize(uSunDir + V); float nh = max(dot(n, H), 0.0), fr = pow(1.0 - max(dot(n, V), 0.0), 4.0), fogK = exp(-pow(length(vWP - uCam) * uFogD, 2.0));
    vec3 refl = mix(uGround, uSky, clamp(reflect(-V, n).y * 0.5 + 0.5, 0.0, 1.0)) * 1.2; col += fogK * vG * (uSunCol * pow(nh, 70.0) * 1.4 + refl * (0.06 + 0.5 * fr)); }   // clear-coat highlight + sky reflection
  oCol = vec4(outc(col), 1.0); }`;
  const SKY_VS = `#version 300 es
out vec2 vP; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vP = p * 2.0 - 1.0; gl_Position = vec4(vP, 1.0, 1.0); }`;
  const SKY_FS = `#version 300 es
precision highp float; in vec2 vP; out vec4 oCol;
uniform vec3 uF, uR, uU, uCam, uSunDir, uZen, uHor, uSunCol; uniform float uTan, uAsp, uNight, uTime, uCloud, uQ;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){ vec3 d = normalize(uF + uR * vP.x * uTan * uAsp + uU * vP.y * uTan); float y = max(d.y, 0.0), hz = pow(1.0 - y, 3.2);
  vec3 col = mix(uZen, uHor, hz); float sd = max(dot(d, uSunDir), 0.0); col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.28);
  if(uNight > 0.01){ vec2 g = floor(d.xz / (d.y + 0.35) * 90.0); float s = step(0.9975, h(g)); col += vec3(s) * uNight * smoothstep(0.05, 0.4, d.y); }
  if(d.y > 0.015 && uCloud > 0.0){ float t = 2200.0 / d.y; vec2 uv = (uCam.xz + d.xz * t) * 0.00045 + vec2(uTime * 0.004, 0.0); float c = vn(uv * 3.0) * 0.55 + vn(uv * 7.0) * 0.3 + vn(uv * 17.0) * 0.15; c = smoothstep(0.52, 0.8, c) * uCloud * smoothstep(0.015, 0.2, d.y);
    vec3 cc = mix(uHor * 0.9 + 0.15, vec3(1.0), 0.5) * mix(1.0, 0.18, uNight) + uSunCol * 0.2; col = mix(col, cc, c * 0.85); }
  col = col / (1.0 + col * 0.12); if(uQ > 0.5) col += (h(gl_FragCoord.xy) - 0.5) / 255.0; oCol = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0); }`;
  const PT_VS = `#version 300 es
layout(location=0) in vec4 aS; uniform mat4 uVP; uniform vec3 uCam; uniform float uTime, uFall, uSize, uScale, uSpread; out float vA;
void main(){ vec3 q = fract(aS.xyz + vec3(sin(uTime * 0.3 + aS.w * 20.0) * 0.02, uFall * uTime * 0.01 * (0.7 + aS.w * 0.6), cos(uTime * 0.25 + aS.w * 17.0) * 0.02)) - 0.5; vec3 wp = uCam + q * uSpread; vec4 c = uVP * vec4(wp, 1.0); gl_Position = c; gl_PointSize = clamp(uSize * uScale / max(c.w, 0.5), 1.0, 14.0); vA = 1.0 - smoothstep(0.2, 0.5, length(q)); }`;
  const PT_FS = `#version 300 es
precision mediump float; in float vA; uniform vec4 uCol; out vec4 oCol; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.4, 1.0, d)) * vA; if(a < 0.02) discard; oCol = vec4(uCol.rgb, uCol.a * a); }`;

  const FX_VS = `#version 300 es
layout(location=0) in vec4 aP; layout(location=1) in vec4 aC; uniform mat4 uVP; uniform float uScale, uMax; out vec4 vC;
void main(){ vec4 c = uVP * vec4(aP.xyz, 1.0); gl_Position = c; gl_PointSize = clamp(aP.w * uScale / max(c.w, 0.3), 1.0, uMax); vC = aC; }`;
  const FX_FS = `#version 300 es
precision mediump float; in vec4 vC; uniform float uLit, uAdd; out vec4 oCol;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.1, 1.0, d); a *= a; if(a < 0.01) discard; vec3 col = uAdd > 0.5 ? vC.rgb : vC.rgb * uLit; oCol = vec4(col, vC.a * a); }`;

  const SCR_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; uniform mat4 uVP; out vec2 vUV; void main(){ vUV = aUV; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const SCR_FS = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; out vec4 oCol; void main(){ vec3 c = texture(uTex, vUV).rgb; float scan = 0.96 + 0.04 * sin(vUV.y * 540.0); oCol = vec4(c * scan * 1.08, 1.0); }`;

  /* ---------------- people & cars (built once, drawn instanced) ---------------- */
  function actorMeshes(){
    const mk = () => ({ p: [], n: [], m: [], i: [] });
    const quad = (M, a, b, c, d, nn, part, slot, shade) => { const k = M.p.length / 3; [a, b, c, d].forEach(q => { M.p.push(q[0], q[1], q[2]); M.n.push(nn[0], nn[1], nn[2]); M.m.push(part, slot, shade, 0); if(M.c) M.c.push(M.hub[0], M.hub[1], 0); }); const g = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]; if(g[0] * nn[0] + g[1] * nn[1] + g[2] * nn[2] >= 0) M.i.push(k, k + 1, k + 2, k, k + 2, k + 3); else M.i.push(k, k + 2, k + 1, k, k + 3, k + 2); };
    const box = (M, x0, y0, z0, x1, y1, z1, part, slot) => { quad(M, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], part, slot, 235); quad(M, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], part, slot, 235); quad(M, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], part, slot, 200); quad(M, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], part, slot, 200); quad(M, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], part, slot, 255); quad(M, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], part, slot, 140); };
    const P = mk(); // person, facing -z
    box(P, -0.17, 0.08, -0.09, -0.03, 0.9, 0.09, 1, 2); box(P, 0.03, 0.08, -0.09, 0.17, 0.9, 0.09, 2, 2); box(P, -0.18, 0, -0.14, -0.02, 0.09, 0.1, 1, 4); box(P, 0.02, 0, -0.14, 0.18, 0.09, 0.1, 2, 4);
    box(P, -0.22, 0.9, -0.12, 0.22, 1.45, 0.12, 0, 1); box(P, -0.33, 1.1, -0.07, -0.22, 1.43, 0.07, 3, 1); box(P, 0.22, 1.1, -0.07, 0.33, 1.43, 0.07, 4, 1); box(P, -0.33, 0.9, -0.06, -0.23, 1.1, 0.06, 3, 0); box(P, 0.23, 0.9, -0.06, 0.33, 1.1, 0.06, 4, 0);
    box(P, -0.11, 1.45, -0.11, 0.11, 1.7, 0.1, 0, 0); box(P, -0.12, 1.62, -0.12, 0.12, 1.74, 0.11, 0, 3);
    const Cr = mk(); // car, facing -z
    box(Cr, -0.95, 0.3, -2.1, 0.95, 0.95, 2.1, 0, 5); box(Cr, -0.8, 0.95, -0.9, 0.8, 1.5, 1.5, 0, 6); box(Cr, -0.76, 1.48, -0.8, 0.76, 1.54, 1.4, 0, 5);
    [[-0.95, -1.35], [0.8, -1.35], [-0.95, 1.3], [0.8, 1.3]].forEach(w => box(Cr, w[0], 0, w[1] - 0.32, w[0] + 0.15, 0.62, w[1] + 0.32, 0, 4));
    /* ---- vehicle bodies (cars face -z; planes face -z). slot 5 = body colour (shirt), 2 = accent (pants), 4 = tyres, 6 = glass ---- */
    const bx = (M, x0, y0, z0, x1, y1, z1, slot) => box(M, x0, y0, z0, x1, y1, z1, 0, slot);
    const carM = (len, wid, hgt, cab0, cab1, cabH, bed) => { const M = mk(), l = len / 2, w = wid / 2; bx(M, -w, 0.28, -l, w, hgt, l, 5); if(bed) bx(M, -w + 0.1, hgt, l - bed, w - 0.1, hgt + 0.25, l, 2); bx(M, -w + 0.12, hgt, -l + cab0, w - 0.12, hgt + cabH, -l + cab1, 6); bx(M, -w + 0.16, hgt + cabH, -l + cab0 + 0.1, w - 0.16, hgt + cabH + 0.05, -l + cab1 - 0.1, 5);
      [[-1, -0.3], [1, -0.3], [-1, 0.3], [1, 0.3]].forEach((q, i) => { const z = q[1] < 0 ? -l + 0.75 : l - 0.8; bx(M, q[0] < 0 ? -w - 0.02 : w - 0.2, 0, z - 0.33, q[0] < 0 ? -w + 0.2 : w + 0.02, 0.66, z + 0.33, 4); }); bx(M, -w + 0.2, 0.55, -l - 0.02, w - 0.2, 0.7, -l + 0.05, 2); return M; };
    /* ---- AIRCRAFT: the same flat-shaded, chamfered "toy" look as the cars (body paint = slot 5, accent = slot 2 (darker body), tyres / engines = 4, glass = 6), but lofted from tapered
     * octagonal sections with swept wings, T-tails, nacelles, canopies, window rows and tricycle gear instead of five boxes. All face −z, stand on y = 0. Propeller blades are part 8: the
     * actor shader spins them about the hub stored in the vertex's bake bytes (M.hub) while the engine runs (pants colour +0.5 = "spin"). ---- */
    const v3s = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v3x = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], v3d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const unit3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const mkp = () => { const M = mk(); M.c = []; M.hub = [128, 0]; return M; };
    /* one flat face; its outward side is the one that points away from c0 (the middle of the solid) */
    const fq = (M, a, b, c, d, slot, c0, part) => { let n = unit3(v3x(v3s(c, a), v3s(d, b))); const m = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4]; if(v3d(n, v3s(m, c0)) < 0) n = [-n[0], -n[1], -n[2]];
      quad(M, a, b, c, d, n, part || 0, slot, Math.max(112, Math.min(255, Math.round(170 + n[1] * 80 - Math.abs(n[0]) * 14 + (n[2] < 0 ? 8 : 0))))); };
    const avg = pts => [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
    /* a four-sided tube between two quads (r0 → r1, same order); slots = the slot of each of the four side faces; capSlot closes both ends */
    const frustum = (M, r0, r1, slots, capSlot, part) => { const c0 = avg(r0.concat(r1)); for(let i = 0; i < 4; i++) fq(M, r0[i], r0[(i + 1) % 4], r1[(i + 1) % 4], r1[i], slots[i], c0, part); if(capSlot != null){ fq(M, r0[0], r0[1], r0[2], r0[3], capSlot, c0, part); fq(M, r1[0], r1[1], r1[2], r1[3], capSlot, c0, part); } };
    const ring8 = (z, w, yc, h, ox) => { const k = 0.62; return [[-w * k, yc + h, z], [w * k, yc + h, z], [w, yc + h * 0.45, z], [w, yc - h * 0.45, z], [w * k, yc - h, z], [-w * k, yc - h, z], [-w, yc - h * 0.45, z], [-w, yc + h * 0.45, z]].map(p => [p[0] + (ox || 0), p[1], p[2]]); };
    const cap8 = (M, R, slot, c0) => { fq(M, R[0], R[1], R[2], R[7], slot, c0); fq(M, R[7], R[2], R[3], R[6], slot, c0); fq(M, R[6], R[3], R[4], R[5], slot, c0); };
    /* secs = [[z, halfWidth, centreY, halfHeight], …] nose → tail; edge slots: 0 top, 1 upper right, 2 right side, 3 lower right, 4 belly, 5 lower left, 6 left side, 7 upper left */
    const BODY = [5, 5, 5, 2, 2, 2, 5, 5], POD = [5, 5, 5, 2, 4, 2, 5, 5];
    const loft = (M, secs, edge, ox, capFront, capBack) => { const R = secs.map(s => ring8(s[0], s[1], s[2], s[3], ox));
      for(let i = 0; i < R.length - 1; i++){ const c0 = [ox || 0, (secs[i][2] + secs[i + 1][2]) / 2, (secs[i][0] + secs[i + 1][0]) / 2]; for(let j = 0; j < 8; j++) fq(M, R[i][j], R[i][(j + 1) % 8], R[i + 1][(j + 1) % 8], R[i + 1][j], edge[j], c0); }
      if(capFront != null) cap8(M, R[0], capFront, [ox || 0, secs[0][2], secs[0][0] + 1]); if(capBack != null) cap8(M, R[R.length - 1], capBack, [ox || 0, secs[R.length - 1][2], secs[R.length - 1][0] - 1]); };
    const lerpSec = (secs, z) => { for(let i = 0; i < secs.length - 1; i++){ const a = secs[i], b = secs[i + 1]; if(z >= a[0] && z <= b[0]){ const t = (z - a[0]) / (b[0] - a[0] || 1); return [z, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; } } return secs[z < secs[0][0] ? 0 : secs.length - 1]; };
    /* swept, tapered wing panel (s = ±1): root at x = s·x0 with chord cr from zLE, tip sp further out, swept back sw, tip chord ct, raised dih; thickness tr → tt */
    const wing = (M, s, x0, y, zLE, cr, sp, sw, ct, dih, tr, tt, top, bot) => { const xr = s * x0, xt = s * (x0 + sp), yt = y + dih, zt = zLE + sw;
      const r0 = [[xr, y + tr / 2, zLE], [xr, y + tr / 2, zLE + cr], [xr, y - tr / 2, zLE + cr], [xr, y - tr / 2, zLE]], r1 = [[xt, yt + tt / 2, zt], [xt, yt + tt / 2, zt + ct], [xt, yt - tt / 2, zt + ct], [xt, yt - tt / 2, zt]];
      frustum(M, r0, r1, [top, 5, bot, 5], 5); };
    /* vertical fin / winglet: base chord cr at height y0, h tall, top swept back sw with chord ct, thickness th */
    const fin = (M, x, y0, zLE, cr, h, sw, ct, th, side) => { const r0 = [[x - th / 2, y0, zLE], [x + th / 2, y0, zLE], [x + th / 2, y0, zLE + cr], [x - th / 2, y0, zLE + cr]], r1 = [[x - th * 0.35, y0 + h, zLE + sw], [x + th * 0.35, y0 + h, zLE + sw], [x + th * 0.35, y0 + h, zLE + sw + ct], [x - th * 0.35, y0 + h, zLE + sw + ct]]; frustum(M, r0, r1, [5, side, 5, side], 5); };
    const strut = (M, p, q, t, slot) => { const sq = (c) => [[c[0] - t, c[1], c[2] - t], [c[0] + t, c[1], c[2] - t], [c[0] + t, c[1], c[2] + t], [c[0] - t, c[1], c[2] + t]]; frustum(M, sq(p), sq(q), [slot, slot, slot, slot], slot); };
    /* a wheel: octagonal tyre along x (slot 4) with a body-coloured hub cap */
    const wheel = (M, x, y, z, r, w) => { const A = [], B = []; for(let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2 + Math.PI / 8, cy = Math.cos(a) * r, cz = Math.sin(a) * r; A.push([x - w / 2, y + cy, z + cz]); B.push([x + w / 2, y + cy, z + cz]); }
      const c0 = [x, y, z]; for(let i = 0; i < 8; i++) fq(M, A[i], A[(i + 1) % 8], B[(i + 1) % 8], B[i], 4, c0); cap8(M, [A[0], A[1], A[2], A[3], A[4], A[5], A[6], A[7]].map(p => p), 4, c0); cap8(M, B.slice(), 4, c0);
      const hc = r * 0.45; [-1, 1].forEach(sd => { const px = x + sd * (w / 2 + 0.005); fq(M, [px, y - hc, z - hc], [px, y + hc, z - hc], [px, y + hc, z + hc], [px, y - hc, z + hc], 5, c0); }); };
    /* rows of small glass windows along a lofted fuselage (both sides) */
    const windows = (M, secs, z0, z1, n, gap, y0f, y1f) => { const len = (z1 - z0 - gap * (n - 1)) / n; for(let i = 0; i < n; i++){ const za = z0 + i * (len + gap), zb = za + len, A = lerpSec(secs, za), B = lerpSec(secs, zb);
      [-1, 1].forEach(sd => fq(M, [sd * (A[1] + 0.014), A[2] + A[3] * y0f, za], [sd * (A[1] + 0.014), A[2] + A[3] * y1f, za], [sd * (B[1] + 0.014), B[2] + B[3] * y1f, zb], [sd * (B[1] + 0.014), B[2] + B[3] * y0f, zb], 6, [0, A[2], za])); } };
    /* a glass canopy / windscreen: bottom rectangle (half-width wb, z zf0 → zr1) up to a smaller roof (half-width wt, z zf1 → zr0) with a slanted front and back */
    const canopy = (M, zf0, zf1, zr0, zr1, yb, yt, wb, wt) => frustum(M, [[-wb, yb, zf0], [wb, yb, zf0], [wb, yb, zr1], [-wb, yb, zr1]], [[-wt, yt, zf1], [wt, yt, zf1], [wt, yt, zr0], [-wt, yt, zr0]], [6, 6, 6, 6], 5);
    const spinner = (M, x, y, z, r) => loft(M, [[z - r * 1.5, r * 0.12, y, r * 0.12], [z, r, y, r]], [5, 5, 5, 5, 5, 5, 5, 5], x);
    /* propeller: two crossed blades (part 8, black) about a hub at (x, y) — the shader spins them */
    const propeller = (M, x, y, z, R) => { M.hub = [Math.round(x * 16 + 128), Math.round(y * 16)]; box(M, x - 0.07, y - R, z - 0.03, x + 0.07, y + R, z + 0.03, 8, 4); box(M, x - R, y - 0.07, z + 0.03, x + R, y + 0.07, z + 0.09, 8, 4); M.hub = [128, 0]; };
    const gearSet = (M, nose, main, rn, rm) => { strut(M, [nose[0], nose[1], nose[2]], [nose[0], rn, nose[2] + 0.1], 0.05, 2); wheel(M, nose[0], rn, nose[2] + 0.1, rn, rn * 0.6);
      [-1, 1].forEach(sd => { strut(M, [sd * main[0], main[1], main[2]], [sd * (main[0] + 0.08), rm, main[2]], 0.06, 2); wheel(M, sd * (main[0] + 0.08), rm, main[2], rm, rm * 0.7); }); };
    /* ---- Skylark 2: high-wing two-seat trainer with a nose prop ---- */
    const skylarkM = () => { const M = mkp(), S = [[-2.95, 0.3, 1.2, 0.3], [-2.4, 0.5, 1.22, 0.48], [-1.3, 0.62, 1.35, 0.62], [-0.2, 0.66, 1.45, 0.68], [1.0, 0.5, 1.55, 0.5], [3.3, 0.1, 1.72, 0.18]];
      loft(M, S, BODY, 0, 4, 5); canopy(M, -1.75, -1.1, 0.9, 1.5, 1.95, 2.36, 0.46, 0.4); windows(M, S, -0.9, 0.7, 2, 0.12, 0.05, 0.4);
      [-1, 1].forEach(sd => { wing(M, sd, 0, 2.5, -1.2, 1.55, 4.75, 0.15, 1.0, 0.16, 0.16, 0.09, 5, 2); wing(M, sd, 0, 1.72, 2.35, 0.85, 1.6, 0.25, 0.5, 0, 0.08, 0.05, 5, 2); strut(M, [sd * 0.5, 1.0, -0.15], [sd * 2.3, 2.42, -0.35], 0.05, 2); });
      fin(M, 0, 1.75, 2.05, 1.2, 1.25, 0.75, 0.5, 0.1, 2); gearSet(M, [0, 1.0, -2.1], [0.45, 1.0, -0.35], 0.28, 0.3);
      spinner(M, 0, 1.2, -2.95, 0.26); propeller(M, 0, 1.2, -3.18, 1.0); return M; };
    /* ---- Kestrel T6: twin-turboprop commuter, low wing, six windows a side ---- */
    const kestrelM = () => { const M = mkp(), S = [[-5.25, 0.15, 1.7, 0.15], [-4.6, 0.6, 1.78, 0.58], [-3.5, 0.88, 1.9, 0.88], [-2.4, 0.95, 1.95, 0.95], [1.5, 0.95, 1.95, 0.95], [3.8, 0.55, 2.1, 0.6], [5.25, 0.12, 2.25, 0.2]];
      loft(M, S, BODY, 0, 4, 5); canopy(M, -3.95, -3.55, -3.15, -2.85, 2.72, 3.02, 0.52, 0.4); windows(M, S, -2.2, 1.3, 6, 0.22, 0.06, 0.4);
      [-1, 1].forEach(sd => { wing(M, sd, 0, 1.45, -1.1, 2.6, 6.25, 0.5, 1.3, 0.2, 0.32, 0.14, 5, 2); wing(M, sd, 0, 2.25, 3.4, 1.4, 2.6, 0.5, 0.8, 0, 0.12, 0.07, 5, 2);
        loft(M, [[-2.3, 0.38, 1.62, 0.38], [-1.6, 0.52, 1.6, 0.5], [0.2, 0.5, 1.58, 0.46], [1.4, 0.2, 1.55, 0.2]], POD, sd * 2.9, 4, 5); spinner(M, sd * 2.9, 1.62, -2.3, 0.3); propeller(M, sd * 2.9, 1.62, -2.58, 1.25); });
      fin(M, 0, 2.3, 2.7, 2.1, 1.9, 1.2, 0.8, 0.14, 2); gearSet(M, [0, 1.05, -3.6], [2.9, 1.1, -0.2], 0.35, 0.4); return M; };
    /* ---- Falcon J1: light jet, swept wing, rear pods, T-tail ---- */
    const falconM = () => { const M = mkp(), S = [[-7.75, 0.1, 1.75, 0.1], [-6.9, 0.5, 1.85, 0.55], [-5.2, 0.85, 1.98, 0.9], [-3.5, 0.95, 2.0, 0.95], [1.8, 0.95, 2.0, 0.95], [5.2, 0.6, 2.15, 0.65], [7.75, 0.16, 2.4, 0.25]];
      loft(M, S, BODY, 0, 4, 4); canopy(M, -5.7, -5.05, -4.45, -4.0, 2.82, 3.14, 0.5, 0.38); windows(M, S, -3.3, 2.3, 7, 0.25, 0.06, 0.4);
      [-1, 1].forEach(sd => { wing(M, sd, 0, 1.35, -1.6, 3.4, 6.75, 2.6, 1.3, 0.35, 0.34, 0.12, 5, 2); wing(M, sd, 0, 5.1, 5.9, 1.25, 2.6, 0.9, 0.6, 0.1, 0.1, 0.06, 5, 2);
        loft(M, [[2.2, 0.42, 2.5, 0.42], [2.8, 0.58, 2.5, 0.55], [4.9, 0.55, 2.55, 0.5], [6.0, 0.3, 2.6, 0.3]], POD, sd * 1.45, 4, 4); });
      fin(M, 0, 2.5, 4.0, 2.8, 2.7, 2.0, 1.1, 0.15, 2); gearSet(M, [0, 1.0, -5.4], [1.1, 1.0, -0.3], 0.38, 0.4); return M; };
    /* ---- Zenith X: long-range jet, big swept wing with winglets, under-wing engines, T-tail ---- */
    const zenithM = () => { const M = mkp(), S = [[-9.5, 0.12, 1.9, 0.12], [-8.5, 0.6, 2.0, 0.65], [-6.4, 1.05, 2.15, 1.05], [-4.5, 1.15, 2.2, 1.1], [3.4, 1.15, 2.2, 1.1], [7.2, 0.75, 2.4, 0.8], [9.5, 0.18, 2.7, 0.3]];
      loft(M, S, BODY, 0, 4, 4); canopy(M, -6.8, -6.1, -5.4, -4.9, 3.12, 3.44, 0.62, 0.46); windows(M, S, -4.3, 3.2, 9, 0.28, 0.06, 0.4);
      [-1, 1].forEach(sd => { wing(M, sd, 0, 1.45, -1.2, 4.2, 8.5, 3.6, 1.4, 0.6, 0.4, 0.13, 5, 2); wing(M, sd, 0, 6.05, 7.0, 1.6, 3.6, 1.3, 0.8, 0.1, 0.12, 0.07, 5, 2); fin(M, sd * 8.5, 2.0, 2.5, 1.2, 1.2, 0.5, 0.5, 0.08, 2);
        loft(M, [[-1.6, 0.5, 1.0, 0.5], [-1.0, 0.68, 1.0, 0.66], [1.0, 0.66, 1.0, 0.62], [2.0, 0.34, 1.0, 0.34]], POD, sd * 3.6, 4, 4); strut(M, [sd * 3.6, 1.2, 0.3], [sd * 3.6, 1.8, 0.3], 0.1, 5); });
      fin(M, 0, 2.9, 5.4, 4.0, 3.2, 2.6, 1.4, 0.18, 2); gearSet(M, [0, 1.1, -7.2], [1.4, 1.1, 0.0], 0.42, 0.48); return M; };
    return { person: P, car: Cr, sedan: carM(4.5, 1.8, 0.95, 1.3, 3.4, 0.55, 0), hatch: carM(3.7, 1.7, 1.0, 1.0, 3.5, 0.6, 0), coupe: carM(4.5, 1.9, 0.8, 1.7, 3.3, 0.45, 0), suv: carM(4.9, 2.0, 1.15, 1.0, 4.6, 0.7, 0), pickup: carM(5.4, 2.0, 1.1, 1.0, 2.9, 0.65, 2.0),
      prop: skylarkM(), turbo: kestrelM(), jet: falconM(), long: zenithM() };
  }

  /* ---------------- the engine ---------------- */
  function create(canvas, opt){
    opt = opt || {}; let gl = null; try{ gl = canvas.getContext('webgl2', { antialias: opt.aa !== false, alpha: false, powerPreference: 'high-performance', stencil: false }); }catch(e){}
    if(!gl) return null;
    const G = { gl, canvas, W: 1, H: 1, tris: 0, calls: 0, env: null, vp: null, planes: null, cam: [0, 0, 0] };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ const m = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: ' + m); } return s; };
    const prog = (vs, fs, names) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); const u = {}; names.split(' ').forEach(n => { u[n] = gl.getUniformLocation(p, n); }); p.u = u; return p; };
    const ENV = 'uCam uSunDir uSunCol uSky uGround uFogCol uFogD uNight uTime uQ uShK uSP uSMVP uSMs uSM';
    let pW, pA, pS, pP, pT, pI, pF;
    function compile(){ pW = prog(WORLD_VS, WORLD_FS, 'uVP uFade uFadeDir ' + ENV); pA = prog(ACT_VS, ACT_FS, 'uVP uPiv uVeh ' + ENV); pS = prog(SKY_VS, SKY_FS, 'uF uR uU uCam uSunDir uZen uHor uSunCol uTan uAsp uNight uTime uCloud uQ'); pP = prog(PT_VS, PT_FS, 'uVP uCam uTime uFall uSize uScale uSpread uCol'); pT = prog(SCR_VS, SCR_FS, 'uVP uTex'); pI = prog(PROP_VS, PROP_FS, 'uVP uFar ' + ENV); pF = prog(FX_VS, FX_FS, 'uVP uScale uMax uLit uAdd'); }
    compile();
    const emptyVAO = gl.createVertexArray();
    /* ---- quality tiers + sun shadow map ----
     * G.q: 0 = plain (the original look), 1 = high (filmic tone-mapping, glossy paint + glass reflections, sun-glow haze, tone variation, dithering), 2 = ultra (all of 1 + real sun shadows from a 2048² depth map that follows the camera).
     * The shadow pass re-draws the same chunk / prop / actor buffers from the sun with G.vp swapped (depth only); the fragment shaders return early while uSP = 1. */
    G.q = 0; G.shK = 0; G.shadowOn = false; G.inShadow = false; G.smVP = null; let smSize = 1, smFbo = null;
    const mkDepth = n => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, n, n, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); return t; };
    let dummyDepth = mkDepth(1), smTex = dummyDepth;
    const bindSM = t => { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, t); gl.activeTexture(gl.TEXTURE0); }; bindSM(dummyDepth);
    /* returns the tier actually in force (shadows fall back to 1 if the framebuffer cannot be built) */
    G.setQuality = function(q, opt){ q = q | 0; opt = opt || {}; G._qa = [q, opt]; G.q = q > 1 ? 1 : q; G.shadowOn = false; G.shK = 0;
      if(q >= 2 && opt.shadow !== false){ const n = opt.size || 2048;
        try{ if(!smFbo || smSize !== n){ if(smFbo){ gl.deleteFramebuffer(smFbo); if(smTex !== dummyDepth) gl.deleteTexture(smTex); } smTex = mkDepth(n); smSize = n; smFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, smFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, smTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
            const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null); if(!ok){ gl.deleteFramebuffer(smFbo); smFbo = null; gl.deleteTexture(smTex); smTex = dummyDepth; smSize = 1; } }
          if(smFbo){ G.q = 2; G.shadowOn = true; bindSM(smTex); } }catch(e){ smFbo = null; smTex = dummyDepth; smSize = 1; G.q = 1; bindSM(dummyDepth); } }
      if(!G.shadowOn){ bindSM(dummyDepth); smSize = smSize > 1 && smFbo ? smSize : 1; } return G.q + (G.shadowOn ? 0 : 0); };
    G.restoreQuality = function(){ smFbo = null; smSize = 1; dummyDepth = smTex = mkDepth(1); bindSM(dummyDepth); const a = G._qa; if(a) G.setQuality(a[0], a[1]); };   // after a lost WebGL context
    const unit3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }, cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    /* focus = world point the map is centred on, R = half-width in metres. Returns false (no shadows this frame) when the sun is too low / it is night. */
    G.beginShadow = function(focus, R){
      if(!G.shadowOn || !smFbo) return false; const e = G.env, dir = unit3(e.sunDir), el = dir[1], k = Math.max(0, Math.min(1, (el - 0.14) / 0.2)) * (1 - e.night); if(k < 0.03){ G.shK = 0; return false; }
      const D = 300, zA = dir, xA = unit3(cross3(Math.abs(zA[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0], zA)), yA = cross3(zA, xA), tx = 2 * R / smSize;
      const cx = Math.round(dot3(xA, focus) / tx) * tx, cy = Math.round(dot3(yA, focus) / tx) * tx, cz = dot3(zA, focus), o = new Float32Array(16);   // snapped to the texel grid: shadows do not shimmer
      o[0] = xA[0] / R; o[4] = xA[1] / R; o[8] = xA[2] / R; o[12] = -cx / R; o[1] = yA[0] / R; o[5] = yA[1] / R; o[9] = yA[2] / R; o[13] = -cy / R; o[2] = -zA[0] / D; o[6] = -zA[1] / D; o[10] = -zA[2] / D; o[14] = cz / D; o[15] = 1;
      G._save = { vp: G.vp, planes: G.planes }; G.vp = o; G.planes = planes(o); G.smVP = o; G.shK = k; G.inShadow = true; bindSM(dummyDepth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, smFbo); gl.viewport(0, 0, smSize, smSize); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4); return true; };
    G.endShadow = function(){ if(!G.inShadow) return; gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, G.W, G.H); G.vp = G._save.vp; G.planes = G._save.planes; G.inShadow = false; bindSM(smTex); curW = false; };
    function setEnv(p){ const e = G.env, u = p.u; gl.uniform3fv(u.uCam, G.cam); gl.uniform3fv(u.uSunDir, e.sunDir); gl.uniform3fv(u.uSunCol, e.sunCol); gl.uniform3fv(u.uSky, e.sky); gl.uniform3fv(u.uGround, e.ground); gl.uniform3fv(u.uFogCol, e.fog); gl.uniform1f(u.uFogD, e.fogD); gl.uniform1f(u.uNight, e.night); gl.uniform1f(u.uTime, G.time);
      gl.uniform1f(u.uQ, G.q); gl.uniform1f(u.uShK, G.shK > 0 && !G.inShadow && e.isDay !== undefined ? G.shK : 0); gl.uniform1f(u.uSP, G.inShadow ? 1 : 0); if(G.smVP) gl.uniformMatrix4fv(u.uSMVP, false, G.smVP); gl.uniform2f(u.uSMs, 1 / smSize, 1 / smSize); gl.uniform1i(u.uSM, 7); }
    /* ---- meshes ---- */
    G.upload = function(m){
      const vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer(); gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.vb, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 20, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 20, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ib, gl.STATIC_DRAW); gl.bindVertexArray(null);
      return { vao, vb, ib, ni: m.ni, type: m.ib instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, minY: m.minY, maxY: m.maxY, bytes: m.vb.byteLength + m.ib.byteLength };
    };
    G.free = function(h){ if(!h) return; gl.deleteVertexArray(h.vao); gl.deleteBuffer(h.vb); gl.deleteBuffer(h.ib); };
    /* ---- frame ---- */
    G.resize = function(w, h, dpr){ dpr = dpr || 1; const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr)); if(canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; } G.W = W; G.H = H; };
    G.begin = function(cam, env, t){
      G.env = env; G.time = t; G.cam = cam.pos; G.fov = cam.fov; const asp = G.W / G.H, P = m4.perspective(cam.fov, asp, cam.near || 0.3, cam.far || 1600), V = m4.view(cam.pos, cam.yaw, cam.pitch, cam.roll); G.V = V; G.asp = asp;
      G.vp = m4.mul(P, V.m); G.planes = planes(G.vp); G.tris = 0; G.calls = 0;
      gl.viewport(0, 0, G.W, G.H); gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    };
    G.sky = function(cloud){ const e = G.env, V = G.V; gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(pS); const u = pS.u; gl.uniform3fv(u.uF, V.f); gl.uniform3fv(u.uR, V.r); gl.uniform3fv(u.uU, V.u); gl.uniform3fv(u.uCam, G.cam); gl.uniform3fv(u.uSunDir, e.sunDir); gl.uniform3fv(u.uZen, e.zenith); gl.uniform3fv(u.uHor, e.horizon); gl.uniform3fv(u.uSunCol, e.sunDisc);
      gl.uniform1f(u.uTan, Math.tan(G.fov / 2)); gl.uniform1f(u.uAsp, G.asp); gl.uniform1f(u.uNight, e.night); gl.uniform1f(u.uTime, G.time); gl.uniform1f(u.uCloud, cloud == null ? 1 : cloud); gl.uniform1f(u.uQ, G.q); gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); };
    let curW = false;
    G.startWorld = function(){ gl.useProgram(pW); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.uniformMatrix4fv(pW.u.uVP, false, G.vp); setEnv(pW); curW = true; };
    G.visible = function(h, x0, z0, x1, z1, pad){ pad = pad || 0; const y0 = h.minY - 2, y1 = h.maxY + 2; for(let i = 0; i < 6; i++){ const p = G.planes[i]; if(p[0] * (p[0] > 0 ? x1 + pad : x0 - pad) + p[1] * (p[1] > 0 ? y1 : y0) + p[2] * (p[2] > 0 ? z1 + pad : z0 - pad) + p[3] < 0) return false; } return true; };
    /* fade: 1 = solid; dir 1 = this mesh is appearing, 0 = it is the old mesh disappearing (the two dither complementarily) */
    G.draw = function(h, fade, dir){ gl.uniform1f(pW.u.uFade, fade == null ? 1 : fade); gl.uniform1f(pW.u.uFadeDir, dir ? 1 : 0); gl.bindVertexArray(h.vao); gl.drawElements(gl.TRIANGLES, h.ni, h.type, 0); G.tris += h.ni / 3; G.calls++; };
    /* ---- actors ---- */
    const AM = actorMeshes(), meshes = {};
    function actorGPU(M){ const n = M.p.length / 3, buf = new ArrayBuffer(n * 24), f = new Float32Array(buf), i8 = new Int8Array(buf), u8 = new Uint8Array(buf); for(let i = 0; i < n; i++){ f[i * 6] = M.p[i * 3]; f[i * 6 + 1] = M.p[i * 3 + 1]; f[i * 6 + 2] = M.p[i * 3 + 2]; i8[i * 24 + 12] = Math.round(M.n[i * 3] * 127); i8[i * 24 + 13] = Math.round(M.n[i * 3 + 1] * 127); i8[i * 24 + 14] = Math.round(M.n[i * 3 + 2] * 127); u8[i * 24 + 16] = M.m[i * 4]; u8[i * 24 + 17] = M.m[i * 4 + 1]; u8[i * 24 + 18] = M.m[i * 4 + 2]; if(M.c){ u8[i * 24 + 20] = M.c[i * 3]; u8[i * 24 + 21] = M.c[i * 3 + 1]; u8[i * 24 + 22] = M.c[i * 3 + 2]; } }
      const vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer(), inst = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 24, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, 24, 16); gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, 24, 20);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(M.i), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1); gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1); gl.bindVertexArray(null);
      return { vao, inst, ni: M.i.length, cap: 0, piv: M.piv || [0.9, 1.42] }; }
    /* a model (see glb.js parse, baked by tools/bake-kenney.py: alpha 200+n = body part n) becomes an actor kind with its own colours and limb pivots {hip, shoulder} (metres) */
    G.setActorModel = function(kind, t, pivot){ const n = t.n, f = new Float32Array(t.vb), i8 = new Int8Array(t.vb), u8 = new Uint8Array(t.vb), M = { p: new Float32Array(n * 3), n: new Float32Array(n * 3), m: new Uint8Array(n * 4), c: new Uint8Array(n * 3), i: Uint16Array.from(t.ib), piv: pivot ? [pivot.hip, pivot.shoulder] : null };
      for(let i = 0; i < n; i++){ M.p[i * 3] = f[i * 5]; M.p[i * 3 + 1] = f[i * 5 + 1]; M.p[i * 3 + 2] = f[i * 5 + 2]; M.n[i * 3] = i8[i * 20 + 12] / 127; M.n[i * 3 + 1] = i8[i * 20 + 13] / 127; M.n[i * 3 + 2] = i8[i * 20 + 14] / 127;
        const part = u8[i * 20 + 19] - 200; M.m[i * 4] = part >= 0 && part <= 4 ? part : 0; M.m[i * 4 + 1] = 7; M.m[i * 4 + 2] = 255; M.c[i * 3] = u8[i * 20 + 16]; M.c[i * 3 + 1] = u8[i * 20 + 17]; M.c[i * 3 + 2] = u8[i * 20 + 18]; }
      AM[kind] = M; if(meshes[kind]){ gl.deleteVertexArray(meshes[kind].vao); gl.deleteBuffer(meshes[kind].inst); delete meshes[kind]; } return true; };
    /* floats = 8 per instance: x y z yaw | phase move shirt pants. Vehicles pass a `pivot` height: floats 5 and 6 of each instance are then PITCH (nose up +) and ROLL (right side down +) instead of phase / move */
    G.actors = function(kind, floats, count, pivot){ if(!count) return; let m = meshes[kind]; if(!m) m = meshes[kind] = actorGPU(AM[kind]);
      gl.useProgram(pA); gl.uniformMatrix4fv(pA.u.uVP, false, G.vp); gl.uniform2f(pA.u.uPiv, m.piv[0], m.piv[1]); gl.uniform2f(pA.u.uVeh, pivot == null ? 0 : 1, pivot || 0); setEnv(pA); gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER, m.inst);
      if(count * 8 > m.cap){ m.cap = Math.max(count * 8, m.cap * 2, 512); gl.bufferData(gl.ARRAY_BUFFER, m.cap * 4, gl.DYNAMIC_DRAW); } gl.bufferSubData(gl.ARRAY_BUFFER, 0, floats, 0, count * 8);
      gl.drawElementsInstanced(gl.TRIANGLES, m.ni, gl.UNSIGNED_SHORT, 0, count); G.tris += m.ni / 3 * count; G.calls++; curW = false; };

    /* ---- instanced props: upload a template once, then draw it with a (re-uploaded when changed) buffer of 8 floats per instance ---- */
    G.propUpload = function(m){
      const vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer(), inst = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.vb, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 20, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 20, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ib, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1); gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1); gl.bindVertexArray(null);
      return { vao, vb, ib, inst, ni: m.ni, type: m.ib instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, cap: 0, version: -1 };
    };
    G.propFree = function(h){ if(!h) return; gl.deleteVertexArray(h.vao); gl.deleteBuffer(h.vb); gl.deleteBuffer(h.ib); gl.deleteBuffer(h.inst); };
    /* floats: 8 per instance (x y z yaw | scale tint seed 0); `dirty` = the instance data changed since the last upload; far0..far1 = the metres over which the props dissolve */
    G.props = function(h, floats, count, dirty, far0, far1){ if(!count) return; gl.useProgram(pI); const u = pI.u; gl.uniformMatrix4fv(u.uVP, false, G.vp); setEnv(pI); gl.uniform1f(u.uTime, G.time); gl.uniform2f(u.uFar, far0, far1); gl.bindVertexArray(h.vao); gl.bindBuffer(gl.ARRAY_BUFFER, h.inst);
      if(dirty || h.version < 0){ if(count * 8 > h.cap){ h.cap = Math.max(count * 8, h.cap * 2, 1024); gl.bufferData(gl.ARRAY_BUFFER, h.cap * 4, gl.DYNAMIC_DRAW); } gl.bufferSubData(gl.ARRAY_BUFFER, 0, floats, 0, count * 8); h.version = 0; }
      gl.drawElementsInstanced(gl.TRIANGLES, h.ni, h.type, 0, count); G.tris += h.ni / 3 * count; G.calls++; curW = false; };
    /* ---- particles (snow / embers): a fixed cloud of seeds wrapped around the camera, animated entirely in the vertex shader ---- */
    let ptBuf = null, ptVAO = null, PTN = 700;
    G.particles = function(fx, scale){ if(!ptVAO){ const a = new Float32Array(PTN * 4); for(let i = 0; i < a.length; i++) a[i] = Math.random(); ptVAO = gl.createVertexArray(); ptBuf = gl.createBuffer(); gl.bindVertexArray(ptVAO); gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.bindVertexArray(null); }
      const c = fx.colors && fx.colors[0] || [1, 1, 1, 0.9]; gl.useProgram(pP); const u = pP.u; gl.uniformMatrix4fv(u.uVP, false, G.vp); gl.uniform3fv(u.uCam, G.cam); gl.uniform1f(u.uTime, G.time); gl.uniform1f(u.uFall, (fx.dir || -1) * -1 * 60 * Math.max(0.2, (fx.fall || 0.15) * 4)); gl.uniform1f(u.uSize, 0.35 + (fx.size || 0.012) * 40); gl.uniform1f(u.uScale, scale || 900); gl.uniform1f(u.uSpread, 46); gl.uniform4f(u.uCol, c[0], c[1], c[2], c[3]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, fx.blend === 'add' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.bindVertexArray(ptVAO); gl.drawArrays(gl.POINTS, 0, PTN); gl.depthMask(true); gl.disable(gl.BLEND); };
    /* ---- fx sprites (fx.js: explosions, smoke, sparks): `a` = n × 8 floats (x y z size r g b a), one point sprite each; add = additive (fire, sparks) or normal blend (smoke, debris); scale = px per metre at 1 m
     * (cv.height / (2 tan(fov/2))); lit dims the normal-blend colours at night. Depth-tested against the world, never written. ---- */
    let fxVAO = null, fxBuf = null, fxCap = 0, fxMax = 64; try{ fxMax = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64; }catch(e){}
    G.fx = function(a, n, add, scale, lit){ if(!n) return;
      if(!fxVAO){ fxVAO = gl.createVertexArray(); fxBuf = gl.createBuffer(); fxCap = 0; gl.bindVertexArray(fxVAO); gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16); }
      gl.useProgram(pF); const u = pF.u; gl.uniformMatrix4fv(u.uVP, false, G.vp); gl.uniform1f(u.uScale, scale || 900); gl.uniform1f(u.uMax, Math.min(fxMax, 420)); gl.uniform1f(u.uLit, lit == null ? 1 : lit); gl.uniform1f(u.uAdd, add ? 1 : 0);
      gl.bindVertexArray(fxVAO); gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf); if(n * 8 > fxCap){ fxCap = Math.max(n * 8, fxCap * 2, 4096); gl.bufferData(gl.ARRAY_BUFFER, fxCap * 4, gl.DYNAMIC_DRAW); } gl.bufferSubData(gl.ARRAY_BUFFER, 0, a, 0, n * 8);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawArrays(gl.POINTS, 0, n); gl.depthMask(true); gl.disable(gl.BLEND); G.calls++; curW = false; };
    /* ---- wall screens: a textured quad whose picture is a 2D canvas (painted by RealWorld.Screens), re-uploaded only when its content changes ---- */
    G.screenMake = function(canvas, c){ const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const v = new Float32Array([c[0][0], c[0][1], c[0][2], 0, 0, c[1][0], c[1][1], c[1][2], 1, 0, c[2][0], c[2][1], c[2][2], 1, 1, c[3][0], c[3][1], c[3][2], 0, 1]), vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW); gl.bindVertexArray(null); return { tex, vao, vb, ib, canvas }; };
    G.screenUpdate = function(s){ gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.canvas); };
    G.screenFree = function(s){ gl.deleteTexture(s.tex); gl.deleteVertexArray(s.vao); gl.deleteBuffer(s.vb); gl.deleteBuffer(s.ib); };
    G.screensDraw = function(list){ if(!list.length) return; gl.useProgram(pT); gl.uniformMatrix4fv(pT.u.uVP, false, G.vp); gl.uniform1i(pT.u.uTex, 0); gl.activeTexture(gl.TEXTURE0); gl.disable(gl.CULL_FACE); list.forEach(s => { gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.bindVertexArray(s.vao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); G.calls++; }); gl.enable(gl.CULL_FACE); };
    G.lost = false; canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); G.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { G.lost = false; for(const k in meshes) delete meshes[k]; ptVAO = null; fxVAO = null; compile(); try{ G.restoreQuality(); }catch(e){} if(G.onRestore) G.onRestore(); });
    G.destroy = function(){ try{ const x = gl.getExtension('WEBGL_lose_context'); if(x) x.loseContext(); }catch(e){} };
    return G;
  }
  RW.GFX = { create, m4, planes };
})(typeof self !== 'undefined' ? self : this);
