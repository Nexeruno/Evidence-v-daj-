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
  }

  init(uid) {
    this.uid = uid;
    this.sessionStartTime = Date.now();
    this.isActive = true;
    this.tabDurations = { dashboard: 0, vydaje: 0, prijmy: 0 };
    this.events = [];

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flushSync());
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

    this.formStartTime = null;
    this.formType = null;
  }

  trackClick(elementType, tab) {
    if (!this.isActive || !this.uid) return;

    this.events.push({
      type: 'click',
      timestamp: new Date(),
      elementType,
      tab,
    });
  }

  handleVisibilityChange() {
    if (document.hidden) {
      // Page is hidden, track it but don't flush
      this.isActive = false;
    } else {
      // Page is visible again
      this.isActive = true;
    }
  }

  flushSync() {
    if (!this.uid) return;

    // Finalize last tab duration
    if (this.tabStartTime && this.currentTab) {
      this.tabDurations[this.currentTab] += Date.now() - this.tabStartTime;
    }

    // Build session doc (synchronously)
    const sessionDoc = {
      startTime: new Date(this.sessionStartTime),
      endTime: new Date(),
      durationMs: Date.now() - this.sessionStartTime,
      tabDurations: this.tabDurations,
      totalEvents: this.events.length,
      deviceInfo: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent.substring(0, 200),
      },
      createdAt: new Date(),
    };

    // Store in sessionStorage for immediate flush
    sessionStorage.setItem(
      `ai-session-${this.uid}-${Date.now()}`,
      JSON.stringify(sessionDoc)
    );
    sessionStorage.setItem(
      `ai-events-${this.uid}-${Date.now()}`,
      JSON.stringify(this.events)
    );
  }

  async flush() {
    if (!this.uid) return;

    // Finalize last tab duration
    if (this.tabStartTime && this.currentTab) {
      this.tabDurations[this.currentTab] += Date.now() - this.tabStartTime;
    }

    if (this.events.length === 0 && Object.values(this.tabDurations).every(d => d === 0)) {
      return; // Nothing to flush
    }

    try {
      const sessionId = `session_${Date.now()}`;
      const sessionRef = collection(db, `aiTelemetry/${this.uid}/sessions`);
      const eventsRef = collection(db, `aiTelemetry/${this.uid}/events`);

      // Session doc
      const sessionDoc = {
        startTime: new Date(this.sessionStartTime),
        endTime: new Date(),
        durationMs: Date.now() - this.sessionStartTime,
        tabDurations: this.tabDurations,
        totalEvents: this.events.length,
        deviceInfo: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          userAgent: navigator.userAgent.substring(0, 200),
        },
        createdAt: serverTimestamp(),
      };

      await addDoc(sessionRef, sessionDoc);

      // Write events (directly, not in batch since we're generating new docs)
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
      // Still reset even on error to avoid memory leaks
      this.reset();
    }
  }

  reset() {
    this.sessionStartTime = null;
    this.currentTab = null;
    this.tabStartTime = null;
    this.tabDurations = { dashboard: 0, vydaje: 0, prijmy: 0 };
    this.events = [];
    this.formStartTime = null;
    this.formType = null;
    this.isActive = false;
  }
}

export const aiTracker = new AITracker();
