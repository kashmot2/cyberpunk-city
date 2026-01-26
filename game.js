// Scene setup
let scene, camera, renderer;
let player, mixer;
let animations = {};
let currentAction = null;
let clock = new THREE.Clock();

// Movement state
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false };
const moveSpeed = 5;
const runSpeed = 10;
const rotateSpeed = 3;

// Physics
let velocityY = 0;
const gravity = -40;
const groundLevel = 0;
const jumpForce = 15;
let isGrounded = false;

// Camera settings - GTA style
const cameraOffset = new THREE.Vector3(0, 2, 5);
const cameraLookOffset = new THREE.Vector3(0, 1, 0);

// Burnout track layout - arranged in a grid
const TRACK_LAYOUT = [
    { name: 'central-route-crash', position: [0, 0, 0] },
    { name: 'central-route-long', position: [200, 0, 0] },
    { name: 'motor-city-long', position: [400, 0, 0] },
    { name: 'eastern-bay-long', position: [0, 0, 200] },
    { name: 'eastern-bay-upper', position: [200, 0, 200] },
    { name: 'eternal-city-long', position: [400, 0, 200] },
    { name: 'eternal-city-short', position: [0, 0, 400] },
    { name: 'angel-valley', position: [200, 0, 400] },
    { name: 'white-mountain', position: [400, 0, 400] },
    { name: 'sunshine-keys', position: [200, 0, 600] },
];

// DOM Elements
const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const gameContainer = document.getElementById('game-container');
const playBtn = document.getElementById('play-btn');

// Create interaction prompt
const interactPrompt = document.createElement('div');
interactPrompt.id = 'interact-prompt';
interactPrompt.style.cssText = `
    position: fixed;
    bottom: 150px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: sans-serif;
    font-size: 16px;
    display: none;
    z-index: 100;
    border: 2px solid #00ffff;
`;
document.body.appendChild(interactPrompt);

// Loading status
const loadingStatus = document.createElement('div');
loadingStatus.id = 'loading-status';
loadingStatus.style.cssText = `
    color: white;
    font-size: 14px;
    margin-top: 20px;
`;
document.querySelector('.loading-bar')?.parentNode?.appendChild(loadingStatus);

// Start button
playBtn.addEventListener('click', startGame);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === 'shift') keys.shift = true;
    if (key === ' ') keys.space = true;
    
    // Jump
    if (key === ' ' && isGrounded) {
        velocityY = jumpForce;
        isGrounded = false;
        switchAnimation('jump');
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (key === 'shift') keys.shift = false;
    if (key === ' ') keys.space = false;
});

async function startGame() {
    startScreen.classList.add('hidden');
    loadingScreen.classList.add('active');
    
    initScene();
    await loadModels();
    
    loadingScreen.classList.remove('active');
    gameContainer.classList.add('active');
    
    animate();
}

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 100, 800);
    
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
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);
    
    // Hemisphere light for nicer outdoor lighting
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

function updateLoadingStatus(text) {
    if (loadingStatus) loadingStatus.textContent = text;
}

async function loadModels() {
    const totalTracks = TRACK_LAYOUT.length;
    let loadedTracks = 0;
    
    // Load skybox first
    try {
        updateLoadingStatus('Loading skybox...');
        const skyboxGltf = await loadGLTF('models/skybox-futuristic-city.glb');
        const skybox = skyboxGltf.scene;
        skybox.scale.setScalar(500);
        scene.add(skybox);
        scene.background = null;
        scene.fog = null;
        console.log('🌆 Skybox loaded!');
    } catch (e) {
        console.log('Using sky color background');
    }
    
    loadingFill.style.width = '10%';
    
    // Load player
    try {
        updateLoadingStatus('Loading character...');
        const playerGltf = await loadGLTF('models/robot.glb');
        player = playerGltf.scene;
        player.scale.setScalar(0.01);  // Adjusted for Burnout scale
        player.position.set(0, 5, 0);
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
            
            // Fallback
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
        player.position.set(0, 5, 0);
        scene.add(player);
    }
    
    loadingFill.style.width = '20%';
    
    // Load all Burnout tracks
    for (let i = 0; i < TRACK_LAYOUT.length; i++) {
        const track = TRACK_LAYOUT[i];
        try {
            updateLoadingStatus(`Loading ${track.name}... (${i + 1}/${totalTracks})`);
            const trackGltf = await loadGLTF(`models/burnout/${track.name}.glb`);
            const trackModel = trackGltf.scene;
            trackModel.scale.setScalar(1);
            trackModel.position.set(...track.position);
            trackModel.receiveShadow = true;
            scene.add(trackModel);
            loadedTracks++;
            console.log(`🏎️ Loaded: ${track.name}`);
        } catch (e) {
            console.log(`Failed to load ${track.name}:`, e.message);
        }
        
        const progress = 20 + (loadedTracks / totalTracks) * 80;
        loadingFill.style.width = progress + '%';
    }
    
    updateLoadingStatus(`Loaded ${loadedTracks} tracks!`);
    loadingFill.style.width = '100%';
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
    
    // Gravity
    velocityY += gravity * delta;
    player.position.y += velocityY * delta;
    
    // Ground collision
    if (player.position.y <= groundLevel) {
        player.position.y = groundLevel;
        velocityY = 0;
        isGrounded = true;
    }
    
    // Animations
    if (isGrounded) {
        if (isRunning) switchAnimation('run');
        else if (isMoving) switchAnimation('walk');
        else switchAnimation('idle');
    }
    
    // Rotation
    if (keys.a) player.rotation.y += rotateSpeed * delta;
    if (keys.d) player.rotation.y -= rotateSpeed * delta;
    
    // Movement
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updatePlayer(delta);
    updateCamera();
    
    renderer.render(scene, camera);
}
