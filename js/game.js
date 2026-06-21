/**
 * game.js — Logique du jeu : économie, packs, runs, collection
 * Les données du joueur sont stockées dans localStorage
 *
 * Clés localStorage :
 *   carpack_balance    → solde en euros (number)
 *   carpack_collection → tableau d'instances de voitures possédées
 *   carpack_stats      → statistiques du joueur
 */
class Game {
  constructor() {
    this.K = {
      BALANCE:    'carpack_balance',
      COLLECTION: 'carpack_collection',
      STATS:      'carpack_stats'
    };
    this.START_BALANCE = 25000;
  }

  /** Initialise le stockage si première visite */
  initStorage() {
    if (localStorage.getItem(this.K.BALANCE) === null) {
      this.setBalance(this.START_BALANCE);
    }
  }

  // ─── Solde ────────────────────────────────────────────────────────────────

  getBalance() {
    return parseInt(localStorage.getItem(this.K.BALANCE) ?? this.START_BALANCE);
  }

  setBalance(amount) {
    localStorage.setItem(this.K.BALANCE, Math.max(0, Math.round(amount)));
  }

  addBalance(n) { this.setBalance(this.getBalance() + n); }

  // ─── Collection ───────────────────────────────────────────────────────────

  getCollection() {
    try { return JSON.parse(localStorage.getItem(this.K.COLLECTION) || '[]'); }
    catch { return []; }
  }

  saveCollection(col) {
    localStorage.setItem(this.K.COLLECTION, JSON.stringify(col));
  }

  /**
   * Ajoute une voiture à la collection du joueur.
   * @returns {string} uid unique de l'instance
   */
  addToCollection(carId, source = 'pack') {
    const uid = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const col = this.getCollection();
    col.push({ carId, uid, obtainedAt: Date.now(), source });
    this.saveCollection(col);
    return uid;
  }

  removeFromCollection(uid) {
    const col = this.getCollection();
    const idx = col.findIndex(c => c.uid === uid);
    if (idx === -1) return false;
    col.splice(idx, 1);
    this.saveCollection(col);
    return true;
  }

  /**
   * Retourne les voitures possédées avec leurs données catalogue
   * @returns {Array<{carId, uid, obtainedAt, source, carData}>}
   */
  getOwnedCars() {
    return this.getCollection()
      .map(item => ({ ...item, carData: window.db.getCarById(item.carId) }))
      .filter(item => item.carData !== null);
  }

  countOwned(carId) {
    return this.getCollection().filter(c => c.carId === carId).length;
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  getStats() {
    try {
      return { totalOpened: 0, totalRuns: 0, wins: 0, losses: 0,
        ...JSON.parse(localStorage.getItem(this.K.STATS) || '{}') };
    } catch { return { totalOpened: 0, totalRuns: 0, wins: 0, losses: 0 }; }
  }

  patchStats(patch) {
    const s = this.getStats();
    localStorage.setItem(this.K.STATS, JSON.stringify({ ...s, ...patch }));
  }

  // ─── Ouverture de pack ────────────────────────────────────────────────────

  openPack(pack) {
    if (this.getBalance() < pack.price) {
      return { success: false, reason: 'insufficient_funds' };
    }

    const rarity   = this._rollRarity(pack.weights);
    let   eligible = window.db.getCarsByRarity(rarity);

    // Fallback si aucune voiture de cette rareté
    if (eligible.length === 0) eligible = window.db.cars;
    if (eligible.length === 0) return { success: false, reason: 'no_cars' };

    const car = eligible[Math.floor(Math.random() * eligible.length)];
    this.setBalance(this.getBalance() - pack.price);
    const uid = this.addToCollection(car.id, pack.id);

    const stats = this.getStats();
    this.patchStats({ totalOpened: stats.totalOpened + 1 });

    return { success: true, car, uid };
  }

  _rollRarity(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total   = entries.reduce((s, [, w]) => s + w, 0);
    let   roll    = Math.random() * total;
    for (const [rarity, w] of entries) {
      roll -= w;
      if (roll <= 0) return rarity;
    }
    return entries[0]?.[0] ?? 'common';
  }

  // ─── Vente ────────────────────────────────────────────────────────────────

  sellCar(uid) {
    const col  = this.getCollection();
    const item = col.find(c => c.uid === uid);
    if (!item) return { success: false };

    const carData = window.db.getCarById(item.carId);
    if (!carData) return { success: false };

    const sellPrice = Math.floor(carData.base_price * carData.sell_ratio);
    this.removeFromCollection(uid);
    this.addBalance(sellPrice);

    return { success: true, sellPrice, carData };
  }

  // ─── Achat direct ────────────────────────────────────────────────────────

  buyCar(carId) {
    const carData = window.db.getCarById(carId);
    if (!carData) return { success: false, reason: 'not_found' };
    if (this.getBalance() < carData.base_price) return { success: false, reason: 'insufficient_funds' };

    this.setBalance(this.getBalance() - carData.base_price);
    const uid = this.addToCollection(carId, 'purchase');
    return { success: true, uid, carData };
  }

  // ─── Run ─────────────────────────────────────────────────────────────────

  runRace(playerCarId, opponentCarId, wager) {
    if (this.getBalance() < wager) return { success: false, reason: 'insufficient_funds' };

    const playerCar   = window.db.getCarById(playerCarId);
    const opponentCar = window.db.getCarById(opponentCarId);
    if (!playerCar || !opponentCar) return { success: false, reason: 'invalid_car' };

    // Score = (ch/poids) × (10 / 0-100) × random ±15%
    const pScore = this._calcScore(playerCar);
    const oScore = this._calcScore(opponentCar);
    const win    = pScore > oScore;

    if (win) {
      this.addBalance(wager);
    } else {
      this.setBalance(this.getBalance() - wager);
    }

    const stats = this.getStats();
    this.patchStats({
      totalRuns: stats.totalRuns + 1,
      wins:      stats.wins  + (win ? 1 : 0),
      losses:    stats.losses + (win ? 0 : 1)
    });

    return {
      success: true,
      win,
      playerScore:   pScore.toFixed(2),
      opponentScore: oScore.toFixed(2),
      earnings: win ? wager : -wager
    };
  }

  _calcScore(car) {
    const s    = car.specs;
    const base = (s.power / s.weight) * (10 / s.sprint_100) * 100;
    return base * (0.85 + Math.random() * 0.30); // ±15%
  }

  // ─── Reset (debug) ────────────────────────────────────────────────────────

  resetAll() {
    Object.values(this.K).forEach(k => localStorage.removeItem(k));
    this.initStorage();
  }
}

window.game = new Game();
