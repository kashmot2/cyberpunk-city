// Scene setup
let scene, camera, renderer;
let player, mixer;
let animations = {};
let currentAction = null;
let clock = new THREE.Clock();
let currentTrack = null;

// Movement state
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
const moveSpeed = 5;
const runSpeed = 10;
const rotateSpeed = 3;

// Physics
let velocityY = 0;
const gravity = -40;
const groundLevel = 0;
const jumpForce = 15;
let isGrounded = false;

// Camera settings
const cameraOffset = new THREE.Vector3(0, 2, 5);
const cameraLookOffset = new THREE.Vector3(0, 1, 0);

// Available tracks
const TRACKS = [
    { id: 'central-route-crash', name: 'Central Route - Crash Junction', theme: 'Urban' },
    { id: 'central-route-long', name: 'Central Route - Long Circuit', theme: 'Urban' },
    { id: 'motor-city-long', name: 'Motor City - Long Circuit', theme: 'Industrial' },
    { id: 'eastern-bay-long', name: 'Eastern Bay - Long Circuit', theme: 'Coastal' },
    { id: 'eastern-bay-upper', name: 'Eastern Bay - Upper Link', theme: 'Coastal' },
    { id: 'eternal-city-long', name: 'Eternal City - Long Circuit', theme: 'European' },
    { id: 'eternal-city-short', name: 'Eternal City - Short Circuit', theme: 'European' },
    { id: 'angel-valley', name: 'Angel Valley', theme: 'Canyon' },
    { id: 'white-mountain', name: 'White Mountain', theme: 'Alpine' },
    { id: 'sunshine-keys', name: 'Sunshine Keys', theme: 'Tropical' },
];

// Game state
let gameState = 'menu'; // menu, levelselect, loading, playing

// DOM Elements
const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const gameContainer = document.getElementById('game-container');
const playBtn = document.getElementById('play-btn');

// Create level select screen
const levelSelectScreen = document.createElement('div');
levelSelectScreen.id = 'level-select';
levelSelectScreen.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    display: none;
    flex-direction: column;
    align-items: center;
    padding: 40px;
    z-index: 50;
    overflow-y: auto;
`;
levelSelectScreen.innerHTML = `
    <h1 style="color: white; font-family: sans-serif; font-size: 2.5rem; margin-bottom: 10px; 
        background: linear-gradient(90deg, #ff6b35, #f7c59f);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
        SELECT TRACK
    </h1>
    <p style="color: #888; font-family: sans-serif; margin-bottom: 30px;">Choose your destination</p>
    <div id="track-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; max-width: 1200px; width: 100%;"></div>
    <button id="back-btn" style="margin-top: 30px; padding: 12px 30px; font-size: 1rem; color: #888; 
        background: transparent; border: 2px solid #444; border-radius: 8px; cursor: pointer;
        transition: all 0.3s;">← Back to Menu</button>
`;
document.body.appendChild(levelSelectScreen);

// Create loading status
const loadingStatus = document.createElement('div');
loadingStatus.style.cssText = 'color: white; font-size: 14px; margin-top: 20px; font-family: sans-serif;';
loadingScreen.appendChild(loadingStatus);

// Populate track grid
const trackGrid = document.getElementById('track-grid');
TRACKS.forEach(track => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.style.cssText = `
        background: rgba(255,255,255,0.05);
        border: 2px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.3s;
    `;
    card.innerHTML = `
        <h3 style="color: white; font-family: sans-serif; margin: 0 0 8px 0; font-size: 1.1rem;">${track.name}</h3>
        <span style="color: #ff6b35; font-family: sans-serif; font-size: 0.85rem; 
            background: rgba(255,107,53,0.2); padding: 4px 10px; border-radius: 20px;">${track.theme}</span>
    `;
    card.addEventListener('mouseenter', () => {
        card.style.borderColor = '#ff6b35';
        card.style.transform = 'translateY(-4px)';
    });
    card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(255,255,255,0.1)';
        card.style.transform = 'translateY(0)';
    });
    card.addEventListener('click', () => loadTrack(track.id));
    trackGrid.appendChild(card);
});

// Event listeners
playBtn.addEventListener('click', showLevelSelect);
document.getElementById('back-btn').addEventListener('click', showMenu);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (gameState !== 'playing') return;
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === 'shift') keys.shift = true;
    if (key === ' ') {
        keys.space = true;
        if (isGrounded) {
            velocityY = jumpForce;
            isGrounded = false;
            switchAnimation('jump');
        }
    }
    if (key === 'escape') showLevelSelect();
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (key === 'shift') keys.shift = false;
    if (key === ' ') keys.space = false;
});

function showMenu() {
    gameState = 'menu';
    startScreen.style.display = 'flex';
    startScreen.classList.add('active');
    levelSelectScreen.style.display = 'none';
    loadingScreen.classList.remove('active');
    gameContainer.classList.remove('active');
}

function showLevelSelect() {
    gameState = 'levelselect';
    startScreen.style.display = 'none';
    startScreen.classList.remove('active');
    levelSelectScreen.style.display = 'flex';
    loadingScreen.classList.remove('active');
    gameContainer.classList.remove('active');
}

async function loadTrack(trackId) {
    gameState = 'loading';
    levelSelectScreen.style.display = 'none';
    loadingScreen.classList.add('active');
    loadingFill.style.width = '0%';
    loadingStatus.textContent = 'Initializing...';
    
    // Initialize scene if needed
    if (!scene) {
        initScene();
    }
    
    // Remove old track
    if (currentTrack) {
        scene.remove(currentTrack);
        currentTrack = null;
    }
    
    // Load player if not loaded
    if (!player) {
        await loadPlayer();
    }
    
    // Reset player position
    player.position.set(0, 10, 0);
    velocityY = 0;
    
    // Load track
    loadingStatus.textContent = `Loading ${trackId}...`;
    loadingFill.style.width = '30%';
    
    try {
        const trackGltf = await loadGLTF(`models/burnout/${trackId}.glb`, (p) => {
            if (p.total > 0) {
                const progress = 30 + (p.loaded / p.total) * 70;
                loadingFill.style.width = progress + '%';
            }
        });
        
        currentTrack = trackGltf.scene;
        currentTrack.scale.setScalar(1);
        currentTrack.position.set(0, 0, 0);
        scene.add(currentTrack);
        
        console.log(`🏎️ Loaded: ${trackId}`);
    } catch (e) {
        console.error('Failed to load track:', e);
        loadingStatus.textContent = 'Error loading track!';
        return;
    }
    
    loadingFill.style.width = '100%';
    loadingStatus.textContent = 'Ready!';
    
    // Start game
    setTimeout(() => {
        gameState = 'playing';
        loadingScreen.classList.remove('active');
        gameContainer.classList.add('active');
        if (!renderer) return;
        animate();
    }, 500);
}

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 5, 10);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    gameContainer.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = true;
    scene.add(sunLight);
    
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x444444, 0.5);
    scene.add(hemiLight);
    
    window.addEventListener('resize', onWindowResize);
}

function loadGLTF(path, onProgress) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(path, resolve, onProgress, reject);
    });
}

async function loadPlayer() {
    loadingStatus.textContent = 'Loading character...';
    loadingFill.style.width = '15%';
    
    try {
        const playerGltf = await loadGLTF('models/robot.glb');
        player = playerGltf.scene;
        player.scale.setScalar(0.01);
        player.position.set(0, 10, 0);
        player.castShadow = true;
        scene.add(player);
        
        // Setup animations
        if (playerGltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(player);
            playerGltf.animations.forEach(clip => {
                const name = clip.name.toLowerCase();
                if (name.includes('idle')) animations.idle = mixer.clipAction(clip);
                else if (name.includes('walk')) animations.walk = mixer.clipAction(clip);
                else if (name.includes('run')) animations.run = mixer.clipAction(clip);
                else if (name.includes('jump')) {
                    animations.jump = mixer.clipAction(clip);
                    animations.jump.setLoop(THREE.LoopOnce);
                }
            });
            
            const anims = playerGltf.animations;
            if (!animations.idle && anims[0]) animations.idle = mixer.clipAction(anims[0]);
            if (!animations.run && anims[0]) animations.run = mixer.clipAction(anims[0]);
            
            if (animations.idle) {
                currentAction = animations.idle;
                animations.idle.play();
            }
        }
        console.log('🤖 Robot loaded!');
    } catch (e) {
        console.error('Player error:', e);
        const geo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
        player = new THREE.Mesh(geo, mat);
        player.position.set(0, 10, 0);
        scene.add(player);
    }
}

function switchAnimation(name, fadeTime = 0.2) {
    const newAction = animations[name];
    if (!newAction || currentAction === newAction) return;
    if (currentAction) currentAction.fadeOut(fadeTime);
    newAction.reset().fadeIn(fadeTime).play();
    currentAction = newAction;
}

function updatePlayer(delta) {
    if (!player) return;
    
    const isMoving = keys.w || keys.a || keys.s || keys.d;
    const isRunning = keys.shift && isMoving;
    const speed = isRunning ? runSpeed : moveSpeed;
    
    velocityY += gravity * delta;
    player.position.y += velocityY * delta;
    
    if (player.position.y <= groundLevel) {
        player.position.y = groundLevel;
        velocityY = 0;
        isGrounded = true;
    }
    
    if (isGrounded) {
        if (isRunning) switchAnimation('run');
        else if (isMoving) switchAnimation('walk');
        else switchAnimation('idle');
    }
    
    if (keys.a) player.rotation.y += rotateSpeed * delta;
    if (keys.d) player.rotation.y -= rotateSpeed * delta;
    
    if (keys.w) {
        player.position.x -= Math.sin(player.rotation.y) * speed * delta;
        player.position.z -= Math.cos(player.rotation.y) * speed * delta;
    }
    if (keys.s) {
        player.position.x += Math.sin(player.rotation.y) * speed * delta * 0.5;
        player.position.z += Math.cos(player.rotation.y) * speed * delta * 0.5;
    }
}

function updateCamera() {
    if (!player) return;
    
    const offset = cameraOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
    
    const targetPos = player.position.clone().add(offset);
    camera.position.lerp(targetPos, 0.1);
    
    const lookAt = player.position.clone().add(cameraLookOffset);
    camera.lookAt(lookAt);
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

let animationId = null;
function animate() {
    if (gameState !== 'playing') {
        animationId = null;
        return;
    }
    
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updatePlayer(delta);
    updateCamera();
    
    renderer.render(scene, camera);
}
