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
// Use Orthographic camera to make the 2D plane fill the screen perfectly
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// The Shader Code
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
        // Center the coordinates
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(vUv, center) * 2.0; // Normalize dist
        float angle = atan(vUv.y - 0.5, vUv.x - 0.5);

        // --- CHLADNI FIGURE MATH ---
        // We use sine waves to create the nodal lines (rings and spokes)
        // The frequency determines how many rings and spokes appear
        float ringFreq = uFrequency * 0.05;
        float spokeFreq = uFrequency * 0.02;

        // Create concentric rings
        float rings = sin(dist * ringFreq - uTime * 2.0) * 0.5 + 0.5;
        
        // Create radial spokes
        float spokes = sin(angle * spokeFreq + uTime) * 0.5 + 0.5;

        // Combine them to create the mandala pattern
        float pattern = rings * spokes;

        // Sharpen the pattern to create distinct glowing lines
        pattern = smoothstep(0.7, 1.0, pattern);

        // --- COLOR MAPPING ---
        // Map frequency to a color (e.g., low freq = orange/red, high freq = blue/purple)
        float hue = fract(uFrequency * 0.001); 
        vec3 color = vec3(0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.67)));

        // Add a central glow
        float glow = 1.0 - smoothstep(0.0, 0.5, dist);
        
        // Final output
        gl_FragColor = vec4(color * pattern + color * glow * 0.3, pattern + glow * 0.3);
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
    blending: THREE.AdditiveBlending // Creates that glowing neon effect
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Animation Loop
let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    
    const elapsedTime = clock.getElapsedTime();
    material.uniforms.uTime.value = elapsedTime;

    // Pulse the amplitude when audio is playing
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
        synth.frequency.rampTo(freq, 0.5); // Smooth glide to new frequency
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
