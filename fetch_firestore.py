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


def fetch_collection(db, collection_name):
    """Fetch all documents from a Firestore collection."""
    print(f"  Fetching {collection_name}...", end=" ", flush=True)
    docs = db.collection(collection_name).get()
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

        users_data.append(user_data)

    return users_data


def process_guilds(guilds_raw, users_data):
    """Process raw Firestore guild documents and attach members."""
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
                guild_tag = guilds_data[guild_ref]["tag"]
                guild_rep = user.get(f"stats.guildReputation.{guild_tag}", 0)
                guilds_data[guild_ref]["members"].append({
                    "username": user["username"],
                    "nickname": user.get("nickname", ""),
                    "reputation": user.get("stats.reputation", 0),
                    "guildReputation": guild_rep,
                    "brawlRating": user.get("stats.brawl.rating", 0),
                    "teamRating": user.get("stats.teamBrawl.rating", 0),
                })

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
    print()

    # Process
    print("Processing data...")
    users_data = process_users(users_raw)
    guilds_data = process_guilds(guilds_raw, users_data)
    ctf_norm, brawl_norm, ctf_count, brawl_count = calculate_norm_stats(users_data)
    print(f"  {len(users_data)} users processed")
    print(f"  {len(guilds_data)} guilds processed")
    print(f"  {ctf_count} CTF-eligible players")
    print(f"  {brawl_count} Brawl-eligible players")
    print()

    # Save
    output_dir = Path(args.output)
    output_dir.mkdir(exist_ok=True)

    files = {
        "users.json": users_data,
        "guilds.json": guilds_data,
        "ctf_stats.json": ctf_norm,
        "brawl_stats.json": brawl_norm,
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
