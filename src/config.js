// ─────────────────────────────────────────────────────────────────────────────
// TERRAFRONT — fichier unique d'équilibrage et de réglages.
// Toutes les valeurs de jeu sont ici : modifiez-les sans toucher au moteur.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  GRID: {
    cellSizeM: 15, // taille d'une case (mètres)
    bandDeg: 1, // la largeur en longitude des cases est recalculée par bande de 1° de latitude
  },

  START: {
    coins: 500, // pièces offertes à l'arrivée
    troops: 20,
  },

  CAPITAL: {
    radiusM: 50, // zone protégée de ~100 m de diamètre, jamais conquérable
    minDistanceM: 250, // distance minimale entre deux capitales
    coinsPerMin: 1, // production de base de la capitale
    troopsPerMin: 0.5,
    troopCap: 30, // plafond de troupes de base
  },

  GPS: {
    maxAccuracyM: 40, // points moins précis ignorés
    maxSpeedKmh: 15, // au-delà : véhicule → ignoré
    interpolateMaxM: 60, // on comble les trous entre deux points valides proches
    stepM: 5,
  },

  OFFLINE: {
    rate: 0.25, // usines et villes produisent à 25 % appli fermée
    maxHours: 12, // plafond de stockage : 12 h de production hors ligne au maximum
    onlineGapS: 15, // un écart plus long entre deux calculs = période hors ligne
  },

  // Bâtiments : liste extensible. Ajoutez un type ici, le moteur le gère.
  // Effets reconnus par niveau : coinsPerMin, troopsPerMin, troopCap, cellsPerHour, radiusM.
  // cost : coût de la n-ième construction = base × growth^n (n = achats déjà faits de ce type)
  // upgrade : coût du passage au niveau L+1 = base × growth^(L-1)
  BUILDINGS: {
    factory: {
      name: 'Usine',
      icon: 'factory',
      description: 'Produit des pièces en continu.',
      cost: { base: 120, growth: 1.6 },
      upgrade: { base: 150, growth: 1.8 },
      levels: [
        { coinsPerMin: 2 },
        { coinsPerMin: 3.5 },
        { coinsPerMin: 5.5 },
        { coinsPerMin: 8 },
        { coinsPerMin: 12 },
      ],
    },
    city: {
      name: 'Ville',
      icon: 'city',
      description: 'Forme des troupes et augmente votre plafond de troupes.',
      cost: { base: 150, growth: 1.6 },
      upgrade: { base: 180, growth: 1.8 },
      levels: [
        { troopsPerMin: 1, troopCap: 40 },
        { troopsPerMin: 1.6, troopCap: 60 },
        { troopsPerMin: 2.4, troopCap: 85 },
        { troopsPerMin: 3.4, troopCap: 115 },
        { troopsPerMin: 5, troopCap: 150 },
      ],
    },
    base: {
      name: "Base d'attaque",
      icon: 'base',
      description: 'Étend lentement votre territoire autour d’elle, même hors ligne, sur les cases libres.',
      cost: { base: 200, growth: 1.8 },
      upgrade: { base: 300, growth: 2 },
      levels: [
        { cellsPerHour: 3, radiusM: 120 },
        { cellsPerHour: 4, radiusM: 180 },
        { cellsPerHour: 5, radiusM: 250 },
        { cellsPerHour: 6.5, radiusM: 330 },
        { cellsPerHour: 8, radiusM: 420 },
      ],
    },
  },

  ATTACK: {
    zoneRadiusM: 40, // taille de la zone disputée lors d'une bataille
    minTroops: 5,
  },

  BATTLE: {
    fieldM: 220, // côté du champ de bataille (mètres abstraits)
    speedMps: 16,
    dpsPerTroop: 0.05, // pertes infligées par troupe et par seconde
    frontArcDeg: 60, // demi-angle du front ; au-delà = flanc ou arrière
    flankBonus: 1.5, // attaque de flanc ou de dos
    encircleSpreadDeg: 120, // ennemis au contact séparés d'au moins cet angle = encerclé
    encircleMalus: 0.65, // force d'un groupe encerclé
    turnRateDeg: 90, // vitesse de rotation d'un groupe engagé (°/s)
    holdSeconds: 8, // tenir seul la zone ce temps = victoire de l'attaquant
    timeLimitS: 120, // au-delà, le défenseur garde la zone
    radiusBase: 5,
    radiusPerSqrtTroop: 1.1,
    defenderLeashM: 80, // les défenseurs ne poursuivent pas au-delà
    engageGapM: 12, // un groupe à l'arrêt engage seul l'ennemi à moins de cet écart
  },

  NPC: {
    difficulty: 'normal', // 'easy' | 'normal' | 'hard'
    difficulties: {
      easy: { troops: 0.6, expand: 0.7, aggression: 0.4 },
      normal: { troops: 1, expand: 1, aggression: 1 },
      hard: { troops: 1.4, expand: 1.3, aggression: 1.8 },
    },
    tileKm: 1.2, // le monde est découpé en tuiles, au plus une nation par tuile
    spawnChance: 0.55,
    seedRadiusTiles: 2, // 5 × 5 tuiles autour du joueur
    clearRadiusM: 350, // aucune nation n'apparaît aussi près du point choisi par le joueur
    startRadiusM: 70,
    maxRadiusM: 320,
    cellsPerHour: 1.5,
    troopsPerMin: 0.4,
    troopCap: 45,
    startTroops: 25,
    defendRatio: 0.9, // part des troupes engagée en défense
    attack: {
      checkEveryMin: 2,
      chance: 0.12,
      minTroops: 15,
      strengthRatio: 1.3, // n'attaque qu'un voisin nettement plus faible
      cooldownMin: 45,
      commitRatio: 0.7,
    },
    names: [
      'Valdoria', 'Ostrevie', 'Kervanie', 'Lysandre', 'Morvaine', 'Thalassie', 'Brévonie',
      'Aldermark', 'Sylvanor', 'Corvalis', 'Estmarche', 'Vespérie', 'Arvalon', 'Drakmoor',
      'Pellucie', 'Gravelonde', 'Isembourg', 'Montvallon', 'Cendrevue', 'Haurelle',
    ],
    colors: ['#a39470', '#8394ab', '#a57e6c', '#8e80aa', '#72998b', '#a99a6e', '#94727f', '#7090a6', '#9aa36e', '#aa8a6c'],
  },

  INACTIVITY: {
    warnDays: 21,
    wipeTerritoryDays: 30, // perte de tout le territoire sauf la capitale
    deleteAccountDays: 90, // suppression complète du compte
  },

  PRIVACY: {
    offsetM: 100, // décalage fixe des capitales/bâtiments des autres joueurs
  },

  PLAYER_COLORS: [
    { name: 'Azur', hex: '#4c8dff' },
    { name: 'Émeraude', hex: '#2fbf8f' },
    { name: 'Ambre', hex: '#f0a83a' },
    { name: 'Carmin', hex: '#e5484d' },
    { name: 'Améthyste', hex: '#9b6bff' },
    { name: 'Turquoise', hex: '#22b8cf' },
    { name: 'Fuchsia', hex: '#e0569b' },
    { name: 'Ivoire', hex: '#e8e2cf' },
  ],

  MAP: {
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    worldZoom: 1.4,
    capitalZoom: 16.5,
    maxZoom: 19.5,
  },

  GEOCODER: {
    url: 'https://nominatim.openstreetmap.org/search',
    userAgent: 'Terrafront/1.0 (com.terrafront.app)',
    minIntervalMs: 1100, // politique Nominatim : 1 requête/s maximum
  },

  SAVE_EVERY_S: 10,
};
