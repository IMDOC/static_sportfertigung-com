/**
 * article-toc.js — TOC auto-collapse behavior for post-optimizer canonical TOC
 *
 * Contract with post-optimizer (no placeholders — copy verbatim):
 *   - Element ids: #toc-nav-container + #toc-list-content
 *   - Toggle class: .expanded
 *   - Icon class:   .toc-toggle-icon  (bi-chevron-down ↔ bi-chevron-up)
 *
 * When a TOC link is clicked and the container is expanded, collapse it again
 * so the sidebar returns to its default compact state after navigating.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var tocContainer = document.getElementById('toc-nav-container');
        if (!tocContainer) return;

        var tocLinks = document.querySelectorAll('#toc-list-content a');
        tocLinks.forEach(function (link) {
            link.addEventListener('click', function () {
                if (!tocContainer.classList.contains('expanded')) return;
                tocContainer.classList.remove('expanded');
                var toggleIcon = tocContainer.querySelector('.toc-toggle-icon');
                if (toggleIcon) {
                    toggleIcon.classList.remove('bi-chevron-up');
                    toggleIcon.classList.add('bi-chevron-down');
                }
            });
        });
    });
})();
