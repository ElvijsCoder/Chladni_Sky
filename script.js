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
// Orthographic camera for full-screen 2D
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Updated Shader Code
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
    uniform float uAmplitude;
    varying vec2 vUv;

    void main() {
        // Center coordinates
        vec2 uv = vUv - 0.5;
        float r = length(uv) * 2.0;
        float theta = atan(uv.y, uv.x);

        // --- CHLADNI FIGURE MATH ---
        // Scale frequency to get the right number of rings and spokes
        float n = uFrequency * 0.08; // Ring density
        float m = uFrequency * 0.04; // Spoke density

        // Create the nodal pattern (interference of rings and spokes)
        float rings = cos(n * 3.14159 * r);
        float spokes = sin(m * 3.14159 * theta);
        float pattern = abs(rings * spokes);

        // Sharpen the lines to make them glow
        float line = smoothstep(0.05, 0.0, pattern);

        // Add a circular mask so it looks like a plate
        float plateMask = smoothstep(0.95, 0.85, r);
        line *= plateMask;

        // --- COLOR MAPPING ---
        // Map frequency to a color (hue)
        float hue = fract(uFrequency * 0.002);
        vec3 color = vec3(0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.67)));

        // Central glow
        float glow = 1.0 - smoothstep(0.0, 0.9, r);
        
        // Combine line color with glow
        vec3 finalColor = color * (line * 2.0 + glow * 0.15);

        // Output with transparency
        gl_FragColor = vec4(finalColor, line + glow * 0.15);
    }
`;

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
        uFrequency: { value: 194.18 },
        uTime: { value: 0.0 },
        uAmplitude: { value: 1.0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending // Creates the neon glow effect
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Animation Loop
let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    
    const elapsedTime = clock.getElapsedTime();
    material.uniforms.uTime.value = elapsedTime;

    // Pulse when audio is playing
    if (isPlaying) {
        material.uniforms.uAmplitude.value = 1.0 + Math.sin(elapsedTime * 10) * 0.1;
    } else {
        material.uniforms.uAmplitude.value = 1.0;
    }

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
    // Update Audio
    if (isPlaying) {
        synth.frequency.rampTo(freq, 0.5); // Smooth glide
    }
    // Update Visuals
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
