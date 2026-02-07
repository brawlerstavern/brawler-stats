// Brawlers Tavern - Main Application
// Global data variables
let usersData = [];
let guildMap = {};
let ctfNormStats = {};
let brawlNormStats = {};

// Data loading
async function loadData() {
    try {
        const [users, guilds, ctfStats, brawlStats] = await Promise.all([
            fetch('data/users.json').then(r => r.json()),
            fetch('data/guilds.json').then(r => r.json()),
            fetch('data/ctf_stats.json').then(r => r.json()),
            fetch('data/brawl_stats.json').then(r => r.json())
        ]);

        usersData = users.filter(u => {
            const username = (u.username || '').toUpperCase();
            return username !== 'TYVAN' && username !== 'LIONEL';
        });
        guildMap = guilds;
        ctfNormStats = ctfStats;
        brawlNormStats = brawlStats;

        console.log(`✓ Loaded ${usersData.length} users`);
        console.log(`✓ Loaded ${Object.keys(guildMap).length} guilds`);

        // Initialize all sections
        renderBrawlers();
        renderSoloLeaderboard();
        renderTeamLeaderboard();
        renderCTFLeaderboard('all');
        renderTraitsLeaderboard();
        renderGuildLeaderboard();
    } catch (error) {
        console.error('Error loading data:', error);
        document.querySelectorAll('.loading').forEach(el => {
            el.innerHTML = `<div class="no-data">Error loading data. Please ensure data files are in the "data/" directory.<br><small>${error.message}</small></div>`;
        });
    }
}

// Utility Functions
function unpackColor(packedColor) {
    if (!packedColor || packedColor === 4294967295) return null; // Skip white/default
    // Construct 3 packs color as RGBA (0xRRGGBBAA)
    const r = (packedColor >> 24) & 0xFF;
    const g = (packedColor >> 16) & 0xFF;
    const b = (packedColor >> 8) & 0xFF;
    const a = packedColor & 0xFF;
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

// Cache for tinted images to avoid re-processing
const tintedImageCache = {};

function applyColorTint(imgUrl, tintColor, tintDarkColor, callback, isEyes = false) {
    // If both colors are white, no tint needed (unless it's eyes - eyes always need tinting)
    if (!isEyes && (!tintColor || tintColor === 4294967295) && (!tintDarkColor || tintDarkColor === 4294967295)) {
        callback(imgUrl);
        return;
    }

    const cacheKey = `${imgUrl}_${tintColor}_${tintDarkColor}_${isEyes}`;
    if (tintedImageCache[cacheKey]) {
        callback(tintedImageCache[cacheKey]);
        return;
    }

    // Construct 3 packs color as RGBA (0xRRGGBBAA)
    // Extract tintColor (for bright pixels)
    const r1 = (tintColor >> 24) & 0xFF;
    const g1 = (tintColor >> 16) & 0xFF;
    const b1 = (tintColor >> 8) & 0xFF;

    // Extract tintDarkColor (for dark pixels)
    let darkColor = tintDarkColor;
    if (isEyes) {
        // For eyes, ALWAYS use white as dark color, don't replace it with black
        darkColor = tintDarkColor || 4294967295; // Default to white if missing
    } else {
        // For non-eyes: Special case handling
        // 255 (0x000000FF) is black - treat as "no dark tint" and use black
        // 4294967295 (0xFFFFFFFF) is white - also means no dark tint, use black
        if (!darkColor || darkColor === 255 || darkColor === 4294967295) {
            darkColor = 0x000000FF; // Black with full alpha in RGBA format
        }
    }
    const r0 = (darkColor >> 24) & 0xFF;
    const g0 = (darkColor >> 16) & 0xFF;
    const b0 = (darkColor >> 8) & 0xFF;

    const img = new Image();
    img.crossOrigin = 'anonymous'; // Request CORS access for canvas manipulation

    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Get image data (this will fail with CORS error if not allowed)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Apply two-color tint (Construct 3 style)
            // Dark pixels (grayscale=0) -> tintDarkColor
            // Light pixels (grayscale=1) -> tintColor
            // Mid-tones -> interpolated
            for (let i = 0; i < data.length; i += 4) {
                // Skip fully transparent pixels
                if (data[i + 3] === 0) continue;

                // Convert pixel to grayscale using perceptual luminance
                const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;

                // Lerp between tintDarkColor and tintColor based on grayscale value
                // result = tintDarkColor * (1 - gray) + tintColor * gray
                data[i] = r0 * (1 - gray) + r1 * gray;       // R
                data[i + 1] = g0 * (1 - gray) + g1 * gray;   // G
                data[i + 2] = b0 * (1 - gray) + b1 * gray;   // B
                // Alpha stays the same
            }

            ctx.putImageData(imageData, 0, 0);
            const tintedUrl = canvas.toDataURL();
            tintedImageCache[cacheKey] = tintedUrl;
            callback(tintedUrl);
        } catch (e) {
            // CORS error - cache the failure and use CSS filter fallback
            if (!tintedImageCache.corsErrorLogged) {
                console.warn('Canvas tinting unavailable (CORS blocked). Using CSS filters for color approximation.');
                tintedImageCache.corsErrorLogged = true;
            }
            tintedImageCache[cacheKey] = imgUrl; // Cache to avoid retrying
            callback(imgUrl);
        }
    };

    img.onerror = () => {
        callback(imgUrl); // Fallback to original
    };

    img.src = imgUrl;
}

function getRankInfo(rating) {
    if (rating >= 2150) return { icon: '8.5', rank: 'Godly+' };
    if (rating >= 2100) return { icon: '8', rank: 'Godly' };
    if (rating >= 2050) return { icon: '7.5', rank: 'Grandmaster+' };
    if (rating >= 2000) return { icon: '7', rank: 'Grandmaster' };
    if (rating >= 1950) return { icon: '6.5', rank: 'Master+' };
    if (rating >= 1900) return { icon: '6', rank: 'Master' };
    if (rating >= 1850) return { icon: '5.5', rank: 'Diamond+' };
    if (rating >= 1800) return { icon: '5', rank: 'Diamond' };
    if (rating >= 1750) return { icon: '4.5', rank: 'Emerald+' };
    if (rating >= 1700) return { icon: '4', rank: 'Emerald' };
    if (rating >= 1650) return { icon: '3.5', rank: 'Gold+' };
    if (rating >= 1600) return { icon: '3', rank: 'Gold' };
    if (rating >= 1500) return { icon: '2.5', rank: 'Silver+' };
    if (rating >= 1400) return { icon: '2', rank: 'Silver' };
    if (rating >= 1300) return { icon: '1.5', rank: 'Bronze+' };
    return { icon: '1', rank: 'Bronze' };
}

function getReputationTitle(reputation) {
    if (reputation >= 57430) return 'Transcended';
    if (reputation >= 47180) return 'Exalted';
    if (reputation >= 37930) return 'Legendary';
    if (reputation >= 29680) return 'Renowned';
    if (reputation >= 22430) return 'Revered';
    if (reputation >= 16180) return 'Honored';
    if (reputation >= 10930) return 'Distinguished';
    if (reputation >= 6680) return 'Recognized';
    if (reputation >= 3430) return 'Patron';
    if (reputation >= 1180) return 'Face in the Crowd';
    return 'Unknown';
}

function getReputationLevel(reputation) {
    const rep = reputation || 0;
    if (rep < 100) return 1;
    const discriminant = 75 * 75 + 20 * (rep + 70);
    const level = (-75 + Math.sqrt(discriminant)) / 10;
    return Math.max(1, Math.floor(level));
}

function formatOnlineTime(milliseconds) {
    if (!milliseconds || milliseconds === 0) return '0h';
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function formatLoginTime(timestamp) {
    if (!timestamp || timestamp === 0) return 'NEVER';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'TODAY';
    } else if (diffDays === 1) {
        return '1 DAY AGO';
    } else {
        return `${diffDays} DAYS AGO`;
    }
}

function formatNumber(num) {
    // Show whole numbers without decimal, others with 1 decimal
    if (num === Math.floor(num)) {
        return num.toString();
    }
    return num.toFixed(1);
}

function createHeadAvatar(player) {
    const layers = [];
    const layerConfigs = [
        { key: 'outfit.head.skinName', path: 'heads', file: 'head_down.png', tintKey: 'outfit.head' },
        // Eyelids layer (just above head)
        { key: 'outfit.eyes.skinName', path: 'eyelids', file: 'eyelids_down.png', tintKey: 'outfit.eyes' },
        { key: 'outfit.eyes.skinName', path: 'eyes', file: 'eyes_down.png', tintKey: 'outfit.eyes', eyeLid: true },
        { key: 'outfit.eyebrows.skinName', path: 'eyebrows', file: 'eyebrows_down.png', tintKey: 'outfit.eyebrows' },
        { key: 'outfit.markings.skinName', path: 'markings', file: 'marking_down.png', tintKey: 'outfit.markings' },
        { key: 'outfit.facialHair.skinName', path: 'facialHairs', file: 'facialHair_down.png', tintKey: 'outfit.facialHair' },
        { key: 'outfit.eyes.skinName', path: 'eyes', file: 'eyes_down.png', tintKey: 'outfit.eyes' },
        { key: 'outfit.hair.skinName', path: 'hairs', file: 'hair_down.png', tintKey: 'outfit.hair' },
        { key: 'outfit.hat.skinName', path: 'hats', file: 'hat_down.png', tintKey: 'outfit.hat' },
        { key: 'outfit.mask.skinName', path: 'masks', file: 'mask_down.png', tintKey: 'outfit.mask' }
    ];

    layerConfigs.forEach((layer, index) => {
        const skinName = player[layer.key];
        // Allow '0' as a valid skin name, but skip null/undefined/NaN/empty
        if (skinName !== null && skinName !== undefined && skinName !== '' && skinName !== 'null' && skinName !== 'NaN') {
            const url = `https://cdn.brawlerstavern.com/catalog/${layer.path}/${skinName}/${layer.file}`;

            // Get tintColor and tintDarkColor for all layers
            let tintColor = player[`${layer.tintKey}.tintColor`];
            let tintDarkColor = player[`${layer.tintKey}.tintDarkColor`];

            // For eyes, ALWAYS use two-color tinting with white as tintDarkColor
            const isEyes = layer.tintKey === 'outfit.eyes';
            if (isEyes) {
                tintDarkColor = 4294967295; // White - ALWAYS for eyes
                if (!tintColor) tintColor = 4294967295; // Default to white if missing
            }

            // Don't tint head or eyelids
            const isHead = layer.tintKey === 'outfit.head';
            const isEyelids = layer.path === 'eyelids';
            const shouldSkipTinting = isHead || isEyelids;

            // Mark image for tinting if needed
            let dataAttr = '';
            // For eyes, ALWAYS apply tinting. For other parts, only if tintColor is set and not white
            // But never tint head or eyelids
            if (!shouldSkipTinting && (isEyes || (tintColor && tintColor !== 4294967295))) {
                dataAttr = ` data-tint-color="${tintColor}" data-tint-dark-color="${tintDarkColor || 0x000000FF}" data-tint-url="${url}" data-is-eyes="${isEyes}" class="needs-tinting"`;
            }

            // Scale all images 2x with proper centering
            const styleAttr = ` style="transform: translate(-50%, -50%) scale(2);"`;

            layers.push(`<img src="${url}" onerror="this.style.display='none'"${dataAttr}${styleAttr}>`);
        }
    });

    return layers.join('');
}

// Apply tinting to all images that need it
function applyAllTints() {
    const imagesToTint = document.querySelectorAll('img.needs-tinting');
    if (imagesToTint.length > 0 && !tintedImageCache.tintLogShown) {
        console.log(`Processing ${imagesToTint.length} avatar images for tinting...`);
        tintedImageCache.tintLogShown = true;
    }
    imagesToTint.forEach(img => {
        if (img.dataset.tintApplied) return; // Already processed

        const tintColor = parseInt(img.dataset.tintColor);
        const tintDarkColor = parseInt(img.dataset.tintDarkColor);
        const url = img.dataset.tintUrl;
        const isEyes = img.dataset.isEyes === 'true';

        applyColorTint(url, tintColor, tintDarkColor, (tintedUrl) => {
            if (tintedUrl !== url) {
                // Canvas tinting succeeded - use the tinted image
                img.src = tintedUrl;
            }
            // If tintedUrl === url, canvas tinting failed due to CORS
            // Just use the original image without CSS filters (they don't work well for two-color tint)

            img.dataset.tintApplied = 'true';
            img.classList.remove('needs-tinting');
        }, isEyes);
    });
}

function normalize(value, min, max) {
    if (max === min) return 5;
    return ((value - min) / (max - min)) * 10;
}

function calculateCTFScores(player) {
    const games = player['stats.event.ctf.games'] || 0;
    if (games < 20) return null;

    const wins = player['stats.event.ctf.wins'] || 0;
    const captures = player['stats.event.ctf.captures'] || 0;
    const charges = player['stats.event.ctf.charges'] || 0;
    const defenses = player['stats.event.ctf.defenses'] || 0;
    const escorts = player['stats.event.ctf.escorts'] || 0;
    const recovers = player['stats.event.ctf.recovers'] || 0;

    const winRate = wins / games;
    const capturesPerGame = captures / games;
    const chargesPerGame = charges / games;
    const defensesPerGame = defenses / games;
    const escortsPerGame = escorts / games;
    const recoversPerGame = recovers / games;

    // Normalize
    const normWinRate = normalize(winRate, ctfNormStats.minWinRate, ctfNormStats.maxWinRate);
    const normCaptures = normalize(capturesPerGame, ctfNormStats.minCaptures, ctfNormStats.maxCaptures);
    const normCharges = normalize(chargesPerGame, ctfNormStats.minCharges, ctfNormStats.maxCharges);
    const normDefenses = normalize(defensesPerGame, ctfNormStats.minDefenses, ctfNormStats.maxDefenses);
    const normEscorts = normalize(escortsPerGame, ctfNormStats.minEscorts, ctfNormStats.maxEscorts);
    const normRecovers = normalize(recoversPerGame, ctfNormStats.minRecovers, ctfNormStats.maxRecovers);

    // Calculate composite scores with normalized stats
    let offensive = (normCaptures + normCharges + normEscorts) / 3;
    let defensive = (normDefenses + normRecovers + normEscorts) / 3; // Escorts is defensive too
    let overall = Math.max(offensive, defensive);

    // Add win rate bonus: 0.1 per 1% over 50%, max +5
    const winRatePercent = winRate * 100;
    if (winRatePercent > 50) {
        const bonus = Math.min((winRatePercent - 50) * 0.1, 5);
        offensive = Math.min(offensive + bonus, 10);
        defensive = Math.min(defensive + bonus, 10);
        overall = Math.min(overall + bonus, 10);
    }

    // Cap all scores at 10
    offensive = Math.min(offensive, 10);
    defensive = Math.min(defensive, 10);
    overall = Math.min(overall, 10);

    return {
        winRate,
        overall,
        offensive,
        defensive,
        capturesPerGame,
        chargesPerGame,
        defensesPerGame,
        escortsPerGame,
        recoversPerGame,
        normCaptures,
        normCharges,
        normDefenses,
        normEscorts,
        normRecovers,
        games,
        wins
    };
}

function calculateBrawlScore(player) {
    const brawls = player['stats.brawl.brawls'] || 0;
    if (brawls < 25) return null;

    const finishes = player['stats.brawl.traits.finishes'] || 0;
    if (finishes === 0) return null;

    // Extract key performance metrics
    const swings = player['stats.brawl.traits.swings'] || 1;
    const hits = player['stats.brawl.traits.hits'] || 0;
    const hurts = player['stats.brawl.traits.hurts'] || 0;
    const combos = player['stats.brawl.traits.combos'] || 0;
    const counters = player['stats.brawl.traits.counters'] || 0;
    const counterAttempts = player['stats.brawl.traits.counterAttempts'] || 1;
    const evasiveBrawls = player['stats.brawl.traits.evasiveBrawls'] || 0;

    // Calculate per-game stats (data-driven from correlation analysis)
    const accuracy = hits / swings; // +0.64 correlation
    const hurtsPerFinish = hurts / finishes; // -0.80 correlation (strongest!)
    const combosPerFinish = combos / finishes; // +0.66 correlation
    const counterRate = counterAttempts > 0 ? counters / counterAttempts : 0; // +0.79 correlation
    const evasionRate = evasiveBrawls / finishes; // +0.35 correlation

    // REFINED WEIGHTS (removed Perfect Combos, Gambles, Quits, Trading, Retaliation):
    // hurtsPerFinish (inverse): 24.8% | counterRate: 24.4% | combosPerFinish: 20.5%
    // accuracy: 19.7% | evasionRate: 10.6%

    // Normalize and score each metric (0-10 scale based on observed ranges)
    const efficiencyScore = Math.max(0, Math.min(1, (25 - hurtsPerFinish) / 20)) * 24.8;
    const counterScore = Math.min(counterRate * 2.5, 1) * 24.4; // 40% counter rate = max
    const comboScore = Math.min(combosPerFinish / 2, 1) * 20.5; // 2 combos per finish = max
    const accuracyScore = Math.min(accuracy / 0.5, 1) * 19.7; // 50% accuracy = max
    const evasionScore = Math.min(evasionRate / 0.8, 1) * 10.6; // 80% evasion = max

    const totalScore = efficiencyScore + counterScore + comboScore + accuracyScore + evasionScore;

    return Math.min(10, Math.max(0, totalScore / 10)); // Normalize to 0-10
}

function calculateTraits(player) {
    const finishes = player['stats.brawl.traits.finishes'] || 0;
    if (finishes === 0) return { traits: [], styles: [] };

    const totalTime = player['stats.brawl.traits.totalTime'] || 0;
    const hits = player['stats.brawl.traits.hits'] || 0;
    const swings = player['stats.brawl.traits.swings'] || 0;
    const hurts = player['stats.brawl.traits.hurts'] || 0;
    const combos = player['stats.brawl.traits.combos'] || 0;
    const perfectCombos = player['stats.brawl.traits.perfectCombos'] || 0;
    const counters = player['stats.brawl.traits.counters'] || 0;
    const counterAttempts = player['stats.brawl.traits.counterAttempts'] || 1;
    const evasiveBrawls = player['stats.brawl.traits.evasiveBrawls'] || 0;
    const gambles = player['stats.brawl.traits.gambles'] || 0;
    const trades = player['stats.brawl.traits.trades'] || 0;
    const retaliations = player['stats.brawl.traits.retaliations'] || 0;
    const sideSwings = player['stats.brawl.traits.sideSwings'] || 0;
    const northTime = player['stats.brawl.traits.northTime'] || 0;
    const westTime = player['stats.brawl.traits.westTime'] || 0;
    const nearCenterTime = player['stats.brawl.traits.nearCenterTime'] || 0;
    const nearWallTime = player['stats.brawl.traits.nearWallTime'] || 0;
    const brawls = player['stats.brawl.brawls'] || 1;
    const leaves = player['stats.brawl.leaves'] || 0;

    const result = { traits: [], styles: [] };

    // Traits
    if (hurts / finishes <= 5) result.traits.push('Decisive Victor');

    const avgAccuracy = hits / swings;
    if (avgAccuracy >= 0.36) result.traits.push('Deadly Accurate');
    else if (avgAccuracy >= 0.3) result.traits.push('Accurate');
    else if (avgAccuracy < 0.2) result.traits.push('Attack Spammer');

    const avgEvasives = evasiveBrawls / finishes;
    if (avgEvasives >= 0.6) result.traits.push('Untouchable');
    else if (avgEvasives >= 0.5) result.traits.push('Evasive');

    if (combos >= 50 && perfectCombos / combos >= 0.2) result.traits.push('Perfect Timing');

    const avgCombos = combos / finishes;
    if (avgCombos >= 1.4) result.traits.push('Excellent Combos');
    else if (avgCombos >= 1.2) result.traits.push('Great Combos');
    else if (avgCombos >= 1) result.traits.push('Good Combos');

    const avgCounters = counters / counterAttempts;
    if (avgCounters >= 0.35) result.traits.push('Excellent Counters');
    else if (avgCounters >= 0.3) result.traits.push('Great Counters');
    else if (avgCounters >= 0.25) result.traits.push('Good Counters');

    if (leaves / brawls > 0.05) result.traits.push('Quitter');

    // Styles
    const avgBrawlDuration = totalTime / finishes;
    if (avgBrawlDuration >= 28000 || (avgBrawlDuration >= 25000 && totalTime / hits > 4000)) {
        result.styles.push('Defensive');
    } else if (avgBrawlDuration <= 23000 && totalTime / hits <= 4000) {
        result.styles.push('Offensive');
    } else {
        result.styles.push('Balanced');
    }

    const positionRatio = 0.55;
    if (northTime / totalTime > positionRatio && westTime / totalTime > positionRatio) {
        result.styles.push('Northwest');
    } else if (northTime / totalTime > positionRatio && (totalTime - westTime) / totalTime > positionRatio) {
        result.styles.push('Northeast');
    } else if (northTime / totalTime > positionRatio) {
        result.styles.push('North');
    } else if ((totalTime - northTime) / totalTime > positionRatio && westTime / totalTime > positionRatio) {
        result.styles.push('Southwest');
    } else if ((totalTime - northTime) / totalTime > positionRatio && (totalTime - westTime) / totalTime > positionRatio) {
        result.styles.push('Southeast');
    } else if ((totalTime - northTime) / totalTime > positionRatio) {
        result.styles.push('South');
    } else if (westTime / totalTime > positionRatio) {
        result.styles.push('West');
    } else if ((totalTime - westTime) / totalTime > positionRatio) {
        result.styles.push('East');
    }

    if (nearCenterTime > nearWallTime) {
        result.styles.push('Center Control');
    } else if (nearWallTime / totalTime > 0.5) {
        result.styles.push('Wall Hugger');
    } else if ((totalTime - nearWallTime - nearCenterTime) / totalTime > 0.3 && nearWallTime > 0.4) {
        result.styles.push('Wall Control');
    }

    if (sideSwings / swings >= 0.6) {
        result.styles.push('Side Slasher');
    } else if ((swings - sideSwings) / swings >= 0.6) {
        result.styles.push('Vertical Slasher');
    }

    if (gambles / hits > 0.3) result.styles.push('Gambler');
    if (trades / hurts >= 0.1) result.styles.push('Trades Well');
    if (retaliations / hurts >= 0.05) result.styles.push('Retaliator');

    return result;
}

// Calculate normalized trait value (0-10 scale)
function getTraitValue(player, traitName) {
    const finishes = player['stats.brawl.traits.finishes'] || 0;
    if (finishes === 0) return null;

    const totalTime = player['stats.brawl.traits.totalTime'] || 0;
    const hits = player['stats.brawl.traits.hits'] || 0;
    const swings = player['stats.brawl.traits.swings'] || 1;
    const hurts = player['stats.brawl.traits.hurts'] || 0;
    const combos = player['stats.brawl.traits.combos'] || 0;
    const perfectCombos = player['stats.brawl.traits.perfectCombos'] || 0;
    const counters = player['stats.brawl.traits.counters'] || 0;
    const counterAttempts = player['stats.brawl.traits.counterAttempts'] || 1;
    const evasiveBrawls = player['stats.brawl.traits.evasiveBrawls'] || 0;
    const gambles = player['stats.brawl.traits.gambles'] || 0;
    const trades = player['stats.brawl.traits.trades'] || 0;
    const retaliations = player['stats.brawl.traits.retaliations'] || 0;
    const brawls = player['stats.brawl.brawls'] || 1;
    const leaves = player['stats.brawl.leaves'] || 0;

    switch (traitName) {
        case 'Decisive Victor':
            // hurts/finish: lower is better. 5 or less is max (10), normalize up to 20
            const hurtsPerFinish = hurts / finishes;
            return Math.min(10, Math.max(0, (20 - hurtsPerFinish) / 1.5));

        case 'Deadly Accurate':
        case 'Accurate':
            // accuracy: 0.36+ is max (10), normalize from 0 to 0.5
            const accuracy = hits / swings;
            return Math.min(10, (accuracy / 0.05) * 1);

        case 'Attack Spammer':
            // Lower accuracy for this trait (inverse)
            const spamAccuracy = hits / swings;
            return Math.min(10, Math.max(0, (0.3 - spamAccuracy) / 0.03));

        case 'Untouchable':
        case 'Evasive':
            // evasion rate: 0.6+ is max (10)
            const evasionRate = evasiveBrawls / finishes;
            return Math.min(10, (evasionRate / 0.07));

        case 'Perfect Timing':
            // perfectCombo rate: 0.2+ is max (10)
            const perfectRate = combos > 0 ? perfectCombos / combos : 0;
            return Math.min(10, (perfectRate / 0.025));

        case 'Excellent Combos':
        case 'Great Combos':
        case 'Good Combos':
            // combos per finish: 1.4+ is max (10)
            const combosPerFinish = combos / finishes;
            return Math.min(10, (combosPerFinish / 0.18));

        case 'Excellent Counters':
        case 'Great Counters':
        case 'Good Counters':
            // counter rate: 0.35+ is max (10)
            const counterRate = counters / counterAttempts;
            return Math.min(10, (counterRate / 0.045));

        case 'Quitter':
            // quit rate: higher is "better" for this trait (inverse logic)
            const quitRate = leaves / brawls;
            return Math.min(10, (quitRate / 0.02));

        // Styles
        case 'Defensive':
            const avgDuration = totalTime / finishes;
            return Math.min(10, (avgDuration / 3200));

        case 'Offensive':
            const avgOffensive = totalTime / finishes;
            return Math.min(10, Math.max(0, (25000 - avgOffensive) / 250));

        case 'Balanced':
            const avgBalanced = totalTime / finishes;
            const deviation = Math.abs(avgBalanced - 25000);
            return Math.min(10, Math.max(0, (5000 - deviation) / 500));

        case 'Gambler':
            const gambleRate = hits > 0 ? gambles / hits : 0;
            return Math.min(10, (gambleRate / 0.05));

        case 'Trades Well':
            const tradeRate = hurts > 0 ? trades / hurts : 0;
            return Math.min(10, (tradeRate / 0.02));

        case 'Retaliator':
            const retaliationRate = hurts > 0 ? retaliations / hurts : 0;
            return Math.min(10, (retaliationRate / 0.015));

        default:
            return null;
    }
}

// TABLE SORTING FUNCTIONALITY
function makeTablesSortable() {
    document.querySelectorAll('.leaderboard-table').forEach(table => {
        const headers = table.querySelectorAll('thead th');

        headers.forEach((header, index) => {
            if (header.classList.contains('sortable-init')) return;
            header.classList.add('sortable-init');
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';

            header.addEventListener('click', () => {
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));

                // Determine sort direction
                const currentDirection = header.getAttribute('data-sort-dir') || 'none';
                let newDirection = 'asc';
                if (currentDirection === 'asc') newDirection = 'desc';
                else if (currentDirection === 'desc') newDirection = 'asc';

                // Clear all sort indicators
                headers.forEach(h => {
                    h.removeAttribute('data-sort-dir');
                    const indicator = h.querySelector('.sort-indicator');
                    if (indicator) indicator.remove();
                });

                // Add sort indicator
                header.setAttribute('data-sort-dir', newDirection);
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.textContent = newDirection === 'asc' ? ' ▲' : ' ▼';
                indicator.style.fontSize = '0.8em';
                indicator.style.marginLeft = '0.3em';
                header.appendChild(indicator);

                // Sort rows
                rows.sort((a, b) => {
                    const cellA = a.querySelectorAll('td')[index];
                    const cellB = b.querySelectorAll('td')[index];

                    let valA = cellA.textContent.trim();
                    let valB = cellB.textContent.trim();

                    // Special handling for "Tier" column - sort by rating instead
                    const headerText = header.textContent.trim();
                    if (headerText.startsWith('Tier')) {
                        // First try to get rating from data attribute
                        const ratingA = parseFloat(cellA.getAttribute('data-rating'));
                        const ratingB = parseFloat(cellB.getAttribute('data-rating'));

                        if (!isNaN(ratingA) && !isNaN(ratingB)) {
                            return newDirection === 'asc' ? ratingA - ratingB : ratingB - ratingA;
                        }

                        // Fallback: Find the Rating column (usually next column)
                        const ratingIndex = index + 1;
                        const ratingCellA = a.querySelectorAll('td')[ratingIndex];
                        const ratingCellB = b.querySelectorAll('td')[ratingIndex];

                        if (ratingCellA && ratingCellB) {
                            const ratingValA = parseFloat(ratingCellA.textContent.replace(/[^0-9.-]/g, ''));
                            const ratingValB = parseFloat(ratingCellB.textContent.replace(/[^0-9.-]/g, ''));

                            if (!isNaN(ratingValA) && !isNaN(ratingValB)) {
                                return newDirection === 'asc' ? ratingValA - ratingValB : ratingValB - ratingValA;
                            }
                        }
                    }

                    // Try to parse as number
                    const numA = parseFloat(valA.replace(/[^0-9.-]/g, ''));
                    const numB = parseFloat(valB.replace(/[^0-9.-]/g, ''));

                    if (!isNaN(numA) && !isNaN(numB)) {
                        return newDirection === 'asc' ? numA - numB : numB - numA;
                    }

                    // String comparison
                    return newDirection === 'asc'
                        ? valA.localeCompare(valB)
                        : valB.localeCompare(valA);
                });

                // Re-append sorted rows
                rows.forEach(row => tbody.appendChild(row));
            });
        });
    });
}

// RENDERING FUNCTIONS - These will need to be added separately
// For file size reasons, I'm creating a separate documentation file with the complete code

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

function filterBrawlers(searchTerm) {
    const cards = document.querySelectorAll('.brawler-card');
    const term = searchTerm.toLowerCase();
    cards.forEach(card => {
        const username = card.querySelector('.brawler-username')?.textContent.toLowerCase() || '';
        const nickname = card.querySelector('.brawler-nickname')?.textContent.toLowerCase() || '';
        card.style.display = (username.includes(term) || nickname.includes(term)) ? '' : 'none';
    });
}

function showCTFTab(tab) {
    document.querySelectorAll('.ctf-tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderCTFLeaderboard(tab);
}

function filterByTrait(filter) {
    renderTraitsLeaderboard(filter);
}

function closePlayerModal() {
    document.getElementById('player-modal').classList.remove('active');
}

function closeGuildModal() {
    document.getElementById('guild-modal').classList.remove('active');
}

// Modal click handlers
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('player-modal').addEventListener('click', (e) => {
        if (e.target.id === 'player-modal') closePlayerModal();
    });

    document.getElementById('guild-modal').addEventListener('click', (e) => {
        if (e.target.id === 'guild-modal') closeGuildModal();
    });

    // Load data on page load
    loadData();
});
/**
 * Brawlers Tavern - Rendering Functions
 * Add this content to app.js or include as separate rendering.js file
 */

// Add to index.html before </body>:
// <script src="rendering.js"></script>

// BRAWLERS GRID
function renderBrawlers() {
    const grid = document.getElementById('brawlers-grid');
    const filteredUsers = usersData.filter(u => {
        const rep = u['stats.reputation'] || 0;
        const brawls = u['stats.brawl.brawls'] || 0;
        const teamBrawls = u['stats.teamBrawl.brawls'] || 0;
        return rep > 0 || brawls > 0 || teamBrawls > 0;
    });

    if (filteredUsers.length === 0) {
        grid.innerHTML = '<div class="no-data">No brawlers found</div>';
        return;
    }

    // Sort alphabetically by username
    filteredUsers.sort((a, b) => {
        const usernameA = (a.username || '').toLowerCase();
        const usernameB = (b.username || '').toLowerCase();
        return usernameA.localeCompare(usernameB);
    });

    grid.innerHTML = filteredUsers.map(player => {
        const reputation = player['stats.reputation'] || 0;
        const repTitle = getReputationTitle(reputation);
        const repLevel = getReputationLevel(reputation);
        
        const brawlRating = player['stats.brawl.rating'] || 0;
        const brawlBrawls = player['stats.brawl.brawls'] || 0;
        const brawlRank = brawlBrawls >= 25 ? getRankInfo(brawlRating) : null;
        const highestBrawlRating = player['stats.brawl.highestRating'] || 0;
        const highestBrawlRank = highestBrawlRating > 0 ? getRankInfo(highestBrawlRating) : null;

        const teamRating = player['stats.teamBrawl.rating'] || 0;
        const teamBrawls = player['stats.teamBrawl.brawls'] || 0;
        const teamRank = teamBrawls >= 25 ? getRankInfo(teamRating) : null;
        const highestTeamRating = player['stats.teamBrawl.highestRating'] || 0;
        const highestTeamRank = highestTeamRating > 0 ? getRankInfo(highestTeamRating) : null;

        let guildHTML = '';
        const guildRef = player.currentGuildRef;
        if (guildRef && guildRef !== 'NaN' && guildMap[guildRef]) {
            const guild = guildMap[guildRef];
            guildHTML = `
                <div class="brawler-guild" onclick="event.stopPropagation(); showGuildModal('${guildRef}')">
                    <span>${guild.name}</span>
                    <span class="guild-tag">${guild.tag}</span>
                </div>
            `;
        }

        const brawlScore = calculateBrawlScore(player);
        const brawlScoreBadge = brawlScore !== null ? `
            <div class="stat-item">
                <div class="stat-label">Brawl Score</div>
                <div class="stat-value"><span class="score-badge">${formatNumber(brawlScore)}</span></div>
            </div>
        ` : '';

        const onlineTime = player['stats.onlineTime'] || 0;
        const loginTime = player['stats.loginTime'] || 0;

        return `
            <div class="brawler-card" onclick="showPlayerModal('${player.username}')">
                <div class="brawler-header">
                    <div class="brawler-avatar">
                        ${createHeadAvatar(player)}
                    </div>
                    <div class="brawler-info">
                        <div class="brawler-username">${player.username}</div>
                        <div class="brawler-nickname">${player.nickname || ''}</div>
                        ${guildHTML}
                    </div>
                </div>
                <div class="brawler-stats">
                    <div class="stat-item">
                        <div class="stat-label">Reputation</div>
                        <div class="stat-value">${repTitle} Lvl. ${repLevel}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Online Time</div>
                        <div class="stat-value">${formatOnlineTime(onlineTime)}</div>
                    </div>
                    ${brawlRank ? `
                        <div class="stat-item">
                            <div class="stat-label">Solo Rating</div>
                            <div class="stat-value">
                                <img src="https://cdn.brawlerstavern.com/rankicon/${brawlRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                                ${brawlRank.rank}
                            </div>
                        </div>
                    ` : ''}
                    ${highestBrawlRank ? `
                        <div class="stat-item">
                            <div class="stat-label">Highest Solo</div>
                            <div class="stat-value">
                                <img src="https://cdn.brawlerstavern.com/rankicon/${highestBrawlRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                                ${highestBrawlRank.rank}
                            </div>
                        </div>
                    ` : ''}
                    ${teamRank ? `
                        <div class="stat-item">
                            <div class="stat-label">Team Rating</div>
                            <div class="stat-value">
                                <img src="https://cdn.brawlerstavern.com/rankicon/${teamRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                                ${teamRank.rank}
                            </div>
                        </div>
                    ` : ''}
                    ${highestTeamRank ? `
                        <div class="stat-item">
                            <div class="stat-label">Highest Team</div>
                            <div class="stat-value">
                                <img src="https://cdn.brawlerstavern.com/rankicon/${highestTeamRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                                ${highestTeamRank.rank}
                            </div>
                        </div>
                    ` : ''}
                    <div class="stat-item">
                        <div class="stat-label">Last Login</div>
                        <div class="stat-value">${formatLoginTime(loginTime)}</div>
                    </div>
                    ${brawlScoreBadge}
                </div>
            </div>
        `;
    }).join('');

    // Apply color tinting to avatar images
    setTimeout(() => applyAllTints(), 100);
}

// SOLO LEADERBOARD
function renderSoloLeaderboard() {
    const container = document.getElementById('solo-table-container');
    const eligible = usersData.filter(u => (u['stats.brawl.brawls'] || 0) >= 25 && (u['stats.brawl.wins'] || 0) > 0);
    const sorted = eligible.sort((a, b) => (b['stats.brawl.rating'] || 0) - (a['stats.brawl.rating'] || 0));

    if (sorted.length === 0) {
        container.innerHTML = '<div class="no-data">No eligible players (25+ brawls required)</div>';
        return;
    }

    const rows = sorted.map((player, index) => {
        const rank = index + 1;
        const rating = player['stats.brawl.rating'] || 0;
        const rankInfo = getRankInfo(rating);
        const wins = player['stats.brawl.wins'] || 0;
        const brawls = player['stats.brawl.brawls'] || 0;
        const winRate = brawls > 0 ? ((wins / brawls) * 100).toFixed(1) : '0.0';
        const brawlScore = calculateBrawlScore(player);
        
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        return `
            <tr onclick="showPlayerModal('${player.username}')">
                <td class="rank-cell ${rankClass}">${rank}</td>
                <td class="player-cell">
                    <div class="player-avatar-small">
                        ${createHeadAvatar(player)}
                    </div>
                    <div class="player-name">
                        <span class="player-username">${player.username}</span>
                        <span class="player-nickname">${player.nickname || ''}</span>
                    </div>
                </td>
                <td data-rating="${rating}">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <img src="https://cdn.brawlerstavern.com/rankicon/${rankInfo.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                        <span style="color: var(--accent-gold); font-family: 'Cinzel', serif; font-weight: 600;">${rankInfo.rank}</span>
                    </div>
                </td>
                <td style="color: var(--accent-gold); font-weight: 600; font-size: 1.2rem;">${Math.round(rating)}</td>
                <td>${wins} / ${brawls}</td>
                <td style="color: ${winRate >= 50 ? '#4ade80' : '#f87171'};">${winRate}%</td>
                <td><span class="score-badge">${brawlScore !== null ? formatNumber(brawlScore) : 'N/A'}</span></td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Brawler</th>
                    <th>Tier</th>
                    <th>Rating</th>
                    <th>Record</th>
                    <th>Win Rate</th>
                    <th>Score</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
        <div class="methodology-info" style="background: rgba(212, 175, 55, 0.1); border-left: 3px solid var(--accent-gold); padding: 0.75rem 1rem; margin-top: 1rem; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
            <strong style="color: var(--accent-gold);">Brawl Score Calculation:</strong> Data-driven weights from correlation analysis with rating:<br>
            <strong>Efficiency (24.8%):</strong> Damage taken per finish (inverse) - <em>strongest predictor</em><br>
            <strong>Counter Success (24.4%):</strong> Successful counter rate<br>
            <strong>Combos (20.5%):</strong> Average combos per finish<br>
            <strong>Accuracy (19.7%):</strong> Hit rate per swing<br>
            <strong>Evasion (10.6%):</strong> Evasive brawls rate<br>
            Score: 0-10 scale. Based purely on combat stats/traits. Minimum 25 brawls required.
        </div>
    `;
    makeTablesSortable();
    setTimeout(() => applyAllTints(), 100);
}

// TEAM LEADERBOARD
function renderTeamLeaderboard() {
    const container = document.getElementById('team-table-container');
    const eligible = usersData.filter(u => (u['stats.teamBrawl.brawls'] || 0) >= 25 && (u['stats.teamBrawl.wins'] || 0) > 0);
    const sorted = eligible.sort((a, b) => (b['stats.teamBrawl.rating'] || 0) - (a['stats.teamBrawl.rating'] || 0));

    if (sorted.length === 0) {
        container.innerHTML = '<div class="no-data">No eligible players (25+ team brawls required)</div>';
        return;
    }

    const rows = sorted.map((player, index) => {
        const rank = index + 1;
        const rating = player['stats.teamBrawl.rating'] || 0;
        const rankInfo = getRankInfo(rating);
        const wins = player['stats.teamBrawl.wins'] || 0;
        const brawls = player['stats.teamBrawl.brawls'] || 0;
        const winRate = brawls > 0 ? ((wins / brawls) * 100).toFixed(1) : '0.0';
        
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        return `
            <tr onclick="showPlayerModal('${player.username}')">
                <td class="rank-cell ${rankClass}">${rank}</td>
                <td class="player-cell">
                    <div class="player-avatar-small">
                        ${createHeadAvatar(player)}
                    </div>
                    <div class="player-name">
                        <span class="player-username">${player.username}</span>
                        <span class="player-nickname">${player.nickname || ''}</span>
                    </div>
                </td>
                <td data-rating="${rating}">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <img src="https://cdn.brawlerstavern.com/rankicon/${rankInfo.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                        <span style="color: var(--accent-gold); font-family: 'Cinzel', serif; font-weight: 600;">${rankInfo.rank}</span>
                    </div>
                </td>
                <td style="color: var(--accent-gold); font-weight: 600; font-size: 1.2rem;">${Math.round(rating)}</td>
                <td>${wins} / ${brawls}</td>
                <td style="color: ${winRate >= 50 ? '#4ade80' : '#f87171'};">${winRate}%</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Brawler</th>
                    <th>Tier</th>
                    <th>Rating</th>
                    <th>Record</th>
                    <th>Win Rate</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
    makeTablesSortable();
    setTimeout(() => applyAllTints(), 100);
}

// CTF LEADERBOARD
function renderCTFLeaderboard(tab = 'winrate') {
    const container = document.getElementById('ctf-table-container');
    const eligible = usersData.filter(u => (u['stats.event.ctf.games'] || 0) >= 20).map(player => {
        return { player, scores: calculateCTFScores(player) };
    }).filter(item => item.scores !== null);

    if (eligible.length === 0) {
        container.innerHTML = '<div class="no-data">No CTF data available (20+ games required)</div>';
        return;
    }

    // Sort based on tab
    let sorted = [...eligible];
    if (tab === 'overall') sorted.sort((a, b) => b.scores.overall - a.scores.overall);
    else if (tab === 'offensive') sorted.sort((a, b) => b.scores.offensive - a.scores.offensive);
    else if (tab === 'defensive') sorted.sort((a, b) => b.scores.defensive - a.scores.defensive);
    else if (tab === 'winrate') sorted.sort((a, b) => b.scores.winRate - a.scores.winRate);
    else if (tab === 'all') sorted.sort((a, b) => b.scores.winRate - a.scores.winRate);

    const rows = sorted.map((item, index) => {
        const { player, scores } = item;
        const rank = index + 1;
        const winRate = (scores.winRate * 100).toFixed(1);
        
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        if (tab === 'all') {
            return `
                <tr onclick="showPlayerModal('${player.username}')">
                    <td class="rank-cell ${rankClass}">${rank}</td>
                    <td class="player-cell">
                        <div class="player-avatar-small">${createHeadAvatar(player)}</div>
                        <div class="player-name">
                            <span class="player-username">${player.username}</span>
                            <span class="player-nickname">${player.nickname || ''}</span>
                        </div>
                    </td>
                    <td><span class="score-badge">${formatNumber(scores.overall)}</span></td>
                    <td><span class="score-badge">${formatNumber(scores.offensive)}</span></td>
                    <td><span class="score-badge">${formatNumber(scores.defensive)}</span></td>
                    <td style="color: ${winRate >= 50 ? '#4ade80' : '#f87171'};">${winRate}%</td>
                    <td>${formatNumber(scores.capturesPerGame)}</td>
                    <td>${formatNumber(scores.chargesPerGame)}</td>
                    <td>${formatNumber(scores.defensesPerGame)}</td>
                    <td>${formatNumber(scores.escortsPerGame)}</td>
                    <td>${formatNumber(scores.recoversPerGame)}</td>
                    <td>${scores.wins}/${scores.games}</td>
                </tr>
            `;
        } else {
            return `
                <tr onclick="showPlayerModal('${player.username}')">
                    <td class="rank-cell ${rankClass}">${rank}</td>
                    <td class="player-cell">
                        <div class="player-avatar-small">${createHeadAvatar(player)}</div>
                        <div class="player-name">
                            <span class="player-username">${player.username}</span>
                            <span class="player-nickname">${player.nickname || ''}</span>
                        </div>
                    </td>
                    ${tab === 'overall' ? `<td><span class="score-badge">${formatNumber(scores.overall)}</span></td>` : ''}
                    ${tab === 'offensive' ? `<td><span class="score-badge">${formatNumber(scores.offensive)}</span></td>` : ''}
                    ${tab === 'defensive' ? `<td><span class="score-badge">${formatNumber(scores.defensive)}</span></td>` : ''}
                    ${tab === 'winrate' ? `<td style="color: ${winRate >= 50 ? '#4ade80' : '#f87171'};">${winRate}%</td>` : ''}
                    <td>${scores.wins} / ${scores.games}</td>
                </tr>
            `;
        }
    }).join('');

    let headers = '';
    if (tab === 'all') {
        headers = '<th>Rank</th><th>Brawler</th><th>Overall</th><th>Offensive</th><th>Defensive</th><th>Win Rate</th><th>Caps/g</th><th>Charges/g</th><th>Defenses/g</th><th>Escorts/g</th><th>Recovers/g</th><th>Record</th>';
    } else if (tab === 'overall') {
        headers = '<th>Rank</th><th>Brawler</th><th>Overall Score</th><th>Record</th>';
    } else if (tab === 'offensive') {
        headers = '<th>Rank</th><th>Brawler</th><th>Offensive Score</th><th>Record</th>';
    } else if (tab === 'defensive') {
        headers = '<th>Rank</th><th>Brawler</th><th>Defensive Score</th><th>Record</th>';
    } else if (tab === 'winrate') {
        headers = '<th>Rank</th><th>Brawler</th><th>Win Rate</th><th>Record</th>';
    }

    container.innerHTML = `
        <table class="leaderboard-table">
            <thead><tr>${headers}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    document.getElementById('ctf-methodology').innerHTML = `
        <div class="methodology-info" style="background: rgba(212, 175, 55, 0.1); border-left: 3px solid var(--accent-gold); padding: 0.75rem 1rem; margin-top: 1rem; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
            <strong style="color: var(--accent-gold);">CTF Score Calculation:</strong><br>
            <strong>Overall:</strong> Max(Offensive, Defensive) + Win Rate Bonus<br>
            <strong>Offensive:</strong> Average of normalized Captures, Charges, and Escorts<br>
            <strong>Defensive:</strong> Average of normalized Defenses, Recovers, and Escorts<br>
            <strong>Win Rate Bonus:</strong> +0.1 per 1% win rate over 50% (max +5)<br>
            All scores normalized to 0-10 scale and capped at 10. Minimum 20 games required.
        </div>
    `;
    makeTablesSortable();
    setTimeout(() => applyAllTints(), 100);

    // Update scroll fade indicator
    const wrapper = container.closest('.ctf-scroll-wrapper');
    if (wrapper) {
        const updateScrollFade = () => {
            const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 5;
            const noOverflow = container.scrollWidth <= container.clientWidth;
            wrapper.classList.toggle('scrolled-end', atEnd || noOverflow);
        };
        container.addEventListener('scroll', updateScrollFade);
        // Check on load and after layout settles
        updateScrollFade();
        setTimeout(updateScrollFade, 200);
    }
}

// TRAITS LEADERBOARD
function renderTraitsLeaderboard(filter = '') {
    const container = document.getElementById('traits-table-container');
    let eligible = usersData.filter(u => {
        const brawls = u['stats.brawl.brawls'] || 0;
        const finishes = u['stats.brawl.traits.finishes'] || 0;
        const finishWins = u['stats.brawl.traits.finishWins'] || 0;
        return brawls >= 25 && finishes > 0 && finishWins > 0;
    });

    let selectedTrait = '';
    // Apply filter
    if (filter.startsWith('trait:')) {
        selectedTrait = filter.replace('trait:', '');
        eligible = eligible.filter(player => {
            const analysis = calculateTraits(player);
            return analysis.traits.includes(selectedTrait);
        });
    } else if (filter.startsWith('style:')) {
        selectedTrait = filter.replace('style:', '');
        eligible = eligible.filter(player => {
            const analysis = calculateTraits(player);
            return analysis.styles.includes(selectedTrait);
        });
    }

    if (eligible.length === 0) {
        container.innerHTML = '<div class="no-data">No brawlers match this filter</div>';
        return;
    }

    // Sort by trait value if selected, otherwise by Brawl Score
    if (selectedTrait) {
        eligible.sort((a, b) => (getTraitValue(b, selectedTrait) || 0) - (getTraitValue(a, selectedTrait) || 0));
    } else {
        eligible.sort((a, b) => (calculateBrawlScore(b) || 0) - (calculateBrawlScore(a) || 0));
    }

    const rows = eligible.map((player, index) => {
        const rank = index + 1;
        const brawlScore = calculateBrawlScore(player);
        const rating = player['stats.brawl.rating'] || 0;
        const rankInfo = getRankInfo(rating);

        // Calculate all trait values
        const finishes = player['stats.brawl.traits.finishes'] || 0;
        const swings = player['stats.brawl.traits.swings'] || 1;
        const hits = player['stats.brawl.traits.hits'] || 0;
        const hurts = player['stats.brawl.traits.hurts'] || 0;
        const combos = player['stats.brawl.traits.combos'] || 0;
        const counters = player['stats.brawl.traits.counters'] || 0;
        const counterAttempts = player['stats.brawl.traits.counterAttempts'] || 1;
        const evasiveBrawls = player['stats.brawl.traits.evasiveBrawls'] || 0;

        // Calculate normalized values (0-10 scale)
        const accuracy = Math.min(10, (hits / swings / 0.05));
        const hurtsPerFinish = Math.min(10, Math.max(0, (20 - (hurts / finishes)) / 1.5));
        const evasionRate = Math.min(10, (evasiveBrawls / finishes / 0.07));
        const comboRate = Math.min(10, (combos / finishes / 0.18));
        const counterRate = Math.min(10, (counters / counterAttempts / 0.045));

        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        // Get trait value if a specific trait is selected
        const traitValueCell = selectedTrait ? `<td><span class="score-badge">${formatNumber(getTraitValue(player, selectedTrait) || 0)}</span></td>` : '';

        return `
            <tr onclick="showPlayerModal('${player.username}')">
                <td class="rank-cell ${rankClass}">${rank}</td>
                <td class="player-cell">
                    <div class="player-avatar-small">${createHeadAvatar(player)}</div>
                    <div class="player-name">
                        <span class="player-username">${player.username}</span>
                        <span class="player-nickname">${player.nickname || ''}</span>
                    </div>
                </td>
                <td><span class="score-badge">${brawlScore !== null ? formatNumber(brawlScore) : 'N/A'}</span></td>
                ${traitValueCell}
                <td>${formatNumber(accuracy)}</td>
                <td>${formatNumber(hurtsPerFinish)}</td>
                <td>${formatNumber(evasionRate)}</td>
                <td>${formatNumber(comboRate)}</td>
                <td>${formatNumber(counterRate)}</td>
                <td data-rating="${rating}">
                    <img src="https://cdn.brawlerstavern.com/rankicon/${rankInfo.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                    ${rankInfo.rank}
                </td>
            </tr>
        `;
    }).join('');

    const traitHeader = selectedTrait ? `<th>${selectedTrait} Value</th>` : '';

    container.innerHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Brawler</th>
                    <th>Brawl Score</th>
                    ${traitHeader}
                    <th>Accuracy</th>
                    <th>Efficiency</th>
                    <th>Evasion</th>
                    <th>Combos</th>
                    <th>Counters</th>
                    <th>Tier</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    makeTablesSortable();
    setTimeout(() => applyAllTints(), 100);
}

// GUILD LEADERBOARD
function renderGuildLeaderboard() {
    const container = document.getElementById('guild-table-container');
    const guildStats = {};

    // Calculate guild reputation totals
    usersData.forEach(player => {
        Object.keys(player).forEach(key => {
            if (key.startsWith('stats.guildReputation.')) {
                const guildTag = key.replace('stats.guildReputation.', '');
                const rep = player[key] || 0;
                if (rep > 0) {
                    if (!guildStats[guildTag]) {
                        guildStats[guildTag] = { tag: guildTag, totalRep: 0, members: 0 };
                    }
                    guildStats[guildTag].totalRep += rep;
                    guildStats[guildTag].members++;
                }
            }
        });
    });

    const sorted = Object.values(guildStats).sort((a, b) => b.totalRep - a.totalRep);

    if (sorted.length === 0) {
        container.innerHTML = '<div class="no-data">No guild data available</div>';
        return;
    }

    const rows = sorted.map((guild, index) => {
        const rank = index + 1;
        const avgRep = guild.members > 0 ? (guild.totalRep / guild.members).toFixed(0) : 0;
        
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        else if (rank === 2) rankClass = 'silver';
        else if (rank === 3) rankClass = 'bronze';

        // Find guild name from guildMap
        let guildName = guild.tag;
        let guildRef = '';
        Object.entries(guildMap).forEach(([ref, data]) => {
            if (data.tag === guild.tag) {
                guildName = data.name;
                guildRef = ref;
            }
        });

        return `
            <tr onclick="${guildRef ? `showGuildModal('${guildRef}')` : ''}">
                <td class="rank-cell ${rankClass}">${rank}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-family: 'Cinzel', serif; font-size: 1.2rem; color: var(--accent-gold); font-weight: 700;">${guildName}</span>
                        <span class="guild-tag">${guild.tag}</span>
                    </div>
                </td>
                <td style="color: var(--accent-gold); font-weight: 600; font-size: 1.2rem;">${guild.totalRep.toLocaleString()}</td>
                <td>${guild.members}</td>
                <td style="color: var(--text-secondary);">${avgRep}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Guild</th>
                    <th>Total Reputation</th>
                    <th>Members</th>
                    <th>Avg Rep/Member</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
    makeTablesSortable();
}

// PLAYER MODAL
function showPlayerModal(username) {
    const player = usersData.find(u => u.username === username);
    if (!player) return;

    const modal = document.getElementById('player-modal');
    document.getElementById('modal-avatar').innerHTML = createHeadAvatar(player);
    document.getElementById('modal-username').textContent = player.username;
    document.getElementById('modal-nickname').textContent = player.nickname || '';

    // Guild
    const guildRef = player.currentGuildRef;
    if (guildRef && guildRef !== 'NaN' && guildMap[guildRef]) {
        const guild = guildMap[guildRef];
        document.getElementById('modal-guild').innerHTML = `
            <span>${guild.name}</span>
            <span class="guild-tag">${guild.tag}</span>
        `;
        document.getElementById('modal-guild').onclick = (e) => {
            e.stopPropagation();
            closePlayerModal();
            showGuildModal(guildRef);
        };
    } else {
        document.getElementById('modal-guild').innerHTML = '';
    }

    // Stats
    const reputation = player['stats.reputation'] || 0;
    const repTitle = getReputationTitle(reputation);
    const repLevel = getReputationLevel(reputation);
    const brawlScore = calculateBrawlScore(player);
    
    let statsHTML = `
        <div class="modal-stat-card">
            <div class="modal-stat-label">Reputation</div>
            <div class="modal-stat-value">${repTitle}<br>Lvl. ${repLevel}</div>
        </div>
    `;

    if (brawlScore !== null) {
        statsHTML += `
            <div class="modal-stat-card">
                <div class="modal-stat-label">Brawl Score</div>
                <div class="modal-stat-value"><span class="score-badge">${formatNumber(brawlScore)}</span></div>
            </div>
        `;
    }

    // Add Online Time and Last Login
    const onlineTime = player['stats.onlineTime'] || 0;
    const loginTime = player['stats.loginTime'] || 0;
    statsHTML += `
        <div class="modal-stat-card">
            <div class="modal-stat-label">Online Time</div>
            <div class="modal-stat-value">${formatOnlineTime(onlineTime)}</div>
        </div>
        <div class="modal-stat-card">
            <div class="modal-stat-label">Last Login</div>
            <div class="modal-stat-value">${formatLoginTime(loginTime)}</div>
        </div>
    `;

    // Add more stats...
    const brawlBrawls = player['stats.brawl.brawls'] || 0;
    if (brawlBrawls >= 25) {
        const brawlRating = player['stats.brawl.rating'] || 0;
        const brawlRank = getRankInfo(brawlRating);
        statsHTML += `
            <div class="modal-stat-card">
                <div class="modal-stat-label">Solo Rating</div>
                <div class="modal-stat-value">
                    <img src="https://cdn.brawlerstavern.com/rankicon/${brawlRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                    ${brawlRank.rank} (${Math.round(brawlRating)})
                </div>
            </div>
        `;

        const highestBrawlRating = player['stats.brawl.highestRating'] || 0;
        if (highestBrawlRating > 0) {
            const highestBrawlRank = getRankInfo(highestBrawlRating);
            statsHTML += `
                <div class="modal-stat-card">
                    <div class="modal-stat-label">Highest Solo</div>
                    <div class="modal-stat-value">
                        <img src="https://cdn.brawlerstavern.com/rankicon/${highestBrawlRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                        ${highestBrawlRank.rank} (${Math.round(highestBrawlRating)})
                    </div>
                </div>
            `;
        }
    }

    const teamBrawls = player['stats.teamBrawl.brawls'] || 0;
    if (teamBrawls >= 25) {
        const teamRating = player['stats.teamBrawl.rating'] || 0;
        const teamRank = getRankInfo(teamRating);
        statsHTML += `
            <div class="modal-stat-card">
                <div class="modal-stat-label">Team Rating</div>
                <div class="modal-stat-value">
                    <img src="https://cdn.brawlerstavern.com/rankicon/${teamRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                    ${teamRank.rank} (${Math.round(teamRating)})
                </div>
            </div>
        `;

        const highestTeamRating = player['stats.teamBrawl.highestRating'] || 0;
        if (highestTeamRating > 0) {
            const highestTeamRank = getRankInfo(highestTeamRating);
            statsHTML += `
                <div class="modal-stat-card">
                    <div class="modal-stat-label">Highest Team</div>
                    <div class="modal-stat-value">
                        <img src="https://cdn.brawlerstavern.com/rankicon/${highestTeamRank.icon}.png" class="rank-icon" onerror="this.style.display='none'">
                        ${highestTeamRank.rank} (${Math.round(highestTeamRating)})
                    </div>
                </div>
            `;
        }
    }

    document.getElementById('modal-stats').innerHTML = statsHTML;

    // Traits
    const analysis = calculateTraits(player);
    document.getElementById('modal-traits').innerHTML = analysis.traits.length > 0
        ? analysis.traits.map(t => `<div class="trait-badge">${t}</div>`).join('')
        : '<div class="no-data" style="padding: 1rem;">No traits calculated yet</div>';
    
    document.getElementById('modal-styles').innerHTML = analysis.styles.length > 0
        ? analysis.styles.map(s => `<div class="style-badge">${s}</div>`).join('')
        : '<div class="no-data" style="padding: 1rem;">No styles calculated yet</div>';

    // CTF
    const ctfGames = player['stats.event.ctf.games'] || 0;
    if (ctfGames > 0) {
        const ctfScores = calculateCTFScores(player);
        if (ctfScores) {
            document.getElementById('modal-ctf').innerHTML = `
                <div class="modal-stat-card">
                    <div class="modal-stat-label">CTF Overall</div>
                    <div class="modal-stat-value"><span class="score-badge">${formatNumber(ctfScores.overall)}</span></div>
                </div>
                <div class="modal-stat-card">
                    <div class="modal-stat-label">Offensive</div>
                    <div class="modal-stat-value"><span class="score-badge">${formatNumber(ctfScores.offensive)}</span></div>
                </div>
                <div class="modal-stat-card">
                    <div class="modal-stat-label">Defensive</div>
                    <div class="modal-stat-value"><span class="score-badge">${formatNumber(ctfScores.defensive)}</span></div>
                </div>
            `;
        }
    } else {
        document.getElementById('modal-ctf').innerHTML = '<div class="no-data" style="padding: 1rem;">No CTF games played</div>';
    }

    modal.classList.add('active');

    // Apply color tinting to avatar
    setTimeout(() => applyAllTints(), 100);
}

// GUILD MODAL
function showGuildModal(guildRef) {
    const guild = guildMap[guildRef];
    if (!guild) return;

    document.getElementById('guild-modal-name').textContent = guild.name;
    document.getElementById('guild-modal-tag').textContent = `[${guild.tag}]`;
    document.getElementById('guild-modal-description').textContent = guild.description || guild.motd || '';

    const membersHTML = guild.members.map(member => `
        <div class="guild-member-card" onclick="closeGuildModal(); showPlayerModal('${member.username}')">
            <div style="font-family: 'Cinzel', serif; font-weight: 600; color: var(--accent-gold); margin-bottom: 0.5rem;">${member.username}</div>
            <div style="font-size: 0.9rem; color: var(--text-secondary);">
                Guild Rep: ${member.guildReputation || 0}
            </div>
        </div>
    `).join('');

    document.getElementById('guild-members-container').innerHTML = membersHTML;
    document.getElementById('guild-modal').classList.add('active');
}
