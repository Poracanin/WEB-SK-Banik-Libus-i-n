/* ============================================================
   SK Banik Libusin — obsazenost hriste
   ============================================================ */
(function () {
  "use strict";

  var DAY_NAMES = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  var WEEK_DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  var MONTHS = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
  var MONTHS_TITLE = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
  var RANGE_START = 8 * 60;
  var RANGE_END = 23 * 60;
  var TOTAL = RANGE_END - RANGE_START;

  var state = {
    facility: "field",
    view: "week",
    selectedDate: "",
    selectedStart: null,
    selectedEnd: null,
    selectedEventId: null,
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
    if (parts.length !== 3 || parts.some(isNaN)) return new Date();
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

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function minutes(time) {
    var parts = String(time).split(":").map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }

  function fromMinutes(value) {
    return pad(Math.floor(value / 60)) + ":" + pad(value % 60);
  }

  function timeLabel(from, to) {
    return from + " - " + to;
  }

  function shortDate(value) {
    var d = parseIso(value);
    return d.getDate() + ". " + (d.getMonth() + 1) + ".";
  }

  function longDate(value) {
    var d = parseIso(value);
    return DAY_NAMES[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()];
  }

  function fullDate(value) {
    var d = parseIso(value);
    return DAY_NAMES[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function isToday(value) {
    return value === iso(new Date());
  }

  function blockLabel(count) {
    if (!count) return "volno";
    if (count === 1) return "1 rezervace";
    if (count > 1 && count < 5) return count + " rezervace";
    return count + " rezervací";
  }

  function facilityLabel() {
    return state.facility === "field" ? "Hřiště" : "Hospoda";
  }

  function laneLabel(event) {
    if (event.facility === "clubhouse") return "Hospoda";
    if (event.lane === "half_a") return "Polovina A";
    if (event.lane === "half_b") return "Polovina B";
    return "Celé hřiště";
  }

  function eventClass(event) {
    if (event.facility === "clubhouse") return "clubhouse";
    return event.type === "match" ? "match" : event.type === "rental" ? "rental" : "training";
  }

  var nextEventId = 1;

  function makeEvent(base, offset, from, to, facility, lane, title, sub, type) {
    return {
      id: "event-" + nextEventId++,
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
    var events = [];
    for (var week = -6; week <= 8; week += 1) {
      var anchor = addDays(base, week * 7);
      events.push(
        makeEvent(anchor, 0, "16:30", "18:00", "field", "half_a", "Přípravka", "trénink · polovina A", "training"),
        makeEvent(anchor, 0, "18:00", "19:30", "field", "full", "Dorost", "trénink · celé hřiště", "training"),
        makeEvent(anchor, 0, "19:30", "21:00", "field", "full", "A tým", "trénink pod světly", "match"),

        makeEvent(anchor, 1, "17:00", "18:30", "field", "half_a", "Mladší žáci", "trénink · polovina A", "training"),
        makeEvent(anchor, 1, "17:00", "18:30", "field", "half_b", "B tým", "trénink · polovina B", "training"),
        makeEvent(anchor, 1, "19:00", "20:30", "field", "half_a", "Veřejný pronájem", "rekreační fotbal", "rental"),

        makeEvent(anchor, 2, "16:00", "17:15", "field", "half_b", "Individuální trénink", "technika · polovina B", "training"),
        makeEvent(anchor, 2, "18:00", "20:00", "field", "full", "A tým", "trénink · celé hřiště", "match"),

        makeEvent(anchor, 3, "17:00", "18:30", "field", "full", "Dorost", "trénink · celé hřiště", "training"),
        makeEvent(anchor, 3, "19:00", "22:00", "clubhouse", "full", "Schůze výboru", "hospoda", "clubhouse"),

        makeEvent(anchor, 4, "18:00", "19:30", "field", "full", "B tým", "trénink · celé hřiště", "training"),
        makeEvent(anchor, 4, "20:00", "23:00", "clubhouse", "full", "Soukromá akce", "hospoda", "clubhouse"),

        makeEvent(anchor, 5, "10:00", "12:00", "field", "full", "Mistrovské utkání", "celé hřiště", "match"),
        makeEvent(anchor, 5, "15:00", "17:00", "field", "full", "Pronájem hřiště", "firemní fotbálek", "rental"),
        makeEvent(anchor, 5, "18:00", "23:00", "clubhouse", "full", "Oslava", "hospoda", "clubhouse"),

        makeEvent(anchor, 6, "10:30", "12:00", "field", "half_b", "Volný trénink", "polovina B", "rental")
      );
    }
    return events;
  }

  var EVENTS = demoEvents();

  function eventsForDay(date, facility) {
    return EVENTS.filter(function (event) {
      return event.date === date && event.facility === facility;
    }).sort(function (a, b) {
      return minutes(a.from) - minutes(b.from);
    });
  }

  function eventsInSlot(date, from, to, facility) {
    return eventsForDay(date, facility).filter(function (event) {
      return minutes(event.from) < to && minutes(event.to) > from;
    });
  }

  function eventById(id) {
    return EVENTS.find(function (event) { return event.id === id; }) || null;
  }

  function nowMinutes() {
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function activeNow(facility) {
    var today = iso(new Date());
    var now = nowMinutes();
    return eventsForDay(today, facility).find(function (event) {
      return minutes(event.from) <= now && minutes(event.to) >= now;
    }) || null;
  }

  function freeCapacity(date, facility) {
    var units = facility === "field" ? 2 : 1;
    var occupied = 0;
    eventsForDay(date, facility).forEach(function (event) {
      var from = Math.max(minutes(event.from), RANGE_START);
      var to = Math.min(minutes(event.to), RANGE_END);
      var laneUnits = facility === "field" && event.lane === "full" ? 2 : 1;
      occupied += Math.max(0, to - from) * laneUnits;
    });
    return Math.max(0, (TOTAL * units) - occupied);
  }

  function formatDuration(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (!h) return m + " min";
    return m ? h + " h " + m + " min" : h + " h";
  }

  function resetSelection(keepDay) {
    state.selectedStart = null;
    state.selectedEnd = null;
    state.selectedEventId = null;
    if (!keepDay) state.selectedDate = iso(new Date());
  }

  function selectedPeriodLabel() {
    var selected = parseIso(state.selectedDate);
    if (state.view === "day") return fullDate(state.selectedDate);
    if (state.view === "month") return MONTHS_TITLE[selected.getMonth()] + " " + selected.getFullYear();
    var start = startOfWeek(selected);
    var end = addDays(start, 6);
    return "Týden " + shortDate(iso(start)) + " - " + shortDate(iso(end));
  }

  function renderStatus() {
    var rangeLabel = $("fieldRangeLabel");
    if (rangeLabel) rangeLabel.textContent = selectedPeriodLabel();
    document.body.dataset.facility = state.facility;
  }

  function renderSegments() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-field-facility]"), function (button) {
      button.classList.toggle("active", button.dataset.fieldFacility === state.facility);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-field-view]"), function (button) {
      button.classList.toggle("active", button.dataset.fieldView === state.view);
    });
  }

  function renderWeek() {
    var base = startOfWeek(parseIso(state.selectedDate));
    var html = '<div class="field-week-view"><div class="field-week-grid">';
    html += '<div class="field-week-corner"></div>';

    for (var day = 0; day < 7; day += 1) {
      var date = addDays(base, day);
      var value = iso(date);
      html += '<div class="field-week-day' + (isToday(value) ? " today" : "") + '">' +
        '<strong>' + esc(WEEK_DAYS[day]) + '</strong>' +
        '<span>' + esc(date.getDate()) + '</span>' +
        '</div>';
    }

    for (var hour = RANGE_START; hour < RANGE_END; hour += 60) {
      html += '<div class="field-week-time">' + esc(fromMinutes(hour)) + '</div>';
      for (var i = 0; i < 7; i += 1) {
        var cellDate = iso(addDays(base, i));
        var list = eventsInSlot(cellDate, hour, hour + 60, state.facility);
        var selected = state.selectedDate === cellDate && state.selectedStart === hour && !state.selectedEventId;
        var classes = ["field-week-cell"];
        if (list.length) classes.push("occupied");
        if (selected) classes.push("selected");
        if (state.facility === "clubhouse") classes.push("clubhouse");
        if (list.some(function (event) { return event.type === "rental"; })) classes.push("rental");

        var label = list.length
          ? list.map(function (event) { return event.title + " " + timeLabel(event.from, event.to); }).join(", ")
          : "Volno";

        html += '<button type="button" class="' + esc(classes.join(" ")) + '" data-field-date="' + esc(cellDate) + '" data-field-hour="' + esc(hour) + '" title="' + esc(label) + '" aria-label="' + esc(fromMinutes(hour) + ", " + longDate(cellDate) + ": " + label) + '">';
        if (list.length) {
          if (state.facility === "clubhouse") {
            html += '<span class="field-cell-full"></span><span class="field-cell-count">' + esc(list.length) + '</span>';
          } else if (list.some(function (event) { return event.lane === "full"; })) {
            html += '<span class="field-cell-full"></span><span class="field-cell-count">' + esc(list.length) + '</span>';
          } else {
            var a = list.find(function (event) { return event.lane === "half_a"; });
            var b = list.find(function (event) { return event.lane === "half_b"; });
            html += '<span class="field-cell-halves">' +
              '<span class="field-cell-half' + (a ? " occupied " + esc(eventClass(a)) : "") + '"></span>' +
              '<span class="field-cell-half' + (b ? " occupied " + esc(eventClass(b)) : "") + '"></span>' +
              '</span>';
          }
        }
        html += '</button>';
      }
    }

    html += '</div></div>';
    $("fieldCalendar").innerHTML = html;
  }

  function renderMonth() {
    var selected = parseIso(state.selectedDate);
    var year = selected.getFullYear();
    var month = selected.getMonth();
    var first = new Date(year, month, 1);
    var firstPad = (first.getDay() + 6) % 7;
    var totalDays = daysInMonth(year, month);
    var html = '<div class="field-month-view">';

    html += '<div class="field-month-weekdays">' + WEEK_DAYS.map(function (day) {
      return '<span>' + esc(day) + '</span>';
    }).join("") + '</div><div class="field-month-grid">';

    for (var padIndex = 0; padIndex < firstPad; padIndex += 1) {
      html += '<div class="field-month-pad" aria-hidden="true"></div>';
    }

    for (var day = 1; day <= totalDays; day += 1) {
      var value = iso(new Date(year, month, day));
      var list = eventsForDay(value, state.facility);
      var classes = ["field-month-day"];
      if (list.length) classes.push("occupied");
      if (state.facility === "clubhouse") classes.push("clubhouse");
      if (isToday(value)) classes.push("today");
      if (value === state.selectedDate && !state.selectedStart && !state.selectedEventId) classes.push("selected");

      var typeDots = list.slice(0, 4).map(function (event) {
        return '<i class="field-month-dot ' + esc(eventClass(event)) + '"></i>';
      }).join("");

      html += '<button type="button" class="' + esc(classes.join(" ")) + '" data-field-date="' + esc(value) + '" title="' + esc(blockLabel(list.length)) + '">' +
        '<span class="field-month-num">' + esc(day) + '</span>' +
        '<span class="field-month-meta">' + typeDots + '</span>' +
        '<span class="field-month-count">' + esc(blockLabel(list.length)) + '</span>' +
        '</button>';
    }

    html += '</div></div>';
    $("fieldCalendar").innerHTML = html;
  }

  function laneStyle(event) {
    if (state.facility === "clubhouse") return { left: 2, width: 96 };
    if (event.lane === "half_a") return { left: 2, width: 47 };
    if (event.lane === "half_b") return { left: 51, width: 47 };
    return { left: 2, width: 96 };
  }

  function renderDay() {
    var list = eventsForDay(state.selectedDate, state.facility);
    var html = '<div class="field-day-view"><div class="field-day-timeline">';
    html += '<div class="field-day-hours">';
    for (var hour = RANGE_START; hour <= RANGE_END; hour += 60) {
      var top = ((hour - RANGE_START) / TOTAL) * 100;
      html += '<span class="field-day-hour" style="top:' + top + '%">' + esc(fromMinutes(hour)) + '</span>';
    }
    html += '</div><div class="field-day-lanes">';

    if (state.facility === "field") {
      html += '<span class="field-lane-head" style="left:2%;width:47%">Polovina A</span><span class="field-lane-head" style="left:51%;width:47%">Polovina B</span>';
    } else {
      html += '<span class="field-lane-head" style="left:2%;width:96%">Hospoda</span>';
    }

    for (var lineHour = RANGE_START; lineHour <= RANGE_END; lineHour += 60) {
      var lineTop = ((lineHour - RANGE_START) / TOTAL) * 100;
      html += '<span class="field-hour-line" style="top:' + lineTop + '%"></span>';
    }

    list.forEach(function (event, index) {
      var from = Math.max(minutes(event.from), RANGE_START);
      var to = Math.min(minutes(event.to), RANGE_END);
      var top = ((from - RANGE_START) / TOTAL) * 100;
      var height = Math.max(7.8, ((to - from) / TOTAL) * 100);
      var lane = laneStyle(event);
      var selected = state.selectedEventId === event.id;
      html += '<button type="button" class="field-event ' + esc(eventClass(event)) + (selected ? " selected" : "") + '" data-field-event="' + esc(event.id) + '" data-field-date="' + esc(event.date) + '" style="left:' + lane.left + '%;width:' + lane.width + '%;top:' + top + '%;height:' + height + '%;animation-delay:' + (index * .04) + 's">' +
        '<strong class="field-event-title">' + esc(event.title) + '</strong>' +
        '<span class="field-event-time">' + esc(timeLabel(event.from, event.to)) + '</span>' +
        '<span class="field-event-sub">' + esc(event.sub) + '</span>' +
        (event.lights ? '<span class="field-light">Světla</span>' : '') +
        '</button>';
    });

    if (!list.length) {
      html += '<div class="field-empty" style="position:absolute;inset:18px;display:flex;align-items:center;justify-content:center">Celý vybraný den je v demu volný.</div>';
    }

    html += '</div></div></div>';
    $("fieldCalendar").innerHTML = html;
  }

  function renderCalendar() {
    if (state.view === "month") {
      renderMonth();
      return;
    }
    if (state.view === "day") {
      renderDay();
      return;
    }
    renderWeek();
  }

  function detailList() {
    if (state.selectedEventId) {
      var selectedEvent = eventById(state.selectedEventId);
      return selectedEvent ? [selectedEvent] : [];
    }
    if (state.selectedStart != null && state.selectedEnd != null) {
      return eventsInSlot(state.selectedDate, state.selectedStart, state.selectedEnd, state.facility);
    }
    return eventsForDay(state.selectedDate, state.facility);
  }

  function renderDetail() {
    var list = detailList();
    var title = longDate(state.selectedDate);
    var summary = "";

    if (state.selectedEventId && list[0]) {
      summary = list[0].title + " · " + timeLabel(list[0].from, list[0].to);
    } else if (state.selectedStart != null && state.selectedEnd != null) {
      summary = fromMinutes(state.selectedStart) + " - " + fromMinutes(state.selectedEnd) + " · " + blockLabel(list.length);
    } else {
      summary = facilityLabel() + " · " + blockLabel(list.length);
    }

    $("fieldDetailTitle").textContent = title;
    $("fieldDetailSummary").textContent = summary;

    if (!list.length) {
      $("fieldSelectedDetail").innerHTML = '<div class="field-empty">V tomto čase je volno.</div>';
      return;
    }

    $("fieldSelectedDetail").innerHTML = list.map(function (event) {
      return '<article class="field-detail-card ' + esc(eventClass(event)) + '">' +
        '<strong>' + esc(event.title) + '</strong>' +
        '<span>' + esc(timeLabel(event.from, event.to)) + ' · ' + esc(laneLabel(event)) + '</span>' +
        '<span>' + esc(event.sub) + '</span>' +
        '<span class="field-detail-tag">' + esc(event.facility === "clubhouse" ? "Hospoda" : event.type === "rental" ? "Pronájem" : "Klub") + (event.lights ? " · světla" : "") + '</span>' +
        '</article>';
    }).join("");
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
    box.innerHTML = "Demo žádost: " + esc(state.pending.name) + " · " + esc(state.pending.place) + " · " + esc(state.pending.date) + " · " + esc(state.pending.from) + " - " + esc(state.pending.to) + ". Po napojení se tohle bude odesílat správci.";
  }

  function render() {
    renderSegments();
    renderStatus();
    renderCalendar();
    renderDetail();
    renderRequestDate();
    renderPending();
  }

  function movePeriod(direction) {
    var d = parseIso(state.selectedDate);
    if (state.view === "month") {
      var currentDay = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + direction);
      d.setDate(Math.min(currentDay, daysInMonth(d.getFullYear(), d.getMonth())));
    } else if (state.view === "day") {
      d.setDate(d.getDate() + direction);
    } else {
      d.setDate(d.getDate() + direction * 7);
    }
    state.selectedDate = iso(d);
    resetSelection(true);
    render();
  }

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-field-facility]"), function (button) {
      button.addEventListener("click", function () {
        state.facility = button.dataset.fieldFacility;
        resetSelection(true);
        render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-field-view]"), function (button) {
      button.addEventListener("click", function () {
        state.view = button.dataset.fieldView;
        resetSelection(true);
        render();
      });
    });

    $("fieldCalendar").addEventListener("click", function (event) {
      var eventButton = event.target.closest("[data-field-event]");
      if (eventButton) {
        state.selectedEventId = eventButton.dataset.fieldEvent;
        state.selectedDate = eventButton.dataset.fieldDate || state.selectedDate;
        state.selectedStart = null;
        state.selectedEnd = null;
        render();
        return;
      }

      var button = event.target.closest("[data-field-date]");
      if (!button) return;
      state.selectedDate = button.dataset.fieldDate;
      state.selectedEventId = null;

      if (button.dataset.fieldHour != null) {
        state.selectedStart = Number(button.dataset.fieldHour);
        state.selectedEnd = state.selectedStart + 60;
      } else {
        state.selectedStart = null;
        state.selectedEnd = null;
      }
      render();
    });

    $("fieldPrev").addEventListener("click", function () { movePeriod(-1); });
    $("fieldNext").addEventListener("click", function () { movePeriod(1); });

    $("fieldToday").addEventListener("click", function () {
      state.selectedDate = iso(new Date());
      resetSelection(true);
      render();
    });

    $("requestDate").addEventListener("change", function (event) {
      state.selectedDate = event.target.value || state.selectedDate;
      resetSelection(true);
      render();
    });

    $("fieldDemoForm").addEventListener("submit", function (event) {
      event.preventDefault();
      state.pending = {
        name: $("requestName").value || "Bez jména",
        place: $("requestPlace").value || facilityLabel(),
        date: $("requestDate").value || state.selectedDate,
        from: $("requestFrom").value,
        to: $("requestTo").value
      };
      renderPending();
    });
  }

  function applyInitialParams() {
    var search = window.location && window.location.search ? window.location.search : "";
    if (!search) return;
    var params = new URLSearchParams(search);
    var view = params.get("view");
    var facility = params.get("facility");
    var date = params.get("date");
    if (["week", "month", "day"].indexOf(view) !== -1) state.view = view;
    if (["field", "clubhouse"].indexOf(facility) !== -1) state.facility = facility;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) state.selectedDate = date;
  }

  function init() {
    state.selectedDate = iso(new Date());
    applyInitialParams();
    bind();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
