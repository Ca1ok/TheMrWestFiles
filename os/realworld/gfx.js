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
uniform vec3 uCam, uSunDir, uSunCol, uSky, uGround, uFogCol; uniform float uFogD, uNight, uTime;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 shadeIt(vec3 base, vec3 n, vec3 wp, float glow){
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5); vec3 col = base * (amb + uSunCol * max(dot(n, uSunDir), 0.0));
  if(glow > 0.5){ float cell = floor(wp.x * 0.33) + floor(wp.z * 0.33) * 7.0 + floor(wp.y / 3.1) * 13.0; float on = step(0.32, fract(sin(cell * 12.9898) * 43758.5453)); vec3 warm = vec3(1.0, 0.74, 0.38) * (0.8 + 0.5 * fract(cell * 0.37)) * 1.5; float sat = smoothstep(0.2, 0.45, max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b))); vec3 lit = mix(warm * on + base * 0.12, base * 2.4, sat);
    col = mix(mix(col, uFogCol * 1.15 + base * 0.15, 0.3 * (1.0 - uNight)), lit, uNight * mix(0.35 + 0.65 * on, 1.0, sat)); }
  float d = length(wp - uCam); return mix(col, uFogCol, 1.0 - exp(-pow(d * uFogD, 2.0))); }
vec3 outc(vec3 c){ c = c / (1.0 + c * 0.12); return pow(max(c, 0.0), vec3(1.0 / 2.2)); }`;
  const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol;
uniform mat4 uVP; out vec3 vN; out vec4 vC; out vec3 vWP;
void main(){ vN = aNrm; vC = aCol; vWP = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const WORLD_FS = COMMON + `
in vec3 vN; in vec4 vC; in vec3 vWP; uniform float uFade, uFadeDir; out vec4 oCol;
float bayer(vec2 p){ ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4; float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i] + 0.5) / 16.0; }
void main(){ if(uFade < 1.0){ float b = bayer(gl_FragCoord.xy); if(uFadeDir > 0.5 ? b >= uFade : b < uFade) discard; }
  oCol = vec4(outc(shadeIt(lin(vC.rgb), normalize(vN), vWP, vC.a < 0.9 ? 1.0 : 0.0)), 1.0); }`;

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
void main(){ float f = 1.0 - smoothstep(uFar.x, uFar.y, length(vWP - uCam)); if(f < 1.0 && bayer(gl_FragCoord.xy) >= f) discard;
  bool fol = vC.a > 0.95 && vC.a < 0.995; vec3 base = fol ? vT * vC.rgb : vC.rgb;
  oCol = vec4(outc(shadeIt(lin(base), normalize(vN), vWP, vC.a < 0.9 ? 1.0 : 0.0)), 1.0); }`;
  const ACT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aMeta; layout(location=3) in vec4 iPos; layout(location=4) in vec4 iAn; layout(location=5) in vec4 aBake;
uniform mat4 uVP; uniform vec2 uPiv; uniform vec2 uVeh; out vec3 vN; out vec3 vC; out vec3 vWP;
vec3 unpackC(float p){ return vec3(floor(p / 65536.0), floor(mod(p, 65536.0) / 256.0), mod(p, 256.0)) / 255.0; }
void main(){ vec3 p = aPos, n = aNrm; float part = aMeta.x, sw = sin(iAn.x) * iAn.y, ang = 0.0, pv = uPiv.x;
  if(part > 0.5 && part < 1.5) ang = sw * 0.75; else if(part < 2.5 && part > 1.5) ang = -sw * 0.75; else if(part < 3.5 && part > 2.5){ ang = -sw * 0.6; pv = uPiv.y; } else if(part < 4.5 && part > 3.5){ ang = sw * 0.6; pv = uPiv.y; }
  if(part > 0.5 && part < 4.5){ float c = cos(ang), s = sin(ang), y = p.y - pv; p = vec3(p.x, y * c - p.z * s + pv, y * s + p.z * c); n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c); }
  if(uVeh.x > 0.5){ float cp = cos(iAn.x), sp = sin(iAn.x), cr = cos(iAn.y), sr = sin(iAn.y); p.y -= uVeh.y; p = vec3(p.x * cr + p.y * sr, -p.x * sr + p.y * cr, p.z); n = vec3(n.x * cr + n.y * sr, -n.x * sr + n.y * cr, n.z); p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp); n = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp); p.y += uVeh.y; }   // vehicles: floats 5 / 6 are pitch (nose up +) and roll (right side down +) about the pivot height
  else p.y += abs(sin(iAn.x)) * iAn.y * 0.05 * step(part, 4.5);
  float th = -iPos.w, ct = cos(th), st = sin(th); p = vec3(p.x * ct + p.z * st, p.y, -p.x * st + p.z * ct); n = vec3(n.x * ct + n.z * st, n.y, -n.x * st + n.z * ct);
  vec3 shirt = unpackC(iAn.z), pants = unpackC(iAn.w), skin = mix(vec3(0.95, 0.76, 0.62), vec3(0.45, 0.30, 0.22), fract(iAn.z * 0.000173)); float sl = aMeta.y;
  vC = sl < 0.5 ? skin : sl < 1.5 ? shirt : sl < 2.5 ? pants : sl < 3.5 ? vec3(0.13, 0.1, 0.08) * (0.6 + fract(iAn.w * 0.00031)) : sl < 4.5 ? vec3(0.07) : sl < 5.5 ? shirt : vec3(0.3, 0.42, 0.55);
  if(sl > 6.5) vC = aBake.rgb;   /* slot 7 = a baked model colour (Kenney people) */
  vC *= aMeta.z / 255.0; vN = n; vWP = p + iPos.xyz; gl_Position = uVP * vec4(vWP, 1.0); }`;
  const ACT_FS = COMMON + `
in vec3 vN; in vec3 vC; in vec3 vWP; out vec4 oCol; void main(){ oCol = vec4(outc(shadeIt(lin(vC), normalize(vN), vWP, 0.0)), 1.0); }`;
  const SKY_VS = `#version 300 es
out vec2 vP; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vP = p * 2.0 - 1.0; gl_Position = vec4(vP, 1.0, 1.0); }`;
  const SKY_FS = `#version 300 es
precision highp float; in vec2 vP; out vec4 oCol;
uniform vec3 uF, uR, uU, uCam, uSunDir, uZen, uHor, uSunCol; uniform float uTan, uAsp, uNight, uTime, uCloud;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){ vec3 d = normalize(uF + uR * vP.x * uTan * uAsp + uU * vP.y * uTan); float y = max(d.y, 0.0), hz = pow(1.0 - y, 3.2);
  vec3 col = mix(uZen, uHor, hz); float sd = max(dot(d, uSunDir), 0.0); col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.28);
  if(uNight > 0.01){ vec2 g = floor(d.xz / (d.y + 0.35) * 90.0); float s = step(0.9975, h(g)); col += vec3(s) * uNight * smoothstep(0.05, 0.4, d.y); }
  if(d.y > 0.015 && uCloud > 0.0){ float t = 2200.0 / d.y; vec2 uv = (uCam.xz + d.xz * t) * 0.00045 + vec2(uTime * 0.004, 0.0); float c = vn(uv * 3.0) * 0.55 + vn(uv * 7.0) * 0.3 + vn(uv * 17.0) * 0.15; c = smoothstep(0.52, 0.8, c) * uCloud * smoothstep(0.015, 0.2, d.y);
    vec3 cc = mix(uHor * 0.9 + 0.15, vec3(1.0), 0.5) * mix(1.0, 0.18, uNight) + uSunCol * 0.2; col = mix(col, cc, c * 0.85); }
  col = col / (1.0 + col * 0.12); oCol = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0); }`;
  const PT_VS = `#version 300 es
layout(location=0) in vec4 aS; uniform mat4 uVP; uniform vec3 uCam; uniform float uTime, uFall, uSize, uScale, uSpread; out float vA;
void main(){ vec3 q = fract(aS.xyz + vec3(sin(uTime * 0.3 + aS.w * 20.0) * 0.02, uFall * uTime * 0.01 * (0.7 + aS.w * 0.6), cos(uTime * 0.25 + aS.w * 17.0) * 0.02)) - 0.5; vec3 wp = uCam + q * uSpread; vec4 c = uVP * vec4(wp, 1.0); gl_Position = c; gl_PointSize = clamp(uSize * uScale / max(c.w, 0.5), 1.0, 14.0); vA = 1.0 - smoothstep(0.2, 0.5, length(q)); }`;
  const PT_FS = `#version 300 es
precision mediump float; in float vA; uniform vec4 uCol; out vec4 oCol; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.4, 1.0, d)) * vA; if(a < 0.02) discard; oCol = vec4(uCol.rgb, uCol.a * a); }`;

  const SCR_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; uniform mat4 uVP; out vec2 vUV; void main(){ vUV = aUV; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const SCR_FS = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; out vec4 oCol; void main(){ vec3 c = texture(uTex, vUV).rgb; float scan = 0.96 + 0.04 * sin(vUV.y * 540.0); oCol = vec4(c * scan * 1.08, 1.0); }`;

  /* ---------------- people & cars (built once, drawn instanced) ---------------- */
  function actorMeshes(){
    const mk = () => ({ p: [], n: [], m: [], i: [] });
    const quad = (M, a, b, c, d, nn, part, slot, shade) => { const k = M.p.length / 3; [a, b, c, d].forEach(q => { M.p.push(q[0], q[1], q[2]); M.n.push(nn[0], nn[1], nn[2]); M.m.push(part, slot, shade, 0); }); const g = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]; if(g[0] * nn[0] + g[1] * nn[1] + g[2] * nn[2] >= 0) M.i.push(k, k + 1, k + 2, k, k + 2, k + 3); else M.i.push(k, k + 2, k + 1, k, k + 3, k + 2); };
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
    const planeM = (len, span, hgt, jet, twin) => { const M = mk(), l = len / 2, f = hgt * 0.5, fy = 0.55 + hgt * 0.3; bx(M, -f * 0.55, fy - f * 0.5, -l, f * 0.55, fy + f * 0.5, l, 5); bx(M, -f * 0.5, fy + f * 0.05, -l + 0.6, f * 0.5, fy + f * 0.3, -l + len * 0.3, 6); bx(M, -f * 0.56, fy - f * 0.04, -l + len * 0.25, f * 0.56, fy + f * 0.06, l - 0.4, 2);
      const wy = jet ? fy - f * 0.35 : fy + f * 0.5, ch = len * (jet ? 0.2 : 0.14); bx(M, -span / 2, wy, -ch * 0.2, span / 2, wy + 0.14, ch * 0.8, 5); bx(M, -span * 0.18, fy + f * 0.45, l - len * 0.14, span * 0.18, fy + f * 0.55, l, 5); bx(M, -0.07, fy, l - len * 0.16, 0.07, fy + hgt * 0.9, l, 5);
      if(jet){ [-1, 1].forEach(q => bx(M, q * f * 0.75 - 0.3, fy, l - len * 0.28, q * f * 0.75 + 0.3, fy + 0.6, l - len * 0.05, 4)); } else if(twin){ [-1, 1].forEach(q => bx(M, q * span * 0.22 - 0.25, wy - 0.2, -ch - 0.8, q * span * 0.22 + 0.25, wy + 0.4, ch * 0.5, 4)); } else bx(M, -0.25, fy - 0.25, -l - 0.3, 0.25, fy + 0.25, -l, 4);
      bx(M, -0.09, 0, -l * 0.45, 0.09, fy - f * 0.5, -l * 0.45 + 0.2, 4); bx(M, -f * 0.5, 0, l * 0.1 - 0.15, -f * 0.5 + 0.2, fy - f * 0.5, l * 0.1 + 0.15, 4); bx(M, f * 0.5 - 0.2, 0, l * 0.1 - 0.15, f * 0.5, fy - f * 0.5, l * 0.1 + 0.15, 4); return M; };
    return { person: P, car: Cr, sedan: carM(4.5, 1.8, 0.95, 1.3, 3.4, 0.55, 0), hatch: carM(3.7, 1.7, 1.0, 1.0, 3.5, 0.6, 0), coupe: carM(4.5, 1.9, 0.8, 1.7, 3.3, 0.45, 0), suv: carM(4.9, 2.0, 1.15, 1.0, 4.6, 0.7, 0), pickup: carM(5.4, 2.0, 1.1, 1.0, 2.9, 0.65, 2.0),
      prop: planeM(6.8, 9.5, 2.0, false, false), turbo: planeM(10.5, 12.5, 2.4, false, true), jet: planeM(15.5, 13.5, 2.6, true, false) };
  }

  /* ---------------- the engine ---------------- */
  function create(canvas, opt){
    opt = opt || {}; let gl = null; try{ gl = canvas.getContext('webgl2', { antialias: opt.aa !== false, alpha: false, powerPreference: 'high-performance', stencil: false }); }catch(e){}
    if(!gl) return null;
    const G = { gl, canvas, W: 1, H: 1, tris: 0, calls: 0, env: null, vp: null, planes: null, cam: [0, 0, 0] };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ const m = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: ' + m); } return s; };
    const prog = (vs, fs, names) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); const u = {}; names.split(' ').forEach(n => { u[n] = gl.getUniformLocation(p, n); }); p.u = u; return p; };
    const ENV = 'uCam uSunDir uSunCol uSky uGround uFogCol uFogD uNight uTime';
    let pW, pA, pS, pP, pT, pI;
    function compile(){ pW = prog(WORLD_VS, WORLD_FS, 'uVP uFade uFadeDir ' + ENV); pA = prog(ACT_VS, ACT_FS, 'uVP uPiv uVeh ' + ENV); pS = prog(SKY_VS, SKY_FS, 'uF uR uU uCam uSunDir uZen uHor uSunCol uTan uAsp uNight uTime uCloud'); pP = prog(PT_VS, PT_FS, 'uVP uCam uTime uFall uSize uScale uSpread uCol'); pT = prog(SCR_VS, SCR_FS, 'uVP uTex'); pI = prog(PROP_VS, PROP_FS, 'uVP uFar ' + ENV); }
    compile();
    const emptyVAO = gl.createVertexArray();
    function setEnv(p){ const e = G.env, u = p.u; gl.uniform3fv(u.uCam, G.cam); gl.uniform3fv(u.uSunDir, e.sunDir); gl.uniform3fv(u.uSunCol, e.sunCol); gl.uniform3fv(u.uSky, e.sky); gl.uniform3fv(u.uGround, e.ground); gl.uniform3fv(u.uFogCol, e.fog); gl.uniform1f(u.uFogD, e.fogD); gl.uniform1f(u.uNight, e.night); gl.uniform1f(u.uTime, G.time); }
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
      gl.uniform1f(u.uTan, Math.tan(G.fov / 2)); gl.uniform1f(u.uAsp, G.asp); gl.uniform1f(u.uNight, e.night); gl.uniform1f(u.uTime, G.time); gl.uniform1f(u.uCloud, cloud == null ? 1 : cloud); gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); };
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
    /* ---- wall screens: a textured quad whose picture is a 2D canvas (painted by RealWorld.Screens), re-uploaded only when its content changes ---- */
    G.screenMake = function(canvas, c){ const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const v = new Float32Array([c[0][0], c[0][1], c[0][2], 0, 0, c[1][0], c[1][1], c[1][2], 1, 0, c[2][0], c[2][1], c[2][2], 1, 1, c[3][0], c[3][1], c[3][2], 0, 1]), vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW); gl.bindVertexArray(null); return { tex, vao, vb, ib, canvas }; };
    G.screenUpdate = function(s){ gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.canvas); };
    G.screenFree = function(s){ gl.deleteTexture(s.tex); gl.deleteVertexArray(s.vao); gl.deleteBuffer(s.vb); gl.deleteBuffer(s.ib); };
    G.screensDraw = function(list){ if(!list.length) return; gl.useProgram(pT); gl.uniformMatrix4fv(pT.u.uVP, false, G.vp); gl.uniform1i(pT.u.uTex, 0); gl.activeTexture(gl.TEXTURE0); gl.disable(gl.CULL_FACE); list.forEach(s => { gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.bindVertexArray(s.vao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); G.calls++; }); gl.enable(gl.CULL_FACE); };
    G.lost = false; canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); G.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { G.lost = false; for(const k in meshes) delete meshes[k]; ptVAO = null; compile(); if(G.onRestore) G.onRestore(); });
    G.destroy = function(){ try{ const x = gl.getExtension('WEBGL_lose_context'); if(x) x.loseContext(); }catch(e){} };
    return G;
  }
  RW.GFX = { create, m4, planes };
})(typeof self !== 'undefined' ? self : this);
