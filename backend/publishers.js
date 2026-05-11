// =============================================================
// MQTT Smart Campus — Publishers (3 Roles)
// Role 1: Environment Sensor (Temp + Light)
// Role 2: Device Status Tracker (Lamp + AC)
// Role 3: Power Monitor (Watt usage)
// =============================================================

const mqtt = require("mqtt");

const BROKER_URL = "ws://localhost:9001/mqtt";

// ---- Topic Definitions ----
const TOPICS = {
  TEMP: "campus/room1/sensor/temp",
  LIGHT: "campus/room1/sensor/light",
  LAMP_STATUS: "campus/room1/status/lamp",
  AC_STATUS: "campus/room1/status/ac",
  ENERGY: "campus/room1/energy/usage",
  // Control topics (subscribed by publishers to receive commands)
  LAMP_CONTROL: "campus/room1/control/lamp",
  AC_CONTROL: "campus/room1/control/ac",
};

// ---- LWT Topics ----
const LWT_TOPICS = {
  SENSOR: "campus/room1/lwt/sensor",
  DEVICE_TRACKER: "campus/room1/lwt/device-tracker",
  POWER_MONITOR: "campus/room1/lwt/power-monitor",
};

// ---- Shared Device State ----
let lampStatus = "OFF";
let acStatus = "OFF";

// =============================================================
// ROLE 1: Environment Sensor
// Publishes temperature and light intensity every 5 seconds
// QoS 0 (fire-and-forget)
// =============================================================
function startEnvironmentSensor() {
  const client = mqtt.connect(BROKER_URL, {
    protocolVersion: 4,
    clientId: "env-sensor-" + Math.random().toString(16).slice(2, 8),
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
    will: {
      topic: LWT_TOPICS.SENSOR,
      payload: JSON.stringify({
        status: "offline",
        message: "Environment Sensor Offline",
        timestamp: new Date().toISOString(),
      }),
      qos: 1,
      retain: true,
    },
  });

  client.on("connect", () => {
    console.log("[ENV-SENSOR] Connected to broker");

    // Publish online status to clear any previous LWT
    client.publish(
      LWT_TOPICS.SENSOR,
      JSON.stringify({
        status: "online",
        message: "Environment Sensor Online",
        timestamp: new Date().toISOString(),
      }),
      { qos: 1, retain: true }
    );

    // Publish sensor data every 5 seconds
    setInterval(() => {
      const temperature = parseFloat((20 + Math.random() * 15).toFixed(1)); // 20-35°C
      const light = Math.floor(Math.random() * 500); // 0-500 Lux

      const tempPayload = JSON.stringify({
        value: temperature,
        unit: "°C",
        timestamp: new Date().toISOString(),
      });

      const lightPayload = JSON.stringify({
        value: light,
        unit: "Lux",
        timestamp: new Date().toISOString(),
      });

      client.publish(TOPICS.TEMP, tempPayload, { qos: 0 });
      client.publish(TOPICS.LIGHT, lightPayload, { qos: 0 });

      console.log(
        `[ENV-SENSOR] Temp: ${temperature}°C | Light: ${light} Lux`
      );
    }, 5000);
  });

  client.on("error", (err) => {
    console.error("[ENV-SENSOR] Connection error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("[ENV-SENSOR] Attempting reconnection...");
  });

  client.on("offline", () => {
    console.log("[ENV-SENSOR] Client went offline");
  });

  return client;
}

// =============================================================
// ROLE 2: Device Status Tracker
// Publishes Lamp and AC status with Retained Messages = true
// Listens to control topics for toggle commands
// =============================================================
function startDeviceStatusTracker() {
  const client = mqtt.connect(BROKER_URL, {
    protocolVersion: 4,
    clientId: "device-tracker-" + Math.random().toString(16).slice(2, 8),
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
    will: {
      topic: LWT_TOPICS.DEVICE_TRACKER,
      payload: JSON.stringify({
        status: "offline",
        message: "Device Status Tracker Offline",
        timestamp: new Date().toISOString(),
      }),
      qos: 1,
      retain: true,
    },
  });

  client.on("connect", () => {
    console.log("[DEVICE-TRACKER] Connected to broker");

    // Publish online status
    client.publish(
      LWT_TOPICS.DEVICE_TRACKER,
      JSON.stringify({
        status: "online",
        message: "Device Status Tracker Online",
        timestamp: new Date().toISOString(),
      }),
      { qos: 1, retain: true }
    );

    // Subscribe to control topics for commands from frontend / controller
    client.subscribe(
      [TOPICS.LAMP_CONTROL, TOPICS.AC_CONTROL],
      { qos: 2 },
      (err) => {
        if (err) {
          console.error("[DEVICE-TRACKER] Subscribe error:", err.message);
        } else {
          console.log("[DEVICE-TRACKER] Subscribed to control topics");
        }
      }
    );

    // Publish initial retained status
    publishDeviceStatus(client);
  });

  client.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      const command = payload.command || payload.status || message.toString();

      if (topic === TOPICS.LAMP_CONTROL) {
        lampStatus = command === "ON" ? "ON" : "OFF";
        console.log(`[DEVICE-TRACKER] Lamp toggled -> ${lampStatus}`);
      } else if (topic === TOPICS.AC_CONTROL) {
        acStatus = command === "ON" ? "ON" : "OFF";
        console.log(`[DEVICE-TRACKER] AC toggled -> ${acStatus}`);
      }

      publishDeviceStatus(client);
    } catch (err) {
      console.error("[DEVICE-TRACKER] Message parse error:", err.message);
    }
  });

  client.on("error", (err) => {
    console.error("[DEVICE-TRACKER] Connection error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("[DEVICE-TRACKER] Attempting reconnection...");
  });

  return client;
}

function publishDeviceStatus(client) {
  const lampPayload = JSON.stringify({
    device: "Lamp",
    status: lampStatus,
    timestamp: new Date().toISOString(),
  });

  const acPayload = JSON.stringify({
    device: "AC",
    status: acStatus,
    timestamp: new Date().toISOString(),
  });

  // RETAINED = true — new subscribers get last known status immediately
  client.publish(TOPICS.LAMP_STATUS, lampPayload, { qos: 1, retain: true });
  client.publish(TOPICS.AC_STATUS, acPayload, { qos: 1, retain: true });

  console.log(
    `[DEVICE-TRACKER] Published status -> Lamp: ${lampStatus} | AC: ${acStatus}`
  );
}

// =============================================================
// ROLE 3: Power Monitor
// Publishes estimated power usage based on device status
// Lamp = 60W, AC = 1500W when ON
// =============================================================
function startPowerMonitor() {
  const client = mqtt.connect(BROKER_URL, {
    protocolVersion: 4,
    clientId: "power-monitor-" + Math.random().toString(16).slice(2, 8),
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
    will: {
      topic: LWT_TOPICS.POWER_MONITOR,
      payload: JSON.stringify({
        status: "offline",
        message: "Power Monitor Offline",
        timestamp: new Date().toISOString(),
      }),
      qos: 1,
      retain: true,
    },
  });

  client.on("connect", () => {
    console.log("[POWER-MONITOR] Connected to broker");

    // Publish online status
    client.publish(
      LWT_TOPICS.POWER_MONITOR,
      JSON.stringify({
        status: "online",
        message: "Power Monitor Online",
        timestamp: new Date().toISOString(),
      }),
      { qos: 1, retain: true }
    );

    // Subscribe to device status to compute power
    client.subscribe(
      [TOPICS.LAMP_STATUS, TOPICS.AC_STATUS],
      { qos: 1 },
      (err) => {
        if (err) {
          console.error("[POWER-MONITOR] Subscribe error:", err.message);
        } else {
          console.log("[POWER-MONITOR] Subscribed to device status topics");
        }
      }
    );

    // Also publish periodically (every 5s) for consistent dashboard updates
    setInterval(() => {
      publishPowerUsage(client);
    }, 5000);
  });

  client.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());

      if (topic === TOPICS.LAMP_STATUS) {
        lampStatus = payload.status;
      } else if (topic === TOPICS.AC_STATUS) {
        acStatus = payload.status;
      }

      // Publish updated power immediately on status change
      publishPowerUsage(client);
    } catch (err) {
      console.error("[POWER-MONITOR] Message parse error:", err.message);
    }
  });

  client.on("error", (err) => {
    console.error("[POWER-MONITOR] Connection error:", err.message);
  });

  client.on("reconnect", () => {
    console.log("[POWER-MONITOR] Attempting reconnection...");
  });

  return client;
}

function publishPowerUsage(client) {
  const LAMP_WATTS = 60;
  const AC_WATTS = 1500;
  const BASE_WATTS = 15; // standby power

  let totalWatts = BASE_WATTS;
  if (lampStatus === "ON") totalWatts += LAMP_WATTS;
  if (acStatus === "ON") totalWatts += AC_WATTS;

  const payload = JSON.stringify({
    total: totalWatts,
    breakdown: {
      lamp: lampStatus === "ON" ? LAMP_WATTS : 0,
      ac: acStatus === "ON" ? AC_WATTS : 0,
      standby: BASE_WATTS,
    },
    unit: "W",
    timestamp: new Date().toISOString(),
  });

  client.publish(TOPICS.ENERGY, payload, { qos: 1 });
  console.log(`[POWER-MONITOR] Total power: ${totalWatts}W`);
}

// =============================================================
// Boot all publishers
// =============================================================
console.log("=".repeat(60));
console.log("  MQTT Smart Campus — Publishers Starting...");
console.log("=".repeat(60));

const sensorClient = startEnvironmentSensor();
const trackerClient = startDeviceStatusTracker();
const powerClient = startPowerMonitor();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[SYSTEM] Shutting down publishers...");
  sensorClient.end();
  trackerClient.end();
  powerClient.end();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[SYSTEM] Terminating publishers...");
  sensorClient.end();
  trackerClient.end();
  powerClient.end();
  process.exit(0);
});
