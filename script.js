/* ============================================================
   L'Oréal Smart Routine & Product Advisor
   ============================================================ */

/* Cloudflare Worker URL (the API key lives safely in the Worker, never here) */
const WORKER_URL = "https://loreal-beauty-advisor-api.dina-seoudii.workers.dev/";

/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearAllBtn = document.getElementById("clearAll");
const generateBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const webSearchToggle = document.getElementById("webSearchToggle");
const rtlToggle = document.getElementById("rtlToggle");

/* ---------- App state ---------- */

/* All products from products.json */
let allProducts = [];

/* IDs of selected products — loaded from localStorage so they survive a reload */
let selectedIds = loadSelectedIds();

/* The system prompt keeps the AI focused and on-brand */
const SYSTEM_PROMPT = `You are "L'Oréal Beauty Advisor", a friendly expert for L'Oréal Groupe brands
(CeraVe, L'Oréal Paris, Garnier, Lancôme, La Roche-Posay, Maybelline, Kérastase, Redken, Vichy, and more).

Your job:
1. When given a list of selected products (as JSON), build a clear, personalized routine that uses ONLY those products.
   - Split it into AM and PM (or "Hair", "Makeup", etc. when it makes more sense).
   - Put steps in the correct order (e.g., cleanse → treat → moisturize → SPF).
   - For each step give the product name, how to use it, and one short tip.
   - If an important step is missing (like sunscreen), briefly suggest adding one.
2. Answer follow-up questions about the routine, the selected products, or beauty topics:
   skincare, haircare, makeup, fragrance, suncare, and grooming.
3. If the user asks about anything unrelated, politely say you can only help with beauty and routine questions.

Style: warm, concise, use short headings and numbered steps. Use Markdown.
Don't make medical diagnoses — suggest a dermatologist for serious skin concerns.
When you use information from the web, include the source links.`;

/* Full conversation history — sent with every request so the AI remembers context */
let messages = [{ role: "system", content: SYSTEM_PROMPT }];

/* ---------- Load & display products ---------- */

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">No products match your search.</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedIds.includes(product.id);
      return `
      <div class="product-card ${isSelected ? "selected" : ""}"
           data-id="${product.id}"
           role="button"
           tabindex="0"
           aria-pressed="${isSelected}">
        <span class="check-badge"><i class="fa-solid fa-check"></i></span>
        <img src="${product.image}" alt="${product.name}">
        <div class="product-info">
          <p class="brand">${product.brand}</p>
          <h3>${product.name}</h3>
          <button class="desc-toggle" type="button"
                  aria-expanded="false" aria-controls="desc-${product.id}">
            <i class="fa-solid fa-circle-info"></i> Details
          </button>
        </div>
        <p class="product-desc" id="desc-${product.id}" hidden>${product.description}</p>
      </div>
    `;
    })
    .join("");
}

/* Show products that match BOTH the category and the search text */
function applyFilters() {
  const category = categoryFilter.value;
  const searchText = productSearch.value.trim().toLowerCase();

  const filtered = allProducts.filter((product) => {
    const matchesCategory = category === "all" || product.category === category;
    const text = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    const matchesSearch = text.includes(searchText);
    return matchesCategory && matchesSearch;
  });

  displayProducts(filtered);
}

/* Re-filter whenever the category changes or the user types */
categoryFilter.addEventListener("change", applyFilters);
productSearch.addEventListener("input", applyFilters);

/* ---------- Selecting products ---------- */

/* Add or remove a product ID from the selection */
function toggleProduct(id) {
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter((x) => x !== id);
  } else {
    selectedIds.push(id);
  }
  saveSelectedIds();
  applyFilters(); // refresh card highlights
  renderSelectedList();
}

/* One click listener on the grid handles all cards ("event delegation") */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  /* Clicking "Details" shows/hides the description instead of selecting */
  const descBtn = e.target.closest(".desc-toggle");
  if (descBtn) {
    const desc = card.querySelector(".product-desc");
    const isOpen = !desc.hidden;
    desc.hidden = isOpen;
    descBtn.setAttribute("aria-expanded", String(!isOpen));
    card.classList.toggle("expanded", !isOpen);
    return;
  }

  toggleProduct(Number(card.dataset.id));
});

/* Keyboard support: Enter or Space selects a focused card */
productsContainer.addEventListener("keydown", (e) => {
  const card = e.target.closest(".product-card");
  if (!card || e.target !== card) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleProduct(Number(card.dataset.id));
  }
});

/* Show the selected products as removable "chips" */
function renderSelectedList() {
  const selected = allProducts.filter((p) => selectedIds.includes(p.id));
  selectedCount.textContent = selected.length;
  clearAllBtn.hidden = selected.length === 0;

  if (selected.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="empty-note">Click products above to add them to your routine.</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selected
    .map(
      (p) => `
      <div class="chip">
        <img src="${p.image}" alt="">
        <span>${p.brand} — ${p.name}</span>
        <button class="chip-remove" type="button" data-id="${p.id}"
                aria-label="Remove ${p.name}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `
    )
    .join("");
}

/* Remove a single product from the list */
selectedProductsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip-remove");
  if (btn) toggleProduct(Number(btn.dataset.id));
});

/* Clear every selection at once */
clearAllBtn.addEventListener("click", () => {
  selectedIds = [];
  saveSelectedIds();
  applyFilters();
  renderSelectedList();
});

/* ---------- localStorage helpers ---------- */

function saveSelectedIds() {
  try {
    localStorage.setItem("lorealSelectedProducts", JSON.stringify(selectedIds));
  } catch (err) {
    console.warn("Could not save selections", err);
  }
}

function loadSelectedIds() {
  try {
    return JSON.parse(localStorage.getItem("lorealSelectedProducts")) || [];
  } catch (err) {
    return [];
  }
}

/* ---------- Chat helpers ---------- */

/* Escape text so it can't inject HTML */
function escapeHTML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Very small Markdown → HTML converter for the AI's replies */
function formatReply(text) {
  let html = escapeHTML(text);

  // Links: [title](https://...)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  // Headings
  html = html.replace(/^#{1,6}\s*(.+)$/gm, "<h4>$1</h4>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // List items (numbered or bulleted)
  html = html.replace(/^\s*(?:\d+\.|[-*])\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`);
  // Line breaks
  html = html.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
  html = html.replace(/<br>\s*(<\/?(ul|li|h4))/g, "$1").replace(/(<\/(ul|h4)>)<br>/g, "$1");

  return html;
}

/* Add a message bubble to the chat window */
function addMessage(role, html) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.innerHTML = html;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

/* Build a "Sources" list from web-search citations, if any */
function formatCitations(message) {
  const annotations = message.annotations || [];
  const links = annotations
    .filter((a) => a.type === "url_citation")
    .map((a) => a.url_citation);

  // Remove duplicate URLs
  const unique = links.filter((l, i) => links.findIndex((x) => x.url === l.url) === i);
  if (unique.length === 0) return "";

  return `
    <div class="sources">
      <strong><i class="fa-solid fa-link"></i> Sources</strong>
      <ol>
        ${unique
          .map(
            (l) => `<li><a href="${escapeHTML(l.url)}" target="_blank" rel="noopener">${escapeHTML(l.title || l.url)}</a></li>`
          )
          .join("")}
      </ol>
    </div>`;
}

/* Send the whole conversation to the Cloudflare Worker and show the reply */
async function askAdvisor() {
  const loading = addMessage("assistant loading", `<span class="dots"><span></span><span></span><span></span></span>`);
  generateBtn.disabled = true;

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages,
        webSearch: webSearchToggle.checked,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.choices) {
      throw new Error(data.error?.message || data.error || "Unexpected response");
    }

    const message = data.choices[0].message;
    const reply = message.content;

    // Save the reply so follow-up questions have context
    messages.push({ role: "assistant", content: reply });

    loading.remove();
    addMessage("assistant", formatReply(reply) + formatCitations(message));
  } catch (err) {
    console.error(err);
    loading.remove();
    addMessage("assistant error", `Sorry, something went wrong: ${escapeHTML(err.message)}`);
  } finally {
    generateBtn.disabled = false;
  }
}

/* ---------- Generate routine ---------- */

generateBtn.addEventListener("click", async () => {
  const selected = allProducts.filter((p) => selectedIds.includes(p.id));

  if (selected.length === 0) {
    addMessage("assistant", "Please select at least one product first, then click <strong>Generate Routine</strong>. ✨");
    return;
  }

  // Only send the fields the AI needs
  const productData = selected.map((p) => ({
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
  }));

  addMessage("user", `Build me a routine with my ${selected.length} selected product${selected.length > 1 ? "s" : ""}.`);

  messages.push({
    role: "user",
    content: `Please create a personalized routine using ONLY these selected products:\n${JSON.stringify(productData, null, 2)}`,
  });

  await askAdvisor();
});

/* ---------- Follow-up chat ---------- */

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  addMessage("user", escapeHTML(text));
  messages.push({ role: "user", content: text });
  userInput.value = "";

  await askAdvisor();
});

/* ---------- RTL support (LevelUp) ---------- */

function setDirection(dir) {
  document.documentElement.setAttribute("dir", dir);
  rtlToggle.setAttribute("aria-pressed", String(dir === "rtl"));
  rtlToggle.querySelector("span").textContent = dir === "rtl" ? "LTR" : "RTL";
  try {
    localStorage.setItem("lorealDirection", dir);
  } catch (err) {}
}

rtlToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("dir");
  setDirection(current === "rtl" ? "ltr" : "rtl");
});

/* ---------- Start the app ---------- */

async function init() {
  // Restore saved direction
  try {
    setDirection(localStorage.getItem("lorealDirection") || "ltr");
  } catch (err) {}

  allProducts = await loadProducts();

  // Drop any saved IDs that no longer exist
  selectedIds = selectedIds.filter((id) => allProducts.some((p) => p.id === id));

  applyFilters();
  renderSelectedList();

  addMessage(
    "assistant",
    "Hi! 👋 I'm your L'Oréal Beauty Advisor. Select products above and click <strong>Generate Routine</strong>, or ask me anything about skincare, haircare, makeup, or fragrance."
  );
}

init();
