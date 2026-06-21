/**
 * app.js — Interface, navigation, rendu des écrans
 */
class App {
  constructor() {
    this.currentScreen    = 'home';
    this.prevScreen       = null;
    this.currentPack      = null;       // Pack en cours d'ouverture
    this.selectedRunCar   = null;       // { carId, uid } pour les runs
    this.currentOpponent  = null;       // carData adverse
    this.detailCar        = null;       // { carData, uid|null }
    this.runSelectionMode = false;      // Mode sélection depuis le garage
    this.garageFilter     = 'all';
    this.catalogFilter    = 'all';
    this._toastTimer      = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BOOT
  // ══════════════════════════════════════════════════════════════════════════

  async init() {
    const ok = await window.db.load();
    if (!ok) {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
          height:100vh;color:#e8e8f0;font-family:sans-serif;gap:1rem;text-align:center;padding:2rem;">
          <span style="font-size:3rem">❌</span>
          <p>Impossible de charger <code>data/cars.json</code></p>
          <p style="color:#7777aa;font-size:.85rem">Lance le jeu depuis un serveur HTTP local (ex: <code>npx serve .</code>)</p>
        </div>`;
      return;
    }

    window.game.initStorage();
    this._bindEvents();
    this._renderPacks();
    this._renderCatalog();
    this._updateBalance();
    this._updateStats();
    this.navigate('home');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('[SW] enregistré'))
        .catch(e  => console.warn('[SW] échec :', e));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════

  navigate(screen) {
    if (!screen) return;

    // Masquer tous les écrans
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const el = document.getElementById(`screen-${screen}`);
    if (!el) return;
    el.classList.add('active');

    const nb = document.querySelector(`.nav-btn[data-nav="${screen}"]`);
    if (nb) nb.classList.add('active');

    this.prevScreen    = this.currentScreen;
    this.currentScreen = screen;

    // Hooks par écran
    if (screen === 'home')    { this._updateBalance(); this._updateStats(); }
    if (screen === 'garage')  this._renderGarage();
    if (screen === 'catalog') this._renderCatalog();
    if (screen === 'runs')    this._initRunScreen();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EVENTS
  // ══════════════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Navigation globale data-nav (sauf boutons spéciaux)
    document.addEventListener('click', e => {
      const navEl = e.target.closest('[data-nav]');
      if (navEl && !navEl.dataset.navSkip) {
        this.navigate(navEl.dataset.nav);
        return;
      }
    });

    // Filtres garage
    document.querySelector('#screen-garage .filter-row')
      .addEventListener('click', e => {
        const btn = e.target.closest('.f-btn');
        if (!btn) return;
        document.querySelectorAll('#screen-garage .f-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.garageFilter = btn.dataset.f;
        this._renderGarage();
      });

    // Filtres catalogue
    document.querySelector('#screen-catalog .filter-row')
      .addEventListener('click', e => {
        const btn = e.target.closest('.f-btn');
        if (!btn) return;
        document.querySelectorAll('#screen-catalog .f-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.catalogFilter = btn.dataset.f;
        this._renderCatalog();
      });

    // Pack shop : bouton acheter
    document.getElementById('pack-list')
      .addEventListener('click', e => {
        const btn = e.target.closest('[data-open-pack]');
        if (btn) this._startOpening(window.db.getPackById(btn.dataset.openPack));
      });

    // Carte de pack → ouvrir
    document.getElementById('flip-card').addEventListener('click', () => this._doOpen());

    // Ouvrir un autre pack
    document.getElementById('btn-open-another').addEventListener('click', () => {
      if (this.currentPack) this._startOpening(this.currentPack);
    });

    // Détail : retour
    document.getElementById('btn-back').addEventListener('click', () => {
      this.navigate(this.prevScreen === 'car-detail' ? 'garage' : (this.prevScreen || 'garage'));
    });

    // Runs : sélectionner depuis garage
    document.getElementById('btn-pick-car').addEventListener('click', () => {
      this.runSelectionMode = true;
      this.navigate('garage');
    });

    // Runs : changer adversaire
    document.getElementById('btn-refresh-opp').addEventListener('click', () => {
      this.currentOpponent = window.db.randomCar(this.selectedRunCar?.carId);
      this._renderOpponent();
    });

    // Runs : mises rapides
    document.getElementById('wager-row').addEventListener('click', e => {
      const btn = e.target.closest('.wager-quick-btn');
      if (!btn) return;
      document.querySelectorAll('.wager-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('wager-input').value = btn.dataset.amount;
    });

    // Runs : lancer
    document.getElementById('btn-start-run').addEventListener('click', () => this._doRun());

    // Runs résultat : rejouer
    document.getElementById('btn-run-again').addEventListener('click', () => {
      document.getElementById('run-result-overlay').classList.add('hidden');
      this._initRunScreen();
    });

    // Modal overlay → fermer sur fond
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-overlay')) this._hideModal();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BALANCE & STATS
  // ══════════════════════════════════════════════════════════════════════════

  _updateBalance() {
    const f = this._fmt(window.game.getBalance());
    document.getElementById('header-balance').textContent = f;
    const h = document.getElementById('home-balance');
    if (h) h.textContent = f;
  }

  _updateStats() {
    const s = window.game.getStats();
    const c = window.game.getCollection();
    document.getElementById('stat-opened').textContent = s.totalOpened;
    document.getElementById('stat-runs').textContent   = s.totalRuns;
    document.getElementById('stat-wins').textContent   = s.wins;
    document.getElementById('stat-cars').textContent   = c.length;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SHOP — PACKS
  // ══════════════════════════════════════════════════════════════════════════

  _renderPacks() {
    const LABELS = { common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' };
    document.getElementById('pack-list').innerHTML = window.db.packs.map(pack => `
      <div class="pack-card-item">
        <span class="pack-emoji">${pack.emoji}</span>
        <div class="pack-info">
          <div class="pack-name">${pack.name}</div>
          <div class="pack-desc">${pack.description}</div>
          <div class="pills">
            ${Object.entries(pack.weights).filter(([,w]) => w > 0)
              .map(([r,w]) => `<span class="pill pill-${r}">${LABELS[r]} ${w}%</span>`).join('')}
          </div>
        </div>
        <div class="pack-right">
          <span class="pack-price-tag">${this._fmt(pack.price)}</span>
          <button class="btn btn-primary btn-sm" data-open-pack="${pack.id}">Acheter</button>
        </div>
      </div>
    `).join('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PACK OPENING
  // ══════════════════════════════════════════════════════════════════════════

  _startOpening(pack) {
    if (!pack) return;
    this.currentPack = pack;
    this.navigate('opening');

    const card = document.getElementById('flip-card');
    card.className = 'flip-card';                         // reset classes
    card.style.pointerEvents = 'auto';
    document.getElementById('open-actions').classList.add('hidden');
    document.getElementById('reveal-body').innerHTML = '';

    // Label sur la carte
    document.getElementById('open-pack-emoji').textContent = pack.emoji;
    document.getElementById('open-pack-name').textContent  = pack.name;
  }

  _doOpen() {
    if (!this.currentPack) return;
    const card = document.getElementById('flip-card');
    if (card.classList.contains('shaking') || card.classList.contains('flipped')) return;

    const result = window.game.openPack(this.currentPack);

    if (!result.success) {
      if (result.reason === 'insufficient_funds') {
        this.toast('Solde insuffisant !', 'error');
        this.navigate('home');
      }
      return;
    }

    card.classList.add('shaking');
    card.style.pointerEvents = 'none';

    setTimeout(() => {
      card.classList.remove('shaking');
      this._renderReveal(result.car);
      card.classList.add('flipped', `glow-${result.car.rarity}`);
      setTimeout(() => {
        document.getElementById('open-actions').classList.remove('hidden');
        this._updateBalance();
        this._updateStats();
      }, 650);
    }, 560);
  }

  _renderReveal(car) {
    const COLORS = { common:'var(--c-common)', rare:'var(--c-rare)', epic:'var(--c-epic)', legendary:'var(--c-legendary)' };
    const LABELS = { common:'Commun', rare:'Rare', epic:'Épique', legendary:'Légendaire' };
    document.getElementById('reveal-body').innerHTML = `
      <div class="reveal-rarity" style="color:${COLORS[car.rarity]}">${LABELS[car.rarity]}</div>
      <div class="reveal-brand">${car.brand}</div>
      <div class="reveal-name">${car.name}</div>
      ${this._img(car.images?.pack, car.rarity, 'reveal')}
      <div class="reveal-stat"><strong>${car.specs.power} ch</strong> · <strong>${car.specs.sprint_100}s</strong> 0-100</div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GARAGE
  // ══════════════════════════════════════════════════════════════════════════

  _renderGarage() {
    const grid = document.getElementById('garage-grid');

    // Bannière mode sélection run
    let banner = '';
    if (this.runSelectionMode) {
      banner = `<div class="selection-banner">🏁 Sélectionnez une voiture pour le run</div>`;
    }

    const owned    = window.game.getOwnedCars();
    const filtered = this.garageFilter === 'all'
      ? owned
      : owned.filter(i => i.carData.rarity === this.garageFilter);

    if (filtered.length === 0) {
      grid.innerHTML = banner + `
        <div class="empty-state">
          <p>${this.garageFilter === 'all' ? '🚗 Garage vide' : 'Aucune voiture dans cette catégorie'}</p>
          <button class="btn btn-primary" data-nav="shop">Ouvrir des packs</button>
        </div>`;
      return;
    }

    grid.innerHTML = banner + `<div class="cars-grid">${
      filtered.map(item => this._carCard(item.carData, item.uid, 'garage')).join('')
    }</div>`;

    grid.querySelectorAll('.car-card').forEach(card => {
      card.addEventListener('click', () => {
        const carData = window.db.getCarById(card.dataset.carId);
        const uid     = card.dataset.uid || null;

        if (this.runSelectionMode && uid) {
          this.runSelectionMode = false;
          this._setRunCar({ carId: carData.id, uid });
          this.navigate('runs');
          return;
        }

        if (carData) this._showDetail(carData, uid);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CATALOGUE
  // ══════════════════════════════════════════════════════════════════════════

  _renderCatalog() {
    const grid = document.getElementById('catalog-grid');
    const cars = this.catalogFilter === 'all'
      ? window.db.cars
      : window.db.getCarsByRarity(this.catalogFilter);

    if (cars.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Aucune voiture disponible</p></div>';
      return;
    }

    grid.innerHTML = `<div class="cars-grid">${
      cars.map(car => this._carCard(car, null, 'catalog')).join('')
    }</div>`;

    grid.querySelectorAll('.car-card').forEach(card => {
      card.addEventListener('click', () => {
        const carData = window.db.getCarById(card.dataset.carId);
        if (carData) this._showDetail(carData, null);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CAR CARD (composant réutilisable)
  // ══════════════════════════════════════════════════════════════════════════

  _carCard(car, uid = null, context = 'catalog') {
    const ownedN   = window.game.countOwned(car.id);
    const LABELS   = { common:'Commun', rare:'Rare', epic:'Épique', legendary:'Légendaire' };
    const dataUid  = uid ? `data-uid="${uid}"` : '';

    const ownedBadge  = (context === 'catalog' && ownedN > 0)
      ? `<div class="badge-owned">✓${ownedN > 1 ? ` ×${ownedN}` : ''}</div>` : '';

    return `
      <div class="car-card rarity-${car.rarity}" data-car-id="${car.id}" ${dataUid}>
        ${this._img(car.images?.catalog, car.rarity, 'thumb')}
        <div class="badge-rarity badge-${car.rarity}">${LABELS[car.rarity]}</div>
        ${ownedBadge}
        <div class="car-body">
          <div class="car-brand">${car.brand}</div>
          <div class="car-name">${car.name}</div>
          <div class="car-quick"><strong>${car.specs.power}</strong> ch · <strong>${car.specs.sprint_100}s</strong></div>
        </div>
        <div class="car-foot">
          <span class="car-price-s">${this._fmt(car.base_price)}</span>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DÉTAIL VOITURE
  // ══════════════════════════════════════════════════════════════════════════

  _showDetail(carData, uid = null) {
    this.detailCar = { carData, uid };
    const owned    = window.game.countOwned(carData.id);
    const sellPx   = Math.floor(carData.base_price * carData.sell_ratio);
    const LABELS   = { common:'Commun', rare:'Rare', epic:'Épique', legendary:'Légendaire' };
    const COLORS   = { common:'var(--c-common)', rare:'var(--c-rare)', epic:'var(--c-epic)', legendary:'var(--c-legendary)' };

    document.getElementById('car-detail-content').innerHTML = `
      <div class="detail-showroom">
        ${this._img(carData.images?.showroom, carData.rarity, 'showroom')}
      </div>
      <div class="detail-header">
        <div class="detail-brand-year">${carData.brand} · ${carData.year}</div>
        <div class="detail-name">${carData.name}</div>
        <span class="detail-rarity-badge badge-${carData.rarity}">${LABELS[carData.rarity]}</span>
      </div>
      ${owned > 0 ? `<p class="owned-info">✅ Vous possédez ${owned} exemplaire${owned>1?'s':''}</p>` : ''}
      <div class="specs-grid">
        <div class="spec-box"><span class="spec-val">${carData.specs.power}</span><span class="spec-label">Chevaux</span></div>
        <div class="spec-box"><span class="spec-val">${carData.specs.torque}</span><span class="spec-label">Nm</span></div>
        <div class="spec-box"><span class="spec-val">${carData.specs.weight} kg</span><span class="spec-label">Poids</span></div>
        <div class="spec-box"><span class="spec-val">${carData.specs.sprint_100}s</span><span class="spec-label">0-100</span></div>
        <div class="spec-box"><span class="spec-val">${carData.specs.sprint_200}s</span><span class="spec-label">0-200</span></div>
        <div class="spec-box"><span class="spec-val">${carData.specs.top_speed}</span><span class="spec-label">Vmax km/h</span></div>
      </div>
      <div class="detail-actions">
        ${uid
          ? `<button class="btn btn-danger" id="detail-sell">Vendre (${this._fmt(sellPx)})</button>
             <button class="btn btn-primary" id="detail-run">Utiliser en Run</button>`
          : `<button class="btn btn-primary btn-full" id="detail-buy">Acheter ${this._fmt(carData.base_price)}</button>`
        }
      </div>`;

    document.getElementById('detail-sell')?.addEventListener('click', () =>
      this._confirmSell(uid, carData, sellPx));

    document.getElementById('detail-run')?.addEventListener('click', () => {
      this._setRunCar({ carId: carData.id, uid });
      this.navigate('runs');
    });

    document.getElementById('detail-buy')?.addEventListener('click', () =>
      this._doBuy(carData.id));

    this.navigate('car-detail');
  }

  _confirmSell(uid, carData, sellPx) {
    this._showModal(
      `Vendre ${carData.name} ?`,
      `Vous recevrez ${this._fmt(sellPx)}. Cette action est irréversible.`,
      [
        { label: 'Annuler', cls: 'btn-secondary', cb: () => this._hideModal() },
        { label: 'Vendre',  cls: 'btn-danger',    cb: () => {
          const r = window.game.sellCar(uid);
          this._hideModal();
          if (r.success) {
            this.toast(`Vendue pour ${this._fmt(r.sellPrice)} !`, 'success');
            this._updateBalance();
            this.navigate('garage');
          } else {
            this.toast('Erreur lors de la vente.', 'error');
          }
        }}
      ]
    );
  }

  _doBuy(carId) {
    const r = window.game.buyCar(carId);
    if (r.success) {
      this.toast(`${r.carData.name} ajoutée au garage !`, 'success');
      this._updateBalance();
      this.navigate('garage');
    } else {
      this.toast(r.reason === 'insufficient_funds' ? 'Solde insuffisant !' : 'Achat impossible.', 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RUNS
  // ══════════════════════════════════════════════════════════════════════════

  _initRunScreen() {
    document.getElementById('run-result-overlay').classList.add('hidden');
    this.currentOpponent = window.db.randomCar(this.selectedRunCar?.carId);
    this._renderPlayerSlot();
    this._renderOpponent();
    this._updateRunBtn();
  }

  _setRunCar(ref) {
    this.selectedRunCar  = ref;
    this.currentOpponent = window.db.randomCar(ref.carId);
    this._renderPlayerSlot();
    this._renderOpponent();
    this._updateRunBtn();
  }

  _renderPlayerSlot() {
    const el = document.getElementById('player-slot');
    if (!this.selectedRunCar) {
      el.innerHTML = `
        <div class="slot-empty">
          <p>Aucune voiture sélectionnée</p>
          <button class="btn btn-secondary btn-sm" id="btn-pick-car">Depuis le garage</button>
        </div>`;
      document.getElementById('btn-pick-car').addEventListener('click', () => {
        this.runSelectionMode = true;
        this.navigate('garage');
      });
      return;
    }

    const car = window.db.getCarById(this.selectedRunCar.carId);
    if (!car) return;

    el.innerHTML = `
      <div class="run-car-row">
        ${this._img(car.images?.catalog, car.rarity, 'run-thumb')}
        <div class="run-car-text">
          <div class="run-car-n">${car.name}</div>
          <div class="run-car-b">${car.brand}</div>
          <div class="run-car-p">${car.specs.power} ch · ${car.specs.sprint_100}s</div>
        </div>
        <button class="run-change-btn" id="btn-change-car">Changer</button>
      </div>`;

    document.getElementById('btn-change-car').addEventListener('click', () => {
      this.runSelectionMode = true;
      this.navigate('garage');
    });
  }

  _renderOpponent() {
    const el = document.getElementById('opponent-slot');
    if (!this.currentOpponent) {
      el.innerHTML = '<div class="slot-empty"><p>Aucun adversaire disponible</p></div>';
      return;
    }
    const car = this.currentOpponent;
    el.innerHTML = `
      <div class="run-car-row">
        ${this._img(car.images?.catalog, car.rarity, 'run-thumb')}
        <div class="run-car-text">
          <div class="run-car-n">${car.name}</div>
          <div class="run-car-b">${car.brand}</div>
          <div class="run-car-p">${car.specs.power} ch · ${car.specs.sprint_100}s</div>
        </div>
        <button class="run-change-btn" id="btn-refresh-opp">🔄</button>
      </div>`;

    document.getElementById('btn-refresh-opp').addEventListener('click', () => {
      this.currentOpponent = window.db.randomCar(this.selectedRunCar?.carId);
      this._renderOpponent();
    });
  }

  _updateRunBtn() {
    document.getElementById('btn-start-run').disabled =
      !this.selectedRunCar || !this.currentOpponent;
  }

  _doRun() {
    if (!this.selectedRunCar || !this.currentOpponent) return;
    const wager = Math.max(100, parseInt(document.getElementById('wager-input').value) || 1000);

    const r = window.game.runRace(this.selectedRunCar.carId, this.currentOpponent.id, wager);

    if (!r.success) {
      this.toast(r.reason === 'insufficient_funds' ? 'Solde insuffisant pour cette mise !' : 'Erreur.', 'error');
      return;
    }

    this._updateBalance();
    this._updateStats();
    this._showRunResult(r, wager);
  }

  _showRunResult(r, wager) {
    const overlay = document.getElementById('run-result-overlay');
    overlay.classList.remove('hidden');

    document.getElementById('result-icon').textContent   = r.win ? '🏆' : '💀';
    const titleEl = document.getElementById('result-title');
    titleEl.textContent  = r.win ? 'VICTOIRE !' : 'DÉFAITE';
    titleEl.style.color  = r.win ? 'var(--success)' : 'var(--danger)';

    const amtEl  = document.getElementById('result-amount');
    amtEl.textContent = `${r.win ? '+' : ''}${this._fmt(r.earnings)}`;
    amtEl.style.color  = r.win ? 'var(--success)' : 'var(--danger)';

    document.getElementById('result-score-p').textContent = r.playerScore;
    document.getElementById('result-score-o').textContent = r.opponentScore;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  IMAGE HELPER
  // ══════════════════════════════════════════════════════════════════════════

  _img(src, rarity, type) {
    const EMOJI = { common:'🚗', rare:'🏎️', epic:'⚡', legendary:'🔥' };
    const BG    = {
      common:    'linear-gradient(135deg,#1a1a24,#2a2a38)',
      rare:      'linear-gradient(135deg,#0d1a2e,#1a3560)',
      epic:      'linear-gradient(135deg,#160d28,#3a1860)',
      legendary: 'linear-gradient(135deg,#1e1206,#5a3800)'
    };
    const e  = EMOJI[rarity] || '🚗';
    const bg = BG[rarity] || BG.common;
    const ph = (cls, sz) =>
      `<div class="${cls}" style="background:${bg};display:flex;align-items:center;justify-content:center;font-size:${sz}">${e}</div>`;

    const errJs = (cls, sz) =>
      `this.outerHTML='${ph(cls, sz).replace(/'/g, "\\'")}';this.onerror=null;`;

    if (type === 'thumb') {
      return src
        ? `<img class="car-thumb" src="${src}" alt="" loading="lazy" onerror="${errJs('car-thumb-ph','2.2rem')}">`
        : ph('car-thumb-ph', '2.2rem');
    }
    if (type === 'showroom') {
      return src
        ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover" alt="" onerror="${errJs('detail-showroom-ph','5rem')}">`
        : ph('detail-showroom-ph', '5rem');
    }
    if (type === 'reveal') {
      return src
        ? `<img class="reveal-img" src="${src}" alt="" onerror="${errJs('reveal-img-ph','2.8rem')}">`
        : ph('reveal-img-ph', '2.8rem');
    }
    if (type === 'run-thumb') {
      return src
        ? `<img class="run-car-thumb" src="${src}" alt="" onerror="${errJs('run-car-thumb-ph','1.6rem')}">`
        : ph('run-car-thumb-ph', '1.6rem');
    }
    return '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MODAL
  // ══════════════════════════════════════════════════════════════════════════

  _showModal(title, text, buttons) {
    document.getElementById('modal-box').innerHTML = `
      <div class="modal-title">${title}</div>
      <div class="modal-text">${text}</div>
      <div class="modal-btns">
        ${buttons.map((b, i) => `<button class="btn ${b.cls}" data-mi="${i}">${b.label}</button>`).join('')}
      </div>`;
    document.getElementById('modal-overlay').classList.remove('hidden');

    document.querySelectorAll('[data-mi]').forEach(btn => {
      btn.addEventListener('click', () => buttons[+btn.dataset.mi].cb());
    });
  }

  _hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TOAST
  // ══════════════════════════════════════════════════════════════════════════

  toast(msg, type = '') {
    const el    = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UTILS
  // ══════════════════════════════════════════════════════════════════════════

  _fmt(n) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0
    }).format(n);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
