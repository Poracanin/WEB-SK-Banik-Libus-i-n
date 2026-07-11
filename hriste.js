/* ============================================================
   SK Banik Libusin — demo obsazenosti hriste
   ============================================================ */
(function () {
  "use strict";

  var DAY_NAMES = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  var MONTHS = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
  var RANGE_START = 8 * 60;
  var RANGE_END = 22 * 60;
  var TOTAL = RANGE_END - RANGE_START;

  var state = {
    facility: "field",
    selectedDate: "",
    pending: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(num) {
    return String(num).padStart(2, "0");
  }

  function iso(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseIso(value) {
    var parts = String(value || "").split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfWeek(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function addDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function minutes(time) {
    var parts = String(time).split(":").map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }

  function timeLabel(from, to) {
    return from + " - " + to;
  }

  function longDate(value) {
    var d = parseIso(value);
    return DAY_NAMES[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()];
  }

  function shortDate(value) {
    var d = parseIso(value);
    return d.getDate() + ". " + (d.getMonth() + 1) + ".";
  }

  function makeEvent(base, offset, from, to, facility, lane, title, sub, type) {
    return {
      date: iso(addDays(base, offset)),
      from: from,
      to: to,
      facility: facility,
      lane: lane,
      title: title,
      sub: sub,
      type: type || "training",
      lights: facility === "field" && minutes(to) > 20 * 60
    };
  }

  function demoEvents() {
    var base = startOfWeek(new Date());
    return [
      makeEvent(base, 0, "16:30", "18:00", "field", "a", "Přípravka", "trénink · polovina A", "training"),
      makeEvent(base, 0, "18:00", "19:30", "field", "full", "Dorost", "trénink · celé hřiště", "training"),
      makeEvent(base, 0, "19:30", "21:00", "field", "full", "A tým", "trénink pod světly", "match"),

      makeEvent(base, 1, "17:00", "18:30", "field", "a", "Mladší žáci", "trénink · polovina A", "training"),
      makeEvent(base, 1, "17:00", "18:30", "field", "b", "B tým", "trénink · polovina B", "training"),
      makeEvent(base, 1, "19:00", "20:30", "field", "a", "Veřejný pronájem", "rekreační fotbal", "rental"),

      makeEvent(base, 2, "16:00", "17:15", "field", "b", "Individuální trénink", "technika · polovina B", "training"),
      makeEvent(base, 2, "18:00", "20:00", "field", "full", "A tým", "trénink · celé hřiště", "match"),

      makeEvent(base, 3, "17:00", "18:30", "field", "full", "Dorost", "trénink · celé hřiště", "training"),
      makeEvent(base, 3, "19:00", "22:00", "clubhouse", "full", "Schůze výboru", "klubovna", "clubhouse"),

      makeEvent(base, 4, "18:00", "19:30", "field", "full", "B tým", "trénink · celé hřiště", "training"),
      makeEvent(base, 4, "20:00", "23:00", "clubhouse", "full", "Soukromá akce", "klubovna", "clubhouse"),

      makeEvent(base, 5, "10:00", "12:00", "field", "full", "Mistrovské utkání", "celé hřiště", "match"),
      makeEvent(base, 5, "15:00", "17:00", "field", "full", "Pronájem hřiště", "firemní fotbálek", "rental"),
      makeEvent(base, 5, "18:00", "23:00", "clubhouse", "full", "Oslava", "klubovna", "clubhouse"),

      makeEvent(base, 6, "10:30", "12:00", "field", "b", "Volný trénink", "polovina B", "rental")
    ];
  }

  var EVENTS = demoEvents();

  function eventsFor(date, facility) {
    return EVENTS.filter(function (event) {
      return event.date === date && event.facility === facility;
    }).sort(function (a, b) {
      return minutes(a.from) - minutes(b.from);
    });
  }

  function isToday(value) {
    return value === iso(new Date());
  }

  function nowMinutes() {
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function activeNow(facility) {
    if (!isToday(state.selectedDate)) return null;
    var now = nowMinutes();
    return eventsFor(state.selectedDate, facility).find(function (event) {
      return minutes(event.from) <= now && minutes(event.to) >= now;
    }) || null;
  }

  function freeMinutes(date, facility) {
    var list = eventsFor(date, facility);
    if (!list.length) return TOTAL;
    var occupied = 0;
    list.forEach(function (event) {
      occupied += Math.max(0, Math.min(minutes(event.to), RANGE_END) - Math.max(minutes(event.from), RANGE_START));
    });
    return Math.max(0, TOTAL - occupied);
  }

  function formatDuration(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (!h) return m + " min";
    return m ? h + " h " + m + " min" : h + " h";
  }

  function blockLabel(count) {
    if (!count) return "volno";
    if (count === 1) return "1 blok";
    if (count > 1 && count < 5) return count + " bloky";
    return count + " bloků";
  }

  function facilityLabel() {
    return state.facility === "field" ? "Hřiště" : "Klubovna";
  }

  function renderStatus() {
    var active = activeNow(state.facility);
    var free = freeMinutes(state.selectedDate, state.facility);
    $("fieldNowValue").textContent = active ? "Obsazeno" : "Volno";
    $("fieldNowValue").className = "field-status-value " + (active ? "busy" : "available");
    $("fieldNowNote").textContent = active ? active.title + " · " + timeLabel(active.from, active.to) : "V demo rozvrhu teď není blokace.";
    $("fieldFreeValue").textContent = formatDuration(free);
    $("fieldFreeNote").textContent = "Volná kapacita ve vybraný den.";
    $("fieldFacilityValue").textContent = facilityLabel();
    $("fieldSelectedValue").textContent = shortDate(state.selectedDate);
    $("fieldSelectedNote").textContent = longDate(state.selectedDate);
    document.body.dataset.facility = state.facility;
  }

  function renderSegments() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-field-facility]"), function (button) {
      button.classList.toggle("active", button.dataset.fieldFacility === state.facility);
    });
  }

  function renderDays() {
    var base = startOfWeek(parseIso(state.selectedDate));
    var html = "";
    for (var i = 0; i < 7; i += 1) {
      var d = addDays(base, i);
      var value = iso(d);
      var count = eventsFor(value, state.facility).length;
      html += '<button type="button" class="field-day-btn' +
        (value === state.selectedDate ? " active" : "") +
        (isToday(value) ? " today" : "") +
        '" data-field-date="' + esc(value) + '">' +
        '<span class="field-day-name">' + esc(DAY_NAMES[d.getDay()]) + '</span>' +
        '<span class="field-day-num">' + esc(d.getDate()) + '</span>' +
        '<span class="field-day-meta"><i class="field-dot"></i>' + esc(blockLabel(count)) + '</span>' +
        '</button>';
    }
    $("fieldDays").innerHTML = html;
  }

  function laneStyle(event) {
    if (state.facility === "clubhouse") return { left: 2, width: 96 };
    if (event.lane === "a") return { left: 2, width: 47 };
    if (event.lane === "b") return { left: 51, width: 47 };
    return { left: 2, width: 96 };
  }

  function eventClass(event) {
    if (event.facility === "clubhouse") return "clubhouse";
    return event.type === "match" ? "match" : event.type === "rental" ? "rental" : "training";
  }

  function renderTimeline() {
    var list = eventsFor(state.selectedDate, state.facility);
    var hours = "";
    for (var hour = 8; hour <= 22; hour += 2) {
      var top = ((hour * 60 - RANGE_START) / TOTAL) * 100;
      hours += '<span class="field-hour" style="top:' + top + '%">' + pad(hour) + ':00</span>';
    }
    $("fieldHours").innerHTML = hours;

    var laneHeads = state.facility === "field"
      ? '<span class="field-lane-head" style="left:2%;width:47%">Polovina A</span><span class="field-lane-head" style="left:51%;width:47%">Polovina B</span>'
      : '<span class="field-lane-head" style="left:2%;width:96%">Klubovna</span>';

    var lines = "";
    for (var h = 8; h <= 22; h += 2) {
      var lineTop = ((h * 60 - RANGE_START) / TOTAL) * 100;
      lines += '<span class="field-hour-line" style="top:' + lineTop + '%"></span>';
    }

    var events = list.map(function (event, index) {
      var from = Math.max(minutes(event.from), RANGE_START);
      var to = Math.min(minutes(event.to), RANGE_END);
      var top = ((from - RANGE_START) / TOTAL) * 100;
      var height = Math.max(7.8, ((to - from) / TOTAL) * 100);
      var lane = laneStyle(event);
      return '<article class="field-event ' + esc(eventClass(event)) + '" style="left:' + lane.left + '%;width:' + lane.width + '%;top:' + top + '%;height:' + height + '%;animation-delay:' + (index * .04) + 's">' +
        '<strong class="field-event-title">' + esc(event.title) + '</strong>' +
        '<span class="field-event-time">' + esc(timeLabel(event.from, event.to)) + '</span>' +
        '<span class="field-event-sub">' + esc(event.sub) + '</span>' +
        (event.lights ? '<span class="field-light">Světla</span>' : '') +
        '</article>';
    }).join("");

    var empty = list.length ? "" : '<div class="field-empty" style="position:absolute;inset:18px;display:flex;align-items:center;justify-content:center">Celý vybraný den je v demu volný.</div>';
    $("fieldLanes").innerHTML = laneHeads + lines + events + empty;
  }

  function renderMobileList() {
    var list = eventsFor(state.selectedDate, state.facility);
    if (!list.length) {
      $("fieldMobileList").innerHTML = '<div class="field-empty">Celý vybraný den je v demu volný.</div>';
      return;
    }
    $("fieldMobileList").innerHTML = list.map(function (event) {
      var tag = state.facility === "clubhouse" ? "Klubovna" : event.lane === "full" ? "Celé hřiště" : "Polovina " + event.lane.toUpperCase();
      return '<article class="field-mobile-card">' +
        '<div class="field-mobile-time">' + esc(event.from) + '<br>' + esc(event.to) + '</div>' +
        '<div><strong>' + esc(event.title) + '</strong><span>' + esc(event.sub) + '</span><span class="field-mobile-tag">' + esc(tag) + (event.lights ? " · světla" : "") + '</span></div>' +
        '</article>';
    }).join("");
  }

  function renderDetail() {
    var list = eventsFor(state.selectedDate, state.facility);
    $("fieldDetailTitle").textContent = longDate(state.selectedDate);
    $("fieldDetailSummary").textContent = list.length ? blockLabel(list.length) + " v demo rozvrhu" : "Bez blokace";
    renderTimeline();
    renderMobileList();
  }

  function renderRequestDate() {
    var input = $("requestDate");
    if (input) input.value = state.selectedDate;
  }

  function renderPending() {
    var box = $("fieldPending");
    if (!box) return;
    if (!state.pending) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = "Demo žádost: " + esc(state.pending.name) + " · " + esc(state.pending.date) + " · " + esc(state.pending.from) + " - " + esc(state.pending.to) + ". Po napojení se tohle bude odesílat správci.";
  }

  function render() {
    renderSegments();
    renderDays();
    renderStatus();
    renderDetail();
    renderRequestDate();
    renderPending();
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-field-facility]"), function (button) {
      button.addEventListener("click", function () {
        state.facility = button.dataset.fieldFacility;
        render();
      });
    });

    $("fieldDays").addEventListener("click", function (event) {
      var button = event.target.closest("[data-field-date]");
      if (!button) return;
      state.selectedDate = button.dataset.fieldDate;
      render();
    });

    $("fieldToday").addEventListener("click", function () {
      state.selectedDate = iso(new Date());
      render();
    });

    $("requestDate").addEventListener("change", function (event) {
      state.selectedDate = event.target.value || state.selectedDate;
      render();
    });

    $("fieldDemoForm").addEventListener("submit", function (event) {
      event.preventDefault();
      state.pending = {
        name: $("requestName").value || "Bez jména",
        date: $("requestDate").value || state.selectedDate,
        from: $("requestFrom").value,
        to: $("requestTo").value
      };
      renderPending();
    });
  }

  function init() {
    state.selectedDate = iso(new Date());
    bind();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
