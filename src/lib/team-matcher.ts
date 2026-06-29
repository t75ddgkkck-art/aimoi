// Team name matching between different API sources
// football-data.org: "Arsenal FC", "Manchester United FC", "FC Bayern München"
// The Odds API: "Arsenal", "Manchester United", "Bayern Munich"
// TheSportsDB: "Arsenal", "Manchester United", "Bayern Munich"
// openfootball & GitHub resources: "manunited", "bayern-munchen", "mancity", "tottenham"

// Common suffixes and prefixes to strip aggressively
const SUFFIXES = [
  "fc", "afc", "cf", "ac", "sc", "rc", "ca", "as", "de", "del", "la", "le", "et",
  "united", "city", "town", "hotspur", "wanderers", "athletic", "albion", "forest",
  "rovers", "wednesday", "sporting", "real", "racing", "union", "internazionale",
  "associazione", "calcio", "club", "deportivo", "cd", "ud", "sd", "fk", "sv", "tsg",
  "spvgg", "vfl", "vfb", "bsc", "bvb", "sg", "losc", "ogc", "rc", "stade", "olympique",
  "charlton", "albion", "athletic", "orient", "rovers", "county", "alexandra", "forest",
  "association", "football", "club", "futbol", "futebol", "soccer",
];

// Comprehensive canonical mappings & aliases covering Premier League, La Liga, Serie A, Bundesliga, Ligue 1, etc.
const ALIASES: Record<string, string[]> = {
  "Arsenal": ["Arsenal FC", "The Gunners", "arsenal-fc", "arsenalfc"],
  "Aston Villa": ["Aston Villa FC", "Villa", "aston-villa", "astonvilla"],
  "Bournemouth": ["AFC Bournemouth", "Bournemouth FC", "Cherries", "bournemouth-fc"],
  "Brentford": ["Brentford FC", "Bees", "brentford-fc"],
  "Brighton": ["Brighton & Hove Albion", "Brighton and Hove Albion", "Brighton FC", "Seagulls", "brighton-fc"],
  "Chelsea": ["Chelsea FC", "Blues", "chelsea-fc"],
  "Crystal Palace": ["Crystal Palace FC", "Palace", "Eagles", "crystal-palace", "crystalpalace"],
  "Everton": ["Everton FC", "Toffees", "everton-fc"],
  "Fulham": ["Fulham FC", "Cottagers", "fulham-fc"],
  "Ipswich": ["Ipswich Town", "Ipswich Town FC", "Tractor Boys", "ipswich-town"],
  "Leicester": ["Leicester City", "Leicester City FC", "Foxes", "leicester-city", "leicestercity"],
  "Liverpool": ["Liverpool FC", "Reds", "liverpool-fc"],
  "Manchester City": ["Man City", "Manchester City FC", "Citizens", "ManCity", "manchester-city", "man-city"],
  "Manchester United": ["Man United", "Man Utd", "Manchester United FC", "United", "Red Devils", "manchester-united", "man-united", "man-utd", "manunited"],
  "Newcastle": ["Newcastle United", "Newcastle United FC", "Newcastle Utd", "Magpies", "newcastle-united", "newcastle-utd"],
  "Nottingham Forest": ["Nottm Forest", "Nottingham Forest FC", "Forest", "nottingham-forest"],
  "Southampton": ["Southampton FC", "Saints", "southampton-fc"],
  "Tottenham": ["Tottenham Hotspur", "Tottenham Hotspur FC", "Spurs", "tottenham-hotspur", "tottenham-fc"],
  "West Ham": ["West Ham United", "West Ham United FC", "Hammers", "west-ham", "west-ham-united", "westham"],
  "Wolves": ["Wolverhampton Wanderers", "Wolverhampton", "Wolverhampton Wanderers FC", "wolves-fc"],
  "Sunderland": ["Sunderland AFC", "Sunderland FC", "Black Cats", "sunderland-fc"],
  "Hull": ["Hull City", "Hull City AFC", "Tigers", "hull-city"],
  "Leeds": ["Leeds United", "Leeds United AFC", "Whites", "leeds-united"],
  "Coventry": ["Coventry City", "Coventry City FC", "Sky Blues", "coventry-city"],
  "Burnley": ["Burnley FC", "Clarets", "burnley-fc"],
  "Sheffield Utd": ["Sheffield United", "Sheffield United FC", "Blades", "sheffield-united", "sheffield-utd"],
  "Luton": ["Luton Town", "Luton Town FC", "Hatters", "luton-town"],
  
  // Spain
  "Real Madrid": ["Real Madrid CF", "Madrid", "Los Blancos", "real-madrid", "realmadrid"],
  "Barcelona": ["FC Barcelona", "Barca", "Barça", "Blaugrana", "fc-barcelona", "fcbarcelona"],
  "Atletico Madrid": ["Atlético Madrid", "Club Atletico de Madrid", "Club Atlético de Madrid", "Atleti", "Colchoneros", "atletico-madrid", "atleticomadrid"],
  "Sevilla": ["Sevilla FC", "sevilla-fc"],
  "Valencia": ["Valencia CF", "valencia-cf"],
  "Real Sociedad": ["Real Sociedad de Futbol", "Real Sociedad de Fútbol", "La Real", "real-sociedad"],
  "Villarreal": ["Villarreal CF", "Yellow Submarine", "villarreal-cf"],
  "Real Betis": ["Real Betis Balompie", "Real Betis Balompié", "Betis", "real-betis"],
  "Athletic Bilbao": ["Athletic Club", "Athletic Club Bilbao", "athletic-bilbao", "athletic-club"],
  "Girona": ["Girona FC", "girona-fc"],
  "Celta Vigo": ["RC Celta", "Celta de Vigo", "celta-vigo"],
  "Espanyol": ["RCD Espanyol", "espanyol-fc"],
  
  // Italy
  "Inter": ["Inter Milan", "FC Internazionale Milano", "Internazionale", "Nerazzurri", "inter-milan"],
  "AC Milan": ["Milan", "ACM", "Rossoneri", "ac-milan"],
  "Juventus": ["Juventus FC", "Juve", "Bianconeri", "juventus-fc"],
  "Napoli": ["SSC Napoli", "SS Napoli", "napoli-fc"],
  "Roma": ["AS Roma", "Giallorossi", "as-roma"],
  "Lazio": ["SS Lazio", "Biancocelesti", "ss-lazio"],
  "Atalanta": ["Atalanta BC", "Atalanta Bergamasca", "atalanta-bc"],
  "Fiorentina": ["ACF Fiorentina", "Viola", "fiorentina-fc"],
  "Bologna": ["Bologna FC", "bologna-fc"],
  "Torino": ["Torino FC", "torino-fc"],
  
  // Germany
  "Bayern Munich": ["Bayern München", "FC Bayern München", "FC Bayern Munich", "Bayern", "Bavaria", "bayern-munich", "bayern-munchen", "bayernmunich"],
  "Borussia Dortmund": ["Dortmund", "BVB", "Borussia Dortmund GmbH", "borussia-dortmund"],
  "Bayer Leverkusen": ["Leverkusen", "Bayer 04 Leverkusen", "bayer-leverkusen"],
  "RB Leipzig": ["Leipzig", "RasenBallsport Leipzig", "rb-leipzig"],
  "Eintracht Frankfurt": ["Frankfurt", "Eintracht", "eintracht-frankfurt"],
  "Borussia M'gladbach": ["Borussia Monchengladbach", "Borussia Mönchengladbach", "Gladbach", "borussia-monchengladbach"],
  "Wolfsburg": ["VfL Wolfsburg", "vfl-wolfsburg"],
  "Stuttgart": ["VfB Stuttgart", "vfb-stuttgart"],
  "Hoffenheim": ["TSG Hoffenheim", "1899 Hoffenheim", "tsg-hoffenheim"],
  "Freiburg": ["SC Freiburg", "sc-freiburg"],
  
  // France
  "Paris SG": ["Paris Saint-Germain", "Paris Saint Germain", "PSG", "Paris Saint-Germain FC", "paris-sg", "paris-saint-germain", "psg"],
  "Marseille": ["Olympique Marseille", "Olympique de Marseille", "OM", "olympique-marseille", "marseille-fc"],
  "Lyon": ["Olympique Lyon", "Olympique Lyonnais", "OL", "olympique-lyon", "lyon-fc"],
  "Monaco": ["AS Monaco", "AS Monaco FC", "as-monaco"],
  "Lille": ["LOSC Lille", "Lille OSC", "lille-osc", "losc-lille"],
  "Nice": ["OGC Nice", "ogc-nice"],
  "Lens": ["RC Lens", "rc-lens"],
  "Rennes": ["Stade Rennais", "Stade Rennais FC", "stade-rennais"],
  "Strasbourg": ["RC Strasbourg", "Racing Club de Strasbourg", "rc-strasbourg"],
  "Reims": ["Stade de Reims", "stade-reims"],

  // Rest of World / Europe
  "RB Salzburg": ["FC Red Bull Salzburg", "Red Bull Salzburg", "rb-salzburg"],
  "Shakhtar Donetsk": ["FC Shakhtar Donetsk", "shakhtar-donetsk"],
  "Porto": ["FC Porto", "porto-fc"],
  "Benfica": ["SL Benfica", "benfica-fc"],
  "Celtic": ["Celtic FC", "celtic-fc"],
  "Ajax": ["AFC Ajax", "ajax-amsterdam"],
  "PSV": ["PSV Eindhoven", "psv-eindhoven"],
  "Feyenoord": ["Feyenoord Rotterdam", "feyenoord-fc"],
  "Galatasaray": ["Galatasaray SK", "galatasaray-sk"],
  "Fenerbahce": ["Fenerbahce SK", "Fenerbahçe", "fenerbahce-sk"],
  "Sporting CP": ["Sporting Lisbon", "Sporting Portugal", "Sporting CP Lisbon"],
  "Braga": ["SC Braga", "sporting-braga"],
};

// Build reverse aliases for ultra-fast lookup
const reverseAliases = new Map<string, string>();
for (const [canonical, variants] of Object.entries(ALIASES)) {
  reverseAliases.set(canonical.toLowerCase(), canonical);
  for (const variant of variants) {
    reverseAliases.set(variant.toLowerCase(), canonical);
  }
}

/**
 * Normalizes a team name for mapping.
 * Strips accents, lowers case, removes hyphens, strips standard prefixes/suffixes.
 */
export function normalizeTeamName(name: string): string {
  if (!name) return "";

  // Strip diacritics / accents (é -> e, ü -> u, etc.)
  let normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Lowercase and replace dashes/underscores with spaces
  normalized = normalized.toLowerCase().replace(/[-_]/g, " ").trim();

  // Fast alias check first
  const aliasMatch = reverseAliases.get(normalized);
  if (aliasMatch) return aliasMatch;

  // Stripping cycle
  let prev = "";
  while (prev !== normalized) {
    prev = normalized;
    const words = normalized.split(/\s+/);
    const filtered = words.filter((w) => !SUFFIXES.includes(w));
    normalized = filtered.join(" ");

    // Clean up punctuation
    normalized = normalized.replace(/[.,'`&]/g, "").replace(/\s+/g, " ").trim();
  }

  // Final check of stripped alias
  const aliasMatch2 = reverseAliases.get(normalized);
  if (aliasMatch2) return aliasMatch2;

  // Capitalize words for output
  if (!normalized) return name; // Fallback to raw if we stripped everything
  return normalized
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Levenshtein distance-based similarity
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0) return 0.0;
  if (b.length === 0) return 0.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Jaro-Winkler distance calculation
 */
export function jaroWinklerDistance(s1: string, s2: string): number {
  let m = 0;
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 || len2 === 0) return 0;
  if (s1 === s2) return 1;

  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(len2, i + matchWindow + 1);

    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        m++;
        break;
      }
    }
  }

  if (m === 0) return 0;

  // Transpositions
  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }

  t = t / 2;

  // Jaro Similarity
  const jaro = (m / len1 + m / len2 + (m - t) / m) / 3;

  // Winkler enhancement (up to 4 matching prefix characters)
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  const p = 0.1; // scaling factor
  return jaro + prefix * p * (1 - jaro);
}

/**
 * Dice's Coefficient (bigram character overlap)
 */
export function diceSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (s: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.slice(i, i + 2));
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);

  let intersection = 0;
  for (const bigram of b1) {
    if (b2.has(bigram)) {
      intersection++;
    }
  }

  return (2 * intersection) / (b1.size + b2.size);
}

/**
 * Composite fuzzy match score between two team names (returns 0-1)
 */
export function matchTeamNames(name1: string, name2: string): number {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);

  if (!n1 || !n2) return 0.0;
  if (n1 === n2) return 1.0;

  // Substring fast paths
  if (n1.includes(n2) || n2.includes(n1)) {
    // If one is a complete word inside another, highly likely match
    const longer = n1.length > n2.length ? n1 : n2;
    const shorter = n1.length > n2.length ? n2 : n1;
    if (shorter.length >= 4) return 0.90;
  }

  // Calculate scores
  const jaroWinkler = jaroWinklerDistance(n1, n2);
  const levSim = levenshteinSimilarity(n1, n2);
  const dice = diceSimilarity(n1, n2);

  // Composite weighted score
  const score = 0.45 * jaroWinkler + 0.3 * levSim + 0.25 * dice;

  // Direct word intersection boost
  const w1 = new Set(n1.split(/\s+/));
  const w2 = new Set(n2.split(/\s+/));
  let wordMatches = 0;
  for (const w of w1) {
    if (w2.has(w) && w.length >= 3) wordMatches++;
  }
  if (wordMatches > 0) {
    return Math.min(0.98, score + 0.05 * wordMatches);
  }

  return score;
}

/**
 * Find the best match for a team name from a list of candidates
 */
export function findBestTeamMatch(
  targetName: string,
  candidates: Array<{ name: string; id: number | string }>
): { id: number | string; name: string; score: number } | null {
  let best: { id: number | string; name: string; score: number } | null = null;
  for (const c of candidates) {
    const score = matchTeamNames(targetName, c.name);
    // Threshold set to 0.70 for Jaro-Winkler / Composite matching
    if (score > 0.70 && (!best || score > best.score)) {
      best = { id: c.id, name: c.name, score };
    }
  }
  return best;
}
