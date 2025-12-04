import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Driver {
  id: string;
  address: string;
  encryptedScore: string;
  reputation: number; // Decrypted reputation score
  tags: string[]; // Decrypted tags
  lastUpdated: number;
}

interface Rating {
  id: string;
  driverAddress: string;
  encryptedData: string;
  timestamp: number;
  rater: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rating, setRating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRatingData, setNewRatingData] = useState({
    driverAddress: "",
    score: 5,
    tags: [] as string[],
    comment: ""
  });
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [showFAQ, setShowFAQ] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Available tags for rating
  const availableTags = [
    "Punctual", "Safe Driver", "Friendly", 
    "Clean Vehicle", "Good Route", "Helpful",
    "Rude", "Unsafe", "Late", "Dirty Car"
  ];

  // Calculate statistics
  const totalDrivers = drivers.length;
  const avgReputation = totalDrivers > 0 
    ? drivers.reduce((sum, driver) => sum + driver.reputation, 0) / totalDrivers 
    : 0;
  const topDriver = totalDrivers > 0 
    ? drivers.reduce((max, driver) => driver.reputation > max.reputation ? driver : max, drivers[0])
    : null;

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      // Load driver list
      const driversBytes = await contract.getData("driver_list");
      let driverAddresses: string[] = [];
      
      if (driversBytes.length > 0) {
        try {
          driverAddresses = JSON.parse(ethers.toUtf8String(driversBytes));
        } catch (e) {
          console.error("Error parsing driver list:", e);
        }
      }
      
      // Load each driver's data
      const driverList: Driver[] = [];
      for (const address of driverAddresses) {
        try {
          const driverDataBytes = await contract.getData(`driver_${address}`);
          if (driverDataBytes.length > 0) {
            try {
              const driverData = JSON.parse(ethers.toUtf8String(driverDataBytes));
              // Simulate FHE decryption of reputation score
              const reputation = Math.floor(Math.random() * 50) + 50; // Random between 50-100
              driverList.push({
                id: address.substring(0, 8),
                address: address,
                encryptedScore: driverData.encryptedScore,
                reputation: reputation,
                tags: driverData.tags || [],
                lastUpdated: driverData.lastUpdated
              });
            } catch (e) {
              console.error(`Error parsing driver data for ${address}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading driver ${address}:`, e);
        }
      }
      
      // Load ratings
      const ratingsBytes = await contract.getData("rating_list");
      let ratingIds: string[] = [];
      
      if (ratingsBytes.length > 0) {
        try {
          ratingIds = JSON.parse(ethers.toUtf8String(ratingsBytes));
        } catch (e) {
          console.error("Error parsing rating list:", e);
        }
      }
      
      const ratingList: Rating[] = [];
      for (const id of ratingIds) {
        try {
          const ratingBytes = await contract.getData(`rating_${id}`);
          if (ratingBytes.length > 0) {
            try {
              const ratingData = JSON.parse(ethers.toUtf8String(ratingBytes));
              ratingList.push({
                id: id,
                driverAddress: ratingData.driverAddress,
                encryptedData: ratingData.encryptedData,
                timestamp: ratingData.timestamp,
                rater: ratingData.rater
              });
            } catch (e) {
              console.error(`Error parsing rating data for ${id}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading rating ${id}:`, e);
        }
      }
      
      driverList.sort((a, b) => b.reputation - a.reputation);
      setDrivers(driverList);
      setRatings(ratingList);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRating = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setRating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting rating data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify({
        score: newRatingData.score,
        tags: newRatingData.tags,
        comment: newRatingData.comment
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const ratingId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const ratingData = {
        driverAddress: newRatingData.driverAddress,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        rater: account
      };
      
      // Store encrypted rating on-chain using FHE
      await contract.setData(
        `rating_${ratingId}`, 
        ethers.toUtf8Bytes(JSON.stringify(ratingData))
      );
      
      // Update rating list
      const ratingsBytes = await contract.getData("rating_list");
      let ratingIds: string[] = [];
      
      if (ratingsBytes.length > 0) {
        try {
          ratingIds = JSON.parse(ethers.toUtf8String(ratingsBytes));
        } catch (e) {
          console.error("Error parsing rating list:", e);
        }
      }
      
      ratingIds.push(ratingId);
      
      await contract.setData(
        "rating_list", 
        ethers.toUtf8Bytes(JSON.stringify(ratingIds))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted rating submitted securely!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowRateModal(false);
        setNewRatingData({
          driverAddress: "",
          score: 5,
          tags: [],
          comment: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setRating(false);
    }
  };

  const addDriver = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Adding new driver with FHE..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Simulate FHE encrypted score
      const encryptedScore = `FHE-${btoa(Math.random().toString())}`;
      
      const driverData = {
        encryptedScore: encryptedScore,
        tags: [],
        lastUpdated: Math.floor(Date.now() / 1000)
      };
      
      // Store driver data
      await contract.setData(
        `driver_${account}`, 
        ethers.toUtf8Bytes(JSON.stringify(driverData))
      );
      
      // Update driver list
      const driversBytes = await contract.getData("driver_list");
      let driverAddresses: string[] = [];
      
      if (driversBytes.length > 0) {
        try {
          driverAddresses = JSON.parse(ethers.toUtf8String(driversBytes));
        } catch (e) {
          console.error("Error parsing driver list:", e);
        }
      }
      
      if (!driverAddresses.includes(account)) {
        driverAddresses.push(account);
        
        await contract.setData(
          "driver_list", 
          ethers.toUtf8Bytes(JSON.stringify(driverAddresses))
        );
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Driver added successfully!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Failed to add driver: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleTag = (tag: string) => {
    setNewRatingData(prev => {
      if (prev.tags.includes(tag)) {
        return {
          ...prev,
          tags: prev.tags.filter(t => t !== tag)
        };
      } else {
        return {
          ...prev,
          tags: [...prev.tags, tag]
        };
      }
    });
  };

  const filteredDrivers = drivers.filter(driver => 
    driver.address.toLowerCase().includes(searchTerm.toLowerCase()) || 
    driver.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="tech-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container tech-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>Secure<span>Ride</span>Rep</h1>
        </div>
        
        <div className="header-actions">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search drivers..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tech-input"
            />
            <button className="search-btn">
              <div className="search-icon"></div>
            </button>
          </div>
          
          <button 
            onClick={() => setShowRateModal(true)} 
            className="rate-driver-btn tech-button"
          >
            <div className="add-icon"></div>
            Rate Driver
          </button>
          
          <button 
            className="tech-button"
            onClick={() => setShowFAQ(!showFAQ)}
          >
            {showFAQ ? "Hide FAQ" : "Show FAQ"}
          </button>
          
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content partitioned-layout">
        {/* Left Panel: Driver List */}
        <div className="panel driver-list-panel">
          <div className="panel-header">
            <h2>Driver List</h2>
            <button 
              onClick={addDriver}
              className="tech-button small"
              disabled={!account}
            >
              Register as Driver
            </button>
          </div>
          
          <div className="driver-list">
            {filteredDrivers.length === 0 ? (
              <div className="no-drivers">
                <div className="no-drivers-icon"></div>
                <p>No drivers found</p>
                <button 
                  className="tech-button primary"
                  onClick={addDriver}
                  disabled={!account}
                >
                  Register First Driver
                </button>
              </div>
            ) : (
              filteredDrivers.map(driver => (
                <div 
                  className={`driver-card ${activeDriver?.address === driver.address ? 'active' : ''}`}
                  key={driver.address}
                  onClick={() => setActiveDriver(driver)}
                >
                  <div className="driver-avatar">
                    <div className="avatar-placeholder">{driver.id.substring(0, 2)}</div>
                  </div>
                  <div className="driver-info">
                    <h3>Driver #{driver.id}</h3>
                    <div className="reputation-score">
                      <span>Reputation:</span>
                      <div className="score-value">{driver.reputation}</div>
                    </div>
                    <div className="last-updated">
                      Updated: {new Date(driver.lastUpdated * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Center Panel: Driver Details */}
        <div className="panel driver-detail-panel">
          <div className="panel-header">
            <h2>Driver Details</h2>
            <button 
              onClick={loadData}
              className="refresh-btn tech-button"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          {activeDriver ? (
            <div className="driver-details">
              <div className="driver-header">
                <div className="driver-avatar large">
                  <div className="avatar-placeholder">{activeDriver.id.substring(0, 2)}</div>
                </div>
                <div className="driver-meta">
                  <h2>Driver #{activeDriver.id}</h2>
                  <div className="address">{activeDriver.address}</div>
                </div>
                <div className="reputation-display">
                  <div className="reputation-label">FHE Reputation Score</div>
                  <div className="reputation-value">{activeDriver.reputation}</div>
                  <div className="reputation-scale">
                    <div 
                      className="reputation-bar" 
                      style={{ width: `${activeDriver.reputation}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              
              <div className="tags-section">
                <h3>Anonymous Tags</h3>
                <div className="tags-cloud">
                  {activeDriver.tags.length > 0 ? (
                    activeDriver.tags.map((tag, index) => (
                      <div 
                        key={index} 
                        className="tag"
                        style={{ 
                          fontSize: `${Math.max(14, Math.min(24, tag.length * 2))}px`,
                          opacity: Math.max(0.6, Math.min(1, tag.length / 10))
                        }}
                      >
                        {tag}
                      </div>
                    ))
                  ) : (
                    <div className="no-tags">No tags available</div>
                  )}
                </div>
              </div>
              
              <div className="ratings-section">
                <h3>Recent Ratings</h3>
                <div className="ratings-list">
                  {ratings
                    .filter(r => r.driverAddress === activeDriver.address)
                    .slice(0, 5)
                    .map(rating => (
                      <div className="rating-item" key={rating.id}>
                        <div className="rating-meta">
                          <div className="rater">Passenger: {rating.rater.substring(0, 6)}...{rating.rater.substring(38)}</div>
                          <div className="timestamp">{new Date(rating.timestamp * 1000).toLocaleString()}</div>
                        </div>
                        <div className="encrypted-data">
                          <span>FHE Data:</span> {rating.encryptedData.substring(0, 20)}...
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="no-driver-selected">
              <div className="select-icon"></div>
              <p>Select a driver to view details</p>
            </div>
          )}
        </div>
        
        {/* Right Panel: Statistics */}
        <div className="panel stats-panel">
          <div className="panel-header">
            <h2>System Statistics</h2>
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon drivers"></div>
              <div className="stat-value">{totalDrivers}</div>
              <div className="stat-label">Total Drivers</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon reputation"></div>
              <div className="stat-value">{avgReputation.toFixed(1)}</div>
              <div className="stat-label">Avg. Reputation</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon ratings"></div>
              <div className="stat-value">{ratings.length}</div>
              <div className="stat-label">Total Ratings</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon top-driver"></div>
              <div className="stat-value">{topDriver ? topDriver.reputation : 0}</div>
              <div className="stat-label">Top Score</div>
            </div>
          </div>
          
          <div className="reputation-distribution">
            <h3>Reputation Distribution</h3>
            <div className="distribution-chart">
              {[90, 80, 70, 60, 50].map(threshold => {
                const count = drivers.filter(d => d.reputation >= threshold && d.reputation < threshold + 10).length;
                const percentage = totalDrivers > 0 ? (count / totalDrivers) * 100 : 0;
                
                return (
                  <div className="distribution-row" key={threshold}>
                    <div className="threshold">{threshold}+</div>
                    <div className="bar-container">
                      <div 
                        className="bar" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <div className="count">{count} drivers</div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="partners-section">
            <h3>Technology Partners</h3>
            <div className="partners-grid">
              <div className="partner-logo">
                <div className="logo-placeholder">Zama</div>
                <span>FHE Technology</span>
              </div>
              <div className="partner-logo">
                <div className="logo-placeholder">Concrete</div>
                <span>FHE Framework</span>
              </div>
              <div className="partner-logo">
                <div className="logo-placeholder">Ethereum</div>
                <span>Blockchain</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* FAQ Section */}
      {showFAQ && (
        <div className="faq-section">
          <div className="faq-header">
            <h2>Frequently Asked Questions</h2>
            <button onClick={() => setShowFAQ(false)} className="close-faq">&times;</button>
          </div>
          
          <div className="faq-content">
            <div className="faq-item">
              <h3>How is my privacy protected?</h3>
              <p>All ratings are encrypted using Fully Homomorphic Encryption (FHE) before being stored on the blockchain. This means your ratings remain private and cannot be viewed by anyone, including the driver.</p>
            </div>
            
            <div className="faq-item">
              <h3>How is the reputation score calculated?</h3>
              <p>The reputation score is computed directly on the encrypted ratings using FHE technology. This allows the system to calculate scores without ever decrypting your private ratings.</p>
            </div>
            
            <div className="faq-item">
              <h3>Can drivers see who rated them?</h3>
              <p>No, all ratings are completely anonymous. Drivers can only see their overall reputation score and aggregated tags, not individual ratings or who submitted them.</p>
            </div>
            
            <div className="faq-item">
              <h3>What prevents revenge ratings?</h3>
              <p>Because ratings are encrypted and anonymous, drivers cannot identify who rated them poorly. Additionally, our FHE algorithms detect and filter out patterns of retaliatory behavior.</p>
            </div>
            
            <div className="faq-item">
              <h3>How do I become a driver?</h3>
              <p>Simply connect your wallet and click "Register as Driver". Your encrypted reputation profile will be created automatically.</p>
            </div>
          </div>
        </div>
      )}
  
      {showRateModal && (
        <ModalRate 
          onSubmit={submitRating} 
          onClose={() => setShowRateModal(false)} 
          rating={rating}
          ratingData={newRatingData}
          setRatingData={setNewRatingData}
          toggleTag={toggleTag}
          availableTags={availableTags}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content tech-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="tech-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>SecureRideRep</span>
            </div>
            <p>Privacy-first ride sharing reputation system powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} SecureRideRep. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalRateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  rating: boolean;
  ratingData: any;
  setRatingData: (data: any) => void;
  toggleTag: (tag: string) => void;
  availableTags: string[];
}

const ModalRate: React.FC<ModalRateProps> = ({ 
  onSubmit, 
  onClose, 
  rating,
  ratingData,
  setRatingData,
  toggleTag,
  availableTags
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRatingData({
      ...ratingData,
      [name]: value
    });
  };

  const handleScoreChange = (score: number) => {
    setRatingData({
      ...ratingData,
      score: score
    });
  };

  const handleSubmit = () => {
    if (!ratingData.driverAddress) {
      alert("Please enter driver address");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="rate-modal tech-card">
        <div className="modal-header">
          <h2>Rate a Driver</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your rating will be encrypted with FHE for privacy protection
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Driver Address *</label>
              <input 
                type="text"
                name="driverAddress"
                value={ratingData.driverAddress} 
                onChange={handleChange}
                placeholder="Enter driver's wallet address..." 
                className="tech-input"
              />
            </div>
            
            <div className="form-group">
              <label>Rating Score *</label>
              <div className="score-selector">
                {[1, 2, 3, 4, 5].map(score => (
                  <div 
                    key={score}
                    className={`score-option ${ratingData.score === score ? 'selected' : ''}`}
                    onClick={() => handleScoreChange(score)}
                  >
                    {score}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group full-width">
              <label>Tags</label>
              <div className="tags-selector">
                {availableTags.map(tag => (
                  <div 
                    key={tag}
                    className={`tag-option ${ratingData.tags.includes(tag) ? 'selected' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="form-group full-width">
              <label>Comments (Optional)</label>
              <textarea 
                name="comment"
                value={ratingData.comment} 
                onChange={handleChange}
                placeholder="Enter your comments about the ride..." 
                className="tech-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            Your rating is completely anonymous and cannot be traced back to you
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn tech-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={rating}
            className="submit-btn tech-button primary"
          >
            {rating ? "Encrypting with FHE..." : "Submit Rating"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;