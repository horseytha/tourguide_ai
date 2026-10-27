/* ==========================================================================
   WANDERLY - INTEGRATED AI TOURIST ASSISTANT ("WANDERLY CLOUD")
   ========================================================================== */

class WanderlyChatbot {
  constructor() {
    this.messages = [];
    this.isOpen = false;
    this.init();
  }

  init() {
    // Elements
    this.drawer = document.getElementById('chatbot-drawer');
    this.triggerBtn = document.getElementById('floating-mascot-trigger');
    this.closeBtn = document.getElementById('chat-close-btn');
    this.messagesContainer = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send-btn');
    this.promptPills = document.querySelectorAll('.prompt-pill');

    if (!this.drawer) return;

    // Event Listeners
    this.triggerBtn.addEventListener('click', () => this.toggleDrawer());
    this.triggerBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggleDrawer();
      }
    });
    this.closeBtn.addEventListener('click', () => this.closeDrawer());
    
    this.sendBtn.addEventListener('click', () => this.handleSendMessage());
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSendMessage();
    });

    this.promptPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const text = pill.dataset.prompt || pill.innerText;
        this.chatInput.value = text;
        this.handleSendMessage();
      });
    });

    // Add initial preloaded welcome message
    this.addBotMessage(
      'Hey! I can summarize your day, check your budget or packing progress, find stays from this city’s sample list, and reorder your plan. What do you need?',
      [
        { label: 'Summarize my day', prompt: 'Summarize my day' },
          { label: 'Suggest a stay', prompt: 'Suggest a stay' },
          { label: 'Log an expense', prompt: 'How do I log an expense?' }
      ]
    );

    this.messagesContainer.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-assistant-action]');
      if (actionButton) this.handleAssistantAction(actionButton.dataset.assistantAction);
      const promptButton = event.target.closest('[data-assistant-prompt]');
      if (promptButton) {
        this.chatInput.value = promptButton.dataset.assistantPrompt;
        this.handleSendMessage();
      }
    });
  }

  toggleDrawer() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.drawer.classList.add('open');
      this.chatInput.focus();
    } else {
      this.drawer.classList.remove('open');
    }
  }

  closeDrawer() {
    this.isOpen = false;
    this.drawer.classList.remove('open');
  }

  addUserMessage(text) {
    this.messages.push({ sender: 'user', text });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    bubble.textContent = text;
    this.messagesContainer.appendChild(bubble);
    this.scrollToBottom();
  }

  addBotMessage(text, actions = []) {
    this.messages.push({ sender: 'bot', text });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bot';
    bubble.textContent = text;
    this.messagesContainer.appendChild(bubble);
    if (actions.length) {
      const actionBar = document.createElement('div');
      actionBar.className = 'assistant-actions';
      actions.forEach(action => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'assistant-action-btn';
        button.textContent = action.label;
        if (action.id) button.dataset.assistantAction = action.id;
        if (action.prompt) button.dataset.assistantPrompt = action.prompt;
        actionBar.appendChild(button);
      });
      this.messagesContainer.appendChild(actionBar);
    }
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  handleSendMessage() {
    const query = this.chatInput.value.trim();
    if (!query) return;

    this.addUserMessage(query);
    this.chatInput.value = '';

    setTimeout(() => {
      this.processAIResponse(query);
    }, 600);
  }

  processAIResponse(userText) {
    const textLower = userText.toLowerCase();
    const app = window.WanderlyApp;
    if (!app) {
      this.addBotMessage('The trip planner is not ready yet. Please try that again in a moment.');
      return;
    }

    if (textLower.includes('rain') || textLower.includes('weather')) {
      this.addBotMessage(
        'I can’t check live forecasts or identify indoor attractions from this sample dataset. Consider checking the forecast before you go and adding indoor options to your notes.'
      );
    } else if (/\b(mark|check off|complete|completed|visited|done)\b/.test(textLower)) {
      const placeQuery = textLower
        .replace(/\b(mark|check|off|as|complete|completed|visited|done|stop|stops|my|the|next|first)\b/g, ' ')
        .trim();
      const completedStop = app.markAssistantStopDone(placeQuery);
      this.addBotMessage(completedStop
        ? `Marked ${completedStop} as done. Your trip progress is updated.`
        : 'I couldn’t find an unfinished stop by that name on the selected day. Try “mark my next stop done.”');
    } else if (/^(?:i\s+)?(?:log|add|record|spent|spend)\s+(?:an?\s+)?(?:expense\s+)?(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur)?(?:\s+(?:on|for)\s+|\s+)(.+)$/i.test(userText)) {
      const expenseMatch = userText.match(/^(?:i\s+)?(?:log|add|record|spent|spend)\s+(?:an?\s+)?(?:expense\s+)?(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur)?(?:\s+(?:on|for)\s+|\s+)(.+)$/i);
      const amount = Number(expenseMatch[1].replace(',', '.'));
      const description = expenseMatch[2].trim();
      if (!Number.isFinite(amount) || amount <= 0 || !description) {
        this.addBotMessage('Tell me the amount and what it was for, like “log 12.50 for lunch.”');
        return;
      }
      const category = app.recordAssistantExpense(description, amount);
      this.addBotMessage(`Logged €${amount.toFixed(2)} for ${description} under ${category}. Your budget is updated.`);
    } else if (textLower.includes('how do i log') || textLower.includes('log an expense')) {
      this.addBotMessage('Type an amount and what it was for—for example, “log 12.50 for lunch” or “I spent 20 on train tickets.” I’ll categorize it and update your budget.');
    } else if (textLower.includes('budget') || textLower.includes('spend') || textLower.includes('expense')) {
      const trip = app.getAssistantTripSummary();
      const money = amount => new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2
      }).format(Math.abs(amount));
      const status = trip.remaining >= 0
        ? `${money(trip.remaining)} left`
        : `${money(trip.remaining)} over budget`;
      this.addBotMessage(
        `Your budget is ${money(trip.budget)}. You’ve logged ${money(trip.spent)} so far (${trip.expenseCount} itemized ${trip.expenseCount === 1 ? 'expense' : 'expenses'}). That leaves ${status}.`
      );
    } else if (textLower.includes('pack') || textLower.includes('luggage')) {
      const trip = app.getAssistantTripSummary();
      const remaining = app.state.packingList.filter(item => !item.packed).map(item => item.label);
      this.addBotMessage(
        remaining.length
          ? `You’ve packed ${trip.packed} of ${trip.packingTotal} items. Still to pack: ${remaining.join(', ')}.`
          : `All ${trip.packingTotal} packing-list items are checked off. Nice!`
      );
    } else if (
      textLower.includes('summar') ||
      textLower.includes('what am i doing') ||
      textLower.includes('what is on') ||
      textLower.includes('my day') ||
      textLower.includes('my plan') ||
      textLower.includes('itinerary')
    ) {
      const trip = app.getAssistantTripSummary();
      const stopList = trip.stops.length
        ? trip.stops.map(stop => `${stop.done ? '✓ ' : ''}${stop.time ? `${stop.time} ` : ''}${stop.name}`).join(' · ')
        : 'No stops planned yet';
      const details = [
        trip.transport ? `Getting around: ${trip.transport}.` : '',
        trip.notes ? `Day note: ${trip.notes}.` : ''
      ].filter(Boolean).join(' ');
      this.addBotMessage(`${trip.city} · ${trip.day}: ${stopList}.${details ? ` ${details}` : ''}`);
    } else if (
      textLower.includes('suggest') ||
      textLower.includes('recommend') ||
      textLower.includes('where should') ||
      textLower.includes('hotel') ||
      textLower.includes('stay') ||
      textLower.includes('find')
    ) {
      const suggestions = app.findAssistantStaySuggestions(userText);
      if (!suggestions.length) {
        this.addBotMessage(`I couldn’t find another stay in the ${app.state.city} sample list. You can add a custom activity or place instead.`, [
          { label: 'Add a custom stop', id: 'custom-stop' }
        ]);
        return;
      }
      const description = suggestions.map((stay, index) =>
        `${index + 1}. ${stay.name} · ★ ${stay.rating} · ${stay.priceTier}`
      ).join('\n');
      this.addBotMessage(`Here are a few ${app.state.city} stays that fit your trip preferences:\n${description}`, [
        ...suggestions.map(stay => ({ label: `Add ${stay.name}`, id: `add-stay:${stay.id}` })),
        { label: 'Add my own place', id: 'custom-stop' }
      ]);
    } else if (textLower.includes('breakfast') || textLower.includes('food') || textLower.includes('cookie')) {
      const matches = app.triggerChatbotAction('breakfast') || 0;
      this.addBotMessage(matches
        ? `Moved ${matches} breakfast-friendly ${matches === 1 ? 'stay' : 'stays'} to the top of today’s plan.`
        : 'No breakfast-tagged stays are in today’s plan yet. Try adding a stay with breakfast in its tags.');
    } else if (textLower.includes('crowd') || textLower.includes('quiet') || textLower.includes('less crowded')) {
      const matches = app.triggerChatbotAction('quiet') || 0;
      this.addBotMessage(matches
        ? `Brought ${matches} quieter ${matches === 1 ? 'stay' : 'stays'} to the top of today’s plan.`
        : 'No quiet-tagged stays are in today’s plan yet. Search for a quiet stay and add it to this day.');
    } else if (textLower.includes('boutique') || textLower.includes('premium')) {
      const matches = app.triggerChatbotAction('boutique') || 0;
      this.addBotMessage(matches
        ? `Brought ${matches} boutique ${matches === 1 ? 'stay' : 'stays'} to the top of today’s plan.`
        : 'No boutique stays are in today’s plan yet. Search for a boutique stay and add it to this day.');
    } else {
      this.addBotMessage(
        'I can summarize your day, check your budget or packing progress, suggest stays, or reorder today’s stays by breakfast, quiet, or boutique tags. I can’t access live weather, opening hours, or transport updates.'
      );
    }
  }

  handleAssistantAction(action) {
    const app = window.WanderlyApp;
    if (!app) return;
    if (action === 'custom-stop') {
      app.openAssistantCustomStop();
      return;
    }
    if (action.startsWith('add-stay:')) {
      const stayId = action.slice('add-stay:'.length);
      this.addBotMessage(app.addAssistantStay(stayId)
        ? 'Added to your current day. I’ve updated the map and saved the trip.'
        : 'That stay is already on this day, or it is not available in the selected city.');
    }
  }
}
