/**
 * db.js — Gestion du catalogue de voitures (lecture seule, côté serveur)
 * Les voitures se trouvent dans data/cars.json
 * Pour ajouter une voiture : éditer cars.json et ajouter son entrée dans le tableau "cars"
 */
class Database {
  constructor() {
    this.cars  = [];
    this.packs = [];
    this.ready = false;
  }

  async load() {
    try {
      const res  = await fetch('/data/cars.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.cars  = data.cars  || [];
      this.packs = data.packs || [];
      this.ready = true;
      console.log(`[DB] ${this.cars.length} voiture(s), ${this.packs.length} pack(s) chargés`);
      return true;
    } catch (err) {
      console.error('[DB] Erreur de chargement :', err);
      return false;
    }
  }

  getCarById(id) {
    return this.cars.find(c => c.id === id) ?? null;
  }

  getCarsByRarity(rarity) {
    if (!rarity || rarity === 'all') return [...this.cars];
    return this.cars.filter(c => c.rarity === rarity);
  }

  getPackById(id) {
    return this.packs.find(p => p.id === id) ?? null;
  }

  /** Voiture aléatoire du catalogue, en excluant optionnellement un id */
  randomCar(excludeId = null) {
    const pool = excludeId ? this.cars.filter(c => c.id !== excludeId) : [...this.cars];
    if (pool.length === 0) return this.cars[0] ?? null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

window.db = new Database();
