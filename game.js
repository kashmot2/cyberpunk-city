// ES Module imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
let showDebugSurfaces = false;
let recastInitialized = false;

// Debug visualization
let debugGroup = null;

// Surface classification thresholds (will be auto-calibrated)
const SURFACE_CONFIG = {
    // Normal threshold - how "up-facing" a surface must be (1.0 = perfectly flat)
    horizontalThreshold: 0.85,
    
    // Road detection
    roadMinWidth: 3.0,          // Minimum width to be considered a road
    roadMaxElevation: 2.0,      // Max Y from ground to be road
    roadMinArea: 10.0,          // Minimum surface area
    
    // Sidewalk detection  
    sidewalkMinWidth: 0.5,      // Minimum sidewalk width
    sidewalkMaxWidth: 4.0,      // Max width (wider = road)
    sidewalkElevationMin: 0.05, // Min height above nearby road
    sidewalkElevationMax: 1.0,  // Max height above nearby road
    sidewalkMinArea: 1.0,       // Minimum surface area
    
    // Ground level detection
    groundSampleCount: 100,     // Points to sample for ground level
    groundPercentile: 0.1,      // Use 10th percentile as ground
};

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
let gameState = 'menu';

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
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    display: none; flex-direction: column; align-items: center;
    padding: 40px; z-index: 50; overflow-y: auto;
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
        background: transparent; border: 2px solid #444; border-radius: 8px; cursor: pointer;">← Back to Menu</button>
`;
document.body.appendChild(levelSelectScreen);

// Create loading status
const loadingStatus = document.createElement('div');
loadingStatus.style.cssText = 'color: white; font-size: 14px; margin-top: 20px; font-family: sans-serif;';
loadingScreen.appendChild(loadingStatus);

// Create debug stats panel
const statsPanel = document.createElement('div');
statsPanel.id = 'stats-panel';
statsPanel.style.cssText = `
    position: fixed; top: 60px; right: 20px; width: 320px; max-height: 500px;
    overflow-y: auto; background: rgba(0,0,0,0.9); color: #0f0;
    font-family: monospace; font-size: 11px; padding: 12px;
    border-radius: 4px; z-index: 100; display: none;
    border: 1px solid #0f0;
`;
document.body.appendChild(statsPanel);

// Populate track grid
const trackGrid = document.getElementById('track-grid');
TRACKS.forEach(track => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.style.cssText = `
        background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1);
        border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.3s;
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
        toggleDebugSurfaces();
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
}

function toggleDebugSurfaces() {
    showDebugSurfaces = !showDebugSurfaces;
    if (debugGroup) debugGroup.visible = showDebugSurfaces;
    statsPanel.style.display = showDebugSurfaces ? 'block' : 'none';
}

function showMenu() {
    gameState = 'menu';
    startScreen.style.display = 'flex';
    startScreen.classList.add('active');
    levelSelectScreen.style.display = 'none';
    loadingScreen.classList.remove('active');
    gameContainer.classList.remove('active');
    navmeshToggle.style.display = 'none';
    statsPanel.style.display = 'none';
}

function showLevelSelect() {
    gameState = 'levelselect';
    startScreen.style.display = 'none';
    levelSelectScreen.style.display = 'flex';
    loadingScreen.classList.remove('active');
    gameContainer.classList.remove('active');
    navmeshToggle.style.display = 'none';
    statsPanel.style.display = 'none';
}

async function ensureRecastInitialized() {
    if (!recastInitialized) {
        loadingStatus.textContent = 'Initializing navigation system...';
        await initRecast();
        recastInitialized = true;
        console.log('✅ Recast navigation initialized');
    }
}

// ============================================================
// GEOMETRY-BASED SURFACE CLASSIFICATION
// ============================================================

/**
 * Analyze a mesh to determine if it's a horizontal surface
 * Returns surface data or null if not horizontal
 */
function analyzeMeshSurface(mesh) {
    if (!mesh.geometry) return null;
    
    // Get world matrix for accurate calculations
    mesh.updateMatrixWorld(true);
    const worldMatrix = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
    
    // Get geometry data
    const geometry = mesh.geometry;
    const positionAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    const indexAttr = geometry.getIndex();
    
    if (!positionAttr) return null;
    
    // Calculate bounding box in world space
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox.clone();
    bbox.applyMatrix4(worldMatrix);
    
    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.z - bbox.min.z;
    const height = bbox.max.y - bbox.min.y;
    const avgY = (bbox.max.y + bbox.min.y) / 2;
    
    // Skip very thin or vertical meshes
    if (height > Math.max(width, depth) * 0.5) {
        return null; // Likely a wall or vertical structure
    }
    
    // Analyze face normals to check if surface is horizontal
    let upFacingArea = 0;
    let totalArea = 0;
    let avgNormalY = 0;
    let faceCount = 0;
    
    const tempV1 = new THREE.Vector3();
    const tempV2 = new THREE.Vector3();
    const tempV3 = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    
    // Process triangles
    const indices = indexAttr ? indexAttr.array : null;
    const positions = positionAttr.array;
    const normals = normalAttr ? normalAttr.array : null;
    
    const triangleCount = indices ? indices.length / 3 : positions.length / 9;
    
    for (let i = 0; i < triangleCount; i++) {
        let i1, i2, i3;
        
        if (indices) {
            i1 = indices[i * 3];
            i2 = indices[i * 3 + 1];
            i3 = indices[i * 3 + 2];
        } else {
            i1 = i * 3;
            i2 = i * 3 + 1;
            i3 = i * 3 + 2;
        }
        
        // Get vertex positions
        tempV1.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
        tempV2.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
        tempV3.set(positions[i3 * 3], positions[i3 * 3 + 1], positions[i3 * 3 + 2]);
        
        // Transform to world space
        tempV1.applyMatrix4(worldMatrix);
        tempV2.applyMatrix4(worldMatrix);
        tempV3.applyMatrix4(worldMatrix);
        
        // Calculate face normal
        edge1.subVectors(tempV2, tempV1);
        edge2.subVectors(tempV3, tempV1);
        tempNormal.crossVectors(edge1, edge2).normalize();
        
        // Calculate triangle area
        const area = edge1.cross(edge2).length() / 2;
        totalArea += area;
        
        // Check if face is up-facing (horizontal)
        if (tempNormal.y > SURFACE_CONFIG.horizontalThreshold) {
            upFacingArea += area;
            avgNormalY += tempNormal.y;
            faceCount++;
        }
    }
    
    // Calculate what percentage of the surface is up-facing
    const upFacingRatio = totalArea > 0 ? upFacingArea / totalArea : 0;
    avgNormalY = faceCount > 0 ? avgNormalY / faceCount : 0;
    
    // Must have significant up-facing area
    if (upFacingRatio < 0.5 || upFacingArea < 0.5) {
        return null;
    }
    
    return {
        mesh,
        width,
        depth,
        height,
        avgY,
        minY: bbox.min.y,
        maxY: bbox.max.y,
        area: upFacingArea,
        totalArea,
        upFacingRatio,
        avgNormalY,
        center: new THREE.Vector3(
            (bbox.max.x + bbox.min.x) / 2,
            avgY,
            (bbox.max.z + bbox.min.z) / 2
        )
    };
}

/**
 * Find ground level by analyzing all surfaces
 */
function findGroundLevel(surfaces) {
    if (surfaces.length === 0) return 0;
    
    // Collect Y values weighted by area
    const yValues = [];
    surfaces.forEach(s => {
        // Add multiple samples for larger surfaces
        const samples = Math.ceil(s.area / 10);
        for (let i = 0; i < samples; i++) {
            yValues.push(s.minY);
        }
    });
    
    yValues.sort((a, b) => a - b);
    
    // Use percentile to find ground level (handles outliers)
    const idx = Math.floor(yValues.length * SURFACE_CONFIG.groundPercentile);
    const groundY = yValues[idx];
    
    console.log(`📏 Ground level detected: ${groundY.toFixed(2)} (from ${yValues.length} samples)`);
    return groundY;
}

/**
 * Classify surfaces into roads and sidewalks
 */
function classifySurfaces(surfaces, groundY) {
    const roads = [];
    const sidewalks = [];
    const unclassified = [];
    
    // First pass: identify potential roads (large surfaces near ground)
    surfaces.forEach(surface => {
        const elevationFromGround = surface.minY - groundY;
        const maxDimension = Math.max(surface.width, surface.depth);
        const minDimension = Math.min(surface.width, surface.depth);
        
        // Road criteria:
        // - Large enough
        // - Near ground level
        // - Wide enough for vehicles
        const isRoadCandidate = 
            maxDimension >= SURFACE_CONFIG.roadMinWidth &&
            surface.area >= SURFACE_CONFIG.roadMinArea &&
            elevationFromGround >= -0.5 &&
            elevationFromGround <= SURFACE_CONFIG.roadMaxElevation;
        
        // Sidewalk criteria:
        // - Smaller than road
        // - Slightly elevated from ground
        // - Narrow width
        const isSidewalkCandidate =
            surface.area >= SURFACE_CONFIG.sidewalkMinArea &&
            minDimension >= SURFACE_CONFIG.sidewalkMinWidth &&
            maxDimension <= SURFACE_CONFIG.sidewalkMaxWidth * 3 &&
            elevationFromGround >= SURFACE_CONFIG.sidewalkElevationMin &&
            elevationFromGround <= SURFACE_CONFIG.sidewalkElevationMax;
        
        surface.elevationFromGround = elevationFromGround;
        surface.maxDimension = maxDimension;
        surface.minDimension = minDimension;
        
        if (isRoadCandidate) {
            surface.classification = 'road';
            roads.push(surface);
        } else if (isSidewalkCandidate) {
            surface.classification = 'sidewalk';
            sidewalks.push(surface);
        } else {
            surface.classification = 'unclassified';
            unclassified.push(surface);
        }
    });
    
    // If we found very few roads but lots of unclassified, adjust thresholds
    if (roads.length < 5 && unclassified.length > 20) {
        console.log('⚠️ Few roads detected, relaxing criteria...');
        
        // Add large unclassified surfaces as roads
        unclassified.forEach(surface => {
            if (surface.area > 5 && surface.maxDimension > 2) {
                surface.classification = 'road';
                roads.push(surface);
            }
        });
    }
    
    // If we found very few sidewalks, some smaller roads might be sidewalks
    if (sidewalks.length < 3 && roads.length > 10) {
        // Find narrow roads and reclassify as sidewalks
        const narrowRoads = roads.filter(r => r.minDimension < 3 && r.area < 30);
        narrowRoads.forEach(r => {
            const idx = roads.indexOf(r);
            if (idx > -1) {
                roads.splice(idx, 1);
                r.classification = 'sidewalk';
                sidewalks.push(r);
            }
        });
    }
    
    console.log(`🚗 Roads: ${roads.length} surfaces`);
    console.log(`🚶 Sidewalks: ${sidewalks.length} surfaces`);
    console.log(`❓ Unclassified: ${unclassified.length} surfaces`);
    
    return { roads, sidewalks, unclassified };
}

/**
 * Create debug visualization for classified surfaces
 */
function createDebugVisualization(roads, sidewalks, groundY) {
    if (debugGroup) {
        scene.remove(debugGroup);
    }
    
    debugGroup = new THREE.Group();
    debugGroup.name = 'debug-surfaces';
    debugGroup.visible = showDebugSurfaces;
    
    const roadMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const sidewalkMaterial = new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Visualize roads
    roads.forEach(surface => {
        const geo = new THREE.BoxGeometry(surface.width, 0.1, surface.depth);
        const box = new THREE.Mesh(geo, roadMaterial);
        box.position.copy(surface.center);
        box.position.y = surface.minY + 0.1;
        debugGroup.add(box);
    });
    
    // Visualize sidewalks
    sidewalks.forEach(surface => {
        const geo = new THREE.BoxGeometry(surface.width, 0.1, surface.depth);
        const box = new THREE.Mesh(geo, sidewalkMaterial);
        box.position.copy(surface.center);
        box.position.y = surface.minY + 0.1;
        debugGroup.add(box);
    });
    
    // Add ground plane indicator
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = groundY;
    debugGroup.add(groundPlane);
    
    scene.add(debugGroup);
    
    // Update stats panel
    updateStatsPanel(roads, sidewalks, groundY);
}

function updateStatsPanel(roads, sidewalks, groundY) {
    const totalRoadArea = roads.reduce((sum, r) => sum + r.area, 0);
    const totalSidewalkArea = sidewalks.reduce((sum, s) => sum + s.area, 0);
    
    statsPanel.innerHTML = `
        <div style="color: #0ff; font-weight: bold; margin-bottom: 8px;">
            🔬 SURFACE CLASSIFICATION
        </div>
        <div style="color: #888; margin-bottom: 12px;">
            Press M to toggle | N for navmesh
        </div>
        <hr style="border-color: #333; margin: 8px 0;">
        
        <div style="color: #0f0;">📏 Ground Level: ${groundY.toFixed(2)}</div>
        
        <hr style="border-color: #333; margin: 8px 0;">
        
        <div style="color: #0ff;">
            🚗 ROADS: ${roads.length} surfaces<br>
            Total Area: ${totalRoadArea.toFixed(1)} sq units
        </div>
        <div style="font-size: 10px; color: #088; margin-left: 10px;">
            ${roads.slice(0, 5).map(r => 
                `${r.width.toFixed(1)}x${r.depth.toFixed(1)} @ y=${r.minY.toFixed(1)}`
            ).join('<br>')}
            ${roads.length > 5 ? `<br>...and ${roads.length - 5} more` : ''}
        </div>
        
        <hr style="border-color: #333; margin: 8px 0;">
        
        <div style="color: #f0f;">
            🚶 SIDEWALKS: ${sidewalks.length} surfaces<br>
            Total Area: ${totalSidewalkArea.toFixed(1)} sq units
        </div>
        <div style="font-size: 10px; color: #808; margin-left: 10px;">
            ${sidewalks.slice(0, 5).map(s => 
                `${s.width.toFixed(1)}x${s.depth.toFixed(1)} @ y=${s.minY.toFixed(1)}`
            ).join('<br>')}
            ${sidewalks.length > 5 ? `<br>...and ${sidewalks.length - 5} more` : ''}
        </div>
        
        <hr style="border-color: #333; margin: 8px 0;">
        
        <div style="color: #666; font-size: 10px;">
            Config:<br>
            Road min width: ${SURFACE_CONFIG.roadMinWidth}<br>
            Road min area: ${SURFACE_CONFIG.roadMinArea}<br>
            Sidewalk width: ${SURFACE_CONFIG.sidewalkMinWidth}-${SURFACE_CONFIG.sidewalkMaxWidth}<br>
            Horizontal threshold: ${SURFACE_CONFIG.horizontalThreshold}
        </div>
    `;
}

/**
 * Main surface analysis function
 */
async function analyzeAndClassifySurfaces(trackScene) {
    loadingStatus.textContent = 'Analyzing geometry...';
    console.log('🔍 Starting geometry-based surface analysis...');
    
    const allSurfaces = [];
    let meshCount = 0;
    let analyzedCount = 0;
    
    // Collect all meshes
    trackScene.traverse((child) => {
        if (child.isMesh) {
            meshCount++;
        }
    });
    
    console.log(`📊 Found ${meshCount} meshes to analyze`);
    
    // Analyze each mesh
    trackScene.traverse((child) => {
        if (child.isMesh) {
            try {
                const surface = analyzeMeshSurface(child);
                if (surface) {
                    allSurfaces.push(surface);
                    analyzedCount++;
                }
            } catch (e) {
                // Skip problematic meshes
            }
        }
    });
    
    console.log(`✅ Analyzed ${analyzedCount} horizontal surfaces from ${meshCount} meshes`);
    
    if (allSurfaces.length === 0) {
        console.warn('⚠️ No horizontal surfaces detected! Using fallback.');
        return { roads: [], sidewalks: [], groundY: 0 };
    }
    
    // Find ground level
    loadingStatus.textContent = 'Detecting ground level...';
    const groundY = findGroundLevel(allSurfaces);
    groundLevel = groundY;
    
    // Classify surfaces
    loadingStatus.textContent = 'Classifying surfaces...';
    const { roads, sidewalks, unclassified } = classifySurfaces(allSurfaces, groundY);
    
    // Create debug visualization
    createDebugVisualization(roads, sidewalks, groundY);
    
    return { roads, sidewalks, groundY };
}

/**
 * Generate navmesh from classified surfaces
 */
async function generateNavMeshFromSurfaces(surfaces, color, label) {
    if (surfaces.length === 0) {
        console.log(`⚠️ No surfaces for ${label} navmesh`);
        return { navMesh: null, query: null, helper: null };
    }
    
    const meshes = surfaces.map(s => s.mesh);
    console.log(`🔨 Generating ${label} navmesh from ${meshes.length} meshes...`);
    
    try {
        // Adjust navmesh config based on surface type
        const isRoad = label === 'Road';
        const navMeshConfig = {
            cs: isRoad ? 0.5 : 0.3,     // Larger cells for roads
            ch: 0.2,
            walkableSlopeAngle: 30,
            walkableHeight: isRoad ? 3 : 2,  // Taller for vehicles
            walkableClimb: 0.5,
            walkableRadius: isRoad ? 1.0 : 0.3,  // Wider for vehicles
            maxEdgeLen: 12,
            maxSimplificationError: 1.3,
            minRegionArea: isRoad ? 4 : 2,
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
                    opacity: 0.35,
                    side: THREE.DoubleSide,
                    wireframe: false
                })
            });
            helper.visible = showNavmesh;
            
            return { navMesh: result.navMesh, query, helper };
        } else {
            console.error(`❌ ${label} navmesh generation failed`);
        }
    } catch (e) {
        console.error(`❌ ${label} navmesh error:`, e.message);
    }
    
    return { navMesh: null, query: null, helper: null };
}

/**
 * Main navmesh generation using geometry classification
 */
async function generateSmartNavMeshes(trackScene) {
    // Analyze and classify surfaces
    const { roads, sidewalks, groundY } = await analyzeAndClassifySurfaces(trackScene);
    
    // Generate road navmesh (cyan)
    loadingStatus.textContent = 'Generating road navmesh...';
    const roadResult = await generateNavMeshFromSurfaces(roads, 0x00ffff, 'Road');
    roadNavMesh = roadResult.navMesh;
    roadNavMeshQuery = roadResult.query;
    if (roadNavMeshHelper) scene.remove(roadNavMeshHelper);
    roadNavMeshHelper = roadResult.helper;
    if (roadNavMeshHelper) scene.add(roadNavMeshHelper);
    
    // Generate sidewalk navmesh (magenta)
    loadingStatus.textContent = 'Generating sidewalk navmesh...';
    const sidewalkResult = await generateNavMeshFromSurfaces(sidewalks, 0xff00ff, 'Sidewalk');
    sidewalkNavMesh = sidewalkResult.navMesh;
    sidewalkNavMeshQuery = sidewalkResult.query;
    if (sidewalkNavMeshHelper) scene.remove(sidewalkNavMeshHelper);
    sidewalkNavMeshHelper = sidewalkResult.helper;
    if (sidewalkNavMeshHelper) scene.add(sidewalkNavMeshHelper);
    
    // If no sidewalks, use roads for player movement
    if (!sidewalkNavMesh && roadNavMesh) {
        console.log('ℹ️ No sidewalk navmesh - using roads for player');
        sidewalkNavMeshQuery = roadNavMeshQuery;
    }
    
    const navmeshCount = (roadNavMesh ? 1 : 0) + (sidewalkNavMesh ? 1 : 0);
    console.log(`🗺️ Generated ${navmeshCount} navmesh(es)`);
    
    return { roads, sidewalks, groundY };
}

// ============================================================
// PLAYER MOVEMENT WITH NAVMESH
// ============================================================

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
            return distance < 2.0;
        }
    } catch (e) {}
    return true;
}

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

// ============================================================
// TRACK LOADING
// ============================================================

async function loadTrack(trackId) {
    gameState = 'loading';
    levelSelectScreen.style.display = 'none';
    loadingScreen.classList.add('active');
    loadingFill.style.width = '0%';
    loadingStatus.textContent = 'Initializing...';
    
    if (!scene) initScene();
    
    await ensureRecastInitialized();
    loadingFill.style.width = '10%';
    
    // Cleanup
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
    if (debugGroup) {
        scene.remove(debugGroup);
        debugGroup = null;
    }
    roadNavMesh = null;
    roadNavMeshQuery = null;
    sidewalkNavMesh = null;
    sidewalkNavMeshQuery = null;
    
    // Load player
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
                        const progress = 30 + (p.loaded / p.total) * 30;
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
        loadingFill.style.width = '60%';
        
        // Generate smart navmeshes
        const { groundY } = await generateSmartNavMeshes(currentTrack);
        loadingFill.style.width = '90%';
        
        // Position player
        let startY = groundY + 5;
        const navHeight = getNavMeshHeight(0, 0);
        if (navHeight > groundY) {
            startY = navHeight + 2;
        }
        player.position.set(0, startY, 0);
        velocityY = 0;
        
    } catch (e) {
        console.error('Failed to load track:', e);
        loadingStatus.textContent = 'Error loading track!';
        return;
    }
    
    loadingFill.style.width = '100%';
    loadingStatus.textContent = 'Ready!';
    
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
            
            if (!animations.idle && playerGltf.animations[0]) {
                animations.idle = mixer.clipAction(playerGltf.animations[0]);
            }
            if (!animations.run && playerGltf.animations[0]) {
                animations.run = mixer.clipAction(playerGltf.animations[0]);
            }
            
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
    
    if (keys.a) player.rotation.y += rotateSpeed * delta;
    if (keys.d) player.rotation.y -= rotateSpeed * delta;
    
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

function animate() {
    if (gameState !== 'playing') return;
    
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    if (mixer) mixer.update(delta);
    updatePlayer(delta);
    updateCamera();
    
    renderer.render(scene, camera);
}
