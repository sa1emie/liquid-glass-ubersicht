// glass.widget — ONE shared Liquid Glass renderer for all the other widgets.
// Each widget registers its card element in window.__glassRects = [{getEl, radius}];
// this single WebGL canvas draws the Control-Center-style glass under each one,
// sampling bg.jpg (the dark frame of the wallpaper). Sits behind widget content.
import { css, React } from "uebersicht";

const WDIR = "$HOME/Library/Application Support/Übersicht/widgets/glass.widget";
export const command = `bash "${WDIR}/fetch.sh"`;
export const refreshFrequency = 24 * 60 * 60 * 1000; // daily; bg regen is weekly

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }";
const FRAG = `
precision highp float;
uniform vec3 iRes; uniform vec2 uImg; uniform vec2 uPos; uniform vec2 uHalf;
uniform float uRadius; uniform float uWhite; uniform float uBlur; uniform float uDark; uniform float uPx;
uniform sampler2D tex;
vec2 cover(vec2 uv){ float ca=iRes.x/iRes.y, ia=uImg.x/uImg.y; vec2 s=ca>ia?vec2(1.0,ia/ca):vec2(ca/ia,1.0); return (uv-0.5)*s+0.5; }
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r; }
void main(){
  vec2 fc = gl_FragCoord.xy; vec2 uv = fc/iRes.xy;
  vec2 p = fc - uPos;
  float d = sdRound(p, uHalf, uRadius);
  float fillMask = 1.0 - smoothstep(0.0, 1.5*uPx, d);
  float dsh = sdRound(p - vec2(0.0, -14.0*uPx), uHalf, uRadius);
  float shadow = (1.0 - smoothstep(0.0, 34.0*uPx, dsh)) * (1.0 - fillMask) * 0.45;
  if (fillMask <= 0.002 && shadow <= 0.002) { gl_FragColor = vec4(0.0); return; }
  if (fillMask <= 0.002) { gl_FragColor = vec4(0.01, 0.01, 0.05, shadow); return; }
  float depth = -d;
  float edge = 1.0 - smoothstep(0.0, 55.0*uPx, depth);
  vec2 dir = (uPos - fc) / (length(uPos - fc) + 1e-4);
  vec2 base = uv + dir * (edge*edge * 28.0*uPx / iRes.xy);
  vec4 acc = vec4(0.0); float tot = 0.0;
  for (float ix=-2.0; ix<=2.0; ix++) for (float iy=-2.0; iy<=2.0; iy++) {
    acc += texture2D(tex, cover(base + vec2(ix,iy)*uBlur/iRes.xy)); tot += 1.0;
  }
  acc /= tot;
  float caAmt = edge*edge * 0.012;
  float rC = texture2D(tex, cover(base + dir*caAmt)).r;
  float bC = texture2D(tex, cover(base - dir*caAmt)).b;
  vec3 col = vec3(mix(acc.r,rC,edge*0.85), acc.g, mix(acc.b,bC,edge*0.85));
  float lum = dot(col, vec3(0.299,0.587,0.114));
  col = mix(vec3(lum), col, 1.12);
  col *= uDark;
  col = mix(col, vec3(0.05,0.055,0.10), 0.12);
  float top = clamp(p.y/uHalf.y * 0.5 + 0.5, 0.0, 1.0);
  col += vec3(0.05) * (1.0-edge) * pow(top, 1.4);
  float rim = smoothstep(2.6*uPx, 0.0, abs(d));
  col += vec3(rim) * (0.30 + 0.40*top);
  col = mix(col, vec3(1.0), uWhite*0.5);
  gl_FragColor = vec4(clamp(col,0.0,1.0), max(fillMask, shadow));
}`;

function makeShader(gl, t, s) {
  const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
  if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error("glass.widget shader:", gl.getShaderInfoLog(o));
  return o;
}
function initGL(canvas) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, makeShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, makeShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);
  const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const pl = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0,0,0,0);
  const U = { res:gl.getUniformLocation(prog,"iRes"), img:gl.getUniformLocation(prog,"uImg"), pos:gl.getUniformLocation(prog,"uPos"),
              half:gl.getUniformLocation(prog,"uHalf"), radius:gl.getUniformLocation(prog,"uRadius"), white:gl.getUniformLocation(prog,"uWhite"),
              blur:gl.getUniformLocation(prog,"uBlur"), dark:gl.getUniformLocation(prog,"uDark"), px:gl.getUniformLocation(prog,"uPx"), tex:gl.getUniformLocation(prog,"tex") };
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20,22,48,255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { gl, U, tex, imgRes: [1,1] };
}

function GlassLayer() {
  const canvasRef = React.useRef(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = initGL(canvas);
    if (!ctx) return;
    const { gl, U, tex } = ctx;
    let tries = 0;
    const loadTex = () => {
      const im = new Image();
      im.onload = () => {
        ctx.imgRes = [im.naturalWidth, im.naturalHeight];
        gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      };
      im.onerror = () => { if (tries++ < 8) setTimeout(loadTex, 1500); };
      im.src = "bg.jpg?ts=" + Date.now();
    };
    loadTex();

    let raf, last = 0;
    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return;
      last = t;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth, H = window.innerHeight;
      const cw = Math.round(W*dpr), ch = Math.round(H*dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0,0,cw,ch); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform3f(U.res, cw, ch, 1.0); gl.uniform2f(U.img, ctx.imgRes[0], ctx.imgRes[1]);
      gl.uniform1f(U.white, 0.06); gl.uniform1f(U.dark, 0.88); gl.uniform1f(U.blur, 2.6*dpr); gl.uniform1f(U.px, dpr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.tex, 0);
      const rects = window.__glassRects || [];
      for (let i = 0; i < rects.length; i++) {
        const it = rects[i];
        const el = it && it.getEl && it.getEl();
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cx = (r.left + r.width/2)*dpr, cy = ch - (r.top + r.height/2)*dpr;
        gl.uniform2f(U.pos, cx, cy);
        gl.uniform2f(U.half, (r.width/2)*dpr, (r.height/2)*dpr);
        gl.uniform1f(U.radius, (it.radius || 22)*dpr);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className={canvasCss} />;
}

export const render = () => <GlassLayer />;

export const className = css` position: fixed; inset: 0; pointer-events: none; z-index: 1; `;
const canvasCss = css` position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; `;
