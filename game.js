// ES Module imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { init as initRecast, NavMeshQuery } from '@recast-navigation/core';
import { threeToSoloNavMesh, NavMeshHelper } from '@recast-navigation/three';

// Scene setup
let scene, camera, renderer;
let player, mixer;
let animations = {};
let currentAction = null;
let clock = new THREE.Clock();
let currentTrack = null;

// Navmesh - separate for roads and sidewalks
let roadNavMesh = null;
let roadNavMeshQuery = null;
let roadNavMeshHelper = null;

let sidewalkNavMesh = null;
let sidewalkNavMeshQuery = null;
let sidewalkNavMeshHelper = null;

let showNavmesh = false;
let recastInitialized = false;

// Mesh name patterns for filtering
const ROAD_PATTERNS = ['road', 'street', 'asphalt', 'highway', 'lane', 'track', 'tarmac', 'pavement_road', 'driving'];
const SIDEWALK_PATTERNS = ['sidewalk', 'walkway', 'footpath', 'pedestrian', 'pavement', 'curb', 'path', 'walkable'];

// Movement state
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
const moveSpeed = 5;
const runSpeed = 10;
const rotateSpeed = 3;

// Physics
let velocityY = 0;
const gravity = -40;
let groundLevel = 0;
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
const navmeshToggle = document.getElementById('navmesh-toggle');

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

// Create mesh names debug panel
const debugPanel = document.createElement('div');
debugPanel.id = 'debug-panel';
debugPanel.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    max-width: 350px;
    max-height: 400px;
    overflow-y: auto;
    background: rgba(0,0,0,0.85);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    border-radius: 4px;
    z-index: 100;
    display: none;
`;
document.body.appendChild(debugPanel);

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
navmeshToggle.addEventListener('click', toggleNavmeshVisibility);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    if (key === 'n' && gameState === 'playing') {
        toggleNavmeshVisibility();
        return;
    }
    
    if (key === 'm' && gameState === 'playing') {
        // Toggle debug mesh names panel
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
        return;
    }
    
    if (gameState !== 'playing') return;
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

function toggleNavmeshVisibility() {
    showNavmesh = !showNavmesh;
    if (roadNavMeshHelper) roadNavMeshHelper.visible = showNavmesh;
    if (sidewalkNavMeshHelper) sidewalkNavMeshHelper.visible = showNavmesh;
    navmeshToggle.textContent = showNavmesh ? 'Hide Navmesh (N)' : 'Show Navmesh (N)';
    console.log(`🗺️ Navmesh visibility: ${showNavmesh}`);
}

function showMenu() {
    gameState = 'menu';
    startScreen.style.display = 'flex';
    startScreen.classList.add('active');
    levelSelectScreen.style.display = 'none';
    loadingScreen.classList.remove('active');
    gameContainer.classList.remove('active');
    navmeshToggle.style.display = 'none';
    debugPanel.style.display = 'none';
}

function showLevelSelect() {
    gameState = 'levelselect';
    startScreen.style.display = 'none';
    startScreen.classList.remove('active');
    levelSelectScreen.style.display = 'flex';
    loadingScreen.classList.remove('active');
    gameContainer.classList.remove('active');
    navmeshToggle.style.display = 'none';
    debugPanel.style.display = 'none';
}

// Initialize Recast Navigation
async function ensureRecastInitialized() {
    if (!recastInitialized) {
        loadingStatus.textContent = 'Initializing navigation system...';
        await initRecast();
        recastInitialized = true;
        console.log('✅ Recast navigation initialized');
    }
}

// Check if mesh name matches any pattern
function matchesPatterns(name, patterns) {
    const lowerName = name.toLowerCase();
    return patterns.some(pattern => lowerName.includes(pattern));
}

// Analyze and categorize meshes from the track
function analyzeMeshes(trackScene) {
    const allMeshes = [];
    const roadMeshes = [];
    const sidewalkMeshes = [];
    const otherMeshes = [];
    
    const meshNames = new Set();
    
    trackScene.traverse((child) => {
        if (child.isMesh && child.geometry) {
            const name = child.name || 'unnamed';
            meshNames.add(name);
            allMeshes.push({ mesh: child, name });
            
            if (matchesPatterns(name, ROAD_PATTERNS)) {
                roadMeshes.push(child);
            } else if (matchesPatterns(name, SIDEWALK_PATTERNS)) {
                sidewalkMeshes.push(child);
            } else {
                otherMeshes.push({ mesh: child, name });
            }
        }
    });
    
    // Log all mesh names for debugging
    console.log('📋 All mesh names in track:');
    const sortedNames = Array.from(meshNames).sort();
    sortedNames.forEach(name => console.log(`  - ${name}`));
    
    // Update debug panel
    debugPanel.innerHTML = `
        <strong>MESH NAMES (press M to toggle)</strong><br>
        <span style="color:#0ff">Road meshes: ${roadMeshes.length}</span><br>
        <span style="color:#f0f">Sidewalk meshes: ${sidewalkMeshes.length}</span><br>
        <span style="color:#888">Other: ${otherMeshes.length}</span><br>
        <hr style="border-color:#333">
        <strong>All names:</strong><br>
        ${sortedNames.map(n => {
            const isRoad = matchesPatterns(n, ROAD_PATTERNS);
            const isSidewalk = matchesPatterns(n, SIDEWALK_PATTERNS);
            const color = isRoad ? '#0ff' : (isSidewalk ? '#f0f' : '#666');
            return `<span style="color:${color}">${n}</span>`;
        }).join('<br>')}
    `;
    
    return { allMeshes, roadMeshes, sidewalkMeshes, otherMeshes, meshNames: sortedNames };
}

// Generate navmesh from specific meshes
async function generateNavMeshFromMeshes(meshes, color, label) {
    if (meshes.length === 0) {
        console.log(`⚠️ No meshes for ${label} navmesh`);
        return { navMesh: null, query: null, helper: null };
    }
    
    console.log(`🔨 Generating ${label} navmesh from ${meshes.length} meshes...`);
    
    try {
        const navMeshConfig = {
            cs: 0.3,           // Cell size
            ch: 0.2,           // Cell height
            walkableSlopeAngle: 35,
            walkableHeight: 2,
            walkableClimb: 0.5,
            walkableRadius: 0.3,
            maxEdgeLen: 12,
            maxSimplificationError: 1.3,
            minRegionArea: 8,
            mergeRegionArea: 20,
            maxVertsPerPoly: 6,
            detailSampleDist: 6,
            detailSampleMaxError: 1,
        };
        
        const result = threeToSoloNavMesh(meshes, navMeshConfig);
        
        if (result.success && result.navMesh) {
            console.log(`✅ ${label} navmesh generated!`);
            
            const query = new NavMeshQuery(result.navMesh);
            const helper = new NavMeshHelper({
                navMesh: result.navMesh,
                navMeshMaterial: new THREE.MeshBasicMaterial({ 
                    color: color, 
                    transparent: true, 
                    opacity: 0.4,
                    side: THREE.DoubleSide,
                    wireframe: false
                })
            });
            helper.visible = showNavmesh;
            
            return { navMesh: result.navMesh, query, helper };
        }
    } catch (e) {
        console.error(`❌ ${label} navmesh error:`, e);
    }
    
    return { navMesh: null, query: null, helper: null };
}

// Generate both navmeshes
async function generateNavMeshes(trackScene) {
    loadingStatus.textContent = 'Analyzing track geometry...';
    
    const { roadMeshes, sidewalkMeshes, otherMeshes } = analyzeMeshes(trackScene);
    
    // If no specific road/sidewalk meshes found, use all flat-ish meshes as fallback
    let meshesForRoads = roadMeshes;
    let meshesForSidewalks = sidewalkMeshes;
    
    if (roadMeshes.length === 0 && sidewalkMeshes.length === 0) {
        console.log('⚠️ No named road/sidewalk meshes found. Using all meshes as fallback.');
        // Use all meshes as general walkable area
        meshesForSidewalks = otherMeshes.map(o => o.mesh);
    }
    
    // Generate road navmesh (cyan - for cars)
    loadingStatus.textContent = 'Generating road navmesh...';
    const roadResult = await generateNavMeshFromMeshes(meshesForRoads, 0x00ffff, 'Road');
    roadNavMesh = roadResult.navMesh;
    roadNavMeshQuery = roadResult.query;
    if (roadNavMeshHelper) scene.remove(roadNavMeshHelper);
    roadNavMeshHelper = roadResult.helper;
    if (roadNavMeshHelper) scene.add(roadNavMeshHelper);
    
    // Generate sidewalk navmesh (magenta - for NPCs/player)
    loadingStatus.textContent = 'Generating sidewalk navmesh...';
    const sidewalkResult = await generateNavMeshFromMeshes(meshesForSidewalks, 0xff00ff, 'Sidewalk');
    sidewalkNavMesh = sidewalkResult.navMesh;
    sidewalkNavMeshQuery = sidewalkResult.query;
    if (sidewalkNavMeshHelper) scene.remove(sidewalkNavMeshHelper);
    sidewalkNavMeshHelper = sidewalkResult.helper;
    if (sidewalkNavMeshHelper) scene.add(sidewalkNavMeshHelper);
    
    const totalNavmeshes = (roadNavMesh ? 1 : 0) + (sidewalkNavMesh ? 1 : 0);
    console.log(`🗺️ Generated ${totalNavmeshes} navmesh(es)`);
}

// Check if a position is on the sidewalk navmesh (for player)
function isPositionOnNavMesh(position) {
    const query = sidewalkNavMeshQuery || roadNavMeshQuery;
    if (!query) return true;
    
    try {
        const result = query.findClosestPoint({ 
            x: position.x, 
            y: position.y, 
            z: position.z 
        });
        
        if (result.success) {
            const closestPoint = result.point;
            const distance = Math.sqrt(
                Math.pow(position.x - closestPoint.x, 2) +
                Math.pow(position.z - closestPoint.z, 2)
            );
            return distance < 1.5;
        }
    } catch (e) {}
    return true;
}

// Get navmesh height at position
function getNavMeshHeight(x, z) {
    const query = sidewalkNavMeshQuery || roadNavMeshQuery;
    if (!query) return groundLevel;
    
    try {
        const result = query.findClosestPoint({ x, y: 100, z });
        if (result.success) {
            return result.point.y;
        }
    } catch (e) {}
    return groundLevel;
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
    
    // Ensure Recast is ready
    await ensureRecastInitialized();
    loadingFill.style.width = '10%';
    
    // Remove old track and navmeshes
    if (currentTrack) {
        scene.remove(currentTrack);
        currentTrack = null;
    }
    if (roadNavMeshHelper) {
        scene.remove(roadNavMeshHelper);
        roadNavMeshHelper = null;
    }
    if (sidewalkNavMeshHelper) {
        scene.remove(sidewalkNavMeshHelper);
        sidewalkNavMeshHelper = null;
    }
    roadNavMesh = null;
    roadNavMeshQuery = null;
    sidewalkNavMesh = null;
    sidewalkNavMeshQuery = null;
    
    // Load player if not loaded
    if (!player) {
        await loadPlayer();
    }
    loadingFill.style.width = '20%';
    
    // Load track
    loadingStatus.textContent = `Loading ${trackId}...`;
    loadingFill.style.width = '30%';
    
    try {
        const loader = new GLTFLoader();
        const trackGltf = await new Promise((resolve, reject) => {
            loader.load(
                `models/burnout/${trackId}.glb`,
                resolve,
                (p) => {
                    if (p.total > 0) {
                        const progress = 30 + (p.loaded / p.total) * 40;
                        loadingFill.style.width = progress + '%';
                    }
                },
                reject
            );
        });
        
        currentTrack = trackGltf.scene;
        currentTrack.scale.setScalar(1);
        currentTrack.position.set(0, 0, 0);
        scene.add(currentTrack);
        
        console.log(`🏎️ Loaded: ${trackId}`);
        loadingFill.style.width = '70%';
        
        // Generate navmeshes (road + sidewalk)
        await generateNavMeshes(currentTrack);
        loadingFill.style.width = '90%';
        
    } catch (e) {
        console.error('Failed to load track:', e);
        loadingStatus.textContent = 'Error loading track!';
        return;
    }
    
    // Reset player position
    let startY = 10;
    const navHeight = getNavMeshHeight(0, 0);
    if (navHeight > groundLevel) {
        startY = navHeight + 2;
    }
    player.position.set(0, startY, 0);
    velocityY = 0;
    
    loadingFill.style.width = '100%';
    loadingStatus.textContent = 'Ready!';
    
    // Start game
    setTimeout(() => {
        gameState = 'playing';
        loadingScreen.classList.remove('active');
        gameContainer.classList.add('active');
        navmeshToggle.style.display = 'block';
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

async function loadPlayer() {
    loadingStatus.textContent = 'Loading character...';
    loadingFill.style.width = '15%';
    
    try {
        const loader = new GLTFLoader();
        const playerGltf = await new Promise((resolve, reject) => {
            loader.load('models/robot.glb', resolve, undefined, reject);
        });
        
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
    
    // Apply gravity
    velocityY += gravity * delta;
    player.position.y += velocityY * delta;
    
    // Get ground height from navmesh
    const navHeight = getNavMeshHeight(player.position.x, player.position.z);
    const currentGround = navHeight || groundLevel;
    
    if (player.position.y <= currentGround) {
        player.position.y = currentGround;
        velocityY = 0;
        isGrounded = true;
    }
    
    if (isGrounded) {
        if (isRunning) switchAnimation('run');
        else if (isMoving) switchAnimation('walk');
        else switchAnimation('idle');
    }
    
    // Rotation
    if (keys.a) player.rotation.y += rotateSpeed * delta;
    if (keys.d) player.rotation.y -= rotateSpeed * delta;
    
    // Movement with navmesh constraint
    if (keys.w || keys.s) {
        const moveDir = keys.w ? -1 : 0.5;
        const newX = player.position.x + Math.sin(player.rotation.y) * speed * delta * moveDir;
        const newZ = player.position.z + Math.cos(player.rotation.y) * speed * delta * moveDir;
        
        if (isPositionOnNavMesh({ x: newX, y: player.position.y, z: newZ })) {
            player.position.x = newX;
            player.position.z = newZ;
        }
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
