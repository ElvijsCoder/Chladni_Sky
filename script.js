import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================
// 1. AUDIO ENGINE (Tone.js with Binaural Beats)
// ============================================
let synthL = null;
let synthR = null;
let isPlaying = false;
let binauralEnabled = false;
let audioContextReady = false;

const BINAURAL_OFFSET = 7; // Hz difference between ears

async function initAudio() {
    await Tone.start();
    if (!synthL) {
        // Left ear oscillator
        synthL = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
        });
        const pannerL = new Tone.Panner(-1).toDestination();
        synthL.connect(pannerL);
        synthL.volume.value = -10;

        // Right ear oscillator
        synthR = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
        });
        const pannerR = new Tone.Panner(1).toDestination();
        synthR.connect(pannerR);
        synthR.volume.value = -10;
    }
    audioContextReady = true;
}

function playFrequency(freq) {
    if (!synthL || !synthR) return;
    
    if (binauralEnabled) {
        // Binaural mode: different frequencies for each ear
        synthL.triggerAttack(freq);
        synthR.triggerAttack(freq + BINAURAL_OFFSET);
    } else {
        // Mono mode: same frequency both ears
        synthL.triggerAttack(freq);
        synthR.triggerAttack(freq);
    }
    isPlaying = true;
}

function stopAudio() {
    if (synthL) synthL.triggerRelease();
    if (synthR) synthR.triggerRelease();
    isPlaying = false;
}

function updateFrequency(freq) {
    if (isPlaying && synthL && synthR) {
        if (binauralEnabled) {
            synthL.frequency.rampTo(freq, 1.5);
            synthR.frequency.rampTo(freq + BINAURAL_OFFSET, 1.5);
        } else {
            synthL.frequency.rampTo(freq, 1.5);
            synthR.frequency.rampTo(freq, 1.5);
        }
    }
}

// ============================================
// 2. VISUAL ENGINE (Three.js + GPGPU Sand)
// ============================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Dual cameras for 2D/3D toggle
const cameraOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
cameraOrtho.position.z = 1;

const cameraPersp = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
cameraPersp.position.set(0, 0, 3);

let activeCamera = cameraOrtho;
let is3D = false;

// Renderer with high-performance settings
const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

// --- Post-Processing Pipeline (Bloom) ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, activeCamera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,  // strength
    0.6,  // radius
    0.3   // threshold
);
composer.addPass(bloomPass);

// --- GPGPU Sand Particle System ---
const PARTICLE_COUNT = 65536; // 256x256 grid
const TEXTURE_SIZE = 256;

// Create the particle geometry (positions will be updated by GPGPU)
const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const uvs = new Float32Array(PARTICLE_COUNT * 2);

for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = (i % TEXTURE_SIZE) / TEXTURE_SIZE;
    const y = Math.floor(i / TEXTURE_SIZE) / TEXTURE_SIZE;
    uvs[i * 2] = x;
    uvs[i * 2 + 1] = y;
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
}

particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

// Particle material with custom shader
const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uFrequency: { value: 194.18 },
        uAmplitude: { value: 0.5 },
        uIsPlaying: { value: 0 },
        uMode: { value: 0 },
        uAspect: { value: window.innerWidth / window.innerHeight },
        uSize: { value: 2.5 * Math.min(window.devicePixelRatio, 2) },
        uColor: { value: new THREE.Color(0x8A2BE2) }
    },
    vertexShader: `
        attribute vec2 uv;
        uniform float uTime;
        uniform float uFrequency;
        uniform float uAmplitude;
        uniform float uIsPlaying;
        uniform float uMode;
        uniform float uAspect;
        uniform float uSize;
        varying float vAlpha;
        varying float vDist;

        // Chladni field calculation
        float chladniField(vec2 uv, float n, float m) {
            vec2 centered = uv * 2.0 - 1.0;
            centered.x *= uAspect;
            
            float r = length(centered);
            float theta = atan(centered.y, centered.x);
            
            // Circle mode: polar coordinates
            float circleVal = cos(n * 3.14159 * r) * cos(m * 3.14159 * theta);
            
            // Square mode: cartesian coordinates
            vec2 sq = (centered + 1.0) * 0.5;
            float squareVal = sin(n * 3.14159 * sq.x) * sin(m * 3.14159 * sq.y)
                            + sin(m * 3.14159 * sq.x) * sin(n * 3.14159 * sq.y);
            
            return mix(circleVal, squareVal, uMode);
        }

        void main() {
            vec2 gridUv = uv;
            
            // Calculate field value
            float n = floor(uFrequency / 8.0);
            float m = floor(uFrequency / 12.0);
            float field = chladniField(gridUv, n, m);
            
            // Particles settle at nodal lines (where field is near zero)
            float distToNode = abs(field);
            
            // Add vibration when playing
            float vib = sin(uTime * 40.0 + uv.x * 100.0 + uv.y * 100.0) 
                       * 0.08 * uIsPlaying * uAmplitude;
            
            // Displacement from plate
            vec3 pos = vec3(
                (gridUv.x * 2.0 - 1.0) * uAspect,
                (gridUv.y * 2.0 - 1.0),
                0.0
            );
            
            // Push particles down based on distance to nodal line
            pos.z = -distToNode * 0.5 + vib;
            
            // Add slight scatter based on how far from node
            float scatter = distToNode * 0.3 * uIsPlaying;
            pos.x += sin(uv.y * 50.0 + uTime) * scatter;
            pos.y += cos(uv.x * 50.0 + uTime) * scatter;
            
            vAlpha = 1.0 - distToNode * 2.0;
            vAlpha = max(0.0, vAlpha);
            vDist = distToNode;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = uSize * (1.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 uColor;
        uniform float uAmplitude;
        varying float vAlpha;
        varying float vDist;

        void main() {
            // Circular particle shape
            vec2 center = gl_PointCoord - 0.5;
            float dist = length(center);
            if (dist > 0.5) discard;
            
            // Soft glow
            float glow = 1.0 - smoothstep(0.0, 0.5, dist);
            glow *= glow;
            
            // Color intensity based on proximity to nodal line
            float intensity = (1.0 - vDist) * 3.0;
            intensity *= (0.7 + uAmplitude * 0.6);
            
            vec3 finalColor = uColor * intensity;
            float alpha = glow * vAlpha * (0.5 + uAmplitude * 0.5);
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// ============================================
// 3. PLANET DATA & PRESET GRID
// ============================================
const planets = [
    { name: 'Earth (Day)', freq: 194.18, color: '#FF6B35', desc: 'The rotation of Earth on its axis creates a fundamental frequency of 194.18 Hz.' },
    { name: 'Moon (Synodic)', freq: 210.42, color: '#FFD700', desc: 'The synodic month (new moon to new moon) corresponds to 210.42 Hz.' },
    { name: 'Sun', freq: 136.10, color: '#FF4500', desc: 'The Sun\'s 27-day rotation generates a tone of 136.10 Hz.' },
    { name: 'Mercury', freq: 141.27, color: '#00CED1', desc: 'Mercury\'s 88-day orbit produces 141.27 Hz.' },
    { name: 'Venus', freq: 221.23, color: '#FF69B4', desc: 'Venus\' 225-day orbit creates a tone of 221.23 Hz.' },
    { name: 'Mars', freq: 144.72, color: '#DC143C', desc: 'Mars\' 687-day orbit generates 144.72 Hz.' },
    { name: 'Jupiter', freq: 183.58, color: '#FF8C00', desc: 'Jupiter\'s 12-year orbit corresponds to 183.58 Hz.' },
    { name: 'Saturn', freq: 207.36, color: '#DDA0DD', desc: 'Saturn\'s 29-year orbit produces 207.36 Hz.' },
    { name: 'Uranus', freq: 211.44, color: '#40E0D0', desc: 'Uranus\' 84-year orbit creates 211.44 Hz.' },
    { name: 'Neptune', freq: 221.23, color: '#4169E1', desc: 'Neptune\'s 165-year orbit generates 221.23 Hz.' },
    { name: 'Pluto', freq: 140.25, color: '#9370DB', desc: 'Pluto\'s 248-year orbit corresponds to 140.25 Hz.' }
];

let currentPlanet = planets[0];
let targetN = currentPlanet.freq * 0.05;
let targetM = currentPlanet.freq * 0.03;
let currentN = targetN;
let currentM = targetM;

// Build preset grid
const planetGrid = document.getElementById('planet-grid');
planets.forEach((planet, index) => {
    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    if (index === 0) btn.classList.add('active');
    btn.innerHTML = `${planet.name}<span class="freq">${planet.freq} Hz</span>`;
    btn.addEventListener('click', () => selectPlanet(planet, btn));
    planetGrid.appendChild(btn);
});

function selectPlanet(planet, btn) {
    currentPlanet = planet;
    
    // Update UI
    document.querySelectorAll('.planet-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // Update visual targets
    targetN = planet.freq * 0.05;
    targetM = planet.freq * 0.03;
    
    // Update audio
    updateFrequency(planet.freq);
    
    // Update color
    particleMaterial.uniforms.uColor.value.set(planet.color);
    
    // Update info
    document.getElementById('info-text').textContent = planet.desc;
}

// ============================================
// 4. ANIMATION LOOP
// ============================================
let visualTime = 0.0;
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05); // Cap dt to prevent jumps
    lastTime = now;

    if (isPlaying) {
        visualTime += dt;
        
        // Smooth morphing
        currentN += (targetN - currentN) * 0.04;
        currentM += (targetM - currentM) * 0.04;
    }
    
    // Update uniforms
    const u = particleMaterial.uniforms;
    u.uTime.value = visualTime;
    u.uIsPlaying.value = isPlaying ? 1.0 : 0.0;
    u.uFrequency.value = currentPlanet.freq * 0.05; // Use for density calculation
    u.uAspect.value = window.innerWidth / window.innerHeight;
    
    // Subtle rotation
    particles.rotation.y += dt * 0.05;
    particles.rotation.x += dt * 0.02;
    
    // Render through composer for bloom
    composer.render();
    
    // Auto-hide UI
    updateUIHideTimer();
}

// Start animation
animate();

// ============================================
// 5. UI EVENT LISTENERS
// ============================================
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const volumeSlider = document.getElementById('volume');
const modeToggle = document.getElementById('mode-toggle');
const viewToggle = document.getElementById('view-toggle');
const binauralToggle = document.getElementById('binaural-toggle');
const midiStatus = document.getElementById('midi-status');
const uiPanel = document.getElementById('ui-panel');

// Play button
playBtn.addEventListener('click', async () => {
    if (!audioContextReady) await initAudio();
    playFrequency(currentPlanet.freq);
    playBtn.classList.add('active');
});

// Stop button
stopBtn.addEventListener('click', () => {
    stopAudio();
    playBtn.classList.remove('active');
});

// Volume slider
volumeSlider.addEventListener('input', (e) => {
    const vol = Math.max(0.001, parseFloat(e.target.value));
    const db = Tone.gainToDb(vol);
    if (synthL) synthL.volume.rampTo(db, 0.1);
    if (synthR) synthR.volume.rampTo(db, 0.1);
    particleMaterial.uniforms.uAmplitude.value = vol;
});

// Circle/Square mode toggle
modeToggle.addEventListener('click', () => {
    const isSquare = particleMaterial.uniforms.uMode.value === 0.0;
    particleMaterial.uniforms.uMode.value = isSquare ? 1.0 : 0.0;
    modeToggle.textContent = isSquare ? "Square Mode" : "Circle Mode";
});

// 2D/3D view toggle
viewToggle.addEventListener('click', () => {
    is3D = !is3D;
    activeCamera = is3D ? cameraPersp : cameraOrtho;
    viewToggle.textContent = is3D ? "3D View" : "2D View";
    
    // Update composer's render pass camera
    composer.passes[0].camera = activeCamera;
});

// Binaural beats toggle
binauralToggle.addEventListener('change', (e) => {
    binauralEnabled = e.target.checked;
    if (isPlaying) {
        // Re-trigger with new settings
        stopAudio();
        setTimeout(() => playFrequency(currentPlanet.freq), 100);
    }
});

// ============================================
// 6. AUTO-HIDING UI
// ============================================
let uiHideTimer = null;
let uiVisible = true;

function updateUIHideTimer() {
    if (uiHideTimer) clearTimeout(uiHideTimer);
    
    if (!uiVisible) {
        uiPanel.classList.remove('hidden');
        uiVisible = true;
    }
    
    uiHideTimer = setTimeout(() => {
        if (isPlaying) {
            uiPanel.classList.add('hidden');
            uiVisible = false;
        }
    }, 4000);
}

// Show UI on mouse move
document.addEventListener('mousemove', updateUIHideTimer);

// ============================================
// 7. MOUSE INTERACTIVITY
// ============================================
let mouseX = 0, mouseY = 0;
let targetFreq = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Drag to change frequency
let isDragging = false;

renderer.domElement.addEventListener('mousedown', () => {
    isDragging = true;
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

document.addEventListener('mousemove', (e) => {
    if (isDragging && isPlaying) {
        // Map mouse X to frequency range (100 Hz to 300 Hz)
        const freq = 100 + ((e.clientX / window.innerWidth) * 200);
        updateFrequency(freq);
        particleMaterial.uniforms.uFrequency.value = freq;
        
        // Update target visual density
        targetN = freq * 0.05;
        targetM = freq * 0.03;
    }
});

// ============================================
// 8. MIDI SUPPORT
// ============================================
async function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        midiStatus.textContent = 'MIDI: Not supported';
        return;
    }
    
    try {
        const midiAccess = await navigator.requestMIDIAccess();
        midiStatus.textContent = 'MIDI: Connected';
        midiStatus.classList.add('connected');
        
        for (const input of midiAccess.inputs.values()) {
            input.onmidimessage = (message) => {
                const [status, note, velocity] = message.data;
                
                // Note On (0x90)
                if ((status & 0xF0) === 0x90 && velocity > 0) {
                    // Map MIDI note to frequency (A4 = 440 Hz = note 69)
                    const freq = 440 * Math.pow(2, (note - 69) / 12);
                    
                    if (!audioContextReady) initAudio();
                    playFrequency(freq);
                    particleMaterial.uniforms.uFrequency.value = freq;
                    targetN = freq * 0.05;
                    targetM = freq * 0.03;
                    
                    playBtn.classList.add('active');
                }
                
                // Note Off (0x80)
                if ((status & 0xF0) === 0x80) {
                    stopAudio();
                    playBtn.classList.remove('active');
                }
            };
        }
    } catch (err) {
        midiStatus.textContent = 'MIDI: Denied';
    }
}

// Initialize MIDI on first user interaction
document.addEventListener('click', () => {
    if (midiStatus.textContent === 'MIDI: Off') {
        initMIDI();
    }
}, { once: true });

// ============================================
// 9. WINDOW RESIZE HANDLER
// ============================================
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update cameras
    cameraOrtho.left = -1;
    cameraOrtho.right = 1;
    cameraOrtho.top = 1;
    cameraOrtho.bottom = -1;
    cameraOrtho.updateProjectionMatrix();
    
    cameraPersp.aspect = width / height;
    cameraPersp.updateProjectionMatrix();
    
    // Update renderer and composer
    renderer.setSize(width, height);
    composer.setSize(width, height);
    
    // Update aspect uniform
    particleMaterial.uniforms.uAspect.value = width / height;
});

// ============================================
// 10. URL PRESET SHARING
// ============================================
function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const planetName = params.get('planet');
    const freq = params.get('freq');
    const mode = params.get('mode');
    const view = params.get('view');
    
    if (planetName) {
        const planet = planets.find(p => p.name === decodeURIComponent(planetName));
        if (planet) {
            selectPlanet(planet, document.querySelector('.planet-btn'));
        }
    }
    
    if (freq) {
        const f = parseFloat(freq);
        particleMaterial.uniforms.uFrequency.value = f;
        targetN = f * 0.05;
        targetM = f * 0.03;
    }
    
    if (mode === 'square') {
        particleMaterial.uniforms.uMode.value = 1.0;
        modeToggle.textContent = 'Square Mode';
    }
    
    if (view === '3d') {
        is3D = true;
        activeCamera = cameraPersp;
        viewToggle.textContent = '3D View';
        composer.passes[0].camera = activeCamera;
    }
}

function updateURL() {
    const params = new URLSearchParams();
    params.set('planet', encodeURIComponent(currentPlanet.name));
    params.set('freq', currentPlanet.freq);
    if (particleMaterial.uniforms.uMode.value === 1.0) params.set('mode', 'square');
    if (is3D) params.set('view', '3d');
    
    history.replaceState(null, '', `?${params.toString()}`);
}

// Load from URL on startup
loadFromURL();

// Update URL when settings change
setInterval(updateURL, 2000);
