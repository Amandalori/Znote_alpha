document.addEventListener('DOMContentLoaded', () => {
    
    
    const DB_NAME = 'Z_Note_Alphatest077';
    const DB_VERSION = 1 
    let dbInstance;
    let itemToDelete = null;
    let html5QrCode;
    let scannerCallback = null;

    const openDatabase = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;
                if (event.oldVersion < 1) {
                    if (!db.objectStoreNames.contains('products')) {
                        const productsStore = db.createObjectStore('products', { keyPath: 'id' });
                        productsStore.createIndex('categoryId', 'categoryId', { unique: false });
                        productsStore.createIndex('name', 'name', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('categories')) {
                        db.createObjectStore('categories', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('stock')) {
                        const stockStore = db.createObjectStore('stock', { keyPath: 'productId' });
                        stockStore.createIndex('quantity', 'quantity', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('purchases')) {
                        const purchasesStore = db.createObjectStore('purchases', { keyPath: 'id' });
                        purchasesStore.createIndex('dateTime', 'dateTime', { unique: false });
                        purchasesStore.createIndex('productId', 'productId', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('orders')) {
                        const ordersStore = db.createObjectStore('orders', { keyPath: 'id' });
                        ordersStore.createIndex('date', 'date', { unique: false });
                        ordersStore.createIndex('status', 'status', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }
                }
                if (event.oldVersion < 2) {
                    const purchasesStore = transaction.objectStore('purchases');
                    if (!purchasesStore.indexNames.contains('expiryDate')) {
                        purchasesStore.createIndex('expiryDate', 'expiryDate', { unique: false });
                    }
                }
            };
            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };
            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };
        });
    };
    const db = {
        add: (storeName, item) => new Promise((resolve, reject) => {
            const t = dbInstance.transaction(storeName, 'readwrite');
            t.oncomplete = () => resolve(item);
            t.onerror = event => reject(event.target.error);
            t.objectStore(storeName).add(item);
        }),
        put: (storeName, item) => new Promise((resolve, reject) => {
            const t = dbInstance.transaction(storeName, 'readwrite');
            t.oncomplete = () => resolve(item);
            t.onerror = event => reject(event.target.error);
            t.objectStore(storeName).put(item);
        }),
        get: (storeName, key) => new Promise((resolve, reject) => {
            const t = dbInstance.transaction(storeName, 'readonly');
            const request = t.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
        }),
        getAll: (storeName, indexName, range) => new Promise((resolve, reject) => {
            const store = dbInstance.transaction(storeName, 'readonly').objectStore(storeName);
            const target = indexName ? store.index(indexName) : store;
            const request = range ? target.getAll(range) : target.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
        }),
        delete: (storeName, key) => new Promise((resolve, reject) => {
            const t = dbInstance.transaction(storeName, 'readwrite');
            t.oncomplete = () => resolve();
            t.onerror = event => reject(event.target.error);
            t.objectStore(storeName).delete(key);
        }),
        count: (storeName, indexName, range) => new Promise((resolve, reject) => {
            const store = dbInstance.transaction(storeName, 'readonly').objectStore(storeName);
            const target = indexName ? store.index(indexName) : store;
            const request = range ? target.count(range) : target.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
        }),
    };
    const initSampleData = async () => {
        const productCount = await db.count('products');
        if (productCount > 0) return;
        console.log("Initializing sample data for Retail/Bakery...");
        const categories = [ { id: 'cat1', name: 'Electronics' }, { id: 'cat2', name: 'Apparel' }, { id: 'cat3', name: 'Groceries' }];
        const products = [
            { id: 'prod1', categoryId: 'cat1', name: 'Wireless Mouse', price: 25000, image: null, barcode: '1001' },
            { id: 'prod2', categoryId: 'cat2', name: 'T-Shirt (M)', price: 15000, image: null, barcode: '1002' },
            { id: 'prod3', categoryId: 'cat1', name: 'USB-C Cable', price: 8000, image: null, barcode: '1003' },
            { id: 'prod4', categoryId: 'cat3', name: 'Instant Noodles', price: 1500, image: null, barcode: '1004' },
        ];
        const stock = products.map(p => ({ productId: p.id, quantity: 50, lowThreshold: 10 }));
        try {
            await Promise.all(categories.map(c => db.add('categories', c)));
            await Promise.all(products.map(p => db.add('products', p)));
            await Promise.all(stock.map(s => db.add('stock', s)));
            await db.put('settings', { key: 'theme', value: 'dark' });
            await db.put('settings', { key: 'language', value: 'mm' });
            await db.put('settings', { key: 'taxRate', value: 0 });
            await db.put('settings', { key: 'receiptTitle', value: 'ကောင်းစံ Retail' });
            await db.put('settings', { key: 'appMode', value: 'retail' });
            console.log('Sample data initialized');
        } catch (error) {
            console.error('Error initializing sample data:', error);
        }
    };
    const state = {
        currentSection: 'notes',
        currentOrder: null,
        taxRate: 0,
        currentLanguage: 'en',
        appMode: 'retail',
        productsPage: 1,
        productsPerPage: 10,
        stockPage: 1, 
        stockPerPage: 10,
        categoriesPage: 1,
        categoriesPerPage: 10,
        expiringSoonPage: 1,
        expiringSoonPerPage: 10,
        saleHistoryPage: 1,
        saleHistoryPerPage: 10,
        filteredPurchases: [],
        filteredSales: [],
        reportData: null,
    };
    const UIElements = {
        sidebar: document.querySelector('.akmsidebar'),
        mainContent: document.querySelector('.akmmain-content'),
        menuToggle: document.querySelector('.akmmenu-toggle'),
        themeToggle: document.querySelector('.akmtheme-toggle'),
        sections: document.querySelectorAll('.content-section'),
        sidebarLinks: document.querySelectorAll('.akmmenu-link'),
        bottomNav: document.querySelector('.akmbottom-nav'),
        bottomNavLinks: document.querySelectorAll('.akmbottom-nav-link'),
        productModal: document.getElementById('product-modal'),
        productsTableBody: document.getElementById('products-table'),
        productsSearchInput: document.getElementById('products-search-input'),
        productCategoryFilter: document.getElementById('product-category-filter'),
        productsPagination: document.getElementById('products-pagination'),
        prevPageBtn: document.getElementById('prev-page-btn'),
        nextPageBtn: document.getElementById('next-page-btn'),
        paginationInfo: document.getElementById('pagination-info'),
        stockTableBody: document.getElementById('stock-table'),
        stockSearchInput: document.getElementById('stock-search-input'),
        stockCategoryFilter: document.getElementById('stock-category-filter'),
        stockPagination: document.getElementById('stock-pagination'),
        stockPrevPageBtn: document.getElementById('stock-prev-page-btn'),
        stockNextPageBtn: document.getElementById('stock-next-page-btn'),
        stockPaginationInfo: document.getElementById('stock-pagination-info'),
        categoriesTableBody: document.getElementById('categories-table'),
        categoriesPagination: document.getElementById('categories-pagination'),
        prevCategoryPageBtn: document.getElementById('prev-category-page-btn'),
        nextCategoryPageBtn: document.getElementById('next-category-page-btn'),
        categoryPaginationInfo: document.getElementById('category-pagination-info'),
        categoryTabs: document.getElementById('category-tabs'),
        productsGrid: document.getElementById('products-grid'),
        currentOrderId: document.getElementById('current-order-id'),
        orderItemsList: document.getElementById('order-items-list'),
        orderSubtotal: document.getElementById('order-subtotal'),
        orderDiscount: document.getElementById('order-discount'),
        orderTax: document.getElementById('order-tax'),
        orderTaxLabel: document.getElementById('order-tax-label'),
        orderTotal: document.getElementById('order-total'),
        orderPaymentMethod: document.getElementById('order-payment-method'),
        completeOrderBtn: document.getElementById('complete-order-btn'),
        cancelOrderBtn: document.getElementById('cancel-order-btn'),
        purchaseModal: document.getElementById('purchase-modal'),
        purchaseCategorySelect: document.getElementById('purchase-category'),
        purchaseProductSelect: document.getElementById('purchase-product'),
        taxRateSetting: document.getElementById('tax-rate-setting'),
        receiptTitleSetting: document.getElementById('receipt-title-setting'),
        languageSelect: document.getElementById('language-select'),
        appModeSelect: document.getElementById('app-mode-select'),
        deleteDataByMonthBtn: document.getElementById('delete-data-by-month-btn'),
        resetDataBtn: document.getElementById('reset-data-btn'),
        reportDate: document.getElementById('report-date'),
        reportMonth: document.getElementById('report-month'),
        reportYear: document.getElementById('report-year'),
        purchaseFilterType: document.getElementById('purchase-filter-type'),
        purchaseDateFilterGroup: document.getElementById('purchase-date-filter-group'),
        purchaseMonthFilterGroup: document.getElementById('purchase-month-filter-group'),
        purchaseFilterDate: document.getElementById('purchase-filter-date'),
        purchaseFilterMonth: document.getElementById('purchase-filter-month'),
        purchaseFilterYear: document.getElementById('purchase-filter-year'),
        saleHistoryTableBody: document.getElementById('sale-history-table'),
        saleHistoryPagination: document.getElementById('sale-history-pagination'),
        saleHistoryPrevPageBtn: document.getElementById('sale-history-prev-page-btn'),
        saleHistoryNextPageBtn: document.getElementById('sale-history-next-page-btn'),
        saleHistoryPaginationInfo: document.getElementById('sale-history-pagination-info'),
        saleHistoryFilterType: document.getElementById('sale-history-filter-type'),
        saleHistoryDateFilterGroup: document.getElementById('sale-history-date-filter-group'),
        saleHistoryMonthFilterGroup: document.getElementById('sale-history-month-filter-group'),
        saleHistoryFilterDate: document.getElementById('sale-history-filter-date'),
        saleHistoryFilterMonth: document.getElementById('sale-history-filter-month'),
        saleHistoryFilterYear: document.getElementById('sale-history-filter-year'),
        expiringSoonMenuItem: document.getElementById('expiring-soon-menu-item'),
        expiringSoonTableBody: document.getElementById('expiring-soon-table'),
        expiringSoonSearchInput: document.getElementById('expiring-soon-search-input'),
        expiringSoonCategoryFilter: document.getElementById('expiring-soon-category-filter'),
        expiringDaysFilter: document.getElementById('expiring-days-filter'),
        expiringSoonPagination: document.getElementById('expiring-soon-pagination'),
        expiringSoonPrevPageBtn: document.getElementById('expiring-soon-prev-page-btn'),
        expiringSoonNextPageBtn: document.getElementById('expiring-soon-next-page-btn'),
        expiringSoonPaginationInfo: document.getElementById('expiring-soon-pagination-info'),
        purchaseExpiryDateGroup: document.getElementById('purchase-expiry-date-group'),
        stockLowFilter: document.getElementById('stock-low-filter'),
        productSearchInput: document.getElementById('product-search'),
        // Gold AI Elements
        goldPriceInput: document.getElementById('gold-price-input'),
        dollarRateInput: document.getElementById('dollar-rate-input'),
        analyzeGoldBtn: document.getElementById('analyze-gold-btn'),
        goldLoading: document.getElementById('gold-loading'),
        goldResult: document.getElementById('gold-prediction-result'),
        predLow: document.getElementById('pred-low'),
        predAvg: document.getElementById('pred-avg'),
        predHigh: document.getElementById('pred-high'),
        goldAnalysisContent: document.getElementById('gold-analysis-content'),
        // Content Creator Elements
        creatorInputCaption: document.getElementById('creator-input-caption'),
        creatorPlatform: document.getElementById('creator-platform'),
        creatorContentType: document.getElementById('creator-content-type'),
        creatorTone: document.getElementById('creator-tone'),
        generateContentBtn: document.getElementById('generate-content-btn'),
        creatorLoading: document.getElementById('creator-loading'),
        creatorResult: document.getElementById('creator-result'),
        creatorOutputCaption: document.getElementById('creator-output-caption'),
        creatorOutputPrompt: document.getElementById('creator-output-prompt'),
        creatorModeRadios: document.getElementsByName('creator-mode'),
        creatorInputLabel: document.getElementById('creator-input-label'),
        creatorTypeLabel: document.getElementById('creator-type-label'),
        creatorOutputTitle: document.getElementById('creator-output-title'),
        creatorPromptBox: document.getElementById('creator-prompt-box'),
    };

    async function render() {
        UIElements.sections.forEach(sec => sec.style.display = 'none');
        const currentSectionEl = document.getElementById(`${state.currentSection}-section`);
        if (currentSectionEl) {
            currentSectionEl.style.display = 'block';
        }
        
        // Google Analytics Virtual Pageview for SPA
        if (typeof gtag === 'function') {
            gtag('event', 'screen_view', {
                'screen_name': state.currentSection,
                'app_name': 'Z Note POS'
            });
        }

        switch (state.currentSection) {
            case 'notes': break;
            case 'products': await renderProductsPage(); break;
            case 'categories': await renderCategoriesPage(); break;
            case 'orders': await renderOrdersPage(); break;
            case 'purchases': await renderPurchasesPage(); break;
            case 'stock': await renderStockPage(); break;
            case 'expiring-soon': await renderExpiringSoonPage(); break;
            case 'sale-history': await renderSaleHistoryPage(); break; 
            case 'settings': await renderSettingsPage(); break;
            case 'reports': await renderReportsPage(); break;
            case 'gold-prediction': break; 
            case 'content-creator': break;
        }
        UIElements.sidebarLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.section === state.currentSection);
        });
        UIElements.bottomNavLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.section === state.currentSection);
        });
    }

    // ... (Render functions: renderProductsPage, renderCategoriesPage, renderOrdersPage, renderProductsGrid, renderCurrentOrder, renderPurchasesPage, renderStockPage, renderExpiringSoonPage, renderSaleHistoryPage, renderSettingsPage, renderReportsPage, populateFilterDropdowns, populateDynamicFilters - REMAIN UNCHANGED)
    async function renderProductsPage() { /* ... same as before ... */ const searchTerm = UIElements.productsSearchInput.value.toLowerCase(); const categoryFilter = UIElements.productCategoryFilter.value; const allProducts = await db.getAll('products'); const filteredProducts = allProducts.filter(p => { const matchesSearch = p.name.toLowerCase().includes(searchTerm) || (p.barcode && p.barcode.includes(searchTerm)); const matchesCategory = (categoryFilter === 'all' || p.categoryId === categoryFilter); return matchesSearch && matchesCategory; }); const totalPages = Math.ceil(filteredProducts.length / state.productsPerPage) || 1; state.productsPage = Math.min(state.productsPage, totalPages); const startIndex = (state.productsPage - 1) * state.productsPerPage; const endIndex = startIndex + state.productsPerPage; const paginatedProducts = filteredProducts.slice(startIndex, endIndex); if (paginatedProducts.length === 0 && searchTerm === '' && categoryFilter === 'all') { UIElements.productsTableBody.innerHTML = `<tr><td colspan="5"><div class="akmempty-state"><i class="fas fa-box-open"></i><p>${getTranslation('empty_no_products_yet')}</p></div></td></tr>`; UIElements.productsPagination.style.display = 'none'; } else if (paginatedProducts.length === 0) { UIElements.productsTableBody.innerHTML = `<tr><td colspan="5"><div class="akmempty-state"><i class="fas fa-search"></i><p>${getTranslation('empty_no_products_match')}</p></div></td></tr>`; UIElements.productsPagination.style.display = 'none'; } else { UIElements.productsPagination.style.display = 'flex'; UIElements.paginationInfo.textContent = getTranslation('pagination_info', { current: state.productsPage, total: totalPages }); UIElements.prevPageBtn.disabled = state.productsPage === 1; UIElements.nextPageBtn.disabled = state.productsPage === totalPages; const categories = await db.getAll('categories'); UIElements.productsTableBody.innerHTML = paginatedProducts.map(p => { const category = categories.find(c => c.id === p.categoryId); return ` <tr> <td> <img src="${p.image || ''}" class="akmproduct-table-image" alt="Product" data-id="${p.id}" onerror="this.style.display='none'; this.nextSibling.style.display='inline-block'"> <i class="fas fa-image" style="display:none; font-size: 24px; color: var(--border-color);"></i> </td> <td>${p.name}<br><small style="opacity:0.7;">${p.barcode || ''}</small></td> <td>${category ? category.name : getTranslation('label_uncategorized')}</td> <td>${formatCurrency(p.price)}</td> <td class="action-buttons"> <button class="akmbtn akmbtn-sm akmbtn-outline-primary" data-action="edit-product" data-id="${p.id}"><i class="fas fa-edit"></i></button> <button class="akmbtn akmbtn-sm akmbtn-danger" data-action="delete-product" data-id="${p.id}"><i class="fas fa-trash"></i></button> </td> </tr> `; }).join(''); } }
    async function renderCategoriesPage() { /* ... same as before ... */ const [allCategories, products] = await Promise.all([db.getAll('categories'), db.getAll('products')]); const tableBody = UIElements.categoriesTableBody; const totalPages = Math.ceil(allCategories.length / state.categoriesPerPage) || 1; state.categoriesPage = Math.min(state.categoriesPage, totalPages); const startIndex = (state.categoriesPage - 1) * state.categoriesPerPage; const endIndex = startIndex + state.categoriesPerPage; const paginatedCategories = allCategories.slice(startIndex, endIndex); if (allCategories.length === 0) { tableBody.innerHTML = `<tr><td colspan="3"><div class="akmempty-state"><i class="fas fa-tags"></i><p>${getTranslation('empty_no_categories')}</p></div></td></tr>`; UIElements.categoriesPagination.style.display = 'none'; return; } UIElements.categoriesPagination.style.display = 'flex'; UIElements.categoryPaginationInfo.textContent = getTranslation('pagination_info', { current: state.categoriesPage, total: totalPages }); UIElements.prevCategoryPageBtn.disabled = state.categoriesPage === 1; UIElements.nextCategoryPageBtn.disabled = state.categoriesPage === totalPages; tableBody.innerHTML = paginatedCategories.map(c => { const productCount = products.filter(p => p.categoryId === c.id).length; return ` <tr> <td>${c.name}</td> <td>${productCount}</td> <td class="action-buttons"> <button class="akmbtn akmbtn-sm akmbtn-outline-primary" data-action="edit-category" data-id="${c.id}"><i class="fas fa-edit"></i></button> <button class="akmbtn akmbtn-sm akmbtn-danger" data-action="delete-category" data-id="${c.id}"><i class="fas fa-trash"></i></button> </td> </tr> `; }).join(''); }
    async function renderOrdersPage() { /* ... same as before ... */ const categories = await db.getAll('categories'); UIElements.categoryTabs.innerHTML = `<button class="akmcategory-tab active" data-id="all">${getTranslation('filter_all')}</button>` + categories.map(c => `<button class="akmcategory-tab" data-id="${c.id}">${c.name}</button>`).join(''); await renderProductsGrid('all'); renderCurrentOrder(); }
    async function renderProductsGrid(categoryId) { /* ... same as before ... */ document.querySelectorAll('.akmcategory-tab').forEach(tab => tab.classList.remove('active')); document.querySelector(`.akmcategory-tab[data-id="${categoryId}"]`).classList.add('active'); const searchTerm = UIElements.productSearchInput.value.toLowerCase(); const [products, stock] = await Promise.all([db.getAll('products'), db.getAll('stock')]); const productsToShow = products.filter(p => { const matchesCategory = (categoryId === 'all') || (p.categoryId === categoryId); const matchesSearch = p.name.toLowerCase().includes(searchTerm) || (p.barcode && p.barcode.includes(searchTerm)); return matchesCategory && matchesSearch; }); if (productsToShow.length === 0) { UIElements.productsGrid.innerHTML = `<div class="akmempty-state"><i class="fas fa-box-open"></i><p>${getTranslation('empty_no_products_in_category')}</p></div>`; return; } UIElements.productsGrid.innerHTML = productsToShow.map((p) => { const stockItem = stock.find(s => s.productId === p.id); const isOutOfStock = !stockItem || stockItem.quantity <= 0; return ` <div class="akmproduct-card ${isOutOfStock ? 'disabled' : ''}" data-id="${p.id}"> <div class="akmproduct-image"> ${p.image ? `<img src="${p.image}" alt="${p.name}">` : '<i class="fas fa-box"></i>'} </div> <div class="akmproduct-details"> <div class="akmproduct-name">${p.name}</div> <div class="akmproduct-price">${formatCurrency(p.price)}</div> </div> ${isOutOfStock ? `<div class="akmout-of-stock">${getTranslation('label_out_of_stock')}</div>` : ''} </div> `; }).join(''); }
    function renderCurrentOrder() { /* ... same as before ... */ const order = state.currentOrder; UIElements.orderTaxLabel.textContent = getTranslation('label_tax_rate_value', { rate: state.taxRate }); if (!order) { UIElements.currentOrderId.textContent = '-'; UIElements.orderItemsList.innerHTML = `<tr><td colspan="4"><div class="akmempty-state" style="padding:10px;"><p style="font-size:0.8rem; margin:0;">${getTranslation('empty_no_items_added')}</p></div></td></tr>`; UIElements.orderSubtotal.textContent = formatCurrency(0); UIElements.orderDiscount.value = ''; UIElements.orderTax.textContent = formatCurrency(0); UIElements.orderTotal.textContent = formatCurrency(0); UIElements.completeOrderBtn.disabled = true; UIElements.cancelOrderBtn.disabled = true; return; } UIElements.currentOrderId.textContent = `${order.id.slice(-5)}`; UIElements.orderItemsList.innerHTML = order.items.length > 0 ? order.items.map(item => ` <tr> <td>${item.name}</td> <td> <button class="akmbtn akmbtn-sm akmbtn-secondary" data-action="decrease-qty" data-id="${item.productId}">-</button> <span style="display: inline-block; width: 25px; text-align: center;">${item.quantity}</span> <button class="akmbtn akmbtn-sm akmbtn-secondary" data-action="increase-qty" data-id="${item.productId}">+</button> </td> <td>${formatCurrency(item.price)}</td> <td>${formatCurrency(item.price * item.quantity)}</td> </tr> `).join('') : `<tr><td colspan="4"><div class="akmempty-state" style="padding:10px;"><p style="font-size:0.8rem; margin:0;">${getTranslation('empty_no_items_added')}</p></div></td></tr>`; const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0); const discount = parseFloat(UIElements.orderDiscount.value) || 0; const taxableAmount = Math.max(0, subtotal - discount); const tax = taxableAmount * (state.taxRate / 100); const total = taxableAmount + tax; order.subtotal = subtotal; order.discount = discount; order.tax = tax; order.total = total; if(order.paymentMethod) { UIElements.orderPaymentMethod.value = order.paymentMethod; } else { order.paymentMethod = UIElements.orderPaymentMethod.value; } UIElements.orderSubtotal.textContent = formatCurrency(subtotal); UIElements.orderTax.textContent = formatCurrency(tax); UIElements.orderTotal.textContent = formatCurrency(total); UIElements.completeOrderBtn.disabled = order.items.length === 0; UIElements.cancelOrderBtn.disabled = false; }
    async function renderPurchasesPage() { /* ... same as before ... */ const tableBody = document.getElementById('purchases-table'); let allPurchases = await db.getAll('purchases'); let filteredPurchases = allPurchases; const filterType = document.querySelector('input[name="purchase-filter-type"]:checked').value; if (filterType === 'date') { const date = UIElements.purchaseFilterDate.value; if (date) { filteredPurchases = allPurchases.filter(p => p.dateTime.startsWith(date)); } } else if (filterType === 'month') { const month = UIElements.purchaseFilterMonth.value; const year = UIElements.purchaseFilterYear.value; if (month && year) { const monthPadded = month.toString().padStart(2, '0'); const filterPrefix = `${year}-${monthPadded}`; filteredPurchases = allPurchases.filter(p => p.dateTime.startsWith(filterPrefix)); } } state.filteredPurchases = filteredPurchases.sort((a,b) => new Date(b.dateTime) - new Date(a.dateTime)); if (state.filteredPurchases.length === 0) { tableBody.innerHTML = `<tr><td colspan="7"><div class="akmempty-state"><i class="fas fa-shopping-cart"></i><p>${getTranslation('empty_no_purchases_for_filter')}</p></div></td></tr>`; return; } tableBody.innerHTML = state.filteredPurchases.map(p => ` <tr> <td>${p.productName}</td> <td>${p.supplier || '-'}</td> <td>${p.quantity}</td> <td>${formatCurrency(p.unitCost)}</td> <td>${formatCurrency(p.totalCost)}</td> <td>${new Date(p.dateTime).toLocaleString()}</td> <td class="action-buttons"> <button class="akmbtn akmbtn-sm akmbtn-danger" data-action="delete-purchase" data-id="${p.id}"><i class="fas fa-trash"></i></button> </td> </tr> `).join(''); }
    async function renderStockPage() { /* ... same as before ... */ const [stock, products] = await Promise.all([ db.getAll('stock'), db.getAll('products') ]); const searchTerm = UIElements.stockSearchInput.value.toLowerCase(); const categoryFilter = UIElements.stockCategoryFilter.value; const showLowStockOnly = UIElements.stockLowFilter.checked; const filteredProducts = products.filter(p => { const matchesSearch = p.name.toLowerCase().includes(searchTerm) || (p.barcode && p.barcode.includes(searchTerm)); const matchesCategory = (categoryFilter === 'all' || p.categoryId === categoryFilter); return matchesSearch && matchesCategory; }); const filteredProductIds = new Set(filteredProducts.map(p => p.id)); let filteredStock = stock.filter(s => filteredProductIds.has(s.productId)); if (showLowStockOnly) { filteredStock = filteredStock.filter(s => s.quantity <= s.lowThreshold); } const totalPages = Math.ceil(filteredStock.length / state.stockPerPage) || 1; state.stockPage = Math.min(state.stockPage, totalPages); const startIndex = (state.stockPage - 1) * state.stockPerPage; const endIndex = startIndex + state.stockPerPage; const paginatedStock = filteredStock.slice(startIndex, endIndex); if (paginatedStock.length === 0 && searchTerm === '' && categoryFilter === 'all' && !showLowStockOnly) { UIElements.stockTableBody.innerHTML = `<tr><td colspan="4"><div class="akmempty-state"><i class="fas fa-warehouse"></i><p>${getTranslation('empty_no_stock')}</p></div></td></tr>`; UIElements.stockPagination.style.display = 'none'; } else if (paginatedStock.length === 0) { UIElements.stockTableBody.innerHTML = `<tr><td colspan="4"><div class="akmempty-state"><i class="fas fa-search"></i><p>${getTranslation('empty_no_stock_for_filter')}</p></div></td></tr>`; UIElements.stockPagination.style.display = 'none'; } else { UIElements.stockPagination.style.display = 'flex'; UIElements.stockPaginationInfo.textContent = getTranslation('pagination_info', { current: state.stockPage, total: totalPages }); UIElements.stockPrevPageBtn.disabled = state.stockPage === 1; UIElements.stockNextPageBtn.disabled = state.stockPage === totalPages; UIElements.stockTableBody.innerHTML = paginatedStock.map(s => { const product = products.find(p => p.id === s.productId); if (!product) return ''; const statusClass = s.quantity <= s.lowThreshold ? 'low' : 'normal'; const statusText = statusClass === 'low' ? getTranslation('label_low_stock') : getTranslation('label_in_stock'); return ` <tr> <td>${product.name}<br><small style="opacity:0.7">${product.barcode || ''}</small></td> <td>${s.quantity}</td> <td> <input type="number" class="akmform-control akmstock-threshold-input" value="${s.lowThreshold}" min="0" data-product-id="${s.productId}"> </td> <td><span class="akmstock-status ${statusClass}">${statusText}</span></td> </tr> `; }).join(''); } }
    async function renderExpiringSoonPage() { /* ... same as before ... */ const [allPurchases, products, categories] = await Promise.all([ db.getAll('purchases'), db.getAll('products'), db.getAll('categories') ]); const daysFilter = parseInt(UIElements.expiringDaysFilter.value) || 7; const today = new Date(); today.setHours(0, 0, 0, 0); const expiryLimit = new Date(); expiryLimit.setDate(today.getDate() + daysFilter); const expiringPurchases = allPurchases.filter(p => { if (!p.expiryDate) return false; const expiry = new Date(p.expiryDate); return expiry >= today && expiry <= expiryLimit; }); const searchTerm = UIElements.expiringSoonSearchInput.value.toLowerCase(); const categoryFilter = UIElements.expiringSoonCategoryFilter.value; const filteredPurchases = expiringPurchases.filter(p => { const product = products.find(prod => prod.id === p.productId); if (!product) return false; const matchesSearch = product.name.toLowerCase().includes(searchTerm); const matchesCategory = (categoryFilter === 'all' || product.categoryId === categoryFilter); return matchesSearch && matchesCategory; }); const totalPages = Math.ceil(filteredPurchases.length / state.expiringSoonPerPage) || 1; state.expiringSoonPage = Math.min(state.expiringSoonPage, totalPages); const startIndex = (state.expiringSoonPage - 1) * state.expiringSoonPerPage; const endIndex = startIndex + state.expiringSoonPerPage; const paginatedPurchases = filteredPurchases.slice(startIndex, endIndex); if (paginatedPurchases.length === 0) { const emptyMessage = (searchTerm || categoryFilter !== 'all') ? getTranslation('empty_no_expiring_items_for_filter') : getTranslation('empty_no_expiring_items'); UIElements.expiringSoonTableBody.innerHTML = `<tr><td colspan="5"><div class="akmempty-state"><i class="fas fa-hourglass-half"></i><p>${emptyMessage}</p></div></td></tr>`; UIElements.expiringSoonPagination.style.display = 'none'; } else { UIElements.expiringSoonPagination.style.display = 'flex'; UIElements.expiringSoonPaginationInfo.textContent = getTranslation('pagination_info', { current: state.expiringSoonPage, total: totalPages }); UIElements.expiringSoonPrevPageBtn.disabled = state.expiringSoonPage === 1; UIElements.expiringSoonNextPageBtn.disabled = state.expiringSoonPage === totalPages; UIElements.expiringSoonTableBody.innerHTML = paginatedPurchases.map(p => { const product = products.find(prod => prod.id === p.productId); const category = categories.find(c => c.id === product.categoryId); return ` <tr> <td>${product.name}</td> <td>${category ? category.name : getTranslation('label_uncategorized')}</td> <td>${p.quantity}</td> <td>${p.expiryDate}</td> <td><span class="akmstock-status expiring">${getTranslation('label_expiring_soon')}</span></td> </tr> `; }).join(''); } }
    async function renderSaleHistoryPage() { /* ... same as before ... */ const allSales = (await db.getAll('orders', 'status', 'completed')).sort((a,b) => new Date(b.date) - new Date(a.date)); let filteredSales = allSales; const filterType = document.querySelector('input[name="sale-filter-type"]:checked').value; if (filterType === 'date') { const date = UIElements.saleHistoryFilterDate.value; if (date) { filteredSales = allSales.filter(s => s.date === date); } } else if (filterType === 'month') { const month = UIElements.saleHistoryFilterMonth.value; const year = UIElements.saleHistoryFilterYear.value; if (month && year) { const monthPadded = month.toString().padStart(2, '0'); const filterPrefix = `${year}-${monthPadded}`; filteredSales = allSales.filter(s => s.date.startsWith(filterPrefix)); } } state.filteredSales = filteredSales; const totalPages = Math.ceil(filteredSales.length / state.saleHistoryPerPage) || 1; state.saleHistoryPage = Math.min(state.saleHistoryPage, totalPages); const startIndex = (state.saleHistoryPage - 1) * state.saleHistoryPerPage; const endIndex = startIndex + state.saleHistoryPerPage; const paginatedSales = filteredSales.slice(startIndex, endIndex); if (paginatedSales.length === 0) { UIElements.saleHistoryTableBody.innerHTML = `<tr><td colspan="7"><div class="akmempty-state"><i class="fas fa-history"></i><p>${getTranslation('empty_no_sales_found')}</p></div></td></tr>`; UIElements.saleHistoryPagination.style.display = 'none'; } else { UIElements.saleHistoryPagination.style.display = 'flex'; UIElements.saleHistoryPaginationInfo.textContent = getTranslation('pagination_info', { current: state.saleHistoryPage, total: totalPages }); UIElements.saleHistoryPrevPageBtn.disabled = state.saleHistoryPage === 1; UIElements.saleHistoryNextPageBtn.disabled = state.saleHistoryPage === totalPages; UIElements.saleHistoryTableBody.innerHTML = paginatedSales.map(s => ` <tr> <td>#${s.id.slice(-8)}</td> <td>${s.date}</td> <td>${s.items.length}</td> <td>${s.paymentMethod || 'Cash'}</td> <td>${formatCurrency(s.discount || 0)}</td> <td>${formatCurrency(s.total)}</td> <td class="action-buttons"> <button class="akmbtn akmbtn-sm akmbtn-primary" data-action="view-sale" data-id="${s.id}"><i class="fas fa-eye"></i></button> <button class="akmbtn akmbtn-sm akmbtn-danger" data-action="delete-sale" data-id="${s.id}"><i class="fas fa-trash"></i></button> </td> </tr> `).join(''); } }
    async function renderSettingsPage() { /* ... same as before ... */ const [taxRate, receiptTitle, language, appMode] = await Promise.all([ db.get('settings', 'taxRate'), db.get('settings', 'receiptTitle'), db.get('settings', 'language'), db.get('settings', 'appMode') ]); UIElements.taxRateSetting.value = taxRate ? taxRate.value : 0; UIElements.receiptTitleSetting.value = receiptTitle ? receiptTitle.value : 'ကောင်းစံ Retail'; UIElements.languageSelect.value = language ? language.value : 'mm'; UIElements.appModeSelect.value = appMode ? appMode.value : 'retail'; const deleteMonthSelect = document.getElementById('delete-data-month'); const deleteYearSelect = document.getElementById('delete-data-year'); const monthNames = getTranslation('month_names'); deleteMonthSelect.innerHTML = monthNames.map((name, index) => `<option value="${index + 1}">${name}</option>`).join(''); const currentYear = new Date().getFullYear(); const yearOptions = []; for (let i = currentYear + 1; i >= 2023; i--) { yearOptions.push(`<option value="${i}">${i}</option>`); } deleteYearSelect.innerHTML = yearOptions.join(''); }
    async function renderReportsPage() { /* ... same as before ... */ const currentYear = new Date().getFullYear(); const currentMonth = new Date().getMonth() + 1; const yearOptions = []; for (let i = currentYear + 1; i >= 2023; i--) { yearOptions.push(`<option value="${i}" ${i === currentYear ? 'selected' : ''}>${i}</option>`); } UIElements.reportYear.innerHTML = yearOptions.join(''); const monthNames = getTranslation('month_names'); const monthOptions = monthNames.map((name, index) => { const monthValue = index + 1; return `<option value="${monthValue}" ${monthValue === currentMonth ? 'selected' : ''}>${name}</option>`; }); UIElements.reportMonth.innerHTML = monthOptions.join(''); UIElements.reportDate.valueAsDate = new Date(); }
    async function populateFilterDropdowns() { /* ... same as before ... */ const categories = await db.getAll('categories'); const optionsHtml = `<option value="all" data-translate="filter_all_categories">${getTranslation('filter_all_categories')}</option>` + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join(''); const filterSelects = [ UIElements.productCategoryFilter, UIElements.stockCategoryFilter, UIElements.expiringSoonCategoryFilter, ]; filterSelects.forEach(select => { if (select) { const currentValue = select.value; select.innerHTML = optionsHtml; select.value = currentValue; } }); }
    function populateDynamicFilters() { /* ... same as before ... */ const currentYear = new Date().getFullYear(); const yearOptions = []; for (let i = currentYear + 1; i >= 2023; i--) { yearOptions.push(`<option value="${i}" ${i === currentYear ? 'selected' : ''}>${i}</option>`); } UIElements.purchaseFilterYear.innerHTML = yearOptions.join(''); UIElements.saleHistoryFilterYear.innerHTML = yearOptions.join(''); const monthNames = getTranslation('month_names'); const monthOptions = monthNames.map((name, index) => `<option value="${index + 1}">${name}</option>`).join(''); UIElements.purchaseFilterMonth.innerHTML = monthOptions; UIElements.saleHistoryFilterMonth.innerHTML = monthOptions; UIElements.purchaseFilterDate.valueAsDate = new Date(); UIElements.saleHistoryFilterDate.valueAsDate = new Date(); }
    function openModal(modalId) { document.getElementById(modalId).classList.add('show'); }
    function closeModal(modalId) { document.getElementById(modalId).classList.remove('show'); }
    function showConfirmation({ title, message, onConfirm, okText = 'btn_confirm', isDanger = true, requiresInput = false, inputPlaceholder = '' }) { const modal = document.getElementById('confirm-modal'); modal.querySelector('#confirm-modal-title').textContent = title; modal.querySelector('#confirm-message').textContent = message; const okBtn = modal.querySelector('#confirm-ok-btn'); okBtn.innerHTML = `<span data-translate="${okText}">${getTranslation(okText)}</span>`; okBtn.className = `akmbtn ${isDanger ? 'akmbtn-danger' : 'akmbtn-primary'}`; const inputContainer = modal.querySelector('#reset-confirm-input-container'); const inputField = modal.querySelector('#reset-confirm-input'); if (requiresInput) { inputContainer.style.display = 'block'; inputField.value = ''; inputField.placeholder = inputPlaceholder; } else { inputContainer.style.display = 'none'; } openModal('confirm-modal'); const newOkBtn = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOkBtn, okBtn); newOkBtn.addEventListener('click', () => { if (requiresInput) { onConfirm(inputField.value); } else { onConfirm(); } }); }
    async function toggleTheme() { const body = document.body; const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark'; await db.put('settings', { key: 'theme', value: newTheme }); applyTheme(); }
    async function applyTheme() { const themeSetting = await db.get('settings', 'theme'); const theme = themeSetting ? themeSetting.value : 'dark'; document.body.className = `${theme}-mode`; UIElements.themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>'; }
    function applyAppMode(mode) { state.appMode = mode; const isBakery = mode === 'bakery'; UIElements.expiringSoonMenuItem.style.display = isBakery ? 'block' : 'none'; UIElements.purchaseExpiryDateGroup.style.display = isBakery ? 'block' : 'none'; if (!isBakery && state.currentSection === 'expiring-soon') { state.currentSection = 'notes'; render(); } }
    function formatCurrency(amount) { return new Intl.NumberFormat('en-US').format(amount) + ' ကျပ်'; }

    // Translations
    const translations = {
        menu_notes: { en: "Notes", mm: "မှတ်စုများ" },
        menu_main: { en: "Main", mm: "ပင်မ" },
        menu_new_sale: { en: "New Sale", mm: "အရောင်းသစ်" },
        menu_management: { en: "Management", mm: "စီမံခန့်ခွဲမှု" },
        menu_products: { en: "Products", mm: "ကုန်ပစ္စည်းများ" },
        menu_categories: { en: "Categories", mm: "အမျိုးအစားများ" },
        menu_stock: { en: "Stock", mm: "ကုန်ပစ္စည်းလက်ကျန်" },
        menu_expiring_soon: { en: "Expiring Soon", mm: "ကုန်ဆုံးရက်နီး" },
        menu_purchases: { en: "Purchases", mm: "အဝယ်စာရင်း" },
        menu_sale_history: { en: "Sale History", mm: "အရောင်းမှတ်တမ်း" },
        menu_reports: { en: "Reports", mm: "အစီရင်ခံစာများ" },
        menu_reports_link: { en: "Reports", mm: "အစီရင်ခံစာများ" },
        menu_about: { en: "About", mm: "အချက်အလက်" },
        menu_settings: { en: "Settings", mm: "ဆက်တင်များ" },
        menu_gold_prediction: { en: "Gold Prediction", mm: "ရွှေဈေးခန့်မှန်းချက်" },
        menu_content_creator: { en: "Content Creator", mm: "Content ဖန်တီးသူ" },
        // ... (Include other translations from the original code here) ...
        label_tax_rate: { en: "Tax Rate (%)", mm: "အခွန်နှုန်း (%)" },
        label_receipt_title: { en: "Receipt Title", mm: "ဘောင်ချာခေါင်းစဉ်" },
        label_app_mode: { en: "Application Mode", mm: "စနစ်အမျိုးအစား" },
        mode_retail: { en: "Retail Mode", mm: "လက်လီအရောင်းစနစ်" },
        mode_bakery: { en: "Bakery/Cafe Mode", mm: "ဘေကာရီ/ကဖေးစနစ်" },
        label_delete_by_month: { en: "Delete Data by Month:", mm: "လအလိုက် Data ဖျက်ရန်:" },
        btn_delete_data_month: { en: "Delete Data for Month", mm: "လအတွက် Data ဖျက်မည်" },
        confirm_delete_data_for_month_msg: { en: "Are you sure you want to delete all sales and purchase records for {monthName} {year}? This action cannot be undone.", mm: "{year} ခုနှစ်၊ {monthName} လအတွက် အရောင်းနှင့်အဝယ်မှတ်တမ်းအားလုံးကို ဖျက်မှာသေချာလား? ဤလုပ်ဆောင်ချက်ကိုပြန်ပြင်၍မရပါ။" },
        alert_data_deleted_for_month: { en: "All sales and purchase data for {monthName} {year} has been deleted.", mm: "{year} ခုနှစ်၊ {monthName} လအတွက် အရောင်းနှင့်အဝယ်ဒေတာအားလုံးကို ဖျက်ပြီးပါပြီ။" },
        title_expiring_soon_products: { en: "Expiring Soon Products", mm: "ကုန်ဆုံးရက်နီး ကုန်ပစ္စည်းများ" },
        label_expiry_date: { en: "Expiration Date", mm: "ကုန်ဆုံးရက်" },
        label_show_expiring_in: { en: "Show expiring in (days):", mm: "ရက်အတွင်းကုန်ဆုံးမည့်:" },
        table_expiry_date: { en: "Expiry Date", mm: "ကုန်ဆုံးရက်" },
        empty_no_expiring_items: { en: "No items are expiring soon.", mm: "ကုန်ဆုံးရက်နီး ပစ္စည်းများ မရှိပါ။" },
        empty_no_expiring_items_for_filter: { en: "No expiring items match your filter.", mm: "သင်၏ရှာဖွေမှုနှင့်ကိုက်ညီသော ကုန်ဆုံးရက်နီးပစ္စည်းမရှိပါ။" },
        label_expiring_soon: { en: "Expiring Soon", mm: "ကုန်ဆုံးတော့မည်" },
        about_version: { en: "Version 3.2 (Bakery/Retail)", mm: "ဗားရှင်း ၃.၂ (Bakery/Retail)" },
        about_description: {
            en: "A streamlined and efficient Point of Sale (POS) system built for modern retail businesses and content creators. Manage your inventory, process sales, and track your performance with ease, plus create various content ideas.",
            mm: "ခေတ်မီလက်လီလုပ်ငန်းများနှင့် Content Creatorများ အတွက်တည်ဆောက်ထားသော ရိုးရှင်းပြီး ထိရောက်သော စနစ်တစ်ခု။ သင်၏ ကုန်ပစ္စည်းစာရင်း၊ အရောင်းအဝယ်များနှင့် လုပ်ငန်းစွမ်းဆောင်ရည်ကို လွယ်ကူစွာ စီမံခန့်ခွဲမှုအပြင် အမျိုးမျိုးတော့ content ideaများကိုဖန်တီးပါ။"
        },
        about_features_title: {
            en: "Features",
            mm: "အဓိကလုပ်ဆောင်ချက်များ"
        },
        about_features_list: {
            en: `<li>Fast and intuitive sales processing with discount application</li><li>Dual-mode operation: Standard Retail and Bakery/Cafe with expiry tracking</li><li>Comprehensive product and category management with image support</li><li>Real-time inventory tracking with low-stock alerts</li><li>Detailed purchase tracking with flexible cost input (Unit or Total)</li><li>In-depth sale history with filtering and export capabilities (PDF/CSV)</li><li>Customizable settings including tax rates and receipt branding</li><li>AI Gold Price Prediction System</li>`,
            mm: `<li>ဈေးလျှော့စနစ်ပါဝင်သော လျင်မြန်သည့် အရောင်းလုပ်ငန်းစဉ်</li><li>စနစ်နှစ်မျိုးသုံးနိုင်ခြင်း- လက်လီစနစ် နှင့် ကုန်ဆုံးရက်ပါ ဘေကာရီ/ကဖေးစနစ်</li><li>ပုံနှင့်တကွ ပြည့်စုံသော ကုန်ပစ္စည်းနှင့်အမျိုးအစား စီမံခန့်ခွဲမှု</li><li>ကုန်ပစ္စည်းလက်ကျန်နည်းပါက အချက်ပေးသည့် Real-time စနစ်</li><li>တစ်ခုချင်းဈေး (သို့) စုစုပေါင်းဈေးဖြင့် ထည့်နိုင်သည့် အဝယ်စာရင်း</li><li>စစ်ထုတ်ခြင်း၊ PDF/CSV ထုတ်ခြင်းတို့ပါဝင်သည့် အရောင်းမှတ်တမ်း</li><li>အခွန်နှင့် ဘောင်ချာများကို စိတ်ကြိုက်ပြင်ဆင်နိုင်ခြင်း</li><li>AI စနစ်ဖြင့်ရွှေဈေးခန့်မှန်းချက်စနစ်</li>`
        },
        orders_add_items: { en: "Add Items", mm: "ပစ္စည်းထည့်ရန်" },
        label_sale: { en: "Sale", mm: "အရောင်း" },
        label_subtotal: { en: "Subtotal", mm: "စုစုပေါင်း" },
        label_discount: { en: "Discount", mm: "လျှော့ဈေး" },
        label_tax_rate_value: { en: "Tax ({rate}%)", mm: "အခွန် ({rate}%)" },
        label_grand_total: { en: "Grand Total", mm: "ကျသင့်ငွေ" },
        table_image: { en: "Image", mm: "ပုံ" },
        table_name: { en: "Name", mm: "အမည်" },
        table_category: { en: "Category", mm: "အမျိုးအစား" },
        table_price: { en: "Price", mm: "ဈေးနှုန်း" },
        table_actions: { en: "Actions", mm: "လုပ်ဆောင်ချက်" },
        table_product_count: { en: "Product Count", mm: "ပစ္စည်းအရေအတွက်" },
        table_product_name: { en: "Product Name", mm: "ကုန်ပစ္စည်းအမည်" },
        table_supplier: { en: "Supplier", mm: "ပစ္စည်းသွင်းသူ" },
        table_quantity: { en: "Quantity", mm: "အရေအတွက်" },
        table_unit_cost: { en: "Unit Cost", mm: "တစ်ခုချင်းကုန်ကျစရိတ်" },
        table_total_cost: { en: "Total Cost", mm: "စုစုပေါင်းကုန်ကျစရိတ်" },
        table_date: { en: "Date", mm: "ရက်စွဲ" },
        table_product: { en: "Product", mm: "ကုန်ပစ္စည်း" },
        table_low_threshold: { en: "Low Threshold", mm: "အနည်းဆုံးသတ်မှတ်ချက်" },
        table_status: { en: "Status", mm: "အခြေအနေ" },
        table_sale_id: { en: "Sale ID", mm: "အရောင်း ID" },
        table_items_count: { en: "Items", mm: "ပစ္စည်းများ" },
        about_developer_title: { en: "Developer", mm: "ရေးဆွဲသူ" },
        modal_sale_completed_title: { en: "Sale Completed", mm: "အရောင်းပြီးမြောက်ပါသည်" },
        modal_confirm_delete_sale_msg: { en: "Are you sure you want to delete this sale record? This action cannot be undone.", mm: "ဤအရောင်းမှတ်တမ်းကို ဖျက်မှာသေချာလား? ဤလုပ်ဆောင်ချက်ကိုပြန်ပြင်၍မရပါ။" },
        entity_sale: { en: "sale record", mm: "အရောင်းမှတ်တမ်း" },
        empty_no_sales_found: { en: "No sales records found.", mm: "အရောင်းမှတ်တမ်းများ မတွေ့ပါ။" },
        btn_new_sale: { en: "New Sale", mm: "အရောင်းသစ်" },
        btn_export_csv_short: { en: "CSV", mm: "CSV" },
        btn_export_pdf_short: { en: "PDF", mm: "PDF" },
        label_language: { en: "Language", mm: "ဘာသာစကား" },
        title_data_management: { en: "Data Management", mm: "ဒေတာစီမံခန့်ခွဲမှု" },
        title_generate_reports: { en: "Generate Reports", mm: "အစီရင်ခံစာထုတ်ရန်" },
        title_daily_report: { en: "Daily Report", mm: "နေ့စဉ်အစီရင်ခံစာ" },
        label_select_date: { en: "Select Date:", mm: "ရက်စွဲရွေးပါ:" },
        title_monthly_report: { en: "Monthly Report", mm: "လစဉ်အစီရင်ခံစာ" },
        title_low_stock_products: { en: "Low Stock Products", mm: "ကုန်နီးသော ပစ္စည်းများ" },
        label_select_month: { en: "Select Month:", mm: "လရွေးပါ:" },
        label_select_year: { en: "Select Year:", mm: "နှစ်ရွေးပါ:" },
        modal_add_product_title: { en: "Add Product", mm: "ပစ္စည်းအသစ်ထည့်ရန်" },
        modal_edit_product_title: { en: "Edit Product", mm: "ပစ္စည်းအချက်အလက်ပြင်ရန်" },
        modal_add_category_title: { en: "Add Category", mm: "အမျိုးအစားသစ်ထည့်ရန်" },
        modal_edit_category_title: { en: "Edit Category", mm: "အမျိုးအစားအမည်ပြင်ရန်" },
        modal_add_purchase_title: { en: "Add Purchase / Stock", mm: "အဝယ်စာရင်း/ကုန်ပစ္စည်းထည့်ရန်" },
        modal_change_password_title: { en: "Change Password", mm: "စကားဝှက်ပြောင်းရန်" },
        modal_confirm_delete_title: { en: "Confirm Deletion", mm: "ဖျက်ရန်အတည်ပြုပါ" },
        title_report: { en: "Report", mm: "အစီရင်ခံစာ" },
        label_product_name: { en: "Product Name", mm: "ပစ္စည်းအမည်" },
        label_category: { en: "Category", mm: "အမျိုးအစား" },
        label_price: { en: "Price", mm: "ဈေးနှုန်း" },
        label_product_image: { en: "Product Image", mm: "ပစ္စည်းပုံ" },
        label_category_name: { en: "Category Name", mm: "အမျိုးအစားအမည်" },
        label_product: { en: "Product", mm: "ကုန်ပစ္စည်း" },
        label_supplier_optional: { en: "Supplier (Optional)", mm: "ပစ္စည်းသွင်းသူ (ထည့်လိုလျှင်)" },
        label_quantity: { en: "Quantity", mm: "အရေအတွက်" },
        label_unit_cost: { en: "Unit Cost", mm: "တစ်ခုချင်းကုန်ကျစရိတ်" },
        label_total_cost: { en: "Total Cost", mm: "စုစုပေါင်းကုန်ကျစရိတ်" },
        label_date_time: { en: "Purchase Date & Time", mm: "အဝယ် ရက်စွဲနှင့်အချိန်" },
        label_current_password: { en: "Current Password", mm: "လက်ရှိစကားဝှက်" },
        label_new_password: { en: "New Password", mm: "စကားဝှက်အသစ်" },
        label_confirm_password: { en: "Confirm New Password", mm: "စကားဝှက်အသစ် အတည်ပြုပါ" },
        btn_add_product: { en: "Add Product", mm: "ပစ္စည်းထည့်ရန်" },
        btn_add_category: { en: "Add Category", mm: "အမျိုးအစားထည့်ရန်" },
        btn_daily_report: { en: "Daily Report", mm: "နေ့စဉ် Report" },
        btn_add_purchase: { en: "Add Purchase", mm: "အဝယ်ထည့်ရန်" },
        btn_complete: { en: "Complete", mm: "ပြီးပြီ" },
        btn_cancel: { en: "Cancel", mm: "မလုပ်တော့ပါ" },
        btn_confirm: { en: "Confirm", mm: "အတည်ပြုသည်" },
        btn_save_settings: { en: "Save Settings", mm: "ဆက်တင်များသိမ်းမည်" },
        btn_change_password: { en: "Change Password", mm: "စကားဝှက်ပြောင်းမည်" },
        btn_reset_all_data: { en: "Reset All Data", mm: "အားလုံးပြန်ဖျက်မည်" },
        btn_generate_daily_report: { en: "Generate Daily Report", mm: "နေ့စဉ် Report ထုတ်မည်" },
        btn_generate_monthly_report: { en: "Generate Monthly Report", mm: "လစဉ် Report ထုတ်မည်" },
        btn_delete: { en: "Delete", mm: "ဖျက်မည်" },
        btn_save_product: { en: "Save Product", mm: "ပစ္စည်းသိမ်းမည်" },
        btn_save: { en: "Save", mm: "သိမ်းမည်" },
        btn_save_purchase: { en: "Save Purchase", mm: "အဝယ်သိမ်းမည်" },
        btn_save_changes: { en: "Save Changes", mm: "အပြောင်းအလဲသိမ်းမည်" },
        btn_close: { en: "Close", mm: "ပိတ်မည်" },
        btn_export_pdf: { en: "Export PDF", mm: "PDF ထုတ်မည်" },
        btn_export_csv: { en: "Export CSV", mm: "CSV ထုတ်မည်" },
        btn_share_receipt: { en: "Share Receipt", mm: "ဘောင်ချာမျှဝေမည်" },
        btn_sharing: { en: "Sharing...", mm: "မျှဝေနေသည်..." },
        placeholder_search_products: { en: "Search products...", mm: "ပစ္စည်းများရှာရန်..." },
        placeholder_search_stock: { en: "Search products in stock...", mm: "လက်ကျန်ရှိပစ္စည်းရှာရန်..." },
        placeholder_select_category: { en: "Select Category", mm: "အမျိုးအစားရွေးပါ" },
        placeholder_select_category_first: { en: "Select Category First", mm: "ဦးစွာအမျိုးအစားရွေးပါ" },
        placeholder_select_product: { en: "Select a Product", mm: "ပစ္စည်းတစ်ခုရွေးပါ" },
        empty_select_table: { en: "Select an item to begin", mm: "စတင်ရန် ပစ္စည်းတစ်ခုရွေးပါ" },
        empty_no_items_added: { en: "No items added", mm: "ပစ္စည်းမထည့်ရသေးပါ" },
        empty_no_products_yet: { en: "No products exist yet. Add one to get started!", mm: "ကုန်ပစ္စည်းများ မရှိသေးပါ။ စတင်ရန် တစ်ခုထည့်ပါ။" },
        empty_no_products_match: { en: "No products match your search.", mm: "သင်၏ရှာဖွေမှုနှင့် ကိုက်ညီသော ကုန်ပစ္စည်းမရှိပါ။" },
        empty_no_categories: { en: "No categories found", mm: "အမျိုးအစားများမတွေ့ပါ" },
        empty_no_purchases: { en: "No purchases found", mm: "အဝယ်စာရင်းများမတွေ့ပါ" },
        empty_no_stock: { en: "No stock records found", mm: "ကုန်လက်ကျန်မှတ်တမ်းမတွေ့ပါ" },
        empty_no_low_stock: { en: "No items are currently low in stock.", mm: "လက်ကျန်နည်းသော ပစ္စည်းမရှိပါ။" },
        empty_no_products_in_category: { en: "No products in this category", mm: "ဤအမျိုးအစားတွင် ပစ္စည်းမရှိပါ" },
        empty_no_purchases_for_filter: { en: "No purchases found for the selected filter.", mm: "ရှာဖွေမှုနှင့်ကိုက်ညီသော အဝယ်စာရင်းမတွေ့ပါ။" },
        empty_no_stock_for_filter: { en: "No stock records found for this filter", mm: "ရှာဖွေမှုနှင့်ကိုက်ညီသော ကုန်လက်ကျန်မတွေ့ပါ။" },
        warning_reset_data: { en: "Warning: Resetting data will delete all products, sales, and purchases and cannot be undone.", mm: "သတိပေးချက်- ဒေတာအားလုံးကိုပြန်ဖျက်ခြင်းသည် ကုန်ပစ္စည်း၊ အရောင်းနှင့် အဝယ်စာရင်းအားလုံးကို ဖျက်ပစ်မည်ဖြစ်ပြီး ပြန်လည်ရယူနိုင်မည်မဟုတ်ပါ။" },
        confirm_cancel_active_order: { en: "There is an active sale. Starting a new one will clear the current items. Continue?", mm: "လက်ရှိအရောင်းတစ်ခုရှိနေပါသည်။ အသစ်စတင်ပါက လက်ရှိပစ္စည်းများ ပယ်ဖျက်သွားမည်ဖြစ်သည်။ ရှေ့ဆက်လုပ်ဆောင်မှာလား?" },
        alert_out_of_stock: { en: "{productName} is out of stock!", mm: "{productName} ကုန်ပစ္စည်း ကုန်သွားပါပြီ!" },
        alert_not_enough_stock: { en: "Not enough stock!", mm: "ပစ္စည်းလက်ကျန်မလုံလောက်ပါ!" },
        confirm_complete_order_title: { en: "Complete Sale", mm: "အရောင်းပြီးမြောက်ရန်" },
        confirm_complete_order_msg: { en: "Are you sure you want to complete and process this sale?", mm: "ဤအရောင်းကို ပြီးမြောက်ကြောင်း အတည်ပြုမှာလား?" },
        alert_order_complete_fail: { en: "Failed to complete sale.", mm: "အရောင်းပြီးမြောက်ရန်မအောင်မြင်ပါ။" },
        alert_fill_all_fields: { en: "Please fill all required fields.", mm: "လိုအပ်သောကွက်လပ်အားလုံးကို ဖြည့်စွက်ပေးပါ။" },
        alert_enter_category_name: { en: "Please enter a category name.", mm: "အမျိုးအစားအမည်ကို ထည့်ပေးပါ။" },
        alert_save_category_fail: { en: "Failed to save category.", mm: "အမျိုးအစားသိမ်းဆည်းရန် မအောင်မြင်ပါ။" },
        alert_invalid_tax_rate: { en: "Please enter a valid, non-negative tax rate.", mm: "မှန်ကန်သော အခွန်နှုန်းထည့်ပါ။" },
        alert_empty_receipt_title: { en: "Receipt title cannot be empty.", mm: "ဘောင်ချာခေါင်းစဉ်အလွတ်မဖြစ်ရပါ။" },
        alert_settings_saved: { en: "Settings saved successfully!", mm: "ဆက်တင်များအောင်မြင်စွာသိမ်းလိုက်ပါပြီ။" },
        alert_settings_save_fail: { en: "Failed to save settings.", mm: "ဆက်တင်များသိမ်းရန်မအောင်မြင်ပါ။" },
        receipt_share_title: { en: "Your Receipt", mm: "သင်၏ဘောင်ချာ" },
        receipt_share_text: { en: "Here is your receipt from ကောင်းစံ.", mm: "ဤသည်မှာ ကောင်းစံ မှ သင်၏ဘောင်ချာဖြစ်ပါသည်။" },
        alert_sharing_not_supported: { en: "Sharing is not supported on this browser. The receipt image will be downloaded instead.", mm: "ဤဘရောက်ဇာတွင် မျှဝေခြင်းကိုမပံ့ပိုးပါ။ ဘောင်ချာပုံကိုအစားထိုးဒေါင်းလုဒ်လုပ်ပါမည်။" },
        alert_share_fail: { en: "Could not share or download the receipt.", mm: "ဘောင်ချာကိုမျှဝေရန် (သို့) ဒေါင်းလုဒ်လုပ်ရန်မအောင်မြင်ပါ။" },
        receipt_print_title: { en: "Print Receipt", mm: "ဘောင်ချာပုံနှိပ်ရန်" },
        confirm_delete_item_title: { en: "Confirm Deletion", mm: "ဖျက်ရန်အတည်ပြုပါ" },
        confirm_delete_item_msg: { en: "Are you sure you want to delete this {type}? This action cannot be undone.", mm: "ဤ {type} ကိုဖျက်မှာသေချာလား? ဤလုပ်ဆောင်ချက်ကိုပြန်ပြင်၍မရပါ။" },
        entity_product: { en: "product", mm: "ကုန်ပစ္စည်း" },
        entity_category: { en: "category", mm: "အမျိုးအစား" },
        entity_purchase: { en: "purchase record", mm: "အဝယ်မှတ်တမ်း" },
        alert_cannot_delete_category: { en: "Cannot delete category. It has {count} product(s) assigned to it.", mm: "ဤအမျိုးအစားကိုဖျက်၍မရပါ။ ပစ္စည်း {count} ခုတွင်အသုံးပြုနေပါသည်။" },
        alert_delete_fail: { en: "Failed to delete item.", mm: "ဖျက်ရန်မအောင်မြင်ပါ။" },
        alert_select_date_for_deletion: { en: "Please select a date to delete data for.", mm: "ဒေတာဖျက်ရန်အတွက် ရက်စွဲတစ်ခုရွေးပါ။" },
        confirm_reset_all_data_title: { en: "Reset All Data", mm: "ဒေတာအားလုံးဖျက်မည်" },
        prompt_reset_all_data_msg: { en: "This will ERASE ALL DATA (products, categories, sales, purchases). This action is permanent. To confirm, type \"DELETE\" in the box below.", mm: "ဤလုပ်ဆောင်ချက်သည် ဒေတာအားလုံးကို (ကုန်ပစ္စည်း၊ အမျိုးအစား၊ အရောင်း၊ အဝယ်) ဖျက်ပစ်ပါမည်။ ဤလုပ်ဆောင်ချက်ကို နောက်ပြန်ပြင်၍မရပါ။ အတည်ပြုရန် \"DELETE\" ဟု အောက်ပါအကွက်တွင် ရိုက်ထည့်ပါ။" },
        prompt_reset_confirm_word: { en: "DELETE", mm: "DELETE" },
        alert_reset_cancelled: { en: "Reset cancelled.", mm: "ဖျက်ခြင်းကိုပယ်ဖျက်လိုက်သည်။" },
        alert_all_data_reset: { en: "All data has been reset. Initializing with sample data.", mm: "ဒေတာအားလုံးကို ပြန်ဖျက်ပြီးပါပြီ။ နမူနာဒေတာဖြင့် ပြန်လည်စတင်နေသည်။" },
        alert_reset_fail: { en: "A critical error occurred during data reset.", mm: "ဒေတာပြန်ဖျက်ရာတွင် ဆိုးရွားသောအမှားတစ်ခုဖြစ်ပွားခဲ့သည်။" },
        alert_select_date: { en: "Please select a date", mm: "ရက်စွဲရွေးချယ်ပါ" },
        alert_select_month_year: { en: "Please select a month and year", mm: "လနှင့်နှစ်ကိုရွေးချယ်ပါ" },
        filter_all_categories: { en: "All Categories", mm: "အမျိုးအစားအားလုံး" },
        filter_all: { en: "All", mm: "အားလုံး" },
        filter_by_date: { en: "By Date", mm: "ရက်စွဲအလိုက်" },
        filter_by_month: { en: "By Month", mm: "လအလိုက်" },
        label_filter_by: { en: "Filter by:", mm: "စစ်ထုတ်ရန်:" },
        label_date: { en: "Date:", mm: "ရက်စွဲ:" },
        label_month: { en: "Month:", mm: "လ:" },
        label_year: { en: "Year:", mm: "နှစ်:" },
        btn_apply_filter: { en: "Apply Filter", mm: "စစ်ထုတ်မည်" },
        btn_clear_filter: { en: "Clear Filter", mm: "ပြန်စမည်" },
        label_uncategorized: { en: "Uncategorized", mm: "အမျိုးအစားမခွဲထား" },
        label_out_of_stock: { en: "Out of Stock", mm: "ကုန်ပစ္စည်းမရှိ" },
        label_low_stock: { en: "Low Stock", mm: "ကုန်တော့မည်" },
        label_in_stock: { en: "In Stock", mm: "ပစ္စည်းရှိ" },
        receipt_sale_id: { en: "Sale ID", mm: "အရောင်းနံပါတ်" },
        receipt_date: { en: "Date", mm: "ရက်စွဲ" },
        receipt_thank_you: { en: "Thank you for your purchase!", mm: "ဝယ်ယူအားပေးမှုအတွက် ကျေးဇူးတင်ပါသည်။" },
        table_item: { en: "Item", mm: "ပစ္စည်း" },
        table_qty: { en: "Qty", mm: "အရေအတွက်" },
        table_total: { en: "Total", mm: "စုစုပေါင်း" },
        label_total: { en: "Total", mm: "စုစုပေါင်း" },
        stat_total_revenue: { en: "Total Revenue", mm: "စုစုပေါင်းဝင်ငွေ" },
        stat_total_cost: { en: "Total Cost", mm: "စုစုပေါင်းကုန်ကျငွေ" },
        stat_net_profit: { en: "Net Profit", mm: "အသားတင်အမြတ်" },
        pagination_info: { en: "Page {current} of {total}", mm: "စာမျက်နှာ {total} ခုမှ {current}" },
        label_payment_method: { en: "Payment Method", mm: "ငွေပေးချေမှုပုံစံ" },
        stat_cash_sales: { en: "Cash Sales", mm: "လက်ငင်းရောင်းရငွေ" },
        stat_kbz_sales: { en: "KBZ Pay Sales", mm: "KBZ Pay ရောင်းရငွေ" },
        month_names: {
            en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
            mm: ["ဇန်နဝါရီ", "ဖေဖော်ဝါရီ", "မတ်", "ဧပြီ", "မေ", "ဇွန်", "ဇူလိုင်", "ဩဂုတ်", "စက်တင်ဘာ", "အောက်တိုဘာ", "နိုဝင်ဘာ", "ဒီဇင်ဘာ"]
        }
    };
    function getTranslation(key, replacements = {}) {
        const lang = state.currentLanguage;
        let text = translations[key]?.[lang] || translations[key]?.['en'] || key;
        if (typeof text === 'string') {
            for (const placeholder in replacements) {
                text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), replacements[placeholder]);
            }
        }
        return text;
    }
    function translateUI(lang) {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-translate]').forEach(el => {
            const key = el.dataset.translate;
            const translationType = el.dataset.translateType;
            const text = getTranslation(key);
            if (translationType === 'list') {
                 el.innerHTML = text;
            } else {
                 el.textContent = text;
            }
        });
        document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
            const key = el.dataset.translatePlaceholder;
            el.placeholder = getTranslation(key);
        });
    }
    async function setLanguage(lang) {
        state.currentLanguage = lang;
        UIElements.languageSelect.value = lang;
        await db.put('settings', { key: 'language', value: lang });
        await populateFilterDropdowns();
        populateDynamicFilters();
        await renderReportsPage();
        await renderSettingsPage();
        translateUI(lang);
    }

    // GOLD AI LOGIC
    UIElements.analyzeGoldBtn.addEventListener('click', handleGoldPrediction);

    async function handleGoldPrediction() {
        const goldPrice = UIElements.goldPriceInput.value;
        const dollarRate = UIElements.dollarRateInput.value;
        
        // Collect news inputs
        const intlNewsInputs = document.querySelectorAll('.intl-news-input');
        const localNewsInputs = document.querySelectorAll('.local-news-input');
        
        const intlNews = Array.from(intlNewsInputs).map(i => i.value).filter(v => v.trim() !== "");
        const localNews = Array.from(localNewsInputs).map(i => i.value).filter(v => v.trim() !== "");

        if (!goldPrice || !dollarRate) {
            alert("Please enter Current Gold Price and Dollar Rate.");
            return;
        }
        
        if (GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            alert("Warning: Gemini API Key is missing in the code. Please add your key.");
            return;
        }

        // UI Loading State
        UIElements.analyzeGoldBtn.disabled = true;
        UIElements.goldLoading.style.display = 'block';
        UIElements.goldResult.style.display = 'none';

        // Construct Prompt
        const prompt = `
            Act as a financial analyst for the Myanmar Gold Market.
            Current Local Gold Price: ${goldPrice} Kyat per tical.
            Current USD Exchange Rate: ${dollarRate} Kyat.
            International News Factors: ${intlNews.length > 0 ? intlNews.join(', ') : 'None provided'}.
            Local News Factors: ${localNews.length > 0 ? localNews.join(', ') : 'None provided'}.
            
            Task: Analyze these factors and predict the Myanmar Gold Price trend for the upcoming week.
            
            Output format MUST be strictly valid JSON:
            {
                "analysis": "Markdown formatted detailed analysis in Myanmar Language...",
                "low_estimate": "Value (Number)",
                "high_estimate": "Value (Number)",
                "average_estimate": "Value (Number)"
            }
            The content of the "analysis" field MUST be in Myanmar Language (Burmese).
            Do not include any text outside the JSON.
        `;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            
            if (data.candidates && data.candidates[0].content) {
                const textResponse = data.candidates[0].content.parts[0].text;
                
                // --- FIX START: More robust JSON parsing ---
                let result;
                try {
                    // 1. Try extracting from markdown code blocks first (e.g. ```json ... ```)
                    const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    let cleanJson = '';
                    
                    if (jsonMatch && jsonMatch[1]) {
                        cleanJson = jsonMatch[1].trim();
                    } else {
                        // 2. If no code blocks, look for the first { and last }
                        const firstOpen = textResponse.indexOf('{');
                        const lastClose = textResponse.lastIndexOf('}');
                        if (firstOpen !== -1 && lastClose !== -1) {
                            cleanJson = textResponse.substring(firstOpen, lastClose + 1);
                        } else {
                             // 3. Last resort: assume the whole text is JSON
                            cleanJson = textResponse; 
                        }
                    }

                    result = JSON.parse(cleanJson);

                    // Update UI
                    UIElements.predLow.textContent = formatCurrency(result.low_estimate);
                    UIElements.predAvg.textContent = formatCurrency(result.average_estimate);
                    UIElements.predHigh.textContent = formatCurrency(result.high_estimate);
                    
                    // Use marked library to parse markdown analysis
                    UIElements.goldAnalysisContent.innerHTML = marked.parse(result.analysis);
                    
                    UIElements.goldResult.style.display = 'block';

                } catch (parseError) {
                    console.error("JSON Parsing Error:", parseError);
                    console.log("Raw Response:", textResponse);
                    alert("AI Response format error. Please try again.");
                }
                // --- FIX END ---
            } else {
                throw new Error("No candidates returned");
            }

        } catch (error) {
            console.error("Gemini API Error:", error);
            // UPDATE: Changed error message as requested
            alert("Failed to analyze market data. Please check your internet");
        } finally {
            UIElements.analyzeGoldBtn.disabled = false;
            UIElements.goldLoading.style.display = 'none';
        }
    }

    // CONTENT CREATOR AI LOGIC
    UIElements.generateContentBtn.addEventListener('click', handleContentCreation);
    
    // Creator Mode Toggle Listener
    UIElements.creatorModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const mode = e.target.value;
            if (mode === 'caption') {
                UIElements.creatorPlatform.style.display = 'block';
                UIElements.creatorContentType.style.display = 'none';
                UIElements.creatorTypeLabel.textContent = "Platform";
                UIElements.creatorInputLabel.textContent = "Caption / Description";
                UIElements.creatorOutputTitle.textContent = "Enhanced Caption";
                UIElements.creatorPromptBox.style.display = 'block'; // Show image prompt
            } else {
                UIElements.creatorPlatform.style.display = 'none';
                UIElements.creatorContentType.style.display = 'block';
                UIElements.creatorTypeLabel.textContent = "Content Type";
                UIElements.creatorInputLabel.textContent = "Topic / Outline";
                UIElements.creatorOutputTitle.textContent = "Generated Content";
                UIElements.creatorPromptBox.style.display = 'none'; // Hide image prompt for long content
            }
        });
    });

    async function handleContentCreation() {
        const mode = document.querySelector('input[name="creator-mode"]:checked').value;
        const input = UIElements.creatorInputCaption.value.trim();
        const tone = UIElements.creatorTone.value;

        if (!input) {
            alert("Please enter a description or topic.");
            return;
        }

        if (GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            alert("Warning: Gemini API Key is missing. Please add your key.");
            return;
        }

        UIElements.generateContentBtn.disabled = true;
        UIElements.creatorLoading.style.display = 'block';
        UIElements.creatorResult.style.display = 'none';

        let prompt = '';

        if (mode === 'caption') {
            const platform = UIElements.creatorPlatform.value;
            prompt = `
                Act as a professional Social Media Manager and Content Creator.
                
                Input Description: "${input}"
                Target Platform: ${platform}
                Desired Tone: ${tone}
                
                Task 1: Rewrite and enhance the caption to be engaging, suitable for the platform, and in the tone requested. If the input is in Myanmar, output the caption in Myanmar. If English, output in English. Add relevant hashtags.
                
                Task 2: Based on the visual context implied by the input description, write a highly detailed AI Image Generation Prompt (in English) that can be used in Midjourney or Stable Diffusion to create a high-quality image.
                
                Output format MUST be strictly valid JSON:
                {
                    "enhanced_caption": "The enhanced caption text with hashtags...",
                    "image_prompt": "Detailed English image generation prompt..."
                }
                Do not include any text outside the JSON.
            `;
        } else {
            // Long Form Content - NO JSON to avoid parsing errors on long texts
            const contentType = UIElements.creatorContentType.value;
            prompt = `
                Act as a professional Content Writer.
                
                Topic/Outline: "${input}"
                Content Type: ${contentType}
                Desired Tone: ${tone}
                
                Task: Write a comprehensive, high-quality, long-form ${contentType} based on the topic.
                The content should be well-structured with headings, bullet points (if applicable), and engaging paragraphs.
                If the input topic is in Myanmar, write the content in Myanmar. If English, write in English.
                
                Output the raw content directly in Markdown format. Do NOT wrap it in JSON code blocks. Just the content.
            `;
        }

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();

            if (data.candidates && data.candidates[0].content) {
                const textResponse = data.candidates[0].content.parts[0].text;
                
                if (mode === 'caption') {
                    // JSON Parsing Logic for Caption Mode
                    let result;
                    try {
                        const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                        let cleanJson = '';
                        if (jsonMatch && jsonMatch[1]) {
                            cleanJson = jsonMatch[1].trim();
                        } else {
                            const firstOpen = textResponse.indexOf('{');
                            const lastClose = textResponse.lastIndexOf('}');
                            if (firstOpen !== -1 && lastClose !== -1) {
                                cleanJson = textResponse.substring(firstOpen, lastClose + 1);
                            } else {
                                cleanJson = textResponse; 
                            }
                        }
                        result = JSON.parse(cleanJson);

                        UIElements.creatorOutputCaption.innerText = result.enhanced_caption;
                        UIElements.creatorOutputPrompt.innerText = result.image_prompt;
                        
                    } catch (parseError) {
                        console.error("JSON Parsing Error:", parseError);
                        alert("AI Response format error. Please try again.");
                        return;
                    }
                } else {
                    // Direct Text Logic for Long Form Content (No JSON Parsing)
                    UIElements.creatorOutputCaption.innerHTML = marked.parse(textResponse); 
                }
                
                UIElements.creatorResult.style.display = 'block';

            } else {
                throw new Error("No candidates returned");
            }
        } catch (error) {
            console.error("Creator API Error:", error);
            alert("Failed to generate content. Please check connection.");
        } finally {
            UIElements.generateContentBtn.disabled = false;
            UIElements.creatorLoading.style.display = 'none';
        }
    }

    // --- ROBUST COPY FUNCTION (Fix for Mobile/Content Protocol) ---
    async function copyTextToClipboard(text) {
        // 1. Try Modern Async API first (works on secure contexts: https/localhost)
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn("Clipboard API failed, trying fallback...", err);
            }
        }

        // 2. Fallback: Create a textarea (works on file://, content://, and mobile)
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure it's part of the DOM but not visible to user
        // Fixed position prevents scrolling to the bottom of page
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.setAttribute('readonly', ''); // Avoid keyboard popping up on mobile
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();
        // Specific fix for mobile devices to ensure selection
        textArea.setSelectionRange(0, 99999); 

        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (err) {
            document.body.removeChild(textArea);
            console.error("Fallback copy failed", err);
            return false;
        }
    }

    function setupEventListeners() {
        UIElements.sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                state.currentSection = e.currentTarget.dataset.section;
                render();
                if (window.innerWidth < 992) UIElements.sidebar.classList.remove('show');
            });
        });
        UIElements.bottomNav.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.akmbottom-nav-link');
            if (link) {
                state.currentSection = link.dataset.section;
                render();
            }
        });
        UIElements.menuToggle.addEventListener('click', () => UIElements.sidebar.classList.toggle('show'));
        UIElements.themeToggle.addEventListener('click', toggleTheme);
        document.getElementById('add-new-product-btn').addEventListener('click', () => openProductModal());
        document.getElementById('add-new-category-btn').addEventListener('click', () => openCategoryModal());
        document.getElementById('add-new-purchase-btn').addEventListener('click', () => openPurchaseModal());
        UIElements.productsSearchInput.addEventListener('input', () => { state.productsPage = 1; renderProductsPage(); });
        UIElements.productCategoryFilter.addEventListener('change', () => { state.productsPage = 1; renderProductsPage(); });
        UIElements.prevPageBtn.addEventListener('click', () => { if(state.productsPage > 1) { state.productsPage--; renderProductsPage(); } });
        UIElements.nextPageBtn.addEventListener('click', () => { state.productsPage++; renderProductsPage(); });
        UIElements.stockSearchInput.addEventListener('input', () => { state.stockPage = 1; renderStockPage(); });
        UIElements.stockCategoryFilter.addEventListener('change', () => { state.stockPage = 1; renderStockPage(); });
        UIElements.stockLowFilter.addEventListener('change', () => { state.stockPage = 1; renderStockPage(); });
        UIElements.stockPrevPageBtn.addEventListener('click', () => { if(state.stockPage > 1) { state.stockPage--; renderStockPage(); } });
        UIElements.stockNextPageBtn.addEventListener('click', () => { state.stockPage++; renderStockPage(); });
        UIElements.stockTableBody.addEventListener('change', handleStockThresholdChange);
        UIElements.prevCategoryPageBtn.addEventListener('click', () => { if(state.categoriesPage > 1) { state.categoriesPage--; renderCategoriesPage(); } });
        UIElements.nextCategoryPageBtn.addEventListener('click', () => { state.categoriesPage++; renderCategoriesPage(); });
        
        UIElements.expiringSoonSearchInput.addEventListener('input', () => { state.expiringSoonPage = 1; renderExpiringSoonPage(); });
        UIElements.expiringSoonCategoryFilter.addEventListener('change', () => { state.expiringSoonPage = 1; renderExpiringSoonPage(); });
        UIElements.expiringDaysFilter.addEventListener('change', () => { state.expiringSoonPage = 1; renderExpiringSoonPage(); });
        UIElements.expiringSoonPrevPageBtn.addEventListener('click', () => { if(state.expiringSoonPage > 1) { state.expiringSoonPage--; renderExpiringSoonPage(); } });
        UIElements.expiringSoonNextPageBtn.addEventListener('click', () => { state.expiringSoonPage++; renderExpiringSoonPage(); });
        UIElements.categoryTabs.addEventListener('click', e => { if (e.target.matches('.akmcategory-tab')) renderProductsGrid(e.target.dataset.id); });
        UIElements.productsGrid.addEventListener('click', e => { const card = e.target.closest('.akmproduct-card:not(.disabled)'); if (card) addProductToOrder(card.dataset.id); });
        UIElements.orderItemsList.addEventListener('click', handleOrderItemQuantityChange);
        UIElements.orderDiscount.addEventListener('input', renderCurrentOrder); 
        UIElements.orderPaymentMethod.addEventListener('change', (e) => {
            if(state.currentOrder) state.currentOrder.paymentMethod = e.target.value;
        });
        UIElements.productSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length > 2) {
                findProductByBarcodeAndAdd(val);
            }
            renderProductsGrid(document.querySelector('.akmcategory-tab.active')?.dataset.id || 'all');
        });
        UIElements.productSearchInput.addEventListener('keypress', (e) => {
             if (e.key === 'Enter') {
                 const val = e.target.value.trim();
                 if(val) findProductByBarcodeAndAdd(val, true);
             }
        });

        UIElements.completeOrderBtn.addEventListener('click', handleCompleteOrder);
        UIElements.cancelOrderBtn.addEventListener('click', handleCancelOrder);
        UIElements.purchaseCategorySelect.addEventListener('change', handlePurchaseCategoryChange);
        setupPurchaseCostCalculators();
        UIElements.purchaseFilterType.addEventListener('change', () => {
            const type = document.querySelector('input[name="purchase-filter-type"]:checked').value;
            UIElements.purchaseDateFilterGroup.style.display = type === 'date' ? 'flex' : 'none';
            UIElements.purchaseMonthFilterGroup.style.display = type === 'month' ? 'flex' : 'none';
        });
        document.getElementById('apply-purchase-filter-btn').addEventListener('click', renderPurchasesPage);
        document.getElementById('clear-purchase-filter-btn').addEventListener('click', () => {
            document.getElementById('filter-all-purchases').checked = true;
            UIElements.purchaseDateFilterGroup.style.display = 'none';
            UIElements.purchaseMonthFilterGroup.style.display = 'none';
            renderPurchasesPage();
        });
        document.getElementById('export-purchases-pdf-btn').addEventListener('click', handleExportPurchasesPDF);
        document.getElementById('export-purchases-csv-btn').addEventListener('click', handleExportPurchasesCSV);
        UIElements.saleHistoryFilterType.addEventListener('change', () => {
            const type = document.querySelector('input[name="sale-filter-type"]:checked').value;
            UIElements.saleHistoryDateFilterGroup.style.display = type === 'date' ? 'flex' : 'none';
            UIElements.saleHistoryMonthFilterGroup.style.display = type === 'month' ? 'flex' : 'none';
        });
        document.getElementById('apply-sale-history-filter-btn').addEventListener('click', renderSaleHistoryPage);
        document.getElementById('clear-sale-history-filter-btn').addEventListener('click', () => {
            document.getElementById('filter-all-sales').checked = true;
            UIElements.saleHistoryDateFilterGroup.style.display = 'none';
            UIElements.saleHistoryMonthFilterGroup.style.display = 'none';
            renderSaleHistoryPage();
        });
        UIElements.saleHistoryPrevPageBtn.addEventListener('click', () => { if(state.saleHistoryPage > 1) { state.saleHistoryPage--; renderSaleHistoryPage(); } });
        UIElements.saleHistoryNextPageBtn.addEventListener('click', () => { state.saleHistoryPage++; renderSaleHistoryPage(); });
        document.getElementById('export-sales-pdf-btn').addEventListener('click', handleExportSalesPDF);
        document.getElementById('export-sales-csv-btn').addEventListener('click', handleExportSalesCSV);
        UIElements.languageSelect.addEventListener('change', (e) => setLanguage(e.target.value));
        UIElements.appModeSelect.addEventListener('change', handleAppModeChange);
        UIElements.deleteDataByMonthBtn.addEventListener('click', handleDeleteDataByMonth);
        UIElements.resetDataBtn.addEventListener('click', handleResetAllData);
        document.getElementById('save-product-btn').addEventListener('click', handleSaveProduct);
        document.getElementById('save-category-btn').addEventListener('click', handleSaveCategory);
        document.getElementById('save-purchase-btn').addEventListener('click', handleSavePurchase);
        document.getElementById('save-settings-btn').addEventListener('click', handleSaveSettings);
        document.getElementById('generate-report-btn').addEventListener('click', generateDailyReport);
        document.getElementById('generate-monthly-report-btn').addEventListener('click', generateMonthlyReport);
        document.querySelectorAll('.akm-modal-close').forEach(btn => btn.addEventListener('click', (e) => closeModal(e.target.closest('.akm-modal').id)));
        document.body.addEventListener('click', handleBodyClick);
        document.getElementById('confirm-cancel-btn').addEventListener('click', () => closeModal('confirm-modal'));
        document.getElementById('delete-product-btn').addEventListener('click', () => {
            const id = document.getElementById('product-id').value;
            if(id) openDeleteModal(id, 'product', true);
        });
        document.getElementById('delete-category-btn').addEventListener('click', () => {
            const id = document.getElementById('category-id').value;
            if(id) openDeleteModal(id, 'category', true);
        });
        document.getElementById('share-receipt-btn').addEventListener('click', handleShareReceipt);
        document.getElementById('save-receipt-img-btn').addEventListener('click', handleSaveReceiptImage);
        setupImageUploadListeners();

        // FIX: Use robust copy function
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetId = btn.dataset.target;
                const text = document.getElementById(targetId).innerText;
                
                const success = await copyTextToClipboard(text);
                
                if (success) {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => btn.innerHTML = originalText, 2000);
                } else {
                    alert("Failed to copy text. Please select manually.");
                }
            });
        });
    }
    
   
    window.startScanner = function(targetInputId) {
        openModal('scanner-modal');
        const scannerConfig = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        html5QrCode = new Html5Qrcode("scanner-reader");
        html5QrCode.start({ facingMode: "environment" }, scannerConfig, (decodedText, decodedResult) => {
            // On success
            if (html5QrCode) {
                html5QrCode.stop().then(() => {
                    closeModal('scanner-modal');
                    document.getElementById(targetInputId).value = decodedText;
                    
                    if (targetInputId === 'product-search') {
                        // Directly add if in sales mode
                        findProductByBarcodeAndAdd(decodedText, true);
                    } else {
                         // Just fill input for others
                        const event = new Event('input');
                        document.getElementById(targetInputId).dispatchEvent(event);
                    }
                }).catch(err => console.error(err));
            }
        }, (errorMessage) => {
            // parse error, ignore loop
        }).catch(err => {
            console.error(err);
            alert("Error starting camera. Please ensure permissions are granted.");
            closeModal('scanner-modal');
        });
    };
    
    async function findProductByBarcodeAndAdd(barcode, autoAdd = false) {
        const allProducts = await db.getAll('products');
        const product = allProducts.find(p => p.barcode === barcode);
        if (product) {
            if (autoAdd) {
                addProductToOrder(product.id);
                UIElements.productSearchInput.value = ''; // Clear after add
                renderProductsGrid(document.querySelector('.akmcategory-tab.active')?.dataset.id || 'all');
            }
        }
    }

    function handleBodyClick(e) {
        const button = e.target.closest('button');
        const image = e.target.closest('.akmproduct-table-image');
        if (button) {
            const { action, id } = button.dataset;
            if (!action || !id) return;
            switch(action) {
                case 'edit-product': openProductModal(id); break;
                case 'delete-product': openDeleteModal(id, 'product'); break;
                case 'edit-category': openCategoryModal(id); break;
                case 'delete-category': openDeleteModal(id, 'category'); break;
                case 'delete-purchase': openDeleteModal(id, 'purchase'); break;
                case 'delete-sale': openDeleteModal(id, 'sale'); break;
                case 'view-sale': showSaleDetails(id); break;
            }
        }
        if (image) viewFullImage(image.src);
    }
    async function showSaleDetails(saleId) {
        const sale = await db.get('orders', saleId);
        if (!sale) return;

        const modalTitle = document.getElementById('sale-details-title');
        const modalBody = document.getElementById('sale-details-body');

        modalTitle.textContent = `${getTranslation('label_sale')} #${sale.id.slice(-8)}`;
        
        const itemsHtml = sale.items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td style="text-align:right;">${formatCurrency(item.price)}</td>
                <td style="text-align:right;">${formatCurrency(item.price * item.quantity)}</td>
            </tr>
        `).join('');

        modalBody.innerHTML = `
            <p><strong>${getTranslation('table_date')}:</strong> ${sale.date}</p>
            <p><strong>Payment:</strong> ${sale.paymentMethod || 'Cash'}</p>
            <div class="akmtable-responsive">
                <table class="akmtable">
                    <thead>
                        <tr>
                            <th>${getTranslation('table_item')}</th>
                            <th>${getTranslation('table_qty')}</th>
                            <th style="text-align:right;">${getTranslation('table_price')}</th>
                            <th style="text-align:right;">${getTranslation('table_total')}</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
            </div>
            <div class="akmorder-summary" style="margin-top: 15px; border-top: 1px solid var(--border-color);">
                <div class="akmsummary-row">
                    <span class="akmsummary-label">${getTranslation('label_subtotal')}:</span>
                    <span class="akmsummary-value">${formatCurrency(sale.subtotal)}</span>
                </div>
                <div class="akmsummary-row">
                    <span class="akmsummary-label">${getTranslation('label_discount')}:</span>
                    <span class="akmsummary-value">${formatCurrency(sale.discount)}</span>
                </div>
                <div class="akmsummary-row">
                    <span class="akmsummary-label">${getTranslation('label_tax_rate_value', { rate: state.taxRate })}:</span>
                    <span class="akmsummary-value">${formatCurrency(sale.tax)}</span>
                </div>
                <div class="akmsummary-row akmgrand-total">
                    <span class="akmsummary-label">${getTranslation('label_grand_total')}:</span>
                    <span class="akmsummary-value">${formatCurrency(sale.total)}</span>
                </div>
            </div>
        `;
        
        openModal('sale-details-modal');
    }
    async function handleStockThresholdChange(e) {
        if (e.target.classList.contains('akmstock-threshold-input')) {
            const productId = e.target.dataset.productId;
            const newThreshold = parseInt(e.target.value, 10);
            if (productId && !isNaN(newThreshold) && newThreshold >= 0) {
                try {
                    const stockItem = await db.get('stock', productId);
                    stockItem.lowThreshold = newThreshold;
                    await db.put('stock', stockItem);
                    e.target.style.borderColor = 'var(--success-color)';
                    setTimeout(() => { e.target.style.borderColor = '' }, 2000);
                    await renderStockPage();
                } catch (error) {
                    console.error('Failed to update threshold:', error);
                    e.target.style.borderColor = 'var(--danger-color)';
                }
            }
        }
    }
    function handleOrderItemQuantityChange(e) {
        const button = e.target.closest('button');
        if(!button) return;
        const action = button.dataset.action;
        const productId = button.dataset.id;
        if (action === 'increase-qty') updateOrderItemQuantity(productId, 1);
        else if (action === 'decrease-qty') updateOrderItemQuantity(productId, -1);
    }
    async function handleAppModeChange(e) {
        const newMode = e.target.value;
        await db.put('settings', { key: 'appMode', value: newMode });
        applyAppMode(newMode);
    }
    function setupImageUploadListeners() {
        const imageUpload = document.getElementById('product-image-upload');
        const imagePreview = document.getElementById('product-image-preview');
        const removeImageBtn = document.getElementById('remove-image-btn');
        imageUpload.addEventListener('change', () => {
            const file = imageUpload.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreview.style.display = 'block';
                    removeImageBtn.style.display = 'inline-flex';
                };
                reader.readAsDataURL(file);
            }
        });
        removeImageBtn.addEventListener('click', () => {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            removeImageBtn.style.display = 'none';
            imageUpload.value = '';
        });
    }
    function handleNewOrder() {
        if (state.currentOrder && state.currentOrder.items.length > 0) {
            showConfirmation({
                title: getTranslation('confirm_cancel_order_title'),
                message: getTranslation('confirm_cancel_active_order'),
                onConfirm: () => {
                    createNewOrderObject();
                    renderCurrentOrder();
                }
            });
        } else {
             createNewOrderObject();
             renderCurrentOrder();
        }
    }
    function createNewOrderObject() {
        state.currentOrder = {
            id: `ord-${Date.now()}`,
            date: new Date().toISOString().slice(0, 10),
            status: 'active',
            items: [],
            subtotal: 0, 
            discount: 0,
            tax: 0, 
            total: 0,
            paymentMethod: UIElements.orderPaymentMethod.value || 'Cash'
        };
        UIElements.orderDiscount.value = '';
    }
    async function addProductToOrder(productId) {
        if (!state.currentOrder) createNewOrderObject();
        const [product, stock] = await Promise.all([db.get('products', productId), db.get('stock', productId)]);
        const existingItem = state.currentOrder.items.find(item => item.productId === productId);
        if (stock.quantity <= (existingItem ? existingItem.quantity : 0)) {
            alert(getTranslation('alert_out_of_stock', { productName: product.name }));
            return;
        }
        if (existingItem) existingItem.quantity++;
        else state.currentOrder.items.push({ productId: product.id, name: product.name, price: product.price, quantity: 1 });
        renderCurrentOrder();
    }
    async function updateOrderItemQuantity(productId, change) {
        const item = state.currentOrder.items.find(i => i.productId === productId);
        if (!item) return;
        if (change > 0) {
            const stock = await db.get('stock', productId);
            if (item.quantity + change > stock.quantity) {
                alert(getTranslation('alert_not_enough_stock'));
                return;
            }
        }
        item.quantity += change;
        if (item.quantity <= 0) state.currentOrder.items = state.currentOrder.items.filter(i => i.productId !== productId);
        renderCurrentOrder();
    }
    function handleCompleteOrder() {
        if (!state.currentOrder || state.currentOrder.items.length === 0) return;
        showConfirmation({
            title: getTranslation('confirm_complete_order_title'),
            message: getTranslation('confirm_complete_order_msg'),
            isDanger: false,
            okText: 'btn_complete',
            async onConfirm() {
                try {
                    for (const item of state.currentOrder.items) {
                        const stockItem = await db.get('stock', item.productId);
                        if (stockItem) {
                            stockItem.quantity -= item.quantity;
                            await db.put('stock', stockItem);
                        }
                    }
                    state.currentOrder.status = 'completed';
                    state.currentOrder.paymentMethod = UIElements.orderPaymentMethod.value;
                    const completedOrder = { ...state.currentOrder };
                    await db.add('orders', completedOrder);
                    state.currentOrder = null;
                    closeModal('confirm-modal');
                    await renderOrdersPage();
                    await showReceiptModal(completedOrder);
                } catch (error) {
                    console.error('Error completing order:', error);
                    alert(getTranslation('alert_order_complete_fail'));
                    closeModal('confirm-modal');
                }
            }
        });
    }
    function handleCancelOrder() {
        if (!state.currentOrder) return;
        showConfirmation({
            title: getTranslation('confirm_cancel_order_title'),
            message: getTranslation('confirm_cancel_order_msg'),
            onConfirm: () => {
                state.currentOrder = null;
                renderOrdersPage();
                closeModal('confirm-modal');
            }
        });
    }
    async function openProductModal(productId = null) {
        document.getElementById('product-form').reset();
        document.getElementById('product-image-preview').style.display = 'none';
        document.getElementById('remove-image-btn').style.display = 'none';
        const catSelect = document.getElementById('product-category');
        catSelect.innerHTML = `<option value="">${getTranslation('placeholder_select_category')}</option>` + 
            (await db.getAll('categories')).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        const title = document.getElementById('product-modal-title');
        const delBtn = document.getElementById('delete-product-btn');
        const idInput = document.getElementById('product-id');
        if (productId) {
            const product = await db.get('products', productId);
            title.textContent = getTranslation('modal_edit_product_title');
            delBtn.style.display = 'inline-flex';
            idInput.value = product.id;
            document.getElementById('product-name').value = product.name;
            document.getElementById('product-price').value = product.price;
            document.getElementById('product-barcode').value = product.barcode || '';
            catSelect.value = product.categoryId;
            if (product.image) {
                document.getElementById('product-image-preview').src = product.image;
                document.getElementById('product-image-preview').style.display = 'block';
                document.getElementById('remove-image-btn').style.display = 'inline-flex';
            }
        } else {
            title.textContent = getTranslation('modal_add_product_title');
            delBtn.style.display = 'none';
            idInput.value = '';
        }
        openModal('product-modal');
    }
    async function handleSaveProduct() {
        const id = document.getElementById('product-id').value;
        const name = document.getElementById('product-name').value.trim();
        const price = parseFloat(document.getElementById('product-price').value);
        const categoryId = document.getElementById('product-category').value;
        const barcode = document.getElementById('product-barcode').value.trim();
        const imageSrc = document.getElementById('product-image-preview').src;
        const image = imageSrc.startsWith('data:image') ? imageSrc : null;
        if (!name || isNaN(price) || !categoryId) { alert(getTranslation('alert_fill_all_fields')); return; }
        try {
            if (id) {
                const product = await db.get('products', id);
                await db.put('products', { ...product, name, price, categoryId, image, barcode });
            } else {
                const newId = `prod-${Date.now()}`;
                await db.add('products', { id: newId, name, price, categoryId, image, barcode });
                await db.add('stock', { productId: newId, quantity: 0, lowThreshold: 10 });
            }
            await renderProductsPage();
            await renderStockPage();
            closeModal('product-modal');
        } catch (error) {
            console.error('Error saving product:', error);
        }
    }
    async function openCategoryModal(categoryId = null) {
        document.getElementById('category-form').reset();
        const title = document.getElementById('category-modal-title');
        const delBtn = document.getElementById('delete-category-btn');
        const idInput = document.getElementById('category-id');
        if (categoryId) {
            const category = await db.get('categories', categoryId);
            title.textContent = getTranslation('modal_edit_category_title');
            delBtn.style.display = 'inline-flex';
            idInput.value = category.id;
            document.getElementById('category-name').value = category.name;
        } else {
            title.textContent = getTranslation('modal_add_category_title');
            delBtn.style.display = 'none';
            idInput.value = '';
        }
        openModal('category-modal');
    }
    async function handleSaveCategory() {
        const id = document.getElementById('category-id').value;
        const name = document.getElementById('category-name').value.trim();
        if (!name) { alert(getTranslation('alert_enter_category_name')); return; }
        try {
            if (id) {
                await db.put('categories', { id, name });
            } else {
                await db.add('categories', { id: `cat-${Date.now()}`, name });
            }
            await renderCategoriesPage();
            await populateFilterDropdowns();
            closeModal('category-modal');
        } catch (error) {
            console.error('Error saving category:', error);
            alert(getTranslation('alert_save_category_fail'));
        }
    }
    async function openPurchaseModal() {
        document.getElementById('purchase-form').reset();
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('purchase-date').value = now.toISOString().slice(0, 16);
        const categories = await db.getAll('categories');
        UIElements.purchaseCategorySelect.innerHTML = `<option value="">${getTranslation('placeholder_select_category_first')}</option>` + 
            categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        UIElements.purchaseProductSelect.innerHTML = `<option value="">${getTranslation('placeholder_select_product')}</option>`;
        UIElements.purchaseProductSelect.disabled = true;
        openModal('purchase-modal');
    }
    async function handlePurchaseCategoryChange() {
        const categoryId = UIElements.purchaseCategorySelect.value;
        if (!categoryId) {
            UIElements.purchaseProductSelect.innerHTML = `<option value="">${getTranslation('placeholder_select_product')}</option>`;
            UIElements.purchaseProductSelect.disabled = true;
            return;
        }
        const allProducts = await db.getAll('products');
        const filteredProducts = allProducts.filter(p => p.categoryId === categoryId);
        if(filteredProducts.length > 0) {
            UIElements.purchaseProductSelect.innerHTML = `<option value="" disabled selected>${getTranslation('placeholder_select_product')}</option>` + filteredProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            UIElements.purchaseProductSelect.disabled = false;
        } else {
            UIElements.purchaseProductSelect.innerHTML = `<option value="">${getTranslation('empty_no_products_in_category')}</option>`;
            UIElements.purchaseProductSelect.disabled = true;
        }
    }
    function setupPurchaseCostCalculators() {
        const quantityInput = document.getElementById('purchase-quantity');
        const unitCostInput = document.getElementById('purchase-unit-cost');
        const totalCostInput = document.getElementById('purchase-total-cost');
        const calculateTotal = () => {
            const quantity = parseFloat(quantityInput.value) || 0;
            const unitCost = parseFloat(unitCostInput.value) || 0;
            if (quantity > 0 && unitCost > 0) {
                totalCostInput.value = (quantity * unitCost).toFixed(2);
            }
        };
        const calculateUnit = () => {
            const quantity = parseFloat(quantityInput.value) || 0;
            const totalCost = parseFloat(totalCostInput.value) || 0;
            if (quantity > 0 && totalCost > 0) {
                unitCostInput.value = (totalCost / quantity).toFixed(2);
            }
        };
        quantityInput.addEventListener('input', calculateTotal);
        unitCostInput.addEventListener('input', calculateTotal);
        totalCostInput.addEventListener('input', calculateUnit);
    }
    async function handleSavePurchase() {
        const productId = document.getElementById('purchase-product').value;
        const quantity = parseInt(document.getElementById('purchase-quantity').value);
        const unitCost = parseFloat(document.getElementById('purchase-unit-cost').value);
        const totalCost = parseFloat(document.getElementById('purchase-total-cost').value);
        const supplier = document.getElementById('purchase-supplier').value.trim();
        const dateTime = document.getElementById('purchase-date').value;
        const expiryDate = document.getElementById('purchase-expiry-date').value;
        if (!productId || !quantity || (!unitCost && !totalCost) || !dateTime) { 
            alert(getTranslation('alert_fill_all_fields')); 
            return; 
        }
        if (state.appMode === 'bakery' && !expiryDate) {
            alert(getTranslation('alert_fill_all_fields'));
            return;
        }
        try {
            const finalUnitCost = unitCost || totalCost / quantity;
            const finalTotalCost = totalCost || unitCost * quantity;
            const product = await db.get('products', productId);
            const purchase = {
                id: `pch-${Date.now()}`,
                productId,
                productName: product.name,
                supplier,
                quantity,
                unitCost: finalUnitCost,
                totalCost: finalTotalCost,
                dateTime,
                ...(state.appMode === 'bakery' && { expiryDate: expiryDate })
            };
            await db.add('purchases', purchase);
            const stockItem = await db.get('stock', productId);
            stockItem.quantity += quantity;
            await db.put('stock', stockItem);
            await Promise.all([renderPurchasesPage(), renderStockPage()]);
            if (state.appMode === 'bakery' && state.currentSection === 'expiring-soon') await renderExpiringSoonPage();
            closeModal('purchase-modal');
        } catch (error) {
            console.error('Error saving purchase:', error);
        }
    }
    async function handleSaveSettings() {
        const newTaxRate = parseFloat(UIElements.taxRateSetting.value);
        const newReceiptTitle = UIElements.receiptTitleSetting.value.trim();
        if (isNaN(newTaxRate) || newTaxRate < 0) {
            alert(getTranslation('alert_invalid_tax_rate'));
            return;
        }
        if (!newReceiptTitle) {
            alert(getTranslation('alert_empty_receipt_title'));
            return;
        }
        try {
            await Promise.all([
                db.put('settings', {key: 'taxRate', value: newTaxRate}),
                db.put('settings', {key: 'receiptTitle', value: newReceiptTitle})
            ]);
            state.taxRate = newTaxRate;
            alert(getTranslation('alert_settings_saved'));
        } catch (error) {
            console.error("Error saving settings:", error);
            alert(getTranslation('alert_settings_save_fail'));
        }
    }
    async function showReceiptModal(order) {
        const receiptTitleSetting = await db.get('settings', 'receiptTitle');
        const receiptTitle = receiptTitleSetting?.value || 'ကောင်းစံ Retail';
        const receiptContent = document.getElementById('receipt-content');
        receiptContent.innerHTML = `
            <h4>${receiptTitle}</h4>
            <p>${getTranslation('receipt_sale_id')}: ${order.id.slice(-8)}</p>
            <p>${getTranslation('receipt_date')}: ${new Date().toLocaleString()}</p>
            <p>Payment: ${order.paymentMethod || 'Cash'}</p>
            <div class="receipt-divider"></div>
            <table>
                <thead>
                    <tr><th>${getTranslation('table_item')}</th><th>${getTranslation('table_qty')}</th><th class="text-right">${getTranslation('table_total')}</th></tr>
                </thead>
                <tbody>
                    ${order.items.map(i => `<tr><td>${i.name}</td><td>${i.quantity}</td><td class="text-right">${formatCurrency(i.quantity * i.price)}</td></tr>`).join('')}
                </tbody>
            </table>
            <div class="receipt-divider"></div>
            <div class="total-section">
                <p style="display:flex; justify-content:space-between;"><span>${getTranslation('label_subtotal')}:</span> <span>${formatCurrency(order.subtotal)}</span></p>
                <p style="display:flex; justify-content:space-between;"><span>${getTranslation('label_discount')}:</span> <span>-${formatCurrency(order.discount)}</span></p>
                <p style="display:flex; justify-content:space-between;"><span>${getTranslation('label_tax_rate_value', { rate: state.taxRate })}:</span> <span>${formatCurrency(order.tax)}</span></p>
                <div class="receipt-divider"></div>
                <h4 style="display:flex; justify-content:space-between;"><span>${getTranslation('label_total')}:</span> <span>${formatCurrency(order.total)}</span></h4>
            </div>
            <p class="footer-text">${getTranslation('receipt_thank_you')}</p>
        `;
        openModal('receipt-modal');
    }
    async function handleShareReceipt() {
        await captureAndDownload(true);
    }
    
    async function handleSaveReceiptImage() {
        await captureAndDownload(false);
    }

    async function captureAndDownload(shareMode = false) {
        const receiptElement = document.getElementById('receipt-content');
        const shareBtn = document.getElementById('share-receipt-btn');
        const saveBtn = document.getElementById('save-receipt-img-btn');
        const activeBtn = shareMode ? shareBtn : saveBtn;

        activeBtn.disabled = true;
        const originalText = activeBtn.innerHTML;
        activeBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;

        try {
            const canvas = await html2canvas(receiptElement, {
                backgroundColor: document.body.classList.contains('dark-mode') ? '#242526' : '#FFFFFF'
            });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `receipt-${Date.now()}.png`, { type: 'image/png' });

            if (shareMode && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: getTranslation('receipt_share_title'),
                    text: getTranslation('receipt_share_text')
                });
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(file);
                link.download = file.name;
                link.click();
            }
        } catch (err) {
            console.error('Operation failed:', err);
            alert(shareMode ? getTranslation('alert_share_fail') : "Failed to save image.");
        } finally {
            activeBtn.disabled = false;
            activeBtn.innerHTML = originalText;
        }
    }

    function viewFullImage(src) {
        if (!src) return;
        document.getElementById('full-size-image').src = src;
        openModal('image-viewer-modal');
    }
    function openDeleteModal(id, type, fromModal = false) {
        itemToDelete = { id, type, fromModal };
        const typeName = getTranslation(`entity_${type}`);
        showConfirmation({
            title: getTranslation('confirm_delete_item_title'),
            message: getTranslation('confirm_delete_item_msg', { type: typeName }),
            okText: 'btn_delete',
            onConfirm: handleDelete
        });
    }
    async function handleDelete() {
        if (!itemToDelete) return;
        const { id, type, fromModal } = itemToDelete;
        try {
            if (type === 'product') {
                await db.delete('products', id);
                await db.delete('stock', id);
                const purchases = await db.getAll('purchases', 'productId', IDBKeyRange.only(id));
                for(const p of purchases) await db.delete('purchases', p.id);
                await renderProductsPage();
                await renderStockPage();
                await renderPurchasesPage();
            } else if (type === 'category') {
                const productCount = await db.count('products', 'categoryId', IDBKeyRange.only(id));
                if (productCount > 0) {
                    alert(getTranslation('alert_cannot_delete_category', { count: productCount }));
                    closeModal('confirm-modal');
                    return;
                }
                await db.delete('categories', id);
                await renderCategoriesPage();
                await populateFilterDropdowns();
            } else if (type === 'purchase') {
                const purchase = await db.get('purchases', id);
                const stockItem = await db.get('stock', purchase.productId);
                if (stockItem) {
                    stockItem.quantity = Math.max(0, stockItem.quantity - purchase.quantity);
                    await db.put('stock', stockItem);
                }
                await db.delete('purchases', id);
                await Promise.all([renderPurchasesPage(), renderStockPage()]);
            } else if (type === 'sale') {
                await db.delete('orders', id);
                await renderSaleHistoryPage();
            }
            closeModal('confirm-modal');
            if (fromModal) closeModal(`${type}-modal`);
        } catch (error) {
            console.error("Deletion failed:", error);
            alert(getTranslation('alert_delete_fail'));
        } finally {
            itemToDelete = null;
        }
    }
    async function handleDeleteDataByMonth() {
        const month = document.getElementById('delete-data-month').value;
        const year = document.getElementById('delete-data-year').value;
        const monthName = getTranslation('month_names')[month - 1];
        if (!month || !year) {
            alert(getTranslation('alert_select_month_year'));
            return;
        }
        showConfirmation({
            title: getTranslation('label_delete_by_month'),
            message: getTranslation('confirm_delete_data_for_month_msg', { monthName, year }),
            async onConfirm() {
                 try {
                    const monthPadded = month.toString().padStart(2, '0');
                    const startDate = `${year}-${monthPadded}-01`;
                    const lastDayOfMonth = new Date(year, month, 0).getDate();
                    const endDate = `${year}-${monthPadded}-${lastDayOfMonth}`;
                    const orderTx = dbInstance.transaction('orders', 'readwrite');
                    const orderStore = orderTx.objectStore('orders');
                    const orderIndex = orderStore.index('date');
                    const orderCursor = await orderIndex.openCursor(IDBKeyRange.bound(startDate, endDate));
                    if (orderCursor) {
                        do {
                            orderCursor.delete();
                        } while (await orderCursor.continue());
                    }
                    await new Promise(resolve => orderTx.oncomplete = resolve);
                    const purchaseTx = dbInstance.transaction('purchases', 'readwrite');
                    const purchaseStore = purchaseTx.objectStore('purchases');
                    const purchaseIndex = purchaseStore.index('dateTime');
                    const purchaseCursor = await purchaseIndex.openCursor(IDBKeyRange.bound(`${startDate}T00:00`, `${endDate}T23:59:59`));
                    if (purchaseCursor) {
                        do {
                            purchaseCursor.delete();
                        } while (await purchaseCursor.continue());
                    }
                    await new Promise(resolve => purchaseTx.oncomplete = resolve);
                    alert(getTranslation('alert_data_deleted_for_month', { monthName, year }));
                    closeModal('confirm-modal');
                } catch (error) {
                    console.error('Error deleting data by month:', error);
                    alert(getTranslation('alert_error_deleting_data'));
                    closeModal('confirm-modal');
                }
            }
        });
    }
    function handleResetAllData() {
        const confirmWord = getTranslation('prompt_reset_confirm_word');
        showConfirmation({
            title: getTranslation('confirm_reset_all_data_title'),
            message: getTranslation('prompt_reset_all_data_msg'),
            requiresInput: true,
            inputPlaceholder: getTranslation('prompt_reset_confirm_word'),
            async onConfirm(inputValue) {
                if (inputValue !== confirmWord) {
                    alert(getTranslation('alert_reset_cancelled'));
                    closeModal('confirm-modal');
                    return;
                }
                try {
                    const storeNames = ['products', 'categories', 'stock', 'purchases', 'orders'];
                    const tx = dbInstance.transaction(storeNames, 'readwrite');
                    for (const storeName of storeNames) tx.objectStore(storeName).clear();
                    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = event => reject(event.target.error); });
                    alert(getTranslation('alert_all_data_reset'));
                    await initSampleData();
                    await populateFilterDropdowns();
                    state.currentSection = 'notes';
                    await render();
                } catch (error) {
                    console.error('Failed to reset data:', error);
                    alert(getTranslation('alert_reset_fail'));
                } finally {
                    closeModal('confirm-modal');
                }
            }
        });
    }
    async function generateDailyReport() {
        const date = document.getElementById('report-date').value;
        if (!date) { alert(getTranslation('alert_select_date')); return; }
        try {
            const range = IDBKeyRange.only(date);
            const orders = (await db.getAll('orders', 'date', range)).filter(o => o.status === 'completed');
           const purchases = (await db.getAll('purchases')).filter(p => p.dateTime.startsWith(date));
            const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
            const totalCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
            const netProfit = totalRevenue - totalCost;
            
            const cashSales = orders.filter(o => !o.paymentMethod || o.paymentMethod === 'Cash').reduce((sum, o) => sum + o.total, 0);
            const kbzSales = orders.filter(o => o.paymentMethod === 'KBZ Pay').reduce((sum, o) => sum + o.total, 0);

            const reportTitle = `${getTranslation('title_daily_report')} - ${date}`;
            const summaryData = [
                { label: getTranslation('stat_total_revenue'), value: totalRevenue },
                { label: getTranslation('stat_total_cost'), value: totalCost },
                { label: getTranslation('stat_net_profit'), value: netProfit },
                { label: getTranslation('stat_cash_sales'), value: cashSales },
                { label: getTranslation('stat_kbz_sales'), value: kbzSales }
            ];
            let reportHtml = `<h4>${reportTitle}</h4>
                <div class="akmstats-grid">
                    ${summaryData.map(item => `<div class="akmstat-card"><span class="akmstat-title">${item.label}</span><span class="akmstat-value">${formatCurrency(item.value)}</span></div>`).join('')}
                </div>`;
            document.getElementById('report-content').innerHTML = reportHtml;
            document.getElementById('report-date-title').textContent = date;
            openModal('report-modal');
        } catch(e) {
            console.error("Report generation failed:", e);
        }
    }

    async function generateMonthlyReport() {
        const month = document.getElementById('report-month').value;
        const year = document.getElementById('report-year').value;
        if (!month || !year) { alert(getTranslation('alert_select_month_year')); return; }
        try {
            const monthPadded = month.toString().padStart(2, '0');
            const startDate = `${year}-${monthPadded}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${monthPadded}-${lastDay}`;
            const monthNames = getTranslation('month_names');
            const monthName = monthNames[month - 1];
            const reportTitleText = `${monthName} ${year}`;
            
            const orderRange = IDBKeyRange.bound(startDate, endDate);
            const orders = (await db.getAll('orders', 'date', orderRange)).filter(o => o.status === 'completed');
            
            const purchaseStartDate = `${startDate}T00:00`;
            const purchaseEndDate = `${endDate}T23:59:59`;
            const purchaseRange = IDBKeyRange.bound(purchaseStartDate, purchaseEndDate);
            const purchases = await db.getAll('purchases', 'dateTime', purchaseRange);
            
            const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
            const totalCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
            const netProfit = totalRevenue - totalCost;

            // Payment Method Breakdown
            const cashSales = orders.filter(o => !o.paymentMethod || o.paymentMethod === 'Cash').reduce((sum, o) => sum + o.total, 0);
            const kbzSales = orders.filter(o => o.paymentMethod === 'KBZ Pay').reduce((sum, o) => sum + o.total, 0);

            const reportTitle = `${getTranslation('title_monthly_report')} - ${reportTitleText}`;
            const summaryData = [
                { label: getTranslation('stat_total_revenue'), value: totalRevenue },
                { label: getTranslation('stat_total_cost'), value: totalCost },
                { label: getTranslation('stat_net_profit'), value: netProfit },
                { label: getTranslation('stat_cash_sales'), value: cashSales },
                { label: getTranslation('stat_kbz_sales'), value: kbzSales }
            ];
            let reportHtml = `<h4>${reportTitle}</h4>
                <div class="akmstats-grid">
                    ${summaryData.map(item => `<div class="akmstat-card"><span class="akmstat-title">${item.label}</span><span class="akmstat-value">${formatCurrency(item.value)}</span></div>`).join('')}
                </div>`;
            document.getElementById('report-content').innerHTML = reportHtml;
            document.getElementById('report-date-title').textContent = reportTitleText;
            openModal('report-modal');
        } catch(e) {
            console.error("Monthly report generation failed:", e);
            alert(getTranslation('alert_monthly_report_fail'));
        }
    }

    async function exportToPDF(elementSelector, filename) {
        const { jsPDF } = window.jspdf;
        const content = document.querySelector(elementSelector);
        if (!content) return;
        try {
            const canvas = await html2canvas(content, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(filename);
        } catch (error) {
            console.error("PDF Export Error:", error);
            alert("Failed to export PDF.");
        }
    }
    function handleExportPurchasesPDF() {
        exportToPDF('#purchases-section .akmcard', `purchases-report-${Date.now()}.pdf`);
    }
    function handleExportSalesPDF() {
        exportToPDF('#sale-history-section .akmcard', `sales-history-${Date.now()}.pdf`);
    }
    function handleExportPurchasesCSV() {
        let csvContent = "data:text/csv;charset=utf-8,";
        const isBakery = state.appMode === 'bakery';
        csvContent += `Product Name,Supplier,Quantity,Unit Cost,Total Cost,Date${isBakery ? ',Expiry Date' : ''}\n`;
        state.filteredPurchases.forEach(p => {
            csvContent += `"${p.productName}","${p.supplier || ''}",${p.quantity},${p.unitCost},${p.totalCost},"${new Date(p.dateTime).toLocaleString()}"${isBakery ? ',' + (p.expiryDate || '') : ''}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `purchases-report-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function handleExportSalesCSV() {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Sale ID,Date,Item Count,Payment Method,Subtotal,Discount,Tax,Grand Total\n";
        state.filteredSales.forEach(s => {
            csvContent += `#${s.id.slice(-8)},${s.date},${s.items.length},${s.paymentMethod || 'Cash'},${s.subtotal},${s.discount || 0},${s.tax},${s.total}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `sales-history-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    const GEMINI_API_KEY = 'AIzaSyCz7LOsgjnAZu18GR9-kXdC5fHbUl6IWJM';
    function initNotesApp() {
        const NOTES_DB_NAME = 'ChatNotesDB0613';
        const NOTES_DB_VERSION = 1;
        let notesDb;

        const views = { folder: document.getElementById('folder-view'), chat: document.getElementById('chat-view') };
        const folderList = document.getElementById('folder-list');
        const folderTitle = document.getElementById('folder-title');
        const messageList = document.getElementById('message-list');
        const chatTitle = document.getElementById('chat-title');
        const overlay = document.getElementById('cn-overlay');
        const composer = document.getElementById('composer');
        const expandComposerBtn = document.getElementById('expand-composer-btn');
        const backBtn = document.getElementById('back-btn');
        const createFolderBtn = document.getElementById('create-folder-btn');
        const closeChatBtn = document.getElementById('close-chat-btn');
        const sendBtn = document.getElementById('send-btn');
        const attachBtn = document.getElementById('attach-btn');
        const messageInput = document.getElementById('message-input');
        const imageInput = document.getElementById('image-input');
        const folderModal = { el: document.getElementById('folder-modal'), title: document.getElementById('folder-modal-title'), input: document.getElementById('folder-name-input'), confirmBtn: document.getElementById('folder-confirm-btn'), cancelBtn: document.getElementById('folder-cancel-btn') };
        const confirmDialog = { el: document.getElementById('confirm-dialog'), title: document.getElementById('confirm-title'), message: document.getElementById('confirm-message'), confirmBtn: document.getElementById('confirm-delete-btn'), cancelBtn: document.getElementById('confirm-cancel-btn') };
        
        const imageViewer = { view: document.getElementById('image-viewer-view'), img: document.getElementById('viewer-img'), downloadBtn: document.getElementById('viewer-download-btn'), closeBtn: document.getElementById('viewer-close-btn') };
        
        // --- NEW ADVANCED IMAGE EDITOR ELEMENTS ---
        const imageEditor = {
            overlay: document.getElementById('z-note-image-editor-overlay'),
            view: document.getElementById('z-note-image-editor'),
            closeBtn: document.getElementById('editorCloseBtn'),
            canvas: document.getElementById('editorCanvas'),
            ctx: document.getElementById('editorCanvas').getContext('2d'),
            container: document.querySelector('#z-note-image-editor .editor-canvas-container'),
            addTextBtn: document.getElementById('addTextBtn'),
            doodleBtn: document.getElementById('doodleBtn'),
            saveBtn: document.getElementById('saveCanvasBtn'),
            deleteBtn: document.getElementById('deleteImageBtn'),
            colorPalette: document.getElementById('colorPalette'),
            textEditorUI: document.getElementById('textEditorUI'),
            textEditorInput: document.getElementById('textEditorInput'),
            textResizeHandle: document.getElementById('text-resize-handle'),
            textRotateHandle: document.getElementById('text-rotate-handle'),
            textDeleteHandle: document.getElementById('text-delete-handle'),
        };
        
        const ICONS = {
            folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 21a3 3 0 003-3V9a3 3 0 00-3-3h-5.25a3 3 0 01-2.65-1.5L9.75 1.5a3 3 0 00-2.65-1.5H4.5a3 3 0 00-3 3v15a3 3 0 003 3h15z" /></svg>',
            edit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>',
            delete: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>',
            expand: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15" /></svg>',
            collapse: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" /></svg>',
        };
        let currentParentId = null;
        let currentFolder = null;
        let breadcrumb = [];
        let deleteTarget = { type: null, id: null };
        let editState = { type: null, id: null };
        
        // --- NEW ADVANCED EDITOR STATE VARIABLES ---
        let currentEditingImageInfo = { messageId: null, imageSrc: null };
        let isDoodling = false;
        let currentColor = 'red';
        let currentImage = new Image();
        let drawingActions = [];
        let scale = 1;
        let originX = 0;
        let originY = 0;
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let initialPinchDistance = null;
        let activeTextObject = null;
        let textAction = { type: null, startX: 0, startY: 0, startW: 0, startH: 0, startAngle: 0, startFontSize: 0 };


        const notesDbHelper = {
            init() { return new Promise((resolve, reject) => { const request = indexedDB.open(NOTES_DB_NAME, NOTES_DB_VERSION); request.onerror = e => reject("Database error: " + e.target.error); request.onsuccess = e => { notesDb = e.target.result; resolve(notesDb); }; request.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('folders')) { db.createObjectStore('folders', { keyPath: 'id', autoIncrement: true }); } if (!db.objectStoreNames.contains('messages')) { const messageStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true }); messageStore.createIndex('folderId', 'folderId', { unique: false }); } }; }); },
            add(storeName, item) { return new Promise((resolve, reject) => { const request = notesDb.transaction([storeName], 'readwrite').objectStore(storeName).add(item); request.onsuccess = e => resolve(e.target.result); request.onerror = e => reject("Add error: " + e.target.error); }); },
            update(storeName, item) { return new Promise((resolve, reject) => { const request = notesDb.transaction([storeName], 'readwrite').objectStore(storeName).put(item); request.onsuccess = e => resolve(e.target.result); request.onerror = e => reject("Update error: " + e.target.error); }); },
            delete(storeName, id) { return new Promise((resolve, reject) => { const request = notesDb.transaction([storeName], 'readwrite').objectStore(storeName).delete(id); request.onsuccess = () => resolve(); request.onerror = e => reject("Delete error: " + e.target.error); }); },
            getFolders(parentId) { return new Promise((resolve) => { const allFolders = []; notesDb.transaction(['folders'], 'readonly').objectStore('folders').openCursor().onsuccess = e => { const cursor = e.target.result; if (cursor) { if (cursor.value.parentId === parentId) allFolders.push(cursor.value); cursor.continue(); } else { resolve(allFolders); } }; }); },
            getFolder(id) { return new Promise((resolve, reject) => { const request = notesDb.transaction(['folders'], 'readonly').objectStore('folders').get(id); request.onsuccess = e => resolve(e.target.result); request.onerror = e => reject("Get folder error: " + e.target.error); }); },
            getMessage(id) { return new Promise((resolve, reject) => { const request = notesDb.transaction(['messages'], 'readonly').objectStore('messages').get(id); request.onsuccess = e => resolve(e.target.result); request.onerror = e => reject("Get message error: " + e.target.error); }); },
            getMessages(folderId) { return new Promise((resolve, reject) => { const request = notesDb.transaction(['messages'], 'readonly').objectStore('messages').index('folderId').getAll(folderId); request.onsuccess = e => resolve(e.target.result.sort((a,b) => a.timestamp - b.timestamp)); request.onerror = e => reject("Get messages error: " + e.target.error); }); },
            deleteMessagesOfFolder(folderId) { return new Promise((resolve, reject) => { const index = notesDb.transaction(['messages'], 'readwrite').objectStore('messages').index('folderId'); const request = index.openCursor(IDBKeyRange.only(folderId)); request.onsuccess = e => { const cursor = e.target.result; if(cursor) { cursor.delete(); cursor.continue(); } else { resolve(); } }; request.onerror = e => reject("Error deleting messages: " + e.target.error); }); }
        };
        function switchNotesView(viewName, data = {}) {
            Object.values(views).forEach(v => v.classList.remove('visible'));
            views[viewName].classList.add('visible');
            if (viewName === 'folder') {
                currentParentId = data.parentId !== undefined ? data.parentId : null;
                renderFolders();
                updateBreadcrumb();
            } else if (viewName === 'chat') {
                currentFolder = data.folder;
                chatTitle.textContent = currentFolder.name;
                renderMessages(currentFolder.id);
            }
        }
        function showNotesModal(modal, isVisible) {
            if (modal && modal.el) {
                modal.el.classList.toggle('show', isVisible);
            }
            overlay.classList.toggle('visible', isVisible);
        }
        async function renderFolders() {
            folderList.innerHTML = '';
            const folders = await notesDbHelper.getFolders(currentParentId);
            if (folders.length === 0) {
                const emptyMessage = currentParentId === null ? 'အဓိက Folder မရှိသေးပါ' : 'Secondary Folder မရှိသေးပါ';
                folderList.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--secondary-color);">${emptyMessage}</p>`;
            }
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'cn-folder';
                div.dataset.id = folder.id;
                div.innerHTML = `
                    <div class="cn-folder-icon">${ICONS.folder}</div>
                    <div class="cn-folder-name">${folder.name}</div>
                    <div class="cn-folder-actions">
                        <button class="cn-folder-action-btn rename" title="Rename">${ICONS.edit}</button>
                        <button class="cn-folder-action-btn delete" title="Delete">${ICONS.delete}</button>
                    </div>
                `;
                div.addEventListener('click', (e) => {
                    if (e.target.closest('.cn-folder-action-btn')) return;
                    breadcrumb.push({ id: currentParentId, name: folderTitle.textContent });
                    if (folder.parentId === null) {
                        switchNotesView('folder', { parentId: folder.id });
                        folderTitle.textContent = folder.name;
                    } else {
                        switchNotesView('chat', { folder });
                    }
                });
                div.querySelector('.rename').addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleFolderRename(folder.id, folder.name);
                });
                div.querySelector('.delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleFolderDelete(folder.id);
                });
                folderList.appendChild(div);
            });
        }
        async function renderMessages(folderId) {
            messageList.innerHTML = '';
            const messages = await notesDbHelper.getMessages(folderId);
            messages.forEach(msg => addMessageToDOM(msg));
            messageList.scrollTop = messageList.scrollHeight;
        }
        function addMessageToDOM(msg, isUpdate = false) {
            let wrapper = isUpdate ? messageList.querySelector(`.cn-chat-bubble-wrapper[data-id='${msg.id}']`) : document.createElement('div');
            if (!wrapper) { 
                wrapper = document.createElement('div');
                isUpdate = false;
            }
            wrapper.className = 'cn-chat-bubble-wrapper';
            wrapper.dataset.id = msg.id;
            let contentHTML = '';
            if(msg.type === 'text') {
                const pre = document.createElement('pre');
                pre.style.fontFamily = 'inherit';
                pre.style.margin = '0';
                pre.style.whiteSpace = 'pre-wrap';
                pre.textContent = msg.content;
                contentHTML = pre.outerHTML;
            } else if (msg.type === 'image') {
                contentHTML = `<img src="${msg.imageData}" alt="note image">`;
            }
            const formattedTimestamp = new Date(msg.timestamp).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            });
            wrapper.innerHTML = `
                <div class="cn-bubble-actions">
                    <button class="cn-action-btn edit" title="Edit">${ICONS.edit}</button>
                    <button class="cn-action-btn delete" title="Delete">${ICONS.delete}</button>
                </div>
                <div class="cn-chat-bubble" data-type="${msg.type}">
                    <div>${contentHTML}</div>
                    <div class="timestamp">${formattedTimestamp}</div>
                </div>`;
            if (msg.type === 'image') {
                wrapper.querySelector('img').addEventListener('click', (e) => {
                    e.stopPropagation();
                    imageViewer.img.src = msg.imageData;
                    imageViewer.downloadBtn.href = msg.imageData;
                    imageViewer.view.classList.add('visible');
                });
            }
            const editBtn = wrapper.querySelector('.edit');
            if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); handleMessageEdit(msg, wrapper); });
            const deleteBtn = wrapper.querySelector('.delete');
            if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); handleMessageDelete(msg.id, wrapper); });
            wrapper.querySelector('.cn-chat-bubble').addEventListener('click', () => {
                const isVisible = wrapper.classList.contains('actions-visible');
                document.querySelectorAll('.cn-chat-bubble-wrapper.actions-visible').forEach(el => el.classList.remove('actions-visible'));
                if (!isVisible) wrapper.classList.add('actions-visible');
            });
            if (!isUpdate) {
                messageList.appendChild(wrapper);
            }
            messageList.scrollTop = messageList.scrollHeight;
        }
        function handleFolderRename(id, currentName) {
            editState = { type: 'folder', id: id };
            folderModal.title.textContent = "Rename Folder";
            folderModal.confirmBtn.textContent = "Update";
            folderModal.input.value = currentName;
            showNotesModal(folderModal, true);
        }
        function handleFolderDelete(id) {
            deleteTarget = { type: 'folder', id: id };
            confirmDialog.title.textContent = "Delete Folder?";
            confirmDialog.message.textContent = "Folder နှင့် အတွင်းရှိအချက်အလက်များအားလုံး ဖျက်မှာ သေချာလား?";
            showNotesModal(confirmDialog, true);
        }
        async function handleMessageEdit(msg, wrapperElement) {
            if (msg.type === 'text') {
                const bubble = wrapperElement.querySelector('.cn-chat-bubble');
                const contentDiv = bubble.querySelector('div:first-child');
                const originalContent = msg.content;
                const editInput = document.createElement('textarea');
                editInput.value = originalContent;
                contentDiv.innerHTML = '';
                contentDiv.appendChild(editInput);
                editInput.style.height = 'auto';
                editInput.style.height = editInput.scrollHeight + 'px';
                editInput.focus();
                const saveChanges = async () => {
                    const newContent = editInput.value.trim();
                    bubble.removeEventListener('click', saveChanges);
                    if(newContent && newContent !== originalContent) {
                       const messageToUpdate = await notesDbHelper.getMessage(msg.id);
                       messageToUpdate.content = newContent;
                       messageToUpdate.timestamp = Date.now();
                       await notesDbHelper.update('messages', messageToUpdate);
                       addMessageToDOM(messageToUpdate, true);
                    } else {
                       addMessageToDOM(msg, true);
                    }
                };
                editInput.addEventListener('blur', saveChanges);
                editInput.addEventListener('keydown', (e) => { 
                    if (e.key === 'Enter' && e.metaKey) {
                        e.preventDefault(); 
                        saveChanges(); 
                    } 
                });
            } else if (msg.type === 'image') {
                const message = await notesDbHelper.getMessage(msg.id);
                openImageEditor(message);
            }
        }
        function handleMessageDelete(id, wrapperElement) {
            deleteTarget = { type: 'message', id: id, element: wrapperElement };
            confirmDialog.title.textContent = "Delete Message?";
            confirmDialog.message.textContent = "ဒီစာကို ဖျက်မှာ သေချာလား?";
            showNotesModal(confirmDialog, true);
        }
        createFolderBtn.onclick = () => {
            editState = { type: null, id: null };
            folderModal.title.textContent = currentParentId === null ? "Create Main Folder" : "Create Secondary Folder";
            folderModal.confirmBtn.textContent = "Create";
            folderModal.input.value = "";
            showNotesModal(folderModal, true);
            folderModal.input.focus();
        };
        folderModal.confirmBtn.onclick = async () => {
            const name = folderModal.input.value.trim();
            if (!name) return;
            if (editState.type === 'folder' && editState.id) {
                const folderToUpdate = await notesDbHelper.getFolder(editState.id);
                folderToUpdate.name = name;
                await notesDbHelper.update('folders', folderToUpdate);
            } else {
                await notesDbHelper.add('folders', { name, parentId: currentParentId });
            }
            renderFolders();
            showNotesModal(folderModal, false);
        };
        folderModal.cancelBtn.onclick = () => showNotesModal(folderModal, false);
        document.querySelector('.akm-modal-close[data-target="folder-modal"]').addEventListener('click', () => showNotesModal(folderModal, false));
        confirmDialog.confirmBtn.onclick = async () => {
            if (deleteTarget.type === 'folder') {
                const folder = await notesDbHelper.getFolder(deleteTarget.id);
                if (folder.parentId !== null) {
                    await notesDbHelper.deleteMessagesOfFolder(deleteTarget.id);
                } else {
                    const subfolders = await notesDbHelper.getFolders(deleteTarget.id);
                    for (const sub of subfolders) {
                        await notesDbHelper.deleteMessagesOfFolder(sub.id);
                        await notesDbHelper.delete('folders', sub.id);
                    }
                }
                await notesDbHelper.delete('folders', deleteTarget.id);
                renderFolders();
            } else if (deleteTarget.type === 'message') {
                await notesDbHelper.delete('messages', deleteTarget.id);
                deleteTarget.element.remove();
            }
            showNotesModal(confirmDialog, false);
        };
        confirmDialog.cancelBtn.onclick = () => showNotesModal(confirmDialog, false);
        document.querySelector('.akm-modal-close[data-target="confirm-dialog"]').addEventListener('click', () => showNotesModal(confirmDialog, false));

        backBtn.onclick = closeChatBtn.onclick = () => {
            if (composer.classList.contains('expanded')) {
                composer.classList.remove('expanded');
                expandComposerBtn.innerHTML = ICONS.expand;
                expandComposerBtn.title = 'Expand Composer';
                return;
            }
            if (breadcrumb.length > 0) {
                const parent = breadcrumb.pop();
                folderTitle.textContent = parent.name;
                switchNotesView('folder', { parentId: parent.id });
            }
        };
        function updateBreadcrumb() {
            backBtn.style.visibility = breadcrumb.length > 1 ? 'visible' : 'hidden';
        }
        function autoGrowTextarea() {
            if (!composer.classList.contains('expanded')) {
                messageInput.style.height = 'auto';
                messageInput.style.height = (messageInput.scrollHeight) + 'px';
            }
        }
        messageInput.addEventListener('input', autoGrowTextarea);
        expandComposerBtn.addEventListener('click', () => {
            const isExpanded = composer.classList.toggle('expanded');
            expandComposerBtn.innerHTML = isExpanded ? ICONS.collapse : ICONS.expand;
            expandComposerBtn.title = isExpanded ? 'Collapse Composer' : 'Expand Composer';
            messageInput.style.height = '';
            messageInput.focus();
        });
        async function sendMessage() {
            const text = messageInput.value.trim();
            if(!text) return;
            const message = { folderId: currentFolder.id, type: 'text', content: text, drawingActions: [], timestamp: Date.now() };
            const newId = await notesDbHelper.add('messages', message);
            message.id = newId;
            addMessageToDOM(message);
            messageInput.value = '';
            autoGrowTextarea();
            messageInput.focus();
        }
        sendBtn.onclick = sendMessage;
        attachBtn.onclick = () => imageInput.click();
        imageInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                editState = { type: null, id: null };
                const reader = new FileReader();
                reader.onload = (event) => openImageEditor({ imageData: event.target.result, drawingActions: [] });
                reader.readAsDataURL(file);
            }
            imageInput.value = '';
        };
        overlay.onclick = () => {
            showNotesModal(folderModal, false);
            showNotesModal(confirmDialog, false);
        };
        
        // --- NEW ADVANCED IMAGE EDITOR FUNCTIONS ---
        function openImageEditor(messageObject) {
            const { id: messageId, imageData, drawingActions: existingActions } = messageObject;
            currentEditingImageInfo = { messageId, imageSrc: imageData };
            imageEditor.overlay.style.display = 'block';
            imageEditor.view.classList.add('visible');
            drawingActions = existingActions ? JSON.parse(JSON.stringify(existingActions)) : [];
            currentImage.onload = () => {
                imageEditor.canvas.width = currentImage.width;
                imageEditor.canvas.height = currentImage.height;
                resetAndCenterImage();
            };
            currentImage.src = imageData;
        }

        function closeImageEditor() {
            imageEditor.overlay.style.display = 'none';
            imageEditor.view.classList.remove('visible');
            currentEditingImageInfo = { messageId: null, imageSrc: null };
            isDoodling = false;
            imageEditor.canvas.classList.remove('doodle-mode');
            drawingActions = [];
            deactivateTextObject();
        }
        
        function resetAndCenterImage() {
            scale = Math.min(imageEditor.container.clientWidth / currentImage.width, imageEditor.container.clientHeight / currentImage.height);
            originX = (imageEditor.container.clientWidth - (currentImage.width * scale)) / 2;
            originY = (imageEditor.container.clientHeight - (currentImage.height * scale)) / 2;
            redrawCanvas();
        }

        function redrawCanvas() {
            const { ctx, canvas, container } = imageEditor;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = container.clientWidth;
            tempCanvas.height = container.clientHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.save();
            tempCtx.translate(originX, originY);
            tempCtx.scale(scale, scale);
            tempCtx.drawImage(currentImage, 0, 0);
            drawingActions.forEach(action => {
                tempCtx.save();
                if (action.type === 'path') {
                    tempCtx.strokeStyle = action.color;
                    tempCtx.lineWidth = action.width;
                    tempCtx.lineCap = 'round';
                    tempCtx.lineJoin = 'round';
                    tempCtx.beginPath();
                    tempCtx.moveTo(action.points[0].x, action.points[0].y);
                    for (let i = 1; i < action.points.length; i++) {
                        tempCtx.lineTo(action.points[i].x, action.points[i].y);
                    }
                    tempCtx.stroke();
                } else if (action.type === 'text') {
                    if (activeTextObject && action.id === activeTextObject.id) {
                        tempCtx.restore();
                        return;
                    }
                    tempCtx.translate(action.x, action.y);
                    tempCtx.rotate(action.rotation);
                    tempCtx.font = `${action.fontSize}px sans-serif`;
                    tempCtx.fillStyle = action.color;
                    tempCtx.textAlign = 'center';
                    tempCtx.textBaseline = 'middle';
                    tempCtx.fillText(action.text, 0, 0);
                }
                tempCtx.restore();
            });
            tempCtx.restore();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = tempCanvas.width;
            canvas.height = tempCanvas.height;
            ctx.drawImage(tempCanvas, 0, 0);
            if (activeTextObject) {
                updateTextEditorUIPosition();
            }
        }
        
        async function saveAndSendImage() {
            deactivateTextObject();
            const { messageId, imageSrc } = currentEditingImageInfo;
            
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = currentImage.width;
            finalCanvas.height = currentImage.height;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(currentImage, 0, 0);
            drawingActions.forEach(action => {
                finalCtx.save();
                if (action.type === 'path') {
                    finalCtx.strokeStyle = action.color;
                    finalCtx.lineWidth = action.width;
                    finalCtx.lineCap = 'round';
                    finalCtx.lineJoin = 'round';
                    finalCtx.beginPath();
                    finalCtx.moveTo(action.points[0].x, action.points[0].y);
                    for (let i = 1; i < action.points.length; i++) {
                        finalCtx.lineTo(action.points[i].x, action.points[i].y);
                    }
                    finalCtx.stroke();
                } else if (action.type === 'text') {
                    finalCtx.translate(action.x, action.y);
                    finalCtx.rotate(action.rotation);
                    finalCtx.font = `${action.fontSize}px sans-serif`;
                    finalCtx.fillStyle = action.color;
                    finalCtx.textAlign = 'center';
                    finalCtx.textBaseline = 'middle';
                    finalCtx.fillText(action.text, 0, 0);
                }
                finalCtx.restore();
            });

            const newImageData = finalCanvas.toDataURL('image/png');
            let message;

            if (messageId) {
                message = await notesDbHelper.getMessage(messageId);
                message.imageData = newImageData;
                message.drawingActions = drawingActions;
                message.timestamp = Date.now();
                await notesDbHelper.update('messages', message);
                addMessageToDOM(message, true);
            } else {
                message = { folderId: currentFolder.id, type: 'image', imageData: newImageData, drawingActions: drawingActions, timestamp: Date.now() };
                const newId = await notesDbHelper.add('messages', message);
                message.id = newId;
                addMessageToDOM(message);
            }
            
            closeImageEditor();
        }

        function activateTextObject(textObject) {
            if (activeTextObject && activeTextObject.id === textObject.id) return;
            deactivateTextObject();
            activeTextObject = textObject;
            imageEditor.textEditorUI.style.display = 'block';
            imageEditor.textEditorInput.value = textObject.text;
            imageEditor.textEditorInput.style.color = textObject.color;
            imageEditor.textEditorInput.style.webkitTextFillColor = textObject.color;
            imageEditor.textEditorInput.focus();
            imageEditor.textEditorInput.select();
            updateTextEditorUIPosition();
            redrawCanvas();
        }

        function deactivateTextObject() {
            if (!activeTextObject) return;
            const tempCtx = document.createElement('canvas').getContext('2d');
            tempCtx.font = `${activeTextObject.fontSize}px sans-serif`;
            activeTextObject.width = tempCtx.measureText(activeTextObject.text).width + 20;
            activeTextObject = null;
            imageEditor.textEditorUI.style.display = 'none';
            redrawCanvas();
        }
        
        function updateTextEditorUIPosition() {
            if (!activeTextObject) return;
            const screenPos = canvasToScreenCoords(activeTextObject);
            const tempCtx = document.createElement('canvas').getContext('2d');
            tempCtx.font = `${activeTextObject.fontSize * scale}px sans-serif`;
            const textMetrics = tempCtx.measureText(activeTextObject.text);
            const textWidth = textMetrics.width;
            const uiWidth = textWidth + 30;
            const uiHeight = (activeTextObject.fontSize * scale) * 1.5;
            imageEditor.textEditorUI.style.width = `${uiWidth}px`;
            imageEditor.textEditorUI.style.height = `${uiHeight}px`;
            imageEditor.textEditorUI.style.fontSize = `${activeTextObject.fontSize * scale}px`;
            imageEditor.textEditorUI.style.transform = `translate(-50%, -50%) translate(${screenPos.x}px, ${screenPos.y}px) rotate(${activeTextObject.rotation}rad)`;
            imageEditor.textEditorUI.style.transformOrigin = 'center center';
        }
        
        function getCanvasCoords(e) { const rect = imageEditor.canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left - originX) / scale, y: (clientY - rect.top - originY) / scale }; }
        function screenToCanvasCoords(e) { const rect = imageEditor.canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left - originX) / scale, y: (clientY - rect.top - originY) / scale }; }
        function canvasToScreenCoords(point) { return { x: point.x * scale + originX, y: point.y * scale + originY }; }
        
        function hitTestText(point) {
            for (let i = drawingActions.length - 1; i >= 0; i--) {
                const action = drawingActions[i];
                if (action.type !== 'text') continue;
                const matrix = new DOMMatrix();
                matrix.translateSelf(action.x, action.y);
                matrix.rotateSelf(action.rotation * 180 / Math.PI);
                const inverseMatrix = matrix.inverse();
                const localPoint = new DOMPoint(point.x, point.y).matrixTransform(inverseMatrix);
                const textWidth = action.width || 200;
                const textHeight = action.fontSize;
                const halfW = textWidth / 2;
                const halfH = textHeight / 2;
                if (localPoint.x >= -halfW && localPoint.x <= halfW && localPoint.y >= -halfH && localPoint.y <= halfH) {
                    return action;
                }
            }
            return null;
        }

        function handleMouseDown(e) {
            const canvasPoint = getCanvasCoords(e);
            const hitObject = hitTestText(canvasPoint);
            if (hitObject) {
                isDoodling = false;
                imageEditor.doodleBtn.textContent = "Doodle";
                imageEditor.canvas.classList.remove('doodle-mode');
                activateTextObject(hitObject);
                return;
            }
            if (activeTextObject) {
                deactivateTextObject();
            }
            if (isDoodling) {
                const newPath = {
                    type: 'path',
                    color: currentColor,
                    width: 5,
                    points: [canvasPoint]
                };
                drawingActions.push(newPath);
                imageEditor.canvas.addEventListener('mousemove', handleDoodleMove);
                imageEditor.canvas.addEventListener('touchmove', handleDoodleMove);
            } else {
                isPanning = true;
                panStart.x = e.touches ? e.touches[0].clientX : e.clientX;
                panStart.y = e.touches ? e.touches[0].clientY : e.clientY;
            }
        }
        
        function handleTextActionStart(e, type) {
            e.preventDefault();
            e.stopPropagation();
            if (!activeTextObject) return;
            textAction.type = type;
            textAction.startX = e.touches ? e.touches[0].clientX : e.clientX;
            textAction.startY = e.touches ? e.touches[0].clientY : e.clientY;
            if (type === 'resize') {
                textAction.startFontSize = activeTextObject.fontSize;
            } else if (type === 'rotate') {
                const screenPos = canvasToScreenCoords(activeTextObject);
                textAction.startAngle = Math.atan2(textAction.startY - screenPos.y, textAction.startX - screenPos.x) - activeTextObject.rotation;
            }
            window.addEventListener('mousemove', handleTextActionMove);
            window.addEventListener('touchmove', handleTextActionMove, { passive: false });
            window.addEventListener('mouseup', handleTextActionEnd);
            window.addEventListener('touchend', handleTextActionEnd);
        }

        function handleTextActionMove(e) {
            e.preventDefault();
            if (!textAction.type || !activeTextObject) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            if (textAction.type === 'move') {
                const dx = (clientX - textAction.startX) / scale;
                const dy = (clientY - textAction.startY) / scale;
                activeTextObject.x += dx;
                activeTextObject.y += dy;
                textAction.startX = clientX;
                textAction.startY = clientY;
            } else if (textAction.type === 'resize') {
                const dx = clientX - textAction.startX;
                const dy = clientY - textAction.startY;
                const distance = Math.sqrt(dx * dx + dy * dy) * (dx > 0 ? 1 : -1);
                activeTextObject.fontSize = Math.max(10, textAction.startFontSize + distance / scale);
            } else if (textAction.type === 'rotate') {
                const screenPos = canvasToScreenCoords(activeTextObject);
                const angle = Math.atan2(clientY - screenPos.y, clientX - screenPos.x);
                activeTextObject.rotation = angle - textAction.startAngle;
            }
            updateTextEditorUIPosition();
            redrawCanvas();
        }

        function handleTextActionEnd() {
            textAction.type = null;
            window.removeEventListener('mousemove', handleTextActionMove);
            window.removeEventListener('touchmove', handleTextActionMove);
            window.removeEventListener('mouseup', handleTextActionEnd);
            window.removeEventListener('touchend', handleTextActionEnd);
        }

        function handleMouseUp() { isPanning = false; initialPinchDistance = null; imageEditor.canvas.removeEventListener('mousemove', handleDoodleMove); imageEditor.canvas.removeEventListener('touchmove', handleDoodleMove); }
        function handleMouseMove(e) { e.preventDefault(); if (isPanning) { const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; originX += clientX - panStart.x; originY += clientY - panStart.y; panStart.x = clientX; panStart.y = clientY; redrawCanvas(); } }
        function handleDoodleMove(e){ e.preventDefault(); drawingActions[drawingActions.length - 1].points.push(getCanvasCoords(e)); redrawCanvas(); }
        function handleTouchMove(e) { if (activeTextObject) return; e.preventDefault(); if (e.touches.length === 2) { handlePinch(e); } else if (e.touches.length === 1) { if(isDoodling) handleDoodleMove(e); else handleMouseMove(e); } }
        function getPinchDistance(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
        function handlePinch(e) { const newDist = getPinchDistance(e); if(initialPinchDistance == null) { initialPinchDistance = newDist; return; } const scaleFactor = newDist / initialPinchDistance; const rect = imageEditor.canvas.getBoundingClientRect(); const pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left; const pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top; originX = pinchCenterX - (pinchCenterX - originX) * scaleFactor; originY = pinchCenterY - (pinchCenterY - originY) * scaleFactor; scale *= scaleFactor; initialPinchDistance = newDist; redrawCanvas(); }
        function handleWheel(e) { e.preventDefault(); const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1; const rect = imageEditor.canvas.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; originX = mouseX - (mouseX - originX) * scaleFactor; originY = mouseY - (mouseY - originY) * scaleFactor; scale *= scaleFactor; redrawCanvas(); }

        // --- Event Listeners for new editor ---
        imageEditor.closeBtn.addEventListener('click', closeImageEditor);
        imageEditor.saveBtn.addEventListener('click', saveAndSendImage);
        imageEditor.doodleBtn.addEventListener('click', () => { deactivateTextObject(); isDoodling = !isDoodling; imageEditor.canvas.classList.toggle('doodle-mode', isDoodling); imageEditor.doodleBtn.textContent = isDoodling ? "Stop Doodling" : "Doodle"; });
        imageEditor.addTextBtn.addEventListener('click', () => { deactivateTextObject(); isDoodling = false; imageEditor.doodleBtn.textContent = "Doodle"; imageEditor.canvas.classList.remove('doodle-mode'); const center = screenToCanvasCoords({ clientX: imageEditor.container.clientWidth / 2, clientY: imageEditor.container.clientHeight / 2}); const newTextObject = { id: Date.now(), type: 'text', text: 'Enter Text', x: center.x, y: center.y, fontSize: 40, color: currentColor, rotation: 0, width: 200 }; drawingActions.push(newTextObject); activateTextObject(newTextObject); redrawCanvas(); });
        imageEditor.textEditorUI.addEventListener('mousedown', (e) => handleTextActionStart(e, 'move'));
        imageEditor.textEditorUI.addEventListener('touchstart', (e) => handleTextActionStart(e, 'move'), { passive: false });
        imageEditor.textResizeHandle.addEventListener('mousedown', (e) => handleTextActionStart(e, 'resize'));
        imageEditor.textResizeHandle.addEventListener('touchstart', (e) => handleTextActionStart(e, 'resize'), { passive: false });
        imageEditor.textRotateHandle.addEventListener('mousedown', (e) => handleTextActionStart(e, 'rotate'));
        imageEditor.textRotateHandle.addEventListener('touchstart', (e) => handleTextActionStart(e, 'rotate'), { passive: false });
        imageEditor.textDeleteHandle.addEventListener('click', (e) => { e.stopPropagation(); if(activeTextObject) { drawingActions = drawingActions.filter(a => a.id !== activeTextObject.id); deactivateTextObject(); } });
        imageEditor.textEditorInput.addEventListener('input', () => { if (!activeTextObject) return; activeTextObject.text = imageEditor.textEditorInput.value; updateTextEditorUIPosition(); });
        imageEditor.colorPalette.addEventListener('click', (e) => { const swatch = e.target.closest('.color-swatch'); if (!swatch) return; currentColor = swatch.dataset.color; imageEditor.colorPalette.querySelector('.selected').classList.remove('selected'); swatch.classList.add('selected'); if (activeTextObject) { activeTextObject.color = currentColor; imageEditor.textEditorInput.style.color = currentColor; imageEditor.textEditorInput.style.webkitTextFillColor = currentColor; redrawCanvas(); } });
        imageEditor.deleteBtn.addEventListener('click', async () => {
             const { messageId } = currentEditingImageInfo;
             if(messageId && confirm('Are you sure you want to delete this image message?')){
                await notesDbHelper.delete('messages', messageId);
                const wrapper = messageList.querySelector(`.cn-chat-bubble-wrapper[data-id='${messageId}']`);
                if(wrapper) wrapper.remove();
                closeImageEditor();
             }
        });

        imageEditor.canvas.addEventListener('mousedown', handleMouseDown);
        imageEditor.canvas.addEventListener('mouseup', handleMouseUp);
        imageEditor.canvas.addEventListener('mouseleave', handleMouseUp);
        imageEditor.canvas.addEventListener('mousemove', handleMouseMove);
        imageEditor.canvas.addEventListener('wheel', handleWheel);
        imageEditor.canvas.addEventListener('touchstart', handleMouseDown);
        imageEditor.canvas.addEventListener('touchend', handleMouseUp);
        imageEditor.canvas.addEventListener('touchmove', handleTouchMove, { passive: false });


        imageViewer.closeBtn.onclick = () => {
            imageViewer.view.classList.remove('visible');
        };
        imageViewer.view.addEventListener('click', (e) => {
            if (e.target.id === 'image-viewer-view') {
                imageViewer.view.classList.remove('visible');
            }
        });
        
        async function startNotesApp() {
            try {
                await notesDbHelper.init();
                breadcrumb.push({ id: null, name: 'My Notes' });
                expandComposerBtn.innerHTML = ICONS.expand;
                switchNotesView('folder', { parentId: null });
            } catch (error) {
                console.error("Notes App Initialization failed:", error);
                alert("Could not initialize the notes app. Please check browser permissions for IndexedDB.");
            }
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.cn-chat-bubble-wrapper')) {
                    document.querySelectorAll('.cn-chat-bubble-wrapper.actions-visible').forEach(el => el.classList.remove('actions-visible'));
                }
            });
        }

        startNotesApp();
    }

    async function init() {
        try {
            await openDatabase();
            await initSampleData();
            
            const [theme, tax, language, appMode] = await Promise.all([
                db.get('settings', 'theme'),
                db.get('settings', 'taxRate'),
                db.get('settings', 'language'),
                db.get('settings', 'appMode'),
            ]);
            state.currentLanguage = language ? language.value : 'mm';
            await applyTheme();
            await setLanguage(state.currentLanguage);
            applyAppMode(appMode ? appMode.value : 'retail');
            state.taxRate = tax ? tax.value : 0;
            
            setupEventListeners();
            await render();
            
            initNotesApp();

            console.log('POS System Initialized (v3.3 Integrated)');
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Failed to initialize application. Please refresh the page.');
        }
    }
    init();
});