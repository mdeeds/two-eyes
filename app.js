const EXPRESSION_KEYS = [
    "1_Neutral", "2_Wide-Eyed_Surprise", "3_Angry_Menacing",
    "4_Suspicious_Glance", "5_Full_Blink", "6_Cross-Eyed_Dorky",
    "7_Sleepy_Bored", "8_Curious_Inquisitive", "9_Scared_Shocked",
    "10_Sly_Scheming", "11_Dizzy_Disoriented", "12_Sad_Pitying"
];

const HOLD_DURATION = 1500;
const TRANSITION_DURATION = 500;

// Easing function for smooth morphing (ease-in-out cubic)
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Interpolation helpers
const lerp = (start, end, t) => start + (end - start) * t;

const lerpPoint = (p1, p2, t) => ({
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t),
    cp_in: [lerp(p1.cp_in[0], p2.cp_in[0], t), lerp(p1.cp_in[1], p2.cp_in[1], t)],
    cp_out: [lerp(p1.cp_out[0], p2.cp_out[0], t), lerp(p1.cp_out[1], p2.cp_out[1], t)]
});

const lerpShape = (s1, s2, t) => ({
    top: lerpPoint(s1.top, s2.top, t),
    right: lerpPoint(s1.right, s2.right, t),
    bottom: lerpPoint(s1.bottom, s2.bottom, t),
    left: lerpPoint(s1.left, s2.left, t)
});

const lerpEye = (e1, e2, t) => ({
    sclera: lerpShape(e1.sclera, e2.sclera, t),
    pupil: lerpShape(e1.pupil, e2.pupil, t)
});

const lerpState = (s1, s2, t) => ({
    left_eye: lerpEye(s1.left_eye, s2.left_eye, t),
    right_eye: lerpEye(s1.right_eye, s2.right_eye, t)
});

// App State
let eyeScale = 1.0;
let role = 'MASTER'; // 'MASTER' (Left) or 'CLIENT' (Right)
let peer = null;
let connections = [];
let presets = null;
let inactivityTimeout;

let syncState = {
    currentIdx: 0,
    nextIdx: 1,
    transitionStartTime: 0
};

async function init() {
    const canvas = document.getElementById('eyeCanvas');
    const ctx = canvas.getContext('2d');
    const label = document.getElementById('expressionLabel');
    const uiPanel = document.getElementById('ui-panel');
    const shareUrlInput = document.getElementById('share-url');

    // Make canvas full screen
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Inactivity UI Toggle
    function resetInactivity() {
        uiPanel.classList.remove('hidden');
        document.body.style.cursor = 'default';
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            uiPanel.classList.add('hidden');
            document.body.style.cursor = 'none';
        }, 5000);
    }
    document.addEventListener('mousemove', resetInactivity);
    document.addEventListener('mousedown', resetInactivity);
    document.addEventListener('keydown', resetInactivity);
    resetInactivity(); // Start timer immediately

    // Zoom Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => eyeScale += 0.2);
    document.getElementById('btn-zoom-out').addEventListener('click', () => eyeScale = Math.max(0.2, eyeScale - 0.2));

    // Select text on click for easy copying
    shareUrlInput.addEventListener('click', function() {
        this.select();
    });

    // Load Data
    try {
        const response = await fetch('./presets.json');
        presets = await response.json();
    } catch (err) {
        console.error("Failed to load presets.json", err);
        label.innerText = "Error loading presets";
        return;
    }

    // PeerJS Networking Setup
    const urlParams = new URLSearchParams(window.location.search);
    const peerIdFromUrl = urlParams.get('peer');

    if (peerIdFromUrl) {
        // CLIENT MODE (RIGHT EYE)
        role = 'CLIENT';
        document.getElementById('role-label').innerText = 'Right Eye';
        
        peer = new Peer();
        peer.on('open', () => {
            label.innerText = "Connecting to Master...";
            const conn = peer.connect(peerIdFromUrl);
            
            conn.on('open', () => {
                console.log("Connected to Master!");
            });
            
            conn.on('data', (data) => {
                if (data.type === 'SYNC') {
                    syncState.currentIdx = data.currentIdx;
                    syncState.nextIdx = data.nextIdx;
                    syncState.transitionStartTime = performance.now() + data.timeUntilTransition;
                }
            });
            
            conn.on('close', () => {
                label.innerText = "Connection lost.";
            });
        });
    } else {
        // MASTER MODE (LEFT EYE)
        role = 'MASTER';
        document.getElementById('role-label').innerText = 'Left Eye';
        document.getElementById('share-container').style.display = 'block';
        syncState.transitionStartTime = performance.now() + HOLD_DURATION;

        peer = new Peer();
        peer.on('open', (id) => {
            const shareUrl = window.location.origin + window.location.pathname + '?peer=' + id;
            shareUrlInput.value = shareUrl;
        });

        peer.on('connection', (conn) => {
            connections.push(conn);
            conn.on('open', () => {
                // Instantly sync the new client to the current cycle
                conn.send({
                    type: 'SYNC',
                    currentIdx: syncState.currentIdx,
                    nextIdx: syncState.nextIdx,
                    timeUntilTransition: Math.max(0, syncState.transitionStartTime - performance.now())
                });
            });
            conn.on('close', () => {
                connections = connections.filter(c => c !== conn);
            });
        });
    }

    // Rendering Logic
    function drawEye(eyeData) {
        ctx.save();
        // Move to exact center of the window, apply global scale, and flip Y axis to match Cartesian math
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(150 * eyeScale, -150 * eyeScale); 
        
        const order = ["top", "right", "bottom", "left"];
        
        function drawShape(shapeData, fillStyle) {
            ctx.beginPath();
            const p0 = shapeData[order[0]];
            ctx.moveTo(p0.x, p0.y);
            
            for (let i = 0; i < order.length; i++) {
                const n1 = shapeData[order[i]];
                const n2 = shapeData[order[(i + 1) % order.length]];
                
                const cp1x = n1.x + n1.cp_out[0];
                const cp1y = n1.y + n1.cp_out[1];
                const cp2x = n2.x + n2.cp_in[0];
                const cp2y = n2.y + n2.cp_in[1];
                
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, n2.x, n2.y);
            }
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }
        
        // Draw Sclera
        drawShape(eyeData.sclera, "#ffffff");
        
        // Draw Pupil
        drawShape(eyeData.pupil, "#000000");
        
        ctx.restore();
    }

    function renderLoop() {
        const now = performance.now();
        
        // Master drives the state changes
        if (role === 'MASTER') {
            if (now > syncState.transitionStartTime + TRANSITION_DURATION) {
                // Cycle complete, step forward
                syncState.currentIdx = syncState.nextIdx;
                syncState.nextIdx = (syncState.nextIdx + 1) % EXPRESSION_KEYS.length;
                syncState.transitionStartTime = now + HOLD_DURATION;

                // Broadcast to all connected clients
                const msg = {
                    type: 'SYNC',
                    currentIdx: syncState.currentIdx,
                    nextIdx: syncState.nextIdx,
                    timeUntilTransition: HOLD_DURATION
                };
                connections.forEach(conn => conn.send(msg));
            }
        }
        
        // Calculate interpolation t (0.0 to 1.0)
        let t = 0;
        if (now >= syncState.transitionStartTime) {
            t = (now - syncState.transitionStartTime) / TRANSITION_DURATION;
            t = Math.min(1.0, Math.max(0.0, t)); // Clamp
        }
        
        const easedT = easeInOutCubic(t);
        
        const startState = presets[EXPRESSION_KEYS[syncState.currentIdx]];
        const endState = presets[EXPRESSION_KEYS[syncState.nextIdx]];
        
        const currentState = lerpState(startState, endState, easedT);
        
        // Update UI Label
        const displayLabel = EXPRESSION_KEYS[syncState.currentIdx].replace(/_/g, ' ');
        label.innerText = displayLabel;
        
        // Clear full canvas
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Render appropriate eye for this window's role
        if (role === 'MASTER') {
            drawEye(currentState.left_eye);
        } else {
            drawEye(currentState.right_eye);
        }
        
        requestAnimationFrame(renderLoop);
    }

    // Start rendering
    requestAnimationFrame(renderLoop);
}

document.addEventListener('DOMContentLoaded', init);
