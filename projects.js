// Projects section enhancements for the redesign preview.
// On the real page, the "PROJECTS" button scrolls smoothly; the canvas game
// stays confined to the hero viewport.

document.addEventListener('DOMContentLoaded', () => {
    // Prevent text selection while dragging/slicing faces (CSS user-select:none
    // does the heavy lifting; this blocks programmatic/double-click selection too)
    document.addEventListener('selectstart', (e) => e.preventDefault());

    const btn = document.getElementById('projects-btn');
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('projects').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Keep the game grid within the hero viewport only.
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
        const resizeToHero = () => {
            canvas.height = window.innerHeight;
            canvas.width = window.innerWidth;
            window.dispatchEvent(new Event('resize'));
        };
        resizeToHero();
    }

    // Once the game is cleared, auto-scroll back up so the win banner is visible.
    const observer = new MutationObserver(() => {
        const banner = document.getElementById('win-banner');
        if (banner && !banner.classList.contains('hidden')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    const banner = document.getElementById('win-banner');
    if (banner) observer.observe(banner, { attributes: true, attributeFilter: ['class'] });
});