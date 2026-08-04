/* ==========================================================================
   BookBase - Library Management System
   Client-side app logic (auth, books CRUD, navigation, search, favourites)
   Auth, books, favourites, downloads, and tickets are stored in Supabase so
   every signed-in user sees the same shared library. Dark mode and reader
   font size stay in localStorage since those are just local UI preferences.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------ Supabase Client -------------------------- */
  const supabase = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
  );

  /* ------------------------------ Storage Keys --------------------------- */
  const LS_DARK_MODE = "bookbase_darkMode"; // "1" | "0"

  const CATEGORY_META = {
    "Sci-Fi": { icon: "fa-rocket", color: "#4f46e5" },
    Fantasy: { icon: "fa-hat-wizard", color: "#06b6d4" },
    Drama: { icon: "fa-masks-theater", color: "#ef4444" },
    Business: { icon: "fa-briefcase", color: "#f59e0b" },
    Education: { icon: "fa-graduation-cap", color: "#10b981" },
    Geography: { icon: "fa-earth-americas", color: "#4338ca" },
    Psychology: { icon: "fa-brain", color: "#8b5cf6" },
    Fiction: { icon: "fa-feather", color: "#ec4899" },
  };

  const FAQS = [
    {
      q: "How do I add a book to my library?",
      a: 'Go to Discover and click "Add Book" in the top right. Fill in the title, author, and category — the book will show up in My Library right away.',
    },
    {
      q: "How do downloads work?",
      a: "Click the download icon on any book card to save it for offline reading. It'll appear on the Downloads page — click the icon again to remove it.",
    },
    {
      q: "Can I listen to books instead of reading them?",
      a: "Books with an audio edition show up on the Audio Books page, where you can press play and follow along with the progress bar.",
    },
    {
      q: "How do I change my password?",
      a: "Open Settings, then use the Change Password card. You'll need your current password to set a new one.",
    },
    {
      q: "Is my data private?",
      a: "Everything you add — books, favourites, downloads — is stored locally in your browser and tied to your account only.",
    },
  ];

  /* ------------------------------ State ----------------------------------- */
  let books = [];
  let currentUser = null;
  let favourites = []; // array of book ids for current user
  let downloads = []; // array of book ids for current user
  let activeCategory = "all";
  let activePage = "discover";
  let searchTerm = "";
  let playingAudioId = null;
  let audioTimer = null;
  let audioElapsed = {}; // { [bookId]: seconds elapsed }
  let coverDataUrl = ""; // base64 image data from an uploaded cover file, if any

  /* --------------------------- Storage Helpers ---------------------------- */
  // Books are shared across every signed-in user via the Supabase "books" table.
  function mapBookFromDb(row) {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      category: row.category,
      rating: row.rating,
      pages: row.pages,
      year: row.year,
      cover: row.cover,
      description: row.description,
      content: row.content,
      hasAudio: row.has_audio,
      audioDuration: row.audio_duration,
      addedBy: row.added_by,
      addedByUser: !!(currentUser && row.added_by === currentUser.id),
    };
  }

  async function loadBooks() {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast("Could not load books — check your Supabase setup");
      books = [];
      return;
    }
    books = data.map(mapBookFromDb);
  }

  async function loadFavouritesForUser() {
    if (!currentUser) {
      favourites = [];
      return;
    }
    const { data, error } = await supabase
      .from("favourites")
      .select("book_id")
      .eq("user_id", currentUser.id);
    favourites = error ? [] : data.map((row) => row.book_id);
  }

  async function loadDownloadsForUser() {
    if (!currentUser) {
      downloads = [];
      return;
    }
    const { data, error } = await supabase
      .from("downloads")
      .select("book_id")
      .eq("user_id", currentUser.id);
    downloads = error ? [] : data.map((row) => row.book_id);
  }

  /* ------------------------------ Utilities -------------------------------- */
  function uid() {
    return (
      "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    );
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function starsHtml(rating) {
    const full = Math.round(rating);
    let html = "";
    for (let i = 0; i < 5; i++) {
      html +=
        i < full
          ? '<i class="fas fa-star"></i>'
          : '<i class="far fa-star"></i>';
    }
    return html;
  }

  function toast(message) {
    // Lightweight non-blocking notice using a temporary element.
    let el = document.getElementById("bb-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "bb-toast";
      el.style.position = "fixed";
      el.style.bottom = "24px";
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      el.style.background = "#1f2937";
      el.style.color = "#fff";
      el.style.padding = "12px 20px";
      el.style.borderRadius = "8px";
      el.style.fontSize = "14px";
      el.style.zIndex = "2000";
      el.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.2)";
      el.style.transition = "opacity 0.3s";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = "1";
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => {
      el.style.opacity = "0";
    }, 2200);
  }

  /* ------------------------------ Auth ------------------------------------- */
  function userFromSupabase(user) {
    return {
      id: user.id,
      email: user.email,
      name: (user.user_metadata && user.user_metadata.name) || "",
      role: "user",
    };
  }

  function isAdmin() {
    return !!(currentUser && currentUser.role === "admin");
  }

  async function loadUserRole() {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single();
    currentUser.role = error || !data ? "user" : data.role;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = document
      .getElementById("loginEmail")
      .value.trim()
      .toLowerCase();
    const password = document.getElementById("loginPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast(error.message || "Invalid email or password");
      return;
    }

    await loginAs(data.user);
  }

  async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById("signupName").value.trim();
    const email = document
      .getElementById("signupEmail")
      .value.trim()
      .toLowerCase();
    const password = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("signupConfirmPassword").value;

    if (password !== confirm) {
      toast("Passwords do not match");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      toast(error.message);
      return;
    }

    closeAllModals();
    document.getElementById("signupForm").reset();

    if (!data.session) {
      // Project has "confirm email" turned on — no active session yet.
      toast("Account created — check your email to confirm before signing in");
      return;
    }

    await loginAs(data.user);
    toast("Account created — welcome!");
  }

  function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById("resetEmail").value.trim();
    supabase.auth.resetPasswordForEmail(email).finally(() => {
      closeAllModals();
      document.getElementById("forgotPasswordForm").reset();
      toast(
        `If an account exists for ${email}, reset instructions have been sent`,
      );
    });
  }

  async function loginAs(user) {
    currentUser = userFromSupabase(user);
    await Promise.all([
      loadFavouritesForUser(),
      loadDownloadsForUser(),
      loadUserRole(),
    ]);
    await loadBooks();
    showDashboard();
  }

  async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    favourites = [];
    downloads = [];
    stopAudio();
    document.getElementById("dashboardScreen").classList.remove("active");
    document.getElementById("loginScreen").classList.add("active");
    document.getElementById("loginForm").reset();
  }

  async function tryRestoreSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    currentUser = userFromSupabase(data.session.user);
    await Promise.all([
      loadFavouritesForUser(),
      loadDownloadsForUser(),
      loadUserRole(),
    ]);
    await loadBooks();
    return true;
  }

  function showDashboard() {
    document.getElementById("loginScreen").classList.remove("active");
    document.getElementById("dashboardScreen").classList.add("active");
    document.getElementById("userName").textContent =
      currentUser.name || currentUser.email;
    const addBtn = document.getElementById("addBookBtn");
    if (addBtn) addBtn.style.display = isAdmin() ? "" : "none";
    setActivePage("discover");
    renderAll();
  }

  /* --------------------------- Navigation ---------------------------------- */
  function setActivePage(page) {
    activePage = page;
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });
    document.querySelectorAll(".content-page").forEach((section) => {
      section.classList.remove("active");
    });
    const target = document.getElementById(page + "Page");
    if (target) target.classList.add("active");

    // collapse mobile sidebar after navigation
    document.querySelector(".sidebar").classList.remove("active");
    document.getElementById("sidebarOverlay").classList.remove("active");

    if (page === "settings") populateSettingsForm();
    if (page === "support") renderSupportPage();
    if (page === "audiobooks") renderAudiobooks();
    if (page === "download") renderDownloads();
    if (page === "category") renderCategoryTiles();
  }

  /* --------------------------- Rendering ------------------------------------ */
  function matchesSearch(book) {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      book.title.toLowerCase().includes(term) ||
      book.author.toLowerCase().includes(term)
    );
  }

  function renderAll() {
    renderRecommended();
    renderCategoryBooks();
    renderLibrary();
    renderFavourites();
    renderCategoryTiles();
    renderDownloads();
    renderAudiobooks();
  }

  function renderRecommended() {
    const container = document.getElementById("recommendedBooks");
    const top = books
      .filter(matchesSearch)
      .slice()
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8);
    container.innerHTML =
      top.map(bookCardHtml).join("") || emptyStateHtml("No books found");
  }

  function renderCategoryBooks() {
    const container = document.getElementById("categoryBooks");
    const filtered = books.filter(
      (b) =>
        (activeCategory === "all" || b.category === activeCategory) &&
        matchesSearch(b),
    );
    container.innerHTML =
      filtered.map(bookCardHtml).join("") ||
      emptyStateHtml("No books in this category");
  }

  function renderLibrary() {
    const container = document.getElementById("libraryBooks");
    const mine = books.filter((b) => b.addedByUser && matchesSearch(b));
    container.innerHTML =
      mine.map(bookCardHtml).join("") ||
      emptyStateHtml(
        isAdmin()
          ? 'Your library is empty — click "Add Book" on Discover to add one'
          : "Only admins can add books to the library",
      );
  }

  function renderFavourites() {
    const container = document.getElementById("favouriteBooks");
    const favBooks = books.filter(
      (b) => favourites.includes(b.id) && matchesSearch(b),
    );
    container.innerHTML =
      favBooks.map(bookCardHtml).join("") ||
      emptyStateHtml("No favourites yet");
  }

  function emptyStateHtml(message) {
    return `<p style="color:var(--text-secondary);padding:20px 0;">${escapeHtml(message)}</p>`;
  }

  function bookCardHtml(book) {
    const isFav = favourites.includes(book.id);
    const isDownloaded = downloads.includes(book.id);
    return `
      <div class="book-card" data-id="${book.id}">
        <div class="book-actions">
          ${
            isAdmin()
              ? `<button class="action-btn edit" data-action="edit" data-id="${book.id}" title="Edit"><i class="fas fa-pen"></i></button>
                 <button class="action-btn delete" data-action="delete" data-id="${book.id}" title="Delete"><i class="fas fa-trash"></i></button>`
              : ""
          }
          <button class="action-btn download ${isDownloaded ? "active" : ""}" data-action="download" data-id="${book.id}" title="${isDownloaded ? "Remove download" : "Download for offline"}">
            <i class="fas ${isDownloaded ? "fa-circle-check" : "fa-download"}"></i>
          </button>
          <button class="action-btn favourite ${isFav ? "active" : ""}" data-action="favourite" data-id="${book.id}" title="Favourite">
            <i class="fas fa-heart"></i>
          </button>
        </div>
        <img class="book-cover" src="${escapeHtml(book.cover) || "https://placehold.co/300x450/e5e7eb/6b7280?text=No+Cover"}" alt="${escapeHtml(book.title)}" loading="lazy" />
        <div class="book-info">
          <div class="book-title">${escapeHtml(book.title)}</div>
          <div class="book-author">${escapeHtml(book.author)}</div>
          <div class="book-rating">
            <span class="stars">${starsHtml(book.rating)}</span>
            <span>${Number(book.rating).toFixed(1)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* --------------------------- Book Detail Panel ---------------------------- */
  function openBookDetail(id) {
    const book = books.find((b) => b.id === id);
    if (!book) return;
    const isFav = favourites.includes(book.id);
    const content = document.getElementById("bookDetailContent");
    content.innerHTML = `
      <img class="detail-cover" src="${escapeHtml(book.cover) || "https://placehold.co/300x450/e5e7eb/6b7280?text=No+Cover"}" alt="${escapeHtml(book.title)}" />
      <div class="detail-title">${escapeHtml(book.title)}</div>
      <div class="detail-author">by ${escapeHtml(book.author)}</div>
      <div class="detail-stats">
        <div class="stat-item">
          <span class="stat-value">${Number(book.rating).toFixed(1)}</span>
          <span class="stat-label">Rating</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${book.pages || "—"}</span>
          <span class="stat-label">Pages</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${book.year || "—"}</span>
          <span class="stat-label">Year</span>
        </div>
      </div>
      <p class="detail-description">${escapeHtml(book.description) || "No description available."}</p>
      <div class="detail-actions">
        <button class="btn-read" data-action="read" data-id="${book.id}">
          <i class="fas fa-book-reader"></i> Start Reading
        </button>
        <button class="action-btn favourite ${isFav ? "active" : ""}" data-action="favourite" data-id="${book.id}" title="Favourite" style="width:52px;height:52px;">
          <i class="fas fa-heart"></i>
        </button>
      </div>
    `;
    document.getElementById("bookDetailPanel").classList.add("active");
  }

  function closeBookDetail() {
    document.getElementById("bookDetailPanel").classList.remove("active");
  }

  /* --------------------------- Reader ---------------------------------------- */
  let readerFontSize =
    parseInt(localStorage.getItem("bookbase_readerFontSize"), 10) || 18;

  function applyReaderFontSize() {
    document.getElementById("readerContent").style.fontSize =
      readerFontSize + "px";
  }

  function openReader(id) {
    const book = books.find((b) => b.id === id);
    if (!book) return;

    document.getElementById("readerTitle").textContent = book.title;
    document.getElementById("readerAuthor").textContent = "by " + book.author;

    const readerContent = document.getElementById("readerContent");
    if (book.content && book.content.trim()) {
      // Split on blank lines into paragraphs and escape each one.
      const paragraphs = book.content
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      readerContent.innerHTML = paragraphs
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
    } else {
      readerContent.innerHTML = `
        <div class="reader-empty">
          <i class="fas fa-book-open"></i>
          <p>This book doesn't have its full text added yet.</p>
          <p>Open <strong>Edit</strong> on this book and paste the text into the
          "Full Book Text" field to read it here.</p>
        </div>
      `;
    }

    applyReaderFontSize();
    document.getElementById("readerBody").scrollTop = 0;
    document.getElementById("readerOverlay").classList.add("active");
  }

  function closeReader() {
    document.getElementById("readerOverlay").classList.remove("active");
  }

  function changeReaderFontSize(delta) {
    readerFontSize = Math.min(28, Math.max(14, readerFontSize + delta));
    localStorage.setItem("bookbase_readerFontSize", readerFontSize);
    applyReaderFontSize();
  }

  /* --------------------------- Book CRUD ------------------------------------ */
  function openBookModal(book) {
    const form = document.getElementById("bookForm");
    form.reset();
    document.getElementById("bookId").value = "";
    document.getElementById("bookModalTitle").textContent = "Add New Book";
    coverDataUrl = "";
    setCoverPreview("");

    if (book) {
      document.getElementById("bookModalTitle").textContent = "Edit Book";
      document.getElementById("bookId").value = book.id;
      document.getElementById("bookTitle").value = book.title;
      document.getElementById("bookAuthor").value = book.author;
      document.getElementById("bookCategory").value = book.category;
      document.getElementById("bookRating").value = book.rating;
      document.getElementById("bookPages").value = book.pages || "";
      document.getElementById("bookYear").value = book.year || "";
      document.getElementById("bookDescription").value = book.description || "";
      document.getElementById("bookContent").value = book.content || "";

      if (book.cover && book.cover.startsWith("data:")) {
        // Previously uploaded image — keep it out of the URL field.
        coverDataUrl = book.cover;
        document.getElementById("bookCover").value = "";
      } else {
        document.getElementById("bookCover").value = book.cover || "";
      }
      setCoverPreview(book.cover || "");
    }

    document.getElementById("bookModal").classList.add("active");
  }

  /* --------------------------- Cover Upload ---------------------------------- */
  function setCoverPreview(src) {
    const img = document.getElementById("coverPreviewImg");
    if (src) {
      img.src = src;
      img.classList.add("has-image");
    } else {
      img.src = "";
      img.classList.remove("has-image");
    }
    document.getElementById("removeCoverBtn").hidden = !src;
  }

  function handleCoverFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      coverDataUrl = reader.result;
      document.getElementById("bookCover").value = "";
      setCoverPreview(coverDataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleCoverUrlInput(e) {
    const url = e.target.value.trim();
    if (url) {
      coverDataUrl = "";
      document.getElementById("bookCoverFile").value = "";
      setCoverPreview(url);
    } else if (!coverDataUrl) {
      setCoverPreview("");
    }
  }

  function handleRemoveCover() {
    coverDataUrl = "";
    document.getElementById("bookCoverFile").value = "";
    document.getElementById("bookCover").value = "";
    setCoverPreview("");
  }

  async function handleBookFormSubmit(e) {
    e.preventDefault();
    if (!isAdmin()) {
      toast("Only admins can add or edit books");
      return;
    }
    const id = document.getElementById("bookId").value;
    const bookData = {
      title: document.getElementById("bookTitle").value.trim(),
      author: document.getElementById("bookAuthor").value.trim(),
      category: document.getElementById("bookCategory").value,
      rating: parseFloat(document.getElementById("bookRating").value) || 0,
      pages: parseInt(document.getElementById("bookPages").value, 10) || null,
      year: parseInt(document.getElementById("bookYear").value, 10) || null,
      cover: coverDataUrl || document.getElementById("bookCover").value.trim(),
      description: document.getElementById("bookDescription").value.trim(),
      content: document.getElementById("bookContent").value.trim(),
    };

    if (id) {
      const { error } = await supabase
        .from("books")
        .update(bookData)
        .eq("id", id);
      if (error) {
        toast("Could not update book: " + error.message);
        return;
      }
      toast("Book updated");
    } else {
      const { error } = await supabase.from("books").insert([
        Object.assign(
          { has_audio: false, added_by: currentUser.id },
          bookData,
        ),
      ]);
      if (error) {
        toast("Could not add book: " + error.message);
        return;
      }
      toast("Book added to your library");
    }

    await loadBooks();
    closeAllModals();
    renderAll();
  }

  async function deleteBook(id) {
    if (!isAdmin()) {
      toast("Only admins can delete books");
      return;
    }
    const book = books.find((b) => b.id === id);
    if (!book) return;
    if (!confirm(`Delete "${book.title}" from your library?`)) return;

    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) {
      toast("Could not delete book: " + error.message);
      return;
    }

    favourites = favourites.filter((fid) => fid !== id);
    downloads = downloads.filter((did) => did !== id);
    await loadBooks();
    renderAll();
    toast("Book deleted");
  }

  async function toggleFavourite(id) {
    const wasFav = favourites.includes(id);
    favourites = wasFav
      ? favourites.filter((fid) => fid !== id)
      : [...favourites, id];
    renderAll();
    // refresh detail panel state if open
    if (
      document.getElementById("bookDetailPanel").classList.contains("active")
    ) {
      const openId = document.querySelector(
        "#bookDetailContent [data-action='read']",
      )?.dataset.id;
      if (openId === id) openBookDetail(id);
    }

    if (!currentUser) return;
    if (wasFav) {
      await supabase
        .from("favourites")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("book_id", id);
    } else {
      await supabase
        .from("favourites")
        .insert({ user_id: currentUser.id, book_id: id });
    }
  }

  async function toggleDownload(id) {
    const book = books.find((b) => b.id === id);
    if (!book) return;
    const wasDownloaded = downloads.includes(id);

    if (wasDownloaded) {
      downloads = downloads.filter((did) => did !== id);
      toast(`Removed "${book.title}" from downloads`);
    } else {
      downloads = [...downloads, id];
      toast(`"${book.title}" is ready to read offline`);
    }
    renderAll();

    if (!currentUser) return;
    if (wasDownloaded) {
      await supabase
        .from("downloads")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("book_id", id);
    } else {
      await supabase
        .from("downloads")
        .insert({ user_id: currentUser.id, book_id: id });
    }
  }

  /* --------------------------- Category Tiles -------------------------------- */
  function renderCategoryTiles() {
    const container = document.getElementById("categoryTiles");
    if (!container) return;
    const counts = {};
    books.forEach((b) => {
      counts[b.category] = (counts[b.category] || 0) + 1;
    });
    const categories = Object.keys(counts).sort();
    container.innerHTML =
      categories
        .map((cat) => {
          const meta = CATEGORY_META[cat] || {
            icon: "fa-book",
            color: "#6b7280",
          };
          return `
            <div class="category-tile" data-category="${escapeHtml(cat)}">
              <div class="tile-icon" style="background:${meta.color};">
                <i class="fas ${meta.icon}"></i>
              </div>
              <div class="tile-name">${escapeHtml(cat)}</div>
              <div class="tile-count">${counts[cat]} book${counts[cat] === 1 ? "" : "s"}</div>
            </div>
          `;
        })
        .join("") || emptyStateHtml("No categories yet");
  }

  function goToCategoryFilter(category) {
    setActivePage("discover");
    document.querySelectorAll(".category-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.category === category);
    });
    activeCategory = category;
    renderCategoryBooks();
    document
      .getElementById("categoryBooks")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* --------------------------- Downloads -------------------------------------- */
  function renderDownloads() {
    const container = document.getElementById("downloadBooks");
    const info = document.getElementById("downloadStorageInfo");
    if (!container) return;
    const items = books.filter(
      (b) => downloads.includes(b.id) && matchesSearch(b),
    );
    container.innerHTML =
      items.map(bookCardHtml).join("") ||
      emptyStateHtml(
        "Nothing downloaded yet — tap the download icon on any book to save it for offline reading",
      );
    if (info) {
      const totalMb = items.reduce(
        (sum, b) => sum + (b.pages || 200) * 0.002,
        0,
      );
      info.textContent = `${items.length} book${items.length === 1 ? "" : "s"} · ${totalMb.toFixed(1)} MB used`;
    }
  }

  /* --------------------------- Audio Books ------------------------------------ */
  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function renderAudiobooks() {
    const container = document.getElementById("audiobooksList");
    if (!container) return;
    const items = books.filter((b) => b.hasAudio && matchesSearch(b));
    container.innerHTML =
      items
        .map((book) => {
          const elapsed = audioElapsed[book.id] || 0;
          const duration = book.audioDuration || 3600;
          const pct = Math.min(100, (elapsed / duration) * 100);
          const isPlaying = playingAudioId === book.id;
          return `
            <div class="audio-item" data-id="${book.id}">
              <button class="audio-play-btn" data-action="toggle-audio" data-id="${book.id}" title="${isPlaying ? "Pause" : "Play"}">
                <i class="fas ${isPlaying ? "fa-pause" : "fa-play"}"></i>
              </button>
              <img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" />
              <div class="audio-info">
                <div class="audio-title">${escapeHtml(book.title)}</div>
                <div class="audio-author">${escapeHtml(book.author)}</div>
                <div class="audio-progress-track">
                  <div class="audio-progress-fill" style="width:${pct}%;"></div>
                </div>
                <div class="audio-time">${formatTime(elapsed)} / ${formatTime(duration)}</div>
              </div>
            </div>
          `;
        })
        .join("") || emptyStateHtml("No audio editions in your library yet");
  }

  function toggleAudioPlayback(id) {
    const book = books.find((b) => b.id === id);
    if (!book) return;

    if (playingAudioId === id) {
      stopAudio();
      renderAudiobooks();
      return;
    }

    stopAudio();
    playingAudioId = id;
    if (audioElapsed[id] == null) audioElapsed[id] = 0;

    audioTimer = setInterval(() => {
      const duration = book.audioDuration || 3600;
      audioElapsed[id] = Math.min(duration, (audioElapsed[id] || 0) + 5);
      if (audioElapsed[id] >= duration) {
        stopAudio();
        toast(`Finished "${book.title}"`);
      }
      renderAudiobooks();
    }, 200); // 5 simulated seconds every 200ms for a fast, visible demo

    renderAudiobooks();
  }

  function stopAudio() {
    if (audioTimer) clearInterval(audioTimer);
    audioTimer = null;
    playingAudioId = null;
  }

  /* --------------------------- Settings ---------------------------------------- */
  function populateSettingsForm() {
    if (!currentUser) return;
    document.getElementById("settingsName").value = currentUser.name || "";
    document.getElementById("settingsEmail").value = currentUser.email || "";
    document.getElementById("darkModeToggle").checked =
      document.body.classList.contains("dark-mode");
  }

  async function handleProfileFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("settingsName").value.trim();
    const email = document
      .getElementById("settingsEmail")
      .value.trim()
      .toLowerCase();

    const updates = { data: { name } };
    const emailChanged = email !== currentUser.email;
    if (emailChanged) updates.email = email;

    const { error } = await supabase.auth.updateUser(updates);
    if (error) {
      toast(error.message);
      return;
    }

    currentUser = { ...currentUser, name };
    document.getElementById("userName").textContent = name || currentUser.email;

    if (emailChanged) {
      toast("Profile saved — check your new email inbox to confirm the change");
    } else {
      toast("Profile saved");
    }
  }

  async function handlePasswordFormSubmit(e) {
    e.preventDefault();
    const current = document.getElementById("currentPassword").value;
    const next = document.getElementById("newPassword").value;

    // Re-verify the current password before allowing the change.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: current,
    });
    if (verifyError) {
      toast("Current password is incorrect");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      toast(error.message);
      return;
    }

    document.getElementById("passwordForm").reset();
    toast("Password updated");
  }

  function setDarkMode(enabled) {
    document.body.classList.toggle("dark-mode", enabled);
    localStorage.setItem(LS_DARK_MODE, enabled ? "1" : "0");
  }

  async function clearMyData() {
    if (!currentUser) return;
    if (
      !confirm(
        "This removes all books you added, your favourites, and downloads. Continue?",
      )
    )
      return;

    await supabase.from("books").delete().eq("added_by", currentUser.id);
    await supabase.from("favourites").delete().eq("user_id", currentUser.id);
    await supabase.from("downloads").delete().eq("user_id", currentUser.id);

    favourites = [];
    downloads = [];
    await loadBooks();
    renderAll();
    toast("Your data has been cleared");
  }

  /* --------------------------- Support ----------------------------------------- */
  async function renderSupportPage() {
    renderFaq();
    await renderTickets();
  }

  function renderFaq() {
    const container = document.getElementById("faqList");
    if (!container) return;
    container.innerHTML = FAQS.map(
      (item, i) => `
        <div class="faq-item" data-index="${i}">
          <div class="faq-question" data-action="toggle-faq" data-index="${i}">
            <span>${escapeHtml(item.q)}</span>
            <i class="fas fa-chevron-down"></i>
          </div>
          <div class="faq-answer"><div class="faq-answer-inner">${escapeHtml(item.a)}</div></div>
        </div>
      `,
    ).join("");
  }

  async function renderTickets() {
    const container = document.getElementById("supportTickets");
    if (!container || !currentUser) return;

    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    const tickets = error ? [] : data;
    if (!tickets.length) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML =
      `<h4 style="margin-bottom:10px;font-size:13px;color:var(--text-secondary);">Your requests</h4>` +
      tickets
        .map(
          (t) => `
            <div class="ticket-item">
              <div class="ticket-top">
                <span class="ticket-subject">${escapeHtml(t.subject)}</span>
                <span class="ticket-status">${escapeHtml(t.status)}</span>
              </div>
              <div class="ticket-message">${escapeHtml(t.message)}</div>
            </div>
          `,
        )
        .join("");
  }

  async function handleSupportFormSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;
    const subject = document.getElementById("supportSubject").value.trim();
    const message = document.getElementById("supportMessage").value.trim();

    const { error } = await supabase.from("tickets").insert({
      user_id: currentUser.id,
      subject,
      message,
      status: "Open",
    });
    if (error) {
      toast("Could not send message: " + error.message);
      return;
    }

    document.getElementById("supportForm").reset();
    await renderTickets();
    toast("Your message has been sent — we'll get back to you soon");
  }

  /* --------------------------- Modal Helpers --------------------------------- */
  function closeAllModals() {
    document
      .querySelectorAll(".modal.active")
      .forEach((m) => m.classList.remove("active"));
  }

  /* --------------------------- Event Wiring ----------------------------------- */
  function wireEvents() {
    // Auth forms
    document
      .getElementById("loginForm")
      .addEventListener("submit", handleLogin);
    document
      .getElementById("signupForm")
      .addEventListener("submit", handleSignup);
    document
      .getElementById("forgotPasswordForm")
      .addEventListener("submit", handleForgotPassword);

    document.getElementById("showSignupLink").addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("signupModal").classList.add("active");
    });

    document
      .getElementById("forgotPasswordLink")
      .addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("forgotPasswordModal").classList.add("active");
      });

    // Password visibility toggle
    document.querySelectorAll(".toggle-password").forEach((icon) => {
      icon.addEventListener("click", () => {
        const input = icon.previousElementSibling;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        icon.classList.toggle("fa-eye-slash", !show);
        icon.classList.toggle("fa-eye", show);
      });
    });

    // Close modals
    document.querySelectorAll(".close-modal").forEach((btn) => {
      btn.addEventListener("click", closeAllModals);
    });
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeAllModals();
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAllModals();
        closeBookDetail();
      }
    });

    // Sidebar navigation
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        setActivePage(item.dataset.page);
      });
    });

    document.getElementById("logoutBtn").addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });

    document
      .querySelector(".mobile-menu-toggle")
      .addEventListener("click", () => {
        document.querySelector(".sidebar").classList.toggle("active");
        document.getElementById("sidebarOverlay").classList.toggle("active");
      });

    document.getElementById("sidebarOverlay").addEventListener("click", () => {
      document.querySelector(".sidebar").classList.remove("active");
      document.getElementById("sidebarOverlay").classList.remove("active");
    });

    // Search
    document.getElementById("searchInput").addEventListener("input", (e) => {
      searchTerm = e.target.value.trim();
      renderAll();
    });

    // Category filters
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".category-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeCategory = btn.dataset.category;
        renderCategoryBooks();
      });
    });

    // Add Book
    document
      .getElementById("addBookBtn")
      .addEventListener("click", () => openBookModal(null));
    document
      .getElementById("bookForm")
      .addEventListener("submit", handleBookFormSubmit);
    document
      .getElementById("bookCoverFile")
      .addEventListener("change", handleCoverFileChange);
    document
      .getElementById("bookCover")
      .addEventListener("input", handleCoverUrlInput);
    document
      .getElementById("removeCoverBtn")
      .addEventListener("click", handleRemoveCover);

    // Book detail panel close
    document
      .querySelector(".close-detail")
      .addEventListener("click", closeBookDetail);

    // Reader overlay
    document
      .getElementById("closeReaderBtn")
      .addEventListener("click", closeReader);
    document
      .getElementById("fontIncreaseBtn")
      .addEventListener("click", () => changeReaderFontSize(2));
    document
      .getElementById("fontDecreaseBtn")
      .addEventListener("click", () => changeReaderFontSize(-2));

    // Delegated clicks for book cards (open detail, edit, delete, favourite, download)
    document.getElementById("pageContent").addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (actionBtn) {
        e.stopPropagation();
        const id = actionBtn.dataset.id;
        const action = actionBtn.dataset.action;
        if (action === "favourite") toggleFavourite(id);
        if (action === "download") toggleDownload(id);
        if (action === "edit") openBookModal(books.find((b) => b.id === id));
        if (action === "delete") deleteBook(id);
        if (action === "toggle-audio") toggleAudioPlayback(id);
        if (action === "toggle-faq") {
          const item = actionBtn.closest(".faq-item");
          if (item) item.classList.toggle("open");
        }
        return;
      }
      const tile = e.target.closest(".category-tile");
      if (tile) {
        goToCategoryFilter(tile.dataset.category);
        return;
      }
      const card = e.target.closest(".book-card");
      if (card) openBookDetail(card.dataset.id);
    });

    // Settings
    document
      .getElementById("profileForm")
      .addEventListener("submit", handleProfileFormSubmit);
    document
      .getElementById("passwordForm")
      .addEventListener("submit", handlePasswordFormSubmit);
    document
      .getElementById("darkModeToggle")
      .addEventListener("change", (e) => {
        setDarkMode(e.target.checked);
      });
    document
      .getElementById("clearDataBtn")
      .addEventListener("click", clearMyData);

    // Support
    document
      .getElementById("supportForm")
      .addEventListener("submit", handleSupportFormSubmit);

    // Detail panel actions (favourite / read) delegated
    document
      .getElementById("bookDetailContent")
      .addEventListener("click", (e) => {
        const actionBtn = e.target.closest("[data-action]");
        if (!actionBtn) return;
        const id = actionBtn.dataset.id;
        const action = actionBtn.dataset.action;
        if (action === "favourite") toggleFavourite(id);
        if (action === "read") openReader(id);
      });

    // View toggle (grid/list) on My Library — purely visual toggle
    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".view-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const grid = document.getElementById("libraryBooks");
        grid.style.gridTemplateColumns =
          btn.dataset.view === "list" ? "1fr" : "";
      });
    });
  }

  /* --------------------------- Init ------------------------------------------- */
  async function init() {
    wireEvents();

    const darkPref = localStorage.getItem(LS_DARK_MODE);
    if (darkPref === "1") document.body.classList.add("dark-mode");

    if (
      !window.SUPABASE_URL ||
      !window.SUPABASE_ANON_KEY ||
      window.SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL"
    ) {
      document.getElementById("loginScreen").insertAdjacentHTML(
        "afterbegin",
        `<div style="background:#fee2e2;color:#991b1b;padding:12px 20px;text-align:center;font-size:14px;">
          Supabase isn't configured yet — open <code>config.js</code> and add your project URL and anon key.
        </div>`,
      );
      return;
    }

    const restored = await tryRestoreSession();
    if (restored) {
      showDashboard();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
