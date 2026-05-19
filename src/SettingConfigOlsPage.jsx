import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./SettingConfigOlsPage.css";

const SettingConfigOlsPage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState("environment");
  const [botQuery, setBotQuery] = useState("");
  const [botResponse, setBotResponse] = useState("");
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [testSmsTo, setTestSmsTo] = useState("");
  const [testSmsMsg, setTestSmsMsg] = useState("");
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState(null);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState("");
  const [isSandbox, setIsSandbox] = useState(true); // Default to Sandbox for easy testing
  const [systemHealth, setSystemHealth] = useState({
    openai: false,
    twilio: false,
    supabase: false,
    resend: false,
    googleMaps: false,
    n8n: false
  });

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch("/.netlify/functions/system-health");
        if (response.ok) {
          const data = await response.json();
          setSystemHealth(data);
        }
      } catch (err) {
        console.warn("Could not fetch system health", err);
      }
    };
    fetchHealth();
  }, []);

  const devConfig = {
    env: "development",
    version: "2.4.0-dev",
    apiEndpoint: import.meta.env.VITE_SUPABASE_URL || "https://xjyjupxhvprbwiravysf.supabase.co",
    netlifySite: "https://oneluxstay.com",
    lastSync: new Date().toLocaleString(),
    googleMaps: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? "Configured" : "Missing",
    whatsApp: import.meta.env.VITE_WHATSAPP_NUMBER || "Not Set",
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === "devsols123") {
      setIsAuthenticated(true);
      setError("");
    } else {
      setError("Invalid Developer Password");
    }
  };

  const handleClearCache = () => {
    setIsClearing(true);
    setTimeout(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Also clear specific app sessions
      const keys = ["admins_ols_session", "ols_chat_history", "guest_analytics_id"];
      keys.forEach(k => localStorage.removeItem(k));
      
      setIsClearing(false);
      alert("Local cache and sessions have been cleared successfully.");
      window.location.reload();
    }, 1200);
  };

  const handleBotTest = async (e) => {
    e.preventDefault();
    if (!botQuery.trim()) return;
    setIsBotThinking(true);
    setBotResponse("");
    
    try {
      // Calling your REAL AI engine (chat.js)
      const response = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: botQuery }],
          pageContext: { 
            pageType: "dev-test", 
            title: "System Config Bot Test",
            pathname: "/dev-ols/config"
          }
        })
      });

      if (!response.ok) throw new Error("Failed to reach AI");

      const data = await response.json();
      setBotResponse(data.reply || "Lucy is silent right now.");
    } catch (err) {
      console.error("Bot test error:", err);
      setBotResponse("Error: Could not connect to the AI engine. Check your API keys in .env");
    } finally {
      setIsBotThinking(false);
    }
  };

  const handleSmsTest = async (e) => {
    e.preventDefault();
    if (!testSmsTo.trim()) return;
    setIsSendingSms(true);
    setSmsResult(null);
    
    try {
      const response = await fetch("/.netlify/functions/test-twilio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_sms",
          to: testSmsTo,
          message: testSmsMsg,
          sandbox: isSandbox
        })
      });
      const data = await response.json();
      if (data.success) {
        setSmsResult({ success: true, message: `Success! SID: ${data.sid}` });
      } else {
        setSmsResult({ success: false, message: data.error || "Failed to send SMS" });
      }
    } catch (err) {
      setSmsResult({ success: false, message: "Connection error" });
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleCallTest = async () => {
    setShowCallConfirm(false);
    setIsCalling(true);
    setCallStatus("Initiating real call...");
    
    try {
      const response = await fetch("/.netlify/functions/test-twilio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "make_call",
          to: testSmsTo, // Using the same 'To' number from the SMS field
          sandbox: isSandbox
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setCallStatus("Call Connected! Check your phone.");
        setTimeout(() => {
          setIsCalling(false);
          setCallStatus("");
        }, 5000);
      } else {
        throw new Error(data.error || "Call failed");
      }
    } catch (err) {
      console.error("Call test error:", err);
      alert(`Call failed: ${err.message}`);
      setIsCalling(false);
      setCallStatus("");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="setting-config-ols-page is-locked">
        <div className="config-container auth-gate">
          <header className="config-header">
            <h1 className="config-title">Access Restricted</h1>
            <p className="config-subtitle">Developer Credentials Required</p>
          </header>
          <form onSubmit={handleLogin} className="config-auth-form">
            <input
              type="password"
              placeholder="Enter Dev Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="config-input"
              autoFocus
            />
            {error && <p className="config-error">{error}</p>}
            <button type="submit" className="config-button">Unlock System</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="setting-config-ols-page tabbed-layout">
      <div className="config-main-content">
        <header className="config-hero">
          <div className="config-hero-copy">
            <h1 className="config-title">System Configuration</h1>
            <p className="config-subtitle">Internal System Oversight — OLS</p>
          </div>
          <Link to="/" className="config-exit">Exit Panel</Link>
        </header>

        <nav className="config-tabs">
          <button className={activeTab === "environment" ? "active" : ""} onClick={() => setActiveTab("environment")}>Environment</button>
          <button className={activeTab === "endpoints" ? "active" : ""} onClick={() => setActiveTab("endpoints")}>Endpoints</button>
          <button className={activeTab === "actions" ? "active" : ""} onClick={() => setActiveTab("actions")}>System Actions</button>
          <button className={activeTab === "features" ? "active" : ""} onClick={() => setActiveTab("features")}>Features</button>
          <button className={activeTab === "bot-test" ? "active" : ""} onClick={() => setActiveTab("bot-test")}>AI Bot Test</button>
          <button className={activeTab === "sms-test" ? "active" : ""} onClick={() => setActiveTab("sms-test")}>SMS/Call Test</button>
        </nav>

        <div className="config-container">
          {activeTab === "environment" && (
            <section className="config-section fade-in">
              <h2 className="config-section-title">System Environment</h2>
              <div className="config-grid">
                <div className="config-card">
                  <span className="config-card-label">Environment</span>
                  <div className="config-card-value">
                    <span className="config-status status-online">{devConfig.env}</span>
                  </div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Version</span>
                  <div className="config-card-value">{devConfig.version}</div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Last Sync</span>
                  <div className="config-card-value">{devConfig.lastSync}</div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "endpoints" && (
            <section className="config-section fade-in">
              <h2 className="config-section-title">Service Endpoints</h2>
              <div className="config-grid">
                <div className="config-card">
                  <span className="config-card-label">Supabase URL</span>
                  <div className="config-card-value">{devConfig.apiEndpoint}</div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Netlify Domain</span>
                  <div className="config-card-value">{devConfig.netlifySite}</div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Google Maps API</span>
                  <div className="config-card-value">{devConfig.googleMaps}</div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">WhatsApp Target</span>
                  <div className="config-card-value">{devConfig.whatsApp}</div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "actions" && (
            <section className="config-section fade-in">
              <h2 className="config-section-title">System Actions</h2>
              <div className="config-actions">
                <button 
                  className="config-button danger"
                  onClick={() => setShowConfirm(true)}
                >
                  Clear Local Cache & Reset Sessions
                </button>
                <p className="config-action-note">
                  This will log you out and clear all local storage, cookies, and temporary data.
                </p>
              </div>
            </section>
          )}

          {activeTab === "features" && (
            <section className="config-section fade-in">
              <h2 className="config-section-title">Active Features & Integrations</h2>
              <div className="config-grid">
                <div className="config-card">
                  <span className="config-card-label">AI Engine (Lucy)</span>
                  <div className="config-card-value">
                    <span className={`config-status ${systemHealth.openai ? "status-online" : "status-offline"}`}>
                      {systemHealth.openai ? "Connected" : "Keys Missing"}
                    </span>
                  </div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Twilio WhatsApp Bot</span>
                  <div className="config-card-value">
                    <span className={`config-status ${systemHealth.twilio ? "status-online" : "status-offline"}`}>
                      {systemHealth.twilio ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Supabase Database</span>
                  <div className="config-card-value">
                    <span className={`config-status ${systemHealth.supabase ? "status-online" : "status-offline"}`}>
                      {systemHealth.supabase ? "Linked" : "Disconnected"}
                    </span>
                  </div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Email Service (Resend)</span>
                  <div className="config-card-value">
                    <span className={`config-status ${systemHealth.resend ? "status-online" : "status-offline"}`}>
                      {systemHealth.resend ? "Ready" : "Not Set"}
                    </span>
                  </div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">Google Maps Engine</span>
                  <div className="config-card-value">
                    <span className={`config-status ${systemHealth.googleMaps ? "status-online" : "status-offline"}`}>
                      {systemHealth.googleMaps ? "Configured" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div className="config-card">
                  <span className="config-card-label">n8n Workflow Automation</span>
                  <div className="config-card-value">
                    <span className={`config-status ${systemHealth.n8n ? "status-online" : "status-offline"}`}>
                      {systemHealth.n8n ? "Integrated" : "Pending"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "bot-test" && (
            <section className="config-section fade-in">
              <h2 className="config-section-title">AI Bot Testing</h2>
              <div className="bot-test-shell">
                <form onSubmit={handleBotTest} className="bot-test-form">
                  <input 
                    type="text" 
                    placeholder="Ask the AI Concierge something..."
                    value={botQuery}
                    onChange={(e) => setBotQuery(e.target.value)}
                    className="config-input"
                  />
                  <button type="submit" className="config-button" disabled={isBotThinking}>
                    {isBotThinking ? "Thinking..." : "Send Query"}
                  </button>
                </form>
                {botResponse && (
                  <div className="bot-test-response">
                    <span className="response-label">AI Response:</span>
                    <p>{botResponse}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === "sms-test" && (
            <section className="config-section fade-in">
              <div className="section-header-row">
                <h2 className="config-section-title">Twilio Communication Test</h2>
                <div className="sandbox-toggle" onClick={() => setIsSandbox(!isSandbox)}>
                  <span className="sandbox-label">Sandbox Mode</span>
                  <div className={`toggle-switch ${isSandbox ? "active" : ""}`}></div>
                </div>
              </div>
              <div className="bot-test-shell">
                <form onSubmit={handleSmsTest} className="bot-test-form-col">
                  <div className="input-group">
                    <span className="input-label">To (with country code)</span>
                    <input 
                      type="text" 
                      placeholder="+1234567890"
                      value={testSmsTo}
                      onChange={(e) => setTestSmsTo(e.target.value)}
                      className="config-input"
                    />
                  </div>
                  <div className="input-group">
                    <span className="input-label">Test Message</span>
                    <input 
                      type="text" 
                      placeholder="Type your test message..."
                      value={testSmsMsg}
                      onChange={(e) => setTestSmsMsg(e.target.value)}
                      className="config-input"
                    />
                  </div>
                  <button type="submit" className="config-button" disabled={isSendingSms}>
                    {isSendingSms ? "Sending..." : "Send Test SMS"}
                  </button>
                </form>
                {smsResult && (
                  <div className={`bot-test-response ${smsResult.success ? "" : "error"}`}>
                    <span className="response-label">{smsResult.success ? "Twilio SID" : "Error"}</span>
                    <p>{smsResult.message}</p>
                  </div>
                )}
                
                <div className="test-divider">OR</div>
                
                <div className="config-actions">
                  <button 
                    className={`config-button ${isCalling ? "loading" : ""}`}
                    onClick={() => setShowCallConfirm(true)}
                    disabled={isCalling}
                  >
                    {isCalling ? `Calling: ${callStatus}` : "Initiate Test Call"}
                  </button>
                  {isCalling && <p className="call-status-indicator">{callStatus}</p>}
                  <p className="config-action-note">Calls require an active TwiML configuration.</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Confirmation Modals */}
      {showConfirm && (
        <div className="config-modal-overlay">
          <div className="config-modal">
            <h3>Confirm Reset</h3>
            <p>Are you sure you want to clear all local sessions? You will be logged out immediately.</p>
            <div className="config-modal-actions">
              <button className="modal-btn-cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button 
                className={`modal-btn-confirm ${isClearing ? "loading" : ""}`}
                onClick={handleClearCache}
                disabled={isClearing}
              >
                {isClearing ? "Resetting..." : "Yes, Clear Cache"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCallConfirm && (
        <div className="config-modal-overlay">
          <div className="config-modal">
            <h3>Start Test Call?</h3>
            <p>This will initiate a voice call simulation to your configured phone number.</p>
            <div className="config-modal-actions">
              <button className="modal-btn-cancel" onClick={() => setShowCallConfirm(false)}>Cancel</button>
              <button className="modal-btn-confirm" onClick={handleCallTest}>Start Call</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingConfigOlsPage;
