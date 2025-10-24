// src/components/Header.jsx - FIXED: Ensured icon is properly displayed
function Header() {
    return (
        <div class="header">
            <div class="logo-section">
                {/* FIXED: Ensured the logo icon is properly displayed */}
                <div class="logo">📊</div>
                <div class="title-section">
                    <h1>Dividend Portfolio Manager</h1>
                    <p>Advanced dividend tracking & backtesting platform</p>
                </div>
            </div>
        </div>
    );
}

export default Header;