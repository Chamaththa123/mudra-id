/**
 * Home page: animated SVG objects loader and revive
 * - Loads hero and section2 SVG objects (data-src → data)
 * - Lazy-loads objects with data-lazy="true"
 * - Retries on error; revives on visibilitychange/pageshow
 */
(function () {
  'use strict';

  /**
   * Hero background MP4: seamless loop via crossfade between two layers (hides decoder seam at loop point).
   */
  (function heroBgVideo() {
    var stack = document.querySelector('.site-hero-bg-video-stack');
    var nodes = stack ? stack.querySelectorAll('.site-hero-bg-video') : document.querySelectorAll('.site-hero-bg-video');

    function tryPlay(el) {
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }

    if (!nodes.length) return;

    if (nodes.length < 2) {
      var single = nodes[0];
      single.loop = true;
      single.addEventListener('playing', function () {
        single.style.opacity = '1';
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) tryPlay(single);
      });
      window.addEventListener('pageshow', function () {
        tryPlay(single);
      });
      tryPlay(single);
      return;
    }

    var v = [nodes[0], nodes[1]];
    var frontIdx = 0;
    var CROSSFADE_MS = 320;
    var crossfading = false;

    function frontEl() {
      return v[frontIdx];
    }

    function backEl() {
      return v[1 - frontIdx];
    }

    function fadeWindowSec(duration) {
      var w = CROSSFADE_MS / 1000 + 0.08;
      return Math.min(w, Math.max(0.1, duration * 0.28));
    }

    function finishCrossfade() {
      var f = frontEl();
      var b = backEl();
      f.pause();
      try {
        f.currentTime = 0;
      } catch (e) {}
      f.style.opacity = '0';
      f.style.zIndex = '1';
      f.style.transition = '';
      b.style.zIndex = '2';
      b.style.opacity = '1';
      b.style.transition = '';
      frontIdx = 1 - frontIdx;
      crossfading = false;
    }

    function startCrossfade() {
      if (crossfading) return;
      var f = frontEl();
      var b = backEl();
      var dur = f.duration;
      if (!dur || !isFinite(dur)) return;

      crossfading = true;
      b.style.zIndex = '3';
      f.style.zIndex = '2';

      var settled = false;
      function settle(e) {
        if (e && e.propertyName !== 'opacity') return;
        if (settled) return;
        settled = true;
        f.removeEventListener('transitionend', settle);
        requestAnimationFrame(function () {
          finishCrossfade();
        });
      }

      function applyOpacityCrossfade() {
        var t = 'opacity ' + CROSSFADE_MS + 'ms ease-in-out';
        b.style.transition = t;
        f.style.transition = t;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            f.style.opacity = '0';
            b.style.opacity = '1';
          });
        });
        f.addEventListener('transitionend', settle);
        setTimeout(function () {
          settle(null);
        }, CROSSFADE_MS + 120);
      }

      function afterFirstPaint() {
        var ran = false;
        function go() {
          if (ran) return;
          ran = true;
          applyOpacityCrossfade();
        }
        if (typeof b.requestVideoFrameCallback === 'function') {
          var h = b.requestVideoFrameCallback(function () {
            try {
              b.cancelVideoFrameCallback(h);
            } catch (e2) {}
            requestAnimationFrame(go);
          });
          setTimeout(go, 100);
        } else {
          requestAnimationFrame(function () {
            requestAnimationFrame(go);
          });
        }
      }

      function beginPlayback() {
        var pr = b.play();
        if (pr && typeof pr.then === 'function') {
          pr.then(afterFirstPaint).catch(afterFirstPaint);
        } else {
          afterFirstPaint();
        }
      }

      b.pause();
      try {
        b.currentTime = 0;
      } catch (e) {}

      if (b.seeking) {
        b.addEventListener(
          'seeked',
          function onSeeked() {
            b.removeEventListener('seeked', onSeeked);
            beginPlayback();
          },
          false
        );
      } else {
        requestAnimationFrame(beginPlayback);
      }
    }

    v.forEach(function (el) {
      el.loop = false;
      el.addEventListener('playing', function () {
        if (crossfading && el === backEl()) return;
        if (el === frontEl()) el.style.opacity = '1';
      });
      el.addEventListener('timeupdate', function () {
        if (el !== frontEl() || crossfading) return;
        var fe = frontEl();
        var d = fe.duration;
        if (!d || !isFinite(d)) return;
        if (fe.currentTime >= d - fadeWindowSec(d)) startCrossfade();
      });
      el.addEventListener('ended', function () {
        if (el !== frontEl() || crossfading) return;
        startCrossfade();
      });
    });

    frontEl().style.zIndex = '2';
    frontEl().style.opacity = '0';
    backEl().style.zIndex = '1';
    backEl().style.opacity = '0';

    tryPlay(frontEl());
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tryPlay(frontEl());
    });
    window.addEventListener('pageshow', function () {
      tryPlay(frontEl());
    });
  })();

  var animatedObjects = Array.prototype.slice.call(
    document.querySelectorAll('.home-animated-svg-object, .home-hero-animated-svg-object')
  );

  function loadObject(el) {
    var src = el.getAttribute('data-src');
    if (!src) return;
    if (el.getAttribute('data') === src) return;
    el.setAttribute('data', src);
  }

  function isVisibleForCurrentViewport(el) {
    var styles = window.getComputedStyle(el);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  }

  function restartObject(el) {
    var src = el.getAttribute('data-src');
    if (!src) return;
    el.removeAttribute('data');
    requestAnimationFrame(function () {
      el.setAttribute('data', src);
    });
  }

  animatedObjects.forEach(function (el) {
    el.dataset.retryCount = '0';
    el.addEventListener('error', function () {
      var tries = Number(el.dataset.retryCount || 0);
      if (tries < 2) {
        el.dataset.retryCount = String(tries + 1);
        setTimeout(function () {
          restartObject(el);
        }, 250 * (tries + 1));
      }
    });
  });

  var eagerObjects = animatedObjects.filter(function (el) {
    return el.getAttribute('data-lazy') !== 'true';
  });
  function loadVisibleEagerObjects() {
    eagerObjects.forEach(function (el) {
      if (isVisibleForCurrentViewport(el)) loadObject(el);
    });
  }
  loadVisibleEagerObjects();

  var lazyObjects = animatedObjects.filter(function (el) {
    return el.getAttribute('data-lazy') === 'true';
  });

  if (lazyObjects.length) {
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            loadObject(entry.target);
            obs.unobserve(entry.target);
          }
        });
      }, { rootMargin: '300px' });

      lazyObjects.forEach(function (el) {
        observer.observe(el);
      });
    } else {
      lazyObjects.forEach(loadObject);
    }
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(loadVisibleEagerObjects, 150);
  });

  function reviveIfNeeded() {
    animatedObjects.forEach(function (el) {
      if (!el.contentDocument && el.getAttribute('data')) {
        restartObject(el);
      }
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) reviveIfNeeded();
  });
  window.addEventListener('pageshow', reviveIfNeeded);

  /**
   * Mobile nav modal: open/close on menu button and close button, lock body scroll when open.
   */
  (function mobileNavModal() {
    var menuBtn = document.querySelector('.home-header-menu-btn');
    var modal = document.getElementById('home-nav-modal');
    var backdrop = modal && modal.querySelector('.home-nav-modal-backdrop');
    var closeBtn = modal && modal.querySelector('.home-nav-modal-close');
    var modalLinks = modal && modal.querySelectorAll('.home-nav-modal-nav a');

    function openModal() {
      if (!modal) return;
      modal.classList.add('is-open');
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove('is-open');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        if (modal.classList.contains('is-open')) {
          closeModal();
        } else {
          openModal();
        }
      });
    }
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modalLinks) {
      modalLinks.forEach(function (link) {
        link.addEventListener('click', closeModal);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
        closeModal();
      }
    });
  })();

  /**
   * Section 3: two slides (A and B). Current slides center→right and hides;
   * next slides in from left→center. No loading gap — both SVGs stay in DOM.
   */
  (function section3Alternate() {
    var container = document.getElementById('home-section3-slides');
    if (!container) return;
    var slideAObject = container.querySelector('.home-section3-slide-a .home-section3-anim-object');
    var slideBObject = container.querySelector('.home-section3-slide-b .home-section3-anim-object');
    var DURATION_MS = 4000;
    var TRANSITION_MS = 500;
    var timer = null;

    function goToB() {
      restartObject(slideBObject);
      container.classList.remove('state-a', 'state-a-next', 'state-b-next');
      container.classList.add('state-b');
      timer = setTimeout(function () {
        container.classList.add('state-a-next');
        timer = setTimeout(goToA, DURATION_MS - TRANSITION_MS);
      }, TRANSITION_MS);
    }

    function goToA() {
      restartObject(slideAObject);
      container.classList.remove('state-b', 'state-a-next', 'state-b-next');
      container.classList.add('state-a');
      timer = setTimeout(function () {
        container.classList.add('state-b-next');
        timer = setTimeout(goToB, DURATION_MS - TRANSITION_MS);
      }, TRANSITION_MS);
    }

    timer = setTimeout(goToB, DURATION_MS);
  })();

  /**
   * Section 6: two slides (A and B), same center→right / left→center animation as section 3.
   */
  (function section6Alternate() {
    var container = document.getElementById('home-section6-slides');
    if (!container) return;
    var slideAObject = container.querySelector('.home-section6-slide-a .home-section6-anim-object');
    var slideBObject = container.querySelector('.home-section6-slide-b .home-section6-anim-object');
    var DURATION_MS = 2260;
    var TRANSITION_MS = 500;
    var timer = null;

    function goToB() {
      restartObject(slideBObject);
      container.classList.remove('state-a', 'state-a-next', 'state-b-next');
      container.classList.add('state-b');
      timer = setTimeout(function () {
        container.classList.add('state-a-next');
        timer = setTimeout(goToA, DURATION_MS - TRANSITION_MS);
      }, TRANSITION_MS);
    }

    function goToA() {
      restartObject(slideAObject);
      container.classList.remove('state-b', 'state-a-next', 'state-b-next');
      container.classList.add('state-a');
      timer = setTimeout(function () {
        container.classList.add('state-b-next');
        timer = setTimeout(goToB, DURATION_MS - TRANSITION_MS);
      }, TRANSITION_MS);
    }

    timer = setTimeout(goToB, DURATION_MS);
  })();
})();
