import * as THREE from 'three';

// --- 1. AUDIO ENGINE ---
let synth = null;
let isPlaying = false;

async function initAudio() {
    await Tone.start(); // Unlock browser audio
    
    if (!synth) {
        synth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
        }).toDestination();
        synth.volume.value = -10; // Safe starting volume
    }
}

function playFrequency(freq) {
    if (!synth) return;
    synth.triggerAttack(freq);
    isPlaying = true;
}

function stopAudio() {
    if (synth) synth.triggerRelease();
    isPlaying = false;
}

// --- 2. VISUAL ENGINE (Three.js + Custom Shader) ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// Updated Shader: Grains instead of Lines, Amplitude reactive
const fragmentShader = `
    uniform float uFrequency;
    uniform float uTime;
    uniform float uIsPlaying;
    uniform float uAspect;
    uniform float uAmplitude;
    varying vec2 vUv;

    void main() {
        // Center coordinates and correct for aspect ratio
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= uAspect;
        
        float r = length(uv);
        float theta = atan(uv.y, uv.x);

        // --- CHLADNI FIGURE MATH ---
        float n = uFrequency * 0.05; // Ring density
        float m = uFrequency * 0.03; // Spoke density

        // Create the nodal pattern
        float rings = cos(n * 3.14159 * r);
        float spokes = cos(m * 3.14159 * theta);
        float pattern = abs(rings * spokes);

        // Nodal lines (where the sand would settle)
        float line = smoothstep(0.15, 0.0, pattern);

        // Circular mask
        float mask = 1.0 - smoothstep(0.95, 1.0, r);
        
        // Central glow
        float glow = 1.0 - smoothstep(0.0, 0.5, r);

        // --- GRAIN GENERATION ---
        // Create a grid of points (the sand)
        vec2 grainUv = uv * 120.0; 
        vec2 grainId = floor(grainUv);
        vec2 grainPos = fract(grainUv) - 0.5;
        
        // Give each grain a random offset so it looks organic
        float rnd = fract(sin(dot(grainId, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 offset = vec2(rnd - 0.5, fract(rnd * 2.0) - 0.5) * 0.6;
        
        // Vibration effect: grains dance more when audio is playing and loud
        float vibration = sin(uTime * 30.0 + rnd * 10.0) * 0.05 * uIsPlaying * uAmplitude;
        
        // Distance to grain center
        float distToGrain = length(grainPos - offset) + vibration;
        float grainShape = smoothstep(0.3, 0.0, distToGrain);
        
        // Combine line and grain (this creates the "sand" effect)
        float finalGrain = line * grainShape;

        // --- COLOR MAPPING ---
        float hue = fract(uFrequency * 0.002);
        vec3 color = vec3(0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.67)));

        // Amplitude makes the grains glow brighter
        float ampGlow = 0.5 + uAmplitude * 0.5;

        vec3 finalColor = color * (finalGrain * 3.0 + glow * 0.2) * mask * ampGlow;
        float alpha = (finalGrain + glow * 0.2) * mask;

        gl_FragColor = vec4(finalColor, alpha);
    }
`;

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
        uFrequency: { value: 144.72 },
        uTime: { value: 0.0 },
        uIsPlaying: { value: 0.0 },
        uAspect: { value: window.innerWidth / window.innerHeight },
        uAmplitude: { value: 0.5 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Animation Loop
let visualTime = 0.0;
let lastTime = performance.now();

// Interpolation variables for smooth morphing
let targetFrequency = 144.72;
let currentFrequency = 144.72;

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Only advance time when audio is playing
    if (isPlaying) {
        visualTime += dt;
    }
    
    // Smoothly morph the frequency toward the target
    currentFrequency += (targetFrequency - currentFrequency) * 0.08;
    
    material.uniforms.uTime.value = visualTime;
    material.uniforms.uIsPlaying.value = isPlaying ? 1.0 : 0.0;
    material.uniforms.uFrequency.value = currentFrequency;

    renderer.render(scene, camera);
}
animate();

// Handle window resizing
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
});

// --- 3. UI EVENT LISTENERS ---
const planetSelect = document.getElementById('planet-select');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const volumeSlider = document.getElementById('volume');

function updateFrequency(freq) {
    targetFrequency = freq; // Set the target, the animation loop will smoothly glide to it
    if (isPlaying && synth) {
        synth.frequency.rampTo(freq, 1.0); // Smooth audio glide
    }
}

playBtn.addEventListener('click', async () => {
    await initAudio();
    const freq = parseFloat(planetSelect.value);
    targetFrequency = freq;
    currentFrequency = freq; // Snap visual instantly on first play
    playFrequency(freq);
    playBtn.classList.add('active');
});

stopBtn.addEventListener('click', () => {
    stopAudio();
    playBtn.classList.remove('active');
});

planetSelect.addEventListener('change', (e) => {
    const freq = parseFloat(e.target.value);
    updateFrequency(freq); // Visuals will morph, audio will glide
});

// Fixed the crackling sound and added visual reactivity
volumeSlider.addEventListener('input', (e) => {
    // Clamp minimum volume to avoid -Infinity dB
    const vol = Math.max(0.001, parseFloat(e.target.value));
    
    if (synth) {
        // rampTo smooths the volume change over 100ms, eliminating the crackle
        synth.volume.rampTo(Tone.gainToDb(vol), 0.1); 
    }
    
    // Pass the volume to the shader for visual reactivity
    material.uniforms.uAmplitude.value = vol;
});
