import * as THREE from 'three';

// --- 1. AUDIO ENGINE ---
let synth = null;
let isPlaying = false;

async function initAudio() {
    await Tone.start(); 
    if (!synth) {
        synth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
        }).toDestination();
        synth.volume.value = -10;
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

const fragmentShader = `
    uniform float uFrequency;
    uniform float uTime;
    uniform float uIsPlaying;
    uniform float uAspect;
    uniform float uAmplitude;
    uniform float uMode;
    uniform float uN; // Interpolated ring density
    uniform float uM; // Interpolated spoke density
    uniform float uScatter; // Transition scatter effect
    varying vec2 vUv;

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= uAspect;
        
        float r = length(uv);
        float theta = atan(uv.y, uv.x);

        // --- CHLADNI FIGURE MATH ---
        // Use interpolated N and M for smooth morphing
        float n = uN;
        float m = uM;

        // Circle Math
        float rings = cos(n * 3.14159 * r);
        float spokes = cos(m * 3.14159 * theta);
        float circlePattern = abs(rings * spokes);

        // Square Math (Scaled down to fit)
        vec2 squareUv = (uv + 1.0) * 0.5; // 0 to 1 range
        float squarePattern = abs(sin(n * 3.14159 * squareUv.x) * sin(m * 3.14159 * squareUv.y) 
                               + sin(m * 3.14159 * squareUv.x) * sin(n * 3.14159 * squareUv.y));

        float pattern = mix(circlePattern, squarePattern, uMode);

        float line = smoothstep(0.15, 0.0, pattern);

        // Masks
        float circleMask = 1.0 - smoothstep(0.95, 1.0, r);
        // Square mask scaled down to 0.85 so it fits nicely
        float squareMask = 1.0 - smoothstep(0.85, 0.9, max(abs(uv.x), abs(uv.y)));
        float mask = mix(circleMask, squareMask, uMode);
        
        float glow = 1.0 - smoothstep(0.0, 0.5, r);

        // --- GRAIN GENERATION ---
        vec2 grainUv = uv * 150.0; 
        vec2 grainId = floor(grainUv);
        vec2 grainPos = fract(grainUv) - 0.5;
        
        float rnd = fract(sin(dot(grainId, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 offset = vec2(rnd - 0.5, fract(rnd * 2.0) - 0.5) * 0.6;
        
        // Vibration based on volume
        float vibrationAmount = 0.15 * uIsPlaying * uAmplitude;
        float vibration = sin(uTime * 40.0 + rnd * 10.0) * vibrationAmount;
        
        // Scatter effect during transitions
        float scatterOffset = uScatter * (rnd - 0.5) * 0.8;

        float distToGrain = length(grainPos - offset) + vibration + scatterOffset;
        float grainShape = smoothstep(0.4, 0.0, distToGrain);
        
        float finalGrain = line * grainShape;

        // --- COLOR MAPPING ---
        float hue = fract(uFrequency * 0.002);
        vec3 color = vec3(0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
                          0.5 + 0.5 * cos(6.28318 * (hue + 0.67)));

        // Boosted brightness
        float ampGlow = 0.6 + uAmplitude * 0.4;
        vec3 finalColor = color * (finalGrain * 6.0 + glow * 0.6) * mask * ampGlow;
        float alpha = (finalGrain * 1.5 + glow * 0.3) * mask;

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
        uAmplitude: { value: 0.5 },
        uMode: { value: 0.0 },
        uN: { value: 0.0 },
        uM: { value: 0.0 },
        uScatter: { value: 0.0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// Animation Loop
let visualTime = 0.0;
let lastTime = performance.now();

// Visual density targets (instead of raw frequency)
let targetN = 0, targetM = 0;
let currentN = 0, currentM = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (isPlaying) {
        visualTime += dt;
        
        // Smoothly interpolate N and M (the visual geometry)
        currentN += (targetN - currentN) * 0.04;
        currentM += (targetM - currentM) * 0.04;

        // Calculate scatter effect based on how far we are from the target
        const distance = Math.abs(targetN - currentN) + Math.abs(targetM - currentM);
        material.uniforms.uScatter.value = Math.min(distance * 0.5, 1.0);
    } else {
        // Settle the scatter when stopped
        material.uniforms.uScatter.value *= 0.9;
    }
    
    material.uniforms.uTime.value = visualTime;
    material.uniforms.uIsPlaying.value = isPlaying ? 1.0 : 0.0;
    material.uniforms.uN.value = currentN;
    material.uniforms.uM.value = currentM;

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
const modeToggle = document.getElementById('mode-toggle');

function updateFrequency(freq) {
    // Update the visual targets based on frequency
    targetN = freq * 0.05;
    targetM = freq * 0.03;
    
    // Update audio
    if (isPlaying && synth) {
        synth.frequency.rampTo(freq, 1.5); 
    }
    material.uniforms.uFrequency.value = freq; // Keep for color mapping
}

playBtn.addEventListener('click', async () => {
    await initAudio();
    const freq = parseFloat(planetSelect.value);
    
    // Snap visuals to target on first play
    targetN = freq * 0.05;
    targetM = freq * 0.03;
    currentN = targetN;
    currentM = targetM;
    
    playFrequency(freq);
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
    const vol = Math.max(0.001, parseFloat(e.target.value));
    if (synth) {
        synth.volume.rampTo(Tone.gainToDb(vol), 0.1); 
    }
    material.uniforms.uAmplitude.value = vol;
});

modeToggle.addEventListener('click', () => {
    const isSquare = material.uniforms.uMode.value === 0.0;
    material.uniforms.uMode.value = isSquare ? 1.0 : 0.0;
    modeToggle.textContent = isSquare ? "Square Mode" : "Circle Mode";
});
