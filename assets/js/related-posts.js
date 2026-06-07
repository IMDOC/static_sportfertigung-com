/**
 * Related Posts JS — 相关文章组件初始化
 * berunactivewear.com
 */
document.addEventListener('DOMContentLoaded', function () {
    var related = document.querySelector('[data-post-optimizer="related-posts"], .related-posts-section');
    if (!related) return;
    related.classList.add('related-posts-ready');
});
