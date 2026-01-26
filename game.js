// Scene setup
let scene, camera, renderer;
let player, mixer, idleAction, runAction, currentAction;
let clock = new THREE.Clock();

// Movement
const keys = { w: false, a: false, s: false, d: false, shift: false };
const moveSpeed = 20;
const runSpeed = 50;
const rotateSpeed = 3;

// Camera settings - GTA style close third-person
const cameraOffset = new THREE.Vector3(0, 1, 3);
const cameraLookOffset = new THREE.Vector3(0, 0.5, 0);

// DOM Elements
const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const gameContainer = document.getElementById('game-container');
const playBtn = document.getElementById('play-btn');

// Start button
playBtn.addEventListener('click', startGame);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === 'shift') keys.shift = true;
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (key === 'shift') keys.shift = false;
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
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000);
    camera.position.set(0, 5, 10);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    gameContainer.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Neon lights
    const pinkLight = new THREE.PointLight(0xff00ff, 1, 200);
    pinkLight.position.set(-50, 30, 0);
    scene.add(pinkLight);
    
    const cyanLight = new THREE.PointLight(0x00ffff, 1, 200);
    cyanLight.position.set(50, 30, 0);
    scene.add(cyanLight);
    
    window.addEventListener('resize', onWindowResize);
}

function loadGLTF(path, onProgress) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(path, resolve, onProgress, reject);
    });
}

async function loadModels() {
    // Load skybox
    try {
        const skyboxGltf = await loadGLTF('models/skybox-futuristic-city.glb', (p) => {
            if (p.total > 0) loadingFill.style.width = (p.loaded / p.total) * 20 + '%';
        });
        const skybox = skyboxGltf.scene;
        skybox.scale.setScalar(500);
        scene.add(skybox);
        console.log('🌆 Skybox loaded!');
    } catch (e) {
        scene.background = new THREE.Color(0x0a0a15);
    }
    
    loadingFill.style.width = '20%';
    
    // Load player
    try {
        const playerGltf = await loadGLTF('models/player.glb', (p) => {
            if (p.total > 0) loadingFill.style.width = 20 + (p.loaded / p.total) * 30 + '%';
        });
        player = playerGltf.scene;
        player.scale.setScalar(0.3);
        player.position.set(0, 2, 20);
        player.castShadow = true;
        scene.add(player);
        
        // Setup animations
        if (playerGltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(player);
            
            // Find idle and run animations
            playerGltf.animations.forEach(clip => {
                console.log('Animation found:', clip.name);
                const name = clip.name.toLowerCase();
                if (name.includes('idle')) {
                    idleAction = mixer.clipAction(clip);
                } else if (name.includes('run')) {
                    runAction = mixer.clipAction(clip);
                }
            });
            
            // Fallback: use first two animations
            if (!idleAction && playerGltf.animations[0]) {
                idleAction = mixer.clipAction(playerGltf.animations[0]);
            }
            if (!runAction && playerGltf.animations[1]) {
                runAction = mixer.clipAction(playerGltf.animations[1]);
            }
            
            // Start with idle
            if (idleAction) {
                currentAction = idleAction;
                idleAction.play();
            }
        }
        
        console.log('🧑 Player loaded!');
    } catch (e) {
        console.error('Player not found:', e.message);
        // Create placeholder
        const geo = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
        player = new THREE.Mesh(geo, mat);
        player.position.set(0, 1, 0);
        scene.add(player);
    }
    
    loadingFill.style.width = '50%';
    
    // Load city
    try {
        const cityGltf = await loadGLTF('models/cyberpunk-city.glb', (p) => {
            if (p.total > 0) loadingFill.style.width = 50 + (p.loaded / p.total) * 50 + '%';
        });
        const city = cityGltf.scene;
        city.scale.setScalar(5000);
        city.position.set(0, 0, 0);
        city.receiveShadow = true;
        scene.add(city);
        console.log('🌃 City loaded!');
    } catch (e) {
        console.log('City not found:', e.message);
    }
    
    loadingFill.style.width = '100%';
}

function switchAnimation(toAction) {
    if (!toAction || currentAction === toAction) return;
    
    if (currentAction) {
        currentAction.fadeOut(0.2);
    }
    toAction.reset().fadeIn(0.2).play();
    currentAction = toAction;
}

function updatePlayer(delta) {
    if (!player) return;
    
    const isMoving = keys.w || keys.a || keys.s || keys.d;
    const speed = keys.shift ? runSpeed : moveSpeed;
    
    // Switch animations
    if (isMoving && runAction) {
        switchAnimation(runAction);
    } else if (!isMoving && idleAction) {
        switchAnimation(idleAction);
    }
    
    // Rotation
    if (keys.a) {
        player.rotation.y += rotateSpeed * delta;
    }
    if (keys.d) {
        player.rotation.y -= rotateSpeed * delta;
    }
    
    // Movement
    if (keys.w) {
        player.position.x -= Math.sin(player.rotation.y) * speed * delta;
        player.position.z -= Math.cos(player.rotation.y) * speed * delta;
    }
    if (keys.s) {
        player.position.x += Math.sin(player.rotation.y) * speed * delta;
        player.position.z += Math.cos(player.rotation.y) * speed * delta;
    }
}

function updateCamera() {
    if (!player) return;
    
    // Calculate camera position behind player
    const offset = cameraOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
    
    const targetPos = player.position.clone().add(offset);
    camera.position.lerp(targetPos, 0.15);
    
    // Look at player
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
