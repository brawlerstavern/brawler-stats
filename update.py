#!/usr/bin/env python3
"""
Simple data updater - automatically finds and processes latest Firebase exports
Just run: python update.py
"""

import os
import glob
import subprocess
import sys

def find_latest_file(pattern):
    """Find the most recent file matching the pattern"""
    files = glob.glob(pattern)
    if not files:
        return None
    # Sort by modification time, newest first
    files.sort(key=os.path.getmtime, reverse=True)
    return files[0]

def main():
    print("=" * 50)
    print("Brawlers Tavern - Easy Data Updater")
    print("=" * 50)
    print()

    # Find latest files
    users_file = find_latest_file('data/users-*.json')
    guilds_file = find_latest_file('data/guilds-*.json')

    if not users_file:
        print("ERROR: No users-*.json file found in data directory")
        print("Please place your Firebase export file in the data/ folder")
        sys.exit(1)

    if not guilds_file:
        print("ERROR: No guilds-*.json file found in data directory")
        print("Please place your Firebase export file in the data/ folder")
        sys.exit(1)

    print(f"Found latest files:")
    print(f"  Users:  {os.path.basename(users_file)}")
    print(f"  Guilds: {os.path.basename(guilds_file)}")
    print()
    print("Processing data...")
    print()

    # Run the processing script
    result = subprocess.run([
        sys.executable,
        'process_data.py',
        users_file,
        guilds_file
    ])

    if result.returncode == 0:
        print()
        print("=" * 50)
        print("SUCCESS! Your website data is updated.")
        print("Just refresh your browser to see changes.")
        print("=" * 50)
    else:
        print()
        print("ERROR: Processing failed. Check the error above.")
        sys.exit(1)

if __name__ == '__main__':
    main()
