# Quick Setup Guide - Brawlers Tavern Stats Website

## 🚀 Fast Setup (5 minutes)

### Step 1: Complete the JavaScript
Copy the contents of `rendering.js.template` and append to `app.js`:

```bash
cat rendering.js.template >> app.js
# OR manually copy/paste the content
```

### Step 2: File Structure
Ensure your directory looks like this:
```
your-website/
├── index.html
├── styles.css
├── app.js (with rendering functions added)
└── data/
    ├── users.json
    ├── guilds.json
    ├── ctf_stats.json
    └── brawl_stats.json
```

### Step 3: Serve Locally
```bash
# Python 3
python3 -m http.server 8000

# Then open: http://localhost:8000
```

### Step 4: Test
Open `http://localhost:8000` in your browser. You should see:
- ✅ All Brawlers grid with 778 players
- ✅ 5 leaderboard sections
- ✅ Clickable player cards
- ✅ Clickable guilds

## 🔄 Updating Data

### When you have new Firebase exports:

```bash
python3 process_data.py users-TIMESTAMP.json guilds-TIMESTAMP.json
```

This creates fresh files in `data/` directory. Just refresh the website!

## 📤 Deploying to Web Server

1. Upload all files to your web server
2. Ensure `data/` directory is readable
3. Access via your domain
4. Done!

## ⚡ Key Features

✅ **External Data Loading** - Update stats without touching code
✅ **Modular Design** - Small HTML file (9KB)
✅ **All Enhancements Included**:
   - Fixed rating icons (1.png, 1.5.png format)
   - Rating emblems in profiles
   - Reputation as "Title - Lvl. #"
   - Image scaling fixed
   - Color tinting (skips white, reverses eyes)
   - Clickable guilds
   - CTF win rate sorting + full analysis
   - Combat traits leaderboard
   - Brawl Score (0-10)

## 🔧 Troubleshooting

**Can't see data?**
- Must use a web server (not file://)
- Check browser console for errors
- Verify data/ directory exists

**Images not loading?**
- Check network tab for 404s
- Verify CDN is accessible

**Need help?**
- Check README.md for full documentation
- Review ENHANCEMENTS_GUIDE.md for features

## 📊 Data File Sizes

- users.json: ~520KB (778 players)
- guilds.json: ~15KB (69 guilds)
- ctf_stats.json: <1KB
- brawl_stats.json: <1KB

**Total: ~540KB** (vs 1.8MB embedded version!)

## 🎯 Next Steps

1. ✅ Complete app.js with rendering functions
2. ✅ Test locally
3. ✅ Deploy to your server
4. ✅ Share with players!

That's it! Your modular, updateable Brawlers Tavern stats website is ready. 🎉
