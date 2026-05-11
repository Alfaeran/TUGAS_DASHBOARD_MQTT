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
  LAMP_CONTROL: "campus/room1/control/lamp",
  AC_CONTROL: "campus/room1/control/ac",
  POWER_REQUEST: "campus/room1/request/power",
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
// =============================================================
function startEnvironmentSensor() {
  const client = mqtt.connect(BROKER_URL, {
    protocolVersion: 5, // [Feature 10] Must be MQTT 5
    properties: {
      receiveMaximum: 10, // [Feature 10] Flow Control: limit concurrent QoS 1/2 messages
    },
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
      retain: true, // [Feature 7] LWT with Retain
    },
  });

  client.on("connect", () => {
    console.log("[ENV-SENSOR] Connected to broker (MQTT 5)");

    client.publish(
      LWT_TOPICS.SENSOR,
      JSON.stringify({
        status: "online",
        message: "Environment Sensor Online",
        timestamp: new Date().toISOString(),
      }),
      { qos: 1, retain: true }
    );

    // [Feature 3] Topic Alias: Use aliases to save bandwidth
    let isFirstPublish = true;

    setInterval(() => {
      const temperature = parseFloat((20 + Math.random() * 15).toFixed(1));
      const light = Math.floor(Math.random() * 500);

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

      // Properties for MQTT 5 publish
      const publishProps = {
        messageExpiryInterval: 10, // [Feature 6] Expiry: discard stale data after 10s
        userProperties: {          // [Feature 4] User Properties: Attach metadata
          "sensor-model": "DHT22",
          "location": "Room 1",
        },
      };

      // [Feature 1] Pub/Sub & QoS: Publish with QoS 0
      client.publish(
        isFirstPublish ? TOPICS.TEMP : "", // [Feature 3] Empty topic string if alias is established
        tempPayload,
        { 
          qos: 0, 
          properties: { ...publishProps, topicAlias: 1 } // [Feature 3] Topic Alias 1
        }
      );

      client.publish(
        isFirstPublish ? TOPICS.LIGHT : "", // [Feature 3]
        lightPayload,
        { 
          qos: 0, 
          properties: { ...publishProps, topicAlias: 2 } // [Feature 3] Topic Alias 2
        }
      );

      isFirstPublish = false;
      console.log(`[ENV-SENSOR] Temp: ${temperature}°C | Light: ${light} Lux`);
    }, 5000);
  });

  client.on("error", (err) => console.error("[ENV-SENSOR] Error:", err.message));
  return client;
}

// =============================================================
// ROLE 2: Device Status Tracker
// =============================================================
function startDeviceStatusTracker() {
  const client = mqtt.connect(BROKER_URL, {
    protocolVersion: 5,
    properties: { receiveMaximum: 10 }, // [Feature 10] Flow Control
    clientId: "device-tracker-" + Math.random().toString(16).slice(2, 8),
    clean: true,
    will: {
      topic: LWT_TOPICS.DEVICE_TRACKER,
      payload: JSON.stringify({ status: "offline", message: "Device Status Tracker Offline", timestamp: new Date().toISOString() }),
      qos: 1,
      retain: true, // [Feature 7] LWT
    },
  });

  client.on("connect", () => {
    console.log("[DEVICE-TRACKER] Connected to broker (MQTT 5)");
    client.publish(
      LWT_TOPICS.DEVICE_TRACKER,
      JSON.stringify({ status: "online", message: "Device Status Tracker Online", timestamp: new Date().toISOString() }),
      { qos: 1, retain: true }
    );

    client.subscribe([TOPICS.LAMP_CONTROL, TOPICS.AC_CONTROL], { qos: 2 });
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
      console.error("[DEVICE-TRACKER] Parse error:", err.message);
    }
  });

  return client;
}

function publishDeviceStatus(client) {
  const lampPayload = JSON.stringify({ device: "Lamp", status: lampStatus, timestamp: new Date().toISOString() });
  const acPayload = JSON.stringify({ device: "AC", status: acStatus, timestamp: new Date().toISOString() });

  // [Feature 5] Retain: Keep the last known status on the broker
  client.publish(TOPICS.LAMP_STATUS, lampPayload, { qos: 1, retain: true });
  client.publish(TOPICS.AC_STATUS, acPayload, { qos: 1, retain: true });
  console.log(`[DEVICE-TRACKER] Published status -> Lamp: ${lampStatus} | AC: ${acStatus}`);
}

// =============================================================
// ROLE 3: Power Monitor (Handles Request-Response)
// =============================================================
function startPowerMonitor() {
  const client = mqtt.connect(BROKER_URL, {
    protocolVersion: 5,
    properties: { receiveMaximum: 10 }, // [Feature 10] Flow Control
    clientId: "power-monitor-" + Math.random().toString(16).slice(2, 8),
    clean: true,
    will: {
      topic: LWT_TOPICS.POWER_MONITOR,
      payload: JSON.stringify({ status: "offline", message: "Power Monitor Offline", timestamp: new Date().toISOString() }),
      qos: 1,
      retain: true, // [Feature 7] LWT
    },
  });

  client.on("connect", () => {
    console.log("[POWER-MONITOR] Connected to broker (MQTT 5)");
    client.publish(
      LWT_TOPICS.POWER_MONITOR,
      JSON.stringify({ status: "online", message: "Power Monitor Online", timestamp: new Date().toISOString() }),
      { qos: 1, retain: true }
    );

    // Subscribe to device status AND Request topic
    client.subscribe([TOPICS.LAMP_STATUS, TOPICS.AC_STATUS, TOPICS.POWER_REQUEST], { qos: 1 });
  });

  // Notice the 3rd parameter `packet` is used for MQTT 5 properties
  client.on("message", (topic, message, packet) => {
    try {
      // [Feature 8] Request-Response Pattern
      if (topic === TOPICS.POWER_REQUEST) {
        console.log(`[POWER-MONITOR] Received Power Request`);
        const responseTopic = packet.properties?.responseTopic;
        const correlationData = packet.properties?.correlationData;

        if (responseTopic) {
          const powerPayload = getPowerPayload();
          // Publish response directly to the requested topic
          client.publish(responseTopic, powerPayload, {
            qos: 1,
            properties: { correlationData: correlationData } // Echo back the correlation data
          });
          console.log(`[POWER-MONITOR] Sent Power Response to ${responseTopic}`);
        }
        return;
      }

      const payload = JSON.parse(message.toString());
      if (topic === TOPICS.LAMP_STATUS) {
        lampStatus = payload.status;
      } else if (topic === TOPICS.AC_STATUS) {
        acStatus = payload.status;
      }
      publishPowerUsage(client);
    } catch (err) {
      console.error("[POWER-MONITOR] Error:", err.message);
    }
  });

  return client;
}

function getPowerPayload() {
  const LAMP_WATTS = 60;
  const AC_WATTS = 1500;
  const BASE_WATTS = 15; // standby power

  let totalWatts = BASE_WATTS;
  if (lampStatus === "ON") totalWatts += LAMP_WATTS;
  if (acStatus === "ON") totalWatts += AC_WATTS;

  return JSON.stringify({
    total: totalWatts,
    breakdown: {
      lamp: lampStatus === "ON" ? LAMP_WATTS : 0,
      ac: acStatus === "ON" ? AC_WATTS : 0,
      standby: BASE_WATTS,
    },
    unit: "W",
    timestamp: new Date().toISOString(),
  });
}

function publishPowerUsage(client) {
  client.publish(TOPICS.ENERGY, getPowerPayload(), { qos: 1 });
}

// =============================================================
// Boot all publishers
// =============================================================
console.log("=".repeat(60));
console.log("  MQTT Smart Campus — Publishers Starting (v5)...");
console.log("=".repeat(60));

const sensorClient = startEnvironmentSensor();
const trackerClient = startDeviceStatusTracker();
const powerClient = startPowerMonitor();

process.on("SIGINT", () => {
  sensorClient.end(); trackerClient.end(); powerClient.end();
  process.exit(0);
});
