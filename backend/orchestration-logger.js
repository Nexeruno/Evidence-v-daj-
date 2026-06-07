/**
 * FÁZA 6.2E: Orchestration Event Logger
 * Logs local multi-service orchestration events
 */

const fs = require('fs');
const path = require('path');

class OrchestrationLogger {
  constructor(logDir = './logs') {
    this.logDir = logDir;
    this.logFile = path.join(logDir, 'orchestration.log');
    this.eventsFile = path.join(logDir, 'orchestration.json');

    // Ensure logs directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Initialize JSON log file if it doesn't exist
    if (!fs.existsSync(this.eventsFile)) {
      fs.writeFileSync(this.eventsFile, JSON.stringify({ events: [] }, null, 2));
    }
  }

  /**
   * Log an orchestration event
   * @param {string} eventType - Type of event
   * @param {string} message - Human readable message
   * @param {Object} metadata - Additional metadata
   */
  log(eventType, message, metadata = {}) {
    const timestamp = new Date().toISOString();

    // Human readable log entry
    const logEntry = `[${timestamp}] [${eventType}] ${message}`;
    console.log(logEntry);

    // Write to text log file
    fs.appendFileSync(this.logFile, logEntry + '\n');

    // Write to JSON log file
    this._appendJsonEvent({
      timestamp,
      eventType,
      message,
      metadata
    });
  }

  /**
   * Log service starting event
   */
  serviceStarting(serviceName, port = null) {
    const msg = port
      ? `Service starting: ${serviceName} (port ${port})`
      : `Service starting: ${serviceName}`;

    this.log('SERVICE_STARTING', msg, {
      service: serviceName,
      port
    });
  }

  /**
   * Log service ready event
   */
  serviceReady(serviceName, status = 'healthy') {
    const msg = `Service ready: ${serviceName} (${status})`;

    this.log('SERVICE_READY', msg, {
      service: serviceName,
      status
    });
  }

  /**
   * Log dependency missing event
   */
  dependencyMissing(dependencyName, reason = null) {
    const msg = reason
      ? `Dependency missing: ${dependencyName} (${reason})`
      : `Dependency missing: ${dependencyName}`;

    this.log('DEPENDENCY_MISSING', msg, {
      dependency: dependencyName,
      reason
    });
  }

  /**
   * Log runtime connected event
   */
  runtimeConnected(runtimeName, url, version = null) {
    const msg = version
      ? `Runtime connected: ${runtimeName} (${url}, v${version})`
      : `Runtime connected: ${runtimeName} (${url})`;

    this.log('RUNTIME_CONNECTED', msg, {
      runtime: runtimeName,
      url,
      version
    });
  }

  /**
   * Log orchestration ready event
   */
  orchestrationReady(servicesCount = 2) {
    const msg = `Orchestration ready: ${servicesCount} services`;

    this.log('ORCHESTRATION_READY', msg, {
      servicesCount
    });
  }

  /**
   * Log orchestration degraded event
   */
  orchestrationDegraded(reason = null) {
    const msg = reason
      ? `Orchestration degraded: ${reason}`
      : `Orchestration degraded`;

    this.log('ORCHESTRATION_DEGRADED', msg, {
      reason
    });
  }

  /**
   * Get orchestration status summary
   */
  getStatus() {
    try {
      const content = fs.readFileSync(this.eventsFile, 'utf8');
      const data = JSON.parse(content);
      return data.events;
    } catch (error) {
      console.error('Error reading orchestration status:', error.message);
      return [];
    }
  }

  /**
   * Private method to append JSON event
   */
  _appendJsonEvent(event) {
    try {
      const content = fs.readFileSync(this.eventsFile, 'utf8');
      const data = JSON.parse(content);
      data.events.push(event);

      // Keep only last 100 events
      if (data.events.length > 100) {
        data.events = data.events.slice(-100);
      }

      fs.writeFileSync(this.eventsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing orchestration event:', error.message);
    }
  }

  /**
   * Clear logs
   */
  clear() {
    try {
      fs.writeFileSync(this.logFile, '');
      fs.writeFileSync(this.eventsFile, JSON.stringify({ events: [] }, null, 2));
    } catch (error) {
      console.error('Error clearing logs:', error.message);
    }
  }
}

module.exports = OrchestrationLogger;
