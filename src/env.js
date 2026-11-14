// Ambiance : ciel (jour / aube / nuit / orage), lumières, brouillard, post-traitement
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { lerp, mulberry32 } from './util.js';

const skyVS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const skyFS = `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform float clouds; uniform vec3 cloudCol; uniform float time; uniform float flash;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=.5; } return v; }
void main(){ vec3 d = normalize(vDir); float y = d.y;
  vec3 c = y > 0. ? mix(hor, top, pow(clamp(y,0.,1.), .55)) : mix(hor, bot, clamp(-y*4.,0.,1.));
  if (y > 0.02) { vec2 uv = d.xz/(y+.15)*1.4 + vec2(time*0.01, 0.); float k = smoothstep(.45, .8, fbm(uv)) * clouds * smoothstep(0.02, .25, y); c = mix(c, cloudCol, k); }
  c += flash * vec3(.55,.6,.8) * (0.4 + 0.6*clamp(y,0.,1.));
  gl_FragColor = vec4(c, 1.); }`;

const gradeFS = `uniform sampler2D tDiffuse; uniform float fade; uniform float flash; uniform float sepia; uniform float vignette; uniform float time; uniform float red; uniform float sat; uniform float contrast;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(.299,.587,.114));
  c = mix(vec3(l), c, sat);
  c = (c - .5) * contrast + .5;
  c = mix(c, vec3(l*1.08, l*.92, l*.72) + vec3(.04,.02,0.), sepia);
  c = mix(c, c*vec3(1.25,.55,.55), red);
  vec2 q = vUv - .5; q.x *= .62; float v = 1. - dot(q,q) * 2.2 * vignette; c *= clamp(v, 0., 1.);
  c += (h(floor(vUv*vec2(1080.,1920.)) + fract(time*13.)) - .5) * .03;
  c = mix(c, vec3(1.), flash);
  c *= 1. - fade;
  gl_FragColor = vec4(clamp(c,0.,1.), 1.); }`;

// Préréglages d'ambiance
export const PRESETS = {
  night: { top: '#0c1433', hor: '#4a5788', bot: '#1a1d2a', clouds: 0.25, cloudCol: '#3a4468', hemi: 0.75, hemiSky: '#7d8fca', hemiGround: '#2a2830', sun: 0.45, sunCol: '#9fb2ff', sunPos: [-60, 90, 40], fog: '#2c365a', fogD: 0.0026, exposure: 1.05 },
  day: { top: '#7f8ee0', hor: '#e7cfe6', bot: '#b9b4c0', clouds: 0.55, cloudCol: '#fdf6fa', hemi: 1.9, hemiSky: '#d6defc', hemiGround: '#a09a8c', sun: 2.8, sunCol: '#fff1de', sunPos: [70, 110, 80], fog: '#d8cde6', fogD: 0.0011, exposure: 1.0 },
  dawn: { top: '#4a5fa8', hor: '#ffb08a', bot: '#8a7c88', clouds: 0.5, cloudCol: '#ffc6a8', hemi: 1.3, hemiSky: '#b9b0e0', hemiGround: '#5a4a50', sun: 2.2, sunCol: '#ffc58a', sunPos: [140, 30, 60], fog: '#c9a0a0', fogD: 0.0016, exposure: 1.0 },
  storm: { top: '#0b0e18', hor: '#2c3446', bot: '#10131a', clouds: 0.9, cloudCol: '#232838', hemi: 0.65, hemiSky: '#6a78a0', hemiGround: '#1e1e26', sun: 0.3, sunCol: '#8fa2d8', sunPos: [-60, 90, 40], fog: '#1a2030', fogD: 0.006, exposure: 1.05 },
  black: { top: '#04060c', hor: '#141a2a', bot: '#07080b', clouds: 0.6, cloudCol: '#111522', hemi: 0.42, hemiSky: '#56608a', hemiGround: '#121216', sun: 0.18, sunCol: '#8899cc', sunPos: [-60, 90, 40], fog: '#06080e', fogD: 0.012, exposure: 1.0 },
};
const C = (a) => new THREE.Color(a);
export function mixPreset(a, b, k) {
  const A = PRESETS[a], B = PRESETS[b], o = {};
  for (const key in A) {
    const va = A[key], vb = B[key];
    if (typeof va === 'string') o[key] = C(va).lerp(C(vb), k);
    else if (Array.isArray(va)) o[key] = va.map((v, i) => lerp(v, vb[i], k));
    else o[key] = lerp(va, vb, k);
  }
  return o;
}

export class Env {
  constructor(renderer, scene, camera, W, H) {
    this.scene = scene;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: skyVS, fragmentShader: skyFS,
      uniforms: { top: { value: C('#000') }, hor: { value: C('#000') }, bot: { value: C('#000') }, clouds: { value: 0 }, cloudCol: { value: C('#fff') }, time: { value: 0 }, flash: { value: 0 } },
    }));
    scene.add(this.sky);
    // étoiles
    const r = mulberry32(5), sp = [];
    for (let i = 0; i < 1500; i++) { const a = r() * Math.PI * 2, y = 0.15 + r() * 0.85, s = Math.sqrt(1 - y * y); sp.push(Math.cos(a) * s * 850, y * 850, Math.sin(a) * s * 850); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff', size: 2, sizeAttenuation: false, transparent: true, fog: false }));
    scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: '#f4f1ff', fog: false }));
    this.moon.position.set(-300, 420, -600); scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight('#fff', '#444', 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff', 1);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun); scene.add(this.sun.target);
    // éclair : lumière directionnelle supplémentaire
    this.bolt = new THREE.DirectionalLight('#cdd8ff', 0); this.bolt.position.set(40, 120, -60); scene.add(this.bolt);
    scene.fog = new THREE.FogExp2('#000', 0.003);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 }));
    this.composer.setSize(W, H);
    this.renderPass = new RenderPass(scene, camera); this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W / 4, H / 4), 0.5, 0.45, 0.92); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, fade: { value: 0 }, flash: { value: 0 }, sepia: { value: 0 }, vignette: { value: 1 }, time: { value: 0 }, red: { value: 0 }, sat: { value: 1.12 }, contrast: { value: 1.05 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`, fragmentShader: gradeFS });
    this.composer.addPass(this.grade);
    this.fxaa = new ShaderPass(FXAAShader); this.fxaa.uniforms.resolution.value.set(1 / W, 1 / H); this.composer.addPass(this.fxaa);
  }
  // s : { preset:[a,b,k], flash, fade, sepia, red, bloom, bolt, starAmt, time, exposure }
  apply(s) {
    const p = mixPreset(...s.preset);
    const u = this.sky.material.uniforms;
    u.top.value.copy(p.top); u.hor.value.copy(p.hor); u.bot.value.copy(p.bot); u.clouds.value = p.clouds; u.cloudCol.value.copy(p.cloudCol); u.time.value = s.time; u.flash.value = s.bolt || 0;
    this.hemi.color.copy(p.hemiSky); this.hemi.groundColor.copy(p.hemiGround); this.hemi.intensity = p.hemi * (s.ambient ?? 1) + (s.bolt || 0) * 2;
    this.sun.color.copy(p.sunCol); this.sun.intensity = p.sun * (s.sunMul ?? 1); this.sun.position.set(...p.sunPos);
    this.bolt.intensity = (s.bolt || 0) * 5; this.bolt.visible = this.bolt.intensity > 0;
    this.sun.visible = this.sun.intensity > 0.01;
    this.scene.fog.color.copy(p.fog); this.scene.fog.density = p.fogD * (s.fogMul ?? 1);
    this.renderer.toneMappingExposure = (s.exposure ?? 1) * p.exposure;
    const night = s.night ?? 0;
    this.stars.material.opacity = night; this.stars.visible = night > 0.02;
    this.moon.visible = night > 0.3;
    const g = this.grade.uniforms;
    g.fade.value = s.fade || 0; g.flash.value = s.flash || 0; g.sepia.value = s.sepia || 0; g.red.value = s.red || 0; g.time.value = s.time;
    g.sat.value = s.sat ?? 1.12; g.vignette.value = s.vignette ?? 1;
    this.bloom.strength = (s.bloom ?? 0.6) * 0.6;
  }
  render() { this.composer.render(); }
}
