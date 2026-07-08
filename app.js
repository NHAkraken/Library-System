// Library Management System

class LibrarySystem {
  constructor() {
    this.books = JSON.parse(localStorage.getItem("books")) || [];
    this.borrowedBooks =
      JSON.parse(localStorage.getItem("borrowedBooks")) || [];
    this.currentUser = null;
    this.editingBookId = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkLogin();

    // Set default dates
    const today = new Date().toISOString().split("T")[0];
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + 14);
    document.getElementById("borrowDate").value = today;
    document.getElementById("returnDate").value = returnDate
      .toISOString()
      .split("T")[0];

    // Add sample books if empty
    if (this.books.length === 0) {
      this.addSampleBooks();
    }
  }

  setupEventListeners() {
    // Login
    document.getElementById("loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // Logout
    document.getElementById("logoutBtn").addEventListener("click", () => {
      this.handleLogout();
    });

    // Navigation
    document.querySelectorAll(".menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        this.switchSection(item.dataset.section);
      });
    });

    // Add Book
    document.getElementById("addBookBtn").addEventListener("click", () => {
      this.openBookModal();
    });

    // Book Form
    document.getElementById("bookForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveBook();
    });

    // Borrow Form
    document.getElementById("borrowForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveBorrow();
    });

    // Close Modals
    document.querySelectorAll(".close-modal").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closeModals();
      });
    });

    // Search
    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.searchBooks(e.target.value);
    });

    // Click outside modal to close
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal")) {
        this.closeModals();
      }
    });
  }

  handleLogin() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    // Simple authentication (in real app, use proper backend)
    if (username === "admin" && password === "admin123") {
      this.currentUser = username;
      document.getElementById("welcomeUser").textContent =
        `Welcome, ${username}`;
      this.showScreen("dashboardScreen");
      this.renderBooks();
      this.updateStats();
    } else {
      alert("Invalid credentials! Use admin/admin123");
    }
  }

  handleLogout() {
    this.currentUser = null;
    this.showScreen("loginScreen");
    document.getElementById("loginForm").reset();
  }

  checkLogin() {
    // Auto-show dashboard if logged in
    // In production, check session/token
  }

  showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });
    document.getElementById(screenId).classList.add("active");
  }

  switchSection(section) {
    // Update menu
    document.querySelectorAll(".menu-item").forEach((item) => {
      item.classList.remove("active");
    });
    event.target.closest(".menu-item").classList.add("active");

    // Update content
    document.querySelectorAll(".content-section").forEach((sec) => {
      sec.classList.remove("active");
    });

    if (section === "books") {
      document.getElementById("booksSection").classList.add("active");
      this.renderBooks();
    } else if (section === "borrowed") {
      document.getElementById("borrowedSection").classList.add("active");
      this.renderBorrowedBooks();
    } else if (section === "stats") {
      document.getElementById("statsSection").classList.add("active");
      this.renderStatistics();
    }
  }

  openBookModal(bookId = null) {
    const modal = document.getElementById("bookModal");
    const form = document.getElementById("bookForm");

    form.reset();
    this.editingBookId = bookId;

    if (bookId) {
      const book = this.books.find((b) => b.id === bookId);
      if (book) {
        document.getElementById("modalTitle").innerHTML =
          '<i class="fas fa-edit"></i> Edit Book';
        document.getElementById("bookTitle").value = book.title;
        document.getElementById("bookAuthor").value = book.author;
        document.getElementById("bookISBN").value = book.isbn;
        document.getElementById("bookCategory").value = book.category;
        document.getElementById("bookYear").value = book.year;
        document.getElementById("bookQuantity").value = book.quantity;
        document.getElementById("bookImage").value = book.image;
        document.getElementById("bookDescription").value =
          book.description || "";
        document.getElementById("bookId").value = book.id;
      }
    } else {
      document.getElementById("modalTitle").innerHTML =
        '<i class="fas fa-plus"></i> Add New Book';
    }

    modal.classList.add("active");
  }

  openBorrowModal(bookId) {
    const book = this.books.find((b) => b.id === bookId);
    if (!book || book.available <= 0) {
      alert("This book is not available for borrowing!");
      return;
    }

    document.getElementById("borrowBookId").value = bookId;
    document.getElementById("borrowModal").classList.add("active");
  }

  closeModals() {
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.classList.remove("active");
    });
    this.editingBookId = null;
  }

  saveBook() {
    const book = {
      id: this.editingBookId || Date.now().toString(),
      title: document.getElementById("bookTitle").value,
      author: document.getElementById("bookAuthor").value,
      isbn: document.getElementById("bookISBN").value,
      category: document.getElementById("bookCategory").value,
      year: document.getElementById("bookYear").value,
      quantity: parseInt(document.getElementById("bookQuantity").value),
      available: parseInt(document.getElementById("bookQuantity").value),
      image:
        document.getElementById("bookImage").value ||
        "https://via.placeholder.com/280x400/667eea/ffffff?text=No+Cover",
      description: document.getElementById("bookDescription").value,
      addedDate: new Date().toISOString(),
    };

    if (this.editingBookId) {
      const index = this.books.findIndex((b) => b.id === this.editingBookId);
      if (index !== -1) {
        // Keep the available count when editing
        const oldBook = this.books[index];
        book.available = oldBook.available + (book.quantity - oldBook.quantity);
        this.books[index] = book;
      }
    } else {
      this.books.push(book);
    }

    this.saveToStorage();
    this.closeModals();
    this.renderBooks();
    this.updateStats();
  }

  saveBorrow() {
    const bookId = document.getElementById("borrowBookId").value;
    const book = this.books.find((b) => b.id === bookId);

    if (!book || book.available <= 0) {
      alert("Book not available!");
      return;
    }

    const borrow = {
      id: Date.now().toString(),
      bookId: bookId,
      bookTitle: book.title,
      bookImage: book.image,
      studentName: document.getElementById("studentName").value,
      studentId: document.getElementById("studentId").value,
      borrowDate: document.getElementById("borrowDate").value,
      returnDate: document.getElementById("returnDate").value,
      status: "borrowed",
    };

    this.borrowedBooks.push(borrow);
    book.available--;

    this.saveToStorage();
    this.closeModals();
    this.renderBooks();
    this.updateStats();

    document.getElementById("borrowForm").reset();
    alert("Book borrowed successfully!");
  }

  returnBook(borrowId) {
    const borrow = this.borrowedBooks.find((b) => b.id === borrowId);
    if (!borrow) return;

    const book = this.books.find((b) => b.id === borrow.bookId);
    if (book) {
      book.available++;
    }

    this.borrowedBooks = this.borrowedBooks.filter((b) => b.id !== borrowId);
    this.saveToStorage();
    this.renderBorrowedBooks();
    this.renderBooks();
    this.updateStats();
  }

  deleteBook(bookId) {
    if (!confirm("Are you sure you want to delete this book?")) return;

    // Check if book is borrowed
    const isBorrowed = this.borrowedBooks.some((b) => b.bookId === bookId);
    if (isBorrowed) {
      alert("Cannot delete! This book has active borrows.");
      return;
    }

    this.books = this.books.filter((b) => b.id !== bookId);
    this.saveToStorage();
    this.renderBooks();
    this.updateStats();
  }

  searchBooks(query) {
    if (!query) {
      this.renderBooks();
      return;
    }

    const filtered = this.books.filter(
      (book) =>
        book.title.toLowerCase().includes(query.toLowerCase()) ||
        book.author.toLowerCase().includes(query.toLowerCase()) ||
        book.isbn.toLowerCase().includes(query.toLowerCase()),
    );

    this.renderBooks(filtered);
  }

  renderBooks(booksList = this.books) {
    const container = document.getElementById("booksGrid");

    if (booksList.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book"></i>
                    <p>No books found</p>
                </div>
            `;
      return;
    }

    container.innerHTML = booksList
      .map(
        (book) => `
            <div class="book-card">
                <img src="${book.image}" alt="${book.title}" class="book-image" 
                     onerror="this.src='https://via.placeholder.com/280x400/667eea/ffffff?text=No+Cover'">
                <div class="book-info">
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">by ${book.author}</p>
                    <div class="book-meta">
                        <span><i class="fas fa-barcode"></i> ${book.isbn}</span>
                        <span><i class="fas fa-calendar"></i> ${book.year}</span>
                    </div>
                    <span class="book-category">${book.category}</span>
                    <div class="book-status ${book.available > 0 ? "available" : "borrowed"}">
                        <i class="fas fa-circle"></i>
                        ${book.available > 0 ? `${book.available} Available` : "Not Available"}
                    </div>
                    <div class="book-actions">
                        ${
                          book.available > 0
                            ? `
                            <button class="btn btn-success" onclick="library.openBorrowModal('${book.id}')">
                                <i class="fas fa-hand-holding"></i> Borrow
                            </button>
                        `
                            : ""
                        }
                        <button class="btn btn-primary" onclick="library.openBookModal('${book.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger" onclick="library.deleteBook('${book.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `,
      )
      .join("");
  }

  renderBorrowedBooks() {
    const container = document.getElementById("borrowedList");

    if (this.borrowedBooks.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-hand-holding"></i>
                    <p>No borrowed books</p>
                </div>
            `;
      return;
    }

    container.innerHTML = this.borrowedBooks
      .map((borrow) => {
        const isOverdue = new Date(borrow.returnDate) < new Date();
        return `
                <div class="borrowed-item">
                    <img src="${borrow.bookImage}" alt="${borrow.bookTitle}" class="borrowed-book-img">
                    <div class="borrowed-details">
                        <h4>${borrow.bookTitle}</h4>
                        <p><strong>Student:</strong> ${borrow.studentName} (ID: ${borrow.studentId})</p>
                        <p><strong>Borrowed:</strong> ${borrow.borrowDate}</p>
                        <p class="${isOverdue ? "overdue" : ""}">
                            <strong>Return by:</strong> ${borrow.returnDate} 
                            ${isOverdue ? "⚠️ OVERDUE" : ""}
                        </p>
                    </div>
                    <button class="btn btn-success" onclick="library.returnBook('${borrow.id}')">
                        <i class="fas fa-check"></i> Return
                    </button>
                </div>
            `;
      })
      .join("");
  }

  renderStatistics() {
    // Category Statistics
    const categoryStats = {};
    this.books.forEach((book) => {
      categoryStats[book.category] = (categoryStats[book.category] || 0) + 1;
    });

    document.getElementById("categoryStats").innerHTML =
      Object.entries(categoryStats)
        .map(
          ([category, count]) => `
                <div class="category-item">
                    <span>${category}</span>
                    <strong>${count} books</strong>
                </div>
            `,
        )
        .join("") || "<p>No data available</p>";

    // Activity Log
    const activities = [
      ...this.borrowedBooks.map((b) => ({
        date: b.borrowDate,
        text: `${b.studentName} borrowed "${b.bookTitle}"`,
      })),
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    document.getElementById("activityLog").innerHTML =
      activities.length > 0
        ? activities
            .map(
              (activity) => `
                <div class="activity-item">
                    <p><strong>${activity.text}</strong></p>
                    <p><small>${activity.date}</small></p>
                </div>
            `,
            )
            .join("")
        : "<p>No recent activity</p>";
  }

  updateStats() {
    const total = this.books.length;
    const available = this.books.reduce((sum, book) => sum + book.available, 0);
    const borrowed = this.borrowedBooks.length;

    document.getElementById("totalBooks").textContent = total;
    document.getElementById("availableBooks").textContent = available;
    document.getElementById("borrowedBooksCount").textContent = borrowed;
  }

  saveToStorage() {
    localStorage.setItem("books", JSON.stringify(this.books));
    localStorage.setItem("borrowedBooks", JSON.stringify(this.borrowedBooks));
  }

  addSampleBooks() {
    this.books = [
      {
        id: "1",
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        isbn: "978-0-7432-7356-5",
        category: "Fiction",
        year: "1925",
        quantity: 5,
        available: 5,
        image:
          "https://images-na.ssl-images-amazon.com/images/I/81QuEGw8VPL.jpg",
        description:
          "A novel set in the Jazz Age that follows the mysterious millionaire Jay Gatsby.",
        addedDate: new Date().toISOString(),
      },
      {
        id: "2",
        title: "To Kill a Mockingbird",
        author: "Harper Lee",
        isbn: "978-0-06-112008-4",
        category: "Fiction",
        year: "1960",
        quantity: 3,
        available: 3,
        image:
          "https://m.media-amazon.com/images/I/71FxgtFKcQL._AC_UF1000,1000_QL80_.jpg",
        description:
          "A gripping tale of racial injustice and childhood innocence.",
        addedDate: new Date().toISOString(),
      },
      {
        id: "3",
        title: "A Brief History of Time",
        author: "Stephen Hawking",
        isbn: "978-0-553-38016-3",
        category: "Science",
        year: "1988",
        quantity: 4,
        available: 4,
        image:
          "https://m.media-amazon.com/images/I/71QLkB9evIL._AC_UF1000,1000_QL80_.jpg",
        description:
          "A landmark volume in science writing by one of the great minds of our time.",
        addedDate: new Date().toISOString(),
      },
    ];
    this.saveToStorage();
  }
}

// Initialize the library system
const library = new LibrarySystem();
