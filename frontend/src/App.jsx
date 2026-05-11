// =============================================================
// MQTT Smart Campus — React Dashboard (App.jsx)
// =============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import mqtt from "mqtt";

// ---- Configuration ----
const BROKER_WS_URL = "ws://localhost:9001/mqtt";

const TOPICS = {
  TEMP: "campus/room1/sensor/temp",
  LIGHT: "campus/room1/sensor/light",
  LAMP_STATUS: "campus/room1/status/lamp",
  AC_STATUS: "campus/room1/status/ac",
  ENERGY: "campus/room1/energy/usage",
  LAMP_CONTROL: "campus/room1/control/lamp",
  AC_CONTROL: "campus/room1/control/ac",
  POWER_REQUEST: "campus/room1/request/power",
  POWER_RESPONSE: "campus/room1/response/power",
};

const LWT_LABELS = {
  "campus/room1/lwt/sensor": "Environment Sensor",
  "campus/room1/lwt/device-tracker": "Device Tracker",
  "campus/room1/lwt/power-monitor": "Power Monitor",
  "campus/room1/lwt/controller": "Auto Controller",
};

export default function App() {
  const clientRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");

  const [temperature, setTemperature] = useState(null);
  const [light, setLight] = useState(null);
  const [lampStatus, setLampStatus] = useState("OFF");
  const [acStatus, setAcStatus] = useState("OFF");
  const [energy, setEnergy] = useState(null);
  const [serviceHealth, setServiceHealth] = useState({});
  const [lastUpdated, setLastUpdated] = useState({});

  useEffect(() => {
    const client = mqtt.connect(BROKER_WS_URL, {
      protocolVersion: 5, // [Feature 10] Must be MQTT 5
      properties: {
        receiveMaximum: 10, // [Feature 10] Flow Control
      },
      clientId: "dashboard-" + Math.random().toString(16).slice(2, 8),
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
    });

    clientRef.current = client;

    client.on("connect", () => {
      setConnectionStatus("connected");

      // [Feature 2] Wildcard Subscriptions: Reduce the number of subscriptions
      const wildcardTopics = [
        "campus/room1/sensor/#",
        "campus/room1/status/#",
        "campus/room1/lwt/#",
        TOPICS.ENERGY,
        TOPICS.POWER_RESPONSE, // Subscribe to response topic
      ];

      client.subscribe(wildcardTopics, { qos: 1 }, (err) => {
        if (err) console.error("Subscribe error:", err);
      });
    });

    // Accept packet to read MQTT 5 properties
    client.on("message", (topic, message, packet) => {
      try {
        const payload = JSON.parse(message.toString());
        const now = new Date().toLocaleTimeString();

        // Check for specific topics using the wildcard match
        if (topic === TOPICS.TEMP) {
          setTemperature(payload.value);
          setLastUpdated((prev) => ({ ...prev, temp: now }));
        } 
        else if (topic === TOPICS.LIGHT) {
          setLight(payload.value);
          setLastUpdated((prev) => ({ ...prev, light: now }));
        } 
        else if (topic === TOPICS.LAMP_STATUS) {
          setLampStatus(payload.status);
          setLastUpdated((prev) => ({ ...prev, lamp: now }));
        } 
        else if (topic === TOPICS.AC_STATUS) {
          setAcStatus(payload.status);
          setLastUpdated((prev) => ({ ...prev, ac: now }));
        } 
        else if (topic === TOPICS.ENERGY || topic === TOPICS.POWER_RESPONSE) {
          // [Feature 8] Handles Request-Response callback as well as normal energy updates
          setEnergy(payload);
          setLastUpdated((prev) => ({ ...prev, energy: now }));
          
          if (topic === TOPICS.POWER_RESPONSE) {
             const correlationData = packet.properties?.correlationData;
             console.log(`[MQTT] Received Power Response! Correlation: ${correlationData}`);
          }
        } 
        else if (topic.startsWith("campus/room1/lwt/")) {
          // [Feature 7] LWT handling via wildcard
          setServiceHealth((prev) => ({
            ...prev,
            [topic]: {
              status: payload.status,
              message: payload.message,
              timestamp: payload.timestamp,
            },
          }));
        }
      } catch (err) {
        console.error("Message parse error:", err);
      }
    });

    client.on("reconnect", () => setConnectionStatus("connecting"));
    client.on("close", () => setConnectionStatus("disconnected"));
    client.on("error", (err) => setConnectionStatus("disconnected"));

    return () => {
      if (client) client.end(true);
    };
  }, []);

  // [Feature 1] QoS 2 for Control Commands
  const toggleLamp = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.connected) return;
    const newStatus = lampStatus === "ON" ? "OFF" : "ON";
    client.publish(TOPICS.LAMP_CONTROL, JSON.stringify({ command: newStatus }), { qos: 2 });
  }, [lampStatus]);

  const toggleAC = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.connected) return;
    const newStatus = acStatus === "ON" ? "OFF" : "ON";
    client.publish(TOPICS.AC_CONTROL, JSON.stringify({ command: newStatus }), { qos: 2 });
  }, [acStatus]);

  // [Feature 8] Request-Response Pattern: Trigger a power usage refresh
  const requestPowerRefresh = useCallback(() => {
    const client = clientRef.current;
    if (!client || !client.connected) return;

    const corrId = "req-" + Math.random().toString(16).slice(2, 6);
    console.log(`[MQTT] Requesting Power Refresh with ID: ${corrId}`);

    client.publish(
      TOPICS.POWER_REQUEST,
      JSON.stringify({ action: "refresh" }),
      {
        qos: 1,
        properties: {
          responseTopic: TOPICS.POWER_RESPONSE,
          correlationData: corrId,
        },
      }
    );
  }, []);

  const getTempColor = (temp) => {
    if (temp === null) return "#64748b";
    if (temp < 22) return "#60a5fa";
    if (temp < 28) return "#34d399";
    if (temp < 32) return "#fbbf24";
    return "#fb7185";
  };

  const getLightLabel = (lux) => {
    if (lux === null) return "—";
    if (lux < 50) return "Very Dark";
    if (lux < 100) return "Dark";
    if (lux < 200) return "Dim";
    if (lux < 350) return "Normal";
    return "Bright";
  };

  return (
    <div className="app">
      {/* ---- Header ---- */}
      <header className="header">
        <div className="header__badge">
          <span className={`header__badge-dot ${connectionStatus !== "connected" ? "header__badge-dot--offline" : ""}`}></span>
          MQTT Smart Campus
        </div>
        <h1>Facility Management Dashboard</h1>
        <p>Room 1 — Real-time IoT Monitoring & Control</p>
      </header>

      {/* ---- Connection Status ---- */}
      <div className={`connection-bar connection-bar--${connectionStatus}`}>
        {connectionStatus === "connected" && "✓ Connected to MQTT Broker (WebSocket)"}
        {connectionStatus === "connecting" && "⟳ Reconnecting to broker..."}
        {connectionStatus === "disconnected" && "✕ Disconnected from broker"}
      </div>

      {/* ---- Dashboard Cards ---- */}
      <div className="dashboard-grid">
        {/* Temperature */}
        <div className="card card--temp" id="card-temperature">
          <div className="card__header">
            <div className="card__icon card__icon--temp">🌡️</div>
            <span className="card__label">Temperature</span>
          </div>
          {temperature !== null ? (
            <>
              <div className="card__value" style={{ color: getTempColor(temperature) }}>
                {temperature} <span className="card__unit">°C</span>
              </div>
              <div className="card__sub">
                {temperature < 22 ? "Cool" : temperature < 28 ? "Comfortable" : temperature < 32 ? "Warm" : "Hot"}
                {lastUpdated.temp && ` • Updated ${lastUpdated.temp}`}
              </div>
            </>
          ) : <div className="skeleton"></div>}
        </div>

        {/* Light Intensity */}
        <div className="card card--light" id="card-light">
          <div className="card__header">
            <div className="card__icon card__icon--light">💡</div>
            <span className="card__label">Light Intensity</span>
          </div>
          {light !== null ? (
            <>
              <div className="card__value card__value--light">
                {light} <span className="card__unit">Lux</span>
              </div>
              <div className="card__sub">
                {getLightLabel(light)} {light < 100 && " — Auto-lamp triggered"}
                {lastUpdated.light && ` • ${lastUpdated.light}`}
              </div>
            </>
          ) : <div className="skeleton"></div>}
        </div>

        {/* Energy Usage */}
        <div className="card card--energy" id="card-energy">
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="card__icon card__icon--energy">⚡</div>
              <span className="card__label">Power Usage</span>
            </div>
            {/* Request-Response Trigger Button */}
            <button 
              onClick={requestPowerRefresh} 
              disabled={connectionStatus !== "connected"}
              style={{ padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid #fbbf24', background: 'transparent', color: '#fbbf24', cursor: 'pointer' }}
            >
              ⟳ Refresh
            </button>
          </div>
          {energy ? (
            <>
              <div className="card__value card__value--energy">
                {energy.total} <span className="card__unit">W</span>
              </div>
              <div className="energy-breakdown">
                <div className="energy-item">
                  <span className="energy-item__label">Lamp</span>
                  <span className="energy-item__value">{energy.breakdown?.lamp ?? 0}W</span>
                </div>
                <div className="energy-item">
                  <span className="energy-item__label">AC</span>
                  <span className="energy-item__value">{energy.breakdown?.ac ?? 0}W</span>
                </div>
                <div className="energy-item">
                  <span className="energy-item__label">Standby</span>
                  <span className="energy-item__value">{energy.breakdown?.standby ?? 0}W</span>
                </div>
              </div>
              <div className="card__sub">
                {lastUpdated.energy && `Updated ${lastUpdated.energy}`}
              </div>
            </>
          ) : <div className="skeleton"></div>}
        </div>

        {/* Lamp Control */}
        <div className="card card--lamp" id="card-lamp">
          <div className="card__header">
            <div className="card__icon card__icon--lamp">💡</div>
            <span className="card__label">Lamp Control</span>
          </div>
          <div className="device-status">
            <div className={`status-indicator status-indicator--${lampStatus.toLowerCase()}`}></div>
            <span className={`status-text status-text--${lampStatus.toLowerCase()}`}>{lampStatus}</span>
          </div>
          <div className="card__sub">{lastUpdated.lamp && `Last changed ${lastUpdated.lamp}`}</div>
          <button className={`toggle-btn toggle-btn--${lampStatus.toLowerCase()}`} onClick={toggleLamp} disabled={connectionStatus !== "connected"}>
            {lampStatus === "ON" ? "⏻ Turn OFF" : "⏻ Turn ON"}
          </button>
        </div>

        {/* AC Control */}
        <div className="card card--ac" id="card-ac">
          <div className="card__header">
            <div className="card__icon card__icon--ac">❄️</div>
            <span className="card__label">AC Control</span>
          </div>
          <div className="device-status">
            <div className={`status-indicator status-indicator--${acStatus.toLowerCase()}`}></div>
            <span className={`status-text status-text--${acStatus.toLowerCase()}`}>{acStatus}</span>
          </div>
          <div className="card__sub">{lastUpdated.ac && `Last changed ${lastUpdated.ac}`}</div>
          <button className={`toggle-btn toggle-btn--${acStatus.toLowerCase()}`} onClick={toggleAC} disabled={connectionStatus !== "connected"}>
            {acStatus === "ON" ? "⏻ Turn OFF" : "⏻ Turn ON"}
          </button>
        </div>
      </div>

      {/* ---- Service Health / LWT Alerts ---- */}
      <div className="alerts-section">
        <h2>🛡️ Service Health Monitor</h2>
        <div className="alerts-grid">
          {Object.keys(LWT_LABELS).map((topic) => {
            const health = serviceHealth[topic];
            const isOnline = health?.status === "online";
            const label = LWT_LABELS[topic];

            return (
              <div key={topic} className={`alert-card alert-card--${isOnline ? "online" : health ? "offline" : "online"}`}>
                <div className={`alert-dot alert-dot--${isOnline || !health ? "online" : "offline"}`}></div>
                <div className="alert-info">
                  <div className="alert-name">{label}</div>
                  <div className="alert-time">
                    {health ? (isOnline ? "Online" : `Offline since ${new Date(health.timestamp).toLocaleTimeString()}`) : "Waiting for status..."}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
