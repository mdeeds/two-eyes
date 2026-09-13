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

async function init() {
    const canvas = document.getElementById('eyeCanvas');
    const ctx = canvas.getContext('2d');
    const label = document.getElementById('expressionLabel');
    
    let presets;
    try {
        const response = await fetch('./presets.json');
        presets = await response.json();
    } catch (err) {
        console.error("Failed to load presets.json", err);
        label.innerText = "Error loading presets";
        return;
    }

    let startTime = null;

    function drawEye(eyeData, offsetX) {
        ctx.save();
        // Move to center of canvas, apply offset for left/right eye, scale up, and flip Y
        ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2);
        ctx.scale(150, -150); 
        
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
        
        // Draw outer black socket boundary (optional, for aesthetics)
        ctx.beginPath();
        ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "#111111";
        ctx.fill();

        // Draw Sclera
        drawShape(eyeData.sclera, "#ffffff");
        
        // Draw Pupil
        drawShape(eyeData.pupil, "#000000");
        
        ctx.restore();
    }

    function renderLoop(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        const totalDuration = HOLD_DURATION + TRANSITION_DURATION;
        const cycleTime = elapsed % totalDuration;
        
        // Calculate indices
        const currentCycle = Math.floor(elapsed / totalDuration);
        const currentIndex = currentCycle % EXPRESSION_KEYS.length;
        const nextIndex = (currentIndex + 1) % EXPRESSION_KEYS.length;
        
        label.innerText = EXPRESSION_KEYS[currentIndex].replace(/_/g, ' ');
        
        // Calculate progression t (0.0 to 1.0)
        let t = 0;
        if (cycleTime > HOLD_DURATION) {
            t = (cycleTime - HOLD_DURATION) / TRANSITION_DURATION;
        }
        
        const easedT = easeInOutCubic(t);
        
        const startState = presets[EXPRESSION_KEYS[currentIndex]];
        const endState = presets[EXPRESSION_KEYS[nextIndex]];
        
        const currentState = lerpState(startState, endState, easedT);
        
        // Clear canvas
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw eyes (offset left by -180px, right by +180px)
        drawEye(currentState.left_eye, -180);
        drawEye(currentState.right_eye, 180);
        
        requestAnimationFrame(renderLoop);
    }

    requestAnimationFrame(renderLoop);
}

// Start the application when the DOM is ready
document.addEventListener('DOMContentLoaded', init);
