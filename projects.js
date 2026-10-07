// Portfolio navigation keeps native anchor behavior, including URL hashes.
document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('win-banner');
    const continueButton = document.getElementById('continue-btn');
    function closeBanner() {
        banner.classList.add('hidden');
        document.getElementById('projects-btn').focus({ preventScroll: true });
    }
    continueButton.addEventListener('click', closeBanner);
    document.addEventListener('keydown', event => {
        if (banner.classList.contains('hidden')) return;
        if (event.key === 'Escape') closeBanner();
        if (event.key === 'Tab') {
            const prize = banner.querySelector('a');
            if (event.shiftKey && document.activeElement === prize) {
                event.preventDefault();
                continueButton.focus();
            } else if (!event.shiftKey && document.activeElement === continueButton) {
                event.preventDefault();
                prize.focus();
            }
        }
    });
});
