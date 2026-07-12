/* ============================================================
   SK Baník Libušín — detail článku
   ============================================================ */
(function () {
  "use strict";

  var ARTICLES_URL = "skbaniklibusin_clanky.json";
  var MONTHS_GEN = ["ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince"];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  function fmtArticleDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getDate() + ". " + MONTHS_GEN[d.getMonth()] + " " + d.getFullYear();
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
      return {
        id: String(p.id || p.slug || ("article-" + index)),
        link: p.link || "https://skbaniklibusin.cz/",
        date: p.date_created || p.date || "",
        title: p.title || "",
        excerpt: cleanLine(p.excerpt_text || firstExcerpt(content)),
        image: img,
        contentText: content,
        summary: articleSummary(p.title || "", content)
      };
    });
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

  function articleDetailHtml(article) {
    var summary = article.summary || {};
    var image = article.image
      ? '<div class="article-image"><img src="' + esc(article.image) + '" alt="" loading="lazy"></div>'
      : "";
    return '<div class="article-detail">' +
      '<header class="article-head">' +
      '<span class="article-date">' + esc(fmtArticleDate(article.date)) + "</span>" +
      '<h1 class="article-title" id="articleTitle">' + esc(article.title) + "</h1>" +
      "</header>" +
      articleMatchOverview(summary) +
      image +
      '<div class="article-text">' + articleBodyHtml(article) + "</div>" +
      '<a class="article-source" href="' + esc(article.link) + '" target="_blank" rel="noopener">Původní článek</a>' +
      "</div>";
  }

  function articleMatchOverview(summary) {
    if (!summary || !summary.hasMatchInfo) return "";
    var html = '<section class="article-match-overview" aria-label="Přehled zápasu">';
    if (summary.score) {
      html += '<div class="article-scoreboard">' +
        '<span class="article-team">' + esc(summary.score.home) + "</span>" +
        '<strong>' + esc(summary.score.homeGoals) + " : " + esc(summary.score.awayGoals) + "</strong>" +
        '<span class="article-team">' + esc(summary.score.away) + "</span>" +
        "</div>";
      if (summary.score.halftime) {
        html += '<span class="article-half">Poločas ' + esc(summary.score.halftime) + "</span>";
      }
    }
    html += '<div class="article-facts">';
    if (summary.goals) {
      html += '<div class="article-fact"><span>Střelci</span><strong>' + esc(summary.goals) + "</strong></div>";
    }
    if (summary.lineup) {
      html += '<div class="article-fact lineup"><span>Sestava</span><strong>' + esc(summary.lineup) + "</strong></div>";
    }
    html += "</div></section>";
    return html;
  }

  function articleBodyHtml(article) {
    var text = stripSummaryLines(article.contentText || article.excerpt || "", article.summary || {});
    var parts = text.split(/\n{2,}/).map(cleanLine).filter(Boolean);
    if (!parts.length && article.excerpt) parts = [article.excerpt];
    return parts.map(function (part) { return "<p>" + esc(part) + "</p>"; }).join("");
  }

  function stripSummaryLines(text, summary) {
    var skip = {};
    if (summary.goalsLine) skip[cleanLine(summary.goalsLine)] = true;
    if (summary.lineupLine) skip[cleanLine(summary.lineupLine)] = true;
    return plainText(text).split("\n").filter(function (line) {
      var cleaned = cleanLine(line);
      return !cleaned || !skip[cleaned];
    }).join("\n").trim();
  }

  function selectedArticleId() {
    var params = new URLSearchParams(window.location.search);
    return params.get("id") || (window.location.hash || "").replace(/^#clanek-/, "");
  }
  function findArticle(articles, id) {
    id = String(id || "");
    for (var i = 0; i < articles.length; i++) {
      if (articles[i].id === id) return articles[i];
    }
    return null;
  }

  function renderError(message) {
    $("articleFull").innerHTML = '<div class="article-not-found">' +
      '<h1>' + esc(message) + '</h1>' +
      '<a href="index.html#aktuality">Zpět na přehled článků</a>' +
      "</div>";
  }

  function loadJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function init() {
    var id = selectedArticleId();
    if (!id) {
      renderError("Článek nebyl vybrán");
      return;
    }
    loadJson(ARTICLES_URL).then(function (json) {
      var article = findArticle(ingestArticles(json), id);
      if (!article) {
        renderError("Článek se nenašel");
        return;
      }
      document.title = article.title + " | SK Baník Libušín";
      $("articleFull").innerHTML = articleDetailHtml(article);
    }).catch(function (err) {
      console.error("Článek se nepodařilo načíst:", err);
      renderError("Článek se nepodařilo načíst");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
