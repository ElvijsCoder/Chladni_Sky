import * as THREE from 'three';

// --- 1. AUDIO ENGINE (Tone.js) ---
let synth;
let isPlaying = false;

// Initialize the synth
function initAudio() {
    synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
    }).toDestination();
}

// Play a frequency
function playFrequency(freq) {
    if (!synth) initAudio();
    synth.triggerAttack(freq);
    isPlaying = true;
}

function stopAudio() {
    if (synth) synth.triggerRelease();
    isPlaying = false;
}

// --- 2. VISUAL ENGINE (Three.js) ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Create a simple placeholder geometry (We will replace this with the Chladni shader later)
const geometry = new THREE.SphereGeometry(2, 64, 64);
const material = new THREE.MeshBasicMaterial({ 
    color: 0x8A2BE2, 
    wireframe: true 
});
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

camera.position.z = 5;

// Animation Loop
let time = 0;
function animate() {
    requestAnimationFrame(animate);
    time += 0.01;

    // Simple rotation
    sphere.rotation.y += 0.005;
    sphere.rotation.x += 0.002;

    // Placeholder for frequency-driven vibration
    if (isPlaying) {
        sphere.scale.setScalar(1 + Math.sin(time * 10) * 0.05);
    } else {
        sphere.scale.setScalar(1);
    }

    renderer.render(scene, camera);
}
animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 3. UI EVENT LISTENERS ---
document.getElementById('play-btn').addEventListener('click', () => {
    // Earth Day Frequency
    playFrequency(194.18); 
});

document.getElementById('stop-btn').addEventListener('click', () => {
    stopAudio();
});

document.getElementById('volume').addEventListener('input', (e) => {
    if (synth) synth.volume.value = Tone.gainToDb(e.target.value);
});
