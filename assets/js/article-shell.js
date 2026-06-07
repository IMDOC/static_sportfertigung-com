/**
 * Article Shell JS — 文章页面初始化 + TOC 平滑滚动
 * berunactivewear.com
 */
document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.classList.add('article-shell-ready');

    // TOC 链接平滑滚动
    document.querySelectorAll('.article-toc-link, .toc-list a').forEach(function (link) {
        link.addEventListener('click', function (e) {
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
