// =============================================================
// MQTT Smart Campus — Automation Controller (Subscriber)
// - Listens to light sensor and auto-controls lamp
// - Monitors LWT topics for offline detection
// =============================================================

const mqtt = require("mqtt");

const BROKER_URL = "ws://localhost:9001/mqtt";

const TOPICS = {
  LIGHT: "campus/room1/sensor/light",
  LAMP_CONTROL: "campus/room1/control/lamp",
  LAMP_STATUS: "campus/room1/status/lamp",
};

const LWT_TOPICS = {
  SENSOR: "campus/room1/lwt/sensor",
  DEVICE_TRACKER: "campus/room1/lwt/device-tracker",
  POWER_MONITOR: "campus/room1/lwt/power-monitor",
};

// Threshold for automatic lamp control
const LIGHT_THRESHOLD = 100; // Lux

// Track current lamp state to avoid redundant commands
let currentLampStatus = "OFF";
let autoControlEnabled = true;

const client = mqtt.connect(BROKER_URL, {
  protocolVersion: 5,
  clientId: "auto-controller-" + Math.random().toString(16).slice(2, 8),
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 5000,
  will: {
    topic: "campus/room1/lwt/controller",
    payload: JSON.stringify({
      status: "offline",
      message: "Automation Controller Offline",
      timestamp: new Date().toISOString(),
    }),
    qos: 1,
    retain: true,
  },
});

client.on("connect", () => {
  console.log("=".repeat(60));
  console.log("  MQTT Smart Campus — Automation Controller Online");
  console.log("=".repeat(60));

  // Publish online status
  client.publish(
    "campus/room1/lwt/controller",
    JSON.stringify({
      status: "online",
      message: "Automation Controller Online",
      timestamp: new Date().toISOString(),
    }),
    { qos: 1, retain: true }
  );

  // Subscribe to light sensor for automation
  client.subscribe(TOPICS.LIGHT, { qos: 1 }, (err) => {
    if (err) {
      console.error("[CONTROLLER] Failed to subscribe to light topic:", err.message);
    } else {
      console.log("[CONTROLLER] Subscribed to light sensor topic");
    }
  });

  // Subscribe to lamp status to track current state
  client.subscribe(TOPICS.LAMP_STATUS, { qos: 1 }, (err) => {
    if (err) {
      console.error("[CONTROLLER] Failed to subscribe to lamp status:", err.message);
    } else {
      console.log("[CONTROLLER] Subscribed to lamp status topic");
    }
  });

  // Subscribe to ALL LWT topics for offline monitoring
  const lwtTopics = Object.values(LWT_TOPICS);
  client.subscribe(lwtTopics, { qos: 1 }, (err) => {
    if (err) {
      console.error("[CONTROLLER] Failed to subscribe to LWT topics:", err.message);
    } else {
      console.log("[CONTROLLER] Subscribed to LWT topics for offline monitoring");
    }
  });
});

client.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    // ---- Handle Light Sensor Data ----
    if (topic === TOPICS.LIGHT) {
      const lightValue = payload.value;
      console.log(`[CONTROLLER] Light reading: ${lightValue} Lux`);

      if (lightValue < LIGHT_THRESHOLD && currentLampStatus === "OFF") {
        console.log(
          `[CONTROLLER] Light below ${LIGHT_THRESHOLD} Lux — Turning Lamp ON automatically`
        );
        client.publish(
          TOPICS.LAMP_CONTROL,
          JSON.stringify({
            command: "ON",
            source: "auto-controller",
            reason: `Light level ${lightValue} Lux < ${LIGHT_THRESHOLD} Lux threshold`,
            timestamp: new Date().toISOString(),
          }),
          { qos: 2 }
        );
      } else if (lightValue >= LIGHT_THRESHOLD && currentLampStatus === "ON" && autoControlEnabled) {
        console.log(
          `[CONTROLLER] Light above ${LIGHT_THRESHOLD} Lux — Turning Lamp OFF automatically`
        );
        client.publish(
          TOPICS.LAMP_CONTROL,
          JSON.stringify({
            command: "OFF",
            source: "auto-controller",
            reason: `Light level ${lightValue} Lux >= ${LIGHT_THRESHOLD} Lux threshold`,
            timestamp: new Date().toISOString(),
          }),
          { qos: 2 }
        );
      }
    }

    // ---- Handle Lamp Status Updates ----
    if (topic === TOPICS.LAMP_STATUS) {
      currentLampStatus = payload.status;
      console.log(`[CONTROLLER] Lamp status updated -> ${currentLampStatus}`);
    }

    // ---- Handle LWT Messages ----
    if (Object.values(LWT_TOPICS).includes(topic)) {
      const deviceName = topic.split("/").pop();
      if (payload.status === "offline") {
        console.log("");
        console.log("!".repeat(60));
        console.log(`  ALERT: ${deviceName.toUpperCase()} has gone OFFLINE!`);
        console.log(`  Message: ${payload.message}`);
        console.log(`  Time: ${payload.timestamp}`);
        console.log("!".repeat(60));
        console.log("");
      } else if (payload.status === "online") {
        console.log(`[CONTROLLER] ${deviceName} is online: ${payload.message}`);
      }
    }
  } catch (err) {
    console.error("[CONTROLLER] Error processing message:", err.message);
  }
});

client.on("error", (err) => {
  console.error("[CONTROLLER] Connection error:", err.message);
});

client.on("reconnect", () => {
  console.log("[CONTROLLER] Attempting reconnection...");
});

client.on("offline", () => {
  console.log("[CONTROLLER] Client went offline");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[CONTROLLER] Shutting down...");
  client.end(false, () => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n[CONTROLLER] Terminating...");
  client.end(false, () => {
    process.exit(0);
  });
});
