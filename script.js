import * as THREE from 'three';

// --- 1. AUDIO ENGINE ---
let synth;
let isPlaying = false;

function initAudio() {
    synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
    }).toDestination();
}

function playFrequency(freq) {
    if (!synth) initAudio();
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

// The Sharper Chladni Shader with Pause logic
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform float uFrequency;
    uniform float uTime;
    uniform float uIsPlaying;
    varying vec2 vUv;

    void main() {
        // Center coordinates (range -1 to 1)
        vec2 uv = vUv * 2.0 - 1.0;
        float r = length(uv);
        float theta = atan(uv.y, uv.x);

        // --- CHLADNI FIGURE MATH ---
        float n = uFrequency * 0.15; // Ring density
        float m = uFrequency * 0.08; // Spoke density

        // Add a breathing effect
        float breath = sin(uTime * 1.5) * 0.05;
        n += breath;
        m += breath;

        // Create the nodal pattern
        float rings = cos(n * 3.14159 * r);
        float spokes = sin(m * 3.14159 * theta);
        float pattern = abs(rings * spokes);

        // Sharpen the lines
        float line = smoothstep(0.15, 0.0, pattern);

        // Circular mask
        float mask = 1.0 - smoothstep(0.95, 1.0, r);
        
        // Central glow
        float glow = 1.0 - smoothstep(0.0, 0.4, r);

        // --- COLOR MAPPING ---
        float hue = fract(uFrequency * 0.002);
        vec3 color = vec3(0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.67)));

        // Add a vibration effect ONLY when playing
        float vibration = sin(uTime * 20.0) * 0.05 * uIsPlaying;
        line += vibration;

        // Combine
        vec3 finalColor = color * (line * 2.5 + glow * 0.2) * mask;
        float alpha = (line + glow * 0.2) * mask;

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
        uIsPlaying: { value: 0.0 } // 0.0 = false, 1.0 = true
    },
    transparent: true,
    blending: THREE.AdditiveBlending
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Animation Loop
let visualTime = 0.0;
function animate() {
    requestAnimationFrame(animate);
    
    // Only advance time when audio is playing
    if (isPlaying) {
        visualTime += 0.016; // Approx 60fps step
    }
    
    material.uniforms.uTime.value = visualTime;
    material.uniforms.uIsPlaying.value = isPlaying ? 1.0 : 0.0;

    renderer.render(scene, camera);
}
animate();

// Handle window resizing
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 3. UI EVENT LISTENERS ---
const planetSelect = document.getElementById('planet-select');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const volumeSlider = document.getElementById('volume');

function updateFrequency(freq) {
    if (isPlaying) {
        synth.frequency.rampTo(freq, 0.5);
    }
    material.uniforms.uFrequency.value = freq;
}

playBtn.addEventListener('click', () => {
    const freq = parseFloat(planetSelect.value);
    playFrequency(freq);
    updateFrequency(freq);
    playBtn.classList.add('active');
});

stopBtn.addEventListener('click', () => {
    stopAudio();
    playBtn.classList.remove('active');
});

planetSelect.addEventListener('change', (e) => {
    const freq = parseFloat(e.target.value);
    updateFrequency(freq);
});

volumeSlider.addEventListener('input', (e) => {
    if (synth) synth.volume.value = Tone.gainToDb(e.target.value);
});
