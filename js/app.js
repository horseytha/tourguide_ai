/* ==========================================================================
   WANDERLY - MAIN APPLICATION CONTROLLER
   Manages UI state, views, drag-and-drop timeline, Leaflet map & Chart.js
   ========================================================================== */

class Application {
  constructor() {
    // Application State
    this.state = {
      city: 'London',
      travelerType: 'Solo traveler',
      tripPurpose: 'Leisure',
      queryTags: 'museum food walkable',
      numDays: 3,
      currentDayTab: 'Day 1',
      itinerary: {},
      editingStop: null, // { day, index }
      addingToDay: 'Day 1',
      tripDate: '',
      budget: 1500,
      spent: 0,
      expenses: [],
      notes: '',
      dayDetails: {},
      packingList: [
        { label: 'Travel documents', packed: false },
        { label: 'Phone charger', packed: false },
        { label: 'Everyday shoes', packed: false },
        { label: 'Weather-ready layer', packed: false }
      ]
    };

    this.map = null;
    this.mapMarkers = [];
    this.mapPolylines = [];
    this.sentimentChart = null;
    this.ratingChart = null;
    this.draggedIndex = null;

    this.init();
  }

  init() {
    this.bindDOMEvents();
    const hasSavedTrip = this.restoreTrip();
    if (!hasSavedTrip) this.generateDefaultItinerary();
    this.initMap();
    this.initCharts();
    this.renderTimeline();
    this.renderDayDetails();
    this.renderTripTools();
    this.updateDashboard();
    if (hasSavedTrip) this.switchView('dashboard');

    // Attach to global window
    window.WanderlyApp = this;
  }

  bindDOMEvents() {
    // Navigation Links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const targetView = e.currentTarget.dataset.view;
        this.switchView(targetView);
      });
    });

    const timelineList = document.getElementById('timeline-list');
    timelineList.addEventListener('change', (event) => {
      const checkbox = event.target.closest('input[data-stop-index]');
      if (!checkbox) return;
      const stop = this.state.itinerary[this.state.currentDayTab]?.[Number(checkbox.dataset.stopIndex)];
      if (!stop) return;
      stop.done = checkbox.checked;
      this.renderTimeline();
      this.refreshTripOverview();
      this.persistTrip();
    });

    // Form inputs
    const citySelect = document.getElementById('city-select');
    if (citySelect) {
      citySelect.addEventListener('change', (e) => {
        this.state.city = e.target.value;
      });
    }

    const travelerSelect = document.getElementById('traveler-select');
    if (travelerSelect) {
      travelerSelect.addEventListener('change', (e) => {
        this.state.travelerType = e.target.value;
      });
    }

    // Purpose Toggles
    const purposeBtns = document.querySelectorAll('.toggle-btn');
    purposeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        purposeBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.state.tripPurpose = e.currentTarget.dataset.purpose;
      });
    });

    // Mood Chips
    const moodChips = document.querySelectorAll('.mood-chip');
    const tagsInput = document.getElementById('tags-input');
    moodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        const selectedTags = Array.from(document.querySelectorAll('.mood-chip.selected'))
          .map(c => c.dataset.tag);
        tagsInput.value = selectedTags.join(' ');
        this.state.queryTags = tagsInput.value;
      });
    });

    if (tagsInput) {
      tagsInput.addEventListener('input', (e) => {
        this.state.queryTags = e.target.value;
      });
    }

    // Days Slider
    const daysSlider = document.getElementById('days-slider');
    const daysBadge = document.getElementById('days-badge');
    if (daysSlider) {
      daysSlider.addEventListener('input', (e) => {
        this.state.numDays = parseInt(e.target.value, 10);
        if (daysBadge) daysBadge.innerText = `${this.state.numDays} days`;
      });
    }

    const tripDate = document.getElementById('trip-date');
    if (tripDate) {
      tripDate.addEventListener('change', (e) => {
        this.state.tripDate = e.target.value;
      });
    }

    const tripBudget = document.getElementById('trip-budget');
    if (tripBudget) {
      tripBudget.addEventListener('input', (e) => {
        this.state.budget = Math.max(0, Number(e.target.value) || 0);
      });
    }

    // Plan CTA Button
    const planBtn = document.getElementById('btn-plan-getaway');
    if (planBtn) {
      planBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handlePlanGetaway();
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      });
    });

    // Save Edit Stop Form
    const editForm = document.getElementById('edit-stop-form');
    if (editForm) {
      editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveStopEdit();
      });
    }

    document.getElementById('custom-stop-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addCustomStop();
    });
    document.getElementById('open-custom-stop-btn').addEventListener('click', () => {
      document.getElementById('modal-add-stop').classList.remove('active');
      document.getElementById('custom-stop-form').reset();
      document.getElementById('modal-custom-stop').classList.add('active');
    });

    // Search Add Stop Input
    const addSearchInput = document.getElementById('add-stop-search');
    if (addSearchInput) {
      addSearchInput.addEventListener('input', (e) => {
        this.renderAddStopResults(e.target.value);
      });
    }

    document.getElementById('budget-total').addEventListener('change', (e) => {
      this.state.budget = Math.max(0, Number(e.target.value) || 0);
      this.updateBudget();
      this.persistTrip();
    });
    document.getElementById('budget-spent').addEventListener('change', (e) => {
      this.state.spent = Math.max(0, Number(e.target.value) || 0);
      this.updateBudget();
      this.refreshTripOverview();
      this.persistTrip();
    });

    const packingList = document.getElementById('packing-list');
    packingList.addEventListener('change', (e) => {
      if (!e.target.matches('input[type="checkbox"][data-packing-index]')) return;
      const item = this.state.packingList[Number(e.target.dataset.packingIndex)];
      if (!item) return;
      item.packed = e.target.checked;
      this.renderPackingList();
      this.persistTrip();
    });

    const addPackingItem = () => {
      const input = document.getElementById('packing-new-item');
      const label = input.value.trim();
      if (!label) return;
      this.state.packingList.push({ label, packed: false });
      input.value = '';
      this.renderPackingList();
      this.persistTrip();
    };
    document.getElementById('packing-add-btn').addEventListener('click', addPackingItem);
    document.getElementById('packing-new-item').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPackingItem();
      }
    });

    document.getElementById('trip-notes').addEventListener('input', (e) => {
      this.state.notes = e.target.value;
    });
    document.getElementById('save-notes-btn').addEventListener('click', () => {
      this.state.notes = document.getElementById('trip-notes').value;
      this.persistTrip(true);
    });

    document.getElementById('save-trip-btn').addEventListener('click', () => this.persistTrip(true));
    document.getElementById('export-trip-btn').addEventListener('click', () => this.exportItinerary());
    document.getElementById('print-trip-btn').addEventListener('click', () => window.print());

    document.getElementById('expense-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.addExpense();
    });
    document.getElementById('expense-list').addEventListener('click', (event) => {
      const deleteButton = event.target.closest('button[data-expense-id]');
      if (deleteButton) this.deleteExpense(deleteButton.dataset.expenseId);
    });

    document.getElementById('day-transport').addEventListener('change', (e) => {
      this.getCurrentDayDetails().transport = e.target.value;
      this.persistTrip();
    });
    document.getElementById('day-plan-notes').addEventListener('input', (e) => {
      this.getCurrentDayDetails().notes = e.target.value;
      this.persistTrip();
    });
  }

  restoreTrip() {
    try {
      const savedTrip = localStorage.getItem('wanderly-trip');
      if (!savedTrip) return false;

      const trip = JSON.parse(savedTrip);
      if (
        !trip ||
        !getHotelsByCity(trip.city).length ||
        !trip.itinerary ||
        typeof trip.itinerary !== 'object' ||
        Array.isArray(trip.itinerary) ||
        Object.keys(trip.itinerary).length === 0 ||
        !Number.isInteger(trip.numDays) ||
        trip.numDays < 1 ||
        trip.numDays > 5
      ) {
        throw new Error('Saved trip data is incomplete.');
      }

      this.state = {
        ...this.state,
        ...trip,
        currentDayTab: trip.itinerary[trip.currentDayTab] ? trip.currentDayTab : Object.keys(trip.itinerary)[0],
        packingList: Array.isArray(trip.packingList) ? trip.packingList : this.state.packingList,
        dayDetails: trip.dayDetails && typeof trip.dayDetails === 'object' ? trip.dayDetails : {},
        expenses: Array.isArray(trip.expenses) ? trip.expenses : []
      };
      document.getElementById('city-select').value = this.state.city;
      document.getElementById('traveler-select').value = this.state.travelerType;
      document.getElementById('tags-input').value = this.state.queryTags;
      document.getElementById('days-slider').value = this.state.numDays;
      document.getElementById('days-badge').textContent = `${this.state.numDays} days`;
      document.getElementById('trip-date').value = this.state.tripDate || '';
      document.getElementById('trip-budget').value = this.state.budget;
      document.querySelectorAll('.toggle-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.purpose === this.state.tripPurpose);
      });
      document.querySelectorAll('.mood-chip').forEach(chip => {
        chip.classList.toggle('selected', this.state.queryTags.toLowerCase().includes(chip.dataset.tag.toLowerCase()));
      });
      this.renderDayTabs();
      this.renderDayDetails();
      this.renderTimeline();
      return true;
    } catch (error) {
      console.error('Unable to restore the saved trip.', error);
      this.showToast('Saved trip could not be loaded. Start a new plan or save again.');
      return false;
    }
  }

  switchView(viewId) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active-view'));
    const activeSection = document.getElementById(`view-${viewId}`);
    if (activeSection) activeSection.classList.add('active-view');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh map sizing on view switch
    if (viewId === 'dashboard' && this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
        if (this.sentimentChart) this.sentimentChart.resize();
        if (this.ratingChart) this.ratingChart.resize();
      }, 300);
    }
  }

  handlePlanGetaway() {
    this.state.tripDate = document.getElementById('trip-date').value;
    this.state.budget = Math.max(0, Number(document.getElementById('trip-budget').value) || 0);
    this.showToast(`Building your ${this.state.city} itinerary...`);
    this.generateDefaultItinerary();
    this.renderTripTools();
    this.refreshTripOverview();
    this.persistTrip();
    this.switchView('dashboard');
  }

  generateDefaultItinerary() {
    this.state.dayDetails = {};
    this.state.itinerary = generateItinerary({
      city: this.state.city,
      travelerType: this.state.travelerType,
      tripPurpose: this.state.tripPurpose,
      queryTags: this.state.queryTags,
      numDays: this.state.numDays
    });

    // Default to Day 1 tab
    this.state.currentDayTab = 'Day 1';
    this.renderDayTabs();
    this.renderDayDetails();
    this.renderTimeline();
    this.updateDashboard();
  }

  renderDayTabs() {
    const tabsContainer = document.getElementById('day-tabs-container');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';
    const dayKeys = Object.keys(this.state.itinerary);

    dayKeys.forEach((dayKey, idx) => {
      const btn = document.createElement('button');
      btn.className = `day-tab ${dayKey === this.state.currentDayTab ? 'active' : ''}`;
      btn.textContent = `Day ${idx + 1}`;
      btn.addEventListener('click', () => {
        this.state.currentDayTab = dayKey;
        this.renderDayTabs();
        this.renderDayDetails();
        this.renderTimeline();
        this.updateDashboard();
      });
      tabsContainer.appendChild(btn);
    });
  }

  renderTimeline() {
    const timelineList = document.getElementById('timeline-list');
    if (!timelineList) return;

    timelineList.innerHTML = '';
    const currentStops = this.state.itinerary[this.state.currentDayTab] || [];

    if (currentStops.length === 0) {
      timelineList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No stops on this day yet. Add a place to start shaping your route.
        </div>
      `;
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add-stop';
      addBtn.textContent = `＋ Add a stop to ${this.state.currentDayTab}`;
      addBtn.addEventListener('click', () => this.openAddStopModal(this.state.currentDayTab));
      timelineList.appendChild(addBtn);
      return;
    }

    currentStops.forEach((stop, index) => {
      const card = document.createElement('div');
      card.className = 'stop-card';
      card.draggable = true;
      card.dataset.index = index;

      const tagCapsules = (stop.tags || []).slice(0, 3)
        .map(tag => `<span class="badge-capsule">${this.escapeHTML(tag)}</span>`).join('');
      const hasReview = Number.isFinite(stop.rating) && stop.rating > 0;
      const metadata = [
        stop.time ? `<span class="stop-time">${this.escapeHTML(stop.time)}</span>` : '',
        stop.duration ? `<span>${stop.duration} min</span>` : '',
        hasReview ? `<span class="stop-rating">★ ${stop.rating.toFixed(1)}</span>` : '',
        hasReview ? `<span class="stop-sentiment">${Math.round(stop.sentiment * 100)}% positive reviews</span>` : '',
        stop.address ? `<span>${this.escapeHTML(stop.address)}</span>` : ''
      ].filter(Boolean).join('');
      const stopNotes = stop.notes
        ? `<div class="stop-personal-note">${this.escapeHTML(stop.notes)}</div>`
        : '';
      const stopCompleteClass = stop.done ? ' stop-complete' : '';

      card.innerHTML = `
        <div class="stop-sequence-badge${stopCompleteClass}">${stop.done ? '✓' : (stop.sequence || (index + 1))}</div>
        <div class="stop-details">
          <div class="stop-title">
            <span class="${stop.done ? 'stop-name-complete' : ''}">${this.escapeHTML(stop.name)}</span>
            <div class="stop-actions">
              <label class="stop-done-toggle${stop.done ? ' checked' : ''}" title="${stop.done ? 'Mark as not done' : 'Mark as done'}">
                <input type="checkbox" data-stop-index="${index}" aria-label="${stop.done ? 'Mark' : 'Mark'} ${this.escapeHTML(stop.name)} ${stop.done ? 'not done' : 'done'}" ${stop.done ? 'checked' : ''}>
                <span>Done</span>
              </label>
              <button class="icon-btn" title="Move Up" onclick="WanderlyApp.moveStop('${this.state.currentDayTab}', ${index}, -1)">▲</button>
              <button class="icon-btn" title="Move Down" onclick="WanderlyApp.moveStop('${this.state.currentDayTab}', ${index}, 1)">▼</button>
              <button class="icon-btn" title="Edit Stop" onclick="WanderlyApp.openEditModal('${this.state.currentDayTab}', ${index})">✏️</button>
              <button class="icon-btn danger" title="Delete Stop" onclick="WanderlyApp.deleteStop('${this.state.currentDayTab}', ${index})">🗑️</button>
            </div>
          </div>
          <div class="stop-meta">
            ${metadata}
          </div>
          <div class="stop-tags-capsules">${tagCapsules}</div>
          ${stopNotes}
        </div>
      `;

      // HTML5 Drag and Drop Handlers
      card.addEventListener('dragstart', (e) => {
        this.draggedIndex = index;
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (this.draggedIndex !== null && this.draggedIndex !== index) {
          this.reorderStops(this.state.currentDayTab, this.draggedIndex, index);
          this.draggedIndex = null;
        }
      });

      timelineList.appendChild(card);
    });

    // Add Stop Button at the bottom
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-stop';
    addBtn.textContent = `＋ Add a stop to ${this.state.currentDayTab}`;
    addBtn.addEventListener('click', () => this.openAddStopModal(this.state.currentDayTab));
    timelineList.appendChild(addBtn);
  }

  moveStop(dayKey, index, direction) {
    const stops = this.state.itinerary[dayKey];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= stops.length) return;

    // Swap elements
    const temp = stops[index];
    stops[index] = stops[newIndex];
    stops[newIndex] = temp;

    // Update sequence numbers
    stops.forEach((s, idx) => s.sequence = idx + 1);

    this.renderTimeline();
    this.updateDashboard();
    this.refreshTripOverview();
    this.persistTrip();
    this.showToast('Route order updated.');
  }

  reorderStops(dayKey, fromIdx, toIdx) {
    const stops = this.state.itinerary[dayKey];
    const [moved] = stops.splice(fromIdx, 1);
    stops.splice(toIdx, 0, moved);

    stops.forEach((s, idx) => s.sequence = idx + 1);

    this.renderTimeline();
    this.updateDashboard();
    this.refreshTripOverview();
    this.persistTrip();
    this.showToast('Route order updated.');
  }

  deleteStop(dayKey, index) {
    const stops = this.state.itinerary[dayKey];
    const removed = stops.splice(index, 1)[0];

    stops.forEach((s, idx) => s.sequence = idx + 1);

    this.renderTimeline();
    this.updateDashboard();
    this.refreshTripOverview();
    this.persistTrip();
    this.showToast(`Removed ${removed ? removed.name : 'stop'} from your plan.`);
  }

  openEditModal(dayKey, index) {
    const stop = this.state.itinerary[dayKey][index];
    this.state.editingStop = { dayKey, index };

    document.getElementById('edit-stop-title').value = stop.name;
    document.getElementById('edit-stop-rating').value = stop.rating || '';
    document.getElementById('edit-stop-rating').required = !stop.custom;
    document.getElementById('edit-stop-tags').value = (stop.tags || []).join(', ');
    document.getElementById('edit-stop-time').value = stop.time || '';
    document.getElementById('edit-stop-duration').value = stop.duration || '';
    document.getElementById('edit-stop-notes').value = stop.notes || '';
    document.getElementById('edit-stop-rating').closest('.form-group').hidden = Boolean(stop.custom);
    document.getElementById('edit-stop-tags').closest('.form-group').hidden = Boolean(stop.custom);

    document.getElementById('modal-edit-stop').classList.add('active');
  }

  saveStopEdit() {
    if (!this.state.editingStop) return;
    const { dayKey, index } = this.state.editingStop;

    const newTitle = document.getElementById('edit-stop-title').value;
    const newRating = parseFloat(document.getElementById('edit-stop-rating').value);
    const newTagsStr = document.getElementById('edit-stop-tags').value;

    const stop = this.state.itinerary[dayKey][index];
    stop.name = newTitle;
    if (!stop.custom) {
      stop.rating = newRating;
      stop.tags = newTagsStr.split(',').map(t => t.trim()).filter(t => t);
    }
    stop.time = document.getElementById('edit-stop-time').value;
    stop.duration = Number(document.getElementById('edit-stop-duration').value) || 0;
    stop.notes = document.getElementById('edit-stop-notes').value.trim();

    document.getElementById('modal-edit-stop').classList.remove('active');
    this.renderTimeline();
    this.updateDashboard();
    this.refreshTripOverview();
    this.persistTrip();
    this.showToast('Stop details updated.');
  }

  addCustomStop() {
    const latitudeValue = document.getElementById('custom-stop-lat').value;
    const longitudeValue = document.getElementById('custom-stop-lng').value;
    const hasLatitude = latitudeValue !== '';
    const hasLongitude = longitudeValue !== '';
    if (hasLatitude !== hasLongitude) {
      this.showToast('Add both map coordinates, or leave both blank.');
      return;
    }

    const latitude = hasLatitude ? Number(latitudeValue) : null;
    const longitude = hasLongitude ? Number(longitudeValue) : null;
    if (
      hasLatitude &&
      (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    ) {
      this.showToast('Check the latitude and longitude and try again.');
      return;
    }

    const dayKey = this.state.addingToDay;
    const stops = this.state.itinerary[dayKey];
    if (!stops) {
      this.showToast('Select a trip day before adding a stop.');
      return;
    }

    const title = document.getElementById('custom-stop-title').value.trim();
    if (!title) return;
    const type = document.getElementById('custom-stop-type').value;
    const address = document.getElementById('custom-stop-address').value.trim();
    const notes = document.getElementById('custom-stop-notes').value.trim();
    const time = document.getElementById('custom-stop-time').value;
    const duration = Number(document.getElementById('custom-stop-duration').value) || 0;
    stops.push({
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: title,
      city: this.state.city,
      address,
      lat: latitude,
      lng: longitude,
      rating: 0,
      sentiment: 0,
      tags: [type],
      type,
      custom: true,
      time,
      duration,
      notes,
      sequence: stops.length + 1
    });

    document.getElementById('modal-custom-stop').classList.remove('active');
    this.renderTimeline();
    this.updateDashboard();
    this.persistTrip();
    this.showToast(`Added ${title} to ${dayKey}.`);
  }

  getCurrentDayDetails() {
    if (!this.state.dayDetails[this.state.currentDayTab]) {
      this.state.dayDetails[this.state.currentDayTab] = { transport: '', notes: '' };
    }
    return this.state.dayDetails[this.state.currentDayTab];
  }

  renderDayDetails() {
    const details = this.getCurrentDayDetails();
    document.getElementById('day-details-title').textContent = `${this.state.currentDayTab} details`;
    document.getElementById('day-transport').value = details.transport || '';
    document.getElementById('day-plan-notes').value = details.notes || '';
  }

  openAddStopModal(dayKey) {
    this.state.addingToDay = dayKey;
    document.getElementById('add-modal-day-title').innerText = `Add a stop to ${dayKey}`;
    document.getElementById('add-stop-search').value = '';
    this.renderAddStopResults('');
    document.getElementById('modal-add-stop').classList.add('active');
  }

  renderAddStopResults(query) {
    const container = document.getElementById('add-stop-results');
    if (!container) return;

    const cityHotels = getHotelsByCity(this.state.city);
    const currentDayStops = this.state.itinerary[this.state.addingToDay] || [];
    const currentIds = currentDayStops.map(s => s.id);

    const available = cityHotels.filter(h => !currentIds.includes(h.id));
    const filtered = available.filter(h => 
      h.name.toLowerCase().includes(query.toLowerCase()) ||
      h.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );

    container.innerHTML = '';
    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--text-muted);">No matching stays found in the sample data.</div>`;
      return;
    }

    filtered.forEach(h => {
      const item = document.createElement('div');
      item.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.75rem 1rem; border: 1px solid var(--border-color);
        border-radius: var(--radius-md); margin-bottom: 0.5rem; background: var(--bg-card-subtle);
      `;
      item.innerHTML = `
        <div>
          <div style="font-weight:700;">${h.name}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">★ ${h.rating} · ${Math.round(h.sentiment*100)}% positive guest sentiment</div>
        </div>
        <button class="btn-secondary" style="padding:0.4rem 0.85rem; font-size:0.82rem;" onclick="WanderlyApp.appendStopToDay('${h.id}')">➕ Add</button>
      `;
      container.appendChild(item);
    });
  }

  appendStopToDay(hotelId) {
    const hotel = HOTELS_DATASET.find(h => h.id === hotelId);
    if (!hotel) return;

    const dayKey = this.state.addingToDay;
    const stops = this.state.itinerary[dayKey];
    
    stops.push({
      ...hotel,
      sequence: stops.length + 1
    });

    document.getElementById('modal-add-stop').classList.remove('active');
    this.renderTimeline();
    this.updateDashboard();
    this.refreshTripOverview();
    this.persistTrip();
    this.showToast(`Added ${hotel.name} to ${dayKey}.`);
  }

  /* LEAFLET MAP VISUALIZER */
  initMap() {
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl) return;

    // Centered default on London
    this.map = L.map('leaflet-map', {
      zoomControl: true,
      scrollWheelZoom: false
    }).setView([51.505, -0.09], 12);

    // CartoDB Positron Pastel tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(this.map);
  }

  updateMap() {
    if (!this.map) return;

    // Clear existing markers and paths
    this.mapMarkers.forEach(m => this.map.removeLayer(m));
    this.mapPolylines.forEach(p => this.map.removeLayer(p));
    this.mapMarkers = [];
    this.mapPolylines = [];

    const currentStops = (this.state.itinerary[this.state.currentDayTab] || [])
      .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
    if (currentStops.length === 0) {
      const cityCenter = getHotelsByCity(this.state.city)[0];
      if (cityCenter) this.map.setView([cityCenter.lat, cityCenter.lng], 12);
      return;
    }

    const activeColor = '#256355';

    const latLngs = [];

    currentStops.forEach((stop, idx) => {
      latLngs.push([stop.lat, stop.lng]);

      // Custom Cute Icon
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
          background: ${activeColor};
          color: #ffffff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-family: 'Poppins', sans-serif;
          box-shadow: 0 4px 10px rgba(0,0,0,0.15);
          border: 2px solid #ffffff;
        ">${stop.sequence || (idx + 1)}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const popupDetails = stop.custom
        ? `<div style="font-size:0.8rem; color:#666;">${this.escapeHTML(stop.type || 'Custom stop')}</div>`
        : `<div style="font-size:0.8rem; color:#666;">★ Rating: ${stop.rating} | ${Math.round(stop.sentiment * 100)}% positive reviews</div>`;
      const marker = L.marker([stop.lat, stop.lng], { icon: customIcon })
        .addTo(this.map)
        .bindPopup(`
          <div style="font-size:0.9rem; font-weight:700;">${this.escapeHTML(stop.name)}</div>
          ${popupDetails}
          <div style="font-size:0.75rem; color:#888;">${this.escapeHTML(stop.address || '')}</div>
        `);

      this.mapMarkers.push(marker);
    });

    // Draw Dashed Polyline Path connecting stops
    if (latLngs.length > 1) {
      const polyline = L.polyline(latLngs, {
        color: activeColor,
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.8
      }).addTo(this.map);

      this.mapPolylines.push(polyline);
      this.map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    } else if (latLngs.length === 1) {
      this.map.setView(latLngs[0], 13);
    }
  }

  /* TWIN SIDE-BY-SIDE CHART.JS METRICS */
  initCharts() {
    const ctxSentiment = document.getElementById('chart-sentiment');
    const ctxRating = document.getElementById('chart-rating');

    if (!ctxSentiment || !ctxRating) return;

    // Chart 1: VADER Sentiment Bar Chart
    this.sentimentChart = new Chart(ctxSentiment, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'VADER Sentiment Index (%)',
          data: [],
          backgroundColor: '#568477',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { font: { family: 'Quicksand' } } },
          x: { ticks: { font: { family: 'Quicksand', size: 10 } } }
        }
      }
    });

    // Chart 2: Average Reviewer Score Bar Chart
    this.ratingChart = new Chart(ctxRating, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Average Reviewer Score (1-10)',
          data: [],
          backgroundColor: '#A7C1B5',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 10, ticks: { font: { family: 'Quicksand' } } },
          x: { ticks: { font: { family: 'Quicksand', size: 10 } } }
        }
      }
    });
  }

  updateCharts() {
    if (!this.sentimentChart || !this.ratingChart) return;

    const currentStops = (this.state.itinerary[this.state.currentDayTab] || [])
      .filter(stop => Number.isFinite(stop.rating) && stop.rating > 0);
    const labels = currentStops.map(s => s.name.length > 14 ? s.name.substring(0, 12) + '...' : s.name);
    const sentiments = currentStops.map(s => Math.round(s.sentiment * 100));
    const ratings = currentStops.map(s => s.rating);

    // Update Chart 1
    this.sentimentChart.data.labels = labels;
    this.sentimentChart.data.datasets[0].data = sentiments;
    this.sentimentChart.update();

    // Update Chart 2
    this.ratingChart.data.labels = labels;
    this.ratingChart.data.datasets[0].data = ratings;
    this.ratingChart.update();
  }

  updateDashboard() {
    this.updateMap();
    this.updateCharts();
    this.refreshTripOverview();
  }

  renderTripTools() {
    document.getElementById('budget-total').value = this.state.budget;
    document.getElementById('budget-spent').value = this.state.spent;
    document.getElementById('trip-notes').value = this.state.notes;
    this.renderPackingList();
    this.renderExpenses();
    this.updateBudget();
  }

  addExpense() {
    const description = document.getElementById('expense-description').value.trim();
    const amount = Number(document.getElementById('expense-amount').value);
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      this.showToast('Enter an expense description and an amount above zero.');
      return;
    }

    this.state.expenses.push({
      id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      amount,
      category: document.getElementById('expense-category').value,
      date: new Date().toISOString().slice(0, 10)
    });
    document.getElementById('expense-form').reset();
    this.renderExpenses();
    this.updateBudget();
    this.persistTrip();
    this.showToast('Expense added to your trip budget.');
  }

  deleteExpense(expenseId) {
    const expenseIndex = this.state.expenses.findIndex(expense => expense.id === expenseId);
    if (expenseIndex === -1) return;
    this.state.expenses.splice(expenseIndex, 1);
    this.renderExpenses();
    this.updateBudget();
    this.persistTrip();
    this.showToast('Expense removed from your trip budget.');
  }

  renderExpenses() {
    const container = document.getElementById('expense-list');
    container.innerHTML = '';
    this.state.expenses.forEach(expense => {
      const item = document.createElement('div');
      item.className = 'expense-item';
      const details = document.createElement('div');
      details.className = 'expense-item-details';
      const description = document.createElement('strong');
      description.textContent = expense.description;
      const metadata = document.createElement('span');
      metadata.textContent = `${expense.category} · ${expense.date}`;
      details.append(description, metadata);
      const amount = document.createElement('strong');
      amount.className = 'expense-amount';
      amount.textContent = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'EUR'
      }).format(expense.amount);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'expense-remove-btn';
      remove.dataset.expenseId = expense.id;
      remove.setAttribute('aria-label', `Remove ${expense.description}`);
      remove.textContent = '×';
      item.append(details, amount, remove);
      container.appendChild(item);
    });

    const total = this.state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    document.getElementById('expense-summary').textContent = this.state.expenses.length
      ? `${this.state.expenses.length} ${this.state.expenses.length === 1 ? 'expense' : 'expenses'} · ${new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(total)} logged`
      : 'No expenses logged yet';
  }

  renderPackingList() {
    const container = document.getElementById('packing-list');
    container.innerHTML = '';
    this.state.packingList.forEach((item, index) => {
      const label = document.createElement('label');
      label.className = `packing-item${item.packed ? ' packed' : ''}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.packed;
      checkbox.dataset.packingIndex = index;
      const text = document.createElement('span');
      text.textContent = item.label;
      label.append(checkbox, text);
      container.appendChild(label);
    });

    const packedCount = this.state.packingList.filter(item => item.packed).length;
    document.getElementById('packing-summary').textContent =
      `${packedCount} of ${this.state.packingList.length} items packed`;
  }

  updateBudget() {
    const budget = Math.max(0, Number(this.state.budget) || 0);
    const otherSpend = Math.max(0, Number(this.state.spent) || 0);
    const expenseTotal = this.state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const spent = otherSpend + expenseTotal;
    const remaining = budget - spent;
    const formatCurrency = amount => new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);

    document.getElementById('budget-total').value = budget;
    document.getElementById('budget-spent').value = otherSpend;
    document.getElementById('budget-progress').style.width =
      `${budget > 0 ? Math.min(100, (spent / budget) * 100) : (spent > 0 ? 100 : 0)}%`;
    document.getElementById('budget-summary').textContent = remaining >= 0
      ? `${formatCurrency(remaining)} left to spend`
      : `${formatCurrency(Math.abs(remaining))} over budget`;
    document.getElementById('stat-budget').textContent = formatCurrency(remaining);
  }

  escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  refreshTripOverview() {
    const allStops = Object.values(this.state.itinerary).flat();
    let routeDistance = 0;
    Object.values(this.state.itinerary).forEach(stops => {
      const mappableStops = stops.filter(stop =>
        Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
      );
      for (let index = 1; index < mappableStops.length; index += 1) {
        routeDistance += calculateDistanceKm(
          mappableStops[index - 1].lat,
          mappableStops[index - 1].lng,
          mappableStops[index].lat,
          mappableStops[index].lng
        );
      }
    });

    document.getElementById('trip-overview-title').textContent = `${this.state.city} trip`;
    const dateText = this.state.tripDate
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${this.state.tripDate}T12:00:00`))
      : 'Dates not set';
    document.getElementById('trip-overview-subtitle').textContent =
      `${dateText} · ${this.state.numDays} ${this.state.numDays === 1 ? 'day' : 'days'} · ${this.state.travelerType}`;
    document.getElementById('stat-days').textContent = this.state.numDays;
    document.getElementById('stat-stops').textContent = allStops.length;
    document.getElementById('stat-distance').textContent = `${Math.round(routeDistance)} km`;
    const completedStops = allStops.filter(stop => stop.done).length;
    document.getElementById('trip-progress-label').textContent =
      `${completedStops} of ${allStops.length} ${allStops.length === 1 ? 'stop' : 'stops'} done`;
    document.getElementById('trip-progress-bar').style.width =
      `${allStops.length ? (completedStops / allStops.length) * 100 : 0}%`;
    this.updateBudget();
  }

  persistTrip(showConfirmation = false) {
    const trip = {
      city: this.state.city,
      travelerType: this.state.travelerType,
      tripPurpose: this.state.tripPurpose,
      queryTags: this.state.queryTags,
      numDays: this.state.numDays,
      currentDayTab: this.state.currentDayTab,
      itinerary: this.state.itinerary,
      expenses: this.state.expenses,
      dayDetails: this.state.dayDetails,
      tripDate: this.state.tripDate,
      budget: this.state.budget,
      spent: this.state.spent,
      notes: this.state.notes,
      packingList: this.state.packingList
    };

    try {
      localStorage.setItem('wanderly-trip', JSON.stringify(trip));
      if (showConfirmation) this.showToast('Trip saved on this device.');
    } catch (error) {
      console.error('Unable to save the trip.', error);
      this.showToast('Could not save your trip on this device.');
    }
  }

  exportItinerary() {
    const rows = [['Day', 'Day transport', 'Day notes', 'Time', 'Stop', 'Type', 'Duration (minutes)', 'Address', 'Rating', 'Tags', 'Notes', 'Done']];
    Object.entries(this.state.itinerary).forEach(([day, stops]) => {
      const dayDetails = this.state.dayDetails[day] || {};
      if (stops.length === 0) {
        rows.push([day, dayDetails.transport || '', dayDetails.notes || '', '', '', '', '', '', '', '', '']);
      } else {
        stops.forEach(stop => rows.push([
          day,
          dayDetails.transport || '',
          dayDetails.notes || '',
          stop.time || '',
          stop.name,
          stop.type || 'Stay',
          stop.duration || '',
          stop.address || stop.city,
          stop.rating || '',
          (stop.tags || []).join(', '),
          stop.notes || '',
          stop.done ? 'Yes' : 'No'
        ]));
      }
    });
    rows.push([], ['EXPENSES'], ['Description', 'Category', 'Date', 'Amount (EUR)']);
    this.state.expenses.forEach(expense => {
      rows.push([expense.description, expense.category, expense.date, expense.amount]);
    });

    let url;
    try {
      const csv = rows.map(row => row.map(value =>
        `"${String(value).replace(/"/g, '""')}"`
      ).join(',')).join('\r\n');
      const file = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.state.city.toLowerCase()}-itinerary.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showToast('Itinerary CSV download started.');
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      console.error('Unable to export the itinerary.', error);
      this.showToast('Could not export the itinerary.');
    }
  }

  triggerChatbotAction(actionType) {
    const dayKey = this.state.currentDayTab;
    const stops = this.state.itinerary[dayKey] || [];
    const keywords = {
      breakfast: ['breakfast'],
      quiet: ['quiet'],
      boutique: ['boutique']
    }[actionType];
    if (!keywords || stops.length === 0) return 0;

    const matchingStops = stops.filter(stop =>
      stop.tags.some(tag => keywords.some(keyword => tag.toLowerCase().includes(keyword)))
    );
    if (matchingStops.length === 0) return 0;

    const nonMatchingStops = stops.filter(stop => !matchingStops.includes(stop));
    this.state.itinerary[dayKey] = [...matchingStops, ...nonMatchingStops]
      .map((stop, index) => ({ ...stop, sequence: index + 1 }));
    this.renderTimeline();
    this.updateDashboard();
    this.persistTrip();
    return matchingStops.length;
  }

  getAssistantTripSummary() {
    const stops = this.state.itinerary[this.state.currentDayTab] || [];
    const details = this.state.dayDetails[this.state.currentDayTab] || {};
    const expenseTotal = this.state.expenses.reduce((total, expense) => total + expense.amount, 0);
    const otherSpend = Math.max(0, Number(this.state.spent) || 0);
    const spent = expenseTotal + otherSpend;
    return {
      city: this.state.city,
      day: this.state.currentDayTab,
      date: this.state.tripDate,
      stops,
      transport: details.transport || '',
      notes: details.notes || '',
      budget: this.state.budget,
      spent,
      remaining: this.state.budget - spent,
      expenseCount: this.state.expenses.length,
      packed: this.state.packingList.filter(item => item.packed).length,
      packingTotal: this.state.packingList.length
    };
  }

  findAssistantStaySuggestions(query = '') {
    const existingIds = new Set(
      Object.values(this.state.itinerary).flat().map(stop => stop.id)
    );
    const cityHotels = getHotelsByCity(this.state.city).filter(hotel => !existingIds.has(hotel.id));
    const cleanedQuery = query
      .toLowerCase()
      .replace(/\b(recommend|suggest|find|show|me|a|an|some|stay|stays|hotel|hotels|place|places|option|options|please|for|my|trip|in|the|best|good)\b/g, ' ')
      .replace(/[^\w\s-]/g, ' ')
      .trim();

    return cityHotels
      .map(hotel => ({
        ...hotel,
        assistantScore: scoreHotel(hotel, this.state.travelerType, this.state.tripPurpose, cleanedQuery)
      }))
      .sort((first, second) => second.assistantScore - first.assistantScore)
      .slice(0, 3);
  }

  addAssistantStay(hotelId) {
    const hotel = HOTELS_DATASET.find(item => item.id === hotelId && item.city === this.state.city);
    if (!hotel) return false;
    const dayKey = this.state.currentDayTab;
    const stops = this.state.itinerary[dayKey];
    if (!stops || stops.some(stop => stop.id === hotel.id)) return false;

    stops.push({ ...hotel, sequence: stops.length + 1 });
    this.switchView('dashboard');
    this.renderTimeline();
    this.updateDashboard();
    this.persistTrip();
    this.showToast(`Added ${hotel.name} to ${dayKey}.`);
    return true;
  }

  recordAssistantExpense(description, amount) {
    const categoryRules = [
      ['Transport', /\b(train|metro|bus|taxi|cab|tram|flight|transport|ticket)\b/i],
      ['Food', /\b(food|lunch|dinner|breakfast|coffee|restaurant|meal|snack)\b/i],
      ['Stay', /\b(hotel|hostel|stay|room|accommodation)\b/i],
      ['Activity', /\b(ticket|museum|tour|activity|entry|show)\b/i],
      ['Shopping', /\b(shop|shopping|souvenir|gift)\b/i]
    ];
    const category = categoryRules.find(([, pattern]) => pattern.test(description))?.[0] || 'Other';
    this.state.expenses.push({
      id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      amount,
      category,
      date: new Date().toISOString().slice(0, 10)
    });
    this.renderExpenses();
    this.updateBudget();
    this.persistTrip();
    return category;
  }

  markAssistantStopDone(placeQuery) {
    const stops = this.state.itinerary[this.state.currentDayTab] || [];
    const query = placeQuery.toLowerCase().trim();
    const stop = query
      ? stops.find(item => item.name.toLowerCase().includes(query))
      : stops.find(item => !item.done);
    if (!stop || stop.done) return null;

    stop.done = true;
    this.renderTimeline();
    this.refreshTripOverview();
    this.persistTrip();
    return stop.name;
  }

  openAssistantCustomStop(title = '') {
    this.state.addingToDay = this.state.currentDayTab;
    document.getElementById('custom-stop-form').reset();
    document.getElementById('modal-custom-stop').classList.add('active');
    if (title) document.getElementById('custom-stop-title').value = title;
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  new Application();
  new WanderlyChatbot();
});
