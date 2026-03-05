#!/usr/bin/env python3
"""
Brawlers Tavern - Automated Firestore Data Fetcher
Pulls data directly from Firestore and generates website-ready JSON files.

Usage:
    python fetch_firestore.py                          # Uses default service-account.json
    python fetch_firestore.py --key path/to/key.json   # Custom key path
    python fetch_firestore.py --output data             # Custom output directory

Setup:
    1. Go to Firebase Console > Project Settings > Service accounts
    2. Click "Generate new private key" and save the JSON file
    3. Rename it to service-account.json and place it in this directory
    4. Run: pip install firebase-admin pandas
"""

import argparse
import json
import re
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd


def connect_firestore(key_path):
    """Initialize Firebase Admin SDK and return Firestore client."""
    if not Path(key_path).exists():
        print(f"ERROR: Service account key not found at: {key_path}")
        print()
        print("To get your key:")
        print("  1. Go to https://console.firebase.google.com")
        print("  2. Select your project (brawlers-tavern-prod)")
        print("  3. Project Settings > Service accounts")
        print("  4. Click 'Generate new private key'")
        print(f"  5. Save the file as: {key_path}")
        sys.exit(1)

    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def fetch_collection(db, collection_name, fields=None):
    """Fetch all documents from a Firestore collection.

    Pass fields=['field1', 'field2'] to use a field mask and reduce data transfer.
    """
    print(f"  Fetching {collection_name}...", end=" ", flush=True)
    ref = db.collection(collection_name)
    if fields:
        ref = ref.select(fields)
    docs = ref.get()
    data = {}
    for doc in docs:
        data[doc.id] = doc.to_dict()
    print(f"{len(data)} documents")
    return data


def process_users(users_raw):
    """Process raw Firestore user documents into website-ready format."""
    users_data = []
    for user_id, user in users_raw.items():
        if not user or not user.get("username"):
            continue

        # Extract guild references
        guild_refs = []
        guilds_list = user.get("guilds", [])
        if guilds_list and isinstance(guilds_list, list):
            for guild_entry in guilds_list:
                if isinstance(guild_entry, firestore.DocumentReference):
                    guild_refs.append(guild_entry.path)
                elif isinstance(guild_entry, dict) and "__ref__" in guild_entry:
                    guild_refs.append(guild_entry["__ref__"])

        # Current guild reference
        current_guild = user.get("currentGuild")
        if isinstance(current_guild, firestore.DocumentReference):
            current_guild_ref = current_guild.path
        elif isinstance(current_guild, dict) and "__ref__" in current_guild:
            current_guild_ref = current_guild["__ref__"]
        else:
            current_guild_ref = ""

        user_data = {
            "id": user_id,
            "username": user.get("username", ""),
            "nickname": user.get("nickname", ""),
            "currentGuildRef": current_guild_ref,
            "guildRefs": guild_refs,
        }

        # Outfit data
        outfit = user.get("outfit", {}) or {}
        outfit_parts = [
            "head", "eyes", "eyebrows", "markings",
            "facialHair", "hair", "ears", "hat", "mask",
        ]
        for part in outfit_parts:
            if part in outfit and outfit[part]:
                for field in ["skinName", "tintColor", "tintDarkColor"]:
                    if field in outfit[part]:
                        user_data[f"outfit.{part}.{field}"] = outfit[part][field]

        # Stats
        stats = user.get("stats", {}) or {}
        user_data["stats.reputation"] = stats.get("reputation", 0) or 0
        user_data["stats.knockouts"] = stats.get("knockouts", 0) or 0
        user_data["stats.onlineTime"] = stats.get("onlineTime", 0) or 0
        user_data["stats.loginTime"] = stats.get("loginTime", 0) or 0

        # Brawl stats
        brawl = stats.get("brawl", {}) or {}
        for field in ["rating", "highestRating", "brawls", "wins", "leaves", "winStreak"]:
            user_data[f"stats.brawl.{field}"] = brawl.get(field, 0) or 0

        # Brawl traits
        traits = brawl.get("traits", {}) or {}
        trait_fields = [
            "combos", "perfectCombos", "counters", "counterAttempts", "evasiveBrawls",
            "finishes", "finishWins", "gambles", "hits", "hurts", "nearCenterTime",
            "nearWallTime", "swings", "sideSwings", "northTime", "totalTime",
            "trades", "retaliations", "westTime",
        ]
        for field in trait_fields:
            user_data[f"stats.brawl.traits.{field}"] = traits.get(field, 0) or 0

        # Team Brawl stats
        team_brawl = stats.get("teamBrawl", {}) or {}
        for field in ["rating", "highestRating", "brawls", "wins", "leaves", "winStreak"]:
            user_data[f"stats.teamBrawl.{field}"] = team_brawl.get(field, 0) or 0

        # Event stats
        event = stats.get("event", {}) or {}
        for field in ["games", "soloWins", "teamWins"]:
            user_data[f"stats.event.{field}"] = event.get(field, 0) or 0

        # CTF stats
        ctf = event.get("ctf", {}) or {}
        for field in ["captures", "charges", "defenses", "escorts", "games", "recovers", "wins"]:
            user_data[f"stats.event.ctf.{field}"] = ctf.get(field, 0) or 0

        # Guild reputation
        guild_rep = stats.get("guildReputation", {}) or {}
        for guild_tag, rep in guild_rep.items():
            if rep:
                user_data[f"stats.guildReputation.{guild_tag}"] = rep

        # Historical season data (stored under "historicalStats" with keys like "season1-2026-03-05")
        season_pattern = re.compile(r"^season(\d+)-\d{4}-\d{2}-\d{2}$")
        historical_stats = user.get("historicalStats", {}) or {}
        for key, value in historical_stats.items():
            if season_pattern.match(key) and isinstance(value, dict):
                season_data = {}
                brawl_hist = value.get("brawl", {}) or {}
                if brawl_hist:
                    season_data["brawl"] = {
                        "rating": brawl_hist.get("rating", 0) or 0,
                        "highestRating": brawl_hist.get("highestRating", 0) or 0,
                        "brawls": brawl_hist.get("brawls", 0) or 0,
                        "wins": brawl_hist.get("wins", 0) or 0,
                    }
                team_hist = value.get("teamBrawl", {}) or {}
                if team_hist:
                    season_data["teamBrawl"] = {
                        "rating": team_hist.get("rating", 0) or 0,
                        "highestRating": team_hist.get("highestRating", 0) or 0,
                        "brawls": team_hist.get("brawls", 0) or 0,
                        "wins": team_hist.get("wins", 0) or 0,
                    }
                if season_data:
                    user_data[key] = season_data

        users_data.append(user_data)

    return users_data


def fetch_guild_members(db, guilds_raw):
    """Fetch members subcollection for all guilds to get rank data.

    Member docs have auto-generated IDs and contain:
      - user: DocumentReference to users/{userId}
      - rank: integer (index into guild's ranks array)
    Guild docs have a 'ranks' field mapping rank indices to names.
    """
    print("  Fetching guild member ranks...", end=" ", flush=True)
    guild_members = {}  # {guild_id: {user_id: rank_number}}
    for guild_id in guilds_raw:
        members_ref = db.collection("guilds").document(guild_id).collection("members")
        members = members_ref.get()
        for doc in members:
            data = doc.to_dict()
            if data and "user" in data:
                # Extract user ID from the DocumentReference
                user_ref = data["user"]
                if hasattr(user_ref, "id"):
                    user_id = user_ref.id
                elif hasattr(user_ref, "path"):
                    user_id = user_ref.path.split("/")[-1]
                else:
                    continue
                rank_num = data.get("rank", 0)
                guild_members.setdefault(guild_id, {})[user_id] = rank_num
    total = sum(len(v) for v in guild_members.values())
    print(f"{total} member records across {len(guild_members)} guilds")
    return guild_members


def process_guilds(guilds_raw, users_data, guild_members=None):
    """Process raw Firestore guild documents and attach members.

    guild_members is {guild_id: {user_id: rank_number}}.
    Guild docs have a 'ranks' array mapping rank indices to rank info.
    """
    if guild_members is None:
        guild_members = {}

    # Build rank name lookup: {guild_id: {rank_number: rank_name}}
    guild_rank_names = {}
    for guild_id, guild in guilds_raw.items():
        if not guild:
            continue
        ranks_data = guild.get("ranks", [])
        rank_map = {}
        if isinstance(ranks_data, list):
            for i, r in enumerate(ranks_data):
                if isinstance(r, dict):
                    rank_map[i] = r.get("name", "")
                elif isinstance(r, str):
                    rank_map[i] = r
        elif isinstance(ranks_data, dict):
            for k, v in ranks_data.items():
                idx = int(k) if str(k).isdigit() else k
                if isinstance(v, dict):
                    rank_map[idx] = v.get("name", "")
                elif isinstance(v, str):
                    rank_map[idx] = v
        guild_rank_names[guild_id] = rank_map

    guilds_data = {}
    for guild_id, guild in guilds_raw.items():
        if not guild:
            continue
        guild_ref = f"guilds/{guild_id}"
        guilds_data[guild_ref] = {
            "id": guild_id,
            "name": guild.get("name", ""),
            "tag": guild.get("tag", ""),
            "description": guild.get("description", ""),
            "motd": guild.get("motd", ""),
            "members": [],
        }

    # Add members to guilds
    for user in users_data:
        for guild_ref in user.get("guildRefs", []):
            if guild_ref in guilds_data:
                guild_id = guilds_data[guild_ref]["id"]
                guild_tag = guilds_data[guild_ref]["tag"]
                guild_rep = user.get(f"stats.guildReputation.{guild_tag}", 0)

                # Look up rank from members subcollection
                rank = ""
                user_id = user.get("id", "")
                if guild_id in guild_members and user_id in guild_members[guild_id]:
                    rank_num = guild_members[guild_id][user_id]
                    # Resolve rank number to name using guild's ranks array
                    rank_map = guild_rank_names.get(guild_id, {})
                    rank = rank_map.get(rank_num, "")
                    if not rank and rank_num is not None:
                        rank = str(rank_num)  # Fallback: show number if no name found

                guilds_data[guild_ref]["members"].append({
                    "username": user["username"],
                    "nickname": user.get("nickname", ""),
                    "reputation": user.get("stats.reputation", 0),
                    "guildReputation": guild_rep,
                    "brawlRating": user.get("stats.brawl.rating", 0),
                    "teamRating": user.get("stats.teamBrawl.rating", 0),
                    "rank": rank,
                })

    # Debug: count how many ranks were matched and show sample rank names
    rank_count = sum(1 for g in guilds_data.values() for m in g["members"] if m["rank"])
    total_members = sum(len(g["members"]) for g in guilds_data.values())
    print(f"  Matched {rank_count}/{total_members} guild member ranks")
    # Show sample rank name mappings
    for gid, rmap in list(guild_rank_names.items())[:2]:
        if rmap:
            print(f"    Guild {gid} rank names: {rmap}")

    return guilds_data


def calculate_norm_stats(users_data):
    """Calculate CTF and Brawl normalization statistics."""
    # CTF normalization
    ctf_players = []
    for user in users_data:
        games = user.get("stats.event.ctf.games", 0)
        if games >= 20:
            wins = user.get("stats.event.ctf.wins", 0)
            ctf_players.append({
                "winRate": wins / games,
                "capturesPerGame": user.get("stats.event.ctf.captures", 0) / games,
                "chargesPerGame": user.get("stats.event.ctf.charges", 0) / games,
                "defensesPerGame": user.get("stats.event.ctf.defenses", 0) / games,
                "escortsPerGame": user.get("stats.event.ctf.escorts", 0) / games,
                "recoversPerGame": user.get("stats.event.ctf.recovers", 0) / games,
            })

    ctf_norm_stats = {}
    if ctf_players:
        df = pd.DataFrame(ctf_players)
        ctf_norm_stats = {
            "minWinRate": float(df["winRate"].min()),
            "maxWinRate": float(df["winRate"].max()),
            "minCaptures": float(df["capturesPerGame"].min()),
            "maxCaptures": float(df["capturesPerGame"].max()),
            "minCharges": float(df["chargesPerGame"].min()),
            "maxCharges": float(df["chargesPerGame"].max()),
            "minDefenses": float(df["defensesPerGame"].min()),
            "maxDefenses": float(df["defensesPerGame"].max()),
            "minEscorts": float(df["escortsPerGame"].min()),
            "maxEscorts": float(df["escortsPerGame"].max()),
            "minRecovers": float(df["recoversPerGame"].min()),
            "maxRecovers": float(df["recoversPerGame"].max()),
        }

    # Brawl normalization
    brawl_players = []
    for user in users_data:
        brawls = user.get("stats.brawl.brawls", 0)
        if brawls >= 25:
            brawl_players.append({
                "rating": user.get("stats.brawl.rating", 0),
                "winRate": user.get("stats.brawl.wins", 0) / brawls,
            })

    brawl_norm_stats = {}
    if brawl_players:
        bdf = pd.DataFrame(brawl_players)
        brawl_norm_stats = {
            "minRating": float(bdf["rating"].min()),
            "maxRating": float(bdf["rating"].max()),
            "minWinRate": float(bdf["winRate"].min()),
            "maxWinRate": float(bdf["winRate"].max()),
        }

    return ctf_norm_stats, brawl_norm_stats, len(ctf_players), len(brawl_players)


def process_inventory(inventory_raw):
    """Extract belt trophies from inventory documents.

    inventory_raw: { userId: { "taunt": { uuid: { animationName, name, description, icon: {cdn}, ... } } } }
    Returns: { userId: [ { name, description, iconUrl } ] }
    """
    belt_trophies = {}
    for user_id, inv in inventory_raw.items():
        if not inv:
            continue
        taunts = inv.get("taunt", {}) or {}
        belts = []
        for taunt in taunts.values():
            if not isinstance(taunt, dict):
                continue
            if taunt.get("animationName") != "raiseBelt":
                continue
            if taunt.get("sku") == "bt-taunt-tossWeapon":
                continue
            icon = taunt.get("icon", {}) or {}
            cdn = icon.get("cdn", "")
            # Derive item name from taunt CDN URL, e.g. ".../taunt/beltsilver.png" -> "beltsilver"
            import os as _os
            item_name = _os.path.splitext(_os.path.basename(cdn))[0] if cdn else ""
            icon_url = f"https://cdn.brawlerstavern.com/catalog/items/{item_name}/item_down.png" if item_name else cdn
            belts.append({
                "name": taunt.get("name", ""),
                "iconUrl": icon_url,
            })
        if belts:
            belt_trophies[user_id] = belts
    return belt_trophies


def main():
    parser = argparse.ArgumentParser(description="Fetch Brawlers Tavern data from Firestore")
    parser.add_argument("--key", default="service-account.json", help="Path to Firebase service account key JSON")
    parser.add_argument("--output", default="data", help="Output directory for JSON files")
    args = parser.parse_args()

    print("=" * 50)
    print("Brawlers Tavern - Firestore Data Fetcher")
    print("=" * 50)
    print()

    # Connect
    print("Connecting to Firestore...")
    db = connect_firestore(args.key)
    print()

    # Fetch
    print("Fetching collections:")
    users_raw = fetch_collection(db, "users")
    guilds_raw = fetch_collection(db, "guilds")
    guild_members = fetch_guild_members(db, guilds_raw)
    inventory_raw = fetch_collection(db, "inventory", fields=["taunt"])
    print()

    # Process
    print("Processing data...")
    users_data = process_users(users_raw)
    guilds_data = process_guilds(guilds_raw, users_data, guild_members)
    ctf_norm, brawl_norm, ctf_count, brawl_count = calculate_norm_stats(users_data)
    belt_trophies = process_inventory(inventory_raw)
    print(f"  {len(users_data)} users processed")
    print(f"  {len(guilds_data)} guilds processed")
    print(f"  {ctf_count} CTF-eligible players")
    print(f"  {brawl_count} Brawl-eligible players")
    print(f"  {sum(len(v) for v in belt_trophies.values())} belt trophies across {len(belt_trophies)} players")
    print()

    # Save
    output_dir = Path(args.output)
    output_dir.mkdir(exist_ok=True)

    files = {
        "users.json": users_data,
        "guilds.json": guilds_data,
        "ctf_stats.json": ctf_norm,
        "brawl_stats.json": brawl_norm,
        "belt_trophies.json": belt_trophies,
    }

    print("Writing files:")
    for filename, data in files.items():
        filepath = output_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f)
        print(f"  {filepath}")

    print()
    print("=" * 50)
    print("Done! Website data is up to date.")
    print("=" * 50)


if __name__ == "__main__":
    main()
