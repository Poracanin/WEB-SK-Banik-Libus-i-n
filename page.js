/* ============================================================
   SK Baník Libušín — obsahové podstránky (logika)
   Nav modal + reveal animace + rok v patičce + audio přehrávač
   ============================================================ */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  /* ---------------- mobilní menu (modální okno) ---------------- */
  function setupNav() {
    var burger = $("navBurger");
    var modal = $("navModal");
    if (!burger || !modal) return;
    var closeBtn = $("navModalClose");
    var backdrop = $("navModalBackdrop");

    function openMenu() {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      burger.setAttribute("aria-expanded", "true");
      document.body.classList.add("nav-locked");
    }
    function closeMenu() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      burger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-locked");
    }

    burger.addEventListener("click", openMenu);
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    if (backdrop) backdrop.addEventListener("click", closeMenu);
    Array.prototype.forEach.call(modal.querySelectorAll(".nav-modal-links a"), function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("open")) closeMenu();
    });
  }

  /* ---------------- reveal on scroll ---------------- */
  function setupReveal() {
    var els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;
    Array.prototype.forEach.call(els, function (el) { el.classList.add("reveal-hidden"); });

    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(els, function (el) {
        el.classList.remove("reveal-hidden");
        el.classList.add("reveal-in");
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.remove("reveal-hidden");
          e.target.classList.add("reveal-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  /* ---------------- rok v patičce ---------------- */
  function setupYear() {
    var y = $("currentYear");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------------- audio přehrávač ---------------- */
  function fmtTime(sec) {
    if (isNaN(sec) || !isFinite(sec)) return "0:00";
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function initPlayer(player) {
    var audio = player.querySelector(".player-audio");
    if (!audio) return;

    var playBtn = player.querySelector(".player-play");
    var playIcon = player.querySelector(".player-play .icon-play");
    var pauseIcon = player.querySelector(".player-play .icon-pause");
    var muteBtn = player.querySelector(".player-mute");
    var unmutedIcon = player.querySelector(".player-mute .icon-unmuted");
    var mutedIcon = player.querySelector(".player-mute .icon-muted");
    var seek = player.querySelector(".player-seek");
    var fill = player.querySelector(".player-seek-fill");
    var curEl = player.querySelector(".player-cur");
    var durEl = player.querySelector(".player-dur");

    audio.addEventListener("loadedmetadata", function () {
      if (durEl) durEl.textContent = fmtTime(audio.duration);
    });

    audio.addEventListener("timeupdate", function () {
      var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      if (fill) fill.style.width = pct + "%";
      if (curEl) curEl.textContent = fmtTime(audio.currentTime);
    });

    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (audio.paused || audio.ended) {
          // zastav ostatní přehrávače na stránce
          Array.prototype.forEach.call(document.querySelectorAll(".player-audio"), function (a) {
            if (a !== audio) a.pause();
          });
          audio.play();
        } else {
          audio.pause();
        }
      });
    }

    function syncPlayState() {
      var playing = !audio.paused && !audio.ended;
      if (playIcon) playIcon.classList.toggle("hidden", playing);
      if (pauseIcon) pauseIcon.classList.toggle("hidden", !playing);
    }
    audio.addEventListener("play", syncPlayState);
    audio.addEventListener("pause", syncPlayState);
    audio.addEventListener("ended", function () {
      if (fill) fill.style.width = "0%";
      if (curEl) curEl.textContent = "0:00";
      syncPlayState();
    });

    if (muteBtn) {
      muteBtn.addEventListener("click", function () {
        audio.muted = !audio.muted;
        if (unmutedIcon) unmutedIcon.classList.toggle("hidden", audio.muted);
        if (mutedIcon) mutedIcon.classList.toggle("hidden", !audio.muted);
      });
    }

    if (seek) {
      seek.addEventListener("click", function (e) {
        var rect = seek.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        if (audio.duration) audio.currentTime = audio.duration * Math.max(0, Math.min(1, pct));
      });
    }
  }

  function setupPlayers() {
    Array.prototype.forEach.call(document.querySelectorAll(".player"), initPlayer);
  }

  /* ---------------- init ---------------- */
  function init() {
    setupNav();
    setupReveal();
    setupYear();
    setupPlayers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
