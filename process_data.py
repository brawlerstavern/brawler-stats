#!/usr/bin/env python3
"""
Brawlers Tavern Data Processor
Converts Firebase export JSON files into website-ready data files
"""

import json
import sys
import pandas as pd
from pathlib import Path

def process_firebase_export(users_file, guilds_file, output_dir='data'):
    """
    Process Firebase export files and generate website data files
    
    Args:
        users_file: Path to users Firebase export JSON
        guilds_file: Path to guilds Firebase export JSON
        output_dir: Directory to save processed files
    """
    print("Processing Brawlers Tavern data...")

    # Create output directory
    Path(output_dir).mkdir(exist_ok=True)

    # Read Firebase exports
    with open(users_file, encoding='utf-8') as f:
        users_export = json.load(f)
    with open(guilds_file, encoding='utf-8') as f:
        guilds_export = json.load(f)

    # Extract data
    users_raw = users_export.get('data', {})
    guilds_raw = guilds_export.get('data', {})

    print(f"Loaded {len(users_raw)} users and {len(guilds_raw)} guilds")
    
    # Process users
    users_data = []
    for user_id, user in users_raw.items():
        if not user or not user.get('username'):
            continue
        
        # Extract all guild references
        guild_refs = []
        guilds_list = user.get('guilds', [])
        if guilds_list and isinstance(guilds_list, list):
            for guild_entry in guilds_list:
                if isinstance(guild_entry, dict) and '__ref__' in guild_entry:
                    guild_refs.append(guild_entry['__ref__'])

        user_data = {
            'id': user_id,
            'username': user.get('username', ''),
            'nickname': user.get('nickname', ''),
            'currentGuildRef': user.get('currentGuild', {}).get('__ref__', '') if isinstance(user.get('currentGuild'), dict) else '',
            'guildRefs': guild_refs,
        }
        
        # Outfit data
        outfit = user.get('outfit', {})
        outfit_parts = ['head', 'eyes', 'eyebrows', 'markings', 'facialHair', 'hair', 'ears', 'hat', 'mask']
        for part in outfit_parts:
            if part in outfit and outfit[part]:
                for field in ['skinName', 'tintColor', 'tintDarkColor']:
                    if field in outfit[part]:
                        user_data[f'outfit.{part}.{field}'] = outfit[part][field]
        
        # Stats
        stats = user.get('stats', {})
        user_data['stats.reputation'] = stats.get('reputation', 0) or 0
        user_data['stats.knockouts'] = stats.get('knockouts', 0) or 0
        user_data['stats.onlineTime'] = stats.get('onlineTime', 0) or 0
        user_data['stats.loginTime'] = stats.get('loginTime', 0) or 0
        
        # Brawl stats
        brawl = stats.get('brawl', {}) or {}
        for field in ['rating', 'highestRating', 'brawls', 'wins', 'leaves', 'winStreak']:
            user_data[f'stats.brawl.{field}'] = brawl.get(field, 0) or 0
        
        # Brawl traits
        traits = brawl.get('traits', {}) or {}
        trait_fields = ['combos', 'perfectCombos', 'counters', 'counterAttempts', 'evasiveBrawls',
                        'finishes', 'finishWins', 'gambles', 'hits', 'hurts', 'nearCenterTime',
                        'nearWallTime', 'swings', 'sideSwings', 'northTime', 'totalTime',
                        'trades', 'retaliations', 'westTime']
        for field in trait_fields:
            user_data[f'stats.brawl.traits.{field}'] = traits.get(field, 0) or 0
        
        # Team Brawl stats
        teamBrawl = stats.get('teamBrawl', {}) or {}
        for field in ['rating', 'highestRating', 'brawls', 'wins', 'leaves', 'winStreak']:
            user_data[f'stats.teamBrawl.{field}'] = teamBrawl.get(field, 0) or 0
        
        # CTF stats
        ctf = stats.get('event', {}).get('ctf', {}) or {}
        for field in ['captures', 'charges', 'defenses', 'escorts', 'games', 'recovers', 'wins']:
            user_data[f'stats.event.ctf.{field}'] = ctf.get(field, 0) or 0
        
        # Guild reputation
        guildRep = stats.get('guildReputation', {}) or {}
        for guild_tag, rep in guildRep.items():
            if rep:
                user_data[f'stats.guildReputation.{guild_tag}'] = rep
        
        users_data.append(user_data)
    
    # Process guilds
    guilds_data = {}
    for guild_id, guild in guilds_raw.items():
        if not guild:
            continue
        guild_ref = f"guilds/{guild_id}"
        guilds_data[guild_ref] = {
            'id': guild_id,
            'name': guild.get('name', ''),
            'tag': guild.get('tag', ''),
            'description': guild.get('description', ''),
            'motd': guild.get('motd', ''),
            'members': []
        }
    
    # Add members to guilds (include all guilds they're part of)
    for user in users_data:
        guild_refs = user.get('guildRefs', [])
        for guild_ref in guild_refs:
            if guild_ref in guilds_data:
                guild_tag = guilds_data[guild_ref]['tag']
                guild_rep = user.get(f'stats.guildReputation.{guild_tag}', 0)
                guilds_data[guild_ref]['members'].append({
                    'username': user['username'],
                    'nickname': user.get('nickname', ''),
                    'reputation': user.get('stats.reputation', 0),
                    'guildReputation': guild_rep,
                    'brawlRating': user.get('stats.brawl.rating', 0),
                    'teamRating': user.get('stats.teamBrawl.rating', 0)
                })
    
    # Calculate CTF normalization stats
    ctf_players = []
    for user in users_data:
        games = user.get('stats.event.ctf.games', 0)
        if games >= 20:
            wins = user.get('stats.event.ctf.wins', 0)
            captures = user.get('stats.event.ctf.captures', 0)
            charges = user.get('stats.event.ctf.charges', 0)
            defenses = user.get('stats.event.ctf.defenses', 0)
            escorts = user.get('stats.event.ctf.escorts', 0)
            recovers = user.get('stats.event.ctf.recovers', 0)
            
            ctf_players.append({
                'winRate': wins / games,
                'capturesPerGame': captures / games,
                'chargesPerGame': charges / games,
                'defensesPerGame': defenses / games,
                'escortsPerGame': escorts / games,
                'recoversPerGame': recovers / games
            })
    
    if ctf_players:
        df = pd.DataFrame(ctf_players)
        ctf_norm_stats = {
            'minWinRate': float(df['winRate'].min()),
            'maxWinRate': float(df['winRate'].max()),
            'minCaptures': float(df['capturesPerGame'].min()),
            'maxCaptures': float(df['capturesPerGame'].max()),
            'minCharges': float(df['chargesPerGame'].min()),
            'maxCharges': float(df['chargesPerGame'].max()),
            'minDefenses': float(df['defensesPerGame'].min()),
            'maxDefenses': float(df['defensesPerGame'].max()),
            'minEscorts': float(df['escortsPerGame'].min()),
            'maxEscorts': float(df['escortsPerGame'].max()),
            'minRecovers': float(df['recoversPerGame'].min()),
            'maxRecovers': float(df['recoversPerGame'].max())
        }
    else:
        ctf_norm_stats = {}
    
    # Calculate Brawl normalization stats
    brawl_players = []
    for user in users_data:
        brawls = user.get('stats.brawl.brawls', 0)
        if brawls >= 25:
            wins = user.get('stats.brawl.wins', 0)
            rating = user.get('stats.brawl.rating', 0)
            brawl_players.append({
                'rating': rating,
                'winRate': wins / brawls
            })
    
    if brawl_players:
        bdf = pd.DataFrame(brawl_players)
        brawl_norm_stats = {
            'minRating': float(bdf['rating'].min()),
            'maxRating': float(bdf['rating'].max()),
            'minWinRate': float(bdf['winRate'].min()),
            'maxWinRate': float(bdf['winRate'].max())
        }
    else:
        brawl_norm_stats = {}
    
    # Save all files
    with open(f'{output_dir}/users.json', 'w', encoding='utf-8') as f:
        json.dump(users_data, f)

    with open(f'{output_dir}/guilds.json', 'w', encoding='utf-8') as f:
        json.dump(guilds_data, f)

    with open(f'{output_dir}/ctf_stats.json', 'w', encoding='utf-8') as f:
        json.dump(ctf_norm_stats, f)

    with open(f'{output_dir}/brawl_stats.json', 'w', encoding='utf-8') as f:
        json.dump(brawl_norm_stats, f)
    
    print(f"\nProcessing complete!")
    print(f"   - {len(users_data)} users -> {output_dir}/users.json")
    print(f"   - {len(guilds_data)} guilds -> {output_dir}/guilds.json")
    print(f"   - {len(ctf_players)} CTF players -> {output_dir}/ctf_stats.json")
    print(f"   - {len(brawl_players)} Brawl players -> {output_dir}/brawl_stats.json")
    print(f"\nData files ready! Upload to your web server's data/ directory.")

def find_latest_export_files():
    """Find the most recent users and guilds export files"""
    import glob
    import os

    # Look for users export files (current dir and data/ subdirectory)
    users_files = glob.glob('users*.json') + glob.glob('users-*.json') + glob.glob('data/users*.json') + glob.glob('data/users-*.json')
    guilds_files = glob.glob('guilds*.json') + glob.glob('guilds-*.json') + glob.glob('data/guilds*.json') + glob.glob('data/guilds-*.json')

    if not users_files:
        print("ERROR: No users export file found (looking for users*.json or users-*.json)")
        return None, None

    if not guilds_files:
        print("ERROR: No guilds export file found (looking for guilds*.json or guilds-*.json)")
        return None, None

    # Get the most recent file based on modification time
    users_file = max(users_files, key=os.path.getmtime)
    guilds_file = max(guilds_files, key=os.path.getmtime)

    return users_file, guilds_file

if __name__ == '__main__':
    # Check if files are provided as arguments
    if len(sys.argv) >= 3:
        users_file = sys.argv[1]
        guilds_file = sys.argv[2]
        output_dir = sys.argv[3] if len(sys.argv) > 3 else 'data'
    else:
        # Auto-detect the latest export files
        print("Auto-detecting latest export files...")
        users_file, guilds_file = find_latest_export_files()

        if not users_file or not guilds_file:
            print("\nUsage: python process_data.py [users_export.json] [guilds_export.json] [output_dir]")
            print("\nIf no files are specified, the script will auto-detect the newest files matching:")
            print("  - users*.json or users-*.json")
            print("  - guilds*.json or guilds-*.json")
            sys.exit(1)

        output_dir = 'data'
        print(f"Found users file: {users_file}")
        print(f"Found guilds file: {guilds_file}")
        print()

    process_firebase_export(users_file, guilds_file, output_dir)
