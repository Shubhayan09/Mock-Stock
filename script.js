// Airtable Configuration
const AIRTABLE_API_KEY = 'patw5S6fdFTgeqbRJ.1800aa371612e0f70bff66fec491e03a1c7e86183cb73fe0a319c926afb72290';
const AIRTABLE_BASE_ID = 'appJBjancs1MLK3vJ';
const AIRTABLE_TABLE_NAME = 'Stock Prices';

// Application State
let initialBudget = 1000000;
let remainingBudget = initialBudget;
let stocksList = [];
let pricesMap = {};
let positions = {};
let orders = [];
let teams = new Set();
let bidOffers = [];
let currentSelectedStock = '';
let nifty10Index = 10000;
let previousPrices = {};

// DOM Elements
const budgetTracker = document.getElementById('budget-tracker');
const stockSelect = document.getElementById('stock-select');
const stockPrice = document.getElementById('stock-price');
const quantityInput = document.getElementById('quantity');
const totalPriceInput = document.getElementById('total-price');
const teamNameInput = document.getElementById('team-name');
const tradeForm = document.getElementById('trade-form');
const activateBidBtn = document.getElementById('activate-bid');
const bidDialog = document.getElementById('bid-dialog');
const bidForm = document.getElementById('bid-form');
const bidStockSelect = document.getElementById('bid-stock');
const bidTeamSelect = document.getElementById('bid-team');
const bidOffersModal = document.getElementById('bid-offers-modal');
const bidOffersList = document.getElementById('bid-offers-list');
const closeBidBtn = document.getElementById('close-bid');
const closeOffersBtn = document.getElementById('close-offers');

// Ticker Elements
const stockTicker = document.querySelector('.stock-ticker');
const niftyTicker = document.querySelector('.nifty-ticker');

// Chart Instances
let holdingsChart, pnlChart;

// Utility Functions
function formatCurrency(num) {
    return "₹" + num.toLocaleString('en-IN', {minimumFractionDigits: 2});
}

function getPLClass(value) {
    return value >= 0 ? 'positive' : 'negative';
}

function getPieColors(n) {
    const base = ['#E53935','#F4511E','#FB8C00','#FFB300','#7CB342','#00897B','#039BE5','#5E35B1'];
    return base.slice(0,n);
}

function getBarColors(n) {
    return Array(n).fill(0).map((_, i) => i % 2 === 0 ? '#E53935' : '#4CAF50');
}

// Ticker Functions
function updateStockTicker() {
    if (!stockTicker) {
        console.error("Stock ticker element not found");
        return;
    }

    let tickerHTML = '';
    stocksList.forEach(stock => {
        const price = pricesMap[stock] || 0;
        const prevPrice = previousPrices[stock] || price;
        const change = price - prevPrice;
        const changePercent = prevPrice ? ((change / prevPrice) * 100) : 0;
        
        tickerHTML += `
            <div class="ticker-item">
                <span class="ticker-symbol">${stock}</span>
                <span class="ticker-price">${formatCurrency(price)}</span>
                <span class="ticker-change ${change >= 0 ? 'positive' : 'negative'}">
                    ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)
                </span>
            </div>
        `;
        
        previousPrices[stock] = price;
    });
    stockTicker.innerHTML = tickerHTML;
}

function updateNifty10Index() {
    if (!niftyTicker || stocksList.length === 0) return;
    
    let totalPrices = 0;
    let validStocks = 0;
    
    stocksList.forEach(stock => {
        const price = pricesMap[stock];
        if (price && !isNaN(price)) {
            totalPrices += price;
            validStocks++;
        }
    });
    
    if (validStocks === 0) return;
    
    const avgPrice = totalPrices / validStocks;
    const prevNifty = nifty10Index;
    
    // Update index based on price changes (base of 10000)
    nifty10Index = 10000 * (avgPrice / 100);
    
    const change = nifty10Index - prevNifty;
    const changePercent = prevNifty ? ((change / prevNifty) * 100) : 0;
    
    niftyTicker.innerHTML = `
        <span class="nifty-value">${nifty10Index.toFixed(2)}</span>
        <span class="nifty-change ${change >= 0 ? 'positive' : 'negative'}">
            ${change >= 0 ? '+' : ''}${change.toFixed(2)}
        </span>
    `;
}

// Data Fetching
async function fetchStocksFromAirtable() {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?fields%5B%5D=Stock&fields%5B%5D=Price`;
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
        });
        const data = await response.json();
        
        stocksList = [];
        pricesMap = {};
        data.records.forEach(record => {
            const stock = record.fields.Stock;
            const price = parseFloat(record.fields.Price);
            stocksList.push(stock);
            pricesMap[stock] = price;
        });
        
        return { success: true, stocksList, pricesMap };
    } catch (error) {
        console.error("Error fetching stock data:", error);
        return { success: false, error: error.message };
    }
}

// Stock Selection Management
function populateStockSelect() {
    if (!stockSelect) return;
    
    stockSelect.innerHTML = '';
    stocksList.forEach(stock => {
        const option = document.createElement('option');
        option.value = stock;
        option.textContent = stock;
        stockSelect.appendChild(option);
    });
    
    if (currentSelectedStock && stocksList.includes(currentSelectedStock)) {
        stockSelect.value = currentSelectedStock;
    } else if (stocksList.length > 0) {
        currentSelectedStock = stocksList[0];
        stockSelect.value = currentSelectedStock;
    }
    
    if (bidStockSelect) {
        bidStockSelect.innerHTML = stockSelect.innerHTML;
    }
}

function updatePriceInput() {
    if (!stockSelect || !stockPrice) return;
    
    currentSelectedStock = stockSelect.value;
    const price = pricesMap[currentSelectedStock] || 0;
    stockPrice.value = price;
    calculateTotal();
}

function calculateTotal() {
    if (!stockPrice || !quantityInput || !totalPriceInput) return;
    
    const price = parseFloat(stockPrice.value) || 0;
    const qty = parseInt(quantityInput.value) || 0;
    totalPriceInput.value = (price * qty).toFixed(2);
}

// Trading Functions
function handleTradeSubmission(e) {
    e.preventDefault();
    
    if (!teamNameInput || !stockSelect || !stockPrice || !quantityInput) return;
    
    const team = teamNameInput.value.trim();
    const stock = stockSelect.value;
    const price = parseFloat(stockPrice.value);
    const qty = parseInt(quantityInput.value);
    const total = price * qty;
    const status = document.querySelector('input[name="action"]:checked')?.value;

    // Validation
    if (!team || !stock || !qty || price <= 0 || !status) {
        alert("Please fill all fields with valid values");
        return;
    }

    // Add team to tracked teams
    teams.add(team);

    // Check budget for buy orders
    if (status === "Buy" && remainingBudget < total) {
        alert("You have exceeded your budget!");
        return;
    }

    // Initialize position if it doesn't exist
    if (!positions[stock]) {
        positions[stock] = { qty: 0, buyLots: [], realizedPL: 0 };
    }
    
    const position = positions[stock];
    
    if (status === "Buy") {
        // Add new buy lot
        position.buyLots.push({ qty, price });
        position.qty += qty;
        remainingBudget -= total;
    } else {
        // Handle sell order with FIFO method
        if (position.qty < qty) {
            alert(`Insufficient holdings to sell. You currently own ${position.qty} units of ${stock}.`);
            return;
        }
        
        let qtyToSell = qty;
        let realizedPL = 0;
        
        // Process sell using FIFO (first in, first out)
        while (qtyToSell > 0 && position.buyLots.length > 0) {
            const firstLot = position.buyLots[0];
            
            if (firstLot.qty <= qtyToSell) {
                realizedPL += (price - firstLot.price) * firstLot.qty;
                qtyToSell -= firstLot.qty;
                position.buyLots.shift();
            } else {
                realizedPL += (price - firstLot.price) * qtyToSell;
                firstLot.qty -= qtyToSell;
                qtyToSell = 0;
            }
        }
        
        position.qty -= qty;
        position.realizedPL += realizedPL;
        remainingBudget += total;
    }

    // Record the order
    orders.push({
        team, 
        stock, 
        price, 
        qty, 
        total, 
        status, 
        time: new Date().toLocaleString()
    });

    // Reset form
    if (quantityInput) quantityInput.value = '';
    calculateTotal();

    // Update UI
    updateBudget();
    renderPositionsTable();
    renderOrdersTable();
    renderCharts();
    updateStockTicker();
    updateNifty10Index();
    
    // Update last updated time
    const updateTimeElement = document.getElementById('update-time');
    if (updateTimeElement) {
        updateTimeElement.textContent = new Date().toLocaleTimeString();
    }
}

// UI Rendering
function updateBudget() {
    if (!budgetTracker) return;
    
    const budgetElement = budgetTracker.querySelector('span');
    if (budgetElement) {
        budgetElement.textContent = formatCurrency(remainingBudget);
    }
}

function renderPositionsTable() {
    const container = document.getElementById('positions-table-container');
    if (!container) return;
    
    let html = `<table>
        <thead>
            <tr>
                <th>Stock</th>
                <th>Quantity</th>
                <th>Current Price</th>
                <th>Invested Value</th>
                <th>Current Value</th>
                <th>Unrealized P&L</th>
                <th>Realized P&L</th>
            </tr>
        </thead>
        <tbody>`;
    
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalUnrealized = 0;
    let totalRealized = 0;
    
    stocksList.forEach(stock => {
        const position = positions[stock] || { qty: 0, buyLots: [], realizedPL: 0 };
        const currentPrice = pricesMap[stock] || 0;
        
        // Calculate invested value (cost basis)
        const investedValue = position.buyLots.reduce((sum, lot) => sum + (lot.qty * lot.price), 0);
        
        // Calculate current value
        const currentValue = position.qty * currentPrice;
        
        // Calculate unrealized P&L for each lot
        const unrealizedPL = position.buyLots.reduce((sum, lot) => {
            return sum + ((currentPrice - lot.price) * lot.qty);
        }, 0);
        
        // Update totals
        totalInvested += investedValue;
        totalCurrent += currentValue;
        totalUnrealized += unrealizedPL;
        totalRealized += position.realizedPL;
        
        // Only show stocks with position or realized P&L
        if (position.qty > 0 || position.realizedPL !== 0) {
            html += `<tr>
                <td>${stock}</td>
                <td>${position.qty}</td>
                <td>${formatCurrency(currentPrice)}</td>
                <td>${formatCurrency(investedValue)}</td>
                <td>${formatCurrency(currentValue)}</td>
                <td class="${getPLClass(unrealizedPL)}">${formatCurrency(unrealizedPL)}</td>
                <td class="${getPLClass(position.realizedPL)}">${formatCurrency(position.realizedPL)}</td>
            </tr>`;
        }
    });
    
    // Add totals row
    html += `<tr class="total-row">
        <td colspan="3">Total</td>
        <td>${formatCurrency(totalInvested)}</td>
        <td>${formatCurrency(totalCurrent)}</td>
        <td class="${getPLClass(totalUnrealized)}">${formatCurrency(totalUnrealized)}</td>
        <td class="${getPLClass(totalRealized)}">${formatCurrency(totalRealized)}</td>
    </tr></tbody></table>`;
    
    container.innerHTML = html;
}

function renderOrdersTable() {
    const container = document.getElementById('orders-table-container');
    if (!container) return;
    
    let html = `<table>
        <thead>
            <tr>
                <th>Team</th>
                <th>Stock</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th>Time</th>
            </tr>
        </thead>
        <tbody>`;
    
    orders.forEach(order => {
        html += `<tr>
            <td>${order.team}</td>
            <td>${order.stock}</td>
            <td>${formatCurrency(order.price)}</td>
            <td>${order.qty}</td>
            <td>${formatCurrency(order.total)}</td>
            <td>${order.status}</td>
            <td>${order.time}</td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderCharts() {
    // Holdings Pie Chart
    const holdingsLabels = [];
    const holdingsData = [];
    
    stocksList.forEach(stock => {
        const position = positions[stock] || { qty: 0 };
        if (position.qty > 0) {
            holdingsLabels.push(stock);
            holdingsData.push(position.qty * (pricesMap[stock] || 0));
        }
    });
    
    const holdingsCtx = document.getElementById('holdings-chart')?.getContext('2d');
    if (holdingsCtx) {
        if (!holdingsChart) {
            holdingsChart = new Chart(holdingsCtx, {
                type: 'pie',
                data: {
                    labels: holdingsLabels,
                    datasets: [{
                        label: "Holdings",
                        data: holdingsData,
                        backgroundColor: getPieColors(holdingsLabels.length)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        }
                    }
                }
            });
        } else {
            holdingsChart.data.labels = holdingsLabels;
            holdingsChart.data.datasets[0].data = holdingsData;
            holdingsChart.update();
        }
    }
    
    // P&L Bar Chart
    const pnlLabels = [];
    const pnlData = [];
    
    stocksList.forEach(stock => {
        const position = positions[stock] || { qty: 0, buyLots: [], realizedPL: 0 };
        const currentPrice = pricesMap[stock] || 0;
        
        const investedValue = position.buyLots.reduce((sum, lot) => sum + (lot.qty * lot.price), 0);
        const currentValue = position.qty * currentPrice;
        const unrealizedPL = currentValue - investedValue;
        const totalPL = position.realizedPL + unrealizedPL;
        
        if (position.qty > 0 || position.realizedPL !== 0) {
            pnlLabels.push(stock);
            pnlData.push(totalPL);
        }
    });
    
    const pnlCtx = document.getElementById('pnl-chart')?.getContext('2d');
    if (pnlCtx) {
        if (!pnlChart) {
            pnlChart = new Chart(pnlCtx, {
                type: 'bar',
                data: {
                    labels: pnlLabels,
                    datasets: [{
                        label: "P&L",
                        data: pnlData,
                        backgroundColor: getBarColors(pnlLabels.length)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(0, 0, 0, 0.1)' }
                        },
                        x: {
                            grid: { display: false }
                        }
                    }
                }
            });
        } else {
            pnlChart.data.labels = pnlLabels;
            pnlChart.data.datasets[0].data = pnlData;
            pnlChart.update();
        }
    }
}

// Bid System
function showBidDialog() {
    if (!bidDialog || !bidStockSelect || !bidTeamSelect) return;
    
    bidDialog.classList.add('active');
    bidStockSelect.innerHTML = stockSelect.innerHTML;
    bidTeamSelect.innerHTML = '';
    
    // Get current team
    const currentTeam = teamNameInput?.value.trim();
    
    // Populate teams dropdown excluding current team
    Array.from(teams)
        .filter(team => team !== currentTeam)
        .forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            bidTeamSelect.appendChild(option);
        });
}

function handleBidSubmission(e) {
    e.preventDefault();
    
    if (!bidStockSelect || !bidTeamSelect) return;
    
    const fromTeam = teamNameInput?.value.trim() || "Alpha";
    const stock = bidStockSelect.value;
    const price = parseFloat(document.getElementById('bid-price')?.value);
    const qty = parseInt(document.getElementById('bid-quantity')?.value);
    const toTeam = bidTeamSelect.value;
    
    if (!stock || price <= 0 || qty <= 0 || !toTeam) {
        alert("Please fill all bid fields with valid values");
        return;
    }
    
    bidOffers.push({ fromTeam, toTeam, stock, price, qty });
    bidDialog.classList.remove('active');
    
    // Show offer to receiver if they're the current team
    if (teamNameInput?.value.trim() === toTeam) {
        showBidOffersModal();
    }
    
    alert(`Bid offer sent to team ${toTeam}`);
}

function showBidOffersModal() {
    if (!bidOffersModal) return;
    
    bidOffersModal.classList.add('active');
    renderBidOffers();
}

function renderBidOffers() {
    if (!bidOffersList) return;
    
    const currentTeam = teamNameInput?.value.trim();
    const offers = bidOffers.filter(bid => bid.toTeam === currentTeam);
    
    if (offers.length === 0) {
        bidOffersList.innerHTML = "<div class='no-offers'>No bid offers for your team.</div>";
        return;
    }
    
    bidOffersList.innerHTML = '';
    offers.forEach((offer, index) => {
        const offerElement = document.createElement('div');
        offerElement.className = 'offer-item';
        offerElement.innerHTML = `
            <div class="offer-details">
                <strong>${offer.fromTeam}</strong> offers 
                ${offer.qty} x ${offer.stock} @ ${formatCurrency(offer.price)}
                <small>Total: ${formatCurrency(offer.price * offer.qty)}</small>
            </div>
            <div class="offer-actions">
                <button class="accept-btn"><i class="fas fa-check"></i> Accept</button>
                <button class="decline-btn"><i class="fas fa-times"></i> Decline</button>
            </div>
        `;
        
        offerElement.querySelector('.accept-btn')?.addEventListener('click', () => acceptBidOffer(index, offer));
        offerElement.querySelector('.decline-btn')?.addEventListener('click', () => declineBidOffer(index));
        
        bidOffersList.appendChild(offerElement);
    });
}

function acceptBidOffer(index, offer) {
    // Initialize position if it doesn't exist
    if (!positions[offer.stock]) {
        positions[offer.stock] = { qty: 0, buyLots: [], realizedPL: 0 };
    }
    
    const position = positions[offer.stock];
    
    // Add to buy lots
    position.buyLots.push({ qty: offer.qty, price: offer.price });
    position.qty += offer.qty;
    
    // Record the order
    orders.push({
        team: offer.toTeam,
        stock: offer.stock,
        price: offer.price,
        qty: offer.qty,
        total: offer.price * offer.qty,
        status: "Buy(Bid)",
        time: new Date().toLocaleString()
    });
    
    // Remove the offer
    bidOffers.splice(index, 1);
    
    // Update UI
    renderBidOffers();
    renderPositionsTable();
    renderOrdersTable();
    renderCharts();
    updateStockTicker();
    updateNifty10Index();
    
    alert("Bid accepted!");
}

function declineBidOffer(index) {
    bidOffers.splice(index, 1);
    renderBidOffers();
    alert("Bid declined!");
}

// Tab Switching
document.querySelectorAll('nav li.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        // Remove active class from all tabs
        document.querySelectorAll('nav li.tab').forEach(t => t.classList.remove('active'));
        
        // Add active class to clicked tab
        this.classList.add('active');
        
        // Get the tab to show
        const tabToShow = this.getAttribute('data-tab');
        
        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        
        // Show the selected tab pane
        const paneToShow = document.getElementById(`${tabToShow}-tab`);
        if (paneToShow) {
            paneToShow.classList.add('active');
        }
    });
});

// Trade Action Toggle
document.querySelectorAll('input[name="action"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const submitBtn = document.querySelector('.submit-trade');
        if (submitBtn) {
            if (this.value === 'Buy') {
                submitBtn.className = 'submit-trade buy';
                submitBtn.innerHTML = '<i class="fas fa-arrow-up"></i> Place Buy Order';
            } else {
                submitBtn.className = 'submit-trade sell';
                submitBtn.innerHTML = '<i class="fas fa-arrow-down"></i> Place Sell Order';
            }
        }
    });
});

// Periodic Data Refresh
async function periodicUpdate() {
    try {
        const { success } = await fetchStocksFromAirtable();
        if (success) {
            populateStockSelect();
            updatePriceInput();
            renderPositionsTable();
            renderOrdersTable();
            renderCharts();
            updateStockTicker();
            updateNifty10Index();
        }
    } catch (error) {
        console.error("Error during periodic update:", error);
    }
    
    setTimeout(periodicUpdate, 5000);
}

// Team Name Tracking
teamNameInput?.addEventListener('input', function() {
    const team = this.value.trim();
    if (team) {
        teams.add(team);
    }
    showBidOffersModal();
});

// Event Listeners
tradeForm?.addEventListener('submit', handleTradeSubmission);
stockSelect?.addEventListener('change', updatePriceInput);
quantityInput?.addEventListener('input', calculateTotal);
activateBidBtn?.addEventListener('click', showBidDialog);
bidForm?.addEventListener('submit', handleBidSubmission);
closeBidBtn?.addEventListener('click', () => bidDialog?.classList.remove('active'));
closeOffersBtn?.addEventListener('click', () => bidOffersModal?.classList.remove('active'));

// Initialize Application
async function initializeApp() {
    try {
        // Load initial data
        await fetchStocksFromAirtable();
        
        // Set up initial UI
        populateStockSelect();
        updatePriceInput();
        updateBudget();
        renderPositionsTable();
        renderOrdersTable();
        renderCharts();
        updateStockTicker();
        updateNifty10Index();
        
        // Add current team if set
        if (teamNameInput?.value.trim()) {
            teams.add(teamNameInput.value.trim());
        }
        
        // Start periodic updates
        periodicUpdate();
    } catch (error) {
        console.error("Failed to initialize application:", error);
        alert("Failed to initialize application. Please check console for details.");
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);