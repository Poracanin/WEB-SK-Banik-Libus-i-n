/* ============================================================
   SK Baník Libušín — domovská stránka (logika)
   Data:
     - zápasy/výsledky: skbaniklibusin_fotbalcz_vysledky_tabulky.json
     - články:          skbaniklibusin_clanky.json
   ============================================================ */
(function () {
  "use strict";

  var CLUB_LOGO = "https://skbaniklibusin.cz/wp-content/uploads/2025/10/cropped-SKBL-2026.png";
  var FALLBACK_LOGO = "https://skbaniklibusin.cz/wp-content/uploads/2025/10/Navrh-bez-nazvu-1.png";

  // Loga soupeřů (průhledné PNG ve složce "loga tymu/").
  // Klíč = normalizovaný název týmu (viz norm()), hodnota = soubor loga.
  var LOGO_DIR = "loga tymu/";
  var TEAM_LOGOS = {
    "afk bratronice": "afkbratronice.png",
    "afk lodenice": "atletickofotbalovyklublodenice.png",
    "banik lubna": "tjbaniklubna.png",
    "cesky lev - union beroun / tj unhost b": "ceskylevunionberoun.png",
    "cesky lev - union beroun b": "ceskylevunionberoun.png",
    "clu beroun": "ceskylevunionberoun.png",
    "fc cechie velka dobra": "fccechievelkadobra.png",
    'fc cechie velka dobra "b"': "fccechievelkadobra.png",
    "fk hredle": "fkhredle.png",
    "fk jinocany": "fkjinocany.png",
    "fk kraluv dvur b": "fotbalovyklubkraluvdvur.png",
    "fk slavoj kladno": "fotbalovyklubslavojkladno.png",
    "fk slovan kladno": "fkslovankladno.png",
    "fk spartak zebrak": "fotbalovyklubspartakzebrak.png",
    'fotbalovy klub slavoj kladno "b"': "fotbalovyklubslavojkladno.png",
    "msec - nove straseci": "tjsokolmsecnovestraseci.png",
    "msk klecany 1921": "mskklecany1921.png",
    "sk braskov": "skbraskov.png",
    'sk braskov "b"': "skbraskov.png",
    "sk cembrit beroun - zavodi": "skcembritberounzavodi.png",
    'sk doksy "b"': "skdoksy.png",
    "sk kamenne zehrovice": "skkamennezehrovice.png",
    "sk krocehlavy": "skkrocehlavy.png",
    "sk lany": "sportovniklublany.png",
    "sk pavlikov": "skpavlikov.png",
    "sk senomaty": "sksenomaty.png",
    "sk slatina/holubice": "skslatina.png",
    "sk slavoj pozden/zichovec": "skslavojpozden.png",
    "sk slovan dubi": "skslovandubi.png",
    "sk stehelceves": "sportovniklubstehelceves.png",
    "sk tlustice": "sportovniklubtlustice.png",
    'slavoj chrastany "a"': "slavojchrastany.png",
    'slavoj chrastany "b"': "slavojchrastany.png",
    "slovan velvary b": "telovychovnajednotaslovanvelvary.png",
    "sokol jedomelice": "sokoljedomelice.png",
    "sportovni klub lany": "sportovniklublany.png",
    "telovychovna jednota sokol lidice": "telovychovnajednotasokollidice.png",
    "tj aero odolena voda": "tjaeroodolenavoda.png",
    "tj banik stochov": "tjbanikstochov.png",
    "tj banik svermov / fk brandysek": "telovychovnajednotabaniksvermov.png",
    "tj meteor pleteny ujezd": "tjmeteorpletenyujezd.png",
    "tj sk hrebec": "telovychovnajednotasportovniklubhrebec.png",
    "tj slovan velvary b": "telovychovnajednotaslovanvelvary.png",
    "tj sokol hrdliv": "tjsokolhrdliv.png",
    "tj sokol nove straseci": "tjsokolnovestraseci.png",
    "tj sokol nove straseci/msec": "tjsokolmsecnovestraseci.png",
    "tj sokol vrany": "telovychovnajednotasokolvrany.png",
    "tj unhost": "tjunhost.png",
    "union cerhovice": "unioncerhovice.png",
    "vsenorsky sk": "vsenorskysk.png"
  };

  var MATCHES_URL = "skbaniklibusin_fotbalcz_vysledky_tabulky.json";
  var ARTICLES_URL = "skbaniklibusin_clanky.json";
  var PUBLIC_ARTICLES_URL = (window.location.port === "8090" ? "" : "http://localhost:8090") + "/api/public/articles";

  var TEAM_LABELS = { a: "A tým", b: "B tým", dorost: "Dorost" };
  var TEAM_BADGES = { a: "Muži A", b: "Muži B", dorost: "Mládež" };
  var TEAM_ORDER = ["a", "b", "dorost"];

  var DAYS_FULL = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
  var DAYS_SHORT = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  var MONTHS_GEN = ["ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince"];

  var state = {
    selectedTeam: "a",
    flipDeg: 0,
    now: Date.now(),
    matches: [],   // budoucí zápasy (všechny týmy)
    results: [],   // odehrané zápasy (všechny týmy)
    articles: [],
    loaded: false,
    dataNote: ""
  };

  /* ---------------- utility ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function norm(v) {
    return String(v || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim();
  }
  function isOurTeam(name) { return norm(name).indexOf("libusin") !== -1; }
  function localLogo(name) {
    var file = TEAM_LOGOS[norm(name)];
    return file ? encodeURI(LOGO_DIR + file) : null;
  }
  function logoFor(name) {
    if (isOurTeam(name)) return CLUB_LOGO;
    return localLogo(name) || FALLBACK_LOGO;
  }

  /* ---------------- data parsing ---------------- */
  var SEASON_TEAM_KEYS = { a_tym: "a", b_tym: "b", dorost: "dorost" };

  function collectSeason(season) {
    var out = [];
    if (!season) return out;
    Object.keys(SEASON_TEAM_KEYS).forEach(function (srcKey) {
      var teamKey = SEASON_TEAM_KEYS[srcKey];
      var block = season[srcKey];
      if (!block || block.available === false || !block.schedule) return;
      var comp = block.tournament ? (block.tournament.competition_name || "") : "";
      var list = block.schedule.all_matches || [];
      list.forEach(function (m) {
        if (!isOurTeam(m.home_team) && !isOurTeam(m.away_team)) return;
        out.push(normalizeMatch(m, teamKey, comp));
      });
    });
    return out;
  }

  function normalizeMatch(m, teamKey, comp) {
    var dt = m.datetime_local ? new Date(m.datetime_local) : null;
    if (dt && isNaN(dt.getTime())) dt = null;
    var played = m.score != null && m.home_goals != null && m.away_goals != null;
    return {
      teamKey: teamKey,
      home: m.home_team || "",
      away: m.away_team || "",
      dt: dt,
      venue: (m.details && (m.details["Hřiště"] || m.details["Hriste"])) || "",
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      score: m.score,
      round: m.round || "",
      competition: comp,
      played: played
    };
  }

  function ingestMatchesJson(json) {
    var all = [];
    if (json && json.previous_season) all = all.concat(collectSeason(json.previous_season));
    if (json && json.current_season) all = all.concat(collectSeason(json.current_season));

    // de-duplikace (stejný zápas může být ve více blocích)
    var seen = {};
    all = all.filter(function (x) {
      var k = x.teamKey + "|" + norm(x.home) + "|" + norm(x.away) + "|" + (x.dt ? x.dt.getTime() : "?");
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });

    state.matches = all.filter(function (x) { return !x.played; });
    state.results = all.filter(function (x) { return x.played; })
      .sort(function (a, b) { return (b.dt ? b.dt.getTime() : 0) - (a.dt ? a.dt.getTime() : 0); });
  }

  function ingestArticles(json) {
    var arr = (json && json.articles) || [];
    return arr.map(function (p, index) {
      var img = "";
      if (p.featured_image) {
        img = typeof p.featured_image === "string"
          ? p.featured_image
          : (p.featured_image.url || p.featured_image.source_url || "");
      }
      var content = plainText(p.content_text || "");
      var excerpt = cleanLine(p.excerpt_text || firstExcerpt(content));
      return {
        id: String(p.id || p.slug || ("article-" + index)),
        link: p.link || "https://skbaniklibusin.cz/",
        date: p.date_created || p.date || "",
        title: p.title || "",
        excerpt: excerpt,
        image: img,
        contentText: content,
        summary: articleSummary(p.title || "", content)
      };
    });
  }

  function plainText(value) {
    return String(value || "").replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  }
  function cleanLine(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  function firstExcerpt(text) {
    var s = cleanLine(text);
    return s.length > 210 ? s.slice(0, 210).replace(/\s+\S*$/, "") + "…" : s;
  }
  function articleSummary(title, content) {
    var lines = plainText(content).split("\n").map(cleanLine).filter(Boolean);
    var goalsLine = firstMatchingLine(lines, /^(branky|g[oó]ly|branka)\s*:/i);
    var lineupLine = firstMatchingLine(lines, /^sestava\s*:/i);
    var score = scoreFromTitle(title);
    var goals = labelValue(goalsLine);
    var lineup = labelValue(lineupLine);
    return {
      score: score,
      goals: goals,
      goalsLine: goalsLine,
      lineup: lineup,
      lineupLine: lineupLine,
      hasMatchInfo: Boolean(score || goals || lineup)
    };
  }
  function firstMatchingLine(lines, pattern) {
    for (var i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) return lines[i];
    }
    return "";
  }
  function labelValue(line) {
    return cleanLine(String(line || "").replace(/^[^:]+:\s*/, ""));
  }
  function scoreFromTitle(title) {
    var m = cleanLine(title).match(/^(.*?)\s+(\d+)\s*:\s*(\d+)(?:\s*\(([^)]*)\))?\s*$/);
    if (!m) return null;
    var teams = teamsFromTitle(m[1]);
    return {
      home: teams.home,
      away: teams.away,
      homeGoals: m[2],
      awayGoals: m[3],
      halftime: m[4] || ""
    };
  }
  function teamsFromTitle(value) {
    var text = cleanLine(value);
    var club = /SK\s+Ban[ií]k\s+Libu[sš][ií]n/i.exec(text);
    if (club) {
      if (club.index === 0) {
        return {
          home: club[0],
          away: cleanLine(text.slice(club.index + club[0].length).replace(/^\s*[–—-]\s*/, ""))
        };
      }
      return {
        home: cleanLine(text.slice(0, club.index).replace(/\s*[–—-]\s*$/, "")),
        away: club[0]
      };
    }
    var parts = text.split(/\s+[–—]\s+/);
    return {
      home: parts[0] || text,
      away: parts.length > 1 ? parts.slice(1).join(" – ") : ""
    };
  }

  /* ---------------- date / countdown helpers ---------------- */
  function fmtMatchDate(dt) {
    if (!dt) return "";
    var now = new Date();
    var sameDay = dt.toDateString() === now.toDateString();
    var time = pad(dt.getHours()) + ":" + pad(dt.getMinutes());
    var playing = now >= dt && (now - dt) < 2 * 3600e3;
    if (playing) return "Právě se hraje";
    if (sameDay) return "Dnes · " + time;
    return DAYS_FULL[dt.getDay()] + " " + dt.getDate() + ". " + (dt.getMonth() + 1) + ". · " + time;
  }
  function fmtShortDate(dt) {
    if (!dt) return "";
    return DAYS_SHORT[dt.getDay()] + " " + dt.getDate() + "." + (dt.getMonth() + 1) + ".";
  }
  function fmtArticleDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getDate() + ". " + MONTHS_GEN[d.getMonth()] + " " + d.getFullYear();
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  function nextFor(key) {
    var now = new Date();
    var list = state.matches
      .filter(function (m) { return m.teamKey === key && m.dt; })
      .filter(function (m) { return m.dt > now || (now - m.dt) < 2 * 3600e3; })
      .sort(function (a, b) { return a.dt - b.dt; });
    return list.length ? list[0] : null;
  }
  function resultsFor(key, limit) {
    return state.results.filter(function (r) { return r.teamKey === key; }).slice(0, limit || 4);
  }
  function outcome(r) {
    var isHome = isOurTeam(r.home);
    var us = isHome ? Number(r.homeGoals) : Number(r.awayGoals);
    var them = isHome ? Number(r.awayGoals) : Number(r.homeGoals);
    if (isNaN(us) || isNaN(them)) return { label: "", accent: "#a1a1a6", accentLight: "#6e6e73", bg: "#f5f5f7", border: "rgba(0,0,0,.06)" };
    if (us > them) return { label: "Výhra", accent: "#34d399", accentLight: "#059669", bg: "rgba(5,150,105,.06)", border: "rgba(5,150,105,.25)" };
    if (us < them) return { label: "Prohra", accent: "#f87171", accentLight: "#DC2626", bg: "rgba(220,38,38,.05)", border: "rgba(220,38,38,.22)" };
    return { label: "Remíza", accent: "#a1a1a6", accentLight: "#6e6e73", bg: "#f5f5f7", border: "rgba(0,0,0,.06)" };
  }

  /* ---------------- render: team tabs ---------------- */
  function renderTabs() {
    var wrap = $("teamTabs");
    wrap.innerHTML = TEAM_ORDER.map(function (k) {
      return '<button type="button" class="team-tab' + (k === state.selectedTeam ? " active" : "") +
        '" data-team="' + k + '">' + esc(TEAM_LABELS[k]) + "</button>";
    }).join("");
    Array.prototype.forEach.call(wrap.querySelectorAll(".team-tab"), function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-team");
        if (k === state.selectedTeam) return;
        state.selectedTeam = k;
        renderTabs();
        renderHeroFront();
        renderHeroBack();
        renderTeams();
      });
    });
  }

  /* ---------------- render: hero front (next match) ---------------- */
  function renderHeroFront() {
    var el = $("flipFront");
    var sel = state.selectedTeam;
    var selLabel = TEAM_LABELS[sel];
    var m = nextFor(sel);

    if (!m) {
      el.innerHTML = '<div class="flip-loading">' +
        (state.loaded ? "Momentálně není naplánován žádný zápas." : "Načítám nejbližší zápas…") +
        "</div>";
      return;
    }

    var html = "";
    html += '<div class="match-badge-row"><span class="match-badge"><span class="dot"></span>Nejbližší zápas · ' + esc(selLabel) + "</span></div>";

    html += '<div class="countdown" id="countdown">' + countdownCells(m) + "</div>";

    html += '<div class="vs-wrap">';
    html += '<div class="vs-watermark">VS</div>';
    html += '<div class="vs-teams">';
    html += '<div class="vs-team home"><img src="' + esc(logoFor(m.home)) + '" loading="lazy" alt="" draggable="false"><span class="vs-team-name">' + esc(m.home) + "</span></div>";
    html += '<div class="vs-team away"><img src="' + esc(logoFor(m.away)) + '" loading="lazy" alt="" draggable="false"><span class="vs-team-name">' + esc(m.away) + "</span></div>";
    html += "</div></div>";

    html += '<div class="match-meta">';
    html += '<span class="date">' + esc(fmtMatchDate(m.dt)) + "</span>";
    if (m.venue) {
      html += '<span class="place"><svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path></svg><span>' + esc(m.venue) + "</span></span>";
    }
    html += '<span class="type">' + esc(m.round || "Mistrovské utkání") + "</span>";
    html += "</div>";

    el.innerHTML = html;
  }

  function countdownCells(m) {
    var cd = computeCountdown(m);
    if (!cd) return "";
    return cell(cd.d, "dní") + cell(cd.h, "hod") + cell(cd.m, "min") + cell(cd.s, "sek", true);
  }
  function cell(num, label, isSec) {
    return '<span class="countdown-cell"><span class="countdown-num' + (isSec ? " sec" : "") +
      '">' + esc(num) + '</span><span class="countdown-lbl">' + label + "</span></span>";
  }
  function computeCountdown(m) {
    if (!m || !m.dt) return null;
    var diff = Math.max(0, m.dt.getTime() - state.now);
    var dd = Math.floor(diff / 864e5); diff -= dd * 864e5;
    var h = Math.floor(diff / 36e5); diff -= h * 36e5;
    var mm = Math.floor(diff / 6e4); diff -= mm * 6e4;
    var s = Math.floor(diff / 1e3);
    return { d: String(dd), h: pad(h), m: pad(mm), s: pad(s) };
  }
  function tickCountdown() {
    state.now = Date.now();
    var box = $("countdown");
    if (!box) return;
    var m = nextFor(state.selectedTeam);
    var cd = computeCountdown(m);
    if (!cd) return;
    var nums = box.querySelectorAll(".countdown-num");
    if (nums.length === 4) {
      nums[0].textContent = cd.d;
      nums[1].textContent = cd.h;
      nums[2].textContent = cd.m;
      nums[3].textContent = cd.s;
    }
  }

  /* ---------------- render: hero back (last results) ---------------- */
  function renderHeroBack() {
    var el = $("flipBack");
    var sel = state.selectedTeam;
    var selLabel = TEAM_LABELS[sel];
    var rows = resultsFor(sel, 4);

    var html = '<div class="back-head"><span class="back-badge">Poslední výsledky · ' + esc(selLabel) + "</span></div>";

    if (!rows.length) {
      html += '<div class="back-empty">Zatím žádné výsledky</div>';
      el.innerHTML = html;
      return;
    }

    html += '<div class="back-list">';
    rows.forEach(function (r) {
      var o = outcome(r);
      html += '<div class="back-row">' +
        '<span class="rdot" style="background:' + o.accent + '"></span>' +
        '<div class="rinfo"><div class="rteams">' + esc(r.home) + " — " + esc(r.away) + "</div>" +
        '<div class="rmeta">' + esc(fmtShortDate(r.dt)) + "</div></div>" +
        '<span class="rscore">' + esc(r.homeGoals + " : " + r.awayGoals) + "</span>" +
        "</div>";
    });
    html += "</div>";
    el.innerHTML = html;
  }

  /* ---------------- render: další týmy ---------------- */
  function renderTeams() {
    var grid = $("teamsGrid");
    var others = TEAM_ORDER.filter(function (k) { return k !== state.selectedTeam; });
    grid.innerHTML = others.map(function (k) {
      var m = nextFor(k);
      var head = '<div class="team-card-head"><span class="label"><span class="dot"></span>' +
        '<span class="name">' + esc(TEAM_LABELS[k]) + "</span></span>" +
        '<span class="badge">' + esc(TEAM_BADGES[k]) + "</span></div>";

      var body;
      if (m) {
        body = '<div class="team-card-body">' +
          '<div class="team-match">' +
          '<div class="side"><img src="' + esc(logoFor(m.home)) + '" loading="lazy" alt=""><span class="name">' + esc(m.home) + "</span></div>" +
          '<span class="vs">VS</span>' +
          '<div class="side"><img src="' + esc(logoFor(m.away)) + '" loading="lazy" alt=""><span class="name">' + esc(m.away) + "</span></div>" +
          "</div>" +
          '<div class="team-tags">' +
          '<span class="team-tag date"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="3"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>' + esc(fmtMatchDate(m.dt)) + "</span>" +
          (m.venue ? '<span class="team-tag place"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path></svg>' + esc(m.venue) + "</span>" : "") +
          "</div></div>";
      } else {
        body = '<div class="team-card-body"><div class="team-empty">' +
          (state.loaded ? "Žádný naplánovaný zápas" : "Načítám…") + "</div></div>";
      }
      return '<div class="team-card" data-reveal>' + head + body + "</div>";
    }).join("");
    observeReveals();
  }

  /* ---------------- render: výsledky strip ---------------- */
  function renderResults() {
    var strip = $("resultsStrip");
    var list = state.results.slice(0, 8);
    if (!list.length) {
      strip.innerHTML = '<div class="team-empty" style="padding:30px 4px">' +
        (state.loaded ? "Zatím žádné výsledky" : "Načítám…") + "</div>";
      return;
    }
    strip.innerHTML = list.map(function (r) {
      var o = outcome(r);
      var meta = fmtShortDate(r.dt) + (r.competition ? " · " + shortComp(r.competition) : "");
      return '<div class="result-card">' +
        '<div class="result-top">' +
        '<span class="result-outcome" style="color:' + o.accentLight + ';background:' + o.bg + ';border:1px solid ' + o.border + '">' + esc(o.label) + "</span>" +
        '<span class="result-meta">' + esc(meta) + "</span></div>" +
        '<div class="result-teams">' +
        '<div class="side"><img src="' + esc(logoFor(r.home)) + '" loading="lazy" alt=""><span class="name">' + esc(r.home) + "</span></div>" +
        '<span class="result-score">' + esc(r.homeGoals) + " : " + esc(r.awayGoals) + "</span>" +
        '<div class="side"><img src="' + esc(logoFor(r.away)) + '" loading="lazy" alt=""><span class="name">' + esc(r.away) + "</span></div>" +
        "</div></div>";
    }).join("");
  }

  function shortComp(name) {
    var s = String(name || "");
    var m = s.match(/^(\d+\.\s*liga(?:\s*dorostu)?)/i);
    return m ? m[1] : s;
  }

  /* ---------------- render: aktuality ---------------- */
  function renderNews(posts) {
    var grid = $("newsGrid");
    var count = $("articleCount");
    if (count) count.textContent = posts.length ? posts.length + " článků v přehledu" : "Žádné články";
    if (!posts.length) {
      grid.innerHTML = '<div class="team-empty">Zatím žádné články</div>';
      return;
    }
    grid.innerHTML = posts.map(function (p) {
      var thumb = p.image
        ? '<div class="news-thumb"><img src="' + esc(p.image) + '" loading="lazy" alt=""></div>'
        : "";
      return '<a href="clanek.html?id=' + encodeURIComponent(p.id) + '" class="news-card ' +
        (p.image ? "has-image" : "no-image") + '" data-article-id="' + esc(p.id) +
        '" data-reveal aria-label="Otevřít článek ' + esc(p.title) + '">' +
        thumb +
        '<div class="news-body">' +
        '<span class="news-date">' + esc(fmtArticleDate(p.date)) + "</span>" +
        '<span class="news-title">' + esc(p.title) + "</span>" +
        newsCardSummary(p) +
        '<span class="news-excerpt">' + esc(p.excerpt) + "</span>" +
        '<span class="news-read">Číst článek</span>' +
        "</div></a>";
    }).join("");
    observeReveals();
  }

  function newsCardSummary(p) {
    var s = p.summary || {};
    var html = "";
    if (s.score) {
      html += '<span class="news-result-line"><strong>Výsledek</strong><span>' +
        esc(scoreLabel(s.score)) + "</span></span>";
    }
    if (s.goals) {
      html += '<span class="news-goals-line"><strong>Střelci</strong><span>' +
        esc(s.goals) + "</span></span>";
    }
    return html;
  }

  function scoreLabel(score) {
    if (!score) return "";
    return (score.home ? score.home + " " : "") + score.homeGoals + " : " + score.awayGoals +
      (score.away ? " " + score.away : "");
  }

  /* ---------------- flip card interactions ---------------- */
  var flipEl;
  var drag = { active: false, startX: 0, lastDx: 0 };

  function isFlipped() { return ((state.flipDeg / 180) % 2 + 2) % 2 === 1; }

  function applyFlip(deg, animate) {
    flipEl.style.transition = animate ? "transform .8s cubic-bezier(.22,1,.36,1)" : "none";
    flipEl.style.transform = "rotateY(" + deg + "deg)";
  }
  function syncFaceButtons() {
    var flipped = isFlipped();
    $("faceBtnMatch").classList.toggle("active", !flipped);
    $("faceBtnResults").classList.toggle("active", flipped);
  }

  function onDragStart(e) {
    drag.active = true;
    drag.startX = e.clientX;
    drag.lastDx = 0;
    try { flipEl.setPointerCapture(e.pointerId); } catch (err) {}
    flipEl.style.transition = "none";
    flipEl.style.cursor = "grabbing";
  }
  function onDragMove(e) {
    if (!drag.active) return;
    var dx = e.clientX - drag.startX;
    dx = Math.max(-450, Math.min(450, dx));
    drag.lastDx = dx;
    flipEl.style.transform = "rotateY(" + (state.flipDeg + dx * 0.4) + "deg)";
  }
  function onDragEnd() {
    if (!drag.active) return;
    drag.active = false;
    flipEl.style.cursor = "grab";
    var nd = state.flipDeg;
    if (Math.abs(drag.lastDx) > 70) nd += drag.lastDx > 0 ? 180 : -180;
    state.flipDeg = nd;
    applyFlip(nd, true);
    syncFaceButtons();
  }
  function showMatchFace() { if (isFlipped()) { state.flipDeg += 180; applyFlip(state.flipDeg, true); syncFaceButtons(); } }
  function showResultsFace() { if (!isFlipped()) { state.flipDeg += 180; applyFlip(state.flipDeg, true); syncFaceButtons(); } }

  function setupFlip() {
    flipEl = $("flip");
    flipEl.addEventListener("pointerdown", onDragStart);
    flipEl.addEventListener("pointermove", onDragMove);
    flipEl.addEventListener("pointerup", onDragEnd);
    flipEl.addEventListener("pointercancel", onDragEnd);
    $("faceBtnMatch").addEventListener("click", showMatchFace);
    $("faceBtnResults").addEventListener("click", showResultsFace);
    syncFaceButtons();
  }

  /* ---------------- scroll: pouze pozadí navigace (bez parallax efektu) ---------------- */
  function setupScrollFx() {
    var nav = $("nav");
    function onScroll() {
      nav.classList.toggle("scrolled", window.scrollY > window.innerHeight * 0.7);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- reveal (ihned po načtení, bez čekání na scroll) ---------------- */
  function observeReveals() {
    var list = document.querySelectorAll("[data-reveal]:not(.reveal-in)");
    if (!list.length) return;
    var els = Array.prototype.slice.call(list);
    els.forEach(function (el) { el.classList.add("reveal-hidden"); });
    void document.body.offsetWidth; // vynutí reflow, aby přechod naběhl z výchozího stavu
    setTimeout(function () {
      els.forEach(function (el) {
        el.classList.remove("reveal-hidden");
        el.classList.add("reveal-in");
      });
    }, 40);
  }

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

  /* ---------------- data loading ---------------- */
  function loadJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function loadArticlesData() {
    return loadJson(PUBLIC_ARTICLES_URL).catch(function () {
      return loadJson(ARTICLES_URL);
    });
  }

  function loadData() {
    var pMatches = loadJson(MATCHES_URL).catch(function (e) { console.error("Zápasy se nepodařilo načíst:", e); return null; });
    var pArticles = loadArticlesData().catch(function (e) { console.error("Články se nepodařilo načíst:", e); return null; });

    Promise.all([pMatches, pArticles]).then(function (res) {
      var matchesJson = res[0], articlesJson = res[1];
      if (matchesJson) ingestMatchesJson(matchesJson);
      var posts = articlesJson ? ingestArticles(articlesJson) : [];
      state.articles = posts;

      state.loaded = true;
      if (!matchesJson || !articlesJson) {
        state.dataNote = "Některá data se nepodařilo načíst — otevřete stránku přes webový server (ne přímo ze souboru).";
        var note = $("dataNote");
        note.textContent = state.dataNote;
        note.hidden = false;
      }

      renderHeroFront();
      renderHeroBack();
      renderTeams();
      renderResults();
      renderNews(posts);
      observeReveals();
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    renderTabs();
    setupNav();
    setupFlip();
    setupScrollFx();
    observeReveals();
    loadData();
    setInterval(tickCountdown, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
