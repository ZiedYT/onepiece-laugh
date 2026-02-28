const CONFIG = {
    revealDurations: [0.1, 0.2, 0.5, 1.0],
    imageFolder: 'images',
    laughsFolder: 'laughs'
};

const RECENT_LIMIT = 20;

// Central progression config - controls when audio reveals and hints appear
const PROGRESSION = [
    { mistake: 0, type: 'audio', duration: 0.1 },
    { mistake: 1, type: 'audio', duration: 0.2 },
    { mistake: 2, type: 'audio', duration: 0.5 },
    { mistake: 3, type: 'audio', duration: 1.0 },
    { mistake: 4, type: 'audio', duration: Infinity },
    { mistake: 5, type: 'hint', category: 'Episode', getValue: (char) => char.debutEpisode || 'Unknown' },
    { mistake: 6, type: 'hint', category: 'Height', getValue: (char) => (char.height || 'Unknown') + ' cm' },
    { mistake: 7, type: 'hint', category: 'Fruit Type', getValue: (char) => char.devilFruitType || 'None' },
    { mistake: 8, type: 'hint', category: 'Bounty', getValue: (char) => char.bounty || 'Unknown' },
    { mistake: 9, type: 'hint', category: 'Haki', getValue: (char) => char.haki ? (Array.isArray(char.haki) ? char.haki.join(', ') : char.haki) : 'None' },
    { mistake: 10, type: 'hint', category: 'Affiliation', getValue: (char) => char.affiliation || 'Unknown' },
    { mistake: 11, type: 'hint', category: 'Devil Fruit', getValue: (char) => char.devilFruitName !== 'None' ? char.devilFruitName : 'None' }
];

let audioContext = null;

let state = {
    characters: [],
    currentCharacter: null,
    mistakes: 0,
    correctAnswers: 0,
    totalAnswers: 0,
    audioBuffer: null,
    audioSource: null,
    isPlaying: false,
    currentAudioNode: null,
    currentAudioUrl: null,
    wrongGuesses: [],
    forceFullAudio: false,
    awaitingNext: false,
    recentCharacters: []
};

// Initialize Web Audio context
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function loadCharacters() {
    try {
        if (typeof QUIZ_CHARACTERS === 'undefined') {
            throw new Error('Quiz data not loaded. Run setup.py first.');
        }
        state.characters = QUIZ_CHARACTERS;
        initializeQuiz();
    } catch (error) {
        console.error('Error loading characters:', error);
        document.getElementById('loading').innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
    }
}

function initializeQuiz() {
    initAudioContext();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('quiz').style.display = 'flex';
    setupAudio();
    loadNewCharacter();
    updateRevealDots();
}

function getNextCharacter() {
    const recentSet = new Set(state.recentCharacters);
    const available = state.characters.filter(char => !recentSet.has(char.championId));

    if (available.length === 0) {
        state.recentCharacters = [];
        return state.characters[Math.floor(Math.random() * state.characters.length)];
    }

    return available[Math.floor(Math.random() * available.length)];
}

function loadNewCharacter() {
    if (state.currentAudioNode) {
        try {
            state.currentAudioNode.stop();
            state.currentAudioNode.disconnect();
        } catch (error) {
            // Ignore stop errors on already-stopped nodes
        }
        state.currentAudioNode = null;
    }
    if (state.currentAudioUrl) {
        URL.revokeObjectURL(state.currentAudioUrl);
        state.currentAudioUrl = null;
    }
    state.audioBuffer = null;
    state.isPlaying = false;
    state.currentCharacter = getNextCharacter();
    state.recentCharacters.push(state.currentCharacter.championId);
    if (state.recentCharacters.length > RECENT_LIMIT) {
        state.recentCharacters.shift();
    }
    state.mistakes = 0;
    state.wrongGuesses = [];
    state.forceFullAudio = false;
    state.awaitingNext = false;
    state.totalAnswers++;
    document.getElementById('totalCount').textContent = state.totalAnswers;
    document.getElementById('searchInput').value = '';
    document.getElementById('dropdown').classList.remove('active');
    document.getElementById('feedback').innerHTML = '';
    document.getElementById('feedback').classList.remove('show');
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('giveUpBtn').disabled = false;
    document.getElementById('giveUpBtn').textContent = 'Give up';
    document.getElementById('searchInput').disabled = false;
    updateRevealDots();
    updateHintDisplay();
    loadAudio();
}

function loadAudio() {
    const laughFileName = state.currentCharacter.laugh;
    
    if (!QUIZ_AUDIO || !QUIZ_AUDIO[laughFileName]) {
        console.error('Audio not found in embedded data:', laughFileName);
        return;
    }

    const base64Data = QUIZ_AUDIO[laughFileName];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const arrayBuffer = bytes.buffer.slice(0);

    initAudioContext();
    audioContext.decodeAudioData(arrayBuffer).then(decoded => {
        state.audioBuffer = {
            duration: decoded.duration,
            buffer: decoded
        };
        updateAudioTimeline();
    }).catch(err => {
        console.error('Error decoding audio:', laughFileName, err);
    });
}

function setupAudio() {
    document.getElementById('playBtn').addEventListener('click', playAudio);
    document.getElementById('searchInput').addEventListener('input', onSearchInput);
    document.getElementById('nextBtn').addEventListener('click', handleNextQuiz);
    document.getElementById('giveUpBtn').addEventListener('click', handleGiveUp);
}

function handleNextQuiz() {
    loadNewCharacter();
}

function handleGiveUp() {
    if (state.awaitingNext) {
        loadNewCharacter();
        return;
    }

    const char = state.currentCharacter;
    state.forceFullAudio = true;
    
    const feedbackContainer = document.getElementById('feedback');
    const giveUpBox = document.createElement('div');
    giveUpBox.className = 'feedback show incorrect feedback-item';
    const imageFile = char.laugh.replace('.mp3', '.jpg');
    const imageUrl = `${CONFIG.imageFolder}/${imageFile}`;
    giveUpBox.innerHTML = `
        <img src="${imageUrl}" alt="" class="feedback-image" onerror="this.style.display='none'">
        <div class="feedback-text">You gave up! The answer was ${char.championName}.</div>
    `;
    feedbackContainer.insertBefore(giveUpBox, feedbackContainer.firstChild);
    
    document.getElementById('searchInput').disabled = true;
    state.awaitingNext = true;
    document.getElementById('giveUpBtn').disabled = false;
    document.getElementById('giveUpBtn').textContent = 'Next laugh';
    document.getElementById('nextBtn').style.display = 'none';
    updateAudioTimeline();
}

function getCurrentRevealDuration() {
    if (state.forceFullAudio) {
        return Infinity;
    }
    const prog = PROGRESSION.find(p => p.mistake === state.mistakes);
    if (prog && prog.type === 'audio') {
        return prog.duration;
    }
    if (state.mistakes >= 4) {
        return Infinity; // Full audio after 4 errors
    }
    return PROGRESSION[0].duration; // Default to first audio duration
}

function isAtMaxReveal() {
    if (state.forceFullAudio) {
        return true;
    }
    return state.mistakes >= 4;
}

function getNextHint() {
    const currentProg = PROGRESSION.find(p => p.mistake === state.mistakes);
    
    if (currentProg) {
        if (currentProg.type === 'audio') {
            return `${currentProg.duration}s audio revealed`;
        } else if (currentProg.type === 'hint') {
            return `Hint: ${currentProg.category}`;
        }
    }
    return '';
}

function playAudio() {
    if (!state.audioBuffer || state.isPlaying) return;

    // Stop any currently playing audio
    if (state.currentAudioNode) {
        try {
            state.currentAudioNode.stop();
            state.currentAudioNode.disconnect();
        } catch (error) {
            // Ignore stop errors on already-stopped nodes
        }
    }

    const isMaxReveal = isAtMaxReveal();
    const requestedDuration = isMaxReveal ? state.audioBuffer.duration : getCurrentRevealDuration();
    const revealDuration = Math.min(requestedDuration, state.audioBuffer.duration);
    state.isPlaying = true;
    document.getElementById('playBtn').disabled = true;

    initAudioContext();
    audioContext.resume();

    const originalBuffer = state.audioBuffer.buffer;
    const paddedBuffer = audioContext.createBuffer(
        originalBuffer.numberOfChannels,
        originalBuffer.length,
        originalBuffer.sampleRate
    );

    const revealSamples = Math.floor(revealDuration * originalBuffer.sampleRate);
    for (let ch = 0; ch < originalBuffer.numberOfChannels; ch++) {
        const origData = originalBuffer.getChannelData(ch);
        const paddedData = paddedBuffer.getChannelData(ch);
        paddedData.set(origData.subarray(0, revealSamples));
    }

    const source = audioContext.createBufferSource();
    source.buffer = paddedBuffer;
    source.connect(audioContext.destination);
    state.currentAudioNode = source;
    
    let rafId = null;
    const startTime = audioContext.currentTime;
    
    const checkTime = (currentTime) => {
        const elapsed = audioContext.currentTime - startTime;
        
        if (elapsed >= revealDuration) {
            try {
                source.stop();
                source.disconnect();
            } catch (error) {
                // Ignore stop errors on already-stopped nodes
            }
            state.isPlaying = false;
            document.getElementById('playBtn').disabled = false;
            state.currentAudioNode = null;
            if (rafId) cancelAnimationFrame(rafId);
        } else {
            updateAudioProgressPlayback(elapsed, revealDuration, state.audioBuffer.duration);
            rafId = requestAnimationFrame(checkTime);
        }
    };

    source.start(0);
    rafId = requestAnimationFrame(checkTime);
}

function updateAudioProgressPlayback(elapsed, revealDuration, totalDuration) {
    const safeTotal = Math.max(0.001, totalDuration);
    const maxPercent = (Math.min(revealDuration, safeTotal) / safeTotal) * 100;
    const percent = Math.min((elapsed / safeTotal) * 100, maxPercent);
    document.getElementById('audioProgress').style.width = percent + '%';
    document.getElementById('currentTime').textContent = elapsed.toFixed(1) + 's';
}



function updateAudioTimeline() {
    if (!state.audioBuffer) return;
    const audioLimit = document.getElementById('audioLimit');
    if (isAtMaxReveal()) {
        audioLimit.style.display = 'none';
    } else {
        audioLimit.style.display = 'block';
        const revealDuration = getCurrentRevealDuration();
        const percent = (revealDuration / state.audioBuffer.duration) * 100;
        audioLimit.style.left = percent + '%';
    }
    // Reset progress display
    document.getElementById('audioProgress').style.width = '0%';
    document.getElementById('currentTime').textContent = '0.0s';
}

function updateRevealDots() {
    // This function is now deprecated since we moved to hint boxes
    // Keeping for backward compatibility
}

function updateHintDisplay() {
    const hintsContainer = document.getElementById('hintsContainer');
    const nextHintInfo = document.getElementById('nextHintInfo');
    
    if (!hintsContainer || !nextHintInfo) return;
    
    // Get all hint items from progression (not audio reveals)
    const hintItems = PROGRESSION.filter(p => p.type === 'hint');
    
    // Clear previous hints
    hintsContainer.innerHTML = '';
    
    // Display all hint boxes from the start, reveal value when unlocked
    hintItems.forEach(prog => {
        const isUnlocked = state.mistakes >= prog.mistake;
        const value = isUnlocked ? prog.getValue(state.currentCharacter) : '?????';
        
        const hintBox = document.createElement('div');
        hintBox.className = 'hint-box';
        hintBox.innerHTML = `
            <div class="hint-label">${prog.category}</div>
            <div class="hint-value">${value}</div>
        `;
        hintsContainer.appendChild(hintBox);
    });
    
    // Calculate next hint countdown
    const nextLockedHint = hintItems.find(p => state.mistakes < p.mistake);
    if (nextLockedHint) {
        const countdown = nextLockedHint.mistake - state.mistakes;
        
        if (countdown > 0) {
            nextHintInfo.textContent = `Next hint in ${countdown} ${countdown === 1 ? 'guess' : 'guesses'}`;
        } else {
            nextHintInfo.textContent = 'Next hint coming up!';
        }
    } else {
        nextHintInfo.textContent = 'No more hints!';
    }
}

function onSearchInput(event) {
    const query = event.target.value.toLowerCase();
    const dropdown = document.getElementById('dropdown');

    if (!query) {
        dropdown.classList.remove('active');
        return;
    }

    const matches = searchCharacters(query);
    renderDropdown(matches);
    dropdown.classList.toggle('active', matches.length > 0);
}

function searchCharacters(query) {
    return state.characters.map(char => {
        const matches = [];

        if (char.championName.toLowerCase().includes(query)) {
            matches.push({ type: 'name', value: char.championName });
        }

        if (char.alias) {
            char.alias.forEach(alias => {
                if (alias.toLowerCase().includes(query)) {
                    matches.push({ type: 'alias', value: alias });
                }
            });
        }

        if (char.epithet) {
            char.epithet.forEach(epithet => {
                if (epithet.toLowerCase().includes(query)) {
                    matches.push({ type: 'epithet', value: epithet });
                }
            });
        }

        return matches.length > 0 ? { character: char, matches } : null;
    }).filter(Boolean).slice(0, 8);
}

function renderDropdown(matches) {
    const dropdown = document.getElementById('dropdown');
    dropdown.innerHTML = matches.map(({ character, matches: matchList }) => {
        const primaryMatch = matchList[0];
        const aka = primaryMatch.type === 'name' ? null : `aka: ${primaryMatch.value}`;
        const imageFile = character.laugh.replace('.mp3', '.jpg');
        const imageUrl = `${CONFIG.imageFolder}/${imageFile}`;

        return `
            <div class="dropdown-item" onclick="selectCharacter('${character.championName}')">
                <img src="${imageUrl}" alt="" class="dropdown-image" onerror="this.style.display='none'">
                <div class="dropdown-info">
                    <div class="dropdown-name">${character.championName}</div>
                    ${aka ? `<div class="dropdown-aka">${aka}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function selectCharacter(characterName) {
    const selected = state.characters.find(c => c.championName === characterName);
    const feedback = document.getElementById('feedback');

    if (selected.championId === state.currentCharacter.championId) {
        state.correctAnswers++;
        state.forceFullAudio = true;
        document.getElementById('correctCount').textContent = state.correctAnswers;
        const feedbackContainer = document.getElementById('feedback');
        const correctImageFile = selected.laugh.replace('.mp3', '.jpg');
        const correctImageUrl = `${CONFIG.imageFolder}/${correctImageFile}`;
        const correctBox = document.createElement('div');
        correctBox.className = 'feedback show correct feedback-item';
        correctBox.innerHTML = `
            <img src="${correctImageUrl}" alt="" class="feedback-image" onerror="this.style.display='none'">
            <div class="feedback-text">✓ Correct! It's ${characterName}!</div>
        `;
        feedbackContainer.insertBefore(correctBox, feedbackContainer.firstChild);
        document.getElementById('searchInput').disabled = true;
        state.awaitingNext = true;
        document.getElementById('giveUpBtn').disabled = false;
        document.getElementById('giveUpBtn').textContent = 'Next laugh';
        document.getElementById('nextBtn').style.display = 'none';
        updateAudioTimeline();
    } else {
        state.mistakes++;

        const imageFile = selected.laugh.replace('.mp3', '.jpg');
        const imageUrl = `${CONFIG.imageFolder}/${imageFile}`;

        const nextHint = getNextHint();

        state.wrongGuesses.push({
            name: selected.championName,
            hint: nextHint,
            imageUrl
        });

        // Create separate feedback boxes for each wrong guess (newest first, going down)
        const feedback = document.getElementById('feedback');
        feedback.innerHTML = '';
        state.wrongGuesses.slice().reverse().forEach((entry) => {
            const guessBox = document.createElement('div');
            guessBox.className = 'feedback show incorrect feedback-item';
            guessBox.innerHTML = `
                <img src="${entry.imageUrl}" alt="" class="feedback-image" onerror="this.style.display='none'">
                <div class="feedback-text">✗ Wrong guess: ${entry.name}! ${entry.hint}</div>
            `;
            feedback.appendChild(guessBox);
        });

        updateRevealDots();
        updateHintDisplay();
        updateAudioTimeline();
    }

    document.getElementById('searchInput').value = '';
    document.getElementById('dropdown').classList.remove('active');
}

loadCharacters();
