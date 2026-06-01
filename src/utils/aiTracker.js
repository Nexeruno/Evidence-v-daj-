import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

class AITracker {
  constructor() {
    this.uid = null;
    this.sessionStartTime = null;
    this.currentTab = null;
    this.tabStartTime = null;
    this.tabDurations = { dashboard: 0, vydaje: 0, prijmy: 0 };
    this.events = [];
    this.isActive = false;
    this.formStartTime = null;
    this.formType = null;
    this.clickCount = 0;
    this.charCount = 0;
    this.flushInterval = null;
    this.statsTracker = {
      vydajeCount: 0,
      prijmyCount: 0,
      bookmarkSaveCount: 0,
      bookmarkLoadCount: 0,
    };
  }

  // Initialize with optional UID (works even without login)
  init(uid = null) {
    this.uid = uid || 'anonymous_' + Date.now();
    this.sessionStartTime = Date.now();
    this.isActive = true;
    this.tabDurations = { dashboard: 0, vydaje: 0, prijmy: 0 };
    this.events = [];
    this.clickCount = 0;
    this.charCount = 0;

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flushSync());

    // Auto-flush every 5 minutes
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushInterval = setInterval(() => this.flush(), 5 * 60 * 1000);

    // Track all clicks globally
    document.addEventListener('click', (e) => this.trackGlobalClick(e));

    // Track all text input
    document.addEventListener('input', (e) => this.trackTextInput(e));
  }

  trackTabChange(newTab, oldTab) {
    if (!this.isActive || !this.uid) return;

    const now = Date.now();

    // Finalize previous tab duration
    if (this.tabStartTime && this.currentTab) {
      this.tabDurations[this.currentTab] += now - this.tabStartTime;
    }

    this.currentTab = newTab;
    this.tabStartTime = now;

    this.events.push({
      type: 'navigate',
      timestamp: new Date(now),
      fromTab: oldTab,
      toTab: newTab,
    });
  }

  trackFormStart(formType) {
    if (!this.isActive || !this.uid) return;

    this.formType = formType;
    this.formStartTime = Date.now();

    this.events.push({
      type: 'form_start',
      timestamp: new Date(),
      formType,
    });
  }

  trackFormSubmit(formType) {
    if (!this.isActive || !this.uid) return;

    const now = Date.now();
    const duration = this.formStartTime ? now - this.formStartTime : 0;

    this.events.push({
      type: 'form_submit',
      timestamp: new Date(now),
      formType,
      durationMs: duration,
    });

    // Track transaction
    if (formType === 'vydaj') {
      this.statsTracker.vydajeCount++;
    } else if (formType === 'prijem') {
      this.statsTracker.prijmyCount++;
    }

    this.formStartTime = null;
    this.formType = null;
  }

  trackClick(elementType, tab) {
    if (!this.isActive || !this.uid) return;

    this.clickCount++;
    this.events.push({
      type: 'click',
      timestamp: new Date(),
      elementType,
      tab,
    });
  }

  trackGlobalClick(event) {
    if (!this.isActive || !this.uid) return;

    const target = event.target;
    const elementType = target.tagName.toLowerCase();

    this.clickCount++;
  }

  trackTextInput(event) {
    if (!this.isActive || !this.uid) return;

    const target = event.target;
    if (target.type === 'text' || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const value = target.value || '';
      this.charCount += value.length;
    }
  }

  trackBookmarkSave() {
    if (!this.isActive || !this.uid) return;

    this.statsTracker.bookmarkSaveCount++;
    this.events.push({
      type: 'bookmark_save',
      timestamp: new Date(),
    });
  }

  trackBookmarkLoad() {
    if (!this.isActive || !this.uid) return;

    this.statsTracker.bookmarkLoadCount++;
    this.events.push({
      type: 'bookmark_load',
      timestamp: new Date(),
    });
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.isActive = false;
    } else {
      this.isActive = true;
    }
  }

  flushSync() {
    if (!this.uid) return;

    // Finalize last tab duration
    if (this.tabStartTime && this.currentTab) {
      this.tabDurations[this.currentTab] += Date.now() - this.tabStartTime;
    }

    const sessionDoc = {
      startTime: new Date(this.sessionStartTime),
      endTime: new Date(),
      durationMs: Date.now() - this.sessionStartTime,
      tabDurations: this.tabDurations,
      clickCount: this.clickCount,
      charCount: this.charCount,
      stats: this.statsTracker,
      totalEvents: this.events.length,
      deviceInfo: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent.substring(0, 200),
      },
      createdAt: new Date(),
    };

    sessionStorage.setItem(
      `ai-session-${this.uid}-${Date.now()}`,
      JSON.stringify(sessionDoc)
    );
    if (this.events.length > 0) {
      sessionStorage.setItem(
        `ai-events-${this.uid}-${Date.now()}`,
        JSON.stringify(this.events)
      );
    }
  }

  async flush() {
    if (!this.uid) return;

    // Finalize last tab duration
    if (this.tabStartTime && this.currentTab) {
      this.tabDurations[this.currentTab] += Date.now() - this.tabStartTime;
    }

    if (this.events.length === 0 && this.clickCount === 0 && this.charCount === 0) {
      return;
    }

    try {
      const sessionRef = collection(db, `aiTelemetry/${this.uid}/sessions`);
      const eventsRef = collection(db, `aiTelemetry/${this.uid}/events`);

      const sessionDoc = {
        startTime: new Date(this.sessionStartTime),
        endTime: new Date(),
        durationMs: Date.now() - this.sessionStartTime,
        tabDurations: this.tabDurations,
        clickCount: this.clickCount,
        charCount: this.charCount,
        stats: this.statsTracker,
        totalEvents: this.events.length,
        deviceInfo: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          userAgent: navigator.userAgent.substring(0, 200),
        },
        createdAt: serverTimestamp(),
      };

      await addDoc(sessionRef, sessionDoc);

      if (this.events.length > 0) {
        for (const event of this.events) {
          await addDoc(eventsRef, {
            ...event,
            createdAt: serverTimestamp(),
          });
        }
      }

      this.reset();
    } catch (error) {
      console.error('AI Tracker flush error:', error);
      this.reset();
    }
  }

  reset() {
    this.sessionStartTime = Date.now();
    this.currentTab = null;
    this.tabStartTime = null;
    this.tabDurations = { dashboard: 0, vydaje: 0, prijmy: 0 };
    this.events = [];
    this.formStartTime = null;
    this.formType = null;
    this.clickCount = 0;
    this.charCount = 0;
    this.statsTracker = {
      vydajeCount: 0,
      prijmyCount: 0,
      bookmarkSaveCount: 0,
      bookmarkLoadCount: 0,
    };
  }

  setUid(uid) {
    this.uid = uid;
  }

  destroy() {
    if (this.flushInterval) clearInterval(this.flushInterval);
  }
}

export const aiTracker = new AITracker();
