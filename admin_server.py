#!/usr/bin/env python3
"""Local SQLite admin backend for SK Banik Libusin."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import http.cookies
import json
import mimetypes
import os
import secrets
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "banik_admin.sqlite3"
PORT = int(os.environ.get("BANIK_ADMIN_PORT", "8090"))
SESSION_DAYS = 7


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    iterations = 160_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations_s, salt, expected = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations_s))
        return hmac.compare_digest(digest.hex(), expected)
    except Exception:
        return False


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def init_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with db_connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              email TEXT DEFAULT '',
              password_hash TEXT NOT NULL,
              is_admin INTEGER NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1,
              can_manage_reservations INTEGER NOT NULL DEFAULT 0,
              receive_reservation_notifications INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              key TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS category_permissions (
              user_id INTEGER NOT NULL,
              category_id INTEGER NOT NULL,
              can_manage_roster INTEGER NOT NULL DEFAULT 0,
              can_write_results INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (user_id, category_id),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS players (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              category_id INTEGER NOT NULL,
              first_name TEXT NOT NULL,
              last_name TEXT NOT NULL,
              number INTEGER,
              position TEXT DEFAULT '',
              active INTEGER NOT NULL DEFAULT 1,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS matches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              category_id INTEGER NOT NULL,
              played_on TEXT NOT NULL,
              opponent TEXT NOT NULL,
              home_away TEXT NOT NULL DEFAULT 'home',
              goals_for INTEGER NOT NULL DEFAULT 0,
              goals_against INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'played',
              note TEXT DEFAULT '',
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS articles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              category_id INTEGER,
              match_id INTEGER,
              article_type TEXT NOT NULL DEFAULT 'match_report',
              title TEXT NOT NULL,
              lead TEXT DEFAULT '',
              goals TEXT DEFAULT '',
              lineup TEXT DEFAULT '',
              content TEXT NOT NULL,
              image_url TEXT DEFAULT '',
              status TEXT NOT NULL DEFAULT 'draft',
              created_by INTEGER,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              published_at TEXT,
              FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
              FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
              FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS reservations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              requested_by INTEGER,
              requester_name TEXT NOT NULL,
              requester_contact TEXT DEFAULT '',
              facility TEXT NOT NULL DEFAULT 'field',
              lane TEXT NOT NULL DEFAULT 'full',
              date TEXT NOT NULL,
              start_time TEXT NOT NULL,
              end_time TEXT NOT NULL,
              purpose TEXT DEFAULT '',
              status TEXT NOT NULL DEFAULT 'pending',
              note TEXT DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS notifications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              title TEXT NOT NULL,
              message TEXT NOT NULL,
              type TEXT NOT NULL DEFAULT 'info',
              reservation_id INTEGER,
              seen INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )

        for key, name in [("a", "A tým"), ("b", "B tým"), ("dorost", "Dorost")]:
            conn.execute("INSERT OR IGNORE INTO categories(key, name) VALUES(?, ?)", (key, name))

        existing = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        if existing:
            return

        demo_users = [
            ("admin", "Administrátor", "admin@skbaniklibusin.cz", "admin123", 1, 1, 1),
            ("trener_a", "Trenér A týmu", "a@skbaniklibusin.cz", "a123", 0, 0, 0),
            ("trener_b", "Trenér B týmu", "b@skbaniklibusin.cz", "b123", 0, 0, 0),
            ("dorost", "Trenér dorostu", "dorost@skbaniklibusin.cz", "d123", 0, 0, 0),
            ("spravce_hriste", "Správce hřiště", "hriste@skbaniklibusin.cz", "hriste123", 0, 1, 1),
        ]
        user_ids: dict[str, int] = {}
        for username, display_name, email, password, is_admin, can_res, recv in demo_users:
            cur = conn.execute(
                """
                INSERT INTO users(username, display_name, email, password_hash, is_admin, can_manage_reservations, receive_reservation_notifications)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (username, display_name, email, hash_password(password), is_admin, can_res, recv),
            )
            user_ids[username] = int(cur.lastrowid)

        categories = {row["key"]: row["id"] for row in conn.execute("SELECT id, key FROM categories")}

        def grant(username: str, category_key: str, roster: int, results: int) -> None:
            conn.execute(
                """
                INSERT INTO category_permissions(user_id, category_id, can_manage_roster, can_write_results)
                VALUES(?, ?, ?, ?)
                """,
                (user_ids[username], categories[category_key], roster, results),
            )

        grant("trener_a", "a", 1, 1)
        grant("trener_b", "b", 1, 1)
        grant("dorost", "dorost", 1, 1)

        sample_players = [
            ("a", "Tomáš", "Novák", 1, "Brankář"),
            ("a", "Martin", "Svoboda", 8, "Záložník"),
            ("a", "Petr", "Dvořák", 11, "Útočník"),
            ("b", "Lukáš", "Černý", 4, "Obránce"),
            ("b", "Jan", "Procházka", 10, "Záložník"),
            ("dorost", "Matěj", "Král", 7, "Útočník"),
            ("dorost", "Adam", "Veselý", 12, "Obránce"),
        ]
        for category_key, first_name, last_name, number, position in sample_players:
            conn.execute(
                "INSERT INTO players(category_id, first_name, last_name, number, position) VALUES(?, ?, ?, ?, ?)",
                (categories[category_key], first_name, last_name, number, position),
            )

        today = dt.date.today()
        sample_matches = [
            ("a", today.isoformat(), "SK Tlustice", "home", 3, 1, "played", "Demo výsledek"),
            ("b", (today - dt.timedelta(days=2)).isoformat(), "Sokol Braškov", "away", 2, 2, "played", "Demo výsledek"),
            ("dorost", (today - dt.timedelta(days=4)).isoformat(), "TJ Sokol Vinařice", "home", 4, 1, "played", "Demo výsledek"),
        ]
        for category_key, played_on, opponent, home_away, gf, ga, status, note in sample_matches:
            conn.execute(
                """
                INSERT INTO matches(category_id, played_on, opponent, home_away, goals_for, goals_against, status, note)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (categories[category_key], played_on, opponent, home_away, gf, ga, status, note),
            )

        cur = conn.execute(
            """
            INSERT INTO reservations(requested_by, requester_name, requester_contact, facility, lane, date, start_time, end_time, purpose, status)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            (user_ids["trener_a"], "Trenér A týmu", "a@skbaniklibusin.cz", "field", "full", today.isoformat(), "19:00", "20:30", "Trénink A týmu"),
        )
        notify_reservation_created(conn, int(cur.lastrowid), "Trenér A týmu")


def get_category(conn: sqlite3.Connection, key: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM categories WHERE key = ?", (key,)).fetchone()


def permissions_for_user(conn: sqlite3.Connection, user_id: int) -> dict:
    rows = conn.execute(
        """
        SELECT c.key, c.name, COALESCE(p.can_manage_roster, 0) AS can_manage_roster,
               COALESCE(p.can_write_results, 0) AS can_write_results
        FROM categories c
        LEFT JOIN category_permissions p ON p.category_id = c.id AND p.user_id = ?
        ORDER BY c.id
        """,
        (user_id,),
    ).fetchall()
    return {
        row["key"]: {
            "name": row["name"],
            "can_manage_roster": bool(row["can_manage_roster"]),
            "can_write_results": bool(row["can_write_results"]),
        }
        for row in rows
    }


def public_user(conn: sqlite3.Connection, user: sqlite3.Row) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "is_admin": bool(user["is_admin"]),
        "active": bool(user["active"]),
        "can_manage_reservations": bool(user["can_manage_reservations"]),
        "receive_reservation_notifications": bool(user["receive_reservation_notifications"]),
        "permissions": permissions_for_user(conn, int(user["id"])),
    }


def can_category(conn: sqlite3.Connection, user: sqlite3.Row, category_key: str, permission: str) -> bool:
    if user["is_admin"]:
        return True
    category = get_category(conn, category_key)
    if not category:
        return False
    row = conn.execute(
        f"SELECT {permission} AS allowed FROM category_permissions WHERE user_id = ? AND category_id = ?",
        (user["id"], category["id"]),
    ).fetchone()
    return bool(row and row["allowed"])


def can_view_category(conn: sqlite3.Connection, user: sqlite3.Row, category_key: str) -> bool:
    return can_category(conn, user, category_key, "can_manage_roster") or can_category(conn, user, category_key, "can_write_results")


def can_manage_reservations(user: sqlite3.Row) -> bool:
    return bool(user["is_admin"] or user["can_manage_reservations"])


def notify(conn: sqlite3.Connection, user_id: int, title: str, message: str, type_: str = "info", reservation_id: int | None = None) -> None:
    conn.execute(
        "INSERT INTO notifications(user_id, title, message, type, reservation_id) VALUES(?, ?, ?, ?, ?)",
        (user_id, title, message, type_, reservation_id),
    )


def reservation_recipients(conn: sqlite3.Connection, exclude_user_id: int | None = None) -> list[int]:
    rows = conn.execute(
        """
        SELECT id FROM users
        WHERE active = 1 AND (is_admin = 1 OR can_manage_reservations = 1 OR receive_reservation_notifications = 1)
        """
    ).fetchall()
    return [int(row["id"]) for row in rows if exclude_user_id is None or int(row["id"]) != exclude_user_id]


def notify_reservation_created(conn: sqlite3.Connection, reservation_id: int, requester_name: str, exclude_user_id: int | None = None) -> None:
    for user_id in reservation_recipients(conn, exclude_user_id):
        notify(
            conn,
            user_id,
            "Nová žádost o rezervaci",
            f"{requester_name} poslal žádost o rezervaci hřiště nebo klubovny.",
            "reservation",
            reservation_id,
        )


class AdminHandler(BaseHTTPRequestHandler):
    server_version = "BanikAdmin/0.1"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and ("localhost" in origin or "127.0.0.1" in origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("GET", parsed)
        else:
            self.serve_static(parsed.path)

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        self.serve_static(parsed.path, head_only=True)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        self.handle_api("POST", parsed)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        self.handle_api("PUT", parsed)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        self.handle_api("DELETE", parsed)

    def serve_static(self, path: str, head_only: bool = False) -> None:
        if path in ("", "/"):
            path = "/admin.html"
        safe = (ROOT / path.lstrip("/")).resolve()
        if not str(safe).startswith(str(ROOT)) or "/data/" in str(safe):
            self.send_error(403)
            return
        if not safe.exists() or not safe.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(str(safe))[0] or "application/octet-stream"
        data = safe.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def send_json(self, status: int, data: dict | list) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, status: int, message: str) -> None:
        self.send_json(status, {"error": message})

    def bearer_token(self) -> str | None:
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
        cookie_header = self.headers.get("Cookie")
        if cookie_header:
            cookies = http.cookies.SimpleCookie(cookie_header)
            if "banik_session" in cookies:
                return cookies["banik_session"].value
        return None

    def current_user(self, conn: sqlite3.Connection) -> sqlite3.Row | None:
        token = self.bearer_token()
        if not token:
            return None
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso(),))
        row = conn.execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at >= ? AND u.active = 1
            """,
            (token, now_iso()),
        ).fetchone()
        return row

    def require_user(self, conn: sqlite3.Connection) -> sqlite3.Row | None:
        user = self.current_user(conn)
        if not user:
            self.send_error_json(401, "Nejste přihlášeni.")
            return None
        return user

    def require_admin(self, conn: sqlite3.Connection) -> sqlite3.Row | None:
        user = self.require_user(conn)
        if not user:
            return None
        if not user["is_admin"]:
            self.send_error_json(403, "Tuhle akci může dělat jen admin.")
            return None
        return user

    def handle_api(self, method: str, parsed) -> None:
        try:
            path = parsed.path
            parts = [p for p in path.split("/") if p]
            with db_connect() as conn:
                if path == "/api/login" and method == "POST":
                    return self.api_login(conn)
                if path == "/api/logout" and method == "POST":
                    return self.api_logout(conn)
                if path == "/api/public/articles" and method == "GET":
                    return self.api_public_articles(conn)

                user = self.require_user(conn)
                if not user:
                    return

                if path == "/api/me" and method == "GET":
                    return self.send_json(200, {"user": public_user(conn, user), "categories": self.categories(conn)})
                if path == "/api/notifications" and method == "GET":
                    return self.api_notifications(conn, user)
                if path == "/api/notifications/read-all" and method == "POST":
                    conn.execute("UPDATE notifications SET seen = 1 WHERE user_id = ?", (user["id"],))
                    return self.send_json(200, {"ok": True})
                if path == "/api/categories" and method == "GET":
                    return self.send_json(200, {"categories": self.categories(conn)})
                if path == "/api/players":
                    return self.api_players(conn, user, method, parse_qs(parsed.query))
                if len(parts) == 3 and parts[:2] == ["api", "players"]:
                    return self.api_player_item(conn, user, method, int(parts[2]))
                if path == "/api/matches":
                    return self.api_matches(conn, user, method, parse_qs(parsed.query))
                if len(parts) == 3 and parts[:2] == ["api", "matches"]:
                    return self.api_match_item(conn, user, method, int(parts[2]))
                if path == "/api/articles":
                    return self.api_articles(conn, user, method, parse_qs(parsed.query))
                if len(parts) == 3 and parts[:2] == ["api", "articles"]:
                    return self.api_article_item(conn, user, method, int(parts[2]))
                if path == "/api/reservations":
                    return self.api_reservations(conn, user, method)
                if len(parts) == 3 and parts[:2] == ["api", "reservations"]:
                    return self.api_reservation_item(conn, user, method, int(parts[2]))
                if path == "/api/admin/users" and method == "GET":
                    if not user["is_admin"]:
                        return self.send_error_json(403, "Jen admin.")
                    return self.api_users(conn)
                if path == "/api/admin/users" and method == "POST":
                    if not user["is_admin"]:
                        return self.send_error_json(403, "Jen admin.")
                    return self.api_user_create(conn)
                if len(parts) == 4 and parts[:3] == ["api", "admin", "users"] and method == "PUT":
                    if not user["is_admin"]:
                        return self.send_error_json(403, "Jen admin.")
                    return self.api_user_update(conn, int(parts[3]))

                self.send_error_json(404, "API endpoint neexistuje.")
        except json.JSONDecodeError:
            self.send_error_json(400, "Neplatný JSON.")
        except ValueError:
            self.send_error_json(400, "Neplatná hodnota.")
        except Exception as exc:
            print("API error:", exc, file=sys.stderr)
            self.send_error_json(500, "Chyba serveru.")

    def categories(self, conn: sqlite3.Connection) -> list[dict]:
        return [dict(row) for row in conn.execute("SELECT id, key, name FROM categories ORDER BY id")]

    def api_login(self, conn: sqlite3.Connection) -> None:
        data = self.read_json()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        user = conn.execute("SELECT * FROM users WHERE username = ? AND active = 1", (username,)).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            return self.send_error_json(401, "Špatné jméno nebo heslo.")
        token = secrets.token_urlsafe(32)
        expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=SESSION_DAYS)).replace(microsecond=0).isoformat()
        conn.execute("INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)", (token, user["id"], expires))
        payload = json.dumps({"token": token, "user": public_user(conn, user)}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", f"banik_session={token}; Path=/; HttpOnly; SameSite=Lax")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def api_logout(self, conn: sqlite3.Connection) -> None:
        token = self.bearer_token()
        if token:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        self.send_json(200, {"ok": True})

    def category_from_request(self, conn: sqlite3.Connection, key: str) -> sqlite3.Row:
        category = get_category(conn, key)
        if not category:
            raise ValueError("Neznámá kategorie.")
        return category

    def api_players(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, query: dict) -> None:
        if method == "GET":
            key = (query.get("category") or ["a"])[0]
            if not can_view_category(conn, user, key):
                return self.send_error_json(403, "Nemáte oprávnění pro tuto kategorii.")
            category = self.category_from_request(conn, key)
            rows = conn.execute("SELECT * FROM players WHERE category_id = ? ORDER BY active DESC, number IS NULL, number, last_name", (category["id"],)).fetchall()
            return self.send_json(200, {"players": [dict(row) for row in rows]})

        if method == "POST":
            data = self.read_json()
            key = str(data.get("category", "a"))
            if not can_category(conn, user, key, "can_manage_roster"):
                return self.send_error_json(403, "Nemůžete spravovat soupisku této kategorie.")
            category = self.category_from_request(conn, key)
            cur = conn.execute(
                """
                INSERT INTO players(category_id, first_name, last_name, number, position, active, updated_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    category["id"],
                    str(data.get("first_name", "")).strip() or "Hráč",
                    str(data.get("last_name", "")).strip() or "Bez příjmení",
                    data.get("number") or None,
                    str(data.get("position", "")).strip(),
                    1 if data.get("active", True) else 0,
                    now_iso(),
                ),
            )
            return self.send_json(201, {"id": cur.lastrowid})
        self.send_error_json(405, "Metoda není povolená.")

    def api_player_item(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, player_id: int) -> None:
        player = conn.execute("SELECT p.*, c.key AS category_key FROM players p JOIN categories c ON c.id = p.category_id WHERE p.id = ?", (player_id,)).fetchone()
        if not player:
            return self.send_error_json(404, "Hráč neexistuje.")
        if not can_category(conn, user, player["category_key"], "can_manage_roster"):
            return self.send_error_json(403, "Nemůžete upravit tohoto hráče.")
        if method == "DELETE":
            conn.execute("DELETE FROM players WHERE id = ?", (player_id,))
            return self.send_json(200, {"ok": True})
        if method == "PUT":
            data = self.read_json()
            conn.execute(
                """
                UPDATE players SET first_name = ?, last_name = ?, number = ?, position = ?, active = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    str(data.get("first_name", player["first_name"])).strip() or player["first_name"],
                    str(data.get("last_name", player["last_name"])).strip() or player["last_name"],
                    data.get("number") if data.get("number") != "" else None,
                    str(data.get("position", player["position"])).strip(),
                    1 if data.get("active", bool(player["active"])) else 0,
                    now_iso(),
                    player_id,
                ),
            )
            return self.send_json(200, {"ok": True})
        self.send_error_json(405, "Metoda není povolená.")

    def api_matches(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, query: dict) -> None:
        if method == "GET":
            key = (query.get("category") or ["a"])[0]
            if not can_view_category(conn, user, key):
                return self.send_error_json(403, "Nemáte oprávnění pro tuto kategorii.")
            category = self.category_from_request(conn, key)
            rows = conn.execute("SELECT * FROM matches WHERE category_id = ? ORDER BY played_on DESC, id DESC", (category["id"],)).fetchall()
            return self.send_json(200, {"matches": [dict(row) for row in rows]})

        if method == "POST":
            data = self.read_json()
            key = str(data.get("category", "a"))
            if not can_category(conn, user, key, "can_write_results"):
                return self.send_error_json(403, "Nemůžete zapisovat výsledky této kategorie.")
            category = self.category_from_request(conn, key)
            cur = conn.execute(
                """
                INSERT INTO matches(category_id, played_on, opponent, home_away, goals_for, goals_against, status, note, updated_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    category["id"],
                    str(data.get("played_on", dt.date.today().isoformat())),
                    str(data.get("opponent", "")).strip() or "Soupeř",
                    str(data.get("home_away", "home")),
                    int(data.get("goals_for") or 0),
                    int(data.get("goals_against") or 0),
                    str(data.get("status", "played")),
                    str(data.get("note", "")),
                    now_iso(),
                ),
            )
            return self.send_json(201, {"id": cur.lastrowid})
        self.send_error_json(405, "Metoda není povolená.")

    def api_match_item(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, match_id: int) -> None:
        match = conn.execute("SELECT m.*, c.key AS category_key FROM matches m JOIN categories c ON c.id = m.category_id WHERE m.id = ?", (match_id,)).fetchone()
        if not match:
            return self.send_error_json(404, "Zápas neexistuje.")
        if not can_category(conn, user, match["category_key"], "can_write_results"):
            return self.send_error_json(403, "Nemůžete upravit tento zápas.")
        if method == "DELETE":
            conn.execute("DELETE FROM matches WHERE id = ?", (match_id,))
            return self.send_json(200, {"ok": True})
        if method == "PUT":
            data = self.read_json()
            conn.execute(
                """
                UPDATE matches SET played_on = ?, opponent = ?, home_away = ?, goals_for = ?, goals_against = ?, status = ?, note = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    str(data.get("played_on", match["played_on"])),
                    str(data.get("opponent", match["opponent"])).strip() or match["opponent"],
                    str(data.get("home_away", match["home_away"])),
                    int(data.get("goals_for", match["goals_for"]) or 0),
                    int(data.get("goals_against", match["goals_against"]) or 0),
                    str(data.get("status", match["status"])),
                    str(data.get("note", match["note"] or "")),
                    now_iso(),
                    match_id,
                ),
            )
            return self.send_json(200, {"ok": True})
        self.send_error_json(405, "Metoda není povolená.")

    def article_rows(self, conn: sqlite3.Connection, where: str = "", params: tuple = ()) -> list[sqlite3.Row]:
        sql = """
            SELECT a.*, c.key AS category_key, c.name AS category_name,
                   m.played_on AS match_date, m.opponent AS match_opponent,
                   m.home_away AS match_home_away, m.goals_for AS match_goals_for,
                   m.goals_against AS match_goals_against, m.status AS match_status,
                   u.display_name AS created_by_name
            FROM articles a
            LEFT JOIN categories c ON c.id = a.category_id
            LEFT JOIN matches m ON m.id = a.match_id
            LEFT JOIN users u ON u.id = a.created_by
        """
        if where:
            sql += " WHERE " + where
        sql += " ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC"
        return conn.execute(sql, params).fetchall()

    def match_label(self, row: sqlite3.Row) -> str:
        if not row["match_id"]:
            return ""
        home = "Baník Libušín" if row["match_home_away"] == "home" else row["match_opponent"]
        away = row["match_opponent"] if row["match_home_away"] == "home" else "Baník Libušín"
        if row["match_status"] == "played":
            score = f"{row['match_goals_for']}:{row['match_goals_against']}"
        else:
            score = {"planned": "plánováno", "cancelled": "zrušeno"}.get(str(row["match_status"] or ""), "plánováno")
        return f"{row['match_date']} · {home} {score} {away}"

    def article_dict(self, row: sqlite3.Row) -> dict:
        data = dict(row)
        data["match_label"] = self.match_label(row)
        return data

    def can_write_article(self, conn: sqlite3.Connection, user: sqlite3.Row, category_key: str | None) -> bool:
        if user["is_admin"]:
            return True
        if not category_key:
            return False
        return can_category(conn, user, category_key, "can_write_results")

    def public_article_from_row(self, row: sqlite3.Row) -> dict:
        content_parts = []
        if row["goals"]:
            content_parts.append("Branky: " + row["goals"])
        if row["lineup"]:
            content_parts.append("Sestava: " + row["lineup"])
        content_parts.append(row["content"] or "")
        featured = {"url": row["image_url"], "source_url": row["image_url"]} if row["image_url"] else None
        date_created = row["published_at"] or row["created_at"]
        return {
            "id": f"db-{row['id']}",
            "slug": f"clanek-{row['id']}",
            "title": row["title"],
            "link": f"clanek.html?id=db-{row['id']}",
            "date_created": date_created,
            "date": date_created,
            "author": {"name": row["created_by_name"] or "SK Baník Libušín"},
            "categories": [{"name": row["category_name"] or "Aktuálně", "slug": row["category_key"] or "aktualne"}],
            "tags": [{"name": row["article_type"]}],
            "featured_image": featured,
            "excerpt_text": row["lead"] or "",
            "content_text": "\n\n".join([part for part in content_parts if part.strip()]),
            "source": "sqlite",
        }

    def api_public_articles(self, conn: sqlite3.Connection) -> None:
        articles: list[dict] = []
        for row in self.article_rows(conn, "a.status = 'published'"):
            articles.append(self.public_article_from_row(row))

        legacy_path = ROOT / "skbaniklibusin_clanky.json"
        if legacy_path.exists():
            try:
                legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
                articles.extend(legacy.get("articles") or [])
            except Exception as exc:
                print("Legacy articles error:", exc, file=sys.stderr)

        def sort_key(item: dict) -> str:
            return str(item.get("date_created") or item.get("date") or "")

        articles.sort(key=sort_key, reverse=True)
        self.send_json(200, {"articles": articles, "total_articles": len(articles), "source": "sqlite+json"})

    def api_articles(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, query: dict) -> None:
        if method == "GET":
            key = (query.get("category") or [""])[0]
            params: tuple = ()
            where = ""
            if key:
                if not self.can_write_article(conn, user, key):
                    return self.send_error_json(403, "Nemáte oprávnění pro články této kategorie.")
                where = "c.key = ?"
                params = (key,)
            elif not user["is_admin"]:
                allowed = [category["key"] for category in self.categories(conn) if self.can_write_article(conn, user, category["key"])]
                if not allowed:
                    return self.send_json(200, {"articles": []})
                placeholders = ",".join("?" for _ in allowed)
                where = f"c.key IN ({placeholders})"
                params = tuple(allowed)
            rows = self.article_rows(conn, where, params)
            return self.send_json(200, {"articles": [self.article_dict(row) for row in rows]})

        if method == "POST":
            data = self.read_json()
            key = str(data.get("category", "")).strip()
            if not self.can_write_article(conn, user, key):
                return self.send_error_json(403, "Nemůžete psát článek pro tuto kategorii.")
            category = self.category_from_request(conn, key)
            match_id = self.valid_article_match(conn, category["id"], data.get("match_id"))
            title = str(data.get("title", "")).strip()
            content = str(data.get("content", "")).strip()
            if not title or not content:
                return self.send_error_json(400, "Vyplňte nadpis a text článku.")
            status = self.clean_article_status(data.get("status"))
            published_at = now_iso() if status == "published" else None
            cur = conn.execute(
                """
                INSERT INTO articles(category_id, match_id, article_type, title, lead, goals, lineup, content, image_url, status, created_by, created_at, updated_at, published_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    category["id"],
                    match_id,
                    self.clean_article_type(data.get("article_type")),
                    title,
                    str(data.get("lead", "")).strip(),
                    str(data.get("goals", "")).strip(),
                    str(data.get("lineup", "")).strip(),
                    content,
                    str(data.get("image_url", "")).strip(),
                    status,
                    user["id"],
                    now_iso(),
                    now_iso(),
                    published_at,
                ),
            )
            return self.send_json(201, {"id": cur.lastrowid})

        self.send_error_json(405, "Metoda není povolená.")

    def api_article_item(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, article_id: int) -> None:
        row = self.article_rows(conn, "a.id = ?", (article_id,))
        article = row[0] if row else None
        if not article:
            return self.send_error_json(404, "Článek neexistuje.")
        if not self.can_write_article(conn, user, article["category_key"]):
            return self.send_error_json(403, "Nemůžete upravit tento článek.")
        if method == "DELETE":
            conn.execute("DELETE FROM articles WHERE id = ?", (article_id,))
            return self.send_json(200, {"ok": True})
        if method == "PUT":
            data = self.read_json()
            key = str(data.get("category", article["category_key"] or "")).strip()
            if not self.can_write_article(conn, user, key):
                return self.send_error_json(403, "Nemůžete článek přesunout do této kategorie.")
            category = self.category_from_request(conn, key)
            match_id = self.valid_article_match(conn, category["id"], data.get("match_id"))
            title = str(data.get("title", article["title"])).strip()
            content = str(data.get("content", article["content"])).strip()
            if not title or not content:
                return self.send_error_json(400, "Vyplňte nadpis a text článku.")
            status = self.clean_article_status(data.get("status", article["status"]))
            published_at = article["published_at"]
            if status == "published" and not published_at:
                published_at = now_iso()
            if status != "published":
                published_at = None
            conn.execute(
                """
                UPDATE articles SET category_id = ?, match_id = ?, article_type = ?, title = ?, lead = ?,
                  goals = ?, lineup = ?, content = ?, image_url = ?, status = ?, updated_at = ?, published_at = ?
                WHERE id = ?
                """,
                (
                    category["id"],
                    match_id,
                    self.clean_article_type(data.get("article_type", article["article_type"])),
                    title,
                    str(data.get("lead", article["lead"] or "")).strip(),
                    str(data.get("goals", article["goals"] or "")).strip(),
                    str(data.get("lineup", article["lineup"] or "")).strip(),
                    content,
                    str(data.get("image_url", article["image_url"] or "")).strip(),
                    status,
                    now_iso(),
                    published_at,
                    article_id,
                ),
            )
            return self.send_json(200, {"ok": True})
        self.send_error_json(405, "Metoda není povolená.")

    def clean_article_type(self, value) -> str:
        value = str(value or "match_report")
        return value if value in ("match_report", "news", "invitation", "club") else "match_report"

    def clean_article_status(self, value) -> str:
        value = str(value or "draft")
        return value if value in ("draft", "published") else "draft"

    def valid_article_match(self, conn: sqlite3.Connection, category_id: int, raw_match_id) -> int | None:
        if raw_match_id in (None, "", 0, "0"):
            return None
        match_id = int(raw_match_id)
        match = conn.execute("SELECT id FROM matches WHERE id = ? AND category_id = ?", (match_id, category_id)).fetchone()
        if not match:
            raise ValueError("Vybraný zápas nepatří do této kategorie.")
        return match_id

    def api_reservations(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str) -> None:
        if method == "GET":
            if can_manage_reservations(user):
                rows = conn.execute(
                    "SELECT r.*, u.display_name AS requested_by_name FROM reservations r LEFT JOIN users u ON u.id = r.requested_by ORDER BY r.date DESC, r.start_time"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT r.*, u.display_name AS requested_by_name FROM reservations r LEFT JOIN users u ON u.id = r.requested_by WHERE requested_by = ? ORDER BY r.date DESC, r.start_time",
                    (user["id"],),
                ).fetchall()
            return self.send_json(200, {"reservations": [dict(row) for row in rows], "can_manage": can_manage_reservations(user)})

        if method == "POST":
            data = self.read_json()
            cur = conn.execute(
                """
                INSERT INTO reservations(requested_by, requester_name, requester_contact, facility, lane, date, start_time, end_time, purpose, status, created_at, updated_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (
                    user["id"],
                    str(data.get("requester_name", user["display_name"])).strip() or user["display_name"],
                    str(data.get("requester_contact", user["email"] or "")).strip(),
                    str(data.get("facility", "field")),
                    str(data.get("lane", "full")),
                    str(data.get("date", dt.date.today().isoformat())),
                    str(data.get("start_time", "18:00")),
                    str(data.get("end_time", "19:30")),
                    str(data.get("purpose", "")),
                    now_iso(),
                    now_iso(),
                ),
            )
            notify_reservation_created(conn, int(cur.lastrowid), user["display_name"], int(user["id"]))
            return self.send_json(201, {"id": cur.lastrowid})
        self.send_error_json(405, "Metoda není povolená.")

    def api_reservation_item(self, conn: sqlite3.Connection, user: sqlite3.Row, method: str, reservation_id: int) -> None:
        reservation = conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)).fetchone()
        if not reservation:
            return self.send_error_json(404, "Rezervace neexistuje.")
        if not can_manage_reservations(user):
            return self.send_error_json(403, "Rezervace může schvalovat jen správce nebo admin.")
        if method != "PUT":
            return self.send_error_json(405, "Metoda není povolená.")
        data = self.read_json()
        status = str(data.get("status", reservation["status"]))
        if status not in ("pending", "approved", "rejected"):
            return self.send_error_json(400, "Neplatný stav rezervace.")
        note = str(data.get("note", reservation["note"] or ""))
        conn.execute("UPDATE reservations SET status = ?, note = ?, updated_at = ? WHERE id = ?", (status, note, now_iso(), reservation_id))
        if reservation["requested_by"]:
            notify(
                conn,
                int(reservation["requested_by"]),
                "Stav rezervace změněn",
                f"Vaše žádost o rezervaci má stav: {status}.",
                "reservation",
                reservation_id,
            )
        return self.send_json(200, {"ok": True})

    def api_notifications(self, conn: sqlite3.Connection, user: sqlite3.Row) -> None:
        rows = conn.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
            (user["id"],),
        ).fetchall()
        unread = conn.execute("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND seen = 0", (user["id"],)).fetchone()["count"]
        self.send_json(200, {"notifications": [dict(row) for row in rows], "unread": unread})

    def api_users(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute("SELECT * FROM users ORDER BY is_admin DESC, display_name").fetchall()
        self.send_json(200, {"users": [public_user(conn, row) for row in rows]})

    def sync_permissions(self, conn: sqlite3.Connection, user_id: int, permissions: dict) -> None:
        categories = self.categories(conn)
        for category in categories:
            data = permissions.get(category["key"], {})
            conn.execute(
                """
                INSERT INTO category_permissions(user_id, category_id, can_manage_roster, can_write_results)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(user_id, category_id) DO UPDATE SET
                  can_manage_roster = excluded.can_manage_roster,
                  can_write_results = excluded.can_write_results
                """,
                (
                    user_id,
                    category["id"],
                    1 if data.get("can_manage_roster") else 0,
                    1 if data.get("can_write_results") else 0,
                ),
            )

    def api_user_create(self, conn: sqlite3.Connection) -> None:
        data = self.read_json()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", "")).strip()
        display_name = str(data.get("display_name", username)).strip() or username
        if not username or not password:
            return self.send_error_json(400, "Vyplňte jméno a heslo.")
        cur = conn.execute(
            """
            INSERT INTO users(username, display_name, email, password_hash, is_admin, active, can_manage_reservations, receive_reservation_notifications)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                display_name,
                str(data.get("email", "")).strip(),
                hash_password(password),
                1 if data.get("is_admin") else 0,
                1 if data.get("active", True) else 0,
                1 if data.get("can_manage_reservations") else 0,
                1 if data.get("receive_reservation_notifications") else 0,
            ),
        )
        self.sync_permissions(conn, int(cur.lastrowid), data.get("permissions") or {})
        self.send_json(201, {"id": cur.lastrowid})

    def api_user_update(self, conn: sqlite3.Connection, user_id: int) -> None:
        data = self.read_json()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            return self.send_error_json(404, "Uživatel neexistuje.")
        conn.execute(
            """
            UPDATE users SET display_name = ?, email = ?, is_admin = ?, active = ?,
              can_manage_reservations = ?, receive_reservation_notifications = ?
            WHERE id = ?
            """,
            (
                str(data.get("display_name", user["display_name"])).strip() or user["display_name"],
                str(data.get("email", user["email"] or "")).strip(),
                1 if data.get("is_admin", bool(user["is_admin"])) else 0,
                1 if data.get("active", bool(user["active"])) else 0,
                1 if data.get("can_manage_reservations", bool(user["can_manage_reservations"])) else 0,
                1 if data.get("receive_reservation_notifications", bool(user["receive_reservation_notifications"])) else 0,
                user_id,
            ),
        )
        password = str(data.get("password", "")).strip()
        if password:
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id))
        self.sync_permissions(conn, user_id, data.get("permissions") or {})
        self.send_json(200, {"ok": True})


def main() -> None:
    init_db()
    print(f"Admin server bezi na http://localhost:{PORT}/admin.html")
    print("Demo ucty:")
    print("  admin / admin123")
    print("  trener_a / a123")
    print("  trener_b / b123")
    print("  dorost / d123")
    print("  spravce_hriste / hriste123")
    ThreadingHTTPServer(("127.0.0.1", PORT), AdminHandler).serve_forever()


if __name__ == "__main__":
    main()
