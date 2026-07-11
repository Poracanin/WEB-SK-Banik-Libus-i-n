/* ============================================================
   SK Baník Libušín — týmová stránka (data + interakce)
   ============================================================ */
(function () {
  "use strict";

  var CLUB_LOGO = "https://skbaniklibusin.cz/wp-content/uploads/2025/10/cropped-SKBL-2026.png";
  var FALLBACK_LOGO = "https://skbaniklibusin.cz/wp-content/uploads/2025/10/Navrh-bez-nazvu-1.png";
  var LOGO_DIR = "loga tymu/";
  var MATCHES_URL = "skbaniklibusin_fotbalcz_vysledky_tabulky.json";
  var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzVRrvszSSSiBAZONT-KfDBl7ngX9yTbLfNvG9sQFXtgK84CS6OKXBWSxErEtMPR6SuBg/exec";

  var pageData = document.body ? document.body.dataset : {};
  var PAGE = {
    sourceKey: pageData.teamSource || "a_tym",
    sheetTeam: pageData.sheetTeam || "a",
    title: pageData.teamTitle || "A tým",
    titleShort: pageData.teamShort || pageData.teamTitle || "A tým"
  };

  var TEAM_LOGOS = {
    "afk bratronice": "afkbratronice.png",
    "afk lodenice": "atletickofotbalovyklublodenice.png",
    "banik lubna": "tjbaniklubna.png",
    "cesky lev - union beroun / tj unhost b": "ceskylevunionberoun.png",
    "cesky lev - union beroun b": "ceskylevunionberoun.png",
    "clu beroun": "ceskylevunionberoun.png",
    "fc cechie velka dobra": "fccechievelkadobra.png",
    'fc cechie velka dobra "b"': "fccechievelkadobra.png",
    'velka dobra "b"': "fccechievelkadobra.png",
    "fk hredle": "fkhredle.png",
    "fk jinocany": "fkjinocany.png",
    "fk kraluv dvur b": "fotbalovyklubkraluvdvur.png",
    "fk slavoj kladno": "fotbalovyklubslavojkladno.png",
    "fk slovan kladno": "fkslovankladno.png",
    "fk spartak zebrak": "fotbalovyklubspartakzebrak.png",
    'fotbalovy klub slavoj kladno "b"': "fotbalovyklubslavojkladno.png",
    "msec - nove straseci": "tjsokolmsecnovestraseci.png",
    "msec nove straseci": "tjsokolmsecnovestraseci.png",
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

  var MONTHS_SHORT = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
  var DAYS_SHORT = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  var DAYS_FULL = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
  var POSITION_ORDER = ["Brankář", "Obránce", "Záložník", "Útočník"];
  var POSITION_LABELS = {
    "Brankář": "Brankáři",
    "Obránce": "Obránci",
    "Záložník": "Záložníci",
    "Útočník": "Útočníci"
  };

  var state = {
    currentBlock: null,
    previousBlock: null,
    matches: [],
    upcoming: [],
    results: [],
    standings: null,
    roster: [],
    stats: [],
    scheduleLimit: 7,
    resultsLimit: 7
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

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isOurTeam(name) {
    return norm(name).indexOf("libusin") !== -1;
  }

  function logoFor(name) {
    if (isOurTeam(name)) return CLUB_LOGO;
    var file = TEAM_LOGOS[norm(name)];
    return file ? encodeURI(LOGO_DIR + file) : FALLBACK_LOGO;
  }

  function pad(num) {
    return String(num).padStart(2, "0");
  }

  function formatDateParts(dt) {
    if (!dt) return { day: "-", month: "", time: "", line: "" };
    return {
      day: String(dt.getDate()),
      month: MONTHS_SHORT[dt.getMonth()],
      time: pad(dt.getHours()) + ":" + pad(dt.getMinutes()),
      line: DAYS_SHORT[dt.getDay()] + " " + dt.getDate() + ". " + (dt.getMonth() + 1) + "."
    };
  }

  function formatLongDate(dt) {
    if (!dt) return "";
    return DAYS_FULL[dt.getDay()] + " " + dt.getDate() + ". " + (dt.getMonth() + 1) + ". " + dt.getFullYear() + " · " + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
  }

  function shortCompetition(name) {
    var text = String(name || "");
    return text.replace(/\s*\|\s*yoursport/i, "");
  }

  function loadJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function loadSheetEndpoint(endpoint) {
    var params = new URLSearchParams();
    params.set("endpoint", endpoint);
    params.set("team", PAGE.sheetTeam);
    return fetch(APPS_SCRIPT_URL + "?" + params.toString(), { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function getTeamBlock(json, key) {
    return json && json[key] && json[key][PAGE.sourceKey] && json[key][PAGE.sourceKey].schedule ? json[key][PAGE.sourceKey] : null;
  }

  function normalizeMatch(raw, block, seasonKey) {
    var dt = raw.datetime_local ? new Date(raw.datetime_local) : null;
    if (dt && isNaN(dt.getTime())) dt = null;
    var played = raw.score != null && raw.home_goals != null && raw.away_goals != null;
    return {
      id: raw.match_uuid || [seasonKey, raw.home_team, raw.away_team, raw.datetime_local].join("|"),
      home: raw.home_team || "",
      away: raw.away_team || "",
      homeGoals: raw.home_goals,
      awayGoals: raw.away_goals,
      score: raw.score,
      dt: dt,
      venue: (raw.details && (raw.details["Hřiště"] || raw.details["Hriste"])) || "",
      round: raw.round || "",
      competition: block && block.tournament ? (block.tournament.competition_name || "") : "",
      seasonLabel: block && block.tournament ? (block.tournament.season_label || "") : "",
      seasonKey: seasonKey,
      played: played,
      hasVideo: !!raw.has_video
    };
  }

  function collectMatches(json) {
    var all = [];
    [
      ["current_season", state.currentBlock],
      ["previous_season", state.previousBlock]
    ].forEach(function (pair) {
      var seasonKey = pair[0];
      var block = pair[1];
      if (!block || !block.schedule) return;
      var matches = block.schedule.libusin_matches || [];
      if (!matches.length && block.schedule.all_matches) {
        matches = block.schedule.all_matches.filter(function (m) {
          return isOurTeam(m.home_team) || isOurTeam(m.away_team);
        });
      }
      matches.forEach(function (raw) {
        all.push(normalizeMatch(raw, block, seasonKey));
      });
    });

    var seen = {};
    return all.filter(function (match) {
      if (seen[match.id]) return false;
      seen[match.id] = 1;
      return true;
    });
  }

  function pickStandings() {
    var candidates = [
      { key: "current_season", block: state.currentBlock },
      { key: "previous_season", block: state.previousBlock }
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var item = candidates[i];
      var standings = item.block && item.block.standings;
      var table = standings && standings.tables && standings.tables[0];
      if (standings && standings.available && table && table.rows && table.rows.length) {
        return {
          rows: table.rows,
          label: table.label || "Celkem",
          competition: item.block.tournament ? item.block.tournament.competition_name : "",
          seasonLabel: item.block.tournament ? item.block.tournament.season_label : "",
          isCurrent: item.key === "current_season"
        };
      }
    }

    return null;
  }

  function ingestFootballData(json) {
    state.currentBlock = getTeamBlock(json, "current_season");
    state.previousBlock = getTeamBlock(json, "previous_season");
    state.matches = collectMatches(json);

    var now = new Date();
    state.upcoming = state.matches
      .filter(function (m) { return !m.played && m.dt && m.dt.getTime() >= now.getTime() - 2 * 3600e3; })
      .sort(function (a, b) { return a.dt - b.dt; });
    state.results = state.matches
      .filter(function (m) { return m.played && m.dt; })
      .sort(function (a, b) { return b.dt - a.dt; });
    state.standings = pickStandings();
  }

  function outcome(match) {
    var isHome = isOurTeam(match.home);
    var us = Number(isHome ? match.homeGoals : match.awayGoals);
    var them = Number(isHome ? match.awayGoals : match.homeGoals);
    if (isNaN(us) || isNaN(them)) return { label: "Výsledek", className: "draw" };
    if (us > them) return { label: "Výhra", className: "win" };
    if (us < them) return { label: "Prohra", className: "loss" };
    return { label: "Remíza", className: "draw" };
  }

  function renderHero() {
    var block = state.currentBlock || state.previousBlock;
    var comp = block && block.tournament ? shortCompetition(block.tournament.competition_name) : PAGE.title;
    var season = block && block.tournament ? block.tournament.season_label : "";
    $("heroCompetition").textContent = comp + (season ? " · sezona " + season : "");

    var next = state.upcoming[0];
    var hero = $("heroMatch");
    if (!next) {
      hero.innerHTML = '<div class="team-loading">Momentálně není v datech naplánovaný žádný další zápas.</div>';
      return;
    }

    var parts = formatDateParts(next.dt);
    hero.innerHTML =
      '<div class="hero-match-top">' +
        '<span class="match-pill">Nejbližší zápas</span>' +
        '<span class="hero-match-round">' + esc(next.round || "Mistrovské utkání") + '</span>' +
      '</div>' +
      '<div class="hero-vs">' +
        heroTeam(next.home) +
        '<div class="hero-center"><span>' + esc(parts.line) + '</span><strong>' + esc(parts.time) + '</strong><span>výkop</span></div>' +
        heroTeam(next.away) +
      '</div>' +
      '<div class="hero-match-meta">' +
        '<span>' + esc(formatLongDate(next.dt)) + '</span>' +
        (next.venue ? '<span>' + esc(next.venue) + '</span>' : '') +
        '<span>' + esc(shortCompetition(next.competition)) + '</span>' +
      '</div>';
  }

  function heroTeam(name) {
    return '<div class="hero-team">' +
      '<img src="' + esc(logoFor(name)) + '" alt="" loading="lazy" draggable="false">' +
      '<strong>' + esc(name) + '</strong>' +
    '</div>';
  }

  function renderOverview() {
    var block = state.currentBlock || state.previousBlock;
    $("overviewSeason").textContent = block && block.tournament ? block.tournament.season_label : "-";

    var next = state.upcoming[0];
    $("overviewNext").textContent = next && next.dt ? formatDateParts(next.dt).line : "-";

    var last = state.results[0];
    $("overviewLast").textContent = last ? last.homeGoals + ":" + last.awayGoals : "-";

    var standingRow = state.standings && state.standings.rows.find(function (row) {
      return isOurTeam(row.club);
    });
    $("overviewStanding").textContent = standingRow ? standingRow.position + ". místo" : "-";
  }

  function renderSchedule() {
    var list = $("scheduleList");
    var note = $("scheduleNote");
    var btn = $("scheduleMore");
    var rows = state.upcoming;
    var fallbackSchedule = false;

    if (!rows.length) {
      rows = state.matches
        .filter(function (m) { return m.dt; })
        .sort(function (a, b) { return a.dt - b.dt; });
      fallbackSchedule = rows.length > 0;
    }

    note.textContent = rows.length
      ? ((fallbackSchedule ? "Poslední dostupný rozpis · " : "") + shortCompetition(rows[0].competition))
      : "Bez dalších zápasů";
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">V aktuálním JSONu není další zápas týmu ' + esc(PAGE.titleShort) + '.</div>';
      btn.hidden = true;
      return;
    }

    var visible = rows.slice(0, state.scheduleLimit);
    list.innerHTML = visible.map(renderScheduleRow).join("");
    btn.hidden = state.scheduleLimit >= rows.length;
  }

  function renderScheduleRow(match) {
    var parts = formatDateParts(match.dt);
    return '<article class="match-row">' +
      '<div class="date-tile"><strong>' + esc(parts.day) + '</strong><span>' + esc(parts.month) + '</span><small>' + esc(parts.time) + '</small></div>' +
      '<div class="row-teams">' +
        rowTeam(match.home, "home") +
        '<span class="row-vs">VS</span>' +
        rowTeam(match.away, "away") +
      '</div>' +
      '<div class="match-side-meta">' +
        '<span class="meta-pill">' + esc(match.round || "Zápas") + '</span>' +
        '<span class="venue-text">' + esc(match.venue || shortCompetition(match.competition)) + '</span>' +
      '</div>' +
    '</article>';
  }

  function rowTeam(name, side) {
    return '<div class="row-team ' + side + '">' +
      '<img src="' + esc(logoFor(name)) + '" alt="" loading="lazy" draggable="false">' +
      '<strong>' + esc(name) + '</strong>' +
    '</div>';
  }

  function renderResults() {
    var list = $("resultsList");
    var note = $("resultsNote");
    var btn = $("resultsMore");
    var rows = state.results;

    note.textContent = rows.length ? "Poslední odehraná utkání" : "Bez výsledků";
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">V aktuálním JSONu zatím nejsou výsledky týmu ' + esc(PAGE.titleShort) + '.</div>';
      btn.hidden = true;
      return;
    }

    var visible = rows.slice(0, state.resultsLimit);
    list.innerHTML = visible.map(renderResultRow).join("");
    btn.hidden = state.resultsLimit >= rows.length;
  }

  function renderResultRow(match) {
    var parts = formatDateParts(match.dt);
    var o = outcome(match);
    return '<article class="match-row">' +
      '<div class="date-tile"><strong>' + esc(parts.day) + '</strong><span>' + esc(parts.month) + '</span><small>' + esc(parts.line) + '</small></div>' +
      '<div class="row-teams">' +
        rowTeam(match.home, "home") +
        '<span class="row-score">' + esc(match.homeGoals) + ':' + esc(match.awayGoals) + '</span>' +
        rowTeam(match.away, "away") +
      '</div>' +
      '<div class="match-side-meta">' +
        '<span class="outcome-pill ' + o.className + '">' + esc(o.label) + '</span>' +
        '<span class="venue-text">' + esc(match.round || shortCompetition(match.competition)) + '</span>' +
      '</div>' +
    '</article>';
  }

  function renderStandings() {
    var body = $("standingsBody");
    var note = $("standingsNote");
    if (!state.standings || !state.standings.rows.length) {
      body.innerHTML = '<tr><td colspan="8">Tabulka zatím není v JSONu dostupná.</td></tr>';
      note.textContent = "Bez dostupné tabulky";
      return;
    }

    note.textContent = (state.standings.isCurrent ? "" : "Poslední dostupná · ") +
      shortCompetition(state.standings.competition) +
      (state.standings.seasonLabel ? " · " + state.standings.seasonLabel : "");

    body.innerHTML = state.standings.rows.map(function (row) {
      var isUs = isOurTeam(row.club);
      return '<tr class="' + (isUs ? "is-us" : "") + '">' +
        '<td>' + esc(row.position || "") + '</td>' +
        '<td><span class="standing-club"><img src="' + esc(logoFor(row.club)) + '" alt="" loading="lazy" draggable="false"><span>' + esc(row.club || "") + '</span></span></td>' +
        '<td>' + esc(row.played || 0) + '</td>' +
        '<td>' + esc(row.wins || 0) + '</td>' +
        '<td>' + esc(row.draws || 0) + '</td>' +
        '<td>' + esc(row.losses || 0) + '</td>' +
        '<td>' + esc(row.score || "") + '</td>' +
        '<td class="standing-points">' + esc(row.points || 0) + '</td>' +
      '</tr>';
    }).join("");
  }

  function pickField(row, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = row[keys[i]];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  function playerFullName(player) {
    return [pickField(player, ["jmeno", "jméno"]), pickField(player, ["prijmeni", "příjmení"])].filter(Boolean).join(" ").trim();
  }

  function playerKeyFromParts(name, surname) {
    return norm([name, surname].filter(Boolean).join(" "));
  }

  function buildStatsMap() {
    var map = {};
    state.stats.forEach(function (row) {
      var name = pickField(row, ["jmeno", "jméno"]);
      var surname = pickField(row, ["prijmeni", "příjmení"]);
      map[playerKeyFromParts(name, surname)] = {
        goals: Number(pickField(row, ["golu", "gólů", "gol", "góly"])) || 0,
        assists: Number(pickField(row, ["asistenci", "asistence", "assist"])) || 0
      };
    });
    return map;
  }

  function renderLeaders() {
    var grid = $("leadersGrid");
    if (!state.stats.length) {
      grid.innerHTML = "";
      return;
    }

    var rows = state.stats.map(function (row) {
      return {
        name: playerFullName(row),
        goals: Number(pickField(row, ["golu", "gólů", "gol", "góly"])) || 0,
        assists: Number(pickField(row, ["asistenci", "asistence", "assist"])) || 0
      };
    }).filter(function (row) {
      return row.name;
    });

    var topGoals = rows.slice().sort(function (a, b) { return b.goals - a.goals; })[0];
    var topAssists = rows.slice().sort(function (a, b) { return b.assists - a.assists; })[0];
    var cards = [];

    if (topGoals && topGoals.goals > 0) {
      cards.push(leaderCard("Nejlepší střelec", topGoals.name, topGoals.goals, "gólů"));
    }
    if (topAssists && topAssists.assists > 0) {
      cards.push(leaderCard("Nejvíc asistencí", topAssists.name, topAssists.assists, "asistencí"));
    }

    grid.innerHTML = cards.join("");
  }

  function leaderCard(label, name, number, meta) {
    return '<article class="leader-card">' +
      '<div class="leader-copy">' +
        '<span class="leader-label">' + esc(label) + '</span>' +
        '<span class="leader-name">' + esc(name) + '</span>' +
        '<span class="leader-meta">' + esc(number) + ' ' + esc(meta) + '</span>' +
      '</div>' +
      '<span class="leader-number">' + esc(number) + '</span>' +
    '</article>';
  }

  function renderRoster() {
    var wrap = $("rosterGroups");
    var note = $("rosterNote");
    if (!state.roster.length) {
      note.textContent = "Soupiska není dostupná";
      wrap.innerHTML = '<div class="empty-state">Soupiska se nepodařila načíst z týmového JSON endpointu.</div>';
      return;
    }

    var statsMap = buildStatsMap();
    var groups = {};
    state.roster.forEach(function (player) {
      var pos = pickField(player, ["pozice", "post"]) || "Hráč";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(player);
    });

    note.textContent = state.roster.length + " hráčů";
    renderLeaders();

    var keys = Object.keys(groups).sort(function (a, b) {
      var ai = POSITION_ORDER.indexOf(a);
      var bi = POSITION_ORDER.indexOf(b);
      if (ai === -1) ai = 99;
      if (bi === -1) bi = 99;
      return ai - bi || a.localeCompare(b, "cs");
    });

    wrap.innerHTML = keys.map(function (key) {
      var players = groups[key].slice().sort(function (a, b) {
        var an = Number(pickField(a, ["cislo dresu", "cislo", "dres"])) || 999;
        var bn = Number(pickField(b, ["cislo dresu", "cislo", "dres"])) || 999;
        return an - bn;
      });

      return '<div class="roster-group">' +
        '<h3>' + esc(POSITION_LABELS[key] || key) + '</h3>' +
        '<div class="player-grid">' + players.map(function (player) {
          return renderPlayer(player, statsMap);
        }).join("") + '</div>' +
      '</div>';
    }).join("");
  }

  function renderPlayer(player, statsMap) {
    var number = pickField(player, ["cislo dresu", "cislo", "dres"]);
    var name = playerFullName(player);
    var position = pickField(player, ["pozice", "post"]);
    var stat = statsMap[playerKeyFromParts(pickField(player, ["jmeno", "jméno"]), pickField(player, ["prijmeni", "příjmení"]))] || { goals: 0, assists: 0 };
    var productivity = stat.goals || stat.assists
      ? '<div class="player-productivity"><strong>' + esc(stat.goals) + '</strong><span>G / ' + esc(stat.assists) + ' A</span></div>'
      : "";

    return '<article class="player-card">' +
      '<div class="player-main">' +
        '<span class="shirt-number">' + esc(number || "-") + '</span>' +
        '<span><span class="player-name">' + esc(name || "Hráč") + '</span><span class="player-position">' + esc(position || PAGE.title) + '</span></span>' +
      '</div>' +
      productivity +
    '</article>';
  }

  function renderAllFootball() {
    renderHero();
    renderOverview();
    renderSchedule();
    renderStandings();
    renderResults();
    observeReveals();
  }

  function renderFootballError() {
    $("heroCompetition").textContent = PAGE.title;
    $("heroMatch").innerHTML = '<div class="team-loading">Data se nepodařilo načíst. Otevřete stránku přes lokální server.</div>';
    $("scheduleList").innerHTML = '<div class="empty-state">Rozpis se nepodařilo načíst.</div>';
    $("resultsList").innerHTML = '<div class="empty-state">Výsledky se nepodařilo načíst.</div>';
    $("standingsBody").innerHTML = '<tr><td colspan="8">Tabulku se nepodařilo načíst.</td></tr>';
    $("scheduleNote").textContent = "Chyba načtení";
    $("resultsNote").textContent = "Chyba načtení";
    $("standingsNote").textContent = "Chyba načtení";
  }

  function setupNav() {
    var nav = $("nav");
    var burger = $("navBurger");
    var modal = $("navModal");
    var backdrop = $("navModalBackdrop");
    var close = $("navModalClose");

    function onScroll() {
      nav.classList.toggle("scrolled", window.scrollY > 42);
    }

    function openModal() {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      burger.setAttribute("aria-expanded", "true");
      document.body.classList.add("nav-lock");
    }

    function closeModal() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      burger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-lock");
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    burger.addEventListener("click", openModal);
    backdrop.addEventListener("click", closeModal);
    close.addEventListener("click", closeModal);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeModal();
    });
    Array.prototype.forEach.call(modal.querySelectorAll("a"), function (link) {
      link.addEventListener("click", closeModal);
    });
    onScroll();
  }

  function setupSectionTabs() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".team-tabs-inner a"));
    var sections = links.map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    }).filter(Boolean);

    links.forEach(function (link) {
      link.addEventListener("click", function () {
        links.forEach(function (item) { item.classList.remove("active"); });
        link.classList.add("active");
      });
    });

    if (!("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var active = links.find(function (link) {
          return link.getAttribute("href") === "#" + entry.target.id;
        });
        if (!active) return;
        links.forEach(function (item) { item.classList.remove("active"); });
        active.classList.add("active");
      });
    }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });

    sections.forEach(function (section) { observer.observe(section); });
  }

  function setupLoadMore() {
    $("scheduleMore").addEventListener("click", function () {
      state.scheduleLimit += 6;
      renderSchedule();
    });
    $("resultsMore").addEventListener("click", function () {
      state.resultsLimit += 6;
      renderResults();
    });
  }

  function observeReveals() {
    var list = document.querySelectorAll("[data-reveal]:not(.reveal-in)");
    if (!list.length) return;
    var els = Array.prototype.slice.call(list);
    els.forEach(function (el) { el.classList.add("reveal-hidden"); });
    window.setTimeout(function () {
      els.forEach(function (el) {
        el.classList.remove("reveal-hidden");
        el.classList.add("reveal-in");
      });
    }, 30);
  }

  function loadData() {
    loadJson(MATCHES_URL)
      .then(function (json) {
        ingestFootballData(json);
        renderAllFootball();
      })
      .catch(function (error) {
        console.error("Fotbalová data se nepodařilo načíst:", error);
        renderFootballError();
      });

    Promise.all([
      loadSheetEndpoint("roster").catch(function (error) {
        console.error("Soupiska se nepodařila načíst:", error);
        return [];
      }),
      loadSheetEndpoint("stats").catch(function (error) {
        console.error("Statistiky se nepodařilo načíst:", error);
        return [];
      })
    ]).then(function (res) {
      state.roster = Array.isArray(res[0]) ? res[0].filter(function (row) {
        return Object.keys(row).some(function (key) { return row[key] !== "" && row[key] != null; });
      }) : [];
      state.stats = Array.isArray(res[1]) ? res[1] : [];
      renderRoster();
      observeReveals();
    });
  }

  function init() {
    setupNav();
    setupSectionTabs();
    setupLoadMore();
    observeReveals();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
