// Scene setup
let scene, camera, renderer, controls;

// DOM Elements
const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const gameContainer = document.getElementById('game-container');
const playBtn = document.getElementById('play-btn');

// Start button
playBtn.addEventListener('click', startGame);

async function startGame() {
    // Show loading screen
    startScreen.classList.add('hidden');
    loadingScreen.classList.add('active');
    
    // Initialize Three.js
    initScene();
    
    // Load models
    await loadModels();
    
    // Hide loading, show game
    loadingScreen.classList.remove('active');
    gameContainer.classList.add('active');
    
    // Start render loop
    animate();
}

function initScene() {
    // Create scene
    scene = new THREE.Scene();
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 30, 80);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    gameContainer.appendChild(renderer.domElement);
    
    // Orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 1;
    controls.maxDistance = 500;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);
    
    // Colored accent lights
    const pinkLight = new THREE.PointLight(0xff00ff, 1, 200);
    pinkLight.position.set(-50, 30, 0);
    scene.add(pinkLight);
    
    const cyanLight = new THREE.PointLight(0x00ffff, 1, 200);
    cyanLight.position.set(50, 30, 0);
    scene.add(cyanLight);
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function loadGLTF(path, onProgress) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(
            path,
            (gltf) => resolve(gltf),
            onProgress,
            (error) => reject(error)
        );
    });
}

async function loadModels() {
    let progress = 0;
    
    // Load skybox
    try {
        const skyboxGltf = await loadGLTF('models/skybox-futuristic-city.glb', (p) => {
            if (p.total > 0) {
                progress = (p.loaded / p.total) * 30;
                loadingFill.style.width = progress + '%';
            }
        });
        const skybox = skyboxGltf.scene;
        skybox.scale.setScalar(500);
        scene.add(skybox);
        console.log('🌆 Skybox loaded!');
    } catch (e) {
        console.log('Skybox not found:', e.message);
        // Fallback background color
        scene.background = new THREE.Color(0x0a0a15);
    }
    
    loadingFill.style.width = '30%';
    
    // Load city
    try {
        const cityGltf = await loadGLTF('models/cyberpunk-city.glb', (p) => {
            if (p.total > 0) {
                progress = 30 + (p.loaded / p.total) * 70;
                loadingFill.style.width = progress + '%';
            }
        });
        const city = cityGltf.scene;
        city.scale.setScalar(0.5);
        city.position.set(0, 0, 0);
        scene.add(city);
        console.log('🌃 City loaded!');
    } catch (e) {
        console.log('City not found:', e.message);
    }
    
    loadingFill.style.width = '100%';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
