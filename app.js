/* ============================================
   ALDO LUNA | Fotografia de Cultura e Memória — Lógica Principal
   Three.js + GSAP + Interação
   ============================================ */

// --- VARIÁVEIS GLOBAIS ---
let scene, camera, renderer, raycaster, mouse, textureLoader;
let paintings = [];
let isFocused = false;
let focusedPainting = null;

// Detecta dispositivo móvel para ajustes de performance
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

// Limites de movimentação da câmera no corredor
const MIN_Z = 2;
const MAX_Z = -34;
let targetZ = 0;

// Controle de carregamento de texturas
let texturesLoaded = 0;
const totalTextures = 2; // piso + teto

// Referências para swap de textura (procedural → imagem)
let floorMesh, ceilingMesh;

// Dados das obras (carregado do JSON)
let ART_DATA = [];

// --- ELEMENTOS DO DOM ---
let container, artPanel, artTitle, artAuthor, artDesc;
let btnClose, btnBack, btnUp, btnDown, loader, hoverHint;


// ============================================
// INICIALIZAÇÃO
// ============================================

async function init() {
    // Referencia elementos do DOM
    container = document.getElementById('canvas-container');
    artPanel = document.getElementById('art-panel');
    artTitle = document.getElementById('art-title');
    artAuthor = document.getElementById('art-author');
    artDesc = document.getElementById('art-desc');
    btnClose = document.getElementById('btn-close');
    btnBack = document.getElementById('btn-back');
    btnUp = document.getElementById('btn-up');
    btnDown = document.getElementById('btn-down');
    loader = document.getElementById('loader');
    hoverHint = document.getElementById('hover-hint');

    // Carrega dados do JSON antes de montar a cena
    try {
        const response = await fetch('data.json');
        ART_DATA = await response.json();
    } catch (error) {
        console.warn('Erro ao carregar data.json, usando dados de fallback:', error);
        ART_DATA = getFallbackData();
    }

    setupScene();
    buildCorridor();
    loadGalleryArt();
    setupLights();
    loadImageTextures();
    bindEvents();

    // Inicia loop de renderização
    animate();
}


// ============================================
// CONFIGURAÇÃO DA CENA 3D
// ============================================

function setupScene() {
    // Cena com névoa para profundidade de galeria
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);
    scene.fog = new THREE.FogExp2(0xf3f4f6, 0.028);

    // Câmera na altura dos olhos humanos (1.7m)
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );
    camera.position.set(0, 1.7, 1);

    // Renderizador com otimizações para mobile
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.shadowMap.enabled = !isMobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.2;
    container.appendChild(renderer.domElement);

    // Raycaster para detecção de cliques/hover nos quadros
    raycaster = new THREE.Raycaster();
    // Inicia fora da tela para não detectar falso-positivo
    mouse = new THREE.Vector2(-999, -999);

    // Loader de texturas com CORS habilitado
    textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
}


// ============================================
// TEXTURAS PROCEDURAIS (FALLBACK)
// ============================================

function generateProceduralTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (type === 'wood') {
        // Madeira clara simulada
        ctx.fillStyle = '#e8dcd0';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#dfd0c4';
        for (let i = 0; i < 512; i += 32) {
            ctx.fillRect(0, i, 512, 6);
        }
        // Veios sutis
        ctx.fillStyle = 'rgba(160,140,120,0.08)';
        for (let j = 0; j < 25; j++) {
            ctx.beginPath();
            ctx.ellipse(
                Math.random() * 512, Math.random() * 512,
                Math.random() * 40 + 15, Math.random() * 20 + 8,
                Math.random() * Math.PI, 0, Math.PI * 2
            );
            ctx.fill();
        }
    } else if (type === 'wall') {
        // Parede off-white com granulação
        ctx.fillStyle = '#071f1c';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#e2e5e8';
        for (let i = 0; i < 1200; i++) {
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
        }
    } else if (type === 'ceiling') {
        // Teto branco fosco
        ctx.fillStyle = '#f5f7f8';
        ctx.fillRect(0, 0, 512, 512);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}


// ============================================
// CARREGAMENTO DE TEXTURAS POR IMAGEM
// Substitui as procedurais após download
// ============================================

function loadImageTextures() {
    const maxAniso = renderer.getMaxAnisotropy();

    // PISO — Madeira clara (carvalho branco)
    textureLoader.load(
        'assets/img/piso_1.png',
        (texture) => applyTexture(floorMesh, texture, 3, 12, maxAniso),
        undefined,
        () => onTextureLoaded() // Fallback silencioso
    );

    // TETO — Gesso branco com granulação
    textureLoader.load(
        'assets/img/teto_1.png',
        (texture) => applyTexture(ceilingMesh, texture, 3, 12, maxAniso),
        undefined,
        () => onTextureLoaded()
    );
}

/**
 * Aplica uma textura carregada a um mesh com configurações ideais
 */
function applyTexture(mesh, texture, repeatX, repeatY, maxAniso) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = maxAniso;
    texture.encoding = THREE.sRGBEncoding;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    onTextureLoaded();
}

/**
 * Controle de progresso do loader
 */
function onTextureLoaded() {
    texturesLoaded++;
    if (texturesLoaded >= totalTextures) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            if (loader.parentNode) loader.remove();
        }, 1000);
    }
}


// ============================================
// CONSTRUÇÃO DO CORREDOR
// ============================================

function buildCorridor() {
    const corridorLength = 45;
    const width = 8;
    const height = 5.5;
    const centerZ = -corridorLength / 2 + 5; // -17.5

    // --- PISO ---
    const floorTex = generateProceduralTexture('wood');
    floorTex.repeat.set(3, 9);
    floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, corridorLength),
        new THREE.MeshStandardMaterial({
            map: floorTex,
            roughness: 0.35,
            metalness: 0.05
        })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, centerZ);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // --- TETO ---
    const ceilingTex = generateProceduralTexture('ceiling');
    ceilingTex.repeat.set(3, 12);
    ceilingMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, corridorLength),
        new THREE.MeshStandardMaterial({
            map: ceilingTex,
            roughness: 0.85
        })
    );
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, height, centerZ);
    scene.add(ceilingMesh);

    // --- PAREDES LATERAIS ---
    ['left', 'right'].forEach(side => {
        const wallTex = generateProceduralTexture('wall');
        wallTex.repeat.set(10, 2);
        const wall = new THREE.Mesh(
            new THREE.PlaneGeometry(corridorLength, height),
            new THREE.MeshStandardMaterial({
                map: wallTex,
                roughness: 0.85
            })
        );
        wall.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
        wall.position.set(
            side === 'left' ? -width / 2 : width / 2,
            height / 2,
            centerZ
        );
        wall.receiveShadow = true;
        scene.add(wall);
    });

    // --- PAREDE DO FUNDO ---
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshStandardMaterial({
            color: 0x071f1c,
            roughness: 0.7,
            metalness: 0.1
        })
    );
    const backWallZ = -corridorLength + 5;
    backWall.position.set(0, height / 2, -corridorLength + 5);
    scene.add(backWall);

    addInfoTextToBackWall(backWallZ, width, height);

    addStandingPlaque();


    // --- MOLDURAS DE RODAPÉ E COROAMENTO ---
    buildMoldings(corridorLength, width, height, centerZ);
}


/**
 * Cria rodapés, coroamentos e faixas de acento
 * para enfatizar as arestas e o efeito 3D
 */
function buildMoldings(corridorLength, width, height, centerZ) {
    const halfW = width / 2;
    const moldingDepth = 0.04;
    const moldingHeight = 0.10;
    const crownHeight = 0.08;

    // Material das molduras: branco acetinado
    const moldingMat = new THREE.MeshStandardMaterial({
        color: 0xd8d4d0,
        roughness: 0.35,
        metalness: 0.15
    });

    [-halfW, halfW].forEach((xPos, idx) => {
        const offset = idx === 0 ? moldingDepth / 2 : -moldingDepth / 2;

        // Rodapé (baseboard)
        const baseboard = new THREE.Mesh(
            new THREE.BoxGeometry(moldingDepth, moldingHeight, corridorLength),
            moldingMat
        );
        baseboard.position.set(xPos + offset, moldingHeight / 2, centerZ);
        baseboard.castShadow = true;
        scene.add(baseboard);

        // Coroamento (crown molding)
        const crown = new THREE.Mesh(
            new THREE.BoxGeometry(moldingDepth, crownHeight, corridorLength),
            moldingMat
        );
        crown.position.set(xPos + offset, height - crownHeight / 2, centerZ);
        crown.castShadow = true;
        scene.add(crown);
    });

    // Faixas de acento (linhas finas de separação visual)
    const floorAccentMat = new THREE.MeshStandardMaterial({
        color: 0x8a7e74,
        roughness: 0.3,
        metalness: 0.2
    });
    const ceilingAccentMat = new THREE.MeshStandardMaterial({
        color: 0xc8c4c0,
        roughness: 0.5,
        metalness: 0.05
    });

    [-halfW, halfW].forEach((xPos, idx) => {
        const offset = idx === 0 ? 0.35 : -0.35;

        // Faixa no piso
        const floorStrip = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.005, corridorLength),
            floorAccentMat
        );
        floorStrip.position.set(xPos + offset, 0.003, centerZ);
        scene.add(floorStrip);

        // Faixa no teto
        const ceilingStrip = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.005, corridorLength),
            ceilingAccentMat
        );
        ceilingStrip.position.set(xPos + offset, height - 0.003, centerZ);
        scene.add(ceilingStrip);
    });
}


// ============================================
// GERADORES DE ARTE ABSTRATA POR ESTILO
// Cada obra tem personalidade visual distinta
// ============================================

function generateArtByStyle(style) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const W = 1024, H = 1024;

    // Auxiliares para cores seguras (valores inteiros)
    const rc = () => Math.floor(Math.random() * 256);
    const rgb = (r, g, b) => `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    const rgba = (r, g, b, a) => `rgba(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)},${a})`;

    switch (style) {

        case 'vortex': {
            // Fundo com gradiente radial quente
            const g = ctx.createRadialGradient(512, 512, 0, 512, 512, 600);
            g.addColorStop(0, rgb(255, 120, 40));
            g.addColorStop(0.4, rgb(180, 30, 60));
            g.addColorStop(1, rgb(15, 10, 20));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            // Espirais sobrepostas
            for (let s = 0; s < 3; s++) {
                ctx.beginPath();
                ctx.strokeStyle = rgba(255, 200 + rc() % 55, 100, 0.6);
                ctx.lineWidth = 3 + Math.random() * 5;
                for (let a = 0; a < Math.PI * 8; a += 0.05) {
                    const r = a * 30 + s * 40;
                    const x = 512 + Math.cos(a + s * 2) * r;
                    const y = 512 + Math.sin(a + s * 2) * r;
                    a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // Partículas centrais luminosas
            for (let i = 0; i < 60; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 200;
                ctx.fillStyle = rgba(255, 230, 180, Math.random() * 0.8 + 0.2);
                ctx.beginPath();
                ctx.arc(
                    512 + Math.cos(angle) * dist,
                    512 + Math.sin(angle) * dist,
                    Math.random() * 4 + 1, 0, Math.PI * 2
                );
                ctx.fill();
            }
            break;
        }

        case 'geometric': {
            // Fundo off-white
            ctx.fillStyle = rgb(245, 243, 240);
            ctx.fillRect(0, 0, W, H);

            // Retângulos sobrepostos com rotação restrita
            const palette = [
                rgb(20, 20, 25), rgb(180, 50, 50),
                rgb(50, 80, 160), rgb(200, 180, 50), rgb(40, 40, 40)
            ];
            for (let i = 0; i < 20; i++) {
                ctx.save();
                ctx.translate(Math.random() * W, Math.random() * H);
                ctx.rotate(Math.floor(Math.random() * 4) * Math.PI / 2);
                ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
                ctx.globalAlpha = 0.3 + Math.random() * 0.6;
                const w = 40 + Math.random() * 200;
                const h = 40 + Math.random() * 200;
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.restore();
            }

            // Grade de fundo sutil
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = rgb(0, 0, 0);
            ctx.lineWidth = 1;
            for (let i = 0; i < W; i += 64) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
            }
            break;
        }

        case 'fluid': {
            // Fundo escuro profundo
            const g = ctx.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, rgb(5, 8, 18));
            g.addColorStop(1, rgb(10, 20, 30));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            // Formas orgânicas bioluminescentes
            for (let i = 0; i < 25; i++) {
                const x = Math.random() * W;
                const y = Math.random() * H;
                const r = 40 + Math.random() * 180;
                const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
                const hue = 140 + Math.random() * 80;
                bg.addColorStop(0, `hsla(${hue}, 80%, 65%, 0.5)`);
                bg.addColorStop(0.6, `hsla(${hue}, 70%, 40%, 0.15)`);
                bg.addColorStop(1, `hsla(${hue}, 60%, 20%, 0)`);
                ctx.fillStyle = bg;
                ctx.beginPath();
                for (let a = 0; a < Math.PI * 2; a += 0.1) {
                    const wobble = r + Math.sin(a * 3 + i) * 25 + Math.cos(a * 5) * 15;
                    const px = x + Math.cos(a) * wobble;
                    const py = y + Math.sin(a) * wobble;
                    a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            }

            // Pontos de bioluminescência
            for (let i = 0; i < 80; i++) {
                ctx.fillStyle = rgba(150, 255, 220, Math.random() * 0.7 + 0.3);
                ctx.beginPath();
                ctx.arc(
                    Math.random() * W, Math.random() * H,
                    Math.random() * 2.5 + 0.5, 0, Math.PI * 2
                );
                ctx.fill();
            }
            break;
        }

        case 'neon': {
            // Fundo azul-noturno
            ctx.fillStyle = rgb(8, 10, 30);
            ctx.fillRect(0, 0, W, H);

            // Estrias de chuva
            for (let i = 0; i < 200; i++) {
                ctx.fillStyle = rgba(100, 140, 255, Math.random() * 0.15);
                ctx.fillRect(
                    Math.random() * W, Math.random() * H,
                    1, 10 + Math.random() * 60
                );
            }

            // Linhas neon com glow
            const neonColors = [
                'rgba(255,50,150,0.8)', 'rgba(0,200,255,0.8)',
                'rgba(255,100,0,0.7)', 'rgba(150,0,255,0.7)'
            ];
            for (let i = 0; i < 12; i++) {
                ctx.beginPath();
                ctx.strokeStyle = neonColors[Math.floor(Math.random() * neonColors.length)];
                ctx.lineWidth = 2 + Math.random() * 4;
                ctx.shadowColor = ctx.strokeStyle;
                ctx.shadowBlur = 20;
                let x = Math.random() * W, y = Math.random() * H;
                ctx.moveTo(x, y);
                for (let j = 0; j < 6; j++) {
                    x += (Math.random() - 0.5) * 300;
                    y += Math.random() * 200;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            break;
        }

        case 'horizon': {
            // Céu quente
            const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
            sky.addColorStop(0, rgb(200, 160, 120));
            sky.addColorStop(1, rgb(230, 200, 170));
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H * 0.55);

            // Mar profundo
            const sea = ctx.createLinearGradient(0, H * 0.55, 0, H);
            sea.addColorStop(0, rgb(60, 100, 130));
            sea.addColorStop(1, rgb(20, 40, 60));
            ctx.fillStyle = sea;
            ctx.fillRect(0, H * 0.55, W, H * 0.45);

            // Blocos de cor fragmentando o horizonte
            const blockColors = [
                rgb(220, 60, 60), rgb(60, 60, 200),
                rgb(240, 200, 50), rgb(240, 240, 240)
            ];
            for (let i = 0; i < 15; i++) {
                ctx.fillStyle = blockColors[Math.floor(Math.random() * blockColors.length)];
                ctx.globalAlpha = 0.4 + Math.random() * 0.4;
                ctx.fillRect(
                    Math.random() * W,
                    H * 0.4 + Math.random() * H * 0.3,
                    80 + Math.random() * 250,
                    20 + Math.random() * 120
                );
            }

            // Textura de espátula
            ctx.globalAlpha = 1;
            for (let i = 0; i < 300; i++) {
                ctx.fillStyle = rgba(255, 255, 255, Math.random() * 0.12);
                ctx.fillRect(
                    Math.random() * W,
                    H * 0.45 + Math.random() * H * 0.2,
                    20 + Math.random() * 60,
                    2 + Math.random() * 3
                );
            }
            break;
        }

        case 'solar': {
            // Explosão radial dourada
            const g = ctx.createRadialGradient(512, 400, 0, 512, 512, 700);
            g.addColorStop(0, rgb(255, 230, 100));
            g.addColorStop(0.2, rgb(255, 160, 30));
            g.addColorStop(0.5, rgb(200, 50, 20));
            g.addColorStop(1, rgb(40, 10, 5));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            // Raios solares
            for (let i = 0; i < 40; i++) {
                const angle = Math.random() * Math.PI * 2;
                const len = 200 + Math.random() * 400;
                ctx.beginPath();
                ctx.moveTo(512, 400);
                ctx.lineTo(
                    512 + Math.cos(angle) * len,
                    400 + Math.sin(angle) * len
                );
                ctx.strokeStyle = rgba(255, 200, 50, Math.random() * 0.3 + 0.1);
                ctx.lineWidth = 2 + Math.random() * 8;
                ctx.stroke();
            }

            // Granulação solar
            for (let i = 0; i < 150; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 350;
                ctx.fillStyle = rgba(255, 240, 200, Math.random() * 0.4);
                ctx.beginPath();
                ctx.arc(
                    512 + Math.cos(angle) * dist,
                    400 + Math.sin(angle) * dist,
                    Math.random() * 6 + 1, 0, Math.PI * 2
                );
                ctx.fill();
            }
            break;
        }
    }

    return new THREE.CanvasTexture(canvas);
}


// ============================================
// MONTAGEM DAS OBRAS NAS PAREDES
// ============================================

function loadGalleryArt() {
    ART_DATA.forEach(art => {
        const artGroup = new THREE.Group();

        // Dimensões da tela (formato paisagem)
        const artH = 1.6;
        const artW = artH * 1.3;

        // 1. Cria com a arte procedural como fallback imediato (aparece na hora)
        let canvasTex = generateArtByStyle(art.style || 'geometric');

        const canvasMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(artW, artH),
            new THREE.MeshStandardMaterial({
                map: canvasTex,
                roughness: 0.9,
                metalness: 0.0
            })
        );
        canvasMesh.position.z = 0.06;
        canvasMesh.name = 'painting_canvas';
        artGroup.add(canvasMesh);

        // 2. Se tiver caminho de imagem no JSON, carrega e substitui o fallback
        if (art.image) {
            textureLoader.load(
                art.image,
                (texture) => {
                    
                    // Troca a textura procedural pela imagem real
                    canvasMesh.material.map = texture;
                    canvasMesh.material.needsUpdate = true;
                },
                undefined,
                () => console.warn(`Imagem não encontrada: ${art.image}`)
            );
        }

        // Moldura escura metálica
        const frameThickness = 0.08;
        const frameMesh = new THREE.Mesh(
            new THREE.BoxGeometry(artW + frameThickness, artH + frameThickness, 0.05),
            new THREE.MeshStandardMaterial({
                color: 0x18181b,
                roughness: 0.4,
                metalness: 0.8
            })
        );
        frameMesh.position.z = 0.01;
        artGroup.add(frameMesh);

        // Posicionamento na parede
        const xPos = art.side === 'left' ? -3.95 : 3.95;
        artGroup.position.set(xPos, 2.2, art.posZ);
        artGroup.rotation.y = art.side === 'left' ? Math.PI / 2 : -Math.PI / 2;

        // Metadados para raycasting
        artGroup.userData = art;
        scene.add(artGroup);
        paintings.push(artGroup);

        // Holofote dedicado para cada obra
        const spotLight = new THREE.SpotLight(0xffecd1, 2.8, 10, Math.PI / 4, 0.4, 0.8);
        spotLight.position.set(
            art.side === 'left' ? -2.2 : 2.2,
            4.8,
            art.posZ
        );
        spotLight.target = artGroup;
        spotLight.castShadow = !isMobile;
        if (!isMobile) {
            spotLight.shadow.mapSize.width = 512;
            spotLight.shadow.mapSize.height = 512;
        }
        scene.add(spotLight);
    });
}


// ============================================
// ILUMINAÇÃO DO CORREDOR
// ============================================

function setupLights() {
    // Luz ambiente geral
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));

    // Luminárias de teto pontuais
    for (let z = 0; z >= -40; z -= 10) {
        const light = new THREE.PointLight(0xffffff, 0.7, 15, 1.2);
        light.position.set(0, 5, z);
        scene.add(light);

        // Detalhe visual da lâmpada
        const bulbGroup = new THREE.Group();
        const bulb = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.2, 0.08, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.2, 0.02, 8, 16),
            new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                metalness: 0.8,
                roughness: 0.3
            })
        );
        ring.rotation.x = Math.PI / 2;
        bulbGroup.add(bulb, ring);
        bulbGroup.position.set(0, 5.42, z);
        scene.add(bulbGroup);
    }

    // Luz de acento na parede do fundo (realça profundidade)
    const backAccentLight = new THREE.PointLight(0x4a6a8a, 0.6, 12, 1.5);
    backAccentLight.position.set(0, 3, -38);
    scene.add(backAccentLight);
}


// ============================================
// SISTEMA DE INTERAÇÃO
// ============================================

function bindEvents() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onCanvasClick);
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: false });

    btnClose.addEventListener('click', exitFocus);
    btnBack.addEventListener('click', exitFocus);
    btnUp.addEventListener('click', () => moveCameraAlongCorridor(-1.5));
    btnDown.addEventListener('click', () => moveCameraAlongCorridor(1.5));
}

/** Normaliza coordenadas de tela para o espaço do raycaster (-1 a +1) */
function updateMouse(x, y) {
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
}

function onMouseMove(event) {
    updateMouse(event.clientX, event.clientY);
}

/** Captura posição do toque para raycasting correto no mobile */
function onTouchStart(event) {
    if (event.touches.length > 0) {
        updateMouse(event.touches[0].clientX, event.touches[0].clientY);
    }
}

/**
 * Percorre a hierarquia de objetos para encontrar
 * o grupo da pintura a partir de qualquer mesh filha
 */
function findPaintingFromIntersect(intersects) {
    for (let i = 0; i < intersects.length; i++) {
        let obj = intersects[i].object;
        while (obj.parent && obj !== scene) {
            if (obj.userData && obj.userData.id) return obj;
            obj = obj.parent;
        }
    }
    return null;
}

function onCanvasClick() {
    if (isFocused) return;
    raycaster.setFromCamera(mouse, camera);
    const hit = findPaintingFromIntersect(
        raycaster.intersectObjects(scene.children, true)
    );
    if (hit) focusOnPainting(hit);
}

function onKeyDown(event) {
    // Escape para sair do foco
    if (isFocused) {
        if (event.code === 'Escape') exitFocus();
        return;
    }
    // Setas e WASD para caminhar
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveCameraAlongCorridor(-1.2);
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveCameraAlongCorridor(1.2);
            break;
    }
}

function onWheel(event) {
    if (isFocused) return;
    event.preventDefault();
    moveCameraAlongCorridor(event.deltaY * 0.015);
}

/** Move o alvo da câmera, respeitando os limites do corredor */
function moveCameraAlongCorridor(amount) {
    targetZ = Math.max(MAX_Z, Math.min(MIN_Z, targetZ + amount));
}


// ============================================
// FOCO / DESFOCO DAS OBRAS
// ============================================

function focusOnPainting(paintingGroup) {
    isFocused = true;
    focusedPainting = paintingGroup;
    const data = paintingGroup.userData;

    // Sincroniza targetZ para evitar pulo ao sair
    targetZ = paintingGroup.position.z;

    // Posição ideal da câmera em frente ao quadro
    const offset = 2.2;
    const camX = paintingGroup.position.x + (data.side === 'left' ? offset : -offset);

    gsap.to(camera.position, {
        x: camX,
        y: paintingGroup.position.y,
        z: targetZ,
        duration: 1.8,
        ease: 'power2.out',
        onUpdate: () => {
            camera.lookAt(
                paintingGroup.position.x,
                paintingGroup.position.y,
                paintingGroup.position.z
            );
        }
    });

    // Atualiza e exibe o painel de informações
    artTitle.innerText = data.title;
    artAuthor.innerText = `${data.author}, ${new Date().getFullYear() - 1}`;
    artDesc.innerText = data.desc;
    artPanel.classList.add('visible');
}

function exitFocus() {
    if (!isFocused) return;

    // Esconde o painel
    artPanel.classList.remove('visible');

    const exitZ = focusedPainting.position.z;

    // Retorna a câmera ao centro do corredor
    gsap.to(camera.position, {
        x: 0,
        y: 1.7,
        z: exitZ,
        duration: 1.5,
        ease: 'power2.inOut',
        onUpdate: () => camera.lookAt(0, 1.7, exitZ - 10),
        onComplete: () => {
            isFocused = false;
            focusedPainting = null;
            targetZ = exitZ; // Garante sincronia
        }
    });
}


// ============================================
// DETECÇÃO DE HOVER (cursor + dica visual)
// ============================================

function updateHover() {
    if (isFocused) {
        hoverHint.style.opacity = '0';
        renderer.domElement.classList.remove('hovering-painting');
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const hit = findPaintingFromIntersect(
        raycaster.intersectObjects(scene.children, true)
    );

    if (hit) {
        renderer.domElement.classList.add('hovering-painting');
        hoverHint.style.opacity = '0.8';
    } else {
        renderer.domElement.classList.remove('hovering-painting');
        hoverHint.style.opacity = '0';
    }
}


// ============================================
// REDIMENSIONAMENTO RESPONSIVO
// ============================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// ============================================
// LOOP DE RENDERIZAÇÃO PRINCIPAL
// ============================================

function animate() {
    requestAnimationFrame(animate);

    // Suaviza locomoção quando não está focado em obra
    if (!isFocused) {
        camera.position.z += (targetZ - camera.position.z) * 0.1;
        camera.position.x += (0 - camera.position.x) * 0.1;
        camera.position.y += (1.7 - camera.position.y) * 0.1;
        camera.lookAt(0, 1.7, camera.position.z - 10);
    }

    updateHover();
    renderer.render(scene, camera);
}


// ============================================
// DADOS DE FALLBACK
// Usados caso data.json não consiga ser carregado
// ============================================

function getFallbackData() {
    return [
        { id: "art-l1", title: "Vórtice Cromático I", author: "Marconi Maciel", desc: "Turbulência das emoções primárias através de pinceladas caóticas.", side: "left", posZ: -8, style: "vortex" },
        { id: "art-l2", title: "Silêncio Geométrico", author: "Elena Rostova", desc: "Estudo sobre equilíbrio e minimalismo espacial.", side: "left", posZ: -18, style: "geometric" },
        { id: "art-l3", title: "Líquido em Suspensão", author: "Jean-Pierre Blanc", desc: "Fluidez capturada no tempo, formas biológicas.", side: "left", posZ: -28, style: "fluid" },
        { id: "art-r1", title: "Metrópole de Neon", author: "Takashi Sato", desc: "Reflexo das luzes de Tóquio sob a chuva.", side: "right", posZ: -8, style: "neon" },
        { id: "art-r2", title: "Horizonte Fragmentado", author: "Clara Mendes", desc: "Desconstrução da paisagem marítima.", side: "right", posZ: -18, style: "horizon" },
        { id: "art-r3", title: "Entropia Solar", author: "Marcus Vance", desc: "Calor cósmico transformado em arte.", side: "right", posZ: -28, style: "solar" }
    ];
}

/**
 * Quebra texto automaticamente para caber dentro de uma largura máxima
 * no contexto de um Canvas 2D
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

/**
 * Cria um plano com texto transparente e o coloca na parede do fundo
 */
function addInfoTextToBackWall(wallZ, wallWidth, wallHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Fundo 100% transparente (o texto flutua sobre a cor da parede)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ==========================================
    // EDITE O TEXTO AQUI
    // ==========================================
    const titulo = 'Aldo Luna';
    const corpo = 'Aldo Luna é fotógrafo e pesquisador visual dedicado à documentação poética da cultura popular, da memória social e dos territórios simbólicos do Nordeste brasileiro. Seu trabalho desenvolve-se na interseção entre fotografia documental, narrativa visual e patrimônio cultural, com interesse especial pelas manifestações populares, pelos rituais de fé, pelas dinâmicas do cotidiano e pelos processos de permanêcia da memória coletiva. Por meio de uma linguagem visual marcada pela observação sensível e pela atenção aos detalhes simbólicos, suas fotografias investigam relações entre corpo, território, tradição e pertencimento, buscando traduzir em poesia visual experiências culturais profundamente enraizadas nas comunidades retratadas. Sua produção organiza-se em coleções autorais, projetos curatoriais e exposições voltadas à valorização da cultura e das identidades locais, compreendendo a imagem fotográfica como documento afetivo, testemunho do tempo e espaço de imaginação.';

    // --- Estilo do Título ---
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000000'; // Cor do título
    ctx.font = 'bold 72px Inter, sans-serif';
    ctx.fillText(titulo, canvas.width / 2, 15);

    // --- Linha decorativa ---
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(canvas.width / 2 - 250, 83, 500, 4);

    // --- Estilo do Corpo do Texto ---
    ctx.fillStyle = 'rgb(0, 0, 0)'; // Cor do texto (80% de opacidade)
    ctx.font = '29px Inter, sans-serif';

    // Chama a função de quebra de linha
    wrapText(ctx, corpo, canvas.width / 2, 90, 1030, 28);

    // ==========================================
    // CRIAÇÃO DA MESH NO THREE.JS
    // ==========================================
    const textTexture = new THREE.CanvasTexture(canvas);
    textTexture.encoding = THREE.sRGBEncoding;

    // MeshBasicMaterial para não ser afetado pela sombra escura da parede
    const textMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(wallWidth * 0.7, wallHeight * 0.7), // 70% do tamanho da parede
        new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            depthWrite: false // Evita flickering/z-fighting com a parede atrás
        })
    );

    // Posiciona levemente à frente da parede (0.02 unidades)
    textMesh.position.set(0, wallHeight / 2, wallZ + 0.02);
    scene.add(textMesh);
}
// ============================================
// PLACA DE PÉ (Totem de Entrada)
// ============================================

/**
 * Cria uma placa em pé, perpendicular às paredes,
 * com suporte e base metálica
 */
function addStandingPlaque() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // --- DESENHO DA PLACA (Acrílico escuro) ---
    ctx.fillStyle = 'rgba(15, 15, 15, 0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Bordas elegantes
    ctx.strokeStyle = 'rgba(180, 150, 100, 0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    
    ctx.strokeStyle = 'rgba(180, 150, 100, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(35, 35, canvas.width - 70, canvas.height - 70);

    // --- TIPOGRAFIA ---
    ctx.textAlign = 'center';
    
    // Subtítulo
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 44px Inter, sans-serif';
    ctx.fillText('FOTOGRAFIA DE CULTURA E MEMÓRIA', canvas.width / 2, 250);

    // Título Principal
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 90px Inter, sans-serif';
    ctx.fillText('ALDO LUNA', canvas.width / 2, 450);

     
    

    // Rodapé
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.fillText('Cada imagem é um convite ao encontro', canvas.width / 2, 600);
    ctx.fillText('entre memória, território e imaginação.', canvas.width / 2, 645);

    // --- CRIAÇÃO DA MESH NO THREE.JS ---
    const plaqueTexture = new THREE.CanvasTexture(canvas);
    plaqueTexture.encoding = THREE.sRGBEncoding;

    // Material da placa (Fosco, leve brilho metálico)
    const plaqueMat = new THREE.MeshStandardMaterial({
        map: plaqueTexture,
        roughness: 0.4,
        metalness: 0.3
    });

    // Material do suporte (Preto fosco)
    const supportMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.5,
        metalness: 0.6
    });

    // 1. A Placa em si (0.8m largura x 0.8m altura x 2cm espessura)
    const plaqueBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.02),
        plaqueMat
    );

    // 2. Haste central vertical (0.7m de altura)
    const verticalSupport = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.7, 0.08),
        supportMat
    );
    verticalSupport.position.y = -0.75; // Desce a partir do meio da placa

    // 3. Base no chão (Disco fino para estabilidade)
    const baseSupport = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.01, 16),
        supportMat
    );
    baseSupport.position.y = -1.15; // Encosta no chão

    // Agrupa tudo para mover junto
    const signGroup = new THREE.Group();
    signGroup.add(plaqueBoard, verticalSupport, baseSupport);

    // Posicionamento: Centro do corredor (X=0), perto da entrada (Z=-2.5)
    // O Y=0.8 deixa o centro da placa a 80cm do chão (base da placa fica a 40cm)
    signGroup.position.set(0, 1.2, -2.5);

    // ★ O SEGREDO AQUI: Nenhuma rotação no eixo Y! ★
    // Como o PlaneGeometry/BoxGeometry padrão já nasce de frente para o Z positivo,
    // ele já fica perpendicular à parede e de frente para quem entra.

    scene.add(signGroup);
}

// ============================================
// PONTO DE ENTRADA
// ============================================

window.onload = init;