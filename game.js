// Scene setup
let scene, camera, renderer;
let player, mixer;
let animations = {};
let currentAction = null;
let clock = new THREE.Clock();

// Movement state
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false, e: false };
const moveSpeed = 8;
const runSpeed = 16;
const rotateSpeed = 3;

// Physics
let velocityY = 0;
const gravity = -40;
const groundLevel = 0;
const jumpForce = 15;
let isGrounded = false;

// Camera settings - GTA style
const cameraOffset = new THREE.Vector3(0, 3, 6);
const cameraLookOffset = new THREE.Vector3(0, 1.5, 0);

// Interaction system
let nearbyInteractable = null;
const interactionRange = 3;

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

// Start button
playBtn.addEventListener('click', startGame);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === 'shift') keys.shift = true;
    if (key === ' ') keys.space = true;
    if (key === 'e') keys.e = true;
    
    // Handle interaction
    if (key === 'e' && nearbyInteractable) {
        handleInteraction(nearbyInteractable);
    }
    
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
    if (key === 'e') keys.e = false;
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
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(0, 5, 10);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    
    // Neon accent lights
    const pinkLight = new THREE.PointLight(0xff00ff, 1, 100);
    pinkLight.position.set(-30, 20, 0);
    scene.add(pinkLight);
    
    const cyanLight = new THREE.PointLight(0x00ffff, 1, 100);
    cyanLight.position.set(30, 20, 0);
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
    
    // Load player with animations
    try {
        const playerGltf = await loadGLTF('models/player-new.glb', (p) => {
            if (p.total > 0) loadingFill.style.width = 20 + (p.loaded / p.total) * 30 + '%';
        });
        player = playerGltf.scene;
        player.scale.setScalar(2);  // Adjusted scale
        player.position.set(0, 50, 0);  // Start in air
        player.castShadow = true;
        scene.add(player);
        
        // Setup animations
        if (playerGltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(player);
            
            playerGltf.animations.forEach(clip => {
                const name = clip.name.toLowerCase();
                console.log('Animation found:', clip.name);
                
                // Map animation names
                if (name.includes('idle')) {
                    animations.idle = mixer.clipAction(clip);
                } else if (name.includes('walk')) {
                    animations.walk = mixer.clipAction(clip);
                } else if (name.includes('run')) {
                    animations.run = mixer.clipAction(clip);
                } else if (name.includes('jump')) {
                    animations.jump = mixer.clipAction(clip);
                    animations.jump.setLoop(THREE.LoopOnce);
                    animations.jump.clampWhenFinished = true;
                } else if (name.includes('sit')) {
                    animations.sit = mixer.clipAction(clip);
                    animations.sit.setLoop(THREE.LoopOnce);
                    animations.sit.clampWhenFinished = true;
                }
            });
            
            // Fallback assignments
            const anims = playerGltf.animations;
            if (!animations.idle && anims[0]) animations.idle = mixer.clipAction(anims[0]);
            if (!animations.walk && anims[1]) animations.walk = mixer.clipAction(anims[1]);
            if (!animations.run && anims[2]) animations.run = mixer.clipAction(anims[2]);
            if (!animations.jump && anims[3]) animations.jump = mixer.clipAction(anims[3]);
            
            // Start with idle
            if (animations.idle) {
                currentAction = animations.idle;
                animations.idle.play();
            }
        }
        
        console.log('🧑 Player loaded with animations:', Object.keys(animations));
    } catch (e) {
        console.error('Player not found:', e.message);
        // Fallback capsule
        const geo = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });
        player = new THREE.Mesh(geo, mat);
        player.position.set(0, 50, 0);
        scene.add(player);
    }
    
    loadingFill.style.width = '50%';
    
    // Load city - scaled up for proper chair height
    try {
        const cityGltf = await loadGLTF('models/cyberpunk-city.glb', (p) => {
            if (p.total > 0) loadingFill.style.width = 50 + (p.loaded / p.total) * 50 + '%';
        });
        const city = cityGltf.scene;
        city.scale.setScalar(0.5);  // Smaller city = bigger relative character
        city.position.set(0, 0, 0);
        city.receiveShadow = true;
        
        // Tag interactable objects (chairs, benches, etc)
        city.traverse((child) => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();
                if (name.includes('chair') || name.includes('bench') || name.includes('seat')) {
                    child.userData.interactable = true;
                    child.userData.type = 'seat';
                    child.userData.prompt = 'Press E to sit';
                }
            }
        });
        
        scene.add(city);
        console.log('🌃 City loaded!');
    } catch (e) {
        console.log('City not found:', e.message);
    }
    
    loadingFill.style.width = '100%';
}

function switchAnimation(name, fadeTime = 0.2) {
    const newAction = animations[name];
    if (!newAction || currentAction === newAction) return;
    
    if (currentAction) {
        currentAction.fadeOut(fadeTime);
    }
    
    newAction.reset().fadeIn(fadeTime).play();
    currentAction = newAction;
}

function handleInteraction(object) {
    if (object.userData.type === 'seat') {
        // Sit animation
        if (animations.sit) {
            switchAnimation('sit');
        }
        console.log('Sitting on:', object.name);
    }
}

function checkInteractables() {
    if (!player) return;
    
    nearbyInteractable = null;
    interactPrompt.style.display = 'none';
    
    // Simple distance check for nearby interactables
    scene.traverse((child) => {
        if (child.userData.interactable) {
            const distance = player.position.distanceTo(child.position);
            if (distance < interactionRange) {
                nearbyInteractable = child;
                interactPrompt.textContent = child.userData.prompt || 'Press E to interact';
                interactPrompt.style.display = 'block';
            }
        }
    });
}

function updatePlayer(delta) {
    if (!player) return;
    
    const isMoving = keys.w || keys.a || keys.s || keys.d;
    const isRunning = keys.shift && isMoving;
    const speed = isRunning ? runSpeed : moveSpeed;
    
    // Apply gravity
    velocityY += gravity * delta;
    player.position.y += velocityY * delta;
    
    // Ground collision
    if (player.position.y <= groundLevel) {
        player.position.y = groundLevel;
        velocityY = 0;
        if (!isGrounded) {
            isGrounded = true;
        }
    }
    
    // Animation state machine
    if (isGrounded) {
        if (isRunning) {
            switchAnimation('run');
        } else if (isMoving) {
            switchAnimation('walk');
        } else {
            switchAnimation('idle');
        }
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
        player.position.x += Math.sin(player.rotation.y) * speed * delta * 0.5;  // Slower backwards
        player.position.z += Math.cos(player.rotation.y) * speed * delta * 0.5;
    }
    
    // Check for nearby interactables
    checkInteractables();
}

function updateCamera() {
    if (!player) return;
    
    // Calculate camera position behind player
    const offset = cameraOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
    
    const targetPos = player.position.clone().add(offset);
    camera.position.lerp(targetPos, 0.1);
    
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
