import * as THREE from 'three';

// --- 1. AUDIO ENGINE ---
let synth = null;
let isPlaying = false;

async function initAudio() {
    // Unlock the browser's audio context
    await Tone.start();
    
    if (!synth) {
        synth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
        }).toDestination();
        synth.volume.value = -10; // Start at a safe volume
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

// The Sharper Chladni Shader
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
        // We use much higher multipliers to create dense, intricate patterns
        float n = uFrequency * 0.2; // Ring density
        float m = uFrequency * 0.1; // Spoke density

        // Create the nodal pattern (interference of rings and spokes)
        float rings = cos(n * 3.14159 * r);
        float spokes = cos(m * 3.14159 * theta);
        
        // Absolute value creates bright lines where the waves cancel out (nodal lines)
        float pattern = abs(rings * spokes);

        // Sharpen the lines to make them glow intensely
        float line = smoothstep(0.05, 0.0, pattern);

        // Circular mask (cuts off everything outside the plate)
        float mask = 1.0 - smoothstep(0.95, 1.0, r);
        
        // Central glow
        float glow = 1.0 - smoothstep(0.0, 0.4, r);

        // --- COLOR MAPPING ---
        // Map frequency to a vibrant color
        float hue = fract(uFrequency * 0.002);
        vec3 color = vec3(0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.67)));

        // Add a rapid vibration effect ONLY when playing
        float vibration = sin(uTime * 30.0) * 0.03 * uIsPlaying;
        line += vibration;

        // Combine line, glow, and mask
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
        uIsPlaying: { value: 0.0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Animation Loop
let visualTime = 0.0;
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Only advance time when audio is playing (freezes the pattern when stopped)
    if (isPlaying) {
        visualTime += dt;
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
    // Update Audio
    if (isPlaying && synth) {
        synth.frequency.rampTo(freq, 0.5);
    }
    // Update Visuals
    material.uniforms.uFrequency.value = freq;
}

// NOTE: We made this async to await the audio context unlock
playBtn.addEventListener('click', async () => {
    await initAudio(); // Unlock audio
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
